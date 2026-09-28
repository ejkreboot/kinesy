import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ViewPreset } from '../joints/types';

/** Canvas width (CSS px) below which the view is framed for a phone. */
const PHONE_WIDTH = 600;

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
	private raf = 0;
	private flight: { cancelled: boolean } | null = null;
	private readonly teardown = new AbortController();
	private readonly observers: { disconnect(): void }[] = [];

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
		this.controls.addEventListener('start', () => this.cancelFlight());

		// intensities are physically based (three r155+); ≈ π × the legacy values
		this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6a66, 2.4));
		const key = new THREE.DirectionalLight(0xffffff, 2.7);
		key.position.set(-300, 500, 600);
		const rim = new THREE.DirectionalLight(0xffffff, 1.1);
		rim.position.set(400, 200, -500);
		this.scene.add(key, rim);

		this.applyTheme();
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme(), { signal: this.teardown.signal });
		const mo = new MutationObserver(() => this.applyTheme());
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		const ro = new ResizeObserver(() => this.resize());
		ro.observe(canvas);
		this.observers.push(mo, ro);
		this.resize();

		let last = performance.now();
		const loop = () => {
			this.raf = requestAnimationFrame(loop);
			const now = performance.now();
			for (const h of this.frameHooks) h(now - last);
			last = now;
			this.controls.update();
			if (!this.dirty) return;
			this.dirty = false;
			for (const f of this.beforeRender) f();
			this.renderer.render(this.scene, this.camera);
		};
		this.raf = requestAnimationFrame(loop);
	}

	/** Stop rendering and release the GL context and listeners. */
	dispose(): void {
		cancelAnimationFrame(this.raf);
		this.cancelFlight();
		this.teardown.abort();
		for (const o of this.observers) o.disconnect();
		this.controls.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
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
		this.cancelFlight();
		const { target, distance } = this.fit(p);
		this.camera.position.copy(target).addScaledVector(new THREE.Vector3(...p.dir).normalize(), distance);
		this.controls.target.copy(target);
		this.controls.update();
		this.requestRender();
	}

	/** Unit direction from the orbit target to the camera. */
	viewDir(): THREE.Vector3 {
		return this.camera.position.clone().sub(this.controls.target).normalize();
	}

	/** Swing the camera to a preset (and make it the one "reset" returns to). */
	flyTo(preset: ViewPreset, ms = 650): void {
		this.preset = preset;
		this.cancelFlight();
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return this.resetView();
		const { target: t1, distance: d1 } = this.fit(preset);
		const t0 = this.controls.target.clone();
		const off = this.camera.position.clone().sub(t0);
		const d0 = off.length();
		const q = new THREE.Quaternion().setFromUnitVectors(off.normalize(), new THREE.Vector3(...preset.dir).normalize());
		const qt = new THREE.Quaternion(), start = performance.now(), tok = { cancelled: false };
		this.flight = tok;
		const step = (now: number) => {
			if (tok.cancelled) return;
			const u = Math.min(1, (now - start) / ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
			qt.identity().slerp(q, e);
			const target = t0.clone().lerp(t1, e);
			this.controls.target.copy(target);
			this.camera.position.copy(target).addScaledVector(off.clone().applyQuaternion(qt), d0 + (d1 - d0) * e);
			this.controls.update();
			this.requestRender();
			if (u < 1) requestAnimationFrame(step);
			else if (this.flight === tok) this.flight = null;
		};
		requestAnimationFrame(step);
	}

	private cancelFlight(): void {
		if (this.flight) this.flight.cancelled = true;
		this.flight = null;
	}

	/**
	 * Camera target and distance for a preset in the current canvas. Portrait canvases back off
	 * proportionally. On phone-width canvases the title and toolbar cover the top of the view, so
	 * the camera also backs off a little and aims higher, which sits the model lower.
	 */
	private fit(p: ViewPreset): { target: THREE.Vector3; distance: number } {
		const r = this.canvas.getBoundingClientRect();
		let distance = p.distance * Math.max(1, 0.75 / (r.width / Math.max(1, r.height)));
		const target = new THREE.Vector3(...p.target);
		if (r.width < PHONE_WIDTH) {
			distance *= 1.3;
			const visibleHeight = 2 * distance * Math.tan((this.camera.fov / 2) * THREE.MathUtils.DEG2RAD);
			target.y += 0.1 * visibleHeight;
		}
		return { target, distance };
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
		const r = this.canvas.getBoundingClientRect();
		this.renderer.setSize(r.width, r.height, false);
		this.camera.aspect = r.width / Math.max(1, r.height);
		this.camera.updateProjectionMatrix();
		this.requestRender();
	}
}
