"""Deterministic scene-building helpers for the 3D pipeline (docs/3D.md sections 1-5).

Conventions (read blender/README.md for the full API):
- 1 unit = 1 m, Blender Z up, room floor top at z = 0 centred on the origin. North = +Y, east = +X.
- Rotations passed to helpers are DEGREES. A single number means a rotation about Z.
- FRONT / FACING: characters, anchors AND furniture face their local -Y. An anchor or a piece of furniture with
  rotation 0 faces south (-Y, toward the default camera); 90 faces east (+X); 180 faces north; -90 (or 270) faces
  west. Furniture with rotation 0 therefore has its back to the north wall. See `against()` and `facing_deg()`.
- Every created object gets a unique lowercase [a-z0-9_] name (`uname`). Anchors must be unique: duplicates raise.
- Objects created while a root is set (room.make_room / set_root) are parented to it automatically.
"""
import bpy
import bmesh
import math
import os
import re
import sys
from mathutils import Matrix, Vector, Euler

from palette import get_mat, hex_to_linear

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
REPO = os.path.dirname(BLENDER_DIR)
ASSETS_3D = os.path.join(REPO, 'public', 'assets', '3d')
PREVIEWS = os.path.join(BLENDER_DIR, '.previews')
OUT_DIR = os.path.join(BLENDER_DIR, '.out')

_STATE = {'root': None}

# ----------------------------------------------------------------------------------------------------------------
# scene + names
# ----------------------------------------------------------------------------------------------------------------


def cli_args(argv=None):
    """Parse script args after '--'. Returns dict: preview (bool), stills (bool), out (str|None), rest (list)."""
    argv = sys.argv if argv is None else argv
    rest = argv[argv.index('--') + 1:] if '--' in argv else []
    res = {'preview': False, 'stills': False, 'out': None, 'rest': []}
    i = 0
    while i < len(rest):
        a = rest[i]
        if a == '--preview':
            res['preview'] = True
        elif a == '--stills':
            res['stills'] = True
        elif a == '--out' and i + 1 < len(rest):
            res['out'] = rest[i + 1]
            i += 1
        else:
            res['rest'].append(a)
        i += 1
    return res


def clean_scene():
    """Delete every object, mesh, material, curve, light, camera and collection: a truly empty file."""
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights,
                 bpy.data.cameras, bpy.data.images, bpy.data.actions):
        for b in list(coll):
            coll.remove(b)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for w in list(bpy.data.worlds):
        bpy.data.worlds.remove(w)
    _STATE['root'] = None
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.render.fps = 30


def set_root(obj):
    """Make `obj` the default parent for new groups/anchors/lights (make_room does this)."""
    _STATE['root'] = obj


def get_root():
    """The current default parent (the room root) or None."""
    return _STATE['root']


def sanitize(name):
    """Lowercase and replace anything outside [a-z0-9_] with '_'."""
    return re.sub(r'[^a-z0-9_]', '_', name.lower())


def uname(base):
    """A unique object name derived from `base`: base, base_2, base_3 ..."""
    base = sanitize(base)
    if base not in bpy.data.objects:
        return base
    i = 2
    while f'{base}_{i}' in bpy.data.objects:
        i += 1
    return f'{base}_{i}'


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def to_rad(rotation):
    """Degrees -> radians Euler tuple. None -> (0,0,0); a number -> rotation about Z; a 3-tuple -> XYZ degrees."""
    if rotation is None:
        return (0.0, 0.0, 0.0)
    if isinstance(rotation, (int, float)):
        return (0.0, 0.0, math.radians(rotation))
    return tuple(math.radians(a) for a in rotation)


COMPASS = {'s': (0, -1), 'n': (0, 1), 'e': (1, 0), 'w': (-1, 0),
           'ne': (1, 1), 'nw': (-1, 1), 'se': (1, -1), 'sw': (-1, -1)}


def facing_deg(facing, origin=(0, 0)):
    """Z rotation (degrees) that makes local -Y point along `facing`.
    facing: compass string ('n','e','s','w','ne',...), a number (already degrees: 0=s, 90=e, 180=n, -90=w),
    or an (x, y) point to look AT from `origin`."""
    if isinstance(facing, (int, float)):
        return float(facing)
    if isinstance(facing, str):
        dx, dy = COMPASS[facing]
    else:
        dx, dy = facing[0] - origin[0], facing[1] - origin[1]
    return math.degrees(math.atan2(dx, -dy))


def against(wall):
    """Rotation (degrees) for furniture standing with its back to a wall: 'n'->0, 'w'->90, 'e'->-90, 's'->180."""
    return {'n': 0.0, 'w': 90.0, 'e': -90.0, 's': 180.0}[wall]


def world_matrix(obj):
    """World matrix computed from parents/basis without a depsgraph update (always current)."""
    m = obj.matrix_basis.copy()
    p = obj.parent
    child = obj
    while p is not None:
        m = p.matrix_basis @ child.matrix_parent_inverse @ m
        child = p
        p = p.parent
    return m


def reparent(obj, parent):
    """Parent `obj` to `parent` keeping its world transform (parent inverse stays identity)."""
    mw = world_matrix(obj)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    pm = world_matrix(parent) if parent is not None else Matrix.Identity(4)
    obj.matrix_basis = pm.inverted() @ mw
    return obj


def _place(obj, loc, rot, parent, scale=None):
    obj.location = Vector(loc)
    obj.rotation_euler = Euler(to_rad(rot), 'XYZ')
    if scale is not None:
        obj.scale = Vector(scale)
    if parent == 'root':
        parent = _STATE['root']
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
    return obj


def set_props(obj, **extras):
    """Set custom properties (exported as glTF extras). Bools are stored as bools."""
    for k, v in extras.items():
        obj[k] = v
    return obj


def interactive(g, key):
    """Mark group `g` interactive with key (bed, computer, fridge, door, garage, couch, tv, counter, fryer, exit)."""
    g['interact'] = key
    return g


def obstacle(g, on=True):
    """Mark group `g` as a walk obstacle (its mesh footprint + 0.15 m padding is blocked at runtime)."""
    if on:
        g['obstacle'] = True
    elif 'obstacle' in g:
        del g['obstacle']
    return g


# ----------------------------------------------------------------------------------------------------------------
# groups, anchors, lights
# ----------------------------------------------------------------------------------------------------------------


def group(name, loc=(0, 0, 0), rot=None, parent='root', **extras):
    """Create an empty group (plain axes). Children built with parent=<group> use its local frame."""
    e = bpy.data.objects.new(uname(name), None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.2
    _link(e)
    _place(e, loc, rot, parent)
    set_props(e, **extras)
    return e


def local_to_world(frame, loc):
    """Point in `frame`'s local coords -> world coords (frame=None: identity)."""
    if frame is None:
        return Vector(loc)
    return world_matrix(frame) @ Vector(loc)


def _yaw_of(frame):
    if frame is None:
        return 0.0
    return math.degrees(world_matrix(frame).to_euler('XYZ').z)


def anchor(name, loc, facing='s', frame=None, parent='root', **extras):
    """Create anchor empty `a_<name>` (extras {anchor:<name>, ...extras}).

    loc: where the character's root (feet / floor point under the pelvis) goes.
    facing: where the character looks (compass, degrees, or an (x, y) point), see facing_deg().
    frame: optional group; loc/facing are then in that group's LOCAL frame (converted to world here), so a builder
           can say "0.5 m in front of the fridge" and it follows the fridge's placement.
    The anchor's local -Y is the facing direction (docs/3D.md section 2). Duplicate names raise ValueError."""
    short = name[2:] if name.startswith('a_') else name
    full = 'a_' + sanitize(short)
    if full in bpy.data.objects:
        raise ValueError(f'anchor {full} already exists')
    if isinstance(facing, (tuple, list)) and frame is not None:
        yaw = facing_deg(facing, origin=loc) + _yaw_of(frame)
    else:
        yaw = facing_deg(facing) + _yaw_of(frame)
    wl = local_to_world(frame, loc)
    e = bpy.data.objects.new(full, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.3
    _link(e)
    _place(e, tuple(round(c, 4) for c in wl), (0, 0, round(yaw, 3)), parent)
    set_props(e, anchor=sanitize(short), **extras)
    return e


def light(name, loc, kind='lamp', color='#ffd9a0', intensity=1.0, distance=4.0, frame=None, parent='root'):
    """Create a light anchor `l_<name>` (extras {light:kind, color, intensity, distance}); the runtime makes the
    actual point light. kind: 'lamp' | 'ceiling' | 'window'."""
    short = name[2:] if name.startswith('l_') else name
    full = 'l_' + sanitize(short)
    if full in bpy.data.objects:
        raise ValueError(f'light {full} already exists')
    e = bpy.data.objects.new(full, None)
    e.empty_display_type = 'SPHERE'
    e.empty_display_size = 0.15
    _link(e)
    _place(e, tuple(local_to_world(frame, loc)), None, parent)
    set_props(e, light=kind, color=color, intensity=float(intensity), distance=float(distance))
    return e


# ----------------------------------------------------------------------------------------------------------------
# mesh primitives
# ----------------------------------------------------------------------------------------------------------------


def _mats(obj, mat):
    mats = mat if isinstance(mat, (list, tuple)) else [mat]
    for m in mats:
        obj.data.materials.append(get_mat(m) if isinstance(m, str) else m)


def _smooth(me):
    for p in me.polygons:
        p.use_smooth = True


def _bevel(obj, width, segments, angle=35.0, harden=True):
    if width and width > 0:
        m = obj.modifiers.new('bevel', 'BEVEL')
        m.width = width
        m.segments = max(1, segments)
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(angle)
        m.harden_normals = harden
        m.use_clamp_overlap = True
        m.profile = 0.5
    return obj


def mesh_from_bm(name, bm, mat='plastic_white', parent=None, loc=(0, 0, 0), rot=None, scale=None, smooth=True):
    """Wrap a bmesh into a new linked mesh object (the bmesh is freed)."""
    nm = uname(name)
    me = bpy.data.meshes.new(nm)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        _smooth(me)
    obj = bpy.data.objects.new(nm, me)
    _link(obj)
    _mats(obj, mat)
    _place(obj, loc, rot, parent, scale)
    return obj


def mesh_from_data(name, verts, faces, mat='plastic_white', parent=None, loc=(0, 0, 0), rot=None, smooth=True,
                   bevel=0.0, segments=1, mat_idx=None):
    """Build a mesh object from raw verts/faces (optional per-face material indices + bevel)."""
    nm = uname(name)
    me = bpy.data.meshes.new(nm)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    if mat_idx:
        me.polygons.foreach_set('material_index', mat_idx)
    if smooth:
        _smooth(me)
    obj = bpy.data.objects.new(nm, me)
    _link(obj)
    _mats(obj, mat)
    _place(obj, loc, rot, parent)
    _bevel(obj, bevel, segments)
    return obj


def box(name, size, loc=(0, 0, 0), mat='wood_light', parent=None, rot=None, bevel=0.012, segments=2, bottom=False):
    """Rounded box. size=(x, y, z) m, loc = centre (or bottom centre with bottom=True), bevel width (m) auto-clamped
    to 45% of the thinnest side; segments 1 = chamfer, 2-3 = soft round. Small boxes (< 12 cm) or tiny bevels
    (< 5 mm) use 1 segment automatically (triangle budget)."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bottom:
        loc = (loc[0], loc[1], loc[2] + sz / 2)
    o = mesh_from_bm(name, bm, mat, parent, loc, rot)
    if max(sx, sy, sz) < 0.12 or bevel < 0.005:
        segments = min(segments, 1)
    _bevel(o, min(bevel, 0.45 * min(sx, sy, sz)), segments)
    return o


def cyl(name, r, h, loc=(0, 0, 0), mat='metal', parent=None, rot=None, verts=16, r2=None, bevel=0.006, segments=2,
        bottom=False):
    """Cylinder (or cone/frustum when r2 is given for the top radius) along local Z, height h. loc = centre
    (bottom centre with bottom=True). Cap edges bevelled."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r,
                          radius2=r if r2 is None else r2, depth=h)
    if bottom:
        loc = (loc[0], loc[1], loc[2] + h / 2)
    o = mesh_from_bm(name, bm, mat, parent, loc, rot)
    if bevel:
        _bevel(o, min(bevel, 0.4 * min(r, r2 if r2 else r, h / 2) if (r2 is None or r2 > 0) else bevel), segments,
               angle=40.0)
    return o


def cone(name, r, h, loc=(0, 0, 0), mat='terracotta', parent=None, rot=None, verts=16, r2=0.0, bottom=False,
         bevel=0.0):
    """Cone / frustum (r bottom, r2 top) along local Z."""
    return cyl(name, r, h, loc, mat, parent, rot, verts, r2=r2 if r2 > 0 else 0.0001, bevel=bevel, bottom=bottom)


def sphere(name, r, loc=(0, 0, 0), mat='plant', parent=None, rot=None, scale=(1, 1, 1), segs=16, rings=8):
    """UV sphere (smooth), scale for ellipsoids."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    return mesh_from_bm(name, bm, mat, parent, loc, rot, scale)


def torus(name, R, r, loc=(0, 0, 0), mat='metal', parent=None, rot=None, major=24, minor=8, arc=360.0):
    """Torus in the local XY plane (major radius R, tube radius r). arc < 360 makes an open ring segment."""
    verts, faces = [], []
    closed = arc >= 359.9
    nmaj = major if closed else major + 1
    for i in range(nmaj):
        a = math.radians(arc) * i / major
        ca, sa = math.cos(a), math.sin(a)
        for j in range(minor):
            b = 2 * math.pi * j / minor
            rr = R + r * math.cos(b)
            verts.append((rr * ca, rr * sa, r * math.sin(b)))
    for i in range(major):
        i2 = (i + 1) % nmaj
        for j in range(minor):
            j2 = (j + 1) % minor
            faces.append((i * minor + j, i2 * minor + j, i2 * minor + j2, i * minor + j2))
    return mesh_from_data(name, verts, faces, mat, parent, loc, rot)


def blob(name, size, loc=(0, 0, 0), mat='fabric_cream', parent=None, rot=None, round_xy=0.35, round_z=0.6,
         segs=20, rings=10, deform=None):
    """Soft superellipsoid: cushions, pillows, mattresses, bean bags, duvets, bread buns.
    size=(x, y, z) full extents; round_xy / round_z in (0..1]: small = boxy with round corners, 1 = ellipsoid.
    deform(x, y, z) -> (x, y, z) optional callable applied to each vertex in metres (local), e.g. to wrinkle a duvet."""
    ax, ay, az = size[0] / 2, size[1] / 2, size[2] / 2

    def sp(c, e):
        return math.copysign(abs(c) ** e, c)

    verts, faces = [], []
    verts.append((0, 0, -az))
    for i in range(1, rings):
        phi = -math.pi / 2 + math.pi * i / rings
        cp, spp = math.cos(phi), math.sin(phi)
        for j in range(segs):
            th = 2 * math.pi * j / segs
            x = ax * sp(cp, round_z) * sp(math.cos(th), round_xy)
            y = ay * sp(cp, round_z) * sp(math.sin(th), round_xy)
            z = az * sp(spp, round_z)
            verts.append((x, y, z))
    verts.append((0, 0, az))
    top = len(verts) - 1
    for j in range(segs):
        faces.append((0, 1 + (j + 1) % segs, 1 + j))
    for i in range(rings - 2):
        b0 = 1 + i * segs
        b1 = b0 + segs
        for j in range(segs):
            j2 = (j + 1) % segs
            faces.append((b0 + j, b0 + j2, b1 + j2, b1 + j))
    last = 1 + (rings - 2) * segs
    for j in range(segs):
        faces.append((last + j, last + (j + 1) % segs, top))
    if deform:
        verts = [deform(*v) for v in verts]
    return mesh_from_data(name, verts, faces, mat, parent, loc, rot)


def _frames(pts):
    """Parallel-transport frames along a polyline."""
    tans = []
    n = len(pts)
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        if t.length < 1e-9:
            t = Vector((0, 0, 1))
        tans.append(t.normalized())
    up = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tans[0].cross(up).normalized()
    out = []
    for i, t in enumerate(tans):
        if i > 0:
            nrm = (nrm - t * nrm.dot(t))
            if nrm.length < 1e-6:
                nrm = t.orthogonal()
            nrm.normalize()
        out.append((t, nrm, t.cross(nrm).normalized()))
    return out


def tube(name, points, radius=0.01, mat='plastic_black', parent=None, loc=(0, 0, 0), rot=None, res=6, caps=True,
         closed=False, radii=None):
    """Sweep a circle along a polyline (list of (x, y, z) local points): cables, neon tubes, lamp arms, frames,
    stems, hanger wires. radii: optional per-point radius list (tapering stems)."""
    pts = [Vector(p) for p in points]
    if closed:
        pts = pts + [pts[0], pts[1]]
    fr = _frames(pts)
    if closed:
        pts, fr = pts[:-1], fr[:-1]
        fr[0] = fr[-1]
    verts, faces = [], []
    for i, p in enumerate(pts):
        t, n, b = fr[i]
        rr = radii[i % len(radii)] if radii else radius
        for j in range(res):
            a = 2 * math.pi * j / res
            verts.append(tuple(p + (n * math.cos(a) + b * math.sin(a)) * rr))
    npts = len(pts)
    for i in range(npts - 1):
        for j in range(res):
            j2 = (j + 1) % res
            faces.append((i * res + j, i * res + j2, (i + 1) * res + j2, (i + 1) * res + j))
    if caps and not closed:
        c0 = len(verts)
        verts.append(tuple(pts[0]))
        c1 = len(verts)
        verts.append(tuple(pts[-1]))
        last = (npts - 1) * res
        for j in range(res):
            j2 = (j + 1) % res
            faces.append((c0, j2, j))
            faces.append((c1, last + j, last + j2))
    return mesh_from_data(name, verts, faces, mat, parent, loc, rot)


def bezier(p0, p1, p2, p3, n=12):
    """Cubic bezier -> list of n+1 points (tuples)."""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(tuple(u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d
                         for a, b, c, d in zip(p0, p1, p2, p3)))
    return out


def catenary(a, b, sag=0.15, n=12):
    """Hanging-wire points from a to b sagging `sag` m at the middle (string lights, cables)."""
    out = []
    for i in range(n + 1):
        t = i / n
        p = [a[k] + (b[k] - a[k]) * t for k in range(3)]
        p[2] -= sag * 4 * t * (1 - t)
        out.append(tuple(p))
    return out


def panel(name, size, loc=(0, 0, 0), mat='screen', parent=None, rot=None):
    """Flat quad in the local XZ plane facing -Y (front), with 0..1 UVs (screens, poster faces, menu pictures).
    size=(width, height)."""
    w, h = size
    verts = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
    o = mesh_from_data(name, verts, [(0, 1, 2, 3)], mat, parent, loc, rot, smooth=False)
    uv = o.data.uv_layers.new(name='UVMap')
    for li, (u, v) in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[li].uv = (u, v)
    return o


def prism(name, pts2d, depth, loc=(0, 0, 0), mat='wood_light', parent=None, rot=None, bevel=0.01, segments=2):
    """Extrude a 2D polygon (list of (x, y), counter-clockwise) along +Z by depth: L-shaped tops, signs, leaves.
    loc is the polygon origin at the bottom face."""
    n = len(pts2d)
    verts = [(x, y, 0) for x, y in pts2d] + [(x, y, depth) for x, y in pts2d]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    o = mesh_from_data(name, verts, faces, mat, parent, loc, rot, smooth=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(o.data)
    bm.free()
    _smooth(o.data)
    _bevel(o, bevel, segments)
    return o


def lathe(name, profile, loc=(0, 0, 0), mat='terracotta', parent=None, rot=None, verts=16, cap_bottom=True,
          cap_top=False):
    """Revolve a profile [(radius, z), ...] (bottom to top) around local Z: pots, vases, mugs, lamp bases, bottles."""
    ring = []
    out, faces = [], []
    for k, (r, z) in enumerate(profile):
        for j in range(verts):
            a = 2 * math.pi * j / verts
            out.append((r * math.cos(a), r * math.sin(a), z))
    n = len(profile)
    for k in range(n - 1):
        for j in range(verts):
            j2 = (j + 1) % verts
            faces.append((k * verts + j, k * verts + j2, (k + 1) * verts + j2, (k + 1) * verts + j))
    if cap_bottom:
        c = len(out)
        out.append((0, 0, profile[0][1]))
        for j in range(verts):
            faces.append((c, (j + 1) % verts, j))
    if cap_top:
        c = len(out)
        out.append((0, 0, profile[-1][1]))
        base = (n - 1) * verts
        for j in range(verts):
            faces.append((c, base + j, base + (j + 1) % verts))
    return mesh_from_data(name, out, faces, mat, parent, loc, rot)


# ----------------------------------------------------------------------------------------------------------------
# queries
# ----------------------------------------------------------------------------------------------------------------


def descendants(obj):
    """All descendants of obj (depth-first)."""
    out = []
    for c in obj.children:
        out.append(c)
        out.extend(descendants(c))
    return out


def world_bbox(objs, include_children=True):
    """World-space AABB ((minx,miny,minz),(maxx,maxy,maxz)) of the evaluated meshes in objs (+ descendants)."""
    if not isinstance(objs, (list, tuple)):
        objs = [objs]
    meshes = []
    for o in objs:
        if o.type == 'MESH':
            meshes.append(o)
        if include_children:
            meshes += [d for d in descendants(o) if d.type == 'MESH']
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for m in meshes:
        mw = world_matrix(m)
        for c in m.bound_box:
            p = mw @ Vector(c)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return tuple(lo), tuple(hi)


# ----------------------------------------------------------------------------------------------------------------
# merging + export
# ----------------------------------------------------------------------------------------------------------------


def merge_meshes(target_name, parent, meshes):
    """Merge evaluated `meshes` (modifiers applied, custom normals + UVs kept) into ONE mesh object child of `parent`
    at identity, one material slot per distinct material. The source objects are deleted."""
    if not meshes:
        return None
    dg = bpy.context.evaluated_depsgraph_get()
    pinv = world_matrix(parent).inverted() if parent is not None else Matrix.Identity(4)
    verts, faces, fmat, lnorm, luv = [], [], [], [], []
    mats, any_uv = [], False
    for ob in meshes:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        M = pinv @ world_matrix(ob)
        N = M.to_3x3().inverted().transposed()
        base = len(verts)
        verts.extend(tuple(M @ v.co) for v in me.vertices)
        slot = []
        for ms in ob.material_slots:
            m = ms.material
            if m not in mats:
                mats.append(m)
            slot.append(mats.index(m))
        if not slot:
            m = get_mat('plastic_grey')
            if m not in mats:
                mats.append(m)
            slot = [mats.index(m)]
        cn = me.corner_normals
        uvl = me.uv_layers.active
        if uvl is not None:
            any_uv = True
        for p in me.polygons:
            faces.append([base + me.loops[li].vertex_index for li in p.loop_indices])
            fmat.append(slot[min(p.material_index, len(slot) - 1)])
            for li in p.loop_indices:
                lnorm.append(tuple((N @ cn[li].vector).normalized()))
                luv.append(tuple(uvl.data[li].uv) if uvl is not None else (0.0, 0.0))
        ev.to_mesh_clear()
    datas = [ob.data for ob in meshes]
    for ob in meshes:
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in datas:
        if me.users == 0:
            bpy.data.meshes.remove(me)
    nm = uname(target_name)
    if nm in bpy.data.meshes:
        bpy.data.meshes[nm].name = nm + '_old'
    me = bpy.data.meshes.new(nm)
    me.from_pydata(verts, [], faces)
    for m in mats:
        me.materials.append(m)
    me.polygons.foreach_set('material_index', fmat)
    me.polygons.foreach_set('use_smooth', [True] * len(faces))
    if any_uv:
        uv = me.uv_layers.new(name='UVMap')
        flat = [c for t in luv for c in t]
        uv.data.foreach_set('uv', flat)
    me.normals_split_custom_set(lnorm)
    me.update()
    obj = bpy.data.objects.new(nm, me)
    _link(obj)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    return obj


def _is_marker(o):
    return o.type == 'EMPTY' and (o.name.startswith('a_') or o.name.startswith('l_') or o.name.startswith('socket_')
                                  or o.get('keep'))


def merge_group(g):
    """Collapse every mesh under group empty `g` (through nested empties) into one child mesh `<g>_mesh`.
    Nested anchors/lights/sockets and empties with extras {keep:true} are preserved (keep-groups merged on their own).
    Nested empties without meshes left are removed."""
    meshes, keeps = [], []

    def walk(o):
        for c in list(o.children):
            if c.type == 'MESH':
                meshes.append(c)
                walk(c)
            elif _is_marker(c):
                if c.get('keep'):
                    keeps.append(c)
            else:
                walk(c)
    walk(g)
    for k in keeps:
        merge_group(k)
    # reparent marker children of doomed objects to g first
    for m in meshes:
        for c in list(m.children):
            if c not in meshes and c.type != 'MESH':
                reparent(c, g)
    res = merge_meshes(g.name + '_mesh', g, meshes)
    for c in list(g.children):
        if c.type == 'EMPTY' and not _is_marker(c) and not c.children:
            bpy.data.objects.remove(c, do_unlink=True)

    def prune(o):
        for c in list(o.children):
            prune(c)
        if o is not g and o.type == 'EMPTY' and not _is_marker(o) and not o.children:
            bpy.data.objects.remove(o, do_unlink=True)
    prune(g)
    return res


def consolidate(root):
    """Merge meshes per furniture group for few draw calls: every direct child empty of `root` (except a_/l_ markers)
    becomes empty + one `<name>_mesh`; each wall/floor mesh keeps its own mesh, and each group parented to a wall is
    merged the same way; loose meshes parented to a wall are merged into `<wall>_trim`. Outside groups likewise."""
    for c in list(root.children):
        if _is_marker(c):
            continue
        if c.type == 'EMPTY':
            merge_group(c)
        elif c.type == 'MESH':
            loose = []
            for cc in list(c.children):
                if cc.type == 'EMPTY' and not _is_marker(cc):
                    merge_group(cc)
                elif cc.type == 'MESH':
                    loose.append(cc)
                    loose += [d for d in descendants(cc) if d.type == 'MESH']
            if loose:
                merge_meshes(c.name + '_trim', c, loose)


def apply_all_modifiers(root):
    """Apply modifiers on every mesh under root (not needed for export; used before measuring)."""
    dg = bpy.context.evaluated_depsgraph_get()
    for o in [root] + descendants(root):
        if o.type == 'MESH' and o.modifiers:
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            o.modifiers.clear()
            old = o.data
            o.data = me
            bpy.data.meshes.remove(old)


def export_glb(path, root=None, merge=True, animations=False, **gltf_kw):
    """Export `root` and its hierarchy only to a .glb: modifiers applied, extras on, +Y up, no cameras/lights.
    root may also be a LIST of top-level groups (props.glb: each becomes a top-level node, merged with merge_group).
    merge=True first consolidates each furniture group into one mesh (consolidate()). Extra glTF exporter keywords
    (e.g. export_skins, export_morph for the character) pass through. Returns the file size."""
    root = root or _STATE['root']
    roots = list(root) if isinstance(root, (list, tuple)) else [root]
    if merge:
        for r in roots:
            if isinstance(root, (list, tuple)):
                merge_group(r)
            else:
                consolidate(r)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    objs = []
    for r in roots:
        objs += [r] + descendants(r)
    root = roots[0]
    hidden = []
    for o in objs:
        if o.hide_get() or o.hide_viewport:
            hidden.append((o, o.hide_get(), o.hide_viewport))
            o.hide_set(False)
            o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path), export_format='GLB', use_selection=True, export_extras=True,
        export_yup=True, export_apply=True, export_cameras=False, export_lights=False, export_animations=animations,
        export_materials='EXPORT', export_texcoords=True, export_normals=True, export_tangents=False,
        export_image_format='AUTO', **gltf_kw)
    for o, h, hv in hidden:
        o.hide_set(h)
        o.hide_viewport = hv
    size = os.path.getsize(path)
    print(f'[export] {path} {size / 1024:.1f} KB')
    return size


# ----------------------------------------------------------------------------------------------------------------
# preview rendering
# ----------------------------------------------------------------------------------------------------------------

_PREV = '_preview'


def _prev_coll():
    c = bpy.data.collections.get(_PREV)
    if c is None:
        c = bpy.data.collections.new(_PREV)
        bpy.context.scene.collection.children.link(c)
    return c


def _prev_obj(name, data):
    o = bpy.data.objects.new('_prev_' + name, data)
    _prev_coll().objects.link(o)
    return o


def clear_preview():
    """Remove preview cameras/lights/markers."""
    c = bpy.data.collections.get(_PREV)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)


def setup_render(res=(1280, 720), samples=32, backdrop='#f6efe3', transparent=False):
    """Eevee + AgX, soft shadows, world = soft sky light with `backdrop` as the camera background colour."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    ee = sc.eevee
    ee.taa_render_samples = samples
    for attr, val in (('use_shadows', True), ('use_raytracing', True), ('use_fast_gi', True),
                      ('shadow_ray_count', 2), ('shadow_step_count', 8), ('fast_gi_distance', 0.6),
                      ('shadow_resolution_scale', 1.0)):
        try:
            setattr(ee, attr, val)
        except Exception:
            pass
    try:
        ee.ray_tracing_options.resolution_scale = '2'
    except Exception:
        pass
    for vt, look in (('AgX', WORLD['look']), ('AgX', 'AgX - Medium High Contrast'), ('AgX', 'None')):
        try:
            sc.view_settings.view_transform = vt
            try:
                sc.view_settings.look = look
            except Exception:
                pass
            break
        except Exception:
            continue
    sc.view_settings.exposure = 0.0
    if not _STATE.get('vt_printed'):
        print(f'[render] view transform {sc.view_settings.view_transform} / {sc.view_settings.look}')
        _STATE['vt_printed'] = True
    sc.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.get('preview_world') or bpy.data.worlds.new('preview_world')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    sky = nt.nodes.new('ShaderNodeBackground')
    sky.inputs['Color'].default_value = hex_to_linear(WORLD['sky'])
    sky.inputs['Strength'].default_value = WORLD['sky_strength']
    nt.links.new(sky.outputs['Background'], out.inputs['Surface'])
    return sc


# preview lighting knobs (tweak per room script if needed: B.WORLD['sun'] = 5.0)
WORLD = {'sky': '#e9eef6', 'sky_strength': 0.7, 'sun': 4.4, 'sun_color': '#fff0da', 'sun_dir': (0.35, -1.0, 1.5),
         'fill': 25.0, 'look': 'AgX - Punchy'}


def _lights(center, span):
    """Key sun from the south-south-east (shadows fall onto the back walls) + a soft area fill from the west."""
    sun = bpy.data.lights.new('_prev_sun', 'SUN')
    sun.energy = WORLD['sun']
    sun.color = hex_to_linear(WORLD['sun_color'])[:3]
    sun.angle = math.radians(6)
    so = _prev_obj('sun', sun)
    # direction: light travels from sun_dir toward the origin
    d = Vector(WORLD['sun_dir']).normalized()
    so.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    fill = bpy.data.lights.new('_prev_fill', 'AREA')
    fill.energy = WORLD['fill'] * max(1.0, span / 6.0) ** 2
    fill.size = span
    fill.color = hex_to_linear('#dfe8ff')[:3]
    try:
        fill.use_shadow = False
    except Exception:
        pass
    fo = _prev_obj('fill', fill)
    fo.location = Vector(center) + Vector((-span * 0.2, -span * 0.9, span * 0.9))
    fo.rotation_euler = (Vector(center) - fo.location).to_track_quat('-Z', 'Y').to_euler()


def _room_info(root):
    if root is not None and 'w' in root:
        return float(root['w']), float(root['d']), float(root.get('wallH', 2.7))
    return None


def _camera(name, fov=28.0, ortho=None, sensor_fit='HORIZONTAL'):
    """Preview camera. `fov` is horizontal by default; sensor_fit='VERTICAL' makes it the vertical FOV like three.js
    (PerspectiveCamera.fov), which the room stills use so they match the runtime camera."""
    cd = bpy.data.cameras.new('_prev_' + name)
    cd.sensor_fit = sensor_fit
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    else:
        cd.lens_unit = 'FOV'
        cd.angle = math.radians(fov)
    cd.clip_start = 0.05
    cd.clip_end = 500
    co = _prev_obj(name, cd)
    bpy.context.scene.camera = co
    return co


def fit_camera(cam, points, azimuth_deg, elevation_deg, res, margin=0.06, target=None):
    """Aim perspective camera `cam` from direction (azimuth: 0 = from south (-Y), 90 = from east (+X); elevation up
    from horizontal) so all `points` fit inside the frame with `margin` (fraction), centred. Returns distance."""
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    back = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    q = (-back).to_track_quat('-Z', 'Y')
    R = q.to_matrix()
    right, up = R @ Vector((1, 0, 0)), R @ Vector((0, 1, 0))
    if cam.data.sensor_fit == 'VERTICAL':
        tan_v = math.tan(cam.data.angle / 2)
        tan_h = tan_v * res[0] / res[1]
    else:
        tan_h = math.tan(cam.data.angle / 2)
        tan_v = tan_h * res[1] / res[0]
    pts = [Vector(p) for p in points]
    t = target or sum(pts, Vector()) / len(pts)
    Rt = R.transposed()

    def extents(pos):
        xs, ys = [], []
        for p in pts:
            c = Rt @ (p - pos)
            z = -c.z
            if z <= 0.01:
                return None
            xs.append(c.x / z / tan_h)
            ys.append(c.y / z / tan_v)
        return min(xs), max(xs), min(ys), max(ys)

    D = 10.0
    for _ in range(4):
        lo, hi = 0.5, 400.0
        for _ in range(40):
            mid = (lo + hi) / 2
            e = extents(t + back * mid)
            if e is None or max(-e[0], e[1], -e[2], e[3]) > 1 - margin:
                lo = mid
            else:
                hi = mid
        D = hi
        e = extents(t + back * D)
        cx, cy = (e[0] + e[1]) / 2, (e[2] + e[3]) / 2
        t = t + right * (cx * tan_h * D) + up * (cy * tan_v * D)
    cam.location = t + back * D
    cam.rotation_euler = q.to_euler()
    return D


def room_points(root):
    """Framing points for a room: slab corners + back-wall tops (n/w) + stub height of front walls."""
    info = _room_info(root)
    if info is None:
        lo, hi = world_bbox(root)
        return [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
    w, d, h = info
    t = float(root.get('wallT', 0.15))
    X, Y = w / 2 + t, d / 2 + t
    pts = [(x, y, z) for x in (-X, X) for y in (-Y, Y) for z in (-0.27, 0.3)]
    pts += [(-X, Y, h), (X, Y, h), (-X, -Y, h)]
    return pts


def _walls(root):
    return {o.get('wall'): o for o in descendants(root) if o.get('wall') in ('n', 'e', 's', 'w')} if root else {}


def _stub_walls(root, cam_dir):
    """Cut away walls whose outward normal faces the camera (like the runtime). Returns a restore callable."""
    info = _room_info(root)
    saved = []
    if info is None:
        return lambda: None
    h = info[2]
    normals = {'n': Vector((0, 1)), 's': Vector((0, -1)), 'e': Vector((1, 0)), 'w': Vector((-1, 0))}
    cd = Vector((cam_dir.x, cam_dir.y))
    if cd.length > 0:
        cd.normalize()
    for k, wobj in _walls(root).items():
        if normals[k].dot(cd) > 0.2:
            saved.append((wobj, wobj.scale.z, [(c, c.hide_render) for c in descendants(wobj)]))
            wobj.scale.z = 0.3 / h
            for c in descendants(wobj):
                c.hide_render = True

    def restore():
        for wobj, sz, kids in saved:
            wobj.scale.z = sz
            for c, hr in kids:
                c.hide_render = hr
    return restore


_MARK_COL = {'stand': '#35c46a', 'sit': '#3d8bff', 'lie': '#a45cff', 'spawn': '#ffd23d', 'exit': '#ff7a3d',
             'idle': '#22c7c7', 'boxes': '#c9a36b', 'gear': '#ff5fa2', 'other': '#ff7a3d'}


def _mark_mat(kind):
    name = '_prev_mark_' + kind
    m = bpy.data.materials.get(name)
    if m is None:
        from palette import _principled
        c = _MARK_COL[kind]
        m = _principled(name, c, 0.5, 0.0, emit=c, emit_strength=1.5)
    return m


def _anchor_kind(n):
    for k in ('lie', 'sit', 'stand', 'spawn', 'exit', 'idle', 'boxes', 'gear'):
        if k in n:
            return k
    return 'other'


def _anchor_markers(root, z_lift=0.03, label=True):
    """Coloured disc + direction arrow + label for every a_* anchor (top view)."""
    anchors = [o for o in descendants(root) if o.name.startswith('a_')] if root else \
        [o for o in bpy.data.objects if o.name.startswith('a_')]
    for a in anchors:
        mw = world_matrix(a)
        p = mw.translation
        kind = _anchor_kind(a.name)
        mat = _mark_mat(kind)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.11, radius2=0.11, depth=0.02)
        me = bpy.data.meshes.new('_prev_mk')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        o = _prev_obj('mk_' + a.name, me)
        o.location = (p.x, p.y, p.z + z_lift)
        fwd = (mw.to_3x3() @ Vector((0, -1, 0)))
        fwd.z = 0
        if fwd.length > 0:
            fwd.normalize()
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=0.07, radius2=0.0, depth=0.18)
        me2 = bpy.data.meshes.new('_prev_ar')
        bm.to_mesh(me2)
        bm.free()
        me2.materials.append(mat)
        ar = _prev_obj('ar_' + a.name, me2)
        ar.location = (p.x + fwd.x * 0.2, p.y + fwd.y * 0.2, p.z + z_lift)
        ar.rotation_euler = fwd.to_track_quat('Z', 'Y').to_euler()
        if 'w' in a and 'd' in a:   # region anchors: outline
            w, d = float(a['w']), float(a['d'])
            for i, (sx, sy, lx, ly) in enumerate(((w, 0.02, 0, d / 2), (w, 0.02, 0, -d / 2),
                                                    (0.02, d, w / 2, 0), (0.02, d, -w / 2, 0))):
                bm = bmesh.new()
                bmesh.ops.create_cube(bm, size=1)
                bmesh.ops.scale(bm, vec=(sx, sy, 0.02), verts=bm.verts)
                me3 = bpy.data.meshes.new('_prev_rg')
                bm.to_mesh(me3)
                bm.free()
                me3.materials.append(mat)
                ro = _prev_obj(f'rg_{a.name}_{i}', me3)
                ro.matrix_world = mw @ Matrix.Translation((lx, ly, z_lift))
        if label:
            cu = bpy.data.curves.new('_prev_lbl', 'FONT')
            cu.body = a.name[2:]
            cu.size = 0.13
            cu.align_x = 'CENTER'
            cu.materials.append(_mark_mat('other') if kind == 'other' else get_mat('plastic_black'))
            lo = _prev_obj('lbl_' + a.name, cu)
            lo.location = (p.x, p.y - 0.25, p.z + z_lift + 0.02)


def _footprints(root, pad=0.15):
    """Translucent red boxes over each obstacle footprint (+pad): the 'walk' view."""
    from palette import _principled
    m = bpy.data.materials.get('_prev_block') or _principled('_prev_block', '#ff3030', 0.5, 0.0, alpha=0.35)
    for g in descendants(root):
        if g.get('obstacle'):
            lo, hi = world_bbox(g)
            if lo[0] > hi[0]:
                continue
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1)
            sx, sy = hi[0] - lo[0] + 2 * pad, hi[1] - lo[1] + 2 * pad
            bmesh.ops.scale(bm, vec=(sx, sy, 0.02), verts=bm.verts)
            me = bpy.data.meshes.new('_prev_fp')
            bm.to_mesh(me)
            bm.free()
            me.materials.append(m)
            o = _prev_obj('fp_' + g.name, me)
            o.location = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 2.25)


def render_preview(path, view='default', target=None, root=None, res=(1280, 720), samples=32, backdrop='#f6efe3',
                   azimuth=45.0, elevation=40.0, fov=28.0):
    """Render a preview PNG.
    view: 'default' - perspective FOV 28 from the south-east at 40 deg, framing the floor, walls s/e stubbed (runtime
                      cutaway);
          'top'     - orthographic plan, everything above 2.3 m clipped, anchors drawn as coloured discs + arrows +
                      labels (green stand, blue sit, purple lie, yellow spawn, orange exit/other, cyan idle, kraft
                      boxes region outline, pink gear);
          'walk'    - 'top' plus translucent red obstacle footprints (+0.15 m padding);
          'front'   - from the south at 14 deg, wall s stubbed;
          'close'   - fits `target` (object/group or name) from the south-east at 30 deg (walls facing the camera
                      stubbed).
    azimuth/elevation override the default/close camera direction (azimuth 0 = from south, 90 = from east)."""
    root = root or _STATE['root']
    if isinstance(target, str):
        target = bpy.data.objects[target]
    elif isinstance(target, (list, tuple)):
        target = [bpy.data.objects[t] if isinstance(t, str) else t for t in target]
    clear_preview()
    setup_render(res, samples, backdrop)
    info = _room_info(root)
    span = max(info[0], info[1]) if info else 6.0
    center = (0, 0, 0)
    restore = lambda: None
    if view in ('top', 'walk'):
        if info:
            w, d, h = info
            t = float(root.get('wallT', 0.15))
            ex, ey = w + 2 * t, d + 2 * t
        else:
            lo, hi = world_bbox(root)
            ex, ey = hi[0] - lo[0], hi[1] - lo[1]
            center = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0)
        cam = _camera('cam', ortho=max(ex * 1.08, ey * 1.08 * res[0] / res[1]))
        cam.location = (center[0], center[1], 30.0)
        cam.rotation_euler = (0, 0, 0)
        cam.data.clip_start = 30.0 - 2.3
        _anchor_markers(root)
        if view == 'walk':
            _footprints(root)
    elif view == 'close':
        cam = _camera('cam', fov=fov)
        lo, hi = world_bbox(target)
        pts = [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
        az = azimuth if azimuth != 45.0 else 35.0
        fit_camera(cam, pts, az, 30.0 if elevation == 40.0 else elevation, res, margin=0.12)
        restore = _stub_walls(root, cam.location - Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0)))
    else:
        cam = _camera('cam', fov=fov)
        pts = room_points(root) if root else None
        if view == 'front':
            az, el = 0.0, 14.0
        else:
            az, el = azimuth, elevation
        fit_camera(cam, pts, az, el, res, margin=0.05)
        restore = _stub_walls(root, cam.location)
    _lights(center, span)
    render_to(path, backdrop)
    restore()
    clear_preview()
    print(f'[preview] {path}')
    return path


def render_to(path, backdrop=None):
    """Render the scene camera to a PNG at `path`. The film is transparent; with `backdrop` ('#rrggbb') the
    exact backdrop colour is composited behind it afterwards (AgX would otherwise grey a world colour)."""
    sc = bpy.context.scene
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sc.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    if backdrop:
        composite_backdrop(path, backdrop)
    return path


def composite_backdrop(path, hexcol):
    """Flatten a straight-alpha PNG over a solid sRGB colour, in place."""
    import numpy as np
    img = bpy.data.images.load(os.path.abspath(path), check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    hx = hexcol.lstrip('#')
    bg = np.array([int(hx[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)
    a = px[:, 3:4]
    px[:, :3] = px[:, :3] * a + bg * (1 - a)
    px[:, 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = os.path.abspath(path)
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def preview_set(room_id, root=None, views=('default', 'top'), prefix=None):
    """Render the usual previews to blender/.previews/<id>_<view>.png."""
    out = []
    for v in views:
        out.append(render_preview(os.path.join(PREVIEWS, f'{prefix or room_id}_{v}.png'), v, root=root))
    return out
