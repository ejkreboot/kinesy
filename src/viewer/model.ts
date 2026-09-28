import * as THREE from 'three';
import { Deformer } from '../core/deformer';
import { rigidToMat4 } from '../core/math';
import type { Pose, Rig } from '../core/rig';
import type { JointAssets } from '../core/types';
import type { MuscleInfo } from '../joints/types';
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

/** three.js meshes for one joint, driven by the rig and deformer. */
export class JointModel {
	readonly deformer: Deformer;
	pose: Pose;
	/** set to receive timing for each applied pose */
	onPosed: ((ms: number) => void) | null = null;
	private readonly boneMeshes = new Map<string, THREE.Mesh>();
	private readonly muscleMeshes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>();
	private readonly owner = new Map<string, string>();
	private readonly info = new Map<string, MuscleInfo>();
	private readonly out: Record<string, Float32Array> = {};
	private readonly axisLines: { mesh: THREE.Mesh; joint: number; base: THREE.Matrix4 }[] = [];
	private readonly visible = new Map<string, boolean>();
	private focus: Focus | null = null;
	private xray = false;
	private dirty = true;
	private readonly raycaster = new THREE.Raycaster();

	constructor(private readonly stage: Stage, assets: JointAssets, private readonly rig: Rig, muscles: MuscleInfo[]) {
		this.deformer = new Deformer(assets, rig);
		this.pose = rig.initialPose();
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
		for (const m of assets.muscles) {
			const key = this.owner.get(m.name);
			if (!key) throw new Error(`Mesh ${m.name} is not assigned to a muscle`);
			const g = geometry(new Float32Array(m.rest), m.index);
			const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.info.get(key)!.color), roughness: 0.55, metalness: 0, transparent: true });
			const mesh = new THREE.Mesh(g, mat);
			mesh.userData = { muscle: key, part: m.name };
			stage.scene.add(mesh);
			this.muscleMeshes.set(m.name, mesh);
			this.out[m.name] = g.attributes.position.array as Float32Array;
		}
		stage.onBeforeRender(() => this.applyPose());
		this.applyLook();
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

	pick(ev: { clientX: number; clientY: number }): PickHit | null {
		this.raycaster.setFromCamera(this.stage.ndc(ev), this.stage.camera);
		const targets = [...this.muscleMeshes.values()].filter((m) => m.visible && m.material.opacity > 0.3);
		const hit = this.raycaster.intersectObjects(targets, false)[0];
		return hit ? { muscle: hit.object.userData.muscle, part: hit.object.userData.part } : null;
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

	private applyPose(): void {
		if (!this.dirty) return;
		this.dirty = false;
		const t0 = performance.now();
		this.deformer.update(this.pose, this.out);
		const mats = this.rig.def.bones.map((_, i) => new THREE.Matrix4().fromArray(this.deformer.boneMatrix(i)));
		for (const m of this.boneMeshes.values()) m.matrix.copy(mats[m.userData.bone as number]);
		if (this.axisLines.length) {
			const frames = this.rig.solveFrames(this.pose).joints;
			for (const a of this.axisLines) a.mesh.matrix.fromArray(rigidToMat4(frames[a.joint])).multiply(a.base);
		}
		for (const m of this.muscleMeshes.values()) {
			const g = m.geometry;
			g.attributes.position.needsUpdate = true;
			g.computeVertexNormals();
			g.computeBoundingSphere();
		}
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
