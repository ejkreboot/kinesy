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


def _smoothstep(s, h):
    x = np.clip((s + h) / (2 * h), 0.0, 1.0)
    return x * x * (3 - 2 * x)


def chain_weights(V, allowed, nb, chains, trees):
    """Weights by position along a chain of bones (a digit), for tendons that pulleys hold against
    the bones: a vertex belongs wholly to the segment it lies in, blending only within `h` of the
    plane through each joint center. Because the blend is centered on the joint, dual-quaternion
    skinning carries tendons around the joint at constant radius instead of cutting the corner.

    chains: list of chains, each a list of segments (bone id, plane) from the root; plane is None
    for the first segment, else (point, unit normal pointing distally, half width). Each vertex
    uses the chain whose own bones (those not shared with every chain) lie nearest. Segments
    whose bone the muscle may not attach to hand their weight to the nearest allowed segment."""
    shared = set.intersection(*(set(b for b, _ in c) for c in chains))
    allowed_set = set(allowed)
    own = [[b for b, _ in c if b not in shared and b in allowed_set] for c in chains]
    if any(own):
        dist = np.full((len(V), len(chains)), np.inf)
        for ci, bs in enumerate(own):
            for b in bs:
                dist[:, ci] = np.minimum(dist[:, ci], trees[b].query(V)[0])
        pick = dist.argmin(1)
    else:
        pick = np.zeros(len(V), dtype=int)

    W = np.zeros((len(V), nb))
    for ci, chain in enumerate(chains):
        sel = pick == ci
        if not sel.any():
            continue
        P = V[sel]
        # remap disallowed segments to the nearest allowed one (proximal first)
        seg_bones = [b for b, _ in chain]
        target = []
        for k, b in enumerate(seg_bones):
            if b in allowed_set:
                target.append(b)
                continue
            prev = [x for x in seg_bones[:k][::-1] if x in allowed_set]
            nxt = [x for x in seg_bones[k + 1:] if x in allowed_set]
            target.append(prev[0] if prev else nxt[0])
        reach = np.ones(len(P))  # product of sigmoids of the planes passed so far
        for k, (b, plane) in enumerate(chain):
            nxt_plane = chain[k + 1][1] if k + 1 < len(chain) else None
            beyond = np.zeros(len(P)) if nxt_plane is None else _smoothstep((P - nxt_plane[0]) @ nxt_plane[1], nxt_plane[2])
            W[np.flatnonzero(sel), target[k]] += reach * (1 - beyond)
            reach = reach * beyond
    return W / W.sum(1, keepdims=True)
