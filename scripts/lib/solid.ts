/**
 * Solid versions of hollow bone fields, for routing. The thorax's field is the ribs alone: a line of
 * action (or a reference path) can slip between two ribs into the chest undetected. Filled, the rib
 * cage is the wall muscles lie on.
 *
 * The fill is star-shaped per horizontal slab: the centre of the bone in the slab, the bone's reach in
 * each direction round it (smoothed round the ring and up and down), and everything inside that outline.
 * A flood fill from outside would leak in through the open thoracic inlet and outlet. The signed
 * distance to the filled shape comes from an exact Euclidean distance transform (Felzenszwalb &
 * Huttenlocher), and outside the bone it never exceeds the original field.
 */
import type { SdfGrid } from '../../src/core/types';

/** Directions round a slab's centre in which the bone's reach is measured. */
const RAYS = 96;
/** Least bone voxels in a slab for it to be filled (above and below the rib cage it isn't). */
const MIN_VOXELS = 20;

/**
 * The field of `g` filled: `slab` mm either side of each voxel row goes into its outline (enough to
 * span the gap between two ribs).
 */
export function solidField(g: SdfGrid, slab = 12): SdfGrid {
	const { nx, ny, nz, h, q } = g, n = nx * ny * nz;
	const d = (i: number) => g.data[i] * q;
	const half = Math.max(1, Math.round(slab / h));
	// each row's centre, from the bone voxels within the slab
	const cx = new Float64Array(ny), cz = new Float64Array(ny), count = new Float64Array(ny);
	for (let y = 0; y < ny; y++) {
		let sx = 0, sz = 0, m = 0;
		for (let yy = Math.max(0, y - half); yy <= Math.min(ny - 1, y + half); yy++)
			for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) if (d(x + nx * (yy + ny * z)) < 0) { sx += x; sz += z; m++; }
		count[y] = m; cx[y] = m ? sx / m : 0; cz[y] = m ? sz / m : 0;
	}
	const ray = (ax: number, az: number) => Math.floor(((Math.atan2(az, ax) + Math.PI) / (2 * Math.PI)) * RAYS) % RAYS;
	// the bone's reach by direction, gaps filled from their neighbours, smoothed round the ring
	const reach = new Float64Array(ny * RAYS);
	for (let y = 0; y < ny; y++) {
		if (count[y] < MIN_VOXELS) continue;
		const r = reach.subarray(y * RAYS, (y + 1) * RAYS);
		for (let yy = Math.max(0, y - half); yy <= Math.min(ny - 1, y + half); yy++)
			for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
				if (d(x + nx * (yy + ny * z)) >= 0) continue;
				const ax = x - cx[y], az = z - cz[y], k = ray(ax, az);
				r[k] = Math.max(r[k], Math.hypot(ax, az));
			}
		for (let pass = 0; pass < RAYS && r.some((v) => v === 0); pass++) {
			const c = r.slice();
			for (let k = 0; k < RAYS; k++) if (!c[k]) r[k] = Math.max(c[(k + RAYS - 1) % RAYS], c[(k + 1) % RAYS]);
		}
		for (let it = 0; it < 3; it++) {
			const c = r.slice();
			for (let k = 0; k < RAYS; k++) r[k] = Math.max(c[k], 0.5 * c[k] + 0.25 * (c[(k + RAYS - 1) % RAYS] + c[(k + 1) % RAYS]));
		}
	}
	// and up and down (rows that are filled only)
	for (let it = 0; it < 2; it++) {
		const c = reach.slice();
		for (let y = 1; y < ny - 1; y++)
			if (count[y] >= MIN_VOXELS && count[y - 1] >= MIN_VOXELS && count[y + 1] >= MIN_VOXELS)
				for (let k = 0; k < RAYS; k++) reach[y * RAYS + k] = 0.5 * c[y * RAYS + k] + 0.25 * (c[(y - 1) * RAYS + k] + c[(y + 1) * RAYS + k]);
	}
	const inside = new Uint8Array(n);
	for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) {
		if (count[y] < MIN_VOXELS) continue;
		for (let x = 0; x < nx; x++) {
			const ax = x - cx[y], az = z - cz[y], f = ((Math.atan2(az, ax) + Math.PI) / (2 * Math.PI)) * RAYS - 0.5;
			const k0 = ((Math.floor(f) % RAYS) + RAYS) % RAYS, u = f - Math.floor(f);
			const r = reach[y * RAYS + k0] * (1 - u) + reach[y * RAYS + ((k0 + 1) % RAYS)] * u;
			if (Math.hypot(ax, az) <= r) inside[x + nx * (y + ny * z)] = 1;
		}
	}
	const toInside = distanceTransform(inside, 1, nx, ny, nz), toOutside = distanceTransform(inside, 0, nx, ny, nz);
	const data = new Int8Array(n);
	for (let i = 0; i < n; i++) {
		const sd = (inside[i] ? -Math.sqrt(toOutside[i]) : Math.sqrt(toInside[i])) * h;
		data[i] = Math.max(-127, Math.min(127, Math.round(Math.min(d(i), sd) / q)));
	}
	return { ...g, data };
}

/** Squared distance, in voxels, from every voxel to the nearest one whose `mask` equals `value`. */
function distanceTransform(mask: Uint8Array, value: number, nx: number, ny: number, nz: number): Float64Array {
	const INF = 1e20, f = new Float64Array(mask.length);
	for (let i = 0; i < mask.length; i++) f[i] = mask[i] === value ? 0 : INF;
	const len = Math.max(nx, ny, nz), fv = new Float64Array(len), v = new Int32Array(len), zz = new Float64Array(len + 1), dd = new Float64Array(len);
	// 1D lower envelope of parabolas along one line (start o, stride s, n cells)
	const line = (o: number, s: number, count: number) => {
		for (let k = 0; k < count; k++) fv[k] = f[o + k * s];
		let j = 0;
		v[0] = 0; zz[0] = -INF; zz[1] = INF;
		for (let p = 1; p < count; p++) {
			let x = (fv[p] + p * p - (fv[v[j]] + v[j] * v[j])) / (2 * p - 2 * v[j]);
			while (x <= zz[j]) { j--; x = (fv[p] + p * p - (fv[v[j]] + v[j] * v[j])) / (2 * p - 2 * v[j]); }
			j++; v[j] = p; zz[j] = x; zz[j + 1] = INF;
		}
		j = 0;
		for (let p = 0; p < count; p++) { while (zz[j + 1] < p) j++; dd[p] = (p - v[j]) ** 2 + fv[v[j]]; }
		for (let k = 0; k < count; k++) f[o + k * s] = dd[k];
	};
	for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) line(nx * (y + ny * z), 1, nx);
	for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) line(x + nx * ny * z, nx, ny);
	for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) line(x + nx * y, nx * ny, nz);
	return f;
}
