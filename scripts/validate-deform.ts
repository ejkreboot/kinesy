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
import { shoulderRig } from '../src/joints/shoulder/rig';

// Rig definitions and test poses by joint id (joint index modules import Vite-only assets, so
// not those). Joints a pose leaves out hold their initial angle. `bulge` indexes poses to report.
const JOINTS: Record<string, { rig: RigDef; poses: Pose[]; bulge: number[] }> = {
	elbow: {
		rig: elbowRig,
		poses: [[15, -90], [90, -90], [140, -90], [90, 0], [90, 80], [15, 80], [140, 80], [0, -90]].map(([flexion, pronation]) => ({ flexion, pronation })),
		bulge: [2, 7, 4]
	},
	shoulder: {
		rig: shoulderRig,
		poses: [
			{}, { flexion: 90 }, { flexion: 180 }, { flexion: -60 }, { abduction: 90 }, { abduction: 180 },
			{ flexion: 90, abduction: -40 }, { flexion: 90, abduction: 90 }, { rotation: -90 }, { rotation: 70 },
			{ abduction: 90, rotation: -90 }, { abduction: 90, rotation: 70 }, { flexion: 180, rotation: -60 },
			{ elevation: 35 }, { elevation: -10 }, { protraction: 25 }, { protraction: -25 }, { flexion: 120, protraction: 25 }
		],
		bulge: [2, 5, 3]
	}
};

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
const spec = JOINTS[joint];
if (!spec) throw new Error(`No rig registered for ${joint}; add it to JOINTS`);
const rig = new Rig(spec.rig, manifest.axes, manifest.bones);

const configs: Record<string, Partial<DeformerOptions>> = {
	LBS: { dqs: false, collide: false, bulge: false },
	DQS: { dqs: true, collide: false, bulge: false },
	FULL: {}
};
const deformers = Object.fromEntries(Object.entries(configs).map(([k, o]) => [k, new Deformer(assets, rig, o)]));
const out: Record<string, Float32Array> = Object.fromEntries(assets.muscles.map((m) => [m.name, new Float32Array(m.nv * 3)]));

const poses = spec.poses.map((p) => rig.clamp(p));
const label = (i: number) => (JSON.stringify(spec.poses[i]).replace(/"/g, '') || '{}').replace('{}', 'rest');
const W = Math.max(22, ...poses.map((_, i) => label(i).length + 2));

console.log('pose'.padEnd(W) + Object.keys(configs).map((k) => `${k} n/worst`.padStart(15)).join('') + '   full ms  pushed');
let failures = 0;
for (const [i, pose] of poses.entries()) {
	let row = label(i).padEnd(W), ms = 0;
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
for (const i of spec.bulge) {
	full.update(poses[i], out);
	const k = assets.muscles.filter((m) => m.centerline.bulge).map((m) => `${m.name} ${full.bulgeOf(m.name).toFixed(2)}`);
	console.log(`bulge ${label(i)}: ${k.join('  ')}`);
}
if (failures) {
	console.error(`FAIL: ${failures} pose(s) with residual penetration`);
	process.exit(1);
}
console.log('OK');
