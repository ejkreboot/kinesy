/**
 * Solve mesh corrections (src/core/muscle/correct.ts, lib/correct.ts) for a joint's baked muscles, or the
 * meshes named, against its current bake, into assets/<joint>/corrections.bin.gz.
 *
 *     npm run correct -- <joint> [mesh ...] [--existing] [--H n] [--workers n]
 *
 * --existing: the meshes that already have corrections (re-solving them after hand tuning; the Tune panel's
 * Save runs this).
 *
 * The bake's grid poses are shared out among worker threads, each solving the corrections at H handles per
 * mesh (lib/handles.ts). Prints, per mesh, how many vertex-poses violated before correction and after.
 */
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { encodeBaked, nodeCount } from '../src/core/muscle/baked';
import { bakedKey, encodeCorrections, type MeshCorrection } from '../src/core/muscle/correct';
import { bakeRounds } from './lib/bake';
import { CORRECTIONS, loadJoint } from './lib/pathcheck';
import { chooseHandles } from './lib/handles';

const args = process.argv.slice(2);
const opt = (k: string, d: number) => { const i = args.indexOf(k); return i >= 0 ? Number(args.splice(i, 2)[1]) : d; };
const SMOOTH_PASSES = 2;
const H = opt('--H', 96), workers = opt('--workers', Math.max(1, availableParallelism() - 1));
const existing = args.includes('--existing');
const [joint, ...named] = args.filter((a) => a !== '--existing');
if (!joint) throw new Error('usage: correct <joint> [mesh ...] [--existing] [--H n] [--workers n]');
const J = loadJoint(joint), baked = J.assets.baked;
if (!baked) throw new Error(`${joint} has no bake (run scripts/bake.ts first)`);
const bakedMeshes = [...new Set(baked.strands.map((s) => s.mesh))];
const chosen = existing ? (J.assets.corrections?.meshes.map((m) => m.mesh) ?? []) : named.length ? named : bakedMeshes;
if (!chosen.length) {
	console.log(`${joint}: nothing to correct`);
	process.exit(0);
}
const meshes = bakeRounds(J, J.spec.paths, chosen).flat();
const nodes = nodeCount(baked.axes), t0 = performance.now();
const nv = meshes.map((m) => J.assets.muscles.find((x) => x.name === m)!.nv);
const buffers = nv.map(() => new SharedArrayBuffer(nodes * H * 3 * 4));
const workerData = { joint, meshes, H, baked: encodeBaked(baked), buffers };
const pool = Array.from({ length: workers }, () => new Worker(new URL('./lib/correctWorker.ts', import.meta.url), { workerData }));
const ready = await Promise.all(pool.map((w) => new Promise<{ partners: string[][]; held: number[] }>((ok, fail) => { w.once('message', ok); w.once('error', fail); })));
console.log(`${joint}: correcting ${meshes.map((m, k) => `${m} (${[...ready[0].partners[k], `${ready[0].held[k]} held`].join(', ')})`).join('; ')}`);
console.log(`${nodes} grid poses, ${workers} workers`);
const before = meshes.map(() => 0), after = meshes.map(() => 0);
await new Promise<void>((done, fail) => {
	const BATCH = 20;
	let next = 0, busy = 0, finished = 0;
	const feed = (w: Worker) => {
		if (next < nodes) { busy++; const n = Array.from({ length: Math.min(BATCH, nodes - next) }, (_, i) => next + i); next += n.length; w.postMessage({ nodes: n }); }
		else if (!busy) done();
	};
	for (const w of pool) {
		w.removeAllListeners('message');
		w.on('message', (msg: { before: number[]; after: number[] }) => {
			busy--;
			msg.before.forEach((c, k) => (before[k] += c));
			msg.after.forEach((c, k) => (after[k] += c));
			finished += BATCH;
			if (finished % 1000 < BATCH) console.log(`  ${Math.min(finished, nodes)}/${nodes} poses, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
			feed(w);
		});
		w.on('error', fail);
	}
	for (const w of pool) feed(w);
});
await Promise.all(pool.map((w) => w.terminate()));
console.log(`solved in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
const out: MeshCorrection[] = [];
meshes.forEach((mesh, k) => {
	console.log(`${mesh}: violating vertex-poses ${before[k]} → ${after[k]} after correction`);
	if (!before[k]) return;
	const h = chooseHandles(J.assets.muscles.find((x) => x.name === mesh)!.rest, nv[k], H), values = new Float32Array(buffers[k]);
	smoothOverGrid(values, H * 3);
	out.push({ mesh, nv: nv[k], H, idx: h.idx, w: h.w, values });
});

/**
 * Smooth handle values over the grid ([1 2 1]/4 along each axis, SMOOTH_PASSES times; the ends held): each
 * grid pose's corrections are solved on their own, and a vertex that only just violates at one pose and
 * not at the next made the muscle jump between them.
 */
function smoothOverGrid(values: Float32Array, stride: number): void {
	const tmp = new Float32Array(values.length);
	for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
		let step = 1;
		for (const ax of baked!.axes) {
			const n = ax.values.length;
			tmp.set(values);
			for (let node = 0; node < nodes; node++) {
				const i = Math.floor(node / step) % n;
				if (i === 0 || i === n - 1) continue;
				const o = node * stride, a = (node - step) * stride, b = (node + step) * stride;
				for (let j = 0; j < stride; j++) values[o + j] = 0.25 * tmp[a + j] + 0.5 * tmp[o + j] + 0.25 * tmp[b + j];
			}
			step *= n;
		}
	}
}
const file = resolve(J.dir, CORRECTIONS), bytes = gzipSync(encodeCorrections({ axes: baked.axes, key: bakedKey(baked), meshes: out }), { level: 9 });
writeFileSync(file, bytes);
console.log(`wrote ${file} (${(bytes.length / 1024).toFixed(0)} KB)`);
