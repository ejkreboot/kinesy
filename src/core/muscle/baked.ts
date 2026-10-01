/**
 * Baked lines of action: strands solved offline (scripts/bake.ts) on a grid of poses and looked up at
 * runtime, in place of wraps. Offline there is time for what a per-frame solve can't afford: each grid
 * pose is reached by walking from the rest pose in small steps, so a strand keeps the side of a bone it
 * came round (a cuff tendon stays wound round the humeral head), and it is kept off the bones' own
 * distance fields rather than off surfaces placed by hand.
 *
 * A baked strand is M points per grid pose, evenly spaced along it, stored in one bone's frame. A pose
 * between grid poses gets the multilinear blend of its cell's corners. Joints that aren't grid axes
 * (the shoulder girdle's own sliders) are held at their rest angle in the grid; their part of the pose
 * is applied afterwards by carrying each point with the bones at the ends of the stretch it lies on, as
 * the bake carries the band between its steps. The ends are then put exactly on their attachments.
 *
 * File: "KBAK", u32 header length, JSON header (BakedHeader), padding to 4 bytes, then int16 data,
 * gzip-compressed as a whole. Data per strand, per point, per coordinate: the value over the grid's
 * nodes (first axis fastest), in units of 1/quant mm, delta-encoded: over all the nodes (files without
 * `runs`), or restarting at each run of the first axis (`runs`), where a point far from the joint jumps by
 * its whole sweep from the run's end to the next run's start.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import { qRotate, type Rigid, type Vec3 } from '../math';
import type { Pose } from '../rig';
import { isPoint, type JointPaths, type PathPoint } from './schema';

/** int16 units per mm: files written now (±1 m), and files without a `quant` (±512 mm) */
const QUANT = 32, OLD_QUANT = 64;
const MAGIC = 0x4b414b42; // "KBAK" little-endian

export interface BakedAxis {
	joint: string;
	values: number[];
}

export interface BakedStrandHeader {
	mesh: string;
	/** strand index within its muscle */
	strand: number;
	/** the strand's fixed points as baked (strandKey): a changed attachment makes the bake stale */
	key: string;
	/** bone index the points are stored in */
	frame: number;
	/** per point: bone at the start and end of the stretch it lies on, and how far along it (0–1) */
	carry: [number, number, number][];
	/** clearance kept from the bones, mm (informative) */
	clear: number;
}

export interface BakedHeader {
	axes: BakedAxis[];
	/** points per strand */
	M: number;
	strands: BakedStrandHeader[];
	/** int16 units per mm (OLD_QUANT if absent) */
	quant?: number;
	/** whether the delta encoding restarts at each run of the first axis */
	runs?: boolean;
}

export interface BakedStrand extends BakedStrandHeader {
	/** nodes × M × 3, node index with the first axis fastest */
	data: Float32Array;
}

export interface BakedPaths {
	axes: BakedAxis[];
	M: number;
	strands: BakedStrand[];
}

/** Identity of a strand's fixed points, to tell a stale bake. */
export function strandKey(fixed: PathPoint[]): string {
	return fixed.map((f) => `${f.bone}:${f.p.map((v) => v.toFixed(2)).join(',')}`).join(' ');
}

/**
 * `paths` with every muscle whose strands are all in `baked` (with the same points) switched to its
 * baked lines of action: for comparing a bake with the wraps it would replace. Their `beside` contact,
 * tuned to keep wrapped strands apart, is dropped (pushing baked strands it made the anterior deltoid snap),
 * and so are the proxies a muscle's `over` would push its belly off (the bake keeps those muscles below
 * it; the proxies only added snaps).
 */
export function withBaked(paths: JointPaths, baked: BakedPaths): JointPaths {
	return {
		...paths,
		muscles: paths.muscles.map((d) => {
			const pts = d.strands.map((els) => els.filter((e) => isPoint(e)) as PathPoint[]);
			const all = pts.every((p, k) => baked.strands.some((s) => s.mesh === d.mesh && s.strand === k && s.key === strandKey(p)));
			return all && !d.strands.some((els) => els.some((e) => isPoint(e) && 'join' in e)) ? { ...d, baked: true, strands: pts, beside: undefined, over: undefined } : d;
		})
	};
}

export function nodeCount(axes: BakedAxis[]): number {
	return axes.reduce((n, a) => n * a.values.length, 1);
}

export function encodeBaked(b: BakedPaths): Uint8Array {
	const header: BakedHeader = { axes: b.axes, M: b.M, strands: b.strands.map(({ data: _d, ...h }) => h), quant: QUANT, runs: true };
	const run = b.axes[0].values.length;
	const json = new TextEncoder().encode(JSON.stringify(header));
	const pad = (4 - ((8 + json.length) % 4)) % 4, nodes = nodeCount(b.axes);
	const body = new Int16Array(b.strands.length * b.M * 3 * nodes);
	let o = 0;
	for (const s of b.strands)
		for (let i = 0; i < b.M; i++)
			for (let c = 0; c < 3; c++) {
				let prev = 0;
				for (let n = 0; n < nodes; n++) {
					if (n % run === 0) prev = 0;
					const v = Math.round(s.data[(n * b.M + i) * 3 + c] * QUANT);
					if (Math.abs(v) > 32767 || Math.abs(v - prev) > 32767) throw new Error(`baked ${s.mesh}: a point ${(v / QUANT).toFixed(0)} mm from its frame bone's origin is beyond what the format holds`);
					body[o++] = v - prev;
					prev = v;
				}
			}
	const out = new Uint8Array(8 + json.length + pad + body.byteLength), dv = new DataView(out.buffer);
	dv.setUint32(0, MAGIC, true);
	dv.setUint32(4, json.length, true);
	out.set(json, 8);
	out.set(new Uint8Array(body.buffer), 8 + json.length + pad);
	return out;
}

/** Decode a baked file (already decompressed). */
export function decodeBaked(buf: ArrayBuffer): BakedPaths {
	const dv = new DataView(buf);
	if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a baked paths file');
	const len = dv.getUint32(4, true), pad = (4 - ((8 + len) % 4)) % 4;
	const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, len))) as BakedHeader;
	const nodes = nodeCount(h.axes), body = new Int16Array(buf, 8 + len + pad);
	const quant = h.quant ?? OLD_QUANT, run = h.runs ? h.axes[0].values.length : Infinity;
	let o = 0;
	const strands = h.strands.map((s) => {
		const data = new Float32Array(nodes * h.M * 3);
		for (let i = 0; i < h.M; i++)
			for (let c = 0; c < 3; c++) {
				let v = 0;
				for (let n = 0; n < nodes; n++) {
					if (n % run === 0) v = 0;
					v += body[o++];
					data[(n * h.M + i) * 3 + c] = v / quant;
				}
			}
		return { ...s, data };
	});
	return { axes: h.axes, M: h.M, strands };
}

/** The grid cell a pose falls in: corner node indices and their weights (2^axes of each). */
export interface Cell {
	nodes: Int32Array;
	weights: Float64Array;
}

export function cellFor(axes: BakedAxis[], pose: Pose, out?: Cell): Cell {
	const D = axes.length, K = 1 << D;
	const cell = out ?? { nodes: new Int32Array(K), weights: new Float64Array(K) };
	const lo: number[] = [], t: number[] = [];
	for (const a of axes) {
		const v = a.values, x = Math.min(v[v.length - 1], Math.max(v[0], pose[a.joint] ?? v[0]));
		let i = 0;
		while (i < v.length - 2 && x > v[i + 1]) i++;
		lo.push(i);
		t.push(v.length > 1 ? (x - v[i]) / (v[i + 1] - v[i]) : 0);
	}
	for (let k = 0; k < K; k++) {
		let node = 0, stride = 1, w = 1;
		for (let d = 0; d < D; d++) {
			const up = (k >> d) & 1, n = axes[d].values.length;
			node += Math.min(n - 1, lo[d] + up) * stride;
			stride *= n;
			w *= up ? t[d] : 1 - t[d];
		}
		cell.nodes[k] = node;
		cell.weights[k] = w;
	}
	return cell;
}

/** The grid's pose for a pose: its grid joints (clamped to the grid), every other joint at rest. */
export function gridPose(axes: BakedAxis[], pose: Pose, rest: Pose): Pose {
	const g: Pose = { ...rest };
	for (const a of axes) g[a.joint] = Math.min(a.values[a.values.length - 1], Math.max(a.values[0], pose[a.joint] ?? rest[a.joint]));
	return g;
}

/**
 * A baked strand's polyline at `bones` (world), appended to `out` as x y z triples: blended over the
 * cell at the grid's bones `grid`, carried from those to `bones`, ends put on `first` and `last`.
 */
export function bakedPolyline(s: BakedStrand, M: number, cell: Cell, grid: Rigid[], bones: Rigid[], first: Vec3, last: Vec3, out: number[]): void {
	const start = out.length, F = grid[s.frame], K = cell.nodes.length;
	for (let i = 0; i < M; i++) {
		let x = 0, y = 0, z = 0;
		for (let k = 0; k < K; k++) {
			const w = cell.weights[k];
			if (w === 0) continue;
			const o = (cell.nodes[k] * M + i) * 3;
			x += s.data[o] * w; y += s.data[o + 1] * w; z += s.data[o + 2] * w;
		}
		const r = qRotate(F.q, [x, y, z]);
		const g: Vec3 = [r[0] + F.t[0], r[1] + F.t[1], r[2] + F.t[2]];
		const [ba, bb, u] = s.carry[i];
		const pa = moved(g, grid[ba], bones[ba]), pb = moved(g, grid[bb], bones[bb]);
		out.push(pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u, pa[2] + (pb[2] - pa[2]) * u);
	}
	// what interpolation left off the attachments, spread linearly along the strand
	const e0 = [first[0] - out[start], first[1] - out[start + 1], first[2] - out[start + 2]];
	const e = start + (M - 1) * 3, e1 = [last[0] - out[e], last[1] - out[e + 1], last[2] - out[e + 2]];
	for (let i = 0; i < M; i++) {
		const u = i / (M - 1), o = start + i * 3;
		for (let c = 0; c < 3; c++) out[o + c] += e0[c] * (1 - u) + e1[c] * u;
	}
}

/** World point x, fixed to a bone that moves from `from` to `to`. */
function moved(x: Vec3, from: Rigid, to: Rigid): Vec3 {
	if (from === to) return x;
	const l = qRotate([-from.q[0], -from.q[1], -from.q[2], from.q[3]], [x[0] - from.t[0], x[1] - from.t[1], x[2] - from.t[2]]);
	const r = qRotate(to.q, l);
	return [r[0] + to.t[0], r[1] + to.t[1], r[2] + to.t[2]];
}
