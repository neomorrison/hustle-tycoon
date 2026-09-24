"""Furniture catalogue part 2 (kitchen, living, storage, decor, creator gear, office, utility).
Imported and re-exported by furniture.py: always `import furniture as F` and call F.<builder>.
Same conventions as furniture.py: front = local -Y, rotation in degrees, returns the group empty."""
import math

import build as B
from build import box, cyl, sphere, blob, tube, panel, prism, lathe, torus, bezier, catenary
from furniture import (_g, _n, _rng, leg4, knob, bar_handle, books_row, mug, plant_leaves, small_plant, pot,
                       office_chair, bar_stool, table_lamp, TAU)

COUNTER_H = 0.9

# ----------------------------------------------------------------------------------------------------------------
# kitchen
# ----------------------------------------------------------------------------------------------------------------

KITCHEN_STYLES = {
    # style: (cabinet front, carcass, counter, handle)
    'white': ('plastic_white', 'plastic_white', 'wood_light', 'metal'),
    'wood': ('wood_light', 'wood_light', 'tile_white', 'metal_dark'),
    'sage': ('wall_sage', 'plastic_white', 'wood_light', 'metal'),
    'navy': ('fabric_navy', 'fabric_navy', 'tile_white', 'mcd_yellow'),
    'designer': ('plastic_black', 'plastic_black', 'tile_white', 'metal'),
    'retro': ('fabric_teal', 'plastic_white', 'plastic_white', 'metal'),
}


def _cab_front(g, x, w, z0, h, y, mat, handle_mat, kind='door', vertical_handle=True):
    """Cabinet front(s) for a module of width w centred at x (local), front plane y."""
    gap = 0.006
    if kind == 'drawers':
        n = 3
        hh = (h - gap * (n + 1)) / n
        for i in range(n):
            zc = z0 + gap + hh / 2 + i * (hh + gap)
            box(_n(g, 'front'), (w - 2 * gap, 0.02, hh), (x, y, zc), mat, g, bevel=0.006)
            bar_handle(g, (x, y - 0.01, zc + hh * 0.25), min(0.2, w * 0.4), False, handle_mat, 0.006, 0.02)
    elif kind in ('door', 'doors'):
        nd = 2 if w > 0.5 else 1
        dw = (w - gap * (nd + 1)) / nd
        for i in range(nd):
            xc = x - w / 2 + gap + dw / 2 + i * (dw + gap)
            box(_n(g, 'front'), (dw, 0.02, h - 2 * gap), (xc, y, z0 + h / 2), mat, g, bevel=0.006)
            hx = xc + (dw / 2 - 0.04) * (1 if (i == 0 and nd == 2) else -1) * (-1 if nd == 2 else 1)
            if nd == 2:
                hx = xc + (dw / 2 - 0.04) * (1 if i == 0 else -1)
            if vertical_handle:
                bar_handle(g, (hx, y - 0.01, z0 + h - 0.12), 0.12, True, handle_mat, 0.006, 0.02)
            else:
                bar_handle(g, (xc, y - 0.01, z0 + 0.08), 0.12, False, handle_mat, 0.006, 0.02)


def stove(g, x, w, burners=4, oven=True, y_front=-0.3, top=COUNTER_H, style='glass'):
    """Cooktop (+ oven below) built into group g at module centre x."""
    ct = 'plastic_black' if style == 'glass' else 'metal'
    box(_n(g, 'cooktop'), (w - 0.06, 0.52, 0.012), (x, 0.0, top + 0.006), ct, g, bevel=0.004)
    pos = [(-0.13, 0.1), (0.13, 0.1), (-0.13, -0.12), (0.13, -0.12)] if burners == 4 else [(-0.0, 0.1), (0.0, -0.12)]
    if burners == 2 and w > 0.5:
        pos = [(-0.12, 0.0), (0.12, 0.0)]
    for i, (bx, by) in enumerate(pos):
        r = 0.085 if i % 3 == 0 else 0.07
        torus(_n(g, 'burner'), r, 0.006, (x + bx, by, top + 0.013), 'metal_dark' if style == 'glass' else 'plastic_black',
              g, major=18, minor=4)
        torus(_n(g, 'burner'), r * 0.55, 0.005, (x + bx, by, top + 0.013), 'metal_dark' if style == 'glass' else
              'plastic_black', g, major=14, minor=4)
    # a pot on one burner
    bx, by = pos[0]
    lathe(_n(g, 'pot'), [(0.09, 0), (0.095, 0.01), (0.095, 0.12), (0.088, 0.12), (0.088, 0.012)],
          (x + bx, by, top + 0.014), 'metal', g, verts=16)
    tube(_n(g, 'pothandle'), [(x + bx + 0.09, by, top + 0.1), (x + bx + 0.2, by, top + 0.1)], 0.008, 'plastic_black', g,
         res=5)
    if oven:
        z0 = 0.12
        oh = top - 0.06 - z0 - 0.1
        box(_n(g, 'ovendoor'), (w - 0.03, 0.03, oh), (x, y_front, z0 + oh / 2), 'metal', g, bevel=0.01)
        box(_n(g, 'ovenwin'), (w - 0.18, 0.006, oh * 0.5), (x, y_front - 0.016, z0 + oh * 0.45), 'plastic_black', g,
            bevel=0.01)
        bar_handle(g, (x, y_front - 0.015, z0 + oh - 0.05), w - 0.16, False, 'metal_dark', 0.009, 0.03)
        box(_n(g, 'panel'), (w - 0.03, 0.03, 0.09), (x, y_front, top - 0.06 - 0.045), 'metal_dark', g, bevel=0.008)
        for i in range(4):
            cyl(_n(g, 'knob'), 0.016, 0.02, (x - 0.18 + i * 0.12, y_front - 0.02, top - 0.105), 'plastic_black', g,
                (90, 0, 0), verts=10, bevel=0.003)


def sink(g, x, w, top=COUNTER_H, mat='metal'):
    """Inset sink basin + gooseneck faucet at module centre x."""
    box(_n(g, 'basin'), (min(0.5, w - 0.1), 0.4, 0.02), (x, -0.02, top + 0.001), mat, g, bevel=0.01)
    box(_n(g, 'bowl'), (min(0.44, w - 0.16), 0.34, 0.012), (x, -0.02, top + 0.006), 'metal_dark', g, bevel=0.012)
    pts = bezier((x, 0.2, top), (x, 0.2, top + 0.4), (x, 0.02, top + 0.4), (x, 0.03, top + 0.25), 10)
    tube(_n(g, 'faucet'), pts, 0.012, 'metal', g, res=8)
    cyl(_n(g, 'faucetbase'), 0.025, 0.03, (x, 0.2, top + 0.015), 'metal', g, verts=12)
    tube(_n(g, 'lever'), [(x + 0.02, 0.2, top + 0.05), (x + 0.1, 0.22, top + 0.08)], 0.007, 'metal', g, res=5)
    # dish rack with plates
    rx = x + (w / 2 + 0.05 if True else 0)
    return rx


def kitchen_run(length=2.4, name='kitchen', location=(0, 0, 0), rotation=0, modules=None, style='white',
                front_mat=None, counter_mat=None, upper=True, hood=True, clutter=True, interact=None, anchors=False,
                wall_h=2.7, seed=1, obstacle=True, wall=None):
    """A run of base cabinets with a countertop at 0.9 m, back against local +Y (depth 0.62).
    wall='n'|'e'|'s'|'w': the wall it stands against. PASS IT in a room: the backsplash, upper cabinets, open shelf
    and hood then go into a separate group `<name>_upper` parented to that wall (hidden with it in the cutaway);
    otherwise they stay in the base group and float in view when that wall is cut away.
    modules: list of (kind, width) left->right (local -X -> +X); kinds: cab | drawers | sink | stove2 | stove4
    (4 burners + oven) | dishwasher | open (open shelf) | fridge_gap (empty slot, no counter). Default fills
    `length` with drawers, sink, cab, stove4, cab. style: white | wood | sage | navy | designer | retro.
    upper=True adds wall cabinets (open shelf with jars over the sink side), hood=True a range hood over the stove.
    anchors=True -> a_stove_stand in front of the stove (or the sink if there is no stove), facing it."""
    rng = _rng(name, seed)
    fm, carcass, cm, hm = KITCHEN_STYLES[style]
    fm = front_mat or fm
    cm = counter_mat or cm
    g = _g(name, location, rotation, obstacle, interact)
    if modules is None:
        rest = length - 0.6 - 0.8 - 0.6
        modules = [('drawers', 0.5), ('sink', 0.8), ('cab', max(0.3, rest - 0.5))] + [('stove4', 0.6)]
        used = sum(w for _, w in modules)
        if length - used > 0.25:
            modules.append(('cab', length - used))
    total = sum(w for _, w in modules)
    D = 0.62
    x = -total / 2
    stove_x = sink_x = None
    y_front = -D / 2 + 0.02
    for kind, w in modules:
        xc = x + w / 2
        if kind != 'fridge_gap':
            box(_n(g, 'carcass'), (w, D - 0.04, COUNTER_H - 0.1 - 0.04), (xc, 0.01, 0.1 + (COUNTER_H - 0.14) / 2),
                carcass, g, bevel=0.004, segments=1)
            box(_n(g, 'kick'), (w, D - 0.1, 0.1), (xc, 0.04, 0.05), 'metal_dark' if style == 'designer' else
                'plastic_grey', g, bevel=0.003, segments=1)
        if kind == 'cab':
            _cab_front(g, xc, w, 0.1, COUNTER_H - 0.14, y_front - 0.01, fm, hm, 'door')
        elif kind == 'drawers':
            _cab_front(g, xc, w, 0.1, COUNTER_H - 0.14, y_front - 0.01, fm, hm, 'drawers')
        elif kind == 'dishwasher':
            box(_n(g, 'dw'), (w - 0.012, 0.02, COUNTER_H - 0.16), (xc, y_front - 0.01, 0.1 + (COUNTER_H - 0.14) / 2),
                'metal', g, bevel=0.006)
            bar_handle(g, (xc, y_front - 0.02, COUNTER_H - 0.1), w - 0.12, False, 'metal_dark', 0.007, 0.02)
        elif kind == 'open':
            for zz in (0.35, 0.6):
                box(_n(g, 'shelf'), (w - 0.04, D - 0.08, 0.02), (xc, 0.0, zz), fm, g, bevel=0.004, segments=1)
            for i in range(int(w / 0.12)):
                lathe(_n(g, 'jar'), [(0.04, 0), (0.045, 0.02), (0.045, 0.14), (0.03, 0.16), (0.03, 0.18)],
                      (x + 0.08 + i * 0.12, -0.05, 0.36), ['window_glass', 'terracotta', 'plastic_white'][i % 3], g,
                      verts=10, cap_top=True)
        elif kind == 'sink':
            _cab_front(g, xc, w, 0.1, COUNTER_H - 0.14, y_front - 0.01, fm, hm, 'door')
            sink_x = xc
        elif kind in ('stove2', 'stove4'):
            if kind == 'stove4':
                box(_n(g, 'ovenbody'), (w, D - 0.04, COUNTER_H - 0.1), (xc, 0.01, 0.1 + (COUNTER_H - 0.14) / 2),
                    'metal', g, bevel=0.004, segments=1)
            else:
                _cab_front(g, xc, w, 0.1, COUNTER_H - 0.14, y_front - 0.01, fm, hm, 'drawers')
            stove_x = xc
        x += w
    # countertop over everything except fridge gaps
    x = -total / 2
    for kind, w in modules:
        if kind != 'fridge_gap':
            box(_n(g, 'counter'), (w + 0.002, D + 0.02, 0.04), (x + w / 2, -0.01, COUNTER_H - 0.02), cm, g, bevel=0.008)
        x += w
    # wall-mounted parts (backsplash, uppers, shelf, hood) go to a separate group parented to `wall` when given,
    # so they hide with that wall in the runtime cutaway
    up = g
    if wall:
        up = _g(name + '_upper', location, rotation, False)
    box(_n(up, 'splash'), (total, 0.015, 0.5), (0, D / 2 - 0.0075, COUNTER_H + 0.25), 'tile_white', up, bevel=0.004,
        segments=1)
    x = -total / 2
    for kind, w in modules:
        xc = x + w / 2
        if kind == 'sink':
            sink(g, xc, w)
        elif kind == 'stove4':
            stove(g, xc, w, 4, True, y_front - 0.01)
        elif kind == 'stove2':
            stove(g, xc, w, 2, False, y_front - 0.01)
        x += w
    if upper:
        uz0, uh, ud = 1.5, min(0.7, wall_h - 1.5 - 0.15), 0.34
        x = -total / 2
        for kind, w in modules:
            xc = x + w / 2
            if kind in ('stove2', 'stove4') and hood or kind == 'fridge_gap':
                x += w
                continue
            if kind == 'sink':   # open shelf over the sink with plates + jars
                box(_n(up, 'oshelf'), (w, 0.25, 0.03), (xc, D / 2 - 0.125, uz0 + 0.1), 'wood_light', up, bevel=0.006)
                for i in range(int(w / 0.14)):
                    lathe(_n(up, 'jar'), [(0.035, 0), (0.04, 0.02), (0.04, 0.12), (0.028, 0.14), (0.028, 0.16)],
                          (x + 0.1 + i * 0.14, D / 2 - 0.12, uz0 + 0.115),
                          ['window_glass', 'terracotta', 'plastic_white', 'fabric_mustard'][i % 4], up, verts=10,
                          cap_top=True)
            else:
                box(_n(up, 'upper'), (w, ud, uh), (xc, D / 2 - ud / 2, uz0 + uh / 2), carcass, up, bevel=0.006)
                _cab_front(up, xc, w, uz0, uh, D / 2 - ud - 0.01, fm, hm, 'door', vertical_handle=False)
            x += w
        if hood and stove_x is not None:
            hz = uz0 + 0.1
            box(_n(up, 'hood'), (0.6, 0.5, 0.1), (stove_x, D / 2 - 0.25, hz), 'metal', up, bevel=0.01)
            cyl(_n(up, 'chimney'), 0.3, wall_h - hz - 0.05, (stove_x, D / 2 - 0.2, hz + 0.05 + (wall_h - hz - 0.05) /
                                                            2), 'metal', up, (0, 0, 45), verts=4, r2=0.13, bevel=0.005)
            box(_n(up, 'hoodlight'), (0.4, 0.2, 0.004), (stove_x, D / 2 - 0.3, hz - 0.052), 'lampshade', up, bevel=0)
    if wall:
        import room as R
        R.on_wall(up, wall)
    if clutter:
        xs = [(-total / 2 + 0.2)]
        # cutting board + fruit bowl + kettle + knife block
        cx0 = -total / 2 + 0.25
        box(_n(g, 'board'), (0.35, 0.24, 0.02), (cx0, -0.05, COUNTER_H + 0.01), 'wood_mid', g, 8, bevel=0.006)
        for i, (fx, fy, fm_) in enumerate(((0.0, 0.0, 'mcd_red'), (0.05, 0.03, 'fabric_mustard'),
                                           (-0.04, 0.04, 'rug_green'))):
            sphere(_n(g, 'fruit'), 0.035, (cx0 + fx, -0.05 + fy, COUNTER_H + 0.055), fm_, g, segs=10, rings=6)
        kx = (stove_x if stove_x is not None else total / 2 - 0.2) + 0.0
        if stove_x is None or stove_x + 0.45 < total / 2:
            kx = (stove_x + 0.42) if stove_x is not None else total / 2 - 0.2
            lathe(_n(g, 'kettle'), [(0.07, 0), (0.08, 0.02), (0.08, 0.14), (0.05, 0.19), (0.02, 0.2), (0.0, 0.2)],
                  (kx, 0.05, COUNTER_H), 'fabric_coral', g, verts=14)
            tube(_n(g, 'kettleh'), [(kx - 0.03, 0.05, COUNTER_H + 0.2), (kx - 0.02, 0.05, COUNTER_H + 0.24),
                                    (kx + 0.04, 0.05, COUNTER_H + 0.21)], 0.01, 'plastic_black', g, res=6)
        if sink_x is not None:
            # dish soap + sponge
            cyl(_n(g, 'soap'), 0.025, 0.14, (sink_x + 0.32, 0.15, COUNTER_H + 0.07), 'fabric_teal', g, verts=10)
            box(_n(g, 'sponge'), (0.08, 0.05, 0.03), (sink_x + 0.3, 0.05, COUNTER_H + 0.015), 'fabric_mustard', g,
                bevel=0.008)
    if anchors:
        ax = stove_x if stove_x is not None else (sink_x or 0.0)
        B.anchor('a_stove_stand', (ax, -D / 2 - 0.5, 0), 'n', frame=g)
    return g


def microwave(name='microwave', location=(0, 0, 0), rotation=0, mat='plastic_white', parent='root'):
    """Countertop microwave (0.48 x 0.36 x 0.28), door on local -Y; location = bottom centre."""
    g = _g(name, location, rotation, False, parent=parent)
    W, D, H = 0.48, 0.36, 0.28
    box(_n(g, 'body'), (W, D, H), (0, 0, H / 2), mat, g, bevel=0.015)
    box(_n(g, 'door'), (W * 0.7, 0.012, H - 0.04), (-W * 0.13, -D / 2 - 0.004, H / 2), mat, g, bevel=0.006)
    box(_n(g, 'win'), (W * 0.52, 0.004, H * 0.6), (-W * 0.15, -D / 2 - 0.011, H / 2), 'plastic_black', g, bevel=0.006)
    box(_n(g, 'panel'), (W * 0.22, 0.01, H - 0.05), (W * 0.36, -D / 2 - 0.002, H / 2), 'plastic_grey', g, bevel=0.005)
    box(_n(g, 'display'), (W * 0.16, 0.004, 0.035), (W * 0.36, -D / 2 - 0.008, H - 0.06), 'neon_green', g, bevel=0)
    for i in range(3):
        for j in range(2):
            box(_n(g, 'btn'), (0.03, 0.006, 0.018), (W * 0.36 - 0.02 + j * 0.04, -D / 2 - 0.008, 0.07 + i * 0.035),
                'plastic_white', g, bevel=0.003, segments=1)
    for sx in (-1, 1):
        cyl(_n(g, 'foot'), 0.015, 0.01, (sx * (W / 2 - 0.05), 0, -0.004), 'plastic_black', g, verts=8, bevel=0)
    return g


def hot_plate(name='hot_plate', location=(0, 0, 0), rotation=0, burners=2, pan=True, parent='root'):
    """Cheap electric hot plate (coil burners, dial knobs) with an optional frying pan."""
    g = _g(name, location, rotation, False, parent=parent)
    W = 0.52 if burners == 2 else 0.3
    box(_n(g, 'body'), (W, 0.3, 0.07), (0, 0, 0.035), 'plastic_white', g, bevel=0.012)
    for i in range(burners):
        x = 0 if burners == 1 else (i - 0.5) * 0.25
        cyl(_n(g, 'plate'), 0.1, 0.01, (x, 0.02, 0.075), 'metal_dark', g, verts=18, bevel=0.003)
        for k in range(3):
            torus(_n(g, 'coil'), 0.03 + k * 0.025, 0.004, (x, 0.02, 0.082), 'metal', g, major=16, minor=4)
        cyl(_n(g, 'dial'), 0.015, 0.018, (x, -0.155, 0.035), 'plastic_black', g, (90, 0, 0), verts=10, bevel=0.003)
    if pan:
        x = 0 if burners == 1 else -0.125
        lathe(_n(g, 'pan'), [(0.09, 0), (0.105, 0.035), (0.1, 0.035), (0.085, 0.006)], (x, 0.02, 0.087), 'metal_dark',
              g, verts=16)
        tube(_n(g, 'panh'), [(x - 0.1, 0.02, 0.115), (x - 0.25, 0.0, 0.13)], 0.01, 'plastic_black', g, res=6)
        sphere(_n(g, 'egg'), 0.04, (x, 0.02, 0.09), 'paper', g, scale=(1, 0.9, 0.12), segs=12, rings=4)
        sphere(_n(g, 'yolk'), 0.015, (x + 0.01, 0.02, 0.095), 'fabric_mustard', g, scale=(1, 1, 0.5), segs=8, rings=4)
    return g


def counter(length=1.2, name='counter', location=(0, 0, 0), rotation=0, style='white', counter_mat=None,
            height=COUNTER_H, interact=None, obstacle=True, depth=0.6):
    """Simple base-cabinet counter block (doors + top), for small kitchenettes (e.g. mini fridge + microwave).
    Top at 0.9 m (height=)."""
    fm, carcass, cm, hm = KITCHEN_STYLES[style]
    g = _g(name, location, rotation, obstacle, interact)
    D = depth
    box(_n(g, 'carcass'), (length, D - 0.04, height - 0.14), (0, 0.01, 0.1 + (height - 0.14) / 2), carcass, g,
        bevel=0.004, segments=1)
    box(_n(g, 'kick'), (length, D - 0.1, 0.1), (0, 0.04, 0.05), 'plastic_grey', g, bevel=0.003, segments=1)
    n = max(1, round(length / 0.6))
    for i in range(n):
        w = length / n
        _cab_front(g, -length / 2 + w / 2 + i * w, w, 0.1, height - 0.14, -D / 2 + 0.01, fm, hm, 'door')
    box(_n(g, 'top'), (length + 0.02, D + 0.02, 0.04), (0, -0.01, height - 0.02), counter_mat or cm, g, bevel=0.008)
    return g


def upper_cabinets(length=1.2, name='upper_cabinets', location=(0, 0, 1.5), rotation=0, style='white', h=0.7,
                   parent='root'):
    """Wall cabinets (depth 0.34) — location = bottom centre of the back face line. Parent to a wall with
    room.on_wall so they hide with it."""
    fm, carcass, cm, hm = KITCHEN_STYLES[style]
    g = _g(name, location, rotation, False, parent=parent)
    n = max(1, round(length / 0.6))
    box(_n(g, 'body'), (length, 0.34, h), (0, -0.17, h / 2), carcass, g, bevel=0.006)
    for i in range(n):
        w = length / n
        _cab_front(g, -length / 2 + w / 2 + i * w, w, 0.0, h, -0.35, fm, hm, 'door', vertical_handle=False)
    return g


def range_hood(name='range_hood', location=(0, 0, 1.6), rotation=0, wall_h=2.7, parent='root'):
    """Chimney range hood; location = bottom centre at the wall face."""
    g = _g(name, location, rotation, False, parent=parent)
    box(_n(g, 'hood'), (0.6, 0.5, 0.1), (0, -0.25, 0.05), 'metal', g, bevel=0.01)
    hh = wall_h - location[2] - 0.1
    cyl(_n(g, 'chimney'), 0.3, hh, (0, -0.2, 0.1 + hh / 2), 'metal', g, (0, 0, 45), verts=4, r2=0.13, bevel=0.005)
    return g


def kitchen_island(length=1.8, depth=0.9, name='island', location=(0, 0, 0), rotation=0, style='white',
                   counter_mat=None, stools=3, stool_mat='fabric_coral', interact=None, anchors_eat=None,
                   obstacle=True, sink_on=False):
    """Kitchen island (top 0.9 m) with an overhang on the local -Y side and `stools` counter stools under it.
    anchors_eat='a_eat_sit' creates that anchor at the middle stool (floor point under the pelvis, facing +Y)."""
    fm, carcass, cm, hm = KITCHEN_STYLES[style]
    g = _g(name, location, rotation, obstacle, interact)
    cd = depth - 0.3
    box(_n(g, 'body'), (length - 0.1, cd, COUNTER_H - 0.14), (0, 0.15, 0.1 + (COUNTER_H - 0.14) / 2), carcass, g,
        bevel=0.006)
    box(_n(g, 'kick'), (length - 0.16, cd - 0.06, 0.1), (0, 0.15, 0.05), 'plastic_grey', g, bevel=0.003, segments=1)
    n = max(1, round((length - 0.1) / 0.6))
    for i in range(n):
        w = (length - 0.1) / n
        _cab_front(g, -(length - 0.1) / 2 + w / 2 + i * w, w, 0.1, COUNTER_H - 0.14, 0.15 + cd / 2 + 0.01, fm, hm,
                   'drawers' if i == 0 else 'door')
    # back panel (the stool side) in a contrasting slat finish
    for i in range(int((length - 0.1) / 0.08)):
        box(_n(g, 'slat'), (0.06, 0.02, COUNTER_H - 0.14), (-(length - 0.1) / 2 + 0.04 + i * 0.08, 0.15 - cd / 2 - 0.01,
                                                             0.1 + (COUNTER_H - 0.14) / 2), 'wood_light', g,
            bevel=0.005, segments=1)
    box(_n(g, 'top'), (length, depth, 0.05), (0, 0, COUNTER_H - 0.025), counter_mat or cm, g, bevel=0.012)
    # fruit bowl + vase
    lathe(_n(g, 'bowl'), [(0.05, 0), (0.12, 0.06), (0.13, 0.08), (0.12, 0.08), (0.04, 0.01)], (0.3, 0.1, COUNTER_H),
          'plastic_white', g, verts=16)
    for i, m in enumerate(('mcd_red', 'fabric_mustard', 'rug_green', 'mcd_red')):
        sphere(_n(g, 'fruit'), 0.04, (0.3 + math.cos(i * 1.6) * 0.05, 0.1 + math.sin(i * 1.6) * 0.05,
                                      COUNTER_H + 0.07 + (0.03 if i == 3 else 0)), m, g, segs=10, rings=6)
    small_plant(parent=g, location=(-length / 2 + 0.25, 0.2, COUNTER_H), style='leafy', obstacle=False)
    for i in range(stools):
        sx = (i - (stools - 1) / 2) * min(0.55, (length - 0.2) / max(1, stools))
        bar_stool(g.name + '_stool', (sx, -depth / 2 - 0.12, 0), 180, stool_mat, height=0.65, back=True,
                  obstacle=False, parent=g)
    if anchors_eat and stools:
        B.anchor(anchors_eat, (0 if stools % 2 else -min(0.55, (length - 0.2) / stools) / 2, -depth / 2 - 0.2, 0),
                 'n', frame=g)
    return g


# ----------------------------------------------------------------------------------------------------------------
# dining + living
# ----------------------------------------------------------------------------------------------------------------


def dining_table(shape='rect', seats=4, name='dining_table', location=(0, 0, 0), rotation=0, mat='wood_light',
                 chair_style='wood', chair_mat=None, place_settings=True, anchors_eat=None, obstacle=True, w=None,
                 d=None):
    """Dining table (top 0.75) with chairs around it. shape rect (seats 2/4/6) | round (seats 2-4) | small
    (café table, 2 seats). anchors_eat='a_eat_sit' puts that anchor at the first chair (local -Y side)."""
    g = _g(name, location, rotation, obstacle)
    H = 0.75
    seats_pos = []
    if shape in ('round', 'small'):
        R = 0.45 if shape == 'round' else 0.33
        cyl(_n(g, 'top'), R, 0.035, (0, 0, H - 0.0175), mat, g, verts=28, bevel=0.012)
        cyl(_n(g, 'col'), 0.04, H - 0.1, (0, 0, (H - 0.1) / 2 + 0.03), mat if shape == 'round' else 'metal_dark', g,
            verts=12)
        cyl(_n(g, 'foot'), 0.22, 0.03, (0, 0, 0.015), mat if shape == 'round' else 'metal_dark', g, verts=20,
            bevel=0.01)
        for i in range(seats):
            a = -math.pi / 2 + TAU * i / seats
            seats_pos.append((math.cos(a) * (R + 0.2), math.sin(a) * (R + 0.2), a))
    else:
        W = w or (0.8 if seats <= 2 else 1.4 if seats <= 4 else 1.9)
        Dd = d or 0.85
        box(_n(g, 'top'), (W, Dd, 0.04), (0, 0, H - 0.02), mat, g, bevel=0.012)
        leg4(g, W, Dd, H - 0.04, 0.03, mat, inset=0.07, square=True)
        box(_n(g, 'apron'), (W - 0.14, Dd - 0.14, 0.07), (0, 0, H - 0.075), mat, g, bevel=0.006)
        per = max(1, seats // 2)
        for side in (-1, 1):
            for i in range(per):
                x = (i - (per - 1) / 2) * (W / per)
                seats_pos.append((x, side * (Dd / 2 + 0.2), -math.pi / 2 if side < 0 else math.pi / 2))
        seats_pos = sorted(seats_pos, key=lambda p: p[1])[:seats]
    for i, (x, y, a) in enumerate(seats_pos):
        rot = math.degrees(a) - 90 + 180   # chair front faces the table centre
        ch = office_chair(chair_style, g.name + '_chair', (0, 0, 0), 0, chair_mat, parent=None, obstacle=False)
        B.reparent(ch, g)
        ch.location = (x, y, 0)
        ch.rotation_euler = (0, 0, math.radians(rot + 180))
        if place_settings:
            px, py = x * 0.55, y * 0.55
            if shape == 'rect':
                py = y * 0.6
            cyl(_n(g, 'plate'), 0.11, 0.012, (px, py, H + 0.006), 'plastic_white', g, verts=18, bevel=0.004)
    if place_settings:
        lathe(_n(g, 'vase'), [(0.03, 0), (0.05, 0.05), (0.03, 0.14), (0.025, 0.2)], (0, 0, H), 'terracotta', g,
              verts=12)
        for k in range(3):
            tube(_n(g, 'stem'), [(0, 0, H + 0.15), (math.cos(k * 2) * 0.05, math.sin(k * 2) * 0.05, H + 0.32)], 0.003,
                 'plant_dark', g, res=4)
            sphere(_n(g, 'bloom'), 0.025, (math.cos(k * 2) * 0.05, math.sin(k * 2) * 0.05, H + 0.33),
                   ['fabric_coral', 'fabric_mustard', 'rug_rose'][k], g, segs=8, rings=5)
    if anchors_eat and seats_pos:
        x, y, a = seats_pos[0]
        B.anchor(anchors_eat, (x, y + (-0.04 if y < 0 else 0.04), 0), (0, 0), frame=g)
    return g


def couch(style='three', name='couch', location=(0, 0, 0), rotation=0, mat='fabric_blue', pillow_mats=None,
          leg_mat='wood_dark', throw_mat=None, interact=None, anchors=False, seed=1, obstacle=True, length=None):
    """Sofa, sitters face local -Y. style saggy (worn 2-seater, sagging cushions, afghan throw) | loveseat |
    three (3-seat) | sectional (L with a chaise on local +X toward -Y). Seat height ~0.44.
    anchors=True -> a_couch_sit at the middle seat (floor point under the pelvis, facing -Y)."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle, interact)
    seats = {'saggy': 2, 'loveseat': 2, 'three': 3, 'sectional': 3}[style]
    SW = 0.62 if style != 'saggy' else 0.6
    L = length or (seats * SW + 0.36)
    D = 0.92
    AH = 0.62
    arm_w = 0.18
    sag = style == 'saggy'
    pm = pillow_mats or (['fabric_mustard', 'fabric_coral'] if mat != 'fabric_mustard' else ['fabric_teal',
                                                                                             'fabric_cream'])
    # base
    box(_n(g, 'base'), (L, D, 0.24), (0, 0, 0.12 + 0.1), mat, g, bevel=0.04, segments=3)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(_n(g, 'leg'), 0.025, 0.1, (sx * (L / 2 - 0.08), sy * (D / 2 - 0.08), 0.05), leg_mat, g, verts=10,
                r2=0.018, bevel=0.003)
    # arms
    for sx in (-1, 1):
        blob(_n(g, 'arm'), (arm_w, D, AH - 0.1), (sx * (L / 2 - arm_w / 2), 0, 0.1 + (AH - 0.1) / 2), mat, g,
             round_xy=0.25, round_z=0.35, segs=20, rings=10)
    # back
    blob(_n(g, 'back'), (L - 0.04, 0.22, 0.52), (0, D / 2 - 0.11, 0.34 + 0.26), mat, g, (-8, 0, 0), round_xy=0.2,
         round_z=0.3, segs=24, rings=10)
    inner = L - 2 * arm_w
    sw = inner / seats
    for i in range(seats):
        x = -inner / 2 + sw / 2 + i * sw

        def sagf(xx, yy, zz, s=sag):
            if not s:
                return (xx, yy, zz)
            return (xx, yy, zz - 0.035 * math.cos(xx / sw * math.pi) * (0.6 + 0.4 * math.cos(yy * 3)) * (zz > 0))
        blob(_n(g, 'seat'), (sw - 0.01, D - 0.28, 0.14), (x, -0.1, 0.34 + 0.07), mat, g,
             (0, 0, rng.uniform(-2, 2) if sag else 0), round_xy=0.3, round_z=0.45, segs=18, rings=8, deform=sagf)
        blob(_n(g, 'backc'), (sw - 0.02, 0.18, 0.4), (x, D / 2 - 0.28, 0.48 + 0.2), mat, g,
             (-14 + (rng.uniform(-6, 6) if sag else 0), 0, rng.uniform(-3, 3) if sag else 0), round_xy=0.3,
             round_z=0.4, segs=16, rings=8)
    # pillows
    for i, sx in enumerate((-1, 1)):
        blob(_n(g, 'pillow'), (0.4, 0.13, 0.38), (sx * (inner / 2 - 0.2), D / 2 - 0.38, 0.62),
             pm[i % len(pm)], g, (-18, sx * 8, sx * -18 + rng.uniform(-5, 5)), round_xy=0.5, round_z=0.6, segs=14,
             rings=8)
    if style == 'sectional':
        cl = 0.75
        blob(_n(g, 'chaise'), (0.8, cl + 0.1, 0.24), (L / 2 - arm_w - 0.4 + 0.18, -D / 2 - cl / 2 + 0.05, 0.22), mat, g,
             round_xy=0.15, round_z=0.3, segs=20, rings=8)
        blob(_n(g, 'chaisec'), (0.78 - 0.02, cl + 0.2, 0.14), (L / 2 - arm_w - 0.4 + 0.18, -D / 2 - cl / 2 + 0.1, 0.41),
             mat, g, round_xy=0.3, round_z=0.45, segs=18, rings=8)
        blob(_n(g, 'chaisearm'), (arm_w, cl + 0.1, AH - 0.2), (L / 2 - arm_w / 2, -D / 2 - cl / 2 + 0.05, 0.2 +
                                                                (AH - 0.2) / 2 - 0.05), mat, g, round_xy=0.25,
             round_z=0.35, segs=18, rings=8)
        for sy in (-1,):
            cyl(_n(g, 'leg'), 0.025, 0.1, (L / 2 - 0.08, -D / 2 - cl + 0.05, 0.05), leg_mat, g, verts=10, r2=0.018)
            cyl(_n(g, 'leg'), 0.025, 0.1, (L / 2 - arm_w - 0.62, -D / 2 - cl + 0.05, 0.05), leg_mat, g, verts=10,
                r2=0.018)
    if sag or throw_mat:
        tm = throw_mat or 'fabric_mustard'
        # blanket draped over the left arm, hanging down both sides
        def drape(x, y, z):
            k = max(0.0, abs(x) - 0.07)
            return (x * (0.55 if abs(x) > 0.07 else 1.0) + (0.02 if x > 0 else 0), y, z - 1.3 * k + 0.012 *
                    math.sin(y * 14))
        blob(_n(g, 'throw'), (0.62, 0.55, 0.035), (-L / 2 + arm_w / 2, 0.02, AH + 0.02), tm, g, (0, 0, 4),
             round_xy=0.25, round_z=0.5, segs=20, rings=8, deform=drape)
    if anchors:
        B.anchor('a_couch_sit', (0, -0.12, 0), 's', frame=g)
    return g


def armchair(style='club', name='armchair', location=(0, 0, 0), rotation=0, mat='fabric_mustard', leg_mat='wood_mid',
             obstacle=True):
    """Armchair (sitter faces local -Y): style club (chunky, rounded) | mid (mid-century, thin arms, tapered legs)."""
    g = _g(name, location, rotation, obstacle)
    if style == 'mid':
        box(_n(g, 'frame'), (0.72, 0.72, 0.05), (0, 0, 0.3), leg_mat, g, bevel=0.012)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl(_n(g, 'leg'), 0.02, 0.3, (sx * 0.3, sy * 0.3, 0.15), leg_mat, g, (sy * -8, sx * 8, 0), verts=8,
                    r2=0.012)
            box(_n(g, 'arm'), (0.05, 0.66, 0.04), (sx * 0.34, -0.02, 0.6), leg_mat, g, bevel=0.012)
            tube(_n(g, 'armpost'), [(sx * 0.34, -0.3, 0.32), (sx * 0.34, -0.28, 0.58)], 0.015, leg_mat, g, res=6)
        blob(_n(g, 'seat'), (0.62, 0.62, 0.13), (0, -0.02, 0.39), mat, g, round_xy=0.3, round_z=0.5)
        blob(_n(g, 'back'), (0.62, 0.14, 0.5), (0, 0.3, 0.66), mat, g, (-14, 0, 0), round_xy=0.3, round_z=0.4)
    else:
        box(_n(g, 'base'), (0.9, 0.86, 0.22), (0, 0, 0.19), mat, g, bevel=0.05, segments=3)
        for sx in (-1, 1):
            blob(_n(g, 'arm'), (0.2, 0.86, 0.5), (sx * 0.35, 0, 0.35), mat, g, round_xy=0.35, round_z=0.4)
            for sy in (-1, 1):
                cyl(_n(g, 'leg'), 0.022, 0.08, (sx * 0.36, sy * 0.35, 0.04), leg_mat, g, verts=8)
        blob(_n(g, 'back'), (0.86, 0.22, 0.6), (0, 0.33, 0.55), mat, g, (-8, 0, 0), round_xy=0.3, round_z=0.4)
        blob(_n(g, 'seat'), (0.54, 0.64, 0.14), (0, -0.08, 0.36), mat, g, round_xy=0.3, round_z=0.5)
        blob(_n(g, 'pillow'), (0.36, 0.12, 0.32), (0.0, 0.15, 0.57), 'fabric_cream', g, (-15, 0, 6), round_xy=0.5,
             round_z=0.6, segs=14, rings=8)
    return g


def bean_bag(name='bean_bag', location=(0, 0, 0), rotation=0, mat='fabric_coral', obstacle=True):
    """Slouchy bean bag with a sitting dent, facing local -Y."""
    g = _g(name, location, rotation, obstacle)

    def dent(x, y, z):
        d = math.exp(-((x) ** 2 + (y + 0.08) ** 2) / 0.05)
        z2 = z - 0.16 * d * (z > -0.05)
        # back rises
        z2 += 0.08 * max(0.0, y) / 0.4 * (z > 0)
        return (x, y, z2)
    blob(_n(g, 'bag'), (0.85, 0.85, 0.62), (0, 0, 0.3), mat, g, round_xy=0.9, round_z=0.75, segs=24, rings=12,
         deform=dent)
    torus(_n(g, 'seam'), 0.36, 0.008, (0, 0, 0.2), mat, g, major=24, minor=4)
    return g


def coffee_table(style='wood', name='coffee_table', location=(0, 0, 0), rotation=0, mat=None, clutter=True, seed=1,
                 obstacle=True):
    """Low table (0.42 m): style wood (rect, lower shelf) | round (pedestal) | glass (metal frame, glass top) |
    crate (pallet/crate table). clutter adds magazines, a mug, a remote and a small plant."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle)
    H = 0.42
    if style == 'round':
        m = mat or 'wood_light'
        cyl(_n(g, 'top'), 0.42, 0.04, (0, 0, H - 0.02), m, g, verts=28, bevel=0.012)
        for i in range(3):
            a = TAU * i / 3
            tube(_n(g, 'leg'), [(math.cos(a) * 0.28, math.sin(a) * 0.28, H - 0.04), (math.cos(a) * 0.33,
                                                                                    math.sin(a) * 0.33, 0)],
                 0.018, 'wood_dark', g, res=6)
        W, D = 0.6, 0.6
    elif style == 'glass':
        W, D = 1.1, 0.6
        box(_n(g, 'top'), (W, D, 0.015), (0, 0, H - 0.0075), 'window_glass', g, bevel=0.004)
        for sx in (-1, 1):
            tube(_n(g, 'frame'), [(sx * (W / 2 - 0.05), -D / 2 + 0.05, H - 0.02), (sx * (W / 2 - 0.05), -D / 2 + 0.05, 0),
                                  (sx * (W / 2 - 0.05), D / 2 - 0.05, 0), (sx * (W / 2 - 0.05), D / 2 - 0.05, H - 0.02)],
                 0.012, mat or 'metal', g, res=6)
        box(_n(g, 'shelf'), (W - 0.12, D - 0.1, 0.02), (0, 0, 0.12), 'wood_light', g, bevel=0.005)
    elif style == 'crate':
        W, D = 1.0, 0.6
        m = mat or 'wood_light'
        for z in (0.03, 0.2, H - 0.02):
            for i in range(5):
                box(_n(g, 'slat'), (W, D / 5 - 0.01, 0.03), (0, -D / 2 + D / 10 + i * D / 5, z), m, g, bevel=0.004,
                    segments=1)
        for sx in (-1, 0, 1):
            box(_n(g, 'block'), (0.09, D, 0.14), (sx * (W / 2 - 0.05), 0, 0.115), 'wood_mid', g, bevel=0.006)
    else:
        W, D = 1.0, 0.55
        m = mat or 'wood_mid'
        box(_n(g, 'top'), (W, D, 0.04), (0, 0, H - 0.02), m, g, bevel=0.012)
        leg4(g, W, D, H - 0.04, 0.025, m, inset=0.05, splay=4)
        box(_n(g, 'shelf'), (W - 0.12, D - 0.1, 0.02), (0, 0, 0.12), m, g, bevel=0.005)
        for i in range(3):
            box(_n(g, 'mag'), (0.22, 0.28, 0.008), (-0.25 + i * 0.02, 0.02, 0.135 + i * 0.008),
                ['poster_a', 'poster_b', 'paper'][i], g, rng.uniform(-15, 15), bevel=0.002, segments=1)
    if clutter:
        mug(g, (0.15 if style != 'round' else 0.1, -0.08, H), 'fabric_teal')
        box(_n(g, 'remote'), (0.05, 0.16, 0.018), (-0.1, -0.05, H + 0.009), 'plastic_black', g, 25, bevel=0.006)
        if style != 'round':
            box(_n(g, 'book'), (0.22, 0.16, 0.03), (-W / 2 + 0.2, 0.08, H + 0.015), 'fabric_coral', g, -6, bevel=0.004)
            box(_n(g, 'book'), (0.2, 0.15, 0.025), (-W / 2 + 0.2, 0.08, H + 0.0425), 'paper', g, 4, bevel=0.004)
            small_plant(parent=g, location=(W / 2 - 0.15, 0.1, H), style='succulent', obstacle=False)
    return g


def tv(size=1.2, name='tv', location=(0, 0, 0), rotation=0, stand=True, stand_style='low', interact=None,
       console=True, obstacle=True, parent='root'):
    """Flat TV (m_screen with UVs), screen width `size` m, facing local -Y. stand=True puts it on a media console
    (stand_style low | console | legs); stand=False gives a wall-mountable TV whose location is the centre of the
    screen's back (parent it to a wall with room.on_wall). console=True adds a game console + controller."""
    g = _g(name, location, rotation, obstacle if stand else False, interact, parent=parent)
    sh = size * 0.5625
    if stand:
        H = 0.45 if stand_style != 'legs' else 0.5
        SW = max(size + 0.3, 1.2)
        if stand_style == 'legs':
            box(_n(g, 'body'), (SW, 0.42, 0.3), (0, 0, 0.35), 'wood_light', g, bevel=0.012)
            leg4(g, SW, 0.42, 0.2, 0.02, 'wood_mid', inset=0.06, splay=6)
        else:
            box(_n(g, 'body'), (SW, 0.42, H - 0.05), (0, 0, 0.05 + (H - 0.05) / 2), 'wood_light' if stand_style == 'low'
                else 'plastic_white', g, bevel=0.012)
            box(_n(g, 'plinth'), (SW - 0.06, 0.36, 0.05), (0, 0, 0.025), 'wood_dark', g, bevel=0.004)
        # sliding fronts
        for i in range(3):
            box(_n(g, 'front'), (SW / 3 - 0.02, 0.01, 0.2), (-SW / 3 + i * SW / 3, -0.215, 0.28 if stand_style !=
                                                             'legs' else 0.35),
                'wood_mid' if i != 1 else 'fabric_grey', g, bevel=0.005)
        base_z = H if stand_style != 'legs' else 0.5
        box(_n(g, 'foot'), (0.34, 0.2, 0.012), (0, 0.02, base_z + 0.006), 'plastic_black', g, bevel=0.004)
        box(_n(g, 'neck'), (0.06, 0.03, 0.08), (0, 0.04, base_z + 0.05), 'plastic_black', g, bevel=0.006)
        zc = base_z + 0.07 + sh / 2
        if console:
            box(_n(g, 'console'), (0.3, 0.2, 0.06), (SW / 2 - 0.25, -0.02, base_z + 0.03), 'plastic_white', g,
                bevel=0.01)
            box(_n(g, 'consolel'), (0.004, 0.2, 0.012), (SW / 2 - 0.25 - 0.152, -0.02, base_z + 0.03), 'neon_blue', g,
                bevel=0)
            blob(_n(g, 'pad'), (0.15, 0.1, 0.04), (-SW / 2 + 0.25, -0.1, base_z + 0.02), 'plastic_black', g, 12,
                 round_xy=0.6, round_z=0.6, segs=12, rings=6)
            small_plant(parent=g, location=(-SW / 2 + 0.12, 0.05, base_z), style='cactus', obstacle=False)
        yb = 0.04
    else:
        zc = 0.0
        yb = -0.03
    box(_n(g, 'body'), (size, 0.035, sh), (0, yb, zc), 'plastic_black', g, bevel=0.008)
    panel(_n(g, 'screen'), (size - 0.03, sh - 0.03), (0, yb - 0.019, zc), 'screen', g)
    return g


# ----------------------------------------------------------------------------------------------------------------
# storage
# ----------------------------------------------------------------------------------------------------------------


def bookshelf(style='tall', name='bookshelf', location=(0, 0, 0), rotation=0, mat='wood_light', w=None, h=None,
              seed=1, obstacle=True, decor=True):
    """Bookcase full of books (front local -Y): style tall (0.9 x 1.9, 5 shelves) | low (1.2 x 0.8) | cube
    (4 x 4 cube storage with bins) | ladder (leaning ladder shelf). decor adds a plant / box / trophy."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle)
    D = 0.32
    if style == 'cube':
        W, H = w or 1.5, h or 1.5
        n = 4 if W > 1.2 else 3
        cs = W / n
        for i in range(n + 1):
            box(_n(g, 'v'), (0.025, D, H), (-W / 2 + i * cs, 0, H / 2), mat, g, bevel=0.004, segments=1)
            box(_n(g, 'h'), (W, D, 0.025), (0, 0, i * H / n + 0.0125 * (i == 0) - 0.0125 * (i == n)), mat, g,
                bevel=0.004, segments=1)
        for i in range(n):
            for j in range(n):
                cx, cz = -W / 2 + cs / 2 + i * cs, j * H / n + 0.02
                r = rng.random()
                if r < 0.35:
                    box(_n(g, 'bin'), (cs - 0.06, D - 0.04, H / n - 0.06), (cx, -0.01, cz + (H / n - 0.06) / 2),
                        ['fabric_grey', 'fabric_teal', 'fabric_cream', 'fabric_mustard'][rng.randrange(4)], g,
                        bevel=0.02)
                elif r < 0.75:
                    books_row(g, cx - cs / 2 + 0.03, cx + cs / 2 - 0.03, -0.02, cz, 0.24, rng.randrange(99),
                              0.16, min(0.3, H / n - 0.06))
                elif decor:
                    small_plant(parent=g, location=(cx, -0.02, cz), style=['succulent', 'cactus', 'leafy'][
                        rng.randrange(3)], seed=rng.randrange(99))
        return g
    if style == 'ladder':
        W, H = w or 0.7, h or 1.8
        for sx in (-1, 1):
            tube(_n(g, 'rail'), [(sx * W / 2, -0.35, 0), (sx * W / 2, 0.12, H)], 0.02, mat, g, res=6)
        for i in range(4):
            t = 0.15 + i * 0.25
            sd = 0.36 - i * 0.07
            y = -0.35 + t * 0.47 + (0.0)
            z = t * H - 0.02
            box(_n(g, 'shelf'), (W, sd, 0.025), (0, y + sd / 2 - 0.02, z), mat, g, bevel=0.005)
            if i % 2 == 0:
                books_row(g, -W / 2 + 0.05, W / 2 * 0.3, y + 0.0, z + 0.0125, sd - 0.06, rng.randrange(99), 0.14, 0.22)
            elif decor:
                small_plant(parent=g, location=(W * 0.2, y + sd / 2 - 0.02, z + 0.0125), style='trailing',
                            seed=rng.randrange(99))
        return g
    W = w or (0.9 if style == 'tall' else 1.2)
    H = h or (1.9 if style == 'tall' else 0.8)
    n = 5 if style == 'tall' else 2
    t = 0.025
    for sx in (-1, 1):
        box(_n(g, 'side'), (t, D, H), (sx * (W / 2 - t / 2), 0, H / 2), mat, g, bevel=0.005)
    box(_n(g, 'back'), (W - 2 * t, 0.01, H - 0.02), (0, D / 2 - 0.005, H / 2), mat, g, bevel=0.002, segments=1)
    box(_n(g, 'top'), (W + 0.02, D + 0.01, t), (0, 0, H - t / 2), mat, g, bevel=0.006)
    box(_n(g, 'kick'), (W - 2 * t, 0.02, 0.07), (0, -D / 2 + 0.02, 0.035), mat, g, bevel=0.003)
    for i in range(n):
        z = 0.07 + i * (H - 0.07) / n
        box(_n(g, 'shelf'), (W - 2 * t, D - 0.02, t), (0, 0.0, z + t / 2), mat, g, bevel=0.004, segments=1)
        zb = z + t
        sh = (H - 0.07) / n - t - 0.02
        r = rng.random()
        if decor and r < 0.22:
            books_row(g, -W / 2 + t + 0.01, 0.0, -0.02, zb, 0.22, rng.randrange(99), min(0.15, sh * 0.6),
                      min(0.28, sh))
            if rng.random() < 0.5:
                small_plant(parent=g, location=(W * 0.22, -0.03, zb), style=['succulent', 'trailing', 'leafy'][
                    rng.randrange(3)], seed=rng.randrange(99))
            else:
                box(_n(g, 'box'), (0.22, 0.2, 0.14), (W * 0.22, -0.02, zb + 0.07), ['fabric_teal', 'fabric_coral',
                                                                                     'paper'][rng.randrange(3)], g,
                    rng.uniform(-8, 8), bevel=0.01)
        elif decor and r < 0.35:
            # horizontal stack + trophy/figure
            for k in range(rng.randint(3, 5)):
                box(_n(g, 'book'), (0.24, 0.18, 0.035), (-W / 4, -0.02, zb + 0.0175 + k * 0.036),
                    ['poster_a', 'poster_b', 'fabric_teal', 'paper', 'fabric_mustard'][rng.randrange(5)], g,
                    rng.uniform(-6, 6), bevel=0.004, segments=1)
            lathe(_n(g, 'trophy'), [(0.04, 0), (0.04, 0.02), (0.012, 0.03), (0.012, 0.07), (0.045, 0.1), (0.05, 0.16),
                                    (0.045, 0.16), (0.01, 0.1)], (W / 4, -0.02, zb), 'mcd_yellow', g, verts=12)
        else:
            books_row(g, -W / 2 + t + 0.01, W / 2 - t - 0.01 - rng.uniform(0, 0.25), -0.02, zb, 0.22,
                      rng.randrange(99), min(0.16, sh * 0.6), min(0.28, sh))
    if decor and style == 'tall':
        small_plant(parent=g, location=(W / 2 - 0.15, 0, H), style='trailing', seed=seed)
        box(_n(g, 'topbox'), (0.3, 0.24, 0.16), (-W / 2 + 0.2, 0, H + 0.08), 'kraft', g, 4, bevel=0.01)
    return g


def metal_shelving(w=1.2, h=1.8, d=0.5, levels=5, name='shelving', location=(0, 0, 0), rotation=0, mat='metal',
                   stock=True, interact=None, seed=1, obstacle=True, boxes_anchor=None):
    """Garage / warehouse metal shelving unit with angle posts and `levels` shelves, optionally stocked with bins,
    kraft boxes and paint cans. boxes_anchor='a_boxes_1' creates a box-region anchor on the 2nd shelf top
    (extras w, d, layers) and leaves that shelf empty for the runtime's stock boxes."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle, interact)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(_n(g, 'post'), (0.035, 0.035, h), (sx * (w / 2 - 0.018), sy * (d / 2 - 0.018), h / 2), mat, g,
                bevel=0.003, segments=1)
            box(_n(g, 'foot'), (0.05, 0.05, 0.01), (sx * (w / 2 - 0.018), sy * (d / 2 - 0.018), 0.005), 'plastic_black',
                g, bevel=0.002, segments=1)
    zs = [0.1 + i * (h - 0.15) / (levels - 1) for i in range(levels)]
    for li, z in enumerate(zs):
        box(_n(g, 'shelf'), (w, d, 0.025), (0, 0, z), 'metal' if mat != 'metal' else 'plastic_grey', g, bevel=0.004,
            segments=1)
        box(_n(g, 'lip'), (w, 0.012, 0.04), (0, -d / 2 + 0.006, z - 0.005), mat, g, bevel=0.003, segments=1)
        if boxes_anchor and li == 1:
            continue
        if not stock or li == levels - 1 and rng.random() < 0.5:
            continue
        x = -w / 2 + 0.04
        sh = (h - 0.15) / (levels - 1) - 0.06
        while x < w / 2 - 0.12:
            r = rng.random()
            if r < 0.45:
                bw = rng.uniform(0.25, 0.4)
                if x + bw > w / 2 - 0.03:
                    break
                bh = min(sh, rng.uniform(0.18, 0.3))
                box(_n(g, 'box'), (bw, d * 0.8, bh), (x + bw / 2, 0, z + 0.0125 + bh / 2), 'kraft', g,
                    rng.uniform(-4, 4), bevel=0.008)
                box(_n(g, 'tape'), (0.05, d * 0.8 + 0.002, 0.004), (x + bw / 2, 0, z + 0.0125 + bh), 'carpet_beige', g,
                    bevel=0, segments=1)
                x += bw + 0.03
            elif r < 0.75:
                bw = 0.38
                if x + bw > w / 2 - 0.03:
                    break
                bh = min(sh, 0.24)
                col = ['fabric_blue', 'mcd_red', 'fabric_mustard', 'plastic_grey'][rng.randrange(4)]
                box(_n(g, 'bin'), (bw, d * 0.85, bh), (x + bw / 2, 0, z + 0.0125 + bh / 2), col, g, bevel=0.02)
                box(_n(g, 'binlid'), (bw + 0.01, d * 0.85 + 0.01, 0.03), (x + bw / 2, 0, z + 0.0125 + bh), col, g,
                    bevel=0.01)
                x += bw + 0.03
            else:
                for k in range(2):
                    cyl(_n(g, 'can'), 0.08, 0.18, (x + 0.09 + k * 0.17, -0.05, z + 0.0125 + 0.09),
                        ['plastic_white', 'metal'][k], g, verts=14, bevel=0.005)
                x += 0.38
    if boxes_anchor:
        B.anchor(boxes_anchor, (0, 0, zs[1] + 0.0125), 's', frame=g, w=round(w - 0.1, 3), d=round(d - 0.06, 3),
                 layers=max(1, int(((h - 0.15) / (levels - 1) - 0.06) / 0.3)))
    return g


def wall_shelf(w=0.9, name='wall_shelf', location=(0, 0, 1.4), rotation=0, mat='wood_light', items=True, seed=1,
               parent='root'):
    """Floating wall shelf; location = centre of the back edge at shelf height. Parent with room.on_wall."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, False, parent=parent)
    box(_n(g, 'board'), (w, 0.22, 0.035), (0, -0.11, 0), mat, g, bevel=0.008)
    for sx in (-1, 1):
        box(_n(g, 'bracket'), (0.025, 0.18, 0.12), (sx * (w / 2 - 0.12), -0.09, -0.07), 'metal_dark', g, bevel=0.004)
    if items:
        books_row(g, -w / 2 + 0.04, -w / 2 + 0.3, -0.2, 0.0175, 0.18, rng.randrange(99), 0.14, 0.22)
        small_plant(parent=g, location=(w / 2 - 0.14, -0.11, 0.0175), style='trailing', seed=seed)
        box(_n(g, 'frame'), (0.14, 0.02, 0.18), (0.02, -0.06, 0.0175 + 0.09), 'plastic_black', g, (-8, 0, 0),
            bevel=0.004)
        panel(_n(g, 'photo'), (0.11, 0.15), (0.02, -0.072, 0.0175 + 0.09), 'poster_b', g, (-8, 0, 0))
    return g


def dresser(name='dresser', location=(0, 0, 0), rotation=0, mat='wood_light', w=1.0, decor=True, obstacle=True):
    """Chest of drawers (w x 0.45 x 0.85) with a mirror-less top: lamp, frame, jewellery dish."""
    g = _g(name, location, rotation, obstacle)
    H, D = 0.85, 0.45
    box(_n(g, 'body'), (w, D, H - 0.08), (0, 0, 0.08 + (H - 0.08) / 2), mat, g, bevel=0.012)
    leg4(g, w, D, 0.08, 0.018, 'wood_dark', inset=0.05)
    for i in range(3):
        z = 0.14 + i * 0.235
        for sx in ((-1, 1) if i < 2 else (0,)):
            dw = (w - 0.06) / (2 if i < 2 else 1) - 0.01
            x = sx * (dw / 2 + 0.005) if i < 2 else 0
            box(_n(g, 'drawer'), (dw, 0.02, 0.21), (x, -D / 2 - 0.008, z + 0.105), mat, g, bevel=0.008)
            knob(g, (x, -D / 2 - 0.025, z + 0.13), 'mcd_yellow')
    if decor:
        table_lamp(g, (w / 2 - 0.15, 0.05, H), 0.34)
        box(_n(g, 'frame'), (0.16, 0.02, 0.2), (-w / 2 + 0.2, 0.08, H + 0.1), 'wood_dark', g, (-8, 0, 10), bevel=0.004)
        panel(_n(g, 'photo'), (0.12, 0.16), (-w / 2 + 0.2 - 0.002, 0.069, H + 0.1), 'poster_a', g, (-8, 0, 10))
        cyl(_n(g, 'dish'), 0.06, 0.02, (0.0, -0.05, H + 0.01), 'plastic_white', g, verts=14, bevel=0.006)
    return g


def wardrobe(name='wardrobe', location=(0, 0, 0), rotation=0, mat='plastic_white', w=1.0, h=2.0, obstacle=True):
    """Two-door wardrobe (w x 0.58 x h) with a storage box on top."""
    g = _g(name, location, rotation, obstacle)
    D = 0.58
    box(_n(g, 'body'), (w, D, h - 0.06), (0, 0, 0.06 + (h - 0.06) / 2), mat, g, bevel=0.012)
    box(_n(g, 'plinth'), (w - 0.04, D - 0.06, 0.06), (0, 0.01, 0.03), 'plastic_grey', g, bevel=0.004)
    for sx in (-1, 1):
        box(_n(g, 'door'), (w / 2 - 0.01, 0.02, h - 0.1), (sx * w / 4, -D / 2 - 0.008, 0.06 + (h - 0.06) / 2), mat, g,
            bevel=0.008)
        bar_handle(g, (sx * 0.05, -D / 2 - 0.02, h * 0.55), 0.3, True, 'wood_mid', 0.01)
    box(_n(g, 'topbox'), (0.5, 0.4, 0.22), (-0.15, 0, h + 0.11), 'kraft', g, 3, bevel=0.01)
    return g


# ----------------------------------------------------------------------------------------------------------------
# soft furnishings + wall decor
# ----------------------------------------------------------------------------------------------------------------


def rug(size=(2.0, 1.4), name='rug', location=(0, 0, 0), rotation=0, mat='rug_rose', accent='fabric_cream',
        shape='rect', pattern='border', fringe=False, seed=1):
    """Floor rug (not an obstacle), 1.2 cm thick with a soft edge. shape rect | round | runner. pattern plain |
    border | stripes | diamond | dots. Put it BEFORE furniture on top of it."""
    g = _g(name, location, rotation, False)
    w, d = size
    t = 0.012
    if shape == 'round':
        cyl(_n(g, 'rug'), w / 2, t, (0, 0, t / 2), mat, g, verts=40, bevel=0.005)
        if pattern != 'plain':
            torus(_n(g, 'ring'), w / 2 * 0.78, 0.025, (0, 0, t), accent, g, major=40, minor=4)
            if pattern in ('dots', 'diamond'):
                cyl(_n(g, 'center'), w / 2 * 0.3, 0.004, (0, 0, t + 0.002), accent, g, verts=28, bevel=0)
        return g
    box(_n(g, 'rug'), (w, d, t), (0, 0, t / 2), mat, g, bevel=0.005, segments=2)
    z = t + 0.001
    if pattern == 'border':
        bw = min(w, d) * 0.08
        for sx in (-1, 1):
            box(_n(g, 'b'), (bw * 0.5, d - 2 * bw, 0.003), (sx * (w / 2 - bw), 0, z), accent, g, bevel=0, segments=1)
        for sy in (-1, 1):
            box(_n(g, 'b'), (w - 2 * bw + bw * 0.5, bw * 0.5, 0.003), (0, sy * (d / 2 - bw), z), accent, g, bevel=0,
                segments=1)
    elif pattern == 'stripes':
        n = max(3, int(w / 0.25))
        for i in range(n):
            if i % 2:
                box(_n(g, 's'), (w / n * 0.6, d - 0.08, 0.003), (-w / 2 + (i + 0.5) * w / n, 0, z), accent, g, bevel=0,
                    segments=1)
    elif pattern == 'diamond':
        s = min(w, d) * 0.45
        cyl(_n(g, 'dia'), s / 2, 0.003, (0, 0, z), accent, g, verts=4, bevel=0)
        cyl(_n(g, 'dia2'), s / 3.2, 0.004, (0, 0, z + 0.001), mat, g, verts=4, bevel=0)
        for sx in (-1, 1):
            cyl(_n(g, 'dia3'), s / 5, 0.003, (sx * s * 0.8, 0, z), accent, g, verts=4, bevel=0)
    elif pattern == 'dots':
        rng = _rng(name, seed)
        for i in range(int(w * d * 6)):
            cyl(_n(g, 'dot'), 0.04, 0.003, (rng.uniform(-w / 2 + 0.1, w / 2 - 0.1), rng.uniform(-d / 2 + 0.1,
                                                                                                 d / 2 - 0.1), z),
                accent, g, verts=10, bevel=0)
    if fringe:
        for sx in (-1, 1):
            box(_n(g, 'fringe'), (0.05, d - 0.04, 0.004), (sx * (w / 2 + 0.025), 0, 0.003), 'fabric_cream', g, bevel=0,
                segments=1)
    return g


def poster(size=(0.5, 0.7), name='poster', location=(0, 0, 1.5), rotation=0, style='abstract', seed=1, frame=None,
           parent='root'):
    """Wall poster / print facing local -Y; location = centre of its BACK on the wall surface (use
    room.wall_point(side, at, z) + rotation B.against(side), then room.on_wall). style abstract (circles + blocks)
    | sunset (sun over stripes) | wave | grid (Swiss blocks) | plant (leaf). frame=None (taped corners) or a
    material name (thin frame)."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, False, parent=parent)
    w, h = size
    bg = ['paper', 'wall_blush', 'wall_sky', 'fabric_cream', 'plastic_black'][rng.randrange(5)]
    if frame:
        box(_n(g, 'frame'), (w + 0.04, 0.025, h + 0.04), (0, -0.0125, 0), frame, g, bevel=0.006)
        box(_n(g, 'mat'), (w, 0.01, h), (0, -0.026, 0), 'paper', g, bevel=0, segments=1)
        w, h = w * 0.82, h * 0.82
        y0 = -0.032
    else:
        y0 = -0.004
    box(_n(g, 'sheet'), (w, 0.004, h), (0, y0 + 0.002, 0), bg, g, bevel=0, segments=1)
    y = y0 - 0.002
    cols = ['poster_a', 'poster_b', 'fabric_mustard', 'fabric_teal', 'fabric_coral', 'rug_green', 'mcd_red']
    c1, c2, c3 = rng.sample(cols, 3)
    if style == 'sunset':
        cyl(_n(g, 'sun'), w * 0.28, 0.003, (0, y, h * 0.08), c1, g, (90, 0, 0), verts=24, bevel=0)
        for i in range(4):
            box(_n(g, 'stripe'), (w * 0.9, 0.003, h * 0.06), (0, y - 0.002, -h * 0.12 - i * h * 0.09), c2 if i % 2 else c3,
                g, bevel=0, segments=1)
    elif style == 'wave':
        pts = [(-w * 0.42 + i * w * 0.84 / 12, y, math.sin(i * 0.9) * h * 0.1) for i in range(13)]
        tube(_n(g, 'wave'), pts, h * 0.035, c1, g, res=6)
        pts = [(-w * 0.42 + i * w * 0.84 / 12, y, math.sin(i * 0.9 + 1.2) * h * 0.1 - h * 0.2) for i in range(13)]
        tube(_n(g, 'wave'), pts, h * 0.025, c2, g, res=6)
        cyl(_n(g, 'dot'), w * 0.1, 0.003, (w * 0.25, y, h * 0.3), c3, g, (90, 0, 0), verts=16, bevel=0)
    elif style == 'grid':
        for i in range(3):
            for j in range(4):
                if rng.random() < 0.6:
                    box(_n(g, 'blk'), (w * 0.26, 0.003, h * 0.19), (-w * 0.3 + i * w * 0.3, y, h * 0.32 - j * h * 0.22),
                        [c1, c2, c3][rng.randrange(3)], g, bevel=0, segments=1)
    elif style == 'plant':
        tube(_n(g, 'stem'), [(0, y, -h * 0.4), (0.02, y, h * 0.3)], 0.006, 'plant_dark', g, res=4)
        for i in range(5):
            sphere(_n(g, 'leaf'), 0.5, ((-1) ** i * w * 0.14, y - 0.002, -h * 0.25 + i * h * 0.13), 'plant', g,
                   (0, (-1) ** i * 30, 0), scale=(w * 0.3, 0.004, h * 0.08), segs=10, rings=4)
    else:
        cyl(_n(g, 'circle'), w * 0.3, 0.003, (-w * 0.08, y, h * 0.12), c1, g, (90, 0, 0), verts=24, bevel=0)
        box(_n(g, 'block'), (w * 0.4, 0.003, h * 0.35), (w * 0.12, y - 0.002, -h * 0.18), c2, g, (0, 12, 0), bevel=0,
            segments=1)
        box(_n(g, 'bar'), (w * 0.7, 0.003, h * 0.04), (0, y - 0.003, -h * 0.4), c3, g, bevel=0, segments=1)
    if not frame:
        for sx in (-1, 1):
            for sz in (-1, 1):
                box(_n(g, 'tape'), (0.05, 0.002, 0.02), (sx * w / 2, y0 - 0.004, sz * h / 2), 'paper', g, (0, sx * sz * 40,
                                                                                                          0),
                    bevel=0, segments=1)
    return g


def framed_art(size=(0.6, 0.45), name='art', location=(0, 0, 1.5), rotation=0, style='abstract', frame='wood_dark',
               seed=1, parent='root'):
    """Framed print with a mat (poster with frame=...). Same placement rules as poster()."""
    return poster(size, name, location, rotation, style, seed, frame, parent)


def wall_clock(r=0.16, name='clock', location=(0, 0, 2.0), rotation=0, mat='plastic_white', rim='plastic_black',
               hour=10.1, parent='root'):
    """Round wall clock; location = centre of its back on the wall. Hands show `hour` (float)."""
    g = _g(name, location, rotation, False, parent=parent)
    cyl(_n(g, 'rim'), r, 0.04, (0, -0.02, 0), rim, g, (90, 0, 0), verts=28, bevel=0.01)
    cyl(_n(g, 'face'), r * 0.9, 0.01, (0, -0.037, 0), mat, g, (90, 0, 0), verts=28, bevel=0)
    for i in range(12):
        a = TAU * i / 12
        box(_n(g, 'tick'), (0.008, 0.004, 0.025 if i % 3 else 0.04), (math.sin(a) * r * 0.75, -0.043, math.cos(a) * r *
                                                                       0.75), 'plastic_black', g, (0, math.degrees(a),
                                                                                                   0), bevel=0,
            segments=1)
    ah = TAU * (hour % 12) / 12
    am = TAU * (hour % 1)
    box(_n(g, 'hh'), (0.012, 0.004, r * 0.5), (math.sin(ah) * r * 0.22, -0.047, math.cos(ah) * r * 0.22),
        'plastic_black', g, (0, math.degrees(ah), 0), bevel=0, segments=1)
    box(_n(g, 'mh'), (0.008, 0.004, r * 0.72), (math.sin(am) * r * 0.32, -0.05, math.cos(am) * r * 0.32),
        'plastic_black', g, (0, math.degrees(am), 0), bevel=0, segments=1)
    cyl(_n(g, 'pin'), 0.01, 0.01, (0, -0.052, 0), 'mcd_red', g, (90, 0, 0), verts=10, bevel=0)
    return g


def curtains(width=1.4, height=1.6, name='curtains', location=(0, 0, 2.2), rotation=0, mat='fabric_coral',
             parent='root', open_frac=0.7):
    """Rod + two pleated curtain panels; location = rod centre (on the wall face, rod 0.1 m proud). Parent to a
    wall with room.on_wall. open_frac = how pulled-apart they are (1 = fully open to the sides)."""
    from furniture import _curtain
    g = _g(name, location, rotation, False, parent=parent)
    tube(_n(g, 'rod'), [(-width / 2 - 0.1, -0.1, 0), (width / 2 + 0.1, -0.1, 0)], 0.012, 'metal_dark', g, res=8)
    pw = max(0.25, width / 2 * (1.05 - open_frac * 0.6))
    for sx in (-1, 1):
        sphere(_n(g, 'end'), 0.022, (sx * (width / 2 + 0.1), -0.1, 0), 'metal_dark', g, segs=8, rings=5)
        _curtain(g, (sx * (width / 2 - pw / 2 + 0.05), -0.12, -0.02), pw, height, mat)
    return g


def radiator(w=0.8, h=0.6, name='radiator', location=(0, 0, 0.12), rotation=0, mat='plastic_white', parent='root'):
    """Column radiator; location = bottom centre against the wall (parent it to the wall)."""
    g = _g(name, location, rotation, False, parent=parent)
    n = int(w / 0.06)
    for i in range(n):
        box(_n(g, 'fin'), (0.045, 0.09, h), (-w / 2 + 0.03 + i * w / n, -0.07, h / 2), mat, g, bevel=0.018, segments=2)
    for z in (0.05, h - 0.05):
        box(_n(g, 'hdr'), (w, 0.05, 0.04), (0, -0.07, z), mat, g, bevel=0.01)
    cyl(_n(g, 'valve'), 0.02, 0.06, (w / 2 + 0.03, -0.07, 0.05), 'metal', g, verts=10)
    return g


# ----------------------------------------------------------------------------------------------------------------
# structure + utility
# ----------------------------------------------------------------------------------------------------------------


def stairs(width=0.9, steps=6, rise=0.18, run=0.26, name='stairs', location=(0, 0, 0), rotation=0, mat='wood_light',
           stringer_mat='plastic_white', rail='left', landing=0.0, obstacle=True):
    """Straight stair flight rising toward local +Y from its origin (bottom front centre). rail 'left' | 'right' |
    'both' | None (handrail on posts). landing = depth of a top landing (m). Total rise = steps * rise."""
    g = _g(name, location, rotation, obstacle)
    for i in range(steps):
        z = (i + 1) * rise
        y = i * run + run / 2
        box(_n(g, 'tread'), (width, run + 0.03, 0.035), (0, y, z - 0.0175), mat, g, bevel=0.008)
        box(_n(g, 'riser'), (width - 0.02, 0.02, rise - 0.035), (0, y - run / 2 + 0.01, z - rise / 2 - 0.0175),
            stringer_mat, g, bevel=0.004, segments=1)
    L = steps * run
    Hh = steps * rise
    if landing > 0:
        box(_n(g, 'landing'), (width, landing, 0.04), (0, L + landing / 2, Hh - 0.02), mat, g, bevel=0.008)
        box(_n(g, 'landbase'), (width, landing, Hh - 0.04), (0, L + landing / 2, (Hh - 0.04) / 2), stringer_mat, g,
            bevel=0.006)
    for sx in (-1, 1):
        prism(_n(g, 'stringer'), [(0, 0), (L, Hh), (L + landing, Hh), (L + landing, Hh - 0.2), (0.25, -0.0)], 0.04,
              (sx * (width / 2 + 0.02) - 0.02, 0, 0), stringer_mat, g, (90, 0, 90), bevel=0.006)
    sides = {'left': (-1,), 'right': (1,), 'both': (-1, 1)}.get(rail, ())
    for sx in sides:
        x = sx * (width / 2 - 0.03)
        pts = []
        for i in range(0, steps + 1, 2):
            y = min(i, steps - 1) * run + run / 2
            z = (min(i, steps - 1) + 1) * rise
            tube(_n(g, 'baluster'), [(x, y, z), (x, y, z + 0.85)], 0.012, stringer_mat, g, res=6)
        tube(_n(g, 'handrail'), [(x, run / 2, rise + 0.9), (x, L - run / 2, Hh + 0.9)] +
             ([(x, L + landing, Hh + 0.9)] if landing > 0 else []), 0.025, mat, g, res=8)
    return g


def washing_machine(name='washer', location=(0, 0, 0), rotation=0, mat='plastic_white', clutter=True, obstacle=True):
    """Front-loading washing machine (0.6 x 0.6 x 0.85), porthole door on local -Y."""
    g = _g(name, location, rotation, obstacle)
    W, D, H = 0.6, 0.6, 0.85
    box(_n(g, 'body'), (W, D, H), (0, 0, H / 2), mat, g, bevel=0.025, segments=3)
    box(_n(g, 'panel'), (W - 0.03, 0.01, 0.12), (0, -D / 2 - 0.002, H - 0.08), 'plastic_grey', g, bevel=0.005)
    cyl(_n(g, 'dial'), 0.035, 0.02, (W / 2 - 0.1, -D / 2 - 0.01, H - 0.08), 'plastic_white', g, (90, 0, 0), verts=14,
        bevel=0.005)
    box(_n(g, 'drawer'), (0.18, 0.01, 0.07), (-W / 2 + 0.13, -D / 2 - 0.006, H - 0.08), 'plastic_white', g, bevel=0.004)
    box(_n(g, 'display'), (0.1, 0.004, 0.035), (0.02, -D / 2 - 0.008, H - 0.08), 'neon_cyan', g, bevel=0)
    torus(_n(g, 'door'), 0.19, 0.035, (0, -D / 2 - 0.015, 0.4), 'plastic_grey', g, (90, 0, 0), major=24, minor=8)
    cyl(_n(g, 'glass'), 0.16, 0.02, (0, -D / 2 - 0.01, 0.4), 'window_glass', g, (90, 0, 0), verts=24, bevel=0)
    cyl(_n(g, 'drum'), 0.16, 0.01, (0, -D / 2 + 0.02, 0.4), 'metal', g, (90, 0, 0), verts=24, bevel=0)
    blob(_n(g, 'clothes'), (0.22, 0.05, 0.12), (0.0, -D / 2 + 0.01, 0.33), 'fabric_blue', g, round_xy=0.7, round_z=0.7,
         segs=10, rings=6)
    if clutter:
        lathe(_n(g, 'detergent'), [(0.06, 0), (0.065, 0.02), (0.065, 0.2), (0.04, 0.24), (0.02, 0.25), (0.02, 0.28)],
              (0.12, 0.05, H), 'fabric_coral', g, verts=12, cap_top=True)
        box(_n(g, 'towels'), (0.3, 0.22, 0.08), (-0.1, 0.02, H + 0.04), 'fabric_teal', g, 6, bevel=0.03)
    return g


def laundry_basket(name='laundry', location=(0, 0, 0), rotation=0, mat='plastic_white', overflow=True, seed=1,
                   obstacle=True):
    """Woven-look laundry basket with clothes spilling over the rim."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle)
    lathe(_n(g, 'basket'), [(0.18, 0), (0.2, 0.02), (0.24, 0.42), (0.225, 0.42), (0.18, 0.02)], (0, 0, 0), mat, g,
          verts=20)
    for z in (0.12, 0.24, 0.36):
        torus(_n(g, 'weave'), 0.2 + z * 0.1, 0.006, (0, 0, z), 'plastic_grey', g, major=20, minor=4)
    for sx in (-1, 1):
        box(_n(g, 'handle'), (0.02, 0.1, 0.03), (sx * 0.24, 0, 0.38), 'plastic_grey', g, bevel=0.01)
    if overflow:
        cols = ['fabric_blue', 'fabric_coral', 'fabric_cream', 'fabric_mustard', 'fabric_grey', 'fabric_navy']
        for i in range(6):
            a = rng.uniform(0, TAU)
            blob(_n(g, 'cloth'), (rng.uniform(0.2, 0.32), rng.uniform(0.14, 0.24), 0.08),
                 (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.38 + i * 0.025), cols[i % len(cols)], g,
                 (rng.uniform(-20, 20), rng.uniform(-20, 20), rng.uniform(0, 180)), round_xy=0.6, round_z=0.7, segs=12,
                 rings=6)
        blob(_n(g, 'sleeve'), (0.08, 0.3, 0.05), (0.22, -0.12, 0.25), 'fabric_coral', g, (70, 0, -30), round_xy=0.7,
             round_z=0.7, segs=10, rings=6)
        blob(_n(g, 'sock'), (0.07, 0.14, 0.04), (-0.3, -0.15, 0.02), 'paper', g, (0, 0, 40), round_xy=0.7,
             round_z=0.7, segs=10, rings=6)
    return g


def moving_boxes(n=5, name='boxes', location=(0, 0, 0), rotation=0, seed=1, open_top=True, obstacle=True):
    """A believable stack/cluster of `n` kraft moving boxes (tape, labels, one open with flaps)."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle)
    placed = []
    x = 0.0
    stack_h = {}
    for i in range(n):
        w, d, h = rng.choice([(0.5, 0.4, 0.4), (0.45, 0.35, 0.3), (0.6, 0.45, 0.45), (0.4, 0.3, 0.3)])
        col = i % 3
        z = stack_h.get(col, 0.0)
        cx = (col - 1) * 0.55 + rng.uniform(-0.04, 0.04)
        cy = rng.uniform(-0.05, 0.05) + (0.05 if col == 1 else 0)
        if z > 0.9:
            continue
        rz = rng.uniform(-10, 10)
        b = box(_n(g, 'box'), (w, d, h), (cx, cy, z + h / 2), 'kraft', g, rz, bevel=0.01, segments=2)
        box(_n(g, 'tape'), (0.06, d + 0.004, 0.004), (cx, cy, z + h + 0.001), 'carpet_beige', g, rz, bevel=0,
            segments=1)
        if rng.random() < 0.5:
            box(_n(g, 'label'), (0.12, 0.004, 0.08), (cx + 0.08, cy - d / 2 - 0.002, z + h * 0.6), 'paper', g, rz,
                bevel=0, segments=1)
        stack_h[col] = z + h
        top_box = (cx, cy, z + h, w, d, rz)
    if open_top:
        cx, cy, z, w, d, rz = top_box
        for sy in (-1, 1):
            box(_n(g, 'flap'), (w, 0.012, d * 0.5), (cx, cy + sy * (d / 2 + d * 0.2), z + d * 0.18), 'kraft', g,
                (sy * -60, 0, rz), bevel=0.003, segments=1)
    return g


def string_lights(a, b, n=12, sag=0.18, name='string_lights', parent='root', mat='lampshade', wire='plastic_black'):
    """Fairy lights hanging between world points a and b (sagging `sag` m) with n glowing bulbs. Built in world
    coords; parent the returned group to a wall with room.on_wall."""
    g = _g(name, (0, 0, 0), 0, False, parent=parent)
    pts = catenary(a, b, sag, 24)
    tube(_n(g, 'wire'), pts, 0.003, wire, g, res=4, caps=False)
    for i in range(n):
        t = (i + 0.5) / n
        p = catenary(a, b, sag, 1000)[int(t * 1000)]
        sphere(_n(g, 'bulb'), 0.022, (p[0], p[1], p[2] - 0.03), mat, g, scale=(1, 1, 1.3), segs=8, rings=5)
    return g


NEON_SHAPES = ('squiggle', 'bolt', 'heart', 'wave', 'star')


def neon_sign(style='squiggle', name='neon', location=(0, 0, 1.8), rotation=0, colors=('neon_pink', 'neon_cyan'),
              size=1.0, backing=True, parent='root'):
    """Abstract neon sign made of glowing tubes (no letters) on a clear acrylic backing; location = centre of its
    back on the wall. style squiggle | bolt | heart | wave | star. Parent with room.on_wall."""
    g = _g(name, location, rotation, False, parent=parent)
    s = size
    y = -0.05
    c1 = colors[0]
    c2 = colors[1] if len(colors) > 1 else colors[0]
    if backing:
        box(_n(g, 'backing'), (0.95 * s, 0.012, 0.5 * s), (0, -0.01, 0), 'window_glass', g, bevel=0.01)
        for sx in (-1, 1):
            for sz in (-1, 1):
                cyl(_n(g, 'standoff'), 0.012, 0.03, (sx * 0.42 * s, -0.02, sz * 0.2 * s), 'metal', g, (90, 0, 0),
                    verts=8, bevel=0)
    if style == 'squiggle':
        pts = [(-0.4 * s + i * 0.8 * s / 30, y, 0.1 * s * math.sin(i * 0.7) + 0.04 * s) for i in range(31)]
        tube(_n(g, 'tube'), pts, 0.013 * s, c1, g, res=6)
        pts = [(-0.3 * s + i * 0.6 * s / 20, y - 0.01, -0.13 * s + 0.03 * s * math.sin(i * 1.3)) for i in range(21)]
        tube(_n(g, 'tube'), pts, 0.011 * s, c2, g, res=6)
        sphere(_n(g, 'dot'), 0.025 * s, (0.36 * s, y, -0.14 * s), c2, g, segs=10, rings=6)
    elif style == 'bolt':
        pts = [(0.05, 0.22), (-0.12, -0.01), (0.02, -0.01), (-0.06, -0.22), (0.14, 0.04), (0.0, 0.04), (0.08, 0.22),
               (0.05, 0.22)]
        tube(_n(g, 'tube'), [(p[0] * s, y, p[1] * s) for p in pts], 0.012 * s, c1, g, res=6)
        tube(_n(g, 'ring'), [(0.3 * s * math.cos(t / 20 * TAU), y - 0.01, 0.2 * s * math.sin(t / 20 * TAU))
                             for t in range(21)], 0.009 * s, c2, g, res=6)
    elif style == 'heart':
        pts = []
        for i in range(41):
            t = i / 40 * TAU
            pts.append((0.16 * s * math.sin(t) ** 3, y, 0.013 * s * (13 * math.cos(t) - 5 * math.cos(2 * t) -
                                                                      2 * math.cos(3 * t) - math.cos(4 * t))))
        tube(_n(g, 'tube'), pts, 0.013 * s, c1, g, res=6)
        tube(_n(g, 'under'), [(-0.3 * s, y, -0.2 * s), (0.3 * s, y, -0.2 * s)], 0.009 * s, c2, g, res=6)
    elif style == 'star':
        pts = []
        for i in range(11):
            r = (0.2 if i % 2 == 0 else 0.09) * s
            a = math.pi / 2 + i * TAU / 10
            pts.append((r * math.cos(a), y, r * math.sin(a)))
        tube(_n(g, 'tube'), pts, 0.012 * s, c1, g, res=6)
        for k in range(3):
            tube(_n(g, 'spark'), [(0.28 * s + k * 0.04 * s, y, 0.1 * s - k * 0.1 * s), (0.34 * s + k * 0.04 * s, y,
                                                                                        0.1 * s - k * 0.1 * s)],
                 0.008 * s, c2, g, res=5)
    else:
        for k, c in enumerate((c1, c2)):
            pts = [(-0.4 * s + i * 0.8 * s / 24, y - 0.01 * k, 0.07 * s * math.sin(i * 0.55 + k * 1.5) + (0.08 - 0.16 * k)
                    * s) for i in range(25)]
            tube(_n(g, 'tube'), pts, 0.012 * s, c, g, res=6)
    return g


# ----------------------------------------------------------------------------------------------------------------
# creator gear + office
# ----------------------------------------------------------------------------------------------------------------


def _tripod(g, h, spread=0.3, mat='plastic_black', head=True):
    for i in range(3):
        a = TAU * i / 3 + math.pi / 2
        tube(_n(g, 'leg'), [(math.cos(a) * spread, math.sin(a) * spread, 0), (0, 0, h * 0.45)], 0.011, mat, g, res=6)
        sphere(_n(g, 'foot'), 0.015, (math.cos(a) * spread, math.sin(a) * spread, 0.01), 'plastic_black', g, segs=6,
               rings=4)
    cyl(_n(g, 'hub'), 0.03, 0.06, (0, 0, h * 0.45), mat, g, verts=10)
    cyl(_n(g, 'pole'), 0.012, h * 0.55, (0, 0, h * 0.45 + h * 0.275), 'metal', g, verts=8, bevel=0)


def ring_light(name='ring_light', location=(0, 0, 0), rotation=0, h=1.6, obstacle=True, phone=True, parent='root'):
    """Ring light on a tripod stand, facing local -Y (toward whoever is filmed), with a phone clamped in the
    middle. Origin at the floor."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    g['gear'] = 'ring_light'  # baked gear: setGear skips a duplicate (docs/3D.md section 7)
    _tripod(g, h)
    torus(_n(g, 'ring'), 0.2, 0.028, (0, 0, h + 0.2), 'plastic_white', g, (90, 0, 0), major=28, minor=8)
    torus(_n(g, 'glow'), 0.2, 0.02, (0, -0.012, h + 0.2), 'lampshade', g, (90, 0, 0), major=28, minor=6)
    tube(_n(g, 'yoke'), [(0, 0, h), (0, 0, h + 0.2)], 0.008, 'plastic_black', g, res=6)
    if phone:
        box(_n(g, 'phone'), (0.075, 0.009, 0.155), (0, -0.01, h + 0.2), 'plastic_black', g, bevel=0.008)
        panel(_n(g, 'phonescreen'), (0.065, 0.14), (0, -0.015, h + 0.2), 'screen', g)
    return g


def camera_tripod(name='camera', location=(0, 0, 0), rotation=0, h=1.45, obstacle=True, parent='root'):
    """Mirrorless camera with a lens on a tripod, lens pointing local -Y. Origin at the floor."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    g['gear'] = 'mirrorless_camera'  # baked gear: setGear skips a duplicate (docs/3D.md section 7)
    _tripod(g, h - 0.08, 0.32, 'metal_dark')
    box(_n(g, 'plate'), (0.07, 0.07, 0.02), (0, 0, h - 0.07), 'plastic_black', g, bevel=0.005)
    box(_n(g, 'body'), (0.13, 0.07, 0.09), (0, 0.01, h), 'plastic_black', g, bevel=0.012)
    box(_n(g, 'grip'), (0.035, 0.08, 0.085), (-0.055, -0.005, h), 'metal_dark', g, bevel=0.012)
    box(_n(g, 'hump'), (0.05, 0.05, 0.035), (0.01, 0.02, h + 0.055), 'plastic_black', g, bevel=0.01)
    cyl(_n(g, 'lens'), 0.035, 0.08, (0.015, -0.06, h), 'plastic_black', g, (90, 0, 0), verts=16, bevel=0.006)
    torus(_n(g, 'lensring'), 0.036, 0.005, (0.015, -0.08, h), 'metal', g, (90, 0, 0), major=16, minor=4)
    cyl(_n(g, 'glass'), 0.028, 0.004, (0.015, -0.1, h), 'window_glass', g, (90, 0, 0), verts=16, bevel=0)
    box(_n(g, 'rec'), (0.008, 0.004, 0.008), (0.05, -0.026, h + 0.03), 'neon_red', g, bevel=0)
    return g


def softbox(name='softbox', location=(0, 0, 0), rotation=0, h=1.7, obstacle=True, parent='root'):
    """Photo softbox on a stand, facing local -Y (diffuser uses m_lampshade). Origin at the floor."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    g['gear'] = 'softbox_kit'  # baked gear: setGear skips a duplicate (docs/3D.md section 7)
    _tripod(g, h - 0.1, 0.33, 'metal_dark')
    # square frustum opening toward -Y (big end) with the white diffuser on it
    cyl(_n(g, 'box'), 0.32, 0.36, (0, 0.04, h + 0.1), 'plastic_black', g, (-90, 45, 0), verts=4, r2=0.08, bevel=0.01)
    box(_n(g, 'diffuser'), (0.44, 0.012, 0.44), (0, -0.142, h + 0.1), 'lampshade', g, bevel=0.01)
    tube(_n(g, 'yoke'), [(0, 0, h), (0, 0.1, h + 0.1)], 0.01, 'metal_dark', g, res=6)
    return g


def whiteboard(w=1.2, h=0.9, name='whiteboard', location=(0, 0, 0), rotation=0, stand=True, obstacle=True, seed=1,
               parent='root'):
    """Whiteboard with doodles (arrows, a chart, sticky notes), facing local -Y. stand=True: rolling A-frame stand
    (origin at the floor); stand=False: wall board whose location is the centre of its back (parent to a wall)."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle and stand, parent=parent)
    zc = 1.35 if stand else 0.0
    if stand:
        for sx in (-1, 1):
            tube(_n(g, 'post'), [(sx * (w / 2 + 0.03), 0, 0.1), (sx * (w / 2 + 0.03), 0, zc + h / 2)], 0.018, 'metal',
                 g, res=8)
            box(_n(g, 'foot'), (0.05, 0.6, 0.03), (sx * (w / 2 + 0.03), 0, 0.07), 'metal', g, bevel=0.008)
            for sy in (-1, 1):
                sphere(_n(g, 'caster'), 0.03, (sx * (w / 2 + 0.03), sy * 0.26, 0.03), 'plastic_black', g, segs=8,
                       rings=5)
    box(_n(g, 'frame'), (w + 0.04, 0.03, h + 0.04), (0, 0, zc), 'metal', g, bevel=0.008)
    box(_n(g, 'board'), (w, 0.01, h), (0, -0.015, zc), 'plastic_white', g, bevel=0, segments=1)
    y = -0.022
    # bar chart doodle
    for i in range(4):
        bh = 0.08 + i * 0.05 + rng.uniform(0, 0.03)
        box(_n(g, 'bar'), (0.06, 0.004, bh), (-w * 0.32 + i * 0.09, y, zc - h * 0.3 + bh / 2), 'fabric_blue', g,
            bevel=0, segments=1)
    tube(_n(g, 'arrow'), [(-w * 0.4, y, zc - h * 0.05), (-w * 0.2, y, zc + 0.02), (-w * 0.05, y, zc + h * 0.1)], 0.006,
         'mcd_red', g, res=4)
    tube(_n(g, 'scribble'), [(w * 0.05 + i * 0.03, y, zc + h * 0.3 + 0.02 * math.sin(i * 2)) for i in range(10)],
         0.004, 'plastic_black', g, res=4)
    tube(_n(g, 'scribble'), [(w * 0.05 + i * 0.03, y, zc + h * 0.2 + 0.02 * math.sin(i * 2.5)) for i in range(8)],
         0.004, 'plastic_black', g, res=4)
    for i in range(3):
        box(_n(g, 'sticky'), (0.08, 0.004, 0.08), (w * 0.25 + i * 0.1, y, zc - h * 0.2 + (i % 2) * 0.1),
            ['fabric_mustard', 'rug_rose', 'rug_green'][i], g, (0, rng.uniform(-8, 8), 0), bevel=0, segments=1)
    box(_n(g, 'tray'), (w * 0.5, 0.06, 0.02), (0, -0.04, zc - h / 2 - 0.01), 'metal', g, bevel=0.005)
    for i, c in enumerate(('mcd_red', 'fabric_blue', 'plastic_black')):
        cyl(_n(g, 'marker'), 0.009, 0.12, (-0.1 + i * 0.13, -0.045, zc - h / 2 + 0.01), c, g, (0, 90, 0), verts=8,
            bevel=0)
    return g


def water_cooler(name='water_cooler', location=(0, 0, 0), rotation=0, obstacle=True):
    """Office water cooler with a translucent blue bottle, taps and a cup stack."""
    g = _g(name, location, rotation, obstacle)
    box(_n(g, 'body'), (0.32, 0.32, 0.95), (0, 0, 0.475), 'plastic_white', g, bevel=0.02)
    box(_n(g, 'recess'), (0.2, 0.02, 0.2), (0, -0.16, 0.7), 'plastic_grey', g, bevel=0.01)
    for sx, c in ((-1, 'fabric_blue'), (1, 'mcd_red')):
        box(_n(g, 'tap'), (0.035, 0.04, 0.03), (sx * 0.05, -0.18, 0.78), c, g, bevel=0.006)
    box(_n(g, 'drip'), (0.18, 0.08, 0.02), (0, -0.19, 0.62), 'plastic_grey', g, bevel=0.006)
    lathe(_n(g, 'bottle'), [(0.03, 0.95), (0.03, 0.99), (0.13, 1.03), (0.14, 1.1), (0.14, 1.3), (0.12, 1.35),
                            (0.0, 1.36)], (0, 0, 0), 'window_glass', g, verts=18)
    lathe(_n(g, 'water'), [(0.02, 0.97), (0.12, 1.03), (0.125, 1.25), (0.0, 1.25)], (0, 0, 0), 'wall_sky', g, verts=16)
    cyl(_n(g, 'cups'), 0.035, 0.25, (0.2, 0.0, 0.8), 'plastic_white', g, verts=10)
    return g


def coffee_machine(name='coffee_machine', location=(0, 0, 0), rotation=0, mat='metal', parent='root'):
    """Espresso machine for a counter: boiler body, group head, portafilter, drip tray, two cups on top."""
    g = _g(name, location, rotation, False, parent=parent)
    box(_n(g, 'body'), (0.34, 0.36, 0.36), (0, 0, 0.18), mat, g, bevel=0.03, segments=3)
    box(_n(g, 'tray'), (0.28, 0.12, 0.02), (0, -0.2, 0.02), 'metal_dark', g, bevel=0.005)
    cyl(_n(g, 'group'), 0.04, 0.04, (0, -0.2, 0.25), 'metal_dark', g, verts=12)
    tube(_n(g, 'portafilter'), [(0, -0.2, 0.225), (0.0, -0.33, 0.215)], 0.012, 'plastic_black', g, res=6)
    cyl(_n(g, 'gauge'), 0.03, 0.01, (0.1, -0.182, 0.3), 'paper', g, (90, 0, 0), verts=14, bevel=0)
    for sx in (-1, 1):
        cyl(_n(g, 'cup'), 0.03, 0.05, (sx * 0.08, 0.05, 0.385), 'plastic_white', g, verts=12)
    mug(g, (0, -0.2, 0.03), 'plastic_white', 0.03, 0.06)
    return g


def trash_bin(style='pedal', name='trash', location=(0, 0, 0), rotation=0, mat=None, obstacle=False, parent='root'):
    """Trash can: pedal (kitchen step bin) | office (mesh basket with paper balls) | big (wheelie-ish bin with lid)."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    if style == 'office':
        lathe(_n(g, 'bin'), [(0.1, 0), (0.12, 0.3), (0.115, 0.3), (0.095, 0.01)], (0, 0, 0), mat or 'plastic_black', g,
              verts=16)
        for i in range(3):
            sphere(_n(g, 'paperball'), 0.035, (0.03 * (i - 1), 0.02 * (i % 2), 0.28 + 0.02 * i), 'paper', g,
                   segs=8, rings=5)
    elif style == 'big':
        box(_n(g, 'bin'), (0.5, 0.55, 0.95), (0, 0, 0.475), mat or 'fabric_teal', g, bevel=0.03)
        box(_n(g, 'lid'), (0.54, 0.6, 0.05), (0, 0.0, 0.97), mat or 'fabric_teal', g, bevel=0.02)
        for sx in (-1, 1):
            cyl(_n(g, 'wheel'), 0.08, 0.05, (sx * 0.22, 0.25, 0.08), 'plastic_black', g, (0, 90, 0), verts=14)
    else:
        lathe(_n(g, 'bin'), [(0.14, 0), (0.15, 0.02), (0.15, 0.42), (0.14, 0.44)], (0, 0, 0), mat or 'metal', g,
              verts=18)
        lathe(_n(g, 'lid'), [(0.155, 0.44), (0.14, 0.47), (0.08, 0.49), (0.0, 0.49)], (0, 0, 0), mat or 'metal', g,
              verts=18)
        box(_n(g, 'pedal'), (0.1, 0.06, 0.02), (0, -0.16, 0.03), 'plastic_black', g, bevel=0.006)
    return g


def office_divider(w=1.4, h=1.2, name='divider', location=(0, 0, 0), rotation=0, mat='fabric_grey', obstacle=True):
    """Fabric desk divider / low partition screen on feet (≤1.2 m so people stay visible)."""
    g = _g(name, location, rotation, obstacle)
    box(_n(g, 'panel'), (w, 0.05, h - 0.06), (0, 0, 0.06 + (h - 0.06) / 2), mat, g, bevel=0.02)
    box(_n(g, 'cap'), (w + 0.01, 0.06, 0.025), (0, 0, h), 'metal', g, bevel=0.008)
    for sx in (-1, 1):
        box(_n(g, 'foot'), (0.06, 0.4, 0.04), (sx * (w / 2 - 0.1), 0, 0.02), 'metal', g, bevel=0.01)
    return g


def partition(length=3.0, h=1.1, name='partition', location=(0, 0, 0), rotation=0, mat='wall_cream', cap='wood_light',
              t=0.12, obstacle=True):
    """Half-height interior wall (≤1.2 m) along local X with a wooden cap — tier4 zones."""
    g = _g(name, location, rotation, obstacle)
    box(_n(g, 'wall'), (length, t, h), (0, 0, h / 2), mat, g, bevel=0.01)
    box(_n(g, 'cap'), (length + 0.02, t + 0.03, 0.035), (0, 0, h + 0.0175), cap, g, bevel=0.008)
    for sy in (-1, 1):
        box(_n(g, 'base'), (length, 0.015, 0.08), (0, sy * (t / 2 + 0.0075), 0.04), 'plastic_white', g, bevel=0.004,
            segments=1)
    return g


def packing_table(w=1.6, d=0.8, name='packing_table', location=(0, 0, 0), rotation=0, interact=None, seed=1,
                  obstacle=True):
    """Garage packing station (top 0.9): tape gun, flattened boxes, bubble wrap roll, label printer, scale."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle, interact)
    H = 0.9
    box(_n(g, 'top'), (w, d, 0.04), (0, 0, H - 0.02), 'wood_light', g, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(_n(g, 'leg'), (0.05, 0.05, H - 0.04), (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), (H - 0.04) / 2),
                'metal_dark', g, bevel=0.006)
    box(_n(g, 'shelf'), (w - 0.1, d - 0.1, 0.03), (0, 0, 0.15), 'wood_light', g, bevel=0.006)
    for i in range(4):
        box(_n(g, 'flat'), (0.7, 0.5, 0.01), (-0.2 + rng.uniform(-0.03, 0.03), 0, 0.17 + i * 0.012), 'kraft', g,
            rng.uniform(-5, 5), bevel=0.002, segments=1)
    cyl(_n(g, 'bubble'), 0.14, d - 0.15, (w / 2 - 0.25, 0, 0.32), 'window_glass', g, (90, 0, 0), verts=16, bevel=0.02)
    box(_n(g, 'box'), (0.4, 0.3, 0.3), (-0.25, 0.05, H + 0.15), 'kraft', g, 8, bevel=0.01)
    for sy in (-1, 1):
        box(_n(g, 'flap'), (0.4, 0.01, 0.15), (-0.25 + sy * 0.0, 0.05 + sy * 0.19, H + 0.34), 'kraft', g,
            (sy * -55, 0, 8), bevel=0.003, segments=1)
    tube(_n(g, 'tapegun'), [(0.25, -0.1, H + 0.02), (0.25, -0.1, H + 0.12), (0.35, -0.1, H + 0.16)], 0.018, 'mcd_red',
         g, res=6)
    torus(_n(g, 'taperoll'), 0.045, 0.02, (0.25, -0.15, H + 0.12), 'carpet_beige', g, (90, 0, 0), major=14, minor=6)
    box(_n(g, 'printer'), (0.16, 0.2, 0.12), (w / 2 - 0.2, 0.2, H + 0.06), 'plastic_white', g, bevel=0.015)
    box(_n(g, 'labels'), (0.09, 0.004, 0.14), (w / 2 - 0.2, 0.09, H + 0.13), 'paper', g, (-30, 0, 0), bevel=0,
        segments=1)
    box(_n(g, 'scale'), (0.28, 0.28, 0.04), (w / 2 - 0.25, -0.18, H + 0.02), 'metal', g, bevel=0.01)
    return g


def roll_up_door(w=2.6, h=2.3, wall_t=0.15, name='roll_up_door', location=(0, 0, 0), rotation=0, mat='plastic_white',
                 open_frac=0.0, parent='root'):
    """Garage roll-up door filling an opening (location = bottom centre on the wall centre line, rotation =
    B.against(wall)). Horizontal slats + coil box; open_frac raises it. Parent it to its wall (decor)."""
    g = _g(name, location, rotation, False, parent=parent)
    hh = h * (1 - open_frac)
    n = max(1, int(hh / 0.2))
    for i in range(n):
        box(_n(g, 'slat'), (w - 0.02, 0.04, hh / n - 0.006), (0, 0.0, h - hh + (i + 0.5) * hh / n), mat, g, bevel=0.012)
    box(_n(g, 'coil'), (w + 0.1, 0.25, 0.25), (0, -wall_t / 2 - 0.13, h + 0.14), 'metal_dark', g, bevel=0.02)
    tube(_n(g, 'handle'), [(-0.15, -0.03, h - hh + 0.12), (0.15, -0.03, h - hh + 0.12)], 0.012, 'metal', g, res=6)
    for sx in (-1, 1):
        box(_n(g, 'track'), (0.05, 0.08, h), (sx * (w / 2 - 0.02), -0.05, h / 2), 'metal', g, bevel=0.006)
    return g


def mirror(w=0.5, h=1.5, name='mirror', location=(0, 0, 0), rotation=0, frame='wood_light', lean=True, parent='root'):
    """Full-length mirror; lean=True leans against a wall at the floor (origin at the floor, back at +Y)."""
    g = _g(name, location, rotation, False, parent=parent)
    tilt = 8 if lean else 0
    zc = h / 2 + 0.02
    box(_n(g, 'frame'), (w + 0.06, 0.03, h + 0.06), (0, 0.05 if lean else 0, zc), frame, g, (-tilt, 0, 0), bevel=0.012)
    box(_n(g, 'glass'), (w, 0.01, h), (0, 0.03 if lean else -0.02, zc), 'window_sky', g, (-tilt, 0, 0), bevel=0,
        segments=1)
    return g
