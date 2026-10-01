/**
 * Everything centerline deformation needs for one joint: the path solver, each muscle mesh bound
 * to its strands, and contact between strands of different layers (strandContact.ts), which keeps
 * the layers apart. Proxy capsules that also push vertices off the muscles beneath are opt-in: with
 * strand contact they add little and make vertices snap where one muscle's belly lies along
 * another's. The viewer uploads the solved state to the GPU each frame; Node tools deform on the CPU
 * with the same data (deformMesh).
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import type { Pose, Rig } from '../rig';
import type { JointAssets, MuscleMesh } from '../types';
import { bindMesh, setProxyClearance, vertexNormals, type BoundMesh } from './bind';
import { bakedKey, correctionValues, type Corrections, type MeshCorrection } from './correct';
import { DEFAULT_COLLIDE_OPTIONS, deformMesh, type CollideOptions } from './deform';
import { PathSolver, type PathOptions } from './path';
import { buildOverProxies, buildProxies, writeCapsules, type ProxySpec } from './proxies';
import type { JointPaths } from './schema';
import { buildContactModel, type ContactModel, type ContactOptions } from './strandContact';
import { Tuner } from './tune';
import { qRotate } from '../math';
import { sdfGradient, sdfSample, SDF_FAR } from '../sdf';

export class MuscleSystem {
	readonly solver: PathSolver;
	/** in the solver's muscle order */
	readonly bound: BoundMesh[];
	readonly meshes: MuscleMesh[];
	readonly restNormals: Float32Array[];
	/** contact between layers (and muscles beside one another); null when there is none */
	readonly contact: ContactModel | null;
	readonly proxies: ProxySpec[];
	/** proxy capsules at the last update (8 floats each) */
	readonly capsules: Float32Array;
	readonly collide: CollideOptions;
	/**
	 * per mesh (solver order), its baked correction and its handles' values at the last update; null where
	 * there is none (a muscle on wraps, or corrections solved against another bake)
	 */
	readonly corrections: ({ m: MeshCorrection; w: Float32Array } | null)[];
	private readonly correctionsOf: Corrections | null;
	/** the joint's hand tuning (MuscleSystem tunes the solver once the meshes are bound at rest), or null */
	readonly tuner: Tuner | null;
	private readonly assets: JointAssets;

	constructor(paths: JointPaths, assets: JointAssets, rig: Rig, opts: { path?: Partial<PathOptions>; collide?: Partial<CollideOptions>; contact?: Partial<ContactOptions> | false; proxies?: boolean } = {}) {
		this.assets = assets;
		this.collide = { ...DEFAULT_COLLIDE_OPTIONS, ...(paths.collidePasses !== undefined ? { passes: paths.collidePasses } : {}), ...opts.collide };
		const bones = assets.manifest.bones;
		this.solver = new PathSolver(paths, rig, bones, opts.path, assets.baked ?? null);
		this.meshes = paths.muscles.map((d) => {
			const m = assets.muscles.find((x) => x.name === d.mesh);
			if (!m) throw new Error(`Path for unknown mesh ${d.mesh}`);
			return m;
		});
		this.bound = this.meshes.map((m) => bindMesh(this.solver, m.name, m.rest, m.index, assets.fields, bones));
		this.restNormals = this.meshes.map((m) => vertexNormals(m.rest, m.index, m.nv));
		// turned off, contact is still kept between muscles named beside one another
		const contact = opts.contact ?? paths.contact, beside = paths.muscles.some((m) => m.beside?.length);
		this.contact =
			contact !== false ? buildContactModel(this.solver, this.bound, assets.fields, contact)
			: beside ? buildContactModel(this.solver, this.bound, assets.fields, { layers: false })
			: null;
		this.solver.setContact(this.contact);
		// off, the meshes muscles lie over (MusclePathDef.over) still have them
		this.proxies = opts.proxies ? buildProxies(this.solver, this.bound) : buildOverProxies(this.solver, this.bound);
		this.capsules = new Float32Array(this.proxies.length * 8);
		writeCapsules(this.solver, this.proxies, this.capsules);
		this.bound.forEach((b, i) => {
			if (b.caps) setProxyClearance(b, this.meshes[i].rest, this.capsules);
		});
		// corrections apply to baked muscles, solved against this bake
		const C = assets.corrections && assets.baked && assets.corrections.key === bakedKey(assets.baked) ? assets.corrections : null;
		if (assets.corrections && !C) console.warn('mesh corrections were solved against another bake; not used (run scripts/correct.ts)');
		this.correctionsOf = C;
		this.corrections = paths.muscles.map((d) => {
			const m = d.baked ? C?.meshes.find((x) => x.mesh === d.mesh) : undefined;
			return m ? { m, w: new Float32Array(m.H * 3) } : null;
		});
		// tuning: each strand's rest direction away from the bone nearest its mid-belly, round it in its frame
		// there; then the tuner (after binding, so the meshes are bound to the untuned rest strands)
		this.tuner = paths.tuning ? new Tuner(paths.tuning, rig) : null;
		if (this.tuner) {
			const S = this.solver, N = S.N, i = N >> 1;
			S.strands.forEach((_, s) => {
				const o = (s * N + i) * 3, x = [S.pos[o], S.pos[o + 1], S.pos[o + 2]];
				let best = SDF_FAR, g: number[] | null = null;
				assets.fields.forEach((f) => {
					if (!f) return;
					const d = sdfSample(f, x[0], x[1], x[2]);
					if (d < best) { best = d; g = sdfGradient(f, x[0], x[1], x[2]); }
				});
				const gv = g as number[] | null;
				if (!gv) return;
				const k = (s * N + i) * 4, q = [S.quat[k], S.quat[k + 1], S.quat[k + 2], S.quat[k + 3]] as [number, number, number, number];
				const n = qRotate(q, [0, 1, 0]), b = qRotate(q, [0, 0, 1]);
				S.setOutward(s, Math.atan2(gv[0] * b[0] + gv[1] * b[1] + gv[2] * b[2], gv[0] * n[0] + gv[1] * n[1] + gv[2] * n[2]));
			});
			S.setTuner(this.tuner);
		}
	}

	has(mesh: string): boolean {
		return this.meshes.some((m) => m.name === mesh);
	}

	/** Solve paths and proxies for a pose. */
	update(pose: Pose): void {
		this.solver.solve(pose);
		writeCapsules(this.solver, this.proxies, this.capsules);
		for (const c of this.corrections) if (c) correctionValues(this.correctionsOf!, c.m, pose, c.w);
	}

	/** CPU reference deformation of one mesh at the last update. */
	deform(mesh: string, outP: Float32Array, outN?: Float32Array): void {
		const i = this.meshes.findIndex((m) => m.name === mesh);
		if (i < 0) throw new Error(`${mesh} has no path`);
		deformMesh(this.solver, this.bound[i], this.meshes[i].rest, this.restNormals[i], this.assets.fields, this.capsules, this.collide, outP, outN, this.corrections[i]);
	}
}
