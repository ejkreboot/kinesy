"""The cervical spine's joints, fitted from the vertebrae (source frame: x = subject's left, y = posterior,
z = superior).

Each level turns its upper bone about a centre on three axes in the level's own frame (the spine curves, so
"up" changes level to level):
  flex   the level's left-right axis; + moves the head forward (flexion)
  lat    its front-back axis; + bends the head to the subject's left
  rot    its long axis; + turns the face to the subject's left

Centres: between C2 and T1, the middle of the disc (between the bodies' endplates, from the bodies' central
columns, which leave out the uncinate lips at their sides); C1 on C2, the dens (rotation about its axis); the
head on C1, between the occipital condyles' contacts on the atlas's lateral masses.
"""
import numpy as np
from scipy.spatial import cKDTree

from .meshes import sample

X = np.array([1.0, 0.0, 0.0])


def _unit(v):
    return v / np.linalg.norm(v)


def body_column(m):
    """The vertebral body's central column: near the midline, at the front of the bone."""
    V = m.vertices
    xc = (V[:, 0].min() + V[:, 0].max()) / 2
    mid = V[np.abs(V[:, 0] - xc) < 5]
    front = mid[:, 1].min()
    return mid[mid[:, 1] < front + 14]


def endplates(m, below_z=None):
    """Centres of the body's upper and lower endplates (below_z: ignore the column above it, C2's dens)."""
    C = body_column(m)
    if below_z is not None:
        C = C[C[:, 2] < below_z]
    top, bot = C[C[:, 2] > C[:, 2].max() - 2], C[C[:, 2] < C[:, 2].min() + 2]
    return top.mean(0), bot.mean(0), C.mean(0)


def frame(up):
    """lat (the subject's left), ant (forward) for a level whose long axis is `up`, made symmetric: in the midline
    plane (these vertebrae lean a few degrees to one side, which would turn bending into a little rotation)."""
    up = _unit(np.array([0.0, up[1], up[2]]))
    lat = _unit(X - (X @ up) * up)
    ant = np.cross(lat, up)
    return lat, ant, up


def dens(c2):
    """The dens: its axis (base to tip, unit) and its centre. The column above C2's superior facets: 2 mm slices
    down from its tip while they stay narrow, the axis a line through their centres."""
    V = c2.vertices
    top, cs = V[:, 2].max(), []
    for z in np.arange(top, top - 30, -2.0):
        sl = V[(V[:, 2] <= z) & (V[:, 2] > z - 2)]
        if len(sl) < 5 or np.ptp(sl[:, 0]) > 12:
            break
        cs.append([(sl[:, 0].min() + sl[:, 0].max()) / 2, (sl[:, 1].min() + sl[:, 1].max()) / 2, z - 1])
    cs = np.array(cs)
    c = cs.mean(0)
    a = np.linalg.svd(cs - c, full_matrices=False)[2][0]
    return (a if a[2] > 0 else -a), c


def occipital_condyles(c1, occ):
    """Midpoint of the occipital condyles' contacts on the atlas: the atlas's vertices nearest the occipital bone,
    one patch each side."""
    S = sample(c1, 30000)
    d = cKDTree(sample(occ, 60000)).query(S)[0]
    near = S[d < d.min() + 3]
    xc = S[:, 0].mean()
    R, L = near[near[:, 0] < xc], near[near[:, 0] >= xc]
    return (R.mean(0) + L.mean(0)) / 2, R.mean(0), L.mean(0)


def fit(src, ids, t1, occ):
    """Axes for every level: `ids` the cervical vertebrae's FMA ids by name (c1..c7), t1 and occ the first thoracic
    vertebra's and the occipital bone's. Returns {level_axis: {point, dir}} and info for the log."""
    m = {k: src.load(v) for k, v in ids.items()}
    m['t1'] = src.load(t1)
    dens_dir, dens_c = dens(m['c2'])
    plates = {k: endplates(m[k], below_z=(dens_c[2] - 8 if k == 'c2' else None)) for k in ('c2', 'c3', 'c4', 'c5', 'c6', 'c7', 't1')}
    order = ['t1', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2']
    centres, out, info = {}, {}, []
    for lower, upper in zip(order, order[1:]):
        # the disc between `upper`'s lower endplate and `lower`'s upper one
        centres[f'{upper}{lower}'] = (plates[upper][1] + plates[lower][0]) / 2
    centres['c1c2'] = dens_c
    centres['occ1'], cR, cL = occipital_condyles(m['c1'], occ)
    info.append(f'occipital condyle contacts R {np.round(cR, 1)} L {np.round(cL, 1)}')
    names = ['c7t1', 'c6c7', 'c5c6', 'c4c5', 'c3c4', 'c2c3', 'c1c2', 'occ1']
    for k, name in enumerate(names):
        if name in ('c1c2', 'occ1'):
            up = dens_dir
        else:
            # the spine's direction here: from the disc below this one to the disc above
            below = centres[names[k - 1]] if k else plates['t1'][2]
            above = centres[names[k + 1]]
            up = above - below
        lat, ant, up = frame(up)
        c = centres[name]
        out[f'{name}_flex'] = {'point': c.tolist(), 'dir': lat.tolist()}
        out[f'{name}_lat'] = {'point': c.tolist(), 'dir': (-ant).tolist()}
        out[f'{name}_rot'] = {'point': c.tolist(), 'dir': up.tolist()}
        info.append(f'{name:5s} centre {np.round(c, 1)} up {np.round(up, 3)}')
    return out, info
