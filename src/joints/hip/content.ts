import type { Pose } from '../../core/rig';
import type { MuscleInfo, Movement, Scenario } from '../types';

export const muscles: MuscleInfo[] = [
	// ---- gluteal ---------------------------------------------------------------------------
	{
		key: 'glut_max', name: 'Gluteus maximus', shortName: 'gluteus maximus', group: 'Gluteal', color: '#b8473d',
		meshes: ['glut_max'], view: 'Back',
		origin: 'Posterior ilium behind the posterior gluteal line, posterior sacrum and coccyx, sacrotuberous ligament',
		insertion: 'Iliotibial tract (most fibres) and gluteal tuberosity of femur',
		action: 'Hip extension + external rotation',
		actionLong: 'Hip extension and external rotation; upper fibres abduct, lower fibres adduct; through the iliotibial tract steadies the extended knee',
		nerve: 'Inferior gluteal (L5–S2)',
		note: 'Little used in quiet walking on the level; it works hard rising from a chair, climbing stairs, and running uphill. When it is weak the trunk lurches backward at heel strike to keep the hip extended.'
	},
	{
		key: 'glut_med', name: 'Gluteus medius', shortName: 'gluteus medius', group: 'Gluteal', color: '#e0892c',
		meshes: ['glut_med'], view: 'Side',
		origin: 'Outer surface of the ilium between the anterior and posterior gluteal lines',
		insertion: 'Lateral surface of the greater trochanter',
		action: 'Hip abduction',
		actionLong: 'Hip abduction, the prime mover with gluteus minimus; anterior fibres internally rotate and flex, posterior fibres externally rotate; holds the pelvis level in single-leg stance',
		nerve: 'Superior gluteal (L4–S1)',
		note: 'Trendelenburg sign: standing on the weak side, the pelvis drops on the other side. In walking the trunk leans over the weak hip to compensate.'
	},
	{
		key: 'glut_min', name: 'Gluteus minimus', shortName: 'gluteus minimus', group: 'Gluteal', color: '#d6b13a',
		meshes: ['glut_min'], view: 'Side',
		origin: 'Outer surface of the ilium between the anterior and inferior gluteal lines',
		insertion: 'Anterior surface of the greater trochanter',
		action: 'Hip abduction + internal rotation',
		actionLong: 'Hip abduction and internal rotation; steadies the pelvis with gluteus medius',
		nerve: 'Superior gluteal (L4–S1)',
		note: 'Deep to gluteus medius and fan-shaped like it. Its tendon shares the trochanteric bursae, a common site of lateral hip pain.'
	},
	{
		key: 'tfl', name: 'Tensor fasciae latae', shortName: 'tensor fasciae latae', group: 'Gluteal', color: '#c66b9e',
		meshes: ['tfl', 'it_tract'], heads: { tfl: 'Muscle', it_tract: 'Iliotibial tract' }, view: 'Side',
		origin: 'Anterior superior iliac spine and the outer lip of the anterior iliac crest',
		insertion: 'Iliotibial tract, which continues to the lateral condyle of the tibia (Gerdy’s tubercle)',
		action: 'Hip flexion, abduction + internal rotation',
		actionLong: 'Hip flexion, abduction, and internal rotation; tenses the iliotibial tract, steadying the extended knee',
		nerve: 'Superior gluteal (L4–S1)',
		note: 'The iliotibial tract is a thickening of the fascia lata that both TFL and gluteus maximus pull on. Here it ends on the femur: the knee is not in this model.'
	},
	// ---- deep lateral rotators ------------------------------------------------------------
	{
		key: 'piriformis', name: 'Piriformis', shortName: 'piriformis', group: 'Deep lateral rotators', color: '#3a8f4b',
		meshes: ['piriformis'], view: 'Back',
		origin: 'Anterior surface of the sacrum (S2–S4)',
		insertion: 'Upper border of the greater trochanter',
		action: 'Hip external rotation',
		actionLong: 'External rotation with the hip extended; abducts the flexed hip (and in deep flexion its rotation reverses toward internal)',
		nerve: 'Nerve to piriformis (S1–S2)',
		note: 'The landmark of the gluteal region: the sciatic nerve leaves the pelvis just below it (sometimes through it), so a tight piriformis can irritate the nerve.'
	},
	{
		key: 'gem_sup', name: 'Gemellus superior', shortName: 'gemellus superior', group: 'Deep lateral rotators', color: '#5aa36a',
		meshes: ['gem_sup'], view: 'Back',
		origin: 'Ischial spine',
		insertion: 'Medial surface of the greater trochanter, with the obturator internus tendon',
		action: 'Hip external rotation',
		actionLong: 'External rotation; abducts the flexed hip',
		nerve: 'Nerve to obturator internus (L5–S2)',
		note: 'The two gemelli flank the obturator internus tendon and blend with it, acting as one muscle.'
	},
	{
		key: 'obt_int', name: 'Obturator internus', shortName: 'obturator internus', group: 'Deep lateral rotators', color: '#2a9bb0',
		meshes: ['obt_int'], view: 'Back',
		origin: 'Inner surface of the obturator membrane and the bone around it',
		insertion: 'Medial surface of the greater trochanter',
		action: 'Hip external rotation',
		actionLong: 'External rotation; abducts the flexed hip',
		nerve: 'Nerve to obturator internus (L5–S2)',
		note: 'Arises inside the pelvis; its tendon leaves through the lesser sciatic foramen, turning almost a right angle round the ischium, which acts as its pulley. Hide the pelvis to see it.'
	},
	{
		key: 'gem_inf', name: 'Gemellus inferior', shortName: 'gemellus inferior', group: 'Deep lateral rotators', color: '#6fbad0',
		meshes: ['gem_inf'], view: 'Back',
		origin: 'Upper part of the ischial tuberosity',
		insertion: 'Medial surface of the greater trochanter, with the obturator internus tendon',
		action: 'Hip external rotation',
		actionLong: 'External rotation; abducts the flexed hip',
		nerve: 'Nerve to quadratus femoris (L4–S1)',
		note: 'Supplied with quadratus femoris, not with its partner gemellus superior.'
	},
	{
		key: 'quad_fem', name: 'Quadratus femoris', shortName: 'quadratus femoris', group: 'Deep lateral rotators', color: '#8fbf4d',
		meshes: ['quad_fem'], view: 'Back',
		origin: 'Lateral border of the ischial tuberosity',
		insertion: 'Quadrate tubercle on the intertrochanteric crest',
		action: 'Hip external rotation',
		actionLong: 'External rotation; steadies the femoral head in the acetabulum',
		nerve: 'Nerve to quadratus femoris (L4–S1)',
		note: 'A thick, square muscle; the medial circumflex femoral artery runs near its upper border, a landmark in posterior hip approaches.'
	},
	{
		key: 'obt_ext', name: 'Obturator externus', shortName: 'obturator externus', group: 'Deep lateral rotators', color: '#4f7d8f',
		meshes: ['obt_ext'], view: 'Front',
		origin: 'Outer surface of the obturator membrane and the bone around it',
		insertion: 'Trochanteric fossa of femur',
		action: 'Hip external rotation',
		actionLong: 'External rotation; steadies the femoral head',
		nerve: 'Obturator (L3–L4)',
		note: 'Counted with the deep rotators but supplied by the obturator nerve, like the adductors. Its tendon runs under the femoral neck.'
	},
	// ---- iliopsoas ------------------------------------------------------------------------
	{
		key: 'iliacus', name: 'Iliacus', shortName: 'iliacus', group: 'Iliopsoas', color: '#7c5cc4',
		meshes: ['iliacus'], view: 'Front',
		origin: 'Iliac fossa, inner lip of the iliac crest, and ala of the sacrum',
		insertion: 'Lesser trochanter (with psoas major), and the shaft just below it',
		action: 'Hip flexion',
		actionLong: 'Hip flexion, the prime mover with psoas major; with the thigh fixed it tilts the pelvis forward',
		nerve: 'Femoral (L2–L3)',
		note: 'Fills the inside of the iliac wing. Its tendon joins psoas major and bends over the pelvic brim in front of the hip joint.'
	},
	{
		key: 'psoas', name: 'Psoas major', shortName: 'psoas major', group: 'Iliopsoas', color: '#9a7ad6',
		meshes: ['psoas'], view: 'Front',
		origin: 'Bodies and transverse processes of T12–L5 and the intervertebral discs between them',
		insertion: 'Lesser trochanter',
		action: 'Hip flexion',
		actionLong: 'Hip flexion; with the thigh fixed it flexes the trunk (sit-ups) and bends the lumbar spine to its side',
		nerve: 'Anterior rami of L1–L3',
		note: 'The only muscle joining the spine to the leg. A tight psoas pulls the lumbar spine into lordosis; the Thomas test looks for it.'
	},
	// ---- adductors ------------------------------------------------------------------------
	{
		key: 'pectineus', name: 'Pectineus', shortName: 'pectineus', group: 'Adductors', color: '#2f6fb3',
		meshes: ['pectineus'], view: 'Front',
		origin: 'Pecten (pectineal line) of the pubis',
		insertion: 'Pectineal line of the femur, below the lesser trochanter',
		action: 'Hip adduction + flexion',
		actionLong: 'Hip adduction and flexion',
		nerve: 'Femoral (L2–L3); sometimes also obturator',
		note: 'The most anterior adductor; with iliopsoas it forms the floor of the femoral triangle.'
	},
	{
		key: 'add_longus', name: 'Adductor longus', shortName: 'adductor longus', group: 'Adductors', color: '#3f88d4',
		meshes: ['add_longus'], view: 'Front',
		origin: 'Body of the pubis, below the pubic crest',
		insertion: 'Middle third of the linea aspera',
		action: 'Hip adduction',
		actionLong: 'Hip adduction; helps flex the hip from extension',
		nerve: 'Obturator (L2–L4)',
		note: 'The adductor most often strained ("groin pull"). Its medial border is the medial side of the femoral triangle.'
	},
	{
		key: 'add_brevis', name: 'Adductor brevis', shortName: 'adductor brevis', group: 'Adductors', color: '#5aa0e0',
		meshes: ['add_brevis'], view: 'Front',
		origin: 'Body and inferior ramus of the pubis',
		insertion: 'Pectineal line and upper linea aspera',
		action: 'Hip adduction',
		actionLong: 'Hip adduction; helps flex the hip',
		nerve: 'Obturator (L2–L4)',
		note: 'Lies between adductor longus in front and adductor magnus behind; the anterior and posterior divisions of the obturator nerve pass on either side of it.'
	},
	{
		key: 'add_magnus', name: 'Adductor magnus', shortName: 'adductor magnus', group: 'Adductors', color: '#1e4f8a',
		meshes: ['add_magnus', 'add_minimus'], heads: { add_magnus: 'Main part', add_minimus: 'Adductor minimus' }, view: 'Back',
		origin: 'Inferior pubic ramus, ischial ramus, and ischial tuberosity',
		insertion: 'Gluteal tuberosity, linea aspera, medial supracondylar line, and the adductor tubercle',
		action: 'Hip adduction (+ extension)',
		actionLong: 'Hip adduction; its adductor part helps flex, its hamstring part (from the ischial tuberosity to the adductor tubercle) extends',
		nerve: 'Obturator (adductor part) and tibial division of sciatic (hamstring part), L2–L4',
		note: 'The largest adductor, with two nerve supplies. Adductor minimus is its upper, horizontal part. The femoral vessels pass through the adductor hiatus in its tendon.'
	},
	{
		key: 'gracilis', name: 'Gracilis', shortName: 'gracilis', group: 'Adductors', color: '#2fa7a0',
		meshes: ['gracilis'], view: 'Front',
		origin: 'Body and inferior ramus of the pubis',
		insertion: 'Upper medial tibia (pes anserinus)',
		action: 'Hip adduction; knee flexion',
		actionLong: 'Hip adduction; flexes the knee and internally rotates the flexed knee',
		nerve: 'Obturator (L2–L3)',
		note: 'The most superficial and medial adductor, and the only one crossing the knee. A common donor muscle for grafts. Here it ends on the femur: the knee is not in this model.'
	},
	// ---- anterior thigh -------------------------------------------------------------------
	{
		key: 'sartorius', name: 'Sartorius', shortName: 'sartorius', group: 'Anterior thigh', color: '#d9732b',
		meshes: ['sartorius'], view: 'Front',
		origin: 'Anterior superior iliac spine',
		insertion: 'Upper medial tibia (pes anserinus)',
		action: 'Hip flexion, abduction + external rotation',
		actionLong: 'Hip flexion, abduction, and external rotation (crossing the legs, "tailor’s position"); flexes the knee',
		nerve: 'Femoral (L2–L3)',
		note: 'The longest muscle in the body. Its medial border is the lateral side of the femoral triangle. Pes anserinus: Sartorius, Gracilis, semiTendinosus ("SGT").'
	},
	{
		key: 'rectus_fem', name: 'Rectus femoris', shortName: 'rectus femoris', group: 'Anterior thigh', color: '#c43c62',
		meshes: ['rectus_fem'], view: 'Front',
		origin: 'Anterior inferior iliac spine (straight head) and the ilium above the acetabulum (reflected head)',
		insertion: 'Patella via the quadriceps tendon, then the tibial tuberosity',
		action: 'Hip flexion; knee extension',
		actionLong: 'Flexes the hip and extends the knee; the only part of quadriceps crossing the hip',
		nerve: 'Femoral (L2–L4)',
		note: 'A two-joint muscle: strongest at the hip with the knee bent, at the knee with the hip extended (kicking). Here it ends on the femur: the knee is not in this model.'
	},
	// ---- hamstrings -----------------------------------------------------------------------
	{
		key: 'biceps_fem', name: 'Biceps femoris (long head)', shortName: 'biceps femoris', group: 'Hamstrings', color: '#7a3b8f',
		meshes: ['biceps_fem'], view: 'Back',
		origin: 'Ischial tuberosity (with semitendinosus)',
		insertion: 'Head of the fibula',
		action: 'Hip extension; knee flexion',
		actionLong: 'Extends the hip; flexes the knee and externally rotates the flexed knee',
		nerve: 'Tibial division of sciatic (L5–S2)',
		note: 'The lateral hamstring. Its short head (not shown) crosses only the knee and is supplied by the common fibular division instead. Here it ends on the femur: the knee is not in this model.'
	},
	{
		key: 'semiten', name: 'Semitendinosus', shortName: 'semitendinosus', group: 'Hamstrings', color: '#a35bb8',
		meshes: ['semiten'], view: 'Back',
		origin: 'Ischial tuberosity (with biceps femoris)',
		insertion: 'Upper medial tibia (pes anserinus)',
		action: 'Hip extension; knee flexion',
		actionLong: 'Extends the hip; flexes the knee and internally rotates the flexed knee',
		nerve: 'Tibial division of sciatic (L5–S2)',
		note: 'Named for its long cord-like tendon, a common graft for cruciate ligament repair. Here it ends on the femur: the knee is not in this model.'
	},
	{
		key: 'semimem', name: 'Semimembranosus', shortName: 'semimembranosus', group: 'Hamstrings', color: '#5d3480',
		meshes: ['semimem'], view: 'Back',
		origin: 'Ischial tuberosity (upper lateral facet)',
		insertion: 'Posterior medial condyle of the tibia',
		action: 'Hip extension; knee flexion',
		actionLong: 'Extends the hip; flexes the knee and internally rotates the flexed knee',
		nerve: 'Tibial division of sciatic (L5–S2)',
		note: 'Deep to semitendinosus, with a flat membranous origin. The hamstrings limit hip flexion with the knee straight (straight-leg raise). Here it ends on the femur: the knee is not in this model.'
	}
];

// Demos set every hip angle up front so they play the same from any pose.
const at = (p: Pose): Pose => ({ flexion: 0, abduction: 0, rotation: 0, ...p });

export const movements: Movement[] = [
	{
		id: 'flexion', label: 'Flexion', range: '0° → 120°', from: at({}), to: { flexion: 120 },
		prime: ['iliacus', 'psoas'], assist: ['rectus_fem', 'sartorius', 'tfl', 'pectineus', 'add_longus'],
		note: 'With the knee straight the hamstrings stop hip flexion near 90°; the model has no knee, so they don’t here.'
	},
	{
		id: 'extension', label: 'Extension', range: 'flex 90° → ext 20°', from: at({ flexion: 90 }), to: { flexion: -20 },
		prime: ['glut_max', 'biceps_fem', 'semiten', 'semimem'], assist: ['add_magnus'],
		note: 'Past about 20° the lumbar spine extends instead (the pelvis tips forward).'
	},
	{
		id: 'abduction', label: 'Abduction', range: '0° → 45°', from: at({}), to: { abduction: 45 },
		prime: ['glut_med', 'glut_min'], assist: ['tfl', 'sartorius', 'glut_max', 'piriformis'],
		note: 'The same muscles hold the pelvis level when standing on one leg.'
	},
	{
		id: 'adduction', label: 'Adduction', range: '45° → add 20°', from: at({ abduction: 45 }), to: { abduction: -20 },
		prime: ['add_longus', 'add_brevis', 'add_magnus'], assist: ['gracilis', 'pectineus'],
		note: 'Against resistance; unresisted, gravity brings the leg in while the abductors lengthen.'
	},
	{
		id: 'internalRotation', label: 'Internal rotation', range: 'ER 45° → IR 40°', from: at({ rotation: -45 }), to: { rotation: 40 },
		prime: ['glut_min', 'tfl'], assist: ['glut_med', 'semiten', 'semimem'],
		note: 'The anterior fibres of gluteus medius and minimus. Hip internal rotators are weak compared with the external rotators.'
	},
	{
		id: 'externalRotation', label: 'External rotation', range: 'IR 40° → ER 45°', from: at({ rotation: 40 }), to: { rotation: -45 },
		prime: ['piriformis', 'obt_int', 'gem_sup', 'gem_inf', 'quad_fem', 'obt_ext'], assist: ['glut_max', 'sartorius', 'biceps_fem'],
		note: 'The six deep lateral rotators, with gluteus maximus the strongest of all.'
	}
];

export const scenarios: Scenario[] = [
	{ q: 'Standing on the right leg, the left side of the pelvis drops. Which muscle is weak?', a: 'Right gluteus medius', distractors: ['Left gluteus medius', 'Right gluteus maximus', 'Right adductor longus'], focus: ['glut_med'], why: 'Positive Trendelenburg sign: the stance-side abductors (gluteus medius and minimus) hold the pelvis level.' },
	{ q: 'Which nerve supplies gluteus medius, gluteus minimus, and tensor fasciae latae?', a: 'Superior gluteal', distractors: ['Inferior gluteal', 'Femoral', 'Obturator'], focus: ['glut_med', 'glut_min', 'tfl'], why: 'The inferior gluteal nerve supplies only gluteus maximus.' },
	{ q: 'The sciatic nerve usually leaves the pelvis just below which muscle?', a: 'Piriformis', distractors: ['Gemellus superior', 'Obturator internus', 'Quadratus femoris'], focus: ['piriformis'], why: 'Piriformis is the key landmark of the gluteal region; a tight piriformis can irritate the nerve.' },
	{ q: 'Which deep rotator is supplied by the obturator nerve?', a: 'Obturator externus', distractors: ['Obturator internus', 'Piriformis', 'Quadratus femoris'], focus: ['obt_ext'], why: 'Despite the shared name, obturator internus gets its own nerve (to obturator internus, L5–S2).' },
	{ q: 'Which muscles insert together on the lesser trochanter?', a: 'Psoas major and iliacus', distractors: ['Pectineus and adductor brevis', 'Obturator externus and quadratus femoris', 'Gluteus minimus and piriformis'], focus: ['psoas', 'iliacus'], why: 'Together they are iliopsoas, the prime hip flexor.' },
	{ q: 'Which muscle both flexes the hip and extends the knee?', a: 'Rectus femoris', distractors: ['Sartorius', 'Vastus lateralis', 'Tensor fasciae latae'], focus: ['rectus_fem'], why: 'The only part of quadriceps arising from the pelvis.' },
	{ q: 'Pes anserinus is formed by the tendons of sartorius, gracilis, and…', a: 'Semitendinosus', distractors: ['Semimembranosus', 'Biceps femoris', 'Adductor magnus'], focus: ['sartorius', 'gracilis', 'semiten'], why: '"SGT": Sartorius, Gracilis, semiTendinosus, on the upper medial tibia.' },
	{ q: 'Which muscle has two nerve supplies, the obturator and the tibial division of the sciatic?', a: 'Adductor magnus', distractors: ['Adductor longus', 'Pectineus', 'Gracilis'], focus: ['add_magnus'], why: 'Its adductor part is obturator-supplied; its hamstring part, from the ischial tuberosity, sciatic.' },
	{ q: 'Which muscle is the most powerful hip extender, used climbing stairs and rising from a chair?', a: 'Gluteus maximus', distractors: ['Biceps femoris', 'Adductor magnus', 'Gluteus medius'], focus: ['glut_max'], why: 'It does little in level walking but takes over when the hip extends against load.' },
	{ q: 'Which muscle flexes, abducts, and externally rotates the hip (the cross-legged “tailor’s” position)?', a: 'Sartorius', distractors: ['Tensor fasciae latae', 'Rectus femoris', 'Pectineus'], focus: ['sartorius'], why: 'It runs from the ASIS across the front of the thigh to the medial tibia.' },
	{ q: 'Hip abduction and adduction occur in which plane?', a: 'Frontal', distractors: ['Sagittal', 'Transverse', 'Oblique'], showAxes: true, why: 'Around an anteroposterior axis through the femoral head.' },
	{ q: 'Hip internal and external rotation occur around which axis?', a: 'The femur’s long axis, from the head to between the condyles', distractors: ['The femoral shaft', 'A mediolateral axis through the femoral head', 'An anteroposterior axis through the greater trochanter'], showAxes: true, why: 'Because the femoral neck angles away from the shaft, the axis runs from the head’s centre, not along the shaft. Turn on Joint axes to see it.' },
	{ q: 'Which nerve supplies all three hamstrings that cross the hip?', a: 'Tibial division of the sciatic', distractors: ['Common fibular division of the sciatic', 'Femoral', 'Inferior gluteal'], focus: ['biceps_fem', 'semiten', 'semimem'], why: 'Only the short head of biceps femoris, which does not cross the hip, gets the common fibular division.' }
];
