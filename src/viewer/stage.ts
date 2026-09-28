import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ViewPreset } from '../joints/types';

/** Renderer, camera, lights, orbit controls, and an on-demand render loop. */
export class Stage {
	readonly renderer: THREE.WebGLRenderer;
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(32, 1, 5, 5000);
	readonly controls: OrbitControls;
	readonly canvas: HTMLCanvasElement;
	private dirty = true;
	private readonly beforeRender: (() => void)[] = [];
	private readonly frameHooks: ((dt: number) => void)[] = [];
	private preset: ViewPreset | null = null;

	constructor(canvas: HTMLCanvasElement, private readonly clearColorVar = '--viewport') {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.12;
		this.controls.minDistance = 150;
		this.controls.maxDistance = 2600;
		this.controls.addEventListener('change', () => this.requestRender());

		// intensities are physically based (three r155+); ≈ π × the legacy values
		this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6a66, 2.4));
		const key = new THREE.DirectionalLight(0xffffff, 2.7);
		key.position.set(-300, 500, 600);
		const rim = new THREE.DirectionalLight(0xffffff, 1.1);
		rim.position.set(400, 200, -500);
		this.scene.add(key, rim);

		this.applyTheme();
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
		new MutationObserver(() => this.applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
		this.resize();

		let last = performance.now();
		const loop = () => {
			requestAnimationFrame(loop);
			const now = performance.now();
			for (const h of this.frameHooks) h(now - last);
			last = now;
			this.controls.update();
			if (!this.dirty) return;
			this.dirty = false;
			for (const f of this.beforeRender) f();
			this.renderer.render(this.scene, this.camera);
		};
		requestAnimationFrame(loop);
	}

	requestRender(): void {
		this.dirty = true;
	}

	/** Run just before each render that actually happens (e.g. apply a pending pose). */
	onBeforeRender(f: () => void): void {
		this.beforeRender.push(f);
	}

	/** Run every animation frame with the elapsed ms. */
	onFrame(f: (dt: number) => void): void {
		this.frameHooks.push(f);
	}

	setView(preset: ViewPreset): void {
		this.preset = preset;
		this.resetView();
	}

	resetView(): void {
		const p = this.preset;
		if (!p) return;
		const r = this.canvas.parentElement!.getBoundingClientRect();
		const aspect = r.width / Math.max(1, r.height);
		const dist = p.distance * Math.max(1, 0.75 / aspect);
		const target = new THREE.Vector3(...p.target);
		const dir = new THREE.Vector3(...p.dir).normalize();
		this.camera.position.copy(target).addScaledVector(dir, dist);
		this.controls.target.copy(target);
		this.controls.update();
		this.requestRender();
	}

	/** Normalized device coordinates for a pointer event. */
	ndc(ev: { clientX: number; clientY: number }): THREE.Vector2 {
		const r = this.canvas.getBoundingClientRect();
		return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
	}

	private applyTheme(): void {
		const c = getComputedStyle(document.documentElement).getPropertyValue(this.clearColorVar).trim();
		if (c) this.renderer.setClearColor(new THREE.Color(c));
		this.requestRender();
	}

	private resize(): void {
		const r = this.canvas.parentElement!.getBoundingClientRect();
		this.renderer.setSize(r.width, r.height, false);
		this.camera.aspect = r.width / Math.max(1, r.height);
		this.camera.updateProjectionMatrix();
		this.requestRender();
	}
}
