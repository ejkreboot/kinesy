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
import { qRotate } from '../src/core/math';
import { Rig, type Pose, type RigDef } from '../src/core/rig';
import { sdfGradient, sdfSample } from '../src/core/sdf';
import type { AssetManifest } from '../src/core/types';
import { elbowRig } from '../src/joints/elbow/rig';
import { HAND_DEFORMER, handRig } from '../src/joints/hand/rig';
import { shoulderRig } from '../src/joints/shoulder/rig';

// Rig definitions and test poses by joint id (joint index modules import Vite-only assets, so
// not those). Joints a pose leaves out hold their initial angle. `bulge` indexes poses to report.
interface JointSpec {
	rig: RigDef;
	poses: Pose[];
	/** poses (by index) to report bulge factors for */
	bulge: number[];
	deformer?: Partial<DeformerOptions>;
	/**
	 * what a pose may keep with the full deformer: residual penetration (default 5 vertices,
	 * 2 mm) and tunneled vertices (default 20)
	 */
	allow?: { n: number; worst: number; tunnel?: number };
}

const JOINTS: Record<string, JointSpec> = {
	elbow: {
		rig: elbowRig,
		poses: [[15, -90], [90, -90], [140, -90], [90, 0], [90, 80], [15, 80], [140, 80], [0, -90]].map(([flexion, pronation]) => ({ flexion, pronation })),
		bulge: [2, 7, 4],
		// known: in full pronation the radius passes through part of pronator quadratus, which is
		// squeezed between it and the ulna
		allow: { n: 5, worst: 2, tunnel: 160 }
	},
	shoulder: {
		rig: shoulderRig,
		poses: [
			{}, { flexion: 90 }, { flexion: 180 }, { flexion: -60 }, { abduction: 90 }, { abduction: 180 },
			{ flexion: 90, abduction: -40 }, { flexion: 90, abduction: 90 }, { rotation: -90 }, { rotation: 70 },
			{ abduction: 90, rotation: -90 }, { abduction: 90, rotation: 70 }, { flexion: 180, rotation: -60 },
			{ elevation: 35 }, { elevation: -10 }, { protraction: 25 }, { protraction: -25 }, { flexion: 120, protraction: 25 }
		],
		bulge: [2, 5, 3],
		// known: at large arm angles, parts of supraspinatus and infraspinatus that carry some
		// humerus weight cross the thin scapular blade, and upper trapezius crosses the clavicle as
		// it elevates. Deep or covered; a guard against getting worse.
		allow: { n: 5, worst: 2, tunnel: 650 }
	},
	hand: {
		rig: handRig,
		deformer: HAND_DEFORMER,
		// Two pinches leave a few tendon vertices just inside bone: in a full fist, flexor tendons
		// squeezed between a metacarpal head and its proximal phalanx (each bone's correction pushes
		// them into the other); in opposition with the fingers curled, the thumb tip pressing on the
		// little finger's flexor tendons (bones don't collide with each other). Known tunneling:
		// in full wrist flexion the thenar muscles are pushed through the carpus where they meet
		// the radius, and the FCU tendon wraps its sesamoid, the pisiform; in opposition the deep
		// thenar muscles are squeezed between the first metacarpal and the carpus.
		allow: { n: 30, worst: 1.5, tunnel: 300 },
		poses: [
			{}, { mcp: 90, pip: 100, dip: 70 }, { pip: 100, dip: 70, mcp: 0 }, { mcp: 90, pip: 0, dip: 0 }, { mcp: -20, pip: 0, dip: 0 },
			{ spread: 20 }, { spread: -8 }, { opposition: 100 }, { opposition: 100, mcp: 60, pip: 60, dip: 40 },
			{ thumbCmcAbduction: 60 }, { thumbCmcFlexion: -30, thumbMcp: 0, thumbIp: -15 }, { thumbMcp: 60, thumbIp: 80 },
			{ wristFlexion: 80 }, { wristFlexion: -70 }, { wristDeviation: 35 }, { wristDeviation: -20 },
			{ wristFlexion: -60, mcp: 90, pip: 100, dip: 70 }
		],
		bulge: [1, 12, 7]
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
const allow = { tunnel: 20, ...(spec.allow ?? { n: 5, worst: 2 }) };

/**
 * Vertices that tunneled through a bone: they lay beside it at rest (within 4 mm) and now sit
 * beside a surface of it facing the other way, and their outward direction turned in the world
 * too (a muscle sliding over a bone that spins beneath it, like supinator on the radius, flips
 * sides in the bone's frame but keeps facing the same way). Collision can't catch these: they
 * are outside the bone again, just on the wrong side.
 */
function tunneled(pose: Pose): number {
	const world = rig.solve(pose);
	let n = 0;
	for (const m of assets.muscles) {
		const P = out[m.name], R = m.rest;
		for (let i = 0; i < m.nv; i++)
			for (let b = 0; b < assets.boneCount; b++) {
				const g = assets.fields[b];
				if (!g) continue;
				const d0 = sdfSample(g, R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
				if (d0 > 4 || d0 < -2) continue;
				const n0 = sdfGradient(g, R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
				const w = world[b];
				const l = qRotate([-w.q[0], -w.q[1], -w.q[2], w.q[3]], [P[i * 3] - w.t[0], P[i * 3 + 1] - w.t[1], P[i * 3 + 2] - w.t[2]]);
				if (!n0 || sdfSample(g, l[0], l[1], l[2]) > 4) continue;
				const n1 = sdfGradient(g, l[0], l[1], l[2]);
				if (!n1 || n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] >= -0.3) continue;
				const n1w = qRotate(w.q, n1); // rest bone frame = world frame
				if (n0[0] * n1w[0] + n0[1] * n1w[1] + n0[2] * n1w[2] < 0.5) {
					n++;
					break;
				}
			}
	}
	return n;
}

const configs: Record<string, Partial<DeformerOptions>> = {
	LBS: { dqs: false, collide: false, bulge: false },
	DQS: { dqs: true, collide: false, bulge: false },
	FULL: {}
};
const deformers = Object.fromEntries(Object.entries(configs).map(([k, o]) => [k, new Deformer(assets, rig, { ...spec.deformer, ...o })]));
const out: Record<string, Float32Array> = Object.fromEntries(assets.muscles.map((m) => [m.name, new Float32Array(m.nv * 3)]));

const poses = spec.poses.map((p) => rig.clamp(p));
const label = (i: number) => (JSON.stringify(spec.poses[i]).replace(/"/g, '') || '{}').replace('{}', 'rest');
const W = Math.max(22, ...poses.map((_, i) => label(i).length + 2));

console.log('pose'.padEnd(W) + Object.keys(configs).map((k) => `${k} n/worst`.padStart(15)).join('') + '   full ms  pushed  tunnel');
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
		if (k === 'FULL' && (n > allow.n || worst > allow.worst || bad)) failures++;
	}
	deformers.FULL.update(pose, out);
	const tunnel = tunneled(pose);
	if (tunnel > allow.tunnel) failures++;
	console.log(row + ms.toFixed(1).padStart(10) + String(deformers.FULL.stats.pushed).padStart(8) + String(tunnel).padStart(8));
}
const full = deformers.FULL;
for (const i of spec.bulge) {
	full.update(poses[i], out);
	const k = assets.muscles.filter((m) => m.centerline.bulge).map((m) => `${m.name} ${full.bulgeOf(m.name).toFixed(2)}`);
	console.log(`bulge ${label(i)}: ${k.join('  ')}`);
}
if (failures) {
	console.error(`FAIL: ${failures} pose(s) with residual penetration or tunneling`);
	process.exit(1);
}
console.log('OK');
