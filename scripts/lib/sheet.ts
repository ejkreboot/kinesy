/**
 * Strand ends drafted from a muscle mesh: its attachment footprints (vertices lying on the bone at each end)
 * split into K points across the muscle, paired end to end. For a sheet (the pectoralis, the deltoid's
 * parts) the pairing follows the muscle's width direction along its length, carried slice to slice, so a
 * tendon that twists (the pectoralis's lowest fibres inserting highest) pairs the right fibres. K = 1
 * gives a single strand's ends.
 */
import { sdfSample } from '../../src/core/sdf';
import type { Vec3 } from '../../src/core/math';
import type { LoadedJoint } from './pathcheck';

/** A vertex lies on a bone within this many mm of it. */
const TOUCH = 1.5;
/** Slices along the muscle for its width direction. */
const SLICES = 16;
/** Length of each end region used when an end doesn't touch its bone (a tendon ending off the mesh), mm. */
const END = 8;

export interface Footprint {
	bone: string;
	/** vertices on the bone */
	count: number;
	/** K points across the footprint, in order across the muscle */
	points: Vec3[];
}

export function draftEnds(J: LoadedJoint, mesh: string, K: number): { top: Footprint; bottom: Footprint } {
	const { assets, manifest } = J;
	const m = assets.muscles.find((x) => x.name === mesh);
	if (!m) throw new Error(`No muscle mesh ${mesh}`);
	const R = m.rest, cl = m.centerline, nb = assets.boneCount;
	const V = (i: number): Vec3 => [R[i * 3], R[i * 3 + 1], R[i * 3 + 2]];
	const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	const t = Array.from({ length: m.nv }, (_, i) => dot(V(i).map((v, k) => v - cl.mu[k]), cl.a));
	const tMax = Math.max(...t), tMin = Math.min(...t), h = (tMax - tMin) / SLICES;
	// the width direction along the muscle: each slice's principal axis across it, sign carried along
	const across: Vec3[] = [];
	for (let k = 0; k < SLICES; k++) {
		const ids = t.map((v, i) => [v, i]).filter(([v]) => v >= tMin + k * h && v <= tMin + (k + 1) * h).map(([, i]) => i);
		const c = [0, 1, 2].map((j) => ids.reduce((a, i) => a + R[i * 3 + j], 0) / Math.max(1, ids.length));
		const C = [0, 1, 2].map(() => [0, 0, 0]);
		for (const i of ids) {
			const d = V(i).map((v, j) => v - c[j]), da = dot(d, cl.a), p = d.map((v, j) => v - da * cl.a[j]);
			for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += p[a] * p[b];
		}
		let v: Vec3 = across.length ? across[across.length - 1] : [1, 0.3, 0.2];
		for (let it = 0; it < 100; it++) {
			const w = C.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]), l = Math.hypot(w[0], w[1], w[2]) || 1;
			v = [w[0] / l, w[1] / l, w[2] / l];
		}
		if (across.length && dot(v, across[across.length - 1]) < 0) v = [-v[0], -v[1], -v[2]];
		across.push(v);
	}
	const acrossAt = (tt: number) => across[Math.min(SLICES - 1, Math.max(0, Math.floor((tt - tMin) / h)))];
	// each end's bone: the one its skin weights favour
	const endBone = (top: boolean) => {
		const w = new Array(nb).fill(0);
		for (let i = 0; i < m.nv; i++) if (top ? t[i] >= tMax - END : t[i] <= tMin + END) for (let b = 0; b < nb; b++) w[b] += m.weights[i * nb + b];
		return w.indexOf(Math.max(...w));
	};
	const footprint = (top: boolean): Footprint => {
		const bone = endBone(top), g = assets.fields[bone];
		let ids: number[] = [];
		if (g) for (let i = 0; i < m.nv; i++) if ((top ? t[i] > (tMin + tMax) / 2 : t[i] < (tMin + tMax) / 2) && sdfSample(g, R[i * 3], R[i * 3 + 1], R[i * 3 + 2]) < TOUCH) ids.push(i);
		const count = ids.length;
		// an end that doesn't touch its bone (enough to split): the end region itself
		if (ids.length < 3 * K) ids = t.map((v, i) => [v, i]).filter(([v]) => (top ? v >= tMax - END : v <= tMin + END)).map(([, i]) => i);
		const order = ids.map((i) => [dot(V(i).map((v, j) => v - cl.mu[j]), acrossAt(t[i])), i]).sort((a, b) => a[0] - b[0]);
		const points: Vec3[] = [];
		for (let k = 0; k < K; k++) {
			const part = order.slice(Math.floor((k * order.length) / K), Math.floor(((k + 1) * order.length) / K));
			points.push([0, 1, 2].map((j) => Math.round((part.reduce((a, [, i]) => a + R[i * 3 + j], 0) / part.length) * 10) / 10) as Vec3);
		}
		return { bone: manifest.bones[bone], count, points };
	};
	return { top: footprint(true), bottom: footprint(false) };
}
