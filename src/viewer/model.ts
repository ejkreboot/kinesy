import * as THREE from 'three';
import { Deformer, type DeformerOptions } from '../core/deformer';
import { rigidToMat4 } from '../core/math';
import type { JointPaths } from '../core/muscle/schema';
import { MuscleSystem } from '../core/muscle/system';
import type { Pose, Rig } from '../core/rig';
import type { JointAssets } from '../core/types';
import type { MuscleInfo } from '../joints/types';
import { decodePick, MuscleGpu } from './muscleGpu';
import type { Stage } from './stage';

export interface Focus {
	/** muscle keys to light */
	muscles?: string[];
	/** or specific mesh names (single heads) */
	parts?: string[];
}

export interface PickHit {
	muscle: string;
	part: string;
}

const BONE_COLOR = 0xe8e0cb;
/** Layer the pick pass renders (muscle meshes only). */
const PICK_LAYER = 7;

/**
 * three.js meshes for one joint, driven by the rig. Muscles with a path (JointModule.paths) are
 * deformed on the GPU along their solved centerlines (muscleGpu.ts); the rest by the CPU deformer.
 */
export class JointModel {
	readonly deformer: Deformer;
	/** centerline deformation, when the joint has paths */
	readonly muscleSystem: MuscleSystem | null = null;
	readonly gpu: MuscleGpu | null = null;
	pose: Pose;
	/** set to receive timing for each applied pose */
	onPosed: ((ms: number) => void) | null = null;
	/** called after each applied pose (debug overlays) */
	readonly posed: (() => void)[] = [];
	private readonly boneMeshes = new Map<string, THREE.Mesh>();
	private readonly muscleMeshes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>();
	private readonly owner = new Map<string, string>();
	private readonly info = new Map<string, MuscleInfo>();
	/** CPU-deformed muscle meshes only */
	private readonly out: Record<string, Float32Array> = {};
	private readonly axisLines: { mesh: THREE.Mesh; joint: number; base: THREE.Matrix4 }[] = [];
	private readonly visible = new Map<string, boolean>();
	private readonly pickMats = new Map<THREE.Mesh, THREE.MeshBasicMaterial>();
	private readonly pickParts: string[] = [];
	private readonly pickTarget = new THREE.WebGLRenderTarget(1, 1);
	private readonly pickPixel = new Uint8Array(4);
	private focus: Focus | null = null;
	private xray = false;
	private dirty = true;

	constructor(
		private readonly stage: Stage, assets: JointAssets, private readonly rig: Rig, muscles: MuscleInfo[],
		opts: Partial<DeformerOptions> = {}, paths?: JointPaths
	) {
		this.deformer = new Deformer(assets, rig, opts);
		this.pose = rig.initialPose();
		if (paths) {
			this.muscleSystem = new MuscleSystem(paths, assets, rig);
			this.gpu = new MuscleGpu(this.muscleSystem, assets);
		}
		for (const m of muscles) {
			this.info.set(m.key, m);
			this.visible.set(m.key, true);
			for (const mesh of m.meshes) this.owner.set(mesh, m.key);
		}

		const boneMat = new THREE.MeshStandardMaterial({ color: BONE_COLOR, roughness: 0.72, metalness: 0 });
		for (const b of assets.bones) {
			const g = geometry(b.rest, b.index);
			const mesh = new THREE.Mesh(g, boneMat);
			mesh.matrixAutoUpdate = false;
			mesh.userData.bone = b.bone;
			stage.scene.add(mesh);
			this.boneMeshes.set(b.name, mesh);
		}
		const sys = this.muscleSystem, gpu = this.gpu;
		for (const m of assets.muscles) {
			const key = this.owner.get(m.name);
			if (!key) throw new Error(`Mesh ${m.name} is not assigned to a muscle`);
			const g = geometry(new Float32Array(m.rest), m.index);
			const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.info.get(key)!.color), roughness: 0.55, metalness: 0, transparent: true });
			const mesh = new THREE.Mesh(g, mat);
			mesh.userData = { muscle: key, part: m.name };
			const bound = sys && gpu ? sys.bound[sys.meshes.findIndex((x) => x.name === m.name)] ?? null : null;
			if (bound && gpu) {
				// rest-pose buffers stay as they are; the vertex shader moves them
				gpu.bindGeometry(g, bound);
				gpu.patch(mat, bound);
				const d = gpu.depthMaterials(bound);
				mesh.customDepthMaterial = d.depth;
				mesh.customDistanceMaterial = d.distance;
				// bounds are the rest pose's; the deformed mesh can leave them
				mesh.frustumCulled = false;
			} else this.out[m.name] = g.attributes.position.array as Float32Array;
			this.pickParts.push(m.name);
			const pm = gpu ? gpu.pickMaterial(this.pickParts.length, bound) : flatPickMaterial(this.pickParts.length);
			this.pickMats.set(mesh, pm);
			mesh.layers.enable(PICK_LAYER);
			stage.scene.add(mesh);
			this.muscleMeshes.set(m.name, mesh);
		}
		stage.onBeforeRender(() => this.applyPose());
		this.applyLook();
	}

	/** Whether the GPU deformation runs (debug: off shows path-driven muscles at rest). */
	setDeformation(on: boolean): void {
		if (!this.gpu) return;
		this.gpu.enabled = on;
		this.stage.requestRender();
	}

	setPose(pose: Pose): void {
		this.pose = this.rig.clamp({ ...this.pose, ...pose });
		this.dirty = true;
		this.stage.requestRender();
	}

	/** Axis overlay for a joint, riding on the frame its axis is expressed in. */
	addAxis(jointId: string, color: number, length: number, offset = 0): void {
		const ax = this.rig.axis(jointId);
		const joint = this.rig.def.joints.findIndex((j) => j.id === jointId);
		const dir = new THREE.Vector3(...ax.dir);
		const mid = new THREE.Vector3(...ax.point).addScaledVector(dir, offset);
		const g = new THREE.CylinderGeometry(1.4, 1.4, length, 10).rotateX(Math.PI / 2);
		const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
		mesh.renderOrder = 10;
		mesh.matrixAutoUpdate = false;
		mesh.visible = false;
		const base = new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), new THREE.Vector3(1, 1, 1));
		mesh.matrix.copy(base);
		this.stage.scene.add(mesh);
		this.axisLines.push({ mesh, joint, base });
		this.dirty = true;
	}

	setAxesVisible(on: boolean): void {
		for (const a of this.axisLines) a.mesh.visible = on;
		this.stage.requestRender();
	}

	setBoneMeshVisible(name: string, on: boolean, opacity?: number): void {
		const m = this.boneMeshes.get(name);
		if (!m) return;
		if (opacity !== undefined && opacity < 1 && !(m.material as THREE.Material).transparent) {
			const mat = (m.material as THREE.MeshStandardMaterial).clone();
			mat.transparent = true;
			mat.opacity = opacity;
			m.material = mat;
		}
		m.visible = on;
		this.stage.requestRender();
	}

	setMuscleVisible(key: string, on: boolean): void {
		this.visible.set(key, on);
		this.applyLook();
	}

	setXray(on: boolean): void {
		this.xray = on;
		this.applyLook();
	}

	setFocus(focus: Focus | null): void {
		this.focus = focus;
		this.applyLook();
	}

	/**
	 * The muscle under a pointer: one pixel rendered with flat ID colours through the same
	 * deformation the screen uses, so it hits what is shown at any pose, mid-animation included.
	 */
	pick(ev: { clientX: number; clientY: number }): PickHit | null {
		this.applyPose();
		const { renderer, scene, camera, canvas } = this.stage;
		const r = canvas.getBoundingClientRect();
		const x = ev.clientX - r.left, y = ev.clientY - r.top;
		if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
		const swapped: [THREE.Mesh, THREE.Material, boolean][] = [];
		for (const mesh of this.muscleMeshes.values()) {
			swapped.push([mesh, mesh.material, mesh.visible]);
			// what the raycast picked before: visible, not faded out
			mesh.visible = mesh.visible && mesh.material.opacity > 0.3;
			mesh.material = this.pickMats.get(mesh)! as unknown as THREE.MeshStandardMaterial;
		}
		const mask = camera.layers.mask, clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
		camera.layers.set(PICK_LAYER);
		camera.setViewOffset(r.width, r.height, x, y, 1, 1);
		renderer.setRenderTarget(this.pickTarget);
		renderer.setClearColor(0x000000, 0);
		renderer.clear();
		renderer.render(scene, camera);
		renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickPixel);
		renderer.setRenderTarget(null);
		renderer.setClearColor(clear, alpha);
		camera.clearViewOffset();
		camera.layers.mask = mask;
		for (const [mesh, mat, vis] of swapped) {
			mesh.material = mat as THREE.MeshStandardMaterial;
			mesh.visible = vis;
		}
		const id = decodePick(this.pickPixel);
		const part = id ? this.pickParts[id - 1] : undefined;
		return part ? { muscle: this.owner.get(part)!, part } : null;
	}

	private applyLook(): void {
		const f = this.focus;
		for (const [part, mesh] of this.muscleMeshes) {
			const key = this.owner.get(part)!;
			const lit = !f || (f.parts ? f.parts.includes(part) : (f.muscles ?? []).includes(key));
			mesh.visible = this.visible.get(key)! || (!!f && lit);
			const op = lit ? (this.xray ? 0.45 : 1) : 0.1;
			const mat = mesh.material;
			mat.opacity = op;
			mat.depthWrite = op > 0.5;
			const glow = lit && !!f;
			mat.emissive.set(glow ? this.info.get(key)!.color : 0x000000);
			mat.emissiveIntensity = glow ? 0.18 : 0;
			mesh.renderOrder = lit ? 2 : 1;
		}
		this.stage.requestRender();
	}

	/** Bring meshes to the current pose if it changed (runs before each render and pick). */
	applyPose(): void {
		if (!this.dirty) return;
		this.dirty = false;
		const t0 = performance.now();
		if (this.muscleSystem && this.gpu) {
			this.muscleSystem.update(this.pose);
			this.gpu.update();
		}
		const cpu = Object.keys(this.out);
		if (cpu.length) this.deformer.update(this.pose, this.out);
		const mats = this.rig.solve(this.pose).map((w) => new THREE.Matrix4().fromArray(rigidToMat4(w)));
		for (const m of this.boneMeshes.values()) m.matrix.copy(mats[m.userData.bone as number]);
		if (this.axisLines.length) {
			const frames = this.rig.solveFrames(this.pose).joints;
			for (const a of this.axisLines) a.mesh.matrix.fromArray(rigidToMat4(frames[a.joint])).multiply(a.base);
		}
		for (const name of cpu) {
			const g = this.muscleMeshes.get(name)!.geometry;
			g.attributes.position.needsUpdate = true;
			g.computeVertexNormals();
			g.computeBoundingSphere();
		}
		for (const f of this.posed) f();
		this.onPosed?.(performance.now() - t0);
	}
}

function geometry(pos: Float32Array, index: Uint16Array | Uint32Array): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	g.setIndex(new THREE.BufferAttribute(index, 1));
	g.computeVertexNormals();
	return g;
}

/** ID material for joints without paths (every muscle CPU-deformed). */
function flatPickMaterial(id: number): THREE.MeshBasicMaterial {
	const c = new THREE.Color().setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, THREE.LinearSRGBColorSpace);
	return new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
}
