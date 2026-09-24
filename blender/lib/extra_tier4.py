"""Room-specific helpers for tier4 (house + garage HQ). Owned by the tier4/tier5 room builder, not the shared lib.

Also used by tier5 (wall_paint, skyline helpers live in extra_tier5.py)."""
import math
import random

import build as B
import room as R
import furniture as F
from build import box, cyl, sphere, blob, tube, torus, panel, lathe


def _n(g, part):
    return f'{g.name}_{part}'


def wall_paint(side, a0, a1, mat, name='paint', skip=(), z0=0.0, z1=None, off=0.004):
    """A thin painted panel on the inner face of wall `side` from a0 to a1 (along the wall), with holes for the
    openings in `skip`. Parented to the wall (decor), so it hides with it. z0/z1 limit its height."""
    h = R.ROOM['h']
    z1 = (h - 0.075) if z1 is None else z1
    c = (a0 + a1) / 2
    holes = []
    for op in skip:
        u0, u1 = op['at'] - op['width'] / 2 - c, op['at'] + op['width'] / 2 - c
        holes.append((u0, u1, op['sill'] - z0, op['sill'] + op['height'] - z0))
    bm = R._wall_mesh('n' if side in ('n', 's') else 'e', a1 - a0, 0.006, z1 - z0, holes)
    x, y, _ = R.wall_point(side, c, 0.0, off)
    o = B.mesh_from_bm(name, bm, mat, parent=None, loc=(x, y, z0), smooth=False)
    R.on_wall(o, side)
    return o


def garage_floor(x0, x1, y0, y1, door_y=None, name='garage_floor'):
    """Sealed concrete floor overlay (flat, not an obstacle) with expansion joints, a yellow hazard strip in front
    of the roll-up door (east wall at x1) and a faint oil stain."""
    g = B.group(name, ((x0 + x1) / 2, (y0 + y1) / 2, 0))
    w, d = x1 - x0, y1 - y0
    box(_n(g, 'slab'), (w, d, 0.01), (0, 0, 0.005), 'concrete', g, bevel=0.004, segments=1)
    # expansion joints
    nx = max(1, round(w / 1.8))
    for i in range(1, nx):
        box(_n(g, 'joint'), (0.018, d - 0.04, 0.002), (-w / 2 + i * w / nx, 0, 0.0105), 'slab', g, bevel=0,
            segments=1)
    ny = max(1, round(d / 1.8))
    for j in range(1, ny):
        box(_n(g, 'joint'), (w - 0.04, 0.018, 0.002), (0, -d / 2 + j * d / ny, 0.0105), 'slab', g, bevel=0,
            segments=1)
    if door_y is not None:
        ly = door_y - (y0 + y1) / 2
        # hazard strip: alternating yellow / black blocks along the door line
        n = 12
        L = 2.6
        for i in range(n):
            box(_n(g, 'hazard'), (0.12, L / n - 0.01, 0.003), (w / 2 - 0.22, ly - L / 2 + (i + 0.5) * L / n, 0.011),
                'mcd_yellow' if i % 2 == 0 else 'plastic_black', g, bevel=0, segments=1)
    # oil stain (flattened disc)
    cyl(_n(g, 'stain'), 0.32, 0.002, (w * 0.18, d * 0.18, 0.0112), 'slab', g, verts=16, bevel=0, segments=1)
    cyl(_n(g, 'stain2'), 0.14, 0.002, (w * 0.18 + 0.33, d * 0.18 - 0.12, 0.0112), 'slab', g, verts=12, bevel=0,
        segments=1)
    return g


def laundry_pile(name='laundry_pile', location=(0, 0, 0), rotation=0, seed=3):
    """A small heap of clothes on the floor (hoodie, jeans, a sock). Not an obstacle."""
    rng = random.Random(seed)
    g = B.group(name, location, rotation)
    cols = ['fabric_grey', 'fabric_navy', 'fabric_coral', 'paper']
    for i in range(4):
        blob(_n(g, 'cloth'), (rng.uniform(0.3, 0.45), rng.uniform(0.22, 0.35), rng.uniform(0.06, 0.1)),
             (rng.uniform(-0.12, 0.12), rng.uniform(-0.1, 0.1), 0.03 + i * 0.03), cols[i], g,
             rot=(0, 0, rng.uniform(0, 180)), round_xy=0.7, round_z=0.9, segs=12, rings=6)
    blob(_n(g, 'sock'), (0.16, 0.06, 0.03), (0.35, -0.12, 0.015), 'paper', g, rot=(0, 0, 30), round_xy=0.9,
         round_z=0.9, segs=10, rings=5)
    return g


def _shoe(g, loc, rot, mat, sole='paper'):
    x, y, z = loc
    blob(_n(g, 'shoe'), (0.11, 0.27, 0.09), (x, y, z + 0.045), mat, g, rot=(0, 0, rot), round_xy=0.8, round_z=0.7,
         segs=12, rings=6)
    box(_n(g, 'sole'), (0.11, 0.28, 0.025), (x, y, z + 0.0125), sole, g, rot=(0, 0, rot), bevel=0.01)


def shoe_bench(name='shoe_bench', location=(0, 0, 0), rotation=0):
    """Entry bench (0.9 x 0.35 x 0.45) with a cushion, shoes on the lower slat and a pair kicked off in front."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    Wd, Dd = 0.95, 0.36
    box(_n(g, 'top'), (Wd, Dd, 0.04), (0, 0, 0.44), 'wood_mid', g, bevel=0.01)
    box(_n(g, 'shelf'), (Wd - 0.06, Dd - 0.04, 0.025), (0, 0, 0.12), 'wood_mid', g, bevel=0.006)
    for sx in (-1, 1):
        box(_n(g, 'side'), (0.04, Dd, 0.44), (sx * (Wd / 2 - 0.02), 0, 0.22), 'wood_mid', g, bevel=0.008)
    blob(_n(g, 'cushion'), (0.6, 0.32, 0.07), (-0.12, 0, 0.49), 'fabric_mustard', g, round_xy=0.35, round_z=0.6)
    for i, m in enumerate(('fabric_coral', 'plastic_white', 'fabric_navy')):
        for k in (-1, 1):
            _shoe(g, (-0.3 + i * 0.3 + k * 0.065, 0.0, 0.1325), 90 + k * 4, m)
    _shoe(g, (0.1, -0.42, 0.0), 70, 'plastic_black')
    _shoe(g, (0.28, -0.5, 0.0), 115, 'plastic_black')
    return g


def coat_hooks(name='coat_hooks', location=(0, 0, 1.65), rotation=0):
    """Wall rail with hooks, a hanging coat, a tote bag and a cap. location = back centre on the wall."""
    g = B.group(name, location, rotation)
    box(_n(g, 'rail'), (0.8, 0.025, 0.09), (0, -0.0125, 0), 'wood_light', g, bevel=0.006)
    for i in range(4):
        x = -0.3 + i * 0.2
        tube(_n(g, 'hook'), [(x, -0.025, 0.0), (x, -0.07, -0.01), (x, -0.08, 0.03)], 0.007, 'metal_dark', g, res=6)
    # coat
    blob(_n(g, 'coat'), (0.36, 0.14, 0.75), (-0.3, -0.1, -0.38), 'fabric_navy', g, round_xy=0.5, round_z=0.4)
    blob(_n(g, 'collar'), (0.2, 0.1, 0.08), (-0.3, -0.12, -0.02), 'fabric_navy', g, round_xy=0.8, round_z=0.8)
    # tote bag
    box(_n(g, 'tote'), (0.3, 0.06, 0.34), (0.1, -0.09, -0.3), 'fabric_cream', g, bevel=0.02)
    tube(_n(g, 'strap'), [(-0.01, -0.09, -0.13), (0.1, -0.08, 0.02), (0.21, -0.09, -0.13)], 0.008, 'fabric_cream',
         g, res=5)
    # cap
    sphere(_n(g, 'cap'), 0.09, (0.3, -0.09, -0.04), 'fabric_teal', g, scale=(1, 1, 0.6), segs=12, rings=6)
    box(_n(g, 'brim'), (0.12, 0.1, 0.012), (0.3, -0.17, -0.07), 'fabric_teal', g, bevel=0.005)
    return g


def product_set(name='product_set', location=(0, 0, 0.9)):
    """Product-shot corner on the island: a pastel sweep card, 3 product bottles, a gift box, a phone on a mini
    tripod. location = island top centre."""
    g = B.group(name, location)
    # curved sweep backdrop (paper), bent up at the back
    pts = []
    for i in range(9):
        a = math.radians(i * 90 / 8)
        pts.append((0.0, -0.05 + 0.2 * math.sin(a) - 0.2, 0.2 - 0.2 * math.cos(a) + 0.005))
    for i in range(len(pts) - 1):
        (x0, y0, z0), (x1, y1, z1) = pts[i], pts[i + 1]
        cy, cz = (y0 + y1) / 2, (z0 + z1) / 2
        ln = math.hypot(y1 - y0, z1 - z0)
        ang = math.degrees(math.atan2(z1 - z0, y1 - y0))
        box(_n(g, 'sweep'), (0.5, ln + 0.004, 0.006), (-0.45, cy + 0.12, cz), 'wall_blush', g, rot=(ang, 0, 0),
            bevel=0, segments=1)
    box(_n(g, 'sweepup'), (0.5, 0.006, 0.18), (-0.45, 0.12 + 0.0, 0.29), 'wall_blush', g, bevel=0, segments=1)
    for i, (m, h) in enumerate((('fabric_teal', 0.16), ('fabric_coral', 0.2), ('fabric_mustard', 0.13))):
        x = -0.58 + i * 0.12
        lathe(_n(g, 'bottle'), [(0.035, 0), (0.04, 0.01), (0.04, h * 0.75), (0.018, h * 0.85), (0.016, h)],
              (x, 0.02, 0.0), m, g, verts=12, cap_top=True)
        cyl(_n(g, 'lid'), 0.02, 0.03, (x, 0.02, h + 0.015), 'plastic_white', g, verts=10, bevel=0.004)
    box(_n(g, 'gift'), (0.12, 0.12, 0.1), (-0.3, -0.08, 0.05), 'paper', g, rot=(0, 0, 12), bevel=0.008)
    box(_n(g, 'ribbon'), (0.125, 0.025, 0.105), (-0.3, -0.08, 0.05), 'mcd_red', g, rot=(0, 0, 12), bevel=0.003)
    # phone on a mini tripod pointing at the set
    for k in range(3):
        a = math.radians(90 + k * 120)
        tube(_n(g, 'leg'), [(-0.45 + 0.07 * math.cos(a), -0.3 + 0.07 * math.sin(a), 0.0),
                            (-0.45, -0.3, 0.14)], 0.005, 'plastic_black', g, res=5)
    box(_n(g, 'phone'), (0.075, 0.012, 0.15), (-0.45, -0.3, 0.22), 'plastic_black', g, rot=(-8, 0, 0), bevel=0.006)
    return g


def bench_cap(name='bench_cap', location=(0, 0, 0), rotation=-90):
    """End cap for the team bench in an empty desk slot: a printer cabinet with a printer, paper, a plant."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    box(_n(g, 'cab'), (0.9, 0.5, 0.7), (0, 0, 0.35), 'plastic_white', g, bevel=0.02)
    for i in range(2):
        box(_n(g, 'drawer'), (0.4, 0.012, 0.28), (-0.22 + i * 0.44, -0.256, 0.36), 'plastic_white', g, bevel=0.01)
        box(_n(g, 'pull'), (0.12, 0.02, 0.02), (-0.22 + i * 0.44, -0.265, 0.46), 'metal_dark', g, bevel=0.005)
    box(_n(g, 'printer'), (0.44, 0.36, 0.2), (-0.15, 0.02, 0.8), 'plastic_grey', g, bevel=0.03)
    box(_n(g, 'tray'), (0.28, 0.2, 0.012), (-0.15, -0.2, 0.76), 'plastic_black', g, bevel=0.004)
    box(_n(g, 'paper'), (0.21, 0.28, 0.02), (-0.15, -0.2, 0.775), 'paper', g, bevel=0.002, segments=1)
    F.small_plant(parent=g, location=(0.27, 0.0, 0.7), style='trailing', obstacle=False)
    return g


def bike(name='bike', location=(0, 0, 0), rotation=0):
    """Commuter bike parked on its kickstand (along local Y), mustard frame."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    r = 0.33
    for y in (-0.5, 0.5):
        torus(_n(g, 'tyre'), r, 0.022, (0, y, r + 0.02), 'plastic_black', g, rot=(0, 90, 0), major=24, minor=6)
        cyl(_n(g, 'hub'), 0.03, 0.08, (0, y, r + 0.02), 'metal', g, rot=(0, 90, 0), verts=10)
    z = r + 0.02
    fm = 'fabric_mustard'
    tube(_n(g, 'frame'), [(0, -0.5, z), (0, -0.05, z), (0, 0.38, z + 0.4), (0, -0.12, z + 0.45), (0, -0.05, z)],
         0.018, fm, g, res=6)
    tube(_n(g, 'stay'), [(0, -0.05, z), (0, -0.5, z), (0, -0.12, z + 0.45)], 0.013, fm, g, res=6)
    tube(_n(g, 'fork'), [(0, 0.5, z), (0, 0.38, z + 0.4), (0, 0.34, z + 0.55)], 0.016, fm, g, res=6)
    tube(_n(g, 'bars'), [(-0.24, 0.3, z + 0.58), (0, 0.34, z + 0.55), (0.24, 0.3, z + 0.58)], 0.013, 'metal_dark',
         g, res=6)
    blob(_n(g, 'saddle'), (0.12, 0.24, 0.06), (0, -0.14, z + 0.53), 'wood_dark', g, round_xy=0.6, round_z=0.7)
    tube(_n(g, 'post'), [(0, -0.12, z + 0.45), (0, -0.14, z + 0.51)], 0.012, 'metal', g, res=6)
    box(_n(g, 'basket'), (0.3, 0.24, 0.18), (0, 0.6, z + 0.45), 'wood_light', g, bevel=0.02)
    tube(_n(g, 'stand'), [(0, -0.1, z), (0.12, -0.18, 0.01)], 0.009, 'metal', g, res=5)
    return g


# ---------------------------------------------------------------------------------------------------------------
# budget helpers (draw calls + triangles), shared with tier5
# ---------------------------------------------------------------------------------------------------------------


def combine(name, objs, parent='root', **extras):
    """Re-parent several groups (keeping world transforms) under one new group so export merges them into ONE
    mesh (one draw call per material instead of one per material per group). Only for pieces that may share a
    footprint / hover unit: decor on the same wall, flat floor decor, adjacent furniture with the same key."""
    g = B.group(name, (0, 0, 0), None, parent=parent, **extras)
    for o in objs:
        if isinstance(o, str):
            o = B.bpy.data.objects[o]
        B.reparent(o, g)
    return g


# near-duplicate palette colours folded together on SMALL parts only (books, clutter, knobs), so each merged group
# needs fewer material slots = fewer draw calls. Big surfaces keep their exact colours.
SMALL_REMAP = {'poster_b': 'fabric_blue', 'paper': 'plastic_white', 'fabric_cream': 'plastic_white',
               'metal_dark': 'plastic_black', 'plastic_grey': 'metal', 'wood_dark': 'wood_mid',
               'poster_a': 'fabric_coral', 'mcd_red': 'fabric_coral', 'rug_green': 'plant',
               'plant_dark': 'plant', 'rug_rose': 'fabric_coral', 'wall_blush': 'fabric_coral',
               'carpet_beige': 'wood_light', 'fabric_navy': 'fabric_blue',
               'terracotta': 'fabric_coral', 'tile_white': 'plastic_white', 'mcd_yellow': 'fabric_mustard',
               'neon_green': 'screen', 'neon_purple': 'screen', 'neon_blue': 'screen', 'wall_sky': 'plastic_white'}


# near-identical palette pairs folded on EVERY part (visually the same colour at game zoom)
GLOBAL_REMAP = {'poster_b': 'fabric_blue', 'paper': 'plastic_white', 'tile_white': 'plastic_white',
                'plastic_grey': 'metal', 'metal_dark': 'plastic_black'}


def remap_small(root, limit=0.3, remap=None, keep=()):
    """Re-assign palette materials on parts smaller than `limit` m through SMALL_REMAP (see above)."""
    from palette import get_mat
    remap = SMALL_REMAP if remap is None else remap
    for o in B.descendants(root):
        if o.type != 'MESH' or (keep and o.name.startswith(tuple(keep))):
            continue
        d = o.dimensions
        table = remap if max(d.x, d.y, d.z) < limit else GLOBAL_REMAP
        for slot in o.material_slots:
            m = slot.material
            if m is None:
                continue
            key = m.name[2:] if m.name.startswith('m_') else m.name
            if key in table:
                slot.material = get_mat(table[key])


def budget_pass(root, small=0.4, max_seg=2, decimate_small=0.35, ratio=0.5, min_tris=40, remap_limit=0.6,
                keep=(), protect=(), thin=0.06):
    """Triangle diet before export: bevels on small parts drop to 1 segment, big ones cap at `max_seg`;
    dense un-bevelled small parts (spheres, blobs, lathes, tubes) get a collapse decimate; small parts get
    folded palette colours (remap_small)."""
    import bpy
    if remap_limit:
        remap_small(root, remap_limit, keep=keep)
    for o in B.descendants(root):
        if o.type != 'MESH':
            continue
        dims = o.dimensions
        mx = max(dims.x, dims.y, dims.z)
        bev = [m for m in o.modifiers if m.type == 'BEVEL']
        mn = min(dims.x, dims.y, dims.z)
        for m in bev:
            m.segments = 1 if (mx < small or mn < thin) else min(m.segments, max_seg)
        if bev:
            continue
        nt = len(o.data.polygons) * 2
        if (mx < decimate_small and nt > min_tris) or (mx < 1.2 and nt > 250 and o.name not in protect):
            d = o.modifiers.new('diet', 'DECIMATE')
            d.decimate_type = 'COLLAPSE'
            d.ratio = ratio


def _hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def restrict(group, allowed, limit=0.6):
    """Inside `group`, parts smaller than `limit` m whose palette material is not in `allowed` take the nearest
    allowed palette colour (special materials: screen, glass, sky, lampshade, neon stay). Fewer slots per group."""
    import bpy
    from palette import PALETTE, get_mat
    g = bpy.data.objects[group] if isinstance(group, str) else group
    pal = {k: _hex_rgb(v) for k, v in PALETTE.items()}
    for o in B.descendants(g):
        if o.type != 'MESH':
            continue
        d = o.dimensions
        if max(d.x, d.y, d.z) >= limit:
            continue
        for slot in o.material_slots:
            m = slot.material
            if m is None:
                continue
            key = m.name[2:] if m.name.startswith('m_') else m.name
            if key in allowed or key not in pal:
                continue
            c = pal[key]
            best = min(allowed, key=lambda a: sum((x - y) ** 2 for x, y in zip(pal[a], c)))
            slot.material = get_mat(best)


CORE = ['plastic_white', 'plastic_black', 'metal', 'wood_light', 'wood_mid', 'fabric_coral', 'fabric_mustard',
        'fabric_teal', 'fabric_blue', 'plant']


def finish(root, merges=None, reparent=None, restricts=None, core_limit=0.25, **budget):
    """Pre-export pass: `reparent` {child_group: parent_group} folds small decor into its furniture; `merges`
    {new_name: (groups, extras)} combines groups; every wall's decor groups become one `<wall>_decor`; then the
    triangle diet (budget_pass kwargs)."""
    import bpy
    for child, par in (reparent or {}).items():
        B.reparent(bpy.data.objects[child], bpy.data.objects[par])
    for name, (objs, extras) in (merges or {}).items():
        combine(name, objs, **extras)
    for side in ('n', 'e', 's', 'w'):
        w = R.wall(side)
        kids = [c for c in w.children if c.type == 'EMPTY' and not c.name.startswith(('a_', 'l_'))]
        if len(kids) > 1:
            combine(f'wall_{side}_decor', kids, parent=w)
    for grp, allowed in (restricts or {}).items():
        if isinstance(allowed, tuple):        # (allowed list, size limit)
            restrict(grp, allowed[0], allowed[1])
        else:
            restrict(grp, allowed)
    if core_limit:
        restrict(root, CORE, core_limit)
    budget_pass(root, **budget)


def table_spread(name='table_spread', location=(0, 0, 0.75)):
    """Casual dinner-table spread: a runner, a vase with stems, a bowl of fruit, two mugs, a laptop-free zone."""
    g = B.group(name, location)
    box(_n(g, 'runner'), (0.34, 0.9, 0.006), (0, 0, 0.003), 'fabric_teal', g, bevel=0, segments=1)
    lathe(_n(g, 'vase'), [(0.04, 0), (0.06, 0.05), (0.05, 0.14), (0.03, 0.2), (0.035, 0.22)], (0.02, 0.22, 0.006),
          'terracotta', g, verts=12)
    for k, (dx, dy) in enumerate(((0.0, 0.0), (0.04, 0.02), (-0.03, 0.03))):
        tube(_n(g, 'stem'), [(0.02, 0.22, 0.2), (0.02 + dx * 2, 0.22 + dy * 2, 0.38 + k * 0.04)], 0.004,
             'plant_dark', g, res=4)
        sphere(_n(g, 'bloom'), 0.025, (0.02 + dx * 2, 0.22 + dy * 2, 0.39 + k * 0.04),
               ['fabric_coral', 'fabric_mustard', 'paper'][k], g, segs=8, rings=5)
    lathe(_n(g, 'bowl'), [(0.05, 0), (0.12, 0.05), (0.13, 0.07), (0.12, 0.07), (0.05, 0.01)], (-0.02, -0.2, 0.006),
          'plastic_white', g, verts=14)
    for i, m in enumerate(('mcd_red', 'fabric_mustard', 'rug_green')):
        sphere(_n(g, 'fruit'), 0.038, (-0.02 + math.cos(i * 2.1) * 0.05, -0.2 + math.sin(i * 2.1) * 0.05, 0.075),
               m, g, segs=8, rings=5)
    F.mug(g, (0.45, 0.2, 0.0), 'fabric_coral')
    F.mug(g, (-0.5, -0.15, 0.0), 'paper')
    return g


def pallet(name='pallet', location=(0, 0, 0), rotation=0, w=1.0, d=0.8):
    """Wooden shipping pallet (0.14 m) on the floor; stock boxes stack on it (a_boxes_* region)."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    for i in range(5):
        box(_n(g, 'deck'), (w, 0.12, 0.022), (0, -d / 2 + 0.06 + i * (d - 0.12) / 4, 0.129), 'wood_light', g,
            bevel=0.004, segments=1)
    for sx in (-1, 0, 1):
        box(_n(g, 'block'), (0.1, d, 0.1), (sx * (w / 2 - 0.05), 0, 0.068), 'wood_mid', g, bevel=0.006, segments=1)
    for sy in (-1, 1):
        box(_n(g, 'base'), (w, 0.1, 0.018), (0, sy * (d / 2 - 0.05), 0.009), 'wood_light', g, bevel=0.003,
            segments=1)
    return g


def tri_report(root, top=40):
    """Debug: print the heaviest source meshes (evaluated triangles) and a per-prefix summary."""
    import bpy
    from collections import Counter
    dg = bpy.context.evaluated_depsgraph_get()
    rows, pref = [], Counter()
    for o in B.descendants(root):
        if o.type != 'MESH':
            continue
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        t = len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
        rows.append((t, o.name, [m.type for m in o.modifiers]))
        import re
        pref[re.sub(r'(_\d+)+$', '', o.name).split('_')[-1]] += t
    rows.sort(reverse=True)
    print('[tris] total', sum(r[0] for r in rows))
    for r in rows[:top]:
        print('[tris]', r)
    for k, v in pref.most_common(40):
        print('[tris-kind]', k, v)


def trim_floor(pred):
    """Delete floor planks/tiles whose every vertex satisfies pred(x, y) (hidden under an overlay floor)."""
    import bpy
    import bmesh
    fl = bpy.data.objects['floor']
    bm = bmesh.new()
    bm.from_mesh(fl.data)
    dead = [f for f in bm.faces if all(pred(v.co.x, v.co.y) for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(fl.data)
    bm.free()


def cap_decor(g, length, seed=1, items=('plant', 'frame', 'candle'), h=1.1):
    """Little things standing on a half-height partition's cap (local X along the partition, top at h):
    a trailing plant, a framed photo, a candle jar, a stack of books. Built INTO group g."""
    rng = random.Random(seed)
    xs = [(-length / 2 + (i + 0.5) * length / len(items)) + rng.uniform(-0.15, 0.15) for i in range(len(items))]
    top = h + 0.035
    for x, it in zip(xs, items):
        if it == 'plant':
            F.small_plant(parent=g, location=(x, 0, top), style='trailing', obstacle=False, seed=seed)
        elif it == 'succulent':
            F.small_plant(parent=g, location=(x, 0, top), style='succulent', obstacle=False, seed=seed)
        elif it == 'frame':
            box(_n(g, 'frame'), (0.16, 0.02, 0.2), (x, 0.0, top + 0.1), 'wood_mid', g, rot=(-8, 0, rng.uniform(-10, 10)),
                bevel=0.005)
            panel(_n(g, 'photo'), (0.12, 0.15), (x, -0.012, top + 0.1), ['fabric_teal', 'fabric_coral', 'fabric_blue'][
                rng.randrange(3)], g, rot=(-8, 0, 0))
        elif it == 'candle':
            cyl(_n(g, 'jar'), 0.04, 0.09, (x, 0, top + 0.045), 'fabric_cream', g, verts=12, bevel=0.005)
        elif it == 'books':
            for k in range(3):
                box(_n(g, 'book'), (0.22 - k * 0.02, 0.15, 0.035), (x, 0, top + 0.018 + k * 0.036),
                    ['fabric_coral', 'fabric_teal', 'fabric_mustard'][k], g, rot=(0, 0, rng.uniform(-8, 8)),
                    bevel=0.004)
        elif it == 'vase':
            lathe(_n(g, 'vase'), [(0.04, 0), (0.06, 0.06), (0.04, 0.16), (0.03, 0.2)], (x, 0, top), 'terracotta',
                  g, verts=12)


def robot_vacuum(name='robot_vacuum', location=(0, 0, 0), rotation=0):
    """A little robot vacuum puck on its rounds (not an obstacle)."""
    g = B.group(name, location, rotation)
    cyl(_n(g, 'body'), 0.17, 0.08, (0, 0, 0.045), 'plastic_white', g, verts=20, bevel=0.02, segments=2)
    cyl(_n(g, 'top'), 0.07, 0.012, (0, 0.04, 0.09), 'plastic_black', g, verts=14, bevel=0.004)
    box(_n(g, 'bumper'), (0.2, 0.03, 0.03), (0, -0.15, 0.04), 'plastic_black', g, bevel=0.01)
    return g


def rebuild_floor(spec=(0.28, 1.2, 2.4), mats=('wood_light',), seed=4, groove=0.01, along='x'):
    """Swap the room floor's mesh for wider / longer planks (fewer triangles), keeping node name + extras."""
    import bpy
    import random as _r
    from palette import get_mat
    fl = bpy.data.objects['floor']
    w, d = R.ROOM['w'], R.ROOM['d']
    v, f, mi = R._floor_tiles(w, d, spec, len(mats), _r.Random(seed), along=along, groove=groove, depth=0.006)
    me = bpy.data.meshes.new('floor_planks')
    me.from_pydata(v, [], f)
    me.update()
    for m in mats:
        me.materials.append(get_mat(m))
    for p, k in zip(me.polygons, mi):
        p.material_index = k
    old = fl.data
    fl.data = me
    bpy.data.meshes.remove(old)
    return fl


def floor_boxes(g, spots, seed=2):
    """Loose shipping boxes on the floor, built INTO group g at local (x, y, stack) spots."""
    rng = random.Random(seed)
    for (x, y, n) in spots:
        z = 0.0
        for k in range(n):
            bw, bd, bh = rng.choice(((0.4, 0.3, 0.3), (0.5, 0.4, 0.35), (0.35, 0.3, 0.25)))
            r = rng.uniform(-12, 12)
            box(_n(g, 'fbox'), (bw, bd, bh), (x + rng.uniform(-0.03, 0.03), y, z + bh / 2), 'kraft', g, rot=(0, 0, r),
                bevel=0.012)
            box(_n(g, 'ftape'), (0.06, bd + 0.004, 0.004), (x, y, z + bh + 0.001), 'plastic_white', g, rot=(0, 0, r),
                bevel=0, segments=1)
            z += bh


def slippers(name='slippers', location=(0, 0, 0), rotation=0, mat='fabric_coral'):
    """A pair of fluffy slippers (flat decor, not an obstacle)."""
    g = B.group(name, location, rotation)
    for sx, r in ((-0.07, 8), (0.08, -6)):
        blob(_n(g, 'slipper'), (0.1, 0.25, 0.06), (sx, 0, 0.03), mat, g, rot=(0, 0, r), round_xy=0.8, round_z=0.8,
             segs=10, rings=5)
    return g


def sneakers(g, loc, rot=0, mat='plastic_white', accent='fabric_coral'):
    """A kicked-off pair of sneakers built INTO group g at local loc (flat decor)."""
    x, y, z = loc
    for k, (dx, dy, r) in enumerate(((0.0, 0.0, 0), (0.16, 0.07, 28))):
        _shoe(g, (x + dx, y + dy, z), rot + r, mat, sole=accent if k else 'plastic_white')
