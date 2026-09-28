import './styles.css';
import { mountJoint, type MountedJoint } from './app';
import type { JointModule } from './joints/types';

// Each joint is shown on its own; its module (and assets) load only when picked.
const JOINTS: { id: string; label: string; load: () => Promise<JointModule> }[] = [
	{ id: 'elbow', label: 'Elbow', load: () => import('./joints/elbow').then((m) => m.elbow) },
	{ id: 'shoulder', label: 'Shoulder', load: () => import('./joints/shoulder').then((m) => m.shoulder) }
];
const STORE_KEY = 'kinesy.joint';

// The page shell is rebuilt from this copy on every switch, which drops the old joint's listeners.
const shellTemplate = document.querySelector('.app')!.cloneNode(true) as HTMLElement;

function initialJoint(): string {
	const known = (id: string | null) => JOINTS.some((j) => j.id === id);
	const fromUrl = new URLSearchParams(location.search).get('joint');
	if (known(fromUrl)) return fromUrl!;
	try {
		const saved = localStorage.getItem(STORE_KEY);
		if (known(saved)) return saved!;
	} catch {
		// storage unavailable (private mode, sandboxed frame)
	}
	return JOINTS[0].id;
}

function remember(id: string): void {
	try {
		localStorage.setItem(STORE_KEY, id);
	} catch {
		// not persisted; the default is used next time
	}
	try {
		const url = new URL(location.href);
		url.searchParams.set('joint', id);
		history.replaceState(null, '', url);
	} catch {
		// sandboxed frames may refuse history changes
	}
}

function buildPicker(current: string, onPick: (id: string) => void): void {
	const sel = document.getElementById('jointPicker') as HTMLSelectElement;
	for (const j of JOINTS) sel.append(new Option(j.label, j.id, false, j.id === current));
	sel.addEventListener('change', () => onPick(sel.value));
}

let mounted: Promise<MountedJoint | null> = Promise.resolve(null);
let generation = 0;

function show(id: string): void {
	const gen = ++generation;
	mounted = mounted.then(async (prev) => {
		prev?.dispose();
		if (gen !== generation) return null; // superseded by a later pick
		if (prev) document.querySelector('.app')!.replaceWith(shellTemplate.cloneNode(true));
		buildPicker(id, (next) => {
			remember(next);
			show(next);
		});
		try {
			const joint = await JOINTS.find((j) => j.id === id)!.load();
			return await mountJoint(joint);
		} catch (err) {
			const el = document.getElementById('loading');
			if (el) {
				el.hidden = false;
				el.textContent = `The model could not load in this browser (${(err as Error).message}). Try a current Chrome, Edge, Safari, or Firefox.`;
			}
			console.error(err);
			return null;
		}
	});
}

show(initialJoint());
