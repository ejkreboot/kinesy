import * as THREE from 'three';
import { qRotate, rigidToMat4 } from '../core/math';
import type { JointPaths } from '../core/muscle/schema';
import type { MuscleSystem } from '../core/muscle/system';

/** Frame ticks every this many samples, this long (mm). */
const TICK_EVERY = 4;
const TICK = 5;

/**
 * Debug overlay for centerline deformation: solved strands, their frames (normal red, binormal
 * blue), wrap surfaces riding their bones, and the deep-muscle proxy capsules. Drawn over
 * everything; updated after each pose.
 */
export class PathDebug {
	readonly group = new THREE.Group();
	private readonly strands: THREE.Line[] = [];
	private readonly ticks: THREE.LineSegments;
	private readonly surfaces: { mesh: THREE.Mesh; bone: number; base: THREE.Matrix4 }[] = [];
	private readonly capsules: THREE.Mesh[] = [];

	constructor(private readonly system: MuscleSystem, paths: JointPaths, boneNames: string[]) {
		const S = system.solver, N = S.N;
		const over = (m: THREE.Material & { depthTest: boolean }) => Object.assign(m, { depthTest: false, transparent: true });
		for (let s = 0; s < S.strands.length; s++) {
			const g = new THREE.BufferGeometry();
			g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
			const line = new THREE.Line(g, over(new THREE.LineBasicMaterial({ color: 0x111111 })));
			line.frustumCulled = false;
			line.renderOrder = 20;
			this.strands.push(line);
			this.group.add(line);
		}
		const nt = S.strands.length * Math.ceil(N / TICK_EVERY) * 4;
		const tg = new THREE.BufferGeometry();
		tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nt * 3), 3));
		const col = new Float32Array(nt * 3);
		for (let k = 0; k < nt; k += 4) col.set([0.85, 0.1, 0.1, 0.85, 0.1, 0.1, 0.1, 0.3, 0.9, 0.1, 0.3, 0.9], k * 3);
		tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
		this.ticks = new THREE.LineSegments(tg, over(new THREE.LineBasicMaterial({ vertexColors: true })));
		this.ticks.frustumCulled = false;
		this.ticks.renderOrder = 20;
		this.group.add(this.ticks);

		const wire = () => over(new THREE.MeshBasicMaterial({ color: 0x2a7de1, wireframe: true, opacity: 0.35 }));
		for (const s of Object.values(paths.surfaces)) {
			let geo: THREE.BufferGeometry;
			const base = new THREE.Matrix4();
			if (s.kind === 'cylinder') {
				geo = new THREE.CylinderGeometry(s.radius, s.radius, 50, 20, 4, true);
				const a = new THREE.Vector3(...s.axis).normalize();
				base.compose(new THREE.Vector3(...s.center), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(1, 1, 1));
			} else {
				geo = new THREE.SphereGeometry(1, 20, 12);
				const x = new THREE.Vector3(...(s.axes?.[0] ?? [1, 0, 0])).normalize();
				const y0 = new THREE.Vector3(...(s.axes?.[1] ?? [0, 1, 0]));
				const y = y0.sub(x.clone().multiplyScalar(y0.dot(x))).normalize(), z = x.clone().cross(y);
				base.makeBasis(x, y, z).scale(new THREE.Vector3(...s.radii)).setPosition(...s.center);
			}
			const mesh = new THREE.Mesh(geo, wire());
			mesh.matrixAutoUpdate = false;
			mesh.frustumCulled = false;
			mesh.renderOrder = 19;
			this.surfaces.push({ mesh, bone: boneNames.indexOf(s.bone), base });
			this.group.add(mesh);
		}
		const capMat = over(new THREE.MeshBasicMaterial({ color: 0xd08a1a, wireframe: true, opacity: 0.4 }));
		for (let c = 0; c < system.proxies.length; c++) {
			const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), capMat);
			mesh.frustumCulled = false;
			mesh.renderOrder = 19;
			this.capsules.push(mesh);
			this.group.add(mesh);
		}
		this.group.visible = false;
		this.update();
	}

	/** Redraw from the system's last solve. */
	update(): void {
		if (!this.group.visible) return;
		const S = this.system.solver, N = S.N, P = S.pos, Q = S.quat;
		this.strands.forEach((line, s) => {
			const a = line.geometry.attributes.position as THREE.BufferAttribute;
			(a.array as Float32Array).set(P.subarray(s * N * 3, (s + 1) * N * 3));
			a.needsUpdate = true;
		});
		const tp = this.ticks.geometry.attributes.position as THREE.BufferAttribute, T = tp.array as Float32Array;
		let o = 0;
		for (let s = 0; s < S.strands.length; s++)
			for (let i = 0; i < N; i += TICK_EVERY) {
				const k = s * N + i, q = [Q[k * 4], Q[k * 4 + 1], Q[k * 4 + 2], Q[k * 4 + 3]] as [number, number, number, number];
				const p = [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]];
				for (const axis of [[0, TICK, 0], [0, 0, TICK]] as [number, number, number][]) {
					const d = qRotate(q, axis);
					T.set(p, o);
					T.set([p[0] + d[0], p[1] + d[1], p[2] + d[2]], o + 3);
					o += 6;
				}
			}
		tp.needsUpdate = true;
		for (const s of this.surfaces) s.mesh.matrix.fromArray(rigidToMat4(S.bones[s.bone])).multiply(s.base);
		const C = this.system.capsules, up = new THREE.Vector3(0, 1, 0);
		this.capsules.forEach((mesh, c) => {
			const a = new THREE.Vector3(C[c * 8], C[c * 8 + 1], C[c * 8 + 2]), b = new THREE.Vector3(C[c * 8 + 4], C[c * 8 + 5], C[c * 8 + 6]);
			const d = b.clone().sub(a), r = (C[c * 8 + 3] + C[c * 8 + 7]) / 2;
			mesh.position.copy(a).addScaledVector(d, 0.5);
			mesh.quaternion.setFromUnitVectors(up, d.clone().normalize());
			mesh.scale.set(r, Math.max(0.1, d.length()), r);
		});
	}

	setVisible(on: boolean): void {
		this.group.visible = on;
		this.update();
	}
}
