import type { JointAssetUrls } from '../core/load';
import type { Vec3 } from '../core/math';
import type { Pose, RigDef } from '../core/rig';

/** Everything the app needs to present one joint. Add a joint by implementing this. */
export interface JointModule {
	id: string;
	title: string;
	/** short line under the title on the stage */
	subtitle: string;
	assets: JointAssetUrls;
	rig: RigDef;
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

export interface ViewPreset {
	target: Vec3;
	/** direction from target to camera */
	dir: Vec3;
	/** camera distance, mm; viewports narrower than 3:4 (portrait) back off proportionally */
	distance: number;
}
