/**
 * A bake worker (scripts/bake.ts): loads the joint, builds a ChainBaker for one layer's strands, then
 * solves the chains it is sent, writing each grid pose's points straight into the shared buffers.
 *
 * In:  workerData { joint, axes, which, chainAxis, baked (encoded bake so far, or null), buffers }
 *      messages { pass: 'bake' | 'check', chain }
 * Out: { ready, carry, clear, beneath } once, then per chain
 *      { done, squeeze: [mm, node, bone][] per strand } or { done, errors: Float32Array of (strand, d, node, neighbour) }
 */
import { parentPort, workerData } from 'node:worker_threads';
import { decodeBaked, type BakedAxis } from '../../src/core/muscle/baked';
import { ChainBaker, obstaclePaths, type Which } from './bake';
import { loadJoint } from './pathcheck';

const { joint, axes, which, chainAxis, baked, buffers } = workerData as {
	joint: string; axes: BakedAxis[]; which: Which[]; chainAxis: number; baked: Uint8Array | null; buffers: SharedArrayBuffer[];
};
const J = loadJoint(joint);
J.assets.baked = baked ? decodeBaked(baked.buffer.slice(baked.byteOffset, baked.byteOffset + baked.byteLength) as ArrayBuffer) : undefined;
const obstacles = obstaclePaths(J.spec.paths, J.assets.baked ?? { axes, M: 0, strands: [] });
const baker = new ChainBaker(J, J.spec.paths, obstacles, axes, which, chainAxis);
const data = buffers.map((b) => new Float32Array(b));
const port = parentPort!;

port.postMessage({
	ready: true,
	carry: baker.jobs.map((_, k) => baker.carry(k)),
	clear: baker.jobs.map((j) => j.model.clear),
	beneath: baker.jobs.map((j) => [...j.model.beneath, ...j.model.under.map((m) => `below ${m}`)])
});

port.on('message', ({ pass, chain }: { pass: 'bake' | 'check'; chain: number[] }) => {
	if (pass === 'bake') {
		const squeeze = baker.jobs.map((): [number, number, number] => [0, -1, -1]);
		baker.run(chain, (n, states) => {
			states.forEach((s, k) => {
				baker.store(k, s, n, data[k]);
				const [short, bone] = baker.squeeze(k, s);
				if (short > squeeze[k][0]) squeeze[k] = [short, n, bone];
			});
		});
		port.postMessage({ done: true, squeeze });
	} else {
		const errors: number[] = [];
		baker.run(chain, (n, states) => {
			for (const e of baker.edgeErrors(n, states, data)) errors.push(e.k, e.d, n, e.m);
		});
		const out = Float32Array.from(errors);
		port.postMessage({ done: true, errors: out }, [out.buffer]);
	}
});
