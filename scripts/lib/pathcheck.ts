/**
 * Shared by the path tools (validate-paths, draft-paths): joint registry, asset loading, and the
 * checks a path-driven muscle is judged by.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeJointAssets, isGzip } from '../../src/core/assets';
import { Deformer } from '../../src/core/deformer';
import { decodeBaked } from '../../src/core/muscle/baked';
import { decodeCorrections } from '../../src/core/muscle/correct';
import { qRotate, type Rigid } from '../../src/core/math';
import type { PathSolver } from '../../src/core/muscle/path';
import type { JointPaths } from '../../src/core/muscle/schema';
import type { MuscleSystem } from '../../src/core/muscle/system';
import { Rig, type Pose, type RigDef } from '../../src/core/rig';
import { sdfSample } from '../../src/core/sdf';
import type { AssetManifest, JointAssets } from '../../src/core/types';
import { elbowPaths } from '../../src/joints/elbow/paths';
import { elbowRig } from '../../src/joints/elbow/rig';
import { shoulderPaths } from '../../src/joints/shoulder/paths';
import { shoulderRig } from '../../src/joints/shoulder/rig';
import { hipPaths } from '../../src/joints/hip/paths';
import { hipRig } from '../../src/joints/hip/rig';
import { kneePaths } from '../../src/joints/knee/paths';
import { kneeRig } from '../../src/joints/knee/rig';
import type { BakeAxisSpec } from './bake';

export interface JointSpec {
	rig: RigDef;
	paths: JointPaths;
	/** poses the pose table reports */
	poses: Pose[];
	/** joints swept over their whole range for continuity checks, each at every pose of its `at` */
	sweeps: { joint: string; at: Pose[] }[];
	/** bones whose fields are hollow shells (the rib cage), filled for routing (solid.ts) */
	solid?: string[];
	/** the grid baked lines of action are solved on (lib/bake.ts) */
	bake?: BakeAxisSpec[];
	/** bake rest bands drawn through their meshes (reference.ts, ReferenceOptions.guide); joints baked before it was added keep straight starts */
	bakeGuide?: boolean;
}

export const JOINTS: Record<string, JointSpec> = {
	elbow: {
		rig: elbowRig,
		paths: elbowPaths,
		poses: [0, 90, 145].flatMap((flexion) => [-90, -45, 0, 40, 80].map((pronation) => ({ flexion, pronation }))),
		sweeps: [
			{ joint: 'pronation', at: [{ flexion: 0 }, { flexion: 90 }, { flexion: 145 }] },
			{ joint: 'flexion', at: [{ pronation: -90 }, { pronation: 80 }] }
		]
	},
	shoulder: {
		rig: shoulderRig,
		paths: shoulderPaths,
		poses: [
			{}, { flexion: 90 }, { flexion: 180 }, { flexion: -10 }, { abduction: 90 }, { abduction: 160 },
			{ abduction: 90, rotation: -30 }, { abduction: 90, rotation: 70 }, { flexion: 90, rotation: 70 },
			{ rotation: -30 }, { rotation: 70 }, { protraction: 25 }, { protraction: -25 }, { elevation: 35 },
			{ flexion: 90, abduction: 50 }, { flexion: 90, abduction: 10, protraction: 15 }
		],
		sweeps: [
			{ joint: 'flexion', at: [{}] },
			{ joint: 'abduction', at: [{}] },
			{ joint: 'rotation', at: [{}, { abduction: 90 }] },
			{ joint: 'protraction', at: [{}] },
			{ joint: 'elevation', at: [{}] }
		],
		solid: ['thorax'],
		// the glenohumeral joint; the girdle's own sliders are carried (baked.ts)
		bake: [{ joint: 'flexion', step: 10 }, { joint: 'abduction', step: 10 }, { joint: 'rotation', step: 10 }]
	},
	hip: {
		rig: hipRig,
		paths: hipPaths,
		poses: [
			{}, { flexion: 45 }, { flexion: 90 }, { flexion: 120 }, { flexion: -20 }, { abduction: 45 }, { abduction: -20 },
			{ rotation: 40 }, { rotation: -45 }, { flexion: 90, rotation: 40 }, { flexion: 90, rotation: -45 },
			{ flexion: 90, abduction: 45 }, { flexion: -20, abduction: 30 }, { abduction: 30, rotation: -30 }
		],
		sweeps: [
			{ joint: 'flexion', at: [{}, { abduction: 30 }] },
			{ joint: 'abduction', at: [{}, { flexion: 90 }] },
			{ joint: 'rotation', at: [{}, { flexion: 90 }] }
		],
		// a ball joint, gridded over all three of its angles
		bake: [{ joint: 'flexion', step: 10 }, { joint: 'abduction', step: 5 }, { joint: 'rotation', step: 5 }],
		bakeGuide: true
	},
	knee: {
		rig: kneeRig,
		paths: kneePaths,
		poses: [{}, { flexion: 30 }, { flexion: 50 }, { flexion: 70 }, { flexion: -5 },
			{ flexion: 70, rotation: 25 }, { flexion: 70, rotation: -30 }, { flexion: 45, rotation: -30 }, { flexion: 45, rotation: 25 }],
		sweeps: [
			{ joint: 'flexion', at: [{}, { rotation: 25 }, { rotation: -30 }] },
			{ joint: 'rotation', at: [{ flexion: 70 }, { flexion: 45 }] }
		],
		// a hinge with rotation: two slider axes (the patella follows flexion)
		bake: [{ joint: 'flexion', step: 5 }, { joint: 'rotation', step: 5 }],
		bakeGuide: true
	}
};

/** A joint's baked lines of action, next to its other assets. */
export const BAKED = 'baked.bin.gz';
/** A joint's mesh corrections, solved against that bake. */
export const CORRECTIONS = 'corrections.bin.gz';

export interface LoadedJoint {
	/** its asset directory */
	dir: string;
	spec: JointSpec;
	manifest: AssetManifest;
	assets: JointAssets;
	rig: Rig;
}

export function loadJoint(joint: string): LoadedJoint {
	const spec = JOINTS[joint];
	if (!spec) throw new Error(`No paths registered for ${joint}; add it to JOINTS in scripts/lib/pathcheck.ts`);
	const dir = resolve(import.meta.dirname, '..', '..', 'assets', joint);
	const bin = (name: string): ArrayBuffer => {
		let b: Buffer = readFileSync(resolve(dir, name));
		const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
		if (isGzip(ab)) b = gunzipSync(b);
		return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
	};
	const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as AssetManifest;
	const assets = decodeJointAssets(manifest, bin('geometry.bin.gz'), bin('fields.bin.gz'));
	if (existsSync(resolve(dir, BAKED))) assets.baked = decodeBaked(bin(BAKED));
	if (existsSync(resolve(dir, CORRECTIONS))) assets.corrections = decodeCorrections(bin(CORRECTIONS));
	return { spec, manifest, assets, rig: new Rig(spec.rig, manifest.axes, manifest.bones), dir };
}

/** World point into a bone's frame. */
export function boneLocal(w: Rigid, x: number, y: number, z: number): [number, number, number] {
	return qRotate([-w.q[0], -w.q[1], -w.q[2], w.q[3]], [x - w.t[0], y - w.t[1], z - w.t[2]]);
}

/** Vertices deeper in a bone than at rest by more than tol (count, worst mm). */
export function penetration(assets: JointAssets, mesh: string, P: Float32Array, world: Rigid[], tol = 0.5): { n: number; worst: number } {
	const m = assets.muscles.find((x) => x.name === mesh)!, R = m.rest;
	let n = 0, worst = 0;
	for (let i = 0; i < m.nv; i++)
		for (let b = 0; b < assets.boneCount; b++) {
			const g = assets.fields[b];
			if (!g) continue;
			const d0 = sdfSample(g, R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
			const l = boneLocal(world[b], P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
			const d = sdfSample(g, l[0], l[1], l[2]), lim = Math.min(d0, 0);
			if (d < lim - tol) {
				n++;
				worst = Math.max(worst, lim - d);
				break;
			}
		}
	return { n, worst };
}

export interface StrandDepth {
	/** deepest signed distance (negative = inside), mm */
	d: number;
	strand: number;
	sample: number;
	bone: number;
	/** the deepest sample in that bone's frame (= rest-pose coordinates) */
	local: [number, number, number];
}

/**
 * Deepest point of the given strands inside any bone at the solver's last pose, skipping `endMm`
 * at each end (attachments sit on bone).
 */
export function strandDepth(solver: PathSolver, assets: JointAssets, strands: number[], endMm = 8): StrandDepth {
	const N = solver.N, W = solver.bones;
	let best: StrandDepth = { d: Infinity, strand: -1, sample: -1, bone: -1, local: [0, 0, 0] };
	for (const s of strands) {
		const skip = Math.ceil((endMm / Math.max(1e-6, solver.length[s])) * (N - 1));
		for (let i = skip; i < N - skip; i++)
			for (let b = 0; b < assets.boneCount; b++) {
				const g = assets.fields[b];
				if (!g) continue;
				const o = (s * N + i) * 3, l = boneLocal(W[b], solver.pos[o], solver.pos[o + 1], solver.pos[o + 2]);
				const v = sdfSample(g, l[0], l[1], l[2]);
				if (v < best.d) best = { d: v, strand: s, sample: i, bone: b, local: l };
			}
	}
	return best;
}

/** Triangles facing against their vertices' (frame-rotated rest) normals: folds in the surface. */
export function folds(P: ArrayLike<number>, N: ArrayLike<number>, index: ArrayLike<number>): number {
	let n = 0;
	for (let f = 0; f < index.length; f += 3) {
		const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
		const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
		const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		if (nx * (N[a] + N[b] + N[c]) + ny * (N[a + 1] + N[b + 1] + N[c + 1]) + nz * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) n++;
	}
	return n;
}

/**
 * Poses covering a rig's range: every combination of `n` evenly spaced angles per joint when that
 * stays small, else each joint swept alone with the others at their initial angle.
 */
export function poseGrid(rig: Rig, n = 5, maxPoses = 200): Pose[] {
	const joints = rig.def.joints.filter((j) => j.axis);
	const values = (j: (typeof joints)[number]) => Array.from({ length: n }, (_, k) => j.min + ((j.max - j.min) * k) / (n - 1));
	if (n ** joints.length <= maxPoses) {
		let poses: Pose[] = [{}];
		for (const j of joints) poses = poses.flatMap((p) => values(j).map((v) => ({ ...p, [j.id]: v })));
		return poses.map((p) => rig.clamp(p));
	}
	return joints.flatMap((j) => values(j).map((v) => rig.clamp({ [j.id]: v })));
}

/** A vertex moving further than this in one 1° step has snapped, mm. */
export const SNAP = 3;

const label = (p: Pose) => Object.entries(p).map(([k, v]) => `${k.slice(0, 4)} ${Math.round(v)}`).join(' ');

/**
 * Print the path-driven meshes' report (`meshes`, default all) against the old deformer and
 * return the number of failed checks: rest reconstruction, penetration and folds by pose, strands
 * in bone, snapping over the sweep, frame continuity.
 */
export function report(j: LoadedJoint, sys: MuscleSystem, meshes?: string[]): number {
	const { spec, assets, rig } = j;
	const names = meshes ?? sys.meshes.map((m) => m.name);
	const mesh = (n: string) => sys.meshes.find((m) => m.name === n)!;
	const strands = names.flatMap((n) => {
		const m = sys.solver.muscles.find((x) => x.def.mesh === n)!;
		return Array.from({ length: m.count }, (_, k) => m.first + k);
	});
	const old = new Deformer(assets, rig);
	const outOld: Record<string, Float32Array> = Object.fromEntries(names.map((n) => [n, new Float32Array(mesh(n).nv * 3)]));
	const P: Record<string, Float32Array> = Object.fromEntries(names.map((n) => [n, new Float32Array(mesh(n).nv * 3)]));
	const N: Record<string, Float32Array> = Object.fromEntries(names.map((n) => [n, new Float32Array(mesh(n).nv * 3)]));
	let failures = 0;

	sys.update(rig.clamp(Object.fromEntries(rig.def.joints.map((x) => [x.id, x.restAngle]))));
	let restErr = 0;
	const restFolds: Record<string, number> = {};
	for (const n of names) {
		sys.deform(n, P[n], N[n]);
		const r = mesh(n).rest;
		for (let k = 0; k < r.length; k++) restErr = Math.max(restErr, Math.abs(P[n][k] - r[k]));
		restFolds[n] = folds(P[n], N[n], mesh(n).index);
	}
	console.log(`rest reconstruction: max error ${restErr.toFixed(4)} mm`);
	if (restErr > 1e-3) failures++;

	console.log(`\n${'pose'.padEnd(20)}${'strand in bone'.padStart(15)}  ${names.map((n) => n.padStart(19)).join('')}`);
	console.log(`${''.padEnd(35)}  ${names.map(() => 'pen old→new  folds'.padStart(19)).join('')}`);
	for (const pose of spec.poses.map((p) => rig.clamp(p))) {
		sys.update(pose);
		old.update(pose, outOld);
		const world = rig.solve(pose), sd = strandDepth(sys.solver, assets, strands);
		let row = label(pose).padEnd(20) + (sd.d < 0 ? sd.d.toFixed(1) : 'ok').padStart(15) + '  ';
		for (const n of names) {
			sys.deform(n, P[n], N[n]);
			const pn = penetration(assets, n, P[n], world), po = penetration(assets, n, outOld[n], world);
			row += `${po.n}→${pn.n}  ${folds(P[n], N[n], mesh(n).index) - restFolds[n]}`.padStart(19);
			if (pn.n > 5) failures++;
		}
		const where = sd.d < -1 ? `   deepest: ${sys.solver.muscles[sys.solver.strands[sd.strand].muscle].def.mesh} s=${(sd.sample / (sys.solver.N - 1)).toFixed(2)} in ${j.manifest.bones[sd.bone]}` : '';
		console.log(row + where);
	}
	console.log('  (folds: triangles folded over, beyond those at rest)');

	console.log(`\nsnaps (vertices moving > ${SNAP} mm in one 1° step beyond their bone's own motion; worst jump mm), new vs old:`);
	// each vertex's bone: the one its skin weights favour
	const boneOf = Object.fromEntries(names.map((n) => {
		const m = assets.muscles.find((x) => x.name === n)!, nb = assets.boneCount;
		return [n, Int32Array.from({ length: m.nv }, (_, v) => { let bb = 0; for (let b = 1; b < nb; b++) if (m.weights[v * nb + b] > m.weights[v * nb + bb]) bb = b; return bb; })];
	}));
	/** how far p moved beyond carrying prev along with bone b from `from` to `to` */
	const excess = (p: ArrayLike<number>, prev: ArrayLike<number>, v: number, from: Rigid, to: Rigid) => {
		const l = boneLocal(from, prev[v], prev[v + 1], prev[v + 2]), w = qRotate(to.q, l);
		return Math.hypot(p[v] - w[0] - to.t[0], p[v + 1] - w[1] - to.t[1], p[v + 2] - w[2] - to.t[2]);
	};
	for (const { joint, at } of spec.sweeps.flatMap((w) => w.at.map((at) => ({ joint: w.joint, at })))) {
		const jt = rig.joint(joint);
		const count = Object.fromEntries(names.map((n) => [n, { nn: 0, wn: 0, no: 0, wo: 0 }]));
		const prevNew: Record<string, Float32Array> = {}, prevOld: Record<string, Float32Array> = {};
		let prevBones: Rigid[] | null = null;
		for (let a = jt.min; a <= jt.max; a++) {
			const pose = rig.clamp({ ...at, [joint]: a }), bones = rig.solve(pose);
			sys.update(pose);
			old.update(pose, outOld);
			for (const n of names) {
				sys.deform(n, P[n]);
				const c = count[n], pn = prevNew[n], po = prevOld[n], on = outOld[n];
				if (pn && prevBones)
					for (let v = 0; v < P[n].length; v += 3) {
						const b = boneOf[n][v / 3];
						const dn = excess(P[n], pn, v, prevBones[b], bones[b]), dol = excess(on, po, v, prevBones[b], bones[b]);
						if (dn > SNAP) c.nn++;
						if (dol > SNAP) c.no++;
						c.wn = Math.max(c.wn, dn);
						c.wo = Math.max(c.wo, dol);
					}
				prevNew[n] = P[n].slice();
				prevOld[n] = on.slice();
			}
			prevBones = bones;
		}
		console.log(`  ${`${joint.slice(0, 4)} sweep, ${label(at)}`.padEnd(24)} ${names.map((n) => `${n} ${count[n].nn}/${count[n].wn.toFixed(1)} (old ${count[n].no}/${count[n].wo.toFixed(1)})`).join('  ')}`);
		for (const n of names) if (count[n].nn > 0) failures++;
	}

	console.log('\nframe continuity (1° steps over the whole range):');
	for (const { joint, at } of spec.sweeps.flatMap((w) => w.at.map((at) => ({ joint: w.joint, at })))) {
		const jt = rig.joint(joint);
		let prevQ: Float64Array | null = null, prevP: Float64Array | null = null, maxTurn = 0, maxMove = 0, ms = 0, n = 0;
		const S = sys.solver, N4 = S.N * 4, N3 = S.N * 3;
		for (let a = jt.min; a <= jt.max; a++) {
			const t0 = performance.now();
			sys.update(rig.clamp({ ...at, [joint]: a }));
			ms += performance.now() - t0;
			n++;
			if (prevQ && prevP)
				for (const s of strands) {
					for (let k = s * N4; k < (s + 1) * N4; k += 4) {
						const d = Math.abs(S.quat[k] * prevQ[k] + S.quat[k + 1] * prevQ[k + 1] + S.quat[k + 2] * prevQ[k + 2] + S.quat[k + 3] * prevQ[k + 3]);
						maxTurn = Math.max(maxTurn, (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI);
					}
					for (let k = s * N3; k < (s + 1) * N3; k += 3) maxMove = Math.max(maxMove, Math.hypot(S.pos[k] - prevP[k], S.pos[k + 1] - prevP[k + 1], S.pos[k + 2] - prevP[k + 2]));
				}
			prevQ = S.quat.slice();
			prevP = S.pos.slice();
		}
		console.log(`  ${`${joint.slice(0, 4)} sweep, ${label(at)}`.padEnd(24)} max frame turn/step ${maxTurn.toFixed(2)}°  max sample move/step ${maxMove.toFixed(2)} mm  solve (all strands) ${(ms / n).toFixed(2)} ms`);
		if (maxTurn > 10) failures++;
	}
	return failures;
}
