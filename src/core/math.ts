/** Minimal vector / quaternion / rigid-transform helpers. Quaternions are [x, y, z, w]. */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** Rigid transform: p' = q * p + t */
export interface Rigid {
	q: Quat;
	t: Vec3;
}

export const DEG = Math.PI / 180;

export function normalize3(v: readonly number[]): Vec3 {
	const l = Math.hypot(v[0], v[1], v[2]);
	return [v[0] / l, v[1] / l, v[2] / l];
}

export function qIdentity(): Quat {
	return [0, 0, 0, 1];
}

/** Rotation of `angle` radians about unit axis `a`. */
export function qAxis(a: Vec3, angle: number): Quat {
	const s = Math.sin(angle / 2);
	return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
}

export function qMul(a: Quat, b: Quat): Quat {
	return [
		a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
		a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
		a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
		a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
	];
}

/** Rotate vector v by unit quaternion q. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
	const tx = 2 * (q[1] * v[2] - q[2] * v[1]);
	const ty = 2 * (q[2] * v[0] - q[0] * v[2]);
	const tz = 2 * (q[0] * v[1] - q[1] * v[0]);
	return [
		v[0] + q[3] * tx + q[1] * tz - q[2] * ty,
		v[1] + q[3] * ty + q[2] * tx - q[0] * tz,
		v[2] + q[3] * tz + q[0] * ty - q[1] * tx
	];
}

/** 3x3 rotation matrix, column-major. */
export function qToMat3(q: Quat): number[] {
	const [x, y, z, w] = q;
	return [
		1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
		2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
		2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)
	];
}

export function rigidIdentity(): Rigid {
	return { q: qIdentity(), t: [0, 0, 0] };
}

/** a ∘ b : apply b, then a. */
export function rigidCompose(a: Rigid, b: Rigid): Rigid {
	const tb = qRotate(a.q, b.t);
	return { q: qMul(a.q, b.q), t: [tb[0] + a.t[0], tb[1] + a.t[1], tb[2] + a.t[2]] };
}

export function rigidApply(r: Rigid, p: Vec3): Vec3 {
	const v = qRotate(r.q, p);
	return [v[0] + r.t[0], v[1] + r.t[1], v[2] + r.t[2]];
}

/** Rotation of `angle` radians about the line through `point` along unit `dir`. */
export function rigidAboutAxis(point: Vec3, dir: Vec3, angle: number): Rigid {
	const q = qAxis(dir, angle);
	const r = qRotate(q, point);
	return { q, t: [point[0] - r[0], point[1] - r[1], point[2] - r[2]] };
}

/** Column-major 4x4 (three.js Matrix4.fromArray order). */
export function rigidToMat4(r: Rigid): number[] {
	const m = qToMat3(r.q);
	return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, r.t[0], r.t[1], r.t[2], 1];
}
