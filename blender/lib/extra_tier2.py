"""Room-specific decor helpers for tier2 (the Studio). Owned by the tier2/tier3 room builder.

Small custom pieces the shared catalogue does not have (shoes, coat hooks with jackets, floor book stacks, sticky
notes, cable runs) plus the tier2 decor pass. tier3 reuses the generic helpers (shoe_pair, coat_hooks, ...).
"""
import math
import random

import build as B


def shoe_pair(g, loc, rot=0.0, mat='plastic_white', sole='plastic_white', scale=1.0, spread=0.13):
    """A pair of chunky sneakers (toes toward local -Y of `rot`) built into group g at local loc (floor point)."""
    x0, y0, z0 = loc
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    for i, s in enumerate((-1, 1)):
        dx, dy = s * spread / 2, (0.03 if s > 0 else -0.02)
        px, py = x0 + dx * ca - dy * sa, y0 + dx * sa + dy * ca
        r = rot + s * 6
        B.blob(B.uname(g.name + '_shoe'), (0.1 * scale, 0.26 * scale, 0.09 * scale), (px, py, z0 + 0.05 * scale), mat,
               g, rot=r, round_xy=0.55, round_z=0.5, segs=12, rings=6)
        B.box(B.uname(g.name + '_sole'), (0.105 * scale, 0.27 * scale, 0.025 * scale), (px, py, z0 + 0.0125 * scale),
              sole, g, rot=r, bevel=0.008, segments=1)


def coat_hooks(name, loc, rot, coats=(('fabric_navy', 0.8), ('fabric_coral', 0.65)), bag='kraft', parent='root'):
    """Wall rail with pegs and hanging jackets / a tote. loc = centre of the rail's back on the wall face,
    rot = B.against(wall). Parent it to its wall with room.on_wall."""
    g = B.group(name, loc, rot, parent=parent)
    B.box(B.uname(name + '_rail'), (0.8, 0.03, 0.09), (0, -0.015, 0), 'wood_light', g, bevel=0.008)
    for i in range(4):
        x = -0.3 + i * 0.2
        B.cyl(B.uname(name + '_peg'), 0.012, 0.07, (x, -0.06, 0.0), 'wood_mid', g, rot=(90, 0, 0), verts=8)
    xs = [-0.3, -0.1, 0.1, 0.3]
    for (m, ln), x in zip(coats, xs):
        # jacket: shoulders blob + long body, hung from a peg
        B.blob(B.uname(name + '_coat'), (0.36, 0.12, ln), (x, -0.08, -ln / 2 + 0.02), m, g,
               round_xy=0.5, round_z=0.3, segs=12, rings=8)
        B.blob(B.uname(name + '_hood'), (0.2, 0.1, 0.12), (x, -0.1, 0.01), m, g, round_xy=0.6, round_z=0.6,
               segs=10, rings=6)
    if bag:
        x = xs[len(coats)] if len(coats) < 4 else 0.3
        B.box(B.uname(name + '_tote'), (0.3, 0.06, 0.34), (x, -0.07, -0.28), bag, g, bevel=0.02, segments=2)
        B.tube(B.uname(name + '_strap'), [(x - 0.08, -0.07, -0.12), (x - 0.02, -0.07, 0.02), (x + 0.02, -0.07, 0.02),
                                          (x + 0.08, -0.07, -0.12)], 0.008, bag, g)
    return g


def book_stack(g, loc, n=4, seed=1, rot=0.0):
    """Stack of books lying flat (loc = bottom centre, local to g)."""
    rng = random.Random(seed)
    mats = ['poster_a', 'poster_b', 'fabric_teal', 'fabric_mustard', 'fabric_coral', 'paper', 'fabric_navy']
    z = loc[2]
    for i in range(n):
        h = rng.uniform(0.025, 0.045)
        B.box(B.uname(g.name + '_book'), (rng.uniform(0.17, 0.24), rng.uniform(0.12, 0.17), h),
              (loc[0] + rng.uniform(-0.01, 0.01), loc[1] + rng.uniform(-0.01, 0.01), z + h / 2),
              mats[rng.randrange(len(mats))], g, rot=rot + rng.uniform(-12, 12), bevel=0.004)
        z += h


def sticky_notes(g, loc, rot, n=4, seed=1, spread=0.25):
    """Sticky notes on a vertical surface facing local -Y of rot (loc = centre, local to g)."""
    rng = random.Random(seed)
    mats = ['fabric_mustard', 'fabric_coral', 'rug_green', 'wall_sky', 'wall_blush']
    a = math.radians(rot)
    for i in range(n):
        u = (i - (n - 1) / 2) * spread / max(1, n - 1) * 2 + rng.uniform(-0.02, 0.02)
        v = rng.uniform(-0.06, 0.06)
        x, y = loc[0] + u * math.cos(a), loc[1] + u * math.sin(a)
        B.box(B.uname(g.name + '_note'), (0.07, 0.004, 0.07), (x, y, loc[2] + v), mats[rng.randrange(len(mats))], g,
              rot=(0, rng.uniform(-10, 10), rot), bevel=0.0)


def slippers(g, loc, rot=0.0, mat='fabric_cream'):
    """Fluffy slippers on the floor (local to g)."""
    a = math.radians(rot)
    for s in (-1, 1):
        dx = s * 0.07
        x, y = loc[0] + dx * math.cos(a), loc[1] + dx * math.sin(a)
        B.blob(B.uname(g.name + '_slipper'), (0.1, 0.24, 0.06), (x, y, loc[2] + 0.03), mat, g, rot=rot + s * 9,
               round_xy=0.6, round_z=0.6, segs=10, rings=6)


def cable(g, pts, mat='plastic_black', r=0.006):
    B.tube(B.uname(g.name + '_cable'), pts, r, mat, g)


def corkboard(name, loc, rot, w=0.7, h=0.5, seed=1, parent='root'):
    """Cork pin board with paper notes, a polaroid row and a string of pins. loc = centre of its back on the wall."""
    rng = random.Random(seed)
    g = B.group(name, loc, rot, parent=parent)
    B.box(B.uname(name + '_frame'), (w, 0.025, h), (0, -0.0125, 0), 'wood_light', g, bevel=0.008)
    B.box(B.uname(name + '_cork'), (w - 0.05, 0.01, h - 0.05), (0, -0.026, 0), 'kraft', g, bevel=0.003)
    mats = ['paper', 'fabric_mustard', 'wall_sky', 'wall_blush', 'rug_green', 'paper']
    for i in range(7):
        x = rng.uniform(-w / 2 + 0.08, w / 2 - 0.08)
        z = rng.uniform(-h / 2 + 0.08, h / 2 - 0.08)
        s = rng.uniform(0.07, 0.11)
        m = mats[rng.randrange(len(mats))]
        B.box(B.uname(name + '_note'), (s, 0.004, s * rng.uniform(0.8, 1.3)), (x, -0.033, z), m, g,
              rot=(0, rng.uniform(-12, 12), 0), bevel=0.0)
        B.sphere(B.uname(name + '_pin'), 0.008, (x, -0.04, z + s * 0.4), ['mcd_red', 'poster_b', 'fabric_mustard'][i % 3],
                 g, segs=6, rings=4)
    return g


def gallery(R, F, side, at, z, items, parent_wall=True, prefix='art'):
    """A cluster of framed prints on a wall. items: list of (du, dz, (w, h), style, frame)."""
    out = []
    for i, (du, dz, size, style, frame) in enumerate(items):
        a = F.framed_art(size, B.uname(prefix), location=R.wall_point(side, at + du, z + dz),
                         rotation=B.against(side), style=style, frame=frame, seed=i + 3)
        if parent_wall:
            R.on_wall(a, side)
        out.append(a)
    return out


def decor(R, B_, F, X, Y, door_op):
    """tier2 decor pass: wall art, hooks, shoes, clutter, hanging plants, cables."""
    # gallery wall above the bed headboard (west wall)
    gallery(R, F, 'w', 1.62, 1.55, [
        (-0.45, 0.05, (0.34, 0.44), 'plant', 'wood_dark'),
        (0.05, 0.12, (0.5, 0.36), 'sunset', 'plastic_white'),
        (0.52, -0.02, (0.3, 0.3), 'abstract', 'wood_light'),
    ], prefix='art_bed')
    # a print between plant and window, clock above the door
    gallery(R, F, 'w', -2.3, 1.95, [
        (-0.18, 0.0, (0.3, 0.4), 'wave', 'wood_light'),
        (0.2, -0.08, (0.28, 0.28), 'grid', 'plastic_white'),
    ], prefix='art_sw')
    c = F.wall_clock(0.15, location=R.wall_point('n', door_op['at'], 2.42), rotation=B.against('n'), hour=9.2)
    R.on_wall(c, 'n')
    # coat hooks + jackets on the east wall by the door
    hooks = coat_hooks('coat_hooks', R.wall_point('e', 2.2, 1.65), B.against('e'))
    R.on_wall(hooks, 'e')
    # shoes by the door (floor clutter group, not an obstacle)
    g = B.group('shoes', (0, 0, 0))
    shoe_pair(g, (X - 0.3, Y - 0.35, 0), -80, 'plastic_white', 'plastic_white')
    shoe_pair(g, (X - 0.35, Y - 0.95, 0), -100, 'fabric_coral', 'plastic_white', scale=0.95)
    shoe_pair(g, (2.1 + 0.25, 1.9 + 0.0, 0), 20, 'fabric_navy', 'plastic_white', scale=0.9)
    # bedside clutter: slippers, a book stack on the floor
    gb = B.group('bed_clutter', (0, 0, 0))
    slippers(gb, (-2.0, 0.6, 0), 15, 'fabric_cream')
    book_stack(gb, (-X + 0.3, 2.25, 0), 5, seed=4, rot=10)
    # wall shelf with plants above the dining corner? (north wall right of dresser is kitchen) -> west wall shelf
    # hanging plants by the big south window
    for i, (x, drop) in enumerate(((0.75, 0.75), (-2.45, 0.95))):
        hp = F.hanging_plant(f'hanging_plant_{i + 1}', location=(x, -Y + 0.4, 2.7), drop=drop, seed=2 + 3 * i)
        R.on_wall(hp, 's')
    # cork board with notes + photos beside the west window, over the desk nook
    cork = corkboard('corkboard', R.wall_point('w', 0.2, 1.5), B.against('w'), seed=2)
    R.on_wall(cork, 'w')
    # staff pod: shared plant + trash can + cables
    F.trash_bin('office', 'trash_office', location=(2.275, -1.45, 0))
    F.trash_bin('pedal', 'trash_kitchen', location=(-0.75, Y - 0.72, 0))
    # laundry basket at the foot of the bed near the dresser
    F.laundry_basket(location=(-1.85, 2.6, 0), seed=3, obstacle=True)


def fuse(name, members, wall=None, R=None, **extras):
    """Nest several decorative groups under ONE new group so the exporter merges them into a single mesh (one draw
    call per material instead of one per group per material). Only for non-interactive decor whose own extras do not
    matter (rugs, clutter, wall art). wall='n'|...: the new group is parented to that wall (hides with it).
    members: object names (missing names are skipped). Returns the group."""
    import bpy
    g = B.group(name, (0, 0, 0))
    if wall:
        R.on_wall(g, wall)
    if extras:
        B.set_props(g, **extras)
    for m in members:
        o = bpy.data.objects.get(m)
        if o is None:
            continue
        B.reparent(o, g)
    return g


def windows_on(side):
    """Names of the window groups parented to wall `side` (for fuse)."""
    import room as R
    return [c.name for c in R.wall(side).children if c.type == 'EMPTY' and c.name.startswith('window')]
