import manifest from '../../../assets/hip/manifest.json';
import geometryUrl from '../../../assets/hip/geometry.bin.gz?url';
import fieldsUrl from '../../../assets/hip/fields.bin.gz?url';
import bakedUrl from '../../../assets/hip/baked.bin.gz?url';
import type { AssetManifest } from '../../core/types';
import type { JointModule, NamedView } from '../types';
import { movements, muscles, scenarios } from './content';
import { hipPaths } from './paths';
import { reference } from './reference';
import { hipRig } from './rig';

const signed = (neg: string, pos: string) => (v: number) => {
	const r = Math.round(v);
	return r === 0 ? '0°' : r < 0 ? `${neg} ${-r}°` : `${pos} ${r}°`;
};

// Viewer frame: origin at the femoral head's centre, x toward the subject's left (the midline is at about
// x = 90), y up, z anterior.
const target: [number, number, number] = [30, -90, 0];
const views: NamedView[] = [
	{ label: 'Front', preset: { target, dir: [-0.3, 0.12, 0.95], distance: 1300 } },
	{ label: 'Side', preset: { target, dir: [-0.98, 0.12, 0.12], distance: 1300 } },
	{ label: 'Back', preset: { target, dir: [-0.3, 0.12, -0.95], distance: 1300 } }
];

export const hip: JointModule = {
	id: 'hip',
	title: 'Hip Movers',
	subtitle: 'Right hip · drag to rotate · shift-drag to pan',
	assets: { manifest: manifest as unknown as AssetManifest, geometry: geometryUrl, fields: fieldsUrl, baked: bakedUrl },
	rig: hipRig,
	paths: hipPaths,
	controls: [
		{ joint: 'flexion', label: 'Flexion', format: signed('Ext', 'Flex'), ticks: ['Ext 20°', '50°', 'Flex 120°'] },
		{ joint: 'abduction', label: 'Abduction', format: signed('Add', 'Abd'), ticks: ['Add 20°', '12°', 'Abd 45°'] },
		{ joint: 'rotation', label: 'Rotation', format: signed('ER', 'IR'), ticks: ['ER 45°', '', 'IR 40°'] }
	],
	muscles,
	movements,
	scenarios,
	// the deep rotators and iliacus lie against the pelvis's inner and outer walls
	meshToggles: [{ mesh: 'pelvis', label: 'Pelvis', initial: true }],
	axisOverlays: [
		{ joint: 'flexion', color: 0x0e6b62, length: 160 },
		{ joint: 'abduction', color: 0xe0a019, length: 160 },
		{ joint: 'rotation', color: 0x9b59b6, length: 520, offset: -230 }
	],
	view: views[0].preset,
	views,
	// deep flexion hides the front of the hip, rotation the deep rotators; return to standing to identify
	readablePose: (p) => (p.flexion > 60 || Math.abs(p.rotation) > 25 || Math.abs(p.abduction) > 25 ? { flexion: 0, abduction: 0, rotation: 0 } : null),
	reference,
	referenceLabel: 'Joint'
};
