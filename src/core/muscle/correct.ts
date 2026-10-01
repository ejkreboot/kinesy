/**
 * Baked mesh corrections: per-vertex displacements, solved offline (scripts/correct.ts) on the bake's
 * grid of poses, that fix what the centerline deformation gets wrong at the level of the mesh: a muscle
 * passing into its neighbour (beside it, or above or below it), or the surface over a fleshy attachment
 * lifting off its bone. They are smooth over the mesh, so they are stored at H handles per mesh: a vertex
 * takes the weighted sum of its four nearest handles' displacements (weights fixed at rest), each handle's
 * stored per grid pose. A pose gets the multilinear blend of its cell's handle values; the vertex's sum is
 * in its frame (the strand frame it is placed in), so it turns with the muscle, and is added after its
 * attachments are blended in and before it is kept out of bone (deform.ts, viewer/muscleGpu.ts).
 *
 * The corrections fix one runtime: the bake and paths they were solved with (`key`, bakedKey); a stale
 * file is not used.
 *
 * File: "KCOR", u32 header length, JSON header, padding to 4 bytes, then per mesh: handle indices (u16,
 * nv × 4), weights (f32, nv × 4), handle values (i16 in units of 1/QUANT mm, nodes × H × 3, delta-encoded
 * along the nodes per handle coordinate); gzip-compressed as a whole.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import { cellFor, nodeCount, type BakedAxis, type BakedPaths, type Cell } from './baked';
import type { Pose } from '../rig';

/** int16 units per mm of a handle value */
const QUANT = 20;
const MAGIC = 0x524f434b; // "KCOR" little-endian

export interface MeshCorrection {
	mesh: string;
	nv: number;
	/** handles */
	H: number;
	/** per vertex, its four handles (nv × 4) */
	idx: Uint16Array;
	/** and their weights (nv × 4, summing to 1) */
	w: Float32Array;
	/** per grid pose, each handle's displacement (nodes × H × 3, vertex frames) */
	values: Float32Array;
}

export interface Corrections {
	axes: BakedAxis[];
	/** the bake they were solved against (bakedKey) */
	key: string;
	meshes: MeshCorrection[];
}

/** Identity of a bake (its strands' points and the grid), for telling stale corrections. */
export function bakedKey(b: BakedPaths): string {
	const s = JSON.stringify(b.axes) + b.strands.map((x) => `${x.mesh}/${x.strand}:${x.key}`).sort().join('|');
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
	return h.toString(16);
}

export function encodeCorrections(c: Corrections): Uint8Array {
	const header = { axes: c.axes, key: c.key, meshes: c.meshes.map(({ mesh, nv, H }) => ({ mesh, nv, H })) };
	const json = new TextEncoder().encode(JSON.stringify(header));
	const pad = (4 - ((8 + json.length) % 4)) % 4, nodes = nodeCount(c.axes);
	const parts: ArrayBufferView[] = c.meshes.flatMap((m) => {
		const q = new Int16Array(nodes * m.H * 3);
		let o = 0;
		for (let h = 0; h < m.H * 3; h++) {
			let prev = 0;
			for (let n = 0; n < nodes; n++) {
				const v = Math.max(-32767, Math.min(32767, Math.round(m.values[n * m.H * 3 + h] * QUANT)));
				q[o++] = v - prev;
				prev = v;
			}
		}
		// u16 indices are an even count per mesh (nv × 4), so the f32 weights after them stay aligned
		return [m.idx, m.w, q];
	});
	const out = new Uint8Array(8 + json.length + pad + parts.reduce((n, p) => n + p.byteLength, 0)), dv = new DataView(out.buffer);
	dv.setUint32(0, MAGIC, true);
	dv.setUint32(4, json.length, true);
	out.set(json, 8);
	let o = 8 + json.length + pad;
	for (const p of parts) {
		out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), o);
		o += p.byteLength;
	}
	return out;
}

/** Decode a corrections file (already decompressed). */
export function decodeCorrections(buf: ArrayBuffer): Corrections {
	const dv = new DataView(buf);
	if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a corrections file');
	const len = dv.getUint32(4, true), pad = (4 - ((8 + len) % 4)) % 4;
	const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, len))) as { axes: BakedAxis[]; key: string; meshes: { mesh: string; nv: number; H: number }[] };
	const nodes = nodeCount(h.axes);
	let o = 8 + len + pad;
	const meshes = h.meshes.map(({ mesh, nv, H }) => {
		const idx = new Uint16Array(buf.slice(o, o + nv * 8)); o += nv * 8;
		const w = new Float32Array(buf.slice(o, o + nv * 16)); o += nv * 16;
		const q = new Int16Array(buf.slice(o, o + nodes * H * 6)); o += nodes * H * 6;
		const values = new Float32Array(nodes * H * 3);
		let k = 0;
		for (let c = 0; c < H * 3; c++) {
			let v = 0;
			for (let n = 0; n < nodes; n++) {
				v += q[k++];
				values[n * H * 3 + c] = v / QUANT;
			}
		}
		return { mesh, nv, H, idx, w, values };
	});
	return { axes: h.axes, key: h.key, meshes };
}

/** A mesh's handle displacements at a pose (multilinear over its grid cell), into `out` (H × 3). */
export function correctionValues(c: Corrections, m: MeshCorrection, pose: Pose, out: Float32Array, cell?: Cell): void {
	const at = cellFor(c.axes, pose, cell), n3 = m.H * 3;
	out.fill(0);
	for (let k = 0; k < at.nodes.length; k++) {
		const w = at.weights[k];
		if (w === 0) continue;
		const o = at.nodes[k] * n3;
		for (let j = 0; j < n3; j++) out[j] += m.values[o + j] * w;
	}
}

/** Vertex v's correction (vertex frame) from handle displacements `vals` (H × 3), into out. */
export function correctionAt(m: MeshCorrection, vals: ArrayLike<number>, v: number, out: number[]): void {
	let x = 0, y = 0, z = 0;
	for (let j = 0; j < 4; j++) {
		const h = m.idx[v * 4 + j] * 3, w = m.w[v * 4 + j];
		x += vals[h] * w; y += vals[h + 1] * w; z += vals[h + 2] * w;
	}
	out[0] = x; out[1] = y; out[2] = z;
}
