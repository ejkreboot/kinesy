import manifest from '../../../assets/neck/manifest.json';
import geometryUrl from '../../../assets/neck/geometry.bin.gz?url';
import fieldsUrl from '../../../assets/neck/fields.bin.gz?url';
import bakedUrl from '../../../assets/neck/baked.bin.gz?url';
import type { Vec3 } from '../../core/math';
import type { AssetManifest } from '../../core/types';
import type { JointModule, NamedView } from '../types';
import { movements, muscles, scenarios } from './content';
import { neckPaths } from './paths';
import { reference } from './reference';
import { neckRig, SHARES } from './rig';

const signed = (neg: string, pos: string) => (v: number) => {
	const r = Math.round(v);
	return r === 0 ? '0°' : r < 0 ? `${neg} ${-r}°` : `${pos} ${r}°`;
};

// Viewer frame: origin at the C4–C5 disc, x toward the subject's left, y up, z anterior.
const target: Vec3 = [0, 20, -10];
const views: NamedView[] = [
	{ label: 'Front', preset: { target, dir: [-0.3, 0.1, 0.95], distance: 1150 } },
	{ label: 'Right', preset: { target, dir: [-0.97, 0.1, 0.2], distance: 1150 } },
	{ label: 'Back', preset: { target, dir: [-0.3, 0.15, -0.94], distance: 1150 } },
	{ label: 'Left', preset: { target, dir: [0.97, 0.1, 0.2], distance: 1150 } }
];

export const neck: JointModule = {
	id: 'neck',
	title: 'Neck Movers',
	subtitle: 'Head and cervical spine · drag to rotate · shift-drag to pan',
	assets: { manifest: manifest as unknown as AssetManifest, geometry: geometryUrl, fields: fieldsUrl, baked: bakedUrl },
	rig: neckRig,
	paths: neckPaths,
	controls: [
		{ joint: 'flexion', label: 'Flexion', format: signed('Ext', 'Flex'), ticks: ['Ext 40°', '0', 'Flex 40°'] },
		{ joint: 'lateral', label: 'Lateral flexion', format: signed('R', 'L'), ticks: ['R 30°', '0', 'L 30°'] },
		{ joint: 'rotation', label: 'Rotation', format: signed('R', 'L'), ticks: ['R 60°', '0', 'L 60°'] }
	],
	muscles,
	movements,
	scenarios,
	meshToggles: [{ mesh: 'thorax', label: 'Trunk', initial: true }],
	axisOverlays: [
		{ joint: 'occ1_flex', color: 0x0e6b62, length: 110 },
		{ joint: 'c1c2_rot', color: 0x9b59b6, length: 90 },
		{ joint: 'c4c5_flex', color: 0x0e6b62, length: 70 },
		{ joint: 'c4c5_lat', color: 0xe0a019, length: 70 }
	],
	view: views[0].preset,
	views,
	readout: (p) => {
		const share = (k: 'flex' | 'rot', v: number) => Math.round(Math.abs(v) * (k === 'flex' ? SHARES.occ1.flex : SHARES.c1c2.rot));
		return `Of that: head on C1 ${share('flex', p.flexion ?? 0)}° of the flexion · C1 on C2 ${share('rot', p.rotation ?? 0)}° of the rotation`;
	},
	// turned or bent far, the muscles of one side hide behind the head and neck
	readablePose: (p) => (Math.abs(p.rotation) > 30 || Math.abs(p.lateral) > 15 || Math.abs(p.flexion) > 25 ? { flexion: 0, lateral: 0, rotation: 0 } : null),
	reference,
	referenceLabel: 'Joint'
};
