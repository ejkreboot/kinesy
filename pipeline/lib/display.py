"""Display meshes: each muscle is shown as a detailed surface carried by its coarse mesh (the one
the deformer collides). Every display vertex is embedded on a coarse triangle as barycentric
coordinates (u, v) and an offset h along the coarse vertex normals interpolated there:

    p = (1-u-v) x0 + u x1 + v x2 + h ((1-u-v) n0 + u n1 + v n2)

with unit, area-weighted vertex normals (src/core/display.ts places them the same way). Solved
exactly at rest, so the display surface follows the coarse one wherever it goes, smoothly across
triangles."""
import igl
import numpy as np


def vertex_normals(V, F):
    """Area-weighted unit vertex normals (as src/core/contact.ts vertexNormals)."""
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, F[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def _place(x, n, u, v, h):
    w = (1 - u - v)[:, None]
    return w * x[0] + u[:, None] * x[1] + v[:, None] * x[2] + h[:, None] * (w * n[0] + u[:, None] * n[1] + v[:, None] * n[2])


def place(coarse, tri, u, v, h):
    """Display vertex positions on the coarse trimesh from their embedding."""
    Vc, Fc = np.asarray(coarse.vertices, dtype=np.float64), np.asarray(coarse.faces, dtype=np.int64)
    Nc = vertex_normals(Vc, Fc)
    t = Fc[tri]
    return _place([Vc[t[:, k]] for k in range(3)], [Nc[t[:, k]] for k in range(3)], u, v, h)


def _solve(P, x, n, u, v, h, iters):
    """Newton on the placement: (u, v, h) that land on each point along the interpolated normal."""
    e1, e2 = x[1] - x[0], x[2] - x[0]
    for _ in range(iters):
        w = 1 - u - v
        nn = w[:, None] * n[0] + u[:, None] * n[1] + v[:, None] * n[2]
        F = _place(x, n, u, v, h) - P
        J = np.stack([e1 + h[:, None] * (n[1] - n[0]), e2 + h[:, None] * (n[2] - n[0]), nn], axis=2)
        ok = np.abs(np.linalg.det(J)) > 1e-12
        d = np.zeros_like(F)
        d[ok] = np.linalg.solve(J[ok], -F[ok][:, :, None])[:, :, 0]
        u, v, h = u + d[:, 0], v + d[:, 1], h + d[:, 2]
    err = np.linalg.norm(_place(x, n, u, v, h) - P, axis=1)
    err[~np.isfinite(err)] = np.inf
    return u, v, h, err


def embed(P, coarse, iters=8):
    """Embed points P on the coarse trimesh: (triangle, u, v, h) per point, and the distance by
    which each placement misses its point at rest. Each point tries its closest triangle and every
    triangle around that triangle's corners, and keeps one it lands inside, else the smallest miss
    (a little outside a triangle, extrapolated, is fine: the surface stays continuous)."""
    Vc, Fc = np.asarray(coarse.vertices, dtype=np.float64), np.asarray(coarse.faces, dtype=np.int64)
    Nc = vertex_normals(Vc, Fc)
    S, I, C, _ = igl.signed_distance(P, Vc, Fc)
    # the triangles around each corner of each point's closest triangle (padded by repeating)
    ring = [[] for _ in range(len(Vc))]
    for f, tri in enumerate(Fc):
        for k in tri:
            ring[k].append(f)
    width = max(len(r) for r in ring)
    rings = np.array([r + [r[0]] * (width - len(r)) for r in ring])
    around = np.concatenate([rings[Fc[I, k]] for k in range(3)], 1)
    best = (np.full(len(P), np.inf), I.copy(), np.zeros(len(P)), np.zeros(len(P)), S.copy(), np.full(len(P), False))
    for cand in [I, *around.T]:
        tri = Fc[cand]
        x = [Vc[tri[:, k]] for k in range(3)]
        n = [Nc[tri[:, k]] for k in range(3)]
        # start from the closest point's barycentrics in this triangle, offset by the signed distance
        e1, e2, r = x[1] - x[0], x[2] - x[0], C - x[0]
        d00, d01, d11 = (e1 * e1).sum(1), (e1 * e2).sum(1), (e2 * e2).sum(1)
        d20, d21 = (r * e1).sum(1), (r * e2).sum(1)
        den = np.maximum(d00 * d11 - d01 * d01, 1e-18)
        u, v, h, err = _solve(P, x, n, (d11 * d20 - d01 * d21) / den, (d00 * d21 - d01 * d20) / den, S.copy(), iters)
        inside = (np.minimum(np.minimum(u, v), 1 - u - v) > -0.02) & (np.abs(h) < 20)
        # prefer landing inside a triangle; among equals, the smaller miss
        take = (inside & ~best[5]) | ((inside == best[5]) & (err < best[0]))
        for arr, val in zip(best, (err, cand, u, v, h, inside)):
            arr[take] = val[take]
    # where the interpolated normals fold (sharp creases of the coarse mesh), the closest point
    # offset by the distance may miss by less than any solution along them
    tri = Fc[I]
    x = [Vc[tri[:, k]] for k in range(3)]
    n = [Nc[tri[:, k]] for k in range(3)]
    e1, e2, r = x[1] - x[0], x[2] - x[0], C - x[0]
    d00, d01, d11 = (e1 * e1).sum(1), (e1 * e2).sum(1), (e2 * e2).sum(1)
    d20, d21 = (r * e1).sum(1), (r * e2).sum(1)
    den = np.maximum(d00 * d11 - d01 * d01, 1e-18)
    u0, v0 = (d11 * d20 - d01 * d21) / den, (d00 * d21 - d01 * d20) / den
    err0 = np.linalg.norm(_place(x, n, u0, v0, S) - P, axis=1)
    err, J, u, v, h, _ = best
    use = err0 < err
    J[use], u[use], v[use], h[use], err[use] = I[use], u0[use], v0[use], S[use], err0[use]
    return J, u, v, h, err
