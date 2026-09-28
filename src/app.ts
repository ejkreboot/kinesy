import { loadJointAssets } from './core/load';
import { Rig } from './core/rig';
import type { JointModule, MuscleInfo } from './joints/types';
import type { AppContext, Panel } from './ui/context';
import { PoseControls } from './ui/controls';
import { DebugOverlay } from './ui/debug';
import { $, toggleButton } from './ui/dom';
import { ExplorePanel } from './ui/explore';
import { QuizPanel } from './ui/quiz';
import { PoseAnimator } from './viewer/animator';
import { JointModel } from './viewer/model';
import { Stage } from './viewer/stage';

/** Mount the viewer + study UI for one joint into the page shell in index.html. */
export async function mountJoint(joint: JointModule): Promise<void> {
	const debug = new DebugOverlay($('dbg'));
	document.title = joint.title;
	$('title').textContent = joint.title;
	$('subtitle').textContent = joint.subtitle;
	$('referenceTab').textContent = joint.referenceLabel;
	$('paneReference').innerHTML = joint.reference;

	const stage = new Stage($<HTMLCanvasElement>('gl'));
	stage.onFrame((dt) => debug.frame(dt));

	const assets = await loadJointAssets(joint.assets);
	debug.msg('assets decoded');
	const rig = new Rig(joint.rig, assets.manifest.axes, assets.manifest.bones);
	const model = new JointModel(stage, assets, rig, joint.muscles);
	model.onPosed = (ms) => debug.posed(ms);
	for (const a of joint.axisOverlays) model.addAxis(a.joint, a.color, a.length, a.offset);
	stage.setView(joint.view);
	$('loading').hidden = true;

	// ---- pose: sliders + animator ----
	const controls = new PoseControls($('gonio'), rig, joint.controls, (j, v) => {
		animator.cancel();
		model.setPose({ [j]: v });
		controls.sync(model.pose);
	});
	const animator = new PoseAnimator(
		() => model.pose,
		(p) => {
			model.setPose(p);
			controls.sync(model.pose);
		}
	);
	controls.sync(model.pose);

	// ---- stage toolbar ----
	const tools = $('stageTools');
	const axesBtn = toggleButton('Joint axes', false, (on) => model.setAxesVisible(on));
	tools.append(axesBtn, toggleButton('See-through', false, (on) => model.setXray(on)));
	for (const t of joint.meshToggles) {
		model.setBoneMeshVisible(t.mesh, t.initial, t.opacity);
		tools.append(toggleButton(t.label, t.initial, (on) => model.setBoneMeshVisible(t.mesh, on)));
	}
	const reset = document.createElement('button');
	reset.className = 'chipbtn';
	reset.textContent = 'Reset view';
	reset.addEventListener('click', () => stage.resetView());
	tools.append(reset);

	const byKey = new Map<string, MuscleInfo>(joint.muscles.map((m) => [m.key, m]));
	const ctx: AppContext = {
		joint,
		model,
		animator,
		muscle: (k) => {
			const m = byKey.get(k);
			if (!m) throw new Error(`Unknown muscle ${k}`);
			return m;
		},
		setAxesVisible: (on) => {
			axesBtn.setAttribute('aria-pressed', String(on));
			model.setAxesVisible(on);
		},
		playMovement: (m) => animator.play(m.from, m.to)
	};

	// ---- panels + tabs ----
	const panels: Record<string, Panel | null> = { explore: new ExplorePanel(ctx), quiz: new QuizPanel(ctx), reference: null };
	const paneIds: Record<string, string> = { explore: 'paneExplore', quiz: 'paneQuiz', reference: 'paneReference' };
	let active = 'explore';
	$('tabs').addEventListener('click', (e) => {
		const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
		if (!b) return;
		active = b.dataset.tab!;
		$('tabs').querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
		for (const [k, id] of Object.entries(paneIds)) $(id).hidden = k !== active;
		animator.cancel();
		const p = panels[active];
		if (p) p.activate();
		else model.setFocus(null);
	});

	// ---- picking + hover ----
	const canvas = stage.canvas, tip = $('tip');
	const picking = () => panels[active]?.allowsPicking ?? true;
	let down: { x: number; y: number } | null = null;
	canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
	canvas.addEventListener('pointerup', (e) => {
		if (!down) return;
		const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
		down = null;
		if (moved > 6 || !picking()) return;
		panels[active]?.onPick?.(model.pick(e));
	});
	canvas.addEventListener('pointermove', (e) => {
		if (e.pointerType !== 'mouse' || down || !picking()) {
			tip.hidden = true;
			return;
		}
		const hit = model.pick(e);
		if (!hit) {
			tip.hidden = true;
			canvas.style.cursor = '';
			return;
		}
		const m = ctx.muscle(hit.muscle);
		tip.textContent = m.heads ? `${m.name} · ${m.heads[hit.part]}` : m.name;
		const r = canvas.getBoundingClientRect();
		tip.style.left = `${e.clientX - r.left}px`;
		tip.style.top = `${e.clientY - r.top}px`;
		tip.hidden = false;
		canvas.style.cursor = 'pointer';
	});
	canvas.addEventListener('pointerleave', () => (tip.hidden = true));

	panels.explore!.activate();
	debug.msg('ready');
}
