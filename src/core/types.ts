/**
 * Joint asset format, v1. Produced by pipeline/build.py, consumed by core/assets.ts.
 *
 * Coordinates are millimetres in the viewer frame (y up, z toward the viewer in anatomical
 * position), with the origin at the joint's primary axis center.
 *
 * Two binaries accompany the manifest (each optionally gzip-compressed):
 *   geometry: per mesh, quantized uint16 positions, uint16|uint32 indices, and for muscles
 *             uint8 skin weights (stride = bones.length). Offsets are 4-byte aligned.
 *   fields:   per bone, an int8 signed-distance grid (x fastest, then y, then z).
 */
import type { Vec3 } from './math';

export interface AxisDef {
	/** A point on the axis, viewer frame. */
	point: Vec3;
	/** Unit direction; positive rotation follows the right-hand rule. */
	dir: Vec3;
}

export interface MeshEntry {
	name: string;
	kind: 'bone' | 'muscle';
	nv: number;
	nf: number;
	i32: boolean;
	/** byte offset of positions */
	pos: number;
	/** byte offset of indices */
	idx: number;
	/** byte offset of skin weights (muscles) */
	w?: number;
	/** rig bone index the mesh rides on (bones) */
	bone?: number;
}

export interface FieldEntry {
	bone: number;
	lo: Vec3;
	/** voxel size, mm */
	h: number;
	/** quantization step, mm per int8 unit */
	q: number;
	dims: [number, number, number];
	off: number;
}

/** Muscle centerline, used for the shortening bulge. */
export interface CenterlineEntry {
	mu: Vec3;
	/** principal axis, oriented proximally */
	a: Vec3;
	lo: number;
	hi: number;
	/** bin centers along the muscle */
	C: Vec3[];
	/** per-bin skin weights (stride = bones.length) */
	W: number[][];
	/** normalized cross-section area per bin (1 = widest) */
	prof: number[];
	/** whether this muscle bulges when shortened */
	bulge: boolean;
	/** muscle whose origin-insertion length drives this one's bulge (a head that shares a tendon) */
	lenref: string;
	/**
	 * measure length along the centerline rather than end to end, for muscles whose tendons wrap
	 * a joint (a finger extensor gets longer, not shorter, as the fingers curl)
	 */
	path?: boolean;
}

export interface AssetManifest {
	format: 'kinesy-joint';
	version: 1;
	joint: string;
	units: 'mm';
	/** attribution for the source meshes */
	source: string;
	quant: { lo: Vec3; scale: Vec3 };
	/** rig bone names, index = bone id */
	bones: string[];
	axes: Record<string, AxisDef>;
	meshes: MeshEntry[];
	fields: Record<string, FieldEntry>;
	centerlines: Record<string, CenterlineEntry>;
}

export type IndexArray = Uint16Array | Uint32Array;

export interface BoneMesh {
	name: string;
	bone: number;
	rest: Float32Array;
	index: IndexArray;
	nv: number;
}

export interface MuscleMesh {
	name: string;
	rest: Float32Array;
	index: IndexArray;
	nv: number;
	/** normalized skin weights, stride = boneCount */
	weights: Float32Array;
	centerline: CenterlineEntry;
}

export interface SdfGrid {
	lo: Vec3;
	h: number;
	q: number;
	nx: number;
	ny: number;
	nz: number;
	data: Int8Array;
}

export interface JointAssets {
	manifest: AssetManifest;
	boneCount: number;
	bones: BoneMesh[];
	muscles: MuscleMesh[];
	/** indexed by rig bone id; null where a bone has no field */
	fields: (SdfGrid | null)[];
}
