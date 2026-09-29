import manifest from '../../../assets/elbow/manifest.json';
import geometryUrl from '../../../assets/elbow/geometry.bin.gz?url';
import fieldsUrl from '../../../assets/elbow/fields.bin.gz?url';
import type { AssetManifest } from '../../core/types';
import type { JointModule } from '../types';
import { movements, muscles, scenarios } from './content';
import { elbowPaths } from './paths';
import { reference } from './reference';
import { elbowRig } from './rig';

function forearm(p: number): string {
	const r = Math.round(p);
	return r === 0 ? 'Neutral 0°' : r < 0 ? `Supinated ${-r}°` : `Pronated ${r}°`;
}

export const elbow: JointModule = {
	id: 'elbow',
	title: 'Elbow Movers',
	subtitle: 'Right arm · anterolateral view · drag to rotate',
	assets: { manifest: manifest as unknown as AssetManifest, geometry: geometryUrl, fields: fieldsUrl },
	rig: elbowRig,
	paths: elbowPaths,
	controls: [
		{ joint: 'flexion', label: 'Elbow flexion', format: (v) => `${Math.round(v)}°`, ticks: ['0° ext', '90°', '145°'] },
		{ joint: 'pronation', label: 'Forearm', format: forearm, ticks: ['Sup 90°', 'Neutral', 'Pron 80°'] }
	],
	muscles,
	movements,
	scenarios,
	meshToggles: [{ mesh: 'scapula', label: 'Scapula', initial: true, opacity: 0.55 }],
	axisOverlays: [
		{ joint: 'flexion', color: 0x0e6b62, length: 170 },
		{ joint: 'pronation', color: 0xe0a019, length: 290, offset: 118 }
	],
	view: { target: [0, -55, 10], dir: [-0.58, 0.12, 0.8], distance: 1350 },
	// deep flexion buries the flexors under the forearm
	readablePose: (p) => (p.flexion > 100 ? { flexion: 60 } : null),
	reference,
	referenceLabel: 'Joint'
};
