/**
 * Draft a muscle's path entry from its mesh and the bones, then check it.
 *
 *     npm run draft:paths -- <joint> <mesh> [--layer n] [--no-wraps]
 *
 * 1. Ends: the mesh's proximal and distal ends along its long axis. Each end's bone is the one its
 *    skin weights favour there; its point is the end's centroid, taken on the bone where the end
 *    touches it.
 * 2. Via points: the mesh's centerline, simplified, where the muscle runs along a bone: it rides
 *    that bone alone (skin weight ≥ VIA_WEIGHT) and touches it there (a belly merely skinned to a
 *    bone it doesn't touch would be dragged around with it). Where the weights are mixed the muscle
 *    crosses a joint and is left to wraps.
 * 3. Wraps: the draft is swept over the joint's range. Wherever the strand passes through a bone,
 *    candidate surfaces are tried on each side and in each segment: the joint's existing surfaces
 *    on that bone, a cylinder fitted to the bone there, and cylinders about nearby joint axes (the
 *    muscle's half-thickness beyond the bone). The one that clears the most is kept; repeated while
 *    it helps.
 * 4. The entry (and any new surfaces) is printed to paste into the joint's paths, followed by the
 *    full path check of the drafted mesh.
 *
 * One strand per muscle: sheets (several strands) still need their strands laid out by hand.
 */
import type { Vec3 } from '../src/core/math';
import { PathSolver } from '../src/core/muscle/path';
import type { CylinderSurface, JointPaths, MusclePathDef, PathElement, WrapSurface } from '../src/core/muscle/schema';
import { MuscleSystem } from '../src/core/muscle/system';
import type { Pose } from '../src/core/rig';
import { sdfSample } from '../src/core/sdf';
import { loadJoint, poseGrid, report, strandDepth } from './lib/pathcheck';

/** Length of each end region along the muscle's axis, mm. */
const END = 6;
/** Skin weight to one bone at which a centerline point becomes a via point on it. */
const VIA_WEIGHT = 0.95;
/** A centerline point touches a bone when this many vertices within TOUCH_SLAB of it along the
 * muscle lie within TOUCH_MM of the bone. */
const TOUCH_COUNT = 8;
const TOUCH_SLAB = 6;
const TOUCH_MM = 1.5;
/** Douglas-Peucker tolerance when simplifying the centerline, mm. */
const SIMPLIFY = 3;
/** Penetration a strand may keep, mm. */
const ALLOW = 0.5;
const MAX_WRAPS = 3;

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const layer = Number(flag('--layer') ?? 9);
// ends and via points only: skip the wrap search (and the full check)
const noWraps = args.includes('--no-wraps') && !!args.splice(args.indexOf('--no-wraps'), 1);
const [joint, meshName] = args;
if (!joint || !meshName) throw new Error('usage: draft-paths <joint> <mesh> [--layer n (0 deepest; default on top)]');

const J = loadJoint(joint);
const { assets, rig, manifest, spec } = J;
const mesh = assets.muscles.find((m) => m.name === meshName);
if (!mesh) throw new Error(`No muscle mesh ${meshName}`);
const nb = assets.boneCount, bones = manifest.bones, R = mesh.rest, cl = mesh.centerline;
const r1 = (v: ArrayLike<number>): Vec3 => [Math.round(v[0] * 10) / 10, Math.round(v[1] * 10) / 10, Math.round(v[2] * 10) / 10];
const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2]);
const vert = (i: number): Vec3 => [R[i * 3], R[i * 3 + 1], R[i * 3 + 2]];
const sdf = (b: number, p: ArrayLike<number>) => (assets.fields[b] ? sdfSample(assets.fields[b]!, p[0], p[1], p[2]) : Infinity);
const mean = (pts: Vec3[]): Vec3 => {
	const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
	return [s[0] / pts.length, s[1] / pts.length, s[2] / pts.length];
};

// ---- 1. ends ----
const t = Array.from({ length: mesh.nv }, (_, i) => dot(sub(vert(i), cl.mu), cl.a));
const tMax = Math.max(...t), tMin = Math.min(...t);
function end(top: boolean): { bone: number; p: Vec3 } {
	const ids = t.map((v, i) => [v, i]).filter(([v]) => (top ? v >= tMax - END : v <= tMin + END)).map(([, i]) => i);
	const w = new Array(nb).fill(0);
	for (const i of ids) for (let b = 0; b < nb; b++) w[b] += mesh!.weights[i * nb + b];
	const bone = w.indexOf(Math.max(...w));
	const touching = ids.filter((i) => sdf(bone, vert(i)) < 2);
	return { bone, p: mean((touching.length >= 3 ? touching : ids).map(vert)) };
}
const origin = end(true), insertion = end(false);

// ---- 2. via points ----
const bins = cl.C.map((c, k) => ({ c: c as Vec3, w: cl.W[k], t: dot(sub(c, cl.mu), cl.a) })).sort((a, b) => b.t - a.t);
function simplify(pts: Vec3[], tol: number): number[] {
	const keep = new Set([0, pts.length - 1]);
	const rec = (a: number, b: number) => {
		let far = -1, fd = tol;
		const ab = sub(pts[b], pts[a]), L = norm(ab) || 1;
		for (let k = a + 1; k < b; k++) {
			const ap = sub(pts[k], pts[a]), u = Math.min(1, Math.max(0, dot(ap, ab) / (L * L)));
			const d = norm(sub(ap, [ab[0] * u, ab[1] * u, ab[2] * u]));
			if (d > fd) { fd = d; far = k; }
		}
		if (far < 0) return;
		keep.add(far);
		rec(a, far);
		rec(far, b);
	};
	rec(0, pts.length - 1);
	return [...keep].sort((a, b) => a - b);
}
const line = [origin.p, ...bins.map((b) => b.c), insertion.p];
const via: { bone: number; p: Vec3 }[] = [];
for (const k of simplify(line, SIMPLIFY).slice(1, -1)) {
	const b = bins[k - 1], wmax = Math.max(...b.w), bone = b.w.indexOf(wmax);
	const prev = via.length ? via[via.length - 1].p : origin.p;
	let touch = 0;
	for (let i = 0; i < mesh.nv && touch < TOUCH_COUNT; i++) if (Math.abs(t[i] - b.t) < TOUCH_SLAB && sdf(bone, vert(i)) < TOUCH_MM) touch++;
	if (wmax >= VIA_WEIGHT && touch >= TOUCH_COUNT && norm(sub(b.c, prev)) > 10 && norm(sub(b.c, insertion.p)) > 10) via.push({ bone, p: b.c });
}

// ---- 3. wraps ----
const surfaces: Record<string, WrapSurface> = { ...spec.paths.surfaces };
const added: string[] = [];
let elements: PathElement[] = [
	{ bone: bones[origin.bone], p: r1(origin.p) },
	...via.map((v) => ({ bone: bones[v.bone], p: r1(v.p) })),
	{ bone: bones[insertion.bone], p: r1(insertion.p) }
];
const def = (els: PathElement[]): MusclePathDef => ({ mesh: meshName, layer, strands: [els] });
const poses = poseGrid(rig, 5);
const restPose: Pose = Object.fromEntries(rig.def.joints.map((j) => [j.id, j.restAngle]));

/** Sweeps for continuity: each joint over its range in 2° steps, the others at min, mid, max. */
const sweeps: Pose[][] = rig.def.joints.filter((j) => j.axis).flatMap((j) =>
	rig.def.joints.filter((o) => o.axis && o !== j).flatMap((o) =>
		[o.min, (o.min + o.max) / 2, o.max].map((ov) => {
			const out: Pose[] = [];
			for (let a = j.min; a <= j.max; a += 2) out.push(rig.clamp({ [o.id]: ov, [j.id]: a }));
			return out;
		})
	)
);

interface Score {
	pen: number;
	worst: ReturnType<typeof strandDepth> & { pose: Pose };
	/** rest path's mean distance from the mesh centerline, mm */
	dev: number;
	/**
	 * largest step of a sweep (the most any sample moves between neighbouring poses) as a multiple
	 * of that sweep's median step: about 1 when the path moves smoothly, large where it pops
	 */
	pop: number;
	/** largest turn of any sample's frame between neighbouring sweep poses, degrees */
	turn: number;
}
/** Frame turn per sweep step that counts as a flip, degrees. */
const TURN = 10;
/** A sweep step this many times the sweep's median step is a pop. */
const POP = 3;
const total = (s: Score, dev0: number) => s.pen + 0.2 * Math.max(0, s.dev - dev0);
const smooth = (s: Score) => s.pop <= POP && s.turn <= TURN;

/** Penetration summed over the pose grid, the worst site, rest path deviation, and continuity. */
function score(els: PathElement[], surf: Record<string, WrapSurface>): Score | null {
	let solver: PathSolver;
	try {
		solver = new PathSolver({ surfaces: surf, muscles: [def(els)] } as JointPaths, rig, bones);
	} catch {
		return null;
	}
	let pen = 0, worst: Score['worst'] = { d: Infinity, strand: 0, sample: 0, bone: 0, local: [0, 0, 0], pose: {} };
	for (const pose of poses) {
		solver.solve(pose);
		const d = strandDepth(solver, assets, [0]);
		pen += Math.max(0, -d.d - ALLOW);
		if (d.d < worst.d) worst = { ...d, pose };
	}
	solver.solve(restPose);
	const poly = solver.polyline(0);
	let dev = 0;
	for (const b of bins) {
		let m = Infinity;
		for (let k = 3; k < poly.length; k += 3) {
			const a = [poly[k - 3], poly[k - 2], poly[k - 1]], ab = sub([poly[k], poly[k + 1], poly[k + 2]], a), ap = sub(b.c, a);
			const u = Math.min(1, Math.max(0, dot(ap, ab) / (dot(ab, ab) || 1)));
			m = Math.min(m, norm(sub(ap, [ab[0] * u, ab[1] * u, ab[2] * u])));
		}
		dev += m / bins.length;
	}
	let pop = 0, turn = 0;
	for (const sweep of sweeps) {
		let prev: Float64Array | null = null, prevQ: Float64Array | null = null;
		const steps: number[] = [];
		for (const pose of sweep) {
			solver.solve(pose);
			const P = solver.pos, Q = solver.quat;
			if (prev && prevQ) {
				let m = 0;
				for (let k = 0; k < P.length; k += 3) m = Math.max(m, Math.hypot(P[k] - prev[k], P[k + 1] - prev[k + 1], P[k + 2] - prev[k + 2]));
				steps.push(m);
				for (let k = 0; k < Q.length; k += 4) {
					const d = Math.abs(Q[k] * prevQ[k] + Q[k + 1] * prevQ[k + 1] + Q[k + 2] * prevQ[k + 2] + Q[k + 3] * prevQ[k + 3]);
					turn = Math.max(turn, (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI);
				}
			}
			prev = P.slice();
			prevQ = Q.slice();
		}
		const med = [...steps].sort((a, b) => a - b)[steps.length >> 1];
		pop = Math.max(pop, Math.max(...steps) / (med + 0.2));
	}
	return { pen, worst, dev, pop, turn };
}

/** The muscle's half-thickness around the rest strand at share s of its length (mm). */
function halfThickness(s: number): number {
	const k = Math.round(s * (bins.length - 1)), c = bins[Math.min(bins.length - 1, Math.max(0, k))].c;
	const d = [];
	for (let i = 0; i < mesh!.nv; i++) {
		const r = norm(sub(vert(i), c));
		if (r < 15) d.push(r);
	}
	d.sort((a, b) => a - b);
	return Math.min(6, Math.max(1.5, 0.5 * (d[d.length >> 1] ?? 3)));
}

/** "pt_hum" → "PtHum", for surface names. */
const camel = (n: string) => n.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase());

/** Candidate wrap surfaces for a strand passing through bone b at rest-frame point x. */
function candidates(b: number, x: Vec3, h: number): [string, WrapSurface][] {
	const out: [string, WrapSurface][] = Object.entries(surfaces).filter(([, s]) => s.bone === bones[b]);
	const bv: Vec3[] = [];
	for (const m of assets.bones) if (m.bone === b) for (let i = 0; i < m.nv; i++) bv.push([m.rest[i * 3], m.rest[i * 3 + 1], m.rest[i * 3 + 2]]);
	const cyl = (name: string, center: Vec3, axis: Vec3, slab: number, sector: number): [string, CylinderSurface] | null => {
		const a = axis.map((v) => v / norm(axis)) as Vec3, xa = dot(sub(x, center), a);
		const toX = sub(x, center).map((v, k) => v - xa * a[k]) as Vec3, tl = norm(toX);
		let r = 0;
		for (const p of bv) {
			const pa = dot(sub(p, center), a);
			if (Math.abs(pa - xa) > slab) continue;
			const q = sub(p, center).map((v, k) => v - pa * a[k]) as Vec3, ql = norm(q);
			if (sector < 1 && tl > 1e-6 && dot(q, toX) < sector * ql * tl) continue;
			r = Math.max(r, ql);
		}
		if (!r) return null;
		const c = center.map((v, k) => v + xa * a[k]) as Vec3;
		return [name, { kind: 'cylinder', bone: bones[b], center: r1(c), axis: a.map((v) => Math.round(v * 1000) / 1000) as Vec3, radius: Math.round((r + h) * 10) / 10 }];
	};
	// the bone's own long direction near x
	const near = bv.filter((p) => norm(sub(p, x)) < 20);
	if (near.length > 10) {
		const c = mean(near);
		let v: Vec3 = [0, 1, 0];
		for (let it = 0; it < 50; it++) {
			const w: Vec3 = [0, 0, 0];
			for (const p of near) {
				const d = sub(p, c), k = dot(d, v);
				w[0] += d[0] * k; w[1] += d[1] * k; w[2] += d[2] * k;
			}
			v = w.map((u) => u / (norm(w) || 1)) as Vec3;
		}
		const s = cyl(`${bones[b]}${camel(meshName)}${added.length + 1}`, c, v, 8, 1);
		if (s) out.push(s);
	}
	for (const [id, ax] of Object.entries(manifest.axes)) {
		const d = sub(x, ax.point), along = dot(d, ax.dir);
		if (norm(d.map((v, k) => v - along * ax.dir[k])) > 35) continue;
		const s = cyl(`${bones[b]}${camel(id)}${camel(meshName)}`, ax.point as Vec3, ax.dir as Vec3, 10, Math.cos(Math.PI / 4));
		if (s) out.push(s);
	}
	return out;
}

let current = score(elements, surfaces)!;
console.log(`draft: ${elements.length - 2} via points; penetration score ${current.pen.toFixed(1)} (worst ${current.worst.d.toFixed(1)} mm in ${bones[current.worst.bone]}), largest step ${current.pop.toFixed(1)}× the median, largest frame turn ${current.turn.toFixed(1)}°`);
for (let round = 0; round < (noWraps ? 0 : MAX_WRAPS) && current.worst.d < -ALLOW; round++) {
	const w = current.worst, h = halfThickness(w.sample / 47);
	let best: { els: PathElement[]; surf: Record<string, WrapSurface>; sc: Score; name: string; side?: number } | null = null;
	for (const [name, s] of candidates(w.bone, w.local, h)) {
		const surf = { ...surfaces, [name]: s };
		for (let k = 0; k < elements.length - 1; k++)
			for (const side of [undefined, 1, -1] as (1 | -1 | undefined)[]) {
				const els = [...elements.slice(0, k + 1), side ? { wrap: name, side } : { wrap: name }, ...elements.slice(k + 1)];
				const sc = score(els, surf);
				if (!sc || !smooth(sc)) continue;
				if (!best || total(sc, current.dev) < total(best.sc, current.dev)) best = { els, surf, sc, name, side };
			}
	}
	if (!best || best.sc.pen > current.pen * 0.8) break;
	if (!(best.name in surfaces)) added.push(best.name);
	Object.assign(surfaces, best.surf);
	elements = best.els;
	current = best.sc;
	console.log(`  + wrap ${best.name}${best.side ? ` side ${best.side}` : ''}: score ${current.pen.toFixed(1)}, worst ${current.worst.d.toFixed(1)} mm in ${bones[current.worst.bone]}, rest path ${current.dev.toFixed(1)} mm from the mesh centerline, largest step ${current.pop.toFixed(1)}× the median, largest frame turn ${current.turn.toFixed(1)}°`);
}

// ---- 4. output + check ----
const fmt = (v: unknown) => JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ');
console.log('\n// surfaces');
for (const n of added) console.log(`\t\t${n}: ${fmt(surfaces[n])},`);
console.log(`// muscle\n\t\t{\n\t\t\tmesh: '${meshName}',\n\t\t\tlayer: ${layer},\n\t\t\tstrands: [[\n${elements.map((e) => `\t\t\t\t${fmt(e)}`).join(',\n')}\n\t\t\t]]\n\t\t}`);

if (noWraps) process.exit(0);
const paths: JointPaths = { ...spec.paths, surfaces, muscles: [...spec.paths.muscles.filter((m) => m.mesh !== meshName), def(elements)] };
const sys = new MuscleSystem(paths, assets, rig);
console.log('');
const failures = report(J, sys, [meshName]);
console.log(failures ? `\n${failures} check(s) failing` : '\nall checks pass');
