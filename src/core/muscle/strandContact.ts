/**
 * Contact between the strands of muscles in different layers: where two muscles lie against each
 * other, their strands are kept apart by the two meshes' thickness, so neither mesh cuts into the
 * other (brachioradialis over pronator teres through pronation). Vertex pushes can't do this once
 * two lines of action have crossed; moving the lines does, and the meshes follow.
 *
 *   - Side: each contact keeps the upper strand on the side of the lower one it lay on at rest. The
 *     side is followed through a pose by the solver's walk from rest: each step pushes along the
 *     previous step's side, then takes the side the strands now have. It never flips, however far
 *     the unconstrained strands cross within a step, and depends only on the pose.
 *   - Clearance: the lower mesh's extent along the side plus the upper mesh's against it, each
 *     looked up by direction in its strand's current frame (a flat muscle turned broadside-on needs
 *     more room), less any overlap the two have at rest.
 *   - Shared push: both strands give way, each in proportion to how freely it moves there: a
 *     taut string pushed at a point between two fixed points gives ab/(a+b) per unit tension, a
 *     and b the lengths to them. A strand already back down to its rest clearance from bone gives
 *     nothing toward the bone, so the other takes the push.
 *   - Taut: a push at one point moves the strand like a string, straight to its nearest fixed points
 *     (ends and via points) either side, so it bends over the other muscle without bunching. It
 *     bends only so far (BEND): near an attachment a strand barely moves, and whatever neither
 *     strand can take is left as the two muscles pressing into each other.
 *   - Attachments hold: there is no contact within either muscle's anchor length of its ends, where
 *     its vertices ride the bone rather than the strand.
 *
 * Strands are kept out of bone the same way (BoneContacts): each sample outside every bone, at its
 * rest clearance or its mesh's thickness toward the bone if less, pushed out along the side of the
 * bone it was on (followed through the walk), never the nearest way out, which flips across a thin
 * bone; the strand bends taut to its fixed points. Wraps then only shape a path; they no longer have
 * to keep it out of bone everywhere, which at a joint as mobile as the shoulder they cannot.
 *
 * Contacts are recorded where two strands are within reach at rest. Every rule is smooth (no
 * thresholds), so the result is a continuous function of the pose.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import type { Rigid } from '../math';
import { sdfGradient, sdfSample, SDF_FAR } from '../sdf';
import type { SdfGrid } from '../types';
import type { BoundMesh } from './bind';
import { pushRamp, strandFrame } from './deform';
import type { PathSolver } from './path';

export interface ContactOptions {
	/** strands are in contact where their rest distance is at most the meshes' thickness plus this, mm */
	reach: number;
	/** width of the smooth start of a push, mm */
	soft: number;
	/** passes over every contact per step of the walk */
	sweeps: number;
	/** keep strands out of bone as well (BoneContacts); experimental, off by default */
	bones: boolean;
	/** contact between every pair of layers; false leaves only the pairs muscles name as `beside` */
	layers: boolean;
}

// reach 9 mm and beyond takes in strands that only meet in the flexed elbow's crease, where the side
// between them turns too fast to follow
export const DEFAULT_CONTACT_OPTIONS: ContactOptions = { reach: 6, soft: 0.5, sweeps: 3, bones: false, layers: true };

/** The contacts between one upper strand and one lower strand. */
export interface StrandContact {
	upper: number;
	lower: number;
	/** per contact: upper sample index */
	i: Int32Array;
	/** nearest point on the lower strand at rest, in samples (0 … N−1), and its tracked copy */
	sigma0: Float64Array;
	sigma: Float64Array;
	/** side (unit, world, 3 per contact) at rest, and its tracked copy */
	n0: Float64Array;
	n: Float64Array;
	/** overlap of the two meshes at rest along the side (≤ 0), mm */
	base: Float64Array;
	/**
	 * the lower strand holds its line and the upper takes the whole push: a part beside another gives way to
	 * it (pushed, the middle deltoid's fan strands rolled its sheet over)
	 */
	held: boolean;
}

/** Samples of strands kept out of bones: one row per (strand, sample, bone). */
export interface BoneContacts {
	strand: Int32Array;
	sample: Int32Array;
	bone: Int32Array;
	/**
	 * clearance kept from the bone, mm: the rest clearance, or the mesh's thickness toward the bone if
	 * less (fixed at rest: looked up in the strand's current frame instead, a push that rolled the frame
	 * changed the clearance, which changed the push, and neighbouring poses settled differently)
	 */
	need: Float64Array;
	/** side: the bone's outward direction there, in the bone's frame (3 per row), at rest and tracked */
	n0: Float64Array;
	n: Float64Array;
}

/** Everything contact needs for one joint. */
export interface ContactModel {
	contacts: StrandContact[];
	bones: BoneContacts;
	/** per strand, N·EXT_DIRS: its mesh's extent across it (see extentTable); null without a mesh */
	ext: (Float64Array | null)[];
	/** per strand, N: 1 where its mesh covers the sample, else 0 */
	cover: Float64Array[];
	/** per strand, N: rest clearance from bone, mm (SDF_FAR where none is near) */
	restClear: Float64Array[];
	/** per strand: its mesh's largest extent anywhere, mm (bounds the clearance a contact can need) */
	maxExt: Float64Array;
	fields: (SdfGrid | null)[];
	opts: ContactOptions;
	/** scratch: the strands' samples before a step's pushes */
	free: Float64Array;
}

/** Segments searched either side of the tracked point. */
const TRACK = 3;
/** Samples either side of a point whose vertices measure the mesh there. */
const WINDOW = 1.5;
/** Rest clearance below which a strand lies on the one beneath and has no side, mm. */
const MIN_REST = 1;
/** Cone about a direction within which vertices measure the mesh's extent that way (cos 45°). */
const CONE = Math.SQRT1_2;
/** Steepest slope a push may give a strand toward its nearest fixed point (tan 20°). */
const BEND = 0.36;
/** Separation along the old side at which the direction between two strands is fully trusted as the new side, mm. */
const SIDE_TRUST = 3;
/** Directions across a strand the mesh's extent is tabulated in. */
export const EXT_DIRS = 16;

/**
 * Contacts for every pair of strands in different layers, and of muscles named `beside` one another
 * (the one naming the other takes the upper part), from the rest pose (the solver must be at rest) and
 * the bound meshes.
 */
export function buildContactModel(solver: PathSolver, bound: BoundMesh[], fields: (SdfGrid | null)[], opts: Partial<ContactOptions> = {}): ContactModel {
	const o = { ...DEFAULT_CONTACT_OPTIONS, ...opts };
	const N = solver.N, P = solver.pos, S = solver.strands.length;
	const meshOf = new Map(bound.map((b) => [b.muscle, b]));
	const ext: (Float64Array | null)[] = [], cover: Float64Array[] = [], restClear: Float64Array[] = [];
	for (let s = 0; s < S; s++) {
		const b = meshOf.get(solver.strands[s].muscle);
		const e = b ? new Float64Array(N * EXT_DIRS) : null, cv = new Float64Array(N), rc = new Float64Array(N);
		for (let i = 0; i < N; i++) {
			if (b && e) cv[i] = extentTable(b, s, i, e, i * EXT_DIRS) ? 1 : 0;
			const p = (s * N + i) * 3;
			rc[i] = boneClear(fields, solver.bones, P[p], P[p + 1], P[p + 2], null);
		}
		ext.push(e); cover.push(cv); restClear.push(rc);
	}

	const contacts: StrandContact[] = [];
	const c = [0, 0, 0], q = [0, 0, 0, 1], t = [0, 0, 0], cu = [0, 0, 0], qu = [0, 0, 0, 1];
	for (const U of solver.muscles)
		for (const L of solver.muscles) {
			const beside = !!U.def.beside?.includes(L.def.mesh);
			if (!beside && (!o.layers || L.def.layer >= U.def.layer)) continue;
			for (let u = U.first; u < U.first + U.count; u++)
				for (let l = L.first; l < L.first + L.count; l++) {
					const eu = ext[u], el = ext[l];
					// strands ending on another muscle's strand are solved after contact
					if (!eu || !el || solver.joined[u] || solver.joined[l]) continue;
					const rows: { i: number; sigma: number; n: number[]; base: number }[] = [];
					const [a0, a1] = U.def.anchor ?? [8, 8], [b0, b1] = L.def.anchor ?? [8, 8];
					const hu = solver.strands[u].restLength / (N - 1), hl = solver.strands[l].restLength / (N - 1);
					for (let i = 1; i < N - 1; i++) {
						// attachments hold: none within either muscle's anchor length of its ends
						if (!cover[u][i] || i * hu < a0 || (N - 1 - i) * hu < a1) continue;
						const o3 = (u * N + i) * 3, x = P[o3], y = P[o3 + 1], z = P[o3 + 2];
						// the point resolveContacts tracks: its soft nearest point, settled from the nearest
						let sigma = nearest(P, l, N, x, y, z, 0, N - 2);
						for (let it = 0; it < 20; it++) sigma = softNearest(P, l, N, x, y, z, sigma);
						// past the lower strand's ends (its attachments), or where its mesh doesn't reach
						if (sigma * hl < b0 || (N - 1 - sigma) * hl < b1 || coverAt(cover[l], sigma) < 1) continue;
						// measured as resolveContacts measures it, so nothing is pushed at rest
						strandFrame(solver, l, sigma / (N - 1), c, q);
						side(P, l, N, sigma, ONE, 0, c, t, nBuf);
						const v = [x - c[0], y - c[1], z - c[2]], vt = dot(v, t);
						const vp = [v[0] - vt * t[0], v[1] - vt * t[1], v[2] - vt * t[2]], r = Math.hypot(vp[0], vp[1], vp[2]);
						if (r < MIN_REST) continue;
						const n = [vp[0] / r, vp[1] / r, vp[2] / r];
						// muscles only meet where nothing solid lies between them; parts lying beside one another round a
						// bone (the deltoid's round the humeral head) meet across the line between their strands, which cuts it
						if (!beside && boneBetween(fields, x, y, z, c)) continue;
						strandFrame(solver, u, i / (N - 1), cu, qu);
						const thick = extentAt(el, sigma, q, n[0], n[1], n[2]) + extentAt(eu, i, qu, -n[0], -n[1], -n[2]);
						if (r > thick + o.reach) continue;
						rows.push({ i, sigma, n, base: Math.min(0, r - thick) });
					}
					if (!rows.length) continue;
					const n0 = new Float64Array(rows.length * 3);
					rows.forEach((r, k) => n0.set(r.n, k * 3));
					const sigma0 = Float64Array.from(rows, (r) => r.sigma);
					contacts.push({
						upper: u, lower: l, i: Int32Array.from(rows, (r) => r.i), sigma0, sigma: sigma0.slice(), n0, n: n0.slice(),
						base: Float64Array.from(rows, (r) => r.base), held: beside
					});
				}
		}
	const maxExt = Float64Array.from(ext, (e) => (e ? Math.max(...e) : 0));
	const noBones: BoneContacts = { strand: new Int32Array(0), sample: new Int32Array(0), bone: new Int32Array(0), need: new Float64Array(0), n0: new Float64Array(0), n: new Float64Array(0) };
	return { contacts, bones: o.bones ? buildBoneContacts(solver, ext, fields) : noBones, ext, cover, restClear, maxExt, fields, opts: o, free: new Float64Array(P.length) };
}

/** Whether any bone (at rest: world = bone frame) lies across the segment from (x, y, z) to c. */
function boneBetween(fields: (SdfGrid | null)[], x: number, y: number, z: number, c: number[]): boolean {
	for (let k = 1; k < 8; k++) {
		const t = k / 8, px = x + (c[0] - x) * t, py = y + (c[1] - y) * t, pz = z + (c[2] - z) * t;
		for (const g of fields) if (g && sdfSample(g, px, py, pz) < 0) return true;
	}
	return false;
}

/**
 * A row for every interior sample of every strand with a mesh and every bone with a distance field,
 * except where the strand is fixed to that bone (the stretch to its last point on it, or its anchor
 * length, from the end attached to it). The side is the bone's outward direction at rest, or where the
 * sample lies beyond the field, the direction from the field's middle.
 */
function buildBoneContacts(solver: PathSolver, ext: (Float64Array | null)[], fields: (SdfGrid | null)[]): BoneContacts {
	const N = solver.N, P = solver.pos, Q = solver.quat, rows: number[][] = [], dirs: number[][] = [];
	const q = [0, 0, 0, 1];
	for (let s = 0; s < solver.strands.length; s++) {
		const e = ext[s], st = solver.strands[s];
		if (!e || solver.joined[s]) continue;
		const def = solver.muscles[st.muscle].def, h = st.restLength / (N - 1), [a0, a1] = def.anchor ?? [8, 8];
		// how far the strand is fixed to its origin / insertion bone, in samples from that end
		const fixed = (bone: number, end: 0 | 1) => {
			let k = end ? a1 / h : a0 / h;
			for (const el of st.elements) {
				if (!el.point || el.bone !== bone) continue;
				let best = Infinity, at = 0;
				for (let i = 0; i < N; i++) {
					const o = (s * N + i) * 3, d = Math.hypot(P[o] - el.p[0], P[o + 1] - el.p[1], P[o + 2] - el.p[2]);
					if (d < best) { best = d; at = i; }
				}
				k = Math.max(k, end ? N - 1 - at : at);
			}
			return k;
		};
		const f0 = fixed(st.originBone, 0), f1 = fixed(st.insertionBone, 1);
		for (let i = 1; i < N - 1; i++)
			for (let b = 0; b < fields.length; b++) {
				const g = fields[b];
				if (!g || (b === st.originBone && i <= f0 + 1) || (b === st.insertionBone && N - 1 - i <= f1 + 1)) continue;
				const o = (s * N + i) * 3, x = P[o], y = P[o + 1], z = P[o + 2];
				const d = sdfSample(g, x, y, z);
				let n = d < SDF_FAR - 1 ? sdfGradient(g, x, y, z) : null;
				if (!n) {
					const c = [g.lo[0] + (g.nx * g.h) / 2, g.lo[1] + (g.ny * g.h) / 2, g.lo[2] + (g.nz * g.h) / 2];
					const v = [x - c[0], y - c[1], z - c[2]], l = Math.hypot(v[0], v[1], v[2]) || 1;
					n = [v[0] / l, v[1] / l, v[2] / l];
				}
				lerpQuat(Q, s, N, i, q);
				const thick = extentAt(e, i, q, -n[0], -n[1], -n[2]);
				rows.push([s, i, b, d < SDF_FAR - 1 ? Math.min(d, thick) : thick]);
				dirs.push(n);
			}
	}
	const n0 = new Float64Array(rows.length * 3);
	dirs.forEach((n, k) => n0.set(n, k * 3));
	return {
		strand: Int32Array.from(rows, (r) => r[0]), sample: Int32Array.from(rows, (r) => r[1]), bone: Int32Array.from(rows, (r) => r[2]),
		need: Float64Array.from(rows, (r) => r[3]), n0, n: n0.slice()
	};
}

/** Reset the tracked points and sides to rest, at the start of a solve. */
export function resetContacts(m: ContactModel): void {
	for (const ct of m.contacts) {
		ct.sigma.set(ct.sigma0);
		ct.n.set(ct.n0);
	}
	m.bones.n.set(m.bones.n0);
}

/** Any side, for side() when only the point and tangent are wanted. */
const ONE = new Float64Array([1, 0, 0]);
const cBuf = [0, 0, 0], qBuf = [0, 0, 0, 1], tBuf = [0, 0, 0], nBuf = [0, 0, 0];

/**
 * One step of the walk: push the solved samples (solver.pos) of every contacting pair apart, then
 * take the sides they now have for the next step. Strand frames (solver.quat) are the previous
 * step's. `anchors`: per strand, its fixed points in samples, ascending, first 0 and last N − 1.
 */
export function resolveContacts(solver: PathSolver, m: ContactModel, bones: Rigid[], anchors: number[][]): void {
	const N = solver.N, P = solver.pos, Q = solver.quat, o = m.opts, F = m.free;
	F.set(P);
	/** how far strand s at x (samples) has already been pushed along sign·n this step */
	const pushed = (s: number, x: number, n: number[], sign: number) => {
		const j = Math.min(N - 2, Math.max(0, Math.floor(x))), f = x - j, a = (s * N + j) * 3;
		let d = 0;
		for (let k = 0; k < 3; k++) d += ((P[a + k] - F[a + k]) * (1 - f) + (P[a + 3 + k] - F[a + 3 + k]) * f) * n[k];
		return sign * d;
	};
	for (let sweep = 0; sweep < o.sweeps; sweep++) {
		pushOffBones(solver, m, bones, anchors, pushed);
		for (const ct of m.contacts) {
			const u = ct.upper, l = ct.lower, eu = m.ext[u]!, el = m.ext[l]!;
			for (let k = 0; k < ct.i.length; k++) {
				const i = ct.i[k], ou = (u * N + i) * 3, x = P[ou], y = P[ou + 1], z = P[ou + 2];
				const sigma = (ct.sigma[k] = softNearest(P, l, N, x, y, z, ct.sigma[k]));
				const w = coverAt(m.cover[l], sigma);
				if (w <= 0) continue;
				const n = nBuf, wn = side(P, l, N, sigma, ct.n, k * 3, cBuf, tBuf, n);
				if (wn <= 0) continue;
				const vx = x - cBuf[0], vy = y - cBuf[1], vz = z - cBuf[2];
				const d = vx * n[0] + vy * n[1] + vz * n[2], along = Math.abs(vx * tBuf[0] + vy * tBuf[1] + vz * tBuf[2]);
				// clear of anything the two meshes could need
				if (d >= ct.base[k] + m.maxExt[l] + m.maxExt[u]) continue;
				lerpQuat(Q, l, N, sigma, qBuf);
				const qo = (u * N + i) * 4;
				const need = ct.base[k] + extentAt(el, sigma, qBuf, n[0], n[1], n[2]) + extentAt(eu, i, Q.subarray(qo, qo + 4), -n[0], -n[1], -n[2]);
				const gap = w * wn * (1 - smoothstep(0.5 * need, need, along)) * pushRamp(need - d, o.soft);
				if (gap <= 0) continue;
				// shared by how freely each strand gives there, toward bone only as far as it has room
				const au = anchors[u], al = anchors[l], hu = solver.length[u] / (N - 1), hl = solver.length[l] / (N - 1);
				const gu = give(m, bones, u, i, x, y, z, n, 1), gl = give(m, bones, l, sigma, cBuf[0], cBuf[1], cBuf[2], n, -1);
				const cu = compliance(au, i) * hu * gu, cl = ct.held ? 0 : compliance(al, sigma) * hl * gl;
				if (cu + cl <= 1e-9) continue;
				// each within its bend limit (all pushes this step together); what one can't take goes to the
				// other, as far as it can
				const maxU = Math.max(0, BEND * span(au, i) * hu * gu - pushed(u, i, n, 1));
				const maxL = ct.held ? 0 : Math.max(0, BEND * span(al, sigma) * hl * gl - pushed(l, sigma, n, -1));
				let up = (gap * cu) / (cu + cl), low = gap - up;
				if (up > maxU) { low = Math.min(maxL, low + up - maxU); up = maxU; }
				else if (low > maxL) { up = Math.min(maxU, up + low - maxL); low = maxL; }
				if (up > 0) tent(P, u, N, au, i, n[0] * up, n[1] * up, n[2] * up);
				if (low > 0) tent(P, l, N, al, sigma, -n[0] * low, -n[1] * low, -n[2] * low);
			}
		}
	}
	boneSides(solver, m, bones);
	// the sides the strands now have, for the next step: trusted as far as the strands are apart
	// along the old side (where a push couldn't part them, the direction between them means nothing)
	for (const ct of m.contacts)
		for (let k = 0; k < ct.i.length; k++) {
			const ou = (ct.upper * N + ct.i[k]) * 3, n = nBuf;
			if (side(P, ct.lower, N, ct.sigma[k], ct.n, k * 3, cBuf, tBuf, n) <= 0) continue;
			const vx = P[ou] - cBuf[0], vy = P[ou + 1] - cBuf[1], vz = P[ou + 2] - cBuf[2];
			const vt = vx * tBuf[0] + vy * tBuf[1] + vz * tBuf[2];
			const px = vx - vt * tBuf[0], py = vy - vt * tBuf[1], pz = vz - vt * tBuf[2], r = Math.hypot(px, py, pz);
			if (r < 1e-3) continue;
			const trust = smoothstep(0, SIDE_TRUST, px * n[0] + py * n[1] + pz * n[2]);
			const x = n[0] + (px / r - n[0]) * trust, y = n[1] + (py / r - n[1]) * trust, z = n[2] + (pz / r - n[2]) * trust;
			const l = Math.hypot(x, y, z) || 1;
			ct.n[k * 3] = x / l; ct.n[k * 3 + 1] = y / l; ct.n[k * 3 + 2] = z / l;
		}
}

/**
 * Push strand samples out of bones, each along its side of the bone, as far as its clearance there
 * needs and within the strand's bend limit (`pushed`: how far a point has been pushed already this step).
 */
function pushOffBones(solver: PathSolver, m: ContactModel, bones: Rigid[], anchors: number[][], pushed: (s: number, x: number, n: number[], sign: number) => number): void {
	const N = solver.N, P = solver.pos, B = m.bones, o = m.opts;
	for (let r = 0; r < B.strand.length; r++) {
		const s = B.strand[r], i = B.sample[r], b = B.bone[r], g = m.fields[b]!, bone = bones[b];
		const po = (s * N + i) * 3, qi = [-bone.q[0], -bone.q[1], -bone.q[2], bone.q[3]];
		const l = rotate(qi, P[po] - bone.t[0], P[po + 1] - bone.t[1], P[po + 2] - bone.t[2]);
		const d = sdfSample(g, l[0], l[1], l[2]), need = B.need[r];
		if (d >= need || d >= SDF_FAR - 1) continue;
		const nl = [B.n[r * 3], B.n[r * 3 + 1], B.n[r * 3 + 2]], n = rotate(bone.q, nl[0], nl[1], nl[2]);
		// how far along the side until the clearance is met (a few steps: the side is not the gradient)
		let t = need - d;
		for (let k = 0; k < 3; k++) {
			const dk = sdfSample(g, l[0] + nl[0] * t, l[1] + nl[1] * t, l[2] + nl[2] * t);
			if (dk >= SDF_FAR - 1) break;
			t = Math.min(BONE_WALK, Math.max(0, t + need - dk));
		}
		const h = solver.length[s] / (N - 1);
		const up = Math.min(pushRamp(t, o.soft), Math.max(0, BEND * span(anchors[s], i) * h - pushed(s, i, n, 1)));
		if (up > 0) tent(P, s, N, anchors[s], i, n[0] * up, n[1] * up, n[2] * up);
	}
}

/** Each bone row's side for the next step: the bone's outward direction, trusted as far as the sample is outside it. */
function boneSides(solver: PathSolver, m: ContactModel, bones: Rigid[]): void {
	const N = solver.N, P = solver.pos, B = m.bones;
	for (let r = 0; r < B.strand.length; r++) {
		const g = m.fields[B.bone[r]]!, bone = bones[B.bone[r]], po = (B.strand[r] * N + B.sample[r]) * 3;
		const l = rotate([-bone.q[0], -bone.q[1], -bone.q[2], bone.q[3]], P[po] - bone.t[0], P[po + 1] - bone.t[1], P[po + 2] - bone.t[2]);
		const d = sdfSample(g, l[0], l[1], l[2]);
		if (d >= SDF_FAR - 1) continue;
		const gr = sdfGradient(g, l[0], l[1], l[2]);
		if (!gr) continue;
		const w = smoothstep(-1, 1, d), o = r * 3;
		const x = B.n[o] + (gr[0] - B.n[o]) * w, y = B.n[o + 1] + (gr[1] - B.n[o + 1]) * w, z = B.n[o + 2] + (gr[2] - B.n[o + 2]) * w;
		const len = Math.hypot(x, y, z) || 1;
		B.n[o] = x / len; B.n[o + 1] = y / len; B.n[o + 2] = z / len;
	}
}

/** Furthest a strand sample is walked out of a bone in one push, mm. */
const BONE_WALK = 40;

/**
 * Point `c` and unit tangent `t` of strand s at `sigma`, and into `out` the tracked side stored at
 * n[o] made perpendicular to t. Returns how far to trust it: 1, falling to 0 as it turns along t.
 */
function side(P: Float64Array, s: number, N: number, sigma: number, n: ArrayLike<number>, o: number, c: number[], t: number[], out: number[]): number {
	const j = Math.min(N - 2, Math.max(0, Math.floor(sigma))), u = sigma - j, a = (s * N + j) * 3;
	c[0] = P[a] + (P[a + 3] - P[a]) * u; c[1] = P[a + 1] + (P[a + 4] - P[a + 1]) * u; c[2] = P[a + 2] + (P[a + 5] - P[a + 2]) * u;
	// tangent blended between the samples' central differences, so it turns smoothly along the strand
	const tan = (i: number, k: number) => P[(s * N + Math.min(N - 1, i + 1)) * 3 + k] - P[(s * N + Math.max(0, i - 1)) * 3 + k];
	let tx = 0, ty = 0, tz = 0;
	for (const [i, w] of [[j, 1 - u], [j + 1, u]]) {
		const x = tan(i, 0), y = tan(i, 1), z = tan(i, 2), l = Math.hypot(x, y, z) || 1;
		tx += (x / l) * w; ty += (y / l) * w; tz += (z / l) * w;
	}
	const tl = Math.hypot(tx, ty, tz) || 1;
	tx /= tl; ty /= tl; tz /= tl;
	t[0] = tx; t[1] = ty; t[2] = tz;
	const nt = n[o] * tx + n[o + 1] * ty + n[o + 2] * tz;
	const x = n[o] - nt * tx, y = n[o + 1] - nt * ty, z = n[o + 2] - nt * tz, l = Math.hypot(x, y, z);
	if (l < 1e-6) return 0;
	out[0] = x / l; out[1] = y / l; out[2] = z / l;
	return smoothstep(0.1, 0.3, l);
}

/** How freely a strand gives at `x` (samples): a·b/(a+b), a and b the samples to its fixed points either side. */
function compliance(anchors: number[], x: number): number {
	let lo = 0, hi = anchors[anchors.length - 1];
	for (const a of anchors) {
		if (a <= x) lo = a;
		else { hi = a; break; }
	}
	const a = x - lo, b = hi - x;
	return a <= 0 || b <= 0 ? 0 : (a * b) / (a + b);
}

/** Samples from `x` to the nearer of its fixed points either side. */
function span(anchors: number[], x: number): number {
	let lo = 0, hi = anchors[anchors.length - 1];
	for (const a of anchors) {
		if (a <= x) lo = a;
		else { hi = a; break; }
	}
	return Math.max(0, Math.min(x - lo, hi - x));
}

/**
 * Move strand s like a taut string pushed at `x` (samples) so the point there moves by (dx, dy, dz):
 * samples between its fixed points either side move in proportion, falling linearly to zero at them.
 */
function tent(P: Float64Array, s: number, N: number, anchors: number[], x: number, dx: number, dy: number, dz: number): void {
	let lo = 0, hi = N - 1;
	for (const a of anchors) {
		if (a <= x) lo = a;
		else { hi = a; break; }
	}
	if (x <= lo || x >= hi) return;
	const w = (i: number) => (i <= x ? (i - lo) / (x - lo) : (hi - i) / (hi - x));
	// the point at x lies between two samples: scale so it moves by the full amount
	const j = Math.floor(x), f = x - j, at = (1 - f) * Math.max(0, w(j)) + f * Math.max(0, w(j + 1));
	const k = 1 / Math.max(0.3, at);
	for (let i = Math.floor(lo) + 1; i < hi; i++) {
		const wi = w(i) * k;
		if (wi <= 0) continue;
		const o = (s * N + i) * 3;
		P[o] += dx * wi; P[o + 1] += dy * wi; P[o + 2] += dz * wi;
	}
}

/**
 * How freely strand s gives (0 … 1) from its point at `x` (samples) in direction sign·n: fully, unless
 * that is toward bone and the strand is back down to its rest clearance there (within 2 mm of it, and
 * within 10 mm of the bone).
 */
function give(m: ContactModel, bones: Rigid[], s: number, x: number, px: number, py: number, pz: number, n: number[], sign: number): number {
	const rc = m.restClear[s], j = Math.min(rc.length - 2, Math.max(0, Math.floor(x))), f = x - j;
	const rest = rc[j] + (rc[j + 1] - rc[j]) * f;
	if (rest >= SDF_FAR - 1) return 1;
	const g = [0, 0, 0], now = boneClear(m.fields, bones, px, py, pz, g);
	if (now >= SDF_FAR - 1) return 1;
	const toward = Math.max(0, -sign * (g[0] * n[0] + g[1] * n[1] + g[2] * n[2]));
	return 1 - toward * (1 - smoothstep(0, 2, now - rest)) * (1 - smoothstep(6, 10, now));
}

/**
 * Distance from the nearest bone (with a field) at world point (x, y, z), and into g the outward
 * normal, blended over bones about as near (so it turns smoothly between two bones).
 */
function boneClear(fields: (SdfGrid | null)[], bones: Rigid[], x: number, y: number, z: number, g: number[] | null): number {
	let best = SDF_FAR;
	const near: [number, number[], number][] = [];
	for (let b = 0; b < fields.length; b++) {
		const F = fields[b];
		if (!F) continue;
		const B = bones[b], l = rotate([-B.q[0], -B.q[1], -B.q[2], B.q[3]], x - B.t[0], y - B.t[1], z - B.t[2]);
		const d = sdfSample(F, l[0], l[1], l[2]);
		if (d >= SDF_FAR - 1) continue;
		near.push([b, l, d]);
		best = Math.min(best, d);
	}
	if (g) {
		g[0] = g[1] = g[2] = 0;
		for (const [b, l, d] of near) {
			const w = 1 - smoothstep(0, 3, d - best);
			const gl = w > 0 ? sdfGradient(fields[b]!, l[0], l[1], l[2]) : null;
			if (!gl) continue;
			const gw = rotate(bones[b].q, gl[0], gl[1], gl[2]);
			g[0] += gw[0] * w; g[1] += gw[1] * w; g[2] += gw[2] * w;
		}
		const gl = Math.hypot(g[0], g[1], g[2]);
		if (gl > 1e-9) { g[0] /= gl; g[1] /= gl; g[2] /= gl; }
	}
	return best;
}

/**
 * Nearest point to (x, y, z) on strand s's samples, searching segments lo … hi; returns it in
 * samples (segment index plus the share along it).
 */
function nearest(P: Float64Array, s: number, N: number, x: number, y: number, z: number, lo: number, hi: number): number {
	let best = Infinity, at = lo;
	for (let j = lo; j <= hi; j++) {
		const a = (s * N + j) * 3;
		const ex = P[a + 3] - P[a], ey = P[a + 4] - P[a + 1], ez = P[a + 5] - P[a + 2], ee = ex * ex + ey * ey + ez * ez;
		const u = ee > 1e-12 ? Math.min(1, Math.max(0, ((x - P[a]) * ex + (y - P[a + 1]) * ey + (z - P[a + 2]) * ez) / ee)) : 0;
		const d = (x - P[a] - ex * u) ** 2 + (y - P[a + 1] - ey * u) ** 2 + (z - P[a + 2] - ez * u) ** 2;
		if (d < best) { best = d; at = j + u; }
	}
	return at;
}

/** Distance over which softNearest blends candidate points, mm. */
const SOFT_NEAREST = 0.5;

/**
 * The point on strand s near (x, y, z), tracked from `from` (samples): a blend of the nearest points
 * of the segments within TRACK samples of it, each weighted by how much nearer it is than the rest
 * and faded out toward the edge of that window. Where two parts of the strand are about equally near
 * it slides from one to the other, and segments enter and leave the window unweighted: no jumps.
 */
function softNearest(P: Float64Array, s: number, N: number, x: number, y: number, z: number, from: number): number {
	let best = Infinity;
	const at: number[] = [], dist: number[] = [];
	const lo = Math.max(0, Math.floor(from) - TRACK - 1), hi = Math.min(N - 2, Math.floor(from) + TRACK + 1);
	for (let j = lo; j <= hi; j++) {
		const a = (s * N + j) * 3;
		const ex = P[a + 3] - P[a], ey = P[a + 4] - P[a + 1], ez = P[a + 5] - P[a + 2], ee = ex * ex + ey * ey + ez * ez;
		const u = ee > 1e-12 ? Math.min(1, Math.max(0, ((x - P[a]) * ex + (y - P[a + 1]) * ey + (z - P[a + 2]) * ez) / ee)) : 0;
		const d = Math.sqrt((x - P[a] - ex * u) ** 2 + (y - P[a + 1] - ey * u) ** 2 + (z - P[a + 2] - ez * u) ** 2);
		at.push(j + u);
		dist.push(d);
		best = Math.min(best, d);
	}
	let sw = 0, sx = 0;
	for (let k = 0; k < at.length; k++) {
		const w = Math.exp(-(dist[k] - best) / SOFT_NEAREST) * (1 - smoothstep(TRACK - 1, TRACK, Math.abs(at[k] - from)));
		sw += w;
		sx += w * at[k];
	}
	return sw > 1e-12 ? sx / sw : from;
}

/**
 * A mesh's extent from strand s at sample `at`, into out[o …]: in EXT_DIRS directions across the
 * strand (angle about its tangent from the frame's y axis toward z), the furthest its vertices there
 * reach within a cone about each, in the strand's frame. False where the mesh doesn't cover it.
 */
function extentTable(b: BoundMesh, s: number, at: number, out: Float64Array, o: number): boolean {
	const N = b.profile.length;
	let any = false;
	for (let v = 0; v < b.nv; v++) {
		const o4 = v * 4;
		if (Math.round(b.path[o4 + 2] + b.path[o4 + 1]) !== s || Math.abs(b.path[o4] * (N - 1) - at) > WINDOW) continue;
		any = true;
		const oy = b.offset[v * 3 + 1], oz = b.offset[v * 3 + 2], l = Math.hypot(oy, oz);
		for (let k = 0; k < EXT_DIRS; k++) {
			const t = (2 * Math.PI * k) / EXT_DIRS, a = oy * Math.cos(t) + oz * Math.sin(t);
			if (a > CONE * l) out[o + k] = Math.max(out[o + k], a);
		}
	}
	return any;
}

/** Extent from a strand's table at `x` (samples) in world direction d, for its frame q there. */
function extentAt(ext: Float64Array, x: number, q: ArrayLike<number>, dx: number, dy: number, dz: number): number {
	const n = ext.length / EXT_DIRS, j = Math.min(n - 2, Math.max(0, Math.floor(x))), fx = Math.min(1, Math.max(0, x - j));
	const d = rotate([-q[0], -q[1], -q[2], q[3]], dx, dy, dz);
	const fa = ((((Math.atan2(d[2], d[1]) / (2 * Math.PI)) * EXT_DIRS) % EXT_DIRS) + EXT_DIRS) % EXT_DIRS;
	const k = Math.floor(fa) % EXT_DIRS, k1 = (k + 1) % EXT_DIRS, fa1 = fa - Math.floor(fa);
	const at = (row: number) => ext[row * EXT_DIRS + k] + (ext[row * EXT_DIRS + k1] - ext[row * EXT_DIRS + k]) * fa1;
	return at(j) + (at(j + 1) - at(j)) * fx;
}

function coverAt(cover: Float64Array, x: number): number {
	const j = Math.min(cover.length - 2, Math.max(0, Math.floor(x))), f = x - j;
	return cover[j] + (cover[j + 1] - cover[j]) * f;
}

/** Quaternion of strand s at `x` (samples), nlerped, into out. */
function lerpQuat(Q: Float64Array, s: number, N: number, x: number, out: number[]): void {
	const j = Math.min(N - 2, Math.max(0, Math.floor(x))), u = x - j, a = (s * N + j) * 4, b = a + 4;
	const sg = Q[a] * Q[b] + Q[a + 1] * Q[b + 1] + Q[a + 2] * Q[b + 2] + Q[a + 3] * Q[b + 3] < 0 ? -1 : 1;
	let l = 0;
	for (let k = 0; k < 4; k++) { out[k] = Q[a + k] + (sg * Q[b + k] - Q[a + k]) * u; l += out[k] * out[k]; }
	l = Math.sqrt(l) || 1;
	for (let k = 0; k < 4; k++) out[k] /= l;
}

function smoothstep(a: number, b: number, x: number): number {
	const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return u * u * (3 - 2 * u);
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** v rotated by unit quaternion q. */
function rotate(q: ArrayLike<number>, x: number, y: number, z: number): number[] {
	const tx = 2 * (q[1] * z - q[2] * y), ty = 2 * (q[2] * x - q[0] * z), tz = 2 * (q[0] * y - q[1] * x);
	return [x + q[3] * tx + q[1] * tz - q[2] * ty, y + q[3] * ty + q[2] * tx - q[0] * tz, z + q[3] * tz + q[0] * ty - q[1] * tx];
}
