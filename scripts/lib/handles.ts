/**
 * Handles for mesh corrections (correct.ts): H points spread over the rest mesh by farthest-point
 * sampling; each vertex takes its four nearest, weighted (1 − (d/d₅)²)² by distance d over the fifth
 * nearest's d₅ and summing to 1, so a handle's weight reaches zero just as it stops being among a vertex's
 * four nearest (no seams where the four change), and a thin sheet's two faces share handles and move
 * together. `neighbours`: handle pairs sharing a vertex, for keeping a displacement smooth across them.
 */

export interface Handles {
	H: number;
	/** each handle's vertex */
	pick: Int32Array;
	/** per vertex, its four handles (nv × 4) and their weights */
	idx: Uint16Array;
	w: Float32Array;
	/** handle pairs that share a vertex */
	neighbours: [number, number][];
}

export function chooseHandles(R: ArrayLike<number>, nv: number, H: number): Handles {
	const pick = new Int32Array(H), dist = new Float64Array(nv).fill(Infinity);
	const d2 = (a: number, b: number) => (R[a * 3] - R[b * 3]) ** 2 + (R[a * 3 + 1] - R[b * 3 + 1]) ** 2 + (R[a * 3 + 2] - R[b * 3 + 2]) ** 2;
	for (let h = 0; h < H; h++) {
		if (h > 0) {
			let far = 0;
			for (let v = 0; v < nv; v++) if (dist[v] > dist[far]) far = v;
			pick[h] = far;
		}
		for (let v = 0; v < nv; v++) dist[v] = Math.min(dist[v], d2(v, pick[h]));
	}
	const idx = new Uint16Array(nv * 4), w = new Float32Array(nv * 4), pairs = new Set<number>();
	for (let v = 0; v < nv; v++) {
		const near = Array.from(pick, (p, h) => [d2(v, p), h]).sort((a, b) => a[0] - b[0]).slice(0, 5);
		const d5 = Math.max(near[4][0], 1e-9), g = near.slice(0, 4).map(([d]) => (1 - d / d5) ** 2), s = g.reduce((a, b) => a + b, 0) || 1;
		near.slice(0, 4).forEach(([, h], j) => { idx[v * 4 + j] = h; w[v * 4 + j] = g[j] / s; });
		for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { const i = idx[v * 4 + a], j = idx[v * 4 + b]; pairs.add(Math.min(i, j) * 65536 + Math.max(i, j)); }
	}
	return { H, pick, idx, w, neighbours: [...pairs].map((k) => [Math.floor(k / 65536), k % 65536]) };
}
