import manifest from '../../../assets/jaw/manifest.json';
import geometryUrl from '../../../assets/jaw/geometry.bin.gz?url';
import fieldsUrl from '../../../assets/jaw/fields.bin.gz?url';
import bakedUrl from '../../../assets/jaw/baked.bin.gz?url';
import { rigidApply, type Vec3 } from '../../core/math';
import { Rig } from '../../core/rig';
import type { AssetManifest } from '../../core/types';
import type { JointModule, NamedView } from '../types';
import { movements, muscles, scenarios } from './content';
import { jawPaths } from './paths';
import { reference } from './reference';
import { HINGE_ONLY, jawRig, jawState, MAX_OPENING } from './rig';

const m = manifest as unknown as AssetManifest;

// Viewer frame: origin midway between the condyles' centres, x toward the subject's left, y up, z anterior.
const target: Vec3 = [0, -30, 35];
const views: NamedView[] = [
	{ label: 'Right', preset: { target, dir: [-0.97, 0.12, 0.22], distance: 620 } },
	{ label: 'Front', preset: { target, dir: [-0.3, 0.1, 0.95], distance: 620 } },
	{ label: 'Left', preset: { target, dir: [0.97, 0.12, 0.22], distance: 620 } },
	{ label: 'Below', preset: { target: [0, -50, 30], dir: [-0.25, -0.85, 0.46], distance: 560 } }
];

// the incisors' edges (between the central incisors), for the readout: lower on the mandible, upper on the skull
const LOWER_INCISOR: Vec3 = [0.36, -43.54, 77.94], UPPER_INCISOR: Vec3 = [0.19, -43.25, 81.91];
const rig = new Rig(jawRig, m.axes, m.bones);

const mm = (v: number) => `${Math.round(v)} mm`;
const side = (v: number) => (Math.round(v) === 0 ? '0 mm' : `${v < 0 ? 'R' : 'L'} ${mm(Math.abs(v))}`);

export const jaw: JointModule = {
	id: 'jaw',
	title: 'Jaw Movers',
	subtitle: 'Both temporomandibular joints · drag to rotate · shift-drag to pan',
	assets: { manifest: m, geometry: geometryUrl, fields: fieldsUrl, baked: bakedUrl },
	rig: jawRig,
	paths: jawPaths,
	controls: [
		{ joint: 'opening', label: 'Opening', format: (v) => `${Math.round(v)}°`, ticks: ['Closed', `Hinge to ${HINGE_ONLY}°`, `${MAX_OPENING}°`] },
		{ joint: 'protrusion', label: 'Protrusion', format: mm, ticks: ['0', '4 mm', '8 mm'] },
		{ joint: 'lateral', label: 'Lateral deviation', format: side, ticks: ['R 6 mm', '0', 'L 6 mm'] }
	],
	muscles,
	movements,
	scenarios,
	meshToggles: [
		{ mesh: 'skull', label: 'Skull', initial: true },
		{ mesh: 'mandible', label: 'Mandible', initial: true }
	],
	axisOverlays: [
		{ joint: 'hinge', color: 0x0e6b62, length: 140 },
		{ joint: 'swing', color: 0x9b59b6, length: 90, offset: -20 }
	],
	view: views[0].preset,
	views,
	readout: (p) => {
		const j = jawState(p), w = rig.solve(rig.clamp(p))[1], i = rigidApply(w, LOWER_INCISOR);
		const gap = Math.hypot(i[0] - UPPER_INCISOR[0], i[1] - UPPER_INCISOR[1], i[2] - UPPER_INCISOR[2]);
		const glide = (g: number) => (g < 0.5 ? 'in its fossa' : `${g.toFixed(0)} mm forward`);
		return `Incisors ${mm(gap)} apart · right condyle ${glide(j.right.glide)}, left ${glide(j.left.glide)}`;
	},
	// open or swung aside, the mandible hides the pterygoids and the floor of the mouth
	readablePose: (p) => (p.opening > 12 || Math.abs(p.lateral) > 4 ? { opening: 0, protrusion: 0, lateral: 0 } : null),
	reference,
	referenceLabel: 'Joint'
};
