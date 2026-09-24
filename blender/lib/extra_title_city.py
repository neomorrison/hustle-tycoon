"""Title-screen city block builders (docs/3D.md section 8, `title_city.glb`), owned by the title_city script.

Lib conventions (blender/README.md): one group empty per piece, front = local -Y, rotations in degrees, locations
at the bottom centre on the ground. Palette materials only, no letters anywhere. Windows use m_window_sky (the
runtime tints it by time of day) except the lit ones, which use m_lampshade (warm, emissive at dusk / night).
"""
import math
import random

import build as B
from build import box, sphere, blob, tube, prism, lathe, cone


def cyl(*a, **k):
    k.setdefault('segments', 1)
    return B.cyl(*a, **k)


def _g(name, location, rotation, obstacle=False, parent='root', **extras):
    g = B.group(name, location, rotation, parent, **extras)
    if obstacle:
        B.obstacle(g)
    return g


def _n(g, part):
    return f'{g.name}_{part}'


# ----------------------------------------------------------------------------------------------------------------
# buildings
# ----------------------------------------------------------------------------------------------------------------

FACES = {'s': (0, -1), 'n': (0, 1), 'e': (1, 0), 'w': (-1, 0)}


def _face_frame(face, w, d):
    """(centre offset, along-axis unit, outward normal, face length) for a face of a w x d footprint."""
    if face == 's':
        return (0, -d / 2), (1, 0), (0, -1), w
    if face == 'n':
        return (0, d / 2), (-1, 0), (0, 1), w
    if face == 'e':
        return (w / 2, 0), (0, 1), (1, 0), d
    return (-w / 2, 0), (0, -1), (-1, 0), d


def _yaw(normal):
    """Rotation (deg) so that a part's local -Y points along the outward normal."""
    nx, ny = normal
    return math.degrees(math.atan2(nx, -ny))


def window(g, loc, yaw, w=1.0, h=1.3, lit=False, frame='plastic_white', sill=True, shutters=None, box_plant=False,
           seed=1):
    """A window on a facade: frame + pane (window_sky, or lampshade when lit) + sill; loc = centre of the pane on the
    wall surface, yaw = rotation making local -Y the outward normal."""
    wg = B.group(_n(g, 'win'), loc, yaw, g)
    box(_n(g, 'win_frame'), (w + 0.14, 0.08, h + 0.14), (0, -0.02, 0), frame, wg, bevel=0.02, segments=1)
    B.panel(_n(g, 'win_pane'), (w, h), (0, -0.065, 0), 'lampshade' if lit else 'window_sky', wg)
    box(_n(g, 'win_mull'), (0.05, 0.03, h), (0, -0.07, 0), frame, wg, bevel=0.0)
    if sill:
        box(_n(g, 'win_sill'), (w + 0.26, 0.16, 0.07), (0, -0.09, -h / 2 - 0.08), frame, wg, bevel=0.015, segments=1)
    if shutters:
        for sx in (-1, 1):
            box(_n(g, 'win_shut'), (w * 0.42, 0.04, h + 0.05), (sx * (w / 2 + w * 0.21 + 0.1), -0.04, 0), shutters, wg,
                bevel=0.012, segments=1)
    if box_plant:
        rng = random.Random(seed)
        box(_n(g, 'win_box'), (w * 0.9, 0.2, 0.18), (0, -0.2, -h / 2 - 0.02), 'terracotta', wg, bevel=0.02, segments=1)
        for i in range(4):
            sphere(_n(g, 'win_leaf'), 0.11, (-w * 0.35 + i * w * 0.23, -0.2, -h / 2 + 0.1), 'plant' if i % 2 else
                   ('fabric_coral' if lit else 'plant_dark'), wg, segs=8, rings=5)
    return wg


def facade_windows(g, w, d, face, floors, floor_h, z0, cols, win_w=1.0, win_h=1.3, lit=(), skip=(), frame='plastic_white',
                   shutters=None, plant_on=(), seed=1):
    """Grid of windows on one face. lit / skip / plant_on: sets of (floor, col)."""
    (cx, cy), (ax, ay), (nx, ny), L = _face_frame(face, w, d)
    yaw = _yaw((nx, ny))
    for f in range(floors):
        for c in range(cols):
            if (f, c) in skip:
                continue
            u = -L / 2 + L * (c + 0.5) / cols
            z = z0 + f * floor_h + floor_h * 0.52
            window(g, (cx + ax * u, cy + ay * u, z), yaw, win_w, win_h, lit=(f, c) in lit, frame=frame,
                   shutters=shutters, box_plant=(f, c) in plant_on, seed=seed + f * 7 + c)


def apartment(name='apartment', location=(0, 0, 0), rotation=0, w=10.0, d=7.0, floors=4, floor_h=3.0,
              wall='wall_blush', base='brick', trim='wall_cream', lit=(('s', 2, 1),), seed=1):
    """Walk-up apartment building: brick ground floor with a door, pastel upper floors with window grids, cornice,
    balconies on the south face, rooftop water tank, AC units, antenna. lit = (face, floor, col) windows glowing."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle=True)
    H = floors * floor_h
    box(_n(g, 'base'), (w, d, floor_h), (0, 0, floor_h / 2), base, g, bevel=0.05, segments=1)
    box(_n(g, 'body'), (w - 0.1, d - 0.1, H - floor_h), (0, 0, floor_h + (H - floor_h) / 2), wall, g, bevel=0.05,
        segments=1)
    for f in range(1, floors):
        box(_n(g, 'band'), (w + 0.12, d + 0.12, 0.16), (0, 0, f * floor_h), trim, g, bevel=0.03, segments=1)
    box(_n(g, 'cornice'), (w + 0.4, d + 0.4, 0.35), (0, 0, H + 0.1), trim, g, bevel=0.06, segments=2)
    box(_n(g, 'roof'), (w - 0.1, d - 0.1, 0.1), (0, 0, H + 0.3), 'concrete', g, bevel=0.02, segments=1)
    cols_s, cols_e = max(2, int(w / 2.2)), max(2, int(d / 2.2))
    lit_by = {}
    for face, f, c in lit:
        lit_by.setdefault(face, set()).add((f, c))
    for face, cols in (('s', cols_s), ('n', cols_s), ('e', cols_e), ('w', cols_e)):
        skip = set()
        facade_windows(g, w, d, face, floors - 1, floor_h, floor_h, cols, lit=lit_by.get(face, set()), skip=skip,
                       shutters='fabric_teal' if face in ('s', 'e') else None,
                       plant_on={(1, 0), (0, cols - 1)} if face == 's' else set(), seed=seed)
    # ground floor: front door with a canopy + two windows each side
    box(_n(g, 'door'), (1.2, 0.1, 2.2), (0, -d / 2 - 0.02, 1.1), 'wood_dark', g, bevel=0.03, segments=1)
    box(_n(g, 'door_glass'), (0.8, 0.02, 0.9), (0, -d / 2 - 0.08, 1.5), 'window_sky', g, bevel=0.0)
    box(_n(g, 'canopy'), (1.9, 0.9, 0.12), (0, -d / 2 - 0.45, 2.55), 'fabric_teal', g, bevel=0.03, segments=1)
    box(_n(g, 'step'), (1.8, 0.5, 0.18), (0, -d / 2 - 0.25, 0.09), 'concrete', g, bevel=0.02, segments=1)
    for sx in (-1, 1):
        window(g, (sx * w * 0.3, -d / 2, 1.6), 0, 1.3, 1.2, frame='wall_cream')
    # balconies on the south face, floors 1..
    for f in range(1, floors - 1):
        for c in (0, cols_s - 1):
            u = -w / 2 + w * (c + 0.5) / cols_s
            z = f * floor_h + 0.1
            box(_n(g, 'balc'), (1.7, 0.8, 0.1), (u, -d / 2 - 0.4, z), 'wall_cream', g, bevel=0.02, segments=1)
            box(_n(g, 'balc_rail'), (1.7, 0.04, 0.05), (u, -d / 2 - 0.78, z + 0.95), 'metal_dark', g, bevel=0.0)
            for k in range(9):
                box(_n(g, 'balc_bar'), (0.025, 0.025, 0.9), (u - 0.8 + k * 0.2, -d / 2 - 0.78, z + 0.5), 'metal_dark', g,
                    bevel=0.0)
            if rng.random() < 0.8:
                sphere(_n(g, 'balc_plant'), 0.22, (u + 0.55, -d / 2 - 0.45, z + 0.3), 'plant', g, segs=8, rings=5)
                cyl(_n(g, 'balc_pot'), 0.16, 0.25, (u + 0.55, -d / 2 - 0.45, z + 0.17), 'terracotta', g, verts=10)
    # rooftop: water tank, AC units, antenna, access hut
    rt = B.group(_n(g, 'rooftop'), (0, 0, H + 0.35), 0, g)
    cyl(_n(g, 'tank'), 0.9, 1.6, (w * 0.25, d * 0.15, 1.7), 'wood_mid', rt, verts=16, bevel=0.03)
    cone(_n(g, 'tank_roof'), 1.0, 0.5, (w * 0.25, d * 0.15, 2.5), 'metal_dark', rt, verts=16)
    for lx in (-0.55, 0.55):
        for ly in (-0.55, 0.55):
            cyl(_n(g, 'tank_leg'), 0.06, 0.9, (w * 0.25 + lx, d * 0.15 + ly, 0.45), 'metal_dark', rt, verts=6)
    for k in range(2):
        box(_n(g, 'ac'), (1.0, 0.8, 0.6), (-w * 0.3 + k * 1.3, -d * 0.2, 0.3), 'plastic_grey', rt, bevel=0.05,
            segments=1)
        cyl(_n(g, 'ac_fan'), 0.3, 0.04, (-w * 0.3 + k * 1.3, -d * 0.2, 0.62), 'metal_dark', rt, verts=12)
    box(_n(g, 'hut'), (1.6, 1.6, 2.2), (-w * 0.3, d * 0.22, 1.1), wall, rt, bevel=0.05, segments=1)
    box(_n(g, 'hut_roof'), (1.8, 1.8, 0.12), (-w * 0.3, d * 0.22, 2.25), trim, rt, bevel=0.03, segments=1)
    tube(_n(g, 'antenna'), [(w * 0.38, -d * 0.3, 0), (w * 0.38, -d * 0.3, 2.4)], 0.03, 'metal_dark', rt, res=6)
    for k in range(3):
        box(_n(g, 'ant_bar'), (0.6 - k * 0.15, 0.03, 0.03), (w * 0.38, -d * 0.3, 1.5 + k * 0.3), 'metal_dark', rt,
            bevel=0.0)
    return g


def burger_joint(name='restaurant', location=(0, 0, 0), rotation=0, w=8.0, d=6.5, h=4.4, seed=2):
    """Corner burger restaurant: white tile walls with a red band, big warm-lit storefront windows on the south and
    east faces with red/yellow striped awnings, glass door on the corner, rooftop pole sign with a burger badge,
    yellow roof trim."""
    import extra_mcdoodles as M
    g = _g(name, location, rotation, obstacle=True)
    box(_n(g, 'body'), (w, d, h), (0, 0, h / 2), 'tile_white', g, bevel=0.05, segments=1)
    box(_n(g, 'band'), (w + 0.06, d + 0.06, 0.9), (0, 0, h - 0.45), 'mcd_red', g, bevel=0.04, segments=1)
    box(_n(g, 'trim'), (w + 0.3, d + 0.3, 0.2), (0, 0, h + 0.05), 'mcd_yellow', g, bevel=0.05, segments=1)
    box(_n(g, 'kick'), (w + 0.04, d + 0.04, 0.45), (0, 0, 0.225), 'mcd_red', g, bevel=0.03, segments=1)
    box(_n(g, 'roof'), (w - 0.2, d - 0.2, 0.12), (0, 0, h + 0.1), 'concrete', g, bevel=0.02, segments=1)
    # storefront windows (lit, it is open) + awnings: south face and east face
    for face, L in (('s', w), ('e', d)):
        (cx, cy), (ax, ay), (nx, ny), _ = _face_frame(face, w, d)
        yaw = _yaw((nx, ny))
        n = 3 if L > 7 else 2
        span = L - 2.2
        for i in range(n):
            u = -L / 2 + 0.6 + span * (i + 0.5) / n
            p = (cx + ax * u, cy + ay * u, 1.75)
            wg = B.group(_n(g, 'store'), p, yaw, g)
            box(_n(g, 'store_frame'), (span / n - 0.1, 0.1, 2.5), (0, -0.02, 0), 'metal_dark', wg, bevel=0.02,
                segments=1)
            B.panel(_n(g, 'store_glass'), (span / n - 0.3, 2.3), (0, -0.075, 0), 'lampshade', wg)
            # silhouettes of a booth + diners inside (flat shapes on the glass, just for life)
            box(_n(g, 'store_booth'), (span / n * 0.62, 0.02, 0.55), (0, -0.085, -0.75), 'mcd_red', wg, bevel=0.0)
            box(_n(g, 'store_table'), (span / n * 0.3, 0.025, 0.08), (0, -0.09, -0.45), 'plastic_white', wg, bevel=0.0)
            for hx in (-0.28, 0.3):
                sphere(_n(g, 'store_head'), 0.15, (hx * span / n, -0.09, -0.12 + 0.05 * (i % 2)), 'wood_dark', wg,
                       scale=(1, 0.15, 1.1), segs=10, rings=5)
                box(_n(g, 'store_body'), (0.36, 0.02, 0.35), (hx * span / n, -0.088, -0.42), 'fabric_navy' if hx < 0
                    else 'poster_a', wg, bevel=0.0)
        # awning: striped, sloped, over the whole face
        aw = B.group(_n(g, 'awning'), (cx + nx * 0.02, cy + ny * 0.02, 3.55), yaw, g)
        nst = int(L / 0.7)
        sl = math.radians(28)
        for k in range(nst):
            u = -L / 2 + 0.1 + (L - 0.2) * (k + 0.5) / nst
            m = 'mcd_red' if k % 2 == 0 else 'plastic_white'
            box(_n(g, 'aw_stripe'), ((L - 0.2) / nst + 0.004, 1.5, 0.07), (u, -0.75 * math.cos(sl), -0.75 * math.sin(sl)),
                m, aw, rot=(math.degrees(sl), 0, 0), bevel=0.0)
            box(_n(g, 'aw_flap'), ((L - 0.2) / nst + 0.004, 0.06, 0.32),
                (u, -1.5 * math.cos(sl) - 0.02, -1.5 * math.sin(sl) - 0.14), m, aw, bevel=0.0)
            sphere(_n(g, 'aw_scallop'), ((L - 0.2) / nst) * 0.5, (u, -1.5 * math.cos(sl) - 0.02, -1.5 * math.sin(sl) - 0.3),
                   m, aw, scale=(1, 0.12, 0.45), segs=10, rings=4)
        box(_n(g, 'aw_bar'), (L - 0.1, 0.1, 0.1), (0, -0.05, 0.02), 'mcd_yellow', aw, bevel=0.02, segments=1)
    # corner door (south-east corner, on the south face near the east edge)
    box(_n(g, 'door'), (1.2, 0.12, 2.4), (w / 2 - 0.9, -d / 2 - 0.02, 1.2), 'metal_dark', g, bevel=0.02, segments=1)
    B.panel(_n(g, 'door_glass'), (0.95, 2.1), (w / 2 - 0.9, -d / 2 - 0.09, 1.2), 'lampshade', g)
    # small windows on the north / west faces (kitchen side)
    for face, L in (('n', w), ('w', d)):
        (cx, cy), (ax, ay), (nx, ny), _ = _face_frame(face, w, d)
        for i in range(2):
            u = -L / 2 + L * (i + 0.5) / 2
            window(g, (cx + ax * u, cy + ay * u, 2.0), _yaw((nx, ny)), 1.2, 0.9, frame='mcd_red', sill=False)
    box(_n(g, 'backdoor'), (1.0, 0.1, 2.2), (-w / 4, d / 2 + 0.02, 1.1), 'metal', g, bevel=0.02, segments=1)
    # rooftop: pole sign with the burger badge, facing the corner (south-east), plus vents
    sg = B.group(_n(g, 'sign'), (w / 2 - 1.2, -d / 2 + 1.2, h), 45, g)
    cyl(_n(g, 'sign_pole'), 0.12, 2.6, (0, 0, 1.3), 'metal_dark', sg, verts=10)
    cyl(_n(g, 'sign_disc'), 1.25, 0.25, (0, 0, 3.4), 'mcd_red', sg, rot=(90, 0, 0), verts=32, bevel=0.05, segments=2)
    B.torus(_n(g, 'sign_rim'), 1.25, 0.08, (0, -0.14, 3.4), 'neon_yellow', sg, rot=(90, 0, 0), major=32, minor=6)
    B.torus(_n(g, 'sign_rim_b'), 1.25, 0.08, (0, 0.14, 3.4), 'neon_yellow', sg, rot=(90, 0, 0), major=32, minor=6)
    for side, yy in ((1, -0.13), (-1, 0.13)):
        bg = B.group(_n(g, 'sign_face'), (0, yy, 3.4), 0 if side > 0 else 180, sg)
        M.icon_burger(bg, 0, 0.05, 6.0, 0.0)
    for k in range(2):
        box(_n(g, 'vent'), (0.8, 0.8, 0.5), (-w / 2 + 1.2 + k * 1.3, d / 2 - 1.2, h + 0.4), 'metal', g, bevel=0.04,
            segments=1)
    return g


def shop(name='shop', location=(0, 0, 0), rotation=0, w=7.0, d=6.0, floors=2, floor_h=3.2, wall='wall_sky',
         trim='plastic_white', awning='fabric_teal', seed=3, lit=()):
    """Two-storey corner shop: storefront + awning on the south face, window grid above, flat roof."""
    g = _g(name, location, rotation, obstacle=True)
    H = floors * floor_h
    box(_n(g, 'body'), (w, d, H), (0, 0, H / 2), wall, g, bevel=0.05, segments=1)
    box(_n(g, 'cornice'), (w + 0.3, d + 0.3, 0.3), (0, 0, H + 0.05), trim, g, bevel=0.05, segments=1)
    box(_n(g, 'band'), (w + 0.1, d + 0.1, 0.14), (0, 0, floor_h), trim, g, bevel=0.03, segments=1)
    B.panel(_n(g, 'front'), (w - 1.6, 2.2), (0.4, -d / 2 - 0.03, 1.5), 'window_sky', g)
    box(_n(g, 'front_frame'), (w - 1.4, 0.08, 2.4), (0.4, -d / 2 + 0.01, 1.5), trim, g, bevel=0.02, segments=1)
    box(_n(g, 'door'), (1.0, 0.1, 2.3), (-w / 2 + 0.8, -d / 2 - 0.02, 1.15), 'wood_mid', g, bevel=0.02, segments=1)
    aw = B.group(_n(g, 'awning'), (0.4, -d / 2, 2.95), 0, g)
    box(_n(g, 'aw'), (w - 1.2, 1.1, 0.07), (0, -0.5, 0), awning, aw, rot=(-18, 0, 0), bevel=0.02, segments=1)
    box(_n(g, 'aw_flap'), (w - 1.2, 0.05, 0.25), (0, -1.03, -0.28), awning, aw, bevel=0.0)
    lit_s = {(f, c) for (f, c) in lit}
    for face in ('s', 'n', 'e', 'w'):
        L = w if face in ('s', 'n') else d
        facade_windows(g, w, d, face, floors - 1, floor_h, floor_h, max(2, int(L / 2.4)), 1.1, 1.3,
                       lit=lit_s if face == 's' else set(), frame=trim, seed=seed)
    # a crate display outside
    for k in range(2):
        box(_n(g, 'crate'), (0.6, 0.45, 0.4), (w / 2 - 1.2 - k * 0.7, -d / 2 - 0.5, 0.2), 'wood_light', g, bevel=0.02,
            segments=1)
        for j in range(3):
            sphere(_n(g, 'fruit'), 0.1, (w / 2 - 1.4 - k * 0.7 + j * 0.18, -d / 2 - 0.5, 0.45),
                   'mcd_red' if k == 0 else 'mcd_yellow', g, segs=8, rings=5)
    return g


def billboard(name='billboard', location=(0, 0, 0), rotation=0, w=6.0, h=3.0, seed=4):
    """Rooftop billboard on steel legs facing local -Y: sky-blue board with an abstract shopping-bag icon (bag,
    handles, a smile and a sparkle), bulb lamps along the top. location = foot of the legs on the roof."""
    g = _g(name, location, rotation)
    z0 = 2.0
    for sx in (-w * 0.33, w * 0.33):
        for sy in (0.0, 0.9):
            box(_n(g, 'leg'), (0.14, 0.14, z0 + h * 0.6), (sx, sy, (z0 + h * 0.6) / 2), 'metal_dark', g, bevel=0.0)
        tube(_n(g, 'brace'), [(sx, 0.0, 0.2), (sx, 0.9, z0 - 0.2)], 0.04, 'metal_dark', g, res=6)
    box(_n(g, 'walk'), (w, 0.7, 0.08), (0, -0.2, z0 - 0.15), 'metal_dark', g, bevel=0.0)
    box(_n(g, 'frame'), (w + 0.3, 0.3, h + 0.3), (0, 0, z0 + h / 2), 'plastic_white', g, bevel=0.06, segments=2)
    box(_n(g, 'board'), (w, 0.06, h), (0, -0.16, z0 + h / 2), 'wall_sky', g, bevel=0.02, segments=1)
    # coloured blobs in the background
    sphere(_n(g, 'bg_blob'), 1.0, (-w * 0.3, -0.19, z0 + h * 0.62), 'poster_b', g, scale=(1.3, 0.02, 0.9), segs=16,
           rings=8)
    sphere(_n(g, 'bg_blob2'), 0.8, (w * 0.33, -0.19, z0 + h * 0.35), 'fabric_coral', g, scale=(1.2, 0.02, 0.8), segs=16,
           rings=8)
    # shopping bag icon
    bw, bh = h * 0.55, h * 0.58
    bx, bz = -w * 0.08, z0 + h * 0.14
    prism(_n(g, 'bag'), [(-bw / 2, 0), (bw / 2, 0), (bw / 2 * 0.86, bh), (-bw / 2 * 0.86, bh)], 0.12, (bx, -0.2, bz),
          'mcd_yellow', g, rot=(90, 0, 0), bevel=0.04, segments=2)
    box(_n(g, 'bag_fold'), (bw * 0.86, 0.13, 0.14), (bx, -0.26, bz + bh - 0.07), 'fabric_mustard', g, bevel=0.03,
        segments=1)
    B.torus(_n(g, 'bag_handle'), bw * 0.24, 0.05, (bx, -0.26, bz + bh), 'mcd_red', g, rot=(90, 0, 0), major=16, minor=6,
            arc=180)
    tube(_n(g, 'bag_smile'), [(bx + bw * 0.22 * math.cos(a), -0.34, bz + bh * 0.45 + bw * 0.16 * math.sin(a))
                              for a in [math.pi + math.pi * k / 8 for k in range(9)]], 0.05, 'mcd_red', g, res=6)
    for sx in (-1, 1):
        sphere(_n(g, 'bag_eye'), 0.08, (bx + sx * bw * 0.16, -0.34, bz + bh * 0.62), 'mcd_red', g, segs=8, rings=5)
    # sparkles + a little box flying toward the bag
    for k, (px, pz, s) in enumerate(((w * 0.25, z0 + h * 0.72, 0.35), (w * 0.38, z0 + h * 0.5, 0.22),
                                     (-w * 0.38, z0 + h * 0.3, 0.25))):
        for a in (0, 90):
            box(_n(g, 'spark'), (s * 0.25, 0.04, s), (px, -0.22, pz), 'plastic_white', g, rot=(0, a + 45 * (k % 2), 0),
                bevel=0.0)
    box(_n(g, 'box_icon'), (0.6, 0.1, 0.45), (w * 0.3, -0.24, z0 + h * 0.3), 'kraft', g, rot=(0, -12, 0), bevel=0.04,
        segments=1)
    box(_n(g, 'box_tape'), (0.1, 0.12, 0.47), (w * 0.3, -0.25, z0 + h * 0.3), 'fabric_mustard', g, rot=(0, -12, 0),
        bevel=0.0)
    # lamps along the top, arms reaching over the board
    for k in range(3):
        lx = -w * 0.33 + k * w * 0.33
        tube(_n(g, 'lamp_arm'), [(lx, 0.1, z0 + h + 0.15), (lx, -0.4, z0 + h + 0.45), (lx, -0.8, z0 + h + 0.35)], 0.03,
             'metal_dark', g, res=5)
        box(_n(g, 'lamp_head'), (0.45, 0.25, 0.12), (lx, -0.85, z0 + h + 0.3), 'metal_dark', g, bevel=0.03, segments=1)
        box(_n(g, 'lamp_glow'), (0.38, 0.18, 0.02), (lx, -0.85, z0 + h + 0.235), 'lampshade', g, bevel=0.0)
    return g


# ----------------------------------------------------------------------------------------------------------------
# street furniture, vehicles, nature
# ----------------------------------------------------------------------------------------------------------------


def street_lamp(name='lamp', location=(0, 0, 0), rotation=0, h=4.2, light=None, parent='root'):
    """Street lamp: dark green-black pole, curved arm reaching local -Y, lantern head with a glowing lens; the light
    anchor (if named) goes under the lens."""
    g = _g(name, location, rotation, obstacle=parent == 'root', parent=parent)
    cyl(_n(g, 'foot'), 0.18, 0.3, (0, 0, 0.15), 'metal_dark', g, verts=10)
    cyl(_n(g, 'pole'), 0.07, h, (0, 0, h / 2), 'metal_dark', g, verts=8, bevel=0.0)
    tube(_n(g, 'arm'), B.bezier((0, 0, h - 0.1), (0, 0, h + 0.5), (0, -0.4, h + 0.55), (0, -0.9, h + 0.35), 6), 0.05,
         'metal_dark', g, res=6)
    lathe(_n(g, 'shade'), [(0.3, 0.0), (0.26, 0.12), (0.12, 0.25), (0.03, 0.3)], (0, -0.95, h + 0.05), 'metal_dark', g,
          verts=12, cap_bottom=False, cap_top=True)
    sphere(_n(g, 'bulb'), 0.17, (0, -0.95, h + 0.08), 'lampshade', g, scale=(1, 1, 0.6), segs=10, rings=5)
    if light:
        B.light(light, (0, -0.95, h - 0.15), 'lamp', '#ffd29a', 1.6, 9.0, frame=g)
    return g


def traffic_light(name='traffic_light', location=(0, 0, 0), rotation=0, h=3.4, green=True):
    """Traffic light on a pole, signal box facing local -Y; one lamp lit (neon)."""
    g = _g(name, location, rotation, obstacle=True)
    cyl(_n(g, 'pole'), 0.07, h, (0, 0, h / 2), 'metal_dark', g, verts=8, bevel=0.0)
    box(_n(g, 'box'), (0.36, 0.3, 1.0), (0, -0.05, h + 0.45), 'fabric_mustard', g, bevel=0.05, segments=1)
    for k, m in enumerate(('neon_red', 'plastic_black', 'neon_green')):
        lit = (k == 2) == green if k != 1 else False
        cyl(_n(g, 'lamp'), 0.11, 0.06, (0, -0.21, h + 0.78 - k * 0.32), m if lit else 'plastic_black', g,
            rot=(90, 0, 0), verts=12)
        box(_n(g, 'visor'), (0.26, 0.14, 0.03), (0, -0.26, h + 0.9 - k * 0.32), 'fabric_mustard', g, bevel=0.0)
    box(_n(g, 'button'), (0.14, 0.1, 0.22), (0, -0.1, 1.1), 'fabric_mustard', g, bevel=0.03, segments=1)
    return g


def tree(name='tree', location=(0, 0, 0), style='round', h=4.5, seed=1, pit=True, obstacle=True, parent='root'):
    """Low-poly toy tree: round (clustered ball crown), pine (stacked cones), or bush (no trunk)."""
    rng = random.Random(seed)
    g = _g(name, location, rng.uniform(0, 360), obstacle=obstacle and parent == 'root', parent=parent)
    if pit:
        box(_n(g, 'pit'), (1.1, 1.1, 0.06), (0, 0, 0.03), 'wood_dark', g, bevel=0.02, segments=1)
    if style == 'pine':
        cyl(_n(g, 'trunk'), 0.14, h * 0.3, (0, 0, h * 0.15), 'wood_mid', g, verts=8, bevel=0.0)
        for k in range(3):
            r = (1.3 - k * 0.32) * h / 4.5
            cone(_n(g, 'cone'), r, h * 0.32, (0, 0, h * (0.22 + k * 0.2)), 'plant_dark', g, verts=10, r2=0.0,
                 bottom=True)
        return g
    if style == 'bush':
        for k in range(3):
            sphere(_n(g, 'bush'), rng.uniform(0.45, 0.6), (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0.4),
                   'plant' if k % 2 else 'plant_dark', g, segs=10, rings=6)
        return g
    trunk_h = h * 0.45
    tube(_n(g, 'trunk'), [(0, 0, 0), (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), trunk_h * 0.6),
                          (rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), trunk_h + 0.3)], 0.15, 'wood_mid', g,
         res=7, radii=[0.18, 0.13, 0.09])
    cr = h * 0.3
    mats = ['plant', 'plant', 'plant_dark', 'rug_green']
    for k in range(4):
        a = k * 2.1 + rng.uniform(-0.3, 0.3)
        rr = cr * (0.55 if k else 0.0)
        sphere(_n(g, 'crown'), cr * rng.uniform(0.7, 0.95) if k else cr,
               (rr * math.cos(a), rr * math.sin(a), trunk_h + cr * (0.75 if k else 0.95) + rng.uniform(-0.2, 0.2)),
               mats[k], g, segs=12, rings=7)
    return g


def bench(name='bench', location=(0, 0, 0), rotation=0, mat='wood_light'):
    g = _g(name, location, rotation, obstacle=True)
    for k in range(3):
        box(_n(g, 'slat'), (1.6, 0.12, 0.04), (0, -0.15 + k * 0.14, 0.45), mat, g, bevel=0.01, segments=1)
    for k in range(2):
        box(_n(g, 'back'), (1.6, 0.04, 0.12), (0, 0.2, 0.62 + k * 0.16), mat, g, rot=(-10, 0, 0), bevel=0.01, segments=1)
    for sx in (-0.7, 0.7):
        box(_n(g, 'leg'), (0.06, 0.5, 0.45), (sx, 0.0, 0.225), 'metal_dark', g, bevel=0.0)
        box(_n(g, 'leg_back'), (0.06, 0.05, 0.5), (sx, 0.2, 0.7), 'metal_dark', g, bevel=0.0)
    return g


def van(name='van', location=(0, 0, 0), rotation=0, body='plastic_white', accent='fabric_teal', seed=5,
        open_back=True):
    """Delivery van (nose toward local -Y): tall box body, cab with windscreen, sliding door, a box pictogram on
    the side, wheels, lights. Back doors open with parcels inside when open_back."""
    g = _g(name, location, rotation, obstacle=True)
    L, W, Hh = 5.2, 2.0, 2.4
    box(_n(g, 'cargo'), (W, 3.4, Hh - 0.35), (0, 0.8, 0.35 + (Hh - 0.35) / 2), body, g, bevel=0.12, segments=2)
    box(_n(g, 'cab'), (W, 1.6, 1.5), (0, -1.6, 0.35 + 0.75), body, g, bevel=0.2, segments=2)
    box(_n(g, 'hood'), (W - 0.1, 0.7, 0.5), (0, -2.3, 0.75), body, g, bevel=0.15, segments=2)
    box(_n(g, 'windscreen'), (W - 0.25, 0.08, 0.75), (0, -2.02, 1.55), 'plastic_black', g, rot=(-30, 0, 0), bevel=0.04,
        segments=1)
    for sx in (-1, 1):
        box(_n(g, 'side_win'), (0.06, 0.8, 0.6), (sx * W / 2, -1.45, 1.55), 'plastic_black', g, bevel=0.03, segments=1)
        box(_n(g, 'stripe'), (0.05, 3.4, 0.25), (sx * W / 2, 0.8, 0.95), accent, g, bevel=0.0)
        box(_n(g, 'logo_box'), (0.05, 0.9, 0.7), (sx * (W / 2 + 0.01), 0.9, 1.65), 'kraft', g, bevel=0.03, segments=1)
        box(_n(g, 'logo_tape'), (0.06, 0.14, 0.72), (sx * (W / 2 + 0.015), 0.9, 1.65), 'fabric_mustard', g, bevel=0.0)
        box(_n(g, 'mirror'), (0.2, 0.08, 0.2), (sx * (W / 2 + 0.12), -2.0, 1.45), 'plastic_black', g, bevel=0.03,
            segments=1)
        for wy in (-1.7, 1.55):
            cyl(_n(g, 'wheel'), 0.38, 0.28, (sx * (W / 2 - 0.12), wy, 0.38), 'plastic_black', g, rot=(0, 90, 0), verts=14)
            cyl(_n(g, 'hub'), 0.18, 0.3, (sx * (W / 2 - 0.12), wy, 0.38), 'metal', g, rot=(0, 90, 0), verts=10)
        box(_n(g, 'headlight'), (0.35, 0.05, 0.18), (sx * 0.65, -2.66, 0.85), 'lampshade', g, bevel=0.02, segments=1)
        box(_n(g, 'taillight'), (0.18, 0.05, 0.35), (sx * 0.85, 2.52, 1.0), 'neon_red', g, bevel=0.02, segments=1)
    box(_n(g, 'bumper'), (W, 0.25, 0.25), (0, -2.62, 0.45), 'plastic_grey', g, bevel=0.06, segments=1)
    box(_n(g, 'bumper_r'), (W, 0.25, 0.25), (0, 2.5, 0.45), 'plastic_grey', g, bevel=0.06, segments=1)
    if open_back:
        rng = random.Random(seed)
        box(_n(g, 'cargo_dark'), (W - 0.3, 0.05, Hh - 0.7), (0, 2.49, 0.45 + (Hh - 0.7) / 2), 'metal_dark', g, bevel=0.0)
        for sx in (-1, 1):
            dg = B.group(_n(g, 'backdoor'), (sx * (W / 2 - 0.02), 2.5, 0.35), -sx * 100, g)
            box(_n(g, 'bd'), (W / 2 - 0.05, 0.06, Hh - 0.45), (-sx * (W / 4), 0.03, (Hh - 0.45) / 2 + 0.05), body, dg,
                bevel=0.03, segments=1)
        for k in range(5):
            s = rng.uniform(0.35, 0.55)
            box(_n(g, 'parcel'), (s, s * 0.8, s * 0.7), (rng.uniform(-0.55, 0.55), 2.2 - rng.uniform(0, 0.6),
                                                        0.5 + (k // 3) * 0.45 + s * 0.35), 'kraft', g,
                rot=(0, 0, rng.uniform(-15, 15)), bevel=0.03, segments=1)
    return g


def car(name='car', location=(0, 0, 0), rotation=0, body='fabric_coral', seed=6):
    """Compact hatchback, nose toward local -Y."""
    g = _g(name, location, rotation, obstacle=True)
    box(_n(g, 'body'), (1.75, 3.8, 0.8), (0, 0, 0.7), body, g, bevel=0.25, segments=2)
    box(_n(g, 'cabin'), (1.55, 2.1, 0.7), (0, 0.35, 1.35), body, g, bevel=0.25, segments=2)
    for side in (-1, 1):
        box(_n(g, 'glass_side'), (0.05, 1.7, 0.45), (side * 0.78, 0.35, 1.38), 'plastic_black', g, bevel=0.02, segments=1)
        for wy in (-1.25, 1.25):
            cyl(_n(g, 'wheel'), 0.34, 0.24, (side * 0.78, wy, 0.34), 'plastic_black', g, rot=(0, 90, 0), verts=14)
            cyl(_n(g, 'hub'), 0.15, 0.26, (side * 0.78, wy, 0.34), 'metal', g, rot=(0, 90, 0), verts=10)
        box(_n(g, 'headlight'), (0.35, 0.05, 0.14), (side * 0.55, -1.9, 0.82), 'lampshade', g, bevel=0.02, segments=1)
        box(_n(g, 'taillight'), (0.3, 0.05, 0.14), (side * 0.6, 1.9, 0.85), 'neon_red', g, bevel=0.02, segments=1)
    box(_n(g, 'windscreen'), (1.4, 0.05, 0.6), (0, -0.72, 1.35), 'plastic_black', g, rot=(-35, 0, 0), bevel=0.02,
        segments=1)
    box(_n(g, 'rear_glass'), (1.35, 0.05, 0.5), (0, 1.42, 1.38), 'plastic_black', g, rot=(25, 0, 0), bevel=0.02,
        segments=1)
    return g


def parcel_stack(name='parcels', location=(0, 0, 0), rotation=0, n=6, seed=7, hand_truck=True):
    """Delivery boxes stacked on the sidewalk (kraft with tape) + a hand truck."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle=True)
    placed = []
    for k in range(n):
        s = rng.uniform(0.35, 0.6)
        if k < 3:
            x, y, z = -0.5 + k * 0.55 + rng.uniform(-0.05, 0.05), rng.uniform(-0.1, 0.1), 0
        else:
            bx, by, bz, bs = placed[k - 3]
            x, y, z = bx + rng.uniform(-0.06, 0.06), by + rng.uniform(-0.05, 0.05), bz + bs * 0.75
        rot = rng.uniform(-18, 18)
        box(_n(g, 'box'), (s, s * 0.8, s * 0.75), (x, y, z + s * 0.375), 'kraft', g, rot=(0, 0, rot), bevel=0.03,
            segments=1)
        box(_n(g, 'tape'), (0.08, s * 0.82, s * 0.77), (x, y, z + s * 0.375), 'fabric_mustard', g, rot=(0, 0, rot),
            bevel=0.0)
        placed.append((x, y, z, s))
    if hand_truck:
        ht = B.group(_n(g, 'truck'), (1.2, 0.2, 0), -20, g)
        for sx in (-0.22, 0.22):
            tube(_n(g, 'ht_rail'), [(sx, 0, 0.12), (sx, 0.2, 1.3)], 0.025, 'mcd_red', ht, res=6)
            cyl(_n(g, 'ht_wheel'), 0.12, 0.06, (sx, 0.06, 0.12), 'plastic_black', ht, rot=(0, 90, 0), verts=12)
        box(_n(g, 'ht_nose'), (0.5, 0.3, 0.03), (0, -0.12, 0.03), 'metal', ht, bevel=0.0)
        box(_n(g, 'ht_box'), (0.45, 0.35, 0.35), (0, -0.05, 0.22), 'kraft', ht, rot=(-8, 0, 0), bevel=0.03, segments=1)
    return g


def patio_table(name='patio', location=(0, 0, 0), rotation=0, umbrella='mcd_red', seed=8):
    """Round outdoor table with two chairs and a striped umbrella."""
    g = _g(name, location, rotation, obstacle=True)
    cyl(_n(g, 'top'), 0.45, 0.04, (0, 0, 0.74), 'plastic_white', g, verts=16)
    cyl(_n(g, 'post'), 0.04, 2.3, (0, 0, 1.15), 'metal', g, verts=6, bevel=0.0)
    cyl(_n(g, 'foot'), 0.25, 0.04, (0, 0, 0.02), 'metal_dark', g, verts=12)
    for k in range(8):
        a0, a1 = 2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8
        pts = [(0, 0), (1.25 * math.cos(a0), 1.25 * math.sin(a0)), (1.25 * math.cos(a1), 1.25 * math.sin(a1))]
        o = B.mesh_from_data(_n(g, 'umb'), [(0, 0, 2.5), (pts[1][0], pts[1][1], 2.05), (pts[2][0], pts[2][1], 2.05)],
                             [(0, 1, 2)], umbrella if k % 2 else 'plastic_white', g, smooth=False)
        o.data.polygons[0].use_smooth = False
    for side in (-1, 1):
        c = B.group(_n(g, 'chair'), (side * 0.75, 0, 0), 90 * side, g)
        box(_n(g, 'seat'), (0.42, 0.42, 0.05), (0, 0, 0.46), umbrella, c, bevel=0.015, segments=1)
        box(_n(g, 'back'), (0.42, 0.04, 0.4), (0, 0.2, 0.7), umbrella, c, bevel=0.015, segments=1)
        for lx in (-0.18, 0.18):
            for ly in (-0.18, 0.18):
                box(_n(g, 'leg'), (0.03, 0.03, 0.45), (lx, ly, 0.225), 'metal', c, bevel=0.0)
    return g


def hydrant(name='hydrant', location=(0, 0, 0), rotation=0):
    g = _g(name, location, rotation, obstacle=True)
    lathe(_n(g, 'body'), [(0.16, 0), (0.15, 0.05), (0.12, 0.08), (0.12, 0.55), (0.14, 0.6), (0.1, 0.72), (0.03, 0.78)],
          (0, 0, 0), 'mcd_red', g, verts=10)
    for sx in (-1, 1):
        cyl(_n(g, 'nozzle'), 0.05, 0.12, (sx * 0.15, 0, 0.42), 'mcd_red', g, rot=(0, 90, 0), verts=8)
    return g


def mailbox(name='mailbox', location=(0, 0, 0), rotation=0):
    g = _g(name, location, rotation, obstacle=True)
    box(_n(g, 'box'), (0.5, 0.45, 0.8), (0, 0, 0.55), 'poster_b', g, bevel=0.06, segments=1)
    cyl(_n(g, 'top'), 0.25, 0.45, (0, 0, 0.95), 'poster_b', g, rot=(90, 0, 0), verts=12)
    for sx in (-0.2, 0.2):
        box(_n(g, 'leg'), (0.05, 0.4, 0.15), (sx, 0, 0.075), 'poster_b', g, bevel=0.0)
    box(_n(g, 'slot'), (0.3, 0.04, 0.04), (0, -0.23, 0.85), 'plastic_black', g, bevel=0.0)
    return g


def bus_stop(name='bus_stop', location=(0, 0, 0), rotation=0):
    """Bus shelter: roof, glass back, bench, a poster panel (abstract)."""
    g = _g(name, location, rotation, obstacle=True)
    box(_n(g, 'roof'), (3.0, 1.4, 0.12), (0, 0, 2.5), 'fabric_teal', g, bevel=0.04, segments=1)
    for sx in (-1.4, 1.4):
        box(_n(g, 'post'), (0.08, 0.08, 2.45), (sx, 0.55, 1.22), 'metal_dark', g, bevel=0.0)
    box(_n(g, 'glass'), (2.7, 0.04, 1.8), (0, 0.6, 1.3), 'window_glass', g, bevel=0.0)
    box(_n(g, 'poster'), (0.05, 1.1, 1.6), (1.4, 0.0, 1.3), 'poster_a', g, bevel=0.02, segments=1)
    box(_n(g, 'seat'), (2.0, 0.4, 0.06), (0, 0.35, 0.48), 'wood_light', g, bevel=0.015, segments=1)
    return g


def dumpster(name='dumpster', location=(0, 0, 0), rotation=0, mat='fabric_teal'):
    g = _g(name, location, rotation, obstacle=True)
    box(_n(g, 'bin'), (1.8, 1.0, 1.1), (0, 0, 0.65), mat, g, bevel=0.05, segments=1)
    box(_n(g, 'lid'), (1.85, 1.05, 0.08), (0, -0.05, 1.24), 'plastic_black', g, rot=(-8, 0, 0), bevel=0.02, segments=1)
    for sx in (-0.75, 0.75):
        for sy in (-0.35, 0.35):
            cyl(_n(g, 'wheel'), 0.08, 0.06, (sx, sy, 0.08), 'plastic_black', g, rot=(0, 90, 0), verts=8)
    box(_n(g, 'bag'), (0.5, 0.45, 0.4), (0.4, -0.1, 1.35), 'plastic_black', g, rot=(0, 10, 20), bevel=0.12, segments=1)
    return g


def parking_pad(name='parking', location=(0, 0, 0), rotation=0, w=6.0, d=5.0, bays=2):
    """Flat parking pad with white bay lines (not an obstacle)."""
    g = _g(name, location, rotation)
    box(_n(g, 'pad'), (w, d, 0.05), (0, 0, 0.025), 'concrete', g, bevel=0.02, segments=1)
    for k in range(bays + 1):
        x = -w / 2 + 0.3 + (w - 0.6) * k / bays
        box(_n(g, 'line'), (0.1, d * 0.7, 0.012), (x, d * 0.1, 0.055), 'paper', g, bevel=0.0)
    return g


def planter(name='planter', location=(0, 0, 0), rotation=0, length=1.6, seed=5):
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle=True)
    box(_n(g, 'box'), (length, 0.5, 0.5), (0, 0, 0.25), 'terracotta', g, bevel=0.04, segments=1)
    for i in range(4):
        sphere(_n(g, 'leaf'), rng.uniform(0.2, 0.28), (-length / 2 + 0.25 + i * (length - 0.5) / 3, 0, 0.6),
               'plant' if i % 2 else 'plant_dark', g, segs=9, rings=5)
        if i % 2 == 0:
            sphere(_n(g, 'flower'), 0.07, (-length / 2 + 0.3 + i * (length - 0.5) / 3, -0.15, 0.78), 'fabric_coral', g,
                   segs=6, rings=4)
    return g


def fountain(name='fountain', location=(0, 0, 0), rotation=0):
    """Round park fountain: stone basin, water, a two-tier bowl with a little spout."""
    g = _g(name, location, rotation, obstacle=True)
    lathe(_n(g, 'basin'), [(1.3, 0), (1.35, 0.1), (1.35, 0.45), (1.2, 0.5), (1.12, 0.5), (1.12, 0.3)], (0, 0, 0),
          'wall_cream', g, verts=28, cap_bottom=False)
    cyl(_n(g, 'water'), 1.14, 0.06, (0, 0, 0.33), 'wall_sky', g, verts=28, bevel=0.0)
    cyl(_n(g, 'column'), 0.16, 1.0, (0, 0, 0.8), 'wall_cream', g, verts=12)
    lathe(_n(g, 'bowl'), [(0.1, 0), (0.55, 0.12), (0.6, 0.22), (0.5, 0.22), (0.45, 0.16)], (0, 0, 1.2), 'wall_cream', g,
          verts=20, cap_bottom=True)
    cyl(_n(g, 'bowl_water'), 0.48, 0.03, (0, 0, 1.37), 'wall_sky', g, verts=20, bevel=0.0)
    lathe(_n(g, 'spout'), [(0.08, 0), (0.05, 0.25), (0.02, 0.45), (0.0, 0.5)], (0, 0, 1.38), 'wall_sky', g, verts=10)
    for k in range(6):
        a = 2 * math.pi * k / 6
        tube(_n(g, 'jet'), B.bezier((0.4 * math.cos(a), 0.4 * math.sin(a), 1.36), (0.55 * math.cos(a), 0.55 * math.sin(a),
                                                                                 1.45),
                                     (0.8 * math.cos(a), 0.8 * math.sin(a), 1.2), (0.9 * math.cos(a), 0.9 * math.sin(a),
                                                                                 0.36), 5),
             0.025, 'wall_sky', g, res=5)
    return g


def flower_bed(name='flowers', location=(0, 0, 0), rotation=0, r=0.9, seed=6):
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle=False)
    cyl(_n(g, 'soil'), r, 0.12, (0, 0, 0.06), 'wood_dark', g, verts=18)
    for i in range(10):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0, r * 0.75)
        sphere(_n(g, 'leaf'), rng.uniform(0.14, 0.2), (rr * math.cos(a), rr * math.sin(a), 0.2), 'plant', g, segs=7,
               rings=4)
        sphere(_n(g, 'bloom'), 0.07, (rr * math.cos(a), rr * math.sin(a), 0.36),
               rng.choice(['fabric_coral', 'mcd_yellow', 'rug_rose', 'plastic_white']), g, segs=6, rings=4)
    return g


def bike_rack(name='bike_rack', location=(0, 0, 0), rotation=0, bikes=1):
    g = _g(name, location, rotation, obstacle=True)
    for k in range(3):
        tube(_n(g, 'hoop'), [(k * 0.5 - 0.5, 0, 0), (k * 0.5 - 0.5, 0, 0.6), (k * 0.5 - 0.5 + 0.02, 0.3, 0.75),
                             (k * 0.5 - 0.5, 0.6, 0.6), (k * 0.5 - 0.5, 0.6, 0)], 0.025, 'metal', g, res=5)
    for b in range(bikes):
        bx = -0.25 + b * 0.5
        for wy in (-0.35, 0.65):
            B.torus(_n(g, 'wheel'), 0.3, 0.025, (bx + 0.12, wy, 0.32), 'plastic_black', g, rot=(0, 90, 0), major=14,
                    minor=4)
        tube(_n(g, 'frame'), [(bx + 0.12, -0.35, 0.32), (bx + 0.12, 0.1, 0.62), (bx + 0.12, 0.65, 0.32),
                              (bx + 0.12, 0.2, 0.3), (bx + 0.12, -0.35, 0.32)], 0.022, 'fabric_teal', g, res=5)
        box(_n(g, 'saddle'), (0.1, 0.22, 0.05), (bx + 0.12, 0.3, 0.72), 'plastic_black', g, bevel=0.02, segments=1)
        tube(_n(g, 'bars'), [(bx - 0.1, -0.2, 0.75), (bx + 0.34, -0.2, 0.75)], 0.018, 'metal', g, res=5)
    return g
