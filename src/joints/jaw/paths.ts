import type { JointPaths, MusclePathDef, PathElement } from '../../core/muscle/schema';
import type { Tuning } from '../../core/muscle/tune';
import tuning from './tuning.json';

/**
 * Lines of action for the jaw's muscles (rest pose: teeth together; x toward the subject's left, y up, z
 * anterior, mm; the origin midway between the condyles' centres). The right side's are given and mirrored for
 * the left (the meshes are mirror images to within a millimetre). Every muscle is baked (scripts/bake.ts):
 * strands list only their fixed points, ends from the meshes' attachment footprints.
 *
 * Temporalis is a fan of five strands from the temporal fossa (its posterior fibres from above the ear,
 * running forward, its anterior ones from behind the orbit, running down) to the coronoid process. The
 * lateral pterygoid's two heads end on the front of the condyle, where the meshes put both (the upper head's
 * hold on the disc and capsule is there). The posterior belly of digastric runs from the skull to the hyoid,
 * both still here, so it does not move.
 *
 * Mylohyoid's fibres run in from the mylohyoid line to the midline raphe, which stretches from the symphysis
 * to the hyoid and shortens as the jaw opens. Its strands converge on the hyoid's body, so the raphe is carried
 * along them, its points keeping their places between the symphysis and the hyoid. Ending them on geniohyoid's
 * strand (which lies along the raphe) carried that strand's turn as well: it swings about 70° as the chin drops
 * past the hyoid, the mylohyoid line only 30°, and the sheet sheared and crumpled near the hyoid.
 */
type P3 = [number, number, number];
const strand = (from: [string, P3], ...to: ([string, P3] | { join: string; p: P3 })[]): PathElement[] => [
	{ bone: from[0], p: from[1] },
	...to.map((e) => (Array.isArray(e) ? { bone: e[0], p: e[1] } : e))
];

// Layers, deep to superficial: on the bone (temporalis, the deep masseter, the pterygoids, geniohyoid, the
// posterior digastric); over them (the superficial masseter, mylohyoid); outermost (the anterior digastric,
// under the floor of the mouth).
const right: MusclePathDef[] = [
	{
		mesh: 'temporalis_r', layer: 0, baked: true,
		// a broad fleshy origin over the temporal fossa
		anchor: [30, 8],
		strands: [
			// posterior fibres, nearly horizontal above the ear, to the back of the coronoid process
			strand(['skull', [-68.8, 62.4, -44.3]], ['mandible', [-41.7, -13.1, 21]]),
			strand(['skull', [-68, 50, -20]], ['mandible', [-41.3, -14.5, 25]]),
			strand(['skull', [-62, 43, 0]], ['mandible', [-41.8, -12.5, 29.5]]),
			strand(['skull', [-54, 36.5, 22]], ['mandible', [-42, -10, 34]]),
			// anterior fibres, vertical behind the orbit, to the front of the coronoid process
			strand(['skull', [-47.4, 38.2, 46.9]], ['mandible', [-41, -12, 39]])
		]
	},
	{
		mesh: 'masseter_deep_r', layer: 0, baked: true,
		// vertical, from the back of the zygomatic arch to the ramus
		strands: [
			strand(['skull', [-57, 5, 7]], ['mandible', [-41.2, -38, 12.5]]),
			strand(['skull', [-58.5, 1.5, 19]], ['mandible', [-38.5, -47, 25]])
		]
	},
	{
		mesh: 'med_ptery_r', layer: 0, baked: true,
		// down, back and out from the pterygoid fossa to the inside of the angle
		strands: [
			strand(['skull', [-20, -6, 20.2]], ['mandible', [-34.6, -30.8, 6.3]]),
			strand(['skull', [-23.1, -18.1, 30.4]], ['mandible', [-33.2, -38.6, 13.1]])
		]
	},
	{
		mesh: 'lat_ptery_inf_r', layer: 0, baked: true,
		// back and out from the lateral pterygoid plate to the front of the condyle
		strands: [
			strand(['skull', [-27.6, -11, 19.5]], ['mandible', [-40.8, -1.5, 6]]),
			strand(['skull', [-27, -3, 16]], ['mandible', [-40, 2.5, 4.5]])
		]
	},
	{
		mesh: 'lat_ptery_sup_r', layer: 0, baked: true,
		strands: [strand(['skull', [-26.3, 8.7, 17.7]], ['mandible', [-39.8, 3.8, 4.6]])]
	},
	{ mesh: 'geniohyoid_r', layer: 0, baked: true, strands: [strand(['mandible', [-1.3, -65.3, 60.3]], ['hyoid', [-5, -67.7, 25.1]])] },
	{ mesh: 'digastric_post_r', layer: 0, baked: true, strands: [strand(['skull', [-54.1, -7.3, -25.8]], ['hyoid', [-13.8, -65.1, 25.8]])] },
	{
		mesh: 'masseter_sup_r', layer: 1, baked: true,
		// down and back, from the zygomatic process of the maxilla and the front of the arch to the angle
		strands: [
			strand(['skull', [-58.4, -1.5, 28.5]], ['mandible', [-40.5, -45, 14.5]]),
			strand(['skull', [-54.6, -5.1, 35.4]], ['mandible', [-39.2, -50, 24]]),
			strand(['skull', [-48.5, -12, 46]], ['mandible', [-36.6, -52, 35]])
		]
	},
	{
		mesh: 'mylohyoid_r', layer: 1, baked: true,
		// from the mylohyoid line, converging on the hyoid's body (see above)
		strands: [
			strand(['mandible', [-24.5, -47.2, 29.9]], ['hyoid', [-11, -66, 26]]),
			strand(['mandible', [-22.2, -52.5, 36.5]], ['hyoid', [-8.8, -67.7, 25.1]]),
			strand(['mandible', [-19.1, -57.6, 41.7]], ['hyoid', [-6.5, -67.6, 25.7]]),
			strand(['mandible', [-15.8, -62.2, 48]], ['hyoid', [-4.7, -67.7, 26.5]]),
			strand(['mandible', [-11.6, -65.3, 54]], ['hyoid', [-1.5, -67.3, 27.5]])
		]
	},
	{ mesh: 'digastric_ant_r', layer: 2, baked: true, strands: [strand(['mandible', [-8.7, -68.6, 56.5]], ['hyoid', [-13.6, -65.4, 26.5]])] }
];

/** The left side's muscle: its mesh and points mirrored across the midline. */
function mirror(d: MusclePathDef): MusclePathDef {
	const l = (s: string) => s.replace(/_r$/, '_l');
	return {
		...d,
		mesh: l(d.mesh),
		strands: d.strands.map((els) => els.map((e) => ('join' in e ? { join: l(e.join), p: [-e.p[0], e.p[1], e.p[2]] } : 'p' in e ? { ...e, p: [-e.p[0], e.p[1], e.p[2]] } : e)))
	} as MusclePathDef;
}

export const jawPaths: JointPaths = {
	surfaces: {},
	muscles: [...right, ...right.map(mirror)],
	// the bake keeps the layers apart
	contact: false,
	// hand-tuned keys, edited in the app's Tune panel (#debug) and saved to tuning.json
	tuning: tuning as Tuning
};
