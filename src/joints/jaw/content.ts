import type { Pose } from '../../core/rig';
import type { MuscleInfo, Movement, Scenario } from '../types';

/**
 * Both sides' muscles are listed, each side on its own: one mandible moves at two joints, and to swing the
 * jaw to one side the muscles of the two sides do different things (the right lateral pterygoid swings it
 * to the left). Each muscle has one colour on both sides.
 */
type Side = 'r' | 'l';
type Base = Omit<MuscleInfo, 'key' | 'name' | 'shortName' | 'meshes' | 'heads' | 'view'> & {
	key: string;
	name: string;
	/** the muscle's meshes without the side (and head labels by mesh, likewise) */
	meshes: string[];
	heads?: Record<string, string>;
};

const SIDE = { r: 'Right', l: 'Left' } as const;
const both = (b: Base): MuscleInfo[] =>
	(['r', 'l'] as Side[]).map((s) => ({
		...b,
		key: `${b.key}_${s}`,
		name: `${SIDE[s]} ${b.name.toLowerCase()}`,
		shortName: `${SIDE[s].toLowerCase()} ${b.name.toLowerCase()}`,
		meshes: b.meshes.map((m) => `${m}_${s}`),
		heads: b.heads && Object.fromEntries(Object.entries(b.heads).map(([m, h]) => [`${m}_${s}`, h])),
		view: SIDE[s]
	}));

export const muscles: MuscleInfo[] = [
	// ---- muscles of mastication -------------------------------------------------------------------
	...both({
		key: 'temporalis', name: 'Temporalis', group: 'Muscles of mastication', color: '#c43c62',
		meshes: ['temporalis'],
		origin: 'Floor of the temporal fossa, up to the inferior temporal line, and the deep surface of the temporal fascia',
		insertion: 'Coronoid process (tip and medial surface) and the anterior border of the ramus',
		action: 'Jaw elevation; retrusion',
		actionLong: 'Elevates the mandible (closes the jaw); its posterior, nearly horizontal fibres retrude it; one side helps swing the jaw toward its own side',
		nerve: 'Deep temporal nerves, from the mandibular nerve (V3)',
		note: 'A fan: its front fibres run vertically, its back fibres almost horizontally, turning down round the root of the zygomatic arch. It passes deep to the arch to the coronoid process. Feel it at the temple as you clench.'
	}),
	...both({
		key: 'masseter', name: 'Masseter', group: 'Muscles of mastication', color: '#d9732b',
		meshes: ['masseter_sup', 'masseter_deep'], heads: { masseter_sup: 'Superficial part', masseter_deep: 'Deep part' },
		origin: 'Superficial part: zygomatic process of the maxilla and the front two-thirds of the zygomatic arch’s lower border. Deep part: the back third and deep surface of the zygomatic arch',
		insertion: 'Lateral surface of the ramus and angle of the mandible, up to the coronoid process',
		action: 'Jaw elevation',
		actionLong: 'Elevates the mandible: the most powerful closer of the jaw; the superficial part helps protrude it, the deep part retrude it',
		nerve: 'Masseteric nerve, from the mandibular nerve (V3)',
		note: 'With medial pterygoid it slings the angle of the mandible (the pterygomasseteric sling). Feel it bulge at the angle of the jaw as you clench.'
	}),
	...both({
		key: 'med_ptery', name: 'Medial pterygoid', group: 'Muscles of mastication', color: '#7a3b8f',
		meshes: ['med_ptery'],
		origin: 'Medial surface of the lateral pterygoid plate and the palatine bone (deep head); the maxillary tuberosity (superficial head)',
		insertion: 'Medial surface of the ramus and angle of the mandible',
		action: 'Jaw elevation; protrusion; deviation to the other side',
		actionLong: 'Elevates the mandible; with the lateral pterygoid it protrudes it, and one side swings the jaw to the other side (grinding)',
		nerve: 'Nerve to medial pterygoid, from the mandibular nerve (V3)',
		note: 'The masseter’s twin on the inside of the ramus: the two sling the angle of the jaw between them.'
	}),
	...both({
		key: 'lat_ptery', name: 'Lateral pterygoid', group: 'Muscles of mastication', color: '#3f88d4',
		meshes: ['lat_ptery_sup', 'lat_ptery_inf'], heads: { lat_ptery_sup: 'Upper head', lat_ptery_inf: 'Lower head' },
		origin: 'Upper head: infratemporal surface of the greater wing of the sphenoid. Lower head: lateral surface of the lateral pterygoid plate',
		insertion: 'Neck of the condyle (pterygoid fovea); the upper head also into the joint’s capsule and articular disc',
		action: 'Protrusion; jaw opening; deviation to the other side',
		actionLong: 'Pulls the condyle forward onto the articular eminence: protrudes the jaw and opens it; one side alone swings the jaw to the other side',
		nerve: 'Nerve to lateral pterygoid, from the mandibular nerve (V3)',
		note: 'The only muscle of mastication that opens the jaw. Its lower head draws the condyle forward; its upper head works as the jaw closes, steadying the disc on the condyle as it slides back.'
	}),
	// ---- suprahyoid -------------------------------------------------------------------------------
	...both({
		key: 'digastric', name: 'Digastric', group: 'Suprahyoid', color: '#2f9e8f',
		meshes: ['digastric_ant', 'digastric_post'], heads: { digastric_ant: 'Anterior belly', digastric_post: 'Posterior belly' },
		origin: 'Anterior belly: digastric fossa on the back of the mandible’s lower border, near the midline. Posterior belly: mastoid notch of the temporal bone',
		insertion: 'An intermediate tendon, held to the body and greater horn of the hyoid by a fibrous loop',
		action: 'Jaw opening; retrusion (hyoid held)',
		actionLong: 'With the hyoid held by the infrahyoids, depresses and retrudes the mandible; with the jaw closed, raises the hyoid (swallowing)',
		nerve: 'Anterior belly: nerve to mylohyoid (V3). Posterior belly: facial nerve (VII)',
		note: 'Two bellies from two pharyngeal arches, so two nerves. Only the anterior belly crosses the jaw’s joints; the posterior belly moves only as the hyoid does.'
	}),
	...both({
		key: 'mylohyoid', name: 'Mylohyoid', group: 'Suprahyoid', color: '#e0a019',
		meshes: ['mylohyoid'],
		origin: 'Mylohyoid line on the inner surface of the mandible',
		insertion: 'The midline raphe, from the symphysis to the hyoid, and the body of the hyoid',
		action: 'Raises the floor of the mouth; assists jaw opening',
		actionLong: 'Raises the floor of the mouth and the tongue (swallowing); with the hyoid held, helps depress the mandible',
		nerve: 'Nerve to mylohyoid, from the mandibular nerve (V3)',
		note: 'The two mylohyoids are the muscular floor of the mouth, meeting at the midline raphe.'
	}),
	...both({
		key: 'geniohyoid', name: 'Geniohyoid', group: 'Suprahyoid', color: '#3a8f4b',
		meshes: ['geniohyoid'],
		origin: 'Inferior mental spine (genial tubercle), on the back of the symphysis',
		insertion: 'Front of the body of the hyoid',
		action: 'Assists jaw opening; draws the hyoid forward',
		actionLong: 'With the hyoid held, depresses and retrudes the mandible; with the jaw closed, draws the hyoid forward and up',
		nerve: 'C1 fibres, carried by the hypoglossal nerve (XII)',
		note: 'Above the mylohyoid, beside the midline: inside the floor of the mouth.'
	})
];

const sides = (...keys: string[]) => keys.flatMap((k) => [`${k}_r`, `${k}_l`]);
// Demos set all three sliders up front so they play the same from any pose.
const at = (p: Pose): Pose => ({ opening: 0, protrusion: 0, lateral: 0, ...p });

export const movements: Movement[] = [
	{
		id: 'opening', label: 'Opening (depression)', range: '0° → 20°', from: at({}), to: { opening: 20 },
		prime: sides('lat_ptery', 'digastric'), assist: sides('geniohyoid', 'mylohyoid'),
		note: 'Through the first 10° the condyles only turn in their fossae (a hinge); then the lateral pterygoids draw them forward onto the articular eminences as the jaw opens on. The hyoid drops and moves back a little.'
	},
	{
		id: 'closing', label: 'Closing (elevation)', range: '20° → 0°', from: at({ opening: 20 }), to: { opening: 0 },
		prime: sides('temporalis', 'masseter', 'med_ptery'), assist: [],
		note: 'The condyles slide back into their fossae, then hinge shut.'
	},
	{
		id: 'protrusion', label: 'Protrusion', range: '0 → 8 mm', from: at({}), to: { protrusion: 8 },
		prime: sides('lat_ptery', 'med_ptery'), assist: sides('masseter'),
		note: 'Both condyles glide forward and down the eminences; the jaw opens a little as the lower incisors slide down the backs of the upper ones (incisal guidance).'
	},
	{
		id: 'retrusion', label: 'Retrusion', range: '8 → 0 mm', from: at({ protrusion: 8 }), to: { protrusion: 0 },
		prime: sides('temporalis'), assist: sides('digastric', 'geniohyoid'),
		note: 'The posterior, nearly horizontal fibres of temporalis pull the coronoid processes back; the deep masseter helps.'
	},
	{
		id: 'left', label: 'Deviation to the left', range: '0 → 6 mm', from: at({}), to: { lateral: 6 },
		prime: ['lat_ptery_r', 'med_ptery_r'], assist: ['temporalis_l', 'masseter_l'], group: 'Side to side',
		note: 'The right condyle glides forward and down its eminence (the balancing side); the left turns in place (the working side). The canines guide the teeth apart.'
	},
	{
		id: 'right', label: 'Deviation to the right', range: '0 → 6 mm', from: at({}), to: { lateral: -6 },
		prime: ['lat_ptery_l', 'med_ptery_l'], assist: ['temporalis_r', 'masseter_r'], group: 'Side to side',
		note: 'The left condyle glides forward (the balancing side); the right turns in place (the working side).'
	}
];

export const scenarios: Scenario[] = [
	{ q: 'Which muscle of mastication opens the jaw?', a: 'Lateral pterygoid', distractors: ['Medial pterygoid', 'Masseter', 'Temporalis'], focus: sides('lat_ptery'), why: 'It draws the condyles forward onto the eminences; the other three close the jaw.' },
	{ q: 'The first phase of opening (roughly the first 20 mm between the incisors) is mostly…', a: 'Rotation of the condyles in their fossae', distractors: ['Translation of the condyles onto the eminences', 'A sideways glide of the condyles', 'Rotation about the coronoid processes'], showAxes: true, why: 'A hinge in the lower joint compartment (condyle on disc); translation, in the upper compartment (disc on eminence), follows. Watch the condyles with the opening slider.' },
	{ q: 'To swing the jaw to the left, which lateral pterygoid contracts?', a: 'The right', distractors: ['The left', 'Both equally', 'Neither: temporalis does it'], focus: ['lat_ptery_r', 'med_ptery_r'], why: 'The right one pulls the right condyle forward, swinging the chin left about the left condyle; the right medial pterygoid helps.' },
	{ q: 'In deviation to the left, the left condyle…', a: 'Turns in place (the working side)', distractors: ['Glides forward onto the eminence', 'Glides backward out of the fossa', 'Drops straight down'], why: 'The working-side condyle rotates about a vertical axis; the balancing-side (right) condyle glides forward, down and slightly in.' },
	{ q: 'Which nerve supplies all four muscles of mastication?', a: 'Mandibular division of the trigeminal (V3)', distractors: ['Facial nerve (VII)', 'Maxillary division of the trigeminal (V2)', 'Hypoglossal nerve (XII)'], focus: sides('temporalis', 'masseter', 'med_ptery', 'lat_ptery'), why: 'All are first-arch muscles, supplied by V3 (as are the anterior digastric and mylohyoid).' },
	{ q: 'Which part of temporalis retrudes the mandible?', a: 'Its posterior, nearly horizontal fibres', distractors: ['Its anterior, vertical fibres', 'Its middle fibres', 'None: temporalis only elevates'], focus: sides('temporalis'), why: 'They run forward above the ear and turn down to the coronoid process, so they pull it back.' },
	{ q: 'Which two muscles sling the angle of the mandible between them?', a: 'Masseter and medial pterygoid', distractors: ['Masseter and temporalis', 'Medial and lateral pterygoid', 'Temporalis and lateral pterygoid'], focus: sides('masseter', 'med_ptery'), why: 'Masseter on the outside of the ramus, medial pterygoid on the inside, both inserting at the angle: the pterygomasseteric sling.' },
	{ q: 'Why does digastric have two nerves?', a: 'Its bellies come from different pharyngeal arches', distractors: ['It crosses two joints', 'Each belly acts on a different bone', 'One belly is voluntary, the other reflexive'], parts: ['digastric_ant_r', 'digastric_post_r'], why: 'Anterior belly: first arch (nerve to mylohyoid, V3). Posterior belly: second arch (facial nerve, VII).' },
	{ q: 'The suprahyoid muscles open the jaw when…', a: 'The infrahyoids hold the hyoid still', distractors: ['The jaw is already protruded', 'The lateral pterygoids are relaxed', 'The head is flexed'], focus: sides('digastric', 'geniohyoid', 'mylohyoid'), why: 'With the hyoid free, they raise it instead (swallowing). Here the hyoid is held, though it drops and moves back a little as the jaw opens.' },
	{ q: 'Normal maximal opening between the incisors is about…', a: '40–50 mm', distractors: ['20–25 mm', '60–70 mm', '10–15 mm'], why: 'Roughly three fingers’ breadth. Less than about 35 mm is restricted (trismus, a displaced disc).' },
	{ q: 'Jaw opening is a rotation about which axis, at first?', a: 'A mediolateral axis through both condyles', distractors: ['A vertical axis through one condyle', 'An axis through the coronoid processes', 'An anteroposterior axis through the chin'], showAxes: true, why: 'The hinge axis; once the condyles glide forward, the axis moves with them.' }
];
