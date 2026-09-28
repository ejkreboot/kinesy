import type { Pose } from '../../core/rig';
import type { MuscleInfo, Movement, Scenario } from '../types';
import { HAND_REST } from './rig';

export const muscles: MuscleInfo[] = [
	// ---- wrist flexors ---------------------------------------------------------------------
	{
		key: 'fcr', name: 'Flexor carpi radialis', shortName: 'flexor carpi radialis', group: 'Wrist flexors', color: '#c9463d',
		meshes: ['fcr'], view: 'Palm',
		origin: 'Medial epicondyle of humerus (common flexor origin)',
		insertion: 'Base of the 2nd (and 3rd) metacarpal',
		action: 'Wrist flexion + radial deviation',
		actionLong: 'Wrist flexion and radial deviation',
		nerve: 'Median (C6–C7)',
		note: 'Its tendon runs in its own groove on the trapezium, outside the carpal tunnel, and is the usual landmark for finding the radial pulse just lateral to it.'
	},
	{
		key: 'pl', name: 'Palmaris longus', shortName: 'palmaris longus', group: 'Wrist flexors', color: '#e0892c',
		meshes: ['pl'], view: 'Palm',
		origin: 'Medial epicondyle of humerus (common flexor origin)',
		insertion: 'Flexor retinaculum and palmar aponeurosis',
		action: 'Weak wrist flexion; tenses the palmar aponeurosis',
		actionLong: 'Weak wrist flexion; tenses the palmar aponeurosis, cupping the palm',
		nerve: 'Median (C7–C8)',
		note: 'Absent in roughly 15% of people, and a favourite tendon graft. It passes superficial to the flexor retinaculum.'
	},
	{
		key: 'fcu', name: 'Flexor carpi ulnaris', shortName: 'flexor carpi ulnaris', group: 'Wrist flexors', color: '#b8577f',
		meshes: ['fcu_hum', 'fcu_uln'], view: 'Palm',
		heads: { fcu_hum: 'Humeral head', fcu_uln: 'Ulnar head' },
		origin: 'Humeral head: medial epicondyle. Ulnar head: olecranon and posterior border of the ulna.',
		insertion: 'Pisiform, hook of hamate, base of the 5th metacarpal',
		action: 'Wrist flexion + ulnar deviation',
		actionLong: 'Wrist flexion and ulnar deviation; the strongest wrist flexor',
		nerve: 'Ulnar (C7–C8)',
		note: 'The ulnar nerve enters the forearm between its two heads (cubital tunnel). The pisiform is a sesamoid bone in its tendon.'
	},
	// ---- wrist extensors -------------------------------------------------------------------
	{
		key: 'ecrl', name: 'Extensor carpi radialis longus', shortName: 'extensor carpi radialis longus', group: 'Wrist extensors', color: '#3f6fce',
		meshes: ['ecrl'], view: 'Back',
		origin: 'Lateral supracondylar ridge of humerus',
		insertion: 'Dorsal base of the 2nd metacarpal',
		action: 'Wrist extension + radial deviation',
		actionLong: 'Wrist extension and radial deviation; weakly assists elbow flexion',
		nerve: 'Radial (C6–C7)',
		note: 'Holds the wrist extended during a power grip, so the finger flexors keep their length.'
	},
	{
		key: 'ecrb', name: 'Extensor carpi radialis brevis', shortName: 'extensor carpi radialis brevis', group: 'Wrist extensors', color: '#5c86e0',
		meshes: ['ecrb'], view: 'Back',
		origin: 'Lateral epicondyle of humerus (common extensor origin)',
		insertion: 'Dorsal base of the 3rd metacarpal',
		action: 'Wrist extension',
		actionLong: 'Wrist extension, with a little radial deviation; the main wrist extensor in gripping',
		nerve: 'Deep branch of radial (C7–C8)',
		note: 'The tendon most involved in lateral epicondylitis ("tennis elbow").'
	},
	{
		key: 'ecu', name: 'Extensor carpi ulnaris', shortName: 'extensor carpi ulnaris', group: 'Wrist extensors', color: '#2a9bb0',
		meshes: ['ecu_hum', 'ecu_uln'], view: 'Back',
		heads: { ecu_hum: 'Humeral head', ecu_uln: 'Ulnar head' },
		origin: 'Humeral head: lateral epicondyle. Ulnar head: posterior border of the ulna.',
		insertion: 'Base of the 5th metacarpal',
		action: 'Wrist extension + ulnar deviation',
		actionLong: 'Wrist extension and ulnar deviation',
		nerve: 'Posterior interosseous (C7–C8)',
		note: 'Pairs with flexor carpi ulnaris for ulnar deviation: one flexes, the other extends, and together they tilt the hand toward the little finger.'
	},
	// ---- extrinsic finger flexors ----------------------------------------------------------
	{
		key: 'fds', name: 'Flexor digitorum superficialis', shortName: 'flexor digitorum superficialis', group: 'Finger flexors', color: '#d45fa0',
		meshes: ['fds_hu', 'fds_rad'], view: 'Palm',
		heads: { fds_hu: 'Humeroulnar head', fds_rad: 'Radial head' },
		origin: 'Humeroulnar head: medial epicondyle and coronoid process. Radial head: anterior oblique line of the radius.',
		insertion: 'Sides of the middle phalanges of fingers 2–5',
		action: 'PIP flexion (and MCP, wrist)',
		actionLong: 'Flexes the PIP joints, then the MCP joints and the wrist',
		nerve: 'Median (C7–T1)',
		note: 'Each tendon splits (Camper\'s chiasm) to let the FDP tendon pass through to the fingertip.'
	},
	{
		key: 'fdp', name: 'Flexor digitorum profundus', shortName: 'flexor digitorum profundus', group: 'Finger flexors', color: '#8a3f9c',
		meshes: ['fdp'], view: 'Palm',
		origin: 'Anterior and medial ulna and the interosseous membrane',
		insertion: 'Bases of the distal phalanges of fingers 2–5',
		action: 'DIP flexion (and PIP, MCP, wrist)',
		actionLong: 'The only muscle that flexes the DIP joints; also flexes the PIP and MCP joints and the wrist',
		nerve: 'Index and middle: anterior interosseous (median). Ring and little: ulnar (C8–T1).',
		note: 'The lumbricals arise from its tendons. Deep to FDS; turn on See-through to follow it into the fingers.'
	},
	// ---- extrinsic finger extensors --------------------------------------------------------
	{
		key: 'ed', name: 'Extensor digitorum', shortName: 'extensor digitorum', group: 'Finger extensors', color: '#3a8f4b',
		meshes: ['ed'], view: 'Back',
		origin: 'Lateral epicondyle of humerus (common extensor origin)',
		insertion: 'Extensor expansions of fingers 2–5 (middle and distal phalanges)',
		action: 'MCP extension (and wrist)',
		actionLong: 'Extends the MCP joints, and with the lumbricals and interossei the IP joints; assists wrist extension',
		nerve: 'Posterior interosseous (C7–C8)',
		note: 'Bands between its tendons on the back of the hand (juncturae tendinum) are why the ring finger is hard to lift on its own.'
	},
	{
		key: 'ei', name: 'Extensor indicis', shortName: 'extensor indicis', group: 'Finger extensors', color: '#8fbf4d',
		meshes: ['ei'], view: 'Back',
		origin: 'Posterior ulna and interosseous membrane (distal third)',
		insertion: 'Extensor expansion of the index finger',
		action: 'Index finger extension',
		actionLong: 'Extends the index finger independently of the others (pointing)',
		nerve: 'Posterior interosseous (C7–C8)',
		note: 'Its tendon lies on the ulnar side of the index tendon of extensor digitorum.'
	},
	{
		key: 'edm', name: 'Extensor digiti minimi', shortName: 'extensor digiti minimi', group: 'Finger extensors', color: '#4fae86',
		meshes: ['edm'], view: 'Back',
		origin: 'Lateral epicondyle of humerus (common extensor origin)',
		insertion: 'Extensor expansion of the little finger',
		action: 'Little finger extension',
		actionLong: 'Extends the little finger',
		nerve: 'Posterior interosseous (C7–C8)',
		note: 'Lets the little finger extend on its own, the way extensor indicis frees the index.'
	},
	// ---- extrinsic thumb muscles -----------------------------------------------------------
	{
		key: 'fpl', name: 'Flexor pollicis longus', shortName: 'flexor pollicis longus', group: 'Thumb, from the forearm', color: '#e87a8c',
		meshes: ['fpl'], view: 'Palm',
		origin: 'Anterior radius and interosseous membrane',
		insertion: 'Base of the distal phalanx of the thumb',
		action: 'Thumb IP flexion (and MCP)',
		actionLong: 'The only muscle that flexes the thumb IP joint; also flexes the MCP and CMC joints',
		nerve: 'Anterior interosseous, branch of median (C8–T1)',
		note: 'With the anterior interosseous nerve cut, a pinch can\'t make an "O": the thumb and index tips go flat.'
	},
	{
		key: 'apl', name: 'Abductor pollicis longus', shortName: 'abductor pollicis longus', group: 'Thumb, from the forearm', color: '#c7a33a',
		meshes: ['apl'], view: 'Thumb side',
		origin: 'Posterior ulna, radius, and interosseous membrane',
		insertion: 'Base of the 1st metacarpal (radial side)',
		action: 'Thumb abduction + extension (CMC)',
		actionLong: 'Abducts and extends the thumb at the CMC joint; assists radial deviation of the wrist',
		nerve: 'Posterior interosseous (C7–C8)',
		note: 'With extensor pollicis brevis it forms the front border of the anatomical snuffbox; the two share the sheath inflamed in De Quervain\'s tenosynovitis.'
	},
	{
		key: 'epb', name: 'Extensor pollicis brevis', shortName: 'extensor pollicis brevis', group: 'Thumb, from the forearm', color: '#dcc070',
		meshes: ['epb'], view: 'Thumb side',
		origin: 'Posterior radius and interosseous membrane',
		insertion: 'Base of the proximal phalanx of the thumb',
		action: 'Thumb MCP extension',
		actionLong: 'Extends the thumb MCP and CMC joints',
		nerve: 'Posterior interosseous (C7–C8)',
		note: 'Runs with abductor pollicis longus along the radial (front) border of the anatomical snuffbox.'
	},
	{
		key: 'epl', name: 'Extensor pollicis longus', shortName: 'extensor pollicis longus', group: 'Thumb, from the forearm', color: '#b8923a',
		meshes: ['epl'], view: 'Back',
		origin: 'Posterior ulna (middle third) and interosseous membrane',
		insertion: 'Base of the distal phalanx of the thumb',
		action: 'Thumb IP extension (and MCP, CMC)',
		actionLong: 'Extends the thumb IP joint, and the MCP and CMC joints',
		nerve: 'Posterior interosseous (C7–C8)',
		note: 'Forms the back border of the anatomical snuffbox. It turns around Lister\'s tubercle of the radius and can rupture there after a wrist fracture.'
	},
	// ---- thenar ----------------------------------------------------------------------------
	{
		key: 'apb', name: 'Abductor pollicis brevis', shortName: 'abductor pollicis brevis', group: 'Thenar', color: '#d9795a',
		meshes: ['apb'], view: 'Palm',
		origin: 'Flexor retinaculum, tubercles of scaphoid and trapezium',
		insertion: 'Radial side of the base of the thumb\'s proximal phalanx',
		action: 'Thumb palmar abduction',
		actionLong: 'Abducts the thumb away from the palm; helps opposition',
		nerve: 'Recurrent branch of median (C8–T1)',
		note: 'The most superficial thenar muscle and the first to waste in carpal tunnel syndrome.'
	},
	{
		key: 'fpb', name: 'Flexor pollicis brevis', shortName: 'flexor pollicis brevis', group: 'Thenar', color: '#c0703a',
		meshes: ['fpb_sup', 'fpb_deep'], view: 'Palm',
		heads: { fpb_sup: 'Superficial head', fpb_deep: 'Deep head' },
		origin: 'Superficial head: flexor retinaculum and trapezium. Deep head: trapezoid and capitate.',
		insertion: 'Radial side of the base of the thumb\'s proximal phalanx',
		action: 'Thumb MCP flexion',
		actionLong: 'Flexes the thumb MCP joint; helps opposition',
		nerve: 'Superficial head: recurrent median. Deep head: deep branch of ulnar (C8–T1).',
		note: 'Its two heads straddle the flexor pollicis longus tendon and often get different nerves.'
	},
	{
		key: 'op', name: 'Opponens pollicis', shortName: 'opponens pollicis', group: 'Thenar', color: '#a8324e',
		meshes: ['op'], view: 'Palm',
		origin: 'Flexor retinaculum and tubercle of the trapezium',
		insertion: 'Radial border of the 1st metacarpal',
		action: 'Thumb opposition',
		actionLong: 'Opposition: flexes and medially rotates the 1st metacarpal so the thumb pad faces the fingers',
		nerve: 'Recurrent branch of median (C8–T1)',
		note: 'Deep to abductor pollicis brevis. The only thenar muscle inserting on the metacarpal, which is why it can rotate it.'
	},
	{
		key: 'adductor', name: 'Adductor pollicis', shortName: 'adductor pollicis', group: 'Thenar', color: '#7a5ac6',
		meshes: ['add_obl', 'add_tr'], view: 'Palm',
		heads: { add_obl: 'Oblique head', add_tr: 'Transverse head' },
		origin: 'Oblique head: capitate and bases of the 2nd–3rd metacarpals. Transverse head: palmar shaft of the 3rd metacarpal.',
		insertion: 'Ulnar side of the base of the thumb\'s proximal phalanx',
		action: 'Thumb adduction',
		actionLong: 'Adducts the thumb toward the palm: the power in a key pinch',
		nerve: 'Deep branch of ulnar (C8–T1)',
		note: 'Froment\'s sign: with ulnar nerve palsy, pinching paper makes the thumb IP flex as flexor pollicis longus substitutes.'
	},
	// ---- hypothenar ------------------------------------------------------------------------
	{
		key: 'adm', name: 'Abductor digiti minimi', shortName: 'abductor digiti minimi', group: 'Hypothenar', color: '#1f6f8b',
		meshes: ['adm'], view: 'Palm',
		origin: 'Pisiform and tendon of flexor carpi ulnaris',
		insertion: 'Ulnar side of the base of the little finger\'s proximal phalanx',
		action: 'Little finger abduction',
		actionLong: 'Abducts the little finger; assists MCP flexion',
		nerve: 'Deep branch of ulnar (C8–T1)',
		note: 'Does for the little finger what the dorsal interossei do for the others.'
	},
	{
		key: 'fdm', name: 'Flexor digiti minimi brevis', shortName: 'flexor digiti minimi brevis', group: 'Hypothenar', color: '#5f9fb8',
		meshes: ['fdm'], view: 'Palm',
		origin: 'Hook of hamate and flexor retinaculum',
		insertion: 'Ulnar side of the base of the little finger\'s proximal phalanx',
		action: 'Little finger MCP flexion',
		actionLong: 'Flexes the MCP joint of the little finger',
		nerve: 'Deep branch of ulnar (C8–T1)',
		note: 'The hypothenar twin of flexor pollicis brevis.'
	},
	{
		key: 'odm', name: 'Opponens digiti minimi', shortName: 'opponens digiti minimi', group: 'Hypothenar', color: '#4f6fb0',
		meshes: ['odm'], view: 'Palm',
		origin: 'Hook of hamate and flexor retinaculum',
		insertion: 'Ulnar border of the 5th metacarpal',
		action: 'Draws the 5th metacarpal forward (cupping)',
		actionLong: 'Flexes and laterally rotates the 5th metacarpal to meet the thumb, cupping the palm',
		nerve: 'Deep branch of ulnar (C8–T1)',
		note: 'This model moves the metacarpals of the fingers as one block, so its motion at the 5th carpometacarpal joint is not shown.'
	},
	// ---- intrinsics of the fingers ---------------------------------------------------------
	{
		key: 'lumbricals', name: 'Lumbricals', shortName: 'lumbricals', group: 'Intrinsic', color: '#e0a019',
		meshes: ['lumbricals'], view: 'Palm',
		origin: 'Tendons of flexor digitorum profundus',
		insertion: 'Radial side of the extensor expansions of fingers 2–5',
		action: 'MCP flexion + IP extension',
		actionLong: 'Flex the MCP joints while extending the IP joints, through the extensor expansion',
		nerve: '1st and 2nd: median. 3rd and 4th: deep branch of ulnar (C8–T1).',
		note: 'They run from a flexor to an extensor tendon, in front of the MCP axis but behind the IP axes. Split innervation matches FDP\'s.'
	},
	{
		key: 'dorsal_io', name: 'Dorsal interossei', shortName: 'dorsal interossei', group: 'Intrinsic', color: '#9b59b6',
		meshes: ['dorsal_io'], view: 'Back',
		origin: 'Adjacent sides of the metacarpals (four bipennate muscles)',
		insertion: 'Bases of the proximal phalanges and extensor expansions: index (radial side), middle (both sides), ring (ulnar side)',
		action: 'Finger abduction',
		actionLong: 'Abduct the index, middle, and ring fingers away from the middle finger ("DAB"); assist MCP flexion and IP extension',
		nerve: 'Deep branch of ulnar (C8–T1)',
		note: 'The first dorsal interosseous fills the web between thumb and index and is the easiest to see waste in ulnar nerve palsy.'
	},
	{
		key: 'palmar_io', name: 'Palmar interossei', shortName: 'palmar interossei', group: 'Intrinsic', color: '#b39ddb',
		meshes: ['palmar_io'], view: 'Palm',
		origin: 'Palmar surfaces of the 2nd, 4th, and 5th metacarpals',
		insertion: 'Extensor expansions of the same fingers, on the side facing the middle finger',
		action: 'Finger adduction',
		actionLong: 'Adduct the index, ring, and little fingers toward the middle finger ("PAD"); assist MCP flexion and IP extension',
		nerve: 'Deep branch of ulnar (C8–T1)',
		note: 'The middle finger has none: it is the midline the others adduct toward.'
	}
];

const at = (p: Pose): Pose => ({ ...HAND_REST, ...p });
const WRIST = 'Wrist';
const FINGERS = 'Fingers';
const THUMB = 'Thumb';
const FIST = { mcp: 90, pip: 100, dip: 70 };
const STRAIGHT = { mcp: 0, pip: 0, dip: 0 };

export const movements: Movement[] = [
	{
		id: 'wristFlexion', label: 'Flexion', range: '0° → 80°', group: WRIST, from: at({}), to: { wristFlexion: 80 },
		prime: ['fcr', 'fcu'], assist: ['pl', 'fds', 'fdp']
	},
	{
		id: 'wristExtension', label: 'Extension', range: '0° → 70°', group: WRIST, from: at({}), to: { wristFlexion: -70 },
		prime: ['ecrl', 'ecrb', 'ecu'], assist: ['ed', 'ei', 'edm']
	},
	{
		id: 'radialDeviation', label: 'Radial deviation', range: '0° → 20°', group: WRIST, from: at({}), to: { wristDeviation: -20 },
		prime: ['fcr', 'ecrl', 'ecrb'], assist: ['apl', 'epb'],
		note: 'A flexor and extensors on the radial side, working together so their flexion and extension cancel.'
	},
	{
		id: 'ulnarDeviation', label: 'Ulnar deviation', range: '0° → 35°', group: WRIST, from: at({}), to: { wristDeviation: 35 },
		prime: ['fcu', 'ecu'], assist: []
	},
	{
		id: 'fist', label: 'Make a fist', range: 'all joints', group: FINGERS, from: at(STRAIGHT), to: FIST,
		prime: ['fds', 'fdp'], assist: ['lumbricals', 'dorsal_io', 'palmar_io'],
		note: 'The wrist extensors hold the wrist back so the long flexors keep enough length to squeeze.'
	},
	{
		id: 'open', label: 'Open the hand', range: 'fist → straight', group: FINGERS, from: at(FIST), to: STRAIGHT,
		prime: ['ed'], assist: ['ei', 'edm', 'lumbricals', 'dorsal_io', 'palmar_io'],
		note: 'Extensor digitorum straightens the MCP joints; the lumbricals and interossei, through the extensor hood, straighten the IP joints.'
	},
	{
		id: 'hook', label: 'Hook grip', range: 'IP flexion only', group: FINGERS, from: at(STRAIGHT), to: { pip: 100, dip: 70 },
		prime: ['fds', 'fdp'], assist: [],
		note: 'Carrying a bag: the IP joints curl while the MCP joints stay straight.'
	},
	{
		id: 'dip', label: 'Fingertip (DIP) flexion', range: '0° → 70°', group: FINGERS, from: at(STRAIGHT), to: { dip: 70 },
		prime: ['fdp'], assist: [],
		note: 'Flexor digitorum profundus is the only muscle that reaches the distal phalanges.'
	},
	{
		id: 'tabletop', label: 'Table-top', range: 'MCP flexion, IPs straight', group: FINGERS, from: at(STRAIGHT), to: { mcp: 90 },
		prime: ['lumbricals', 'dorsal_io', 'palmar_io'], assist: [],
		note: 'The lumbricals and interossei pass in front of the MCP axis but behind the IP axes, so they flex one and extend the other.'
	},
	{
		id: 'point', label: 'Point the index', range: 'from a fist', group: FINGERS, from: at(FIST),
		// a finger's angle is its own offset plus the shared slider: cancel the fist for the index
		to: { indexMcp: -FIST.mcp, indexPip: -FIST.pip, indexDip: -FIST.dip },
		prime: ['ei', 'ed'], assist: [],
		note: 'Extensor indicis lets the index straighten while the other fingers stay curled.'
	},
	{
		id: 'spread', label: 'Spread (abduction)', range: '0° → 20°', group: FINGERS, from: at({ ...STRAIGHT }), to: { spread: 20 },
		prime: ['dorsal_io'], assist: ['adm'],
		note: 'DAB: dorsal interossei abduct. Abductor digiti minimi takes the little finger.'
	},
	{
		id: 'squeeze', label: 'Squeeze (adduction)', range: 'spread → together', group: FINGERS, from: at({ ...STRAIGHT, spread: 20 }), to: { spread: -8 },
		prime: ['palmar_io'], assist: [],
		note: 'PAD: palmar interossei adduct toward the middle finger.'
	},
	{
		id: 'opposition', label: 'Opposition', range: '0 → 100%', group: THUMB, from: at({}), to: { opposition: 100 },
		prime: ['op'], assist: ['apb', 'fpb', 'odm'],
		note: 'The first metacarpal abducts, flexes, and rotates so the thumb pad faces the fingers.'
	},
	{
		id: 'thumbFlexion', label: 'Flexion', range: 'MCP + IP', group: THUMB, from: at({}), to: { thumbMcp: 50, thumbIp: 80 },
		prime: ['fpl', 'fpb'], assist: [],
		note: 'Flexor pollicis longus is the only flexor of the IP joint; flexor pollicis brevis flexes the MCP.'
	},
	{
		id: 'thumbExtension', label: 'Extension', range: 'CMC, MCP, IP', group: THUMB, from: at({ thumbMcp: 40, thumbIp: 50 }),
		to: { thumbCmcFlexion: -30, thumbMcp: 0, thumbIp: -15 },
		prime: ['epl', 'epb'], assist: ['apl'],
		note: 'Extensor pollicis longus reaches the distal phalanx, brevis the proximal. Their tendons outline the anatomical snuffbox.'
	},
	{
		id: 'thumbAbduction', label: 'Palmar abduction', range: '0° → 60°', group: THUMB, from: at({}), to: { thumbCmcAbduction: 60 },
		prime: ['apb', 'apl'], assist: []
	},
	{
		id: 'thumbAdduction', label: 'Adduction', range: 'abducted → palm', group: THUMB, from: at({ thumbCmcAbduction: 50 }),
		to: { thumbCmcAbduction: -10, thumbCmcFlexion: 15 },
		prime: ['adductor'], assist: [],
		note: 'The power in a key pinch.'
	}
];

export const scenarios: Scenario[] = [
	{ q: 'Which is the only muscle that flexes the DIP joints of the fingers?', a: 'Flexor digitorum profundus', distractors: ['Flexor digitorum superficialis', 'Lumbricals', 'Palmar interossei'], focus: ['fdp'], why: 'Superficialis stops at the middle phalanges.' },
	{ q: 'Which is the only muscle that flexes the IP joint of the thumb?', a: 'Flexor pollicis longus', distractors: ['Flexor pollicis brevis', 'Opponens pollicis', 'Adductor pollicis'], focus: ['fpl'], why: 'It inserts on the thumb\'s distal phalanx; flexor pollicis brevis stops at the proximal.' },
	{ q: 'Which muscles flex the MCP joints while extending the IP joints?', a: 'Lumbricals and interossei', distractors: ['Flexor digitorum superficialis', 'Extensor digitorum', 'Flexor digitorum profundus'], focus: ['lumbricals', 'dorsal_io', 'palmar_io'], why: 'They pass in front of the MCP axis and behind the IP axes, into the extensor hood.' },
	{ q: '"DAB and PAD": which muscles abduct the fingers?', a: 'Dorsal interossei', distractors: ['Palmar interossei', 'Lumbricals', 'Extensor digitorum'], focus: ['dorsal_io'], why: 'Dorsal abduct, palmar adduct, both measured from the middle finger.' },
	{ q: 'Thenar wasting with numbness of the thumb, index, and middle fingers first affects which muscle?', a: 'Abductor pollicis brevis', distractors: ['Adductor pollicis', 'Flexor pollicis longus', 'First dorsal interosseous'], focus: ['apb'], why: 'Carpal tunnel syndrome compresses the median nerve, which supplies the superficial thenar muscles through its recurrent branch.' },
	{ q: 'Froment\'s sign reveals weakness of which muscle?', a: 'Adductor pollicis', distractors: ['Opponens pollicis', 'Abductor pollicis brevis', 'Flexor pollicis longus'], focus: ['adductor'], why: 'With the ulnar nerve out, flexor pollicis longus (median) substitutes and the thumb IP bends.' },
	{ q: 'Which muscle is the prime mover of thumb opposition?', a: 'Opponens pollicis', distractors: ['Adductor pollicis', 'Abductor pollicis longus', 'Extensor pollicis brevis'], focus: ['op'], why: 'It inserts along the 1st metacarpal and rotates it to face the fingers.' },
	{ q: 'The tendon forming the ulnar (back) border of the anatomical snuffbox belongs to…', a: 'Extensor pollicis longus', distractors: ['Extensor pollicis brevis', 'Abductor pollicis longus', 'Extensor carpi radialis longus'], focus: ['epl', 'epb', 'apl'], why: 'Abductor pollicis longus and extensor pollicis brevis form the front border; the scaphoid lies in the floor.' },
	{ q: 'Lateral epicondylitis ("tennis elbow") most involves the origin of which muscle?', a: 'Extensor carpi radialis brevis', distractors: ['Extensor carpi radialis longus', 'Flexor carpi radialis', 'Extensor carpi ulnaris'], focus: ['ecrb'], why: 'It arises from the common extensor origin and works hardest holding the wrist extended in a grip.' },
	{ q: 'Which muscle is absent in about 15% of people?', a: 'Palmaris longus', distractors: ['Flexor carpi radialis', 'Extensor indicis', 'Flexor digitorum superficialis'], focus: ['pl'], why: 'Its absence costs almost nothing, which is why it is a favourite tendon graft.' },
	{ q: 'Which two muscles together produce ulnar deviation of the wrist?', a: 'Flexor carpi ulnaris and extensor carpi ulnaris', distractors: ['Flexor carpi radialis and extensor carpi radialis longus', 'Flexor carpi ulnaris and flexor carpi radialis', 'Extensor carpi ulnaris and extensor digitorum'], focus: ['fcu', 'ecu'], why: 'One flexes and one extends; working together those cancel and the hand tilts ulnarward.' },
	{ q: 'Flexor digitorum profundus to the ring and little fingers is supplied by which nerve?', a: 'Ulnar', distractors: ['Median (anterior interosseous)', 'Radial', 'Musculocutaneous'], focus: ['fdp'], why: 'The index and middle parts get the anterior interosseous branch of the median nerve.' },
	{ q: 'Extending the wrist makes the fingers curl passively. This is called…', a: 'Tenodesis', distractors: ['Active insufficiency', 'Reciprocal inhibition', 'Opposition'], focus: ['fds', 'fdp'], why: 'The finger flexor tendons are too short to let the wrist and fingers extend fully at once. People with C6 tetraplegia use it to grasp.' },
	{ q: 'Grip is weakest with the wrist fully flexed because the finger flexors become…', a: 'Actively insufficient', distractors: ['Passively insufficient', 'Denervated', 'Overstretched'], focus: ['fds', 'fdp'], why: 'Shortened across wrist and fingers at once, they cannot shorten further with force.' },
	{ q: 'Which muscle lets you point the index finger while the others stay curled?', a: 'Extensor indicis', distractors: ['Extensor digitorum', 'First dorsal interosseous', 'First lumbrical'], focus: ['ei'], why: 'It has its own tendon to the index, independent of extensor digitorum.' },
	{ q: 'Wrist flexion and extension occur about which axis?', a: 'Mediolateral (through the capitate)', distractors: ['Anteroposterior (through the capitate)', 'Longitudinal (along the 3rd metacarpal)', 'Through the pisiform'], showAxes: true, why: 'Radial and ulnar deviation turn about the anteroposterior axis. Turn on Joint axes.' }
];
