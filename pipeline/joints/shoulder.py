"""Shoulder complex (right side): sternoclavicular, acromioclavicular / scapulothoracic, and
glenohumeral joints. Biceps and the long head of triceps are included because they cross the
shoulder; the forearm is not (each joint is shown on its own)."""

NAME = 'shoulder'

# Rig bones, in chain order. Index = bone id used by skin weights and the TS rig.
BONES = ['thorax', 'clavicle', 'scapula', 'humerus']

# Both sides of the rib cage, for context (the 1st and 7th right costal cartilage meshes cross the midline anyway).
RIBS = ['FMA7857', 'FMA7882', 'FMA7909', 'FMA7957', 'FMA8066', 'FMA8175', 'FMA8229', 'FMA8283',
        'FMA8364', 'FMA8445', 'FMA8531', 'FMA8533',
        'FMA7987', 'FMA8012', 'FMA8039', 'FMA8148', 'FMA8093', 'FMA8202', 'FMA8256', 'FMA8310',
        'FMA8391', 'FMA8472', 'FMA8532', 'FMA8534']
COSTAL_CARTILAGES = ['FMA7875', 'FMA7886', 'FMA7913', 'FMA7976', 'FMA8070', 'FMA8194', 'FMA8248', 'BP28',
                     'FMA8005', 'FMA8031', 'FMA8058', 'FMA8167', 'FMA8112', 'FMA8221', 'FMA8275', 'BP24']
STERNUM = ['FMA7486', 'FMA7487', 'FMA7488']
VERTEBRAE = ['FMA12521', 'FMA12522', 'FMA12523', 'FMA12524', 'FMA12525',  # C3-C7
             'FMA9165', 'FMA9187', 'FMA9209', 'FMA9248', 'FMA9922', 'FMA9945', 'FMA9968', 'FMA9991',
             'FMA10014', 'FMA10037', 'FMA10059', 'FMA10081']  # T1-T12

# Meshes that ride rigidly on a rig bone: (mesh name, FMA id or ids to merge, rig bone, target faces or None)
BONE_MESHES = [
    ('thorax', RIBS + COSTAL_CARTILAGES + STERNUM + VERTEBRAE, 'thorax', 48000),
    ('clavicle', 'FMA13322', 'clavicle', None),
    ('scapula', 'FMA13395', 'scapula', 16000),
    ('humerus', 'FMA23130', 'humerus', None),
]

# Muscles: (mesh name, FMA id, bones it may be skinned to)
MUSCLES = [
    ('deltoid_ant', 'FMA34680', ['clavicle', 'humerus']),
    ('deltoid_mid', 'FMA34682', ['scapula', 'humerus']),
    ('deltoid_post', 'FMA34684', ['scapula', 'humerus']),
    ('supraspinatus', 'FMA32544', ['scapula', 'humerus']),
    ('infraspinatus', 'FMA32547', ['scapula', 'humerus']),
    ('teres_minor', 'FMA32553', ['scapula', 'humerus']),
    ('subscapularis', 'FMA13414', ['scapula', 'humerus']),
    ('teres_major', 'FMA32551', ['scapula', 'humerus']),
    ('coracobrachialis', 'FMA37665', ['scapula', 'humerus']),
    ('pec_clav', 'FMA34690', ['clavicle', 'humerus']),
    ('pec_stern', 'FMA79979', ['thorax', 'humerus']),
    ('pec_abd', 'FMA45874', ['thorax', 'humerus']),
    ('lat', 'FMA13358', ['thorax', 'scapula', 'humerus']),
    ('biceps_lh', 'FMA37686', ['scapula', 'humerus']),
    ('biceps_sh', 'FMA37684', ['scapula', 'humerus']),
    ('triceps_long', 'FMA37699', ['scapula', 'humerus']),
    ('trap_upper', 'FMA33586', ['thorax', 'clavicle']),
    ('trap_middle', 'FMA33584', ['thorax', 'scapula']),
    ('trap_lower', 'FMA33581', ['thorax', 'scapula']),
    ('levator', 'FMA32540', ['thorax', 'scapula']),
    ('rhomboid_major', 'FMA13381', ['thorax', 'scapula']),
    ('rhomboid_minor', 'FMA13383', ['thorax', 'scapula']),
    ('serratus', 'FMA13398', ['thorax', 'scapula']),
    ('pec_minor', 'FMA13375', ['thorax', 'scapula']),
]
MUSCLE_FACES = 7000

# Joint axes (see pipeline/lib/axes.py). Directions are in the source frame
# (x = subject's left, y = posterior, z = superior); `toward` sets the sign of positive rotation.
_HUM, _SCAP, _CLAV = 'FMA23130', 'FMA13395', 'FMA13322'
_GH = {'fit': 'anatomical', 'center': 'humeral_head', 'fixed': _SCAP, 'moving': _HUM}
AXES = {
    # glenohumeral, expressed in trunk directions (the humerus is posed relative to the thorax)
    'flexion': {**_GH, 'dir': [1, 0, 0], 'toward': [0, -1, 0]},     # tip moves anterior
    'abduction': {**_GH, 'dir': [0, 1, 0], 'toward': [-1, 0, 0]},   # tip moves lateral
    'rotation': {**_GH, 'dir': 'humeral_shaft', 'tip': 'lateral_epicondyle', 'toward': [0, -1, 0]},  # internal
    # sternoclavicular
    'elevation': {'fit': 'anatomical', 'center': 'clavicle_medial_end', 'moving': _CLAV,
                  'dir': [0, 1, 0], 'tip': 'lateral', 'toward': [0, 0, 1]},
    'protraction': {'fit': 'anatomical', 'center': 'clavicle_medial_end', 'moving': _CLAV,
                    'dir': [0, 0, 1], 'tip': 'lateral', 'toward': [0, -1, 0]},
    # scapular upward rotation: normal to the scapular plane, through the acromioclavicular joint
    'upwardRotation': {'fit': 'anatomical', 'center': 'acromioclavicular', 'fixed': _CLAV, 'moving': _SCAP,
                        'dir': 'plane_normal', 'toward': [-1, 0, 0]},   # inferior angle moves lateral
}
# Viewer-frame origin sits on this axis.
ORIGIN_AXIS = 'flexion'

# Signed-distance fields for bone collision. `h` is the voxel size (mm, default 1.5); `xmin`..`zmax`
# clip the grid (viewer frame, mm). Only the right half of the thorax meets these muscles.
FIELDS = {
    'thorax': {'h': 3.0, 'xmax': 230.0},
    'clavicle': {},
    'scapula': {},
    'humerus': {'h': 2.0},
}

# Muscles that bulge when shortened. Sheets and wrapping muscles (trapezius, serratus, rhomboids,
# latissimus, subscapularis) are left out: a straight end-to-end distance says little about them.
BULGE = {'deltoid_ant', 'deltoid_mid', 'deltoid_post', 'supraspinatus', 'infraspinatus', 'teres_minor',
         'teres_major', 'coracobrachialis', 'pec_clav', 'biceps_lh', 'biceps_sh', 'triceps_long'}
LENGTH_REF = {'biceps_sh': 'biceps_lh'}

SOURCE = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP'
