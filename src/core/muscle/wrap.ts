/**
 * Closed-form wrapping of a straight segment P → S over a cylinder or an ellipsoid, and the geometry
 * of rims (flat plates a path bends over; the search for where is the path solver's, path.ts).
 *
 * Both reduce to one 2D problem: going counterclockwise around a circle at the origin from p to s,
 * the path leaves p along a tangent, follows the circle, and leaves it along a tangent to s. On
 * a cylinder that happens in the cross-section and the axial coordinate is spread in proportion to
 * the length travelled, which makes the whole path one straight line on the unrolled cylinder: a
 * helix, the cylinder's geodesic. On an ellipsoid it happens in the plane through the center and
 * both points, after mapping the ellipsoid to a unit sphere.
 *
 * Pure TypeScript, no DOM or three.js dependency.
 */
import type { Vec3 } from '../math';

/** Largest angle between wrap samples along the arc, radians. */
const ARC_STEP = (5 * Math.PI) / 180;
const TAU = 2 * Math.PI;

export interface CircleWrap {
	/** angle of the first tangent point */
	th0: number;
	/** counterclockwise arc to the second tangent point, radians (>= 0) */
	dth: number;
	/** straight lengths p → first tangent point and second tangent point → s */
	lp: number;
	ls: number;
}

/**
 * Counterclockwise wrap of the 2D segment p → s around the circle of radius r at the origin, or
 * null where the segment misses the circle on the counterclockwise side (the path goes straight).
 * The segment must cross the circle's line of centers between p and s: when the circle lies
 * beyond either end there is nothing to wrap. An endpoint inside the circle (a tendon attached to
 * the bone the circle stands for) is moved out onto it first, so the wrap still lifts off exactly
 * where it touches: the path then dives straight from the circle to the endpoint.
 */
export function circleWrap(px: number, py: number, sx: number, sy: number, r: number): CircleWrap | null {
	const rOut = r * 1.001;
	const dp0 = Math.hypot(px, py), ds0 = Math.hypot(sx, sy);
	if (dp0 < rOut && dp0 > 1e-9) { px *= rOut / dp0; py *= rOut / dp0; }
	if (ds0 < rOut && ds0 > 1e-9) { sx *= rOut / ds0; sy *= rOut / ds0; }
	const dx = sx - px, dy = sy - py, dd = dx * dx + dy * dy;
	if (dd < 1e-12) return null;
	// signed distance of the center from the line, positive to the left of p → s
	const h = (dy * px - dx * py) / Math.sqrt(dd);
	if (h >= r) return null;
	const t = -(px * dx + py * dy) / dd;
	if (t <= 0 || t >= 1) return null;
	const dp = Math.hypot(px, py), ds = Math.hypot(sx, sy);
	const ap = dp > r ? Math.acos(r / dp) : 0, as = ds > r ? Math.acos(r / ds) : 0;
	const th0 = Math.atan2(py, px) + ap;
	const th1 = Math.atan2(sy, sx) - as;
	let dth = (((th1 - th0) % TAU) + TAU) % TAU;
	// center to the left: a chord shorter than half the circle; a near-full turn is rounding at lift-off
	if (h > 0 && dth > Math.PI) dth = 0;
	return { th0, dth, lp: dp > r ? Math.sqrt(dp * dp - r * r) : 0, ls: ds > r ? Math.sqrt(ds * ds - r * r) : 0 };
}

/** Unit vector perpendicular to unit `a`. */
export function perpendicular(a: Vec3): Vec3 {
	const x = Math.abs(a[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
	const d = x[0] * a[0] + x[1] * a[1] + x[2] * a[2];
	const v = [x[0] - d * a[0], x[1] - d * a[1], x[2] - d * a[2]];
	const l = Math.hypot(v[0], v[1], v[2]);
	return [v[0] / l, v[1] / l, v[2] / l];
}

function arcSteps(dth: number): number {
	return Math.max(1, Math.ceil(dth / ARC_STEP));
}

/**
 * Wrap P → S over the cylinder through c along unit axis a with radius r, counterclockwise about a
 * for side +1, clockwise for -1. Appends the wrap's points (first tangent point to last, x y z)
 * to `out` and returns true, or returns false when the path does not touch the cylinder.
 *
 * With `extent` [lo, hi] (along a from c, mm), the cylinder is only that long: where the straight
 * segment P → S passes nearest the axis beyond it, the whole wrap (dives included) is drawn back
 * toward the segment, fully by EXTENT_FADE past the end, so a path passing the axis far from the
 * bone the cylinder stands for runs straight, and in between the wrap fades smoothly. So is a
 * segment running nearly along the axis (EXTENT_STEEP), which a finite cylinder would slip off.
 */
export function wrapCylinder(P: Vec3, S: Vec3, c: Vec3, a: Vec3, r: number, side: number, out: number[], extent?: readonly [number, number]): boolean {
	const e1 = perpendicular(a);
	// e2 = side · (a × e1): mirroring the cross-section turns a clockwise wrap into a counterclockwise one
	const e2: Vec3 = [
		side * (a[1] * e1[2] - a[2] * e1[1]),
		side * (a[2] * e1[0] - a[0] * e1[2]),
		side * (a[0] * e1[1] - a[1] * e1[0])
	];
	const vp = [P[0] - c[0], P[1] - c[1], P[2] - c[2]], vs = [S[0] - c[0], S[1] - c[1], S[2] - c[2]];
	const px = vp[0] * e1[0] + vp[1] * e1[1] + vp[2] * e1[2], py = vp[0] * e2[0] + vp[1] * e2[1] + vp[2] * e2[2];
	const pz = vp[0] * a[0] + vp[1] * a[1] + vp[2] * a[2];
	const sx = vs[0] * e1[0] + vs[1] * e1[1] + vs[2] * e1[2], sy = vs[0] * e2[0] + vs[1] * e2[1] + vs[2] * e2[2];
	const sz = vs[0] * a[0] + vs[1] * a[1] + vs[2] * a[2];
	const dx = sx - px, dy = sy - py, dz = sz - pz, dd = dx * dx + dy * dy + dz * dz;
	// a finite cylinder: how much of the wrap to keep, from where the straight line passes nearest the
	// axis and how steeply it crosses it (one running along the axis would slide off the end)
	let k = 1;
	if (extent) {
		const d2 = dx * dx + dy * dy, t = d2 > 1e-12 ? Math.min(1, Math.max(0, -(px * dx + py * dy) / d2)) : 0, z = pz + dz * t;
		k = smoothstep(extent[0] - EXTENT_FADE, extent[0], z) * (1 - smoothstep(extent[1], extent[1] + EXTENT_FADE, z));
		k *= 1 - smoothstep(EXTENT_STEEP[1], EXTENT_STEEP[0], Math.abs(dz) / Math.sqrt(dd || 1));
		if (k === 0) return false;
	}
	const at = (x: number, y: number, z: number) => {
		if (k < 1) {
			// toward the nearest point of the straight segment
			const t = dd > 1e-12 ? Math.min(1, Math.max(0, ((x - px) * dx + (y - py) * dy + (z - pz) * dz) / dd)) : 0;
			const qx = px + dx * t, qy = py + dy * t, qz = pz + dz * t;
			x = qx + (x - qx) * k;
			y = qy + (y - qy) * k;
			z = qz + (z - qz) * k;
		}
		out.push(c[0] + x * e1[0] + y * e2[0] + z * a[0], c[1] + x * e1[1] + y * e2[1] + z * a[1], c[2] + x * e1[2] + y * e2[2] + z * a[2]);
	};
	// an endpoint inside the cylinder is reached by a radial dive from the surface, wrapped or not,
	// so the straight and wrapped paths agree at lift-off
	const rOut = r * 1.001, dp = Math.hypot(px, py), ds = Math.hypot(sx, sy);
	const pIn = dp < rOut && dp > 1e-9, sIn = ds < rOut && ds > 1e-9;
	const w = circleWrap(px, py, sx, sy, r);
	if (pIn) at((px * rOut) / dp, (py * rOut) / dp, pz);
	if (w) {
		const la = r * w.dth, L = w.lp + la + w.ls;
		const z0 = pz + ((sz - pz) * w.lp) / L, z1 = pz + ((sz - pz) * (w.lp + la)) / L;
		const n = arcSteps(w.dth);
		for (let k = 0; k <= n; k++) {
			const u = k / n, th = w.th0 + w.dth * u;
			at(r * Math.cos(th), r * Math.sin(th), z0 + (z1 - z0) * u);
		}
	}
	if (sIn) at((sx * rOut) / ds, (sy * rOut) / ds, sz);
	return !!w || pIn || sIn;
}

/**
 * Wrap P → S over the ellipsoid at c with semi-axes `radii` along the columns of rotation `R`
 * (column-major 3x3: local x, y, z axes in world). The short way round; appends the wrap's points
 * to `out` and returns true, or false when the segment misses the ellipsoid.
 *
 * Where the straight line passes within SIDE_BLEND of the center, the short way is about to switch
 * sides; there the wraps round both sides are blended, point by point, by how far the line is from
 * the center, so the path slides across the ellipsoid instead of jumping from one side to the other
 * (passing through it at the switch). Nothing is remembered: the same ends give the same path.
 */
export function wrapEllipsoid(P: Vec3, S: Vec3, c: Vec3, radii: Vec3, R: number[], out: number[]): boolean {
	// to the unit sphere: local = diag(1/radii) Rᵀ (X − c)
	const toUnit = (X: Vec3): Vec3 => {
		const x = X[0] - c[0], y = X[1] - c[1], z = X[2] - c[2];
		return [(R[0] * x + R[1] * y + R[2] * z) / radii[0], (R[3] * x + R[4] * y + R[5] * z) / radii[1], (R[6] * x + R[7] * y + R[8] * z) / radii[2]];
	};
	const p = toUnit(P), s = toUnit(S);
	// plane through the center and both points; s lies counterclockwise from p about n
	let n = [p[1] * s[2] - p[2] * s[1], p[2] * s[0] - p[0] * s[2], p[0] * s[1] - p[1] * s[0]];
	let nl = Math.hypot(n[0], n[1], n[2]);
	const pl = Math.hypot(p[0], p[1], p[2]);
	if (nl < 1e-9 * pl * Math.hypot(s[0], s[1], s[2])) {
		// the segment runs through the center: any plane containing it will do
		const q = perpendicular([p[0] / pl, p[1] / pl, p[2] / pl]);
		n = q;
		nl = 1;
	}
	n = [n[0] / nl, n[1] / nl, n[2] / nl];
	const e1 = [p[0] / pl, p[1] / pl, p[2] / pl];
	const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
	const sx = s[0] * e1[0] + s[1] * e1[1] + s[2] * e1[2], sy = s[0] * e2[0] + s[1] * e2[1] + s[2] * e2[2];
	// signed distance of the center from the line p → s in that plane (s lies counterclockwise, so ≥ 0)
	const dx = sx - pl, dy = sy, dl = Math.hypot(dx, dy);
	const h = dl > 1e-12 ? Math.abs(dy * pl - dx * 0) / dl : 0;
	const blend = 0.5 * (1 - smoothstep(0, SIDE_BLEND, h));
	const at = (x: number, y: number) => {
		const u = [(x * e1[0] + y * e2[0]) * radii[0], (x * e1[1] + y * e2[1]) * radii[1], (x * e1[2] + y * e2[2]) * radii[2]];
		out.push(c[0] + R[0] * u[0] + R[3] * u[1] + R[6] * u[2], c[1] + R[1] * u[0] + R[4] * u[1] + R[7] * u[2], c[2] + R[2] * u[0] + R[5] * u[1] + R[8] * u[2]);
	};
	// endpoints inside: a dive from the surface, wrapped or not (see wrapCylinder)
	const sl = Math.hypot(sx, sy), pIn = pl < 1.001, sIn = sl < 1.001 && sl > 1e-9;
	const w = circleWrap(pl, 0, sx, sy, 1);
	if (pIn) at(1.001, 0);
	// the long way (clockwise), only where the line passes near the center
	const wl = blend > 0 ? circleWrap(pl, 0, sx, -sy, 1) : null;
	if (w && wl) {
		const m = Math.max(arcSteps(w.dth), arcSteps(wl.dth));
		for (let k = 0; k <= m; k++) {
			const a = w.th0 + (w.dth * k) / m, b = -(wl.th0 + (wl.dth * k) / m);
			at(Math.cos(a) + (Math.cos(b) - Math.cos(a)) * blend, Math.sin(a) + (Math.sin(b) - Math.sin(a)) * blend);
		}
	} else if (w) {
		const m = arcSteps(w.dth);
		for (let k = 0; k <= m; k++) {
			const th = w.th0 + (w.dth * k) / m;
			at(Math.cos(th), Math.sin(th));
		}
	}
	if (sIn) at((sx * 1.001) / sl, (sy * 1.001) / sl);
	return !!w || pIn || sIn;
}

/**
 * A rim in world space: centre, in-plane unit axes u and v, plate normal n = u × v, semi-axes a and b,
 * and the arc a path may pass over (radians from u toward v, from < to), null for the whole rim.
 */
export interface Rim {
	c: Vec3;
	u: Vec3;
	v: Vec3;
	n: Vec3;
	a: number;
	b: number;
	arc: [number, number] | null;
}

/** Length of the wall beyond each end of a rim's arc, in mean radii (the boundary parameter's unit). */
const RIM_WALL = 3;

/**
 * Range of the parameter along a rim's boundary: [0, 2π) round the whole ellipse (periodic), or the arc
 * with the wall running out radially from each end: −RIM_WALL … 0 out along the first end's wall, 0 … span
 * along the arc, beyond the span out along the second end's.
 */
export function rimRange(rim: Rim): [number, number] {
	return rim.arc ? [-RIM_WALL, rim.arc[1] - rim.arc[0] + RIM_WALL] : [0, 2 * Math.PI];
}

/** Point on a rim's boundary at parameter s (see rimRange). */
export function rimPoint(rim: Rim, s: number): Vec3 {
	let th = s, out = 0;
	if (rim.arc) {
		const span = rim.arc[1] - rim.arc[0];
		if (s < 0) { th = rim.arc[0]; out = -s; }
		else if (s > span) { th = rim.arc[1]; out = s - span; }
		else th = rim.arc[0] + s;
	}
	const x = Math.cos(th) * rim.a, y = Math.sin(th) * rim.b;
	// the wall runs radially (constant ellipse angle), so it meets the blocked test in rimBlocked exactly
	const k = 1 + (out * (rim.a + rim.b)) / 2 / Math.hypot(x, y);
	const { c, u, v } = rim;
	return [c[0] + k * (x * u[0] + y * v[0]), c[1] + k * (x * u[1] + y * v[1]), c[2] + k * (x * u[2] + y * v[2])];
}

/**
 * Whether polyline `pts` (x y z …, from the path's start to its end) is blocked by a rim: where it first
 * crosses the plate's plane from the start's side, it passes inside the ellipse, or outside it beyond the
 * arc (through the wall). A path whose ends lie on one side of the plane is never blocked.
 */
export function rimBlocked(rim: Rim, pts: ArrayLike<number>): boolean {
	const { c, n } = rim, m = pts.length / 3;
	const side = (k: number) => (pts[k * 3] - c[0]) * n[0] + (pts[k * 3 + 1] - c[1]) * n[1] + (pts[k * 3 + 2] - c[2]) * n[2];
	const d0 = side(0);
	if (d0 * side(m - 1) >= 0) return false;
	let prev = d0;
	for (let k = 1; k < m; k++) {
		const dk = side(k);
		if (dk * d0 > 0) { prev = dk; continue; }
		const t = prev / (prev - dk), o = (k - 1) * 3, q = [0, 1, 2].map((j) => pts[o + j] + (pts[o + 3 + j] - pts[o + j]) * t - c[j]);
		const x = (q[0] * rim.u[0] + q[1] * rim.u[1] + q[2] * rim.u[2]) / rim.a, y = (q[0] * rim.v[0] + q[1] * rim.v[1] + q[2] * rim.v[2]) / rim.b;
		if (x * x + y * y < 1) return true;
		if (!rim.arc) return false;
		const th = (((Math.atan2(y, x) - rim.arc[0]) % TAU) + TAU) % TAU;
		return th > rim.arc[1] - rim.arc[0];
	}
	return false;
}

/**
 * Parameter in [lo, hi] (periodic if asked) where f is least: the best of `n` samples, refined by golden
 * section between its neighbours.
 */
export function minimize1D(f: (s: number) => number, lo: number, hi: number, periodic: boolean, n = 24): number {
	const h = (hi - lo) / (periodic ? n : n - 1);
	let best = 0, fb = Infinity;
	for (let k = 0; k < n; k++) {
		const v = f(lo + k * h);
		if (v < fb) { fb = v; best = k; }
	}
	let a = lo + (best - 1) * h, b = lo + (best + 1) * h;
	if (!periodic) { a = Math.max(lo, a); b = Math.min(hi, b); }
	const g = (Math.sqrt(5) - 1) / 2;
	let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
	for (let it = 0; it < 30; it++) {
		if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); }
		else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
	}
	return (a + b) / 2;
}

/** Length beyond a cylinder's extent over which its wrap fades to a straight line, mm. */
const EXTENT_FADE = 50;
/**
 * cos of the angles to a finite cylinder's axis between which a crossing segment's wrap fades in:
 * none within 25° of the axis, all beyond 40°.
 */
const EXTENT_STEEP = [Math.cos((15 * Math.PI) / 180), Math.cos((25 * Math.PI) / 180)];

/** Distance of the line from the center, in radii, within which both sides of an ellipsoid are blended. */
const SIDE_BLEND = 0.3;

function smoothstep(a: number, b: number, x: number): number {
	const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return u * u * (3 - 2 * u);
}
