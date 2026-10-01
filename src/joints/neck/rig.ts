import type { Pose, RigDef, RigJointDef } from '../../core/rig';

/**
 * The neck: the head on C1, C1 on C2, and so on down to C7 on a fixed thorax (T1–T6, sternum, first ribs,
 * clavicles and scapulae). Each level turns about its own centre on three axes in its own frame (fitted in
 * pipeline/lib/spine.py): flexion, lateral flexion and rotation. Three sliders move the whole neck; each level
 * takes its share, after the typical range of motion level by level (adults, in vivo):
 *
 *   - nodding is the atlanto-occipital joint's: about a fifth of flexion and extension is the head on C1
 *   - turning is the atlanto-axial joint's: about half of rotation is C1 turning about the dens
 *   - lateral flexion is mostly C2–C6
 *
 * The meshes were captured upright, looking ahead, so every rest angle is 0.
 */
export const LEVELS = ['c7t1', 'c6c7', 'c5c6', 'c4c5', 'c3c4', 'c2c3', 'c1c2', 'occ1'] as const;
type Level = (typeof LEVELS)[number];

/** each level's share of the whole neck's flexion / extension, lateral flexion and rotation */
export const SHARES: Record<Level, { flex: number; lat: number; rot: number }> = {
	c7t1: { flex: 0.1, lat: 0.08, rot: 0.05 },
	c6c7: { flex: 0.13, lat: 0.12, rot: 0.08 },
	c5c6: { flex: 0.15, lat: 0.14, rot: 0.08 },
	c4c5: { flex: 0.15, lat: 0.18, rot: 0.08 },
	c3c4: { flex: 0.11, lat: 0.18, rot: 0.08 },
	c2c3: { flex: 0.08, lat: 0.16, rot: 0.05 },
	c1c2: { flex: 0.1, lat: 0.06, rot: 0.52 },
	occ1: { flex: 0.18, lat: 0.08, rot: 0.06 }
};

/** the bone each level moves (on the one below it) */
const MOVES: Record<Level, string> = { c7t1: 'c7', c6c7: 'c6', c5c6: 'c5', c4c5: 'c4', c3c4: 'c3', c2c3: 'c2', c1c2: 'c1', occ1: 'head' };

const level = (l: Level): RigJointDef[] =>
	(['flex', 'lat', 'rot'] as const).map((k) => {
		const slider = k === 'flex' ? 'flexion' : k === 'lat' ? 'lateral' : 'rotation';
		return { id: `${l}_${k}`, axis: `${l}_${k}`, restAngle: 0, min: 0, max: 0, initial: 0, coupled: (p: Pose) => SHARES[l][k] * (p[slider] ?? 0) };
	});

export const neckRig: RigDef = {
	bones: [
		{ name: 'thorax', parent: -1 },
		...LEVELS.map((l, i) => ({ name: MOVES[l], parent: i, joints: [`${l}_flex`, `${l}_lat`, `${l}_rot`] }))
	],
	joints: [
		// the sliders: + flexion / − extension; + bending / turning to the subject's left, − to the right
		{ id: 'flexion', restAngle: 0, min: -40, max: 40, initial: 0 },
		{ id: 'lateral', restAngle: 0, min: -30, max: 30, initial: 0 },
		{ id: 'rotation', restAngle: 0, min: -60, max: 60, initial: 0 },
		...LEVELS.flatMap(level)
	]
};
