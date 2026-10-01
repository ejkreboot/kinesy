import { DEG } from '../../core/math';
import type { Pose, RigDef } from '../../core/rig';

/**
 * The jaw: the mandible (with the lower teeth) on a fixed skull, at both temporomandibular joints, and the
 * hyoid. Each condyle hinges in its fossa and glides forward along a path under its articular
 * eminence. Three sliders drive five joints of the mandible (axes fitted in pipeline/lib/tmj.py):
 *
 *   glideForward, glideDown   slides: the mean of the two condyles' glides forward and drops
 *   swing                     about an upright axis through the condyles' midpoint: one condyle ahead of the other
 *   roll                      about the forward axis there: one condyle lower than the other
 *   hinge                     about the axis through both condyles' centres: opening
 *
 * Opening is a hinge in its first 10° (rotation of each condyle in its fossa), then both condyles glide forward
 * as the hinge goes on opening, down the eminence's back slope (translation). Protrusion glides both
 * condyles forward; lateral deviation glides one (the far side's, the balancing condyle) while the near side's
 * turns in place (the working condyle). Where gliding would drive the lower teeth into the upper ones the jaw
 * opens just enough for them to slide past (incisal guidance in protrusion, canine guidance to the side).
 * The hyoid is held by the infrahyoids (not in this model), so the suprahyoids open the jaw rather than lift it,
 * but it is not still: as the jaw opens it drops and moves back (HYOID_DROP, HYOID_BACK). Held still, its high
 * place in these meshes (level with the genial tubercles) had the chin swing down past it and the suprahyoids turn
 * to hang straight down from it, the anterior digastric cutting through it.
 * The meshes were captured with the teeth together, so every rest value is 0.
 */

/** Tables fitted in pipeline/lib/tmj.py (pipeline/joints/jaw.axes.json, `_tmj`), every 0.5 mm of glide. */
const STEP = 0.5;
/**
 * each condyle's drop (mm) as it glides forward 0–16 mm: down the eminence's back slope to its crest at 10 mm
 * (fitted), then level (the fit rises again, up the skull's surface in front of the crest; the condyle carries on
 * forward under it, the disc between)
 */
const DROP = [0, 0.173, 0.371, 0.599, 0.816, 1.019, 1.193, 1.362, 1.518, 1.667, 1.811, 1.929, 2.007, 2.029, 2.026, 2.002,
	1.981, 1.979, 2.014, 2.065, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09, 2.09];
/**
 * least hinge opening (deg) keeping the lower teeth 0.3 mm off the upper ones as both condyles glide 0–10 mm:
 * the molars' cusps first, then (past the 4 mm overjet) the incisors on the upper incisors' backs. Made
 * non-decreasing, so the teeth never meet on the way.
 */
const INCISAL = [0, 0, 0.08, 0.16, 0.23, 0.31, 0.31, 0.31, 0.31, 0.31, 0.31, 0.39, 0.55, 0.78, 1.05, 1.37, 1.64, 1.84, 2.07, 2.23, 2.38];
/** the same as one condyle glides 0–12 mm (lateral deviation), the larger of the two sides, non-decreasing: the canines */
const CANINE = [0, 0, 0.31, 0.59, 0.78, 0.94, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 1.05, 1.29, 1.52, 1.72, 1.88,
	2.03, 2.19, 2.34, 2.54, 2.66];

/** between the condyles' centres, mm */
const WIDTH = 82.96;
/** from the swing axis forward to the lower incisors' edges, mm: a condyle's glide per mm of the chin's deviation is WIDTH / this */
const INCISOR_REACH = 77.94;

/**
 * hinge opening (deg) before the condyles start to glide, and the widest opening: 20° (about 30 mm between the
 * incisors, short of the normal 40–50 mm) shows the hinge and the glide; wider, the chin swings down past the hyoid
 */
export const HINGE_ONLY = 10;
export const MAX_OPENING = 20;
/** the condyles' glide (mm) at the widest opening: down the eminence's back slope, near its crest */
const OPENING_GLIDE = 8;
/**
 * furthest either condyle glides, mm: to the eminence's crest (the drop table runs on to 16). Protrusion with
 * lateral deviation would take the far condyle further, and its coronoid process into the maxilla; even so, at
 * full protrusion and full deviation it is 2 mm in.
 */
const MAX_GLIDE = 10;

/**
 * how far the hyoid drops and moves back at the widest opening, mm (in proportion to opening): enough that the
 * anterior digastric and geniohyoid still run forward from it to the chin, not down through it
 */
const HYOID_DROP = 12, HYOID_BACK = 6;

const table = (T: number[], x: number) => {
	const u = Math.min(T.length - 1, Math.max(0, x / STEP)), i = Math.min(T.length - 2, Math.floor(u));
	return T[i] + (T[i + 1] - T[i]) * (u - i);
};

/** Both condyles' glide from opening alone: none in the hinge phase, then easing in to a steady glide. */
export function openingGlide(opening: number): number {
	const u = Math.min(1, Math.max(0, (opening - HINGE_ONLY) / (MAX_OPENING - HINGE_ONLY)));
	return OPENING_GLIDE * u * u * (2 - u);
}

export interface JawState {
	/** each condyle's glide forward and drop, mm */
	right: { glide: number; drop: number };
	left: { glide: number; drop: number };
	/** hinge opening, degrees */
	hinge: number;
}

/** Where the condyles are and how far the jaw hinges open, from the three sliders. */
export function jawState(p: Pose): JawState {
	const opening = p.opening ?? 0, protrusion = p.protrusion ?? 0, lateral = p.lateral ?? 0;
	const both = openingGlide(opening) + protrusion;
	// the chin toward the subject's left (+) brings the right condyle forward
	const s = (lateral * WIDTH) / INCISOR_REACH;
	const tR = Math.min(MAX_GLIDE, both + Math.max(0, s)), tL = Math.min(MAX_GLIDE, both + Math.max(0, -s));
	const guide = Math.max(table(INCISAL, protrusion), table(CANINE, Math.abs(s)));
	return {
		right: { glide: tR, drop: table(DROP, tR) },
		left: { glide: tL, drop: table(DROP, tL) },
		hinge: guide + opening * (1 - guide / MAX_OPENING)
	};
}

const coupled = (f: (j: JawState) => number) => ({ restAngle: 0, min: 0, max: 0, initial: 0, coupled: (p: Pose) => f(jawState(p)) });

export const jawRig: RigDef = {
	bones: [
		{ name: 'skull', parent: -1 },
		{ name: 'mandible', parent: 0, joints: ['glideForward', 'glideDown', 'swing', 'roll', 'hinge'] },
		// held by the infrahyoids (not in this model); it drops and moves back as the jaw opens wide
		{ name: 'hyoid', parent: 0, joints: ['hyoidBack', 'hyoidDown'] }
	],
	joints: [
		// the sliders: opening (deg of hinge), protrusion (mm), lateral deviation of the chin (mm, + toward the
		// subject's left)
		{ id: 'opening', restAngle: 0, min: 0, max: MAX_OPENING, initial: 0 },
		{ id: 'protrusion', restAngle: 0, min: 0, max: 8, initial: 0 },
		// (6 mm, short of the normal 8–12: further, the far side's coronoid process meets the maxilla in these meshes)
		{ id: 'lateral', restAngle: 0, min: -6, max: 6, initial: 0 },
		// the mandible's own joints, driven by them
		{ id: 'glideForward', axis: 'glideForward', slide: true, ...coupled((j) => (j.right.glide + j.left.glide) / 2) },
		{ id: 'glideDown', axis: 'glideDown', slide: true, ...coupled((j) => (j.right.drop + j.left.drop) / 2) },
		{ id: 'swing', axis: 'swing', ...coupled((j) => (j.right.glide - j.left.glide) / WIDTH / DEG) },
		{ id: 'roll', axis: 'roll', ...coupled((j) => (j.right.drop - j.left.drop) / WIDTH / DEG) },
		{ id: 'hinge', axis: 'hinge', ...coupled((j) => j.hinge) },
		// the hyoid's, driven by opening
		{ id: 'hyoidBack', axis: 'hyoidBack', slide: true, restAngle: 0, min: 0, max: 0, initial: 0, coupled: (p: Pose) => (HYOID_BACK * (p.opening ?? 0)) / MAX_OPENING },
		{ id: 'hyoidDown', axis: 'hyoidDown', slide: true, restAngle: 0, min: 0, max: 0, initial: 0, coupled: (p: Pose) => (HYOID_DROP * (p.opening ?? 0)) / MAX_OPENING }
	]
};
