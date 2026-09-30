import { DEG } from '../../core/math';
import type { Pose, RigDef } from '../../core/rig';

/**
 * Arm elevation from the hanging position, in degrees, counting only the forward (flexion) and
 * sideways (abduction) components: extension and cross-body adduction don't rotate the scapula
 * upward. Uses the rig's flexion-then-abduction sequence with the arm hanging straight down.
 */
export function armElevation(p: Pose): number {
	const f = p.flexion * DEG, a = p.abduction * DEG;
	const lateral = Math.sin(a), anterior = Math.cos(a) * Math.sin(f), down = Math.cos(a) * Math.cos(f);
	return Math.atan2(Math.hypot(Math.max(0, lateral), Math.max(0, anterior)), down) / DEG;
}

/**
 * Scapulohumeral rhythm: scapulothoracic upward rotation for a pose. None during the setting
 * phase (first 30°), then 1° of every 5°, so full elevation splits 150° glenohumeral : 30°
 * scapulothoracic.
 */
export function scapularUpwardRotation(p: Pose): number {
	return Math.max(0, armElevation(p) - 30) * RHYTHM;
}

/** Scapular upward rotation per degree of arm elevation past the setting phase (30° at full elevation). */
const RHYTHM = 0.2;

// Part of the upward rotation comes from the clavicle elevating at the sternoclavicular joint.
// Its axis is about 35° off the scapula's upward-rotation axis, so cos 35° ≈ 0.8 of it counts.
// (6° of clavicle elevation at full arm elevation; more lifts the whole girdle.)
const CLAVICLE_SHARE = 0.2;
const SC_TO_UPWARD = 0.8;
// The clavicle also retracts as the arm rises (about 12° at full elevation). That keeps the scapula
// on the rib cage: rotating about the acromioclavicular joint alone, it swung off the ribs and its
// inferior angle travelled half as far again as in life.
const RETRACTION_SHARE = 0.4;

export const shoulderRig: RigDef = {
	bones: [
		{ name: 'thorax', parent: -1 },
		// sternoclavicular: protraction about a vertical axis, then elevation about an AP axis
		{ name: 'clavicle', parent: 0, joints: ['protraction', 'elevation'] },
		// acromioclavicular / scapulothoracic: upward rotation normal to the scapular plane
		{ name: 'scapula', parent: 1, joints: ['upwardRotation'] },
		// glenohumeral, posed against the thorax: flexion, then abduction, then rotation about the shaft
		{ name: 'humerus', parent: 2, joints: ['flexion', 'abduction', 'rotation'], frame: 'root' }
	],
	joints: [
		// meshes were captured in anatomical position, arm hanging about 10° from the side. Extension only to
		// 10°: further back the muscles over the front of the joint are stretched past what the model holds
		{ id: 'flexion', axis: 'flexion', restAngle: 0, min: -10, max: 180, initial: 0 },
		// no further in than the hanging position: past it the arm goes into the chest (and the humeral head
		// through the muscles over it)
		{ id: 'abduction', axis: 'abduction', restAngle: 10, min: 10, max: 180, initial: 10 },
		// + internal, − external (external only to 30°: further, the pectoralis tendon wound round the humerus)
		{ id: 'rotation', axis: 'rotation', restAngle: 0, min: -30, max: 70, initial: 0 },
		// shoulder girdle, measured at the sternoclavicular joint: + elevation, − depression
		{ id: 'elevation', axis: 'elevation', restAngle: 0, min: -10, max: 35, initial: 0, coupled: (p) => CLAVICLE_SHARE * scapularUpwardRotation(p) },
		// + protraction, − retraction
		{ id: 'protraction', axis: 'protraction', restAngle: 0, min: -25, max: 25, initial: 0, coupled: (p) => -RETRACTION_SHARE * scapularUpwardRotation(p) },
		// no control of its own: driven entirely by the rhythm
		{ id: 'upwardRotation', axis: 'upwardRotation', restAngle: 0, min: 0, max: 0, initial: 0, coupled: (p) => (1 - CLAVICLE_SHARE * SC_TO_UPWARD) * scapularUpwardRotation(p) }
	]
};
