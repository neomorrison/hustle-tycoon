"""Room-specific helpers for tier5 (penthouse HQ): the low-poly night skyline and a few luxe props.
Owned by the tier4/tier5 room builder, not the shared lib."""
import math
import random

import build as B
import furniture as F
from build import box, cyl, sphere, blob, tube, torus, panel, lathe


def _n(g, part):
    return f'{g.name}_{part}'


BODY_MATS = ('fabric_navy', 'tile_check_dark', 'plastic_black', 'fabric_navy', 'tile_check_dark')


def _building(g, rng, cx, cy, w, d, top, bottom, face, lit=0.45, step=None, floor_h=2.1, win_depth=30.0,
              crown_max=None, body=None, neon=0.07):
    """One tower: a body box (+ an optional set-back crown with a spire and a red beacon) and night-lit window
    bands on the face(s) that look toward the room: per floor, a few lit strips of random length.
    face: list of '+x' / '-x' / '+y' / '-y'."""
    mat = body or rng.choice(BODY_MATS)
    h = top - bottom
    box(_n(g, 'b'), (w, d, h), (cx, cy, bottom + h / 2), mat, g, bevel=0.0, segments=1)
    tops = [(w, d, top)]
    if step:
        sw, sd, sh = w * step, d * step, rng.uniform(2.0, 5.0)
        if crown_max is not None:
            sh = min(sh, crown_max)
        box(_n(g, 'crown'), (sw, sd, sh), (cx, cy, top + sh / 2), mat, g, bevel=0.0, segments=1)
        tops.append((sw, sd, top + sh))
        if rng.random() < 0.7 and crown_max is None:
            sp = rng.uniform(3, 6)
            tube(_n(g, 'spire'), [(cx, cy, top + sh), (cx, cy, top + sh + sp)], 0.12, 'metal', g, res=5)
            sphere(_n(g, 'beacon'), 0.35, (cx, cy, top + sh + sp + 0.2), 'neon_red', g, segs=8, rings=5)
    for (tw, td, tz) in tops:
        box(_n(g, 'rim'), (tw + 0.3, td + 0.3, 0.35), (cx, cy, tz + 0.1), 'plastic_black', g, bevel=0.0, segments=1)
    for f in face:
        horiz = w if f in ('+y', '-y') else d
        z = top - 1.6
        zmin = max(bottom + 2.0, top - win_depth)
        while z > zmin:
            u = -horiz / 2 + 0.5
            while u < horiz / 2 - 0.8:
                ln = rng.uniform(0.5, 1.4)
                ln = min(ln, horiz / 2 - 0.5 - u)
                if ln > 0.5 and rng.random() < lit:
                    m = 'lampshade' if rng.random() >= neon else rng.choice(('neon_cyan', 'neon_yellow'))
                    c = u + ln / 2
                    hh = 0.7
                    if f == '-y':
                        panel(_n(g, 'w'), (ln, hh), (cx + c, cy - d / 2 - 0.03, z), m, g)
                    elif f == '+y':
                        panel(_n(g, 'w'), (ln, hh), (cx - c, cy + d / 2 + 0.03, z), m, g, (0, 0, 180))
                    elif f == '+x':
                        panel(_n(g, 'w'), (ln, hh), (cx + w / 2 + 0.03, cy + c, z), m, g, (0, 0, 90))
                    else:
                        panel(_n(g, 'w'), (ln, hh), (cx - w / 2 - 0.03, cy - c, z), m, g, (0, 0, -90))
                u += ln + rng.uniform(0.2, 0.5)
            z -= floor_h


def skyline(W, D, H=3.4, name='outside', seed=11, root=None):
    """Low-poly night city in group `outside` {outside:true}, seen from the penthouse on the top floor: a dark city
    floor 34 m below the room with glowing street grids, and blocks of towers standing on it whose roofs all stay
    far below the room's floor (z <= -7 m, beacons included). From any yaw or zoom the camera looks DOWN at the
    city around the floating diorama (through the north / west glass and in the frame around the room), so no tower
    ever stands between the camera and the room, looms beside it, or reaches the near plane. Towers sit in eight
    45-degree sectors, each its own group `outside_s<k>` {keep:true, sector:<Blender degrees>}; the runtime sinks
    the sectors on the camera's side (defensive: they are below the frame anyway). Lit window bands use m_lampshade
    (glowing at night); a neon billboard (shopping-bag pictogram, no letters) stands on a roof north-west of the room."""
    import room as R
    rng = random.Random(seed)
    root = root or R.ROOM['root']
    g = B.group(name, (0, 0, 0), outside=True)
    X, Y = W / 2, D / 2
    GROUND = -34.0                   # the street level far below
    CEIL = -7.0                      # highest point any tower may reach (m, relative to the room floor)
    BLOCK = 20.0                     # street grid spacing (streets at odd multiples of BLOCK / 2)
    REACH = 100.0                    # how far the city extends
    sectors = {}

    def sector_of(cx, cy):
        k = int(((math.degrees(math.atan2(cy, cx)) + 22.5) % 360) // 45)
        if k not in sectors:
            sectors[k] = B.group(f'{name}_s{k}', (0, 0, 0), parent=g, keep=True, sector=k * 45)
        return sectors[k]

    # the city floor (m_window_sky: the runtime tints it with the sky, so it reads as haze far below by day and
    # melts into the night backdrop after dark) and its street lights (always visible; not a sector)
    cyl(_n(g, 'ground'), 260.0, 0.4, (0, 0, GROUND - 0.2), 'window_sky', g, verts=48, bevel=0.0, segments=1)
    n = int(REACH // BLOCK) + 1
    for k in range(-n, n):
        c = (k + 0.5) * BLOCK
        span = 2 * math.sqrt(max(0.0, (REACH + 20) ** 2 - c * c))
        if span < 4:
            continue
        box(_n(g, 'street_x'), (span, 0.25, 0.05), (0, c, GROUND + 0.03), 'lampshade', g, bevel=0.0, segments=1)
        box(_n(g, 'street_y'), (0.25, span, 0.05), (c, 0, GROUND + 0.03), 'lampshade', g, bevel=0.0, segments=1)

    def faces(cx, cy):
        # the sides that look back toward the room (the only ones a camera around the room can see lit)
        return [('+x' if cx < 0 else '-x'), ('+y' if cy < 0 else '-y')]

    # billboard roof north-west of the room (seen through the glass walls from the default view)
    bx, by, bw = -BLOCK, BLOCK, 6.0
    btop = -16.0
    sg = sector_of(bx, by)
    box(_n(sg, 'bbroof'), (bw, bw, btop - GROUND), (bx, by, (btop + GROUND) / 2), 'plastic_black', sg, bevel=0.0,
        segments=1)
    box(_n(sg, 'bbrim'), (bw + 0.3, bw + 0.3, 0.35), (bx, by, btop + 0.1), 'fabric_blue', sg, bevel=0.0, segments=1)
    bb = B.group(name + '_billboard', (bx, by, btop), -45, parent=sg)
    box(_n(bb, 'frame'), (4.6, 0.25, 2.4), (0, 0, 2.2), 'plastic_black', bb, bevel=0.0, segments=1)
    for k in (-1.5, 1.5):
        box(_n(bb, 'post'), (0.18, 0.18, 1.2), (k, 0, 0.5), 'plastic_black', bb, bevel=0.0, segments=1)
    y = -0.15
    tube(_n(bb, 'bag'), [(-0.7, y, 1.35), (-0.85, y, 2.65), (0.85, y, 2.65), (0.7, y, 1.35), (-0.7, y, 1.35)],
         0.07, 'neon_pink', bb, res=6)
    tube(_n(bb, 'handle'), [(-0.38, y, 2.65), (-0.3, y, 3.1), (0.3, y, 3.1), (0.38, y, 2.65)], 0.06,
         'neon_pink', bb, res=6)
    tube(_n(bb, 'spark'), [(1.4, y, 2.9), (1.65, y, 2.25), (1.35, y, 2.25), (1.6, y, 1.55)], 0.06, 'neon_cyan',
         bb, res=6)

    # towers: up to two per city block, taller (closer to the floor line) near the penthouse's own block
    count = 0
    for bi in range(-n, n):
        for bj in range(-n, n):
            x0, y0 = bi * BLOCK - BLOCK / 2, bj * BLOCK - BLOCK / 2       # block spans [x0 + 1, x0 + BLOCK - 1]
            ccx, ccy = x0 + BLOCK / 2, y0 + BLOCK / 2
            r = math.hypot(ccx, ccy)
            if r > REACH or (bi, bj) == (0, 0) or (abs(bx - ccx) < 1 and abs(by - ccy) < 1):
                continue
            for t in range(2 if rng.random() < 0.35 else 1):
                w, d = rng.uniform(5.0, 8.5), rng.uniform(5.0, 8.5)
                half = BLOCK / 2 - 1.5
                if t == 0:
                    cx, cy = ccx + rng.uniform(-half + w / 2, -1.0), ccy + rng.uniform(-3, 3)
                else:
                    cx, cy = ccx + rng.uniform(1.0 + w / 2, half), ccy + rng.uniform(-3, 3)
                cx = min(max(cx, x0 + 1.5 + w / 2), x0 + BLOCK - 1.5 - w / 2)
                cy = min(max(cy, y0 + 1.5 + d / 2), y0 + BLOCK - 1.5 - d / 2)
                near = max(0.0, 1.0 - r / REACH)
                top = min(CEIL - 0.6, GROUND + rng.uniform(8.0, 14.0) + near * rng.uniform(4.0, 16.0))
                sg = sector_of(cx, cy)
                step = rng.uniform(0.55, 0.75) if rng.random() < 0.25 else None
                crown = CEIL - top - 0.4
                if step and crown < 1.2:
                    step = None
                _building(sg, rng, cx, cy, w, d, top, GROUND, faces(cx, cy), lit=rng.uniform(0.3, 0.55), step=step,
                          floor_h=3.0, win_depth=9.0, crown_max=crown if step else None, body='fabric_navy',
                          neon=0.0)
                if not step and rng.random() < 0.25:
                    mz = min(top + 1.4, CEIL - 0.35)
                    sphere(_n(sg, 'beacon'), 0.3, (cx, cy, mz), 'neon_red', sg, segs=8, rings=5)
                count += 1
    print(f'[skyline] {count} towers in {len(sectors)} sectors')
    return g


def plinth(name='plinth', location=(0, 0, 0), rotation=0, w=0.9, d=0.6, h=0.12, mat='wood_dark'):
    """Low display plinth / package platform (a_boxes_* region sits on top)."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    box(_n(g, 'top'), (w, d, h), (0, 0, h / 2), mat, g, bevel=0.015)
    box(_n(g, 'shadow'), (w - 0.06, d - 0.06, 0.02), (0, 0, 0.01), 'plastic_black', g, bevel=0.004, segments=1)
    return g


def bar_cart(name='bar_cart', location=(0, 0, 0), rotation=0):
    """Brass-look two-tier bar cart with bottles, glasses and a little plant."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    W, Dd = 0.75, 0.42
    for z in (0.18, 0.72):
        box(_n(g, 'tray'), (W, Dd, 0.02), (0, 0, z), 'wood_dark', g, bevel=0.006)
        box(_n(g, 'lip'), (W, 0.015, 0.05), (0, -Dd / 2, z + 0.03), 'fabric_mustard', g, bevel=0.004, segments=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube(_n(g, 'post'), [(sx * (W / 2 - 0.02), sy * (Dd / 2 - 0.02), 0.08),
                                 (sx * (W / 2 - 0.02), sy * (Dd / 2 - 0.02), 0.8)], 0.012, 'fabric_mustard', g, res=6)
    for sx in (-1, 1):
        torus(_n(g, 'wheel'), 0.05, 0.015, (sx * (W / 2 - 0.02), -Dd / 2 + 0.02, 0.06), 'plastic_black', g,
              (0, 90, 0), major=12, minor=5)
    tube(_n(g, 'handle'), [(W / 2 - 0.02, -Dd / 2 + 0.02, 0.8), (W / 2 + 0.08, 0, 0.85),
                           (W / 2 - 0.02, Dd / 2 - 0.02, 0.8)], 0.012, 'fabric_mustard', g, res=6)
    for i, (m, h) in enumerate((('plant_dark', 0.3), ('fabric_coral', 0.26), ('window_glass', 0.28),
                                ('wood_dark', 0.24))):
        x = -0.26 + i * 0.13
        lathe(_n(g, 'bottle'), [(0.035, 0), (0.038, h * 0.65), (0.014, h * 0.8), (0.012, h)], (x, 0.06, 0.73), m, g,
              verts=10, cap_top=True)
    for i in range(3):
        lathe(_n(g, 'glass'), [(0.02, 0), (0.035, 0.07), (0.037, 0.09)], (-0.2 + i * 0.1, -0.1, 0.19),
              'window_glass', g, verts=10)
    F.small_plant(parent=g, location=(0.24, -0.05, 0.73), style='succulent', obstacle=False)
    return g


def linear_pendant(name='linear_pendant', location=(0, 0, 3.4), rotation=0, length=4.2, drop=1.2,
                   light_anchor=None):
    """Long architectural linear pendant (slim bar with a glowing underside) hung on two cables."""
    g = B.group(name, location, rotation)
    z = -drop
    box(_n(g, 'bar'), (length, 0.08, 0.06), (0, 0, z), 'plastic_black', g, bevel=0.01)
    box(_n(g, 'glow'), (length - 0.06, 0.05, 0.012), (0, 0, z - 0.032), 'lampshade', g, bevel=0, segments=1)
    for sx in (-1, 1):
        tube(_n(g, 'cable'), [(sx * (length / 2 - 0.3), 0, z + 0.03), (sx * (length / 2 - 0.3), 0, 0)], 0.004,
             'plastic_black', g, res=4)
        cyl(_n(g, 'rose'), 0.05, 0.02, (sx * (length / 2 - 0.3), 0, -0.01), 'plastic_black', g, verts=10, bevel=0.003)
    if light_anchor:
        B.light(light_anchor, (location[0], location[1], location[2] - drop - 0.1), 'ceiling', '#fff1d6', 1.6, 6.0)
    return g


def sculpture(name='sculpture', location=(0, 0, 0), rotation=0):
    """Plinth with a stacked-ring abstract sculpture (gallery touch)."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    box(_n(g, 'plinth'), (0.45, 0.45, 0.9), (0, 0, 0.45), 'plastic_white', g, bevel=0.02)
    torus(_n(g, 'ring'), 0.16, 0.045, (0, 0, 1.08), 'fabric_mustard', g, (90, 0, 20), major=20, minor=8)
    sphere(_n(g, 'ball'), 0.09, (0.02, 0, 1.3), 'fabric_coral', g, segs=12, rings=6)
    box(_n(g, 'block'), (0.14, 0.14, 0.14), (-0.05, 0.03, 0.97), 'fabric_teal', g, rot=(0, 0, 30), bevel=0.02)
    return g


def planter_box(name='planter', location=(0, 0, 0), rotation=0, w=1.2, d=0.4, seed=3):
    """Long low planter with snake-plant blades and a trailing edge (office bench end / divider)."""
    rng = random.Random(seed)
    g = B.group(name, location, rotation)
    B.obstacle(g)
    box(_n(g, 'box'), (w, d, 0.42), (0, 0, 0.21), 'plastic_white', g, bevel=0.02)
    box(_n(g, 'soil'), (w - 0.06, d - 0.06, 0.02), (0, 0, 0.41), 'wood_dark', g, bevel=0.004, segments=1)
    for i in range(16):
        x = -w / 2 + 0.1 + (i + rng.uniform(-0.3, 0.3)) * (w - 0.2) / 15
        h = rng.uniform(0.3, 0.75)
        box(_n(g, 'blade'), (0.09, 0.02, h), (x, rng.uniform(-0.1, 0.1), 0.4 + h / 2),
            'plant' if i % 3 else 'plant_dark', g, rot=(rng.uniform(-14, 14), rng.uniform(-10, 10), rng.uniform(0, 180)),
            bevel=0.008, segments=1)
    return g


def pool_table(name='pool_table', location=(0, 0, 0), rotation=0, seed=4):
    """Billiards table (2.3 x 1.3, felt top at 0.8) on chunky legs, balls racked + a few scattered, two cues."""
    rng = random.Random(seed)
    g = B.group(name, location, rotation)
    B.obstacle(g)
    L, Wd, Ht = 2.3, 1.3, 0.8
    box(_n(g, 'body'), (L, Wd, 0.22), (0, 0, Ht - 0.13), 'wood_dark', g, bevel=0.03)
    box(_n(g, 'felt'), (L - 0.22, Wd - 0.22, 0.03), (0, 0, Ht - 0.01), 'fabric_teal', g, bevel=0.01)
    for sx in (-1, 1):
        box(_n(g, 'rail'), (L - 0.1, 0.1, 0.06), (0, sx * (Wd / 2 - 0.05), Ht + 0.02), 'wood_dark', g, bevel=0.02)
        box(_n(g, 'rail'), (0.1, Wd - 0.1, 0.06), (sx * (L / 2 - 0.05), 0, Ht + 0.02), 'wood_dark', g, bevel=0.02)
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            cyl(_n(g, 'pocket'), 0.055, 0.02, (sx * (L / 2 - 0.09), sy * (Wd / 2 - 0.09), Ht + 0.006),
                'plastic_black', g, verts=12, bevel=0.0, segments=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(_n(g, 'leg'), (0.16, 0.16, Ht - 0.22), (sx * (L / 2 - 0.2), sy * (Wd / 2 - 0.2), (Ht - 0.22) / 2),
                'wood_dark', g, bevel=0.02)
    cols = ['mcd_yellow', 'fabric_blue', 'mcd_red', 'fabric_navy', 'fabric_coral', 'plant', 'wood_mid',
            'plastic_black', 'mcd_yellow', 'fabric_blue']
    r = 0.028
    k = 0
    for row in range(4):
        for i in range(row + 1):
            x = 0.45 + row * r * 1.75
            y = (i - row / 2) * r * 2.02
            sphere(_n(g, 'ball'), r, (x, y, Ht + 0.005 + r), cols[k % len(cols)], g, segs=10, rings=6)
            k += 1
    sphere(_n(g, 'cue_ball'), r, (-0.55, 0.05, Ht + 0.005 + r), 'plastic_white', g, segs=10, rings=6)
    for i in range(3):
        sphere(_n(g, 'ball'), r, (rng.uniform(-0.8, 0.2), rng.uniform(-0.4, 0.4), Ht + 0.005 + r),
               cols[(k + i) % len(cols)], g, segs=10, rings=6)
    tube(_n(g, 'cue'), [(-1.05, -0.2, Ht + 0.06), (0.25, 0.35, Ht + 0.06)], 0.011, 'wood_light', g, res=6,
         radii=[0.014, 0.008])
    tube(_n(g, 'cue2'), [(-L / 2 - 0.02, Wd / 2 - 0.15, 0.1), (-L / 2 + 0.05, Wd / 2 - 0.1, 1.45)], 0.012,
         'wood_light', g, res=6, radii=[0.015, 0.008])
    return g


def bed_bench(name='bed_bench', location=(0, 0, 0), rotation=0, w=1.5, mat='fabric_mustard'):
    """Upholstered bench at the foot of a bed (0.45 high) on slim dark legs, with a folded throw."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    blob(_n(g, 'seat'), (w, 0.42, 0.16), (0, 0, 0.38), mat, g, round_xy=0.3, round_z=0.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(_n(g, 'leg'), 0.02, 0.3, (sx * (w / 2 - 0.08), sy * 0.14, 0.15), 'plastic_black', g, verts=8,
                r2=0.014, bevel=0.0, segments=1)
    blob(_n(g, 'throw'), (0.5, 0.44, 0.05), (w / 2 - 0.35, 0, 0.475), 'fabric_cream', g, round_xy=0.4, round_z=0.8)
    box(_n(g, 'book'), (0.2, 0.15, 0.03), (-w / 2 + 0.3, 0.02, 0.475), 'fabric_teal', g, rot=(0, 0, 12), bevel=0.004)
    return g
