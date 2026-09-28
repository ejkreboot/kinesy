import type { Pose } from '../core/rig';

/** Tweens a pose; a new tween or cancel() stops the current one. */
export class PoseAnimator {
	private token: { cancelled: boolean } | null = null;

	constructor(
		private readonly get: () => Pose,
		private readonly set: (p: Pose) => void
	) {}

	cancel(): void {
		if (this.token) this.token.cancelled = true;
		this.token = null;
	}

	/** Resolves true when finished, false if interrupted. */
	to(target: Pose, ms: number): Promise<boolean> {
		this.cancel();
		const from = { ...this.get() };
		const to = { ...from, ...target };
		const tok = { cancelled: false };
		this.token = tok;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches || ms <= 0) {
			this.set(to);
			this.token = null;
			return Promise.resolve(true);
		}
		return new Promise((resolve) => {
			const t0 = performance.now();
			const step = (t: number) => {
				if (tok.cancelled) return resolve(false);
				const u = Math.min(1, (t - t0) / ms);
				const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
				const p: Pose = {};
				for (const k in to) p[k] = from[k] + (to[k] - from[k]) * e;
				this.set(p);
				if (u < 1) requestAnimationFrame(step);
				else {
					this.token = null;
					resolve(true);
				}
			};
			requestAnimationFrame(step);
		});
	}

	/** Move to `from` quickly, then play to `to`. */
	async play(from: Pose, to: Pose, lead = 450, main = 1700): Promise<boolean> {
		if (!(await this.to(from, lead))) return false;
		return this.to(to, main);
	}
}
