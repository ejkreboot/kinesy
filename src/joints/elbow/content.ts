import type { MuscleInfo, Movement, Scenario } from '../types';

export const muscles: MuscleInfo[] = [
	{
		key: 'biceps', name: 'Biceps brachii', shortName: 'biceps', group: 'Flexors', color: '#c9463d',
		meshes: ['biceps_lh', 'biceps_sh'],
		heads: { biceps_lh: 'Long head', biceps_sh: 'Short head' },
		origin: 'Long head: supraglenoid tubercle of scapula. Short head: tip of coracoid process.',
		insertion: 'Radial tuberosity; bicipital aponeurosis into forearm fascia',
		action: 'Elbow flexion + supination',
		actionLong: 'Elbow flexion; supination (strongest with elbow near 90°); weak shoulder flexion',
		nerve: 'Musculocutaneous (C5–C6)',
		note: 'Crosses the shoulder, elbow, and proximal radioulnar joints. With the forearm pronated, its tendon wraps around the radius and it loses flexion leverage.'
	},
	{
		key: 'brachialis', name: 'Brachialis', shortName: 'brachialis', group: 'Flexors', color: '#d8892c',
		meshes: ['brachialis'],
		origin: 'Distal half of anterior humerus',
		insertion: 'Coronoid process and ulnar tuberosity',
		action: 'Elbow flexion in any forearm position',
		actionLong: 'Elbow flexion, in every forearm position',
		nerve: 'Musculocutaneous (C5–C6)',
		note: 'Inserts on the ulna, so forearm rotation does not change its leverage. The workhorse flexor. Its lateral part often gets a twig from the radial nerve.'
	},
	{
		key: 'brachioradialis', name: 'Brachioradialis', shortName: 'brachioradialis', group: 'Flexors', color: '#b8577f',
		meshes: ['brachioradialis'],
		origin: 'Proximal two-thirds of lateral supracondylar ridge of humerus',
		insertion: 'Lateral distal radius, just proximal to the styloid process',
		action: 'Elbow flexion, strongest in neutral',
		actionLong: 'Elbow flexion, strongest with the forearm in neutral (thumb up); brings the forearm toward neutral from either extreme',
		nerve: 'Radial (C5–C6)',
		note: 'An elbow flexor supplied by the radial nerve, the nerve of the extensors. Hammer curls load it most.'
	},
	{
		key: 'triceps', name: 'Triceps brachii', shortName: 'triceps', group: 'Extensors', color: '#3f6fce',
		meshes: ['triceps_long', 'triceps_lat', 'triceps_med'],
		heads: { triceps_long: 'Long head', triceps_lat: 'Lateral head', triceps_med: 'Medial head' },
		origin: 'Long head: infraglenoid tubercle of scapula. Lateral head: posterior humerus above the radial groove. Medial head: posterior humerus below the radial groove.',
		insertion: 'Olecranon process of ulna',
		action: 'Elbow extension',
		actionLong: 'Elbow extension; long head also extends and adducts the shoulder',
		nerve: 'Radial (C6–C8, mainly C7)',
		note: 'The medial head works in nearly all extension. Lateral and long heads join in against resistance.'
	},
	{
		key: 'anconeus', name: 'Anconeus', shortName: 'anconeus', group: 'Extensors', color: '#2a9bb0',
		meshes: ['anconeus'],
		origin: 'Posterior surface of lateral epicondyle of humerus',
		insertion: 'Lateral olecranon and proximal posterior ulna',
		action: 'Assists extension, stabilizes the elbow',
		actionLong: 'Assists elbow extension; stabilizes the joint',
		nerve: 'Radial (C7–C8)',
		note: 'Small and triangular; blends with the medial head of triceps.'
	},
	{
		key: 'pt', name: 'Pronator teres', shortName: 'pronator teres', group: 'Forearm rotators', color: '#3a8f4b',
		meshes: ['pt_hum', 'pt_uln'],
		heads: { pt_hum: 'Humeral head', pt_uln: 'Ulnar head' },
		origin: 'Humeral head: medial epicondyle (common flexor origin). Ulnar head: coronoid process.',
		insertion: 'Middle of lateral radius (pronator tuberosity)',
		action: 'Pronation, weak elbow flexion',
		actionLong: 'Pronation (especially fast or resisted); assists elbow flexion',
		nerve: 'Median (C6–C7)',
		note: 'The median nerve passes between its two heads, the site of pronator syndrome.'
	},
	{
		key: 'pq', name: 'Pronator quadratus', shortName: 'pronator quadratus', group: 'Forearm rotators', color: '#7ab25b',
		meshes: ['pq'],
		origin: 'Distal quarter of anterior ulna',
		insertion: 'Distal quarter of anterior radius',
		action: 'Primary pronator',
		actionLong: 'Pronation, active in all pronation regardless of elbow angle or speed; binds radius to ulna at the distal radioulnar joint',
		nerve: 'Anterior interosseous nerve, branch of median (C8–T1)',
		note: 'The deepest muscle of the distal anterior forearm. Turn on See-through to find it.'
	},
	{
		key: 'supinator', name: 'Supinator', shortName: 'supinator', group: 'Forearm rotators', color: '#7a5ac6',
		meshes: ['supinator'],
		origin: 'Lateral epicondyle, radial collateral and annular ligaments, supinator crest of ulna',
		insertion: 'Lateral, posterior, and anterior proximal third of radius',
		action: 'Supination, esp. slow or unresisted',
		actionLong: 'Supination; handles slow, unresisted supination and supination with the elbow extended. Biceps joins for fast or resisted supination, especially with the elbow flexed.',
		nerve: 'Deep branch of radial / posterior interosseous (C5–C6)',
		note: 'Wraps the radial neck. The deep branch of the radial nerve passes through it (arcade of Frohse).'
	}
];

export const movements: Movement[] = [
	{ id: 'flexion', label: 'Flexion', range: '0° → 140°', from: { flexion: 0 }, to: { flexion: 140 }, prime: ['biceps', 'brachialis', 'brachioradialis'], assist: ['pt'] },
	{ id: 'extension', label: 'Extension', range: '140° → 0°', from: { flexion: 140 }, to: { flexion: 0 }, prime: ['triceps'], assist: ['anconeus'] },
	{ id: 'pronation', label: 'Pronation', range: 'sup 90° → pron 80°', from: { flexion: 90, pronation: -90 }, to: { flexion: 90, pronation: 80 }, prime: ['pq', 'pt'], assist: ['brachioradialis'] },
	{ id: 'supination', label: 'Supination', range: 'pron 80° → sup 90°', from: { flexion: 90, pronation: 80 }, to: { flexion: 90, pronation: -90 }, prime: ['supinator', 'biceps'], assist: ['brachioradialis'] }
];

export const scenarios: Scenario[] = [
	{ q: 'With the forearm fully pronated, which elbow flexor loses the most leverage?', a: 'Biceps brachii', distractors: ['Brachialis', 'Brachioradialis', 'Pronator teres'], focus: ['biceps'], why: 'Its tendon wraps around the radius in pronation.' },
	{ q: 'Which elbow flexor is equally effective in any forearm position because it inserts on the ulna?', a: 'Brachialis', distractors: ['Biceps brachii', 'Brachioradialis', 'Pronator teres'], focus: ['brachialis'], why: 'The ulna does not rotate, so its line of pull is unchanged.' },
	{ q: 'Elbow flexion with the thumb pointing up (hammer curl) recruits which flexor most?', a: 'Brachioradialis', distractors: ['Brachialis', 'Biceps brachii', 'Anconeus'], focus: ['brachioradialis'], why: 'Brachioradialis has its best leverage in neutral.' },
	{ q: 'Which pronator is active in all pronation, regardless of speed or elbow angle?', a: 'Pronator quadratus', distractors: ['Pronator teres', 'Brachioradialis', 'Supinator'], focus: ['pq'], why: 'Pronator teres joins for fast or resisted pronation.' },
	{ q: 'Slow, unresisted supination with the elbow extended is performed mainly by which muscle?', a: 'Supinator', distractors: ['Biceps brachii', 'Brachioradialis', 'Anconeus'], focus: ['supinator'], why: 'Biceps is recruited when supination is fast, resisted, or the elbow is flexed.' },
	{ q: 'Which head of the triceps also extends the shoulder?', a: 'Long head', distractors: ['Lateral head', 'Medial head', 'None of them'], parts: ['triceps_long'], why: 'It arises from the infraglenoid tubercle of the scapula, so it crosses the shoulder.' },
	{ q: 'Elbow flexion and extension occur in which plane?', a: 'Sagittal', distractors: ['Frontal', 'Transverse', 'Scapular'], showAxes: true, why: 'Around a mediolateral (frontal) axis.' },
	{ q: 'Pronation and supination rotate the radius around an axis running from…', a: 'The radial head to the ulnar head', distractors: ['The lateral to the medial epicondyle', 'The olecranon to the radial styloid', 'The capitulum to the trochlea'], showAxes: true, why: 'Turn on Joint axes to see it.' },
	{ q: 'The median nerve passes between the two heads of which muscle?', a: 'Pronator teres', distractors: ['Supinator', 'Biceps brachii', 'Pronator quadratus'], focus: ['pt'], why: 'Compression here is pronator syndrome.' },
	{ q: 'The deep branch of the radial nerve passes through which muscle?', a: 'Supinator', distractors: ['Anconeus', 'Brachioradialis', 'Pronator teres'], focus: ['supinator'], why: 'It enters under the arcade of Frohse.' },
	{ q: 'Which muscle crosses the shoulder, the elbow, and the proximal radioulnar joint?', a: 'Biceps brachii', distractors: ['Triceps brachii', 'Brachioradialis', 'Brachialis'], focus: ['biceps'], why: 'That is why it flexes the elbow, supinates, and weakly flexes the shoulder.' },
	{ q: 'Besides pronation, pronator teres assists which movement?', a: 'Elbow flexion', distractors: ['Elbow extension', 'Supination', 'Shoulder flexion'], focus: ['pt'], why: 'It crosses the anterior elbow from the medial epicondyle.' }
];
