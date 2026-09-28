/**
 * Deformer validation: bone penetration across poses for linear-blend, dual-quaternion, and the
 * full deformer (DQS + bulge + collision), plus per-pose timing and bulge factors.
 *
 *     npm run validate [-- <joint>]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeJointAssets, isGzip } from '../src/core/assets';
import { Deformer, type DeformerOptions } from '../src/core/deformer';
import { Rig, type Pose, type RigDef } from '../src/core/rig';
import type { AssetManifest } from '../src/core/types';
import { elbowRig } from '../src/joints/elbow/rig';

// Rig definitions by joint id (joint index modules import Vite-only assets, so not those).
const RIGS: Record<string, RigDef> = { elbow: elbowRig };

const joint = process.argv[2] ?? 'elbow';
const dir = resolve(import.meta.dirname, '..', 'assets', joint);

function bin(name: string): ArrayBuffer {
	let b: Buffer = readFileSync(resolve(dir, name));
	const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
	if (isGzip(ab)) b = gunzipSync(b);
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as AssetManifest;
const assets = decodeJointAssets(manifest, bin('geometry.bin.gz'), bin('fields.bin.gz'));
const rigDef = RIGS[joint];
if (!rigDef) throw new Error(`No rig registered for ${joint}; add it to RIGS`);
const rig = new Rig(rigDef, manifest.axes, manifest.bones);

const configs: Record<string, Partial<DeformerOptions>> = {
	LBS: { dqs: false, collide: false, bulge: false },
	DQS: { dqs: true, collide: false, bulge: false },
	FULL: {}
};
const deformers = Object.fromEntries(Object.entries(configs).map(([k, o]) => [k, new Deformer(assets, rig, o)]));
const out: Record<string, Float32Array> = Object.fromEntries(assets.muscles.map((m) => [m.name, new Float32Array(m.nv * 3)]));

const ids = rig.def.joints.map((j) => j.id);
const grid = (vals: number[][]): Pose[] => vals.map((v) => Object.fromEntries(ids.map((id, i) => [id, v[i]])));
const poses = grid([[15, -90], [90, -90], [140, -90], [90, 0], [90, 80], [15, 80], [140, 80], [0, -90]]);

console.log('pose'.padEnd(22) + Object.keys(configs).map((k) => `${k} n/worst`.padStart(15)).join('') + '   full ms  pushed');
let failures = 0;
for (const pose of poses) {
	let row = JSON.stringify(pose).replace(/"/g, '').padEnd(22), ms = 0;
	for (const [k, d] of Object.entries(deformers)) {
		const t = performance.now();
		d.update(pose, out);
		if (k === 'FULL') ms = performance.now() - t;
		let n = 0, worst = 0, bad = 0;
		for (const m of assets.muscles) {
			const r = d.penetration(m.name, out[m.name], 0.5);
			n += r.n;
			worst = Math.max(worst, r.worst);
			for (const v of out[m.name]) if (!Number.isFinite(v)) bad++;
		}
		row += `${n}/${worst.toFixed(1)}`.padStart(15);
		if (bad) row += ` NaN:${bad}`;
		if (k === 'FULL' && (n > 5 || worst > 2 || bad)) failures++;
	}
	console.log(row + ms.toFixed(1).padStart(10) + String(deformers.FULL.stats.pushed).padStart(8));
}
const full = deformers.FULL;
for (const pose of [poses[2], poses[7], poses[4]]) {
	full.update(pose, out);
	const k = assets.muscles.filter((m) => m.centerline.bulge).map((m) => `${m.name} ${full.bulgeOf(m.name).toFixed(2)}`);
	console.log(`bulge ${JSON.stringify(pose).replace(/"/g, '')}: ${k.join('  ')}`);
}
if (failures) {
	console.error(`FAIL: ${failures} pose(s) with residual penetration`);
	process.exit(1);
}
console.log('OK');
