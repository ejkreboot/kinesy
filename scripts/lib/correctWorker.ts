/**
 * A correction worker (scripts/correct.ts): loads the joint and the bake, builds a MeshFixer for the
 * meshes to correct, then solves the grid poses it is sent, writing each mesh's handle displacements
 * straight into the shared buffers (nodes × H × 3).
 *
 * In:  workerData { joint, meshes, H, baked (encoded), buffers }; messages { nodes }
 * Out: { ready } once, then per batch { done, before, after: per mesh, violating vertices over the batch }
 */
import { parentPort, workerData } from 'node:worker_threads';
import { decodeBaked, nodeCount } from '../../src/core/muscle/baked';
import { nodePose } from './bake';
import { MeshFixer } from './correct';
import { loadJoint } from './pathcheck';

const { joint, meshes, H, baked, buffers } = workerData as { joint: string; meshes: string[]; H: number; baked: Uint8Array; buffers: SharedArrayBuffer[] };
const J = loadJoint(joint);
const B = decodeBaked(baked.buffer.slice(baked.byteOffset, baked.byteOffset + baked.byteLength) as ArrayBuffer);
const fixer = new MeshFixer(J, B, meshes, H);
const rest = Object.fromEntries(J.rig.def.joints.map((j) => [j.id, j.restAngle]));
const data = buffers.map((b) => new Float32Array(b));
const rows = fixer.targets.map(() => new Float32Array(H * 3));
const port = parentPort!;
if (nodeCount(B.axes) * H * 3 !== data[0].length) throw new Error('buffer size');
port.postMessage({ ready: true, partners: fixer.targets.map((t) => t.partners.map((p) => `${p.how} ${p.mesh}`)), held: fixer.targets.map((t) => t.held.length) });

port.on('message', ({ nodes }: { nodes: number[] }) => {
	const before = fixer.targets.map(() => 0), after = fixer.targets.map(() => 0);
	for (const n of nodes) {
		const r = fixer.solve(nodePose(B.axes, rest, n), rows);
		rows.forEach((row, k) => data[k].set(row, n * row.length));
		r.before.forEach((c, k) => (before[k] += c));
		r.after.forEach((c, k) => (after[k] += c));
	}
	port.postMessage({ done: true, before, after });
});
