/**
 * The surface shown for a muscle: a detailed mesh carried by the coarse one the deformer collides
 * (pipeline/lib/display.py embeds it). Each display vertex sits on a triangle of the muscle mesh at
 * barycentrics (u, v), offset by h along the mesh's unit vertex normals interpolated there, so the
 * detail rides the deformed surface and stays smooth across its triangles.
 *
 * The offsets are taken along the normals of the muscle's targets (skinned and bulged, before
 * collision), whose normals turn only as the limb does; collision's corrections are then carried
 * over as displacements, interpolated the same way. Along the normals of the collided surface, a
 * sharp dent would swing the offsets across each other and fold the detail inside it.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import { vertexNormals } from './contact';
import type { DisplayMesh, IndexArray } from './types';

/**
 * Place display mesh `d` into `out`, on its muscle mesh (nv vertices, triangles `index`): offset
 * along the normals of its targets T, then moved by the muscle's collision corrections (P − T).
 * Without `P` (or with P = T) it sits on T. `N`: scratch for vertex normals (nv * 3).
 */
export function placeDisplay(T: ArrayLike<number>, index: IndexArray, nv: number, d: DisplayMesh, N: Float32Array, out: Float32Array, P: ArrayLike<number> = T): void {
	vertexNormals(T, index, nv, N);
	const { tri, place } = d;
	for (let i = 0; i < d.nv; i++) {
		const t = tri[i] * 3, a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
		const u = place[i * 3], v = place[i * 3 + 1], h = place[i * 3 + 2], w = 1 - u - v, o = i * 3;
		// P + h·N = T + h·N + (P − T), interpolated
		out[o] = w * (P[a] + h * N[a]) + u * (P[b] + h * N[b]) + v * (P[c] + h * N[c]);
		out[o + 1] = w * (P[a + 1] + h * N[a + 1]) + u * (P[b + 1] + h * N[b + 1]) + v * (P[c + 1] + h * N[c + 1]);
		out[o + 2] = w * (P[a + 2] + h * N[a + 2]) + u * (P[b + 2] + h * N[b + 2]) + v * (P[c + 2] + h * N[c + 2]);
	}
}
