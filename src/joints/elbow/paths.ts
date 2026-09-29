import type { JointPaths } from '../../core/muscle/schema';

/**
 * Lines of action for the elbow's forearm rotators and brachioradialis, measured from the meshes (rest pose: 15°
 * flexion, full supination; x medial, y up, z anterior, mm). Wrap cylinders stand for the radius
 * where muscles wind around it in pronation; their radius is the muscle's mid-thickness around
 * the bone, so the strand runs through the muscle, not along the bone surface. Sides are left to
 * the solver (each strand keeps to the side of the bone it passes at rest) except where the rest
 * path runs so close to the axis that the side is a matter of anatomy.
 */
// layers, deep to superficial: supinator and pronator quadratus on the bones; pronator teres over
// supinator; biceps over them; brachioradialis over pronator teres and alongside biceps.
export const elbowPaths: JointPaths = {
	surfaces: {
		// trochlea and capitulum, about the flexion axis: tendons crossing the front of the elbow ride
		// over them in extension (they reach 10–13 mm from the axis in front)
		humerusCondyles: { kind: 'cylinder', bone: 'humerus', center: [0, 0, 0], axis: [-0.971, 0.186, -0.148], radius: 14 },
		// radial neck and tuberosity, for the biceps tendon
		radiusTuberosity: { kind: 'cylinder', bone: 'radius', center: [-27.3, -45, 8.05], axis: [-0.168, -0.96, 0.19], radius: 8.5 },
		// proximal shaft, for supinator winding around it (clearing the radial head and most of the
		// tuberosity, which reach 13–15 mm from this axis)
		radiusSupinator: { kind: 'cylinder', bone: 'radius', center: [-29.9, -60, 8.65], axis: [-0.17, -0.977, 0.127], radius: 12.5 },
		// middle of the shaft, for pronator teres reaching its lateral insertion
		radiusMid: { kind: 'cylinder', bone: 'radius', center: [-35.6, -90, 14.3], axis: [-0.188, -0.978, 0.09], radius: 11 },
		// distal shaft, for pronator quadratus
		radiusDistal: { kind: 'cylinder', bone: 'radius', center: [-51.6, -195, 37.4], axis: [-0.147, -0.937, 0.316], radius: 11 },
		// behind the elbow about the flexion axis, clearing the olecranon (which reaches 31 mm from the axis
		// and turns about it): triceps tendons ride over it in flexion
		humerusOlecranon: { kind: 'cylinder', bone: 'humerus', center: [0, 0, 0], axis: [-0.971, 0.186, -0.148], radius: 30 },
		// drafted by scripts/draft-paths.ts for brachioradialis: over the lateral elbow about the flexion
		// axis, and round the radial shaft
		humerusFlexionBrachioradialis: { kind: 'cylinder', bone: 'humerus', center: [-15.4, 3, -2.4], axis: [-0.971, 0.186, -0.148], radius: 24.1 },
		radiusBrachioradialis2: { kind: 'cylinder', bone: 'radius', center: [-43.8, -141.9, 20.3], axis: [0.18, 0.962, -0.205], radius: 13.9 }
	},
	muscles: [
		{
			mesh: 'biceps_lh',
			layer: 2,
			// the tendon's footprint on the tuberosity is about 2 cm long
			anchor: [8, 20],
			strands: [[
				{ bone: 'humerus', p: [49.4, 292.6, 15.6] }, // supraglenoid tubercle
				{ bone: 'humerus', p: [30.4, 238.1, 18.9] }, // intertubercular groove
				{ bone: 'humerus', p: [5.9, 137.9, 22.8] },
				// no via point above the elbow: the biceps isn't attached there, and pinned to the humerus
				// the path turned sharply in flexion instead of bowstringing across the joint
				{ wrap: 'humerusCondyles' },
				{ wrap: 'radiusTuberosity' },
				{ bone: 'radius', p: [-20.1, -46.5, 14.9] } // radial tuberosity
			]]
		},
		{
			mesh: 'biceps_sh',
			layer: 2,
			anchor: [8, 12],
			// the mesh stops where it meets the long head; the path runs on into the long head's strand a
			// little further down, and rides it there, so the two stay together however far the long
			// head's belly slides and the short head merges along it rather than folding into it
			strands: [[
				{ bone: 'humerus', p: [71.2, 283.0, 24.6] }, // coracoid process
				{ bone: 'humerus', p: [41.2, 229.8, 17.6] },
				{ bone: 'humerus', p: [31.2, 150.0, 20.6] },
				{ join: 'biceps_lh', p: [-10.5, 4.4, 15.3] } // into the long head
			]]
		},
		{
			mesh: 'pt_hum',
			layer: 1,
			strands: [[
				{ bone: 'humerus', p: [16.4, 18.2, 1.0] }, // medial epicondyle
				{ wrap: 'humerusCondyles' },
				// in front of the radius and round its lateral side: wound up in supination, unwound by pronation
				{ wrap: 'radiusMid', side: 1 },
				{ bone: 'radius', p: [-49.1, -124.1, 16.5] } // pronator tuberosity
			]]
		},
		{
			mesh: 'pt_uln',
			layer: 1,
			strands: [[
				{ bone: 'ulna', p: [-1.1, -24.0, 7.5] }, // coronoid process
				{ wrap: 'radiusMid', side: 1 },
				{ bone: 'radius', p: [-47.9, -112.7, 16.3] }
			]]
		},
		{
			// drafted by scripts/draft-paths.ts, less its via point on the radial shaft: the tendon only
			// slides there, and pinned to the shaft the path doubled back on itself in pronation. It now
			// winds round the radius straight to the styloid.
			mesh: 'brachioradialis',
			layer: 3,
			strands: [[
				{ bone: 'humerus', p: [-2, 101.1, -11.1] }, // lateral supracondylar ridge
				{ bone: 'humerus', p: [-20.8, 52.9, -6] }, // foot of the ridge (still origin)
				{ wrap: 'humerusFlexionBrachioradialis' },
				{ wrap: 'radiusBrachioradialis2' },
				{ bone: 'radius', p: [-70.4, -231, 50.6] } // radial styloid
			]]
		},
		{
			// the floor of the cubital fossa, under biceps, brachioradialis and pronator teres: from the
			// middle of its broad origin on the front of the humerus, over the front of the elbow to the
			// ulnar tuberosity (ends found by scripts/draft-paths.ts; its wraps and near-joint via points
			// were dropped: pinned at the joint it folded in flexion)
			mesh: 'brachialis',
			layer: 0,
			strands: [[
				{ bone: 'humerus', p: [14.5, 173.8, 14.5] }, // top of its origin
				{ bone: 'humerus', p: [3.9, 89.1, 2.2] }, // still origin
				{ wrap: 'humerusCondyles' },
				{ bone: 'ulna', p: [-6.9, -45.5, 2.3] } // ulnar tuberosity
			]]
		},
		{
			// ends found by scripts/draft-paths.ts; over the back of the elbow to the olecranon
			mesh: 'triceps_long',
			layer: 1,
			strands: [[
				{ bone: 'humerus', p: [64.7, 250.7, -11.7] }, // infraglenoid tubercle (the scapula rides the humerus here)
				{ wrap: 'humerusOlecranon' },
				{ bone: 'ulna', p: [-1.1, -5.2, -21.9] } // olecranon
			]]
		},
		{
			mesh: 'triceps_lat',
			layer: 1,
			strands: [[
				{ bone: 'humerus', p: [26, 245.6, -4.5] }, // posterior humerus above the radial groove
				{ wrap: 'humerusOlecranon' },
				{ bone: 'ulna', p: [-5.7, -4.8, -21.7] } // olecranon
			]]
		},
		// triceps_med stays on the old deformer: attached along almost the whole back of the humerus, it
		// hardly moves, and riding a sliding strand its attached surface slid into the bone and snapped
		{
			mesh: 'supinator',
			layer: 0,
			// proximal to distal fibres, from the lateral epicondyle and supinator crest round the
			// back and side of the radius to its front
			strands: [
				// humeral fibres pass through the radial collateral and annular ligaments behind the radial head
				[{ bone: 'humerus', p: [-29.7, 3.7, -9.7] }, { bone: 'ulna', p: [-32.0, -15.0, -8.3] }, { wrap: 'radiusSupinator' }, { bone: 'radius', p: [-30.4, -35.8, 17.4] }],
				[{ bone: 'ulna', p: [-17.1, -36.4, -6.4] }, { wrap: 'radiusSupinator' }, { bone: 'radius', p: [-35.7, -64.0, 18.5] }],
				[{ bone: 'ulna', p: [-22.1, -65.6, -0.4] }, { wrap: 'radiusSupinator' }, { bone: 'radius', p: [-46.1, -104.6, 12.0] }]
			]
		},
		{
			mesh: 'pq',
			layer: 0,
			// proximal to distal slabs, anterior ulna to anterior radius
			strands: [
				[{ bone: 'ulna', p: [-20.7, -181.3, 37.4] }, { wrap: 'radiusDistal' }, { bone: 'radius', p: [-51.2, -183.5, 36.4] }],
				[{ bone: 'ulna', p: [-22.9, -198.0, 42.7] }, { wrap: 'radiusDistal' }, { bone: 'radius', p: [-56.7, -198.2, 40.6] }],
				[{ bone: 'ulna', p: [-24.3, -213.2, 44.9] }, { wrap: 'radiusDistal' }, { bone: 'radius', p: [-63.2, -214.7, 47.1] }]
			]
		}
	]
};
