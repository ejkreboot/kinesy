import type { JointPaths, MusclePathDef, PathElement } from '../../core/muscle/schema';
import type { Tuning } from '../../core/muscle/tune';
import tuning from './tuning.json';

/**
 * Lines of action for the neck's muscles (rest pose: upright, looking ahead; x toward the subject's left, y up,
 * z anterior, mm; the origin at the C4–C5 disc). The right side's are given and mirrored for the left. Every
 * muscle is baked (scripts/bake.ts): strands list only their fixed points, ends from the meshes' attachment
 * footprints on each bone.
 *
 * A muscle arising by slips from several vertebrae (the scalenes, levator scapulae, longus capitis, the
 * semispinales) has a strand per slip or two, each from its own vertebra, converging on the insertion. A point
 * between the ends only where the muscle holds on there: the vertical part of longus colli is attached to every
 * vertebral body from T3 to C2, so its strand is held at each. The rest cross the levels between their ends
 * free, kept off the vertebrae and the muscles beneath them by the bake.
 *
 * The upper trapezius arises from the occiput and the nuchal ligament (on the spinous processes); its sheet is
 * held all along the midline, so the two sides' sheets meet there whatever the neck does. Sternocleidomastoid twists: its sternal head reaches the mastoid, its
 * clavicular head the superior nuchal line behind it (pairing from the mesh).
 */
type P3 = [number, number, number];
const strand = (...pts: [string, P3][]): PathElement[] => pts.map(([bone, p]) => ({ bone, p }));

/**
 * The cervical spine, for superficial muscles that keep their distance from it as the head turns (MusclePathDef.axis):
 * the neck's soft tissue, not in the model, holds them out.
 */
const SPINE = ['c7', 'c6', 'c5', 'c4', 'c3', 'c2', 'c1'];

// Layers, deep to superficial: on the bone (the suboccipitals, rectus capitis anterior and lateralis, longus
// colli, semispinalis cervicis, the scalenes); over them (semispinalis capitis, longissimus capitis, splenius
// cervicis, longus capitis, levator scapulae); splenius capitis; outermost (trapezius, sternocleidomastoid).
const right: MusclePathDef[] = [
	// ---- suboccipital ----
	{
		mesh: 'rcp_major_r', layer: 0, baked: true,
		strands: [strand(['c2', [-2.6, 29.5, -41]], ['head', [-28, 71, -48]]), strand(['c2', [-3.6, 32, -38]], ['head', [-31.8, 68.8, -31.4]])]
	},
	{
		mesh: 'rcp_minor_r', layer: 0, baked: true,
		strands: [strand(['c1', [-3.5, 52, -35.3]], ['head', [-19, 70, -50]]), strand(['c1', [-1.5, 52.8, -35.3]], ['head', [-7, 73, -55.5]])]
	},
	{
		mesh: 'obl_sup_r', layer: 0, baked: true,
		strands: [strand(['c1', [-41, 55, -9.3]], ['head', [-38.2, 70.5, -29]]), strand(['c1', [-39.5, 56.3, -10.4]], ['head', [-33.5, 73.5, -48]])]
	},
	{ mesh: 'obl_inf_r', layer: 0, baked: true, strands: [strand(['c2', [-4.8, 26.4, -39.8]], ['c1', [-38, 51.4, -8]])] },
	// ---- prevertebral ----
	{ mesh: 'rca_r', layer: 0, baked: true, strands: [strand(['c1', [-19.6, 60.1, 4.8]], ['head', [-6.3, 74.9, 6]])] },
	{ mesh: 'rcl_r', layer: 0, baked: true, strands: [strand(['c1', [-34.8, 56, -2.2]], ['head', [-36, 70.3, -10.3]])] },
	{
		mesh: 'longus_colli_sup_r', layer: 0, baked: true,
		// from the anterior tubercles of C3–C5 to the anterior tubercle of the atlas
		strands: [strand(['c5', [-20, -5, 1.8]], ['c1', [-6, 51.5, 8]]), strand(['c3', [-23, 21.5, 0.8]], ['c1', [-5, 54, 9.5]])]
	},
	{
		mesh: 'longus_colli_vert_r', layer: 0, baked: true,
		// on every vertebral body from T3 to C2
		strands: [strand(['thorax', [-5.2, -59.5, -6.5]], ['c7', [-5.7, -40.1, -0.8]], ['c6', [-6.4, -25.3, 3.8]], ['c5', [-6, -11.2, 5.9]],
			['c4', [-5, 4.6, 7.8]], ['c3', [-4.7, 22.3, 7.2]], ['c2', [-3.6, 37.2, 7]])]
	},
	{ mesh: 'longus_colli_inf_r', layer: 0, baked: true, strands: [strand(['thorax', [-6.5, -85, -15]], ['c6', [-21.5, -25.6, -1]])] },
	{
		mesh: 'semispinalis_cerv_r', layer: 0, baked: true,
		// from the thoracic transverse processes to the spinous processes of C3–C7, the higher from lower down
		strands: [
			strand(['thorax', [-28.6, -110, -68]], ['c3', [-3.5, 13.7, -31]]),
			strand(['thorax', [-28.9, -87, -62]], ['c4', [-3.2, -1.4, -34.4]]),
			strand(['thorax', [-27, -71.6, -56]], ['c5', [-4, -10.7, -38.4]]),
			strand(['thorax', [-30.6, -44, -38]], ['c7', [-4.8, -38.5, -52.6]])
		]
	},
	// ---- scalenes ----
	{
		mesh: 'scalene_ant_r', layer: 0, baked: true,
		// from the anterior tubercles of C4–C6 to the first rib's scalene tubercle
		strands: [strand(['c4', [-22, 5, 0.9]], ['thorax', [-50.3, -69.1, 12.5]]), strand(['c6', [-25.7, -24.8, -0.7]], ['thorax', [-51.5, -70.5, 12.7]])]
	},
	{
		mesh: 'scalene_mid_r', layer: 0, baked: true,
		// from the posterior tubercles of C2–C7 to the first rib, behind the subclavian groove
		strands: [
			strand(['c2', [-25.1, 30.6, -5.5]], ['thorax', [-51, -62.6, 4.5]]),
			strand(['c4', [-27, 3.8, -2.8]], ['thorax', [-49.3, -59.5, 1.1]]),
			strand(['c6', [-28.8, -22.6, -9.2]], ['thorax', [-49, -56, -2.4]])
		]
	},
	{
		mesh: 'scalene_post_r', layer: 0, baked: true,
		// from the posterior tubercles of C5–C7 to the outer surface of the second rib
		strands: [strand(['c5', [-28.5, -10.3, -6.1]], ['thorax', [-62.5, -57.5, -25]]), strand(['c7', [-34.1, -32, -16.3]], ['thorax', [-61, -57, -28]])]
	},
	// ---- over them ----
	{
		mesh: 'semispinalis_cap_r', layer: 1, baked: true,
		// from the transverse processes of T1 and the articular processes of C4–C6 up to the occiput, between the nuchal lines
		strands: [
			strand(['thorax', [-31, -34, -28.5]], ['head', [-12, 81.6, -66]]),
			strand(['c6', [-27, -21, -22]], ['head', [-22, 81.6, -64.6]]),
			strand(['c5', [-24.3, -8, -20]], ['head', [-30.5, 79, -59]]),
			strand(['c4', [-24, 4.5, -17]], ['head', [-38, 79, -53]])
		]
	},
	{
		mesh: 'longissimus_cap_r', layer: 1, baked: true,
		// from the upper thoracic transverse and lower cervical articular processes to the mastoid process
		strands: [strand(['thorax', [-33, -48, -43.5]], ['head', [-56.5, 78, -17.5]]), strand(['c4', [-27.4, 8, -11.5]], ['head', [-56, 76.5, -14.7]])]
	},
	{
		mesh: 'splenius_cerv_r', layer: 1, baked: true,
		// from the spinous processes of T3–T6 to the transverse process of the atlas
		strands: [strand(['thorax', [-1.6, -127, -88]], ['c1', [-38.5, 51, -5.5]]), strand(['thorax', [-1.5, -170, -87]], ['c1', [-38.5, 53, -5]])]
	},
	{
		mesh: 'longus_cap_r', layer: 1, baked: true,
		// from the anterior tubercles of C3–C6 to the basilar part of the occipital bone
		strands: [
			strand(['c6', [-23.3, -22.5, 0.2]], ['head', [-8, 78.5, 9.5]]),
			strand(['c5', [-22.4, -8.6, 0.9]], ['head', [-5.7, 78.4, 10.6]]),
			strand(['c3', [-25.4, 18, -0.1]], ['head', [-4, 79, 12]])
		]
	},
	{
		mesh: 'levator_r', layer: 1, baked: true,
		// a slip from each of C1–C4's transverse processes to the scapula's medial border, the highest slip lowest
		strands: [
			strand(['c1', [-39.2, 49.9, -5.6]], ['thorax', [-64.5, -92.9, -80.8]]),
			strand(['c2', [-26, 32.9, -5.5]], ['thorax', [-68.1, -86.3, -76.1]]),
			strand(['c3', [-27.3, 18.7, -3]], ['thorax', [-73.1, -79.2, -71.6]]),
			strand(['c4', [-27.1, 5.9, -2.5]], ['thorax', [-80.7, -74.7, -65.7]])
		]
	},
	{
		mesh: 'splenius_cap_r', layer: 2, baked: true, axis: SPINE,
		// a sheet wrapping round the back and side of the neck, from the nuchal ligament (C4–C7) and the spinous
		// processes of T1–T3 to the mastoid and the superior nuchal line: its origin held along the midline, the
		// lowest fibres to the mastoid, the highest to the nuchal line (with three strands the sheet between them cut
		// into the muscles under it as the head turned)
		strands: [
			strand(['thorax', [-1.1, -110, -88.5]], ['head', [-57.1, 76.6, -13.9]]),
			strand(['thorax', [-1.5, -60, -73]], ['head', [-56.9, 78.6, -17.2]]),
			strand(['c7', [-3, -38.7, -63.4]], ['head', [-56.7, 80.7, -20.6]]),
			strand(['c5', [-1.2, -14.1, -47.1]], ['head', [-55.4, 82.2, -27.4]]),
			strand(['c4', [-2.3, -1.7, -42]], ['head', [-51.1, 79.9, -34]])
		]
	},
	// ---- outermost ----
	{
		// on the splenii and levator scapulae: they push it out where they bulge or slide under it (as the head turns),
		// rather than it holding them down; and like them it keeps its distance from the spine
		mesh: 'trap_upper_r', layer: 3, baked: true, axis: SPINE, beneath: ['splenius_cap_r', 'splenius_cerv_r', 'levator_r'],
		// across the sheet, from its lowest fibres up the midline and out along the superior nuchal line. Its medial
		// edge is held all along the nuchal ligament (on the midline, 3–7 mm behind the spinous processes) from T1
		// to the external occipital protuberance, as the left side's is, so the two hold together; held only at C3
		// and the occiput, the edges below swung apart in extension. The fibres from the ligament converge on the
		// clavicle's acromial end; those from the occiput reach further along it, the most lateral the furthest.
		strands: [
			strand(['thorax', [0, -51, -77]], ['thorax', [-117.5, -61.5, -36]]),
			strand(['c7', [0, -38.4, -72.3]], ['thorax', [-117.5, -61.5, -35]]),
			strand(['c5', [0, -15.3, -54.2]], ['thorax', [-117.2, -61.6, -34]]),
			strand(['c3', [0, 11.3, -44.7]], ['thorax', [-117, -61.7, -33]]),
			strand(['c1', [0, 51, -42]], ['thorax', [-116.5, -61.7, -32.5]]),
			strand(['head', [0, 80, -64.8]], ['thorax', [-110, -62, -28]]),
			strand(['head', [-18.5, 82.1, -66.5]], ['thorax', [-100.6, -62.6, -19.8]]),
			strand(['head', [-31, 81.9, -61]], ['thorax', [-87.4, -65, -0.4]])
		]
	},
	{
		// as the head turns toward it, it comes onto the scalenes, levator scapulae and the longus muscles (it touches
		// none of them at rest), and was cutting through them
		mesh: 'scm_r', layer: 3, baked: true, axis: SPINE,
		beneath: ['scalene_ant_r', 'scalene_mid_r', 'scalene_post_r', 'levator_r', 'longus_cap_r', 'longus_colli_sup_r', 'longus_colli_vert_r'],
		strands: [
			// clavicular head, to the superior nuchal line
			strand(['thorax', [-35, -74, 48.2]], ['head', [-53.7, 81.8, -30.8]]),
			// sternal head, to the mastoid process
			strand(['thorax', [-9.5, -92.1, 65.1]], ['head', [-57.5, 77.6, -12.8]])
		]
	}
];

/** The left side's muscle: its mesh and points mirrored across the midline. */
function mirror(d: MusclePathDef): MusclePathDef {
	return {
		...d,
		mesh: d.mesh.replace(/_r$/, '_l'),
		over: d.over?.map((m) => m.replace(/_r$/, '_l')),
		beneath: d.beneath?.map((m) => m.replace(/_r$/, '_l')),
		strands: d.strands.map((els) => els.map((e) => ('p' in e ? { ...e, p: [-e.p[0], e.p[1], e.p[2]] } : e)))
	} as MusclePathDef;
}

export const neckPaths: JointPaths = {
	surfaces: {},
	muscles: [...right, ...right.map(mirror)],
	// the bake keeps the layers apart
	contact: false,
	// hand-tuned keys, edited in the app's Tune panel (#debug) and saved to tuning.json
	tuning: tuning as Tuning
};
