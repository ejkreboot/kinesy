/**
 * Baking lines of action (src/core/muscle/baked.ts): each baked strand's reference band (reference.ts),
 * solved on a grid of poses over the joint's bake axes and stored as M points per grid pose.
 *
 * The grid is solved in chains along one axis (the chain axis): a chain's root, its grid pose at that
 * axis's rest angle, is reached by walking the band straight from the rest pose; the chain's other grid
 * poses by walking on from their neighbour nearer the root. So every grid pose has the band a walk from
 * rest gives it, and the band keeps the side of a bone it came round. Chains are independent, so they are
 * shared out among worker threads (bakeWorker.ts, run by scripts/bake.ts).
 *
 * Where interpolating between neighbouring grid poses strays far from a walked band (edge errors), the
 * band went round a different way at one of them, or changes faster than the grid can follow.
 */
import { boneLocal, type LoadedJoint } from './pathcheck';
import { qRotate, type Rigid } from '../../src/core/math';
import { strandKey, withBaked, type BakedAxis, type BakedPaths } from '../../src/core/muscle/baked';
import { isPoint, type JointPaths, type PathPoint } from '../../src/core/muscle/schema';
import type { Pose } from '../../src/core/rig';
import { sdfSample } from '../../src/core/sdf';
import { bandModel, routeContext, touching, walkBand, type BandModel, type RouteContext } from './reference';

/** Points per baked strand. */
export const M = 48;
/** Extra relaxation passes at each grid pose, after the walk there. */
const SETTLE = 120;

export interface BakeAxisSpec {
	joint: string;
	/** grid spacing, degrees (the rest angle is always a grid value) */
	step: number;
}

/** Grid values of a joint: its rest angle, every `step` from it, and its range's ends. */
export function axisValues(J: LoadedJoint, a: BakeAxisSpec): number[] {
	const j = J.rig.joint(a.joint), v = new Set<number>([j.min, j.max, j.restAngle]);
	for (let x = j.restAngle - a.step; x > j.min; x -= a.step) v.add(x);
	for (let x = j.restAngle + a.step; x < j.max; x += a.step) v.add(x);
	return [...v].sort((p, q) => p - q);
}

/** Grid index vector of node n (first axis fastest). */
export function indexOf(axes: BakedAxis[], n: number): number[] {
	return axes.map((a) => {
		const k = n % a.values.length;
		n = Math.floor(n / a.values.length);
		return k;
	});
}

export function nodeOf(axes: BakedAxis[], idx: number[]): number {
	let n = 0, stride = 1;
	axes.forEach((a, d) => { n += idx[d] * stride; stride *= a.values.length; });
	return n;
}

export function nodePose(axes: BakedAxis[], rest: Pose, n: number): Pose {
	const idx = indexOf(axes, n), p: Pose = { ...rest };
	axes.forEach((a, d) => { p[a.joint] = a.values[idx[d]]; });
	return p;
}

/** Chains along axis c: every grid index vector with c left out (-1 there). */
export function chains(axes: BakedAxis[], c: number): number[][] {
	let out: number[][] = [[]];
	axes.forEach((a, d) => {
		out = d === c ? out.map((v) => [...v, -1]) : out.flatMap((v) => a.values.map((_, i) => [...v, i]));
	});
	return out;
}

/** The chain axis: the one with the most grid values (fewest chains, each longest). */
export function chainAxis(axes: BakedAxis[]): number {
	return axes.reduce((best, a, d) => (a.values.length > axes[best].values.length ? d : best), 0);
}

/** Points through the band, resampled to m evenly spaced by arc length. */
export function resampleBand(pts: number[][], m = M): number[][] {
	const arc = [0];
	for (let j = 1; j < pts.length; j++) arc.push(arc[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1], pts[j][2] - pts[j - 1][2]));
	const L = arc[arc.length - 1], out: number[][] = [];
	let j = 1;
	for (let i = 0; i < m; i++) {
		const s = (L * i) / (m - 1);
		while (j < pts.length - 1 && arc[j] < s) j++;
		const span = arc[j] - arc[j - 1], u = span > 1e-12 ? Math.min(1, Math.max(0, (s - arc[j - 1]) / span)) : 0;
		out.push(pts[j - 1].map((v, c) => v + (pts[j][c] - v) * u));
	}
	return out;
}

const flat = (bands: number[][][]) => bands.flatMap((X, k) => (k ? X.slice(1) : X));

/**
 * The joint's paths with the muscles that are obstacles as the bake stands: every muscle with a current
 * bake on it (as `?baked` draws them); muscles marked baked without one drawn straight between their points.
 */
export function obstaclePaths(paths: JointPaths, baked: BakedPaths): JointPaths {
	const now = withBaked(paths, baked);
	const current = (mesh: string, k: number, els: JointPaths['muscles'][number]['strands'][number]) =>
		baked.strands.some((s) => s.mesh === mesh && s.strand === k && s.key === strandKey(els.filter(isPoint) as PathPoint[]));
	return { ...now, muscles: now.muscles.map((d) => (d.baked && !d.strands.every((els, k) => current(d.mesh, k, els)) ? { ...d, baked: false } : d)) };
}

/**
 * The muscles a muscle's strands are kept off: off the muscles of lower layers it touches at rest, except
 * those it lies over (MusclePathDef.over); below the muscles that lie over it (the pectoralis major's tendon
 * under the anterior deltoid, rather than the deltoid off it), touching at rest or not.
 */
export function obstaclesOf(J: LoadedJoint, paths: JointPaths, mesh: string): { beneath: string[]; under: string[] } {
	const def = paths.muscles.find((m) => m.mesh === mesh)!, over = def.over ?? [];
	const under = paths.muscles.filter((m) => m.over?.includes(mesh)).map((m) => m.mesh);
	const lower = paths.muscles.filter((m) => m.layer < def.layer && !over.includes(m.mesh) && !under.includes(m.mesh)).map((m) => m.mesh);
	return { beneath: touching({ J }, mesh, lower), under };
}

/**
 * The order to bake muscles in: in rounds, each muscle after every obstacle of it among them (obstaclesOf), so
 * it is kept off them as they will be drawn.
 */
export function bakeRounds(J: LoadedJoint, paths: JointPaths, meshes: string[]): string[][] {
	const rounds: string[][] = [], done = new Set<string>();
	const deps = new Map(meshes.map((m) => { const c = obstaclesOf(J, paths, m); return [m, [...c.beneath, ...c.under]]; }));
	let left = [...meshes];
	while (left.length) {
		const ready = left.filter((m) => deps.get(m)!.every((o) => !left.includes(o) || o === m));
		if (!ready.length) throw new Error(`muscles that are each other's obstacles: ${left.join(', ')}`);
		rounds.push(ready);
		ready.forEach((m) => done.add(m));
		left = left.filter((m) => !done.has(m));
	}
	return rounds;
}

export interface Which {
	mesh: string;
	k: number;
}

export interface BandState {
	bands: number[][][];
	bones: Rigid[];
}

/**
 * A round's strands (bakeRounds), baked chain by chain. `paths` gives the strands' points and layers;
 * `obstacles` drive the muscles kept off (obstaclePaths). Each strand is kept off the bones throughout, and
 * off its obstacle muscles (obstaclesOf) where it settles at a grid pose (so those are deformed once
 * per grid pose, for all the strands).
 */
export class ChainBaker {
	readonly ctx: RouteContext;
	readonly jobs: { which: Which; fixed: PathPoint[]; model: BandModel; frame: number }[];
	private readonly W0: Rigid[];

	constructor(J: LoadedJoint, paths: JointPaths, obstacles: JointPaths, readonly axes: BakedAxis[], which: Which[], readonly c: number) {
		this.ctx = routeContext(J, obstacles);
		this.W0 = J.rig.solve(this.ctx.restPose);
		this.jobs = which.map((w) => {
			const def = paths.muscles.find((m) => m.mesh === w.mesh)!;
			const fixed = def.strands[w.k].filter(isPoint) as PathPoint[];
			const model = bandModel(this.ctx, w.mesh, fixed, { ...obstaclesOf(J, paths, w.mesh), guide: J.spec.bakeGuide });
			return { which: w, fixed, model, frame: model.bones[model.bones.length - 1] };
		});
		if (axes.some((a) => !a.values.includes(this.ctx.restPose[a.joint]))) throw new Error('every bake axis needs its rest angle as a grid value');
	}

	/** Walk every strand on from `from` (at pose p0) to pose p1 and settle there. */
	private step(from: BandState[], p0: Pose, p1: Pose): BandState[] {
		const out = this.jobs.map((j, k) => {
			const w = walkBand(this.ctx, j.model, from[k].bands.map((X) => X.map((x) => [...x])), p0, p1, from[k].bones, false);
			j.model.relax(w.bands, w.bones, p1, SETTLE);
			return w;
		});
		// the muscles beneath at this pose aren't needed again
		this.ctx.surfaces.clear();
		return out;
	}

	/** Solve a chain (chains()), calling visit with each grid pose's node and every strand's band there. */
	run(chain: number[], visit: (n: number, states: BandState[]) => void): void {
		const { axes, c } = this, rig = this.ctx.J.rig, rest = this.ctx.restPose, vals = axes[c].values;
		const r = vals.indexOf(rest[axes[c].joint]), idx = chain.slice();
		const pose = (i: number) => { idx[c] = i; return rig.clamp(nodePose(axes, rest, nodeOf(axes, idx))); };
		const rootPose = pose(r);
		const root = this.step(this.jobs.map((j) => ({ bands: j.model.rest, bones: this.W0 })), rest, rootPose);
		visit(nodeOf(axes, idx), root);
		for (const dir of [1, -1]) {
			let states = root, prev = rootPose;
			for (let i = r + dir; i >= 0 && i < vals.length; i += dir) {
				const p = pose(i);
				states = this.step(states, prev, p);
				prev = p;
				visit(nodeOf(axes, idx), states);
			}
		}
	}

	/** A band's M points, in its strand's frame bone at its bones, into `out` at node n. */
	store(k: number, s: BandState, n: number, out: Float32Array): void {
		const F = s.bones[this.jobs[k].frame];
		resampleBand(flat(s.bands)).forEach((x, i) => out.set(boneLocal(F, x[0], x[1], x[2]), (n * M + i) * 3));
	}

	/** Per point: the stretch it lies on at rest (bones at its ends) and how far along it, for carrying. */
	carry(k: number): [number, number, number][] {
		const { model } = this.jobs[k];
		const lengths = model.rest.map((X) => X.reduce((L, x, j) => (j ? L + Math.hypot(x[0] - X[j - 1][0], x[1] - X[j - 1][1], x[2] - X[j - 1][2]) : 0), 0));
		const total = lengths.reduce((a, b) => a + b, 0);
		return Array.from({ length: M }, (_, i): [number, number, number] => {
			let s = (total * i) / (M - 1), st = 0;
			while (st < lengths.length - 1 && s > lengths[st]) s -= lengths[st++];
			return [model.bones[st], model.bones[st + 1], Math.min(1, Math.max(0, s / (lengths[st] || 1)))];
		});
	}

	/** How far a band comes inside its clearance from bone, beyond its end ramps: [mm, bone index]. */
	squeeze(k: number, s: BandState): [number, number] {
		const pts = resampleBand(flat(s.bands)), clear = this.jobs[k].model.clear;
		let worst: [number, number] = [0, -1];
		for (let i = 4; i < M - 4; i++)
			this.ctx.fields.forEach((g, b) => {
				if (!g) return;
				const l = boneLocal(s.bones[b], pts[i][0], pts[i][1], pts[i][2]), short = clear - sdfSample(g, l[0], l[1], l[2]);
				if (short > worst[0]) worst = [short, b];
			});
		return worst;
	}

	/**
	 * Interpolation error on the grid edges from node n to its next neighbour along each axis: the bake's
	 * blend of the two (`data`, every node's points) at the edge's middle against the band walked there from
	 * n, the largest point distance, mm. Returns [d, neighbour node] per edge.
	 */
	edgeErrors(n: number, states: BandState[], data: Float32Array[]): { k: number; d: number; m: number }[] {
		const { axes } = this, rig = this.ctx.J.rig, rest = this.ctx.restPose, idx = indexOf(axes, n), out: { k: number; d: number; m: number }[] = [];
		axes.forEach((ax, d) => {
			if (idx[d] + 1 >= ax.values.length) return;
			const j = idx.slice();
			j[d]++;
			const m = nodeOf(axes, j), pa = rig.clamp(nodePose(axes, rest, n));
			const mid = rig.clamp({ ...pa, [ax.joint]: (ax.values[idx[d]] + ax.values[j[d]]) / 2 });
			const walked = this.step(states, pa, mid);
			walked.forEach((s, k) => {
				const F = s.bones[this.jobs[k].frame], D = data[k];
				let worst = 0;
				resampleBand(flat(s.bands)).forEach((x, i) => {
					const o1 = (n * M + i) * 3, o2 = (m * M + i) * 3;
					const r = qRotate(F.q, [(D[o1] + D[o2]) / 2, (D[o1 + 1] + D[o2 + 1]) / 2, (D[o1 + 2] + D[o2 + 2]) / 2]);
					worst = Math.max(worst, Math.hypot(r[0] + F.t[0] - x[0], r[1] + F.t[1] - x[1], r[2] + F.t[2] - x[2]));
				});
				out.push({ k, d: worst, m });
			});
		});
		return out;
	}
}

