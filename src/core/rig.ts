import { DEG, normalize3, rigidAboutAxis, rigidApply, rigidCompose, rigidIdentity, type Rigid, type Vec3 } from './math';
import type { AxisDef } from './types';

/**
 * A kinematic chain of bones. Each non-root bone may carry rotational joints whose axes come
 * from the joint's asset manifest. Joint angles are clinical (goniometric) degrees;
 * `restAngle` is the clinical angle the meshes were captured in.
 */
export interface RigJointDef {
	id: string;
	/**
	 * key into the asset manifest's `axes`. Left out for a virtual joint: a control that moves no
	 * bone itself but drives others through their `coupled` (one slider bending four fingers).
	 */
	axis?: string;
	/** clinical angle of the rest (mesh) pose */
	restAngle: number;
	min: number;
	max: number;
	/** default clinical angle when the viewer opens */
	initial: number;
	/** degrees added to this joint's angle, computed from the whole pose (e.g. scapulohumeral rhythm) */
	coupled?: (pose: Pose) => number;
}

export interface RigBoneDef {
	name: string;
	/** parent bone index, -1 for the root */
	parent: number;
	/**
	 * joints that move this bone relative to its parent, outermost first: each later joint's axis
	 * is carried by the earlier ones (an intrinsic rotation sequence)
	 */
	joints?: string[];
	/**
	 * 'parent' (default): the joints rotate the bone in its parent's frame.
	 * 'root': the joints orient the bone in the root bone's frame, and the bone follows its parent
	 * only at the first joint's axis point. A ball joint posed in trunk coordinates, e.g. the
	 * humerus: arm angles are measured against the thorax while the head rides the moving glenoid.
	 */
	frame?: 'parent' | 'root';
}

export interface RigDef {
	bones: RigBoneDef[];
	joints: RigJointDef[];
}

export type Pose = Record<string, number>;

export interface RigFrames {
	/** world transform of each bone */
	bones: Rigid[];
	/** per joint (def order), the world transform its axis is expressed in, before it rotates (unset for virtual joints) */
	joints: Rigid[];
}

export class Rig {
	readonly def: RigDef;
	/** null for virtual joints */
	private readonly axes: ({ point: Vec3; dir: Vec3 } | null)[];
	private readonly jointIndex: Map<string, number>;

	constructor(def: RigDef, axes: Record<string, AxisDef>, boneNames: string[]) {
		if (def.bones.length !== boneNames.length || def.bones.some((b, i) => b.name !== boneNames[i]))
			throw new Error(`Rig bones [${def.bones.map((b) => b.name)}] do not match asset bones [${boneNames}]`);
		this.def = def;
		this.jointIndex = new Map(def.joints.map((j, i) => [j.id, i]));
		const owner = new Map<string, string>();
		def.bones.forEach((b, i) => {
			if (b.parent >= i) throw new Error(`Bone ${b.name}: parent must precede child`);
			for (const id of b.joints ?? []) {
				if (!this.jointIndex.has(id)) throw new Error(`Bone ${b.name}: unknown joint ${id}`);
				if (!def.joints[this.jointIndex.get(id)!].axis) throw new Error(`Bone ${b.name}: joint ${id} is virtual (no axis)`);
				if (owner.has(id)) throw new Error(`Joint ${id} moves both ${owner.get(id)} and ${b.name}`);
				owner.set(id, b.name);
			}
			if (b.frame === 'root' && !b.joints?.length) throw new Error(`Bone ${b.name}: a root frame needs a joint`);
		});
		this.axes = def.joints.map((j) => {
			if (!j.axis) return null;
			const a = axes[j.axis];
			if (!a) throw new Error(`Joint ${j.id}: axis "${j.axis}" missing from assets`);
			return { point: a.point, dir: normalize3(a.dir) };
		});
	}

	get boneCount(): number {
		return this.def.bones.length;
	}

	joint(id: string): RigJointDef {
		const i = this.jointIndex.get(id);
		if (i === undefined) throw new Error(`Unknown joint ${id}`);
		return this.def.joints[i];
	}

	axis(id: string): { point: Vec3; dir: Vec3 } {
		const a = this.axes[this.jointIndex.get(id)!];
		if (!a) throw new Error(`Joint ${id} is virtual and has no axis`);
		return a;
	}

	initialPose(): Pose {
		return Object.fromEntries(this.def.joints.map((j) => [j.id, j.initial]));
	}

	clamp(pose: Pose): Pose {
		const out: Pose = { ...pose };
		for (const j of this.def.joints) out[j.id] = Math.min(j.max, Math.max(j.min, pose[j.id] ?? j.initial));
		return out;
	}

	/** Clinical angle a joint actually takes in a pose: its own angle plus any coupled share. */
	angle(id: string, pose: Pose): number {
		const j = this.joint(id);
		return (pose[j.id] ?? j.restAngle) + (j.coupled?.(pose) ?? 0);
	}

	/** World transform of every bone for a clinical pose (missing joints hold their rest angle). */
	solve(pose: Pose): Rigid[] {
		return this.solveFrames(pose).bones;
	}

	solveFrames(pose: Pose): RigFrames {
		const bones: Rigid[] = [];
		const joints: Rigid[] = new Array(this.def.joints.length);
		this.def.bones.forEach((b, i) => {
			const parent = b.parent < 0 ? rigidIdentity() : bones[b.parent];
			let w = parent;
			if (b.frame === 'root' && b.parent >= 0) {
				// root orientation, translated so the first joint's center moves with the parent
				const root = bones[0], c = this.axes[this.jointIndex.get(b.joints![0])!]!.point;
				const pc = rigidApply(parent, c), rc = rigidApply(root, c);
				w = { q: root.q, t: [root.t[0] + pc[0] - rc[0], root.t[1] + pc[1] - rc[1], root.t[2] + pc[2] - rc[2]] };
			}
			for (const id of b.joints ?? []) {
				const ji = this.jointIndex.get(id)!, j = this.def.joints[ji], ax = this.axes[ji]!;
				joints[ji] = w;
				w = rigidCompose(w, rigidAboutAxis(ax.point, ax.dir, (this.angle(id, pose) - j.restAngle) * DEG));
			}
			bones[i] = w;
		});
		return { bones, joints };
	}
}
