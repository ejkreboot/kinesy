/**
 * Muscle path solver. For a pose, each strand is built in world space (origin → via points and
 * wraps → insertion), resampled to N points evenly spaced by arc length, and given a frame at
 * every sample:
 *
 *   - the frame starts from the origin bone's, turned by the least rotation that lines it up with
 *     the path's current start direction;
 *   - it is carried along by parallel transport (the double-reflection rotation-minimizing frame
 *     of Wang et al. 2008), so a bend never adds twist and there are no Frenet flips;
 *   - the twist left between that and the insertion bone's frame is spread along the strand by
 *     per-sample weights (by default into the tendons: see bind.ts), so the belly does not wring.
 *
 * The twist is an angle known only up to whole turns. It is unwrapped without any history: the
 * solver walks from the rest pose to the requested one in a few steps and follows the angle along
 * the way, so the same pose always gives the same frames (no flip at ±180°, whatever the order
 * poses arrive in).
 *
 * A muscle may instead be baked (MusclePathDef.baked): its strands are looked up for the pose from
 * lines of action solved offline (baked.ts) rather than built from wraps; frames and everything after
 * are the same. Hand-tuned keys (tune.ts), if set, adjust each step's strands last: the belly rolled,
 * moved off its line, shortened.
 *
 * Each step of the walk samples every strand, pushes apart strands of different layers where their
 * muscles meet (strandContact.ts), and only then builds the frames. Strands that end on another
 * muscle's strand (JoinPoint) come last: their insertion is a virtual bone, after the real ones,
 * carried by that strand's sample and frame there.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import { qMul, qRotate, qToMat3, type Quat, type Rigid, type Vec3 } from '../math';
import type { Pose, Rig } from '../rig';
import { bakedPolyline, cellFor, gridPose, strandKey, type BakedPaths, type BakedStrand, type Cell } from './baked';
import { bump, NO_TUNE, type Tuner, type TuneParams } from './tune';
import { isJoin, isPoint, type JointPaths, type MusclePathDef, type PathPoint, type RimSurface, type WrapSurface } from './schema';
import { resetContacts, resolveContacts, type ContactModel } from './strandContact';
import { minimize1D, perpendicular, rimBlocked, rimPoint, rimRange, wrapCylinder, wrapEllipsoid, wrapEllipsoidAbout, type Rim } from './wrap';

export interface PathOptions {
	/**
	 * steps of the walk from the rest pose that carries end frames and unwraps twist (in each step
	 * a strand's end direction and twist must turn well under half a turn)
	 */
	unwrapSteps: number;
	/** share of a muscle's rest length that is contractile belly (tendon takes no length change) */
	bellyFrac: number;
	kMin: number;
	kMax: number;
	/**
	 * smoothing passes over a strand's samples where it turns sharply (see smoothSamples). A muscle
	 * folding over a flexed joint makes a hairpin, and through a sharp one the carried frame is
	 * ill-defined (it depends on how the samples straddle the corner); rounded over a few samples it
	 * is not. Smoothing the samples, not the polyline's corners, keeps the result continuous however
	 * the polyline's vertices come and go (a wrap engaging).
	 */
	smooth: number;
}

export const DEFAULT_PATH_OPTIONS: PathOptions = { unwrapSteps: 6, bellyFrac: 0.8, kMin: 0.8, kMax: 1.3, smooth: 6 };

/** arc: a rim's allowed arc, radians (from < to) */
type WrapElement = { point: false; surface: number; side: number; arc?: [number, number] };
type Element = { point: true; bone: number; p: Vec3 } | WrapElement;

/** Samples over which a strand's end direction is taken, for its end frames. */
const END_DIR = 3;

/** A strand's directions at its start and end, each over END_DIR samples (X: N sampled points). */
function endDirections(X: Float64Array, N: number): [Vec3, Vec3] {
	const k = Math.min(END_DIR, N - 1);
	const dir = (a: number, b: number) => unit([X[b * 3] - X[a * 3], X[b * 3 + 1] - X[a * 3 + 1], X[b * 3 + 2] - X[a * 3 + 2]]);
	return [dir(0, k), dir(N - 1 - k, N - 1)];
}

/** Least share of the direction to a sheet strand's neighbour lying across it for that direction to set its roll. */
const RUNG_ACROSS = 0.3;

function smoothstep(a: number, b: number, x: number): number {
	const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return u * u * (3 - 2 * u);
}
/** Least distance across a strand to its neighbour for that direction to set its roll (closer, near a shared tendon, it swings with the least change in how the strands arrive), mm. */
const RUNG_MIN = 2;
/** Share of a fan strand's widest spacing from its neighbour below which the direction to it isn't used for its roll. */
const FAN_WIDE = 0.3;

/** Gauss-Seidel sweeps over a run of consecutive wraps. */
const RUN_SWEEPS = 3;

interface Surface {
	def: WrapSurface;
	bone: number;
	/** unit axis (cylinder; ellipsoid wrapped about one) */
	axis: Vec3;
	/** column-major local axes (ellipsoid; rim: u, v, normal) */
	R: number[];
}

export interface Strand {
	/** index of the muscle it belongs to */
	muscle: number;
	elements: Element[];
	originBone: number;
	insertionBone: number;
	restLength: number;
	/** rest-pose start/end direction and frame normal, in the origin / insertion bone's frame */
	t0: Vec3;
	r0: Vec3;
	tE: Vec3;
	rE: Vec3;
	/** cumulative twist share per sample, 0 at the origin to 1 at the insertion */
	twist: Float64Array;
	/**
	 * cumulative share of any length change per sample, 0 → 1: sample i sits at arc length
	 * sᵢ·L₀ + (L − L₀)·stretchᵢ, so where the weights are flat (tendon) spacing keeps its rest length
	 */
	stretch: Float64Array;
	/** its baked line of action, for a baked muscle */
	baked?: BakedStrand;
}

export interface MuscleEntry {
	def: MusclePathDef;
	/** first strand index and count */
	first: number;
	count: number;
	/** muscle index whose length ratio drives the bulge */
	lengthRef: number;
}

/** Scratch for one strand's resampled geometry. */
interface Work {
	poly: number[];
	X: Float64Array;
	T: Float64Array;
	Rn: Float64Array;
	/** the strand's via points (world), in order */
	via: number[];
}

export class PathSolver {
	readonly N: number;
	readonly opts: PathOptions;
	readonly strands: Strand[] = [];
	readonly muscles: MuscleEntry[] = [];
	readonly boneCount: number;
	/** per strand, per sample: position (x y z) */
	readonly pos: Float64Array;
	/** per strand, per sample: frame as a quaternion (x y z w); columns tangent, normal, binormal */
	readonly quat: Float64Array;
	/** per strand: current length, bulge factor, twist angle (radians, unwrapped) */
	readonly length: Float64Array;
	readonly bulge: Float64Array;
	readonly twistAngle: Float64Array;
	/**
	 * per strand, per sample: how far apart the samples are there, over the same at rest (1 at rest): a
	 * shortening belly packs its samples closer, and the mesh along it packs with them (deform.ts)
	 */
	readonly spacing: Float64Array;
	/** per strand: how much of its mesh's rest drape it keeps (1 at rest; MusclePathDef.drape) */
	readonly drape: Float64Array;
	/** bone transforms at the last solve, then one virtual bone per join (see joins) */
	bones: Rigid[];
	/** per strand: whether it ends on another muscle's strand (solved after the others) */
	readonly joined: boolean[] = [];
	/**
	 * the virtual bones' sources: the strand joined, where on it (samples), and its point and frame
	 * there at rest
	 */
	private readonly joins: { strand: number; sigma: number; restC: Vec3; restQ: Quat }[] = [];
	private readonly surfaces: Surface[] = [];
	private readonly rig: Rig;
	private readonly restPose: Pose;
	private readonly work: Work;
	/** per strand, the end frames carried along the walk from the rest pose (bone frames) */
	private readonly walk: { r0: Float64Array; t0: Float64Array; rE: Float64Array; tE: Float64Array };
	/** contact between layers, if set */
	private contact: ContactModel | null = null;
	/** per strand at the current step: its fixed points (ends and via points) in samples, ascending */
	private readonly anchors: number[][];
	/** frames at rest, where each solve's walk starts (contact reads the previous step's) */
	private readonly restQuat: Float64Array;
	/** each sample's gap to its neighbours at rest (null while the rest pose is being set up) */
	private restGaps: Float64Array | null = null;
	/** per draped strand: its end-to-end direction at rest, in its origin bone's frame */
	private readonly restChord: (Vec3 | null)[] = [];
	/**
	 * sheets (muscles with several strands): per strand, per sample, the direction to the neighbouring
	 * strand as an angle round the strand in its frame at rest (NaN: none, or not yet set; see rollSheets)
	 */
	private restRung: Float64Array;
	/** per strand, per sample: the sample whose roll it takes (fixed at rest; -1: none) */
	private rungAt: Int32Array;
	/** hand tuning (setTuner), its adjustments per muscle at the current step, and per strand: the rest
	 * direction away from the bone (an angle round the strand in its mid-belly frame; setOutward), the
	 * share of the strand's rest length in its belly, its tendons' cumulative share of length change
	 * (resample), and the length its belly gave up to them at the last step, mm */
	private tuner: Tuner | null = null;
	private tune: TuneParams[] = [];
	private readonly outward: Float64Array;
	private readonly bellyShare: Float64Array;
	private tendons: (Float64Array | null)[] = [];
	readonly extra: Float64Array;
	/** baked lines of action, if any muscle is baked; and their grid cell and grid bones at the current step */
	private readonly baked: BakedPaths | null = null;
	private cell: Cell | null = null;
	private gridBones: Rigid[] = [];

	constructor(paths: JointPaths, rig: Rig, boneNames: string[], opts: Partial<PathOptions> = {}, baked: BakedPaths | null = null) {
		this.opts = { ...DEFAULT_PATH_OPTIONS, ...opts };
		this.N = paths.samples ?? 48;
		this.rig = rig;
		this.boneCount = boneNames.length;
		this.restPose = Object.fromEntries(rig.def.joints.map((j) => [j.id, j.restAngle]));
		const boneIndex = (name: string, where: string) => {
			const b = boneNames.indexOf(name);
			if (b < 0) throw new Error(`${where}: unknown bone ${name}`);
			return b;
		};
		const surfaceIndex = new Map<string, number>();
		for (const [name, s] of Object.entries(paths.surfaces)) {
			surfaceIndex.set(name, this.surfaces.length);
			const axis = s.kind === 'cylinder' ? unit(s.axis) : s.kind === 'ellipsoid' && s.about ? unit(s.about) : ([0, 0, 1] as Vec3);
			let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
			if ((s.kind === 'ellipsoid' && s.axes) || s.kind === 'rim') {
				const x = unit(s.axes![0]), y0 = s.axes![1];
				const d = dot(x, y0), y = unit([y0[0] - d * x[0], y0[1] - d * x[1], y0[2] - d * x[2]]);
				R = [...x, ...y, ...cross(x, y)];
			}
			this.surfaces.push({ def: s, bone: boneIndex(s.bone, `surface ${name}`), axis, R });
		}

		const names = paths.muscles.map((m) => m.mesh);
		const joinTo: string[] = [];
		for (const [mi, def] of paths.muscles.entries()) {
			if (!def.strands.length) throw new Error(`${def.mesh}: no strands`);
			const ref = def.lengthRef ? names.indexOf(def.lengthRef) : mi;
			if (ref < 0) throw new Error(`${def.mesh}: unknown lengthRef ${def.lengthRef}`);
			this.muscles.push({ def, first: this.strands.length, count: def.strands.length, lengthRef: ref });
			for (const els of def.strands) {
				const where = `${def.mesh} strand ${this.strands.length - this.muscles[mi].first}`;
				if (els.length < 2 || !isPoint(els[0]) || !isPoint(els[els.length - 1])) throw new Error(`${where}: must start and end with a point`);
				const elements: Element[] = els.map((e, k) => {
					if (isJoin(e)) {
						if (k !== els.length - 1) throw new Error(`${where}: a join can only be the insertion`);
						joinTo.push(e.join);
						return { point: true, bone: this.boneCount + joinTo.length - 1, p: [...e.p] as Vec3 };
					}
					if (isPoint(e)) return { point: true, bone: boneIndex(e.bone, where), p: [...e.p] as Vec3 };
					const s = surfaceIndex.get(e.wrap);
					if (s === undefined) throw new Error(`${where}: unknown surface ${e.wrap}`);
					if (!e.arc) return { point: false, surface: s, side: e.side ?? 0 };
					if (this.surfaces[s].def.kind !== 'rim') throw new Error(`${where}: an arc is for rims only (${e.wrap})`);
					let [a0, a1] = e.arc.map((d) => (d * Math.PI) / 180);
					while (a1 <= a0) a1 += 2 * Math.PI;
					return { point: false, surface: s, side: 0, arc: [a0, a1] as [number, number] };
				});
				const first = els[0] as { bone: string };
				const twist = new Float64Array(this.N);
				for (let i = 0; i < this.N; i++) twist[i] = i / (this.N - 1);
				this.joined.push(isJoin(els[els.length - 1]));
				this.strands.push({
					muscle: mi, elements, originBone: boneIndex(first.bone, where), insertionBone: (elements[elements.length - 1] as { bone: number }).bone,
					restLength: 0, t0: [0, 0, 0], r0: [0, 0, 0], tE: [0, 0, 0], rE: [0, 0, 0], twist, stretch: twist.slice(),
					baked: def.baked ? bakedStrand(baked, def.mesh, this.strands.length - this.muscles[mi].first, els, where) : undefined
				});
			}
		}

		if (this.strands.some((st) => st.baked)) this.baked = baked;
		const S = this.strands.length, N = this.N;
		this.pos = new Float64Array(S * N * 3);
		this.quat = new Float64Array(S * N * 4);
		this.length = new Float64Array(S);
		this.bulge = new Float64Array(S).fill(1);
		this.twistAngle = new Float64Array(S);
		this.spacing = new Float64Array(S * N).fill(1);
		this.drape = new Float64Array(S).fill(1);
		this.restRung = new Float64Array(S * N).fill(NaN);
		this.rungAt = new Int32Array(S * N);
		this.outward = new Float64Array(S).fill(NaN);
		this.bellyShare = new Float64Array(S).fill(1);
		this.extra = new Float64Array(S);
		this.tendons = this.strands.map(() => null);
		this.work = { poly: [], X: new Float64Array(N * 3), T: new Float64Array(N * 3), Rn: new Float64Array(N * 3), via: [] };
		this.anchors = this.strands.map(() => [0, N - 1]);
		this.walk = { r0: new Float64Array(S * 3), t0: new Float64Array(S * 3), rE: new Float64Array(S * 3), tE: new Float64Array(S * 3) };

		for (const mesh of joinTo) {
			const strand = this.strandOf(mesh);
			if (this.joined[strand]) throw new Error(`${mesh} is joined by another muscle but itself joins one`);
			// placed after the first rest solve; until then it stays put (sigma < 0)
			this.joins.push({ strand, sigma: -1, restC: [0, 0, 0], restQ: [0, 0, 0, 1] });
		}

		// rest pose: fix automatic wrap sides and the reference frames every later pose is measured against
		this.bones = [...rig.solve(this.restPose), ...this.joins.map(() => ({ t: [0, 0, 0] as Vec3, q: [0, 0, 0, 1] as Quat }))];
		this.bakedStep(this.restPose);
		for (const st of this.strands) {
			for (const e of st.elements) if (!e.point && e.side === 0) e.side = this.autoSide(st, e);
			const w = this.work;
			this.geometry(st, this.bones, w);
			const t0: Vec3 = [w.T[0], w.T[1], w.T[2]];
			const r0 = perpendicularTo(t0);
			w.Rn.set(r0, 0);
			this.transport(w);
			const e = (N - 1) * 3, tN: Vec3 = [w.T[e], w.T[e + 1], w.T[e + 2]], [d0, dN] = endDirections(w.X, N);
			// rest bone transforms are the identity: world = bone frame; the end frames are kept about the
			// end directions (see strandFrames), turned there from the end tangents
			st.t0 = d0;
			st.r0 = alignOnto(r0, t0, d0);
			st.tE = dN;
			st.rE = alignOnto([w.Rn[e], w.Rn[e + 1], w.Rn[e + 2]], tN, dN);
			st.restLength = polyLength(w.poly);
		}
		this.solve(this.restPose);
		// where each join rides its strand: nearest its rest point
		for (const [k, j] of this.joins.entries()) {
			const p = this.strands.find((st) => st.insertionBone === this.boneCount + k)!.elements.at(-1) as { p: Vec3 };
			let best = Infinity, at = 0;
			for (let i = 0; i < N - 1; i++) {
				const a = (j.strand * N + i) * 3, P = this.pos;
				const e = [P[a + 3] - P[a], P[a + 4] - P[a + 1], P[a + 5] - P[a + 2]], ee = dot(e, e);
				const u = ee > 1e-12 ? Math.min(1, Math.max(0, dot(sub(p.p, [P[a], P[a + 1], P[a + 2]]), e) / ee)) : 0;
				const d = Math.hypot(P[a] + e[0] * u - p.p[0], P[a + 1] + e[1] * u - p.p[1], P[a + 2] + e[2] * u - p.p[2]);
				if (d < best) { best = d; at = i + u; }
			}
			const { c, q } = this.strandPoint(j.strand, at);
			Object.assign(j, { sigma: at, restC: c, restQ: q });
		}
		if (this.joins.length) this.solve(this.restPose);
		this.restQuat = this.quat.slice();
		this.restGaps = this.gaps();
		this.restRung = this.rungAngles();
		this.drapes();
	}

	/** The grid cell and grid bones baked strands are looked up at for a step's pose. */
	private bakedStep(pose: Pose): void {
		if (!this.baked) return;
		this.cell = cellFor(this.baked.axes, pose, this.cell ?? undefined);
		this.gridBones = this.rig.solve(gridPose(this.baked.axes, pose, this.restPose));
	}

	/** Point and frame of strand s at `sigma` (samples) at the last solve or step. */
	private strandPoint(s: number, sigma: number): { c: Vec3; q: Quat } {
		const N = this.N, j = Math.min(N - 2, Math.max(0, Math.floor(sigma))), u = sigma - j, P = this.pos, Q = this.quat;
		const a = (s * N + j) * 3, b = (s * N + j) * 4;
		const c: Vec3 = [P[a] + (P[a + 3] - P[a]) * u, P[a + 1] + (P[a + 4] - P[a + 1]) * u, P[a + 2] + (P[a + 5] - P[a + 2]) * u];
		const sg = Q[b] * Q[b + 4] + Q[b + 1] * Q[b + 5] + Q[b + 2] * Q[b + 6] + Q[b + 3] * Q[b + 7] < 0 ? -1 : 1;
		const q = [0, 1, 2, 3].map((k) => Q[b + k] + (sg * Q[b + 4 + k] - Q[b + k]) * u) as Quat;
		const l = Math.hypot(...q) || 1;
		return { c, q: q.map((x) => x / l) as Quat };
	}

	/** Strand index of a muscle's k-th strand. */
	strandOf(mesh: string, k = 0): number {
		const m = this.muscles.find((x) => x.def.mesh === mesh);
		if (!m || k >= m.count) throw new Error(`No strand ${k} for ${mesh}`);
		return m.first + k;
	}

	/** Replace a strand's twist distribution (cumulative, 0 → 1 over its samples). */
	setTwistWeights(strand: number, w: ArrayLike<number>): void {
		const t = this.strands[strand].twist;
		for (let i = 0; i < this.N; i++) t[i] = w[i];
	}

	/** Replace a strand's length-change distribution (cumulative, 0 → 1 over its samples). */
	setStretchWeights(strand: number, w: ArrayLike<number>): void {
		const t = this.strands[strand].stretch, N = this.N;
		for (let i = 0; i < N; i++) t[i] = w[i];
		// the tendons: where a sample takes less than an even share of length change; their cumulative share
		const u = 1 / (N - 1), raw = new Float64Array(N);
		let sum = 0;
		for (let i = 1; i < N; i++) { const d = Math.max(0, u - (t[i] - t[i - 1])); raw[i] = raw[i - 1] + d; sum += d; }
		this.bellyShare[strand] = Math.max(0, 1 - sum);
		this.tendons[strand] = sum > 1e-6 ? raw.map((x) => x / sum) : null;
	}

	/** Hand tuning to apply (null: none); re-solves the last pose's rest. */
	setTuner(t: Tuner | null): void {
		this.tuner = t;
	}

	/** A strand's rest direction away from its bone, as an angle round it in its mid-belly frame (from the normal toward the binormal). */
	setOutward(strand: number, angle: number): void {
		this.outward[strand] = angle;
	}

	/**
	 * Keep strands of different layers apart where their muscles meet (a model built by
	 * buildContactModel at rest; null for none, the default), and re-solve the rest pose.
	 */
	setContact(model: ContactModel | null): void {
		this.contact = model;
		this.restGaps = null;
		this.restRung.fill(NaN);
		this.solve(this.restPose);
		this.restGaps = this.gaps();
		this.restChord.length = 0;
		this.drapes();
		this.restRung = this.rungAngles();
	}

	/** Solve every strand for a (clamped) pose. */
	solve(pose: Pose): void {
		const K = Math.max(1, this.opts.unwrapSteps), h = this.walk;
		// the walk from the rest pose starts at the rest frames (rest bone transforms are the identity)
		this.twistAngle.fill(0);
		if (this.contact) {
			resetContacts(this.contact);
			this.quat.set(this.restQuat);
		}
		this.strands.forEach((st, s) => {
			h.r0.set(st.r0, s * 3); h.t0.set(st.t0, s * 3);
			h.rE.set(st.rE, s * 3); h.tE.set(st.tE, s * 3);
		});
		for (let k = 1; k <= K; k++) {
			const u = k / K, p: Pose = {};
			for (const id in this.restPose) p[id] = this.restPose[id] + ((pose[id] ?? this.restPose[id]) - this.restPose[id]) * u;
			const bones = this.rig.solve(p), S = this.strands.length;
			this.bakedStep(p);
			this.tune = this.muscles.map((m) => (this.tuner ? this.tuner.at(m.def.mesh, p) : NO_TUNE));
			for (let s = 0; s < S; s++) if (!this.joined[s]) this.sample(this.strands[s], bones, s);
			// before contact, which sizes a draped mesh by how far its drape has relaxed
			this.drapes(bones);
			if (this.contact) resolveContacts(this, this.contact, bones, this.anchors);
			for (let s = 0; s < S; s++) if (!this.joined[s]) this.strandFrames(this.strands[s], bones, s);
			this.rollSheets();
			if (this.tuner) this.applyTuning();
			// virtual bones: each join carried by its strand's motion since rest (identity at rest)
			for (const j of this.joins) {
				if (j.sigma < 0) {
					bones.push({ t: [0, 0, 0], q: [0, 0, 0, 1] });
					continue;
				}
				const { c, q: qn } = this.strandPoint(j.strand, j.sigma);
				const q = qMul(qn, [-j.restQ[0], -j.restQ[1], -j.restQ[2], j.restQ[3]]), r = qRotate(q, j.restC);
				bones.push({ t: [c[0] - r[0], c[1] - r[1], c[2] - r[2]], q });
			}
			for (let s = 0; s < S; s++) if (this.joined[s]) { this.sample(this.strands[s], bones, s); this.strandFrames(this.strands[s], bones, s); }
			if (k === K) this.bones = bones;
		}
		for (let m = 0; m < this.muscles.length; m++) {
			const e = this.muscles[m];
			for (let s = e.first; s < e.first + e.count; s++) this.bulge[s] = this.bulgeFor(e, s - e.first);
		}
		if (this.restGaps) {
			const g = this.gaps();
			for (let k = 0; k < g.length; k++) this.spacing[k] = g[k] / this.restGaps[k];
		}
	}

	/**
	 * A fan's strands (MusclePathDef.fan) each carry their own frame, and a big movement (the anterior
	 * deltoid swung up in abduction) rolls them away from the plane the fan spans: the cross-section, laid
	 * across it at rest, turned with them and arched off the bone it lies on. So each strand's frame is
	 * rolled about its tangent until the fan's width direction (first strand to last) has the angle it had
	 * at rest: the fan's own plane sets the roll, whatever the twist. The whole roll is always taken (it is
	 * only defined up to whole turns, which don't matter then), so the frame is as continuous as that
	 * direction. Where the neighbour lies (almost) along the strand, as at the tendon the fan converges on,
	 * the direction at the nearest sample where it doesn't (chosen at rest) is used. Strands that pass
	 * each other would flip it: fans only.
	 */
	private rollSheets(): void {
		const N = this.N, Q = this.quat;
		for (const m of this.muscles) {
			if (m.count < 2 || !m.def.fan) continue;
			for (let k = 0; k < m.count; k++) {
				const s = m.first + k;
				if (this.joined[s]) continue;
				// the roll each usable sample needs, as far as the fan is still wide enough there now to say (where
				// its edges brush past each other it fades out, and in again as they part); the others take their
				// nearest usable sample's
				const need = new Float64Array(N).fill(NaN);
				for (let i = 0; i < N; i++) {
					if (this.rungAt[s * N + i] !== i) continue;
					const g = this.rungAngle(m, k, i);
					need[i] = wrapPi(g.angle - this.restRung[s * N + i]) * smoothstep(RUNG_MIN, 3 * RUNG_MIN, g.across);
				}
				for (let i = 0; i < N; i++) {
					const j = this.rungAt[s * N + i];
					if (j < 0 || Number.isNaN(need[j])) continue;
					const r = need[j];
					// rotate the frame about its own tangent (its first axis) by r
					const o = (s * N + i) * 4, h = r / 2, c = Math.cos(h), sn = Math.sin(h);
					const [x, y, z, ww] = [Q[o], Q[o + 1], Q[o + 2], Q[o + 3]];
					Q[o] = ww * sn + x * c; Q[o + 1] = y * c + z * sn; Q[o + 2] = z * c - y * sn; Q[o + 3] = ww * c - x * sn;
				}
			}
		}
	}

	/**
	 * Angle round strand k of muscle m at sample i (in its frame) of the fan's width direction (taken at
	 * sample `at`), how wide the fan is across the strand, and what share of that direction is across it.
	 */
	private rungAngle(m: MuscleEntry, k: number, i: number, at = i): { angle: number; across: number; fraction: number } {
		// the fan's width there: from its first strand to its last (two neighbours can run together, as the
		// anterior deltoid's do over the head in abduction; its edges don't)
		const N = this.N, P = this.pos, s = m.first + k, first = m.first, last = m.first + m.count - 1;
		const a = (first * N + at) * 3, b = (last * N + at) * 3, o = (s * N + i) * 4;
		const r = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
		const q: Quat = [this.quat[o], this.quat[o + 1], this.quat[o + 2], this.quat[o + 3]];
		const t = qRotate(q, [1, 0, 0]), y = qRotate(q, [0, 1, 0]), z = qRotate(q, [0, 0, 1]);
		const rt = dot(r, t), rp = [r[0] - rt * t[0], r[1] - rt * t[1], r[2] - rt * t[2]];
		const across = Math.hypot(rp[0], rp[1], rp[2]);
		// where the strands (nearly) meet in a shared tendon the direction is unstable: none counts across
		return { angle: Math.atan2(dot(rp, z), dot(rp, y)), across, fraction: across < RUNG_MIN ? 0 : across / Math.hypot(r[0], r[1], r[2]) };
	}

	/**
	 * Rest rung angles of every fan strand's usable samples (NaN elsewhere), and for every sample the
	 * usable one whose roll it takes (rungAt; -1 for none): itself, or the nearest, so toward the tendon a
	 * fan converges on, where the direction between strands swings with the least change in how they
	 * arrive (they may even pass there), the roll is held at what it was where the fan was still wide.
	 */
	private rungAngles(): Float64Array {
		const N = this.N, out = new Float64Array(this.strands.length * N).fill(NaN);
		this.rungAt.fill(-1);
		for (const m of this.muscles) {
			if (m.count < 2 || !m.def.fan) continue;
			for (let k = 0; k < m.count; k++) {
				const rungs = Array.from({ length: N }, (_, i) => this.rungAngle(m, k, i));
				// usable: the neighbour well across the strand, and the fan still wide there
				const wide = FAN_WIDE * Math.max(...rungs.map((r) => r.across));
				const usable = rungs.map((r) => r.fraction >= RUNG_ACROSS && r.across >= wide);
				for (let i = 0; i < N; i++) {
					let j = -1;
					for (let d = 0; d < N && j < 0; d++) {
						if (i - d >= 0 && usable[i - d]) j = i - d;
						else if (i + d < N && usable[i + d]) j = i + d;
					}
					this.rungAt[(m.first + k) * N + i] = j;
					if (j === i) out[(m.first + k) * N + i] = rungs[i].angle;
				}
			}
		}
		return out;
	}

	/**
	 * Each draped strand's share of its rest drape kept (MusclePathDef.drape): from 1 at rest down to the
	 * muscle's share as its end-to-end direction, taken in its origin bone's frame, turns from its rest
	 * direction by the muscle's angle. Its ends are fixed points, so this depends on the pose alone.
	 */
	private drapes(bones: Rigid[] = this.bones): void {
		const N = this.N, P = this.pos;
		this.strands.forEach((st, s) => {
			const d = this.muscles[st.muscle].def.drape;
			if (!d) return;
			const a = s * N * 3, b = (s * N + N - 1) * 3, q = bones[st.originBone].q;
			const dir = unit(qRotate([-q[0], -q[1], -q[2], q[3]], [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]]));
			if (!this.restChord[s]) this.restChord[s] = dir;
			const turn = Math.acos(Math.min(1, Math.max(-1, dot(dir, this.restChord[s]!)))) * (180 / Math.PI);
			this.drape[s] = 1 - (1 - d[0]) * smoothstep(0, d[1], turn);
		});
	}

	/** Each sample's distance to its neighbours (half the span across it; one-sided at the ends). */
	private gaps(): Float64Array {
		const N = this.N, P = this.pos, out = new Float64Array(this.strands.length * N);
		const dist = (a: number, b: number) => Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
		for (let s = 0; s < this.strands.length; s++)
			for (let i = 0; i < N; i++) {
				const o = (s * N + i) * 3;
				out[s * N + i] = Math.max(1e-6, i === 0 ? dist(o, o + 3) : i === N - 1 ? dist(o - 3, o) : dist(o - 3, o + 3) / 2);
			}
		return out;
	}

	/**
	 * Hand-tuned adjustments at the current step (tune.ts), after the frames: each sample moved off the line
	 * by lift (along the strand's rest direction away from the bone, carried in its frame) and shift (across
	 * that), then its frame rolled about the line; both scaled by bump(s), so the attachments stay put.
	 */
	private applyTuning(): void {
		const N = this.N, P = this.pos, Q = this.quat;
		this.strands.forEach((st, s) => {
			const t = this.tune[st.muscle];
			if (!t || (t.roll === 0 && t.lift === 0 && t.shift === 0)) return;
			const th = Number.isNaN(this.outward[s]) ? 0 : this.outward[s], co = Math.cos(th), si = Math.sin(th);
			for (let i = 0; i < N; i++) {
				const b = bump(i / (N - 1));
				if (b <= 0) continue;
				const o = (s * N + i) * 4, q: Quat = [Q[o], Q[o + 1], Q[o + 2], Q[o + 3]];
				if (t.lift !== 0 || t.shift !== 0) {
					const out = qRotate(q, [0, co, si]), side = qRotate(q, [0, -si, co]), p = (s * N + i) * 3;
					for (let c = 0; c < 3; c++) P[p + c] += b * (t.lift * out[c] - t.shift * side[c]);
				}
				if (t.roll !== 0) {
					// about the frame's own tangent (its first axis)
					const h = (t.roll * b * Math.PI) / 360, c = Math.cos(h), sn = Math.sin(h);
					const [x, y, z, w] = q;
					Q[o] = w * sn + x * c; Q[o + 1] = y * c + z * sn; Q[o + 2] = z * c - y * sn; Q[o + 3] = w * c - x * sn;
				}
			}
		});
	}

	/**
	 * Pack strands and bones into an RGBA float texture `width` texels wide. Row s < strands: texel
	 * 2i = sample i's position and spacing, 2i+1 = its frame quaternion; texel 2N = (origin bone,
	 * insertion bone, bulge factor, length), 2N+1 = (drape kept, 0, 0, 0). Last row: texel 2b = bone b's
	 * translation, 2b+1 = its rotation.
	 */
	writeTexture(out: Float32Array, width: number): void {
		const N = this.N, S = this.strands.length;
		for (let s = 0; s < S; s++) {
			const row = s * width * 4;
			for (let i = 0; i < N; i++) {
				const o = row + i * 8, p = (s * N + i) * 3, q = (s * N + i) * 4;
				out[o] = this.pos[p]; out[o + 1] = this.pos[p + 1]; out[o + 2] = this.pos[p + 2]; out[o + 3] = this.spacing[s * N + i];
				out[o + 4] = this.quat[q]; out[o + 5] = this.quat[q + 1]; out[o + 6] = this.quat[q + 2]; out[o + 7] = this.quat[q + 3];
			}
			const m = row + N * 8, st = this.strands[s];
			out[m] = st.originBone; out[m + 1] = st.insertionBone; out[m + 2] = this.bulge[s]; out[m + 3] = this.length[s];
			out[m + 4] = this.drape[s]; out[m + 5] = 0; out[m + 6] = 0; out[m + 7] = 0;
		}
		const row = S * width * 4;
		this.bones.forEach((b, i) => {
			const o = row + i * 8;
			out[o] = b.t[0]; out[o + 1] = b.t[1]; out[o + 2] = b.t[2]; out[o + 3] = 0;
			out[o + 4] = b.q[0]; out[o + 5] = b.q[1]; out[o + 6] = b.q[2]; out[o + 7] = b.q[3];
		});
	}

	/** Texture size for writeTexture: [width, height]. */
	textureSize(): [number, number] {
		return [Math.max(2 * this.N + 2, 2 * (this.boneCount + this.joins.length)), this.strands.length + 1];
	}

	/** World-space polyline of a strand before resampling (for debugging). */
	polyline(strand: number, bones = this.bones): number[] {
		this.geometry(this.strands[strand], bones, this.work);
		return [...this.work.poly];
	}

	// -------------------------------------------------------------------------------------------

	/**
	 * Sample strand s at `bones` into pos, with its length and its fixed points (ends and via points)
	 * in samples, for contact.
	 */
	private sample(st: Strand, bones: Rigid[], s: number): void {
		const w = this.work, N = this.N, P = this.pos;
		this.geometry(st, bones, w);
		P.set(w.X.subarray(0, N * 3), s * N * 3);
		this.length[s] = polyLength(w.poly);
		const a = this.anchors[s];
		a.length = 1;
		for (let k = 0; k < w.via.length; k += 3) {
			// nearest sample segment to the via point (on the path, up to hairpin smoothing)
			let best = Infinity, at = 0;
			for (let j = 0; j < N - 1; j++) {
				const o = (s * N + j) * 3, ex = P[o + 3] - P[o], ey = P[o + 4] - P[o + 1], ez = P[o + 5] - P[o + 2];
				const ee = ex * ex + ey * ey + ez * ez, dx = w.via[k] - P[o], dy = w.via[k + 1] - P[o + 1], dz = w.via[k + 2] - P[o + 2];
				const u = ee > 1e-12 ? Math.min(1, Math.max(0, (dx * ex + dy * ey + dz * ez) / ee)) : 0;
				const d = (dx - ex * u) ** 2 + (dy - ey * u) ** 2 + (dz - ez * u) ** 2;
				if (d < best) { best = d; at = j + u; }
			}
			if (at > a[a.length - 1] + 0.5 && at < N - 1.5) a.push(at);
		}
		a.push(N - 1);
	}

	/**
	 * One step of the walk from the rest pose, for strand s sampled at `bones` (pos): carry its end
	 * frames on from the previous step, transport the frame along it, follow the twist between the
	 * transported frame and the insertion bone's onto the branch nearest the previous step's, then
	 * twist the frames and store them (every step: contact reads them).
	 *
	 * The end frames live in their bone's frame and are turned, step by step, by the least rotation
	 * that follows the strand's end direction there. Taking that rotation from the rest direction in
	 * one go would be ill-defined where a strand's direction swings round by half a turn relative to
	 * its bone (pronator quadratus leaving the ulna as the radius crosses over it); small steps are
	 * not, and they depend only on the pose.
	 */
	private strandFrames(st: Strand, bones: Rigid[], s: number): void {
		const w = this.work, N = this.N, h = this.walk, o3 = s * 3;
		w.X.set(this.pos.subarray(s * N * 3, (s + 1) * N * 3));
		tangents(w.X, N, w.T);
		const T = w.T, Rn = w.Rn;
		const follow = (q: Quat, r: Float64Array, t: Float64Array, dir: Vec3): Vec3 => {
			const qi: Quat = [-q[0], -q[1], -q[2], q[3]];
			const tl = qRotate(qi, dir);
			const rl = alignOnto([r[o3], r[o3 + 1], r[o3 + 2]], [t[o3], t[o3 + 1], t[o3 + 2]], tl);
			r.set(rl, o3);
			t.set(tl, o3);
			return qRotate(q, rl);
		};
		// the end frames follow the strand's direction over its last few samples, not its last segment
		// alone: that can be a short dive onto an attachment inside a wrap, swinging round as the wrap's
		// exit moves, and the twist measured about it would swing with it
		// (turned between those and the end tangents by least rotations, which the rest pass inverts)
		const [d0, dN] = endDirections(w.X, N);
		const e = (N - 1) * 3, t0: Vec3 = [T[0], T[1], T[2]], tN: Vec3 = [T[e], T[e + 1], T[e + 2]];
		const r0 = alignOnto(follow(bones[st.originBone].q, h.r0, h.t0, d0), d0, t0);
		Rn[0] = r0[0]; Rn[1] = r0[1]; Rn[2] = r0[2];
		this.transport(w);
		const rN: Vec3 = [Rn[e], Rn[e + 1], Rn[e + 2]];
		const target = alignOnto(follow(bones[st.insertionBone].q, h.rE, h.tE, dN), dN, tN);
		const c = cross(rN, target);
		const raw = Math.atan2(dot(c, tN), dot(rN, target));
		const phi = (this.twistAngle[s] += wrapPi(raw - this.twistAngle[s]));
		const Q = this.quat;
		// a fan's roll comes from the fan (rollSheets), not from its ends' twist
		const fan = this.muscles[st.muscle].def.fan === true && this.muscles[st.muscle].count > 1;
		let px = 0, py = 0, pz = 0, pw = 1;
		for (let i = 0; i < N; i++) {
			const o = i * 3;
			const t: Vec3 = [T[o], T[o + 1], T[o + 2]];
			let r: Vec3 = [Rn[o], Rn[o + 1], Rn[o + 2]];
			const a = fan ? 0 : phi * st.twist[i];
			if (a !== 0) {
				const b = cross(t, r), ca = Math.cos(a), sa = Math.sin(a);
				r = [r[0] * ca + b[0] * sa, r[1] * ca + b[1] * sa, r[2] * ca + b[2] * sa];
			}
			const b = cross(t, r);
			let [qx, qy, qz, qw] = basisToQuat(t, r, b);
			if (i > 0 && qx * px + qy * py + qz * pz + qw * pw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
			px = qx; py = qy; pz = qz; pw = qw;
			const q = (s * N + i) * 4;
			Q[q] = qx; Q[q + 1] = qy; Q[q + 2] = qz; Q[q + 3] = qw;
		}
	}

	/** World polyline of a strand (and its via points), resampled to N points by arc length, with unit tangents. */
	private geometry(st: Strand, bones: Rigid[], w: Work): void {
		const poly = w.poly;
		poly.length = 0;
		w.via.length = 0;
		const els = st.elements;
		const world = (e: Element): Vec3 => {
			const { bone, p } = e as { bone: number; p: Vec3 };
			const b = bones[bone], v = qRotate(b.q, p);
			return [v[0] + b.t[0], v[1] + b.t[1], v[2] + b.t[2]];
		};
		if (st.baked) {
			bakedPolyline(st.baked, this.baked!.M, this.cell!, this.gridBones, bones, world(els[0]), world(els[els.length - 1]), poly);
			for (let k = 1; k < els.length - 1; k++) w.via.push(...world(els[k]));
		}
		for (let k = 0; k < els.length && !st.baked; ) {
			if (els[k].point) {
				const x = world(els[k]);
				poly.push(...x);
				if (k > 0 && k < els.length - 1) w.via.push(...x);
				k++;
				continue;
			}
			let j = k;
			while (!els[j].point) j++;
			this.wrapRun(els.slice(k, j) as WrapElement[], world(els[k - 1]), world(els[j]), bones, poly);
			k = j;
		}
		// a hand-tuned shorter belly gives that much of its length to the tendons (tune.ts)
		const s = this.strands.indexOf(st), t = this.tune[st.muscle];
		const E = t && t.length !== 1 && this.tendons[s] ? (1 - t.length) * st.restLength * this.bellyShare[s] : 0;
		if (s >= 0) this.extra[s] = E;
		resample(poly, this.N, w.X, st.restLength, st.stretch, E, this.tendons[s] ?? undefined);
		smoothSamples(w.X, this.N, this.opts.smooth, w.T);
		tangents(w.X, this.N, w.T);
	}

	/**
	 * Wraps in a row between points P and S. Each is solved between the exit of the wrap before it
	 * (or P) and the entry of the wrap after it (or S), sweeping a few times so they settle on each
	 * other: an approximation of the shortest path over several obstacles, continuous because each
	 * wrap is.
	 */
	private wrapRun(run: WrapElement[], P: Vec3, S: Vec3, bones: Rigid[], out: number[]): void {
		const r = run.findIndex((e) => this.surfaces[e.surface].def.kind === 'rim');
		if (r >= 0) {
			this.rimRun(run, r, P, S, bones, out);
			return;
		}
		if (run.length === 1) {
			this.wrapInto(run[0], P, S, bones, out);
			return;
		}
		const pts: number[][] = run.map(() => []);
		const exitBefore = (j: number): Vec3 => {
			for (let i = j - 1; i >= 0; i--) if (pts[i].length) return pts[i].slice(-3) as Vec3;
			return P;
		};
		const entryAfter = (j: number): Vec3 => {
			for (let i = j + 1; i < run.length; i++) if (pts[i].length) return pts[i].slice(0, 3) as Vec3;
			return S;
		};
		for (let sweep = 0; sweep < RUN_SWEEPS; sweep++)
			for (let j = 0; j < run.length; j++) {
				const from = exitBefore(j), to = entryAfter(j);
				pts[j].length = 0;
				this.wrapInto(run[j], from, to, bones, pts[j]);
			}
		for (const p of pts) for (const v of p) out.push(v);
	}

	/**
	 * A run holding a rim (run[r]): solved without it first. Where that way is blocked by the rim (it
	 * crosses the plate, or the wall beyond the rim's arc), the path goes over the rim instead, at the
	 * point where the wraps before the rim (from P) and after it (to S) make it shortest. Where the free
	 * way just touches the rim or the wall that point is where it crosses, so the rim engages smoothly.
	 */
	private rimRun(run: WrapElement[], r: number, P: Vec3, S: Vec3, bones: Rigid[], out: number[]): void {
		const before = run.slice(0, r), after = run.slice(r + 1), rest = before.concat(after);
		const free: number[] = [];
		if (rest.length) this.wrapRun(rest, P, S, bones, free);
		const rim = this.rimAt(run[r], bones);
		if (!rimBlocked(rim, [...P, ...free, ...S])) {
			for (const v of free) out.push(v);
			return;
		}
		const tmp: number[] = [];
		// length of the way from A through the run's wraps `els` to B
		const leg = (els: WrapElement[], A: Vec3, B: Vec3): number => {
			if (!els.length) return Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
			tmp.length = 0;
			this.wrapRun(els, A, B, bones, tmp);
			const m = tmp.length;
			if (!m) return Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
			let L = Math.hypot(tmp[0] - A[0], tmp[1] - A[1], tmp[2] - A[2]) + Math.hypot(B[0] - tmp[m - 3], B[1] - tmp[m - 2], B[2] - tmp[m - 1]);
			for (let k = 3; k < m; k += 3) L += Math.hypot(tmp[k] - tmp[k - 3], tmp[k + 1] - tmp[k - 2], tmp[k + 2] - tmp[k - 1]);
			return L;
		};
		const [lo, hi] = rimRange(rim);
		const s = minimize1D((t) => { const X = rimPoint(rim, t); return leg(before, P, X) + leg(after, X, S); }, lo, hi, !rim.arc);
		const X = rimPoint(rim, s);
		if (before.length) this.wrapRun(before, P, X, bones, out);
		out.push(X[0], X[1], X[2]);
		if (after.length) this.wrapRun(after, X, S, bones, out);
	}

	/** A rim use in world space at `bones`. */
	private rimAt(e: WrapElement, bones: Rigid[]): Rim {
		const sf = this.surfaces[e.surface], d = sf.def as RimSurface, b = bones[sf.bone], R = sf.R;
		const cr = qRotate(b.q, d.center);
		return {
			c: [cr[0] + b.t[0], cr[1] + b.t[1], cr[2] + b.t[2]],
			u: qRotate(b.q, [R[0], R[1], R[2]]), v: qRotate(b.q, [R[3], R[4], R[5]]), n: qRotate(b.q, [R[6], R[7], R[8]]),
			a: d.radii[0], b: d.radii[1], arc: e.arc ?? null
		};
	}

	private wrapInto(e: { surface: number; side: number }, P: Vec3, S: Vec3, bones: Rigid[], out: number[]): boolean {
		const sf = this.surfaces[e.surface], b = bones[sf.bone], d = sf.def;
		const cr = qRotate(b.q, d.center);
		const c: Vec3 = [cr[0] + b.t[0], cr[1] + b.t[1], cr[2] + b.t[2]];
		if (d.kind === 'cylinder') return wrapCylinder(P, S, c, qRotate(b.q, sf.axis), d.radius, e.side, out, d.extent);
		if (d.kind === 'rim') throw new Error('rims are solved with their run (rimRun)');
		const M = qToMat3(b.q), R = sf.R, Rw: number[] = new Array(9);
		for (let col = 0; col < 3; col++)
			for (let row = 0; row < 3; row++) Rw[col * 3 + row] = M[row] * R[col * 3] + M[3 + row] * R[col * 3 + 1] + M[6 + row] * R[col * 3 + 2];
		return d.about ? wrapEllipsoidAbout(P, S, c, d.radii, Rw, qRotate(b.q, sf.axis), e.side, out) : wrapEllipsoid(P, S, c, d.radii, Rw, out);
	}

	/**
	 * Side of a cylinder (or an ellipsoid wrapped about an axis) the rest-pose path passes on. Where the
	 * rest path touches it, the side with the shorter wrap; where it doesn't, counterclockwise (+1) when
	 * the axis lies to the left of the straight line between the points around the wrap, seen down the axis.
	 */
	private autoSide(st: Strand, e: { surface: number }): number {
		const sf = this.surfaces[e.surface];
		if (sf.def.kind !== 'cylinder' && !(sf.def.kind === 'ellipsoid' && sf.def.about)) return 1;
		const els = st.elements, k = els.indexOf(e as Element);
		let a = k - 1, b = k + 1;
		while (!els[a].point) a--;
		while (!els[b].point) b++;
		const P = (els[a] as { p: Vec3 }).p, S = (els[b] as { p: Vec3 }).p; // rest: bone frame = world
		const arc = (side: number) => {
			const out: number[] = [];
			return this.wrapInto({ surface: e.surface, side }, P, S, this.bones, out) ? polyLength([...P, ...out, ...S]) : 0;
		};
		const ccw = arc(1), cw = arc(-1), straight = Math.hypot(S[0] - P[0], S[1] - P[1], S[2] - P[2]);
		if (ccw > straight + 1e-6 && cw > straight + 1e-6) return ccw <= cw ? 1 : -1;
		const ax = sf.axis, c = sf.def.center, e1 = perpendicular(ax), e2 = cross(ax, e1);
		const px = dot(sub(P, c), e1), py = dot(sub(P, c), e2), sx = dot(sub(S, c), e1), sy = dot(sub(S, c), e2);
		return (sy - py) * px - (sx - px) * py >= 0 ? 1 : -1;
	}

	/** Parallel-transport Rn[0] along X/T (double reflection). */
	private transport(w: Work): void {
		const { X, T, Rn } = w, N = this.N;
		for (let i = 0; i < N - 1; i++) {
			const a = i * 3, b = a + 3;
			const v1 = [X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]];
			const c1 = dot(v1, v1);
			let r: Vec3 = [Rn[a], Rn[a + 1], Rn[a + 2]];
			const tn: Vec3 = [T[b], T[b + 1], T[b + 2]];
			if (c1 > 1e-12) {
				const k1 = (2 / c1) * dot(v1, r);
				const rL: Vec3 = [r[0] - k1 * v1[0], r[1] - k1 * v1[1], r[2] - k1 * v1[2]];
				const kt = (2 / c1) * (v1[0] * T[a] + v1[1] * T[a + 1] + v1[2] * T[a + 2]);
				const v2 = [tn[0] - (T[a] - kt * v1[0]), tn[1] - (T[a + 1] - kt * v1[1]), tn[2] - (T[a + 2] - kt * v1[2])];
				const c2 = dot(v2, v2);
				if (c2 > 1e-14) {
					const k2 = (2 / c2) * dot(v2, rL);
					r = [rL[0] - k2 * v2[0], rL[1] - k2 * v2[1], rL[2] - k2 * v2[2]];
				} else r = rL;
			}
			// guard against drift: keep it a unit vector across the new tangent
			const d = dot(r, tn);
			r = unit([r[0] - d * tn[0], r[1] - d * tn[1], r[2] - d * tn[2]]);
			Rn[b] = r[0]; Rn[b + 1] = r[1]; Rn[b + 2] = r[2];
		}
	}

	private bulgeFor(m: MuscleEntry, k: number): number {
		if (m.def.bulge === false) return 1;
		const ref = this.muscles[m.lengthRef];
		const s = ref.first + Math.min(k, ref.count - 1);
		const ratio = (this.length[s] - this.extra[s]) / this.strands[s].restLength;
		const belly = Math.max(0.3, 1 - (1 - ratio) / this.opts.bellyFrac);
		return Math.min(this.opts.kMax, Math.max(this.opts.kMin, 1 / Math.sqrt(belly)));
	}
}

// ---- helpers ---------------------------------------------------------------------------------

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: ArrayLike<number>, b: ArrayLike<number>): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function sub(a: ArrayLike<number>, b: ArrayLike<number>): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function unit(v: ArrayLike<number>): Vec3 {
	const l = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
}

/** The baked line of action for a baked muscle's strand k, checked against its definition. */
function bakedStrand(baked: BakedPaths | null, mesh: string, k: number, els: MusclePathDef['strands'][number], where: string): BakedStrand {
	if (els.some((e) => !isPoint(e) || isJoin(e))) throw new Error(`${where}: a baked strand has points only (no wraps or joins)`);
	const b = baked?.strands.find((s) => s.mesh === mesh && s.strand === k);
	if (!b) throw new Error(`${where}: baked, but not in the joint's baked paths (run scripts/bake.ts)`);
	if (b.key !== strandKey(els as PathPoint[])) throw new Error(`${where}: its points have changed since it was baked (run scripts/bake.ts)`);
	return b;
}

export function wrapPi(a: number): number {
	return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/** A unit vector across unit `t`, built from the world axis least aligned with it. */
function perpendicularTo(t: Vec3): Vec3 {
	const ax = Math.abs(t[0]), ay = Math.abs(t[1]), az = Math.abs(t[2]);
	const h: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
	return unit(cross(t, h));
}

/**
 * `r` turned by the least rotation taking unit `from` onto unit `to`, then made exactly
 * perpendicular to `to`.
 */
function alignOnto(r: Vec3, from: Vec3, to: Vec3): Vec3 {
	const v = cross(from, to), c = dot(from, to);
	let out = r;
	if (c > -0.999) {
		const vr = cross(v, r), vvr = cross(v, vr), k = 1 / (1 + c);
		out = [r[0] + vr[0] + vvr[0] * k, r[1] + vr[1] + vvr[1] * k, r[2] + vr[2] + vvr[2] * k];
	}
	const d = dot(out, to);
	return unit([out[0] - d * to[0], out[1] - d * to[1], out[2] - d * to[2]]);
}

/** Quaternion of the rotation whose matrix columns are x, y, z. */
export function basisToQuat(x: Vec3, y: Vec3, z: Vec3): [number, number, number, number] {
	const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
	const tr = m00 + m11 + m22;
	let qx: number, qy: number, qz: number, qw: number;
	if (tr > 0) {
		const s = 0.5 / Math.sqrt(tr + 1);
		qw = 0.25 / s; qx = (m21 - m12) * s; qy = (m02 - m20) * s; qz = (m10 - m01) * s;
	} else if (m00 > m11 && m00 > m22) {
		const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
		qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s;
	} else if (m11 > m22) {
		const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
		qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s;
	} else {
		const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
		qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s;
	}
	const l = Math.hypot(qx, qy, qz, qw);
	return [qx / l, qy / l, qz / l, qw / l];
}

/** Turn at a sample below which it is left alone, and above which it is fully smoothed (degrees). */
const SMOOTH_TURN: [number, number] = [90, 150];

/**
 * `iters` passes of [¼ ½ ¼] averaging over sampled points X (n of them), ends fixed, each point
 * weighted by how sharply the curve turns there: only hairpins are rounded, so wraps keep their
 * radius (plain averaging would pull them into the bone). `tmp`: scratch.
 */
export function smoothSamples(X: Float64Array, n: number, iters: number, tmp: Float64Array): void {
	const [a, b] = SMOOTH_TURN.map((d) => Math.cos((d * Math.PI) / 180));
	for (let it = 0; it < iters; it++) {
		tmp.set(X.subarray(0, n * 3));
		for (let i = 1; i < n - 1; i++) {
			const o = i * 3;
			const ux = tmp[o] - tmp[o - 3], uy = tmp[o + 1] - tmp[o - 2], uz = tmp[o + 2] - tmp[o - 1];
			const vx = tmp[o + 3] - tmp[o], vy = tmp[o + 4] - tmp[o + 1], vz = tmp[o + 5] - tmp[o + 2];
			const l = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz);
			if (l < 1e-12) continue;
			// cos of the turn: 1 straight on, -1 a full reversal
			const c = (ux * vx + uy * vy + uz * vz) / l, f = Math.min(1, Math.max(0, (a - c) / (a - b)));
			const w = f * f * (3 - 2 * f);
			if (w <= 0) continue;
			for (let k = 0; k < 3; k++) X[o + k] = tmp[o + k] + w * (0.25 * tmp[o - 3 + k] + 0.25 * tmp[o + 3 + k] - 0.5 * tmp[o + k]);
		}
	}
}

export function polyLength(p: ArrayLike<number>): number {
	let L = 0;
	for (let k = 3; k < p.length; k += 3) L += Math.hypot(p[k] - p[k - 3], p[k + 1] - p[k - 2], p[k + 2] - p[k - 1]);
	return L;
}

/**
 * Resample polyline `p` to n points by arc length: evenly spaced, or with a rest length `L0` and
 * cumulative `stretch` weights, point i at sᵢ·L₀ + (L − L₀)·stretchᵢ (see Strand.stretch).
 */
export function resample(p: ArrayLike<number>, n: number, out: Float64Array, L0 = 0, stretch?: ArrayLike<number>, extra = 0, tendons?: ArrayLike<number>): void {
	const m = p.length / 3, L = polyLength(p);
	let seg = 0, acc = 0, segLen = m > 1 ? Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2]) : 0, prev = 0;
	for (let i = 0; i < n; i++) {
		const si = i / (n - 1);
		// `extra` of the belly's length moved to the tendons (hand-tuned shortening), spread by `tendons`
		let target = L0 > 0 && stretch ? si * L0 + (L - L0 - extra) * stretch[i] + (tendons ? extra * tendons[i] : 0) : si * L;
		target = i === n - 1 ? L : Math.min(L, Math.max(target, i ? prev + 1e-4 : 0));
		prev = target;
		while (seg < m - 2 && acc + segLen < target) {
			acc += segLen;
			seg++;
			const a = seg * 3;
			segLen = Math.hypot(p[a + 3] - p[a], p[a + 4] - p[a + 1], p[a + 5] - p[a + 2]);
		}
		const a = seg * 3, u = segLen > 1e-12 ? Math.min(1, Math.max(0, (target - acc) / segLen)) : 0, o = i * 3;
		const b = m > 1 ? a + 3 : a;
		out[o] = p[a] + (p[b] - p[a]) * u;
		out[o + 1] = p[a + 1] + (p[b + 1] - p[a + 1]) * u;
		out[o + 2] = p[a + 2] + (p[b + 2] - p[a + 2]) * u;
	}
}

/** Unit tangents of a sampled curve by central differences (one-sided at the ends). */
export function tangents(X: Float64Array, n: number, T: Float64Array): void {
	for (let i = 0; i < n; i++) {
		const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3;
		const v = unit([X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]]);
		T[i * 3] = v[0]; T[i * 3 + 1] = v[1]; T[i * 3 + 2] = v[2];
	}
}
