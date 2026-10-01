/**
 * Hand tuning: keyframes in pose space. A key sets, for one muscle at one pose, adjustments made on top of
 * its line of action (baked or wrapped):
 *
 *   - roll: the belly turned about its line, degrees;
 *   - lift: the belly moved away from the bone it lies on (negative: toward it), mm;
 *   - shift: the belly moved sideways, mm (positive: to the right of the line seen from outside, origin to
 *     insertion);
 *   - length: the belly's length over what its line of action gives it (below 1: shorter, the tendons
 *     taking up the rest, and thicker).
 *
 * Roll, lift and shift peak mid-belly and fade to nothing at both attachments (BUMP), so the attachments
 * stay put. Keys sit on a lattice over some of the rig's joints (each `step` degrees from its rest angle,
 * plus its range's ends); between lattice points the adjustments blend multilinearly, a lattice point
 * without a key counting as no adjustment. So a key reaches as far as the next lattice point in each
 * direction, fading linearly, and poses away from every key are exactly as solved.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import { cellFor, type BakedAxis, type Cell } from './baked';
import type { Pose, Rig } from '../rig';

export interface TuneParams {
	roll: number;
	lift: number;
	shift: number;
	length: number;
}

export interface TuneKey extends TuneParams {
	/** the lattice pose (lattice joints only) */
	pose: Pose;
}

export interface Tuning {
	/** lattice joints and spacing, degrees */
	lattice: { joint: string; step: number }[];
	/** keys by mesh */
	keys: Record<string, TuneKey[]>;
}

export const NO_TUNE: TuneParams = { roll: 0, lift: 0, shift: 0, length: 1 };

/** Lattice values of a joint: its rest angle, every `step` from it, and its range's ends. */
export function latticeValues(rig: Rig, joint: string, step: number): number[] {
	const j = rig.joint(joint), v = new Set<number>([j.min, j.max, j.restAngle]);
	for (let x = j.restAngle - step; x > j.min; x -= step) v.add(x);
	for (let x = j.restAngle + step; x < j.max; x += step) v.add(x);
	return [...v].sort((p, q) => p - q);
}

/** The lattice point nearest a pose (lattice joints only). */
export function nearestLatticePose(axes: BakedAxis[], pose: Pose): Pose {
	const out: Pose = {};
	for (const a of axes) {
		const x = pose[a.joint] ?? a.values[0];
		out[a.joint] = a.values.reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b), a.values[0]);
	}
	return out;
}

/** A tuning made usable: its lattice, and per mesh its keys by lattice node. */
export class Tuner {
	readonly axes: BakedAxis[];
	private readonly byMesh = new Map<string, Map<number, TuneParams>>();
	private cell: Cell | undefined;

	constructor(readonly tuning: Tuning, rig: Rig) {
		this.axes = tuning.lattice.map((l) => ({ joint: l.joint, values: latticeValues(rig, l.joint, l.step) }));
		// a key off the lattice (the rig's range narrowed since it was set) is left out, and dropped at the next save
		for (const [mesh, keys] of Object.entries(tuning.keys)) {
			const on = keys.filter((k) => this.onLattice(k.pose));
			if (on.length < keys.length) console.warn(`tuning: ${mesh}: ${keys.length - on.length} key(s) off the lattice left out`, keys.filter((k) => !on.includes(k)).map((k) => k.pose));
			tuning.keys[mesh] = on;
			for (const k of on) this.set(mesh, k.pose, k, false);
		}
	}

	private onLattice(pose: Pose): boolean {
		return this.axes.every((a) => a.values.includes(pose[a.joint]));
	}

	/** Lattice node of a lattice pose (its values must be lattice values). */
	node(pose: Pose): number {
		let n = 0, stride = 1;
		for (const a of this.axes) {
			const i = a.values.indexOf(pose[a.joint]);
			if (i < 0) throw new Error(`tuning: ${a.joint} ${pose[a.joint]} is not on the lattice`);
			n += i * stride;
			stride *= a.values.length;
		}
		return n;
	}

	/** Set (or with NO_TUNE values, clear) a mesh's key at a lattice pose. */
	set(mesh: string, pose: Pose, p: TuneParams, record = true): void {
		const m = this.byMesh.get(mesh) ?? this.byMesh.set(mesh, new Map()).get(mesh)!, n = this.node(pose);
		const none = p.roll === 0 && p.lift === 0 && p.shift === 0 && p.length === 1;
		if (none) m.delete(n);
		else m.set(n, { roll: p.roll, lift: p.lift, shift: p.shift, length: p.length });
		if (!record) return;
		const lp = Object.fromEntries(this.axes.map((a) => [a.joint, pose[a.joint]]));
		const list = (this.tuning.keys[mesh] ??= []).filter((k) => this.node(k.pose) !== n);
		if (!none) list.push({ pose: lp, ...m.get(n)! });
		this.tuning.keys[mesh] = list;
		if (!list.length) delete this.tuning.keys[mesh];
	}

	/** A mesh's key at a lattice pose, if any. */
	get(mesh: string, pose: Pose): TuneParams | undefined {
		return this.byMesh.get(mesh)?.get(this.node(pose));
	}

	has(mesh: string): boolean {
		return (this.byMesh.get(mesh)?.size ?? 0) > 0;
	}

	/** A mesh's adjustments at a pose: its keys blended over the lattice cell the pose lies in. */
	at(mesh: string, pose: Pose, out: TuneParams = { ...NO_TUNE }): TuneParams {
		out.roll = 0; out.lift = 0; out.shift = 0; out.length = 1;
		const m = this.byMesh.get(mesh);
		if (!m?.size) return out;
		this.cell = cellFor(this.axes, pose, this.cell);
		for (let k = 0; k < this.cell.nodes.length; k++) {
			const w = this.cell.weights[k], p = w ? m.get(this.cell.nodes[k]) : undefined;
			if (!p) continue;
			out.roll += p.roll * w; out.lift += p.lift * w; out.shift += p.shift * w; out.length += (p.length - 1) * w;
		}
		return out;
	}
}

/** How much of an adjustment applies at share s along the belly: none at the attachments, all mid-belly. */
export function bump(s: number): number {
	return Math.sin(Math.PI * Math.min(1, Math.max(0, s)));
}
