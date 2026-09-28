import manifest from '../../../assets/hand/manifest.json';
import geometryUrl from '../../../assets/hand/geometry.bin.gz?url';
import fieldsUrl from '../../../assets/hand/fields.bin.gz?url';
import type { AssetManifest } from '../../core/types';
import type { JointModule, NamedView } from '../types';
import { movements, muscles, scenarios } from './content';
import { reference } from './reference';
import { HAND_DEFORMER, HAND_REST, handRig } from './rig';

const signed = (neg: string, pos: string) => (v: number) => {
	const r = Math.round(v);
	return r === 0 ? '0°' : r < 0 ? `${neg} ${-r}°` : `${pos} ${r}°`;
};
const deg = (v: number) => `${Math.round(v)}°`;

// Viewer frame: origin at the wrist (head of the capitate), y up the forearm, z out of the palm.
// The hand hangs down to about y = -150.
const target: [number, number, number] = [0, -75, 0];
const views: NamedView[] = [
	{ label: 'Palm', preset: { target, dir: [-0.28, 0.12, 0.95], distance: 520 } },
	{ label: 'Thumb side', preset: { target, dir: [-0.96, 0.12, 0.25], distance: 520 } },
	{ label: 'Back', preset: { target, dir: [-0.28, 0.12, -0.95], distance: 520 } }
];

export const hand: JointModule = {
	id: 'hand',
	title: 'Wrist & Hand Movers',
	subtitle: 'Right wrist and hand · drag to rotate',
	assets: { manifest: manifest as unknown as AssetManifest, geometry: geometryUrl, fields: fieldsUrl },
	rig: handRig,
	deformer: HAND_DEFORMER,
	controls: [
		{ group: 'Wrist', joint: 'wristFlexion', label: 'Flexion / extension', format: signed('Ext', 'Flex'), ticks: ['Ext 70°', '', 'Flex 80°'] },
		{ group: 'Wrist', joint: 'wristDeviation', label: 'Radial / ulnar', format: signed('Radial', 'Ulnar'), ticks: ['Radial 20°', '0°', 'Ulnar 35°'] },
		{ group: 'Fingers', joint: 'mcp', label: 'MCP flexion', format: signed('Ext', 'Flex'), ticks: ['Ext 20°', '', 'Flex 90°'] },
		{ group: 'Fingers', joint: 'pip', label: 'PIP flexion', format: deg, ticks: ['0°', '', '100°'] },
		{ group: 'Fingers', joint: 'dip', label: 'DIP flexion', format: deg, ticks: ['0°', '', '90°'] },
		{ group: 'Fingers', joint: 'spread', label: 'Spread', format: signed('Add', 'Abd'), ticks: ['Add', '', 'Abd 20°'] },
		{ group: 'Thumb', joint: 'opposition', label: 'Opposition', format: (v) => `${Math.round(v)}%`, ticks: ['0%', '', '100%'] },
		{ group: 'Thumb', joint: 'thumbCmcAbduction', label: 'Palmar abduction', format: signed('Add', 'Abd'), ticks: ['Add 10°', '', 'Abd 60°'] },
		{ group: 'Thumb', joint: 'thumbCmcFlexion', label: 'CMC flex / ext', format: signed('Ext', 'Flex'), ticks: ['Ext 30°', '0°', 'Flex 30°'] },
		{ group: 'Thumb', joint: 'thumbMcp', label: 'MCP flexion', format: signed('Ext', 'Flex'), ticks: ['Ext 10°', '', 'Flex 50°'] },
		{ group: 'Thumb', joint: 'thumbIp', label: 'IP flexion', format: signed('Ext', 'Flex'), ticks: ['Ext 15°', '', 'Flex 80°'] }
	],
	muscles,
	movements,
	scenarios,
	meshToggles: [{ mesh: 'retinaculum', label: 'Retinaculum', initial: true, opacity: 0.5 }],
	axisOverlays: [
		{ joint: 'wristFlexion', color: 0x0e6b62, length: 80 },
		{ joint: 'wristDeviation', color: 0xe0a019, length: 80 },
		{ joint: 'thumbCmcFlexion', color: 0xc9463d, length: 40 },
		{ joint: 'thumbCmcAbduction', color: 0x9b59b6, length: 40 },
		{ joint: 'middleMcp', color: 0x0e6b62, length: 32 },
		{ joint: 'middlePip', color: 0x0e6b62, length: 26 },
		{ joint: 'middleDip', color: 0x0e6b62, length: 22 },
		{ joint: 'indexAbd', color: 0xe0a019, length: 30 }
	],
	view: views[0].preset,
	views,
	// a curled hand or bent wrist hides the palm muscles; open it up to identify
	readablePose: (p) =>
		p.mcp > 45 || p.pip > 60 || p.opposition > 50 || Math.abs(p.wristFlexion) > 45
			? HAND_REST
			: null,
	reference,
	referenceLabel: 'Joints'
};
