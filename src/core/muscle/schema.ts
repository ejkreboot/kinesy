/**
 * Muscle paths as data. A muscle mesh is carried by one or more strands (lines of action); each
 * strand runs origin → via points / wrap surfaces → insertion, every element attached to a named
 * rig bone. The path solver (path.ts) turns a pose into sampled strands with frames, the binder
 * (bind.ts) ties each vertex to a place along them, and the vertex shader rebuilds the mesh.
 *
 * All coordinates are the joint's viewer frame in the rest pose (mm, y up, z anterior): the pose
 * the meshes were captured in, where every bone's transform is the identity.
 */
import type { Vec3 } from '../math';

/** A fixed point on a bone: origin, via point, or insertion. */
export interface PathPoint {
	bone: string;
	p: Vec3;
}

/**
 * The end of a head that inserts into another muscle (the short head of biceps into the long head's
 * belly): rest point p, carried with the other muscle's strand where it passes nearest p, turning
 * with its frame there. Only as an insertion, and not onto a muscle that itself joins another.
 */
export interface JoinPoint {
	/** mesh of the muscle joined */
	join: string;
	p: Vec3;
}

/** Infinite cylinder; the path wraps it along a helix (a geodesic of the cylinder). */
export interface CylinderSurface {
	kind: 'cylinder';
	bone: string;
	/** a point on the axis */
	center: Vec3;
	axis: Vec3;
	radius: number;
	/**
	 * how far the cylinder reaches along its axis from `center`, [lo, hi] mm; beyond that its wrap
	 * fades to a straight line over 25 mm, as it does for a path running within 25–40° of the axis
	 * (wrap.ts). Infinite if left out.
	 */
	extent?: [number, number];
}

/**
 * Ellipsoid. Wrapped by mapping it to a unit sphere, taking the great-circle wrap there and
 * mapping back: smooth and exact for spheres, close to (not exactly) a geodesic otherwise.
 */
export interface EllipsoidSurface {
	kind: 'ellipsoid';
	bone: string;
	center: Vec3;
	/** semi-axes along the local x, y, z axes */
	radii: Vec3;
	/** local x and y axes (z = x × y); world axes if left out */
	axes?: [Vec3, Vec3];
}

export type WrapSurface = CylinderSurface | EllipsoidSurface;

/**
 * Use of a named wrap surface between the path points around it.
 *
 * Cylinders: `side` +1 wraps counterclockwise about the cylinder axis (right-hand rule) going from
 * the point before to the point after, -1 clockwise. Left out, it is the side the rest-pose path
 * passes on, so the path never swaps sides as the joint moves. A wrap is taken only while the
 * straight line would cross the surface on that side; it lifts off where the two tangent points
 * meet, so there is no jump. Ellipsoids wrap the short way round and ignore `side`.
 */
export interface WrapUse {
	wrap: string;
	side?: 1 | -1;
}

/**
 * Starts and ends with a point. Wraps in a row (a tendon over the humeral condyles, then round the
 * radius) are solved against each other.
 */
export type PathElement = PathPoint | JoinPoint | WrapUse;

export interface MusclePathDef {
	/** asset mesh name */
	mesh: string;
	/**
	 * one strand for a fusiform muscle; several for a sheet, ordered across its width (vertices
	 * blend between the two nearest)
	 */
	strands: PathElement[][];
	/**
	 * depth order, 0 deepest. Where a muscle lies against one in a lower layer their strands are
	 * pushed apart, both giving way (strandContact.ts), and its vertices are kept off the proxies
	 * (capsules along the strands) of every muscle in a lower layer, as well as off the bones.
	 * Muscles in one layer don't meet.
	 */
	layer: number;
	/** bones the mesh is kept outside of (at most 4); default: every bone with a distance field */
	collide?: string[];
	/** mesh whose path length sets this one's bulge (a head that ends at a shared tendon) */
	lengthRef?: string;
	/** whether the belly thickens as the path shortens; default true */
	bulge?: boolean;
	/**
	 * length of each end [origin, insertion] over which vertices blend to riding their bone rigidly,
	 * mm: the attachment's footprint, so broad attachments stay on the bone; default [8, 8]
	 */
	anchor?: [number, number];
	/**
	 * whether the surface a muscle is attached by rides its bone: vertices lying on the origin or
	 * insertion bone, over the stretch from that end where the mesh lies along it (a fleshy
	 * attachment, like brachialis on the front of the humerus), move rigidly with it rather than
	 * sliding with the strand; default true
	 */
	attach?: boolean;
}

export interface JointPaths {
	surfaces: Record<string, WrapSurface>;
	muscles: MusclePathDef[];
	/** samples per strand; default 48 */
	samples?: number;
	/**
	 * vertex collision passes over the bones (default 2): more settle vertices between two bones, but
	 * where muscles lie between several (the shoulder's scapula, humerus and ribs) they shuttle
	 * vertices from one to the next
	 */
	collidePasses?: number;
	/** false turns contact between strands of different layers off for the joint (strandContact.ts) */
	contact?: false;
}

export function isPoint(e: PathElement): e is PathPoint | JoinPoint {
	return (e as PathPoint).p !== undefined;
}

export function isJoin(e: PathElement): e is JoinPoint {
	return (e as JoinPoint).join !== undefined;
}
