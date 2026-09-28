import type { RigDef } from '../../core/rig';

export const elbowRig: RigDef = {
	bones: [
		{ name: 'humerus', parent: -1 },
		{ name: 'ulna', parent: 0, joint: 'flexion' },
		{ name: 'radius', parent: 1, joint: 'pronation' }
	],
	joints: [
		// meshes were captured at 15° flexion, forearm fully supinated
		{ id: 'flexion', axis: 'flexion', restAngle: 15, min: 0, max: 145, initial: 15 },
		// clinical convention: 0 = neutral (thumb up), + pronation, − supination
		{ id: 'pronation', axis: 'pronation', restAngle: -90, min: -90, max: 80, initial: -90 }
	]
};
