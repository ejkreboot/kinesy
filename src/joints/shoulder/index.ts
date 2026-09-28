import manifest from '../../../assets/shoulder/manifest.json';
import geometryUrl from '../../../assets/shoulder/geometry.bin.gz?url';
import fieldsUrl from '../../../assets/shoulder/fields.bin.gz?url';
import type { AssetManifest } from '../../core/types';
import type { JointModule, NamedView } from '../types';
import { movements, muscles, scenarios } from './content';
import { reference } from './reference';
import { armElevation, scapularUpwardRotation, shoulderRig } from './rig';

const signed = (neg: string, pos: string) => (v: number) => {
	const r = Math.round(v);
	return r === 0 ? '0°' : r < 0 ? `${neg} ${-r}°` : `${pos} ${r}°`;
};

// Viewer frame: origin at the humeral head center, x toward the subject's left (the midline is at
// about x = 160), y up, z anterior.
const target: [number, number, number] = [80, -180, 10];
const views: NamedView[] = [
	{ label: 'Front', preset: { target, dir: [-0.42, 0.14, 0.9], distance: 2150 } },
	{ label: 'Side', preset: { target, dir: [-0.98, 0.14, 0.12], distance: 2150 } },
	{ label: 'Back', preset: { target, dir: [-0.42, 0.14, -0.9], distance: 2150 } }
];

export const shoulder: JointModule = {
	id: 'shoulder',
	title: 'Shoulder Movers',
	subtitle: 'Right shoulder · drag to rotate',
	assets: { manifest: manifest as unknown as AssetManifest, geometry: geometryUrl, fields: fieldsUrl },
	rig: shoulderRig,
	controls: [
		{ joint: 'flexion', label: 'Flexion', format: signed('Ext', 'Flex'), ticks: ['Ext 60°', '60°', 'Flex 180°'] },
		{ joint: 'abduction', label: 'Abduction', format: signed('Add', 'Abd'), ticks: ['Add 40°', '70°', 'Abd 180°'] },
		{ joint: 'rotation', label: 'Rotation', format: signed('ER', 'IR'), ticks: ['ER 90°', '', 'IR 70°'] },
		{ joint: 'elevation', label: 'Girdle elev / dep', format: signed('Dep', 'Elev'), ticks: ['Dep 10°', '', 'Elev 35°'] },
		{ joint: 'protraction', label: 'Girdle pro / retract', format: signed('Retract', 'Protract'), ticks: ['Retract 25°', '0°', 'Protract 25°'] }
	],
	muscles,
	movements,
	scenarios,
	meshToggles: [{ mesh: 'thorax', label: 'Rib cage', initial: true, opacity: 0.5 }],
	axisOverlays: [
		{ joint: 'flexion', color: 0x0e6b62, length: 130 },
		{ joint: 'abduction', color: 0xe0a019, length: 130 },
		{ joint: 'rotation', color: 0x9b59b6, length: 380, offset: -140 },
		{ joint: 'upwardRotation', color: 0xc9463d, length: 110 }
	],
	view: views[0].preset,
	views,
	readout: (p) => {
		const arm = Math.round(armElevation(p));
		const st = Math.round(scapularUpwardRotation(p));
		return st === 0
			? `Arm elevation ${arm}°: glenohumeral only (the scapula joins after about 30°)`
			: `Arm elevation ${arm}° = glenohumeral ${arm - st}° + scapular upward rotation ${st}°`;
	},
	// far-off arm positions hide the axilla and chest wall; return to the rest pose to identify
	readablePose: (p) =>
		armElevation(p) > 100 || p.flexion < -30 || Math.abs(p.rotation) > 45 || Math.abs(p.protraction) > 15
			? { flexion: 0, abduction: 10, rotation: 0, elevation: 0, protraction: 0 }
			: null,
	reference,
	referenceLabel: 'Joint'
};
