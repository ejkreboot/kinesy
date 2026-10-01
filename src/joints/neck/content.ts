import type { Pose } from '../../core/rig';
import type { MuscleInfo, Movement, Scenario } from '../types';

/**
 * Both sides' muscles, each side on its own (as the jaw's): bending and turning the head to one side, the two
 * sides do different things (the right sternocleidomastoid turns the face to the left). One colour per muscle.
 */
type Side = 'r' | 'l';
type Base = Omit<MuscleInfo, 'key' | 'name' | 'shortName' | 'meshes' | 'heads' | 'view'> & {
	key: string;
	name: string;
	/** the muscle's meshes without the side (and head labels by mesh, likewise) */
	meshes: string[];
	heads?: Record<string, string>;
	view: 'Front' | 'Back' | 'Side';
};

const SIDE = { r: 'Right', l: 'Left' } as const;
const both = (b: Base): MuscleInfo[] =>
	(['r', 'l'] as Side[]).map((s) => ({
		...b,
		key: `${b.key}_${s}`,
		name: `${SIDE[s]} ${b.name[0].toLowerCase()}${b.name.slice(1)}`,
		shortName: `${SIDE[s].toLowerCase()} ${b.name.toLowerCase()}`,
		meshes: b.meshes.map((m) => `${m}_${s}`),
		heads: b.heads && Object.fromEntries(Object.entries(b.heads).map(([m, h]) => [`${m}_${s}`, h])),
		view: b.view === 'Side' ? SIDE[s] : b.view
	}));

export const muscles: MuscleInfo[] = [
	// ---- front and side ----------------------------------------------------------------------
	...both({
		key: 'scm', name: 'Sternocleidomastoid', group: 'Front and side', color: '#c43c62', meshes: ['scm'], view: 'Side',
		origin: 'Sternal head: front of the manubrium. Clavicular head: medial third of the clavicle',
		insertion: 'Mastoid process and the lateral half of the superior nuchal line',
		action: 'Lateral flexion to the same side; rotation to the other side; flexion (both)',
		actionLong: 'One side bends the neck to its own side and turns the face to the other side; both together flex the neck and push the head forward (and, with the neck held, extend the head on it)',
		nerve: 'Accessory nerve (CN XI); C2–C3 for sensation',
		note: 'The landmark of the neck, dividing it into anterior and posterior triangles. Shortened on one side, it holds the head tilted toward it and the face turned away: torticollis (wry neck).'
	}),
	...both({
		key: 'scalene_ant', name: 'Scalenus anterior', group: 'Front and side', color: '#d9732b', meshes: ['scalene_ant'], view: 'Front',
		origin: 'Anterior tubercles of the transverse processes of C3–C6',
		insertion: 'Scalene tubercle of the first rib',
		action: 'Lateral flexion; flexion; raises the first rib',
		actionLong: 'With the rib fixed, bends the neck to its own side and helps flex it; with the neck fixed, raises the first rib (breathing in hard)',
		nerve: 'Anterior rami of C4–C6',
		note: 'The subclavian vein passes in front of it, the subclavian artery and the brachial plexus behind it, between it and scalenus medius (the interscalene triangle; thoracic outlet syndrome).'
	}),
	...both({
		key: 'scalene_mid', name: 'Scalenus medius', group: 'Front and side', color: '#e0a019', meshes: ['scalene_mid'], view: 'Side',
		origin: 'Posterior tubercles of the transverse processes of C2–C7',
		insertion: 'Upper surface of the first rib, behind the groove for the subclavian artery',
		action: 'Lateral flexion; raises the first rib',
		actionLong: 'With the rib fixed, bends the neck to its own side; with the neck fixed, raises the first rib',
		nerve: 'Anterior rami of C3–C8',
		note: 'The largest scalene. The brachial plexus and subclavian artery pass in front of it.'
	}),
	...both({
		key: 'scalene_post', name: 'Scalenus posterior', group: 'Front and side', color: '#b8577f', meshes: ['scalene_post'], view: 'Side',
		origin: 'Posterior tubercles of the transverse processes of C5–C7',
		insertion: 'Outer surface of the second rib',
		action: 'Lateral flexion; raises the second rib',
		actionLong: 'With the rib fixed, bends the neck to its own side; with the neck fixed, raises the second rib',
		nerve: 'Anterior rami of C6–C8',
		note: 'The smallest and deepest scalene, and the only one to reach the second rib.'
	}),
	...both({
		key: 'longus_colli', name: 'Longus colli', group: 'Front and side', color: '#3f88d4', view: 'Front',
		meshes: ['longus_colli_sup', 'longus_colli_vert', 'longus_colli_inf'],
		heads: { longus_colli_sup: 'Superior oblique part', longus_colli_vert: 'Vertical part', longus_colli_inf: 'Inferior oblique part' },
		origin: 'Superior oblique part: transverse processes of C3–C5. Vertical part: bodies of T1–T3 and C5–C7. Inferior oblique part: bodies of T1–T3',
		insertion: 'Anterior tubercle of the atlas, bodies of C2–C4, and the transverse processes of C5–C6',
		action: 'Neck flexion',
		actionLong: 'Flexes the cervical spine and holds its curve (the lordosis) against extension; one side helps bend and turn the neck',
		nerve: 'Anterior rami of C2–C6',
		note: 'A deep neck flexor lying on the front of the vertebral bodies. Weak, with longus capitis, in many people with neck pain; the craniocervical flexion test trains and tests them.'
	}),
	...both({
		key: 'longus_cap', name: 'Longus capitis', group: 'Front and side', color: '#5d3480', meshes: ['longus_cap'], view: 'Front',
		origin: 'Anterior tubercles of the transverse processes of C3–C6',
		insertion: 'Basilar part of the occipital bone',
		action: 'Head and neck flexion',
		actionLong: 'Flexes the head on the neck (nodding) and the upper neck',
		nerve: 'Anterior rami of C1–C3',
		note: 'In front of longus colli, behind the pharynx: a deep neck flexor.'
	}),
	...both({
		key: 'rca', name: 'Rectus capitis anterior', group: 'Front and side', color: '#7a3b8f', meshes: ['rca'], view: 'Front',
		origin: 'Front of the lateral mass of the atlas',
		insertion: 'Basilar part of the occipital bone, in front of the foramen magnum',
		action: 'Head flexion',
		actionLong: 'Flexes the head on the atlas (nodding) and steadies it',
		nerve: 'Anterior rami of C1–C2',
		note: 'A short muscle at the atlanto-occipital joint, the front counterpart of the suboccipitals.'
	}),
	...both({
		key: 'rcl', name: 'Rectus capitis lateralis', group: 'Front and side', color: '#a35bb8', meshes: ['rcl'], view: 'Front',
		origin: 'Upper surface of the transverse process of the atlas',
		insertion: 'Jugular process of the occipital bone',
		action: 'Lateral flexion of the head',
		actionLong: 'Bends the head to its own side on the atlas and steadies it',
		nerve: 'Anterior rami of C1–C2',
		note: 'The lateral counterpart of rectus capitis anterior.'
	}),
	// ---- back ----------------------------------------------------------------------------------
	...both({
		key: 'trap_upper', name: 'Upper trapezius', group: 'Back of the neck', color: '#2f9e8f', meshes: ['trap_upper'], view: 'Back',
		origin: 'External occipital protuberance, medial third of the superior nuchal line, and the nuchal ligament',
		insertion: 'Lateral third of the clavicle (posterior border)',
		action: 'Extension; lateral flexion to the same side; rotation to the other side',
		actionLong: 'With the shoulder fixed, extends the head and neck, bends them to its own side and turns the face to the other side; with the neck fixed, elevates and upwardly rotates the scapula',
		nerve: 'Accessory nerve (CN XI); C3–C4 for sensation',
		note: 'Shares its nerve (CN XI) and its turn to the opposite side with sternocleidomastoid. Here only its descending (upper) part is shown.'
	}),
	...both({
		key: 'levator', name: 'Levator scapulae', group: 'Back of the neck', color: '#3a8f4b', meshes: ['levator'], view: 'Back',
		origin: 'Transverse processes of C1–C4',
		insertion: 'Medial border of the scapula, from the superior angle to the root of the spine',
		action: 'Lateral flexion and rotation to the same side',
		actionLong: 'With the scapula fixed, bends the neck to its own side and turns it toward that side; with the neck fixed, elevates the scapula and rotates it downward',
		nerve: 'Dorsal scapular nerve (C5) and C3–C4',
		note: 'Its slips twist: the one from C1 reaches lowest on the scapula. A common source of neck and shoulder-blade pain.'
	}),
	...both({
		key: 'splenius_cap', name: 'Splenius capitis', group: 'Back of the neck', color: '#c9463d', meshes: ['splenius_cap'], view: 'Back',
		origin: 'Lower half of the nuchal ligament and the spinous processes of C7–T3',
		insertion: 'Mastoid process and the lateral superior nuchal line, under sternocleidomastoid',
		action: 'Extension; lateral flexion and rotation to the same side',
		actionLong: 'Both together extend the head and neck; one side bends the neck to its own side and turns the face toward that side',
		nerve: 'Posterior rami of C3–C4',
		note: 'Turns the face to its own side: with the opposite sternocleidomastoid, it turns the head.'
	}),
	...both({
		key: 'splenius_cerv', name: 'Splenius cervicis', group: 'Back of the neck', color: '#e57a64', meshes: ['splenius_cerv'], view: 'Back',
		origin: 'Spinous processes of T3–T6',
		insertion: 'Posterior tubercles of the transverse processes of C1–C3',
		action: 'Extension; lateral flexion and rotation to the same side',
		actionLong: 'Both together extend the neck; one side bends it to its own side and turns it toward that side',
		nerve: 'Posterior rami of the lower cervical nerves',
		note: 'Splenius capitis’s lower, deeper partner: it ends on the neck, not the skull.'
	}),
	...both({
		key: 'semispinalis_cap', name: 'Semispinalis capitis', group: 'Back of the neck', color: '#8a6d3b', meshes: ['semispinalis_cap'], view: 'Back',
		origin: 'Transverse processes of C7–T6 and the articular processes of C4–C6',
		insertion: 'Occipital bone, between the superior and inferior nuchal lines',
		action: 'Head and neck extension',
		actionLong: 'Extends the head and neck; one side helps turn the face to the other side',
		nerve: 'Posterior rami of the cervical nerves (greater occipital nerve, C2)',
		note: 'The thick rope beside the midline at the back of the neck; the greater occipital nerve pierces it on its way to the scalp.'
	}),
	...both({
		key: 'semispinalis_cerv', name: 'Semispinalis cervicis', group: 'Back of the neck', color: '#6b8e23', meshes: ['semispinalis_cerv'], view: 'Back',
		origin: 'Transverse processes of T1–T6',
		insertion: 'Spinous processes of C2–C5',
		action: 'Neck extension; rotation to the other side',
		actionLong: 'Extends the cervical spine; one side turns it toward the other side (a transversospinal muscle)',
		nerve: 'Posterior rami of the cervical nerves',
		note: 'Deep to semispinalis capitis. Its biggest attachment is the bifid spine of C2.'
	}),
	...both({
		key: 'longissimus_cap', name: 'Longissimus capitis', group: 'Back of the neck', color: '#4682b4', meshes: ['longissimus_cap'], view: 'Back',
		origin: 'Transverse processes of T1–T5 and the articular processes of C4–C7',
		insertion: 'Back of the mastoid process',
		action: 'Extension; lateral flexion and rotation to the same side',
		actionLong: 'Extends the head; one side bends it to its own side and turns the face toward that side',
		nerve: 'Posterior rami of the cervical nerves',
		note: 'The top of the longissimus column of erector spinae, lateral to semispinalis capitis.'
	}),
	// ---- suboccipital --------------------------------------------------------------------------
	...both({
		key: 'rcp_major', name: 'Rectus capitis posterior major', group: 'Suboccipital', color: '#d4a017', meshes: ['rcp_major'], view: 'Back',
		origin: 'Spinous process of the axis (C2)',
		insertion: 'Lateral part of the inferior nuchal line',
		action: 'Head extension; rotation to the same side',
		actionLong: 'Extends the head on the atlas and axis, and turns the face to its own side (C1 on C2)',
		nerve: 'Suboccipital nerve (posterior ramus of C1)',
		note: 'Forms the suboccipital triangle’s medial side, with the two obliques.'
	}),
	...both({
		key: 'rcp_minor', name: 'Rectus capitis posterior minor', group: 'Suboccipital', color: '#c08552', meshes: ['rcp_minor'], view: 'Back',
		origin: 'Posterior tubercle of the atlas (C1)',
		insertion: 'Medial part of the inferior nuchal line',
		action: 'Head extension',
		actionLong: 'Extends the head on the atlas',
		nerve: 'Suboccipital nerve (posterior ramus of C1)',
		note: 'Rich in muscle spindles: a sensor of head position as much as a mover. Connective tissue links it to the dura.'
	}),
	...both({
		key: 'obl_sup', name: 'Obliquus capitis superior', group: 'Suboccipital', color: '#20b2aa', meshes: ['obl_sup'], view: 'Back',
		origin: 'Transverse process of the atlas',
		insertion: 'Occipital bone, between the nuchal lines',
		action: 'Head extension; lateral flexion to the same side',
		actionLong: 'Extends the head and bends it to its own side, at the atlanto-occipital joint',
		nerve: 'Suboccipital nerve (posterior ramus of C1)',
		note: 'The lateral side of the suboccipital triangle.'
	}),
	...both({
		key: 'obl_inf', name: 'Obliquus capitis inferior', group: 'Suboccipital', color: '#ff7f50', meshes: ['obl_inf'], view: 'Back',
		origin: 'Spinous process of the axis (C2)',
		insertion: 'Transverse process of the atlas (C1)',
		action: 'Rotation of the atlas to the same side',
		actionLong: 'Turns the atlas, and the head with it, to its own side on the axis',
		nerve: 'Suboccipital nerve (posterior ramus of C1)',
		note: 'The only "capitis" muscle that doesn’t attach to the skull. The lower side of the suboccipital triangle.'
	})
];

const sides = (...keys: string[]) => keys.flatMap((k) => [`${k}_r`, `${k}_l`]);
// Demos set all three sliders up front so they play the same from any pose.
const at = (p: Pose): Pose => ({ flexion: 0, lateral: 0, rotation: 0, ...p });

export const movements: Movement[] = [
	{
		id: 'flexion', label: 'Flexion', range: '0° → 40°', from: at({}), to: { flexion: 40 },
		prime: sides('scm', 'longus_colli', 'longus_cap'), assist: sides('scalene_ant', 'rca'),
		note: 'The head nods on the atlas (about a fifth of the movement) and the cervical spine bends below it.'
	},
	{
		id: 'extension', label: 'Extension', range: '0° → 40°', from: at({}), to: { flexion: -40 },
		prime: sides('splenius_cap', 'splenius_cerv', 'semispinalis_cap', 'trap_upper'),
		assist: sides('semispinalis_cerv', 'longissimus_cap', 'levator', 'rcp_major', 'rcp_minor', 'obl_sup')
	},
	{
		id: 'latRight', label: 'Lateral flexion, right', range: '0° → 30°', from: at({}), to: { lateral: -30 }, group: 'Side',
		prime: ['scm_r', 'scalene_ant_r', 'scalene_mid_r', 'scalene_post_r', 'trap_upper_r'],
		assist: ['splenius_cap_r', 'splenius_cerv_r', 'levator_r', 'longissimus_cap_r', 'rcl_r'],
		note: 'The muscles on the side it bends toward.'
	},
	{
		id: 'latLeft', label: 'Lateral flexion, left', range: '0° → 30°', from: at({}), to: { lateral: 30 }, group: 'Side',
		prime: ['scm_l', 'scalene_ant_l', 'scalene_mid_l', 'scalene_post_l', 'trap_upper_l'],
		assist: ['splenius_cap_l', 'splenius_cerv_l', 'levator_l', 'longissimus_cap_l', 'rcl_l']
	},
	{
		id: 'rotRight', label: 'Rotation, right', range: '0° → 60°', from: at({}), to: { rotation: -60 }, group: 'Side',
		prime: ['scm_l', 'splenius_cap_r', 'splenius_cerv_r', 'obl_inf_r'],
		assist: ['trap_upper_l', 'rcp_major_r', 'longissimus_cap_r', 'levator_r', 'semispinalis_cerv_l'],
		note: 'The opposite sternocleidomastoid and the same side’s splenii. About half of the turn is the atlas turning on the dens (C1–C2).'
	},
	{
		id: 'rotLeft', label: 'Rotation, left', range: '0° → 60°', from: at({}), to: { rotation: 60 }, group: 'Side',
		prime: ['scm_r', 'splenius_cap_l', 'splenius_cerv_l', 'obl_inf_l'],
		assist: ['trap_upper_r', 'rcp_major_l', 'longissimus_cap_l', 'levator_l', 'semispinalis_cerv_r']
	}
];

export const scenarios: Scenario[] = [
	{ q: 'Contracting alone, the right sternocleidomastoid turns the face…', a: 'To the left, tilting the head to the right', distractors: ['To the right, tilting the head to the right', 'To the left, tilting the head to the left', 'Straight up (extension)'], focus: ['scm_r'], why: 'It runs from the sternum and clavicle up and back to the mastoid: it pulls the mastoid down and forward, turning the face away and bending the neck toward itself.' },
	{ q: 'About half of the neck’s rotation takes place at…', a: 'The atlanto-axial joint (C1–C2)', distractors: ['The atlanto-occipital joint', 'C5–C6', 'C7–T1'], showAxes: true, why: 'The atlas turns about the dens of the axis: a pivot joint.' },
	{ q: 'Nodding "yes" takes place mostly at…', a: 'The atlanto-occipital joint', distractors: ['The atlanto-axial joint', 'C4–C5', 'C7–T1'], showAxes: true, why: 'The occipital condyles rock in the atlas’s concave facets: flexion and extension, a little lateral flexion, almost no rotation.' },
	{ q: 'Which nerve supplies sternocleidomastoid and trapezius?', a: 'Accessory nerve (CN XI)', distractors: ['Phrenic nerve', 'Dorsal scapular nerve', 'Suboccipital nerve'], focus: sides('scm', 'trap_upper'), why: 'The spinal accessory nerve, with sensory fibres from C2–C4. Test it by shrugging and by turning the head against resistance.' },
	{ q: 'Which of these suboccipital muscles does not attach to the skull?', a: 'Obliquus capitis inferior', distractors: ['Obliquus capitis superior', 'Rectus capitis posterior major', 'Rectus capitis posterior minor'], focus: sides('obl_inf'), why: 'It runs from the spinous process of C2 to the transverse process of C1, and turns the atlas (and head) to its own side.' },
	{ q: 'The suboccipital triangle is bounded by rectus capitis posterior major and…', a: 'Obliquus capitis superior and inferior', distractors: ['Rectus capitis posterior minor and the trapezius', 'Semispinalis capitis and splenius capitis', 'Longissimus capitis and the levator'], focus: sides('rcp_major', 'obl_sup', 'obl_inf'), why: 'The vertebral artery and the suboccipital nerve (C1) lie in its floor.' },
	{ q: 'Which scalene reaches the second rib?', a: 'Scalenus posterior', distractors: ['Scalenus anterior', 'Scalenus medius', 'None: all end on the first rib'], focus: sides('scalene_post'), why: 'Anterior and medius end on the first rib; posterior, the smallest, on the second.' },
	{ q: 'The brachial plexus and subclavian artery pass between…', a: 'Scalenus anterior and scalenus medius', distractors: ['Scalenus medius and scalenus posterior', 'Sternocleidomastoid and scalenus anterior', 'Longus colli and scalenus anterior'], focus: sides('scalene_ant', 'scalene_mid'), why: 'The interscalene triangle, above the first rib; tight or anomalous scalenes can compress them (thoracic outlet syndrome).' },
	{ q: 'Splenius capitis turns the face…', a: 'To its own side', distractors: ['To the other side', 'Upward only', 'It does not rotate'], focus: sides('splenius_cap'), why: 'It runs up and out from the spinous processes to the mastoid. Turning the head to the right uses the right splenii with the left sternocleidomastoid.' },
	{ q: 'Torticollis, the head tilted to one side and the face turned to the other, comes from shortening of…', a: 'Sternocleidomastoid', distractors: ['Trapezius', 'Scalenus anterior', 'Levator scapulae'], focus: sides('scm'), why: 'One sternocleidomastoid bends the neck toward itself and turns the face away; shortened (congenitally, or in spasm), it holds that posture.' },
	{ q: 'Which muscles are the deep neck flexors?', a: 'Longus colli and longus capitis', distractors: ['Sternocleidomastoid and the scalenes', 'Splenius capitis and cervicis', 'The suboccipitals'], focus: sides('longus_colli', 'longus_cap'), why: 'On the front of the vertebrae; they flex the neck and hold its curve, and are trained with the chin tuck.' }
];
