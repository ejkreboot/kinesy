"""Build a joint's viewer assets from BodyParts3D meshes.

    python pipeline/build.py elbow                 # use frozen axes in joints/elbow.axes.json
    python pipeline/build.py elbow --refit-axes    # refit axes from bone geometry (~3 min)

Writes assets/<joint>/{manifest.json, geometry.bin.gz, fields.bin.gz}.
"""
import argparse
import gzip
import importlib
import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

from pipeline.lib.axes import FITTERS  # noqa: E402
from pipeline.lib.fields import centerline, sdf_grid  # noqa: E402
from pipeline.lib.meshes import Frame, Source, decimate, sample  # noqa: E402
from pipeline.lib.skin import couple, proximity_weights  # noqa: E402

STL_DIR = ROOT / 'sources' / 'bodyparts3d' / 'stl'


def fit_axes(cfg, src, axes_path, refit):
    if not refit and axes_path.exists():
        return json.loads(axes_path.read_text())
    out = {'_frame': 'BodyParts3D source frame (mm). Fitted by pipeline/lib/axes.py; regenerate with --refit-axes.'}
    for name, spec in cfg.AXES.items():
        point, d, err = FITTERS[spec['fit']](src, spec)
        print(f'  axis {name:10s} point {np.round(point, 2)} dir {np.round(d, 3)} residual {err:.3f}')
        out[name] = {'point': point.tolist(), 'dir': d.tolist()}
    axes_path.write_text(json.dumps(out, indent=1))
    return out


def load_bone(src, fma, faces):
    """A bone mesh from one FMA id or several merged (each decimated in proportion to its size).
    Returns (full-resolution mesh, display mesh)."""
    if isinstance(fma, str):
        full = src.load(fma)
        return full, decimate(full, faces)
    parts = [src.load(f) for f in fma]
    total = sum(len(p.faces) for p in parts)
    full = trimesh.util.concatenate(parts)
    shown = [decimate(p, None if faces is None else max(200, round(faces * len(p.faces) / total))) for p in parts]
    return full, trimesh.util.concatenate(shown)


class Packer:
    def __init__(self):
        self.buf = bytearray()

    def add(self, arr: np.ndarray) -> int:
        off = len(self.buf)
        self.buf.extend(np.ascontiguousarray(arr).tobytes())
        while len(self.buf) % 4:
            self.buf.append(0)
        return off


def build(joint: str, refit: bool):
    cfg = importlib.import_module(f'pipeline.joints.{joint}')
    src = Source(STL_DIR)
    bone_id = {b: i for i, b in enumerate(cfg.BONES)}
    nb = len(cfg.BONES)

    print('axes')
    axes_src = fit_axes(cfg, src, ROOT / 'joints' / f'{joint}.axes.json', refit)
    frame = Frame(axes_src[cfg.ORIGIN_AXIS]['point'])

    print('bones')
    bones, samples = {}, {i: [] for i in range(nb)}
    for name, fma, bone, faces in cfg.BONE_MESHES:
        full, shown = load_bone(src, fma, faces)
        bones[name] = (shown, bone_id[bone])
        samples[bone_id[bone]].append(sample(full, 40000))
    trees = {b: cKDTree(np.vstack(s)) for b, s in samples.items() if s}

    print('muscles')
    muscles, allowed = {}, {}
    for name, fma, attach in cfg.MUSCLES:
        m = decimate(src.load(fma), cfg.MUSCLE_FACES)
        allowed[name] = [bone_id[b] for b in attach]
        muscles[name] = (m, proximity_weights(m.vertices, m.faces, trees, allowed[name], nb))
    muscles = couple(muscles, allowed)
    for name, (m, W) in muscles.items():
        print(f'  {name:16s} faces {len(m.faces):5d}  mean weights {np.round(W.mean(0), 2)}')

    # ---- geometry binary (viewer frame, quantized) ----
    Vv = {n: frame.points(m.vertices) for n, (m, _) in {**bones, **muscles}.items()}
    allV = np.vstack(list(Vv.values()))
    lo, hi = allV.min(0), allV.max(0)
    scale = (hi - lo) / 65535.0
    geo, meshes = Packer(), []

    def add_mesh(name, kind, faces, extra):
        V = Vv[name]
        F = faces.astype(np.uint16 if len(V) < 65536 else np.uint32)
        ent = {'name': name, 'kind': kind, 'nv': len(V), 'nf': len(F), 'i32': bool(F.dtype == np.uint32)}
        ent['pos'] = geo.add(np.round((V - lo) / scale).astype(np.uint16))
        ent['idx'] = geo.add(F)
        ent.update(extra(geo))
        meshes.append(ent)

    for name, (m, b) in bones.items():
        add_mesh(name, 'bone', m.faces, lambda g, b=b: {'bone': b})
    for name, (m, W) in muscles.items():
        add_mesh(name, 'muscle', m.faces, lambda g, W=W: {'w': g.add(np.round(W * 255).astype(np.uint8))})

    print('fields')
    fld, fields = Packer(), {}
    for bone, opts in cfg.FIELDS.items():
        mesh_name = next(n for n, _, b, _ in cfg.BONE_MESHES if b == bone and n == bone)
        m = bones[mesh_name][0]
        data, ent = sdf_grid(Vv[mesh_name], m.faces, opts)
        ent['bone'] = bone_id[bone]
        ent['off'] = fld.add(data)
        fields[bone] = ent
        print(f'  {bone:8s} dims {ent["dims"]}')

    centers = {n: centerline(Vv[n], W, n in cfg.BULGE, cfg.LENGTH_REF.get(n, n)) for n, (_, W) in muscles.items()}

    manifest = {
        'format': 'kinesy-joint', 'version': 1, 'joint': cfg.NAME, 'units': 'mm', 'source': cfg.SOURCE,
        'quant': {'lo': lo.tolist(), 'scale': scale.tolist()},
        'bones': cfg.BONES,
        'axes': {k: {'point': frame.point(v['point']), 'dir': Frame.direction(v['dir'])}
                 for k, v in axes_src.items() if not k.startswith('_')},
        'meshes': meshes, 'fields': fields, 'centerlines': centers,
    }
    out = ROOT.parent / 'assets' / joint
    out.mkdir(parents=True, exist_ok=True)
    (out / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')))
    for fname, buf in (('geometry.bin.gz', geo.buf), ('fields.bin.gz', fld.buf)):
        (out / fname).write_bytes(gzip.compress(bytes(buf), compresslevel=9, mtime=0))
    print(f'wrote {out}: geometry {len(geo.buf) / 1e6:.2f} MB, fields {len(fld.buf) / 1e6:.2f} MB (before gzip)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('joint')
    ap.add_argument('--refit-axes', action='store_true')
    a = ap.parse_args()
    build(a.joint, a.refit_axes)
