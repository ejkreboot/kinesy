import type { Pose } from '../../core/rig';
import type { MuscleInfo, Movement, Scenario } from '../types';

export const muscles: MuscleInfo[] = [
	// ---- deltoid -------------------------------------------------------------------------
	{
		key: 'deltoid_ant', name: 'Anterior deltoid', shortName: 'anterior deltoid', group: 'Deltoid', color: '#c9463d',
		meshes: ['deltoid_ant'], view: 'Front',
		origin: 'Anterior border and upper surface of the lateral third of the clavicle',
		insertion: 'Deltoid tuberosity of humerus',
		action: 'Shoulder flexion + internal rotation',
		actionLong: 'Shoulder flexion, internal rotation, and horizontal adduction; assists abduction',
		nerve: 'Axillary (C5–C6)',
		note: 'Partners the clavicular head of pectoralis major in flexion. The axillary nerve that supplies all of deltoid wraps the surgical neck of the humerus, so a fracture or dislocation there can weaken it.'
	},
	{
		key: 'deltoid_mid', name: 'Middle deltoid', shortName: 'middle deltoid', group: 'Deltoid', color: '#e0892c',
		meshes: ['deltoid_mid'], view: 'Side',
		origin: 'Lateral margin and upper surface of the acromion',
		insertion: 'Deltoid tuberosity of humerus',
		action: 'Shoulder abduction',
		actionLong: 'Shoulder abduction, the prime mover with supraspinatus',
		nerve: 'Axillary (C5–C6)',
		note: 'Multipennate and the strongest part of deltoid. With the arm at the side its pull runs nearly along the humerus, so the rotator cuff must hold the head down in the glenoid for it to abduct.'
	},
	{
		key: 'deltoid_post', name: 'Posterior deltoid', shortName: 'posterior deltoid', group: 'Deltoid', color: '#b8577f',
		meshes: ['deltoid_post'], view: 'Back',
		origin: 'Lower lip of the spine of the scapula',
		insertion: 'Deltoid tuberosity of humerus',
		action: 'Shoulder extension + horizontal abduction',
		actionLong: 'Shoulder extension, horizontal abduction, and external rotation',
		nerve: 'Axillary (C5–C6)',
		note: 'The prime mover of horizontal abduction, with infraspinatus and teres minor (reverse flyes, rear-delt rows).'
	},
	// ---- rotator cuff --------------------------------------------------------------------
	{
		key: 'supraspinatus', name: 'Supraspinatus', shortName: 'supraspinatus', group: 'Rotator cuff', color: '#3a8f4b',
		meshes: ['supraspinatus'], view: 'Back',
		origin: 'Supraspinous fossa of scapula',
		insertion: 'Upper facet of the greater tubercle of humerus',
		action: 'Shoulder abduction; seats the humeral head',
		actionLong: 'Shoulder abduction with deltoid, most important early in the range; presses the humeral head into the glenoid',
		nerve: 'Suprascapular (C5–C6)',
		note: 'Its tendon runs under the acromion and coracoacromial ligament: the classic site of impingement and the most commonly torn rotator cuff tendon.'
	},
	{
		key: 'infraspinatus', name: 'Infraspinatus', shortName: 'infraspinatus', group: 'Rotator cuff', color: '#2a9bb0',
		meshes: ['infraspinatus'], view: 'Back',
		origin: 'Infraspinous fossa of scapula',
		insertion: 'Middle facet of the greater tubercle of humerus',
		action: 'Shoulder external rotation',
		actionLong: 'External rotation (the main external rotator); horizontal abduction; holds the humeral head in the glenoid',
		nerve: 'Suprascapular (C5–C6)',
		note: 'The suprascapular nerve reaches it around the spinoglenoid notch, where a cyst or traction can weaken infraspinatus alone.'
	},
	{
		key: 'teres_minor', name: 'Teres minor', shortName: 'teres minor', group: 'Rotator cuff', color: '#8fbf4d',
		meshes: ['teres_minor'], view: 'Back',
		origin: 'Upper two-thirds of the lateral border of the scapula',
		insertion: 'Lower facet of the greater tubercle of humerus',
		action: 'External rotation; weak adduction',
		actionLong: 'External rotation with infraspinatus; weak adduction; draws the humeral head down and back',
		nerve: 'Axillary (C5–C6)',
		note: 'The one rotator cuff muscle supplied by the axillary nerve. The cuff is SITS: supraspinatus, infraspinatus, teres minor, subscapularis.'
	},
	{
		key: 'subscapularis', name: 'Subscapularis', shortName: 'subscapularis', group: 'Rotator cuff', color: '#1f6f8b',
		meshes: ['subscapularis'], view: 'Front',
		origin: 'Subscapular fossa (front surface of the scapula)',
		insertion: 'Lesser tubercle of humerus',
		action: 'Shoulder internal rotation',
		actionLong: 'Internal rotation; guards the front of the joint against anterior dislocation',
		nerve: 'Upper and lower subscapular (C5–C6)',
		note: 'The only cuff muscle on the front of the scapula and the only one on the lesser tubercle. It lies between the scapula and the ribs; turn on See-through to find it.'
	},
	// ---- other scapulohumeral --------------------------------------------------------------
	{
		key: 'teres_major', name: 'Teres major', shortName: 'teres major', group: 'Scapula to humerus', color: '#9b59b6',
		meshes: ['teres_major'], view: 'Back',
		origin: 'Back of the inferior angle of the scapula',
		insertion: 'Medial lip of the intertubercular (bicipital) groove',
		action: 'Extension, adduction, internal rotation',
		actionLong: 'Shoulder extension, adduction, and internal rotation, the same actions as latissimus dorsi',
		nerve: 'Lower subscapular (C5–C7)',
		note: '"Lat\'s little helper." Not part of the rotator cuff: it inserts on the front of the humeral shaft with latissimus dorsi, not on the humeral head.'
	},
	{
		key: 'coracobrachialis', name: 'Coracobrachialis', shortName: 'coracobrachialis', group: 'Scapula to humerus', color: '#c7a33a',
		meshes: ['coracobrachialis'], view: 'Front',
		origin: 'Tip of the coracoid process',
		insertion: 'Medial surface of the middle of the humeral shaft',
		action: 'Assists shoulder flexion + adduction',
		actionLong: 'Assists shoulder flexion and adduction, most in horizontal adduction',
		nerve: 'Musculocutaneous (C5–C7)',
		note: 'Pierced by the musculocutaneous nerve. Shares its coracoid origin with the short head of biceps.'
	},
	// ---- trunk to humerus ------------------------------------------------------------------
	{
		key: 'pec_clav', name: 'Pectoralis major (clavicular head)', shortName: 'clavicular pectoralis major', group: 'Trunk to humerus', color: '#e87a8c',
		meshes: ['pec_clav'], view: 'Front',
		origin: 'Medial half of the front of the clavicle',
		insertion: 'Lateral lip of the intertubercular groove',
		action: 'Shoulder flexion + horizontal adduction',
		actionLong: 'Shoulder flexion (to about 90°), horizontal adduction, and internal rotation',
		nerve: 'Lateral pectoral (C5–C7)',
		note: 'The upper chest (incline press). Its fibers climb to the humerus, so it flexes; the sternal head\'s fibers descend, so that head extends the arm from flexion.'
	},
	{
		key: 'pec_stern', name: 'Pectoralis major (sternal head)', shortName: 'sternal pectoralis major', group: 'Trunk to humerus', color: '#a8324e',
		meshes: ['pec_stern', 'pec_abd'], view: 'Front',
		origin: 'Sternum, upper six costal cartilages, and the aponeurosis of external oblique',
		insertion: 'Lateral lip of the intertubercular groove',
		action: 'Adduction, internal rotation, extension from flexion',
		actionLong: 'Shoulder adduction, internal rotation, and horizontal adduction; extends the flexed arm back to the side',
		nerve: 'Medial and lateral pectoral (C6–T1)',
		note: 'Its tendon twists so the lowest fibers insert highest, rounding off the anterior axillary fold.'
	},
	{
		key: 'lat', name: 'Latissimus dorsi', shortName: 'latissimus dorsi', group: 'Trunk to humerus', color: '#3d5fbf',
		meshes: ['lat'], view: 'Back',
		origin: 'Spinous processes of T7–L5, thoracolumbar fascia, iliac crest, lower 3–4 ribs, often the inferior angle of the scapula',
		insertion: 'Floor of the intertubercular groove',
		action: 'Extension, adduction, internal rotation; depresses the shoulder girdle',
		actionLong: 'Shoulder extension, adduction, and internal rotation; depresses the shoulder girdle; lifts the trunk toward fixed arms (pull-ups, crutch walking)',
		nerve: 'Thoracodorsal (C6–C8)',
		note: 'The "swimmer\'s muscle": the pull phase is extension, adduction, and internal rotation. Forms the posterior axillary fold with teres major.'
	},
	// ---- arm muscles crossing the shoulder -------------------------------------------------
	{
		key: 'biceps', name: 'Biceps brachii', shortName: 'biceps', group: 'Arm muscles crossing the shoulder', color: '#d45fa0',
		meshes: ['biceps_lh', 'biceps_sh'], view: 'Front',
		heads: { biceps_lh: 'Long head', biceps_sh: 'Short head' },
		origin: 'Long head: supraglenoid tubercle of scapula. Short head: tip of coracoid process.',
		insertion: 'Radial tuberosity and bicipital aponeurosis (the forearm is in the elbow model)',
		action: 'Assists shoulder flexion',
		actionLong: 'At the shoulder, assists flexion; the long head helps hold the humeral head down. Its main actions are elbow flexion and supination.',
		nerve: 'Musculocutaneous (C5–C6)',
		note: 'The long-head tendon runs in the intertubercular groove and arches over the humeral head inside the joint capsule, a common source of anterior shoulder pain.'
	},
	{
		key: 'triceps_long', name: 'Triceps brachii (long head)', shortName: 'long head of triceps', group: 'Arm muscles crossing the shoulder', color: '#7f95e0',
		meshes: ['triceps_long'], view: 'Back',
		origin: 'Infraglenoid tubercle of scapula',
		insertion: 'Olecranon of ulna, with the other two heads (the forearm is in the elbow model)',
		action: 'Assists shoulder extension + adduction',
		actionLong: 'At the shoulder, assists extension and adduction. At the elbow, extension.',
		nerve: 'Radial (C6–C8)',
		note: 'The only head of triceps that crosses the shoulder. It passes between teres minor and teres major, dividing the quadrangular space from the triangular space.'
	},
	// ---- trunk to scapula (shoulder girdle) ------------------------------------------------
	{
		key: 'trap_upper', name: 'Upper trapezius', shortName: 'upper trapezius', group: 'Shoulder girdle', color: '#8a6bbd',
		meshes: ['trap_upper'], view: 'Back',
		origin: 'External occipital protuberance, superior nuchal line, ligamentum nuchae',
		insertion: 'Lateral third of the clavicle',
		action: 'Scapular elevation + upward rotation',
		actionLong: 'Elevates (shrugs) and upward-rotates the scapula; extends and side-bends the neck, turning the head to the opposite side',
		nerve: 'Spinal accessory (CN XI), with C3–C4',
		note: 'One of the three upward rotators (with lower trapezius and serratus anterior). Its skull attachment lies above this model.'
	},
	{
		key: 'trap_middle', name: 'Middle trapezius', shortName: 'middle trapezius', group: 'Shoulder girdle', color: '#5f4c9c',
		meshes: ['trap_middle'], view: 'Back',
		origin: 'Spinous processes of C7–T3',
		insertion: 'Medial edge of the acromion and upper lip of the scapular spine',
		action: 'Scapular retraction',
		actionLong: 'Retracts the scapula; steadies it while the arm moves',
		nerve: 'Spinal accessory (CN XI), with C3–C4',
		note: 'Retracts with the rhomboids: the "squeeze the shoulder blades" of rows and posture work.'
	},
	{
		key: 'trap_lower', name: 'Lower trapezius', shortName: 'lower trapezius', group: 'Shoulder girdle', color: '#b39ddb',
		meshes: ['trap_lower'], view: 'Back',
		origin: 'Spinous processes of T4–T12',
		insertion: 'Tubercle at the root of the scapular spine',
		action: 'Scapular depression + upward rotation',
		actionLong: 'Depresses and upward-rotates the scapula; assists retraction',
		nerve: 'Spinal accessory (CN XI), with C3–C4',
		note: 'Pulls down on the root of the spine while upper trapezius pulls up on the acromion: a force couple that turns the glenoid upward.'
	},
	{
		key: 'levator', name: 'Levator scapulae', shortName: 'levator scapulae', group: 'Shoulder girdle', color: '#c0703a',
		meshes: ['levator'], view: 'Back',
		origin: 'Transverse processes of C1–C4',
		insertion: 'Medial border of the scapula, superior angle to the root of the spine',
		action: 'Scapular elevation + downward rotation',
		actionLong: 'Elevates and downward-rotates the scapula; side-bends the neck',
		nerve: 'Dorsal scapular (C5) and C3–C4',
		note: 'A frequent site of neck and shoulder-blade pain. Its C1–C2 attachments lie above this model.'
	},
	{
		key: 'rhomboid_major', name: 'Rhomboid major', shortName: 'rhomboid major', group: 'Shoulder girdle', color: '#b8923a',
		meshes: ['rhomboid_major'], view: 'Back',
		origin: 'Spinous processes of T2–T5',
		insertion: 'Medial border of the scapula, root of the spine to the inferior angle',
		action: 'Scapular retraction + downward rotation',
		actionLong: 'Retracts and downward-rotates the scapula, elevating it slightly',
		nerve: 'Dorsal scapular (C4–C5)',
		note: 'Deep to trapezius: turn on See-through, or hide the trapezius parts in the list.'
	},
	{
		key: 'rhomboid_minor', name: 'Rhomboid minor', shortName: 'rhomboid minor', group: 'Shoulder girdle', color: '#dcc070',
		meshes: ['rhomboid_minor'], view: 'Back',
		origin: 'Spinous processes of C7–T1',
		insertion: 'Medial border of the scapula at the root of the spine',
		action: 'Scapular retraction + downward rotation',
		actionLong: 'Retracts, downward-rotates, and slightly elevates the scapula, with rhomboid major',
		nerve: 'Dorsal scapular (C4–C5)',
		note: 'Sits just above rhomboid major and is often fused with it.'
	},
	{
		key: 'serratus', name: 'Serratus anterior', shortName: 'serratus anterior', group: 'Shoulder girdle', color: '#4fae86',
		meshes: ['serratus'], view: 'Side',
		origin: 'Outer surfaces of ribs 1–8 or 9',
		insertion: 'Front (costal) surface of the medial border of the scapula, superior to inferior angle',
		action: 'Scapular protraction + upward rotation',
		actionLong: 'Protracts the scapula (punching, pushing), upward-rotates it through the fibers to the inferior angle, and holds the medial border against the ribs',
		nerve: 'Long thoracic (C5–C7)',
		note: 'Weakness or long thoracic nerve injury lets the medial border lift off the ribs (winging), most obvious when pushing against a wall.'
	},
	{
		key: 'pec_minor', name: 'Pectoralis minor', shortName: 'pectoralis minor', group: 'Shoulder girdle', color: '#d9795a',
		meshes: ['pec_minor'], view: 'Front',
		origin: 'Ribs 3–5, near their costal cartilages',
		insertion: 'Medial border and upper surface of the coracoid process',
		action: 'Scapular depression, protraction, downward rotation',
		actionLong: 'Depresses, protracts, and downward-rotates the scapula, tipping it forward; lifts the ribs in forced inspiration when the scapula is fixed',
		nerve: 'Medial pectoral (C8–T1)',
		note: 'Deep to pectoralis major. When tight it tips the scapula forward (rounded shoulders); the brachial plexus and axillary vessels pass beneath it.'
	}
];

// Demos set every arm and girdle angle up front so they play the same from any pose.
const at = (p: Pose): Pose => ({ flexion: 0, abduction: 10, rotation: 0, elevation: 0, protraction: 0, ...p });
const ARM = 'Arm';
const GIRDLE = 'Shoulder girdle';

export const movements: Movement[] = [
	{
		id: 'flexion', label: 'Flexion', range: '0° → 180°', group: ARM, from: at({}), to: { flexion: 180 },
		prime: ['deltoid_ant', 'pec_clav'], assist: ['coracobrachialis', 'biceps'],
		note: 'About 30° of the 180° is the scapula upward-rotating (serratus anterior, upper and lower trapezius).'
	},
	{
		id: 'extension', label: 'Extension', range: 'flex 90° → ext 60°', group: ARM, from: at({ flexion: 90 }), to: { flexion: -60 },
		prime: ['lat', 'teres_major', 'deltoid_post'], assist: ['pec_stern', 'triceps_long'],
		note: 'The sternal head of pectoralis major helps only until the arm reaches the side.'
	},
	{
		id: 'abduction', label: 'Abduction', range: '0° → 180°', group: ARM, from: at({ abduction: 0 }), to: { abduction: 180 },
		prime: ['deltoid_mid', 'supraspinatus'], assist: ['deltoid_ant'],
		note: 'Watch the readout under the sliders: about 150° at the glenohumeral joint, 30° at the scapula.'
	},
	{
		id: 'adduction', label: 'Adduction', range: '180° → 0°', group: ARM, from: at({ abduction: 180 }), to: { abduction: 0 },
		prime: ['lat', 'teres_major', 'pec_stern'], assist: ['triceps_long', 'coracobrachialis'],
		note: 'Against resistance (a pull-down); unresisted, gravity lowers the arm while the abductors lengthen.'
	},
	{
		id: 'hAbduction', label: 'Horizontal abduction', range: 'from 90° flexion', group: ARM,
		from: at({ flexion: 90, abduction: -30, protraction: 15 }), to: { abduction: 90, protraction: -15 },
		prime: ['deltoid_post', 'infraspinatus', 'teres_minor'], assist: ['deltoid_mid'],
		note: 'The scapula retracts with it (middle trapezius, rhomboids).'
	},
	{
		id: 'hAdduction', label: 'Horizontal adduction', range: 'from 90° flexion', group: ARM,
		from: at({ flexion: 90, abduction: 90, protraction: -15 }), to: { abduction: -30, protraction: 15 },
		prime: ['pec_clav', 'pec_stern', 'deltoid_ant'], assist: ['coracobrachialis', 'biceps'],
		note: 'The scapula protracts with it (serratus anterior, pectoralis minor).'
	},
	{
		id: 'externalRotation', label: 'External rotation', range: 'IR 60° → ER 90°', group: ARM, from: at({ rotation: 60 }), to: { rotation: -90 },
		prime: ['infraspinatus', 'teres_minor'], assist: ['deltoid_post']
	},
	{
		id: 'internalRotation', label: 'Internal rotation', range: 'ER 90° → IR 60°', group: ARM, from: at({ rotation: -90 }), to: { rotation: 60 },
		prime: ['subscapularis', 'lat', 'teres_major', 'pec_stern'], assist: ['deltoid_ant', 'pec_clav']
	},
	{
		id: 'elevation', label: 'Elevation', range: 'shrug', group: GIRDLE, from: at({}), to: { elevation: 35 },
		prime: ['trap_upper', 'levator'], assist: ['rhomboid_major', 'rhomboid_minor']
	},
	{
		id: 'depression', label: 'Depression', range: 'from a shrug', group: GIRDLE, from: at({ elevation: 35 }), to: { elevation: -10 },
		prime: ['trap_lower', 'pec_minor'], assist: ['lat'],
		note: 'Against resistance, as in dips or pushing up from a chair; otherwise gravity lowers the girdle.'
	},
	{
		id: 'protraction', label: 'Protraction', range: 'reaching, punching', group: GIRDLE, from: at({ protraction: -10 }), to: { protraction: 25 },
		prime: ['serratus'], assist: ['pec_minor'],
		note: 'Pectoralis major adds to it through the humerus when pushing.'
	},
	{
		id: 'retraction', label: 'Retraction', range: 'squeezing back', group: GIRDLE, from: at({ protraction: 25 }), to: { protraction: -25 },
		prime: ['trap_middle', 'rhomboid_major', 'rhomboid_minor'], assist: ['trap_upper', 'trap_lower']
	},
	{
		id: 'upwardRotation', label: 'Upward rotation', range: 'with arm raising', group: GIRDLE, from: at({ abduction: 0 }), to: { abduction: 180 },
		prime: ['serratus', 'trap_upper', 'trap_lower'], assist: [],
		note: 'Shown during abduction, which drives it here. A force couple: upper trapezius pulls the acromion up, lower trapezius pulls the spine root down, serratus pulls the inferior angle forward and out.'
	},
	{
		id: 'downwardRotation', label: 'Downward rotation', range: 'with arm lowering', group: GIRDLE, from: at({ abduction: 180 }), to: { abduction: 0 },
		prime: ['rhomboid_major', 'rhomboid_minor', 'levator', 'pec_minor'], assist: [],
		note: 'Shown as the arm lowers; against resistance (pull-downs) these muscles turn the glenoid back down.'
	}
];

export const scenarios: Scenario[] = [
	{ q: 'Which of these is NOT part of the rotator cuff?', a: 'Teres major', distractors: ['Teres minor', 'Supraspinatus', 'Subscapularis'], focus: ['teres_major'], why: 'Teres major inserts on the humeral shaft with latissimus dorsi. The cuff (SITS) wraps the humeral head.' },
	{ q: 'Which rotator cuff muscle is most often torn or impinged under the acromion?', a: 'Supraspinatus', distractors: ['Infraspinatus', 'Teres minor', 'Subscapularis'], focus: ['supraspinatus'], why: 'Its tendon runs through the narrow space under the acromion and coracoacromial ligament.' },
	{ q: 'Which rotator cuff muscle internally rotates the humerus?', a: 'Subscapularis', distractors: ['Infraspinatus', 'Teres minor', 'Supraspinatus'], focus: ['subscapularis'], why: 'It is the only cuff muscle on the front of the scapula, inserting on the lesser tubercle.' },
	{ q: 'Winging of the medial border of the scapula points to weakness of which muscle?', a: 'Serratus anterior', distractors: ['Rhomboid major', 'Pectoralis minor', 'Levator scapulae'], focus: ['serratus'], why: 'Serratus anterior holds the scapula against the ribs. The long thoracic nerve supplies it.' },
	{ q: 'In full arm elevation (180°), roughly how much motion comes from the scapula rotating on the thorax?', a: '30°', distractors: ['10°', '60°', '90°'], why: 'Scapulohumeral rhythm: after a setting phase of about 30°, the scapula turns 1° for every 5° of arm elevation, 150° : 30°. Try the readout under the sliders.' },
	{ q: 'Upward rotation of the scapula is produced by a force couple of upper trapezius, lower trapezius, and…', a: 'Serratus anterior', distractors: ['Rhomboid major', 'Levator scapulae', 'Pectoralis minor'], focus: ['serratus', 'trap_upper', 'trap_lower'], why: 'The three pull on different parts of the scapula so it turns rather than slides.' },
	{ q: 'Besides deltoid, which muscle does the axillary nerve supply?', a: 'Teres minor', distractors: ['Teres major', 'Infraspinatus', 'Subscapularis'], focus: ['teres_minor', 'deltoid_ant', 'deltoid_mid', 'deltoid_post'], why: 'The axillary nerve leaves the quadrangular space to supply teres minor and all three parts of deltoid.' },
	{ q: 'Which muscle extends, adducts, and internally rotates the humerus and is supplied by the thoracodorsal nerve?', a: 'Latissimus dorsi', distractors: ['Teres major', 'Pectoralis major (sternal head)', 'Posterior deltoid'], focus: ['lat'], why: 'Teres major does the same three things but gets the lower subscapular nerve.' },
	{ q: 'Which part of pectoralis major flexes the shoulder?', a: 'Clavicular head', distractors: ['Sternal head', 'Abdominal part', 'Neither; it only adducts'], focus: ['pec_clav'], why: 'Its fibers rise from the clavicle to the humerus. The sternal fibers descend and extend the flexed arm.' },
	{ q: 'Shoulder abduction and adduction occur in which plane?', a: 'Frontal', distractors: ['Sagittal', 'Transverse', 'Scapular'], showAxes: true, why: 'Around an anteroposterior (sagittal) axis through the humeral head.' },
	{ q: 'Internal and external rotation of the humerus occur around which axis?', a: 'The long axis of the humerus', distractors: ['A mediolateral axis through the humeral head', 'An anteroposterior axis through the humeral head', 'An axis through the acromioclavicular joint'], showAxes: true, why: 'Turn on Joint axes: the long line runs through the humeral head and down the shaft.' },
	{ q: 'The long-head tendon of which muscle lies in the intertubercular groove and arches over the humeral head?', a: 'Biceps brachii', distractors: ['Triceps brachii (long head)', 'Coracobrachialis', 'Pectoralis major (clavicular head)'], parts: ['biceps_lh'], why: 'It arises from the supraglenoid tubercle inside the joint capsule.' },
	{ q: 'The spinal accessory nerve (CN XI) supplies which shoulder muscle?', a: 'Trapezius', distractors: ['Levator scapulae', 'Rhomboid major', 'Serratus anterior'], focus: ['trap_upper', 'trap_middle', 'trap_lower'], why: 'Injury (e.g. in neck surgery) weakens shrugging and lets the shoulder droop.' },
	{ q: 'The dorsal scapular nerve supplies the rhomboids and which other muscle?', a: 'Levator scapulae', distractors: ['Upper trapezius', 'Serratus anterior', 'Teres major'], focus: ['levator', 'rhomboid_major', 'rhomboid_minor'], why: 'All three elevate and downward-rotate the scapula.' },
	{ q: 'Which muscle attaches to the coracoid process and depresses and protracts the scapula?', a: 'Pectoralis minor', distractors: ['Coracobrachialis', 'Subclavius', 'Serratus anterior'], focus: ['pec_minor'], why: 'Coracobrachialis and the short head of biceps also arise from the coracoid, but they move the humerus.' },
	{ q: 'Full overhead abduction requires which humeral rotation, so the greater tubercle clears the acromion?', a: 'External rotation', distractors: ['Internal rotation', 'No rotation', 'Either, depending on speed'], focus: ['infraspinatus', 'teres_minor'], why: 'External rotation turns the greater tubercle back, out from under the acromion. (This model does not add it automatically.)' },
	{ q: 'Which muscle is prime mover for horizontal abduction along with infraspinatus and teres minor?', a: 'Posterior deltoid', distractors: ['Middle deltoid', 'Latissimus dorsi', 'Teres major'], focus: ['deltoid_post'], why: 'Its fibers pass behind the joint from the scapular spine.' }
];
