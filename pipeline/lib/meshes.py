"""Mesh loading, decimation, surface sampling, and the source -> viewer frame change."""
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh
from scipy.sparse import coo_matrix, diags

SEED = 7


class Source:
    """BodyParts3D STL files, by FMA id."""

    def __init__(self, stl_dir: Path):
        self.dir = Path(stl_dir)
        self._cache: dict[str, trimesh.Trimesh] = {}

    def load(self, fma: str) -> trimesh.Trimesh:
        if fma not in self._cache:
            path = self.dir / f'{fma}.stl'
            if not path.exists():
                raise FileNotFoundError(f'{path} missing. Run: python pipeline/fetch_sources.py <joint>')
            self._cache[fma] = trimesh.load(path, process=True)
        return self._cache[fma]


def decimate(m: trimesh.Trimesh, target_faces: int | None) -> trimesh.Trimesh:
    if target_faces is None or len(m.faces) <= target_faces:
        return m
    v, f = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int32),
                                        target_reduction=1 - target_faces / len(m.faces))
    return trimesh.Trimesh(v, f, process=True)


def sample(m: trimesh.Trimesh, n: int, seed: int = SEED) -> np.ndarray:
    return trimesh.sample.sample_surface_even(m, n, seed=seed)[0]


def laplacian_smooth(W: np.ndarray, faces: np.ndarray, n: int, iters: int) -> np.ndarray:
    """Smooth per-vertex values over the mesh graph (half-step Jacobi)."""
    e = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    e = np.vstack([e, e[:, ::-1]])
    A = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    A.data[:] = 1
    P = diags(1 / np.maximum(A.sum(1).A1, 1)) @ A
    for _ in range(iters):
        W = 0.5 * W + 0.5 * (P @ W)
    return W


class Frame:
    """Source frame (BodyParts3D: x = subject's left, y = posterior, z = superior) -> viewer
    frame (x same, y = superior, z = anterior), translated so `origin` maps to 0."""

    def __init__(self, origin):
        self.origin = np.asarray(origin, dtype=float)

    def points(self, P) -> np.ndarray:
        P = np.atleast_2d(np.asarray(P, dtype=float)) - self.origin
        return np.c_[P[:, 0], P[:, 2], -P[:, 1]]

    def point(self, p) -> list[float]:
        return self.points(p)[0].tolist()

    @staticmethod
    def direction(d) -> list[float]:
        d = np.asarray(d, dtype=float)
        d = d / np.linalg.norm(d)
        return [float(d[0]), float(d[2]), float(-d[1])]
