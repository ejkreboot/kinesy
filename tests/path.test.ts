/**
 * Path solver: wrap geometry, lift-off continuity, and frame continuity.
 *
 *     npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vec3 } from '../src/core/math';
import { PathSolver, polyLength } from '../src/core/muscle/path';
import type { JointPaths } from '../src/core/muscle/schema';
import { circleWrap, wrapCylinder, wrapEllipsoid } from '../src/core/muscle/wrap';
import { Rig, type RigDef } from '../src/core/rig';

const DEG = Math.PI / 180;
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`);

test('circle wrap: tangent points are tangent, lengths match', () => {
	const r = 5;
	const w = circleWrap(20, 3, -18, -4, r);
	assert.ok(w);
	for (const [th, px, py, len] of [[w.th0, 20, 3, w.lp], [w.th0 + w.dth, -18, -4, w.ls]] as const) {
		const qx = r * Math.cos(th), qy = r * Math.sin(th);
		// (Q − p) ⟂ Q
		near((qx - px) * qx + (qy - py) * qy, 0, 1e-9, 'tangency');
		near(Math.hypot(qx - px, qy - py), len, 1e-9, 'length');
	}
	// a line passing below the center (center on its right) must still go counterclockwise: over the top
	const far = circleWrap(20, -30, -20, -30, r)!;
	assert.ok(far && Math.sin(far.th0) > 0 && Math.sin(far.th0 + far.dth) > 0);
	// endpoints close to the circle on the wrong side: most of a turn
	assert.ok(circleWrap(1, -5.5, -1, -5.5, r)!.dth > Math.PI);
	// and one missing the circle on the counterclockwise side does not wrap
	assert.equal(circleWrap(20, 30, -20, 30, r), null);
});

test('cylinder wrap follows a helix: length matches the unrolled straight line', () => {
	const c: Vec3 = [1, 2, 3], a: Vec3 = [0, 0, 1], r = 6;
	const P: Vec3 = [30, 10, -20], S: Vec3 = [-25, -5, 40];
	for (const side of [1, -1]) {
		const out: number[] = [];
		assert.ok(wrapCylinder(P, S, c, a, r, side, out));
		const path = [...P, ...out, ...S];
		// unrolled: the 2D length (tangent + arc + tangent) against the axial rise
		const w = circleWrap(P[0] - c[0], side * (P[1] - c[1]), S[0] - c[0], side * (S[1] - c[1]), r)!;
		const L2 = w.lp + r * w.dth + w.ls;
		near(polyLength(path), Math.hypot(L2, S[2] - P[2]), 0.004 * L2, `side ${side}`);
		// every wrap point lies on the cylinder
		for (let k = 0; k < out.length; k += 3) near(Math.hypot(out[k] - c[0], out[k + 1] - c[1]), r, 1e-9);
	}
});

test('sphere wrap: great-circle tangents', () => {
	const R = [1, 0, 0, 0, 1, 0, 0, 0, 1], rad = 10;
	const P: Vec3 = [25, 3, 0], S: Vec3 = [-22, 4, 1];
	const out: number[] = [];
	assert.ok(wrapEllipsoid(P, S, [0, 0, 0], [rad, rad, rad], R, out));
	for (let k = 0; k < out.length; k += 3) near(Math.hypot(out[k], out[k + 1], out[k + 2]), rad, 1e-9);
	const q = out.slice(0, 3);
	near((q[0] - P[0]) * q[0] + (q[1] - P[1]) * q[1] + (q[2] - P[2]) * q[2], 0, 1e-6, 'tangent at entry');
	// missing the sphere: no wrap
	assert.equal(wrapEllipsoid([25, 30, 0], [-22, 30, 0], [0, 0, 0], [rad, rad, rad], R, []), false);
});

/** A two-bone rig: bone "b" turns about `axis` through the origin. */
function twoBone(axis: Vec3, min = -175, max = 175): Rig {
	const def: RigDef = {
		bones: [{ name: 'a', parent: -1 }, { name: 'b', parent: 0, joints: ['turn'] }],
		joints: [{ id: 'turn', axis: 'turn', restAngle: 0, min, max, initial: 0 }]
	};
	return new Rig(def, { turn: { point: [0, 0, 0], dir: axis } }, ['a', 'b']);
}

/** Largest movement of any sample between consecutive poses, and the median. */
function sweep(solver: PathSolver, poses: number[], joint = 'turn'): { maxStep: number; median: number; maxTurn: number } {
	const steps: number[] = [];
	let prev: Float64Array | null = null, prevQ: Float64Array | null = null, maxTurn = 0;
	for (const a of poses) {
		solver.solve({ [joint]: a });
		if (prev && prevQ) {
			let m = 0;
			for (let k = 0; k < prev.length; k += 3) m = Math.max(m, Math.hypot(solver.pos[k] - prev[k], solver.pos[k + 1] - prev[k + 1], solver.pos[k + 2] - prev[k + 2]));
			steps.push(m);
			for (let k = 0; k < prevQ.length; k += 4) {
				const d = Math.abs(solver.quat[k] * prevQ[k] + solver.quat[k + 1] * prevQ[k + 1] + solver.quat[k + 2] * prevQ[k + 2] + solver.quat[k + 3] * prevQ[k + 3]);
				maxTurn = Math.max(maxTurn, 2 * Math.acos(Math.min(1, d)));
			}
		}
		prev = solver.pos.slice();
		prevQ = solver.quat.slice();
	}
	const sorted = [...steps].sort((x, y) => x - y);
	return { maxStep: sorted[sorted.length - 1], median: sorted[sorted.length >> 1], maxTurn };
}

test('wrap lift-off is continuous: no popping as the path leaves the cylinder', () => {
	// the insertion swings around a cylinder on bone a; the path wraps, thins to a touch, lifts off
	const rig = twoBone([0, 0, 1], -120, 120);
	const paths: JointPaths = {
		surfaces: { post: { kind: 'cylinder', bone: 'a', center: [0, 0, 0], axis: [0, 0, 1], radius: 8 } },
		muscles: [{ mesh: 'm', layer: 0, strands: [[{ bone: 'a', p: [-60, 12, 0] }, { wrap: 'post', side: -1 }, { bone: 'b', p: [50, 12, 5] }]] }]
	};
	const solver = new PathSolver(paths, rig, ['a', 'b']);
	const poses = Array.from({ length: 2401 }, (_, i) => -120 + i * 0.1);
	let wrapped = 0, straight = 0;
	for (const a of poses) {
		const poly = solver.polyline(0, rig.solve({ turn: a }));
		if (poly.length > 6) wrapped++;
		else straight++;
	}
	assert.ok(wrapped > 100 && straight > 100, `sweep should cross lift-off (wrapped ${wrapped}, straight ${straight})`);
	const s = sweep(solver, poses);
	// at 0.1° steps and ~60 mm lever, a sample moves ~0.1 mm; a pop would be many times that
	assert.ok(s.maxStep < 4 * s.median + 0.05, `max step ${s.maxStep.toFixed(3)} mm vs median ${s.median.toFixed(3)}`);
	assert.ok(s.maxTurn < 3 * DEG, `frame turned ${(s.maxTurn / DEG).toFixed(2)}° in one 0.1° step`);
});

test('lift-off is continuous when the insertion lies inside the cylinder (tendon on bone)', () => {
	// the insertion sits 2 mm inside a cylinder on the bone that turns: the radius and tuberosity
	const rig = twoBone([0, 0, 1], -170, 170);
	const paths: JointPaths = {
		surfaces: { shaft: { kind: 'cylinder', bone: 'b', center: [0, 0, 0], axis: [0, 0, 1], radius: 8 } },
		muscles: [{ mesh: 'm', layer: 0, strands: [[{ bone: 'a', p: [5, 80, 60] }, { wrap: 'shaft' }, { bone: 'b', p: [6, 0, 0] }]] }]
	};
	const solver = new PathSolver(paths, rig, ['a', 'b']);
	const poses = Array.from({ length: 3401 }, (_, i) => -170 + i * 0.1);
	const s = sweep(solver, poses);
	assert.ok(s.maxStep < 4 * s.median + 0.05, `max step ${s.maxStep.toFixed(3)} mm vs median ${s.median.toFixed(3)}`);
	assert.ok(s.maxTurn < 3 * DEG, `frame turned ${(s.maxTurn / DEG).toFixed(2)}° in one 0.1° step`);
});

test('parallel transport adds no twist along a bend', () => {
	// a planar path bent 120° over a cylinder: the frame normal stays on the bend axis throughout
	const rig = twoBone([0, 1, 0]);
	const paths: JointPaths = {
		surfaces: { roll: { kind: 'cylinder', bone: 'a', center: [0, 0, 0], axis: [0, 0, 1], radius: 10 } },
		muscles: [{ mesh: 'm', layer: 0, strands: [[{ bone: 'a', p: [-60, 30, 0] }, { wrap: 'roll', side: -1 }, { bone: 'a', p: [60, -40, 0] }]] }]
	};
	const solver = new PathSolver(paths, rig, ['a', 'b']);
	const Q = solver.quat;
	for (let i = 0; i < solver.N; i++) {
		const [x, y, z, w] = Q.slice(i * 4, i * 4 + 4);
		// frame binormal = third column of the rotation
		const bz = 1 - 2 * (x * x + y * y);
		const tz = 2 * (x * z - y * w), rz = 2 * (y * z + x * w);
		near(Math.abs(bz) + 0 * tz, 1, 1e-6, `binormal off the bend axis at sample ${i}`);
		near(tz, 0, 1e-6);
		near(rz, 0, 1e-6);
	}
});

test('twist unwraps past 180° without flipping, statelessly', () => {
	// the insertion bone turns about the path's own axis; the twist must track the joint angle
	const rig = twoBone([0, 1, 0]);
	const paths: JointPaths = {
		surfaces: {},
		muscles: [{ mesh: 'm', layer: 0, strands: [[{ bone: 'a', p: [0, 100, 0] }, { bone: 'b', p: [0, -100, 0] }]] }]
	};
	const solver = new PathSolver(paths, rig, ['a', 'b']);
	// jump straight to large angles (no history): each must give its own angle
	for (const a of [170, -170, 120, 175, -175, 0, 90]) {
		solver.solve({ turn: a });
		// the path runs −y and the bone turns about +y, so the frame twists by −a about the tangent
		near(solver.twistAngle[0], -a * DEG, 1e-6, `twist at ${a}°`);
	}
	const s = sweep(solver, Array.from({ length: 351 }, (_, i) => -175 + i));
	assert.ok(s.maxTurn < 2 * DEG, `frame turned ${(s.maxTurn / DEG).toFixed(2)}° in one 1° step`);
});

test('twist distribution follows the weights', () => {
	const rig = twoBone([0, 1, 0]);
	const paths: JointPaths = {
		surfaces: {},
		muscles: [{ mesh: 'm', layer: 0, strands: [[{ bone: 'a', p: [0, 100, 0] }, { bone: 'b', p: [0, -100, 0] }]] }]
	};
	const solver = new PathSolver(paths, rig, ['a', 'b']);
	const N = solver.N;
	// all the twist in the last quarter
	solver.setTwistWeights(0, Array.from({ length: N }, (_, i) => Math.max(0, (i / (N - 1) - 0.75) / 0.25)));
	solver.solve({ turn: 150 });
	const q = (i: number) => solver.quat.slice(i * 4, i * 4 + 4);
	const angle = (a: Float64Array, b: Float64Array) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
	near(angle(q(0), q(Math.floor(N * 0.7))), 0, 1e-6, 'belly untwisted');
	near(angle(q(0), q(N - 1)), 150 * DEG, 1e-6, 'full twist at insertion');
});

test('a head that joins another muscle ends on the strand it joins, wherever that moves', () => {
	// muscle a runs from bone a to bone b; head h ends on it, 10 mm past the turn axis
	const rig = twoBone([0, 0, 1], -90, 90);
	const paths: JointPaths = {
		surfaces: {},
		muscles: [
			{ mesh: 'a', layer: 0, strands: [[{ bone: 'a', p: [-60, 5, 0] }, { bone: 'b', p: [60, 5, 0] }]] },
			{ mesh: 'h', layer: 0, strands: [[{ bone: 'a', p: [-40, 50, 0] }, { join: 'a', p: [10, 5, 0] }]] }
		]
	};
	const solver = new PathSolver(paths, rig, ['a', 'b']);
	const N = solver.N, a = solver.strandOf('a'), h = solver.strandOf('h');
	// where the join sits on a's strand, in samples (its strand is straight and evenly sampled at rest)
	const sigma = (70 / 120) * (N - 1);
	for (const turn of [0, 30, -60, 90]) {
		solver.solve({ turn });
		const j = Math.floor(sigma), u = sigma - j, pa = (k: number) => solver.pos[(a * N + j) * 3 + k] * (1 - u) + solver.pos[(a * N + j + 1) * 3 + k] * u;
		const end = [0, 1, 2].map((k) => solver.pos[(h * N + N - 1) * 3 + k]);
		near(Math.hypot(end[0] - pa(0), end[1] - pa(1), end[2] - pa(2)), 0, 1e-6, `turn ${turn}: head end off the strand by`);
	}
	// with nothing of a head's own past the join, the texture still has room for the virtual bone
	assert.ok(solver.textureSize()[0] >= 2 * solver.bones.length);
});
