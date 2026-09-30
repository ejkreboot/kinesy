/**
 * Centerline deformation, CPU reference. The vertex shader (viewer/muscleShader.ts) runs the same
 * steps on the GPU every frame; this copy exists for validation, tests, and tools, and must be
 * kept in step with it:
 *
 *   1. frame at the vertex's (s, strand pair, blend): positions lerped, quaternions nlerped, each
 *      averaged over a window along the strand as wide as the vertex is far from it (vertexFrame), so
 *      the thick part of a muscle sees a sharp bend rounded and its inner side doesn't fold over;
 *   2. cross-section scaled by 1 + (k − 1)·belly, k the strand's bulge factor; the offset along the
 *      strand scaled by the samples' spacing there (1 at rest), so a shortening belly packs its mesh
 *      as closely as its samples instead of folding the slices over each other;
 *   3. position = center + frame · offset (less the part of the rest drape the strand has let go, see
 *      MusclePathDef.drape); normal = frame · (rest normal under the same scale);
 *   4. near each end, blend toward riding the attachment bone rigidly;
 *   5. kept out of bone distance fields (and, if on, the capsules of muscles in lower layers), only
 *      as far as the vertex is deeper than it sat at rest: back to the surface along the nearest way
 *      out (the distance field's gradient), then out to the margin by a smooth ramp. Keeping muscles on
 *      the right side of a bone is the strands' job (wraps, contact between layers); this only settles
 *      shallow contact. Where the nearest way out is ambiguous it lets go instead, smoothly, so a vertex
 *      never flips from one side of a bone to the other: deep in it (its strand has gone into the bone,
 *      as at the shoulder's extremes; RELEASE), moved far to get out (RELEASE), or near the middle of a
 *      thin part of a bone like the scapular spine, where the gradient taken RIDGE either side shrinks.
 *      Capsules push only muscle belly away from attachments (tendons slide over deep muscles on
 *      bursae).
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

/** How far below its target clearance a vertex must be before it is pushed, mm (float noise). */
const TOUCH = 1e-3;

type Sd = (x: number, y: number, z: number) => number;

/** Depth into an obstacle over which a vertex's push fades out (full, none), mm. */
export const RELEASE: [number, number] = [6, 12];
/** Half-span of the gradient that measures how clear the nearest way out is, mm. */
export const RIDGE = 2.5;
/** Its length (1 away from a midplane) over which the push fades in (none, full). */
export const RIDGE_FADE: [number, number] = [0.3, 0.9];
/** Belly weight over which proxies take hold (tendon: none, belly: full). */
export const PROXY_BELLY: [number, number] = [0.3, 0.6];

function smoothstep(a: number, b: number, x: number): number {
	const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return u * u * (3 - 2 * u);
}

/**
 * Keep point p (updated in place) out of one obstacle with distance function `sd` and unit
 * outward gradient `grad` (false where it has none): back to the surface (or, for a vertex
 * embedded at rest, its rest depth), then out to `target` along the gradient; let go smoothly
 * where that way out is ambiguous (see step 5 above).
 */
export function avoid(sd: Sd, grad: (p: number[], out: number[]) => boolean, p: number[], target: number, soft: number): void {
	let d = sd(p[0], p[1], p[2]);
	if (d >= target - TOUCH) return;
	const g = [0, 0, 0], level = Math.min(target, 0), p0 = [p[0], p[1], p[2]];
	const keep = (1 - smoothstep(RELEASE[0], RELEASE[1], target - d)) * smoothstep(RIDGE_FADE[0], RIDGE_FADE[1], ridge(sd, p));
	if (keep <= 0) return;
	if (d < level) {
		const back = grad(p, g) ? level - d : 0;
		for (let k = 0; k < 3; k++) p[k] += g[k] * back;
		d = sd(p[0], p[1], p[2]);
	}
	const push = pushRamp(target - d, soft);
	if (push > 0 && grad(p, g)) for (let k = 0; k < 3; k++) p[k] += g[k] * push;
	const moved = Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]);
	const w = keep * (1 - smoothstep(RELEASE[0], RELEASE[1], moved));
	if (w < 1) for (let k = 0; k < 3; k++) p[k] = p0[k] + (p[k] - p0[k]) * w;
}

/** Length of the distance function's gradient taken RIDGE either side of p: 1 clear of a midplane, 0 on it. */
function ridge(sd: Sd, p: ArrayLike<number>): number {
	const h = RIDGE, x = p[0], y = p[1], z = p[2];
	return Math.hypot(sd(x + h, y, z) - sd(x - h, y, z), sd(x, y + h, z) - sd(x, y - h, z), sd(x, y, z + h) - sd(x, y, z - h)) / (2 * h);
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

/** Spacing of strand's samples at arc-length share s, over the same at rest (PathSolver.spacing). */
export function strandSpacing(solver: PathSolver, strand: number, s: number): number {
	const N = solver.N, f = Math.min(1, Math.max(0, s)) * (N - 1);
	const i = Math.min(N - 2, Math.floor(f)), u = f - i, o = strand * N + i;
	return solver.spacing[o] + (solver.spacing[o + 1] - solver.spacing[o]) * u;
}

/** Taps of a vertex's frame window: offsets in half-widths, and weights. */
const TAPS: [number, number][] = [[-1, 0.25], [0, 0.5], [1, 0.25]];

/**
 * Frame on one strand averaged over `window` mm either side of share s (TAPS): center into c,
 * quaternion into q; returns the spacing there, averaged the same way.
 */
function windowFrame(solver: PathSolver, strand: number, s: number, window: number, c: Float64Array | number[], q: Float64Array | number[]): number {
	if (window <= 0) {
		strandFrame(solver, strand, s, c, q);
		return strandSpacing(solver, strand, s);
	}
	const d = window / Math.max(1e-6, solver.length[strand]), ct = [0, 0, 0], qt = [0, 0, 0, 1], q0 = [0, 0, 0, 1];
	// the centre's quaternion sets the sign the others are averaged with
	strandFrame(solver, strand, s, ct, q0);
	c[0] = c[1] = c[2] = 0;
	let qx = 0, qy = 0, qz = 0, qw = 0, lam = 0;
	for (const [t, w] of TAPS) {
		const st = s + t * d;
		strandFrame(solver, strand, st, ct, qt);
		const sg = qt[0] * q0[0] + qt[1] * q0[1] + qt[2] * q0[2] + qt[3] * q0[3] < 0 ? -w : w;
		c[0] += ct[0] * w; c[1] += ct[1] * w; c[2] += ct[2] * w;
		qx += qt[0] * sg; qy += qt[1] * sg; qz += qt[2] * sg; qw += qt[3] * sg;
		lam += strandSpacing(solver, strand, st) * w;
	}
	const l = Math.hypot(qx, qy, qz, qw) || 1;
	q[0] = qx / l; q[1] = qy / l; q[2] = qz / l; q[3] = qw / l;
	return lam;
}

/**
 * A vertex's frame: on its strand pair (a, b) blended by `beta`, each averaged over `window` mm
 * either side of share s. Center into c, quaternion into q; returns the bulge factor and spacing.
 */
export function vertexFrame(solver: PathSolver, a: number, b: number, s: number, beta: number, window: number, c: Float64Array | number[], q: Float64Array | number[]): { k: number; spacing: number } {
	let spacing = windowFrame(solver, a, s, window, c, q), k = solver.bulge[a];
	if (a === b || beta <= 0) return { k, spacing };
	const c2 = [0, 0, 0], q2 = [0, 0, 0, 0];
	const sp2 = windowFrame(solver, b, s, window, c2, q2);
	for (let j = 0; j < 3; j++) c[j] += (c2[j] - c[j]) * beta;
	nlerp(q[0], q[1], q[2], q[3], q2[0], q2[1], q2[2], q2[3], beta, q);
	k += (solver.bulge[b] - k) * beta;
	spacing += (sp2 - spacing) * beta;
	return { k, spacing };
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
	const { path, offset, normal, weights, clear, colliders, window, drape } = bound;
	const nCaps = capsules ? Math.min(bound.caps, capsules.length / 8) : 0;
	for (let i = 0; i < bound.nv; i++) {
		const o3 = i * 3, o4 = i * 4;
		const s = path[o4], beta = path[o4 + 1], ra = path[o4 + 2], rb = path[o4 + 3];
		const { k, spacing } = vertexFrame(solver, ra, rb, s, beta, window[i], c, q);
		const gk = 1 + (k - 1) * weights[o4];
		const Q: Quat = [q[0], q[1], q[2], q[3]];
		// the part of the rest drape let go (MusclePathDef.drape)
		const lose = 1 - (solver.drape[ra] + (solver.drape[rb] - solver.drape[ra]) * beta);
		const oy = offset[o3 + 1] - lose * drape[o3 + 1], oz = offset[o3 + 2] - lose * drape[o3 + 2];
		const d = qRotate(Q, [offset[o3] * spacing, oy * gk, oz * gk]);
		let px = c[0] + d[0], py = c[1] + d[1], pz = c[2] + d[2];
		// normals take the inverse transpose of the scaling: along the strand by 1/spacing, across by 1/gk
		let n = qRotate(Q, normalize([(normal[o3] * gk) / spacing, normal[o3 + 1], normal[o3 + 2]]));
		for (const [aw, bone] of [[weights[o4 + 1], strands[ra].originBone], [weights[o4 + 2], strands[ra].insertionBone]]) {
			if (aw <= 0) continue;
			const B = bones[bone];
			const r = qRotate(B.q, [rest[o3], rest[o3 + 1], rest[o3 + 2]]);
			px += (r[0] + B.t[0] - px) * aw; py += (r[1] + B.t[1] - py) * aw; pz += (r[2] + B.t[2] - pz) * aw;
			const rn = qRotate(B.q, [restNormal[o3], restNormal[o3 + 1], restNormal[o3 + 2]]);
			n = normalize([n[0] + (rn[0] - n[0]) * aw, n[1] + (rn[1] - n[1]) * aw, n[2] + (rn[2] - n[2]) * aw]);
		}
		// collisions, in each obstacle's frame
		const p = [px, py, pz];
		for (let pass = 0; pass < opts.passes; pass++) {
			for (let slot = 0; slot < 4; slot++) {
				const b = colliders[slot], G = b >= 0 ? fields[b] : null;
				if (!G) continue;
				const B = bones[b], l = boneLocal(B, p[0], p[1], p[2]);
				if (sdfSample(G, l[0], l[1], l[2]) >= SDF_FAR - 1) continue;
				avoid((x, y, z) => sdfSample(G, x, y, z), (v, out) => {
					const gr = sdfGradient(G, v[0], v[1], v[2]);
					if (gr) { out[0] = gr[0]; out[1] = gr[1]; out[2] = gr[2]; }
					return !!gr;
				}, l, Math.min(clear[o4 + slot], opts.margin), opts.soft);
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
					}, p, Math.min(weights[o4 + 3], opts.margin), opts.soft);
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
