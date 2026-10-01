/**
 * Bake lines of action (src/core/muscle/baked.ts) for a joint's baked muscles, or the meshes named,
 * into assets/<joint>/baked.bin.gz, keeping what is already baked for the others.
 *
 *     npm run bake -- <joint> [mesh ...] [--check] [--workers n] [--out file]
 *
 * Muscles are baked in rounds, each after the muscles it is kept off (lib/bake.ts, bakeRounds), so it is
 * kept off them as they will be drawn. The grid's chains (lib/bake.ts) are shared out among worker threads (default: one per core
 * but one). Prints, per strand, how far the band was squeezed inside its clearance and, with --check
 * (about as long again), how far interpolation strays from a walked band at the middle of the grid's
 * edges: large where a taut string can go round a bone more than one way.
 */
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { encodeBaked, nodeCount, strandKey, type BakedPaths, type BakedStrand } from '../src/core/muscle/baked';
import { isPoint, type PathPoint } from '../src/core/muscle/schema';
import type { Pose } from '../src/core/rig';
import { axisValues, bakeRounds, chainAxis, chains, M, nodePose, type Which } from './lib/bake';
import { BAKED, loadJoint } from './lib/pathcheck';

const args = process.argv.slice(2), check = args.includes('--check');
const wi = args.indexOf('--workers'), workers = wi >= 0 ? Number(args.splice(wi, 2)[1]) : Math.max(1, availableParallelism() - 1);
const oi = args.indexOf('--out'), out = oi >= 0 ? args.splice(oi, 2)[1] : null;
const [joint, ...named] = args.filter((a) => a !== '--check');
if (!joint) throw new Error('usage: bake <joint> [mesh ...] [--check] [--workers n]');
const J = loadJoint(joint);
if (!J.spec.bake) throw new Error(`${joint} has no bake axes (JOINTS in scripts/lib/pathcheck.ts)`);
const paths = J.spec.paths;
const axes = J.spec.bake.map((a) => ({ joint: a.joint, values: axisValues(J, a) }));
const meshes = named.length ? named : paths.muscles.filter((m) => m.baked).map((m) => m.mesh);
if (!meshes.length) throw new Error(`no baked muscles in ${joint}; name the meshes to bake`);
const defs = meshes.map((m) => {
	const d = paths.muscles.find((x) => x.mesh === m);
	if (!d) throw new Error(`${m} has no path in ${joint}`);
	return d;
}).sort((a, b) => a.layer - b.layer);

// what is already baked on the same grid, for strands whose points haven't changed; on a new grid (a joint's
// range changed) everything baked is baked again, so nothing is lost
const sameGrid = J.assets.baked && JSON.stringify(J.assets.baked.axes) === JSON.stringify(axes) && J.assets.baked.M === M;
if (J.assets.baked && !sameGrid)
	for (const m of new Set(J.assets.baked.strands.map((s) => s.mesh)))
		if (!meshes.includes(m) && paths.muscles.some((d) => d.mesh === m)) {
			meshes.push(m);
			defs.push(paths.muscles.find((d) => d.mesh === m)!);
		}
if (J.assets.baked && !sameGrid) console.log(`the grid changed: baking everything again (${meshes.join(', ')})`);
const strands: BakedStrand[] = sameGrid ? J.assets.baked!.strands.filter((s) => !meshes.includes(s.mesh)) : [];
const current = (): BakedPaths => ({ axes, M, strands });
const rest = Object.fromEntries(J.rig.def.joints.map((j) => [j.id, j.restAngle]));
const label = (n: number) => { const p: Pose = nodePose(axes, rest, n); return axes.map((a) => `${a.joint.slice(0, 4)} ${p[a.joint]}`).join(' '); };
const nodes = nodeCount(axes), c = chainAxis(axes), todo = chains(axes, c);

type Ready = { carry: [number, number, number][][]; clear: number[]; beneath: string[][] };
/** Run every chain through a pass on the pool; `each` gets each chain's result. */
function pass(pool: Worker[], name: 'bake' | 'check', each: (msg: any) => void): Promise<void> {
	return new Promise((done, fail) => {
		let next = 0, busy = 0;
		const feed = (w: Worker) => {
			if (next < todo.length) { busy++; w.postMessage({ pass: name, chain: todo[next++] }); }
			else if (!busy) done();
		};
		for (const w of pool) {
			w.removeAllListeners('message');
			w.on('message', (msg) => { busy--; each(msg); feed(w); });
			w.on('error', fail);
		}
		for (const w of pool) feed(w);
	});
}

console.log(`${joint}: ${axes.map((a) => `${a.joint} ${a.values.length}`).join(' × ')} grid poses, ${todo.length} chains along ${axes[c].joint}, ${workers} workers`);
for (const [round, ms] of bakeRounds(J, paths, defs.map((d) => d.mesh)).entries()) {
	const t = performance.now();
	const which: Which[] = defs.filter((d) => ms.includes(d.mesh)).flatMap((d) => d.strands.map((_, k) => ({ mesh: d.mesh, k })));
	const buffers = which.map(() => new SharedArrayBuffer(nodes * M * 3 * 4));
	const workerData = { joint, axes, which, chainAxis: c, baked: strands.length ? encodeBaked(current()) : null, buffers };
	const pool = Array.from({ length: Math.min(workers, todo.length) }, () => new Worker(new URL('./lib/bakeWorker.ts', import.meta.url), { workerData }));
	const ready = await Promise.all(pool.map((w) => new Promise<Ready>((ok, fail) => { w.once('message', ok); w.once('error', fail); })));
	const squeeze = which.map((): [number, number, number] => [0, -1, -1]);
	let done = 0;
	await pass(pool, 'bake', (msg: { squeeze: [number, number, number][] }) => {
		msg.squeeze.forEach((s, k) => { if (s[0] > squeeze[k][0]) squeeze[k] = s; });
		if (++done % 50 === 0) console.log(`  ${done}/${todo.length} chains, ${((performance.now() - t) / 1000).toFixed(0)} s`);
	});
	console.log(`round ${round + 1} (${ms.join(', ')}): ${which.length} strands, ${((performance.now() - t) / 1000).toFixed(0)} s`);
	const errors: number[][] = which.map(() => []), worst: { k: number; d: number; n: number; m: number }[] = [];
	if (check) {
		const tc = performance.now();
		await pass(pool, 'check', (msg: { errors: Float32Array }) => {
			for (let i = 0; i < msg.errors.length; i += 4) {
				const [k, d, n, m] = msg.errors.subarray(i, i + 4);
				errors[k].push(d);
				worst.push({ k, d, n, m });
			}
		});
		console.log(`  checked in ${((performance.now() - tc) / 1000).toFixed(0)} s`);
	}
	await Promise.all(pool.map((w) => w.terminate()));
	which.forEach((w, k) => {
		const def = paths.muscles.find((d) => d.mesh === w.mesh)!, fixed = def.strands[w.k].filter(isPoint) as PathPoint[];
		strands.push({ mesh: w.mesh, strand: w.k, key: strandKey(fixed), frame: J.manifest.bones.indexOf(fixed[fixed.length - 1].bone), carry: ready[0].carry[k], clear: ready[0].clear[k], data: new Float32Array(buffers[k]) });
		const [short, sn, sb] = squeeze[k], beneath = ready[0].beneath[k];
		console.log(`${w.mesh} ${w.k}: clearance ${ready[0].clear[k].toFixed(1)} mm off bone${beneath.length ? ` and ${beneath.join(', ')}` : ''}; squeezed ${short.toFixed(1)} mm inside it${short > 0 ? ` (${J.manifest.bones[sb]}, ${label(sn)})` : ''}`);
		if (check) {
			const e = errors[k].sort((a, b) => b - a), q = (f: number) => e[Math.floor(e.length * f)].toFixed(1);
			console.log(`  interpolation error at grid-edge midpoints: median ${q(0.5)}, 99% ${q(0.01)}, worst:`);
			for (const x of worst.filter((x) => x.k === k).sort((a, b) => b.d - a.d).slice(0, 4)) console.log(`    ${x.d.toFixed(1)} mm  ${label(x.n)} → ${label(x.m)}`);
		}
	});
}
const file = out ? resolve(out) : resolve(J.dir, BAKED), bytes = gzipSync(encodeBaked(current()), { level: 9 });
writeFileSync(file, bytes);
console.log(`wrote ${file} (${(bytes.length / 1024).toFixed(0)} KB, ${strands.length} strands)`);
