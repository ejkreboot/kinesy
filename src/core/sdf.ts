import type { SdfGrid } from './types';

/** Value returned outside the grid: "far from bone". */
export const SDF_FAR = 99;

/** Trilinear sample of a signed distance grid, mm (negative inside the bone). */
export function sdfSample(g: SdfGrid, x: number, y: number, z: number): number {
	const fx = (x - g.lo[0]) / g.h;
	const fy = (y - g.lo[1]) / g.h;
	const fz = (z - g.lo[2]) / g.h;
	if (fx < 0 || fy < 0 || fz < 0 || fx >= g.nx - 1 || fy >= g.ny - 1 || fz >= g.nz - 1) return SDF_FAR;
	const ix = fx | 0, iy = fy | 0, iz = fz | 0;
	const ux = fx - ix, uy = fy - iy, uz = fz - iz;
	const nx = g.nx, nxy = g.nx * g.ny, d = g.data;
	const i0 = ix + nx * iy + nxy * iz;
	const c000 = d[i0], c100 = d[i0 + 1], c010 = d[i0 + nx], c110 = d[i0 + nx + 1];
	const c001 = d[i0 + nxy], c101 = d[i0 + nxy + 1], c011 = d[i0 + nxy + nx], c111 = d[i0 + nxy + nx + 1];
	const c00 = c000 + (c100 - c000) * ux, c10 = c010 + (c110 - c010) * ux;
	const c01 = c001 + (c101 - c001) * ux, c11 = c011 + (c111 - c011) * ux;
	const c0 = c00 + (c10 - c00) * uy, c1 = c01 + (c11 - c01) * uy;
	return (c0 + (c1 - c0) * uz) * g.q;
}

/** Unit outward gradient by central differences, or null where the field is flat or clipped. */
export function sdfGradient(g: SdfGrid, x: number, y: number, z: number): [number, number, number] | null {
	const h = g.h * 0.75;
	const gx = sdfSample(g, x + h, y, z) - sdfSample(g, x - h, y, z);
	const gy = sdfSample(g, x, y + h, z) - sdfSample(g, x, y - h, z);
	const gz = sdfSample(g, x, y, z + h) - sdfSample(g, x, y, z - h);
	const l = Math.hypot(gx, gy, gz);
	return l > 1e-6 && l < 50 ? [gx / l, gy / l, gz / l] : null;
}
