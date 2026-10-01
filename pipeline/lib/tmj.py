"""The temporomandibular joints: the mandible's motion fitted to the skull, mandible and teeth (source frame).

The mandible is posed as src/joints/jaw/rig.ts poses it, outermost first:
  glide    a translation: forward by the mean of the two condyles' glides, down by the mean of their drops
  swing    about an upright axis through the midpoint between the condyles: one condyle ahead of the other
  roll     about the forward axis through that midpoint: one condyle lower than the other
  hinge    about the axis through both condyles' centres: opening
Each condyle glides along a path under its articular eminence: forward by t, down by drop(t). Here:

  condyles     sphere fits to the condyles' heads: the hinge axis through their centres
  drop(t)      how far a condyle must drop to glide forward by t mm and still clear the fossa and eminence
               (temporal and sphenoid) as at rest (the condyle's medial pole lies 1.5 mm into the fossa's wall
               in the source meshes, so it may lie that deep, and no deeper)
  guidance     the least hinge opening that keeps the lower teeth off the upper ones: in protrusion (both
               condyles forward; the incisors slide down the upper incisors, incisal guidance) and in lateral
               excursion (one condyle forward, the other turning in place; the canines guide)
"""
import igl
import numpy as np
from scipy.spatial.transform import Rotation as Rot

from .meshes import sample

FORWARD, DOWN = np.array([0.0, -1.0, 0.0]), np.array([0.0, 0.0, -1.0])
TEETH_CLEAR = 0.3   # mm kept between the upper and lower teeth outside rest
STEP = 0.5          # mm of glide per table entry


def _sphere(P):
    s = np.linalg.lstsq(np.c_[2 * P, np.ones(len(P))], (P ** 2).sum(1), rcond=None)[0]
    c = s[:3]
    return c, float(np.sqrt(s[3] + c @ c))


def condyle_centres(mandible):
    """Centre of each condyle's head (right first): a sphere through its top 8 mm."""
    V = mandible.vertices
    out = []
    for right in (True, False):
        S = V[(V[:, 0] < V[:, 0].mean()) == right]
        S = S[S[:, 1] > np.percentile(S[:, 1], 40)]   # behind the coronoid process
        top = S[S[:, 2] > S[:, 2].max() - 8]
        c, r = _sphere(top)
        err = np.abs(np.linalg.norm(top - c, axis=1) - r).mean()
        print(f'    {"right" if right else "left"} condyle centre {np.round(c, 1)} radius {r:.1f} mm, residual {err:.2f} mm')
        out.append(c)
    return out


class Kinematics:
    def __init__(self, cR, cL):
        self.cR, self.cL = np.asarray(cR), np.asarray(cL)
        self.mid = (self.cR + self.cL) / 2
        self.w = float(np.linalg.norm(self.cL - self.cR))
        self.hinge = (self.cL - self.cR) / self.w            # +: the chin moves down and back (opening)
        up = np.cross(FORWARD, self.hinge)
        self.up = up / np.linalg.norm(up)                    # +: the chin moves to the subject's left
        self.forward = np.cross(self.hinge, self.up)         # +: the right condyle drops (roll)

    def pose(self, P, tR, tL, dR, dL, hinge_deg):
        """Mandible points P (rest) moved: condyles forward by tR/tL and down by dR/dL, opened by hinge_deg."""
        rot = lambda Q, axis, ang: Rot.from_rotvec(axis * ang).apply(Q - self.mid) + self.mid
        Q = rot(P, self.hinge, np.radians(hinge_deg))
        Q = rot(Q, self.forward, (dR - dL) / self.w)
        Q = rot(Q, self.up, (tR - tL) / self.w)
        return Q + FORWARD * (tR + tL) / 2 + DOWN * (dR + dL) / 2


def _sd(mesh):
    V, F = np.asarray(mesh.vertices), np.asarray(mesh.faces, dtype=np.int64)
    return lambda P: igl.signed_distance(P, V, F)[0]


def _least(ok, lo, hi, tol=0.02):
    """Smallest x in [lo, hi] with ok(x) (ok monotone: false below, true above); hi if none is."""
    if ok(lo):
        return lo
    while hi - lo > tol:
        m = (lo + hi) / 2
        lo, hi = (lo, m) if ok(m) else (m, hi)
    return hi


def condylar_path(kin, mandible, fossa, t_max=14.0):
    """drop(t) per forward glide t (0 to t_max, STEP apart), the mean over both condyles, smoothed. No glide
    back: these condyles sit against the back of the fossa (the postglenoid process) at rest."""
    sd = _sd(fossa)
    S = sample(mandible, 60000)
    ts = np.arange(0, t_max + 1e-9, STEP)
    out = []
    for c in (kin.cR, kin.cL):
        C = S[np.linalg.norm(S - c, axis=1) < 16]
        C = C[C[:, 2] > c[2] - 6]                        # the head and the top of the neck
        g0 = sd(C).min()
        drops = [_least(lambda d: sd(C + FORWARD * t + DOWN * d).min() >= g0 - 1e-3, -3.0, 15.0) for t in ts]
        print(f'    condyle at x {c[0]:6.1f}: rest overlap {-g0:.2f} mm; drop at t = 0/4/8/12: '
              + ' / '.join(f'{drops[int(round(t / STEP))]:.2f}' for t in (0, 4, 8, 12)))
        out.append(drops)
    d = np.mean(out, axis=0)
    # light smoothing (the bisection is to 0.02 mm, the meshes are faceted), none at rest
    k = np.array([1, 2, 3, 2, 1], float)
    ds = np.convolve(np.pad(d, 2, mode='reflect', reflect_type='odd'), k / k.sum(), mode='valid')
    return ts, ds - ds[0]


def guidance(kin, lower, upper, drop, glides, lateral):
    """Least hinge opening (deg) keeping the lower teeth TEETH_CLEAR off the upper ones (or as close as at rest):
    per protrusion t (both condyles forward), and per lateral glide s (s > 0: the right condyle forward, the
    chin to the left; s < 0 the reverse)."""
    sd = _sd(upper)
    L = sample(lower, 20000)
    clear = min(TEETH_CLEAR, sd(L).min())
    least = lambda tR, tL: _least(lambda h: sd(kin.pose(L, tR, tL, drop(tR), drop(tL), h)).min() >= clear - 1e-3, 0.0, 20.0, 0.05)
    prot = [least(t, t) for t in glides]
    lat = [least(max(s, 0.0), max(-s, 0.0)) for s in lateral]
    return prot, lat
