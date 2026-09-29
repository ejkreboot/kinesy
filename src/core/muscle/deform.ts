/**
 * Centerline deformation, CPU reference. The vertex shader (viewer/muscleShader.ts) runs the same
 * steps on the GPU every frame; this copy exists for validation, tests, and tools, and must be
 * kept in step with it:
 *
 *   1. frame at the vertex's (s, strand pair, blend): positions lerped, quaternions nlerped;
 *   2. cross-section scaled by 1 + (k − 1)·belly, k the strand's bulge factor;
 *   3. position = center + frame · offset; normal = frame · (rest normal under the same scale);
 *   4. near each end, blend toward riding the attachment bone rigidly;
 *   5. kept out of bone distance fields and the capsules of muscles in lower layers, only as far
 *      as the vertex is deeper than it sat at rest. The nearest way out (the distance field's
 *      gradient) is right unless the vertex has gone past a bone's midline, where it points to the
 *      far side and the vertex would snap through. So a vertex that lay against a bone at rest, is
 *      now deep in it, and whose nearest way out is not the side it lay on, instead walks back out
 *      along that side: its side of first contact, recorded at rest in its own frame so it turns
 *      with the muscle as the bone moves beneath. The two are blended on depth, disagreement and
 *      rest distance, and a smooth ramp keeps the margin, so every step is continuous and nothing
 *      snaps. Capsules are convex and use their gradient; they push only muscle belly away from
 *      attachments (tendons slide over deep muscles on bursae).
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import { qRotate, type Quat, type Rigid, type Vec3 } from '../math';
import { sdfGradient, sdfSample, SDF_FAR } from '../sdf';
import type { SdfGrid } from '../types';
import type { BoundMesh } from './bind';
import type { PathSolver } from './path';

export interface CollideOptions {
	/** clearance kept from bones and proxies, mm */
	margin: number;
	/** width of the smooth start of a push, mm (pushes stop this much short of the margin) */
	soft: number;
	/** push passes */
	passes: number;
}

export const DEFAULT_COLLIDE_OPTIONS: CollideOptions = { margin: 1.2, soft: 0.4, passes: 2 };

/** Steps when walking out of an obstacle, then bisection steps (the shader uses the same counts). */
export const TRACE_STEPS = 16;
export const BISECT_STEPS = 5;
/** Smallest walking step, mm (bisection refines it). */
const TRACE_MIN = 0.5;
/** Furthest a vertex walks out of an obstacle, mm (more than any bone is thick). */
export const WALK_MAX = 80;
/** How far below its target clearance a vertex must be before it is pushed, mm (float noise). */
const TOUCH = 1e-3;

type Sd = (x: number, y: number, z: number) => number;
const NO_EXIT = [0, 0, 0];

/** Distance to walk from `p` along unit `dir` (at most WALK_MAX) until `sd` rises to `level`. */
export function walkOut(sd: Sd, p: ArrayLike<number>, dir: ArrayLike<number>, level: number): number {
	const at = (t: number) => sd(p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t) - level;
	let lo = 0, t = 0;
	for (let k = 0; k < TRACE_STEPS; k++) {
		const d = at(t);
		if (d >= 0) {
			let hi = t;
			for (let b = 0; b < BISECT_STEPS && hi > lo; b++) {
				const mid = (lo + hi) / 2;
				if (at(mid) >= 0) hi = mid;
				else lo = mid;
			}
			return hi;
		}
		lo = t;
		if (t >= WALK_MAX) return WALK_MAX;
		t = Math.min(WALK_MAX, t + Math.max(-d, TRACE_MIN));
	}
	return t;
}

/** Depth past which a vertex may use its exit direction instead of the nearest way out, mm (from, to). */
export const EXIT_DEPTH: [number, number] = [1, 3];
/** Rest clearance within which a vertex's exit direction is trusted, mm (fully, not at all). */
export const EXIT_NEAR: [number, number] = [4, 8];
/** Belly weight over which proxies take hold (tendon: none, belly: full). */
export const PROXY_BELLY: [number, number] = [0.3, 0.6];

function smoothstep(a: number, b: number, x: number): number {
	const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return u * u * (3 - 2 * u);
}

/**
 * Keep point p (updated in place) out of one obstacle with distance function `sd` and unit
 * outward gradient `grad` (false where it has none): back to the surface (or, for a vertex
 * embedded at rest, its rest depth), then out to `target` along the gradient. `e`: the vertex's
 * exit direction (unit, or zero for none) and `rest` its rest clearance, which decide when it
 * leaves along e rather than the nearest way (see step 5 above).
 */
export function avoid(sd: Sd, grad: (p: number[], out: number[]) => boolean, p: number[], e: ArrayLike<number>, rest: number, target: number, soft: number): void {
	let d = sd(p[0], p[1], p[2]);
	if (d >= target - TOUCH) return;
	const g = [0, 0, 0], level = Math.min(target, 0);
	if (d < level) {
		const back = grad(p, g) ? level - d : 0;
		const pg = [p[0] + g[0] * back, p[1] + g[1] * back, p[2] + g[2] * back];
		const hasE = e[0] !== 0 || e[1] !== 0 || e[2] !== 0;
		const w = hasE
			? smoothstep(EXIT_DEPTH[0], EXIT_DEPTH[1], level - d) *
				smoothstep(0.2, -0.2, g[0] * e[0] + g[1] * e[1] + g[2] * e[2]) *
				(1 - smoothstep(EXIT_NEAR[0], EXIT_NEAR[1], rest))
			: 0;
		if (w > 0) {
			const t = walkOut(sd, p, e, level);
			for (let k = 0; k < 3; k++) p[k] = pg[k] + (p[k] + e[k] * t - pg[k]) * w;
		} else for (let k = 0; k < 3; k++) p[k] = pg[k];
		d = sd(p[0], p[1], p[2]);
	}
	const push = pushRamp(target - d, soft);
	if (push > 0 && grad(p, g)) for (let k = 0; k < 3; k++) p[k] += g[k] * push;
}

/** Capsules: 8 floats each, a.xyz, radius at a, b.xyz, radius at b. */
export type CapsuleArray = Float32Array;

/**
 * Frame on one strand at arc-length share s: center into c, quaternion into q; returns the bulge
 * factor.
 */
export function strandFrame(solver: PathSolver, strand: number, s: number, c: Float64Array | number[], q: Float64Array | number[]): number {
	const N = solver.N, f = Math.min(1, Math.max(0, s)) * (N - 1);
	const i = Math.min(N - 2, Math.floor(f)), u = f - i;
	const P = solver.pos, Q = solver.quat, a = (strand * N + i) * 3, b = a + 3, qa = (strand * N + i) * 4, qb = qa + 4;
	c[0] = P[a] + (P[b] - P[a]) * u;
	c[1] = P[a + 1] + (P[b + 1] - P[a + 1]) * u;
	c[2] = P[a + 2] + (P[b + 2] - P[a + 2]) * u;
	nlerp(Q[qa], Q[qa + 1], Q[qa + 2], Q[qa + 3], Q[qb], Q[qb + 1], Q[qb + 2], Q[qb + 3], u, q);
	return solver.bulge[strand];
}

/** Frame blended between two strands (a, b) by `beta`. Returns the bulge factor. */
export function blendedFrame(solver: PathSolver, a: number, b: number, s: number, beta: number, c: Float64Array | number[], q: Float64Array | number[]): number {
	const k = strandFrame(solver, a, s, c, q);
	if (a === b || beta <= 0) return k;
	const c2 = [0, 0, 0], q2 = [0, 0, 0, 0];
	const k2 = strandFrame(solver, b, s, c2, q2);
	for (let j = 0; j < 3; j++) c[j] += (c2[j] - c[j]) * beta;
	nlerp(q[0], q[1], q[2], q[3], q2[0], q2[1], q2[2], q2[3], beta, q);
	return k + (k2 - k) * beta;
}

/** Normalized lerp of two quaternions, taking the shorter way. */
function nlerp(ax: number, ay: number, az: number, aw: number, bx: number, by: number, bz: number, bw: number, u: number, out: Float64Array | number[]): void {
	if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
	const x = ax + (bx - ax) * u, y = ay + (by - ay) * u, z = az + (bz - az) * u, w = aw + (bw - aw) * u;
	const l = Math.hypot(x, y, z, w) || 1;
	out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = w / l;
}

/** Smooth ramp: 0 up to 0, x²/(4w) up to 2w, then x − w. C1. */
export function pushRamp(x: number, w: number): number {
	if (x <= 0) return 0;
	return x < 2 * w ? (x * x) / (4 * w) : x - w;
}

/** Signed distance to a tapered capsule and its unit outward direction (into g). */
export function capsuleDistance(C: ArrayLike<number>, o: number, px: number, py: number, pz: number, g: number[]): number {
	const ax = C[o], ay = C[o + 1], az = C[o + 2], ra = C[o + 3], bx = C[o + 4], by = C[o + 5], bz = C[o + 6], rb = C[o + 7];
	const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez;
	const h = ee > 1e-12 ? Math.min(1, Math.max(0, ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / ee)) : 0;
	const dx = px - (ax + ex * h), dy = py - (ay + ey * h), dz = pz - (az + ez * h);
	const l = Math.hypot(dx, dy, dz);
	if (l > 1e-9) { g[0] = dx / l; g[1] = dy / l; g[2] = dz / l; } else { g[0] = 0; g[1] = 0; g[2] = 0; }
	return l - (ra + (rb - ra) * h);
}

function boneLocal(b: Rigid, x: number, y: number, z: number): Vec3 {
	const qi: Quat = [-b.q[0], -b.q[1], -b.q[2], b.q[3]];
	return qRotate(qi, [x - b.t[0], y - b.t[1], z - b.t[2]]);
}

/**
 * Deform a bound mesh at the solver's last pose. `rest`/`restNormal`: the mesh's rest positions
 * and unit normals. `capsules`: the proxies, lower layers first (the mesh uses its first bound.caps).
 */
export function deformMesh(
	solver: PathSolver, bound: BoundMesh, rest: Float32Array, restNormal: Float32Array, fields: (SdfGrid | null)[],
	capsules: CapsuleArray | null, opts: CollideOptions, outP: Float32Array, outN?: Float32Array
): void {
	const bones = solver.bones, strands = solver.strands;
	const c = [0, 0, 0], q = [0, 0, 0, 1], g = [0, 0, 0];
	const { path, offset, normal, weights, clear, colliders } = bound;
	const nCaps = capsules ? Math.min(bound.caps, capsules.length / 8) : 0;
	for (let i = 0; i < bound.nv; i++) {
		const o3 = i * 3, o4 = i * 4;
		const s = path[o4], beta = path[o4 + 1], ra = path[o4 + 2], rb = path[o4 + 3];
		const k = blendedFrame(solver, ra, rb, s, beta, c, q);
		const gk = 1 + (k - 1) * weights[o4];
		const Q: Quat = [q[0], q[1], q[2], q[3]];
		const d = qRotate(Q, [offset[o3], offset[o3 + 1] * gk, offset[o3 + 2] * gk]);
		let px = c[0] + d[0], py = c[1] + d[1], pz = c[2] + d[2];
		let n = qRotate(Q, normalize([normal[o3] * gk, normal[o3 + 1], normal[o3 + 2]]));
		for (const [aw, bone] of [[weights[o4 + 1], strands[ra].originBone], [weights[o4 + 2], strands[ra].insertionBone]]) {
			if (aw <= 0) continue;
			const B = bones[bone];
			const r = qRotate(B.q, [rest[o3], rest[o3 + 1], rest[o3 + 2]]);
			px += (r[0] + B.t[0] - px) * aw; py += (r[1] + B.t[1] - py) * aw; pz += (r[2] + B.t[2] - pz) * aw;
			const rn = qRotate(B.q, [restNormal[o3], restNormal[o3 + 1], restNormal[o3 + 2]]);
			n = normalize([n[0] + (rn[0] - n[0]) * aw, n[1] + (rn[1] - n[1]) * aw, n[2] + (rn[2] - n[2]) * aw]);
		}
		// collisions, in each obstacle's frame, leaving along the exit directions (turned with the frame)
		const p = [px, py, pz], ex = bound.exit, o12 = i * 12;
		const exitDir = (k: number): Vec3 => {
			const v: Vec3 = [ex[o12 + k * 3], ex[o12 + k * 3 + 1], ex[o12 + k * 3 + 2]];
			return v[0] === 0 && v[1] === 0 && v[2] === 0 ? v : qRotate(Q, v);
		};
		for (let pass = 0; pass < opts.passes; pass++) {
			for (let slot = 0; slot < 4; slot++) {
				const b = colliders[slot], G = b >= 0 ? fields[b] : null;
				if (!G) continue;
				const B = bones[b], l = boneLocal(B, p[0], p[1], p[2]);
				if (sdfSample(G, l[0], l[1], l[2]) >= SDF_FAR - 1) continue;
				const e = exitDir(slot), el = e[0] === 0 && e[1] === 0 && e[2] === 0 ? e : qRotate([-B.q[0], -B.q[1], -B.q[2], B.q[3]], e);
				avoid((x, y, z) => sdfSample(G, x, y, z), (v, out) => {
					const gr = sdfGradient(G, v[0], v[1], v[2]);
					if (gr) { out[0] = gr[0]; out[1] = gr[1]; out[2] = gr[2]; }
					return !!gr;
				}, l, el, clear[o4 + slot], Math.min(clear[o4 + slot], opts.margin), opts.soft);
				const w = qRotate(B.q, l);
				p[0] = w[0] + B.t[0]; p[1] = w[1] + B.t[1]; p[2] = w[2] + B.t[2];
			}
			// tendons slide over the muscles beneath (on bursae) and attachments hold their place: proxies push
			// the belly only
			const tb = smoothstep(PROXY_BELLY[0], PROXY_BELLY[1], weights[o4]) * (1 - Math.max(weights[o4 + 1], weights[o4 + 2]));
			if (tb > 0) {
				const q0 = [p[0], p[1], p[2]];
				for (let cap = 0; cap < nCaps; cap++) {
					const o = cap * 8;
					avoid((x, y, z) => capsuleDistance(capsules!, o, x, y, z, g), (v, out) => {
						capsuleDistance(capsules!, o, v[0], v[1], v[2], out);
						return out[0] !== 0 || out[1] !== 0 || out[2] !== 0;
					}, p, NO_EXIT, SDF_FAR, Math.min(weights[o4 + 3], opts.margin), opts.soft);
				}
				for (let k = 0; k < 3; k++) p[k] = q0[k] + (p[k] - q0[k]) * tb;
			}
		}
		px = p[0]; py = p[1]; pz = p[2];
		outP[o3] = px; outP[o3 + 1] = py; outP[o3 + 2] = pz;
		if (outN) { outN[o3] = n[0]; outN[o3 + 1] = n[1]; outN[o3 + 2] = n[2]; }
	}
}

function normalize(v: number[]): Vec3 {
	const l = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
}
