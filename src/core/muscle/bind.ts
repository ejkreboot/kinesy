/**
 * Rest-pose binding: ties each vertex of a muscle mesh to a place along its strands, once, at load.
 *
 * A vertex gets its arc-length share s along the muscle and, for a sheet, its position across it
 * (strand pair + blend), found as the nearest point on the strands (for a sheet, on the ruled
 * surface between neighbouring strands) and then smoothed over the mesh so neighbours can't bind to
 * distant parts of a tightly curved path. Its offset and normal are stored in the frame there, so
 * the rest pose is rebuilt exactly whatever s it got.
 *
 * Near each end a vertex blends toward riding the attachment bone rigidly: over the anchor length,
 * and, for a fleshy attachment (via points on the attachment bone), wherever the mesh lies on that
 * bone along the stretch of strand fixed to it (attachWeights), so the attached surface never
 * slides into the bone.
 *
 * The cross-section profile along s gives each vertex a belly weight (1 in the widest part, near
 * 0 in tendon) that scales the bulge, and gives each strand its twist distribution: twist goes
 * where the muscle is thin, so the belly doesn't wring.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import type { Quat } from '../math';
import { qRotate } from '../math';
import { sdfSample, SDF_FAR } from '../sdf';
import type { IndexArray, SdfGrid } from '../types';
import { blendedFrame, capsuleDistance, vertexFrame, type CapsuleArray } from './deform';
import type { PathSolver } from './path';

export interface BoundMesh {
	name: string;
	/** muscle index in the solver */
	muscle: number;
	nv: number;
	/** depth order (MusclePathDef.layer) */
	layer: number;
	/** proxy capsules that push this mesh: the first this many (those of lower layers) */
	caps: number;
	/** per vertex: s, blend, strand A, strand B (strand indices are the solver's) */
	path: Float32Array;
	/** per vertex: offset in the frame (x along the tangent) */
	offset: Float32Array;
	/** per vertex: rest normal in the frame */
	normal: Float32Array;
	/** per vertex: belly weight, origin anchor, insertion anchor, rest clearance from proxies */
	weights: Float32Array;
	/** per vertex: rest clearance from each collider bone (mm; SDF_FAR where none) */
	clear: Float32Array;
	/** per vertex: half-width of the window along the strand its frame is averaged over, mm (deform.ts) */
	window: Float32Array;
	/**
	 * per vertex: its part of the belly's rest drape, in the frame (MusclePathDef.drape): the mesh's median
	 * offset across the strand there; zero for muscles without a drape
	 */
	drape: Float32Array;
	/** collider bones, -1 for unused slots */
	colliders: [number, number, number, number];
	/** cross-section profile along the strands (N samples, 1 = widest) */
	profile: Float64Array;
}

export interface BindOptions {
	/** smoothing passes over the mesh for (s, across) */
	smoothIters: number;
}

export const DEFAULT_BIND_OPTIONS: BindOptions = { smoothIters: 4 };

/** Area-weighted unit vertex normals. */
export function vertexNormals(P: ArrayLike<number>, index: ArrayLike<number>, nv: number, out: Float32Array = new Float32Array(nv * 3)): Float32Array {
	out.fill(0);
	for (let f = 0; f < index.length; f += 3) {
		const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
		const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
		const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		for (const o of [a, b, c]) { out[o] += nx; out[o + 1] += ny; out[o + 2] += nz; }
	}
	for (let i = 0; i < nv * 3; i += 3) {
		const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
		out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
	}
	return out;
}

/** Vertex adjacency (CSR) from triangles. */
function adjacency(index: ArrayLike<number>, nv: number): { start: Uint32Array; adj: Uint32Array } {
	const deg = new Uint32Array(nv);
	for (let f = 0; f < index.length; f++) deg[index[f]] += 2;
	const start = new Uint32Array(nv + 1);
	for (let i = 0; i < nv; i++) start[i + 1] = start[i] + deg[i];
	const adj = new Uint32Array(start[nv]), fill = start.slice(0, nv);
	for (let f = 0; f < index.length; f += 3) {
		const p = index[f], q = index[f + 1], r = index[f + 2];
		adj[fill[p]++] = q; adj[fill[p]++] = r;
		adj[fill[q]++] = p; adj[fill[q]++] = r;
		adj[fill[r]++] = p; adj[fill[r]++] = q;
	}
	return { start, adj };
}

function segmentParam(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number] {
	const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez;
	const u = ee > 1e-12 ? Math.min(1, Math.max(0, ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / ee)) : 0;
	return [u, (px - ax - ex * u) ** 2 + (py - ay - ey * u) ** 2 + (pz - az - ez * u) ** 2];
}

/**
 * Bind a muscle mesh (rest positions, triangles) to its strands. The solver must be at the rest
 * pose (as constructed). Also sets the muscle's strand twist weights from its profile.
 */
export function bindMesh(
	solver: PathSolver, name: string, rest: Float32Array, index: IndexArray, fields: (SdfGrid | null)[], boneNames: string[],
	opts: Partial<BindOptions> = {}
): BoundMesh {
	const o = { ...DEFAULT_BIND_OPTIONS, ...opts };
	const mi = solver.muscles.findIndex((m) => m.def.mesh === name);
	if (mi < 0) throw new Error(`No path for mesh ${name}`);
	const m = solver.muscles[mi], def = m.def, N = solver.N, P = solver.pos;
	const nv = rest.length / 3, K = m.count;
	const sArr = new Float64Array(nv), wArr = new Float64Array(nv);

	// nearest point: on the polyline (one strand) or on the rungs between neighbouring strands
	const at = (strand: number, i: number) => (strand * N + i) * 3;
	for (let v = 0; v < nv; v++) {
		const px = rest[v * 3], py = rest[v * 3 + 1], pz = rest[v * 3 + 2];
		let best = Infinity, bs = 0, bw = 0;
		if (K === 1) {
			for (let i = 0; i < N - 1; i++) {
				const a = at(m.first, i), b = a + 3;
				const [u, d] = segmentParam(px, py, pz, P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2]);
				if (d < best) { best = d; bs = (i + u) / (N - 1); }
			}
		} else {
			for (let j = 0; j < K - 1; j++) {
				const A = m.first + j, B = A + 1;
				for (let sub = 0; sub <= (N - 1) * 4; sub++) {
					const f = sub / 4, i = Math.min(N - 2, Math.floor(f)), u = f - i;
					const a0 = at(A, i), b0 = at(B, i);
					const ax = P[a0] + (P[a0 + 3] - P[a0]) * u, ay = P[a0 + 1] + (P[a0 + 4] - P[a0 + 1]) * u, az = P[a0 + 2] + (P[a0 + 5] - P[a0 + 2]) * u;
					const bx = P[b0] + (P[b0 + 3] - P[b0]) * u, by = P[b0 + 1] + (P[b0 + 4] - P[b0 + 1]) * u, bz = P[b0 + 2] + (P[b0 + 5] - P[b0 + 2]) * u;
					const [beta, d] = segmentParam(px, py, pz, ax, ay, az, bx, by, bz);
					if (d < best) { best = d; bs = f / (N - 1); bw = j + beta; }
				}
			}
		}
		sArr[v] = bs;
		wArr[v] = bw;
	}

	// smooth over the mesh
	const { start, adj } = adjacency(index, nv);
	const tmpS = new Float64Array(nv), tmpW = new Float64Array(nv);
	for (let it = 0; it < o.smoothIters; it++) {
		for (let v = 0; v < nv; v++) {
			let ss = 0, sw = 0, n = 0;
			for (let j = start[v]; j < start[v + 1]; j++) { ss += sArr[adj[j]]; sw += wArr[adj[j]]; n++; }
			tmpS[v] = n ? 0.5 * sArr[v] + (0.5 * ss) / n : sArr[v];
			tmpW[v] = n ? 0.5 * wArr[v] + (0.5 * sw) / n : wArr[v];
		}
		sArr.set(tmpS);
		wArr.set(tmpW);
	}

	const path = new Float32Array(nv * 4), offset = new Float32Array(nv * 3), normal = new Float32Array(nv * 3);
	const weights = new Float32Array(nv * 4), clear = new Float32Array(nv * 4), window = new Float32Array(nv);
	const restN = vertexNormals(rest, index, nv);
	const c = [0, 0, 0], q = [0, 0, 0, 1];
	for (let v = 0; v < nv; v++) {
		const s = Math.min(1, Math.max(0, sArr[v]));
		const w = Math.min(K - 1, Math.max(0, wArr[v]));
		const j = Math.min(Math.max(0, K - 2), Math.floor(w)), beta = K > 1 ? w - j : 0;
		const a = m.first + j, b = K > 1 ? a + 1 : a;
		path.set([s, beta, a, b], v * 4);
		const o3 = v * 3;
		// the window follows from the vertex's distance from the strand, and the offset is kept in the
		// frame averaged over it (so the rest pose is rebuilt exactly)
		blendedFrame(solver, a, b, s, beta, c, q);
		const across = qRotate([-q[0], -q[1], -q[2], q[3]], [rest[o3] - c[0], rest[o3 + 1] - c[1], rest[o3 + 2] - c[2]]);
		window[v] = Math.min(BEND_WINDOW * Math.hypot(across[1], across[2]), WINDOW_SHARE * solver.strands[a].restLength);
		vertexFrame(solver, a, b, s, beta, window[v], c, q);
		const qi: Quat = [-q[0], -q[1], -q[2], q[3]];
		offset.set(qRotate(qi, [rest[o3] - c[0], rest[o3 + 1] - c[1], rest[o3 + 2] - c[2]]), o3);
		normal.set(qRotate(qi, [restN[o3], restN[o3 + 1], restN[o3 + 2]]), o3);
	}

	// cross-section profile along s: mean distance from the strands across the tangent
	const sum = new Float64Array(N), cnt = new Float64Array(N);
	for (let v = 0; v < nv; v++) {
		const i = Math.round(path[v * 4] * (N - 1));
		sum[i] += Math.hypot(offset[v * 3 + 1], offset[v * 3 + 2]);
		cnt[i]++;
	}
	const raw = new Float64Array(N);
	for (let i = 0; i < N; i++) raw[i] = cnt[i] >= 3 ? sum[i] / cnt[i] : 0;
	const profile = new Float64Array(N);
	for (let i = 0; i < N; i++) profile[i] = (raw[Math.max(0, i - 1)] + 2 * raw[i] + raw[Math.min(N - 1, i + 1)]) / 4;
	const top = Math.max(...profile) || 1;
	for (let i = 0; i < N; i++) profile[i] /= top;

	// twist goes where the muscle is thin, length change where it is thick
	const cumulative = (f: (i: number) => number) => {
		const c = new Float64Array(N);
		for (let i = 1; i < N; i++) c[i] = c[i - 1] + (f(i - 1) + f(i)) / 2;
		for (let i = 1; i < N; i++) c[i] /= c[N - 1];
		return c;
	};
	const tw = cumulative((i) => 1.05 - profile[i]);
	const st = cumulative((i) => profile[i] + 0.03);
	for (let k = 0; k < K; k++) {
		solver.setTwistWeights(m.first + k, tw);
		solver.setStretchWeights(m.first + k, st);
	}

	// anchors in mm, as shares of the (first) strand's rest length
	const L0 = solver.strands[m.first].restLength;
	const [anchorO, anchorI] = (def.anchor ?? [8, 8]).map((mm) => mm / L0);
	const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
	// the part of an end that lies on its bone rides it; a thick belly's surface further out pivots with
	// the strand about the attachment instead (held to the bone, it kept pointing the way it hung at rest
	// while the strand turned, and the two folded over each other)
	const near = (bone: number, v: number) => {
		const g = bone < fields.length ? fields[bone] : null;
		if (!g) return 1;
		const d = sdfSample(g, rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]);
		return 1 - smoothstep(ANCHOR_NEAR[0], ANCHOR_NEAR[1], d);
	};
	for (let v = 0; v < nv; v++) {
		const s = path[v * 4], f = s * (N - 1), i = Math.min(N - 2, Math.floor(f)), u = f - i, st = solver.strands[path[v * 4 + 2]];
		weights[v * 4] = profile[i] + (profile[i + 1] - profile[i]) * u;
		weights[v * 4 + 1] = anchorO > 0 ? (1 - smooth(s / anchorO)) * near(st.originBone, v) : 0;
		weights[v * 4 + 2] = anchorI > 0 ? (1 - smooth((1 - s) / anchorI)) * near(st.insertionBone, v) : 0;
		weights[v * 4 + 3] = SDF_FAR;
	}
	if (def.attach !== false) {
		const { start: st0, adj: adj0 } = adjacency(index, nv);
		// per strand, how far (in samples) its path stays fixed to its origin bone from the start, and to
		// its insertion bone from the end: to the last / first of its points on that bone (at rest)
		const fixedTo = (strand: number, end: 0 | 1): number => {
			const st = solver.strands[strand], bone = end ? st.insertionBone : st.originBone;
			let k = end ? N - 1 : 0;
			for (const e of st.elements) {
				if (!e.point || e.bone !== bone) continue;
				let best = Infinity, at = 0;
				for (let i = 0; i < N; i++) {
					const o = (strand * N + i) * 3, d = Math.hypot(P[o] - e.p[0], P[o + 1] - e.p[1], P[o + 2] - e.p[2]);
					if (d < best) { best = d; at = i; }
				}
				k = end ? Math.min(k, at) : Math.max(k, at);
			}
			return end ? N - 1 - k : k;
		};
		for (const end of [0, 1] as const) {
			const bone = (v: number) => {
				const st = solver.strands[path[v * 4 + 2]];
				return end ? st.insertionBone : st.originBone;
			};
			const fixed = (v: number) => fixedTo(path[v * 4 + 2], end);
			const w = attachWeights(rest, nv, path, bone, fixed, fields, st0, adj0, end, N);
			for (let v = 0; v < nv; v++) weights[v * 4 + 1 + end] = Math.max(weights[v * 4 + 1 + end], w[v]);
		}
	}

	const names = def.collide ?? boneNames.filter((_, b) => fields[b]);
	if (names.length > 4) throw new Error(`${name}: at most 4 collider bones`);
	const colliders: [number, number, number, number] = [-1, -1, -1, -1];
	names.forEach((n, k) => {
		const b = boneNames.indexOf(n);
		if (b < 0 || !fields[b]) throw new Error(`${name}: collider ${n} has no distance field`);
		colliders[k] = b;
	});
	for (let v = 0; v < nv; v++)
		for (let k = 0; k < 4; k++) {
			const g = colliders[k] >= 0 ? fields[colliders[k]] : null;
			clear[v * 4 + k] = g ? sdfSample(g, rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]) : SDF_FAR;
		}

	const drape = new Float32Array(nv * 3);
	if (def.drape) restDrape(path, offset, nv, drape);

	return { name, muscle: mi, nv, layer: def.layer, caps: 0, path, offset, normal, weights, clear, colliders, profile, window, drape };
}

/**
 * Half-width of a vertex's frame window per mm of its distance from the strand: at a bend the frame a
 * vertex sees is averaged over a stretch about as long as it is far out, so the bend it follows is
 * rounded to about that radius and its side of the muscle doesn't fold over on the inside of the bend.
 */
const BEND_WINDOW = 1;
/** Widest a frame window may be, as a share of the strand's rest length (a short muscle is all bend otherwise). */
const WINDOW_SHARE = 0.15;

/** Slices along a strand the rest drape is measured in, and smoothing passes over them. */
const DRAPE_BINS = 24, DRAPE_SMOOTH = 3;

/**
 * The belly's rest drape (into `out`, per vertex, in the frame): per strand (pair) and slice along it,
 * the median offset of its vertices across the strand, smoothed from slice to slice and interpolated to
 * each vertex's place along it.
 */
function restDrape(path: Float32Array, offset: Float32Array, nv: number, out: Float32Array): void {
	const groups = new Map<number, number[][][]>();
	for (let v = 0; v < nv; v++) {
		const a = path[v * 4 + 2], k = Math.min(DRAPE_BINS - 1, Math.floor(path[v * 4] * DRAPE_BINS));
		const g = groups.get(a) ?? groups.set(a, Array.from({ length: DRAPE_BINS }, () => [])).get(a)!;
		g[k].push([offset[v * 3 + 1], offset[v * 3 + 2]]);
	}
	const med = (x: number[]) => { const y = [...x].sort((p, q) => p - q); return y.length ? y[y.length >> 1] : 0; };
	const table = new Map<number, Float64Array>();
	for (const [a, g] of groups) {
		let t = new Float64Array(DRAPE_BINS * 2);
		g.forEach((vs, k) => { t[k * 2] = med(vs.map((o) => o[0])); t[k * 2 + 1] = med(vs.map((o) => o[1])); });
		for (let it = 0; it < DRAPE_SMOOTH; it++) {
			const c = t.slice();
			for (let k = 0; k < DRAPE_BINS; k++) for (let j = 0; j < 2; j++) t[k * 2 + j] = 0.5 * c[k * 2 + j] + 0.25 * (c[Math.max(0, k - 1) * 2 + j] + c[Math.min(DRAPE_BINS - 1, k + 1) * 2 + j]);
			t = t.slice();
		}
		table.set(a, t);
	}
	for (let v = 0; v < nv; v++) {
		const t = table.get(path[v * 4 + 2])!, f = Math.min(DRAPE_BINS - 1, Math.max(0, path[v * 4] * DRAPE_BINS - 0.5));
		const k = Math.min(DRAPE_BINS - 2, Math.floor(f)), u = f - k;
		out[v * 3 + 1] = t[k * 2] + (t[(k + 1) * 2] - t[k * 2]) * u;
		out[v * 3 + 2] = t[k * 2 + 1] + (t[(k + 1) * 2 + 1] - t[k * 2 + 1]) * u;
	}
}

/** Rest clearance from its end's bone within which a vertex near that end rides it (fully, not at all), mm. */
const ANCHOR_NEAR: [number, number] = [3, 12];

function smoothstep(a: number, b: number, x: number): number {
	const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return u * u * (3 - 2 * u);
}

/** Rest clearance from a bone within which a vertex is attached to it (fully, not at all), mm. */
const ATTACH: [number, number] = [1, 4];
/** Mesh smoothing passes over the attachment weights (so the surface above blends in). */
const ATTACH_SMOOTH = 4;

/**
 * How far each vertex rides the bone its origin (end 0) or insertion (end 1) attaches to, for a
 * fleshy attachment: along the stretch of its strand fixed to that bone (`fixed`, samples from that
 * end), vertices on the bone ride it fully (ATTACH); the weights are then spread a little over the
 * mesh so the surface above follows partly.
 */
function attachWeights(
	rest: Float32Array, nv: number, path: Float32Array, boneOf: (v: number) => number, fixed: (v: number) => number,
	fields: (SdfGrid | null)[], start: Uint32Array, adj: Uint32Array, end: 0 | 1, N: number
): Float32Array {
	const w = new Float32Array(nv);
	const smooth = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
	for (let v = 0; v < nv; v++) {
		const b = boneOf(v), g = b < fields.length ? fields[b] : null, f = fixed(v);
		if (!g || f <= 0) continue;
		const clear = sdfSample(g, rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]);
		const k = (end ? 1 - path[v * 4] : path[v * 4]) * (N - 1);
		w[v] = (1 - smooth(ATTACH[0], ATTACH[1], clear)) * (1 - smooth(f, f + 1.5, k));
	}
	const raw = w.slice(), tmp = new Float32Array(nv);
	for (let it = 0; it < ATTACH_SMOOTH; it++) {
		for (let v = 0; v < nv; v++) {
			let sum = 0, n = 0;
			for (let j = start[v]; j < start[v + 1]; j++) { sum += w[adj[j]]; n++; }
			tmp[v] = n ? 0.5 * w[v] + (0.5 * sum) / n : w[v];
		}
		w.set(tmp);
	}
	for (let v = 0; v < nv; v++) w[v] = Math.max(w[v], raw[v]);
	return w;
}

/**
 * Record each vertex's rest clearance from the proxy capsules that push it (the first bound.caps;
 * capsules at the rest pose).
 */
export function setProxyClearance(bound: BoundMesh, rest: Float32Array, capsules: CapsuleArray): void {
	const g = [0, 0, 0], n = bound.caps;
	for (let v = 0; v < bound.nv; v++) {
		let d = SDF_FAR;
		for (let k = 0; k < n; k++) d = Math.min(d, capsuleDistance(capsules, k * 8, rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2], g));
		bound.weights[v * 4 + 3] = d;
	}
}
