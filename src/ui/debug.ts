/** Timing overlay, shown when the URL hash is #debug or after an uncaught error. */
export class DebugOverlay {
	private on: boolean;
	private readonly t0 = performance.now();
	private readonly log: string[] = [];
	private frames = 0;
	private poses = 0;
	private poseMs = 0;
	private worstFrame = 0;

	constructor(private readonly el: HTMLElement, signal?: AbortSignal) {
		this.on = location.hash === '#debug';
		window.addEventListener('error', (e) => this.error(`ERROR ${e.message} @${e.lineno}`), { signal });
		window.addEventListener('unhandledrejection', (e) => this.error(`REJECT ${(e.reason as Error)?.message ?? e.reason}`), { signal });
	}

	msg(text: string): void {
		this.log.push(`${((performance.now() - this.t0) / 1000).toFixed(2)}s ${text}`);
		if (this.log.length > 14) this.log.shift();
		this.show();
	}

	error(text: string): void {
		this.on = true;
		this.msg(text);
	}

	frame(dt: number): void {
		this.frames++;
		if (this.frames > 5) this.worstFrame = Math.max(this.worstFrame, dt);
		if (this.on && this.frames % 15 === 0) this.show();
	}

	posed(ms: number): void {
		this.poses++;
		this.poseMs = ms;
	}

	private show(): void {
		if (!this.on) return;
		this.el.hidden = false;
		this.el.textContent =
			`frames ${this.frames}  poses ${this.poses}  last pose ${this.poseMs.toFixed(1)} ms  worst frame ${this.worstFrame.toFixed(0)} ms\n` +
			this.log.join('\n');
	}
}
