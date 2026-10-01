import manifest from '../../../assets/knee/manifest.json';
import geometryUrl from '../../../assets/knee/geometry.bin.gz?url';
import fieldsUrl from '../../../assets/knee/fields.bin.gz?url';
import bakedUrl from '../../../assets/knee/baked.bin.gz?url';
import type { AssetManifest } from '../../core/types';
import type { JointModule, NamedView } from '../types';
import { movements, muscles, scenarios } from './content';
import { kneePaths } from './paths';
import { reference } from './reference';
import { kneeRig, rotationFreedom, screwHome } from './rig';

const signed = (neg: string, pos: string) => (v: number) => {
	const r = Math.round(v);
	return r === 0 ? '0°' : r < 0 ? `${neg} ${-r}°` : `${pos} ${r}°`;
};

// Viewer frame: origin on the flexion axis between the femoral epicondyles, x toward the subject's left,
// y up, z anterior.
const target: [number, number, number] = [0, 0, 10];
const views: NamedView[] = [
	{ label: 'Front', preset: { target, dir: [-0.25, 0.12, 0.96], distance: 1100 } },
	{ label: 'Side', preset: { target, dir: [-0.98, 0.12, 0.12], distance: 1100 } },
	{ label: 'Back', preset: { target, dir: [-0.25, 0.12, -0.96], distance: 1100 } }
];

export const knee: JointModule = {
	id: 'knee',
	title: 'Knee Movers',
	subtitle: 'Right knee · drag to rotate · shift-drag to pan',
	assets: { manifest: manifest as unknown as AssetManifest, geometry: geometryUrl, fields: fieldsUrl, baked: bakedUrl },
	rig: kneeRig,
	paths: kneePaths,
	controls: [
		{ joint: 'flexion', label: 'Flexion', format: signed('Hyperext', 'Flex'), ticks: ['Hyperext 5°', '', 'Flex 70°'] },
		{ joint: 'rotation', label: 'Tibial rotation', format: signed('ER', 'IR'), ticks: ['ER 30°', '', 'IR 25°'] }
	],
	muscles,
	movements,
	scenarios,
	meshToggles: [],
	axisOverlays: [
		{ joint: 'flexion', color: 0x0e6b62, length: 160 },
		{ joint: 'rotation', color: 0x9b59b6, length: 420, offset: -200 }
	],
	view: views[0].preset,
	views,
	readout: (p) => {
		const f = p.flexion ?? 0, free = rotationFreedom(f), turned = (p.rotation ?? 0) * free + screwHome(f);
		const lock = free < 0.05 ? 'locked in extension' : free < 0.95 ? `${Math.round(free * 100)}% free` : 'free';
		return `Tibial rotation ${lock}: ${Math.abs(Math.round(turned))}° ${turned >= 0 ? 'internal' : 'external'} (${Math.round(screwHome(f))}° of it from unlocking)`;
	},
	reference,
	referenceLabel: 'Joint'
};
