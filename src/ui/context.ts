import type { JointModule, Movement, MuscleInfo } from '../joints/types';
import type { PoseAnimator } from '../viewer/animator';
import type { Focus, JointModel } from '../viewer/model';

/** Shared state and services the UI panels use. */
export interface AppContext {
	joint: JointModule;
	model: JointModel;
	animator: PoseAnimator;
	muscle(key: string): MuscleInfo;
	/** show joint axes and reflect it in the toolbar */
	setAxesVisible(on: boolean): void;
	playMovement(m: Movement): Promise<boolean>;
	/** turn the camera to the muscle's preferred view if it is on the far side */
	faceMuscle(key: string): void;
}

/** A side-panel tab. The app re-applies a panel's focus when it becomes active. */
export interface Panel {
	readonly focus: Focus | null;
	activate(): void;
	/** whether clicking the model should select muscles while this panel is active */
	readonly allowsPicking: boolean;
	/** called when a muscle is picked on the model */
	onPick?(hit: { muscle: string; part: string } | null): void;
}

export function names(ctx: AppContext, keys: string[]): string {
	return keys.map((k) => ctx.muscle(k).name).join(', ');
}
