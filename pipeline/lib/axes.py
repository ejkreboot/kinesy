"""Fit joint axes from bone geometry (source frame).

hinge_congruence: find the axis about which the moving bone's articular surface stays at a
    constant gap from the fixed bone through the whole arc (e.g. trochlear notch on trochlea).
pivot_centers: axis through the center of the moving bone's proximal head (circle fit) and the
    fixed bone's distal head (sphere fit), nudged to avoid bony collision (e.g. forearm rotation).

Both return (point, unit dir) with the sign chosen so that positive rotation moves the moving
bone's distal tip toward `positive_toward`.
"""
import numpy as np
from scipy.optimize import minimize
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as Rot

from .meshes import sample


def _rot(P, c, d, ang):
    d = d / np.linalg.norm(d)
    return Rot.from_rotvec(d * ang).apply(P - c) + c


def _sph(a, b):
    return np.array([np.cos(a) * np.cos(b), np.cos(a) * np.sin(b), np.sin(a)])


def _orient(point, d, moving, positive_toward):
    tip = moving.vertices[moving.vertices[:, 2].argmin()]
    step = _rot(tip[None], point, d, 0.2)[0] - tip
    return d if np.dot(step, positive_toward) > 0 else -d


def hinge_congruence(fixed, moving, positive_toward=(0, -1, 0), arc_deg=(0, 130, 10), contact_mm=5.0):
    Fs, Ms = sample(fixed, 60000), sample(moving, 30000)
    Ft = cKDTree(Fs)
    dist, _ = Ft.query(Ms)
    contact = Ms[dist < contact_mm]
    d0, _ = Ft.query(contact)

    # initial guess: the fixed bone's distal condyles (widest points near its lower end)
    low = fixed.vertices[fixed.vertices[:, 2] < fixed.bounds[0][2] + 45]
    lat, med = low[low[:, 0].argmin()], low[low[:, 0].argmax()]
    c0 = (lat + med) / 2
    dir0 = (med - lat) / np.linalg.norm(med - lat)
    a0, b0 = np.arcsin(dir0[2]), np.arctan2(dir0[1], dir0[0])
    angs = np.radians(np.arange(*arc_deg))

    def objective(p):
        c, d = c0 + p[:3], _sph(p[3], p[4])
        return np.mean([np.mean((Ft.query(_rot(contact, c, d, a))[0] - d0) ** 2) for a in angs])

    best = None
    for off in ([0, 0, 0], [0, -8, 8], [0, 5, 12], [0, -3, 15]):
        r = minimize(objective, np.r_[off, a0, b0], method='Nelder-Mead',
                     options={'maxiter': 4000, 'xatol': 1e-3, 'fatol': 1e-5})
        if best is None or r.fun < best.fun:
            best = r
    c, d = c0 + best.x[:3], _sph(best.x[3], best.x[4])
    c = c + np.dot(contact.mean(0) - c, d) * d  # center on the articular surface
    return c, _orient(c, d, moving, np.asarray(positive_toward)), float(best.fun)


def pivot_centers(fixed, moving, positive_toward=(0, -1, 0), check_deg=(20, 45, 70, 90)):
    # proximal head of the moving bone: circle through a slice just below its top
    top = moving.bounds[1][2]
    sl = moving.vertices[(moving.vertices[:, 2] > top - 9) & (moving.vertices[:, 2] < top - 4)]
    A = np.c_[2 * sl[:, 0], 2 * sl[:, 1], np.ones(len(sl))]
    cx, cy, _ = np.linalg.lstsq(A, (sl[:, :2] ** 2).sum(1), rcond=None)[0]
    head = np.array([cx, cy, sl[:, 2].mean()])
    # distal head of the fixed bone: sphere through its lowest 16 mm
    dh = fixed.vertices[fixed.vertices[:, 2] < fixed.bounds[0][2] + 16]
    s = np.linalg.lstsq(np.c_[2 * dh, np.ones(len(dh))], (dh ** 2).sum(1), rcond=None)[0]
    foot = s[:3]

    Ms = sample(moving, 30000)
    Ft = cKDTree(sample(fixed, 30000))

    def objective(p):
        a, b = head + p[:3], foot + p[3:]
        pen = sum(np.sum(np.clip(1.0 - Ft.query(_rot(Ms, b, a - b, np.radians(t)))[0], 0, None) ** 2) for t in check_deg)
        return pen + 0.5 * np.sum(p ** 2)

    r = minimize(objective, np.zeros(6), method='Powell', options={'maxiter': 3000})
    a, b = head + r.x[:3], foot + r.x[3:]
    d = (a - b) / np.linalg.norm(a - b)
    return b, _orient(b, d, moving, np.asarray(positive_toward)), float(r.fun)


FITTERS = {'hinge_congruence': hinge_congruence, 'pivot_centers': pivot_centers}
