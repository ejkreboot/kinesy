/**
 * Smooth corrections for a mesh. Collision gives some vertices a push — a half-space constraint on
 * the vertex's displacement d (d · u ≥ c: move at least c along u) — and the rest of the surface
 * must follow smoothly rather than leave those vertices as spikes. relax() solves for a
 * displacement field over the pushed vertices and the rings around them: Jacobi averaging (each
 * displacement becomes its neighbours' mean) with the constraints re-imposed after every sweep,
 * which converges to the smoothest field that satisfies them all — a dent or a swell that fades
 * out over the surrounding rings, with every push fully met.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */

/** Constraint slots: a vertex holds at most one of each kind (bone last, so bone wins). */
export const SLOT_CONTACT = 0;
export const SLOT_BONE = 1;
const SLOTS = 2;

/** Per-vertex half-space constraints of one mesh. */
export class Constraints {
	readonly u: Float32Array;
	readonly c: Float32Array;
	/** per vertex, a bit per slot in use */
	readonly on: Uint8Array;
	/** vertices with any constraint */
	readonly list: Uint32Array;
	n = 0;

	constructor(nv: number) {
		this.u = new Float32Array(nv * SLOTS * 3);
		this.c = new Float32Array(nv * SLOTS);
		this.on = new Uint8Array(nv);
		this.list = new Uint32Array(nv);
	}

	clear(): void {
		for (let i = 0; i < this.n; i++) this.on[this.list[i]] = 0;
		this.n = 0;
	}

	/** Require vertex v to move at least c along unit u. A second push in the same slot keeps the
	 * larger (contact pushes from several muscles share the vertex's own normal). */
	add(v: number, slot: number, ux: number, uy: number, uz: number, c: number): void {
		const bit = 1 << slot, k = v * SLOTS + slot;
		if (!this.on[v]) this.list[this.n++] = v;
		else if (this.on[v] & bit && this.c[k] >= c) return;
		this.on[v] |= bit;
		this.u[k * 3] = ux;
		this.u[k * 3 + 1] = uy;
		this.u[k * 3 + 2] = uz;
		this.c[k] = c;
	}

	/** Make displacement D[o..o+2] of vertex v meet its constraints. */
	impose(v: number, D: Float32Array, o: number): void {
		const on = this.on[v];
		for (let s = 0; s < SLOTS; s++) {
			if (!(on & (1 << s))) continue;
			const k = v * SLOTS + s, ux = this.u[k * 3], uy = this.u[k * 3 + 1], uz = this.u[k * 3 + 2];
			const short = this.c[k] - (D[o] * ux + D[o + 1] * uy + D[o + 2] * uz);
			if (short <= 0) continue;
			D[o] += short * ux;
			D[o + 1] += short * uy;
			D[o + 2] += short * uz;
		}
	}
}

/** Scratch reused across calls (sized to the largest mesh). */
export class RelaxScratch {
	D = new Float32Array(0);
	S = new Float32Array(0);
	mark = new Uint8Array(0);
	active = new Uint32Array(0);

	fit(nv: number): void {
		if (this.mark.length >= nv) return;
		this.D = new Float32Array(nv * 3);
		this.S = new Float32Array(nv * 3);
		this.mark = new Uint8Array(nv);
		this.active = new Uint32Array(nv);
	}
}

/**
 * Displace P (a mesh of nv vertices, adjacency CSR) so its constrained vertices meet their
 * constraints and the correction fades smoothly over `iters` rings around them. Returns the
 * number of vertices moved.
 */
export function relax(P: Float32Array, nv: number, adjStart: Uint32Array, adj: Uint32Array, K: Constraints, iters: number, sc: RelaxScratch): number {
	if (!K.n) return 0;
	sc.fit(nv);
	const { D, S, mark, active } = sc;
	let na = 0;
	for (let i = 0; i < K.n; i++) {
		const v = K.list[i];
		mark[v] = 1;
		active[na++] = v;
	}
	// the region: the constrained vertices and `iters` rings around them (beyond, D stays 0)
	let from = 0;
	for (let r = 0; r < iters; r++) {
		const to = na;
		for (let a = from; a < to; a++)
			for (let k = adjStart[active[a]]; k < adjStart[active[a] + 1]; k++) {
				const u = adj[k];
				if (!mark[u]) {
					mark[u] = 1;
					active[na++] = u;
				}
			}
		from = to;
	}
	for (let a = 0; a < na; a++) {
		const o = active[a] * 3;
		D[o] = D[o + 1] = D[o + 2] = 0;
		if (K.on[active[a]]) K.impose(active[a], D, o);
	}
	for (let it = 0; it < iters; it++) {
		for (let a = 0; a < na; a++) {
			const v = active[a], o = v * 3, k0 = adjStart[v], k1 = adjStart[v + 1];
			let sx = 0, sy = 0, sz = 0;
			for (let k = k0; k < k1; k++) {
				const q = adj[k] * 3;
				sx += D[q];
				sy += D[q + 1];
				sz += D[q + 2];
			}
			const inv = k1 > k0 ? 1 / (k1 - k0) : 0;
			S[o] = sx * inv;
			S[o + 1] = sy * inv;
			S[o + 2] = sz * inv;
		}
		for (let a = 0; a < na; a++) {
			const v = active[a], o = v * 3;
			D[o] = S[o];
			D[o + 1] = S[o + 1];
			D[o + 2] = S[o + 2];
			if (K.on[v]) K.impose(v, D, o);
		}
	}
	for (let a = 0; a < na; a++) {
		const v = active[a], o = v * 3;
		P[o] += D[o];
		P[o + 1] += D[o + 1];
		P[o + 2] += D[o + 2];
		D[o] = D[o + 1] = D[o + 2] = 0;
		mark[v] = 0;
	}
	return na;
}
