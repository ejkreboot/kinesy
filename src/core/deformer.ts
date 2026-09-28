/**
 * Muscle deformer:
 *   1. dual-quaternion skinning to the rig bones (tissue spanning two bones sweeps around the
 *      joint axis instead of collapsing across the chord, as linear blending does);
 *   2. constant-volume bulge: a muscle's belly scales radially with (length / rest length)^-1/2,
 *      weighted by its own cross-section profile so tendons stay thin;
 *   3. bone collision: vertices pushed deeper into a bone than they sit at rest are projected
 *      out along the bone's distance-field gradient, then the correction is smoothed over
 *      neighbouring vertices and re-projected, so tissue wraps instead of denting.
 *
 * Pure TypeScript, no DOM or three.js dependency; runs in the browser and in Node.
 */
import { qMul, qRotate, qToMat3, rigidToMat4, type Quat, type Rigid, type Vec3 } from './math';
import type { Pose, Rig } from './rig';
import { sdfGradient, sdfSample, SDF_FAR } from './sdf';
import type { JointAssets, MuscleMesh, SdfGrid } from './types';

export interface DeformerOptions {
	/** dual-quaternion (true) or linear blend (false) skinning */
	dqs: boolean;
	bulge: boolean;
	collide: boolean;
	/** clearance kept between muscle and bone surfaces, mm */
	margin: number;
	/** rings of neighbours the collision correction is spread over */
	smoothIters: number;
	/** projections after smoothing, to catch vertices the smoothing pulled back in */
	finalPasses: number;
	/** fraction of a muscle's length that is contractile belly (rest takes no length change) */
	bellyFrac: number;
	kMin: number;
	kMax: number;
	/** weights above this pin a vertex to that bone, so it never collides with it */
	pinnedWeight: number;
	/**
	 * a vertex tests collision only against bones it is skinned to or lies within this distance
	 * of at rest (mm). Infinity tests every bone; a finite radius pays off with many small bones.
	 */
	collideRadius: number;
}

export const DEFAULT_DEFORMER_OPTIONS: DeformerOptions = {
	dqs: true,
	bulge: true,
	collide: true,
	margin: 0.8,
	smoothIters: 3,
	finalPasses: 2,
	bellyFrac: 0.8,
	kMin: 0.8,
	kMax: 1.3,
	pinnedWeight: 0.995,
	collideRadius: Infinity
};

interface BoneState {
	R: Quat;
	T: Vec3;
	/** dual part of the unit dual quaternion */
	Dq: Quat;
	/** column-major rotation matrix */
	M3: number[];
}

/** A vertex's skin weights rarely involve more than a few bones; keep the largest this many. */
const MAX_INFLUENCES = 4;

interface SparseWeights {
	/** CSR row starts */
	start: Uint32Array;
	idx: Uint8Array;
	val: Float32Array;
}

/**
 * Nonzero weights of each row of a dense (rows x nb) weight table, in ascending bone order. Rows
 * with more than MAX_INFLUENCES nonzero weights keep the largest and are renormalized.
 */
function sparse(W: ArrayLike<number>, rows: number, nb: number): SparseWeights {
	const start = new Uint32Array(rows + 1), idx: number[] = [], val: number[] = [];
	const order = Array.from({ length: nb }, (_, b) => b);
	for (let i = 0; i < rows; i++) {
		let keep = order.filter((b) => W[i * nb + b] > 0);
		if (keep.length > MAX_INFLUENCES) {
			keep = keep.sort((p, q) => W[i * nb + q] - W[i * nb + p]).slice(0, MAX_INFLUENCES).sort((p, q) => p - q);
			const sum = keep.reduce((t, b) => t + W[i * nb + b], 0);
			for (const b of keep) { idx.push(b); val.push(W[i * nb + b] / sum); }
		} else for (const b of keep) { idx.push(b); val.push(W[i * nb + b]); }
		start[i + 1] = idx.length;
	}
	return { start, idx: Uint8Array.from(idx), val: Float32Array.from(val) };
}

/** End-to-end distance of a centerline, or with `path` its length along the bins. */
function centerlineLength(C: ArrayLike<number>, bins: number, path: boolean): number {
	const e = (bins - 1) * 3;
	if (!path) return Math.hypot(C[e] - C[0], C[e + 1] - C[1], C[e + 2] - C[2]);
	let L = 0;
	for (let k = 3; k <= e; k += 3) L += Math.hypot(C[k] - C[k - 3], C[k + 1] - C[k - 2], C[k + 2] - C[k - 1]);
	return L;
}

class MuscleState {
	readonly mesh: MuscleMesh;
	readonly nb: number;
	readonly u: Float32Array;
	readonly bins: number;
	readonly centerSkinned: Float64Array;
	readonly restLength: number;
	readonly adjStart: Uint32Array;
	readonly adj: Uint32Array;
	/** rest-pose signed distance to each bone */
	readonly d0: Float32Array;
	readonly base: Float32Array;
	readonly delta: Float32Array;
	readonly tmp: Float32Array;
	readonly mark: Uint8Array;
	readonly active: Uint32Array;
	/** per vertex, its nonzero skin weights (at most MAX_INFLUENCES) */
	readonly skinWeights: SparseWeights;
	/** per centerline bin, its nonzero skin weights */
	readonly centerWeights: SparseWeights;
	/** per vertex (CSR), the bones it is tested against for collision */
	readonly candStart: Uint32Array;
	readonly cand: Uint8Array;
	/** current bulge factor */
	k = 1;

	constructor(mesh: MuscleMesh, nb: number, fields: (SdfGrid | null)[], opts: DeformerOptions) {
		this.mesh = mesh;
		this.nb = nb;
		const { nv, rest, centerline: c, index } = mesh;
		const NB = c.C.length;
		this.bins = NB;

		this.u = new Float32Array(nv);
		for (let i = 0; i < nv; i++) {
			const tr = (rest[i * 3] - c.mu[0]) * c.a[0] + (rest[i * 3 + 1] - c.mu[1]) * c.a[1] + (rest[i * 3 + 2] - c.mu[2]) * c.a[2];
			const t = Math.min(1, Math.max(0, (tr - c.lo) / (c.hi - c.lo)));
			this.u[i] = Math.min(NB - 1, Math.max(0, t * NB - 0.5));
		}
		this.centerSkinned = new Float64Array(NB * 3);
		this.restLength = centerlineLength(c.C.flat(), NB, !!c.path);

		// vertex adjacency, CSR
		const deg = new Uint32Array(nv);
		for (let f = 0; f < index.length; f += 3) {
			deg[index[f]] += 2;
			deg[index[f + 1]] += 2;
			deg[index[f + 2]] += 2;
		}
		const start = new Uint32Array(nv + 1);
		for (let i = 0; i < nv; i++) start[i + 1] = start[i] + deg[i];
		const adj = new Uint32Array(start[nv]);
		const fill = start.slice(0, nv);
		for (let f = 0; f < index.length; f += 3) {
			const p = index[f], q = index[f + 1], r = index[f + 2];
			adj[fill[p]++] = q; adj[fill[p]++] = r;
			adj[fill[q]++] = p; adj[fill[q]++] = r;
			adj[fill[r]++] = p; adj[fill[r]++] = q;
		}
		this.adjStart = start;
		this.adj = adj;

		this.d0 = new Float32Array(nv * nb);
		for (let i = 0; i < nv; i++)
			for (let bi = 0; bi < nb; bi++) {
				const g = fields[bi];
				this.d0[i * nb + bi] = g ? sdfSample(g, rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]) : SDF_FAR;
			}

		this.skinWeights = sparse(mesh.weights, nv, nb);
		this.centerWeights = sparse(c.W.flat(), NB, nb);

		const W = mesh.weights, candStart = new Uint32Array(nv + 1), cand: number[] = [];
		for (let i = 0; i < nv; i++) {
			for (let bi = 0; bi < nb; bi++) {
				const w = W[i * nb + bi];
				if (!fields[bi] || w > opts.pinnedWeight) continue;
				if (w > 0 || this.d0[i * nb + bi] < opts.collideRadius) cand.push(bi);
			}
			candStart[i + 1] = cand.length;
		}
		this.candStart = candStart;
		this.cand = Uint8Array.from(cand);

		this.base = new Float32Array(nv * 3);
		this.delta = new Float32Array(nv * 3);
		this.tmp = new Float32Array(nv * 3);
		this.mark = new Uint8Array(nv);
		this.active = new Uint32Array(nv);
	}
}

export class Deformer {
	readonly opts: DeformerOptions;
	readonly stats = { pushed: 0 };
	private readonly rig: Rig;
	private readonly assets: JointAssets;
	private readonly nb: number;
	private readonly bones: BoneState[];
	private readonly states: MuscleState[];
	private readonly byName: Map<string, MuscleState>;

	constructor(assets: JointAssets, rig: Rig, opts: Partial<DeformerOptions> = {}) {
		this.opts = { ...DEFAULT_DEFORMER_OPTIONS, ...opts };
		this.rig = rig;
		this.assets = assets;
		this.nb = assets.boneCount;
		if (rig.boneCount !== this.nb) throw new Error('Rig and assets disagree on bone count');
		this.bones = Array.from({ length: this.nb }, () => ({ R: [0, 0, 0, 1], T: [0, 0, 0], Dq: [0, 0, 0, 0], M3: qToMat3([0, 0, 0, 1]) }));
		this.states = assets.muscles.map((m) => new MuscleState(m, this.nb, assets.fields, this.opts));
		this.byName = new Map(this.states.map((s) => [s.mesh.name, s]));
		this.setTransforms(rig.solve(rig.initialPose()));
	}

	/** Current bulge factor of a muscle mesh (1 = rest). */
	bulgeOf(name: string): number {
		return this.byName.get(name)?.k ?? 1;
	}

	/** Column-major 4x4 world matrix of a bone at the last posed state. */
	boneMatrix(b: number): number[] {
		const s = this.bones[b];
		return rigidToMat4({ q: s.R, t: s.T });
	}

	/** Deform every muscle into `out` (one position array per muscle mesh name). */
	update(pose: Pose, out: Record<string, Float32Array>): void {
		this.setTransforms(this.rig.solve(pose));
		for (const s of this.states) this.skinCenterline(s);
		this.stats.pushed = 0;
		for (const s of this.states) {
			const target = out[s.mesh.name];
			if (!target) continue;
			this.deformMuscle(s, target);
		}
	}

	/** Count vertices deeper in a bone than at rest by more than `tol` mm (validation). */
	penetration(name: string, P: Float32Array, tol: number): { n: number; worst: number } {
		const s = this.byName.get(name);
		if (!s) throw new Error(`Unknown muscle ${name}`);
		const nb = this.nb, W = s.mesh.weights;
		let n = 0, worst = 0;
		for (let i = 0; i < s.mesh.nv; i++)
			for (let b = 0; b < nb; b++) {
				const g = this.assets.fields[b];
				if (!g || W[i * nb + b] > this.opts.pinnedWeight) continue;
				const d = this.sampleInBone(b, g, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
				const lim = Math.min(s.d0[i * nb + b], 0);
				if (d < lim - tol) {
					n++;
					worst = Math.max(worst, lim - d);
				}
			}
		return { n, worst };
	}

	// ---------------------------------------------------------------------------------------

	private setTransforms(world: Rigid[]): void {
		world.forEach((w, i) => {
			const b = this.bones[i];
			b.R = w.q;
			b.T = w.t;
			const d = qMul([w.t[0], w.t[1], w.t[2], 0], w.q);
			b.Dq = [d[0] / 2, d[1] / 2, d[2] / 2, d[3] / 2];
			b.M3 = qToMat3(w.q);
		});
	}

	/**
	 * Skin point (x,y,z) into out[o..o+2]. Weights are sparse: bones idx[a..a+count) with weights
	 * val[a..a+count), in ascending bone order.
	 */
	private skin(x: number, y: number, z: number, idx: ArrayLike<number>, val: ArrayLike<number>, a: number, count: number, out: Float32Array | Float64Array, o: number): void {
		const bones = this.bones, end = a + count;
		if (!this.opts.dqs) {
			let X = 0, Y = 0, Z = 0;
			for (let k = a; k < end; k++) {
				const b = idx[k], w = val[k];
				const p = qRotate(bones[b].R, [x, y, z]);
				X += w * (p[0] + bones[b].T[0]);
				Y += w * (p[1] + bones[b].T[1]);
				Z += w * (p[2] + bones[b].T[2]);
			}
			out[o] = X; out[o + 1] = Y; out[o + 2] = Z;
			return;
		}
		let piv = a;
		for (let k = a + 1; k < end; k++) if (val[k] > val[piv]) piv = k;
		const P = bones[idx[piv]].R;
		let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0;
		for (let k = a; k < end; k++) {
			const b = idx[k];
			let w = val[k];
			const R = bones[b].R, D = bones[b].Dq;
			if (R[0] * P[0] + R[1] * P[1] + R[2] * P[2] + R[3] * P[3] < 0) w = -w;
			rx += w * R[0]; ry += w * R[1]; rz += w * R[2]; rw += w * R[3];
			dx += w * D[0]; dy += w * D[1]; dz += w * D[2]; dw += w * D[3];
		}
		const n = 1 / Math.hypot(rx, ry, rz, rw);
		rx *= n; ry *= n; rz *= n; rw *= n;
		dx *= n; dy *= n; dz *= n; dw *= n;
		const tx = 2 * (ry * z - rz * y), ty = 2 * (rz * x - rx * z), tz = 2 * (rx * y - ry * x);
		const px = x + rw * tx + ry * tz - rz * ty;
		const py = y + rw * ty + rz * tx - rx * tz;
		const pz = z + rw * tz + rx * ty - ry * tx;
		// translation = 2 (rw·d − dw·r + r × d)
		out[o] = px + 2 * (rw * dx - dw * rx + ry * dz - rz * dy);
		out[o + 1] = py + 2 * (rw * dy - dw * ry + rz * dx - rx * dz);
		out[o + 2] = pz + 2 * (rw * dz - dw * rz + rx * dy - ry * dx);
	}

	private skinCenterline(s: MuscleState): void {
		const c = s.mesh.centerline, sw = s.centerWeights;
		for (let k = 0; k < s.bins; k++) this.skin(c.C[k][0], c.C[k][1], c.C[k][2], sw.idx, sw.val, sw.start[k], sw.start[k + 1] - sw.start[k], s.centerSkinned, k * 3);
	}

	private bulgeFactor(s: MuscleState): number {
		const c = s.mesh.centerline;
		if (!this.opts.bulge || !c.bulge) return 1;
		const ref = this.byName.get(c.lenref) ?? s;
		const ratio = centerlineLength(ref.centerSkinned, ref.bins, !!ref.mesh.centerline.path) / ref.restLength;
		const belly = Math.max(0.3, 1 - (1 - ratio) / this.opts.bellyFrac);
		return Math.min(this.opts.kMax, Math.max(this.opts.kMin, 1 / Math.sqrt(belly)));
	}

	private sampleInBone(b: number, g: SdfGrid, px: number, py: number, pz: number): number {
		const B = this.bones[b], M = B.M3;
		const x = px - B.T[0], y = py - B.T[1], z = pz - B.T[2];
		// local = Rᵀ (p − T)
		return sdfSample(g, M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z);
	}

	/** Push vertex i (stored at P[o..o+2]) out of any bone it is deeper in than allowed. */
	private project(s: MuscleState, i: number, P: Float32Array, o: number): boolean {
		const nb = this.nb, cand = s.cand;
		let moved = false;
		for (let c = s.candStart[i]; c < s.candStart[i + 1]; c++) {
			const b = cand[c], g = this.assets.fields[b]!;
			const B = this.bones[b], M = B.M3;
			const x = P[o] - B.T[0], y = P[o + 1] - B.T[1], z = P[o + 2] - B.T[2];
			const lx = M[0] * x + M[1] * y + M[2] * z, ly = M[3] * x + M[4] * y + M[5] * z, lz = M[6] * x + M[7] * y + M[8] * z;
			const d = sdfSample(g, lx, ly, lz);
			const target = Math.min(s.d0[i * nb + b], this.opts.margin);
			if (d >= target - 0.05) continue;
			const gr = sdfGradient(g, lx, ly, lz);
			if (!gr) continue;
			const k = target - d; // world normal = R · grad
			P[o] += k * (M[0] * gr[0] + M[3] * gr[1] + M[6] * gr[2]);
			P[o + 1] += k * (M[1] * gr[0] + M[4] * gr[1] + M[7] * gr[2]);
			P[o + 2] += k * (M[2] * gr[0] + M[5] * gr[1] + M[8] * gr[2]);
			moved = true;
		}
		return moved;
	}

	private deformMuscle(s: MuscleState, out: Float32Array): void {
		const { nv, rest: R, centerline: c } = s.mesh;
		const base = s.base, NB = s.bins, Cs = s.centerSkinned, sw = s.skinWeights;
		const k = (s.k = this.bulgeFactor(s));

		for (let i = 0; i < nv; i++) {
			const o = i * 3;
			this.skin(R[o], R[o + 1], R[o + 2], sw.idx, sw.val, sw.start[i], sw.start[i + 1] - sw.start[i], base, o);
			if (k === 1) continue;
			const uu = s.u[i], k0 = Math.min(NB - 2, uu | 0), f = uu - k0;
			const prof = c.prof[k0] + (c.prof[k0 + 1] - c.prof[k0]) * f;
			if (prof <= 0.02) continue;
			const a = k0 * 3, b = a + 3;
			const cx = Cs[a] + (Cs[b] - Cs[a]) * f, cy = Cs[a + 1] + (Cs[b + 1] - Cs[a + 1]) * f, cz = Cs[a + 2] + (Cs[b + 2] - Cs[a + 2]) * f;
			let Tx = Cs[b] - Cs[a], Ty = Cs[b + 1] - Cs[a + 1], Tz = Cs[b + 2] - Cs[a + 2];
			const tl = Math.hypot(Tx, Ty, Tz) || 1;
			Tx /= tl; Ty /= tl; Tz /= tl;
			let rx = base[o] - cx, ry = base[o + 1] - cy, rz = base[o + 2] - cz;
			const ax = rx * Tx + ry * Ty + rz * Tz;
			rx -= ax * Tx; ry -= ax * Ty; rz -= ax * Tz;
			const g = (k - 1) * prof;
			base[o] += rx * g; base[o + 1] += ry * g; base[o + 2] += rz * g;
		}

		out.set(base);
		if (!this.opts.collide) return;

		const { delta, mark, active: act, tmp, adjStart, adj } = s;
		let na = 0;
		for (let i = 0; i < nv; i++) if (this.project(s, i, out, i * 3)) { mark[i] = 1; act[na++] = i; }
		this.stats.pushed += na;
		if (!na) return;

		for (let it = 0; it < this.opts.smoothIters; it++) {
			const n0 = na; // grow the active set by one ring
			for (let a = 0; a < n0; a++) {
				const i = act[a];
				for (let j = adjStart[i]; j < adjStart[i + 1]; j++) {
					const v = adj[j];
					if (!mark[v]) { mark[v] = 1; act[na++] = v; }
				}
			}
			for (let a = 0; a < na; a++) {
				const o = act[a] * 3;
				delta[o] = out[o] - base[o]; delta[o + 1] = out[o + 1] - base[o + 1]; delta[o + 2] = out[o + 2] - base[o + 2];
			}
			for (let a = 0; a < na; a++) {
				const i = act[a], o = i * 3;
				let sx = delta[o], sy = delta[o + 1], sz = delta[o + 2], cnt = 1;
				for (let j = adjStart[i]; j < adjStart[i + 1]; j++) {
					const v = adj[j];
					if (!mark[v]) continue;
					const q = v * 3;
					sx += delta[q]; sy += delta[q + 1]; sz += delta[q + 2]; cnt++;
				}
				tmp[o] = sx / cnt; tmp[o + 1] = sy / cnt; tmp[o + 2] = sz / cnt;
			}
			for (let a = 0; a < na; a++) {
				const i = act[a], o = i * 3;
				out[o] = base[o] + tmp[o]; out[o + 1] = base[o + 1] + tmp[o + 1]; out[o + 2] = base[o + 2] + tmp[o + 2];
				this.project(s, i, out, o);
			}
		}
		for (let pass = 0; pass < this.opts.finalPasses; pass++) for (let a = 0; a < na; a++) this.project(s, act[a], out, act[a] * 3);
		for (let a = 0; a < na; a++) mark[act[a]] = 0;
	}
}
