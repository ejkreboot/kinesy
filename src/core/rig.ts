import { DEG, normalize3, rigidAboutAxis, rigidCompose, rigidIdentity, type Rigid, type Vec3 } from './math';
import type { AxisDef } from './types';

/**
 * A kinematic chain of bones. Each non-root bone may carry one rotational joint whose axis
 * comes from the joint's asset manifest. Joint angles are clinical (goniometric) degrees;
 * `restAngle` is the clinical angle the meshes were captured in.
 */
export interface RigJointDef {
	id: string;
	/** key into the asset manifest's `axes` */
	axis: string;
	/** clinical angle of the rest (mesh) pose */
	restAngle: number;
	min: number;
	max: number;
	/** default clinical angle when the viewer opens */
	initial: number;
}

export interface RigBoneDef {
	name: string;
	/** parent bone index, -1 for the root */
	parent: number;
	/** joint id that moves this bone relative to its parent */
	joint?: string;
}

export interface RigDef {
	bones: RigBoneDef[];
	joints: RigJointDef[];
}

export type Pose = Record<string, number>;

export class Rig {
	readonly def: RigDef;
	private readonly axes: { point: Vec3; dir: Vec3 }[];
	private readonly jointIndex: Map<string, number>;

	constructor(def: RigDef, axes: Record<string, AxisDef>, boneNames: string[]) {
		if (def.bones.length !== boneNames.length || def.bones.some((b, i) => b.name !== boneNames[i]))
			throw new Error(`Rig bones [${def.bones.map((b) => b.name)}] do not match asset bones [${boneNames}]`);
		def.bones.forEach((b, i) => {
			if (b.parent >= i) throw new Error(`Bone ${b.name}: parent must precede child`);
		});
		this.def = def;
		this.jointIndex = new Map(def.joints.map((j, i) => [j.id, i]));
		this.axes = def.joints.map((j) => {
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
		return this.axes[this.jointIndex.get(id)!];
	}

	initialPose(): Pose {
		return Object.fromEntries(this.def.joints.map((j) => [j.id, j.initial]));
	}

	clamp(pose: Pose): Pose {
		const out: Pose = { ...pose };
		for (const j of this.def.joints) out[j.id] = Math.min(j.max, Math.max(j.min, pose[j.id] ?? j.initial));
		return out;
	}

	/** World transform of every bone for a clinical pose (missing joints hold their rest angle). */
	solve(pose: Pose): Rigid[] {
		const world: Rigid[] = [];
		this.def.bones.forEach((b, i) => {
			let local = rigidIdentity();
			if (b.joint) {
				const ji = this.jointIndex.get(b.joint);
				if (ji === undefined) throw new Error(`Bone ${b.name}: unknown joint ${b.joint}`);
				const j = this.def.joints[ji], ax = this.axes[ji];
				const angle = (pose[j.id] ?? j.restAngle) - j.restAngle;
				local = rigidAboutAxis(ax.point, ax.dir, angle * DEG);
			}
			world[i] = b.parent < 0 ? local : rigidCompose(world[b.parent], local);
		});
		return world;
	}
}
