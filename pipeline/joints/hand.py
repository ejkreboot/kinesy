"""Wrist and hand (right): radiocarpal/midcarpal wrist, thumb carpometacarpal, and the
metacarpophalangeal and interphalangeal joints of the thumb and fingers. The forearm is the
fixed base; forearm muscles are included because their tendons cross the wrist and digits."""

NAME = 'hand'

FINGERS = ['index', 'middle', 'ring', 'little']

# Rig bones, in chain order. Index = bone id used by skin weights and the TS rig.
BONES = (['forearm', 'hand', 'thumb_mc', 'thumb_pp', 'thumb_dp']
         + [f'{f}_{p}' for f in FINGERS for p in ('pp', 'mp', 'dp')])

CARPALS = ['FMA24435', 'FMA24437', 'FMA24439', 'FMA24441',   # scaphoid, lunate, triquetrum, pisiform
           'FMA24443', 'FMA23725', 'FMA24446', 'FMA24448']   # trapezium, trapezoid, capitate, hamate
METACARPALS = {'index': 'FMA24466', 'middle': 'FMA24468', 'ring': 'FMA24470', 'little': 'FMA24472'}
PHALANGES = {
    'thumb': {'pp': 'FMA24450', 'dp': 'FMA24459'},
    'index': {'pp': 'FMA24451', 'mp': 'FMA24455', 'dp': 'FMA24460'},
    'middle': {'pp': 'FMA24452', 'mp': 'FMA24456', 'dp': 'FMA24461'},
    'ring': {'pp': 'FMA24453', 'mp': 'FMA24457', 'dp': 'FMA24462'},
    'little': {'pp': 'FMA24454', 'mp': 'FMA24458', 'dp': 'FMA24463'},
}
THUMB_MC = 'FMA24464'
RADIUS, ULNA = 'FMA23464', 'FMA23467'

# Meshes that ride rigidly on a rig bone: (mesh name, FMA id or ids to merge, rig bone, target faces or None)
BONE_MESHES = (
    [('forearm', [RADIUS, ULNA], 'forearm', None),
     ('hand', CARPALS + list(METACARPALS.values()), 'hand', None),
     ('retinaculum', 'FMA40120', 'hand', 2000),
     ('thumb_mc', THUMB_MC, 'thumb_mc', None)]
    + [(f'{d}_{p}', fma, f'{d}_{p}', None) for d, ph in PHALANGES.items() for p, fma in ph.items()]
)

_ALL_DIGITS = [b for b in BONES if b.startswith(tuple(FINGERS))]
_THUMB = ['thumb_mc', 'thumb_pp', 'thumb_dp']
_FIN = ['forearm', 'hand']

# Muscles: (mesh name, FMA id, bones it may be skinned to)
MUSCLES = [
    # wrist flexors / extensors
    ('fcr', 'FMA38460', _FIN),
    ('pl', 'FMA38463', _FIN + [f'{f}_pp' for f in FINGERS]),  # palmar aponeurosis slips reach the fingers
    ('fcu_hum', 'FMA38617', _FIN),
    ('fcu_uln', 'FMA38619', _FIN),
    ('ecrl', 'FMA38495', _FIN),
    ('ecrb', 'FMA38498', _FIN),
    ('ecu_hum', 'BP45', _FIN),
    ('ecu_uln', 'BP47', _FIN),
    # extrinsic finger flexors / extensors
    ('fds_hu', 'FMA38638', _FIN + _ALL_DIGITS),
    ('fds_rad', 'FMA38640', _FIN + _ALL_DIGITS),
    ('fdp', 'FMA38479', _FIN + _ALL_DIGITS),
    ('ed', 'FMA38501', _FIN + _ALL_DIGITS),
    ('ei', 'FMA38525', _FIN + ['index_pp', 'index_mp', 'index_dp']),
    ('edm', 'FMA38504', _FIN + ['little_pp', 'little_mp', 'little_dp']),
    # extrinsic thumb muscles
    ('fpl', 'FMA38482', _FIN + _THUMB),
    ('apl', 'FMA38516', _FIN + _THUMB),
    ('epb', 'FMA38519', _FIN + _THUMB),
    ('epl', 'FMA38522', _FIN + _THUMB),
    # thenar
    ('apb', 'FMA37386', ['hand'] + _THUMB),
    ('fpb_sup', 'FMA65198', ['hand'] + _THUMB),
    ('fpb_deep', 'FMA46110', ['hand'] + _THUMB),
    ('op', 'FMA37390', ['hand'] + _THUMB),
    ('add_obl', 'FMA46121', ['hand'] + _THUMB),
    ('add_tr', 'FMA46123', ['hand'] + _THUMB),
    # hypothenar
    ('adm', 'FMA37396', ['hand', 'little_pp']),
    ('fdm', 'FMA37398', ['hand', 'little_pp']),
    ('odm', 'FMA37400', ['hand']),
    # intrinsics of the fingers
    ('lumbricals', 'FMA42398', ['hand'] + _ALL_DIGITS),
    ('dorsal_io', 'FMA42404', ['hand'] + _ALL_DIGITS + ['thumb_mc']),
    ('palmar_io', 'FMA42402', ['hand'] + _ALL_DIGITS),
]
MUSCLE_FACES = 7000
# Multi-tendon muscles need more faces so each slip keeps its shape.
MUSCLE_FACES_BY_NAME = {'fdp': 14000, 'fds_hu': 12000, 'fds_rad': 9000, 'ed': 14000,
                        'lumbricals': 9000, 'dorsal_io': 12000, 'palmar_io': 9000}

# Remove stray fragments (BodyParts3D muscle meshes carry many tiny shells): keep components
# with at least this fraction of the largest component's faces.
MIN_COMPONENT_FRAC = 0.02

# Joint axes come from fit_axes() below (the digits share one palm frame), not from AXES.
AXES = {}
ORIGIN_AXIS = 'wristFlexion'


def fit_axes(src):
    """All hand axes (source frame): {name: {point, dir, rest}}. See pipeline/lib/digits.py."""
    import numpy as np
    from pipeline.lib.digits import _sphere, flexor_side, hinge, long_axis, ortho, unit

    L = src.load
    fdp, fpl = L('FMA38479'), L('FMA38482')
    mc = {f: L(i) for f, i in METACARPALS.items()}
    ph = {d: {p: L(i) for p, i in v.items()} for d, v in PHALANGES.items()}
    capitate, trapezium, mc1 = L('FMA24446'), L('FMA24443'), L(THUMB_MC)

    # palm frame: long axis L (distal), radial R, palmar P
    cap = capitate.vertices.mean(0)
    m3 = mc['middle'].vertices
    head3 = m3[np.dot(m3 - cap, unit(m3.mean(0) - cap)) > np.dot(m3 - cap, unit(m3.mean(0) - cap)).max() - 8].mean(0)
    Lh = unit(head3 - cap)
    R = ortho(mc['index'].vertices.mean(0) - mc['little'].vertices.mean(0), Lh)
    P = unit(np.cross(Lh, R))
    palm = np.vstack([m.vertices for m in mc.values()]).mean(0)
    if np.dot(flexor_side(palm, Lh, fdp, radius=25), P) < 0:
        P = -P

    out = {}

    def put(name, c, d, rest=0.0):
        out[name] = {'point': np.asarray(c).tolist(), 'dir': unit(d).tolist(), 'rest': round(float(rest), 1)}

    # wrist: center in the head of the capitate
    V = capitate.vertices
    t = np.dot(V - cap, Lh)
    c, r = _sphere(V[t < t.min() + 7])
    if not 3 < r < 15:
        c = V[t < t.min() + 3].mean(0) + 4 * Lh
    put('wristFlexion', c, np.cross(Lh, P))        # + palmar (flexion)
    put('wristDeviation', c, np.cross(Lh, -R))     # + ulnar deviation

    # fingers: MCP flexion + abduction, PIP, DIP
    for f in FINGERS:
        c, d, rest = hinge(mc[f], ph[f]['pp'], fdp)
        put(f'{f}Mcp', c, d, rest)
        lb = long_axis(ph[f]['pp'], ph[f]['pp'].vertices.mean(0) + (ph[f]['pp'].vertices.mean(0) - c))
        away = R if f in ('index', 'middle') else -R   # middle: radial is positive
        put(f'{f}Abd', c, np.cross(lb, ortho(away, lb)))
        c, d, rest = hinge(ph[f]['pp'], ph[f]['mp'], fdp)
        put(f'{f}Pip', c, d, rest)
        c, d, rest = hinge(ph[f]['mp'], ph[f]['dp'], fdp)
        put(f'{f}Dip', c, d, rest)

    # thumb CMC: center at the saddle contact; axes in the thumb's own frame
    A = trapezium.vertices
    dd = np.linalg.norm(A[:, None, :] - mc1.vertices[None, ::7, :], axis=2).min(1)
    c = A[dd < dd.min() + 3].mean(0)
    T = long_axis(mc1, mc1.vertices.mean(0) + (mc1.vertices.mean(0) - c))
    put('thumbCmcFlexion', c, np.cross(T, ortho(-R, T)))     # + across the palm (ulnar)
    put('thumbCmcAbduction', c, np.cross(T, ortho(P, T)))    # + away from the palm (palmar)
    pad = flexor_side(mc1.vertices.mean(0), T, fpl)
    d = T if np.dot(np.cross(T, pad), -R) > 0 else -T       # + turns the pad toward the fingers
    put('thumbRotation', c, d)
    c, d, rest = hinge(mc1, ph['thumb']['pp'], fpl)
    put('thumbMcp', c, d, rest)
    c, d, rest = hinge(ph['thumb']['pp'], ph['thumb']['dp'], fpl)
    put('thumbIp', c, d, rest)
    return out


# Signed-distance fields for bone collision (see shoulder.py for the options). The forearm is
# clipped to its distal end, where tendons pass, and padded so the thenar and hypothenar muscles,
# which swing toward it in wrist flexion, lie inside its grid; digits get 1 mm voxels.
# Muscles skinned by position along a digit (skin_chains below): tendons held to the bones by
# pulleys and sheaths, which must ride their own phalanx and bend around each joint. The rest
# (thenar, hypothenar, dorsal interossei, whose bellies fill the palm between the thumb and the
# metacarpals) keep proximity weights: the thumb's oblique CMC plane cuts across the palm.
CHAIN_SKINNED = {'fcr', 'pl', 'fcu_hum', 'fcu_uln', 'ecrl', 'ecrb', 'ecu_hum', 'ecu_uln',
                 'fds_hu', 'fds_rad', 'fdp', 'ed', 'ei', 'edm', 'fpl', 'apl', 'epb', 'epl',
                 'lumbricals', 'palmar_io'}


def skin_chains(src, axes):
    """Bone chains for chain_weights (pipeline/lib/skin.py), source frame: forearm, hand, then
    each digit, with a plane through every joint center normal to the distal bone."""
    import numpy as np
    from pipeline.lib.digits import long_axis, unit

    L = src.load

    def plane(axis_name, bone_fma, half_width):
        c = np.asarray(axes[axis_name]['point'])
        m = L(bone_fma)
        return c, long_axis(m, m.vertices.mean(0) + (m.vertices.mean(0) - c)), half_width

    cap = L('FMA24446').vertices.mean(0)
    mc3 = L(METACARPALS['middle']).vertices.mean(0)
    wrist = (np.asarray(axes['wristFlexion']['point']), unit(mc3 - cap), 8.0)
    root = [('forearm', None), ('hand', wrist)]
    chains = [root + [('thumb_mc', plane('thumbCmcFlexion', THUMB_MC, 6.0)),
                      ('thumb_pp', plane('thumbMcp', PHALANGES['thumb']['pp'], 4.0)),
                      ('thumb_dp', plane('thumbIp', PHALANGES['thumb']['dp'], 3.5))]]
    for f in FINGERS:
        ph = PHALANGES[f]
        chains.append(root + [(f'{f}_pp', plane(f'{f}Mcp', ph['pp'], 5.0)),
                              (f'{f}_mp', plane(f'{f}Pip', ph['mp'], 4.0)),
                              (f'{f}_dp', plane(f'{f}Dip', ph['dp'], 3.5))])
    return chains


FIELDS = {
    'forearm': {'ymax': 70.0, 'pad': 30.0},
    'hand': {'h': 1.0},
    **{b: {'h': 1.0} for b in BONES if b.startswith(('thumb', *FINGERS))},
}

# Muscles that bulge when shortened. The interossei and lumbricals are sets of separate slips,
# so they have no single length.
BULGE = {'fcr', 'pl', 'fcu_hum', 'fcu_uln', 'ecrl', 'ecrb', 'ecu_hum', 'ecu_uln', 'fds_hu', 'fds_rad',
         'fdp', 'ed', 'fpl', 'apl', 'epb', 'epl', 'apb', 'fpb_sup', 'fpb_deep', 'op', 'adm', 'fdm'}
# Tendons wrap the wrist and finger joints, so length is measured along each muscle's centerline.
BULGE_ALONG_PATH = True
# Heads that share a tendon take their length from the main head.
LENGTH_REF = {'fcu_uln': 'fcu_hum', 'ecu_uln': 'ecu_hum', 'fds_rad': 'fds_hu', 'fpb_deep': 'fpb_sup'}

SOURCE = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP'
