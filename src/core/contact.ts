/**
 * Muscle-to-muscle contact, found exactly on the posed meshes each frame.
 *
 * Each muscle's posed triangles are binned on grids. A vertex of muscle A lies inside muscle B if a
 * ray from it crosses B's surface an odd number of times. It is pushed back along A's inward normal
 * averaged over its patch (the connected vertices of A inside B) — the way A's surface came in, one
 * direction so the patch moves as a piece — to where that line leaves B. Where that line only
 * grazes along inside B (at the rim of a sheet), the vertex takes the nearest way out of B instead,
 * unless that is B's far side (the vertex past B's midline: deeper than half B's local thickness,
 * the way out leading on away from A).
 * B's vertices inside A are pushed back along B's normals the same way, and each side takes a
 * share of its push by how much room it has (a muscle lying on bone gives little), so the two
 * surfaces meet between where they were. No push may carry a surface past its own far side (a thin
 * muscle engulfed by a thick one is left as it is rather than folded inside out).
 *
 * The pushes are returned as half-space constraints on each vertex's displacement (see relax.ts),
 * which spreads them smoothly over the muscle.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import { Constraints, SLOT_CONTACT } from './relax';

export interface ContactMesh {
	nv: number;
	rest: Float32Array;
	index: ArrayLike<number>;
	/** vertex adjacency, CSR */
	adjStart: Uint32Array;
	adj: Uint32Array;
	/** muscles sharing a group may overlap freely (heads of one muscle, parts of one sheet) */
	group: number;
}

export interface ContactOptions {
	/** clearance left between surfaces pushed apart, mm */
	clearance: number;
	/** overlaps shallower than this (along the vertex's own normal) are left, mm: what the
	 * pipeline's rest separation leaves */
	minDepth: number;
	/** a push may carry a vertex at most this share of the way to its own far side */
	maxThickness: number;
	/** how far a push is looked for (the deepest overlap resolved), mm */
	reach: number;
}

export const DEFAULT_CONTACT_OPTIONS: ContactOptions = { clearance: 0.3, minDepth: 0.4, maxThickness: 0.4, reach: 40 };

/** Triangles of one mesh binned on a uniform 3D grid (for rays in any direction) and a 2D grid
 * over (y, z) (for the parity ray along +x). Rebuilt in place. */
class TriGrid {
	P: ArrayLike<number> = new Float32Array(0);
	readonly lo = [0, 0, 0];
	readonly hi = [0, 0, 0];
	readonly dims = [1, 1, 1];
	start = new Uint32Array(1);
	items = new Uint32Array(1024);
	yzStart = new Uint32Array(1);
	yzItems = new Uint32Array(1024);
	/** per 3D cell: SURFACE (holds triangles), OUTSIDE or INSIDE the mesh (empty cells, by flood
	 * fill from the grid's border); only points in surface cells need a parity ray */
	cellState = new Uint8Array(1);
	private fill = new Uint32Array(1);
	/** per triangle, the last query that tested it (so a ray tests each once) */
	stamp: Uint32Array;
	query = 0;

	constructor(readonly index: ArrayLike<number>, readonly cell: number) {
		this.stamp = new Uint32Array(index.length / 3);
	}

	build(P: ArrayLike<number>, nv: number): void {
		this.P = P;
		const lo = this.lo, hi = this.hi, cs = this.cell, I = this.index, nt = I.length / 3;
		lo[0] = lo[1] = lo[2] = Infinity;
		hi[0] = hi[1] = hi[2] = -Infinity;
		for (let v = 0; v < nv; v++)
			for (let k = 0; k < 3; k++) {
				const x = P[v * 3 + k];
				if (x < lo[k]) lo[k] = x;
				if (x > hi[k]) hi[k] = x;
			}
		for (let k = 0; k < 3; k++) this.dims[k] = Math.max(1, Math.floor((hi[k] - lo[k]) / cs) + 1);
		const [nx, ny, nz] = this.dims, n3 = nx * ny * nz, fy = ny * YZ_SPLIT, n2 = fy * nz * YZ_SPLIT, fc = cs / YZ_SPLIT;
		if (this.start.length < n3 + 1) this.start = new Uint32Array(n3 + 1);
		if (this.yzStart.length < n2 + 1) this.yzStart = new Uint32Array(n2 + 1);
		const s3 = this.start, s2 = this.yzStart;
		s3.fill(0, 0, n3 + 1);
		s2.fill(0, 0, n2 + 1);
		const bb = BOX;
		for (let pass = 0; pass < 2; pass++) {
			const f3 = pass ? s3.slice(0, n3) : null, f2 = pass ? s2.slice(0, n2) : null;
			for (let t = 0; t < nt; t++) {
				const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
				for (let k = 0; k < 3; k++) {
					bb[k] = Math.min(P[a + k], P[b + k], P[c + k]) - lo[k];
					bb[k + 3] = Math.max(P[a + k], P[b + k], P[c + k]) - lo[k];
				}
				const x0 = Math.floor(bb[0] / cs), x1 = Math.floor(bb[3] / cs);
				const y0 = Math.floor(bb[1] / cs), y1 = Math.floor(bb[4] / cs);
				const z0 = Math.floor(bb[2] / cs), z1 = Math.floor(bb[5] / cs);
				for (let k = z0; k <= z1; k++)
					for (let j = y0; j <= y1; j++)
						for (let i = x0; i <= x1; i++) {
							const c3 = i + nx * (j + ny * k);
							if (f3) this.items[f3[c3]++] = t;
							else s3[c3 + 1]++;
						}
				// the parity columns are finer, so each ray tests fewer triangles
				const j0 = Math.floor(bb[1] / fc), j1 = Math.floor(bb[4] / fc), k0 = Math.floor(bb[2] / fc), k1 = Math.floor(bb[5] / fc);
				for (let k = k0; k <= k1; k++)
					for (let j = j0; j <= j1; j++) {
						const c2 = j + fy * k;
						if (f2) this.yzItems[f2[c2]++] = t;
						else s2[c2 + 1]++;
					}
			}
			if (!pass) {
				for (let c = 0; c < n3; c++) s3[c + 1] += s3[c];
				for (let c = 0; c < n2; c++) s2[c + 1] += s2[c];
				if (this.items.length < s3[n3]) this.items = new Uint32Array(s3[n3] * 1.5);
				if (this.yzItems.length < s2[n2]) this.yzItems = new Uint32Array(s2[n2] * 1.5);
			}
		}
		this.classify();
	}

	/** Mark empty cells reachable from the grid's border without crossing a surface cell as
	 * outside; the surface is closed and every cell it passes through holds a triangle, so the
	 * empty cells left over are inside. */
	private classify(): void {
		const [nx, ny, nz] = this.dims, n3 = nx * ny * nz;
		if (this.cellState.length < n3) {
			this.cellState = new Uint8Array(n3);
			this.fill = new Uint32Array(n3);
		}
		const st = this.cellState, q = this.fill, s3 = this.start;
		for (let c = 0; c < n3; c++) st[c] = s3[c + 1] > s3[c] ? SURFACE : INSIDE;
		let qn = 0;
		const seed = (c: number) => {
			if (st[c] === INSIDE) {
				st[c] = OUTSIDE;
				q[qn++] = c;
			}
		};
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++)
				for (let i = 0; i < nx; i++)
					if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) seed(i + nx * (j + ny * k));
		for (let h = 0; h < qn; h++) {
			const c = q[h], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / (nx * ny)) | 0;
			if (i > 0) seed(c - 1);
			if (i < nx - 1) seed(c + 1);
			if (j > 0) seed(c - nx);
			if (j < ny - 1) seed(c + nx);
			if (k > 0) seed(c - nx * ny);
			if (k < nz - 1) seed(c + nx * ny);
		}
	}

	contains(x: number, y: number, z: number): boolean {
		const lo = this.lo, hi = this.hi;
		return x >= lo[0] && y >= lo[1] && z >= lo[2] && x <= hi[0] && y <= hi[1] && z <= hi[2];
	}

	/** Whether (x, y, z) is inside the closed mesh: by its cell, or near the surface by the
	 * parity of crossings of the ray toward +x. */
	inside(x: number, y: number, z: number): boolean {
		if (!this.contains(x, y, z)) return false;
		const cs = this.cell, [nx, ny] = this.dims;
		const i = Math.floor((x - this.lo[0]) / cs), j = Math.floor((y - this.lo[1]) / cs), k = Math.floor((z - this.lo[2]) / cs);
		const state = this.cellState[i + nx * (j + ny * k)];
		if (state !== SURFACE) return state === INSIDE;
		const fc = cs / YZ_SPLIT, jf = Math.min(ny * YZ_SPLIT - 1, Math.floor((y - this.lo[1]) / fc)), kf = Math.floor((z - this.lo[2]) / fc);
		const c = jf + ny * YZ_SPLIT * kf, P = this.P, I = this.index;
		let n = 0;
		for (let s = this.yzStart[c]; s < this.yzStart[c + 1]; s++) {
			const t = this.yzItems[s], a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, d = I[t * 3 + 2] * 3;
			const y0 = P[a + 1], z0 = P[a + 2], y1 = P[b + 1] - y0, z1 = P[b + 2] - z0, y2 = P[d + 1] - y0, z2 = P[d + 2] - z0;
			const det = y1 * z2 - y2 * z1;
			if (det === 0) continue;
			const py = y - y0, pz = z - z0;
			const u = (py * z2 - y2 * pz) / det, v = (y1 * pz - py * z1) / det;
			if (u < 0 || v < 0 || u + v > 1) continue;
			if (P[a] + u * (P[b] - P[a]) + v * (P[d] - P[a]) > x) n++;
		}
		return (n & 1) === 1;
	}

	/**
	 * First crossing of the ray o + t·dir (dir unit, 0 < t ≤ tmax) with the mesh, walking the grid
	 * cell by cell. Returns t (Infinity if none) and the triangle in `hit`.
	 */
	ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tmax: number, tmin = 0): number {
		const lo = this.lo, cs = this.cell, [nx, ny, nz] = this.dims, P = this.P, I = this.index, stamp = this.stamp;
		const q = ++this.query;
		// clip the ray to the grid box
		let t0 = tmin, t1 = tmax;
		const o = [ox, oy, oz], d = [dx, dy, dz];
		for (let k = 0; k < 3; k++) {
			const a = lo[k], b = lo[k] + this.dims[k] * cs;
			if (Math.abs(d[k]) < 1e-12) {
				if (o[k] < a || o[k] > b) return Infinity;
				continue;
			}
			let ta = (a - o[k]) / d[k], tb = (b - o[k]) / d[k];
			if (ta > tb) [ta, tb] = [tb, ta];
			t0 = Math.max(t0, ta);
			t1 = Math.min(t1, tb);
		}
		if (t0 > t1) return Infinity;
		// 3D DDA (Amanatides & Woo)
		const p = [ox + t0 * dx, oy + t0 * dy, oz + t0 * dz];
		const cell = [0, 0, 0], step = [0, 0, 0], next = [0, 0, 0], delta = [0, 0, 0];
		for (let k = 0; k < 3; k++) {
			cell[k] = Math.min(this.dims[k] - 1, Math.max(0, Math.floor((p[k] - lo[k]) / cs)));
			step[k] = d[k] > 0 ? 1 : -1;
			const edge = lo[k] + (cell[k] + (d[k] > 0 ? 1 : 0)) * cs;
			next[k] = Math.abs(d[k]) < 1e-12 ? Infinity : t0 + (edge - p[k]) / d[k];
			delta[k] = Math.abs(d[k]) < 1e-12 ? Infinity : cs / Math.abs(d[k]);
		}
		let best = Infinity;
		this.hit = -1;
		for (;;) {
			const c = cell[0] + nx * (cell[1] + ny * cell[2]);
			for (let s = this.start[c]; s < this.start[c + 1]; s++) {
				const t = this.items[s];
				if (stamp[t] === q) continue;
				stamp[t] = q;
				const h = rayTri(ox, oy, oz, dx, dy, dz, P, I[t * 3] * 3, I[t * 3 + 1] * 3, I[t * 3 + 2] * 3);
				if (h > tmin && h <= tmax && h < best) {
					best = h;
					this.hit = t;
				}
			}
			const k = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2;
			// a crossing found in this cell is nearer than anything in the cells beyond
			if (best <= next[k] || next[k] > t1) break;
			cell[k] += step[k];
			if (cell[k] < 0 || cell[k] >= (k === 0 ? nx : k === 1 ? ny : nz)) break;
			next[k] += delta[k];
		}
		return best;
	}

	hit = -1;
	/** closest point found by nearest() */
	readonly near = new Float64Array(3);

	/** Distance from (x, y, z) to the nearest triangle (searching outward ring by ring, at most
	 * `rings` cells), its closest point into `near` and the triangle into `hit`. */
	nearest(x: number, y: number, z: number, rings = 4): number {
		const cs = this.cell, [nx, ny, nz] = this.dims, P = this.P, I = this.index, lo = this.lo;
		const ix = Math.floor((x - lo[0]) / cs), iy = Math.floor((y - lo[1]) / cs), iz = Math.floor((z - lo[2]) / cs);
		const q = ++this.query, near = this.near, c = CLOSEST;
		let best = Infinity;
		this.hit = -1;
		for (let r = 0; r <= rings; r++) {
			for (let k = iz - r; k <= iz + r; k++)
				for (let j = iy - r; j <= iy + r; j++)
					for (let i = ix - r; i <= ix + r; i++) {
						if (Math.max(Math.abs(i - ix), Math.abs(j - iy), Math.abs(k - iz)) !== r) continue;
						if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
						const cell = i + nx * (j + ny * k);
						for (let s = this.start[cell]; s < this.start[cell + 1]; s++) {
							const t = this.items[s];
							if (this.stamp[t] === q) continue;
							this.stamp[t] = q;
							const d2 = closestOnTri(x, y, z, P, I[t * 3] * 3, I[t * 3 + 1] * 3, I[t * 3 + 2] * 3, c);
							if (d2 < best) {
								best = d2;
								this.hit = t;
								near[0] = c[0];
								near[1] = c[1];
								near[2] = c[2];
							}
						}
					}
			// anything beyond ring r is at least r cells away
			if (best < (r * cs) ** 2) break;
		}
		return Math.sqrt(best);
	}
}

const CLOSEST = new Float64Array(3);

/** Closest point on triangle (a, b, c) to p into out; returns the squared distance (Ericson,
 * Real-Time Collision Detection 5.1.5). */
function closestOnTri(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number, out: Float64Array): number {
	const ax = P[a], ay = P[a + 1], az = P[a + 2];
	const abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az;
	const acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
	const apx = px - ax, apy = py - ay, apz = pz - az;
	const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
	const bpx = px - P[b], bpy = py - P[b + 1], bpz = pz - P[b + 2];
	const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
	const cpx = px - P[c], cpy = py - P[c + 1], cpz = pz - P[c + 2];
	const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
	const va = d3 * d6 - d5 * d4, vb = d5 * d2 - d1 * d6, vc = d1 * d4 - d3 * d2;
	let v = 0, w = 0;
	if (d1 <= 0 && d2 <= 0) (v = 0), (w = 0);
	else if (d3 >= 0 && d4 <= d3) (v = 1), (w = 0);
	else if (vc <= 0 && d1 >= 0 && d3 <= 0) (v = d1 / (d1 - d3)), (w = 0);
	else if (d6 >= 0 && d5 <= d6) (v = 0), (w = 1);
	else if (vb <= 0 && d2 >= 0 && d6 <= 0) (v = 0), (w = d2 / (d2 - d6));
	else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
		w = (d4 - d3) / (d4 - d3 + (d5 - d6));
		v = 1 - w;
	} else {
		const den = 1 / (va + vb + vc);
		v = vb * den;
		w = vc * den;
	}
	out[0] = ax + abx * v + acx * w;
	out[1] = ay + aby * v + acy * w;
	out[2] = az + abz * v + acz * w;
	return (px - out[0]) ** 2 + (py - out[1]) ** 2 + (pz - out[2]) ** 2;
}

const SURFACE = 1, OUTSIDE = 2, INSIDE = 3;
const BOX = new Float64Array(6);
/** parity columns per grid cell along y and along z */
const YZ_SPLIT = 2;
/** A vertex nearer the other muscle's surface than this share of its thickness there is taken to
 * be in its near half, and leaves by the nearest way out; so is one whose nearest way out runs back
 * into its own muscle at least this much (cosine with its inward normal). */
const MIDLINE = 0.45;
const NEAR_COS = 0.2;
/** A patch-direction exit longer than this many times the nearest way out (plus 1 mm) is a line
 * grazing along inside the other muscle, not the way the vertex came in. */
const GRAZE = 2;

/** Ray–triangle intersection (Möller–Trumbore): t along the ray, or NaN. Both facings count. */
function rayTri(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, P: ArrayLike<number>, a: number, b: number, c: number): number {
	const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
	const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
	const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
	const det = e1x * px + e1y * py + e1z * pz;
	if (Math.abs(det) < 1e-12) return NaN;
	const inv = 1 / det;
	const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
	const u = (tx * px + ty * py + tz * pz) * inv;
	if (u < 0 || u > 1) return NaN;
	const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
	const v = (dx * qx + dy * qy + dz * qz) * inv;
	if (v < 0 || u + v > 1) return NaN;
	return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

/** Area-weighted vertex normals of a mesh into N (stride 3, unit). */
export function vertexNormals(P: ArrayLike<number>, index: ArrayLike<number>, nv: number, N: Float32Array): void {
	N.fill(0, 0, nv * 3);
	for (let f = 0; f < index.length; f += 3) {
		const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
		const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
		const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		for (const o of [a, b, c]) {
			N[o] += nx;
			N[o + 1] += ny;
			N[o + 2] += nz;
		}
	}
	for (let v = 0; v < nv; v++) {
		const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
		N[v * 3] /= l;
		N[v * 3 + 1] /= l;
		N[v * 3 + 2] /= l;
	}
}

export class MuscleContact {
	readonly opts: ContactOptions;
	private readonly meshes: ContactMesh[];
	private readonly grids: TriGrid[];
	private readonly normals: Float32Array[];
	/** per muscle, per vertex: rest distance through the muscle along its inward normal */
	readonly thickness: Float32Array[];
	/** per muscle, whether its grid holds its current positions (see detect's `moved`) */
	private readonly built: boolean[];
	// per-pair scratch: vertices inside, their patch, and a queue
	private readonly mark: Uint8Array;
	private readonly inList: Uint32Array;
	private readonly queue: Uint32Array;

	constructor(meshes: ContactMesh[], opts: Partial<ContactOptions> = {}) {
		this.opts = { ...DEFAULT_CONTACT_OPTIONS, ...opts };
		this.meshes = meshes;
		this.grids = meshes.map((m) => new TriGrid(m.index, 8));
		this.normals = meshes.map((m) => new Float32Array(m.nv * 3));
		meshes.forEach((m, i) => this.grids[i].build(m.rest, m.nv));
		this.built = meshes.map(() => false);
		const most = Math.max(...meshes.map((m) => m.nv));
		this.mark = new Uint8Array(most);
		this.inList = new Uint32Array(most);
		this.queue = new Uint32Array(most);
		this.thickness = meshes.map((m, i) => {
			const N = this.normals[i], g = this.grids[i], th = new Float32Array(m.nv);
			vertexNormals(m.rest, m.index, m.nv, N);
			for (let v = 0; v < m.nv; v++) {
				const x = m.rest[v * 3], y = m.rest[v * 3 + 1], z = m.rest[v * 3 + 2];
				const t = g.ray(x, y, z, -N[v * 3], -N[v * 3 + 1], -N[v * 3 + 2], 200, 0.05);
				th[v] = Number.isFinite(t) ? t : 200;
			}
			return th;
		});
	}

	/**
	 * Distance at rest from each vertex, out along its normal, to the nearest other muscle (at
	 * most `max` mm): where a muscle's surface has room to swell.
	 */
	restClearance(max: number): Float32Array[] {
		return this.meshes.map((m, i) => {
			const N = this.normals[i], out = new Float32Array(m.nv).fill(max);
			vertexNormals(m.rest, m.index, m.nv, N);
			for (let v = 0; v < m.nv; v++) {
				const x = m.rest[v * 3], y = m.rest[v * 3 + 1], z = m.rest[v * 3 + 2];
				for (let j = 0; j < this.meshes.length; j++) {
					if (j === i) continue;
					const t = this.grids[j].ray(x, y, z, N[v * 3], N[v * 3 + 1], N[v * 3 + 2], max, 0);
					if (t < out[v]) out[v] = t;
				}
			}
			return out;
		});
	}

	/**
	 * Find the muscles' overlaps at positions P and add a contact constraint to each vertex inside
	 * another muscle. `give`: per muscle, per vertex, how readily it moves (0..1). `rigid`: per
	 * muscle, a class id (≥ 0) if the pose carries it rigidly, shared by muscles carried by the same
	 * transform: such pairs sit as they did at rest, apart, and aren't tested. `moved`: per muscle,
	 * whether it has moved since the last call (default all): the others' grids are reused.
	 * Returns how many vertices were found inside another muscle.
	 */
	detect(P: Float32Array[], give: Float32Array[], K: Constraints[], rigid?: Int32Array, moved?: ArrayLike<boolean>): number {
		const M = this.meshes, G = this.grids, o = this.opts, nm = M.length;
		const skip = (a: number, b: number) => a === b || M[a].group === M[b].group || (!!rigid && rigid[a] >= 0 && rigid[a] === rigid[b]);
		// grids and normals of the muscles in some tested pair, where they have moved since built
		for (let i = 0; i < nm; i++) {
			let used = false;
			for (let j = 0; j < nm && !used; j++) used = !skip(i, j);
			if (!used || (moved && !moved[i] && this.built[i])) continue;
			G[i].build(P[i], M[i].nv);
			vertexNormals(P[i], M[i].index, M[i].nv, this.normals[i]);
			this.built[i] = true;
		}
		let count = 0;
		for (let a = 0; a < nm; a++)
			for (let b = 0; b < nm; b++) {
				if (skip(a, b)) continue;
				const ga = G[a], gb = G[b];
				if (ga.hi[0] < gb.lo[0] || ga.hi[1] < gb.lo[1] || ga.hi[2] < gb.lo[2] || gb.hi[0] < ga.lo[0] || gb.hi[1] < ga.lo[1] || gb.hi[2] < ga.lo[2]) continue;
				const pa = P[a], N = this.normals[a], th = this.thickness[a], thb = this.thickness[b], wa = give[a], wb = give[b], Ib = M[b].index;
				const { adjStart, adj } = M[a], mark = this.mark, inList = this.inList, queue = this.queue;
				let n = 0;
				for (let v = 0; v < M[a].nv; v++)
					if (gb.inside(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2])) {
						mark[v] = 1;
						inList[n++] = v;
					}
				count += n;
				// patches: connected runs of inside vertices, each pushed along its mean inward normal
				for (let i = 0; i < n; i++) {
					const seed = inList[i];
					if (mark[seed] !== 1) continue;
					let qn = 0, dx = 0, dy = 0, dz = 0;
					mark[seed] = 2;
					queue[qn++] = seed;
					for (let q = 0; q < qn; q++) {
						const v = queue[q];
						dx -= N[v * 3];
						dy -= N[v * 3 + 1];
						dz -= N[v * 3 + 2];
						for (let k = adjStart[v]; k < adjStart[v + 1]; k++)
							if (mark[adj[k]] === 1) {
								mark[adj[k]] = 2;
								queue[qn++] = adj[k];
							}
					}
					const l = Math.hypot(dx, dy, dz);
					if (l < 1e-9) continue;
					dx /= l;
					dy /= l;
					dz /= l;
					for (let q = 0; q < qn; q++) {
						const v = queue[q], x = pa[v * 3], y = pa[v * 3 + 1], z = pa[v * 3 + 2];
						// the nearest way out of B, and whether that is B's far side (the vertex past B's
						// midline: deeper than half B's thickness there, the way out leading on away from A)
						const tn = gb.nearest(x, y, z);
						if (!(tn > 1e-6)) continue;
						const hn = gb.hit, n3 = hn * 3, thB = (thb[Ib[n3]] + thb[Ib[n3 + 1]] + thb[Ib[n3 + 2]]) / 3;
						const nx = (gb.near[0] - x) / tn, ny = (gb.near[1] - y) / tn, nz = (gb.near[2] - z) / tn;
						const far = tn > MIDLINE * thB && -(nx * N[v * 3] + ny * N[v * 3 + 1] + nz * N[v * 3 + 2]) < NEAR_COS;
						if (!far && tn < o.minDepth) continue;
						// back along the patch's direction (the way A's surface came in) to where the line
						// leaves B; the nearest way out instead where that line only grazes along inside B
						let ux = dx, uy = dy, uz = dz;
						let t = gb.ray(x, y, z, dx, dy, dz, o.reach);
						if (!far && !(t <= GRAZE * tn + 1)) {
							ux = nx; uy = ny; uz = nz;
							t = tn;
							gb.hit = hn;
						} else if (!Number.isFinite(t)) continue;
						const h = gb.hit * 3, gB = (wb[Ib[h]] + wb[Ib[h + 1]] + wb[Ib[h + 2]]) / 3, gA = wa[v];
						const share = gA + gB > 1e-6 ? gA / (gA + gB) : 0.5;
						const c = Math.min(share * (t + o.clearance), o.maxThickness * th[v]);
						if (c > 0) K[a].add(v, SLOT_CONTACT, ux, uy, uz, c);
					}
				}
				for (let i = 0; i < n; i++) mark[inList[i]] = 0;
			}
		return count;
	}
}
