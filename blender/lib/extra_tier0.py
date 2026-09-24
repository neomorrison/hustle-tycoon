"""Extra builders for the tier0 (Mom's basement) and tier1 (shared apartment) dioramas.

Owned by the tier0/tier1 room builder. Small personality props and a few pieces the shared catalogue does not
have (wood paneling grooves, stairwell bulkhead, exposed ducts and pipes, CRT TV, clothes piles, sneakers, sticky
notes, pizza box, soda cans, storage tubs, lava lamp, cork board, pennant, folding table set). Every builder
follows the lib conventions: one group per piece (or items built INTO a given group with parent=g), front = local
-Y, locations in metres, rotations in degrees.
"""
import math
import random

import build as B
import room as R
from build import box, cyl, blob, tube, panel, lathe, sphere, torus

TAU = math.tau


def _g(name, location, rotation, obstacle=False, interact=None, parent='root', **extras):
    g = B.group(name, location, rotation, parent, **extras)
    if obstacle:
        B.obstacle(g)
    if interact:
        B.interactive(g, interact)
    return g


def _n(g, part):
    return f'{g.name}_{part}'


# ----------------------------------------------------------------------------------------------------------------
# walls
# ----------------------------------------------------------------------------------------------------------------

def paneling(side, spacing=0.305, mat='wood_mid', groove=0.012, z0=0.09, z1=None, cap=None):
    """Vertical V-groove lines of 1970s basement wood paneling on the inner face of wall `side`, skipping door and
    window openings (split around windows). Loose meshes parented to the wall (the lib merges them into
    `wall_<side>_trim`). cap=<material> adds a thin top moulding."""
    info = R.ROOM
    w, d, h = info['w'], info['d'], info['h']
    z1 = z1 if z1 is not None else h - 0.02
    lo, hi = (-w / 2, w / 2) if side in ('n', 's') else (-d / 2, d / 2)
    ops = [op for op in info['openings'] if op['wall'] == side]
    wl = R.wall(side)
    n = int((hi - lo) / spacing)
    start = lo + ((hi - lo) - n * spacing) / 2
    for i in range(1, n + 1):
        at = start + i * spacing - spacing / 2
        if at < lo + 0.05 or at > hi - 0.05:
            continue
        spans = [(z0, z1)]
        for op in ops:
            if op['at'] - op['width'] / 2 - 0.09 < at < op['at'] + op['width'] / 2 + 0.09:
                a, b = op['sill'] - 0.07, op['sill'] + op['height'] + 0.07
                new = []
                for s0, s1 in spans:
                    if b <= s0 or a >= s1:
                        new.append((s0, s1))
                        continue
                    if a > s0:
                        new.append((s0, a))
                    if b < s1:
                        new.append((b, s1))
                spans = new
        for s0, s1 in spans:
            if s1 - s0 < 0.05:
                continue
            x, y, _ = R.wall_point(side, at, 0, 0.002)
            size = (groove, 0.006, s1 - s0) if side in ('n', 's') else (0.006, groove, s1 - s0)
            o = box(f'wall_{side}_groove', size, (x, y, (s0 + s1) / 2), mat, None, bevel=0, segments=1)
            B.reparent(o, wl)
    if cap:
        x, y, _ = R.wall_point(side, (lo + hi) / 2, 0, 0.015)
        size = (hi - lo, 0.03, 0.05) if side in ('n', 's') else (0.03, hi - lo, 0.05)
        o = box(f'wall_{side}_cap', size, (x, y, h - 0.025), cap, None, bevel=0.006, segments=1)
        B.reparent(o, wl)


def ceiling_bulkhead(name, x0, x1, y0, y1, side, h=None, depth=0.24, mat='wall_cream', trim='wood_mid'):
    """A patch of ceiling (e.g. over the top of a stair flight, reading as 'the stairs go up through the floor above').
    Built as decor parented to wall `side` so it hides with that wall."""
    h = h if h is not None else R.ROOM['h']
    g = _g(name, (0, 0, 0), 0)
    box(_n(g, 'slab'), (x1 - x0, y1 - y0, depth), ((x0 + x1) / 2, (y0 + y1) / 2, h - depth / 2), mat, g,
        bevel=0.012, segments=2)
    # floor-above edge (a joist band) along the open sides
    box(_n(g, 'band'), (x1 - x0 + 0.01, 0.05, 0.08), ((x0 + x1) / 2, y0 + 0.02, h - depth - 0.03), trim, g,
        bevel=0.01)
    box(_n(g, 'band'), (0.05, y1 - y0, 0.08), (x1 - 0.02, (y0 + y1) / 2, h - depth - 0.03), trim, g, bevel=0.01)
    R.on_wall(g, side)
    return g


def duct(name, a, b, side, size=(0.34, 0.24), mat='metal', joints=4):
    """Rectangular HVAC duct running from world point a to b (horizontal, along X or Y), with joint collars.
    Decor parented to wall `side`."""
    g = _g(name, (0, 0, 0), 0)
    ax = 'x' if abs(b[0] - a[0]) > abs(b[1] - a[1]) else 'y'
    L = abs(b[0] - a[0]) if ax == 'x' else abs(b[1] - a[1])
    c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    w, hgt = size
    dims = (L, w, hgt) if ax == 'x' else (w, L, hgt)
    box(_n(g, 'body'), dims, c, mat, g, bevel=0.015, segments=2)
    for i in range(joints + 1):
        t = i / joints
        p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, c[2])
        cd = (0.03, w + 0.02, hgt + 0.02) if ax == 'x' else (w + 0.02, 0.03, hgt + 0.02)
        box(_n(g, 'collar'), cd, p, 'plastic_grey', g, bevel=0.006, segments=1)
    R.on_wall(g, side)
    return g


def pipe_run(name, pts, side, r=0.022, mat='terracotta', brackets=True):
    """Exposed pipe (copper = terracotta) along world points, with wall brackets; parented to wall `side`."""
    g = _g(name, (0, 0, 0), 0)
    tube(_n(g, 'pipe'), pts, r, mat, g, res=8)
    for p in pts[1:-1]:
        sphere(_n(g, 'elbow'), r * 1.3, p, mat, g, segs=10, rings=6)
    if brackets:
        for i in range(len(pts) - 1):
            p0, p1 = pts[i], pts[i + 1]
            L = math.dist(p0, p1)
            for k in range(1, max(2, int(L / 0.9)) ):
                t = k / max(2, int(L / 0.9))
                p = tuple(p0[j] + (p1[j] - p0[j]) * t for j in range(3))
                torus(_n(g, 'clip'), r * 1.35, 0.006, p, 'metal', g,
                      (0, 90, 0) if abs(p1[0] - p0[0]) > 0.01 else (90, 0, 0), major=12, minor=4)
    R.on_wall(g, side)
    return g


def sticky_notes(side, at, z, n=6, seed=3, spread=(0.5, 0.3)):
    """A cluster of coloured sticky notes (abstract squares, no text) on wall `side`, parented to it."""
    rng = random.Random(seed)
    cols = ['mcd_yellow', 'fabric_coral', 'wall_sky', 'rug_green', 'mcd_yellow', 'wall_blush']
    g = _g(f'notes_{side}', R.wall_point(side, at, z, 0.004), B.against(side))
    for i in range(n):
        x = rng.uniform(-spread[0] / 2, spread[0] / 2)
        zz = rng.uniform(-spread[1] / 2, spread[1] / 2)
        box(_n(g, 'note'), (0.075, 0.004, 0.075), (x, -0.002, zz), cols[i % len(cols)], g, (0, rng.uniform(-12, 12), 0),
            bevel=0, segments=1)
    R.on_wall(g, side)
    return g


def cork_board(side, at, z, w=0.7, h=0.5, seed=5):
    """Cork pin board with pinned papers / photos / notes (abstract blocks, no text), parented to wall `side`."""
    rng = random.Random(seed)
    g = _g(f'corkboard_{side}', R.wall_point(side, at, z, 0.0), B.against(side))
    box(_n(g, 'frame'), (w, 0.025, h), (0, -0.0125, 0), 'wood_light', g, bevel=0.006)
    box(_n(g, 'cork'), (w - 0.05, 0.01, h - 0.05), (0, -0.026, 0), 'kraft', g, bevel=0.003, segments=1)
    cols = ['paper', 'mcd_yellow', 'poster_b', 'fabric_coral', 'paper', 'rug_green', 'poster_a']
    for i in range(7):
        pw, ph = rng.uniform(0.08, 0.16), rng.uniform(0.08, 0.18)
        x = rng.uniform(-w / 2 + 0.1, w / 2 - 0.1)
        zz = rng.uniform(-h / 2 + 0.1, h / 2 - 0.1)
        box(_n(g, 'paper'), (pw, 0.003, ph), (x, -0.033 - i * 0.0008, zz), cols[i % len(cols)], g,
            (0, rng.uniform(-10, 10), 0), bevel=0, segments=1)
        sphere(_n(g, 'pin'), 0.009, (x, -0.04 - i * 0.0008, zz + ph / 2 - 0.02),
               ['mcd_red', 'fabric_teal', 'fabric_mustard'][i % 3], g, segs=6, rings=4)
    # a strand of yarn between two pins (the 'business plan' conspiracy board)
    tube(_n(g, 'yarn'), [(-w / 2 + 0.12, -0.045, 0.1), (0.0, -0.045, -0.05), (w / 2 - 0.14, -0.045, 0.12)], 0.003,
         'mcd_red', g, res=4, caps=False)
    R.on_wall(g, side)
    return g


def pennant(side, at, z, mat='fabric_teal', accent='paper', length=0.7, rot=-8):
    """College/sports pennant: a long felt triangle with a stripe (no letters), parented to wall `side`."""
    g = _g(f'pennant_{side}', R.wall_point(side, at, z, 0.0), (0, 0, B.against(side)))
    body = B.prism(_n(g, 'felt'), [(0, -0.12), (length, 0), (0, 0.12)], 0.008, (-length / 2, 0, 0), mat, g,
                   (90, rot, 0), bevel=0.002, segments=1)
    B.prism(_n(g, 'stripe'), [(0.1, -0.08), (0.18, -0.08), (0.18, 0.08), (0.1, 0.08)], 0.004,
            (-length / 2, -0.009, 0), accent, g, (90, rot, 0), bevel=0, segments=1)
    box(_n(g, 'hem'), (0.05, 0.012, 0.25), (-length / 2 + 0.02, -0.004, 0), accent, g, (0, rot, 0), bevel=0.003)
    R.on_wall(g, side)
    return g


# ----------------------------------------------------------------------------------------------------------------
# furniture + props
# ----------------------------------------------------------------------------------------------------------------

def crt_tv(name='tv', location=(0, 0, 0), rotation=0, stand='crate', interact=None, console=True, obstacle=True):
    """Chunky old CRT television with rabbit-ear antenna on a stand (crate | cart), screen facing local -Y.
    console=True adds a retro console, a tangle of cables and a controller on the floor."""
    g = _g(name, location, rotation, obstacle, interact)
    if stand == 'crate':
        SW, SD, SH = 0.7, 0.45, 0.42
        for z in (0.0, SH - 0.03):
            box(_n(g, 'deck'), (SW, SD, 0.03), (0, 0, z + 0.015), 'wood_light', g, bevel=0.005)
        for sx in (-1, 1):
            for k in range(3):
                box(_n(g, 'slat'), (0.03, SD, 0.08), (sx * (SW / 2 - 0.015), 0, 0.07 + k * 0.12), 'wood_light', g,
                    bevel=0.004, segments=1)
        for k in range(2):
            box(_n(g, 'back'), (SW, 0.02, 0.08), (0, SD / 2 - 0.01, 0.1 + k * 0.15), 'wood_mid', g, bevel=0.004,
                segments=1)
        # VHS tapes on the shelf inside the crate
        for i in range(5):
            box(_n(g, 'vhs'), (0.035, 0.19, 0.11), (-0.22 + i * 0.045, -0.04, 0.03 + 0.055), ['plastic_black',
                'plastic_black', 'poster_b', 'plastic_black', 'fabric_coral'][i], g, bevel=0.003, segments=1)
        top = SH
    else:
        SW, SD, top = 0.72, 0.46, 0.62
        box(_n(g, 'top'), (SW, SD, 0.03), (0, 0, top - 0.015), 'plastic_grey', g, bevel=0.006)
        box(_n(g, 'shelf'), (SW, SD, 0.025), (0, 0, 0.18), 'plastic_grey', g, bevel=0.005)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl(_n(g, 'post'), 0.012, top, (sx * (SW / 2 - 0.02), sy * (SD / 2 - 0.02), top / 2), 'metal', g,
                    verts=8, bevel=0)
                sphere(_n(g, 'caster'), 0.025, (sx * (SW / 2 - 0.02), sy * (SD / 2 - 0.02), 0.025), 'plastic_black',
                       g, segs=8, rings=5)
    # CRT body: a deep rounded box + a tapering back
    tw, th, td = 0.6, 0.48, 0.42
    box(_n(g, 'body'), (tw, td * 0.55, th), (0, -td * 0.2, top + th / 2), 'plastic_grey', g, bevel=0.05, segments=3)
    box(_n(g, 'rear'), (tw * 0.72, td * 0.5, th * 0.78), (0, td * 0.2, top + th * 0.45), 'plastic_grey', g,
        bevel=0.06, segments=3)
    box(_n(g, 'bezel'), (tw - 0.04, 0.02, th - 0.04), (0, -td * 0.47, top + th / 2), 'plastic_black', g, bevel=0.03,
        segments=2)
    blob(_n(g, 'screen'), (tw - 0.14, 0.035, th - 0.14), (-0.035, -td * 0.49, top + th / 2 + 0.01), 'screen', g,
         round_xy=0.25, round_z=0.25, segs=16, rings=8)
    for i in range(3):
        cyl(_n(g, 'knob'), 0.014, 0.02, (tw / 2 - 0.05, -td * 0.49, top + th * 0.62 - i * 0.07), 'metal', g, (90, 0, 0),
            verts=10, bevel=0.003)
    sphere(_n(g, 'led'), 0.007, (tw / 2 - 0.05, -td * 0.49, top + 0.07), 'neon_red', g, segs=6, rings=4)
    # rabbit ears
    base = (0.0, 0.02, top + th)
    blob(_n(g, 'antbase'), (0.14, 0.1, 0.05), (base[0], base[1], base[2] + 0.02), 'plastic_black', g,
         round_xy=0.6, round_z=0.6, segs=10, rings=6)
    for sx in (-1, 1):
        tube(_n(g, 'ant'), [(base[0] + sx * 0.02, base[1], base[2] + 0.04),
                            (base[0] + sx * 0.28, base[1] + 0.06, base[2] + 0.5)], 0.005, 'metal', g, res=5)
        sphere(_n(g, 'anttip'), 0.012, (base[0] + sx * 0.28, base[1] + 0.06, base[2] + 0.5), 'metal', g, segs=6,
               rings=4)
    if console:
        box(_n(g, 'console'), (0.26, 0.2, 0.06), (0.06, -0.02, 0.03 + (0.03 if stand == 'crate' else 0.19)),
            'plastic_grey', g, bevel=0.012)
        box(_n(g, 'cart'), (0.1, 0.07, 0.025), (0.06, -0.02, 0.075 + (0.03 if stand == 'crate' else 0.19)),
            'fabric_mustard', g, bevel=0.005, segments=1)
        pad = (0.3, -0.55, 0.02)
        blob(_n(g, 'pad'), (0.15, 0.09, 0.04), pad, 'plastic_grey', g, (0, 0, 25), round_xy=0.6, round_z=0.6, segs=12,
             rings=6)
        tube(_n(g, 'padcable'), [(pad[0], pad[1] + 0.04, 0.012), (pad[0] - 0.1, pad[1] + 0.25, 0.01),
                                 (0.1, -0.3, 0.008), (0.06, -0.12, 0.05)], 0.005, 'plastic_black', g, res=4)
    return g


def clothes_pile(name='clothes', location=(0, 0, 0), rotation=0, n=5, seed=2, mats=None, obstacle=False,
                 parent='root'):
    """A slumped pile of clothes on the floor (or on a chair/bed with parent + location)."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle, parent=parent)
    cols = mats or ['fabric_grey', 'fabric_navy', 'fabric_coral', 'fabric_cream', 'fabric_teal', 'fabric_blue']
    for i in range(n):
        a = rng.uniform(0, TAU)
        r = rng.uniform(0.0, 0.15)
        blob(_n(g, 'cloth'), (rng.uniform(0.3, 0.45), rng.uniform(0.2, 0.32), rng.uniform(0.05, 0.09)),
             (math.cos(a) * r, math.sin(a) * r, 0.03 + i * 0.028), cols[i % len(cols)], g,
             (rng.uniform(-8, 8), rng.uniform(-8, 8), rng.uniform(0, 180)), round_xy=0.55, round_z=0.7, segs=12,
             rings=6)
    # a sleeve flopping out
    blob(_n(g, 'sleeve'), (0.32, 0.08, 0.045), (0.22, -0.06, 0.03), cols[0], g, (0, 0, -25), round_xy=0.7,
         round_z=0.7, segs=10, rings=6)
    return g


def sneakers(name='shoes', location=(0, 0, 0), rotation=0, mat='plastic_white', accent='fabric_coral', spread=0.14,
             kicked=12, parent='root'):
    """A pair of chunky sneakers (toe toward local -Y), one kicked askew."""
    g = _g(name, location, rotation, False, parent=parent)
    for i, sx in enumerate((-1, 1)):
        rz = (kicked if i else -4)
        x, y = sx * spread / 2, (0.05 if i else 0)
        sole = box(_n(g, 'sole'), (0.1, 0.28, 0.03), (x, y, 0.015), 'paper', g, rz, bevel=0.012, segments=2)
        blob(_n(g, 'upper'), (0.095, 0.26, 0.09), (x, y + 0.01, 0.065), mat, g, (0, 0, rz), round_xy=0.55,
             round_z=0.65, segs=12, rings=6)
        box(_n(g, 'swoosh'), (0.1, 0.12, 0.02), (x, y + 0.02, 0.06), accent, g, rz, bevel=0.008, segments=1)
    return g


def soda_can(g, loc, mat='mcd_red', tipped=False):
    """Soda can built INTO group g at local loc (bottom centre); tipped=True lies on its side."""
    if tipped:
        cyl(_n(g, 'can'), 0.033, 0.12, (loc[0], loc[1], loc[2] + 0.033), mat, g, (0, 90, 30), verts=12, bevel=0.004)
    else:
        cyl(_n(g, 'can'), 0.033, 0.12, (loc[0], loc[1], loc[2] + 0.06), mat, g, verts=12, bevel=0.004)
        cyl(_n(g, 'lid'), 0.028, 0.004, (loc[0], loc[1], loc[2] + 0.121), 'metal', g, verts=12, bevel=0)


def pizza_box(g, loc, rot=0, open_lid=True, slices=4):
    """Pizza box built INTO group g at local loc (bottom centre), lid flipped open with a few slices inside."""
    s = 0.36
    box(_n(g, 'pizzabox'), (s, s, 0.04), (loc[0], loc[1], loc[2] + 0.02), 'kraft', g, rot, bevel=0.006, segments=1)
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    if open_lid:
        # lid hinged at the local +Y edge, tilted back
        ox, oy = -sa * (s / 2 + 0.02), ca * (s / 2 + 0.02)
        box(_n(g, 'pizzalid'), (s, s, 0.012), (loc[0] + ox * 1.9, loc[1] + oy * 1.9, loc[2] + 0.13), 'kraft', g,
            (70, 0, rot), bevel=0.004, segments=1)
        cyl(_n(g, 'pizza'), 0.155, 0.018, (loc[0], loc[1], loc[2] + 0.045), 'fabric_mustard', g, verts=20, bevel=0.006)
        torus(_n(g, 'crust'), 0.15, 0.014, (loc[0], loc[1], loc[2] + 0.052), 'wood_light', g, major=20, minor=6)
        for i in range(5):
            a = i * 1.3
            sphere(_n(g, 'pepperoni'), 0.022, (loc[0] + math.cos(a) * 0.08, loc[1] + math.sin(a) * 0.08,
                                               loc[2] + 0.056), 'mcd_red', g, scale=(1, 1, 0.25), segs=8, rings=4)


def storage_tubs(name='tubs', location=(0, 0, 0), rotation=0, n=3, seed=4, obstacle=True, cols=None):
    """Stacked plastic storage tubs with coloured lids (holiday decorations), front = local -Y."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle)
    cols = cols or ['mcd_red', 'plant_dark', 'fabric_blue', 'mcd_yellow']
    z = 0.0
    x = 0.0
    for i in range(n):
        w, d, h = 0.6, 0.4, 0.3
        if i == 2:
            z, x = 0.0, 0.64
        box(_n(g, 'tub'), (w, d, h), (x, 0, z + h / 2), 'plastic_white', g, rng.uniform(-4, 4), bevel=0.03,
            segments=2)
        box(_n(g, 'lid'), (w + 0.03, d + 0.03, 0.04), (x, 0, z + h + 0.01), cols[i % len(cols)], g,
            rng.uniform(-4, 4), bevel=0.012, segments=2)
        z += h + 0.04
    # tinsel poking out
    tube(_n(g, 'tinsel'), [(0.2, -0.1, 0.3), (0.28, -0.26, 0.2), (0.34, -0.3, 0.02)], 0.02, 'plant', g, res=6)
    return g


def lava_lamp(g, loc, mat='neon_purple'):
    """Lava lamp built INTO group g at local loc (bottom centre)."""
    lathe(_n(g, 'lavabase'), [(0.06, 0), (0.06, 0.02), (0.035, 0.1), (0.04, 0.1)], loc, 'metal', g, verts=12,
          cap_top=True)
    lathe(_n(g, 'lavaglass'), [(0.04, 0.1), (0.05, 0.2), (0.03, 0.32), (0.0, 0.33)], loc, 'window_glass', g, verts=12)
    for i, (dz, r) in enumerate(((0.14, 0.022), (0.21, 0.017), (0.27, 0.012))):
        sphere(_n(g, 'lava'), r, (loc[0] + (i - 1) * 0.006, loc[1], loc[2] + dz), mat, g, scale=(1, 1, 1.3), segs=8,
               rings=5)
    lathe(_n(g, 'lavacap'), [(0.03, 0.32), (0.022, 0.37), (0.0, 0.38)], loc, 'metal', g, verts=12)


def dumbbells(name='dumbbells', location=(0, 0, 0), rotation=0, mat='fabric_coral'):
    """Two hex dumbbells on the floor."""
    g = _g(name, location, rotation, False)
    for i in range(2):
        y = i * 0.16
        tube(_n(g, 'bar'), [(-0.13, y, 0.05), (0.13, y, 0.05)], 0.014, 'metal', g, res=6)
        for sx in (-1, 1):
            cyl(_n(g, 'weight'), 0.05, 0.07, (sx * 0.12, y, 0.05), mat, g, (0, 90, 0), verts=6, bevel=0.008)
    return g


def folding_table_set(name='table', location=(0, 0, 0), rotation=0, w=1.0, d=0.65, chairs=(), parent='root',
                      obstacle=True, interact=None):
    """White folding kitchen table (top 0.75) + optional metal folding chairs at local x offsets in `chairs`
    (each a (x, side) tuple, side -1 = local -Y side facing +Y, +1 = far side facing -Y)."""
    g = _g(name, location, rotation, obstacle, interact, parent=parent)
    H = 0.75
    box(_n(g, 'top'), (w, d, 0.035), (0, 0, H - 0.0175), 'plastic_white', g, bevel=0.012)
    box(_n(g, 'apron'), (w - 0.06, d - 0.06, 0.04), (0, 0, H - 0.055), 'plastic_grey', g, bevel=0.004, segments=1)
    for sx in (-1, 1):
        tube(_n(g, 'legs'), [(sx * (w / 2 - 0.07), -d / 2 + 0.06, 0.0), (sx * (w / 2 - 0.07), -d / 2 + 0.06, H - 0.07),
                             (sx * (w / 2 - 0.07), d / 2 - 0.06, H - 0.07), (sx * (w / 2 - 0.07), d / 2 - 0.06, 0.0)],
             0.014, 'metal', g, res=6)
        tube(_n(g, 'brace'), [(sx * (w / 2 - 0.07), -d / 2 + 0.06, 0.2), (sx * (w / 2 - 0.07), d / 2 - 0.06, 0.2)],
             0.01, 'metal', g, res=6)
    for cx, side in chairs:
        folding_chair(g, (cx, side * (d / 2 + 0.18), 0), 0 if side > 0 else 180)
    return g


def folding_chair(g, loc, rot, mat='fabric_teal', frame='metal'):
    """Metal folding chair built INTO group g (sitter faces local -Y of the chair; seat 0.46)."""
    c = B.group(_n(g, 'fchair'), loc, rot, parent=g)
    box(_n(c, 'seat'), (0.4, 0.38, 0.035), (0, 0.0, 0.46), mat, c, bevel=0.012)
    box(_n(c, 'back'), (0.4, 0.03, 0.2), (0, 0.2, 0.78), mat, c, (-8, 0, 0), bevel=0.01)
    for sx in (-1, 1):
        tube(_n(c, 'rear'), [(sx * 0.19, 0.19, 0.0), (sx * 0.19, 0.19, 0.46), (sx * 0.19, 0.22, 0.9)], 0.011, frame,
             c, res=6)
        tube(_n(c, 'front'), [(sx * 0.18, -0.2, 0.0), (sx * 0.18, 0.15, 0.45)], 0.011, frame, c, res=6)
    return c


def mini_shelf_items(g, x0, x1, y, z, seed=7):
    """Kitchen staples on a shelf built INTO group g (local): cereal boxes, jars, a mug, instant noodle cups."""
    rng = random.Random(seed)
    x = x0
    kinds = ['cereal', 'noodle', 'jar', 'noodle', 'mug', 'cereal', 'jar']
    i = 0
    while x < x1 - 0.06:
        k = kinds[i % len(kinds)]
        if k == 'cereal':
            box(_n(g, 'cereal'), (0.07, 0.2, 0.28), (x + 0.035, y, z + 0.14), ['poster_a', 'mcd_yellow', 'poster_b'][i % 3],
                g, rng.uniform(-4, 4), bevel=0.004, segments=1)
            x += 0.09
        elif k == 'noodle':
            cyl(_n(g, 'cup'), 0.045, 0.1, (x + 0.05, y, z + 0.05), 'paper', g, verts=12, r2=0.052, bevel=0.003)
            cyl(_n(g, 'cupband'), 0.049, 0.03, (x + 0.05, y, z + 0.06), 'mcd_red', g, verts=12, bevel=0)
            x += 0.11
        elif k == 'jar':
            lathe(_n(g, 'jar'), [(0.04, 0), (0.042, 0.1), (0.03, 0.12)], (x + 0.045, y, z), 'window_glass', g,
                  verts=10, cap_top=True)
            cyl(_n(g, 'jarlid'), 0.032, 0.02, (x + 0.045, y, z + 0.13), 'fabric_coral', g, verts=10, bevel=0.003)
            sphere(_n(g, 'jarfill'), 0.034, (x + 0.045, y, z + 0.045), 'wood_mid', g, scale=(1, 1, 1.2), segs=8, rings=5)
            x += 0.1
        else:
            cyl(_n(g, 'mug'), 0.04, 0.09, (x + 0.045, y, z + 0.045), 'fabric_teal', g, verts=12, bevel=0.004)
            x += 0.1
        i += 1


def guitar(name='guitar', location=(0, 0, 0), rotation=0, lean=14, body='wood_light', neck='wood_dark',
           obstacle=False):
    """Acoustic guitar standing on its bottom, face toward local -Y, leaning back `lean` degrees against a wall."""
    g = _g(name, location, rotation, obstacle)
    inner = B.group(_n(g, 'lean'), (0, 0, 0), (-lean, 0, 0), parent=g)
    blob(_n(inner, 'lower'), (0.38, 0.1, 0.34), (0, 0, 0.19), body, inner, round_xy=0.9, round_z=0.9, segs=18, rings=8)
    blob(_n(inner, 'upper'), (0.3, 0.1, 0.26), (0, 0, 0.44), body, inner, round_xy=0.9, round_z=0.9, segs=18, rings=8)
    cyl(_n(inner, 'hole'), 0.05, 0.01, (0, -0.052, 0.36), 'plastic_black', inner, (90, 0, 0), verts=14, bevel=0)
    box(_n(inner, 'bridge'), (0.1, 0.012, 0.025), (0, -0.052, 0.2), neck, inner, bevel=0.004, segments=1)
    box(_n(inner, 'neck'), (0.05, 0.03, 0.45), (0, -0.02, 0.78), neck, inner, bevel=0.01)
    box(_n(inner, 'head'), (0.07, 0.03, 0.14), (0, -0.015, 1.06), neck, inner, (4, 0, 0), bevel=0.012)
    for i in range(3):
        for sx in (-1, 1):
            cyl(_n(inner, 'peg'), 0.008, 0.03, (sx * 0.045, -0.015, 1.02 + i * 0.035), 'metal', inner, (0, 90, 0),
                verts=6, bevel=0)
    return g


def dartboard(side, at, z, r=0.2):
    """Dartboard with coloured rings + two darts, parented to wall `side`."""
    g = _g(f'dartboard_{side}', R.wall_point(side, at, z, 0.0), B.against(side))
    cyl(_n(g, 'back'), r, 0.03, (0, -0.015, 0), 'plastic_black', g, (90, 0, 0), verts=24, bevel=0.008)
    for i, (rr, m) in enumerate(((0.82, 'fabric_cream'), (0.62, 'mcd_red'), (0.45, 'fabric_cream'),
                                 (0.25, 'plant_dark'), (0.1, 'mcd_red'))):
        cyl(_n(g, 'ring'), r * rr, 0.004, (0, -0.032 - i * 0.002, 0), m, g, (90, 0, 0), verts=24, bevel=0)
    for dx, dz in ((0.05, 0.04), (-0.08, -0.03)):
        tube(_n(g, 'dart'), [(dx, -0.04, dz), (dx + 0.02, -0.14, dz + 0.02)], 0.005, 'metal', g, res=4)
        box(_n(g, 'flight'), (0.03, 0.03, 0.004), (dx + 0.02, -0.14, dz + 0.02), 'fabric_teal', g, bevel=0, segments=1)
    R.on_wall(g, side)
    return g


def light_switch(side, at, z=1.15):
    """Light switch plate, parented to wall `side`."""
    g = _g(f'switch_{side}', R.wall_point(side, at, z, 0.0), B.against(side))
    box(_n(g, 'plate'), (0.08, 0.012, 0.12), (0, -0.006, 0), 'plastic_white', g, bevel=0.004, segments=1)
    box(_n(g, 'toggle'), (0.018, 0.015, 0.035), (0, -0.016, 0.01), 'plastic_grey', g, bevel=0.003, segments=1)
    R.on_wall(g, side)
    return g


def headphones(g, loc, rot=0, mat='plastic_black', pad='fabric_coral'):
    """Over-ear headphones lying on a desk, built INTO group g at local loc."""
    torus(_n(g, 'hpband'), 0.085, 0.012, (loc[0], loc[1], loc[2] + 0.02), mat, g, (0, 0, rot), major=16, minor=6,
          arc=180)
    for sx in (-1, 1):
        a = math.radians(rot)
        x = loc[0] + sx * 0.085 * math.cos(a)
        y = loc[1] + sx * 0.085 * math.sin(a)
        cyl(_n(g, 'hpcup'), 0.045, 0.035, (x, y, loc[2] + 0.0175), pad, g, verts=12, bevel=0.01)


def plushie(g, loc, rot=0, mat='wood_light', accent='fabric_cream', scale=1.0):
    """Small sitting teddy bear built INTO group g at local loc (bottom centre), facing local -Y (rotated by rot)."""
    s = scale
    c = B.group(_n(g, 'plush'), loc, rot, parent=g)
    sphere(_n(c, 'body'), 0.075 * s, (0, 0, 0.07 * s), mat, c, scale=(1, 0.85, 1.05), segs=12, rings=8)
    sphere(_n(c, 'head'), 0.06 * s, (0, -0.01 * s, 0.18 * s), mat, c, segs=12, rings=8)
    sphere(_n(c, 'snout'), 0.025 * s, (0, -0.06 * s, 0.17 * s), accent, c, scale=(1.2, 1, 0.8), segs=8, rings=5)
    sphere(_n(c, 'nose'), 0.009 * s, (0, -0.083 * s, 0.18 * s), 'plastic_black', c, segs=6, rings=4)
    for sx in (-1, 1):
        sphere(_n(c, 'ear'), 0.022 * s, (sx * 0.045 * s, 0.0, 0.235 * s), mat, c, scale=(1, 0.6, 1), segs=8, rings=5)
        sphere(_n(c, 'eye'), 0.008 * s, (sx * 0.022 * s, -0.052 * s, 0.2 * s), 'plastic_black', c, segs=6, rings=4)
        sphere(_n(c, 'arm'), 0.028 * s, (sx * 0.07 * s, -0.02 * s, 0.09 * s), mat, c, scale=(0.8, 0.8, 1.4), segs=8,
               rings=5)
        sphere(_n(c, 'leg'), 0.032 * s, (sx * 0.045 * s, -0.06 * s, 0.03 * s), mat, c, scale=(1, 1.4, 0.9), segs=8,
               rings=5)
    return c


def stair_rail(stairs_group, width, steps, rise, run, side=-1, zmax=2.62, mat='wood_light', post_mat='plastic_white',
               h=0.88):
    """Handrail + balusters built INTO a F.stairs group (local frame: rising toward +Y from the origin), on local
    side -1 (-X) or +1, stopping where the rail would poke above `zmax` (the wall top in a cutaway diorama)."""
    g = stairs_group
    x = side * (width / 2 - 0.03)
    pts = []
    last = 0
    for i in range(steps):
        y = i * run + run / 2
        z = (i + 1) * rise
        if z + h > zmax:
            break
        last = i
        if i % 2 == 0:
            tube(_n(g, 'baluster'), [(x, y, z), (x, y, z + h)], 0.012, post_mat, g, res=6)
        pts.append((x, y, z + h))
    if len(pts) >= 2:
        y0, z0 = pts[0][1], pts[0][2]
        # newel post at the bottom
        box(_n(g, 'newel'), (0.07, 0.07, h + 0.12), (x, y0, rise + (h + 0.12) / 2 - 0.02), mat, g, bevel=0.012)
        sphere(_n(g, 'newelcap'), 0.045, (x, y0, rise + h + 0.13), mat, g, segs=10, rings=6)
        yl, zl = pts[-1][1], pts[-1][2]
        tube(_n(g, 'handrail'), [(x, y0, z0), (x, yl, zl)], 0.024, mat, g, res=8)
        sphere(_n(g, 'railend'), 0.03, (x, yl, zl), mat, g, segs=8, rings=5)
        if last % 2 == 1:
            tube(_n(g, 'baluster'), [(x, yl, zl - h), (x, yl, zl)], 0.012, post_mat, g, res=6)
    return g


def gather(name, side, groups):
    """Put several wall-decor groups under ONE empty parented to wall `side`, so the exporter merges them into a
    single mesh (fewer draw calls). The groups keep their world transforms."""
    g = _g(name, (0, 0, 0), 0)
    R.on_wall(g, side)
    for c in groups:
        B.reparent(c, g)
    return g


def string_bulbs_on_wall(side, a_at, b_at, z, sag=0.16, n=12, name=None):
    """Fairy lights hung along the inner face of wall `side` between two `at` positions (hooks at height z)."""
    import furniture as F
    a = R.wall_point(side, a_at, z, 0.03)
    b = R.wall_point(side, b_at, z, 0.03)
    g = F.string_lights(a, b, n=n, sag=sag, name=name or f'string_lights_{side}')
    R.on_wall(g, side)
    return g
