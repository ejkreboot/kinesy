import type { Tuning } from '../core/muscle/tune';
import type { JointAssetUrls } from '../core/load';
import type { Vec3 } from '../core/math';
import type { DeformerOptions } from '../core/deformer';
import type { JointPaths } from '../core/muscle/schema';
import type { Pose, RigDef } from '../core/rig';

/** Everything the app needs to present one joint. Add a joint by implementing this. */
export interface JointModule {
	id: string;
	title: string;
	/** short line under the title on the stage */
	subtitle: string;
	assets: JointAssetUrls;
	rig: RigDef;
	/** deformer settings for this joint (see DEFAULT_DEFORMER_OPTIONS) */
	deformer?: Partial<DeformerOptions>;
	/**
	 * muscle lines of action; meshes listed here are deformed along them on the GPU, the rest by the
	 * CPU deformer
	 */
	paths?: JointPaths;
	/**
	 * hand-tuned keys for the muscles without lines of action, applied by the CPU deformer about their skinned
	 * centerlines (edited in the Tune panel, #debug, and saved to the joint's tuning.json); a joint with paths
	 * keeps its keys there (JointPaths.tuning)
	 */
	tuning?: Tuning;
	/** one slider per joint degree of freedom, in display order */
	controls: JointControl[];
	/** muscles in list order; list groups follow first appearance of each `group` */
	muscles: MuscleInfo[];
	movements: Movement[];
	/** exam-style questions beyond what the quiz generates from `muscles` */
	scenarios: Scenario[];
	/** bone meshes the viewer can show/hide (e.g. a partial scapula) */
	meshToggles: MeshToggle[];
	/** joint axes drawn by the "Joint axes" toggle */
	axisOverlays: AxisOverlay[];
	view: ViewPreset;
	/**
	 * named camera presets shown as toolbar buttons in place of "Reset view"; the first should
	 * match `view`. Muscles can name one to be seen from (`MuscleInfo.view`).
	 */
	views?: NamedView[];
	/** one line under the sliders describing the pose (e.g. how elevation splits between joints) */
	readout?: (pose: Pose) => string;
	/** pose to move to before an identify question if the current one hides muscles, else null */
	readablePose?: (pose: Pose) => Pose | null;
	/** HTML for the reference tab */
	reference: string;
	/** name of the reference tab */
	referenceLabel: string;
}

export interface JointControl {
	joint: string;
	label: string;
	format: (deg: number) => string;
	/** labels under the slider: min, middle, max */
	ticks: [string, string, string];
	/** sliders with a group are shown one group at a time, picked with a switch above them */
	group?: string;
}

export interface MuscleInfo {
	/** stable key */
	key: string;
	name: string;
	/** lowercase short form used in quiz answers, e.g. "biceps" */
	shortName: string;
	group: string;
	color: string;
	/** asset mesh names that make up this muscle */
	meshes: string[];
	/** mesh name -> head label, for multi-headed muscles */
	heads?: Record<string, string>;
	origin: string;
	insertion: string;
	/** short action, used as a quiz answer */
	action: string;
	actionLong: string;
	nerve: string;
	note: string;
	/** name of a view in `JointModule.views` the muscle is visible from */
	view?: string;
	/**
	 * connective tissue listed with the muscles (a tendon and ligament sheet): drawn glossier, and left out of
	 * the quiz's muscle questions
	 */
	tissue?: boolean;
	/** for tissue: the muscles (keys) it is lit and faded with as they are (a demo or a focus) */
	follows?: string[];
}

export interface Movement {
	id: string;
	label: string;
	/** e.g. "0° → 140°" */
	range: string;
	/** starting pose; joints left out keep their current angle */
	from: Pose;
	to: Pose;
	/** muscle keys */
	prime: string[];
	assist: string[];
	/** heading the demo button is listed under (buttons keep their order within a group) */
	group?: string;
	/** extra line shown with the movers while the demo plays */
	note?: string;
}

export interface Scenario {
	q: string;
	a: string;
	distractors: string[];
	why: string;
	/** muscle keys to highlight after answering */
	focus?: string[];
	/** mesh names to highlight after answering (for single heads) */
	parts?: string[];
	/** show joint axes after answering */
	showAxes?: boolean;
}

export interface MeshToggle {
	mesh: string;
	label: string;
	initial: boolean;
	opacity?: number;
}

export interface AxisOverlay {
	joint: string;
	color: number;
	/** mm */
	length: number;
	/** shift of the drawn segment's midpoint along the axis from the axis point, mm */
	offset?: number;
}

export interface NamedView {
	label: string;
	preset: ViewPreset;
}

export interface ViewPreset {
	target: Vec3;
	/** direction from target to camera */
	dir: Vec3;
	/** camera distance, mm; viewports narrower than 3:4 (portrait) back off proportionally */
	distance: number;
}
