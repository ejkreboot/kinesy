import type { AssetManifest, BoneMesh, IndexArray, JointAssets, MuscleMesh, SdfGrid } from './types';

/** Decode a joint's packed binaries (already decompressed) into typed mesh and field data. */
export function decodeJointAssets(manifest: AssetManifest, geometry: ArrayBuffer, fields: ArrayBuffer): JointAssets {
	if (manifest.format !== 'kinesy-joint' || manifest.version !== 1)
		throw new Error(`Unsupported asset format ${manifest.format} v${manifest.version}`);
	const nb = manifest.bones.length;
	const { lo, scale } = manifest.quant;
	const bones: BoneMesh[] = [];
	const muscles: MuscleMesh[] = [];

	for (const m of manifest.meshes) {
		const q = new Uint16Array(geometry, m.pos, m.nv * 3);
		const rest = new Float32Array(m.nv * 3);
		for (let i = 0; i < m.nv; i++)
			for (let a = 0; a < 3; a++) rest[i * 3 + a] = lo[a] + q[i * 3 + a] * scale[a];
		const index: IndexArray = (m.i32
			? new Uint32Array(geometry, m.idx, m.nf * 3)
			: new Uint16Array(geometry, m.idx, m.nf * 3)
		).slice();

		if (m.kind === 'bone') {
			bones.push({ name: m.name, bone: m.bone ?? 0, rest, index, nv: m.nv });
			continue;
		}
		const centerline = manifest.centerlines[m.name];
		if (!centerline) throw new Error(`Muscle ${m.name} has no centerline`);
		const w8 = new Uint8Array(geometry, m.w!, m.nv * nb);
		const weights = new Float32Array(m.nv * nb);
		for (let i = 0; i < m.nv; i++) {
			let s = 0;
			for (let b = 0; b < nb; b++) s += w8[i * nb + b];
			s = s || 1;
			for (let b = 0; b < nb; b++) weights[i * nb + b] = w8[i * nb + b] / s;
		}
		muscles.push({ name: m.name, rest, index, nv: m.nv, weights, centerline });
	}

	const grids: (SdfGrid | null)[] = new Array(nb).fill(null);
	for (const g of Object.values(manifest.fields)) {
		const [nx, ny, nz] = g.dims;
		grids[g.bone] = { lo: g.lo, h: g.h, q: g.q, nx, ny, nz, data: new Int8Array(fields, g.off, nx * ny * nz) };
	}
	return { manifest, boneCount: nb, bones, muscles, fields: grids };
}

/** True if the buffer starts with the gzip magic number. */
export function isGzip(buf: ArrayBuffer): boolean {
	const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
	return b[0] === 0x1f && b[1] === 0x8b;
}
