"""Jaw (both temporomandibular joints): the mandible, with the lower teeth, on a fixed skull. One mandible
hinges and glides at two joints, so both sides' muscles are included: the muscles of mastication (temporalis,
masseter, the pterygoids) and the suprahyoids that act on the mandible (digastric, mylohyoid, geniohyoid; the
digastric's posterior belly, from the skull to the hyoid, with it). The hyoid is held by the infrahyoids, as they
hold it when the suprahyoids open the jaw, but drops and moves back a little as the jaw opens wide. Stylohyoid and
the neck are not in this model: they don't cross the jaw's joints."""

import numpy as np

NAME = 'jaw'

# Rig bones, in chain order. Index = bone id used by skin weights and the TS rig.
BONES = ['skull', 'mandible', 'hyoid']

_CRANIUM = ['FMA52734', 'FMA52735', 'FMA52736', 'FMA52740', 'FMA52788', 'FMA52789',   # frontal, occipital, sphenoid, ethmoid, parietals
            'FMA52738', 'FMA52739']                                                   # temporals
_FACE = ['FMA52892', 'FMA52893', 'FMA53649', 'FMA53650', 'FMA53647', 'FMA53648',     # zygomatics, maxillae, nasals
         'FMA53645', 'FMA53646', 'FMA53655', 'FMA53656', 'FMA54737', 'FMA54738',      # lacrimals, palatines, inferior conchae
         'FMA9710']                                                                   # vomer
UPPER_TEETH = ['FMA55680', 'FMA55681', 'FMA55682', 'FMA55683', 'FMA55798', 'FMA55799',
               'FMA55688', 'FMA55689', 'FMA55690', 'FMA55691', 'FMA55697', 'FMA55698', 'FMA55699', 'FMA55700']
LOWER_TEETH = ['FMA57140', 'FMA57141', 'FMA57142', 'FMA57143', 'FMA55686', 'FMA55687',
               'FMA55692', 'FMA55693', 'FMA55694', 'FMA55695', 'FMA55703', 'FMA55704', 'FMA55705', 'FMA55706']
MANDIBLE, HYOID = 'FMA52748', 'FMA52749'
RIGHT_TEMPORAL, LEFT_TEMPORAL = 'FMA52738', 'FMA52739'

BONE_MESHES = [
    ('skull', _CRANIUM + _FACE + UPPER_TEETH, 'skull', 60000),
    ('mandible', [MANDIBLE] + LOWER_TEETH, 'mandible', 16000),
    ('hyoid', HYOID, 'hyoid', 3000),
]

_SM, _MH, _SH = ['skull', 'mandible'], ['mandible', 'hyoid'], ['skull', 'hyoid']
# Muscles: (mesh name, FMA id, bones it may be skinned to); _r the subject's right, _l the left
_SIDES = {
    'temporalis': ('FMA49007', 'FMA49008', _SM),
    # BodyParts3D's masseter parts are labelled the other way round: its "deep part" is the large sheet from the
    # zygomatic process of the maxilla and the front of the arch to the angle, lying outside the other where
    # they overlap (the superficial part); its "superficial part" is the smaller one behind and beneath it, from
    # the back of the arch to the upper ramus (the deep part)
    'masseter_sup': ('FMA49004', 'FMA49005', _SM),
    'masseter_deep': ('FMA49001', 'FMA49002', _SM),
    'med_ptery': ('FMA49012', 'FMA49013', _SM),
    'lat_ptery_sup': ('FMA49024', 'FMA49025', _SM),
    'lat_ptery_inf': ('FMA49022', 'FMA49023', _SM),
    'digastric_ant': ('FMA46304', 'FMA46305', _MH),
    'digastric_post': ('FMA46306', 'FMA46307', _SH),
    'mylohyoid': ('FMA46321', 'FMA46322', _MH),
    'geniohyoid': ('FMA46326', 'FMA46327', _MH),
}
MUSCLES = [(f'{n}_{s}', fma[k], bones) for n, (*fma, bones) in _SIDES.items() for k, s in enumerate('rl')]
MUSCLE_FACES = 7000



def fit_axes(src):
    """The mandible's axes (lib/tmj.py): the hinge through both condyles' centres, the swing and roll axes through
    their midpoint, and the glide's directions; with the condylar path and the teeth's guidance as tables
    (`_tmj`, copied into src/joints/jaw/rig.ts)."""
    import trimesh
    from pipeline.lib import tmj
    man = src.load(MANDIBLE)
    cR, cL = tmj.condyle_centres(man)
    kin = tmj.Kinematics(cR, cL)
    fossa = trimesh.util.concatenate([src.load(f) for f in (RIGHT_TEMPORAL, LEFT_TEMPORAL, 'FMA52736')])
    ts, drops = tmj.condylar_path(kin, man, fossa)
    drop = lambda t: float(np.interp(t, ts, drops))
    lower = trimesh.util.concatenate([src.load(f) for f in LOWER_TEETH])
    upper = trimesh.util.concatenate([src.load(f) for f in UPPER_TEETH])
    glides = np.arange(0, 10.01, tmj.STEP)
    lateral = np.arange(-12, 12.01, tmj.STEP)
    prot, lat = tmj.guidance(kin, lower, upper, drop, glides, lateral)
    # the lower incisors' tip (between the central incisors' edges), to read opening and deviation from
    inc = trimesh.util.concatenate([src.load(f) for f in LOWER_TEETH[2:4]])
    tip = inc.vertices[inc.vertices[:, 2] > inc.vertices[:, 2].max() - 1.5].mean(0)
    up_inc = trimesh.util.concatenate([src.load(f) for f in UPPER_TEETH[1:3]])
    up_tip = up_inc.vertices[up_inc.vertices[:, 2] < up_inc.vertices[:, 2].min() + 1.5].mean(0)
    mid = kin.mid.tolist()
    return {
        'hinge': {'point': mid, 'dir': kin.hinge.tolist()},
        'swing': {'point': mid, 'dir': kin.up.tolist()},
        'roll': {'point': mid, 'dir': kin.forward.tolist()},
        'glideForward': {'point': mid, 'dir': tmj.FORWARD.tolist()},
        'glideDown': {'point': mid, 'dir': tmj.DOWN.tolist()},
        # the hyoid's own slides as the jaw opens wide (src/joints/jaw/rig.ts)
        'hyoidBack': {'point': mid, 'dir': (-tmj.FORWARD).tolist()},
        'hyoidDown': {'point': mid, 'dir': tmj.DOWN.tolist()},
        '_tmj': {'condyles': [cR.tolist(), cL.tolist()], 'width': kin.w,
                 'glide': ts.round(2).tolist(), 'drop': np.round(drops, 3).tolist(),
                 'protrusion': glides.round(2).tolist(), 'incisal': np.round(prot, 2).tolist(),
                 'lateral': lateral.round(2).tolist(), 'canine': np.round(lat, 2).tolist(),
                 'lowerIncisor': tip.tolist(), 'upperIncisor': up_tip.tolist()},
    }


AXES = {}
ORIGIN_AXIS = 'hinge'

FIELDS = {
    'skull': {'h': 2.0},
    'mandible': {'h': 1.5},
    'hyoid': {'h': 1.0},
}

BULGE = {f'{n}_{s}' for n in ('masseter_sup', 'masseter_deep', 'med_ptery', 'lat_ptery_sup', 'lat_ptery_inf',
                               'digastric_ant', 'geniohyoid') for s in 'rl'}
LENGTH_REF = {}

SOURCE = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP'
