"""Muscle skin weights: proximity to the bones a muscle attaches to, smoothed over the mesh,
then coupled between touching muscles so shared tendons and merged bellies move together."""
import numpy as np
from scipy.spatial import cKDTree

from .meshes import laplacian_smooth


def proximity_weights(V, faces, trees, allowed, nb, sigma=4.0, smooth=25):
    dist = np.stack([trees[b].query(V)[0] for b in allowed], 1)
    w = np.exp(-(dist - dist.min(1, keepdims=True)) / sigma)
    w /= w.sum(1, keepdims=True)
    W = np.zeros((len(V), nb))
    W[:, allowed] = w
    W = laplacian_smooth(W, faces, len(V), smooth)
    return W / W.sum(1, keepdims=True)


def couple(muscles, allowed, iters=6, contact_mm=2.5, smooth=5):
    """muscles: {name: (trimesh, W)}; allowed: {name: [bone ids]}. Jacobi averaging of weights
    across muscle surfaces within `contact_mm`, masked to each muscle's allowed bones."""
    names = list(muscles)
    trees = {n: cKDTree(muscles[n][0].vertices) for n in names}
    for _ in range(iters):
        new = {}
        for a in names:
            Va, Wa = muscles[a][0].vertices, muscles[a][1]
            acc, cnt = Wa.copy(), np.ones(len(Va))
            for b in names:
                if a == b:
                    continue
                dd, ii = trees[b].query(Va)
                near = dd < contact_mm
                acc[near] += muscles[b][1][ii[near]]
                cnt[near] += 1
            mask = np.zeros(Wa.shape[1])
            mask[allowed[a]] = 1
            Wn = laplacian_smooth((acc / cnt[:, None]) * mask, muscles[a][0].faces, len(Va), smooth)
            new[a] = Wn / Wn.sum(1, keepdims=True)
        muscles = {n: (muscles[n][0], new[n]) for n in names}
    return muscles
