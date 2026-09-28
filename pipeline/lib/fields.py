"""Bone signed-distance grids and muscle centerlines (viewer frame)."""
import igl
import numpy as np

VOXEL_MM = 1.5
QUANT_MM = 0.25   # int8 step -> +/-31.75 mm range
PAD_MM = 10.0
BINS = 20


def sdf_grid(V, F, ymax=None):
    """Signed distance (negative inside) on a regular grid around the mesh, int8-quantized.
    Returns (int8 array ordered x-fastest, entry dict without offset)."""
    V = np.asarray(V, dtype=np.float64)
    lo, hi = V.min(0) - PAD_MM, V.max(0) + PAD_MM
    if ymax is not None:
        hi[1] = min(hi[1], ymax)
    dims = np.ceil((hi - lo) / VOXEL_MM).astype(int) + 1
    axes = [lo[a] + VOXEL_MM * np.arange(dims[a]) for a in range(3)]
    G = np.stack(np.meshgrid(*axes, indexing='ij'), -1).reshape(-1, 3)
    S = igl.signed_distance(G, V, np.asarray(F, dtype=np.int64))[0]
    q = np.clip(np.round(S / QUANT_MM), -127, 127).astype(np.int8).reshape(dims)
    data = np.ascontiguousarray(q.transpose(2, 1, 0))
    return data, {'lo': lo.tolist(), 'h': VOXEL_MM, 'q': QUANT_MM, 'dims': dims.tolist()}


def centerline(V, W, bulge, lenref):
    """Bin a muscle along its principal axis: bin centers, mean skin weights, and a
    normalized cross-section profile (1 = widest)."""
    mu = V.mean(0)
    a = np.linalg.svd(V - mu, full_matrices=False)[2][0]
    if a[1] < 0:
        a = -a  # t increases proximally
    tr = (V - mu) @ a
    lo, hi = np.percentile(tr, 1), np.percentile(tr, 99)
    t = np.clip((tr - lo) / (hi - lo), 0, 1)
    k = np.minimum((t * BINS).astype(int), BINS - 1)
    nb = W.shape[1]
    C, WC, R = np.full((BINS, 3), np.nan), np.zeros((BINS, nb)), np.zeros(BINS)
    for b in range(BINS):
        m = k == b
        if m.sum() < 3:
            continue
        C[b], WC[b] = V[m].mean(0), W[m].mean(0)
        r = V[m] - C[b]
        r -= np.outer(r @ a, a)
        R[b] = np.linalg.norm(r, axis=1).mean()
    good, idx = ~np.isnan(C[:, 0]), np.arange(BINS)
    for c in range(3):
        C[:, c] = np.interp(idx, idx[good], C[good, c])
    for c in range(nb):
        WC[:, c] = np.interp(idx, idx[good], WC[good, c])
    R = np.interp(idx, idx[good], R[good])
    WC /= WC.sum(1, keepdims=True)
    return {'mu': mu.tolist(), 'a': a.tolist(), 'lo': float(lo), 'hi': float(hi),
            'C': C.round(3).tolist(), 'W': WC.round(4).tolist(), 'prof': ((R / R.max()) ** 2).round(3).tolist(),
            'bulge': bool(bulge), 'lenref': lenref}
