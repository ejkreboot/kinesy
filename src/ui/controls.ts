import type { Pose, Rig } from '../core/rig';
import type { JointControl } from '../joints/types';

/** One range slider per joint degree of freedom, optionally in groups shown one at a time. */
export class PoseControls {
	private readonly inputs = new Map<string, { input: HTMLInputElement; output: HTMLOutputElement; ctl: JointControl }>();

	constructor(container: HTMLElement, rig: Rig, controls: JointControl[], onInput: (joint: string, deg: number) => void) {
		const groups = [...new Set(controls.map((c) => c.group).filter((g): g is string => !!g))];
		const wraps: { el: HTMLElement; group?: string }[] = [];
		let show: ((g: string) => void) | null = null;
		if (groups.length > 1) {
			const seg = document.createElement('div');
			seg.className = 'gonio-groups';
			seg.setAttribute('role', 'group');
			seg.setAttribute('aria-label', 'Slider group');
			show = (g: string) => {
				for (const w of wraps) w.el.hidden = !!w.group && w.group !== g;
				seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === g)));
			};
			for (const g of groups) {
				const b = document.createElement('button');
				b.textContent = g;
				b.addEventListener('click', () => show!(g));
				seg.append(b);
			}
			container.append(seg);
		}
		for (const ctl of controls) {
			const j = rig.joint(ctl.joint);
			const id = `joint-${ctl.joint}`;
			const wrap = document.createElement('div');
			wrap.innerHTML = `
				<label for="${id}">${ctl.label} <output></output></label>
				<input type="range" id="${id}" min="${j.min}" max="${j.max}" step="1" value="${j.initial}">
				<div class="scale"><span>${ctl.ticks[0]}</span><span>${ctl.ticks[1]}</span><span>${ctl.ticks[2]}</span></div>`;
			const input = wrap.querySelector('input')!;
			const output = wrap.querySelector('output')!;
			input.addEventListener('input', () => onInput(ctl.joint, +input.value));
			container.append(wrap);
			wraps.push({ el: wrap, group: ctl.group });
			this.inputs.set(ctl.joint, { input, output, ctl });
		}
		show?.(groups[0]);
	}

	sync(pose: Pose): void {
		for (const [joint, { input, output, ctl }] of this.inputs) {
			const v = pose[joint];
			input.value = String(v);
			output.textContent = ctl.format(v);
		}
	}
}
