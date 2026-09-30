import type { JointPaths } from '../../core/muscle/schema';

/**
 * Lines of action for the shoulder muscles (rest pose: arm hanging about 10° from the side; x toward
 * the subject's left, y up, z anterior, mm; the humeral head's center near the origin). Ends found by
 * scripts/draft-paths.ts; via points only along fleshy attachments.
 */
// Layers, deep to superficial: the rotator cuff on the scapula and the humeral head; the deltoid over it.
export const shoulderPaths: JointPaths = {
	surfaces: {
		// the humeral head, a near sphere (fitted radius 22.4 mm) about which the arm turns. The cuff's
		// tendons wrap it a few millimetres out, their insertions on the tubercles lifted onto it: ending
		// inside, a strand's last stretch dived onto the tubercle and its twist, measured along that dive,
		// swung round.
		humeralHeadCuff: { kind: 'ellipsoid', bone: 'humerus', center: [-1.6, 1.1, 0], radii: [26, 26, 26] },
		// over the cuff, for the deltoid
		humeralHeadDeltoid: { kind: 'ellipsoid', bone: 'humerus', center: [-1.6, 1.1, 0], radii: [36, 36, 36] },
		// surgical neck and proximal shaft, long along the head→shaft axis: latissimus dorsi and teres
		// major wind round it to their insertions on the lips of the intertubercular groove
		humerusNeck: { kind: 'ellipsoid', bone: 'humerus', center: [-9, -23.8, 1.4], radii: [22, 62, 22], axes: [[-0.953, 0.301, 0], [-0.301, -0.952, 0.056]] },
		// latissimus dorsi lies on the scapula, which slides under it as the arm rises; two surfaces riding
		// the scapula keep it behind. The back of the blade along its lateral half, for the upper fibres:
		// its side is fixed to the back, so they wrap behind the blade and round its lateral border, never
		// in front, and it fades out past the blade's ends.
		scapulaBack: { kind: 'cylinder', bone: 'scapula', center: [68, -100, -58], axis: [0, 1, 0], radius: 30, extent: [-150, 150] },
		// the inferior angle and lower lateral border, for the lower fibres (running down to the lumbar
		// spine and iliac crest nearly along scapulaBack's axis, where its wrap is ill-conditioned). Its
		// center lies deep and medial of the angle, inside the chest, so their line always passes it on
		// the lateral and posterior side and they wrap behind; it rides the scapula and stays clear of
		// the humerus even with the arm across the chest.
		scapulaAngle: { kind: 'ellipsoid', bone: 'scapula', center: [100, -110, 40], radii: [70, 60, 145] },
		// the rib cage's right half (fitted to its outer surface, 3 mm RMS; poorest near the thoracic inlet),
		// 4 mm out: the lower pectoralis major lies over it
		chestPec: { kind: 'ellipsoid', bone: 'thorax', center: [109.8, -144.7, 34.5], radii: [83.7, 195.7, 103.2], axes: [[0.946, -0.105, -0.305], [0.042, 0.978, -0.206]] },
		// the humeral head under the pectoralis major's tendon, over the biceps tendon and subscapularis
		pecHead: { kind: 'ellipsoid', bone: 'humerus', center: [-1.6, 1.1, 0], radii: [32, 32, 32] }
	},
	muscles: [
		{
			mesh: 'supraspinatus',
			layer: 0,
			strands: [[
				{ bone: 'humerus', p: [-21.9, 13.4, 10.7] }, // greater tubercle, superior facet
				{ wrap: 'humeralHeadCuff' },
				{ bone: 'scapula', p: [42.9, 14.2, -37.9] },
				{ bone: 'scapula', p: [57.2, 9.4, -40.5] },
				{ bone: 'scapula', p: [69.3, 11.5, -48.6] },
				{ bone: 'scapula', p: [93.4, 1.1, -65.4] } // supraspinous fossa
			]]
		},
		{
			mesh: 'infraspinatus',
			layer: 0,
			strands: [[
				{ bone: 'humerus', p: [-25.8, 10.0, -3.4] }, // greater tubercle, middle facet
				{ wrap: 'humeralHeadCuff' },
				{ bone: 'scapula', p: [40.2, -11.6, -48.8] },
				{ bone: 'scapula', p: [44, -28.3, -59.6] },
				{ bone: 'scapula', p: [53.8, -39.3, -68] },
				{ bone: 'scapula', p: [64.7, -36.9, -72.7] },
				{ bone: 'scapula', p: [84.7, -66.2, -80.6] },
				{ bone: 'scapula', p: [89.7, -85.5, -82.8] } // infraspinous fossa
			]]
		},
		{
			mesh: 'teres_minor',
			layer: 0,
			strands: [[
				{ bone: 'humerus', p: [-27.5, -0.6, -0.5] }, // greater tubercle, inferior facet
				{ wrap: 'humeralHeadCuff' },
				// its fleshy origin runs up the lateral border to here (on the rest path)
				{ bone: 'scapula', p: [24, -50.3, -40.5] },
				{ bone: 'scapula', p: [62.5, -82.4, -66.5] } // lateral border
			]]
		},
		{
			mesh: 'subscapularis',
			layer: 0,
			strands: [[
				{ bone: 'humerus', p: [1.7, 4.4, 25.6] }, // lesser tubercle
				{ wrap: 'humeralHeadCuff' },
				{ bone: 'scapula', p: [49.1, -19.5, -29] },
				{ bone: 'scapula', p: [60.7, -26, -37.7] },
				{ bone: 'scapula', p: [68.3, -34.2, -48.8] },
				{ bone: 'scapula', p: [78.5, -38.4, -58.8] },
				{ bone: 'scapula', p: [90.2, -33.5, -65.2] },
				{ bone: 'scapula', p: [90.3, -58.7, -70.8] },
				{ bone: 'scapula', p: [82.7, -89.8, -75.1] } // subscapular fossa
			]]
		},
		{
			mesh: 'deltoid_ant',
			layer: 1,
			strands: [[
				{ bone: 'clavicle', p: [76, 30.6, 26.5] }, // lateral third of the clavicle
				{ wrap: 'humeralHeadDeltoid' },
				{ bone: 'humerus', p: [-35.4, -77.6, 16.9] },
				{ bone: 'humerus', p: [-38.5, -105.2, 5.3] } // deltoid tuberosity
			]]
		},
		{
			mesh: 'deltoid_mid',
			layer: 1,
			strands: [[
				{ bone: 'scapula', p: [-1.9, 28.4, -13.9] }, // acromion
				{ wrap: 'humeralHeadDeltoid' },
				{ bone: 'humerus', p: [-51.8, -67.3, 1] },
				{ bone: 'humerus', p: [-40.4, -106.8, 0.6] } // deltoid tuberosity
			]]
		},
		{
			mesh: 'deltoid_post',
			layer: 1,
			strands: [[
				{ bone: 'scapula', p: [64.1, -3.3, -66.7] }, // spine of the scapula
				// along its fleshy origin on the spine and acromion (mesh centerline)
				{ bone: 'scapula', p: [40.1, 3.3, -60] },
				{ bone: 'scapula', p: [27.4, 3.2, -57.1] },
				{ bone: 'scapula', p: [14.5, 3.8, -54] },
				{ wrap: 'humeralHeadDeltoid' },
				{ bone: 'humerus', p: [-46.3, -81.1, -19] },
				{ bone: 'humerus', p: [-42, -123.3, -9.9] } // deltoid tuberosity
			]]
		},
		// DRAFT (work in progress): teres major and latissimus dorsi
		{
			mesh: 'teres_major',
			layer: 0,
			strands: [[
				{ bone: 'humerus', p: [6.1, -45.1, -2.2] }, // medial lip of the intertubercular groove, lifted onto humerusNeck
				{ wrap: 'humerusNeck' },
				{ bone: 'scapula', p: [33.1, -74.1, -47.9] },
				{ bone: 'scapula', p: [43.3, -87.3, -59.8] },
				{ bone: 'scapula', p: [55.9, -96.7, -72.3] },
				{ bone: 'scapula', p: [68.9, -100.1, -78.4] },
				{ bone: 'scapula', p: [75.9, -107.3, -80.5] } // inferior angle
			]]
		},
		{
			mesh: 'lat',
			layer: 1,
			// a fan from one tendon: top (T7, nearly horizontal) to bottom along the spine, then the iliac crest
			strands: ([
				[157, -122, -73],
				[158, -167, -68],
				[160, -225, -58],
				[160, -301, -54],
				[158, -428, -55],
				[88, -369, -24]
			] as [number, number, number][]).map((p, k) => [
				{ bone: 'humerus', p: [4.2, -45.7, 11.2] }, // floor of the intertubercular groove, lifted onto humerusNeck
				{ wrap: 'humerusNeck' },
				// behind the scapula
				k < 4 ? { wrap: 'scapulaBack', side: -1 as const } : { wrap: 'scapulaAngle' },
				{ bone: 'thorax', p }
			])
		},
		// DRAFT (work in progress): long head of triceps and pectoralis major. Strand ends from the attachment
		// footprints on the meshes, paired across each sheet; each strand's wraps the candidates that kept it
		// closest to its reference taut path (4 mm off bone, rib cage solid) over the range, without frame jumps.
		{
			mesh: 'triceps_long',
			layer: 1,
			anchor: [16, 8],
			strands: [[
				{ bone: 'scapula', p: [20.3, -20.1, -17.6] }, // infraglenoid tubercle
				{ wrap: 'humeralHeadCuff' },
				{ bone: 'humerus', p: [-45.5, -275.9, -27.9] } // (the elbow isn't in this model: rides the humerus)
			]]
		},
		{
			mesh: 'pec_clav',
			layer: 2,
			// medial half of the clavicle; the lowest part of the insertion (lateral lip of the intertubercular groove)
			strands: [
				[{ bone: 'humerus', p: [-21.9, -46.4, 11.3] }, { bone: 'clavicle', p: [80.8, 24.8, 44.7] }],
				[{ bone: 'humerus', p: [-25.6, -59.8, 10.7] }, { bone: 'clavicle', p: [95.4, 22.3, 57.5] }],
				[{ bone: 'humerus', p: [-28.4, -72.7, 10.5] }, { bone: 'clavicle', p: [122.9, 19.1, 68.1] }]
			]
		},
		{
			mesh: 'pec_stern',
			layer: 2,
			// sternum and upper costal cartilages, lowest first
			strands: [
				[{ bone: 'humerus', p: [-22.4, -61.1, 10.6] }, { wrap: 'chestPec' }, { bone: 'thorax', p: [89.5, -147.4, 125] }],
				[{ bone: 'humerus', p: [-18.4, -48.4, 10.8] }, { wrap: 'chestPec' }, { bone: 'thorax', p: [115.5, -116.2, 123.7] }],
				[{ bone: 'humerus', p: [-17.6, -42.5, 10.8] }, { wrap: 'pecHead' }, { bone: 'thorax', p: [148.2, -67.5, 116.4] }],
				[{ bone: 'humerus', p: [-16.8, -39.7, 10.9] }, { wrap: 'pecHead' }, { bone: 'thorax', p: [146, -11.7, 91] }]
			]
		},
		{
			mesh: 'pec_abd',
			layer: 2,
			// lower costal cartilages and the rectus sheath: the highest part of the insertion (the tendon's twist)
			strands: [
				[{ bone: 'humerus', p: [-14.2, -45.9, 10.3] }, { wrap: 'chestPec' }, { bone: 'thorax', p: [87.7, -197.2, 126.5] }],
				[{ bone: 'humerus', p: [-11.9, -36.8, 10.7] }, { wrap: 'chestPec' }, { bone: 'thorax', p: [104.1, -188.1, 130.7] }]
			]
		}
	],
	// muscles lying between scapula, humerus and ribs: a second pass shuttles vertices between them
	collidePasses: 1,
	// through the shoulder's range, pushing strands apart made them jump; off until that is resolved
	contact: false
};
