"""Character GLB builder (docs/3D.md section 7).

  blender --background --factory-startup --python blender/character/character.py -- [--preview] [--out <glb>]

Builds the rig 'rig', the skinned 'body' (with smile/frown/sleepy/worried morphs), every hair style,
top add-on and accessory, 18 animation clips, and exports public/assets/3d/character.glb.
With --preview it also renders QA images to blender/.previews/character_*.png (preview.py).

Everything is procedural and deterministic: geometry from lofted rings / ellipsoids, skin weights
from analytic joint blends (no heat weighting), poses from a small FK + two-bone IK solver.
Conventions: Blender Z up, character faces -Y, its left side is +X (bones *_l live at +X).
"""
import bpy
import bmesh
import math
import os
import sys
from math import pi, sin, cos, radians
from mathutils import Vector, Matrix, Quaternion, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in ARGS
OUT = os.path.join(ROOT, 'public', 'assets', '3d', 'character.glb')
if '--out' in ARGS:
    OUT = os.path.abspath(ARGS[ARGS.index('--out') + 1])
FPS = 30

V = Vector


def clamp(x, a, b):
    return a if x < a else b if x > b else x


def smoothstep(e0, e1, x):
    if e0 == e1:
        return 1.0 if x >= e1 else 0.0
    t = clamp((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------------------------------------
# scene + materials
# --------------------------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    return sc


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    h = h.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


# default colours = the player look; the runtime clones + recolours these per actor
MAT_DEFS = {
    'm_skin': ('#e3b08d', 0.62),
    'm_hair': ('#3f2a20', 0.72),
    'm_top': ('#a7a3a0', 0.86),
    'm_bottom': ('#3e4f75', 0.84),
    'm_shoes': ('#f3f2ef', 0.6),
    'm_eye': ('#1d1a1d', 0.25),
    'm_eye_white': ('#fbfaf7', 0.3),
    'm_mouth': ('#a2524a', 0.55),
    'm_acc': ('#e2b24c', 0.7),
    'm_acc2': ('#f3f2ef', 0.75),
}
MATS = {}


def make_materials():
    for name, (hx, rough) in MAT_DEFS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = hex_rgba(hx)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = 0.0
        m.diffuse_color = hex_rgba(hx)
        # hair sheets (curtains, fringes) are single layers: render both sides
        m.use_backface_culling = name != 'm_hair'
        MATS[name] = m


# --------------------------------------------------------------------------------------------
# skeleton layout (rest pose, armature space == world space; the rig sits at the origin)
# --------------------------------------------------------------------------------------------
HIP_Z = 0.92          # hips bone head (pelvis) standing
LEG_TOP_Z = 0.90      # thigh head (hip joint)
KNEE_Z = 0.48
ANKLE_Z = 0.085
LEG_X = 0.09
SHOULDER = V((0.17, 0.0, 1.34))
UPPER_LEN, FORE_LEN, HAND_LEN = 0.26, 0.24, 0.11
ARM_DOWN = radians(55)       # A-pose: arm angle below horizontal

HEAD_C = V((0.0, -0.006, 1.604))   # head ellipsoid centre
HEAD_R = (0.146, 0.140, 0.164)     # x, y, z radii (big, friendly 1:6 head)
HS = HEAD_R[0] / 0.128             # hat / feature scale relative to the first head design


def arm_points(side):
    s = 1 if side == 'l' else -1
    d = V((s * cos(ARM_DOWN), 0.0, -sin(ARM_DOWN)))
    sh = V((s * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    el = sh + d * UPPER_LEN
    wr = el + d * FORE_LEN + V((0, -0.022, 0))      # slight forward elbow bend defines the hinge
    wr = el + (wr - el).normalized() * FORE_LEN
    tip = wr + (wr - el).normalized() * HAND_LEN
    return sh, el, wr, tip


BONE_DEFS = {}   # name -> (head, tail, parent)


def define_bones():
    B = BONE_DEFS
    B['root'] = (V((0, 0, 0)), V((0, 0, 0.2)), None)
    B['hips'] = (V((0, 0, HIP_Z)), V((0, 0, 1.02)), 'root')
    B['spine'] = (V((0, 0, 1.02)), V((0, 0, 1.16)), 'hips')
    B['chest'] = (V((0, 0, 1.16)), V((0, 0, 1.37)), 'spine')
    B['neck'] = (V((0, 0.004, 1.37)), V((0, 0.0, 1.47)), 'chest')
    B['head'] = (V((0, 0.0, 1.47)), V((0, 0.0, 1.75)), 'neck')
    for side in ('l', 'r'):
        s = 1 if side == 'l' else -1
        sh, el, wr, tip = arm_points(side)
        B['shoulder_' + side] = (V((s * 0.035, 0.0, 1.33)), V((sh.x - s * 0.01, 0.0, 1.345)), 'chest')
        B['upperarm_' + side] = (sh, el, 'shoulder_' + side)
        B['forearm_' + side] = (el, wr, 'upperarm_' + side)
        B['hand_' + side] = (wr, tip, 'forearm_' + side)
        B['thigh_' + side] = (V((s * LEG_X, 0.0, LEG_TOP_Z)), V((s * LEG_X, -0.014, KNEE_Z)), 'hips')
        B['shin_' + side] = (V((s * LEG_X, -0.014, KNEE_Z)), V((s * LEG_X, 0.0, ANKLE_Z)), 'thigh_' + side)
        B['foot_' + side] = (V((s * LEG_X, 0.0, ANKLE_Z)), V((s * LEG_X, -0.12, 0.02)), 'shin_' + side)


BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
         'shoulder_l', 'upperarm_l', 'forearm_l', 'hand_l',
         'shoulder_r', 'upperarm_r', 'forearm_r', 'hand_r',
         'thigh_l', 'shin_l', 'foot_l', 'thigh_r', 'shin_r', 'foot_r']


def build_rig(coll):
    arm = bpy.data.armatures.new('rig')
    rig = bpy.data.objects.new('rig', arm)
    coll.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = {}
    for name in BONES:
        h, t, p = BONE_DEFS[name]
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = h, t
        eb.use_deform = True
        ebs[name] = eb
    for name in BONES:
        p = BONE_DEFS[name][2]
        if p:
            ebs[name].parent = ebs[p]
            ebs[name].use_connect = False
        # consistent rolls: local Z faces forward (-Y) where possible
        d = (ebs[name].tail - ebs[name].head).normalized()
        ebs[name].align_roll(V((0, -1, 0)) if abs(d.y) < 0.9 else V((0, 0, 1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.display_type = 'STICK'
    return rig


# --------------------------------------------------------------------------------------------
# mesh construction kit
# --------------------------------------------------------------------------------------------
class MB:
    """Accumulates vertices (with bone weights + tags) and faces (with material names)."""

    def __init__(self):
        self.v, self.w, self.tag, self.f, self.fm = [], [], [], [], []

    def vert(self, co, w, tag=None):
        self.v.append(V(co))
        self.w.append(w)
        self.tag.append(tag)
        return len(self.v) - 1

    def face(self, idx, mat):
        self.f.append(tuple(idx))
        self.fm.append(mat)

    def face_out(self, idx, mat, out):
        """Add a face, flipping its winding so the normal points along `out`."""
        p = [self.v[i] for i in idx]
        n = (p[1] - p[0]).cross(p[2] - p[0])
        if len(p) == 4:
            n += (p[2] - p[0]).cross(p[3] - p[0])
        if n.dot(out) < 0:
            idx = list(reversed(idx))
        self.face(idx, mat)


def frame_for(d, ref=V((0, -1, 0))):
    """X, Y with X x Y = d (rings built with (cos t) X + (sin t) Y run CCW about d)."""
    d = d.normalized()
    y = ref - d * ref.dot(d)
    if y.length < 1e-5:
        ref = V((1, 0, 0)) if abs(d.x) < 0.9 else V((0, 0, 1))
        y = ref - d * ref.dot(d)
    y.normalize()
    x = y.cross(d)
    return x, y


def ring(c, X, Y, rx, ry, n, p=2.0, phase=0.0):
    pts = []
    for j in range(n):
        t = 2 * pi * j / n + phase
        ct, st = cos(t), sin(t)
        ex = 2.0 / p
        cx = math.copysign(abs(ct) ** ex, ct)
        sy = math.copysign(abs(st) ** ex, st)
        pts.append(c + X * (cx * rx) + Y * (sy * ry))
    return pts


def loft(mb, rings, mat, wf, cap0=None, cap1=None, tag=None, matfn=None):
    ids = [[mb.vert(p, wf(p), tag) for p in r] for r in rings]
    n = len(rings[0])
    for i in range(len(rings) - 1):
        m = matfn(i) if matfn else mat
        for j in range(n):
            mb.face((ids[i][j], ids[i][(j + 1) % n], ids[i + 1][(j + 1) % n], ids[i + 1][j]), m)
    if cap0 is not None:
        m = matfn(0) if matfn else mat
        c = mb.vert(cap0, wf(cap0), tag)
        for j in range(n):
            mb.face((c, ids[0][(j + 1) % n], ids[0][j]), m)
    if cap1 is not None:
        m = matfn(len(rings) - 2) if matfn else mat
        c = mb.vert(cap1, wf(cap1), tag)
        for j in range(n):
            mb.face((c, ids[-1][j], ids[-1][(j + 1) % n]), m)
    return ids


def ellipsoid(mb, c, r, nseg, nring, mat, wf, R=None, tag=None, shape=None, p=2.0):
    """Closed ellipsoid; local axes R (3x3) columns; rings along local Z. shape(local)->local."""
    R = R or Matrix.Identity(3)
    rings = []
    for i in range(1, nring):
        ph = -pi / 2 + pi * i / nring
        z, rr = sin(ph), cos(ph)
        pts = []
        for j in range(nseg):
            t = 2 * pi * j / nseg
            ct, st = cos(t), sin(t)
            ex = 2.0 / p
            lc = V((rr * math.copysign(abs(ct) ** ex, ct) * r[0], rr * math.copysign(abs(st) ** ex, st) * r[1], z * r[2]))
            if shape:
                lc = shape(lc)
            pts.append(c + R @ lc)
        rings.append(pts)
    b0 = V((0, 0, -r[2]))
    b1 = V((0, 0, r[2]))
    if shape:
        b0, b1 = shape(b0), shape(b1)
    return loft(mb, rings, mat, wf, cap0=c + R @ b0, cap1=c + R @ b1, tag=tag)


def axes_from(z, xhint=V((1, 0, 0))):
    z = z.normalized()
    x = xhint - z * xhint.dot(z)
    if x.length < 1e-5:
        x = V((0, 1, 0)) - z * z.y
    x.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def tube(mb, pts, radii, nseg, mat, wf, ref=V((0, -1, 0)), cap0=True, cap1=True, tag=None, matfn=None, p=2.0,
         cap_round=0.6):
    """Tube through pts with per-point radius (float or (rx, ry)); rounded end caps."""
    rings = []
    n = len(pts)
    for i in range(n):
        if i == 0:
            d = pts[1] - pts[0]
        elif i == n - 1:
            d = pts[-1] - pts[-2]
        else:
            d = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        X, Y = frame_for(d, ref)
        r = radii[i]
        rx, ry = (r, r) if not isinstance(r, tuple) else r
        rings.append(ring(pts[i], X, Y, rx, ry, nseg, p))
    c0 = c1 = None
    if cap0:
        d0 = (pts[0] - pts[1]).normalized()
        r0 = radii[0] if not isinstance(radii[0], tuple) else max(radii[0])
        c0 = pts[0] + d0 * r0 * cap_round
    if cap1:
        d1 = (pts[-1] - pts[-2]).normalized()
        r1 = radii[-1] if not isinstance(radii[-1], tuple) else max(radii[-1])
        c1 = pts[-1] + d1 * r1 * cap_round
    return loft(mb, rings, mat, wf, cap0=c0, cap1=c1, tag=tag, matfn=matfn)


# --------------------------------------------------------------------------------------------
# weights
# --------------------------------------------------------------------------------------------

def W(**kw):
    return lambda p: dict(kw)


def chain_blend(s, bones, joints, widths):
    """Weights along a 1-D coordinate: bones[i] sits between joints[i-1] and joints[i]."""
    f = [smoothstep(j - w, j + w, s) for j, w in zip(joints, widths)]
    out = {}
    for i, b in enumerate(bones):
        a = 1.0 if i == 0 else f[i - 1]
        c = f[i] if i < len(f) else 0.0
        val = a - c
        if val > 1e-4:
            out[b] = out.get(b, 0) + val
    return out


def seg_param(p, a, b):
    ab = b - a
    t = clamp((p - a).dot(ab) / ab.length_squared, 0, 1)
    return t, (a + ab * t - p).length


def chain_coord(p, pts):
    """Arc-length coordinate of p projected on the polyline pts (nearest segment)."""
    best, acc, res = 1e9, 0.0, 0.0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        t, d = seg_param(p, a, b)
        if d < best - 1e-9:
            best, res = d, acc + t * (b - a).length
        acc += (b - a).length
    return res


def norm_weights(w, maxn=4):
    items = sorted(((k, v) for k, v in w.items() if v > 1e-3), key=lambda kv: -kv[1])[:maxn]
    tot = sum(v for _, v in items) or 1.0
    return {k: v / tot for k, v in items}


def torso_w(p):
    w = chain_blend(p.z, ['hips', 'spine', 'chest', 'neck'], [1.03, 1.17, 1.395], [0.05, 0.06, 0.025])
    ax = abs(p.x)
    side = 'l' if p.x > 0 else 'r'
    # pelvis bottom follows the thighs a little (sitting, walking)
    leg = smoothstep(0.93, 0.80, p.z) * smoothstep(0.01, 0.08, ax) * 0.55
    # shoulder region follows the shoulder / upper arm
    sh = smoothstep(0.07, 0.15, ax) * smoothstep(1.2, 1.3, p.z) * 0.55
    ua = smoothstep(0.13, 0.19, ax) * smoothstep(1.23, 1.31, p.z) * 0.35
    k = 1.0 - leg - sh - ua
    out = {b: v * max(k, 0.05) for b, v in w.items()}
    if leg > 0:
        out['thigh_' + side] = out.get('thigh_' + side, 0) + leg
    if sh > 0:
        out['shoulder_' + side] = out.get('shoulder_' + side, 0) + sh
    if ua > 0:
        out['upperarm_' + side] = out.get('upperarm_' + side, 0) + ua
    return out


def neck_w(p):
    return chain_blend(p.z, ['chest', 'neck', 'head'], [1.385, 1.475], [0.03, 0.03])


def head_w(p):
    return {'head': 1.0}


def arm_w(side):
    sh, el, wr, tip = arm_points(side)
    s = 1 if side == 'l' else -1
    start = V((s * 0.105, 0.0, 1.345))
    pts = [start, sh, el, wr]
    L0 = (sh - start).length
    L1 = L0 + UPPER_LEN
    L2 = L1 + FORE_LEN

    def f(p):
        c = chain_coord(p, pts)
        return chain_blend(c, ['shoulder_' + side, 'upperarm_' + side, 'forearm_' + side, 'hand_' + side],
                           [L0 + 0.01, L1, L2 - 0.005], [0.05, 0.04, 0.02])
    return f


def leg_w(side):
    s = 1 if side == 'l' else -1
    pts = [V((s * LEG_X, 0, 0.98)), V((s * LEG_X, 0, LEG_TOP_Z)), V((s * LEG_X, -0.014, KNEE_Z)), V((s * LEG_X, 0, ANKLE_Z))]
    L0 = 0.08
    L1 = L0 + (pts[2] - pts[1]).length
    L2 = L1 + (pts[3] - pts[2]).length

    def f(p):
        c = chain_coord(p, pts)
        return chain_blend(c, ['hips', 'thigh_' + side, 'shin_' + side, 'foot_' + side],
                           [L0 - 0.015, L1, L2 + 0.01], [0.045, 0.045, 0.015])
    return f


# --------------------------------------------------------------------------------------------
# head surface helpers
# --------------------------------------------------------------------------------------------

def taper(uz):
    return 1.0 - 0.28 * uz * uz if uz < 0 else 1.0 - 0.06 * uz * uz


def head_point(u, off=0.0):
    """Point on the head surface for a unit direction u (plus an outward offset)."""
    ux, uy, uz = u
    t = taper(uz)
    yb = HEAD_R[1] * (1.07 if uy > 0 else 0.98)
    p = HEAD_C + V((HEAD_R[0] * ux * t, yb * uy * t, HEAD_R[2] * uz))
    if uy < 0 and uz < 0:      # a little chin
        p.y -= 0.012 * (uz * uz) * (-uy)
    if off:
        p += head_normal(u) * off
    return p


def head_normal(u):
    return V((u[0] / HEAD_R[0], u[1] / HEAD_R[1], u[2] / HEAD_R[2])).normalized()


def face_dir(x, z):
    """Unit direction u whose head point has world x, z on the front of the face."""
    uz = clamp((z - HEAD_C.z) / HEAD_R[2], -0.99, 0.99)
    t = taper(uz)
    ux = clamp(x / (HEAD_R[0] * t), -0.99, 0.99)
    uy = -math.sqrt(max(0.0, 1 - ux * ux - uz * uz))
    return V((ux, uy, uz))


def face_frame(x, z, off=0.0):
    u = face_dir(x, z)
    p = head_point(u)
    n = head_normal(u)
    # blend normal toward straight-forward so features face the viewer
    n = (n + V((0, -0.6, 0))).normalized()
    return p + n * off, axes_from(n, V((1, 0, 0)))


def sph(theta, phi):
    """Unit vector: theta from the crown (0) down, phi = azimuth, 0 = face front (-Y), +pi/2 = left (+X)."""
    return V((sin(theta) * sin(phi), -sin(theta) * cos(phi), cos(theta)))


# --------------------------------------------------------------------------------------------
# body
# --------------------------------------------------------------------------------------------
EYE_X, EYE_Z = 0.056, 1.600
FACE_BASE = dict(mouth_w=0.050, mouth_curve=0.008, mouth_open=0.005, mouth_z=0.0,
                 brow_in=0.0, brow_out=0.0, brow_z=0.0, eye_shut=0.0, eye_smile=0.0, eye_worry=0.0)
MORPHS = {
    'smile': dict(mouth_w=0.066, mouth_curve=0.016, mouth_open=0.019, brow_z=0.004, eye_smile=0.55, brow_in=0.002),
    'frown': dict(mouth_w=0.040, mouth_curve=-0.008, mouth_open=0.0035, mouth_z=-0.002, brow_in=-0.009, brow_out=0.004),
    'sleepy': dict(eye_shut=1.0, mouth_w=0.034, mouth_curve=0.003, mouth_open=0.002, brow_z=-0.004),
    'worried': dict(mouth_w=0.032, mouth_curve=-0.005, mouth_open=0.008, brow_in=0.013, brow_out=-0.004, eye_worry=1.0),
}


def build_face(mb, P):
    """Eyes, brows, nose, mouth, ears. Called once per morph with the same topology."""
    for s in (1, -1):
        ex = s * EYE_X
        c, R = face_frame(ex, EYE_Z, -0.002)

        def eye_shape(lc, s=s, kind='white'):
            x, y, z = lc
            if P['eye_smile'] and y < 0:
                y *= 1 - 0.55 * P['eye_smile']
            if P['eye_worry']:
                # inner-top corners raise (sad eyes): tilt
                y += P['eye_worry'] * 0.12 * (-s * x) * (1 if y > 0 else 0.3)
            if P['eye_shut']:
                k = P['eye_shut']
                if kind == 'white':
                    y *= 1 - 0.95 * k
                    z -= 0.014 * k
                elif kind == 'iris':
                    xn = x / 0.023
                    y = lerp(y, y * 0.16 - 0.006 + 0.010 * xn * xn, k)
                    z -= 0.002 * k
                else:
                    z -= 0.03 * k
            return V((x, y, z))

        # white (sclera), iris, highlight
        ellipsoid(mb, c, (0.0265, 0.031, 0.013), 10, 5, 'm_eye_white', head_w, R, tag='eye',
                  shape=lambda lc, s=s: eye_shape(lc, s, 'white'))
        ci = c + R @ V((0, -0.001, 0.0095))
        ellipsoid(mb, ci, (0.020, 0.0245, 0.007), 10, 5, 'm_eye', head_w, R, tag='eye',
                  shape=lambda lc, s=s: eye_shape(lc, s, 'iris'))
        ch = c + R @ V((0.0075, 0.0095, 0.015))
        ellipsoid(mb, ch, (0.0062, 0.0072, 0.003), 6, 3, 'm_eye_white', head_w, R, tag='eye',
                  shape=lambda lc, s=s: eye_shape(lc - V((0, 0, 0)), s, 'hl'))

        # eyebrow: curved capsule
        bz = EYE_Z + 0.049 + P['brow_z']
        pts = []
        for k in range(5):
            u = k / 4.0                    # 0 = inner, 1 = outer
            x = s * lerp(0.028, 0.082, u)
            z = bz + 0.006 * sin(pi * u) + lerp(P['brow_in'], P['brow_out'], u) - 0.004 * u
            pts.append(face_frame(x, z, 0.004)[0])
        rad = [(0.0062, 0.0045), (0.0078, 0.005), (0.0075, 0.005), (0.0066, 0.0045), (0.0045, 0.0034)]
        tube(mb, pts, rad, 6, 'm_hair', head_w, ref=V((0, -1, 0)), tag='brow', cap_round=0.9)

    # nose: soft button
    c, R = face_frame(0.0, EYE_Z - 0.040, 0.004)
    ellipsoid(mb, c, (0.019, 0.015, 0.016), 8, 6, 'm_skin', head_w, R, tag='nose')

    # mouth: curved sheet between an upper and lower lip line
    mz = EYE_Z - 0.080 + P['mouth_z']
    w = P['mouth_w']
    cols, rows = 9, 3
    grid = []
    for i in range(cols):
        u = -1 + 2 * i / (cols - 1)
        top = mz + P['mouth_curve'] * u * u - 0.001
        bot = top - 0.0022 - P['mouth_open'] * (1 - u * u) ** 0.8
        row = []
        for j in range(rows):
            v = j / (rows - 1)
            z = lerp(top, bot, v)
            x = u * w / 2
            p = face_frame(x, z, 0.0022)[0]
            row.append(mb.vert(p, {'head': 1.0}, 'mouth'))
        grid.append(row)
    for i in range(cols - 1):
        for j in range(rows - 1):
            mb.face_out((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]), 'm_mouth', V((0, -1, 0)))

    # ears
    for s in (1, -1):
        u = V((s * 0.99, 0.08, -0.06)).normalized()
        c = head_point(u, -0.004)
        R = axes_from(V((s, 0.35, 0)), V((0, 0, 1)))
        ellipsoid(mb, c, (0.034, 0.024, 0.015), 8, 5, 'm_skin', head_w, R, tag='ear')


def build_body():
    mb = MB()
    # head
    def head_shape(lc):
        u = V((lc.x / HEAD_R[0], lc.y / HEAD_R[1], lc.z / HEAD_R[2]))
        return head_point(u) - HEAD_C
    ellipsoid(mb, HEAD_C, HEAD_R, 20, 14, 'm_skin', head_w, shape=head_shape)
    face_start = len(mb.v)
    build_face(mb, dict(FACE_BASE))
    face_end = len(mb.v)

    # neck
    tube(mb, [V((0, 0.008, 1.35)), V((0, 0.008, 1.42)), V((0, 0.004, 1.50))], [0.054, 0.052, 0.054], 10, 'm_skin', neck_w,
         cap0=False, cap1=False)

    # torso: (z, rx, ry, yoff)
    T = [(0.815, 0.105, 0.070, 0.012), (0.85, 0.148, 0.097, 0.016), (0.91, 0.162, 0.108, 0.012),
         (0.97, 0.158, 0.103, 0.004), (1.012, 0.151, 0.098, 0.0), (1.018, 0.160, 0.106, 0.0),
         (1.05, 0.153, 0.100, -0.004), (1.12, 0.155, 0.103, -0.009), (1.20, 0.166, 0.110, -0.013),
         (1.27, 0.171, 0.106, -0.010), (1.325, 0.160, 0.095, -0.003), (1.365, 0.118, 0.077, 0.003),
         (1.395, 0.062, 0.054, 0.006)]
    rings = []
    for z, rx, ry, yo in T:
        pp = 2.6 if z > 1.1 else 2.3
        rings.append(ring(V((0, yo, z)), V((1, 0, 0)), V((0, 1, 0)), rx, ry, 16, pp))
    loft(mb, rings, 'm_top', torso_w, cap0=V((0, 0.012, 0.795)), cap1=V((0, 0.007, 1.41)),
         matfn=lambda i: 'm_bottom' if i < 4 else 'm_top')

    # arms: sleeve (m_top) with a hem step, then skin
    for side in ('l', 'r'):
        s = 1 if side == 'l' else -1
        sh, el, wr, tip = arm_points(side)
        start = V((s * 0.105, 0.0, 1.345))
        ua = (el - sh)
        fa = (wr - el)
        pts = [start, sh, sh + ua * 0.42, sh + ua * 0.44, sh + ua * 0.46, sh + ua * 0.75, el,
               el + fa * 0.55, wr, wr + (wr - el).normalized() * 0.012]
        rad = [0.055, 0.062, 0.060, 0.059, 0.050, 0.048, 0.046, 0.043, 0.037, 0.033]
        mats = ['m_top'] * 3 + ['m_skin'] * 6
        tube(mb, pts, rad, 10, 'm_skin', arm_w(side), ref=V((0, -1, 0)), matfn=lambda i, mats=mats: mats[i],
             cap1=False)
        build_hand(mb, side)

    # legs + shoes
    for side in ('l', 'r'):
        s = 1 if side == 'l' else -1
        x = s * LEG_X
        zs = [0.975, 0.90, 0.76, 0.60, 0.52, KNEE_Z, 0.43, 0.30, 0.14, 0.128, 0.10, 0.095]
        rs = [0.078, 0.092, 0.087, 0.077, 0.069, 0.066, 0.064, 0.059, 0.057, 0.063, 0.063, 0.052]
        pts = []
        for z in zs:
            y = -0.014 * (1 - abs(z - KNEE_Z) / (LEG_TOP_Z - KNEE_Z)) if z > KNEE_Z else -0.014 * (z - ANKLE_Z) / (KNEE_Z - ANKLE_Z)
            pts.append(V((x + s * 0.004 * smoothstep(0.9, 0.6, z), y, z)))
        tube(mb, pts, rs, 10, 'm_bottom', leg_w(side), ref=V((0, -1, 0)), cap0=True, cap1=True)
        build_shoe(mb, side)
    return mb, (face_start, face_end)


def hand_frame(side):
    sh, el, wr, tip = arm_points(side)
    s = 1 if side == 'l' else -1
    d = (tip - wr).normalized()
    palm = V((-s, 0, 0))
    palm = (palm - d * palm.dot(d)).normalized()     # palm normal (faces the body)
    thumb = d.cross(palm) * (-s)                        # forward-ish (-Y)
    if thumb.y > 0:
        thumb = -thumb
    return wr, d, palm, thumb


def build_hand(mb, side):
    wr, d, palm, thumb = hand_frame(side)
    wf = lambda p: {'hand_' + side: 1.0}
    R = Matrix((thumb, -palm.cross(thumb) if False else palm, d)).transposed()
    # re-orthonormalise: columns x=thumb, y=palm, z=d
    x = thumb.normalized()
    z = d
    y = z.cross(x)
    R = Matrix((x, y, z)).transposed()

    def mitt(lc):
        x_, y_, z_ = lc
        # flatter palm side, rounder finger end, slightly cupped
        if z_ > 0:
            x_ *= 1 - 0.18 * (z_ / 0.072) ** 2
        return V((x_, y_ + 0.005 * (z_ / 0.072) ** 2 * (1 if y_ < 0 else 0), z_))
    c = wr + d * 0.066
    ellipsoid(mb, c, (0.047, 0.028, 0.072), 8, 6, 'm_skin', wf, R, shape=mitt)
    # thumb
    tb = wr + d * 0.034 + thumb * 0.038 + palm * 0.012
    tdir = (d * 0.6 + thumb * 0.8).normalized()
    ellipsoid(mb, tb + tdir * 0.014, (0.015, 0.015, 0.033), 6, 4, 'm_skin', wf, axes_from(tdir, palm))


def build_shoe(mb, side):
    s = 1 if side == 'l' else -1
    x = s * LEG_X
    wf = lambda p: {'foot_' + side: 1.0} if p.z < 0.07 else {'foot_' + side: 0.75, 'shin_' + side: 0.25}
    # (y, half width, half height, centre z)
    prof = [(0.066, 0.040, 0.036, 0.044), (0.048, 0.050, 0.050, 0.052), (0.0, 0.055, 0.054, 0.055),
            (-0.055, 0.058, 0.047, 0.047), (-0.105, 0.057, 0.039, 0.039), (-0.142, 0.050, 0.031, 0.031),
            (-0.166, 0.037, 0.023, 0.025)]
    rings = []
    for y, hw, hh, zc in prof:
        # superellipse cross-section in the XZ plane, flat sole
        pts = ring(V((x + s * 0.004, y, zc)), V((1, 0, 0)), V((0, 0, 1)), hw, hh, 10, 2.7)
        pts = [V((p.x, p.y, max(p.z, 0.0))) for p in pts]
        rings.append(pts)
    # loft goes toward -Y; ring built with X=(1,0,0), Y=(0,0,1) -> X x Y = (0,-1,0) = direction of travel
    loft(mb, rings, 'm_shoes', wf, cap0=V((x, 0.074, 0.044)), cap1=V((x + s * 0.003, -0.176, 0.023)))
    # sole rim
    rim = []
    for y, hw, hh, zc in prof:
        rim.append(ring(V((x + s * 0.004, y, 0.012)), V((1, 0, 0)), V((0, 0, 1)), hw + 0.004, 0.012, 10, 3.0))
    loft(mb, rim, 'm_shoes', wf, cap0=V((x, 0.074, 0.012)), cap1=V((x + s * 0.003, -0.174, 0.012)))


# --------------------------------------------------------------------------------------------
# hair
# --------------------------------------------------------------------------------------------

def hair_mesh(style):
    """Hair shell: columns around the head (phi), rows from the crown down to the hem.

    Each style gives, per azimuth: hem angle on the head (theta, rad), curtain drop (m),
    thickness function, and an optional extra-offset function.
    """
    global HP, HR
    mb = MB()
    cfg = HAIR_STYLES_CFG[style]
    NC, NR = cfg.get('grid', (20, 9))
    wf = head_w

    def hem_default(phi, front, temple, side, back, sideburn=0.0):
        a = abs(phi)
        # piecewise-smooth hemline: 0 front, ~0.9 temple, ~1.55 side, pi back
        if a < 0.9:
            h = lerp(front, temple, smoothstep(0.0, 0.9, a))
        elif a < 1.6:
            h = lerp(temple, side, smoothstep(0.9, 1.6, a))
            h += sideburn * sin(pi * (a - 0.9) / 0.7) ** 2
        else:
            h = lerp(side, back, smoothstep(1.6, pi, a))
        return radians(h)

    rows_pts = []
    for ci in range(NC):
        phi = -pi + 2 * pi * (ci + 0.5) / NC
        HP = 1 if ci % 2 == 0 else -1
        HR = 1
        hem = cfg['hem'](phi, hem_default)
        drop = cfg.get('drop', lambda phi: 0.0)(phi)
        col = []
        th_on = hem
        arc_on = th_on * 0.14
        total = arc_on + drop
        for ri in range(NR + 1):
            HR = 1 if ri % 2 == 0 else -1
            s = total * ri / NR
            if s <= arc_on + 1e-9:
                th = th_on * (s / arc_on) if arc_on > 0 else 0
                u = sph(th, phi)
                thick = cfg['thick'](th, phi, hem)
                # taper to the scalp at the hem when there is no curtain
                if drop <= 0:
                    thick *= 0.25 + 0.75 * smoothstep(hem, hem - radians(cfg.get('taper', 14)), th)
                p = head_point(u, thick)
                if 'extra' in cfg:
                    p = cfg['extra'](p, th, phi, u)
            else:
                d = s - arc_on
                u = sph(th_on, phi)
                thick = cfg['thick'](th_on, phi, hem)
                base = head_point(u, thick)
                p = base + V((0, 0, -d))
                if 'curtain' in cfg:
                    p = cfg['curtain'](p, d, drop, phi, u)
            col.append(p)
        rows_pts.append(col)
    # vertices: shared crown vertex + grid
    crown = mb.vert(head_point(V((0, 0, 1)), HAIR_STYLES_CFG[style]['thick'](0, 0, 1)), wf(None))
    ids = [[None] + [mb.vert(rows_pts[ci][ri], wf(None)) for ri in range(1, NR + 1)] for ci in range(NC)]
    for ci in range(NC):
        cn = (ci + 1) % NC
        mb.face_out((crown, ids[ci][1], ids[cn][1]), 'm_hair', V((0, 0, 1)))
        for ri in range(1, NR):
            a, b, c, d = ids[ci][ri], ids[cn][ri], ids[cn][ri + 1], ids[ci][ri + 1]
            out = (mb.v[a] - HEAD_C)
            out.z *= 0.3
            mb.face_out((a, b, c, d), 'm_hair', out)
    for extra in cfg.get('parts', []):
        extra(mb)
    return mb


HP = 1   # column parity of the hair vertex being built (+1/-1): zig-zag detail that survives low poly
HR = 1   # row parity
TUFT = [0.9, 0.2, 1.0, 0.5, 0.1, 0.8, 0.35, 1.0, 0.0, 0.6, 0.95, 0.3, 0.7, 0.05, 0.85, 0.45, 1.0, 0.15, 0.6, 0.4]


def col_index(phi, n=20):
    return int(round((phi + pi) / (2 * pi) * n - 0.5)) % n


def lumps(phi, th, amp, fa, fb, ph=0.0):
    return amp * (0.5 + 0.5 * sin(fa * phi + ph) * sin(fb * th + 0.7 * ph))


def _short_extra(p, th, phi, u):
    # side-swept quiff: lift the front top, sweep toward +X
    f = smoothstep(radians(70), radians(25), th) * smoothstep(1.2, 0.0, abs(phi))
    return p + V((0.010 * f, -0.006 * f, 0.012 * f))


def _messy_thick(th, phi, hem):
    base = 0.026 + 0.012 * cos(th)
    top = smoothstep(radians(85), radians(15), th)
    tuft = 0.026 * TUFT[col_index(phi)] * top * (1 if HR > 0 else 0.35)
    return base + tuft + 0.006 * HP * smoothstep(radians(30), radians(70), th)


def _messy_curtain(p, d, drop, phi, u):
    # shaggy ends flick outward a little, jagged by column
    out = V((u.x, u.y * 0.8, 0)).normalized()
    k = d / max(drop, 1e-3)
    j = 0.010 * HP + 0.022 * k * k
    return p + out * j + V((0, 0, -0.022 * k * (HP + 1) * 0.5))


def _long_curtain(p, d, drop, phi, u):
    out = V((u.x, u.y, 0)).normalized()
    k = d / max(drop, 1e-3)
    # fall slightly outward over the shoulders, back strands fuller
    return p + out * (0.012 * k + 0.02 * k * k * (1 if abs(phi) > 2.0 else 0.4) + 0.003 * HP)


def _bob_curtain(p, d, drop, phi, u):
    out = V((u.x, u.y, 0)).normalized()
    k = d / max(drop, 1e-3)
    return p + out * (0.008 * sin(pi * k * 0.9) - 0.018 * k ** 3)


def _braids_thick(th, phi, hem):
    # cornrow-ish parting lines toward the back
    return 0.013 + 0.004 * cos(th) + 0.004 * HP * smoothstep(radians(20), radians(60), th)


def _braids_curtain(p, d, drop, phi, u):
    out = V((u.x, u.y, 0)).normalized()
    k = d / max(drop, 1e-3)
    ridge = 0.016 * HP                           # alternate columns: individual braids read as ridges
    bead = 0.004 * HR * (1 if HP > 0 else -1)    # braid segments
    return p + out * (ridge + bead + 0.02 * k) + V((0, 0, -0.03 * k * (HP + 1) * 0.5))


def _curly_thick(th, phi, hem):
    return 0.036 + 0.014 * cos(th) + 0.012 * HP * HR + lumps(phi, th, 0.010, 5, 4, 0.4)


def _curly_curtain(p, d, drop, phi, u):
    out = V((u.x, u.y, 0)).normalized()
    k = d / max(drop, 1e-3)
    return p + out * (0.03 + 0.016 * sin(pi * k) + 0.012 * HP * HR) + V((0, 0, -0.02 * k * (HP + 1) * 0.5))


def _afro_thick(th, phi, hem):
    return 0.062 + 0.028 * cos(th) * (1 if th < 1.2 else 0.6) + 0.011 * HP * HR


def _bun_part(mb):
    c = HEAD_C + V((0, 0.085, 0.118))
    R = axes_from(V((0, 0.5, 1)).normalized())
    ellipsoid(mb, c, (0.058, 0.058, 0.05), 10, 6, 'm_hair', head_w, R,
              shape=lambda lc: lc * (1 + 0.06 * sin(7 * math.atan2(lc.y, lc.x))))


def _ponytail_part(mb):
    wf = head_w
    base = HEAD_C + V((0, 0.128, -0.005))
    pts = [base + V((0, -0.02, 0.01)), base + V((0, 0.02, -0.01)), base + V((0, 0.045, -0.07)),
           base + V((0, 0.05, -0.15)), base + V((0, 0.04, -0.23)), base + V((0, 0.03, -0.28))]
    rad = [0.028, 0.03, 0.036, 0.032, 0.024, 0.012]
    tube(mb, pts, rad, 8, 'm_hair', wf, ref=V((1, 0, 0)))
    # hair tie
    tie_c = base + V((0, 0.018, -0.005))
    tube(mb, [tie_c + V((0, -0.008, 0.004)), tie_c + V((0, 0.008, -0.004))], [0.030, 0.030], 8, 'm_acc', wf,
         ref=V((1, 0, 0)))


def _braid_tubes(mb):
    """Two face-framing braids in front of the shoulders (the rest are ridges in the curtain)."""
    def wf(p):
        k = smoothstep(1.50, 1.30, p.z)
        return {'head': 1 - 0.7 * k, 'chest': 0.7 * k} if k > 0 else {'head': 1.0}
    for s in (1, -1):
        rel = [(0.128, -0.015, -0.05), (0.132, -0.05, -0.14), (0.128, -0.09, -0.22), (0.122, -0.115, -0.29),
               (0.118, -0.128, -0.35), (0.116, -0.132, -0.40), (0.115, -0.132, -0.43)]
        pts = [HEAD_C + V((s * x, y, z)) for x, y, z in rel]
        rad = [0.019, 0.016, 0.019, 0.015, 0.018, 0.013, 0.008]
        tube(mb, pts, rad, 5, 'm_hair', wf, ref=V((0, -1, 0)))


def _hem_short(phi, H):
    return H(phi, 58, 72, 96, 122, sideburn=10)


HAIR_STYLES_CFG = {
    'short': dict(hem=_hem_short, thick=lambda th, phi, hem: 0.016 + 0.012 * cos(th) + lumps(phi, th, 0.004, 9, 6),
                  extra=_short_extra, grid=(20, 8)),
    'buzz': dict(hem=lambda phi, H: H(phi, 55, 70, 94, 120, sideburn=6),
                 thick=lambda th, phi, hem: 0.0045, taper=6, grid=(16, 5)),
    'messy': dict(hem=lambda phi, H: H(phi, 76 + 9 * HP, 84 + 5 * HP, 90, 90),
                  drop=lambda phi: 0.0 if abs(phi) < 0.75 else lerp(0.07, 0.11, smoothstep(0.75, 2.4, abs(phi))),
                  thick=_messy_thick, curtain=_messy_curtain),
    'long': dict(hem=lambda phi, H: H(phi, 62 + 10 * smoothstep(-0.2, 0.6, phi), 78, 90, 90),
                 drop=lambda phi: 0.0 if abs(phi) < 0.8 else lerp(0.20, 0.30, smoothstep(0.8, 2.6, abs(phi))),
                 thick=lambda th, phi, hem: 0.017 + 0.01 * cos(th), curtain=_long_curtain),
    'bob': dict(hem=lambda phi, H: H(phi, 74, 80, 90, 90),
                drop=lambda phi: 0.0 if abs(phi) < 0.8 else lerp(0.10, 0.085, smoothstep(0.8, 3.0, abs(phi))),
                thick=lambda th, phi, hem: 0.020 + 0.012 * cos(th), curtain=_bob_curtain),
    'braids': dict(hem=lambda phi, H: H(phi, 55, 70, 90, 90), parts=[_braid_tubes], grid=(20, 8),
                   drop=lambda phi: 0.0 if abs(phi) < 0.85 else lerp(0.24, 0.32, smoothstep(0.85, 2.6, abs(phi))),
                   thick=_braids_thick, curtain=_braids_curtain),
    'curly': dict(hem=lambda phi, H: H(phi, 66 + 6 * HP, 78, 90, 90),
                  drop=lambda phi: 0.0 if abs(phi) < 0.8 else lerp(0.07, 0.13, smoothstep(0.8, 2.6, abs(phi))),
                  thick=_curly_thick, curtain=_curly_curtain),
    'afro': dict(hem=lambda phi, H: H(phi, 62, 74, 100, 112), thick=_afro_thick, taper=30, grid=(20, 8)),
    'bun': dict(hem=lambda phi, H: H(phi, 57, 70, 95, 118, sideburn=4),
                thick=lambda th, phi, hem: 0.011 + 0.004 * cos(th) + 0.002 * sin(14 * phi), parts=[_bun_part],
                grid=(18, 7)),
    'ponytail': dict(hem=lambda phi, H: H(phi, 57, 70, 95, 118, sideburn=4),
                     thick=lambda th, phi, hem: 0.011 + 0.004 * cos(th) + 0.002 * sin(14 * phi),
                     parts=[_ponytail_part], grid=(18, 7)),
}


# --------------------------------------------------------------------------------------------
# accessories + tops
# --------------------------------------------------------------------------------------------

def dome(mb, mat, center, rx, ry, rz, nseg, nring, wf, th_max=pi / 2, R=None, shape=None, bottom_ring=True):
    """Open dome (crown at +Z) down to polar angle th_max, with a lip ring turned inward."""
    R = R or Matrix.Identity(3)
    rings = []
    for i in range(1, nring + 1):
        th = th_max * i / nring
        pts = []
        for j in range(nseg):
            t = 2 * pi * j / nseg
            lc = V((sin(th) * cos(t) * rx, sin(th) * sin(t) * ry, cos(th) * rz))
            if shape:
                lc = shape(lc, th, t)
            pts.append(center + R @ lc)
        rings.append(pts)
    if bottom_ring:
        # fold the rim inward so the edge has thickness
        last = rings[-1]
        inner = [center + (p - center) * 0.94 + R @ V((0, 0, 0.004)) for p in last]
        rings.append(inner)
    top = center + R @ (shape(V((0, 0, rz)), 0, 0) if shape else V((0, 0, rz)))
    # rings go downward from the crown: winding so normals point out
    ids = [[mb.vert(p, wf(p)) for p in r] for r in rings]
    c = mb.vert(top, wf(top))
    n = nseg
    for j in range(n):
        mb.face_out((c, ids[0][j], ids[0][(j + 1) % n]), mat, top - center)
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b, cc, d = ids[i][j], ids[i][(j + 1) % n], ids[i + 1][(j + 1) % n], ids[i + 1][j]
            o = (mb.v[a] - center)
            if i == len(rings) - 2 and bottom_ring:
                o = -(R @ V((0, 0, 1)))
            mb.face_out((a, b, cc, d), mat, o)
    return ids


def slab(mb, mat, c, R, size, wf, n=(1, 1), p=3.0, seg=12):
    """Rounded flat slab (superellipse outline) centred at c, local Z = thickness."""
    hx, hy, hz = size
    top = ring(c + R @ V((0, 0, hz)), R @ V((1, 0, 0)), R @ V((0, 1, 0)), hx, hy, seg, p)
    top2 = ring(c + R @ V((0, 0, hz * 0.2)), R @ V((1, 0, 0)), R @ V((0, 1, 0)), hx + hz * 0.6, hy + hz * 0.6, seg, p)
    bot2 = ring(c + R @ V((0, 0, -hz * 0.2)), R @ V((1, 0, 0)), R @ V((0, 1, 0)), hx + hz * 0.6, hy + hz * 0.6, seg, p)
    bot = ring(c + R @ V((0, 0, -hz)), R @ V((1, 0, 0)), R @ V((0, 1, 0)), hx, hy, seg, p)
    # loft from bottom to top along local +Z (ring CCW about +Z)
    return loft(mb, [bot, bot2, top2, top], mat, wf, cap0=c + R @ V((0, 0, -hz)), cap1=c + R @ V((0, 0, hz)))


HAT_C = HEAD_C + V((0, 0.006, 0.022)) / HS


def scale_about(mb, c, k):
    mb.v = [c + (v - c) * k for v in mb.v]
    return mb


def cap_mesh(backwards=False):
    mb = MB()
    wf = head_w
    yaw = Matrix.Rotation(pi, 3, 'Z') if backwards else Matrix.Identity(3)
    tilt = Matrix.Rotation(radians(-8), 3, 'X')   # front dips a little
    R = yaw @ tilt

    def shp(lc, th, t):
        return V((lc.x, lc.y, lc.z * (1.0 if lc.z > 0 else 1.0)))
    dome(mb, 'm_acc', HAT_C + V((0, 0, 0.012)), 0.158, 0.162, 0.148, 14, 4, wf, th_max=radians(92), R=R, shape=shp)
    # button
    ellipsoid(mb, HAT_C + R @ V((0, 0, 0.165)), (0.012, 0.012, 0.007), 6, 3, 'm_acc', wf)
    # brim: flattened superellipse slab forward
    bc = HAT_C + R @ V((0, -0.19, 0.0))
    Rb = R @ Matrix.Rotation(radians(-10), 3, 'X')
    slab(mb, 'm_acc', bc, Rb, (0.105, 0.09, 0.006), wf, p=2.2, seg=12)
    return mb


def beanie_mesh():
    mb = MB()
    wf = head_w
    c = HAT_C + V((0, 0.004, 0.018))

    def shp(lc, th, t):
        # slightly pointed, slouchy knit
        z = lc.z * (1.06 if lc.z > 0 else 1)
        r = 1 + 0.012 * sin(12 * t) * smoothstep(0.2, 1.2, th)
        return V((lc.x * r, lc.y * r, z))
    dome(mb, 'm_acc', c, 0.160, 0.166, 0.16, 14, 4, wf, th_max=radians(88), shape=shp)
    # folded cuff
    rings = []
    for z, r in ((-0.018, 0.162), (-0.012, 0.170), (0.02, 0.172), (0.032, 0.165)):
        rings.append(ring(c + V((0, 0, z)), V((1, 0, 0)), V((0, 1.02, 0)), r, r, 16, 2.0))
    loft(mb, rings, 'm_acc', wf)
    return mb


def flatcap_mesh():
    mb = MB()
    wf = head_w
    R = Matrix.Rotation(radians(-12), 3, 'X')

    def shp(lc, th, t):
        # flat top that slopes forward and overhangs the brim
        z = lc.z * 0.55
        y = lc.y - 0.03 * max(0, lc.z / 0.15)
        return V((lc.x * 1.02, y, z))
    dome(mb, 'm_acc', HAT_C + V((0, 0.0, 0.03)), 0.160, 0.170, 0.16, 14, 4, wf, th_max=radians(95), R=R, shape=shp)
    slab(mb, 'm_acc', HAT_C + R @ V((0, -0.172, 0.006)), R @ Matrix.Rotation(radians(-14), 3, 'X'),
         (0.10, 0.05, 0.006), wf, p=2.0, seg=12)
    return mb


def visor_mesh():
    mb = MB()
    wf = head_w
    c = HAT_C + V((0, 0.0, 0.0))
    R = Matrix.Rotation(radians(-10), 3, 'X')
    rings = []
    for z, r in ((-0.008, 0.150), (0.0, 0.156), (0.028, 0.156), (0.036, 0.148)):
        rings.append(ring(c + R @ V((0, 0, z)), R @ V((1, 0, 0)), R @ V((0, 1.02, 0)), r, r, 16, 2.0))
    loft(mb, rings, 'm_acc', wf)
    slab(mb, 'm_acc', c + R @ V((0, -0.185, 0.0)), R @ Matrix.Rotation(radians(-12), 3, 'X'),
         (0.10, 0.075, 0.005), wf, p=2.2, seg=14)
    return mb


def hijab_mesh():
    mb = MB()
    NC, NR = 16, 8
    wf_head = head_w

    def wf(p):
        # lower drape follows the neck / chest
        k = smoothstep(1.47, 1.33, p.z)
        return {'head': 1 - k, 'neck': k * 0.6, 'chest': k * 0.4} if k > 0 else {'head': 1.0}

    # hood: head-hugging shell with an oval face opening
    rows = []
    for ci in range(NC):
        phi = -pi + 2 * pi * (ci + 0.5) / NC
        a = abs(phi)
        hem = radians(lerp(52, 90, smoothstep(0.0, 1.1, a)))
        drop = lerp(0.0, 0.22, smoothstep(0.45, 1.3, a))
        col = []
        arc = hem * 0.14
        total = arc + drop
        for ri in range(NR + 1):
            s = total * ri / NR
            if s <= arc + 1e-9:
                th = hem * s / arc
                p = head_point(sph(th, phi), 0.024 + 0.01 * cos(th))
            else:
                d = s - arc
                u = sph(hem, phi)
                p = head_point(u, 0.024) + V((0, 0, -d))
                out = V((u.x, u.y, 0)).normalized()
                k = d / 0.22
                p += out * (0.035 * k * k + 0.01 * k)
                # close under the chin: front columns move toward the midline
                if a < 1.4:
                    p.x *= 1 - 0.35 * smoothstep(0.1, 1.0, k) * smoothstep(1.4, 0.6, a)
                    p.y -= 0.015 * k
            col.append(p)
        rows.append(col)
    crown = mb.vert(head_point(V((0, 0, 1)), 0.034), {'head': 1.0})
    ids = [[None] + [mb.vert(rows[ci][ri], wf(rows[ci][ri])) for ri in range(1, NR + 1)] for ci in range(NC)]
    for ci in range(NC):
        cn = (ci + 1) % NC
        mb.face_out((crown, ids[ci][1], ids[cn][1]), 'm_acc', V((0, 0, 1)))
        for ri in range(1, NR):
            a, b, c, d = ids[ci][ri], ids[cn][ri], ids[cn][ri + 1], ids[ci][ri + 1]
            o = mb.v[a] - V((0, HEAD_C.y, mb.v[a].z))
            mb.face_out((a, b, c, d), 'm_acc', o)
    # under-chin wrap + shoulder drape (closed cone around the neck)
    rings = []
    for z, rx, ry, yo in ((1.49, 0.085, 0.095, -0.03), (1.43, 0.105, 0.105, -0.01), (1.37, 0.15, 0.125, 0.0),
                          (1.335, 0.185, 0.13, 0.0), (1.315, 0.19, 0.125, 0.0)):
        rings.append(ring(V((0, yo, z)), V((1, 0, 0)), V((0, -1, 0)), rx, ry, 16, 2.2))
    rings.reverse()
    # loft upward: ring CCW about +Z needs X x Y = +Z -> use Y=(0,1,0)
    rings = []
    for z, rx, ry, yo in ((1.315, 0.19, 0.125, 0.0), (1.335, 0.185, 0.13, 0.0), (1.37, 0.15, 0.125, 0.0),
                          (1.43, 0.105, 0.108, -0.012), (1.485, 0.08, 0.09, -0.03)):
        rings.append(ring(V((0, yo, z)), V((1, 0, 0)), V((0, 1, 0)), rx, ry, 16, 2.2))
    loft(mb, rings, 'm_acc', wf)
    return mb


def headphones_mesh():
    """Resting around the neck (as in portrait p02): cups on the collarbones, band behind the neck."""
    mb = MB()

    def wf(p):
        return {'neck': 0.5, 'chest': 0.5}
    # band: arc behind the neck
    pts = []
    for k in range(9):
        t = -1.3 + 2.6 * k / 8
        pts.append(V((0.105 * sin(t), 0.012 + 0.085 * cos(t), 1.395 + 0.03 * cos(t))))
    tube(mb, pts, [(0.012, 0.007)] * 9, 6, 'm_acc', wf, ref=V((0, 0, 1)), cap0=False, cap1=False)
    for s in (1, -1):
        c = V((s * 0.105, -0.045, 1.38))
        R = axes_from(V((0.1 * s, -1, -0.9)).normalized(), V((1, 0, 0)))
        # cup: short fat cylinder with cushion
        tube(mb, [c + R @ V((0, 0, -0.012)), c + R @ V((0, 0, 0.01)), c + R @ V((0, 0, 0.022))],
             [0.042, 0.042, 0.036], 8, 'm_acc', wf, ref=R @ V((0, 1, 0)))
        tube(mb, [c + R @ V((0, 0, -0.024)), c + R @ V((0, 0, -0.012))], [0.036, 0.04], 8, 'm_eye', wf,
             ref=R @ V((0, 1, 0)))
        # yoke to the band
        tube(mb, [c + R @ V((0, 0.03, 0.0)), pts[0 if s < 0 else -1]], [0.008, 0.008], 5, 'm_acc', wf,
             ref=V((0, 0, 1)))
    return mb


def glasses_mesh():
    mb = MB()
    wf = head_w
    for s in (1, -1):
        c, R = face_frame(s * EYE_X, EYE_Z, 0.026)
        pts = []
        n = 10
        for k in range(n):
            t = 2 * pi * k / n
            pts.append(c + R @ V((0.036 * cos(t), 0.031 * sin(t), 0)))
        pts.append(pts[0])
        # closed ring tube: build as a loft of small rings with wrap
        rings = []
        for k in range(n):
            a = pts[k]
            b = pts[(k + 1) % n]
            prv = pts[(k - 1) % n]
            d = (b - prv)
            X, Y = frame_for(d, R @ V((0, 0, 1)))
            rings.append(ring(a, X, Y, 0.005, 0.004, 4))
        ids = [[mb.vert(p, wf(p)) for p in r] for r in rings]
        for k in range(n):
            k2 = (k + 1) % n
            for j in range(4):
                mb.face((ids[k][j], ids[k][(j + 1) % 4], ids[k2][(j + 1) % 4], ids[k2][j]), 'm_eye')
        # temple arm back to the ear
        a = c + R @ V((s * 0.036, 0.004, 0))
        e = head_point(V((s * 0.97, 0.1, 0.0)).normalized(), 0.01)
        tube(mb, [a, a + V((s * 0.012, 0.02, 0)), e], [0.004, 0.004, 0.0035], 5, 'm_eye', wf, ref=V((0, 0, 1)))
    # bridge
    l = face_frame(0.021, EYE_Z + 0.004, 0.028)[0]
    r = face_frame(-0.021, EYE_Z + 0.004, 0.028)[0]
    m = face_frame(0.0, EYE_Z + 0.010, 0.032)[0]
    tube(mb, [l, m, r], [0.0038] * 3, 5, 'm_eye', wf, ref=V((0, 0, 1)))
    return mb


def scarf_mesh():
    mb = MB()

    def wf(p):
        k = smoothstep(1.42, 1.30, p.z)
        return {'neck': 1 - k * 0.7, 'chest': k * 0.7 + 0.0001}
    # thick roll around the neck with stripes
    NS = 14
    pts = []
    for k in range(NS):
        t = 2 * pi * k / NS
        pts.append(V((0.088 * sin(t), 0.006 - 0.084 * cos(t), 1.395 - 0.012 * cos(t))))
    rings = []
    for k in range(NS):
        d = pts[(k + 1) % NS] - pts[(k - 1) % NS]
        X, Y = frame_for(d, V((0, 0, 1)))
        out = (pts[k] - V((0, 0.004, pts[k].z))).normalized()
        rings.append(ring(pts[k], X, Y, 0.034, 0.030, 6))
    ids = [[mb.vert(p, wf(p)) for p in r] for r in rings]
    for k in range(NS):
        k2 = (k + 1) % NS
        mat = 'm_acc2' if k % 4 == 1 else 'm_acc'
        for j in range(6):
            mb.face((ids[k][j], ids[k][(j + 1) % 6], ids[k2][(j + 1) % 6], ids[k2][j]), mat)
    # hanging tail at the front (left)
    tail = [V((0.035, -0.095, 1.38)), V((0.05, -0.118, 1.30)), V((0.056, -0.126, 1.21)), V((0.058, -0.128, 1.15))]
    mats = ['m_acc', 'm_acc2', 'm_acc']
    tube(mb, tail, [(0.036, 0.012), (0.037, 0.012), (0.036, 0.012), (0.036, 0.011)], 8, 'm_acc', wf,
         ref=V((0, -1, 0)), matfn=lambda i: mats[i], p=3.0, cap_round=0.3)
    # fringe
    for k in range(2):
        x = 0.058 - 0.018 + 0.036 * k
        tube(mb, [V((x, -0.128, 1.15)), V((x, -0.128, 1.125))], [0.005, 0.004], 4, 'm_acc2', wf, ref=V((0, -1, 0)))
    return mb


def beard_mesh():
    mb = MB()
    NC, NR = 18, 5

    def thick(th, phi):
        chin = smoothstep(1.4, 0.0, abs(phi)) * smoothstep(radians(100), radians(150), th)
        return 0.008 + 0.02 * chin + 0.003 * sin(9 * phi)
    rows = []
    for ci in range(NC + 1):
        phi = -1.62 + 3.24 * ci / NC
        a = abs(phi)
        # top edge: sideburn high at the sides, dipping under the mouth in front
        top = radians(lerp(120, 96, smoothstep(0.35, 1.3, a)))
        bot = radians(lerp(172, 118, smoothstep(0.2, 1.62, a)))
        col = []
        for ri in range(NR + 1):
            th = lerp(top, bot, ri / NR)
            u = sph(th, phi)
            t = thick(th, phi) * (0.35 + 0.65 * smoothstep(0, 0.35, ri / NR)) * (0.4 + 0.6 * smoothstep(0, 0.2, 1 - ri / NR))
            p = head_point(u, t + 0.002)
            col.append(p)
        rows.append(col)
    ids = [[mb.vert(p, head_w(p)) for p in col] for col in rows]
    for ci in range(NC):
        for ri in range(NR):
            a, b, c, d = ids[ci][ri], ids[ci + 1][ri], ids[ci + 1][ri + 1], ids[ci][ri + 1]
            o = mb.v[a] - HEAD_C
            mb.face_out((a, b, c, d), 'm_hair', o)
    # moustache
    for s in (1, -1):
        pts = [face_frame(s * 0.004, EYE_Z - 0.064, 0.008)[0], face_frame(s * 0.025, EYE_Z - 0.066, 0.008)[0],
               face_frame(s * 0.042, EYE_Z - 0.078, 0.006)[0]]
        tube(mb, pts, [(0.009, 0.006), (0.011, 0.007), (0.006, 0.004)], 6, 'm_hair', head_w, ref=V((0, -1, 0)))
    return mb


def apron_mesh():
    mb = MB()

    def wf(p):
        side = 'l' if p.x > 0 else 'r'
        if p.z > 1.03:
            return chain_blend(p.z, ['spine', 'chest'], [1.17], [0.06])
        k = smoothstep(0.95, 0.62, p.z)
        w = {'hips': 1 - k * 0.5}
        if abs(p.x) > 0.02:
            w['thigh_' + side] = k * 0.5
        else:
            w['thigh_l'] = k * 0.25
            w['thigh_r'] = k * 0.25
        return w
    # front panel following the torso front, from the chest to mid thigh
    NX, NZ = 5, 7
    rows = []
    for iz in range(NZ):
        z = lerp(1.25, 0.62, iz / (NZ - 1))
        halfw = 0.11 if z > 1.02 else lerp(0.14, 0.16, (1.02 - z) / 0.4)
        colr = []
        for ix in range(NX):
            u = -1 + 2 * ix / (NX - 1)
            x = u * halfw
            # front surface of the torso at that height (approx)
            if z > 1.0:
                y = -0.108 - 0.012 - 0.01 * smoothstep(1.02, 1.2, z)
                y += 0.03 * u * u
            else:
                y = -0.125 + 0.02 * u * u - 0.03 * smoothstep(0.9, 0.62, z)
            colr.append(V((x, y, z)))
        rows.append(colr)
    ids = [[mb.vert(p, wf(p)) for p in r] for r in rows]
    for iz in range(NZ - 1):
        for ix in range(NX - 1):
            mb.face_out((ids[iz][ix], ids[iz][ix + 1], ids[iz + 1][ix + 1], ids[iz + 1][ix]), 'm_acc', V((0, -1, 0)))
    # back side of the panel (so it has two faces)
    ids2 = [[mb.vert(p + V((0, 0.006, 0)), wf(p)) for p in r] for r in rows]
    for iz in range(NZ - 1):
        for ix in range(NX - 1):
            mb.face_out((ids2[iz][ix], ids2[iz][ix + 1], ids2[iz + 1][ix + 1], ids2[iz + 1][ix]), 'm_acc', V((0, 1, 0)))
    # neck strap + waist ties
    tube(mb, [rows[0][0], V((0.075, -0.06, 1.36)), V((0.0, 0.07, 1.40)), V((-0.075, -0.06, 1.36)), rows[0][-1]],
         [0.008] * 5, 5, 'm_acc', lambda p: {'chest': 1.0}, ref=V((0, 0, 1)))
    for s in (1, -1):
        tube(mb, [V((s * 0.15, -0.09, 1.0)), V((s * 0.168, 0.0, 1.0)), V((s * 0.12, 0.10, 1.0))], [0.008] * 3, 5,
             'm_acc', lambda p: {'spine': 0.5, 'hips': 0.5}, ref=V((0, 0, 1)))
    # pocket
    slab(mb, 'm_acc2', V((0.0, -0.152, 0.86)), axes_from(V((0, -1, -0.05)), V((1, 0, 0))), (0.08, 0.045, 0.004),
         lambda p: {'hips': 0.8, 'thigh_l': 0.1, 'thigh_r': 0.1}, p=4.0, seg=12)
    return mb


# ---- tops -------------------------------------------------------------------------------------

def sleeves(mb, mat, cuff_mat=None, puff=0.0):
    """Long sleeves over the arm tube (mid upper arm to wrist)."""
    for side in ('l', 'r'):
        sh, el, wr, tip = arm_points(side)
        s = 1 if side == 'l' else -1
        start = V((s * 0.105, 0.0, 1.345))
        ua, fa = el - sh, wr - el
        pts = [start, sh, sh + ua * 0.5, el, el + fa * 0.5, wr - fa * 0.06, wr - fa * 0.02, wr + fa.normalized() * 0.004]
        rad = [0.061, 0.069 + puff, 0.065 + puff, 0.060 + puff, 0.056 + puff, 0.051, 0.051, 0.044]
        cm = cuff_mat or mat
        mats = [mat] * 5 + [cm, cm]
        tube(mb, pts, rad, 8, mat, arm_w(side), ref=V((0, -1, 0)), matfn=lambda i, mats=mats: mats[i], cap1=False)


def torso_shell(mb, mat, zs, grow, open_front=None, matfn=None, cap_top=False):
    """A shell over the torso between heights zs (list), grown outward by `grow`."""
    T = [(0.91, 0.162, 0.108, 0.012), (0.97, 0.158, 0.103, 0.004), (1.012, 0.151, 0.098, 0.0),
         (1.05, 0.153, 0.100, -0.004), (1.12, 0.155, 0.103, -0.009), (1.20, 0.166, 0.110, -0.013),
         (1.27, 0.171, 0.106, -0.010), (1.325, 0.160, 0.095, -0.003), (1.365, 0.118, 0.077, 0.003),
         (1.395, 0.062, 0.054, 0.006)]

    def at(z):
        for i in range(len(T) - 1):
            if T[i][0] <= z <= T[i + 1][0]:
                t = (z - T[i][0]) / (T[i + 1][0] - T[i][0])
                return tuple(lerp(T[i][k], T[i + 1][k], t) for k in range(4))
        return T[0] if z < T[0][0] else T[-1]
    rings = []
    for z in zs:
        _, rx, ry, yo = at(z)
        g = grow(z) if callable(grow) else grow
        rings.append(ring(V((0, yo, z)), V((1, 0, 0)), V((0, 1, 0)), rx + g, ry + g, 16, 2.6 if z > 1.1 else 2.3))
    return loft(mb, rings, mat, torso_w, matfn=matfn)


def hoodie_mesh():
    mb = MB()
    # body shell (slightly baggy) with a ribbed hem
    torso_shell(mb, 'm_top', [0.93, 0.945, 1.05, 1.2, 1.31, 1.355], lambda z: 0.013 if z > 0.94 else 0.007)
    sleeves(mb, 'm_top', puff=0.004)
    # hood bunched behind the neck: fat half-torus
    NS = 9
    pts = []
    for k in range(NS):
        t = -1.9 + 3.8 * k / (NS - 1)           # around the back
        pts.append(V((0.098 * sin(t), 0.014 + 0.08 * cos(t), 1.38 + 0.03 * cos(t) ** 2)))
    rad = [(0.022 + 0.02 * cos(0.8 * (-1.9 + 3.8 * k / (NS - 1))), 0.03 + 0.014 * cos(0.8 * (-1.9 + 3.8 * k / (NS - 1)))) for k in range(NS)]
    tube(mb, pts, rad, 6, 'm_top', lambda p: {'chest': 0.6, 'neck': 0.4}, ref=V((0, 0, 1)))
    # hood back panel lying on the upper back
    c = V((0, 0.118, 1.30))
    slab(mb, 'm_top', c, axes_from(V((0, 1, 0.25)), V((1, 0, 0))), (0.085, 0.07, 0.012), lambda p: {'chest': 1.0},
         p=2.4, seg=10)
    # drawstrings
    for s in (1, -1):
        tube(mb, [V((s * 0.03, -0.09, 1.36)), V((s * 0.034, -0.118, 1.30)), V((s * 0.036, -0.122, 1.24))],
             [0.0045, 0.0045, 0.006], 5, 'm_acc2', lambda p: {'chest': 1.0}, ref=V((0, -1, 0)))
    # kangaroo pocket
    slab(mb, 'm_top', V((0, -0.118, 1.03)), axes_from(V((0, -1, 0.1)), V((1, 0, 0))), (0.10, 0.055, 0.008),
         lambda p: {'spine': 0.6, 'hips': 0.4}, p=2.6, seg=10)
    return mb


def collar(mb, mat, z=1.385, spread=0.8, height=0.03, flare=0.018):
    """Folded shirt collar around the neck base, open at the front."""
    NS = 12
    top, bot = [], []
    for k in range(NS):
        t = -pi + spread / 2 + (2 * pi - spread) * k / (NS - 1)     # 0 = front; skip the front gap
        n = V((sin(t), -cos(t), 0))
        base = V((0, 0.008, z)) + n * 0.064
        top.append(base + V((0, 0, height)) + n * 0.004)
        bot.append(base + n * flare + V((0, 0, -0.012)))
    # collar is a folded band: build a thin two-sided strip from top edge to the outer bottom edge
    wf = lambda p: {'neck': 0.4, 'chest': 0.6}
    ids_t = [mb.vert(p, wf(p)) for p in top]
    ids_b = [mb.vert(p, wf(p)) for p in bot]
    ids_t2 = [mb.vert(p - (p - V((0, 0.006, p.z))).normalized() * 0.004, wf(p)) for p in top]
    ids_b2 = [mb.vert(p - (p - V((0, 0.006, p.z))).normalized() * 0.004 + V((0, 0, 0.003)), wf(p)) for p in bot]
    for k in range(NS - 1):
        o = mb.v[ids_b[k]] - V((0, 0.006, mb.v[ids_b[k]].z))
        mb.face_out((ids_t[k], ids_t[k + 1], ids_b[k + 1], ids_b[k]), mat, o + V((0, 0, 0.5 * o.length)))
        mb.face_out((ids_t2[k], ids_t2[k + 1], ids_b2[k + 1], ids_b2[k]), mat, -o)
    # collar points at the front
    for s in (1, -1):
        k0 = 0 if s < 0 else NS - 1
        # points: triangular flaps
        a = mb.v[ids_t[k0]]
        b = mb.v[ids_b[k0]]
        tip = b + V((0, -0.01, -0.03)) + V((-s * 0.006, 0, 0))
        i0 = mb.vert(a, wf(a))
        i1 = mb.vert(b, wf(b))
        i2 = mb.vert(tip, wf(tip))
        mb.face_out((i0, i1, i2), mat, V((0, -1, 0.3)))
        j0 = mb.vert(a + V((0, 0.003, 0)), wf(a))
        j1 = mb.vert(b + V((0, 0.003, 0)), wf(b))
        j2 = mb.vert(tip + V((0, 0.003, 0)), wf(tip))
        mb.face_out((j0, j1, j2), mat, V((0, 1, -0.3)))


def polo_mesh():
    mb = MB()
    collar(mb, 'm_top', spread=0.9)
    # placket with buttons
    slab(mb, 'm_top', V((0, -0.103, 1.30)), axes_from(V((0, -1, 0.15)), V((1, 0, 0))), (0.014, 0.05, 0.004),
         lambda p: {'chest': 1.0}, p=4.0, seg=10)
    for z in (1.33, 1.285):
        ellipsoid(mb, V((0, -0.109, z)), (0.006, 0.006, 0.003), 6, 3, 'm_acc2', lambda p: {'chest': 1.0},
                  axes_from(V((0, -1, 0.15))))
    # sleeve cuffs over the short sleeves
    for side in ('l', 'r'):
        sh, el, wr, tip = arm_points(side)
        ua = el - sh
        tube(mb, [sh + ua * 0.36, sh + ua * 0.42, sh + ua * 0.435], [0.059, 0.060, 0.057], 10, 'm_top', arm_w(side),
             cap0=False, cap1=False)
    return mb


def blazer_mesh():
    mb = MB()
    # jacket shell with the front slightly open (a V of shirt shows via m_acc2 panel on top)
    torso_shell(mb, 'm_top', [0.86, 0.875, 0.97, 1.12, 1.25, 1.33, 1.375], lambda z: 0.016 if z > 0.87 else 0.008)
    sleeves(mb, 'm_top', puff=0.005)
    # shirt V (m_acc2) + lapels
    pts_v = [V((0, -0.118, 1.36)), V((0.052, -0.114, 1.37)), V((0.0, -0.126, 1.13)), V((-0.052, -0.114, 1.37))]
    wf = lambda p: {'chest': 1.0} if p.z > 1.17 else {'chest': 0.6, 'spine': 0.4}
    i = [mb.vert(p, wf(p)) for p in pts_v]
    mb.face_out((i[0], i[1], i[2]), 'm_acc2', V((0, -1, 0)))
    mb.face_out((i[0], i[2], i[3]), 'm_acc2', V((0, -1, 0)))
    for s in (1, -1):
        # lapel: a flat triangular-ish flap from the collar down to the button point
        lp = [V((s * 0.055, -0.112, 1.375)), V((s * 0.09, -0.114, 1.33)), V((s * 0.072, -0.13, 1.25)),
              V((s * 0.004, -0.132, 1.12))]
        ids = [mb.vert(p, wf(p)) for p in lp]
        ids2 = [mb.vert(p + V((0, 0.004, 0)), wf(p)) for p in lp]
        mb.face_out((ids[0], ids[1], ids[2], ids[3]), 'm_top', V((0, -1, 0)))
        mb.face_out((ids2[0], ids2[1], ids2[2], ids2[3]), 'm_top', V((0, 1, 0)))
        # the lapel edge line: darker? keep geometry: a small roll along the inner edge
        tube(mb, [lp[0], lp[3]], [0.004, 0.004], 5, 'm_top', wf, ref=V((0, -1, 0)))
    # button
    ellipsoid(mb, V((0.0, -0.132, 1.1)), (0.008, 0.008, 0.004), 6, 3, 'm_eye', lambda p: {'spine': 1.0},
              axes_from(V((0, -1, 0))))
    # pocket flaps
    for s in (1, -1):
        slab(mb, 'm_top', V((s * 0.1, -0.124, 0.97)), axes_from(V((s * 0.2, -1, 0)), V((1, 0, 0))),
             (0.035, 0.01, 0.004), lambda p: {'hips': 0.6, 'spine': 0.4}, p=4.0, seg=8)
    return mb


def sweater_mesh():
    mb = MB()
    # shirt sleeves (m_acc2) under the vest
    sleeves(mb, 'm_acc2', puff=0.002)
    collar(mb, 'm_acc2', spread=0.9, height=0.026)
    # knit vest shell with pattern bands
    zs = [0.93, 0.945, 1.0, 1.05, 1.075, 1.14, 1.165, 1.25, 1.345]
    band = {3: 'm_acc2', 5: 'm_acc2'}
    torso_shell(mb, 'm_top', zs, lambda z: 0.011 if z > 0.95 else 0.006, matfn=lambda i: band.get(i, 'm_top'))
    # V-neck insert of shirt
    wf = lambda p: {'chest': 1.0}
    pts = [V((0, -0.112, 1.355)), V((0.045, -0.106, 1.36)), V((0, -0.118, 1.24)), V((-0.045, -0.106, 1.36))]
    i = [mb.vert(p, wf(p)) for p in pts]
    mb.face_out((i[0], i[1], i[2]), 'm_acc2', V((0, -1, 0)))
    mb.face_out((i[0], i[2], i[3]), 'm_acc2', V((0, -1, 0)))
    # V-neck rib
    for s in (1, -1):
        tube(mb, [V((s * 0.055, -0.104, 1.355)), V((0, -0.121, 1.235))], [0.006, 0.006], 5, 'm_top', wf, ref=V((0, -1, 0)))
    return mb


def uniform_mesh():
    mb = MB()
    collar(mb, 'm_acc', spread=1.0, height=0.024)
    # name tag
    slab(mb, 'm_acc2', V((0.075, -0.117, 1.25)), axes_from(V((0.1, -1, 0.05)), V((1, 0, 0))), (0.026, 0.012, 0.003),
         lambda p: {'chest': 1.0}, p=4.0, seg=10)
    # yellow sleeve trims
    for side in ('l', 'r'):
        sh, el, wr, tip = arm_points(side)
        ua = el - sh
        tube(mb, [sh + ua * 0.37, sh + ua * 0.41, sh + ua * 0.43], [0.0585, 0.0595, 0.057], 10, 'm_acc', arm_w(side),
             cap0=False, cap1=False)
    # placket stripe
    slab(mb, 'm_acc', V((0, -0.108, 1.28)), axes_from(V((0, -1, 0.1)), V((1, 0, 0))), (0.01, 0.08, 0.003),
         lambda p: {'chest': 1.0}, p=4.0, seg=8)
    return mb


# --------------------------------------------------------------------------------------------
# object creation
# --------------------------------------------------------------------------------------------

def make_object(name, mb, rig, coll):
    mats = []
    for m in mb.fm:
        if m not in mats:
            mats.append(m)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in mb.v], [], mb.f)
    me.validate(clean_customdata=False)
    for m in mats:
        me.materials.append(MATS[m])
    mi = [mats.index(m) for m in mb.fm]
    me.polygons.foreach_set('material_index', mi)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    groups = {b: ob.vertex_groups.new(name=b) for b in BONES}
    for i, w in enumerate(mb.w):
        if callable(w):
            w = w(mb.v[i])
        for b, val in norm_weights(w).items():
            groups[b].add([i], val, 'REPLACE')
    for b in BONES:
        pass
    ob.parent = rig
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = rig
    return ob


def add_shape_keys(body, mb_base, face_range):
    body.shape_key_add(name='Basis', from_mix=False)
    a, b = face_range
    for name, params in MORPHS.items():
        P = dict(FACE_BASE)
        P.update(params)
        tmp = MB()
        build_face(tmp, P)
        assert len(tmp.v) == b - a, (name, len(tmp.v), b - a)
        sk = body.shape_key_add(name=name, from_mix=False)
        for k, co in enumerate(tmp.v):
            sk.data[a + k].co = co
        sk.value = 0.0


def make_sockets(rig, coll):
    socks = {}
    for side in ('l', 'r'):
        wr, d, palm, thumb = hand_frame(side)
        pos = wr + d * 0.07 + palm * 0.036
        z = thumb.normalized()
        y = -d
        x = y.cross(z)
        M = Matrix((x, y, z)).transposed().to_4x4()
        M.translation = pos
        e = bpy.data.objects.new('socket_' + side, None)
        e.empty_display_type = 'ARROWS'
        e.empty_display_size = 0.06
        coll.objects.link(e)
        e.parent = rig
        e.parent_type = 'BONE'
        e.parent_bone = 'hand_' + side
        bpy.context.view_layer.update()
        e.matrix_world = M
        socks[side] = e
    return socks


# --------------------------------------------------------------------------------------------
# pose solver: FK (world-axis deltas) + analytic two-bone IK
# --------------------------------------------------------------------------------------------
class Solver:
    def __init__(self, rig):
        self.rig = rig
        bones = rig.data.bones
        self.rest = {b: bones[b].matrix_local.copy() for b in BONES}
        self.rest3 = {b: self.rest[b].to_3x3().normalized() for b in BONES}
        self.head = {b: self.rest[b].translation.copy() for b in BONES}
        self.parent = {b: BONE_DEFS[b][2] for b in BONES}
        self.rel = {}
        for b in BONES:
            p = self.parent[b]
            self.rel[b] = (self.rest[p].inverted() @ self.rest[b]) if p else self.rest[b]
        self.ik = {}
        for side in ('l', 'r'):
            self.ik['leg_' + side] = self._chain('thigh_' + side, 'shin_' + side, 'foot_' + side)
            self.ik['arm_' + side] = self._chain('upperarm_' + side, 'forearm_' + side, 'hand_' + side)

    def _chain(self, up, lo, end):
        A0, K0, T0 = self.head[up], self.head[lo], self.head[end]
        d = (T0 - A0).normalized()
        pp = (K0 - A0) - d * (K0 - A0).dot(d)
        pp.normalize()
        n = pp.cross(d).normalized()
        d1 = (K0 - A0).normalized()
        d2 = (T0 - K0).normalized()
        return dict(up=up, lo=lo, end=end, L1=(K0 - A0).length, L2=(T0 - K0).length,
                    F1=Matrix((n, d1, n.cross(d1))).transposed(), F2=Matrix((n, d2, n.cross(d2))).transposed())

    def solve_ik(self, ch, Apos, T, pole):
        L1, L2 = ch['L1'], ch['L2']
        v = T - Apos
        dist = clamp(v.length, abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995)
        dr = v.normalized()
        a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
        h = math.sqrt(max(0.0, L1 * L1 - a * a))
        pp = pole - dr * pole.dot(dr)
        if pp.length < 1e-6:
            pp = V((0, -1, 0)) - dr * dr.y * -1
        pp.normalize()
        K = Apos + dr * a + pp * h
        Tc = Apos + dr * dist
        d1 = (K - Apos).normalized()
        d2 = (Tc - K).normalized()
        n = pp.cross(dr).normalized()
        F1 = Matrix((n, d1, n.cross(d1))).transposed()
        F2 = Matrix((n, d2, n.cross(d2))).transposed()
        return F1 @ ch['F1'].transposed(), F2 @ ch['F2'].transposed()

    def pose(self, sp):
        """sp: D {bone: Quaternion delta (world axes, parent frame)}, W {bone: absolute world rotation},
        off (hips offset), ik {name: dict(target, pole, rot=None|Quaternion world, rel=None)}.
        Returns {bone: Matrix4 basis}."""
        D, Wd, off, ik = sp.get('D', {}), sp.get('W', {}), sp.get('off', V()), sp.get('ik', {})
        A, H = {}, {}
        override = {}
        for b in BONES:
            p = self.parent[b]
            if p is None:
                H[b] = self.head[b].copy()
                A[b] = Matrix.Identity(3)
            else:
                H[b] = H[p] + A[p] @ (self.head[b] - self.head[p])
                if b == 'hips':
                    H[b] = H[b] + off
                if b in override:
                    A[b] = override[b]
                elif b in Wd:
                    A[b] = Wd[b].to_matrix()
                else:
                    A[b] = A[p] @ D.get(b, Quaternion()).to_matrix()
            # IK chains start at their upper bone
            for name, ch in self.ik.items():
                if ch['up'] == b and name in ik:
                    spec = ik[name]
                    Aup, Alo = self.solve_ik(ch, H[b], spec['target'], spec['pole'])
                    A[b] = Aup
                    override[ch['lo']] = Alo
                    if spec.get('rot') is not None:
                        override[ch['end']] = spec['rot'].to_matrix()
                    elif spec.get('rel') is not None:
                        override[ch['end']] = Alo @ spec['rel'].to_matrix()
        M = {}
        for b in BONES:
            m = (A[b] @ self.rest3[b]).to_4x4()
            m.translation = H[b]
            M[b] = m
        basis = {}
        for b in BONES:
            p = self.parent[b]
            if p is None:
                basis[b] = self.rest[b].inverted() @ M[b]
            else:
                basis[b] = self.rel[b].inverted() @ M[p].inverted() @ M[b]
        return basis, M


# rotation helpers (degrees, world axes).  +rx = pitch forward (top toward -Y); +rz = turn left;
# +ry = tilt toward the left (+X).  For arms hanging down: ry(+) on the left arm lowers it.
def q(x=0.0, y=0.0, z=0.0):
    return Euler((radians(x), radians(y), radians(z)), 'XYZ').to_quaternion()


def mir(qt):
    """Mirror a left-side rotation to the right side (x -> -x)."""
    return Quaternion((qt.w, qt.x, -qt.y, -qt.z))


def sided(side, qt):
    return qt if side == 'l' else mir(qt)


def S(t, f=1.0, ph=0.0):
    return sin(2 * pi * (f * t + ph))


def C(t, f=1.0, ph=0.0):
    return cos(2 * pi * (f * t + ph))


def ease(x):
    x = clamp(x, 0, 1)
    return x * x * (3 - 2 * x)


def env(t, a, b, c, d):
    """0 before a, ramps to 1 by b, holds, ramps down from c to 0 at d."""
    return ease((t - a) / max(b - a, 1e-6)) * (1 - ease((t - c) / max(d - c, 1e-6)))


# ---- base poses --------------------------------------------------------------------------------
SEAT_HIP = 0.555        # hips bone height when seated -> buttocks rest on a 0.46 m seat
FOOT_FLAT_L = q(z=7)
FOOT_FLAT_R = mir(q(z=7))


def new_spec():
    return {'D': {}, 'W': {}, 'off': V((0, 0, 0)), 'ik': {}, 'morph': {}}


def mul(sp, bone, qt):
    sp['D'][bone] = sp['D'].get(bone, Quaternion()) @ qt


def feet_planted(sp, width=0.105, fwd=(0.0, 0.0), lift=(0.0, 0.0), toe=7):
    for side, sg, k in (('l', 1, 0), ('r', -1, 1)):
        sp['ik']['leg_' + side] = dict(target=V((sg * width, fwd[k], ANKLE_Z + lift[k])),
                                       pole=V((sg * 0.12, -1, 0.1)), rot=sided(side, q(z=toe)))


def arms_relaxed(sp, t=0.0, amt=1.0, swing=(0.0, 0.0), bend=(14.0, 14.0), out=4.0):
    for side, sg, k in (('l', 1, 0), ('r', -1, 1)):
        mul(sp, 'upperarm_' + side, sided(side, q(x=-swing[k], y=(32 - out) * amt)))
        mul(sp, 'forearm_' + side, sided(side, q(x=-bend[k])))
        mul(sp, 'hand_' + side, sided(side, q(x=-4, y=-6)))


def breathe(sp, t, f=2, amp=1.0):
    b = S(t, f)
    mul(sp, 'chest', q(x=-1.2 * amp * b))
    mul(sp, 'neck', q(x=0.8 * amp * b))
    for side in ('l', 'r'):
        mul(sp, 'shoulder_' + side, sided(side, q(y=-1.0 * amp * b)))
    sp['off'] += V((0, 0, 0.002 * amp * b))


def stand_base(t, sway=1.0, look=True):
    sp = new_spec()
    sh = S(t, 1)
    sp['off'] = V((0.016 * sway * sh, 0.0, -0.012 - 0.004 * abs(sh)))
    mul(sp, 'hips', q(y=-2.2 * sway * sh, z=1.5 * sway * S(t, 1, 0.25)))
    mul(sp, 'spine', q(x=1.0, y=1.4 * sway * sh))
    mul(sp, 'chest', q(y=0.8 * sway * sh))
    feet_planted(sp)
    breathe(sp, t)
    arms_relaxed(sp, t, swing=(2 + 1.5 * S(t, 1, 0.1), 2 - 1.5 * S(t, 1, 0.1)))
    if look:
        # look around: left, back, right, back
        yaw = 16 * env(t, 0.12, 0.22, 0.34, 0.44) - 12 * env(t, 0.58, 0.68, 0.8, 0.9)
        mul(sp, 'neck', q(z=yaw * 0.4))
        mul(sp, 'head', q(x=-2 + 3 * S(t, 1, 0.3), z=yaw * 0.6, y=2 * S(t, 1, 0.6)))
    return sp


def seat_base(t, lean=0.0, feet=(-0.40, -0.40), fx=0.12):
    sp = new_spec()
    sp['off'] = V((0, 0.0, SEAT_HIP - HIP_Z))
    mul(sp, 'hips', q(x=-6 + lean * 0.3))
    mul(sp, 'spine', q(x=4 + lean * 0.4))
    mul(sp, 'chest', q(x=2 + lean * 0.3))
    for side, sg, k in (('l', 1, 0), ('r', -1, 1)):
        sp['ik']['leg_' + side] = dict(target=V((sg * fx, feet[k], ANKLE_Z)), pole=V((sg * 0.15, -1, 0.9)),
                                       rot=sided(side, q(z=5)))
    return sp


def hand_rot(side, fingers, palm):
    """Absolute world rotation of a hand from the desired finger direction and palm normal."""
    sh, el, wr, tip = arm_points(side)
    s = 1 if side == 'l' else -1
    d0 = (tip - wr).normalized()
    p0 = V((-s, 0, 0))
    p0 = (p0 - d0 * p0.dot(d0)).normalized()
    F0 = Matrix((p0, d0, p0.cross(d0))).transposed()
    d1 = fingers.normalized()
    p1 = (palm - d1 * palm.dot(d1)).normalized()
    F1 = Matrix((p1, d1, p1.cross(d1))).transposed()
    return (F1 @ F0.transposed()).to_quaternion()


def arm_ik(sp, side, target, pole, fingers=None, palm=None, rel=None):
    spec = dict(target=target, pole=pole)
    if fingers is not None:
        spec['rot'] = hand_rot(side, fingers, palm)
    elif rel is not None:
        spec['rel'] = rel
    sp['ik']['arm_' + side] = spec


SOLVER = None
_RELAX = {}


def relaxed(side):
    """Wrist position, hand rotation and elbow pole of the relaxed standing arm (stand_base(0))."""
    if not _RELAX:
        _, M = SOLVER.pose(stand_base(0.0, look=False))
        for sd in ('l', 'r'):
            wr = M['hand_' + sd].translation.copy()
            el = M['forearm_' + sd].translation.copy()
            sh = M['upperarm_' + sd].translation.copy()
            rot = (M['hand_' + sd].to_3x3() @ SOLVER.rest3['hand_' + sd].inverted()).to_quaternion()
            dr = (wr - sh).normalized()
            pp = (el - sh) - dr * (el - sh).dot(dr)
            _RELAX[sd] = (wr, rot, pp.normalized())
    return _RELAX[side]


def arm_blend(sp, side, k, target, pole, fingers, palm):
    """IK arm blended from the relaxed standing arm (k=0) to a target pose (k=1)."""
    wr, rot, rpole = relaxed(side)
    tq = hand_rot(side, fingers, palm)
    if rot.dot(tq) < 0:
        tq = -tq
    sp['ik']['arm_' + side] = dict(target=wr.lerp(target, k), pole=rpole.lerp(pole.normalized(), k), rot=rot.slerp(tq, k))


# ---- clips --------------------------------------------------------------------------------------

def clip_idle(t):
    return stand_base(t)


def clip_idle_tired(t):
    sp = stand_base(t, sway=1.6, look=False)
    sig = env(t, 0.3, 0.45, 0.55, 0.75)          # a big sigh
    mul(sp, 'spine', q(x=6 + 2 * sig))
    mul(sp, 'chest', q(x=7 - 5 * sig))
    mul(sp, 'neck', q(x=10))
    mul(sp, 'head', q(x=12 + 6 * S(t, 1, 0.1) - 10 * sig, y=5 * S(t, 1, 0.35)))
    for side in ('l', 'r'):
        mul(sp, 'shoulder_' + side, sided(side, q(y=5 - 7 * sig, x=5)))
        mul(sp, 'upperarm_' + side, sided(side, q(y=4, x=-4)))
    sp['off'] += V((0, 0, -0.01 - 0.006 * sig))
    sp['morph'] = {'sleepy': 0.55 + 0.45 * env(t, 0.78, 0.83, 0.9, 0.96) - 0.25 * sig}
    return sp


def walk_foot(ph, f=0.52, half=0.351):
    """Ankle (y, z) and foot pitch for a local phase ph in [0, 1)."""
    if ph < f:
        u = ph / f
        y = -half + 2 * half * u
        pitch = 0.0
        if u < 0.14:
            pitch = 14 * (1 - u / 0.14)            # heel strike, toes up
        elif u > 0.72:
            pitch = -30 * ease((u - 0.72) / 0.28)   # heel rises
        z = ANKLE_Z
        if pitch < 0:
            r = radians(-pitch)
            z += 0.105 * sin(r)
            y -= 0.105 * (1 - cos(r))
        elif pitch > 0:
            z += 0.045 * sin(radians(pitch))
        return y, z, pitch
    u = (ph - f) / (1 - f)
    e = ease(u)
    y = half - 2 * half * (0.5 - 0.5 * cos(pi * u))
    pitch = lerp(-30, 14, ease(u * 1.2)) if u < 0.83 else 14
    z = ANKLE_Z + 0.105 * sin(radians(30)) * (1 - ease(u * 3)) + 0.075 * sin(pi * u) ** 1.2
    return y, z, pitch


def clip_walk(t):
    sp = new_spec()
    sp['off'] = V((0.016 * S(t, 1), 0.0, -0.028 - 0.016 * C(t, 2)))
    mul(sp, 'hips', q(z=-6 * C(t, 1), y=-2.5 * S(t, 1), x=2))
    mul(sp, 'spine', q(x=3, z=4 * C(t, 1)))
    mul(sp, 'chest', q(x=1 + 1.5 * C(t, 2), z=5 * C(t, 1)))
    mul(sp, 'neck', q(x=-1))
    mul(sp, 'head', q(x=-2 - 1.5 * C(t, 2), z=-3 * C(t, 1)))
    for side, sg, ph in (('l', 1, 0.0), ('r', -1, 0.5)):
        lp = (t + ph) % 1.0
        y, z, pitch = walk_foot(lp)
        rot = q(x=-pitch) @ sided(side, q(z=5))
        # y runs from -half (heel strike, in front: character forward is -Y) to +half (behind)
        sp['ik']['leg_' + side] = dict(target=V((sg * 0.098, y, z)), pole=V((sg * 0.1, -1, 0.1)), rot=rot)
    # arms swing opposite to the legs
    sw = 20 * C(t, 1)
    arms_relaxed(sp, t, swing=(-sw, sw), bend=(16 + 8 * max(0, -C(t, 1)), 16 + 8 * max(0, C(t, 1))), out=2)
    for side in ('l', 'r'):
        mul(sp, 'shoulder_' + side, sided(side, q(y=-1.5 * C(t, 2))))
    return sp


def clip_sit_idle(t):
    sp = seat_base(t, lean=-4)
    breathe(sp, t)
    yaw = 18 * env(t, 0.15, 0.25, 0.4, 0.5) - 10 * env(t, 0.62, 0.7, 0.82, 0.9)
    mul(sp, 'head', q(x=-2, z=yaw, y=3 * S(t, 1)))
    for side, sg in (('l', 1), ('r', -1)):
        arm_ik(sp, side, V((sg * 0.135, -0.30, SEAT_HIP + 0.05)), V((sg * 0.6, 0.6, -0.3)),
               fingers=V((sg * 0.1, -1, -0.35)), palm=V((0, 0, -1)))
    # foot tap on the right
    tap = max(0.0, S(t, 8)) * env(t, 0.5, 0.55, 0.85, 0.9)
    sp['ik']['leg_r']['rot'] = q(x=-14 * tap) @ sp['ik']['leg_r']['rot']
    sp['ik']['leg_r']['target'] = sp['ik']['leg_r']['target'] + V((0, 0, 0.012 * tap))
    return sp


KEY_Z = 0.80    # wrist height over a keyboard on a 0.75 m desk


def clip_sit_type(t):
    sp = seat_base(t, lean=8)
    breathe(sp, t, f=1, amp=0.7)
    mul(sp, 'neck', q(x=4))
    mul(sp, 'head', q(x=6 + 2 * S(t, 2), z=3 * S(t, 1, 0.2)))
    for side, sg, ph in (('l', 1, 0.0), ('r', -1, 0.37)):
        tap = 0.010 * max(0.0, S(t, 7, ph)) + 0.006 * max(0.0, S(t, 11, ph + 0.2))
        dx = 0.012 * S(t, 2, ph)
        arm_ik(sp, side, V((sg * (0.125 + dx), -0.40, KEY_Z + tap)), V((sg * 0.8, 0.5, -0.6)),
               fingers=V((sg * -0.12, -1, -0.45)), palm=V((sg * -0.15, 0, -1)))
    return sp


def clip_sit_think(t):
    sp = seat_base(t, lean=2)
    breathe(sp, t, f=1)
    # right hand on chin, left arm resting across on the desk / lap
    tilt = 7 * S(t, 1)
    mul(sp, 'spine', q(y=-2))
    mul(sp, 'chest', q(y=-3, z=-4))
    mul(sp, 'neck', q(x=-4))
    mul(sp, 'head', q(x=-10 + 3 * S(t, 1, 0.2), y=-8 + tilt * 0.4, z=10 * S(t, 1, 0.1)))
    chin = V((-0.012, -0.175, SEAT_HIP + 0.54))
    tapf = 0.006 * max(0, S(t, 6)) * env(t, 0.55, 0.6, 0.8, 0.85)
    arm_ik(sp, 'r', chin + V((0, 0, -0.07 + tapf)), V((-0.4, 0.2, -1)), fingers=V((0.35, -0.3, 1)), palm=V((0.2, 1, 0)))
    arm_ik(sp, 'l', V((0.02, -0.30, KEY_Z - 0.02)), V((0.8, 0.4, -0.6)), fingers=V((-1, -0.3, -0.1)), palm=V((0, 0, -1)))
    return sp


def clip_eat_sit(t):
    sp = seat_base(t, lean=6)
    breathe(sp, t, f=1, amp=0.6)
    # cycle: 0-0.25 reach to the plate, 0.25-0.45 bring up, 0.45-0.8 chew at mouth... back down
    up = env(t, 0.18, 0.38, 0.58, 0.8)
    plate = V((-0.13, -0.36, KEY_Z - 0.02))
    mouth = V((-0.03, -0.20, SEAT_HIP + 0.585))
    tgt = plate.lerp(mouth, up)
    arm_ik(sp, 'r', tgt, V((-0.35, 0.3, -1)), fingers=V((0.1, -0.6, 0.2)).lerp(V((0.6, -0.2, 0.8)), up),
           palm=V((0.3, 0.3, 1)).lerp(V((0.4, 1, 0)), up))
    arm_ik(sp, 'l', V((0.14, -0.38, KEY_Z - 0.02)), V((0.8, 0.4, -0.6)), fingers=V((-0.3, -1, -0.3)), palm=V((0, 0, -1)))
    chew = env(t, 0.5, 0.55, 0.9, 0.98) * S(t, 8)
    mul(sp, 'head', q(x=-4 * up + 2.5 * chew + 4, z=-4 * up))
    mul(sp, 'neck', q(x=5 * up))
    return sp


def clip_sleep(t):
    sp = new_spec()
    b = S(t, 1)
    # lie on the back: pelvis above root, head toward +Y (character's back), feet toward -Y
    sp['W']['hips'] = q(x=-90)
    sp['off'] = V((0, 0.0, 0.102 - HIP_Z))
    mul(sp, 'spine', q(x=-1.5 * b))
    mul(sp, 'chest', q(x=-2.0 * b))
    mul(sp, 'neck', q(x=10))
    mul(sp, 'head', q(x=8, z=16, y=4))
    for side in ('l', 'r'):
        mul(sp, 'shoulder_' + side, sided(side, q(y=-2 * b)))
    # legs relaxed, slightly apart, toes flop outward
    for side, sg in (('l', 1), ('r', -1)):
        mul(sp, 'thigh_' + side, sided(side, q(y=-4, z=6)))
        mul(sp, 'shin_' + side, sided(side, q(x=4)))
        mul(sp, 'foot_' + side, sided(side, q(x=-25, z=22)))
    # left hand on the belly, right arm resting on the mattress
    # left hand resting on the belly, right arm along the body on the mattress
    arm_ik(sp, 'l', V((0.04, 0.10, 0.225 + 0.004 * b)), V((1, -0.2, 0.2)), fingers=V((-1, 0.1, -0.1)), palm=V((0, 0, -1)))
    arm_ik(sp, 'r', V((-0.25, 0.02, 0.05)), V((-0.6, 0.3, 0.8)), fingers=V((-0.1, -1, -0.1)), palm=V((0.3, 0, -1)))
    sp['morph'] = {'sleepy': 1.0}
    return sp


def clip_cook(t):
    sp = stand_base(t * 0.5, sway=0.5, look=False)
    feet_planted(sp, fwd=(0.0, 0.03))
    mul(sp, 'spine', q(x=6))
    mul(sp, 'chest', q(x=4))
    mul(sp, 'neck', q(x=8))
    mul(sp, 'head', q(x=12 + 2 * S(t, 2), z=-6 + 6 * S(t, 1, 0.3)))
    # right hand stirs in a circle, left hand holds the pan handle
    ang = 2 * pi * t * 2
    stir = V((-0.10 + 0.035 * cos(ang), -0.36 + 0.035 * sin(ang), 1.02 + 0.01 * S(t, 4)))
    arm_ik(sp, 'r', stir, V((-0.9, 0.4, -0.6)), fingers=V((0.3, -0.6, -0.8)), palm=V((1, 0, 0.1)))
    arm_ik(sp, 'l', V((0.16, -0.35, 1.01 + 0.01 * S(t, 2))), V((0.9, 0.4, -0.5)), fingers=V((-0.2, -1, -0.1)),
           palm=V((-1, 0, 0.3)))
    return sp


def clip_cheer(t):
    sp = stand_base(0.0, look=False)
    crouch = env(t, 0.0, 0.12, 0.16, 0.26)
    air = env(t, 0.2, 0.3, 0.36, 0.48)
    arms = env(t, 0.1, 0.28, 0.7, 0.95)
    sp['off'] += V((0, 0, -0.07 * crouch + 0.07 * air))
    feet_planted(sp, lift=(0.06 * air, 0.06 * air))
    mul(sp, 'spine', q(x=10 * crouch - 6 * arms))
    mul(sp, 'head', q(x=-12 * arms))
    pump = 0.04 * S(t, 3) * env(t, 0.4, 0.5, 0.7, 0.85)
    for side, sg in (('l', 1), ('r', -1)):
        up = V((sg * 0.26, -0.06, 1.88 + pump))
        arm_blend(sp, side, arms, up, V((sg * 1, 0.2, -0.4)), fingers=V((sg * 0.2, -0.3, 1)), palm=V((-sg, 0, 0)))
    sp['morph'] = {}
    return sp


def clip_stressed(t):
    sp = stand_base(t, sway=1.2, look=False)
    mul(sp, 'spine', q(x=8))
    mul(sp, 'chest', q(x=5))
    shake = 10 * S(t, 2)
    mul(sp, 'neck', q(x=10, z=shake * 0.4))
    mul(sp, 'head', q(x=10, z=shake * 0.6))
    for side, sg in (('l', 1), ('r', -1)):
        arm_ik(sp, side, V((sg * 0.135, -0.07, 1.63 + 0.01 * S(t, 2, 0.25))), V((sg * 1, 0.4, -0.2)),
               fingers=V((-sg * 0.4, 0.2, 1)), palm=V((-sg, 0, 0)))
    return sp


def clip_phone(t):
    sp = stand_base(t, sway=0.8, look=False)
    mul(sp, 'neck', q(x=10))
    mul(sp, 'head', q(x=16 + 2 * S(t, 1), z=-4, y=3 * S(t, 1, 0.3)))
    scroll = 0.006 * max(0, S(t, 6)) * env(t, 0.1, 0.15, 0.6, 0.65)
    # phone upright in front of the chest, screen (socket +Y) tilted up toward the face
    arm_ik(sp, 'r', V((-0.05, -0.27, 1.10 + scroll)), V((-1, 0.4, -0.6)), fingers=V((0.1, -0.77, -0.64)),
           palm=V((1, 0, 0)))
    # left arm relaxed (idle arm from stand_base) with a small fidget
    mul(sp, 'upperarm_l', q(x=-4 * S(t, 1)))
    return sp


def clip_talk(t):
    sp = stand_base(t, sway=1.0, look=False)
    nod = S(t, 3)
    mul(sp, 'head', q(x=4 * nod, z=10 * S(t, 1, 0.2), y=5 * S(t, 1, 0.5)))
    mul(sp, 'chest', q(z=5 * S(t, 1, 0.1)))
    gl = env(t, 0.05, 0.2, 0.55, 0.7)
    gr = env(t, 0.35, 0.5, 0.85, 0.98)
    for side, sg, g, ph in (('l', 1, gl, 0.0), ('r', -1, gr, 0.3)):
        gest = V((sg * (0.21 + 0.04 * S(t, 3, ph)), -0.30, 1.08 + 0.05 * S(t, 2, ph)))
        arm_blend(sp, side, g, gest, V((sg * 1, 0.5, -0.5)), fingers=V((sg * 0.3, -1, 0.2)), palm=V((-sg * 0.3, 0.1, 1)))
    return sp


def clip_wave(t):
    sp = stand_base(0.0, look=False)
    up = env(t, 0.0, 0.2, 0.8, 1.0)
    wave = S(t, 3.0) * env(t, 0.2, 0.28, 0.72, 0.8)
    mul(sp, 'head', q(x=-4 * up, y=4 * up, z=6 * up))
    mul(sp, 'chest', q(y=3 * up))
    hi = V((-0.34 - 0.07 * wave, -0.10, 1.66 + 0.02 * abs(wave)))
    arm_blend(sp, 'r', up, hi, V((-1, 0.2, -0.4)), fingers=V((0.3 * wave - 0.15, -0.05, 1)), palm=V((0, -1, 0)))
    return sp


def clip_register(t):
    sp = stand_base(t * 0.5, sway=0.6, look=False)
    mul(sp, 'spine', q(x=3))
    look_up = env(t, 0.62, 0.7, 0.9, 0.98)
    mul(sp, 'neck', q(x=8 - 8 * look_up))
    mul(sp, 'head', q(x=12 - 16 * look_up, z=4 * S(t, 1)))
    tr = max(0.0, S(t, 4)) * (1 - look_up)
    tl = max(0.0, S(t, 2, 0.35)) * (1 - look_up)
    arm_ik(sp, 'r', V((-0.06 + 0.03 * S(t, 1), -0.36, 1.05 + 0.025 * tr)), V((-1, 0.4, -0.6)),
           fingers=V((0.2, -1, -0.4)), palm=V((0.1, 0, -1)))
    arm_ik(sp, 'l', V((0.12, -0.34, 1.03 + 0.02 * tl)), V((1, 0.4, -0.6)), fingers=V((-0.2, -1, -0.5)),
           palm=V((-0.1, 0, -1)))
    return sp


def clip_film(t):
    sp = stand_base(t, sway=0.8, look=False)
    talk = S(t, 3)
    mul(sp, 'chest', q(x=-3, z=-6))
    mul(sp, 'head', q(x=-8 + 3 * talk, z=-14 + 4 * S(t, 1, 0.3), y=4 * S(t, 1)))
    # selfie: arm up and forward, phone upright, screen (socket +Y) facing the face
    arm_ik(sp, 'r', V((-0.18, -0.48, 1.50 + 0.01 * S(t, 1))), V((-1, 0.1, -0.8)), fingers=V((0.15, -1, 0.1)),
           palm=V((1, 0.1, 0)))
    g = env(t, 0.2, 0.3, 0.6, 0.75)
    arm_blend(sp, 'l', g, V((0.22, -0.28, 1.1 + 0.04 * S(t, 3))), V((1, 0.5, -0.5)), fingers=V((0.3, -1, 0.3)),
              palm=V((-0.3, 0.1, 1)))
    sp['morph'] = {}
    return sp


def clip_carry(t):
    sp = stand_base(t, sway=0.0, look=False)
    b = S(t, 2)
    mul(sp, 'spine', q(x=-4))
    mul(sp, 'chest', q(x=-3 - 1 * b))
    mul(sp, 'head', q(x=2))
    for side, sg in (('l', 1), ('r', -1)):
        arm_ik(sp, side, V((sg * 0.165, -0.30, 1.05 + 0.006 * b)), V((sg * 1, 0.4, -0.7)), fingers=V((sg * -0.1, -1, 0.05)),
               palm=V((-sg, 0, 0)))
    return sp


def clip_stretch(t):
    sp = stand_base(0.0, look=False)
    up = env(t, 0.05, 0.3, 0.72, 0.95)
    lean = S(t, 1, 0.0) * env(t, 0.3, 0.4, 0.6, 0.7)
    mul(sp, 'spine', q(x=-6 * up, y=6 * lean))
    mul(sp, 'chest', q(x=-6 * up, y=8 * lean))
    mul(sp, 'head', q(x=-14 * up))
    sp['off'] += V((0, 0, 0.015 * up))
    feet_planted(sp, lift=(0.02 * up, 0.02 * up))
    for side, sg in (('l', 1), ('r', -1)):
        hi = V((sg * 0.05, 0.0, 2.0))
        arm_blend(sp, side, up, hi, V((sg * 1, 0.3, -0.2)), fingers=V((-sg * 1, 0, 0.3)), palm=V((0, 0, 1)))
    sp['morph'] = {'sleepy': 0.8 * env(t, 0.25, 0.35, 0.65, 0.75)}
    return sp


# name: (fn, frames, loop, upper_body_only)
CLIPS = {
    'idle': (clip_idle, 120, True, False),
    'idle_tired': (clip_idle_tired, 120, True, False),
    'walk': (clip_walk, 30, True, False),
    'sit_idle': (clip_sit_idle, 120, True, False),
    'sit_type': (clip_sit_type, 60, True, False),
    'sit_think': (clip_sit_think, 120, True, False),
    'eat_sit': (clip_eat_sit, 90, True, False),
    'sleep': (clip_sleep, 120, True, False),
    'cook': (clip_cook, 60, True, False),
    'cheer': (clip_cheer, 45, False, False),
    'stressed': (clip_stressed, 60, True, False),
    'phone': (clip_phone, 90, True, False),
    'talk': (clip_talk, 90, True, False),
    'wave': (clip_wave, 45, False, False),
    'register': (clip_register, 60, True, False),
    'film': (clip_film, 90, True, False),
    'carry': (clip_carry, 60, True, True),
    'stretch': (clip_stretch, 75, False, False),
}
UPPER = ['spine', 'chest', 'neck', 'head', 'shoulder_l', 'upperarm_l', 'forearm_l', 'hand_l',
         'shoulder_r', 'upperarm_r', 'forearm_r', 'hand_r']
MORPH_CLIPS = {'sleep', 'idle_tired'}


def bake_clips(rig, body, solver):
    rig.animation_data_create()
    keys = body.data.shape_keys
    keys.animation_data_create()
    sc = bpy.context.scene
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    actions = {}
    for name, (fn, frames, loop, upper) in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        bones = UPPER if upper else BONES
        prev = {}
        for f in range(frames + 1):
            t = (f / frames) if loop else (f / frames)
            t = min(t, 1.0) % 1.0 if loop else min(t, 1.0)
            sp = fn(t)
            basis, _ = solver.pose(sp)
            for b in bones:
                pb = rig.pose.bones[b]
                m = basis[b]
                qt = m.to_quaternion()
                if b in prev and prev[b].dot(qt) < 0:
                    qt = -qt
                prev[b] = qt
                pb.rotation_quaternion = qt
                pb.keyframe_insert('rotation_quaternion', frame=f, group=b)
                if b in ('hips', 'root'):
                    pb.location = m.translation if b == 'hips' else V((0, 0, 0))
                    pb.keyframe_insert('location', frame=f, group=b)
        if name in MORPH_CLIPS:
            keys.animation_data.action = act
            for f in range(frames + 1):
                t = (f / frames) % 1.0 if loop else f / frames
                mo = fn(t).get('morph', {})
                for kb in keys.key_blocks[1:]:
                    kb.value = mo.get(kb.name, 0.0)
                    kb.keyframe_insert('value', frame=f)
            keys.animation_data.action = None
        # linear interpolation everywhere (sampled every frame anyway)
        set_linear(act)
        actions[name] = act
        rig.animation_data.action = None
    # reset pose
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = V()
    for kb in keys.key_blocks[1:]:
        kb.value = 0.0
    return actions


def iter_fcurves(act):
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    for fc in cb.fcurves:
                        yield fc
    except AttributeError:
        for fc in act.fcurves:
            yield fc


def set_linear(act):
    for fc in iter_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'


def push_nla(rig, body, actions):
    ad = rig.animation_data
    kad = body.data.shape_keys.animation_data
    for name, act in actions.items():
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        try:
            slots = [s for s in act.slots if s.target_id_type == 'OBJECT']
            if slots:
                st.action_slot = slots[0]
        except AttributeError:
            pass
        tr.mute = True
        if name in MORPH_CLIPS:
            tr2 = kad.nla_tracks.new()
            tr2.name = name
            st2 = tr2.strips.new(name, 0, act)
            try:
                slots = [s for s in act.slots if s.target_id_type == 'KEY']
                if slots:
                    st2.action_slot = slots[0]
            except AttributeError:
                pass
            tr2.mute = True


# --------------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------------
PART_BUILDERS = {}


def build_all():
    reset_scene()
    make_materials()
    define_bones()
    coll = bpy.data.collections.new('character')
    bpy.context.scene.collection.children.link(coll)
    rig = build_rig(coll)
    body_mb, face_range = build_body()
    body = make_object('body', body_mb, rig, coll)
    add_shape_keys(body, body_mb, face_range)
    parts = {}
    for style in ['short', 'messy', 'long', 'bun', 'braids', 'afro', 'buzz', 'curly', 'ponytail', 'bob']:
        parts['hair_' + style] = hair_mesh(style)
    parts['top_hoodie'] = hoodie_mesh()
    parts['top_polo'] = polo_mesh()
    parts['top_blazer'] = blazer_mesh()
    parts['top_sweater'] = sweater_mesh()
    parts['top_uniform'] = uniform_mesh()
    parts['acc_glasses'] = glasses_mesh()
    parts['acc_cap'] = scale_about(cap_mesh(False), HEAD_C, HS)
    parts['acc_cap_back'] = scale_about(cap_mesh(True), HEAD_C, HS)
    parts['acc_beanie'] = scale_about(beanie_mesh(), HEAD_C, HS)
    parts['acc_flatcap'] = scale_about(flatcap_mesh(), HEAD_C, HS)
    parts['acc_hijab'] = hijab_mesh()
    parts['acc_headphones'] = headphones_mesh()
    parts['acc_visor'] = scale_about(visor_mesh(), HEAD_C, HS)
    parts['acc_scarf'] = scarf_mesh()
    parts['acc_beard'] = beard_mesh()
    parts['acc_apron'] = apron_mesh()
    objs = {'body': body}
    for name, mb in parts.items():
        objs[name] = make_object(name, mb, rig, coll)
    socks = make_sockets(rig, coll)
    global SOLVER
    solver = Solver(rig)
    SOLVER = solver
    actions = bake_clips(rig, body, solver)
    push_nla(rig, body, actions)
    return dict(rig=rig, body=body, objs=objs, socks=socks, solver=solver, actions=actions, coll=coll)


def verify_ik(ctx):
    """Report IK reach errors (hand/foot target vs achieved) and walk foot slip per clip."""
    solver = ctx['solver']
    worst = {}
    for name, (fn, frames, loop, upper) in CLIPS.items():
        err = 0.0
        slip = 0.0
        prev = {}
        for f in range(frames + 1):
            t = (f / frames) % 1.0 if loop else f / frames
            sp = fn(t)
            _, M = solver.pose(sp)
            for ik_name, spec in sp['ik'].items():
                ch = solver.ik[ik_name]
                got = M[ch['end']].translation
                err = max(err, (got - spec['target']).length)
            if name == 'walk':
                for side in ('l', 'r'):
                    a = M['foot_' + side].translation.copy()
                    if side in prev and a.z < ANKLE_Z + 0.004 and prev[side].z < ANKLE_Z + 0.004:
                        # while planted the ankle must travel +Y at 1.35 m/s
                        dy = (a.y - prev[side].y) * FPS
                        slip = max(slip, abs(dy - 1.35) if dy > 0.3 else 0.0)
                    prev[side] = a
        worst[name] = (err, slip)
        flag = '  <-- check' if err > 0.02 else ''
        print(f'[verify] {name:11s} max IK miss {err * 100:5.1f} cm' + (f'  planted-foot speed error {slip:4.2f} m/s' if name == 'walk' else '') + flag)
    return worst


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export(ctx):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    rig = ctx['rig']
    rig.select_set(True)
    for ob in ctx['objs'].values():
        ob.select_set(True)
    for e in ctx['socks'].values():
        e.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True, export_apply=False,
        export_extras=True, export_cameras=False, export_lights=False, export_yup=True,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_frame_step=1, export_optimize_animation_size=True, export_anim_single_armature=True,
        export_optimize_animation_keep_anim_armature=False,
        export_morph=True, export_morph_normal=False, export_morph_animation=True,
        export_skins=True, export_all_influences=False, export_def_bones=True,
        export_texcoords=False, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_image_format='NONE', export_reset_pose_bones=True,
        export_nla_strips=True, export_merge_animation='ACTION', export_anim_slide_to_zero=False,
    )


def main():
    ctx = build_all()
    total = 0
    for name, ob in ctx['objs'].items():
        n = tri_count(ob)
        total += n
        print(f'[character] {name:16s} {n:6d} tris')
    print(f'[character] TOTAL {total} tris')
    verify_ik(ctx)
    export(ctx)
    print(f'[character] wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)')
    if PREVIEW:
        sys.path.insert(0, HERE)
        import preview
        preview.run(ctx, sys.modules[__name__])


if __name__ == '__main__':
    main()
