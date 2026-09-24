"""Room shell builder (docs/3D.md section 5): root, floor, slab, 4 walls with real openings, baseboards, trims.

    root = make_room('tier0', 6.5, 5.0, wall_mat='wall_panel', floor='carpet',
                     openings=[door_opening('n', -2.0), window_opening('w', 0.5, sill=1.7, height=0.5)])

Walls sit OUTSIDE the floor rectangle (inner faces flush with the floor edges), so the whole w x d floor is usable.
wall_n / wall_s span the full outer width (they own the corners); wall_e / wall_w span the floor depth.
Each wall object has its origin on the floor (z = 0) at the middle of the wall, so the runtime can scale it on
the vertical axis into a 0.3 m stub. Openings are modelled holes, not booleans.
"""
import math
import random
import bmesh
from mathutils import Vector

import build as B

ROOM = {}          # info about the room being built: id, w, d, h, t, openings, walls{side: obj}


def door_opening(wall, at, width=0.9, height=2.1, name=None):
    """Opening spec for a door. `at` = centre coordinate ALONG the wall in world units (x for walls n/s, y for e/w)."""
    return {'wall': wall, 'at': at, 'width': width, 'height': height, 'sill': 0.0, 'kind': 'door', 'name': name}


def window_opening(wall, at, width=1.2, height=1.2, sill=0.9, name=None):
    """Opening spec for a window (sill = bottom height above the floor)."""
    return {'wall': wall, 'at': at, 'width': width, 'height': height, 'sill': sill, 'kind': 'window', 'name': name}


def _wall_frame(side, w, d, t):
    """(origin, length, u-axis index, inward sign) for a wall. Local coords: u along the wall, v across it."""
    if side == 'n':
        return Vector((0, d / 2 + t / 2, 0)), w + 2 * t
    if side == 's':
        return Vector((0, -d / 2 - t / 2, 0)), w + 2 * t
    if side == 'e':
        return Vector((w / 2 + t / 2, 0, 0)), d
    return Vector((-w / 2 - t / 2, 0, 0)), d


def _wall_mesh(side, length, t, h, holes):
    """Solid wall with rectangular holes. holes: list of (u0, u1, z0, z1) in local u (centred) coords."""
    us = {-length / 2, length / 2}
    zs = {0.0, h}
    for u0, u1, z0, z1 in holes:
        us |= {max(-length / 2, u0), min(length / 2, u1)}
        zs |= {max(0.0, z0), min(h, z1)}
    us, zs = sorted(us), sorted(zs)
    nu, nz = len(us) - 1, len(zs) - 1

    def filled(i, j):
        if i < 0 or j < 0 or i >= nu or j >= nz:
            return False
        cu, cz = (us[i] + us[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
        for u0, u1, z0, z1 in holes:
            if u0 < cu < u1 and z0 < cz < z1:
                return False
        return True

    ns = side in ('n', 's')
    bm = bmesh.new()
    vcache = {}

    def V(i, j, k):
        key = (i, j, k)
        if key not in vcache:
            u, z, v = us[i], zs[j], (-t / 2 if k == 0 else t / 2)
            vcache[key] = bm.verts.new((u, v, z) if ns else (v, u, z))
        return vcache[key]

    for i in range(nu):
        for j in range(nz):
            if not filled(i, j):
                continue
            for k in (0, 1):
                bm.faces.new([V(i, j, k), V(i + 1, j, k), V(i + 1, j + 1, k), V(i, j + 1, k)])
            if not filled(i - 1, j):
                bm.faces.new([V(i, j, 0), V(i, j + 1, 0), V(i, j + 1, 1), V(i, j, 1)])
            if not filled(i + 1, j):
                bm.faces.new([V(i + 1, j, 0), V(i + 1, j + 1, 0), V(i + 1, j + 1, 1), V(i + 1, j, 1)])
            if not filled(i, j - 1):
                bm.faces.new([V(i, j, 0), V(i + 1, j, 0), V(i + 1, j, 1), V(i, j, 1)])
            if not filled(i, j + 1):
                bm.faces.new([V(i, j + 1, 0), V(i + 1, j + 1, 0), V(i + 1, j + 1, 1), V(i, j + 1, 1)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
    return bm


def _floor_tiles(w, d, tile, mats_n, rng, stagger=True, groove=0.006, depth=0.004, along='x', pattern='checker'):
    """Pillow-edged tiles/planks as one mesh (5 quads each) + a base plate. Returns verts, faces, mat_idx."""
    verts, faces, midx = [], [], []

    def piece(x0, x1, y0, y1, m):
        g = groove
        b = len(verts)
        # outer ring at z=-depth, inner ring at z=0
        verts.extend([(x0, y0, -depth), (x1, y0, -depth), (x1, y1, -depth), (x0, y1, -depth),
                      (x0 + g, y0 + g, 0), (x1 - g, y0 + g, 0), (x1 - g, y1 - g, 0), (x0 + g, y1 - g, 0)])
        faces.append((b + 4, b + 5, b + 6, b + 7))
        faces.append((b + 0, b + 1, b + 5, b + 4))
        faces.append((b + 1, b + 2, b + 6, b + 5))
        faces.append((b + 2, b + 3, b + 7, b + 6))
        faces.append((b + 3, b + 0, b + 4, b + 7))
        midx.extend([m] * 5)

    if isinstance(tile, (tuple, list)):          # planks: (width, min_len, max_len)
        pw, lmin, lmax = tile
        cross, run = (d, w) if along == 'x' else (w, d)
        rows = max(1, round(cross / pw))
        pw = cross / rows
        for r in range(rows):
            c0 = -cross / 2 + r * pw
            pos = -run / 2 - rng.uniform(0, lmax * 0.8)
            while pos < run / 2:
                ln = rng.uniform(lmin, lmax)
                a, b2 = max(pos, -run / 2), min(pos + ln, run / 2)
                if b2 - a > 0.05:
                    m = 0 if mats_n == 1 else rng.randrange(mats_n)
                    if along == 'x':
                        piece(a, b2, c0, c0 + pw, m)
                    else:
                        piece(c0, c0 + pw, a, b2, m)
                pos += ln
    else:
        nx, ny = max(1, round(w / tile)), max(1, round(d / tile))
        tx, ty = w / nx, d / ny
        for i in range(nx):
            for j in range(ny):
                m = ((i + j) % 2) if (mats_n > 1 and pattern == 'checker') else 0
                piece(-w / 2 + i * tx, -w / 2 + (i + 1) * tx, -d / 2 + j * ty, -d / 2 + (j + 1) * ty, m)
    # base plate under everything (closes the gaps' bottoms), top at -depth
    b = len(verts)
    zt, zb = -depth, -0.05
    verts.extend([(-w / 2, -d / 2, zb), (w / 2, -d / 2, zb), (w / 2, d / 2, zb), (-w / 2, d / 2, zb),
                  (-w / 2, -d / 2, zt), (w / 2, -d / 2, zt), (w / 2, d / 2, zt), (-w / 2, d / 2, zt)])
    faces.extend([(b + 3, b + 2, b + 1, b + 0), (b + 4, b + 5, b + 6, b + 7), (b + 0, b + 1, b + 5, b + 4),
                  (b + 1, b + 2, b + 6, b + 5), (b + 2, b + 3, b + 7, b + 6), (b + 3, b + 0, b + 4, b + 7)])
    midx.extend([0] * 6)
    return verts, faces, midx


FLOORS = {
    # style: (default material(s), tile spec)
    'planks': (['wood_light'], (0.2, 0.9, 1.9)),
    'planks_mid': (['wood_mid'], (0.2, 0.9, 1.9)),
    'planks_dark': (['wood_dark'], (0.22, 1.0, 2.2)),
    'tile': (['tile_white'], 0.4),
    'checker': (['tile_white', 'tile_check_dark'], 0.45),
    'concrete': (['concrete'], 1.5),
    'carpet': (['carpet_beige'], None),
}


def make_floor(w, d, style='planks', mats=None, seed=1, along='x'):
    """Floor mesh `floor` (extras {floor:true}), top at z=0. style: planks | planks_mid | planks_dark | tile |
    checker | concrete | carpet. mats overrides the material list (checker takes two)."""
    dm, spec = FLOORS[style]
    mats = mats or dm
    rng = random.Random(seed)
    if spec is None:   # carpet: soft slab with a rounded edge
        o = B.box('floor', (w, d, 0.05), (0, 0, -0.025), mats[0], parent='root', bevel=0.01, segments=2)
    else:
        v, f, mi = _floor_tiles(w, d, spec, len(mats), rng, along=along,
                                groove=0.004 if style == 'concrete' else 0.01, depth=0.006)
        o = B.mesh_from_data('floor', v, f, mats, parent='root', smooth=False, mat_idx=mi)
    o['floor'] = True
    return o


def make_room(room_id, w, d, wall_h=2.7, wall_mat='wall_cream', floor='planks', floor_mats=None, openings=(),
              wall_t=0.15, baseboard='plastic_white', crown=None, slab_mat='slab', seed=None, floor_along='x'):
    """Build the room shell and set it as the build root. Returns the `room` root empty.
    wall_mat: one palette name or {'n':..,'e':..,'s':..,'w':..}. floor: see make_floor. openings: list from
    door_opening/window_opening (holes are cut into the wall mesh). baseboard / crown: trim material names or None.
    slab_mat: the base under the floor. seed: plank layout seed (default from the id). floor_along='y' turns planks.
    Also fills room.ROOM (id, w, d, h, t, openings, walls) for the helpers below."""
    B.set_root(None)
    root = B.group('room', parent=None, room=room_id, w=float(w), d=float(d), wallH=float(wall_h), wallT=float(wall_t))
    B.set_root(root)
    ROOM.clear()
    ROOM.update({'id': room_id, 'w': w, 'd': d, 'h': wall_h, 't': wall_t, 'openings': list(openings), 'walls': {},
                 'root': root})
    make_floor(w, d, floor, floor_mats, seed if seed is not None else sum(map(ord, room_id)), along=floor_along)
    s = B.box('slab', (w + 2 * wall_t + 0.08, d + 2 * wall_t + 0.08, 0.25), (0, 0, -0.05 - 0.125), slab_mat,
              parent='root', bevel=0.035, segments=3)
    for side in ('n', 'e', 's', 'w'):
        origin, length = _wall_frame(side, w, d, wall_t)
        holes = []
        for op in openings:
            if op['wall'] != side:
                continue
            c = op['at'] - (origin.x if side in ('n', 's') else origin.y)
            holes.append((c - op['width'] / 2, c + op['width'] / 2, op['sill'], op['sill'] + op['height']))
        bm = _wall_mesh(side, length, wall_t, wall_h, holes)
        mat = wall_mat[side] if isinstance(wall_mat, dict) else wall_mat
        wo = B.mesh_from_bm('wall_' + side, bm, mat, parent='root', loc=tuple(origin), smooth=True)
        B._bevel(wo, 0.012, 2, angle=40)
        wo['wall'] = side
        ROOM['walls'][side] = wo
        if baseboard:
            _trim(wo, side, 0.09, 0.022, 0.0, baseboard, [op for op in openings if op['wall'] == side and op['sill'] < 0.1])
        if crown:
            _trim(wo, side, 0.07, 0.03, wall_h - 0.07, crown, [op for op in openings if op['wall'] == side and
                                                                 op['sill'] + op['height'] > wall_h - 0.08])
    return root


def _trim(wall, side, h, depth, z0, mat, gaps):
    """Baseboard / crown strips along the inner face of `wall`, skipping `gaps` openings."""
    w, d = ROOM['w'], ROOM['d']
    if side in ('n', 's'):
        lo, hi = -w / 2, w / 2
    else:
        lo, hi = -d / 2, d / 2
    cuts = sorted((op['at'] - op['width'] / 2 - 0.08, op['at'] + op['width'] / 2 + 0.08) for op in gaps)
    segs, pos = [], lo
    for a, b in cuts:
        if a > pos:
            segs.append((pos, a))
        pos = max(pos, b)
    if pos < hi:
        segs.append((pos, hi))
    for a, b in segs:
        if b - a < 0.05:
            continue
        c, ln = (a + b) / 2, b - a
        if side == 'n':
            loc, size = (c, d / 2 - depth / 2, z0 + h / 2), (ln, depth, h)
        elif side == 's':
            loc, size = (c, -d / 2 + depth / 2, z0 + h / 2), (ln, depth, h)
        elif side == 'e':
            loc, size = (w / 2 - depth / 2, c, z0 + h / 2), (depth, ln, h)
        else:
            loc, size = (-w / 2 + depth / 2, c, z0 + h / 2), (depth, ln, h)
        o = B.box(wall.name + '_trim', size, loc, mat, parent=None, bevel=0.006, segments=1)
        B.reparent(o, wall)


def wall(side):
    """The wall object for side 'n'|'e'|'s'|'w' of the current room."""
    return ROOM['walls'][side]


def on_wall(obj, side):
    """Parent decor (a group or mesh) to wall `side` keeping its world transform, so it hides with the wall.
    Do NOT use for doors or anything interactive."""
    return B.reparent(obj, wall(side))


def wall_point(side, at, z=0.0, off=0.0):
    """World point on the INNER face of wall `side`: `at` along the wall (x for n/s, y for e/w), height z, pushed
    `off` metres into the room. Pair with rotation B.against(side) so the object's front faces into the room."""
    w, d = ROOM['w'], ROOM['d']
    if side == 'n':
        return (at, d / 2 - off, z)
    if side == 's':
        return (at, -d / 2 + off, z)
    if side == 'e':
        return (w / 2 - off, at, z)
    return (-w / 2 + off, at, z)


def opening_point(op):
    """World point at the bottom centre of an opening, on the wall's centre line."""
    w, d, t = ROOM['w'], ROOM['d'], ROOM['t']
    side = op['wall']
    if side == 'n':
        return (op['at'], d / 2 + t / 2, op['sill'])
    if side == 's':
        return (op['at'], -d / 2 - t / 2, op['sill'])
    if side == 'e':
        return (w / 2 + t / 2, op['at'], op['sill'])
    return (-w / 2 - t / 2, op['at'], op['sill'])


def inside_point(op, dist=0.6):
    """Floor point `dist` metres inside the room in front of an opening's centre (e.g. a_door_stand)."""
    x, y, _ = wall_point(op['wall'], op['at'], 0.0, dist)
    return (x, y, 0.0)


def fill_opening(op, **kw):
    """Put the matching furniture into an opening: windows (furniture.window, parented to the wall) or doors
    (furniture.door, NOT parented, interactive by default). kw passes through (style, name, interact, ajar ...).
    Returns the created group."""
    import furniture as F
    loc = opening_point(op)
    rot = B.against(op['wall'])
    if op['kind'] == 'window':
        g = F.window(width=op['width'], height=op['height'], wall_t=ROOM['t'], location=loc, rotation=rot, **kw)
        on_wall(g, op['wall'])
        return g
    return F.door(width=op['width'], height=op['height'], wall_t=ROOM['t'], location=loc, rotation=rot, **kw)
