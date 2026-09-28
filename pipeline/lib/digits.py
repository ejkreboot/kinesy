"""Joint axes for a hand (or foot): a palm frame, then per-joint centers and axes fitted to
the bones, with the flexion side of each digit taken from its long flexor tendon.

Conventions (source frame). For a joint between a proximal bone A and a distal bone B:
  center     sphere fit to A's distal head
  long axis  B's first principal axis, pointing distally
  flexion    rotation that carries B's tip toward the flexor tendon (dir = long x flexor side)
  abduction  rotation that carries B's tip toward `away` (dir = long x away)
Every axis is returned as (point, unit dir, rest angle in degrees), where the rest angle is the
joint's clinical angle in the source pose, measured from the bones.
"""
import numpy as np
from scipy.spatial import cKDTree

from .meshes import sample


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def ortho(v, axis):
    """Component of v perpendicular to axis, normalized."""
    return unit(v - np.dot(v, axis) * axis)


def long_axis(m, toward):
    """First principal axis of a bone, oriented toward the point `toward`."""
    V = m.vertices
    a = np.linalg.svd(V - V.mean(0), full_matrices=False)[2][0]
    return a if np.dot(toward - V.mean(0), a) > 0 else -a


def _sphere(P):
    s = np.linalg.lstsq(np.c_[2 * P, np.ones(len(P))], (P ** 2).sum(1), rcond=None)[0]
    return s[:3], float(np.sqrt(max(s[3] + s[:3] @ s[:3], 0)))


def head_center(a, b):
    """Center of rotation between proximal bone a and distal bone b: a sphere fit to the part of
    a's articular head that faces b."""
    A = sample(a, 20000)
    d = cKDTree(sample(b, 20000)).query(A)[0]
    near = A[d < d.min() + 4.0]
    c, r = _sphere(near)
    # a degenerate (too flat) patch: fall back to the patch centroid, set back into the head
    if not np.isfinite(r) or r > 25:
        ax = long_axis(a, b.vertices.mean(0))
        c = near.mean(0) - 5.0 * ax
    return c


def flexor_side(point, axis, tendon, radius=14.0):
    """Unit direction, perpendicular to `axis`, from the joint toward the nearby flexor tendon."""
    T = tendon.vertices
    near = T[np.linalg.norm(T - point, axis=1) < radius]
    if len(near) < 5:
        near = T[np.argsort(np.linalg.norm(T - point, axis=1))[:40]]
    return ortho(near.mean(0) - point, axis)


def angle_in_plane(u, v, normal):
    """Signed angle (deg) from u to v about `normal`."""
    return float(np.degrees(np.arctan2(np.dot(np.cross(u, v), normal), np.dot(u, v))))


def hinge(a, b, tendon, ref_long=None):
    """Flexion axis between bones a (proximal) and b (distal). The rest angle is the flexion of b
    relative to `ref_long` (a's long axis by default)."""
    c = head_center(a, b)
    lb = long_axis(b, b.vertices.mean(0) + (b.vertices.mean(0) - c))
    la = long_axis(a, c) if ref_long is None else ref_long
    f = flexor_side(c, lb, tendon)
    d = unit(np.cross(lb, f))
    return c, d, angle_in_plane(la, lb, d)
