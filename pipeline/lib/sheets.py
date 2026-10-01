"""Cutting muscle meshes, and tendinous sheets that BodyParts3D lacks (source frame: x = subject's left,
y = posterior, z = superior; mm).

clip_below: a muscle mesh cut by a horizontal plane, the part below dropped and the cut closed, so a muscle
can end where its tendon begins (the quadriceps at the patella).

tendon_sheet: a Y-shaped slab, the aponeurosis from muscles cut above a bone, over that bone (holding it like a
sesamoid) and on as a band to an insertion on another (the quadriceps tendon and retinacula over the patella,
then the patellar ligament to the tibial tuberosity), with each vertex's share of the two bones for skinning.
"""
import numpy as np
import trimesh

UP = np.array([0.0, 0.0, 1.0])


def clip_below(m: trimesh.Trimesh, z0: float) -> trimesh.Trimesh:
    """m with everything below z = z0 cut away and each cut ring closed (ear clipping on the plane)."""
    V, F = trimesh.intersections.slice_faces_plane(m.vertices, m.faces, UP, np.array([0.0, 0.0, z0]))[:2]
    cut = trimesh.Trimesh(V, F, process=True)
    V, F = cut.vertices, cut.faces
    # the rim: half-edges without a twin, each oriented as its face has it
    he = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    have = set(map(tuple, he))
    nxt = {a: b for a, b in he if (b, a) not in have}
    caps, seen = [], set()
    for s in nxt:
        if s in seen:
            continue
        ring, v = [], s
        while v not in seen:
            seen.add(v)
            ring.append(v)
            v = nxt[v]
        # the cap runs the ring backwards, so its faces agree with the mesh's orientation
        caps += [t[::-1] for t in _ear_clip(ring, V[:, :2])]
    out = trimesh.Trimesh(V, np.vstack([F, np.array(caps, dtype=F.dtype).reshape(-1, 3)]), process=True)
    return out


def _cross(a, b) -> float:
    """z of the cross product of two 2D vectors"""
    return a[0] * b[1] - a[1] * b[0]


def _ear_clip(ring: list, P: np.ndarray) -> list:
    """Triangles (in ring order) filling the simple polygon `ring` (vertex indices into the 2D points P)."""
    idx = list(ring)
    pts = lambda i: P[i]
    area = sum(_cross(pts(idx[k]), pts(idx[(k + 1) % len(idx)])) for k in range(len(idx))) / 2
    sign = 1.0 if area > 0 else -1.0
    tris, guard = [], 0
    while len(idx) > 3 and guard < 10 * len(ring):
        guard += 1
        for k in range(len(idx)):
            a, b, c = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            A, B, C = pts(a), pts(b), pts(c)
            if sign * _cross(B - A, C - B) <= 1e-12:
                continue  # reflex (or flat): not an ear
            if any(_inside(pts(o), A, B, C) for o in idx if o not in (a, b, c)):
                continue
            tris.append((a, b, c))
            del idx[k]
            break
        else:
            break  # no ear found (degenerate ring): fan what is left
    tris += [(idx[0], idx[k], idx[k + 1]) for k in range(1, len(idx) - 1)]
    return tris


def _inside(p, a, b, c) -> bool:
    d1, d2, d3 = _cross(b - a, p - a), _cross(c - b, p - b), _cross(a - c, p - c)
    return not ((min(d1, d2, d3) < 0) and (max(d1, d2, d3) > 0))


def _front(m: trimesh.Trimesh, X: np.ndarray, z: float) -> np.ndarray:
    """y of m's front (most anterior, smallest y) surface along each x at height z; nan where missed."""
    o = np.column_stack([X, np.full_like(X, m.bounds[0][1] - 50), np.full_like(X, z)])
    loc, ray, _ = m.ray.intersects_location(o, np.tile([0.0, 1.0, 0.0], (len(X), 1)), multiple_hits=False)
    y = np.full(len(X), np.nan)
    if len(ray):
        y[ray] = np.asarray(loc).reshape(-1, 3)[:, 1]
    return y


def _smooth(a: np.ndarray, passes: int, axis: int) -> np.ndarray:
    for _ in range(passes):
        p = np.concatenate([a.take([0], axis), a, a.take([-1], axis)], axis)
        n = a.shape[axis]
        a = (p.take(range(0, n), axis) + 2 * p.take(range(1, n + 1), axis) + p.take(range(2, n + 2), axis)) / 4
    return a


def tendon_sheet(over: trimesh.Trimesh, to: trimesh.Trimesh, beside: trimesh.Trimesh, muscles: trimesh.Trimesh,
                 top_z: float, insertion: np.ndarray, attach_z: float, sheet: float = 3.0, set_back: float = 2.0,
                 band: float = 4.0, band_width: tuple = (26.0, 20.0), wrap: float = 1.5, back: float = 0.0,
                 rows: int = 52, cols: int = 33):
    """
    A Y-shaped sheet: the aponeurosis from the muscles cut at top_z (`muscles`: its top edge spans them, at their
    front surface, overlapping their cut by 2 mm), its arms narrowing over `beside` (the femoral condyles, 1.5 mm
    off them) onto `over` (the patella), which it holds `set_back` mm deep in its `sheet` thickness, then its stem
    (the patellar ligament) `band_width` wide and `band` thick, straight to `insertion` on `to` (the tibia), lying
    set into `to` below attach_z and clear of it above. `back` moves all of it but the insertion that much further
    back (more of `over` shows through its front). Returns the mesh, per vertex the share of `to` (none
    over `over`, all below attach_z, linear between), and per vertex how far it lies beyond `over`'s outline seen
    from the front (0 on it and along the stem): the arms, which `beside` rather than `over` should carry.
    """
    top, low = over.bounds[1][2], over.bounds[0][2]
    z_top = top_z + 4.0
    Z = np.linspace(insertion[2], z_top, rows)
    Xs = np.arange(over.bounds[0][0] - 5, over.bounds[1][0] + 5, 0.5)
    # the bone's width at each row (where rays from the front hit it), and its centre at the lowest rows
    hits = [_front(over, Xs, z) for z in Z]
    lo_x = np.array([Xs[~np.isnan(h)].min() if (~np.isnan(h)).any() else np.nan for h in hits])
    hi_x = np.array([Xs[~np.isnan(h)].max() if (~np.isnan(h)).any() else np.nan for h in hits])
    on = ~np.isnan(lo_x)
    first = np.argmax(on)  # lowest row on the bone
    cx_low = (lo_x[first] + hi_x[first]) / 2
    # the muscles' width at the cut (just above it)
    near = muscles.vertices[muscles.vertices[:, 2] < top_z + 3]
    m_lo, m_hi = near[:, 0].min() + 1.0, near[:, 0].max() - 1.0
    # stem: from the bone's lowest point to the insertion, its centre and width interpolated, a rounded end
    u = np.clip((low - Z) / (low - insertion[2]), 0, 1)
    cx = cx_low + (insertion[0] - cx_low) * u
    hw = (band_width[0] + (band_width[1] - band_width[0]) * u) / 2
    hw = hw * np.sqrt(np.clip(1 - (1 - np.clip((Z - insertion[2]) / 5.0, 0, 1)) ** 2, 0.16, 1))
    L = np.where(on, np.fmin(lo_x - wrap, cx - hw), cx - hw)
    R = np.where(on, np.fmax(hi_x + wrap, cx + hw), cx + hw)
    # arms: from the muscles' width at the top, narrowing onto the bone by two thirds of the way down it
    z_meet = low + 0.35 * (top - low)
    a = np.clip((Z - z_meet) / (z_top - z_meet), 0, 1)
    a = a * a * (3 - 2 * a)
    L = np.where(Z > z_meet, L + (m_lo - np.nan_to_num(L, nan=m_lo)) * a, L)
    R = np.where(Z > z_meet, R + (m_hi - np.nan_to_num(R, nan=m_hi)) * a, R)
    L, R = _smooth(L, 3, 0), _smooth(R, 3, 0)
    X = L[:, None] + (R - L)[:, None] * np.linspace(0, 1, cols)[None, :]

    # front surface. On the bone: `sheet - set_back` in front of it; beside it: 1.5 mm off `beside`; at the top,
    # blending over 8 mm from the muscles' front; the stem: a straight line from the bone's lowest point to the
    # insertion, set into `to` there
    y_low = np.nanmin(hits[first]) - (sheet - set_back) + back
    y_ins = _front(to, np.array([insertion[0]]), insertion[2])[0] - band + 1.5
    Yf, keep = np.empty_like(X), np.full_like(X, np.inf)
    for i, z in enumerate(Z):
        line = y_low + (y_ins - y_low) * u[i]
        h = _front(over, X[i], z)
        # never behind the bone's front where it covers it (smoothing would let the bone show through)
        keep[i] = np.where(np.isnan(h), np.inf, h - (sheet - set_back) + back)
        bone = np.where(np.isnan(h), np.nan, h - (sheet - set_back) + back)
        if z > low:
            f = _front(beside, X[i], z) - 1.5 - sheet + back
            bone = np.where(np.isnan(bone), f, bone)
            bone = np.where(np.isnan(bone), line, bone)
        else:
            bone = np.where(np.isnan(bone), line, bone)
        w = np.clip((z - (top_z - 8.0)) / 8.0, 0, 1)
        if w > 0:
            m = _front(muscles, X[i], max(z, top_z + 1.0))
            bone = np.where(np.isnan(m), bone, (1 - w) * bone + w * (m + back))
        t = _front(to, X[i], z)
        # clear of `to` over the gap, set into it from where the stem attaches
        lim = t - band - (0.3 if z > attach_z else -1.5)
        Yf[i] = np.where(np.isnan(t), bone, np.fmin(bone, lim))
        keep[i] = np.where(np.isnan(t), keep[i], np.fmin(keep[i], lim))
    Yf = np.fmin(_smooth(_smooth(Yf, 2, 0), 2, 1), keep)
    b = np.clip((low - Z) / 6.0, 0, 1)
    th = sheet + (band - sheet) * b
    # the stem's cross-section a lens (thinning to its edges) about its midline
    across = np.sqrt(np.clip(1 - np.linspace(-1, 1, cols) ** 2, 0.09, 1))[None, :]
    half = th[:, None] / 2 * (1 - b[:, None] + b[:, None] * across)
    mid = Yf + th[:, None] / 2
    Yf, Yb = mid - half, mid + half

    nV = rows * cols
    V = np.vstack([np.column_stack([X.ravel(), Yf.ravel(), np.repeat(Z, cols)]),
                   np.column_stack([X.ravel(), Yb.ravel(), np.repeat(Z, cols)])])
    g = lambda i, j, back=0: back * nV + i * cols + j
    F = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            F += [(g(i, j), g(i, j + 1), g(i + 1, j + 1)), (g(i, j), g(i + 1, j + 1), g(i + 1, j))]
            F += [(g(i, j, 1), g(i + 1, j + 1, 1), g(i, j + 1, 1)), (g(i, j, 1), g(i + 1, j, 1), g(i + 1, j + 1, 1))]
        for j in (0, cols - 1):
            F += [(g(i, j), g(i + 1, j), g(i + 1, j, 1)), (g(i, j), g(i + 1, j, 1), g(i, j, 1))]
    for i in (0, rows - 1):
        for j in range(cols - 1):
            F += [(g(i, j), g(i, j, 1), g(i, j + 1, 1)), (g(i, j), g(i, j + 1, 1), g(i, j + 1))]
    mesh = trimesh.Trimesh(V, np.array(F), process=True)
    trimesh.repair.fix_normals(mesh)
    # share of `to`: none down to the bone's lowest point, all from attach_z, linear between: the stem then runs
    # straight between its attachments (a smoothstep held it square to both and bent it into an S as the tibia
    # turned)
    P = mesh.vertices
    share = np.clip((low - P[:, 2]) / (low - attach_z), 0, 1)
    # beyond the bone's outline, row by row (rows above its top take its top row's)
    ok = ~np.isnan(lo_x)
    zl, lx, hx = Z[ok], lo_x[ok], hi_x[ok]
    beyond = np.maximum(np.maximum(np.interp(P[:, 2], zl, lx) - P[:, 0], P[:, 0] - np.interp(P[:, 2], zl, hx)), 0)
    beyond[P[:, 2] < low] = 0
    return mesh, share, beyond
