/**
 * Centerline deformation check for a joint's path-driven muscles (CPU reference of the shader):
 * rest-pose reconstruction, bone penetration and folds by pose against the old deformer, strands
 * passing through bone, snapping over the whole range, frame continuity, and solve timing.
 *
 *     npm run validate:paths [-- <joint> [mesh ...]]
 */
import { MuscleSystem } from '../src/core/muscle/system';
import { loadJoint, report } from './lib/pathcheck';

const [joint = 'elbow', ...meshes] = process.argv.slice(2);
const j = loadJoint(joint);
const t = performance.now();
const sys = new MuscleSystem(j.spec.paths, j.assets, j.rig);
console.log(`setup (solve + bind ${sys.meshes.length} meshes, ${sys.proxies.length} proxy capsules): ${(performance.now() - t).toFixed(0)} ms`);
const failures = report(j, sys, meshes.length ? meshes : undefined);
if (failures) {
	console.error(`FAIL: ${failures} check(s)`);
	process.exit(1);
}
console.log('OK');
