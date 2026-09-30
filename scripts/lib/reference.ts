/**
 * Reference lines of action, for routing muscles with less hand tuning. A strand's reference is the
 * taut string between its fixed points (origin, via points, insertion) that stays off every bone and
 * off the muscles that lie beneath it, by the muscle's own half-thickness: where the line of action
 * runs through the belly, clear of what the belly lies on. It says what a path's wraps should achieve,
 * so candidate paths can be judged by how far they stray from it and how much longer or shorter they
 * are (route.ts), rather than by eye.
 *
 * It is found offline by relaxing an elastic band (shorten, then push out of every obstacle) while
 * walking from the rest pose in small steps, the band's inner points carried along by blending the
 * motions of the bones at the stretch's two ends. A small step never takes a point deep into an
 * obstacle, so the push is always toward the side the band came from and it can't tunnel through a
 * bone the way a nearest-way-out push at runtime would.
 *
 *   - Bones: their distance fields; hollow ones (the rib cage) filled (solid.ts).
 *   - Muscles beneath (found at rest: in contact, and nearer bone there): their meshes as deformed at
 *     each step by whatever drives them (paths or the old deformer), a signed distance from the
 *     nearest vertex along its normal.
 *   - Clearance: the half-thickness from bone and from the muscles beneath, but never more than the
 *     band had at rest, and none at the attachments.
 *
 * Limits: in a gap narrower than the clearance (a joint space) the band is squeezed, not routed; a
 * muscle's thickness is one number (the median over its mesh), not measured toward each obstacle.
 */
import { Deformer } from '../../src/core/deformer';
import { qRotate, type Rigid, type Vec3 } from '../../src/core/math';
import { vertexNormals } from '../../src/core/muscle/bind';
import type { PathSolver } from '../../src/core/muscle/path';
import type { PathPoint } from '../../src/core/muscle/schema';
import { MuscleSystem } from '../../src/core/muscle/system';
import type { Pose } from '../../src/core/rig';
import { sdfGradient, sdfSample, SDF_FAR } from '../../src/core/sdf';
import type { SdfGrid } from '../../src/core/types';
import { boneLocal, type LoadedJoint } from './pathcheck';
import { solidField } from './solid';

/** Largest joint angle change per step of the walk from rest, degrees. */
const STEP = 3;
/** Band points per stretch between fixed points. */
const POINTS = 24;
/** Relaxation passes per step, and at the end of the walk. */
const PASSES = [40, 400];
/** Arc length from each end of the strand over which the clearance ramps up from none, mm. */
const END_RAMP = 8;
/** Furthest a point is pushed out in one pass, mm. */
const PUSH = 1.5;
/** A muscle counts as touching another where this many of its vertices lie within CONTACT mm of the other's. */
const CONTACT = 2, CONTACT_COUNT = 30;
/** Cell size of the vertex hash for muscle obstacles, mm. */
const CELL = 6;

export interface RouteContext {
	J: LoadedJoint;
	/** bone fields, hollow ones filled */
	fields: (SdfGrid | null)[];
	/** the joint's path-driven muscles */
	system: MuscleSystem;
	deformer: Deformer;
	restPose: Pose;
	/** deformed muscle surfaces by pose, shared by every reference made in this context */
	surfaces: Surfaces;
}

export function routeContext(J: LoadedJoint): RouteContext {
	const solid = new Set(J.spec.solid ?? []);
	const ctx = {
		J,
		fields: J.assets.fields.map((g, b) => (g && solid.has(J.manifest.bones[b]) ? solidField(g) : g)),
		system: new MuscleSystem(J.spec.paths, J.assets, J.rig),
		deformer: new Deformer(J.assets, J.rig),
		restPose: Object.fromEntries(J.rig.def.joints.map((j) => [j.id, j.restAngle]))
	} as RouteContext;
	ctx.surfaces = new Surfaces(ctx);
	return ctx;
}

/** Signed distance to the nearest bone (fields in `ctx`) from world point x at `bones`, and that bone. */
export function boneClearance(ctx: RouteContext, bones: Rigid[], x: ArrayLike<number>): { d: number; bone: number } {
	let d = SDF_FAR, bone = -1;
	ctx.fields.forEach((g, b) => {
		if (!g) return;
		const l = boneLocal(bones[b], x[0], x[1], x[2]), v = sdfSample(g, l[0], l[1], l[2]);
		if (v < d) { d = v; bone = b; }
	});
	return { d, bone };
}

/**
 * A muscle's half-thickness: from each vertex, the distance to the nearest vertex on the opposite side
 * of the mesh (normals facing away from each other), halved, the median over the mesh, mm. A sheet's
 * thickness, a round belly's radius.
 */
export function halfThickness(ctx: RouteContext, mesh: string): number {
	const m = ctx.J.assets.muscles.find((x) => x.name === mesh)!, R = m.rest, N = vertexNormals(R, m.index, m.nv);
	const hash = VertexHash.of(R, CELL), out: number[] = [];
	for (let i = 0; i < m.nv; i += 7) {
		const d = hash.nearestWhere([R[i * 3], R[i * 3 + 1], R[i * 3 + 2]], 60, (j) => N[i * 3] * N[j * 3] + N[i * 3 + 1] * N[j * 3 + 1] + N[i * 3 + 2] * N[j * 3 + 2] < -0.5);
		if (d < Infinity) out.push(d / 2);
	}
	out.sort((a, b) => a - b);
	return out[out.length >> 1] ?? 4;
}

/**
 * Muscles beneath `mesh`: those it touches at rest (CONTACT_COUNT of its vertices within CONTACT mm of
 * theirs) whose centre is nearer bone than its own where they touch.
 */
export function musclesBeneath(ctx: RouteContext, mesh: string): string[] {
	const { assets } = ctx.J, bones = ctx.J.rig.solve(ctx.restPose);
	const A = assets.muscles.find((m) => m.name === mesh)!;
	const hashA = VertexHash.of(A.rest, CELL);
	const centreClear = (m: typeof A, p: ArrayLike<number>) => {
		// the centreline bin nearest p, and its clearance from bone
		let best = Infinity, c: Vec3 = [0, 0, 0];
		for (const b of m.centerline.C) { const d = Math.hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]); if (d < best) { best = d; c = b; } }
		return boneClearance(ctx, bones, c).d;
	};
	const out: string[] = [];
	for (const B of assets.muscles) {
		if (B.name === mesh) continue;
		let touch = 0, deeper = 0;
		for (let i = 0; i < B.nv; i++) {
			const p = [B.rest[i * 3], B.rest[i * 3 + 1], B.rest[i * 3 + 2]], a = hashA.nearest(p, CONTACT);
			if (a < 0) continue;
			touch++;
			if (touch % 5 === 0) deeper += centreClear(B, p) < centreClear(A, [A.rest[a * 3], A.rest[a * 3 + 1], A.rest[a * 3 + 2]]) ? 1 : -1;
		}
		if (touch >= CONTACT_COUNT && deeper > 0) out.push(B.name);
	}
	return out;
}

/** Deformed surfaces of muscles at poses (positions, normals, vertex hash), cached by pose. */
export class Surfaces {
	private readonly cache = new Map<string, Map<string, { P: Float32Array; N: Float32Array; hash: VertexHash }>>();
	constructor(private readonly ctx: RouteContext) {}

	at(pose: Pose, meshes: string[]): Map<string, { P: Float32Array; N: Float32Array; hash: VertexHash }> {
		const key = JSON.stringify(Object.entries(pose).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
		let got = this.cache.get(key);
		if (got && meshes.every((m) => got!.has(m))) return got;
		got = got ?? new Map();
		const { system, deformer, J } = this.ctx, need = meshes.filter((m) => !got!.has(m));
		const onPaths = need.filter((m) => system.has(m)), old = need.filter((m) => !system.has(m));
		const out: Record<string, Float32Array> = {};
		if (onPaths.length) system.update(pose);
		for (const m of onPaths) { out[m] = new Float32Array(system.meshes.find((x) => x.name === m)!.nv * 3); system.deform(m, out[m]); }
		if (old.length) {
			const rec = Object.fromEntries(old.map((m) => [m, new Float32Array(J.assets.muscles.find((x) => x.name === m)!.nv * 3)]));
			deformer.update(pose, rec);
			Object.assign(out, rec);
		}
		for (const m of need) {
			const mesh = J.assets.muscles.find((x) => x.name === m)!;
			got.set(m, { P: out[m], N: vertexNormals(out[m], mesh.index, mesh.nv), hash: VertexHash.of(out[m], CELL) });
		}
		if (this.cache.size > 20000) this.cache.clear();
		this.cache.set(key, got);
		return got;
	}
}

export interface Band {
	/** world points from the strand's first fixed point to its last */
	pts: number[][];
	length: number;
	/** band points within the clearance (+0.5 mm) of an obstacle: the bone index or muscle name, and the point in that bone's frame (muscles: world) */
	contacts: { on: number | string; local: Vec3 }[];
}

export interface ReferenceOptions {
	/** clearance from obstacles, mm; default the muscle's half-thickness */
	clear?: number;
	/** muscles to keep off; default those beneath it (musclesBeneath) */
	beneath?: string[];
}

/** The reference of one strand (its fixed points in order), as a function of the pose. */
export function makeReference(ctx: RouteContext, mesh: string, fixed: PathPoint[], opts: ReferenceOptions = {}): (pose: Pose) => Band {
	const { J } = ctx, bi = (n: string) => J.manifest.bones.indexOf(n);
	const clear = opts.clear ?? halfThickness(ctx, mesh);
	const beneath = opts.beneath ?? musclesBeneath(ctx, mesh);
	const surfaces = ctx.surfaces;
	const world = (b: Rigid, p: ArrayLike<number>): number[] => { const r = qRotate(b.q, [p[0], p[1], p[2]]); return [r[0] + b.t[0], r[1] + b.t[1], r[2] + b.t[2]]; };
	const flat = (bands: number[][][]) => bands.flatMap((X, k) => (k ? X.slice(1) : X));
	// clearance per band point: ramped from none at the strand's ends; from each muscle, capped at rest
	let needMuscle: Map<string, Float64Array> | null = null;
	const ramp = (bands: number[][][]) => {
		const pts = flat(bands), arc = [0];
		for (let j = 1; j < pts.length; j++) arc.push(arc[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1], pts[j][2] - pts[j - 1][2]));
		const L = arc[arc.length - 1];
		return arc.map((a) => Math.min(1, Math.min(a, L - a) / END_RAMP));
	};
	function relax(bands: number[][][], bones: Rigid[], pose: Pose, passes: number) {
		const surf = beneath.length && needMuscle ? surfaces.at(pose, beneath) : null;
		for (let it = 0; it < passes; it++) {
			const r = ramp(bands);
			let idx = 0;
			bands.forEach((X, k) => {
				for (let j = 1; j < X.length - 1; j++) for (let c = 0; c < 3; c++) X[j][c] += 0.5 * ((X[j - 1][c] + X[j + 1][c]) / 2 - X[j][c]);
				for (let j = 0; j < X.length; j++, idx++) {
					if ((k && j === 0) || j === 0 || j === X.length - 1) continue;
					const x = X[j], need = clear * r[idx];
					ctx.fields.forEach((g, b) => {
						if (!g) return;
						const l = boneLocal(bones[b], x[0], x[1], x[2]), d = sdfSample(g, l[0], l[1], l[2]);
						if (d >= need || d >= SDF_FAR - 1) return;
						const gr = sdfGradient(g, l[0], l[1], l[2]);
						if (!gr) return;
						const w = qRotate(bones[b].q, gr), s = Math.min(PUSH, need - d);
						for (let c = 0; c < 3; c++) x[c] += w[c] * s;
					});
					if (surf) for (const m of beneath) {
						const S = surf.get(m)!, nm = Math.min(need, needMuscle!.get(m)![idx]);
						const v = S.hash.nearest(x, nm + CELL);
						if (v < 0) continue;
						const n = [S.N[v * 3], S.N[v * 3 + 1], S.N[v * 3 + 2]];
						const sd = (x[0] - S.P[v * 3]) * n[0] + (x[1] - S.P[v * 3 + 1]) * n[1] + (x[2] - S.P[v * 3 + 2]) * n[2];
						if (sd >= nm) continue;
						const s = Math.min(PUSH, nm - sd);
						for (let c = 0; c < 3; c++) x[c] += n[c] * s;
					}
				}
			});
		}
	}
	// rest: straight stretches relaxed off bone, then the clearance each muscle beneath allows (what it had)
	const W0 = J.rig.solve(ctx.restPose);
	const rest = fixed.slice(1).map((f, k) => {
		const A = world(W0[bi(fixed[k].bone)], fixed[k].p), B = world(W0[bi(f.bone)], f.p);
		return Array.from({ length: POINTS }, (_, j) => A.map((v, c) => v + ((B[c] - v) * j) / (POINTS - 1)));
	});
	relax(rest, W0, ctx.restPose, 800);
	if (beneath.length) {
		const surf = surfaces.at(ctx.restPose, beneath), pts = flat(rest);
		needMuscle = new Map(beneath.map((m) => {
			const S = surf.get(m)!;
			return [m, Float64Array.from(pts, (x) => {
				const v = S.hash.nearest(x, clear + CELL);
				if (v < 0) return clear;
				const sd = (x[0] - S.P[v * 3]) * S.N[v * 3] + (x[1] - S.P[v * 3 + 1]) * S.N[v * 3 + 1] + (x[2] - S.P[v * 3 + 2]) * S.N[v * 3 + 2];
				return Math.max(0, Math.min(clear, sd));
			})];
		}));
		relax(rest, W0, ctx.restPose, 200);
	}
	return (pose: Pose): Band => {
		const target = J.rig.clamp(pose);
		const steps = Math.max(1, Math.ceil(Math.max(0, ...Object.keys(target).map((k) => Math.abs(target[k] - ctx.restPose[k]))) / STEP));
		let W = W0, bands = rest.map((X) => X.map((x) => [...x])), q: Pose = ctx.restPose;
		for (let s = 1; s <= steps; s++) {
			q = {};
			for (const id in ctx.restPose) q[id] = ctx.restPose[id] + (target[id] - ctx.restPose[id]) * (s / steps);
			q = J.rig.clamp(q);
			const Wn = J.rig.solve(q);
			bands = bands.map((X, k) => {
				const ba = bi(fixed[k].bone), bb = bi(fixed[k + 1].bone);
				return X.map((x, j) => {
					if (j === 0) return world(Wn[ba], fixed[k].p);
					if (j === X.length - 1) return world(Wn[bb], fixed[k + 1].p);
					const u = j / (X.length - 1), pa = world(Wn[ba], boneLocal(W[ba], x[0], x[1], x[2])), pb = world(Wn[bb], boneLocal(W[bb], x[0], x[1], x[2]));
					return pa.map((v, c) => v + (pb[c] - v) * u);
				});
			});
			relax(bands, Wn, q, s === steps ? PASSES[1] : PASSES[0]);
			W = Wn;
		}
		const pts = flat(bands), contacts: Band['contacts'] = [];
		const surf = beneath.length ? surfaces.at(q, beneath) : null;
		for (const x of pts) {
			ctx.fields.forEach((g, b) => {
				if (!g) return;
				const l = boneLocal(W[b], x[0], x[1], x[2]);
				if (sdfSample(g, l[0], l[1], l[2]) < clear + 0.5) contacts.push({ on: b, local: l });
			});
			if (surf) for (const m of beneath) if (surf.get(m)!.hash.nearest(x, clear + 0.5) >= 0) contacts.push({ on: m, local: [x[0], x[1], x[2]] });
		}
		let length = 0;
		for (let j = 1; j < pts.length; j++) length += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1], pts[j][2] - pts[j - 1][2]);
		return { pts, length, contacts };
	};
}

/** How a solved strand compares with its reference: largest and mean distance of its samples from the band (mm), and its length over the band's. */
export function deviation(solver: PathSolver, strand: number, band: Band): { max: number; mean: number; ratio: number } {
	const N = solver.N;
	let max = 0, mean = 0;
	for (let i = 0; i < N; i++) {
		const o = (strand * N + i) * 3, d = distToPolyline(solver.pos[o], solver.pos[o + 1], solver.pos[o + 2], band.pts);
		max = Math.max(max, d);
		mean += d / N;
	}
	return { max, mean, ratio: solver.length[strand] / band.length };
}

function distToPolyline(px: number, py: number, pz: number, P: number[][]): number {
	let best = Infinity;
	for (let j = 1; j < P.length; j++) {
		const a = P[j - 1], ex = P[j][0] - a[0], ey = P[j][1] - a[1], ez = P[j][2] - a[2], ee = ex * ex + ey * ey + ez * ez;
		const t = ee > 1e-12 ? Math.min(1, Math.max(0, ((px - a[0]) * ex + (py - a[1]) * ey + (pz - a[2]) * ez) / ee)) : 0;
		best = Math.min(best, Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t, pz - a[2] - ez * t));
	}
	return best;
}

/** Uniform-grid hash of points for nearest-point queries within a radius. */
class VertexHash {
	private constructor(private readonly P: ArrayLike<number>, private readonly cell: number, private readonly map: Map<string, number[]>) {}

	static of(P: ArrayLike<number>, cell: number): VertexHash {
		const map = new Map<string, number[]>();
		for (let i = 0; i < P.length / 3; i++) {
			const k = `${Math.floor(P[i * 3] / cell)},${Math.floor(P[i * 3 + 1] / cell)},${Math.floor(P[i * 3 + 2] / cell)}`;
			(map.get(k) ?? map.set(k, []).get(k)!).push(i);
		}
		return new VertexHash(P, cell, map);
	}

	/** Distance to the nearest point within r of x for which `ok` holds (Infinity for none). */
	nearestWhere(x: ArrayLike<number>, r: number, ok: (i: number) => boolean): number {
		const c = this.cell, n = Math.ceil(r / c), cx = Math.floor(x[0] / c), cy = Math.floor(x[1] / c), cz = Math.floor(x[2] / c), P = this.P;
		let best = r * r;
		for (let i = cx - n; i <= cx + n; i++) for (let j = cy - n; j <= cy + n; j++) for (let k = cz - n; k <= cz + n; k++) {
			const ids = this.map.get(`${i},${j},${k}`);
			if (!ids) continue;
			for (const v of ids) {
				const d = (P[v * 3] - x[0]) ** 2 + (P[v * 3 + 1] - x[1]) ** 2 + (P[v * 3 + 2] - x[2]) ** 2;
				if (d < best && ok(v)) best = d;
			}
		}
		return best < r * r ? Math.sqrt(best) : Infinity;
	}

	/** Index of the nearest point within r of x, or -1. */
	nearest(x: ArrayLike<number>, r: number): number {
		const c = this.cell, n = Math.ceil(r / c), cx = Math.floor(x[0] / c), cy = Math.floor(x[1] / c), cz = Math.floor(x[2] / c), P = this.P;
		let best = r * r, at = -1;
		for (let i = cx - n; i <= cx + n; i++) for (let j = cy - n; j <= cy + n; j++) for (let k = cz - n; k <= cz + n; k++) {
			const ids = this.map.get(`${i},${j},${k}`);
			if (!ids) continue;
			for (const v of ids) {
				const d = (P[v * 3] - x[0]) ** 2 + (P[v * 3 + 1] - x[1]) ** 2 + (P[v * 3 + 2] - x[2]) ** 2;
				if (d < best) { best = d; at = v; }
			}
		}
		return at;
	}
}
