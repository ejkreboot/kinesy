"""Rest-pose separation of muscle meshes. BodyParts3D muscles overlap one another in places (up
to ~20 mm at the shoulder); the runtime simulation keeps muscles apart as they move, so it needs
them apart to begin with. Each pass, every vertex lying inside another muscle is pushed out by
half its depth (the other muscle's vertices inside this one push back the other half), and the
correction is smoothed over the mesh so surfaces give way as sheets rather than spikes."""
import igl
import numpy as np

from .meshes import laplacian_smooth

SIGN = igl.SIGNED_DISTANCE_TYPE_FAST_WINDING_NUMBER


def _overlapping_pairs(meshes, skip, pad):
    names = list(meshes)
    box = {n: (meshes[n].vertices.min(0) - pad, meshes[n].vertices.max(0) + pad) for n in names}
    return [(a, b) for a in names for b in names
            if a != b and frozenset((a, b)) not in skip
            and np.all(box[a][0] < box[b][1]) and np.all(box[b][0] < box[a][1])]


def overlap_depths(meshes, skip=()):
    """{(a, b): (vertices of a inside b, deepest)} for every overlapping pair."""
    out = {}
    for a, b in _overlapping_pairs(meshes, skip, 0.0):
        S = igl.signed_distance(meshes[a].vertices, meshes[b].vertices, meshes[b].faces.astype(np.int64), sign_type=SIGN)[0]
        if (S < 0).any():
            out[(a, b)] = (int((S < 0).sum()), float(-S.min()))
    return out


def separate(meshes, skip=(), tol=0.3, clearance=0.4, iters=80, smooth=3):
    """Push overlapping muscles apart in place. meshes: {name: trimesh}; skip: frozenset pairs
    that may overlap (heads of one muscle). Stops once nothing lies more than `tol` mm inside
    another muscle; returns the deepest remaining overlap, mm."""
    pairs = _overlapping_pairs(meshes, skip, 5.0)
    worst = 0.0
    for it in range(iters):
        disp = {n: np.zeros_like(m.vertices) for n, m in meshes.items()}
        worst = 0.0
        for a, b in pairs:
            Va, Vb, Fb = meshes[a].vertices, meshes[b].vertices, meshes[b].faces.astype(np.int64)
            lo, hi = Vb.min(0), Vb.max(0)
            sel = np.flatnonzero(np.all((Va > lo) & (Va < hi), 1))
            if not len(sel):
                continue
            S, _, C, _ = igl.signed_distance(Va[sel], Vb, Fb, sign_type=SIGN)
            inside = S < 0
            if not inside.any():
                continue
            worst = max(worst, float(-S[inside].min()))
            idx, d = sel[inside], -S[inside]
            out = C[inside] - Va[idx]  # toward the closest surface point: outward for points inside
            out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)
            disp[a][idx] += (0.5 * (d + clearance))[:, None] * out
        if worst <= tol:
            break
        for n, m in meshes.items():
            if not disp[n].any():
                continue
            pushed = np.linalg.norm(disp[n], axis=1) > 0
            D = laplacian_smooth(disp[n], m.faces, len(m.vertices), smooth)
            # pushed vertices keep half their own push; the rest of the surface follows smoothly
            D[pushed] = 0.5 * D[pushed] + 0.5 * disp[n][pushed]
            m.vertices = m.vertices + D
    return worst
