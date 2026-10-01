import type { Pose } from '../../core/rig';
import type { MuscleInfo, Movement, Scenario } from '../types';

export const muscles: MuscleInfo[] = [
	// ---- quadriceps -----------------------------------------------------------------------
	{
		key: 'rectus_fem', name: 'Rectus femoris', shortName: 'rectus femoris', group: 'Quadriceps', color: '#c43c62',
		meshes: ['rectus_fem'], view: 'Front',
		origin: 'Anterior inferior iliac spine (straight head) and the ilium above the acetabulum (reflected head)',
		insertion: 'Patella via the quadriceps tendon, then the tibial tuberosity via the patellar ligament',
		action: 'Knee extension; hip flexion',
		actionLong: 'Extends the knee and flexes the hip; the only part of quadriceps crossing the hip',
		nerve: 'Femoral (L2–L4)',
		note: 'A two-joint muscle: it extends the knee most strongly with the hip extended (kicking). Here its top rides the femur: the hip is not in this model.'
	},
	{
		key: 'vastus_lat', name: 'Vastus lateralis', shortName: 'vastus lateralis', group: 'Quadriceps', color: '#d9732b',
		meshes: ['vastus_lat'], view: 'Side',
		origin: 'Greater trochanter, upper intertrochanteric line, gluteal tuberosity, and lateral lip of the linea aspera',
		insertion: 'Lateral border of the patella and the quadriceps tendon, then the tibial tuberosity',
		action: 'Knee extension',
		actionLong: 'Knee extension; the largest part of quadriceps',
		nerve: 'Femoral (L2–L4)',
		note: 'Its pull, with the iliotibial tract, draws the patella laterally; vastus medialis balances it.'
	},
	{
		key: 'vastus_med', name: 'Vastus medialis', shortName: 'vastus medialis', group: 'Quadriceps', color: '#e0a019',
		meshes: ['vastus_med'], view: 'Front',
		origin: 'Lower intertrochanteric line, spiral line, medial lip of the linea aspera, and medial supracondylar line',
		insertion: 'Medial border of the patella and the quadriceps tendon, then the tibial tuberosity',
		action: 'Knee extension',
		actionLong: 'Knee extension; its lowest, most oblique fibres (VMO) pull the patella medially',
		nerve: 'Femoral (L2–L4)',
		note: 'The oblique fibres resist the patella’s pull to the lateral side; weak or late VMO is linked to patellofemoral pain. Its teardrop bulge sits just above the medial knee.'
	},
	{
		key: 'vastus_int', name: 'Vastus intermedius', shortName: 'vastus intermedius', group: 'Quadriceps', color: '#b8577f',
		meshes: ['vastus_int'], view: 'Front',
		origin: 'Anterior and lateral surfaces of the femoral shaft (upper two-thirds)',
		insertion: 'Deep surface of the quadriceps tendon to the patella, then the tibial tuberosity',
		action: 'Knee extension',
		actionLong: 'Knee extension',
		nerve: 'Femoral (L2–L4)',
		note: 'Deepest of the quadriceps, under rectus femoris. Some of its deep fibres (articularis genus) lift the suprapatellar bursa out of the way as the knee extends.'
	},
	{
		key: 'patellar_lig', name: 'Quadriceps tendon & patellar ligament', shortName: 'patellar ligament', group: 'Quadriceps', color: '#8fc8ec',
		meshes: ['patellar_lig'], view: 'Front', tissue: true, follows: ['rectus_fem', 'vastus_lat', 'vastus_med', 'vastus_int'],
		origin: 'The quadriceps tendon and the vasti’s aponeuroses (the medial and lateral patellar retinacula), above and beside the patella',
		insertion: 'Tibial tuberosity (the patellar ligament, from the apex of the patella)',
		action: 'Carries the quadriceps’ pull to the tibia',
		actionLong: 'Carries the quadriceps’ pull over the patella to the tibial tuberosity',
		nerve: '— (tendon, not muscle)',
		note: 'The patella is a sesamoid bone in the quadriceps tendon: it lifts the tendon off the femur, lengthening its lever arm, and the patellar ligament is the tendon’s continuation to the tibia. Tapping the ligament stretches the quadriceps: the patellar (knee-jerk) reflex, L3–L4.'
	},
	// ---- hamstrings -----------------------------------------------------------------------
	{
		key: 'biceps_fem', name: 'Biceps femoris', shortName: 'biceps femoris', group: 'Hamstrings', color: '#7a3b8f',
		meshes: ['biceps_fem', 'biceps_fem_sh'], heads: { biceps_fem: 'Long head', biceps_fem_sh: 'Short head' }, view: 'Back',
		origin: 'Long head: ischial tuberosity. Short head: lateral lip of the linea aspera and lateral supracondylar line',
		insertion: 'Head of the fibula',
		action: 'Knee flexion + external rotation',
		actionLong: 'Flexes the knee and externally rotates the flexed knee; the long head also extends the hip',
		nerve: 'Long head: tibial division of sciatic. Short head: common fibular division (L5–S2)',
		note: 'The lateral hamstring, and the knee’s main external rotator. The short head is the only hamstring part not crossing the hip. Here the long head’s top rides the femur: the hip is not in this model.'
	},
	{
		key: 'semiten', name: 'Semitendinosus', shortName: 'semitendinosus', group: 'Hamstrings', color: '#a35bb8',
		meshes: ['semiten'], view: 'Back',
		origin: 'Ischial tuberosity (with the long head of biceps femoris)',
		insertion: 'Upper medial tibia (pes anserinus)',
		action: 'Knee flexion + internal rotation',
		actionLong: 'Flexes the knee and internally rotates the flexed knee; extends the hip',
		nerve: 'Tibial division of sciatic (L5–S2)',
		note: 'Its long cord-like tendon is a common graft for cruciate ligament repair. Pes anserinus: Sartorius, Gracilis, semiTendinosus ("SGT").'
	},
	{
		key: 'semimem', name: 'Semimembranosus', shortName: 'semimembranosus', group: 'Hamstrings', color: '#5d3480',
		meshes: ['semimem'], view: 'Back',
		origin: 'Ischial tuberosity (upper lateral facet)',
		insertion: 'Posterior medial condyle of the tibia; expansions to the oblique popliteal ligament and medial meniscus',
		action: 'Knee flexion + internal rotation',
		actionLong: 'Flexes the knee and internally rotates the flexed knee; extends the hip; pulls the medial meniscus back as the knee bends',
		nerve: 'Tibial division of sciatic (L5–S2)',
		note: 'Deep to semitendinosus. Its expansion reinforces the back of the knee capsule (oblique popliteal ligament).'
	},
	// ---- medial and lateral thigh ---------------------------------------------------------
	{
		key: 'sartorius', name: 'Sartorius', shortName: 'sartorius', group: 'Medial thigh', color: '#2f9e8f',
		meshes: ['sartorius'], view: 'Front',
		origin: 'Anterior superior iliac spine',
		insertion: 'Upper medial tibia (pes anserinus)',
		action: 'Knee flexion + internal rotation',
		actionLong: 'Flexes the knee and internally rotates the flexed knee; at the hip it flexes, abducts, and externally rotates',
		nerve: 'Femoral (L2–L3)',
		note: 'It passes behind the knee’s flexion axis, curving round the medial condyle to the tibia. Here its top rides the femur: the hip is not in this model.'
	},
	{
		key: 'gracilis', name: 'Gracilis', shortName: 'gracilis', group: 'Medial thigh', color: '#3f88d4',
		meshes: ['gracilis'], view: 'Front',
		origin: 'Body and inferior ramus of the pubis',
		insertion: 'Upper medial tibia (pes anserinus)',
		action: 'Knee flexion + internal rotation',
		actionLong: 'Flexes the knee and internally rotates the flexed knee; adducts the hip',
		nerve: 'Obturator (L2–L3)',
		note: 'The only adductor crossing the knee. Here its top rides the femur: the hip is not in this model.'
	},
	{
		key: 'it_tract', name: 'Iliotibial tract', shortName: 'iliotibial tract', group: 'Lateral thigh', color: '#c66b9e',
		meshes: ['it_tract'], view: 'Side',
		origin: 'Iliac crest, through tensor fasciae latae and gluteus maximus',
		insertion: 'Lateral condyle of the tibia (Gerdy’s tubercle)',
		action: 'Stabilizes the lateral knee',
		actionLong: 'Steadies the lateral knee: in front of the flexion axis it helps hold extension; past about 30° of flexion it slides behind the axis',
		nerve: 'Through tensor fasciae latae (superior gluteal) and gluteus maximus (inferior gluteal)',
		note: 'A thickening of the fascia lata, not a muscle. It rubs over the lateral femoral epicondyle near 30° of flexion: iliotibial band friction syndrome in runners.'
	},
	// ---- calf ------------------------------------------------------------------------------
	{
		key: 'gastroc', name: 'Gastrocnemius', shortName: 'gastrocnemius', group: 'Calf', color: '#c9463d',
		meshes: ['gastroc_med', 'gastroc_lat'], heads: { gastroc_med: 'Medial head', gastroc_lat: 'Lateral head' }, view: 'Back',
		origin: 'Medial head: above the medial femoral condyle. Lateral head: lateral surface of the lateral femoral condyle',
		insertion: 'Calcaneus, through the calcaneal (Achilles) tendon',
		action: 'Knee flexion; ankle plantarflexion',
		actionLong: 'Plantarflexes the ankle and flexes the knee',
		nerve: 'Tibial (S1–S2)',
		note: 'A two-joint muscle: with the knee bent it is slack, so soleus does most of the plantarflexion. Here its lower end rides the tibia: the ankle is not in this model.'
	},
	{
		key: 'plantaris', name: 'Plantaris', shortName: 'plantaris', group: 'Calf', color: '#e57a64',
		meshes: ['plantaris'], view: 'Back',
		origin: 'Lateral supracondylar line of the femur, above the lateral head of gastrocnemius',
		insertion: 'Calcaneus, beside the calcaneal tendon',
		action: 'Weak knee flexion; ankle plantarflexion',
		actionLong: 'Assists gastrocnemius weakly in flexing the knee and plantarflexing the ankle',
		nerve: 'Tibial (S1–S2)',
		note: 'A small belly with the longest tendon in the body; absent in some people, and a convenient tendon graft.'
	},
	// ---- popliteal -------------------------------------------------------------------------
	{
		key: 'popliteus', name: 'Popliteus', shortName: 'popliteus', group: 'Popliteal', color: '#3a8f4b',
		meshes: ['popliteus'], view: 'Back',
		origin: 'Lateral femoral condyle (popliteal groove) and the lateral meniscus',
		insertion: 'Posterior tibia, above the soleal line',
		action: 'Unlocks the knee: tibial internal rotation',
		actionLong: 'Unlocks the extended knee by internally rotating the tibia (or externally rotating the femur on a fixed tibia); flexes the knee; pulls the lateral meniscus back',
		nerve: 'Tibial (L4–S1)',
		note: 'The key to the screw-home mechanism: at full extension the tibia is locked in external rotation, and popliteus starts flexion by turning it back.'
	}
];

// Demos set both knee angles up front so they play the same from any pose.
const at = (p: Pose): Pose => ({ flexion: 0, rotation: 0, ...p });

export const movements: Movement[] = [
	{
		id: 'flexion', label: 'Flexion', range: '0° → 70°', from: at({}), to: { flexion: 70 },
		prime: ['biceps_fem', 'semiten', 'semimem'], assist: ['gastroc', 'sartorius', 'gracilis', 'popliteus', 'plantaris'],
		note: 'Watch the tibia turn inward over the first 20°: the knee unlocking (popliteus).'
	},
	{
		id: 'extension', label: 'Extension', range: '70° → 0°', from: at({ flexion: 70 }), to: { flexion: 0 },
		prime: ['rectus_fem', 'vastus_lat', 'vastus_med', 'vastus_int'], assist: ['it_tract'],
		note: 'In the last 20° the tibia turns outward and locks the knee: the screw-home mechanism.'
	},
	{
		id: 'internalRotation', label: 'Internal rotation', range: 'at 70°: ER 30° → IR 25°', from: at({ flexion: 70, rotation: -30 }), to: { rotation: 25 },
		prime: ['semiten', 'semimem', 'popliteus'], assist: ['sartorius', 'gracilis'],
		note: 'Tibial rotation needs the knee bent: in full extension the ligaments lock it.'
	},
	{
		id: 'externalRotation', label: 'External rotation', range: 'at 70°: IR 25° → ER 30°', from: at({ flexion: 70, rotation: 25 }), to: { rotation: -30 },
		prime: ['biceps_fem'], assist: ['it_tract'],
		note: 'Biceps femoris is the only external rotator of the flexed knee.'
	}
];

export const scenarios: Scenario[] = [
	{ q: 'Which nerve supplies all four parts of quadriceps?', a: 'Femoral', distractors: ['Obturator', 'Sciatic', 'Superior gluteal'], focus: ['rectus_fem', 'vastus_lat', 'vastus_med', 'vastus_int'], why: 'The femoral nerve (L2–L4); the patellar reflex tests L3–L4.' },
	{ q: 'Which part of the hamstrings does not cross the hip?', a: 'Short head of biceps femoris', distractors: ['Long head of biceps femoris', 'Semimembranosus', 'Semitendinosus'], parts: ['biceps_fem_sh'], why: 'It arises from the femur, and is supplied by the common fibular division of the sciatic nerve, not the tibial.' },
	{ q: 'Which muscle unlocks the fully extended knee?', a: 'Popliteus', distractors: ['Plantaris', 'Gastrocnemius', 'Biceps femoris'], focus: ['popliteus'], why: 'It internally rotates the tibia (or externally rotates the femur) to undo the screw-home lock.' },
	{ q: 'In the last 20° of knee extension (foot free), the tibia…', a: 'Rotates externally', distractors: ['Rotates internally', 'Does not rotate', 'Glides medially'], focus: ['popliteus'], why: 'The screw-home mechanism: the medial condyle is longer, so the tibia turns outward and locks the knee. Watch it with the flexion slider near 0°.' },
	{ q: 'Pes anserinus is formed by the tendons of sartorius, gracilis, and…', a: 'Semitendinosus', distractors: ['Semimembranosus', 'Biceps femoris', 'Popliteus'], focus: ['sartorius', 'gracilis', 'semiten'], why: '"SGT", on the upper medial tibia; all three flex the knee and rotate it internally.' },
	{ q: 'Which muscle externally rotates the flexed knee?', a: 'Biceps femoris', distractors: ['Semitendinosus', 'Popliteus', 'Sartorius'], focus: ['biceps_fem'], why: 'It inserts on the fibular head, lateral to the rotation axis; the medial hamstrings rotate internally.' },
	{ q: 'The oblique fibres of which muscle resist lateral tracking of the patella?', a: 'Vastus medialis', distractors: ['Vastus lateralis', 'Vastus intermedius', 'Rectus femoris'], focus: ['vastus_med'], why: 'Vastus medialis obliquus (VMO) pulls the patella medially against vastus lateralis and the iliotibial tract.' },
	{ q: 'With the knee bent, which calf muscle does most of the plantarflexion?', a: 'Soleus', distractors: ['Gastrocnemius', 'Plantaris', 'Popliteus'], focus: ['gastroc'], why: 'Gastrocnemius crosses the knee and goes slack when it bends (active insufficiency); soleus does not cross the knee. (Soleus is not in this model.)' },
	{ q: 'Iliotibial band friction syndrome occurs where the band rubs over which bony landmark?', a: 'Lateral femoral epicondyle', distractors: ['Fibular head', 'Greater trochanter', 'Lateral tibial condyle'], focus: ['it_tract'], why: 'Near 30° of flexion the band slides across the lateral epicondyle from in front of the flexion axis to behind it.' },
	{ q: 'Tibial rotation is possible when the knee is…', a: 'Flexed', distractors: ['Fully extended', 'Hyperextended', 'At any angle'], showAxes: true, why: 'In extension the collateral and cruciate ligaments are taut and lock it. Try the rotation slider at 0° and at 70° of flexion.' },
	{ q: 'Knee flexion and extension occur around which axis?', a: 'A mediolateral axis through the femoral epicondyles', distractors: ['The tibia’s long axis', 'An anteroposterior axis through the joint', 'An axis through the patella'], showAxes: true, why: 'The transepicondylar axis approximates it; in life the axis shifts back as the condyles roll and glide.' }
];
