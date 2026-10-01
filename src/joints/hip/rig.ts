import type { RigDef } from '../../core/rig';

/**
 * The hip: the femur on a fixed pelvis, a ball joint posed about the femoral head's centre (fitted to the
 * head, pipeline/joints/hip.py). Meshes were captured in anatomical position, so every rest angle is 0.
 */
export const hipRig: RigDef = {
	bones: [
		{ name: 'pelvis', parent: -1 },
		// flexion, then abduction, then rotation about the femur's long axis (head centre to between the condyles)
		{ name: 'femur', parent: 0, joints: ['flexion', 'abduction', 'rotation'] }
	],
	joints: [
		// + flexion, − extension (beyond about 20° extension the lumbar spine takes over)
		{ id: 'flexion', axis: 'flexion', restAngle: 0, min: -20, max: 120, initial: 0 },
		// + abduction, − adduction (across the midline; the other leg isn't in the model)
		{ id: 'abduction', axis: 'abduction', restAngle: 0, min: -20, max: 45, initial: 0 },
		// + internal, − external
		{ id: 'rotation', axis: 'rotation', restAngle: 0, min: -45, max: 40, initial: 0 }
	]
};
