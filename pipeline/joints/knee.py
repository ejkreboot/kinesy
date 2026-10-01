"""Knee (right side): the tibia and fibula, and the patella, on a fixed femur. The muscles crossing the knee
from the pelvis (rectus femoris, sartorius, gracilis, the hamstrings, the iliotibial tract) and to the heel
(gastrocnemius, plantaris) are included; the hip and ankle are not (each joint is shown on its own), so their
far ends ride the femur and the tibia.

The quadriceps meshes run on over the patella and down to the tibia, but there they are tendon, not muscle:
they are cut at the patella's top (clip_muscle), and the tendon is a sheet of its own (tissues): the
quadriceps tendon's expansion over the front of the patella, then the patellar ligament to the tibial
tuberosity."""
import numpy as np
import trimesh

from pipeline.lib.sheets import clip_below, tendon_sheet

NAME = 'knee'

# Rig bones, in chain order. Index = bone id used by skin weights and the TS rig.
BONES = ['femur', 'tibia', 'patella']

_FEM, _TIB, _FIB, _PAT = 'FMA24474', 'FMA24477', 'FMA24480', 'FMA24486'
BONE_MESHES = [
    ('femur', _FEM, 'femur', 16000),
    ('tibia', [_TIB, _FIB], 'tibia', 20000),   # the fibula rides with the tibia
    ('patella', _PAT, 'patella', None),
]

_FT, _FP = ['femur', 'tibia'], ['femur', 'patella']
# Muscles: (mesh name, FMA id, bones it may be skinned to)
MUSCLES = [
    ('rectus_fem', 'FMA38928', _FP),
    ('vastus_lat', 'FMA38930', _FP),
    ('vastus_med', 'FMA38932', _FP),
    ('vastus_int', 'FMA38934', _FP),
    ('biceps_fem', 'FMA45888', _FT),
    ('biceps_fem_sh', 'FMA45891', _FT),
    ('semiten', 'FMA22358', _FT),
    ('semimem', 'FMA22448', _FT),
    ('sartorius', 'FMA22354', _FT),
    ('gracilis', 'FMA43883', _FT),
    ('it_tract', 'FMA58776', _FT),
    ('gastroc_med', 'FMA45957', _FT),
    ('gastroc_lat', 'FMA45960', _FT),
    ('plantaris', 'FMA22560', _FT),
    ('popliteus', 'FMA22591', _FT),
]
MUSCLE_FACES = 7000

_QUADRICEPS = {'rectus_fem', 'vastus_lat', 'vastus_med', 'vastus_int'}


def clip_muscle(name, m, src):
    """The quadriceps cut 0.5 mm above the patella's top: their tendon is the sheet below (tissues)."""
    return clip_below(m, src.load(_PAT).bounds[1][2] + 0.5) if name in _QUADRICEPS else m


# the patellar ligament: lying on the tibia from the top of the tibial tuberosity down to its insertion
# (source frame; viewer y −56 and [−7, −68]: kept short, the user's call)
_TUBEROSITY_TOP_Z = 378.6
_LIGAMENT_INSERTION = np.array([-81.2, -102.0, 366.6])


def tissues(src, bone_id):
    """The quadriceps' aponeurosis: from the muscles' cut over the patella and the femoral condyles beside it, then the
    patellar ligament. Three segments: over the patella it rides the patella; its arms, beyond the patella's
    outline (the retinacula, over the condyles), the femur, fully 15 mm out; its stem blends to the tibia."""
    pat = src.load(_PAT)
    cut = pat.bounds[1][2] + 0.5
    quads = trimesh.util.concatenate([clip_muscle(n, src.load(f), src) for n, f, _ in MUSCLES if n in _QUADRICEPS])
    # set back 2 mm so the front of the patella shows through it; the ligament 2.5 mm thick
    mesh, s, beyond = tendon_sheet(pat, src.load(_TIB), src.load(_FEM), quads, cut, _LIGAMENT_INSERTION, _TUBEROSITY_TOP_Z,
                                   band=2.5, back=2.0)
    a = np.clip(beyond / 15.0, 0, 1)
    a = a * a * (3 - 2 * a)
    W = np.zeros((len(mesh.vertices), len(BONES)))
    W[:, bone_id['patella']] = (1 - s) * (1 - a)
    W[:, bone_id['femur']] = (1 - s) * a
    W[:, bone_id['tibia']] = s
    return [('patellar_lig', mesh, W)]


# Joint axes (see pipeline/lib/axes.py), source frame (x = subject's left, y = posterior, z = superior);
# `toward` sets the sign of positive rotation. Flexion about the transepicondylar axis; tibial rotation
# about the tibia's long axis (plateau centre to ankle centre); the patella turning, as it glides down the
# trochlea and onto the condyles, about a parallel axis 10 mm in front of it. Fitted against the femur's
# distance field: with the rig's 0.7° of patella per degree of flexion it stays 1.7–3.3 mm off the femur, on
# the trochlea and then the condyles' distal ends, never in the notch behind them. About the flexion axis
# itself it lifted 13 mm off by 140°. The fit also weighs the patellar ligament's free length (apex to the top
# of the tibial tuberosity), which can't be held: it grows from 22 to 58 mm. These meshes' tibia sits too far
# from the flexion axis for both (holding the ligament put the patella in the notch).
AXES = {
    'flexion': {'fit': 'anatomical', 'center': 'femoral_epicondyles', 'fixed': _FEM, 'moving': _TIB,
                'dir': [1, 0, 0], 'toward': [0, 1, 0]},                                  # ankle moves posterior
    'rotation': {'fit': 'anatomical', 'center': 'tibial_plateau', 'fixed': _FEM, 'moving': _TIB,
                 'dir': 'tibial_shaft', 'tip': 'lateral', 'toward': [0, -1, 0]},          # internal
    'patella': {'fit': 'anatomical', 'center': 'femoral_epicondyles', 'offset': [0, -10, 0], 'fixed': _FEM,
                'moving': _PAT, 'dir': [1, 0, 0], 'toward': [0, 1, 0]},                  # apex moves posterior
}
# Viewer-frame origin sits on this axis.
ORIGIN_AXIS = 'flexion'

# Signed-distance fields for bone collision (voxel `h` mm).
FIELDS = {
    'femur': {'h': 2.0},
    'tibia': {'h': 2.0},
    'patella': {'h': 1.5},
}

BULGE = {'rectus_fem', 'biceps_fem', 'biceps_fem_sh', 'semiten', 'semimem', 'sartorius', 'gracilis',
         'gastroc_med', 'gastroc_lat', 'plantaris', 'popliteus'}
LENGTH_REF = {}

SOURCE = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP'
