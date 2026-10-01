import type { JointPaths } from '../../core/muscle/schema';
import type { Tuning } from '../../core/muscle/tune';
import tuning from './tuning.json';

/**
 * Lines of action for the hip muscles (rest pose: anatomical position; x toward the subject's left, y up,
 * z anterior, mm; the femoral head's centre at the origin). Every muscle is baked (scripts/bake.ts): its
 * strands list only their fixed points, ends from the mesh's attachment footprints (`npm run route --
 * draft hip <mesh>`), via points only along fleshy attachments or at a real pulley.
 */
type P3 = [number, number, number];
const strand = (from: [string, P3], ...to: [string, P3][]) => [{ bone: from[0], p: from[1] }, ...to.map(([bone, p]) => ({ bone, p }))];

// Layers, deep to superficial: on the bone (gluteus minimus, the deep rotators, iliopsoas, adductor brevis and
// minimus); over them (gluteus medius, pectineus, adductors longus and magnus, semimembranosus, rectus femoris);
// outermost (gluteus maximus, tensor fasciae latae and the iliotibial tract, sartorius, gracilis, biceps femoris,
// semitendinosus). Muscles crossing the knee end on the femur near it (the knee isn't in this model).
export const hipPaths: JointPaths = {
	surfaces: {},
	muscles: [
		// ---- on the bone ----
		{
			mesh: 'glut_min', layer: 0, baked: true,
			// its fleshy origin covers the outer ilium between the anterior and inferior gluteal lines
			anchor: [20, 8],
			strands: [
				strand(['pelvis', [-30.8, 82.8, 17.4]], ['femur', [-56.4, -8.2, -5.7]]),
				strand(['pelvis', [-17.7, 73.6, -1.5]], ['femur', [-57.5, -12.3, -9.5]]),
				strand(['pelvis', [4.8, 64.4, -24.8]], ['femur', [-52, -8.6, -17.4]])
			]
		},
		{ mesh: 'piriformis', layer: 0, baked: true, strands: [strand(['pelvis', [45, 44.3, -51.1]], ['femur', [-41.3, -1.9, -15.1]])] },
		{ mesh: 'gem_sup', layer: 0, baked: true, strands: [strand(['pelvis', [31.1, 7.3, -42.1]], ['femur', [-32.8, -8.8, -8.6]])] },
		{
			mesh: 'obt_int', layer: 0, baked: true,
			// from inside the pelvis round the lesser sciatic notch (a pulley: its tendon turns about 90° there) to the
			// greater trochanter, between the gemelli
			strands: [strand(['femur', [-35.2, -9.5, -8.2]], ['pelvis', [26.8, -9.7, -36.7]], ['pelvis', [47, -13.7, 12.8]])]
		},
		{ mesh: 'gem_inf', layer: 0, baked: true, strands: [strand(['femur', [-37.5, -10.2, -7.8]], ['pelvis', [22.6, -21.8, -48.4]])] },
		{
			mesh: 'quad_fem', layer: 0, baked: true,
			strands: [
				strand(['femur', [-33.6, -30.1, -31.3]], ['pelvis', [16.4, -35.1, -24.6]]),
				strand(['femur', [-27.5, -49.9, -28.8]], ['pelvis', [22.4, -48.3, -28.1]])
			]
		},
		{ mesh: 'obt_ext', layer: 0, baked: true, strands: [strand(['femur', [-21.6, -20.6, -16.8]], ['pelvis', [45.9, -31.8, 4]])] },
		{
			mesh: 'iliacus', layer: 0, baked: true,
			// from across the iliac fossa
			anchor: [25, 8],
			strands: [
				strand(['pelvis', [-27.3, 88.4, 32.2]], ['femur', [-13, -81.9, -13.1]]),
				strand(['pelvis', [-10.6, 85.6, 8]], ['femur', [-10.4, -66.3, -6.5]]),
				strand(['pelvis', [6.5, 106.8, -18]], ['femur', [-2.6, -13.8, 17.3]])
			]
		},
		{ mesh: 'psoas', layer: 0, baked: true, strands: [strand(['pelvis', [56.8, 198, -3.4]], ['femur', [-12.8, -68.3, -18.2]])] },
		{
			mesh: 'add_brevis', layer: 0, baked: true, anchor: [8, 20],
			strands: [
				strand(['pelvis', [53, -20.2, 38.4]], ['femur', [-11.6, -116.1, 4]]),
				strand(['pelvis', [58.6, -23.9, 38.5]], ['femur', [-7.3, -156.5, 2.2]])
			]
		},
		{ mesh: 'add_minimus', layer: 0, baked: true, anchor: [8, 20], strands: [strand(['pelvis', [60.7, -35.1, 24.5]], ['femur', [-11.8, -109.4, -3]])] },
		// ---- over them ----
		{
			mesh: 'glut_med', layer: 1, baked: true,
			// its fleshy origin covers the outer ilium between the anterior and posterior gluteal lines
			anchor: [20, 8],
			strands: [
				strand(['pelvis', [-37.5, 108.3, 7.3]], ['femur', [-60.2, -25.2, -18]]),
				strand(['pelvis', [-5, 113.8, -25.6]], ['femur', [-55.4, -19.2, -23.1]]),
				strand(['pelvis', [16.7, 87.6, -50.4]], ['femur', [-44.7, -12.6, -29]])
			]
		},
		{ mesh: 'pectineus', layer: 1, baked: true, anchor: [8, 15], strands: [strand(['pelvis', [52.4, -9.8, 48.6]], ['femur', [-12.6, -103.4, 5.2]])] },
		{ mesh: 'add_longus', layer: 1, baked: true, anchor: [8, 30], strands: [strand(['pelvis', [63.9, -22, 50.2]], ['femur', [-1.4, -213.7, 7]])] },
		{
			mesh: 'add_magnus', layer: 1, baked: true,
			// its insertion runs the length of the linea aspera to the adductor tubercle
			anchor: [8, 30],
			strands: [
				strand(['pelvis', [45.5, -54.6, -14.3]], ['femur', [-7.5, -261.3, -12.3]]),
				strand(['pelvis', [51.2, -52.3, -4.3]], ['femur', [3.1, -299.4, -12]]),
				strand(['pelvis', [58.7, -45.6, 13.4]], ['femur', [36.6, -371.7, -19.8]])
			]
		},
		{ mesh: 'semimem', layer: 1, baked: true, strands: [strand(['pelvis', [37.7, -59, -30.3]], ['femur', [41.3, -394.3, -41.2]])] },
		{ mesh: 'rectus_fem', layer: 1, baked: true, strands: [strand(['pelvis', [-18.3, 38.6, 13.1]], ['femur', [1.8, -470.8, 5.9]])] },
		// ---- outermost ----
		{
			mesh: 'glut_max', layer: 2, baked: true,
			// from the posterior ilium, sacrum and coccyx; into the gluteal tuberosity and the iliotibial tract
			anchor: [15, 15],
			strands: [
				strand(['pelvis', [22.9, 95, -65.1]], ['femur', [-35.3, -87.7, -17.8]]),
				strand(['pelvis', [41, 69.5, -62.2]], ['femur', [-29.1, -99.6, -16.6]]),
				strand(['pelvis', [55.8, 21.7, -69.6]], ['femur', [-27, -111.6, -15.1]]),
				strand(['pelvis', [75.2, -17.7, -70.8]], ['femur', [-26.2, -138.4, -11]])
			]
		},
		{
			mesh: 'tfl', layer: 2, baked: true,
			// enclosed in the fascia lata and inserting into the iliotibial tract: a sheet of its middle (from the ASIS) and its
			// back edge, which runs on the same points as the tract's front strand, so the edge where they meet moves as one.
			// On its own line it rolled off the tract in internal rotation
			strands: [
				strand(['pelvis', [-38.3, 85.8, 40.5]], ['femur', [-56.3, -51.2, 29.2]]),
				strand(['pelvis', [-43.4, 99.3, 32.1]], ['femur', [-58.5, -57.2, 31.5]])
			]
		},
		{
			mesh: 'it_tract', layer: 2, baked: true,
			// held to the femur along its length by the lateral intermuscular septum (vastus lateralis, not modelled, lies
			// between): one taut strand from the iliac crest to the knee peeled off the thigh in abduction. A sheet of two
			// strands: its middle, over the greater trochanter and down the lateral thigh (centroids of the mesh); and its
			// front border (front-most vertices), down the back edge of tensor fasciae latae to where that muscle inserts
			// into it, then down the front of the thigh. Without the front strand the tract and TFL parted in rotation
			strands: [
				strand(['pelvis', [-44.5, 113.8, 12.8]], ['femur', [-60.1, -20.1, -16.6]], ['femur', [-57.4, -99.8, -4.1]],
					['femur', [-59.9, -249.3, -4]], ['femur', [-40, -349.6, -3.8]], ['femur', [-11.7, -448.8, 0.6]]),
				strand(['pelvis', [-43.4, 99.3, 32.1]], ['femur', [-58.5, -57.2, 31.5]], ['femur', [-64.3, -102.8, 30.6]],
					['femur', [-67.5, -247.9, 19.6]], ['femur', [-41.5, -349.3, 6.9]], ['femur', [-12.1, -430.4, 6.8]])
			]
		},
		{ mesh: 'sartorius', layer: 2, baked: true, strands: [strand(['pelvis', [-35, 73.6, 50.7]], ['femur', [16.8, -491.4, -5]])] },
		{ mesh: 'gracilis', layer: 2, baked: true, strands: [strand(['pelvis', [65.4, -36.8, 28.7]], ['femur', [21, -497.2, -12]])] },
		{ mesh: 'biceps_fem', layer: 2, baked: true, strands: [strand(['pelvis', [23.3, -44.7, -46.8]], ['femur', [-37.7, -446.7, -40.1]])] },
		{ mesh: 'semiten', layer: 2, baked: true, strands: [strand(['pelvis', [33.1, -52.9, -41.2]], ['femur', [21.9, -488.7, -18.1]])] }
	],
	// the bake keeps the layers apart; pushing strands apart at runtime as well only added jumps (as at the shoulder)
	contact: false,
	// hand-tuned keys, edited in the app's Tune panel (#debug) and saved to tuning.json
	tuning: tuning as Tuning
};
