/**
 * Contact between strands of different layers: side kept, push shared, strands taut, continuous,
 * rest untouched.
 *
 *     node --import tsx --test tests/contact.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoundMesh } from '../src/core/muscle/bind';
import { PathSolver } from '../src/core/muscle/path';
import type { JointPaths } from '../src/core/muscle/schema';
import { buildContactModel } from '../src/core/muscle/strandContact';
import { Rig, type RigDef } from '../src/core/rig';

/**
 * Bone b turns about the y axis. The lower strand runs along x on bone a; the upper one runs along
 * y from bone a to bone b, 8 mm above it where they cross. Turned half a turn, the upper strand's
 * straight line would pass right through the lower one.
 */
function setup(contact: boolean) {
	const def: RigDef = {
		bones: [{ name: 'a', parent: -1 }, { name: 'b', parent: 0, joints: ['turn'] }],
		joints: [{ id: 'turn', axis: 'turn', restAngle: 0, min: -10, max: 190, initial: 0 }]
	};
	const rig = new Rig(def, { turn: { point: [0, 0, 0], dir: [0, 1, 0] } }, ['a', 'b']);
	const paths: JointPaths = {
		surfaces: {},
		muscles: [
			{ mesh: 'low', layer: 0, anchor: [0, 0], strands: [[{ bone: 'a', p: [-60, 0, 0] }, { bone: 'a', p: [60, 0, 0] }]] },
			{ mesh: 'up', layer: 1, anchor: [0, 0], strands: [[{ bone: 'a', p: [0, 60, 8] }, { bone: 'b', p: [0, -60, 8] }]] }
		]
	};
	const solver = new PathSolver(paths, rig, ['a', 'b']);
	if (contact) {
		// each mesh a round tube of radius 3 about its strand
		const N = solver.N, ring = 8, bound = [0, 1].map((muscle) => {
			const nv = N * ring, path = new Float32Array(nv * 4), offset = new Float32Array(nv * 3);
			for (let i = 0; i < N; i++)
				for (let k = 0; k < ring; k++) {
					const v = i * ring + k, t = (2 * Math.PI * k) / ring;
					path.set([i / (N - 1), 0, muscle, muscle], v * 4);
					offset.set([0, 3 * Math.cos(t), 3 * Math.sin(t)], v * 3);
				}
			return { muscle, nv, path, offset, profile: new Float64Array(N) } as unknown as BoundMesh;
		});
		solver.setContact(buildContactModel(solver, bound, [], { reach: 6 }));
	}
	return solver;
}

const mid = (solver: PathSolver, s: number) => {
	const o = (s * solver.N + (solver.N >> 1)) * 3;
	return [solver.pos[o], solver.pos[o + 1], solver.pos[o + 2]];
};

test('contact leaves the rest pose alone', () => {
	const a = setup(false), b = setup(true);
	a.solve({ turn: 0 });
	b.solve({ turn: 0 });
	for (let k = 0; k < a.pos.length; k++) assert.ok(Math.abs(a.pos[k] - b.pos[k]) < 1e-6, `sample value ${k} moved`);
});

test('the upper strand keeps its side, both strands give way, and it bends taut', () => {
	const free = setup(false), s = setup(true);
	free.solve({ turn: 180 });
	s.solve({ turn: 180 });
	// free, the upper strand passes through the lower one
	assert.ok(Math.abs(mid(free, 1)[2]) < 0.5);
	// kept apart by the two tubes' thickness (6 mm, less the soft start of the push), upper on top
	const up = mid(s, 1)[2], low = mid(s, 0)[2];
	assert.ok(up - low > 5.3, `apart by ${(up - low).toFixed(2)} mm`);
	assert.ok(up > 1 && low < -1, `shared: upper +${up.toFixed(2)}, lower ${low.toFixed(2)}`);
	// taut: displacement falls linearly from the contact to the ends, not in a local bump
	const N = s.N, dz = (i: number) => s.pos[(N + i) * 3 + 2] - free.pos[(N + i) * 3 + 2];
	const q = Math.round((N - 1) / 4), h = dz(N >> 1);
	assert.ok(Math.abs(dz(q) - h / 2) < 0.2 * h, `at a quarter span ${dz(q).toFixed(2)} vs half of ${h.toFixed(2)}`);
});

test('contact is continuous through the sweep', () => {
	const s = setup(true);
	let prev: Float64Array | null = null, worst = 0;
	for (let a = 0; a <= 180; a += 0.5) {
		s.solve({ turn: a });
		if (prev) for (let k = 0; k < prev.length; k += 3) worst = Math.max(worst, Math.hypot(s.pos[k] - prev[k], s.pos[k + 1] - prev[k + 1], s.pos[k + 2] - prev[k + 2]));
		prev = s.pos.slice();
	}
	// the free insertion moves 8 mm × 0.5° ≈ 0.07 mm a step; a pop would be millimetres
	assert.ok(worst < 0.5, `largest step ${worst.toFixed(3)} mm`);
});
