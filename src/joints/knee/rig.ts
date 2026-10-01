import type { Pose, RigDef } from '../../core/rig';

/** smoothstep 0 → 1 over [a, b] */
const ramp = (a: number, b: number, x: number) => {
	const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return u * u * (3 - 2 * u);
};

/**
 * How free the tibia is to rotate at a knee flexion: none in full extension (the collateral and cruciate
 * ligaments are taut), fully from about 30°.
 */
export const rotationFreedom = (flexion: number) => ramp(0, 30, flexion);

/** Screw-home: the tibia's internal rotation as the knee unlocks from full extension (degrees). */
export const SCREW_HOME = 10;
export const screwHome = (flexion: number) => SCREW_HOME * ramp(0, 20, flexion);

/**
 * The patella's turn per degree of knee flexion, as it glides down the trochlea and condyles (about its own
 * axis, 10 mm in front of the flexion axis; pipeline/joints/knee.py): it stays on the trochlea, then the
 * condyles' distal ends.
 */
const PATELLA_SHARE = 0.7;

/**
 * The knee: the tibia (with the fibula) and the patella on a fixed femur. Meshes were captured in full
 * extension, so every rest angle is 0.
 */
export const kneeRig: RigDef = {
	bones: [
		{ name: 'femur', parent: -1 },
		// flexion about the transepicondylar axis, then rotation about the tibia's long axis
		{ name: 'tibia', parent: 0, joints: ['flexion', 'rotation'] },
		{ name: 'patella', parent: 0, joints: ['patellaGlide'] }
	],
	joints: [
		// + flexion, − hyperextension. 70° shows the mechanics (unlocking, the hamstrings and pes anserinus round
		// the back of the knee, the patella onto the condyles); deeper, the thigh and calf meet and the slack
		// quadriceps fold round the femur
		{ id: 'flexion', axis: 'flexion', restAngle: 0, min: -5, max: 70, initial: 0 },
		// + internal, − external. The slider sets the rotation the knee allows at its flexion: none in full extension,
		// all of it past 30°; and the tibia turns internally by itself as the knee unlocks (screw-home in reverse)
		{
			id: 'rotation', axis: 'rotation', restAngle: 0, min: -30, max: 25, initial: 0,
			coupled: (p: Pose) => (p.rotation ?? 0) * (rotationFreedom(p.flexion ?? 0) - 1) + screwHome(p.flexion ?? 0)
		},
		// no control of its own: follows knee flexion
		{ id: 'patellaGlide', axis: 'patella', restAngle: 0, min: 0, max: 0, initial: 0, coupled: (p: Pose) => PATELLA_SHARE * Math.max(0, p.flexion ?? 0) }
	]
};
