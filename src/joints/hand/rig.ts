import type { DeformerOptions } from '../../core/deformer';
import type { Pose, RigDef, RigJointDef } from '../../core/rig';

export const FINGERS = ['index', 'middle', 'ring', 'little'] as const;
export type Finger = (typeof FINGERS)[number];

// Clinical angles of the source pose, measured from the bones by pipeline/joints/hand.py (the
// `rest` values in hand.axes.json): the relaxed hand is slightly flexed at every joint.
const REST: Record<Finger, { mcp: number; pip: number; dip: number }> = {
	index: { mcp: 12.5, pip: 21.0, dip: 7.8 },
	middle: { mcp: 13.1, pip: 7.6, dip: 15.6 },
	ring: { mcp: 11.6, pip: 16.4, dip: 24.2 },
	little: { mcp: 10.7, pip: 8.7, dip: 11.4 }
};
const THUMB_REST = { mcp: 13.1, ip: 0.7 };

/**
 * Shared finger sliders start here; each finger's own joint keeps an offset from them, so the
 * relaxed cascade (little finger more flexed than index) survives every movement.
 */
export const FINGER_START = { mcp: 12, pip: 13, dip: 15 };

// Finger spread, per finger, as a share of the slider (abduction is away from the middle
// finger; the little finger fans out most, the middle finger stays put).
const SPREAD: Record<Finger, number> = { index: 1, middle: 0, ring: 0.7, little: 1.3 };

// Opposition: the thumb abducts away from the palm, flexes across it, and pronates so its pad
// faces the fingers, with some MCP and IP flexion. Degrees at 100% opposition.
const OPPOSE = { abduction: 40, flexion: 45, rotation: 45, mcp: 25, ip: 15 };

const opp = (p: Pose) => p.opposition / 100;

function fingerJoints(f: Finger): RigJointDef[] {
	const r = REST[f];
	// per-finger offsets from the shared sliders: no slider of their own; demos set them to move
	// one finger alone (pointing the index straightens it inside a fist)
	return [
		{ id: `${f}Mcp`, axis: `${f}Mcp`, restAngle: r.mcp, min: -100, max: 100, initial: r.mcp - FINGER_START.mcp, coupled: (p) => p.mcp },
		{ id: `${f}Abd`, axis: `${f}Abd`, restAngle: 0, min: -20, max: 20, initial: 0, coupled: (p) => SPREAD[f] * p.spread },
		{ id: `${f}Pip`, axis: `${f}Pip`, restAngle: r.pip, min: -100, max: 100, initial: r.pip - FINGER_START.pip, coupled: (p) => p.pip },
		{ id: `${f}Dip`, axis: `${f}Dip`, restAngle: r.dip, min: -100, max: 100, initial: r.dip - FINGER_START.dip, coupled: (p) => p.dip }
	];
}

export const handRig: RigDef = {
	bones: [
		{ name: 'forearm', parent: -1 },
		// radiocarpal + midcarpal, lumped: the carpals and metacarpals 2-5 move as one
		{ name: 'hand', parent: 0, joints: ['wristFlexion', 'wristDeviation'] },
		// abduction first: flexion then sweeps the lifted thumb across the palm instead of spinning
		// it (the flexion axis is nearly perpendicular to the palm, so once the thumb stands away
		// from the palm it points along that axis)
		{ name: 'thumb_mc', parent: 1, joints: ['thumbCmcAbduction', 'thumbCmcFlexion', 'thumbRotation'] },
		{ name: 'thumb_pp', parent: 2, joints: ['thumbMcp'] },
		{ name: 'thumb_dp', parent: 3, joints: ['thumbIp'] },
		...FINGERS.flatMap((f, i) => {
			const pp = 5 + i * 3;
			return [
				{ name: `${f}_pp`, parent: 1, joints: [`${f}Mcp`, `${f}Abd`] },
				{ name: `${f}_mp`, parent: pp, joints: [`${f}Pip`] },
				{ name: `${f}_dp`, parent: pp + 1, joints: [`${f}Dip`] }
			];
		})
	],
	joints: [
		// + flexion, − extension; + ulnar, − radial deviation
		{ id: 'wristFlexion', axis: 'wristFlexion', restAngle: 0, min: -70, max: 80, initial: 0 },
		{ id: 'wristDeviation', axis: 'wristDeviation', restAngle: 0, min: -20, max: 35, initial: 0 },
		// virtual finger controls
		{ id: 'mcp', restAngle: 0, min: -20, max: 90, initial: FINGER_START.mcp },
		{ id: 'pip', restAngle: 0, min: 0, max: 100, initial: FINGER_START.pip },
		{ id: 'dip', restAngle: 0, min: 0, max: 90, initial: FINGER_START.dip },
		// + abduction (spread), − adduction (squeeze)
		{ id: 'spread', restAngle: 0, min: -8, max: 20, initial: 0 },
		...FINGERS.flatMap(fingerJoints),
		// thumb carpometacarpal: + flexion across the palm, − extension; + palmar abduction
		{ id: 'thumbCmcFlexion', axis: 'thumbCmcFlexion', restAngle: 0, min: -30, max: 30, initial: 0, coupled: (p) => OPPOSE.flexion * opp(p) },
		{ id: 'thumbCmcAbduction', axis: 'thumbCmcAbduction', restAngle: 0, min: -10, max: 60, initial: 0, coupled: (p) => OPPOSE.abduction * opp(p) },
		// axial rotation of the first metacarpal: only through opposition
		{ id: 'thumbRotation', axis: 'thumbRotation', restAngle: 0, min: 0, max: 0, initial: 0, coupled: (p) => OPPOSE.rotation * opp(p) },
		{ id: 'opposition', restAngle: 0, min: 0, max: 100, initial: 0 },
		{ id: 'thumbMcp', axis: 'thumbMcp', restAngle: THUMB_REST.mcp, min: -10, max: 50, initial: THUMB_REST.mcp, coupled: (p) => OPPOSE.mcp * opp(p) },
		{ id: 'thumbIp', axis: 'thumbIp', restAngle: THUMB_REST.ip, min: -15, max: 80, initial: THUMB_REST.ip, coupled: (p) => OPPOSE.ip * opp(p) }
	]
};

/**
 * Seventeen small bones: test each muscle vertex only against bones it is skinned to or lies
 * within 30 mm of at rest (validation still checks every bone). Tendons packed around the
 * knuckles in a fist need a couple more projection passes after smoothing.
 */
export const HAND_DEFORMER: Partial<DeformerOptions> = { collideRadius: 30, finalPasses: 4 };

/** The opening pose: every joint at its initial angle (the relaxed source pose). */
export const HAND_REST: Pose = Object.fromEntries(handRig.joints.map((j) => [j.id, j.initial]));
