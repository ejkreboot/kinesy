/**
 * Deformation quality metrics for validation, computed from posed meshes alone (independent of
 * how the deformer got there):
 *   overlap: vertices inside another muscle (ray parity against its posed triangles), and how deep;
 *   fray:    triangles turned over and vertices displaced unevenly relative to a reference shape
 *            (the skinning target), the signature of a surface torn up by per-vertex corrections.
 */

export interface PosedMesh {
	name: string;
	P: Float32Array;
	index: ArrayLike<number>;
	/** meshes sharing a group may overlap (heads of one muscle) */
	group: number;
}

/** Triangles of one mesh binned on a uniform grid by bounding box: in 2D (y, z) for ray casting
 * along x, or in 3D for nearest-surface search. */
class TriGrid {
	readonly lo: number[];
	readonly dims: number[];
	readonly start: Uint32Array;
	readonly items: Uint32Array;

	constructor(readonly m: PosedMesh, readonly cell: number, readonly axes: number[]) {
		const { P, index } = m, nt = index.length / 3;
		const lo = axes.map(() => Infinity), hi = axes.map(() => -Infinity);
		for (let v = 0; v < P.length / 3; v++)
			axes.forEach((a, k) => {
				lo[k] = Math.min(lo[k], P[v * 3 + a]);
				hi[k] = Math.max(hi[k], P[v * 3 + a]);
			});
		this.lo = lo;
		this.dims = axes.map((_, k) => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell) + 1));
		const ncell = this.dims.reduce((a, b) => a * b, 1);
		const counts = new Uint32Array(ncell + 1);
		const visit = (t: number, f: (c: number) => void) => {
			const tlo = axes.map(() => Infinity), thi = axes.map(() => -Infinity);
			for (let c = 0; c < 3; c++) {
				const v = index[t * 3 + c];
				axes.forEach((a, k) => {
					tlo[k] = Math.min(tlo[k], P[v * 3 + a]);
					thi[k] = Math.max(thi[k], P[v * 3 + a]);
				});
			}
			const i0 = axes.map((_, k) => Math.floor((tlo[k] - lo[k]) / cell)), i1 = axes.map((_, k) => Math.floor((thi[k] - lo[k]) / cell));
			if (axes.length === 2) {
				for (let a = i0[0]; a <= i1[0]; a++) for (let b = i0[1]; b <= i1[1]; b++) f(a + this.dims[0] * b);
			} else {
				for (let a = i0[0]; a <= i1[0]; a++)
					for (let b = i0[1]; b <= i1[1]; b++) for (let c = i0[2]; c <= i1[2]; c++) f(a + this.dims[0] * (b + this.dims[1] * c));
			}
		};
		for (let t = 0; t < nt; t++) visit(t, (c) => counts[c + 1]++);
		for (let c = 0; c < ncell; c++) counts[c + 1] += counts[c];
		const fill = counts.slice(0, ncell), items = new Uint32Array(counts[ncell]);
		for (let t = 0; t < nt; t++) visit(t, (c) => (items[fill[c]++] = t));
		this.start = counts;
		this.items = items;
	}

	/** cell index of a point, or -1 outside the grid */
	cellOf(p: number[]): number {
		let c = 0, mul = 1;
		for (let k = 0; k < this.axes.length; k++) {
			const i = Math.floor((p[k] - this.lo[k]) / this.cell);
			if (i < 0 || i >= this.dims[k]) return -1;
			c += i * mul;
			mul *= this.dims[k];
		}
		return c;
	}
}

/** Whether (x, y, z) lies inside the closed mesh: parity of crossings of a ray toward +x. */
function inside(g: TriGrid, x: number, y: number, z: number): boolean {
	const c = g.cellOf([y, z]);
	if (c < 0) return false;
	const { P, index } = g.m;
	let n = 0;
	for (let k = g.start[c]; k < g.start[c + 1]; k++) {
		const t = g.items[k], a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, d = index[t * 3 + 2] * 3;
		// barycentrics of (y, z) in the triangle projected onto the yz plane
		const y0 = P[a + 1], z0 = P[a + 2], y1 = P[b + 1] - y0, z1 = P[b + 2] - z0, y2 = P[d + 1] - y0, z2 = P[d + 2] - z0;
		const det = y1 * z2 - y2 * z1;
		if (Math.abs(det) < 1e-12) continue;
		const py = y - y0, pz = z - z0;
		const u = (py * z2 - y2 * pz) / det, v = (y1 * pz - py * z1) / det;
		if (u < 0 || v < 0 || u + v > 1) continue;
		if (P[a] + u * (P[b] - P[a]) + v * (P[d] - P[a]) > x) n++;
	}
	return (n & 1) === 1;
}

/** Squared distance from p to triangle (a, b, c) (Ericson, Real-Time Collision Detection 5.1.5). */
export function pointTriDist2(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number): number {
	const ax = P[a], ay = P[a + 1], az = P[a + 2];
	const abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az;
	const acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
	const apx = px - ax, apy = py - ay, apz = pz - az;
	const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
	let qx: number, qy: number, qz: number;
	const bpx = px - P[b], bpy = py - P[b + 1], bpz = pz - P[b + 2];
	const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
	const cpx = px - P[c], cpy = py - P[c + 1], cpz = pz - P[c + 2];
	const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
	const va = d3 * d6 - d5 * d4, vb = d5 * d2 - d1 * d6, vc = d1 * d4 - d3 * d2;
	if (d1 <= 0 && d2 <= 0) [qx, qy, qz] = [ax, ay, az];
	else if (d3 >= 0 && d4 <= d3) [qx, qy, qz] = [P[b], P[b + 1], P[b + 2]];
	else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
		const v = d1 / (d1 - d3);
		[qx, qy, qz] = [ax + v * abx, ay + v * aby, az + v * abz];
	} else if (d6 >= 0 && d5 <= d6) [qx, qy, qz] = [P[c], P[c + 1], P[c + 2]];
	else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
		const w = d2 / (d2 - d6);
		[qx, qy, qz] = [ax + w * acx, ay + w * acy, az + w * acz];
	} else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
		const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
		[qx, qy, qz] = [P[b] + w * (P[c] - P[b]), P[b + 1] + w * (P[c + 1] - P[b + 1]), P[b + 2] + w * (P[c + 2] - P[b + 2])];
	} else {
		const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
		[qx, qy, qz] = [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
	}
	return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/** Distance from (x, y, z) to the nearest triangle of the mesh, searching outward cell by cell. */
function nearest(g: TriGrid, x: number, y: number, z: number, maxRings = 12): number {
	const { P, index } = g.m, cs = g.cell;
	const ix = Math.floor((x - g.lo[0]) / cs), iy = Math.floor((y - g.lo[1]) / cs), iz = Math.floor((z - g.lo[2]) / cs);
	let best = Infinity;
	for (let r = 0; r <= maxRings; r++) {
		for (let a = ix - r; a <= ix + r; a++)
			for (let b = iy - r; b <= iy + r; b++)
				for (let c = iz - r; c <= iz + r; c++) {
					if (Math.max(Math.abs(a - ix), Math.abs(b - iy), Math.abs(c - iz)) !== r) continue;
					if (a < 0 || b < 0 || c < 0 || a >= g.dims[0] || b >= g.dims[1] || c >= g.dims[2]) continue;
					const cell = a + g.dims[0] * (b + g.dims[1] * c);
					for (let k = g.start[cell]; k < g.start[cell + 1]; k++) {
						const t = g.items[k];
						best = Math.min(best, pointTriDist2(x, y, z, P, index[t * 3] * 3, index[t * 3 + 1] * 3, index[t * 3 + 2] * 3));
					}
				}
		// everything beyond ring r is at least r cells away
		if (best < (r * cs) ** 2) break;
	}
	return Math.sqrt(best);
}

export interface OverlapReport {
	/** vertices deeper than tol inside another muscle */
	n: number;
	/** deepest such vertex, mm */
	worst: number;
	/** the worst pairs, "inside>container n/worst" */
	pairs: string[];
}

/** Vertices lying inside another muscle (not of their own group) by more than `tol` mm. */
export function muscleOverlap(meshes: PosedMesh[], tol: number): OverlapReport {
	const rays = meshes.map((m) => new TriGrid(m, 4, [1, 2]));
	const near = meshes.map((m) => new TriGrid(m, 6, [0, 1, 2]));
	const box = meshes.map((m) => {
		const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < m.P.length; i++) {
			lo[i % 3] = Math.min(lo[i % 3], m.P[i]);
			hi[i % 3] = Math.max(hi[i % 3], m.P[i]);
		}
		return { lo, hi };
	});
	let n = 0, worst = 0;
	const pairs: [string, number, number][] = [];
	meshes.forEach((a) =>
		meshes.forEach((b, bi) => {
			if (a === b || a.group === b.group) return;
			const { lo, hi } = box[bi];
			let pn = 0, pw = 0;
			for (let v = 0; v < a.P.length / 3; v++) {
				const x = a.P[v * 3], y = a.P[v * 3 + 1], z = a.P[v * 3 + 2];
				if (x < lo[0] || y < lo[1] || z < lo[2] || x > hi[0] || y > hi[1] || z > hi[2]) continue;
				if (!inside(rays[bi], x, y, z)) continue;
				const d = nearest(near[bi], x, y, z);
				if (d <= tol) continue;
				pn++;
				pw = Math.max(pw, d);
			}
			if (!pn) return;
			n += pn;
			worst = Math.max(worst, pw);
			pairs.push([`${a.name}>${b.name}`, pn, pw]);
		})
	);
	pairs.sort((p, q) => q[2] - p[2]);
	return { n, worst, pairs: pairs.map(([k, c, w]) => `${k} ${c}/${w.toFixed(1)}`) };
}

export interface FrayReport {
	/** triangles whose facing turned over relative to the reference */
	flips: number;
	/** vertices whose displacement from the reference differs from their neighbours' mean by
	 * more than `rough` mm */
	rough: number;
}

/** Tearing of the surface relative to a reference shape of the same meshes (the skinning target). */
export function fray(P: Float32Array[], ref: Float32Array[], index: ArrayLike<number>[], rough = 1.5): FrayReport {
	let flips = 0, nrough = 0;
	P.forEach((p, m) => {
		const q = ref[m], I = index[m], nv = p.length / 3;
		const sum = new Float64Array(nv * 3), cnt = new Uint32Array(nv);
		for (let f = 0; f < I.length; f += 3) {
			for (let a = 0; a < 3; a++)
				for (let b = 0; b < 3; b++) {
					if (a === b) continue;
					const i = I[f + a], j = I[f + b];
					for (let k = 0; k < 3; k++) sum[i * 3 + k] += p[j * 3 + k] - q[j * 3 + k];
					cnt[i]++;
				}
			const a = I[f] * 3, b = I[f + 1] * 3, c = I[f + 2] * 3;
			const n = (X: Float32Array) => {
				const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
				const vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
				return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
			};
			const s = n(p), t = n(q);
			if (s[0] * t[0] + s[1] * t[1] + s[2] * t[2] < 0) flips++;
		}
		for (let i = 0; i < nv; i++) {
			if (!cnt[i]) continue;
			let d = 0;
			for (let k = 0; k < 3; k++) d += (p[i * 3 + k] - q[i * 3 + k] - sum[i * 3 + k] / cnt[i]) ** 2;
			if (d > rough * rough) nrough++;
		}
	});
	return { flips, rough: nrough };
}
