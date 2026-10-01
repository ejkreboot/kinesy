"""Neck: the head on the cervical spine, both sides. The atlanto-occipital and atlanto-axial joints and the
joints between C2 and T1 each move a little; together they nod, bend and turn the head. The base (T1–T6, the
sternum, the first two ribs, both clavicles and scapulae) is fixed: the muscles from the neck to the trunk and
shoulder girdle end on it. The jaw is not in this model: the mandible rides with the skull."""
import numpy as np

NAME = 'neck'

VERTS = ['c7', 'c6', 'c5', 'c4', 'c3', 'c2', 'c1']
# Rig bones, in chain order (each on the one before). Index = bone id used by skin weights and the TS rig.
BONES = ['thorax'] + VERTS + ['head']

_C = {'c1': 'FMA12519', 'c2': 'FMA12520', 'c3': 'FMA12521', 'c4': 'FMA12522', 'c5': 'FMA12523', 'c6': 'FMA12524',
      'c7': 'FMA12525'}
_T = ['FMA9165', 'FMA9187', 'FMA9209', 'FMA9248', 'FMA9922', 'FMA9945']   # T1-T6
T1 = _T[0]
_STERNUM = ['FMA7486', 'FMA7487']                                          # manubrium, body
_RIBS = ['FMA7857', 'FMA7882', 'FMA7987', 'FMA8012']                       # first and second, right and left
_GIRDLE = ['FMA13322', 'FMA13323', 'FMA13395', 'FMA13396']                 # clavicles, scapulae
_CRANIUM = ['FMA52734', 'FMA52735', 'FMA52736', 'FMA52740', 'FMA52788', 'FMA52789', 'FMA52738', 'FMA52739']
_FACE = ['FMA52892', 'FMA52893', 'FMA53649', 'FMA53650', 'FMA53647', 'FMA53648', 'FMA53645', 'FMA53646',
         'FMA53655', 'FMA53656', 'FMA54737', 'FMA54738', 'FMA9710']
_TEETH = ['FMA55680', 'FMA55681', 'FMA55682', 'FMA55683', 'FMA55798', 'FMA55799', 'FMA55688', 'FMA55689',
          'FMA55690', 'FMA55691', 'FMA55697', 'FMA55698', 'FMA55699', 'FMA55700',
          'FMA57140', 'FMA57141', 'FMA57142', 'FMA57143', 'FMA55686', 'FMA55687', 'FMA55692', 'FMA55693',
          'FMA55694', 'FMA55695', 'FMA55703', 'FMA55704', 'FMA55705', 'FMA55706']
OCCIPITAL, MANDIBLE = 'FMA52735', 'FMA52748'

BONE_MESHES = [
    ('thorax', _T + _STERNUM + _RIBS + _GIRDLE, 'thorax', 40000),
] + [(v, _C[v], v, 6000) for v in VERTS] + [
    ('head', _CRANIUM + _FACE + [MANDIBLE] + _TEETH, 'head', 50000),
]

_HEAD_C = ['head', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']
_ALL = BONES
# Muscles: (mesh name, FMA ids right and left, bones it may be skinned to)
_SIDES = {
    'scm': ('FMA13408', 'FMA13409', ['head', 'thorax']),
    'trap_upper': ('FMA33586', 'FMA33587', _ALL),
    'splenius_cap': ('FMA22728', 'FMA22729', _ALL),
    'splenius_cerv': ('FMA22726', 'FMA22727', ['thorax', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2', 'c1']),
    'semispinalis_cap': ('FMA22876', 'FMA22877', _ALL),
    'semispinalis_cerv': ('FMA22874', 'FMA22875', ['thorax', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2']),
    'longissimus_cap': ('FMA22754', 'FMA22756', _ALL),
    'rcp_major': ('FMA32530', 'FMA32531', ['head', 'c1', 'c2']),
    'rcp_minor': ('FMA32532', 'FMA32533', ['head', 'c1']),
    'obl_sup': ('FMA32534', 'FMA32535', ['head', 'c1']),
    'obl_inf': ('FMA32536', 'FMA32537', ['c1', 'c2']),
    'rca': ('FMA46313', 'FMA46314', ['head', 'c1']),
    'rcl': ('FMA46317', 'FMA46318', ['head', 'c1']),
    'longus_cap': ('FMA46309', 'FMA46310', ['head', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']),
    'longus_colli_sup': ('FMA46283', 'FMA46284', ['c1', 'c2', 'c3', 'c4', 'c5']),
    'longus_colli_vert': ('FMA46285', 'FMA46286', ['thorax', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2']),
    'longus_colli_inf': ('FMA46287', 'FMA46288', ['thorax', 'c7', 'c6', 'c5']),
    'scalene_ant': ('FMA13392', 'FMA13393', ['thorax', 'c7', 'c6', 'c5', 'c4', 'c3']),
    'scalene_mid': ('FMA13390', 'FMA13391', ['thorax', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2']),
    'scalene_post': ('FMA13388', 'FMA13389', ['thorax', 'c7', 'c6', 'c5', 'c4']),
    'levator': ('FMA32540', 'FMA32541', ['thorax', 'c4', 'c3', 'c2', 'c1']),
}
MUSCLES = [(f'{n}_{s}', fma[k], bones) for n, (*fma, bones) in _SIDES.items() for k, s in enumerate('rl')]
MUSCLE_FACES = 6000



def fit_axes(src):
    """Each level's centre and its flexion, lateral flexion and rotation axes (lib/spine.py)."""
    from pipeline.lib import spine
    out, info = spine.fit(src, _C, T1, src.load(OCCIPITAL))
    for line in info:
        print('   ', line)
    return out


AXES = {}
ORIGIN_AXIS = 'c4c5_flex'

FIELDS = {
    'thorax': {'h': 2.0},
    **{v: {'h': 1.0} for v in VERTS},
    'head': {'h': 2.0},
}

BULGE = {f'{n}_{s}' for n in ('scm', 'rcp_major', 'rcp_minor', 'obl_sup', 'obl_inf', 'rca', 'rcl', 'scalene_ant',
                               'scalene_mid', 'scalene_post', 'levator') for s in 'rl'}
LENGTH_REF = {}

SOURCE = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP'
