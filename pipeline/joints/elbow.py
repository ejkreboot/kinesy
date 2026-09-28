"""Elbow (right arm): humeroulnar + humeroradial hinge, proximal/distal radioulnar pivot."""

NAME = 'elbow'

# Rig bones, in chain order. Index = bone id used by skin weights and the TS rig.
BONES = ['humerus', 'ulna', 'radius']

# Meshes that ride rigidly on a rig bone: (mesh name, FMA id, rig bone, target faces or None)
BONE_MESHES = [
    ('humerus', 'FMA23130', 'humerus', None),
    ('scapula', 'FMA13395', 'humerus', 9000),
    ('ulna', 'FMA23467', 'ulna', None),
    ('radius', 'FMA23464', 'radius', None),
]

# Muscles: (mesh name, FMA id, bones it may be skinned to)
MUSCLES = [
    ('biceps_lh', 'FMA37686', ['humerus', 'radius']),
    ('biceps_sh', 'FMA37684', ['humerus', 'radius']),
    ('brachialis', 'FMA37668', ['humerus', 'ulna']),
    ('brachioradialis', 'FMA38486', ['humerus', 'radius']),
    ('triceps_long', 'FMA37699', ['humerus', 'ulna']),
    ('triceps_lat', 'FMA37697', ['humerus', 'ulna']),
    ('triceps_med', 'FMA37695', ['humerus', 'ulna']),
    ('anconeus', 'FMA37705', ['humerus', 'ulna']),
    ('pt_hum', 'FMA38560', ['humerus', 'radius']),
    ('pt_uln', 'FMA38562', ['ulna', 'radius']),
    ('pq', 'FMA38454', ['ulna', 'radius']),
    ('supinator', 'FMA38513', ['humerus', 'ulna', 'radius']),
]
MUSCLE_FACES = 7000

# Joint axes. `fit` says how pipeline/lib/axes.py derives them from the bone meshes; the
# frozen result lives in elbow.axes.json (source frame) and is used unless --refit-axes.
AXES = {
    'flexion': {'fit': 'hinge_congruence', 'fixed': 'FMA23130', 'moving': 'FMA23467'},
    'pronation': {'fit': 'pivot_centers', 'fixed': 'FMA23467', 'moving': 'FMA23464'},
}
# Viewer-frame origin sits on this axis.
ORIGIN_AXIS = 'flexion'

# Signed-distance fields for bone collision. `ymax` clips the grid (viewer-frame y, mm) so the
# long humeral shaft doesn't bloat the file; muscles there never reach the bone anyway.
FIELDS = {
    'humerus': {'ymax': 110.0},
    'ulna': {},
    'radius': {},
}

# Muscles that bulge when shortened; supinator and pronator quadratus wrap a bone, so a
# straight origin-insertion distance is meaningless for them.
BULGE = {'biceps_lh', 'biceps_sh', 'brachialis', 'brachioradialis', 'triceps_long',
         'triceps_lat', 'triceps_med', 'pt_hum', 'anconeus'}
# The short-head mesh stops at the shared tendon, so it takes its length from the long head.
LENGTH_REF = {'biceps_sh': 'biceps_lh'}

SOURCE = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP'
