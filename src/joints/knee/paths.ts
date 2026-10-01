import type { JointPaths } from '../../core/muscle/schema';
import type { Tuning } from '../../core/muscle/tune';
import tuning from './tuning.json';

/**
 * Lines of action for the muscles crossing the knee (rest pose: full extension; x toward the subject's left,
 * y up, z anterior, mm; the origin on the flexion axis between the epicondyles). Every muscle is baked
 * (scripts/bake.ts): strands list only their fixed points, ends from the mesh's attachment footprints
 * (`npm run route -- draft knee <mesh>`). Muscles from the pelvis end on the femur, gastrocnemius and
 * plantaris on the tibia (the hip and ankle aren't in this model). The quadriceps end on the patella's base
 * (set by hand, spread across it), where their meshes are cut (pipeline/joints/knee.py): beyond it they are
 * tendon, drawn as a sheet of its own (`patellar_lig`, the aponeurosis: from the muscles' cut over the patella,
 * then the patellar ligament to the tibia). It hangs on three strands of its own from the quadriceps' origins,
 * so its top moves with the muscles' cut ends; over the patella they ride it, then run on to the tibia.
 *
 * Fascia: with no hip, the thigh part of every muscle from the pelvis rides the femur, so the long flexors and
 * the iliotibial tract are held to it by femur points along their mesh's midline (the fascia lata and, for the
 * tract, the lateral intermuscular septum). The last of them, just above the joint line, is the popliteal
 * fascia: it holds the tendons in to the back of the knee as it bends, where a free band would bowstring
 * across. Sartorius and gracilis curve forward round the medial tibial condyle to the pes anserinus, held by a
 * point there.
 */
type P3 = [number, number, number];
const strand = (from: [string, P3], ...to: [string, P3][]) => [{ bone: from[0], p: from[1] }, ...to.map(([bone, p]) => ({ bone, p }))];
/** the aponeurosis's midline at the patella's apex, the top of the tibial tuberosity, and its insertion */
const APEX: [string, P3] = ['patella', [-13, -38, 37]], TUBEROSITY: [string, P3] = ['tibia', [-9, -56, 36.8]], INSERTION: [string, P3] = ['tibia', [-8, -64, 36.8]];

// Layers, deep to superficial: on the bone (vastus intermedius, popliteus, the short head of biceps femoris,
// plantaris); over them (vastus lateralis and medialis, semimembranosus, gastrocnemius, the long head of biceps
// femoris); outermost (rectus femoris, the iliotibial tract, sartorius, gracilis, semitendinosus).
export const kneePaths: JointPaths = {
	surfaces: {},
	muscles: [
		// ---- the quadriceps' aponeurosis: on the bone, and no obstacle for the muscles over it ----
		{
			// set into the patella (it holds it, a sesamoid): kept off the femur and tibia only
			mesh: 'patellar_lig', layer: 0, baked: true, obstacle: false, bulge: false, collide: ['femur', 'tibia'],
			strands: [
				// its lateral arm, from vastus lateralis's line
				strand(['femur', [-47.1, 325.5, 31]], ['patella', [-26, 2, 41]], ['patella', [-21, -25, 42]], APEX, TUBEROSITY, INSERTION),
				// its middle, from rectus femoris's
				strand(['femur', [-30.6, 434.5, 44.1]], ['patella', [-5, 2, 41]], ['patella', [-9, -15, 47]], APEX, TUBEROSITY, INSERTION),
				// its medial arm, from vastus medialis's
				strand(['femur', [-21.1, 282.7, 34.1]], ['patella', [14, 2, 39]], ['patella', [6, -15, 44]], APEX, TUBEROSITY, INSERTION)
			]
		},
		// ---- on the bone ----
		{
			mesh: 'vastus_int', layer: 0, baked: true, anchor: [30, 8],
			strands: [
				// the deep part of the base
				strand(['femur', [-44.9, 263.2, 29.1]], ['patella', [-16, 2.5, 40]]),
				strand(['femur', [-31.4, 267.8, 37.4]], ['patella', [-8, 2.5, 38.5]])
			]
		},
		{ mesh: 'popliteus', layer: 0, baked: true, strands: [strand(['femur', [-35.9, -7.9, -14]], ['tibia', [5.1, -67.9, -10.9]])] },
		{
			mesh: 'biceps_fem_sh', layer: 0, baked: true,
			// its fleshy origin runs along the lateral lip of the linea aspera
			anchor: [30, 8],
			strands: [
				strand(['femur', [-22.3, 185.3, 16.3]], ['femur', [-27, 40, 0]], ['tibia', [-44.7, -52.9, -9]]),
				strand(['femur', [-15.9, 142.2, 15.7]], ['femur', [-30.5, 40, -6]], ['tibia', [-42.4, -50.2, -15]])
			]
		},
		{ mesh: 'plantaris', layer: 0, baked: true, strands: [strand(['femur', [-20, 22.8, 3]], ['tibia', [16.9, -417.2, -45.1]])] },
		// ---- over them ----
		{
			mesh: 'vastus_lat', layer: 1, baked: true, anchor: [30, 8],
			// the lateral part of the patella's base
			strands: [
				strand(['femur', [-33, 234.7, 16.2]], ['patella', [-24, 0.5, 44]]),
				strand(['femur', [-43.5, 246.3, 24.3]], ['patella', [-21, 1.5, 44]]),
				strand(['femur', [-47.1, 325.5, 31]], ['patella', [-18, 2.5, 44.5]])
			]
		},
		{
			mesh: 'vastus_med', layer: 1, baked: true, anchor: [30, 8],
			strands: [
				// the oblique fibres (VMO), to the medial corner of the base
				strand(['femur', [-10.4, 178.6, 37.2]], ['patella', [-3.5, 1.5, 41.5]]),
				strand(['femur', [-21.1, 282.7, 34.1]], ['patella', [-8, 2.5, 42]])
			]
		},
		{
			mesh: 'semimem', layer: 1, baked: true,
			strands: [strand(['femur', [30.1, 325.4, -2.4]], ['femur', [33.4, 220, -6.2]], ['femur', [23.1, 120, -10.6]], ['femur', [21.6, 40, -19]], ['tibia', [26, -54.7, 4.4]])]
		},
		{ mesh: 'gastroc_med', layer: 1, baked: true, strands: [strand(['femur', [18.1, 15.1, -3.6]], ['tibia', [5, -243.5, -39.9]])] },
		{ mesh: 'gastroc_lat', layer: 1, baked: true, strands: [strand(['femur', [-31.1, 10.3, -7.6]], ['tibia', [-22.2, -230.3, -45.5]])] },
		{
			mesh: 'biceps_fem', layer: 1, baked: true,
			strands: [strand(['femur', [15.5, 342.3, -21.2]], ['femur', [-12.2, 220, -10.7]], ['femur', [-20, 120, -18.5]], ['femur', [-25.4, 40, -16.8]], ['tibia', [-45.3, -57.2, -10]])]
		},
		// ---- outermost ----
		{ mesh: 'rectus_fem', layer: 2, baked: true, strands: [strand(['femur', [-30.6, 434.5, 44.1]], ['patella', [-14, 2.5, 44]])] },
		{
			mesh: 'it_tract', layer: 2, baked: true,
			strands: [
				strand(['femur', [-67.1, 355.4, 10]], ['femur', [-70.1, 220, 16.1]], ['femur', [-67.1, 140.5, 18.3]], ['femur', [-58, 70, 25.5]], ['tibia', [-30.7, -53.8, 16.2]]),
				// its front border
				strand(['femur', [-69.5, 356.1, 19]], ['femur', [-80.1, 220, 45.9]], ['femur', [-76.2, 140.4, 42.2]], ['femur', [-61.2, 69.6, 35.7]], ['tibia', [-18.2, -60.2, 32.5]])
			]
		},
		{
			mesh: 'sartorius', layer: 2, baked: true,
			strands: [strand(['femur', [-42.2, 464.9, 82.8]], ['femur', [20.7, 220, 67.8]], ['femur', [37.5, 120, 41.3]], ['femur', [44.3, 40.3, 22.3]], ['tibia', [33.6, -45, 17.7]], ['tibia', [9.5, -106.1, 22.9]])]
		},
		{
			mesh: 'gracilis', layer: 2, baked: true,
			strands: [strand(['femur', [58.7, 358.3, 71]], ['femur', [52.8, 220, 36.7]], ['femur', [49.4, 120, 16.5]], ['femur', [46.8, 40, -1.6]], ['tibia', [36.7, -45.4, 7.4]], ['tibia', [13.7, -111.8, 15.9]])]
		},
		{
			mesh: 'semiten', layer: 2, baked: true,
			strands: [strand(['femur', [26.1, 333.6, -16.2]], ['femur', [27.6, 220, -19.8]], ['femur', [23.7, 120, -28.5]], ['femur', [29.1, 40, -32.2]], ['tibia', [26.7, -58.9, -5]])]
		}
	],
	// the bake keeps the layers apart
	contact: false,
	// hand-tuned keys, edited in the app's Tune panel (#debug) and saved to tuning.json
	tuning: tuning as Tuning
};
