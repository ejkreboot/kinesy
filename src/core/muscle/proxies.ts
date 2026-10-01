/**
 * Muscle proxies: a muscle's strands as chains of tapered capsules that follow the solved paths,
 * so muscles in higher layers can be kept off it (layered contact) without muscle-to-muscle mesh
 * tests. Radii come from the bound mesh's thickness around each strand.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import type { BoundMesh } from './bind';
import type { CapsuleArray } from './deform';
import type { PathSolver } from './path';

export interface ProxySpec {
	strand: number;
	layer: number;
	/** sample indices of the capsule ends */
	i0: number;
	i1: number;
	r0: number;
	r1: number;
}

/**
 * Capsule chains for every mesh below the top layer (nothing lies on the top one), ordered by
 * layer so a mesh's pushers are a prefix: `perStrand` capsules along each strand, each end's radius
 * the mean distance of nearby vertices from the strand across it, scaled by `fill`, over the part
 * of the strand the mesh covers. Sets each mesh's `caps`.
 */
export function buildProxies(solver: PathSolver, bound: BoundMesh[], perStrand = 6, fill = 1.0): ProxySpec[] {
	const out: ProxySpec[] = [], top = Math.max(...bound.map((b) => b.layer));
	for (const b of [...bound].sort((x, y) => x.layer - y.layer)) if (b.layer !== top) meshCapsules(solver, b, perStrand, fill, out);
	for (const b of bound) {
		b.capFirst = 0;
		b.caps = out.filter((c) => c.layer < b.layer).length;
	}
	return out;
}

/**
 * Capsule chains (as buildProxies) only for the meshes muscles name as lying `over` (MusclePathDef.over),
 * in the solver's muscle order; sets each naming mesh's range of them.
 */
export function buildOverProxies(solver: PathSolver, bound: BoundMesh[], perStrand = 6, fill = 1.0): ProxySpec[] {
	const out: ProxySpec[] = [], range = new Map<string, [number, number]>();
	const named = new Set(bound.flatMap((b) => solver.muscles[b.muscle].def.over ?? []));
	for (const b of bound) {
		if (!named.has(b.name)) continue;
		const from = out.length;
		meshCapsules(solver, b, perStrand, fill, out);
		range.set(b.name, [from, out.length]);
	}
	for (const b of bound) {
		const over = solver.muscles[b.muscle].def.over ?? [];
		if (!over.length) continue;
		const r = over.map((n) => {
			const x = range.get(n);
			if (!x) throw new Error(`${b.name}: lies over ${n}, which has no path`);
			return x;
		}).sort((x, y) => x[0] - y[0]);
		for (let k = 1; k < r.length; k++) if (r[k][0] !== r[k - 1][1]) throw new Error(`${b.name}: the meshes it lies over must be consecutive among those named over`);
		b.capFirst = r[0][0];
		b.caps = r[r.length - 1][1] - r[0][0];
	}
	return out;
}

/** One mesh's capsule chains, appended to out. */
function meshCapsules(solver: PathSolver, b: BoundMesh, perStrand: number, fill: number, out: ProxySpec[]): void {
	const N = solver.N;
	const m = solver.muscles[b.muscle];
	for (let k = 0; k < m.count; k++) {
		const strand = m.first + k;
		const sum = new Float64Array(N), cnt = new Float64Array(N);
		for (let v = 0; v < b.nv; v++) {
			const s = b.path[v * 4], w = (b.path[v * 4 + 2] - m.first) + b.path[v * 4 + 1];
			if (Math.abs(w - k) > 0.5) continue;
			const i = Math.round(s * (N - 1));
			sum[i] += Math.hypot(b.offset[v * 3 + 1], b.offset[v * 3 + 2]);
			cnt[i]++;
		}
		const covered = [...cnt.keys()].filter((i) => cnt[i] >= 2);
		if (covered.length < 2) continue;
		const lo = covered[0], hi = covered[covered.length - 1];
		const radius = (i: number) => {
			let s = 0, n = 0;
			for (let j = Math.max(lo, i - 2); j <= Math.min(hi, i + 2); j++) { s += sum[j]; n += cnt[j]; }
			return Math.min(10, Math.max(1, (fill * s) / Math.max(1, n)));
		};
		for (let c = 0; c < perStrand; c++) {
			const i0 = Math.round(lo + ((hi - lo) * c) / perStrand), i1 = Math.round(lo + ((hi - lo) * (c + 1)) / perStrand);
			out.push({ strand, layer: b.layer, i0, i1, r0: radius(i0), r1: radius(i1) });
		}
	}
}

/** Current capsules (8 floats each) for the solver's last pose. */
export function writeCapsules(solver: PathSolver, specs: ProxySpec[], out: CapsuleArray = new Float32Array(specs.length * 8)): CapsuleArray {
	const P = solver.pos, N = solver.N;
	specs.forEach((c, k) => {
		const a = (c.strand * N + c.i0) * 3, b = (c.strand * N + c.i1) * 3, o = k * 8;
		out[o] = P[a]; out[o + 1] = P[a + 1]; out[o + 2] = P[a + 2]; out[o + 3] = c.r0;
		out[o + 4] = P[b]; out[o + 5] = P[b + 1]; out[o + 6] = P[b + 2]; out[o + 7] = c.r1;
	});
	return out;
}
