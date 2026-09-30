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
import { DEFAULT_COLLIDE_OPTIONS, deformMesh, type CollideOptions } from './deform';
import { PathSolver, type PathOptions } from './path';
import { buildProxies, writeCapsules, type ProxySpec } from './proxies';
import type { JointPaths } from './schema';
import { buildContactModel, type ContactModel, type ContactOptions } from './strandContact';

export class MuscleSystem {
	readonly solver: PathSolver;
	/** in the solver's muscle order */
	readonly bound: BoundMesh[];
	readonly meshes: MuscleMesh[];
	readonly restNormals: Float32Array[];
	/** contact between layers; null when turned off (opts.contact false) */
	readonly contact: ContactModel | null;
	readonly proxies: ProxySpec[];
	/** proxy capsules at the last update (8 floats each) */
	readonly capsules: Float32Array;
	readonly collide: CollideOptions;
	private readonly assets: JointAssets;

	constructor(paths: JointPaths, assets: JointAssets, rig: Rig, opts: { path?: Partial<PathOptions>; collide?: Partial<CollideOptions>; contact?: Partial<ContactOptions> | false; proxies?: boolean } = {}) {
		this.assets = assets;
		this.collide = { ...DEFAULT_COLLIDE_OPTIONS, ...(paths.collidePasses !== undefined ? { passes: paths.collidePasses } : {}), ...opts.collide };
		const bones = assets.manifest.bones;
		this.solver = new PathSolver(paths, rig, bones, opts.path);
		this.meshes = paths.muscles.map((d) => {
			const m = assets.muscles.find((x) => x.name === d.mesh);
			if (!m) throw new Error(`Path for unknown mesh ${d.mesh}`);
			return m;
		});
		this.bound = this.meshes.map((m) => bindMesh(this.solver, m.name, m.rest, m.index, assets.fields, bones));
		this.restNormals = this.meshes.map((m) => vertexNormals(m.rest, m.index, m.nv));
		const contact = opts.contact ?? paths.contact;
		this.contact = contact === false ? null : buildContactModel(this.solver, this.bound, assets.fields, contact);
		this.solver.setContact(this.contact);
		this.proxies = opts.proxies ? buildProxies(this.solver, this.bound) : [];
		this.capsules = new Float32Array(this.proxies.length * 8);
		writeCapsules(this.solver, this.proxies, this.capsules);
		this.bound.forEach((b, i) => {
			if (b.caps) setProxyClearance(b, this.meshes[i].rest, this.capsules);
		});
	}

	has(mesh: string): boolean {
		return this.meshes.some((m) => m.name === mesh);
	}

	/** Solve paths and proxies for a pose. */
	update(pose: Pose): void {
		this.solver.solve(pose);
		writeCapsules(this.solver, this.proxies, this.capsules);
	}

	/** CPU reference deformation of one mesh at the last update. */
	deform(mesh: string, outP: Float32Array, outN?: Float32Array): void {
		const i = this.meshes.findIndex((m) => m.name === mesh);
		if (i < 0) throw new Error(`${mesh} has no path`);
		deformMesh(this.solver, this.bound[i], this.meshes[i].rest, this.restNormals[i], this.assets.fields, this.capsules, this.collide, outP, outN);
	}
}
