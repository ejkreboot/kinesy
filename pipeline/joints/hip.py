"""Hip (right side): the femur on a fixed pelvis. The muscles crossing the knee (rectus femoris, sartorius,
gracilis, the hamstrings, the iliotibial tract) are included because they cross the hip; the knee and the
leg below it are not (each joint is shown on its own), so their distal ends ride the femur."""

NAME = 'hip'

# Rig bones, in chain order. Index = bone id used by skin weights and the TS rig.
BONES = ['pelvis', 'femur']

# The pelvis rides as one: both hip bones (the left for context), the sacrum, and the lumbar spine psoas
# major arises from.
LUMBAR = ['FMA13072', 'FMA13073', 'FMA13074', 'FMA13075', 'FMA13076']  # L1-L5
BONE_MESHES = [
    ('pelvis', ['FMA16586', 'FMA16587', 'FMA16202'] + LUMBAR, 'pelvis', 40000),
    ('femur', 'FMA24474', 'femur', 16000),
]

_PF = ['pelvis', 'femur']
# Muscles: (mesh name, FMA id, bones it may be skinned to)
MUSCLES = [
    ('glut_max', 'FMA22328', _PF),
    ('glut_med', 'FMA22330', _PF),
    ('glut_min', 'FMA22332', _PF),
    ('tfl', 'FMA22425', _PF),
    ('it_tract', 'FMA58776', _PF),
    ('piriformis', 'FMA22340', _PF),
    ('gem_sup', 'FMA22334', _PF),
    ('obt_int', 'FMA22324', _PF),
    ('gem_inf', 'FMA22336', _PF),
    ('quad_fem', 'FMA22338', _PF),
    ('obt_ext', 'FMA22326', _PF),
    ('iliacus', 'FMA22322', _PF),
    ('psoas', 'FMA22342', _PF),
    ('pectineus', 'FMA22450', _PF),
    ('add_longus', 'FMA22456', _PF),
    ('add_brevis', 'FMA22452', _PF),
    ('add_magnus', 'FMA22459', _PF),
    ('add_minimus', 'FMA43886', _PF),
    ('gracilis', 'FMA43883', _PF),
    ('sartorius', 'FMA22354', _PF),
    ('rectus_fem', 'FMA38928', _PF),
    ('biceps_fem', 'FMA45888', _PF),
    ('semiten', 'FMA22358', _PF),
    ('semimem', 'FMA22448', _PF),
]
MUSCLE_FACES = 7000

# Joint axes (see pipeline/lib/axes.py), source frame (x = subject's left, y = posterior, z = superior);
# `toward` sets the sign of positive rotation. A ball joint posed in pelvis directions about the
# femoral head's centre, and its long axis (head centre to between the condyles) for rotation.
_HIPB, _FEM = 'FMA16586', 'FMA24474'
_HIP = {'fit': 'anatomical', 'center': 'femoral_head', 'fixed': _HIPB, 'moving': _FEM}
AXES = {
    'flexion': {**_HIP, 'dir': [1, 0, 0], 'toward': [0, -1, 0]},      # knee moves anterior
    'abduction': {**_HIP, 'dir': [0, 1, 0], 'toward': [-1, 0, 0]},    # knee moves lateral
    'rotation': {**_HIP, 'dir': 'femoral_shaft', 'tip': 'lateral_epicondyle', 'toward': [0, -1, 0]},  # internal
}
# Viewer-frame origin sits on this axis.
ORIGIN_AXIS = 'flexion'

# Signed-distance fields for bone collision (voxel `h` mm; `xmin`..`zmax` clip the grid, viewer frame).
FIELDS = {
    'pelvis': {'h': 2.0},
    'femur': {'h': 2.0},
}

# Muscles that bulge when shortened: the fusiform and strap muscles. Sheets and fans that wrap (the
# gluteals, adductor magnus, the iliotibial tract) are left out.
BULGE = {'tfl', 'piriformis', 'quad_fem', 'iliacus', 'psoas', 'pectineus', 'add_longus', 'add_brevis',
         'gracilis', 'sartorius', 'rectus_fem', 'biceps_fem', 'semiten', 'semimem'}
LENGTH_REF = {}

SOURCE = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP'
