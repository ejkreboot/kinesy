import * as THREE from 'three';
import { qRotate, rigidToMat4 } from '../core/math';
import type { PathSolver } from '../core/muscle/path';
import type { JointPaths } from '../core/muscle/schema';
import type { MuscleSystem } from '../core/muscle/system';
import type { Pose } from '../core/rig';

/** Frame ticks every this many samples, this long (mm). */
const TICK_EVERY = 4;
const TICK = 5;

/**
 * Debug overlay for centerline deformation: solved strands, their frames (normal red, binormal
 * blue), wrap surfaces riding their bones, and the deep-muscle proxy capsules. Drawn over
 * everything; updated after each pose. Optionally a second solver's strands (the joint's baked lines
 * of action, where they differ from what is drawn), in orange, on their own toggle.
 */
export class PathDebug {
	readonly group = new THREE.Group();
	/** the comparison solver's strands */
	readonly compareGroup = new THREE.Group();
	private readonly strands: THREE.Line[] = [];
	private readonly compareLines: { line: THREE.Line; strand: number }[] = [];
	private readonly ticks: THREE.LineSegments;
	private readonly surfaces: { mesh: THREE.Mesh; bone: number; base: THREE.Matrix4 }[] = [];
	private readonly capsules: THREE.Mesh[] = [];

	constructor(
		private readonly system: MuscleSystem, paths: JointPaths, boneNames: string[],
		private readonly compare: { solver: PathSolver; pose: () => Pose } | null = null,
		/** strand colour by mesh (default near-black) */
		colors: Map<string, string> = new Map()
	) {
		const S = system.solver, N = S.N;
		const over = (m: THREE.Material & { depthTest: boolean }) => Object.assign(m, { depthTest: false, transparent: true });
		for (let s = 0; s < S.strands.length; s++) {
			const g = new THREE.BufferGeometry();
			g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
			// darkened, to stand out over the muscle it runs through
			const color = new THREE.Color(colors.get(S.muscles[S.strands[s].muscle].def.mesh) ?? 0x111111).multiplyScalar(0.6);
			const line = new THREE.Line(g, over(new THREE.LineBasicMaterial({ color })));
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
		// only the surfaces some strand still wraps (a baked muscle has none)
		const used = new Set(paths.muscles.flatMap((m) => m.strands.flat().flatMap((e) => ('wrap' in e ? [e.wrap] : []))));
		for (const s of Object.entries(paths.surfaces).filter(([n]) => used.has(n)).map(([, s]) => s)) {
			let geo: THREE.BufferGeometry;
			const base = new THREE.Matrix4();
			if (s.kind === 'cylinder') {
				geo = new THREE.CylinderGeometry(s.radius, s.radius, 50, 20, 4, true);
				const a = new THREE.Vector3(...s.axis).normalize();
				base.compose(new THREE.Vector3(...s.center), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(1, 1, 1));
			} else if (s.kind === 'rim') {
				geo = new THREE.CircleGeometry(1, 48);
				const x = new THREE.Vector3(...s.axes[0]).normalize(), y0 = new THREE.Vector3(...s.axes[1]);
				const y = y0.sub(x.clone().multiplyScalar(y0.dot(x))).normalize(), z = x.clone().cross(y);
				base.makeBasis(x, y, z).scale(new THREE.Vector3(s.radii[0], s.radii[1], 1)).setPosition(...s.center);
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
		if (compare) {
			const C = compare.solver;
			const mat = over(new THREE.LineBasicMaterial({ color: 0xe8590c }));
			C.strands.forEach((st, s) => {
				if (!st.baked) return;
				const g = new THREE.BufferGeometry();
				g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(C.N * 3), 3));
				const line = new THREE.Line(g, mat);
				line.frustumCulled = false;
				line.renderOrder = 21;
				this.compareLines.push({ line, strand: s });
				this.compareGroup.add(line);
			});
		}
		this.group.visible = false;
		this.compareGroup.visible = false;
		this.update();
	}

	/** Redraw from the system's last solve. */
	update(): void {
		if (this.compare && this.compareGroup.visible) {
			const C = this.compare.solver, N = C.N;
			C.solve(this.compare.pose());
			for (const { line, strand } of this.compareLines) {
				const a = line.geometry.attributes.position as THREE.BufferAttribute;
				(a.array as Float32Array).set(C.pos.subarray(strand * N * 3, (strand + 1) * N * 3));
				a.needsUpdate = true;
			}
		}
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

	setCompareVisible(on: boolean): void {
		this.compareGroup.visible = on;
		this.update();
	}
}
