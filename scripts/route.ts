/**
 * Muscle routing against reference lines of action (lib/reference.ts): the taut string between a
 * strand's fixed points that stays its muscle's half-thickness off bone and off the muscles beneath.
 *
 *     npm run route -- check <joint> [mesh ...]
 *         each strand of the joint's paths against its reference over the joint's test poses: mean and
 *         worst distance of the strand from it, and its length over the reference's
 *     npm run route -- draft <joint> <mesh> [--strands K] [--layer n]
 *         a path entry drafted from the mesh: K strands' ends from its attachment footprints (lib/sheet.ts;
 *         a sheet's paired across its width), and for each strand the wraps, from the joint's surfaces on
 *         the bones its reference touches, that keep it closest to the reference without its frames jumping
 *
 * Wraps are chosen, not fitted: a surface a strand needs that the joint doesn't have yet (the rib cage
 * for the pectoralis, what the deltoid drapes over) still has to be added to the joint's paths.
 */
import { PathSolver } from '../src/core/muscle/path';
import { isPoint, type JointPaths, type MusclePathDef, type PathElement, type PathPoint } from '../src/core/muscle/schema';
import type { Pose } from '../src/core/rig';
import { loadJoint, type LoadedJoint } from './lib/pathcheck';
import { deviation, makeReference, routeContext, type Band } from './lib/reference';
import { draftEnds } from './lib/sheet';

/** Largest frame turn per 1° step a drafted strand may have, degrees. */
const TURN = 10;
/** Least improvement in mean distance from the reference for a wrap to be taken, mm. */
const GAIN = 0.2;

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
	const i = args.indexOf(k);
	return i >= 0 ? args.splice(i, 2)[1] : d;
};
const [cmd, joint, ...rest] = args;
if (!cmd || !joint) throw new Error('usage: route check <joint> [mesh ...] | route draft <joint> <mesh> [--strands K] [--layer n]');
const J = loadJoint(joint);
const ctx = routeContext(J);

/** The references of a strand's fixed points at the joint's test poses. */
function bands(mesh: string, fixed: PathPoint[]): Band[] {
	const ref = makeReference(ctx, mesh, fixed);
	return J.spec.poses.map((p) => ref(p));
}

/** Mean and worst distance from the references, length ratio range, for a strand of a solver. */
function score(solver: PathSolver, strand: number, refs: Band[]) {
	let mean = 0, worst = 0, lo = Infinity, hi = 0;
	J.spec.poses.forEach((p, i) => {
		solver.solve(J.rig.clamp(p));
		const d = deviation(solver, strand, refs[i]);
		mean += d.mean / refs.length;
		worst = Math.max(worst, d.max);
		lo = Math.min(lo, d.ratio);
		hi = Math.max(hi, d.ratio);
	});
	return { mean, worst, lo, hi };
}

/** Largest frame turn per 1° step over each of the joint's sweeps. */
function turn(solver: PathSolver, rig: LoadedJoint['rig']): number {
	let worst = 0;
	for (const { joint: j, at } of J.spec.sweeps.flatMap((w) => w.at.map((a) => ({ joint: w.joint, at: a })))) {
		const jt = rig.joint(j);
		let prev: Float64Array | null = null;
		for (let a = jt.min; a <= jt.max; a++) {
			solver.solve(rig.clamp({ ...at, [j]: a } as Pose));
			const Q = solver.quat;
			if (prev)
				for (let k = 0; k < Q.length; k += 4) {
					const d = Math.abs(Q[k] * prev[k] + Q[k + 1] * prev[k + 1] + Q[k + 2] * prev[k + 2] + Q[k + 3] * prev[k + 3]);
					worst = Math.max(worst, (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI);
				}
			prev = Q.slice();
		}
	}
	return worst;
}

function check(meshes: string[]): void {
	const paths = J.spec.paths;
	const names = meshes.length ? meshes : paths.muscles.map((m) => m.mesh);
	console.log(`${'strand'.padEnd(20)}${'mean'.padStart(7)}${'worst'.padStart(8)}   length / reference`);
	for (const name of names) {
		const def = paths.muscles.find((m) => m.mesh === name);
		if (!def) throw new Error(`${name} has no path in ${joint}`);
		const solver = new PathSolver({ ...paths, muscles: [def] }, J.rig, J.manifest.bones);
		def.strands.forEach((els, k) => {
			const s = score(solver, k, bands(name, els.filter(isPoint) as PathPoint[]));
			console.log(`${`${name} ${k}`.padEnd(20)}${s.mean.toFixed(1).padStart(7)}${s.worst.toFixed(1).padStart(8)}   ${s.lo.toFixed(2)}–${s.hi.toFixed(2)}`);
		});
	}
}

function draft(mesh: string, K: number, layer: number): void {
	const paths = J.spec.paths, { top, bottom } = draftEnds(J, mesh, K);
	console.log(`${mesh}: ${top.bone} end ${top.count} vertices on bone, ${bottom.bone} end ${bottom.count}`);
	const strands: PathElement[][] = [];
	for (let k = 0; k < K; k++) {
		const ends: PathPoint[] = [{ bone: top.bone, p: top.points[k] }, { bone: bottom.bone, p: bottom.points[k] }];
		const refs = bands(mesh, ends);
		// candidates: no wrap, and each of the joint's surfaces on a bone the references touch
		const touched = new Set(refs.flatMap((b) => b.contacts.filter((c) => typeof c.on === 'number').map((c) => J.manifest.bones[c.on as number])));
		const names = Object.entries(paths.surfaces).filter(([, s]) => touched.has(s.bone)).map(([n]) => n);
		let best: { els: PathElement[]; mean: number; label: string } | null = null;
		const rows: string[] = [];
		for (const wrap of [null, ...names]) {
			const els: PathElement[] = wrap ? [ends[0], { wrap }, ends[1]] : ends;
			const def: MusclePathDef = { mesh, layer, strands: [els] };
			let solver: PathSolver;
			try {
				solver = new PathSolver({ ...paths, muscles: [def] } as JointPaths, J.rig, J.manifest.bones);
			} catch {
				continue;
			}
			const s = score(solver, 0, refs), t = turn(solver, J.rig), label = wrap ?? 'straight';
			rows.push(`${label} ${s.mean.toFixed(1)}/${s.worst.toFixed(0)} mm ${t.toFixed(0)}°`);
			if (t <= TURN && (!best || s.mean < best.mean - GAIN)) best = { els, mean: s.mean, label };
		}
		console.log(`  strand ${k}: ${rows.join(' | ')}  → ${best?.label ?? 'none continuous'}`);
		strands.push(best?.els ?? ends);
	}
	const fmt = (e: PathElement) => ((e as PathPoint).p ? `{ bone: '${(e as PathPoint).bone}', p: [${(e as PathPoint).p.join(', ')}] }` : `{ wrap: '${(e as { wrap: string }).wrap}' }`);
	console.log(`\n\t\t{\n\t\t\tmesh: '${mesh}',\n\t\t\tlayer: ${layer},${K > 1 ? '\n\t\t\tfan: true,' : ''}\n\t\t\tstrands: [\n${strands.map((els) => `\t\t\t\t[${els.map(fmt).join(', ')}]`).join(',\n')}\n\t\t\t]\n\t\t}`);
}

if (cmd === 'check') check(rest);
else if (cmd === 'draft') draft(rest[0], Number(opt('--strands', '1')), Number(opt('--layer', '1')));
else throw new Error(`unknown command ${cmd}`);

