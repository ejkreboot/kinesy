import type { Pose, Rig } from '../core/rig';
import type { JointControl } from '../joints/types';

/** One range slider per joint degree of freedom. */
export class PoseControls {
	private readonly inputs = new Map<string, { input: HTMLInputElement; output: HTMLOutputElement; ctl: JointControl }>();

	constructor(container: HTMLElement, rig: Rig, controls: JointControl[], onInput: (joint: string, deg: number) => void) {
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
			this.inputs.set(ctl.joint, { input, output, ctl });
		}
	}

	sync(pose: Pose): void {
		for (const [joint, { input, output, ctl }] of this.inputs) {
			const v = pose[joint];
			input.value = String(v);
			output.textContent = ctl.format(v);
		}
	}
}
