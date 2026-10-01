/**
 * Mesh corrections (src/core/muscle/correct.ts), solved offline at each grid pose of the bake. The meshes
 * are deformed as the runtime deforms them (baked muscles, no corrections), then each corrected mesh, in
 * bake order (so the muscles it must clear are already corrected), gets the displacement that fixes:
 *
 *   - attachments: its surface within HOLD mm of an attachment bone at rest, over that end's share of
 *     the muscle, lifting off that bone by more than TOL beyond its rest distance (a broad origin carried
 *     by one strand swinging off the clavicle);
 *   - neighbours (obstaclesOf): vertices that were outside a muscle at rest and have gone inside it, put
 *     back out of it by MARGIN, the nearest way: out of the muscles it lies beside or on;
 *   - muscles it lies over or on (MusclePathDef.over, beneath): its vertices with more of such a muscle outside them than
 *     at rest (marching away from the bone, DEPTH mm), lifted out past it (the anterior deltoid kept over
 *     the pectoralis major's tendon, rather than the tendon crossing on top of it or pushed into bone);
 *   - muscles it passes under: vertices lying over or in them, found by marching toward the bone (the
 *     nearest bone's inward direction, DEPTH mm in COL steps) through more of the muscle than at rest (by
 *     TOL), put below its deep side along that way (the pectoralis major's tendon under the deltoid).
 *
 * The displacement is solved directly at the mesh's handles (handles.ts: each vertex blends its four
 * nearest), so it is smooth by construction and stored exactly as the runtime uses it: each violating
 * vertex asks for the displacement that clears it; the handles' least-squares answer (the other vertices
 * held lightly where they are, HOLD_STILL) is applied, and the violations found again, ITERATIONS times.
 * A slab of muscle moves out of the way together, both faces, rather than its violating face being
 * pressed flat. Each handle's displacement is stored in the frame of its own vertex.
 * "Inside" is ray parity along z over a column grid of the other mesh (exact for a closed mesh).
 */
import { qRotate, type Quat, type Vec3 } from '../../src/core/math';
import { withBaked, type BakedPaths } from '../../src/core/muscle/baked';
import { vertexNormals, type BoundMesh } from '../../src/core/muscle/bind';
import { vertexFrame } from '../../src/core/muscle/deform';
import type { JointPaths } from '../../src/core/muscle/schema';
import { MuscleSystem } from '../../src/core/muscle/system';
import type { Pose } from '../../src/core/rig';
import { sdfGradient, sdfSample, SDF_FAR } from '../../src/core/sdf';
import type { MuscleMesh } from '../../src/core/types';
import { obstaclesOf } from './bake';
import { chooseHandles, type Handles } from './handles';
import { boneLocal, type LoadedJoint } from './pathcheck';

/** Surface within this distance of an attachment bone at rest is held to it, mm. */
const HOLD = 12;
/** How much farther than at rest it may lift, mm. */
const TOL = 2;
/** Share of the muscle from each end over which its surface is held to that end's bone. */
const END_SHARE = 0.3;
/** Clearance a vertex is put back out of a muscle by, mm. */
const MARGIN = 1;
/** How far toward the bone a vertex looks for a muscle it should pass under, mm. */
const DEPTH = 40;
/** Solve-and-recheck rounds per pose. */
const ITERATIONS = 6;
/** Weight holding the vertices that don't violate where they are, against those that do. */
const HOLD_STILL = 0.3;
/** Regularization of the handles' least squares, relative to its mean diagonal: toward small values, and toward neighbouring handles moving alike. */
const RIDGE_REG = 1e-2, SMOOTH_REG = 0.02;
/** Column grid spacing for inside tests, mm (offset so columns miss vertices and edges). */
const COL = 1.5, COL_OFF = 0.371;
/** Farthest a nearest-surface search reaches, mm, and its hash cell. */
const REACH = 30, CELL = 6;

/** Ray-parity inside test for a closed triangle mesh: per (x, y) column, the sorted z of its crossings. */
class Columns {
	private readonly lo: [number, number];
	private readonly nx: number;
	private readonly ny: number;
	private readonly z: (number[] | undefined)[];

	constructor(P: ArrayLike<number>, index: ArrayLike<number>) {
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
		this.lo = [x0 - COL + COL_OFF, y0 - COL + COL_OFF];
		this.nx = Math.ceil((x1 - x0) / COL) + 3;
		this.ny = Math.ceil((y1 - y0) / COL) + 3;
		this.z = new Array(this.nx * this.ny);
		for (let f = 0; f < index.length; f += 3) {
			const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
			const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
			const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
			if (Math.abs(det) < 1e-12) continue;
			const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - this.lo[0]) / COL)), i1 = Math.min(this.nx - 1, Math.floor((Math.max(ax, bx, cx) - this.lo[0]) / COL));
			const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - this.lo[1]) / COL)), j1 = Math.min(this.ny - 1, Math.floor((Math.max(ay, by, cy) - this.lo[1]) / COL));
			for (let i = i0; i <= i1; i++)
				for (let j = j0; j <= j1; j++) {
					const x = this.lo[0] + i * COL, y = this.lo[1] + j * COL;
					const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, l3 = 1 - l1 - l2;
					if (l1 < 0 || l2 < 0 || l3 < 0) continue;
					const k = i * this.ny + j;
					(this.z[k] ??= []).push(l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2]);
				}
		}
		for (const z of this.z) z?.sort((p, q) => p - q);
	}

	inside(x: number, y: number, z: number): boolean {
		const i = Math.round((x - this.lo[0]) / COL), j = Math.round((y - this.lo[1]) / COL);
		if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return false;
		const zs = this.z[i * this.ny + j];
		if (!zs) return false;
		let n = 0;
		for (const v of zs) if (v < z) n++; else break;
		return (n & 1) === 1;
	}
}

/** Nearest of a subset of points, by uniform hash. */
class Nearest {
	private readonly map = new Map<number, number[]>();
	constructor(private readonly P: ArrayLike<number>, idx: ArrayLike<number>) {
		for (let k = 0; k < idx.length; k++) {
			const v = idx[k], key = this.key(Math.floor(P[v * 3] / CELL), Math.floor(P[v * 3 + 1] / CELL), Math.floor(P[v * 3 + 2] / CELL));
			(this.map.get(key) ?? this.map.set(key, []).get(key)!).push(v);
		}
	}
	private key(i: number, j: number, k: number): number {
		return ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
	}
	find(x: number, y: number, z: number): number {
		const n = Math.ceil(REACH / CELL), ci = Math.floor(x / CELL), cj = Math.floor(y / CELL), ck = Math.floor(z / CELL), P = this.P;
		let best = REACH * REACH, at = -1;
		for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (let k = ck - n; k <= ck + n; k++) {
			const ids = this.map.get(this.key(i, j, k));
			if (!ids) continue;
			for (const v of ids) {
				const d = (P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2;
				if (d < best) { best = d; at = v; }
			}
		}
		return at;
	}
}

interface Partner {
	mesh: string;
	/** 'out': put back out of it the nearest way; 'below': under it; 'above': over it */
	how: 'out' | 'below' | 'above';
	/** per vertex of ours: inside it at rest (left alone; 'out') */
	restInside: Uint8Array;
	/** per vertex of ours: how much of it lay toward the bone at rest, mm ('below'), or away from it ('above') */
	restOver: Float32Array;
}

/**
 * Marching from x toward the bone (direction d) DEPTH mm: how much of the way lies inside the mesh, mm,
 * and the step past the last inside point (where it comes out on the bone side), or null for none.
 */
function overlying(cols: Columns, x: number, y: number, z: number, d: ArrayLike<number>): { len: number; exit: Vec3 | null } {
	let len = 0, exit: Vec3 | null = null;
	for (let t = 0; t <= DEPTH; t += COL) {
		const px = x + d[0] * t, py = y + d[1] * t, pz = z + d[2] * t;
		if (cols.inside(px, py, pz)) { len += COL; exit = [px + d[0] * (COL + MARGIN), py + d[1] * (COL + MARGIN), pz + d[2] * (COL + MARGIN)]; }
	}
	return { len, exit };
}

/** The unit direction toward the nearest bone from world point x at `bones` (null where none is near). */
function towardBone(J: LoadedJoint, bones: { q: Quat; t: Vec3 }[], x: number, y: number, z: number): Vec3 | null {
	let best = SDF_FAR, dir: Vec3 | null = null;
	J.assets.fields.forEach((g, b) => {
		if (!g) return;
		const l = boneLocal(bones[b], x, y, z), d = sdfSample(g, l[0], l[1], l[2]);
		if (d >= best || d >= SDF_FAR - 1) return;
		const gr = sdfGradient(g, l[0], l[1], l[2]);
		if (!gr) return;
		best = d;
		const w = qRotate(bones[b].q, gr);
		dir = [-w[0], -w[1], -w[2]];
	});
	return dir;
}

interface Target {
	mesh: string;
	index: number;
	m: MuscleMesh;
	bound: BoundMesh;
	partners: Partner[];
	/** surface held to attachment bones: vertex, bone, rest distance */
	held: { v: number; bone: number; d0: number }[];
	handles: Handles;
}

export class MeshFixer {
	readonly sys: MuscleSystem;
	readonly targets: Target[];

	/** `meshes`: those to correct, in bake order; H handles each. */
	constructor(readonly J: LoadedJoint, baked: BakedPaths, meshes: string[], H: number) {
		const paths: JointPaths = withBaked(J.spec.paths, baked);
		J.assets.baked = baked;
		J.assets.corrections = undefined;
		this.sys = new MuscleSystem(paths, J.assets, J.rig);
		const rest = Object.fromEntries(J.rig.def.joints.map((j) => [j.id, j.restAngle]));
		this.sys.update(rest);
		const P = this.deformAll();
		this.targets = meshes.map((mesh) => {
			const index = this.sys.meshes.findIndex((x) => x.name === mesh), m = this.sys.meshes[index], bound = this.sys.bound[index];
			const o = obstaclesOf(J, J.spec.paths, mesh), def = J.spec.paths.muscles.find((d) => d.mesh === mesh)!;
			// lifted over the muscles it lies over or is named to lie on (MusclePathDef.over, beneath), wherever more of
			// them is outside it than at rest: a sheet they show through (the trapezius as the splenii slide under it)
			// has few of its vertices inside them, so putting those back out doesn't lift it
			const lieOn = [...(def.over ?? []), ...(def.beneath ?? [])];
			const partners: Partner[] = [
				...[...o.beneath, ...(def.beside ?? [])].filter((p) => !lieOn.includes(p)).map((p) => ({ mesh: p, how: 'out' as const })),
				...lieOn.map((p) => ({ mesh: p, how: 'above' as const })),
				...o.under.map((p) => ({ mesh: p, how: 'below' as const }))
			].filter((p) => this.sys.has(p.mesh)).map((p) => {
				const pm = this.sys.meshes.find((x) => x.name === p.mesh)!, cols = new Columns(P.get(p.mesh)!, pm.index), R = m.rest, W0 = this.sys.solver.bones;
				const restOver = new Float32Array(m.nv);
				if (p.how !== 'out')
					for (let v = 0; v < m.nv; v++) {
						const d = towardBone(J, W0, R[v * 3], R[v * 3 + 1], R[v * 3 + 2]);
						if (d && p.how === 'above') for (let c = 0; c < 3; c++) d[c] = -d[c];
						restOver[v] = d ? overlying(cols, R[v * 3], R[v * 3 + 1], R[v * 3 + 2], d).len : 0;
					}
				return { ...p, restInside: Uint8Array.from({ length: m.nv }, (_, v) => (cols.inside(R[v * 3], R[v * 3 + 1], R[v * 3 + 2]) ? 1 : 0)), restOver };
			});
			const st = this.sys.solver.strands[bound.path[2]];
			const held: Target['held'] = [];
			for (let v = 0; v < m.nv; v++) {
				const s = bound.path[v * 4];
				for (const [bone, near] of [[st.originBone, s <= END_SHARE], [st.insertionBone, s >= 1 - END_SHARE]] as [number, boolean][]) {
					const g = J.assets.fields[bone];
					if (!near || !g) continue;
					const d0 = sdfSample(g, m.rest[v * 3], m.rest[v * 3 + 1], m.rest[v * 3 + 2]);
					if (d0 < HOLD) held.push({ v, bone, d0 });
				}
			}
			return { mesh, index, m, bound, partners, held, handles: chooseHandles(m.rest, m.nv, H) };
		});
	}

	/** Every path mesh deformed at the system's last update (world). */
	private deformAll(): Map<string, Float32Array> {
		return new Map(this.sys.meshes.map((m) => {
			const P = new Float32Array(m.nv * 3);
			this.sys.deform(m.name, P);
			return [m.name, P];
		}));
	}

	/**
	 * Solve the corrections at a pose: each target's handle displacements (H × 3, each in its handle vertex's
	 * frame) into out[k]; returns per target how many vertices violated before correction, and after.
	 */
	solve(pose: Pose, out: Float32Array[]): { before: number[]; after: number[] } {
		const { sys, J } = this;
		sys.update(J.rig.clamp(pose));
		const P = this.deformAll(), bones = sys.solver.bones, before: number[] = [], after: number[] = [];
		this.targets.forEach((t, k) => {
			const Pm = P.get(t.mesh)!, nv = t.m.nv, { H, idx, w, pick } = t.handles;
			// the partners as they now stand (corrected before this one)
			const parts = t.partners.map((p) => {
				const pm = sys.meshes.find((x) => x.name === p.mesh)!, PP = P.get(p.mesh)!, NN = vertexNormals(PP, pm.index, pm.nv);
				return { p, PP, NN, cols: new Columns(PP, pm.index), near: new Nearest(PP, Int32Array.from({ length: pm.nv }, (_, i) => i)) };
			});
			const h = new Float64Array(H * 3), X = new Float64Array(nv * 3);
			const need = new Float64Array(nv * 3), has = new Uint8Array(nv);
			for (let it = 0; it <= ITERATIONS; it++) {
				// where the vertices are now
				for (let v = 0; v < nv; v++)
					for (let c = 0; c < 3; c++) {
						let d = 0;
						for (let j = 0; j < 4; j++) d += w[v * 4 + j] * h[idx[v * 4 + j] * 3 + c];
						X[v * 3 + c] = Pm[v * 3 + c] + d;
					}
				// what each violating vertex needs, further
				has.fill(0);
				const want = (v: number, dx: number, dy: number, dz: number) => {
					const o = v * 3;
					if (!has[v] || dx * dx + dy * dy + dz * dz > need[o] ** 2 + need[o + 1] ** 2 + need[o + 2] ** 2) { need[o] = dx; need[o + 1] = dy; need[o + 2] = dz; }
					has[v] = 1;
				};
				for (const { v, bone, d0 } of t.held) {
					const g = J.assets.fields[bone]!, B = bones[bone], l = boneLocal(B, X[v * 3], X[v * 3 + 1], X[v * 3 + 2]);
					const d = sdfSample(g, l[0], l[1], l[2]), lift = d - d0 - TOL;
					if (lift <= 0 || d >= SDF_FAR - 1) continue;
					const gr = sdfGradient(g, l[0], l[1], l[2]);
					if (!gr) continue;
					const wv = qRotate(B.q, gr);
					want(v, -wv[0] * lift, -wv[1] * lift, -wv[2] * lift);
				}
				for (const { p, PP, NN, cols, near } of parts)
					for (let v = 0; v < nv; v++) {
						const x = X[v * 3], y = X[v * 3 + 1], z = X[v * 3 + 2];
						if (p.how !== 'out') {
							// 'below': lying over or in it, more than at rest: down past its deep side, toward the bone;
							// 'above': lying under or in it: up past its outer side, away from the bone
							const d = towardBone(J, bones, x, y, z);
							if (!d) continue;
							if (p.how === 'above') for (let c = 0; c < 3; c++) d[c] = -d[c];
							const o = overlying(cols, x, y, z, d);
							if (o.exit && o.len > p.restOver[v] + TOL) want(v, o.exit[0] - x, o.exit[1] - y, o.exit[2] - z);
							continue;
						}
						if (p.restInside[v]) continue;
						if (!cols.inside(x, y, z)) continue;
						const u = near.find(x, y, z);
						if (u < 0) continue;
						want(v, PP[u * 3] + NN[u * 3] * MARGIN - x, PP[u * 3 + 1] + NN[u * 3 + 1] * MARGIN - y, PP[u * 3 + 2] + NN[u * 3 + 2] * MARGIN - z);
					}
				let count = 0;
				for (let v = 0; v < nv; v++) count += has[v];
				if (it === 0) before.push(count);
				if (it === ITERATIONS || !count) { after.push(count); break; }
				// least squares at the handles: violators get what they need, the rest are held lightly still
				const A = new Float64Array(H * H), b = new Float64Array(H * 3);
				for (let v = 0; v < nv; v++) {
					const s = has[v] ? 1 : HOLD_STILL;
					for (let a = 0; a < 4; a++) {
						const ha = idx[v * 4 + a], wa = w[v * 4 + a] * s;
						for (let c = 0; c < 4; c++) A[ha * H + idx[v * 4 + c]] += wa * w[v * 4 + c];
						if (has[v]) for (let c = 0; c < 3; c++) b[ha * 3 + c] += wa * need[v * 3 + c];
					}
				}
				let tr = 0;
				for (let i = 0; i < H; i++) tr += A[i * H + i];
				for (let i = 0; i < H; i++) A[i * H + i] += (RIDGE_REG * tr) / H;
				// smoothness: the handles' increments (and so their totals, as h is accumulated) pulled toward their neighbours'
				const sm = (SMOOTH_REG * tr) / H;
				for (const [i, j] of t.handles.neighbours) {
					A[i * H + i] += sm; A[j * H + j] += sm; A[i * H + j] -= sm; A[j * H + i] -= sm;
					for (let c = 0; c < 3; c++) { const dh = h[j * 3 + c] - h[i * 3 + c]; b[i * 3 + c] += sm * dh; b[j * 3 + c] -= sm * dh; }
				}
				const L = cholesky(A, H);
				for (let c = 0; c < 3; c++) {
					const col = Float64Array.from({ length: H }, (_, i) => b[i * 3 + c]);
					solveCholesky(L, H, col);
					for (let i = 0; i < H; i++) h[i * 3 + c] += col[i];
				}
			}
			// into each handle vertex's frame; and the mesh moved, for the targets after it
			const B = t.bound, c = [0, 0, 0], q = [0, 0, 0, 1], o3 = out[k];
			for (let i = 0; i < H; i++) {
				const v = pick[i];
				vertexFrame(sys.solver, B.path[v * 4 + 2], B.path[v * 4 + 3], B.path[v * 4], B.path[v * 4 + 1], B.window[v], c, q);
				const l = qRotate([-q[0], -q[1], -q[2], q[3]] as Quat, [h[i * 3], h[i * 3 + 1], h[i * 3 + 2]] as Vec3);
				o3[i * 3] = l[0]; o3[i * 3 + 1] = l[1]; o3[i * 3 + 2] = l[2];
			}
			Pm.set(X);
		});
		return { before, after };
	}
}

function cholesky(A: Float64Array, n: number): Float64Array {
	const L = new Float64Array(n * n);
	for (let i = 0; i < n; i++)
		for (let j = 0; j <= i; j++) {
			let s = A[i * n + j];
			for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
			L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
		}
	return L;
}

function solveCholesky(L: Float64Array, n: number, b: Float64Array): void {
	for (let i = 0; i < n; i++) {
		let s = b[i];
		for (let k = 0; k < i; k++) s -= L[i * n + k] * b[k];
		b[i] = s / L[i * n + i];
	}
	for (let i = n - 1; i >= 0; i--) {
		let s = b[i];
		for (let k = i + 1; k < n; k++) s -= L[k * n + i] * b[k];
		b[i] = s / L[i * n + i];
	}
}
