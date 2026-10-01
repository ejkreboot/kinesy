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
import type { Tuning } from './tune';

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
	/**
	 * wrap it the way a cylinder with this axis is wrapped (bone frame): always round one side, set by the
	 * use's `side` as for cylinders, taking the long way where the ends pass the centre, rather than the short
	 * way, which has no side to take where the ends lie opposite each other across it (the middle deltoid
	 * over the humeral head as the girdle rises with the arm hanging). The path runs in the plane through
	 * its straight line whose normal lies nearest the axis (wrap.ts, wrapEllipsoidAbout).
	 */
	about?: Vec3;
}

/**
 * A flat ellipse a path may not pass through: a plate, like the glenoid with its rim. A path whose way
 * between its neighbouring points (wraps before and after it included) would cross the plate bends over
 * the rim where that makes it shortest, like a string over a plate's edge. Tendons that pass a joint's
 * socket on their way to a fossa behind it (the rotator cuff) stay off the socket and its neck this way.
 */
export interface RimSurface {
	kind: 'rim';
	bone: string;
	center: Vec3;
	/** the ellipse's semi-axis directions (made perpendicular); the plate's normal is their cross product */
	axes: [Vec3, Vec3];
	radii: [number, number];
}

export type WrapSurface = CylinderSurface | EllipsoidSurface | RimSurface;

/**
 * Use of a named wrap surface between the path points around it.
 *
 * Cylinders: `side` +1 wraps counterclockwise about the cylinder axis (right-hand rule) going from
 * the point before to the point after, -1 clockwise. Left out, it is the side the rest-pose path
 * passes on, so the path never swaps sides as the joint moves. A wrap is taken only while the
 * straight line would cross the surface on that side; it lifts off where the two tangent points
 * meet, so there is no jump. Ellipsoids wrap the short way round and ignore `side`, unless they have
 * an axis to go `about`: then `side` is about it, as for a cylinder.
 *
 * Rims: `arc` is the part of the rim this path may pass over, [from, to] in degrees from the first
 * axis toward the second. Beyond its ends the plate's plane is closed as well (a wall running out from
 * the rim), so the path can't swing round the far side of the socket. The whole rim if left out.
 */
export interface WrapUse {
	wrap: string;
	side?: 1 | -1;
	arc?: [number, number];
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
	/**
	 * the strands fan out from one tendon (or converge on one) without passing each other: their frames
	 * are rolled to the fan's plane (path.ts, rollSheets), so its cross-section stays laid across the fan
	 * however far the fan swings; default false
	 */
	fan?: boolean;
	/**
	 * [share, degrees]: how far the belly's rest drape relaxes onto the line of action. At rest a belly
	 * lying over a round bone (the anterior deltoid over the humeral head) sits well off the straight line
	 * between its ends; bound as it is, it kept that offset whatever the strand did, and arched off the
	 * shoulder once the arm rose. With this, the offset shrinks to `share` of itself as the strand turns
	 * from its rest direction (relative to its origin bone) by `degrees`, so the belly pulls in along its
	 * line of action as a contracting muscle does. Only the offset across a flat belly's thickness: across
	 * its width it lies beside its strand, which it keeps (bind.ts, restDrape). Default: none.
	 */
	drape?: [number, number];
	/**
	 * meshes in this muscle's layer lying beside it (the deltoid's parts, edge to edge) that its strands are
	 * kept apart from as strands of different layers are (strandContact.ts), each on the side it lay at rest,
	 * so a part pulling in along its line of action slides against the next rather than into it. On even
	 * where the joint turns contact off.
	 */
	beside?: string[];
	/**
	 * meshes that pass under this one where they cross it (the pectoralis major's clavicular head under the
	 * anterior deltoid, on its way to the humerus): its belly is kept off capsules along their strands
	 * (proxies.ts), as far off as it was at rest, so it rides up over them. On even where the joint turns
	 * contact off; they must be consecutive in `muscles` order among the meshes any muscle names here.
	 */
	over?: string[];
	/**
	 * strands looked up from the joint's baked lines of action (baked.ts; made by scripts/bake.ts) rather
	 * than built from wraps: each strand lists its fixed points only (origin, via points, insertion), and
	 * the bake finds the way between them that stays off the bones. Default false.
	 */
	baked?: boolean;
	/**
	 * whether the bake keeps other muscles' lines of action off this mesh where it lies beneath them; false for a
	 * thin sheet they meet rather than lie on (the quadriceps' aponeurosis). Default true.
	 */
	obstacle?: boolean;
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
	/**
	 * false turns contact between strands of different layers off for the joint (strandContact.ts); the
	 * pairs muscles name as `beside` keep theirs
	 */
	contact?: false;
	/** hand-tuned keys (tune.ts): rolls, offsets and shortenings of bellies at chosen poses */
	tuning?: Tuning;
}

export function isPoint(e: PathElement): e is PathPoint | JoinPoint {
	return (e as PathPoint).p !== undefined;
}

export function isJoin(e: PathElement): e is JoinPoint {
	return (e as JoinPoint).join !== undefined;
}
