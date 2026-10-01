/**
 * Tune panel (#debug): hand-set keys for a muscle at lattice poses (core/muscle/tune.ts), seen live, saved
 * to the joint's tuning.json through the dev server, which then re-solves the mesh corrections against them
 * (vite.config.ts); the panel follows that and offers a reload when it is done. A key is edited at its own
 * lattice pose (Go to key pose snaps the arm there); elsewhere the panel shows what the keys around blend
 * to. The rest pose takes no key: the meshes are bound to the strands there.
 */
import type { Tuner, TuneParams } from '../core/muscle/tune';
import { nearestLatticePose, NO_TUNE } from '../core/muscle/tune';
import type { Pose } from '../core/rig';

interface Slider {
	key: keyof TuneParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

const SLIDERS: Slider[] = [
	{ key: 'roll', label: 'Roll', min: -90, max: 90, step: 1, unit: '°' },
	{ key: 'lift', label: 'Lift (off bone)', min: -25, max: 25, step: 0.5, unit: ' mm' },
	{ key: 'shift', label: 'Shift (sideways)', min: -25, max: 25, step: 0.5, unit: ' mm' },
	{ key: 'length', label: 'Belly length', min: 0.5, max: 1.5, step: 0.01, unit: '×' }
];

const fmt = (p: Pose) => Object.entries(p).map(([k, v]) => `${k.slice(0, 4)} ${Math.round(v)}`).join(' · ');

export class TunePanel {
	readonly el: HTMLElement;
	private mesh: string;
	private readonly inputs = new Map<keyof TuneParams, { input: HTMLInputElement; out: HTMLOutputElement }>();
	private readonly where: HTMLElement;
	private readonly list: HTMLElement;
	private readonly status: HTMLElement;
	private readonly clear: HTMLButtonElement;
	/** the corrections re-solve a save starts */
	private readonly corr: HTMLElement;
	private watching = false;
	private dirty = false;

	constructor(
		private readonly tuner: Tuner,
		meshes: { mesh: string; label: string }[],
		private readonly joint: string,
		private readonly rest: Pose,
		private readonly pose: () => Pose,
		private readonly goTo: (p: Pose) => void,
		private readonly changed: () => void
	) {
		this.mesh = meshes[0].mesh;
		const el = (this.el = document.createElement('div'));
		el.className = 'tune';
		el.hidden = true;
		const sel = document.createElement('select');
		for (const m of meshes) sel.append(new Option(m.label, m.mesh));
		sel.addEventListener('change', () => { this.mesh = sel.value; this.refresh(); });
		this.where = document.createElement('p');
		const go = button('Go to key pose', () => this.goTo({ ...this.pose(), ...nearestLatticePose(this.tuner.axes, this.pose()) }));
		el.append(heading('Tune'), sel, this.where, go);
		for (const s of SLIDERS) {
			const row = document.createElement('label'), input = document.createElement('input'), out = document.createElement('output');
			Object.assign(input, { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step) });
			input.addEventListener('input', () => this.edit());
			row.append(document.createTextNode(s.label), out, input);
			el.append(row);
			this.inputs.set(s.key, { input, out });
		}
		this.clear = button('Clear key', () => this.set({ ...NO_TUNE }));
		this.list = document.createElement('ul');
		this.status = document.createElement('p');
		this.corr = document.createElement('p');
		el.append(this.clear, heading('Keys'), this.list, button('Save', () => void this.save()), this.status, this.corr);
		this.refresh();
	}

	/** The lattice pose the arm is exactly at, or null. */
	private onLattice(): Pose | null {
		const p = this.pose(), lp = nearestLatticePose(this.tuner.axes, p);
		return Object.entries(lp).every(([j, v]) => Math.abs((p[j] ?? v) - v) < 1e-6) ? lp : null;
	}

	private isRest(lp: Pose): boolean {
		return Object.entries(lp).every(([j, v]) => v === this.rest[j]);
	}

	/** Show the key at this pose (or the blend of those around), and the muscle's keys. */
	refresh(): void {
		const lp = this.onLattice(), editable = !!lp && !this.isRest(lp);
		const shown = lp ? (this.tuner.get(this.mesh, lp) ?? NO_TUNE) : this.tuner.at(this.mesh, this.pose());
		this.where.textContent = !lp ? 'Between keys (showing the blend): go to a key pose to edit.'
			: this.isRest(lp) ? 'Rest pose: no key here (the meshes are bound to it).'
			: `Key pose ${fmt(lp)}${this.tuner.get(this.mesh, lp) ? '' : ' (no key yet)'}`;
		for (const s of SLIDERS) {
			const { input, out } = this.inputs.get(s.key)!;
			input.value = String(shown[s.key]);
			input.disabled = !editable;
			out.value = `${(+shown[s.key]).toFixed(s.step < 1 ? (s.step < 0.1 ? 2 : 1) : 0)}${s.unit}`;
		}
		this.clear.disabled = !editable || !this.tuner.get(this.mesh, lp!);
		this.list.replaceChildren(...(this.tuner.tuning.keys[this.mesh] ?? []).map((k) => {
			const li = document.createElement('li');
			const p = SLIDERS.filter((s) => k[s.key] !== NO_TUNE[s.key]).map((s) => `${s.label.split(' ')[0].toLowerCase()} ${k[s.key]}${s.unit}`).join(', ');
			li.append(button(fmt(k.pose), () => this.goTo({ ...this.pose(), ...k.pose })), document.createTextNode(` ${p} `), button('×', () => {
				this.tuner.set(this.mesh, k.pose, { ...NO_TUNE });
				this.touched();
			}));
			return li;
		}));
		if (!this.tuner.tuning.keys[this.mesh]?.length) this.list.append(Object.assign(document.createElement('li'), { textContent: 'none' }));
	}

	private edit(): void {
		const p = { ...NO_TUNE };
		for (const s of SLIDERS) p[s.key] = Number(this.inputs.get(s.key)!.input.value);
		this.set(p);
	}

	private set(p: TuneParams): void {
		const lp = this.onLattice();
		if (!lp || this.isRest(lp)) return;
		this.tuner.set(this.mesh, lp, p);
		this.touched();
	}

	private touched(): void {
		this.dirty = true;
		this.status.textContent = 'Unsaved changes';
		this.changed();
		this.refresh();
	}

	private async save(): Promise<void> {
		this.status.textContent = 'Saving…';
		try {
			const res = await fetch(`/__kinesy/tuning?joint=${encodeURIComponent(this.joint)}`, { method: 'POST', body: JSON.stringify(this.tuner.tuning) });
			if (!res.ok) throw new Error(await res.text());
			this.dirty = false;
			this.status.textContent = 'Saved to tuning.json';
			this.watchCorrections();
		} catch (e) {
			this.status.textContent = `Not saved: ${(e as Error).message}`;
		}
	}

	/** Follow the dev server's re-solve of the mesh corrections that a save starts, until it is done. */
	private watchCorrections(): void {
		if (this.watching) return;
		this.watching = true;
		const poll = async () => {
			try {
				const s = (await (await fetch(`/__kinesy/tuning/status?joint=${encodeURIComponent(this.joint)}`)).json()) as {
					running: boolean; queued: boolean; started: number; last: { ok: boolean; message: string } | null;
				};
				if (s.running) {
					const secs = Math.round((Date.now() - s.started) / 1000);
					this.corr.replaceChildren(`Saved. Re-solving mesh corrections${s.queued ? ' (again after this)' : ''}… ${secs} s`);
					setTimeout(poll, 2000);
					return;
				}
				this.watching = false;
				if (!s.last) this.corr.replaceChildren();
				else if (!s.last.ok) this.corr.replaceChildren(`Corrections failed: ${s.last.message}`);
				else if (/nothing to correct/.test(s.last.message)) this.corr.replaceChildren();
				else this.corr.replaceChildren('Mesh corrections updated. ', button('Reload', () => location.reload()), this.dirty ? ' (save first)' : '');
			} catch {
				this.watching = false;
			}
		};
		void poll();
	}

	get unsaved(): boolean {
		return this.dirty;
	}
}

function button(label: string, onClick: () => void): HTMLButtonElement {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'chipbtn';
	b.textContent = label;
	b.addEventListener('click', onClick);
	return b;
}

function heading(text: string): HTMLElement {
	return Object.assign(document.createElement('h4'), { textContent: text });
}
