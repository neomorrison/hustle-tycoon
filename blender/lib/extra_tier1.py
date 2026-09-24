"""Extra builders for the tier1 (shared apartment bedroom + kitchenette) diorama. Owned by the tier0/tier1 room
builder; reuses the helpers in extra_tier0.py. Front = local -Y, metres, degrees."""
import math
import random

import build as B
import room as R
from build import box, cyl, blob, tube, panel, lathe, sphere, torus

from extra_tier0 import _g, _n


def clothes_rack(name='clothes_rack', location=(0, 0, 0), rotation=0, w=1.0, h=1.55, seed=6, obstacle=True):
    """Rolling garment rail with shirts / hoodies on hangers, a shoe row on the base shelf. Rail along local X."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle)
    for sx in (-1, 1):
        tube(_n(g, 'post'), [(sx * w / 2, 0, 0.08), (sx * w / 2, 0, h)], 0.014, 'metal', g, res=8)
        tube(_n(g, 'foot'), [(sx * w / 2, -0.22, 0.06), (sx * w / 2, 0.22, 0.06)], 0.016, 'metal', g, res=8)
        for sy in (-1, 1):
            sphere(_n(g, 'wheel'), 0.03, (sx * w / 2, sy * 0.2, 0.03), 'plastic_black', g, segs=8, rings=5)
    tube(_n(g, 'rail'), [(-w / 2, 0, h), (w / 2, 0, h)], 0.014, 'metal', g, res=8)
    box(_n(g, 'shelf'), (w - 0.02, 0.36, 0.02), (0, 0, 0.18), 'wood_light', g, bevel=0.005, segments=1)
    cols = ['fabric_coral', 'fabric_cream', 'fabric_navy', 'fabric_mustard', 'fabric_teal', 'fabric_grey',
            'rug_rose', 'fabric_blue']
    n = 8
    for i in range(n):
        x = -w / 2 + 0.1 + i * (w - 0.2) / (n - 1)
        rz = rng.uniform(-8, 8)
        long = rng.random() < 0.35
        hh = rng.uniform(0.62, 0.75) if not long else rng.uniform(0.9, 1.0)
        torus(_n(g, 'hook'), 0.018, 0.004, (x, 0, h + 0.012), 'metal_dark', g, (90, 0, 90), major=8, minor=4)
        box(_n(g, 'hanger'), (0.012, 0.36, 0.03), (x, 0, h - 0.04), 'wood_light', g, (0, 0, rz), bevel=0.004, segments=1)
        blob(_n(g, 'garment'), (0.07, 0.42, hh), (x, 0, h - 0.06 - hh / 2), cols[i % len(cols)], g, (0, 0, rz),
             round_xy=0.5, round_z=0.25, segs=10, rings=6)
    # shoes on the base shelf
    for i in range(3):
        x = -w / 2 + 0.2 + i * 0.3
        for k in (-1, 1):
            blob(_n(g, 'shoe'), (0.24, 0.09, 0.08), (x + k * 0.05, -0.02 + k * 0.05, 0.23),
                 ['plastic_white', 'fabric_coral', 'plastic_black'][i], g, (0, 0, 10 * k), round_xy=0.6, round_z=0.6,
                 segs=10, rings=5)
    return g


def skateboard(name='skateboard', location=(0, 0, 0), rotation=0, deck='fabric_teal', lean=True, parent='root'):
    """Skateboard leaning against a wall (local +Y) on its tail, or flat on the floor (lean=False)."""
    g = _g(name, location, rotation, False, parent=parent)
    # leaning: the tail sits 0.25 m out from the wall and the nose tips back against it (+72 deg about X lifts the
    # deck's +Y end UP; the old -72 swung it down through the floor, outside the wall)
    inner = B.group(_n(g, 'tilt'), (0, -0.25, 0) if lean else (0, 0, 0), (72, 0, 0) if lean else (0, 0, 0), parent=g)
    zc = 0.1 if not lean else 0.02
    box(_n(inner, 'deck'), (0.2, 0.78, 0.018), (0, 0.39 if lean else 0, zc), deck, inner, bevel=0.008, segments=2)
    box(_n(inner, 'grip'), (0.19, 0.6, 0.004), (0, 0.39 if lean else 0, zc + 0.011), 'plastic_black', inner, bevel=0,
        segments=1)
    for ty in (0.12, 0.66) if lean else (-0.27, 0.27):
        box(_n(inner, 'truck'), (0.16, 0.04, 0.03), (0, ty, zc - 0.025), 'metal', inner, bevel=0.006, segments=1)
        for sx in (-1, 1):
            cyl(_n(inner, 'wheel'), 0.027, 0.03, (sx * 0.095, ty, zc - 0.045), 'mcd_yellow', inner, (0, 90, 0),
                verts=10, bevel=0.006)
    return g


def backpack(name='backpack', location=(0, 0, 0), rotation=0, mat='fabric_navy', accent='fabric_mustard',
             parent='root'):
    """Slumped school backpack sitting on the floor, front pocket toward local -Y."""
    g = _g(name, location, rotation, False, parent=parent)
    blob(_n(g, 'body'), (0.32, 0.2, 0.42), (0, 0, 0.21), mat, g, (-6, 0, 0), round_xy=0.55, round_z=0.4, segs=14,
         rings=8)
    blob(_n(g, 'pocket'), (0.24, 0.08, 0.18), (0, -0.1, 0.14), accent, g, round_xy=0.55, round_z=0.45, segs=12, rings=6)
    for sx in (-1, 1):
        tube(_n(g, 'strap'), [(sx * 0.1, 0.09, 0.38), (sx * 0.12, 0.16, 0.2), (sx * 0.1, 0.12, 0.04)], 0.018, mat, g,
             res=6)
    torus(_n(g, 'loop'), 0.04, 0.008, (0, 0.02, 0.43), mat, g, (90, 0, 0), major=10, minor=4)
    return g


def speaker(g, loc, rot=0, mat='fabric_grey'):
    """Small cylindrical Bluetooth speaker built INTO group g."""
    cyl(_n(g, 'spk'), 0.045, 0.16, (loc[0], loc[1], loc[2] + 0.08), mat, g, verts=14, bevel=0.012)
    cyl(_n(g, 'spkcap'), 0.04, 0.01, (loc[0], loc[1], loc[2] + 0.163), 'plastic_black', g, verts=14, bevel=0)


def fruit_bowl(g, loc, seed=3):
    """Shallow bowl with a few fruits built INTO group g at local loc (bottom centre)."""
    rng = random.Random(seed)
    lathe(_n(g, 'bowl'), [(0.05, 0), (0.12, 0.05), (0.13, 0.06), (0.12, 0.06), (0.05, 0.01)], loc, 'fabric_teal', g,
          verts=16)
    for i, m in enumerate(('mcd_red', 'fabric_mustard', 'poster_a', 'rug_green')):
        a = i * 1.7
        sphere(_n(g, 'fruit'), 0.042, (loc[0] + math.cos(a) * 0.05, loc[1] + math.sin(a) * 0.05, loc[2] + 0.07 +
                                      (0.03 if i == 3 else 0)), m, g, segs=10, rings=6)
    blob(_n(g, 'banana'), (0.18, 0.05, 0.04), (loc[0], loc[1] - 0.02, loc[2] + 0.1), 'mcd_yellow', g, (0, 0, 30),
         round_xy=0.8, round_z=0.8, segs=10, rings=5, deform=lambda x, y, z: (x, y + 3.0 * x * x, z))


def dish_rack(g, loc, rot=0):
    """Plastic dish drainer with plates + a mug, built INTO group g at local loc (bottom centre)."""
    box(_n(g, 'rack'), (0.36, 0.26, 0.06), (loc[0], loc[1], loc[2] + 0.03), 'plastic_white', g, rot, bevel=0.012)
    for i in range(4):
        cyl(_n(g, 'plate'), 0.1, 0.012, (loc[0] - 0.1 + i * 0.05, loc[1] + 0.02, loc[2] + 0.12),
            ['plastic_white', 'wall_sky', 'plastic_white', 'fabric_coral'][i], g, (0, 90, rot), verts=16, bevel=0.003)
    cyl(_n(g, 'rackmug'), 0.04, 0.09, (loc[0] + 0.12, loc[1] - 0.06, loc[2] + 0.1), 'mcd_yellow', g, (180, 0, 0),
        verts=12, bevel=0.004)


def coat_hooks(side, at, z=1.65, name=None, seed=2):
    """Wall hook rail with a jacket, a tote bag and a cap hanging on it, parented to wall `side`."""
    g = _g(name or f'coat_hooks_{side}', R.wall_point(side, at, z, 0.0), B.against(side))
    box(_n(g, 'rail'), (0.5, 0.025, 0.07), (0, -0.0125, 0), 'wood_light', g, bevel=0.006)
    for i in range(3):
        x = -0.17 + i * 0.17
        tube(_n(g, 'hook'), [(x, -0.02, 0.0), (x, -0.07, -0.01), (x, -0.075, 0.03)], 0.006, 'metal_dark', g, res=5)
    # jacket
    blob(_n(g, 'jacket'), (0.3, 0.1, 0.62), (-0.17, -0.07, -0.3), 'fabric_navy', g, (0, 0, 0), round_xy=0.5, round_z=0.3,
         segs=12, rings=8)
    blob(_n(g, 'hood'), (0.2, 0.08, 0.1), (-0.17, -0.1, -0.02), 'fabric_navy', g, round_xy=0.7, round_z=0.7, segs=10,
         rings=6)
    # tote bag
    box(_n(g, 'tote'), (0.26, 0.05, 0.3), (0.0, -0.06, -0.3), 'fabric_cream', g, (0, 4, 0), bevel=0.015)
    tube(_n(g, 'totestrap'), [(-0.08, -0.06, -0.16), (0.0, -0.07, 0.0), (0.08, -0.06, -0.16)], 0.007, 'fabric_cream',
         g, res=4)
    box(_n(g, 'toteprint'), (0.12, 0.004, 0.12), (0.0, -0.087, -0.3), 'poster_a', g, (0, 4, 0), bevel=0, segments=1)
    # cap
    sphere(_n(g, 'cap'), 0.09, (0.17, -0.1, -0.04), 'fabric_mustard', g, scale=(1, 1, 0.6), segs=12, rings=6)
    box(_n(g, 'brim'), (0.14, 0.1, 0.012), (0.17, -0.17, -0.08), 'fabric_mustard', g, (-20, 0, 0), bevel=0.004,
        segments=1)
    R.on_wall(g, side)
    return g


def wall_calendar(side, at, z, name=None):
    """Grid calendar (abstract squares, a few days marked) on wall `side`."""
    g = _g(name or f'calendar_{side}', R.wall_point(side, at, z, 0.0), B.against(side))
    box(_n(g, 'pic'), (0.3, 0.008, 0.2), (0, -0.004, 0.14), 'poster_b', g, bevel=0, segments=1)
    box(_n(g, 'grid'), (0.3, 0.008, 0.26), (0, -0.004, -0.1), 'paper', g, bevel=0, segments=1)
    for i, (cx, cz) in enumerate(((0.06, -0.05), (-0.08, -0.14), (0.1, -0.18))):
        box(_n(g, 'mark'), (0.035, 0.004, 0.035), (cx, -0.01, cz), ['mcd_red', 'rug_green', 'mcd_red'][i], g, bevel=0,
            segments=1)
    R.on_wall(g, side)
    return g
