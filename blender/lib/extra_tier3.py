"""Room-specific builders for tier3 (the Creator Loft). Owned by the tier2/tier3 room builder.

brick_face()   exposed-brick relief on a wall's inner face (pillow bricks, openings clipped), parented to the wall
duct_run()     round exposed ventilation duct with hanger straps along a wall top
backdrop()     seamless paper backdrop on two stands (the filming corner)
guitar_stand() acoustic guitar on a little A-frame stand
clothes_rail() open clothing rail with shirts on hangers, a shoe row and a basket
wall_sconce()  industrial swing-arm sconce with a caged bulb (m_lampshade)
"""
import math
import random

import build as B


def brick_face(R, side, z0=0.1, z1=None, course=0.105, blen=0.29, mortar=0.013, proud=0.014, mats=('brick', 'terracotta'),
               odd=0.16, seed=7, name=None, smooth=True):
    """Brick relief covering the inner face of wall `side` from z0 to z1 (default wall top), skipping the wall's
    openings (bricks are clipped at the opening edges). One mesh, parented to the wall (merged into <wall>_trim)."""
    rng = random.Random(seed)
    W, D, H = R.ROOM['w'], R.ROOM['d'], R.ROOM['h']
    z1 = z1 if z1 is not None else H - 0.004
    ns = side in ('n', 's')
    length = W if ns else D
    holes = []
    for op in R.ROOM['openings']:
        if op['wall'] != side:
            continue
        pad = 0.07 if op['kind'] == 'door' else 0.05
        holes.append((op['at'] - op['width'] / 2 - pad, op['at'] + op['width'] / 2 + pad,
                      op['sill'] - (0.0 if op['kind'] == 'door' else 0.06), op['sill'] + op['height'] + pad))
    verts, faces, midx = [], [], []
    g = mortar / 2
    inward = {'n': (0, -1), 's': (0, 1), 'e': (-1, 0), 'w': (1, 0)}[side]
    face_c = {'n': D / 2, 's': -D / 2, 'e': W / 2, 'w': -W / 2}[side]

    def P(u, v, z):
        # u along the wall, v = distance into the room from the face
        if ns:
            return (u, face_c + inward[1] * v, z)
        return (face_c + inward[0] * v, u, z)

    def brick(u0, u1, za, zb, m):
        b = len(verts)
        bev = min(0.012, (u1 - u0) * 0.3, (zb - za) * 0.3)
        verts.extend([P(u0, 0.001, za), P(u1, 0.001, za), P(u1, 0.001, zb), P(u0, 0.001, zb),
                      P(u0 + bev, proud, za + bev), P(u1 - bev, proud, za + bev), P(u1 - bev, proud, zb - bev),
                      P(u0 + bev, proud, zb - bev)])
        # front, right, top, left (the bottom bevel faces the floor: never seen from the high game camera)
        quads = [(4, 5, 6, 7), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        for q in quads:
            faces.append(tuple(b + i for i in q))
            midx.append(m)

    row = 0
    z = z0
    while z + course * 0.5 < z1:
        za, zb = z + g, min(z + course - g, z1)
        off = (blen / 2 if row % 2 else 0.0) - length / 2 - rng.uniform(0, 0.02)
        u = off
        while u < length / 2:
            a, b = max(u + g, -length / 2 + 0.002), min(u + blen - g, length / 2 - 0.002)
            segs = [(a, b)]
            for h0, h1, hz0, hz1 in holes:
                if zb <= hz0 or za >= hz1:
                    continue
                nsg = []
                for s0, s1 in segs:
                    if s1 <= h0 or s0 >= h1:
                        nsg.append((s0, s1))
                        continue
                    if s0 < h0:
                        nsg.append((s0, h0 - g))
                    if s1 > h1:
                        nsg.append((h1 + g, s1))
                segs = nsg
            for s0, s1 in segs:
                if s1 - s0 > 0.04:
                    m = 1 if rng.random() < odd else 0
                    brick(s0, s1, za, zb, m)
            u += blen
        z += course
        row += 1
    # sign flips on e/w walls reverse the winding; fix normals after building
    o = B.mesh_from_data(name or f'bricks_{side}', verts, faces, list(mats), parent='root', smooth=smooth, mat_idx=midx)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    R.on_wall(o, side)
    return o


def duct_run(R, side, x0, x1, z=3.02, off=0.24, r=0.13, name='duct'):
    """Exposed round duct along wall `side` from x0 to x1 (coordinate along the wall), with hanger straps and a
    couple of joint rings. Parented to the wall."""
    g = B.group(name, (0, 0, 0))
    p0 = R.wall_point(side, x0, z, off)
    p1 = R.wall_point(side, x1, z, off)
    B.tube(B.uname(name + '_pipe'), [p0, p1], r, 'metal', g, res=16)
    n = max(2, int(abs(x1 - x0) / 2.4))
    for i in range(n + 1):
        t = i / n
        at = x0 + (x1 - x0) * t
        c = R.wall_point(side, at, z, off)
        rot = B.against(side)
        B.torus(B.uname(name + '_ring'), r + 0.008, 0.012, c, 'metal_dark', g, rot=(0, 90, rot + 90) if side in 'ns'
                else (0, 90, rot + 90), major=14, minor=4)
        # strap to the wall
        w0 = R.wall_point(side, at, z + r * 0.6, 0.0)
        B.tube(B.uname(name + '_strap'), [w0, (c[0], c[1], z + r * 0.6)], 0.01, 'metal_dark', g)
    R.on_wall(g, side)
    return g


def backdrop(name='backdrop', location=(0, 0, 0), rotation=0, width=2.1, height=2.35, sweep=0.9, mat='fabric_teal',
             parent='root'):
    """Seamless paper backdrop: two light stands + crossbar + roll, paper falling and curving onto the floor toward
    local -Y (the subject stands on the paper). Origin at the floor under the roll's centre. Not an obstacle."""
    g = B.group(name, location, rotation, parent=parent)
    hw = width / 2
    # stands
    for s in (-1, 1):
        x = s * (hw + 0.08)
        B.cyl(B.uname(name + '_pole'), 0.016, height + 0.15, (x, 0.06, (height + 0.15) / 2), 'metal_dark', g, verts=8)
        for k in range(3):
            a = math.radians(90 + k * 120)
            B.tube(B.uname(name + '_leg'), [(x, 0.06, 0.45), (x + math.cos(a) * 0.32, 0.06 + math.sin(a) * 0.32, 0.0)],
                   0.011, 'metal_dark', g)
    B.cyl(B.uname(name + '_bar'), 0.014, width + 0.2, (0, 0.06, height + 0.1), 'metal_dark', g, rot=(0, 90, 0), verts=8)
    B.cyl(B.uname(name + '_roll'), 0.06, width, (0, 0.06, height), mat, g, rot=(0, 90, 0), verts=16)
    # paper profile: down from the roll, quarter circle, flat on the floor toward -Y
    prof = [(0.0, height - 0.02)]
    rr = 0.35
    prof.append((0.0, rr))
    for i in range(1, 7):
        a = math.radians(90 * i / 6)
        prof.append((-(rr - rr * math.cos(a)), rr - rr * math.sin(a) + 0.004))
    prof.append((-(rr + sweep), 0.004))
    verts, faces = [], []
    for (py, pz) in prof:
        verts.append((-hw, py, pz))
        verts.append((hw, py, pz))
    for i in range(len(prof) - 1):
        a = 2 * i
        faces.append((a, a + 1, a + 3, a + 2))
    B.mesh_from_data(B.uname(name + '_paper'), verts, faces, mat, g, smooth=True)
    # sandbag on each stand foot
    for s in (-1, 1):
        B.blob(B.uname(name + '_sandbag'), (0.16, 0.26, 0.08), (s * (hw + 0.08), 0.28, 0.04), 'fabric_grey', g,
               round_xy=0.5, round_z=0.6, segs=10, rings=6)
    return g


def guitar_stand(name='guitar', location=(0, 0, 0), rotation=0, body='wood_mid', neck='wood_dark', parent='root',
                 obstacle=False):
    """Acoustic guitar leaning back on a small A-frame stand, face toward local -Y."""
    g = B.group(name, location, rotation, parent=parent)
    if obstacle:
        B.obstacle(g)
    lean = 14
    # stand
    for s in (-1, 1):
        B.tube(B.uname(name + '_st'), [(s * 0.16, -0.12, 0.0), (s * 0.08, 0.04, 0.32)], 0.01, 'plastic_black', g)
        B.tube(B.uname(name + '_st'), [(s * 0.08, 0.04, 0.32), (s * 0.02, 0.2, 0.0)], 0.01, 'plastic_black', g)
    B.tube(B.uname(name + '_cradle'), [(-0.13, -0.1, 0.12), (0.13, -0.1, 0.12)], 0.012, 'plastic_black', g)
    # body (lower bout + upper bout) tilted back
    sub = B.group(B.uname(name + '_body'), (0, -0.06, 0.1), (-lean, 0, 0), parent=g)
    B.blob(B.uname(name + '_bout'), (0.4, 0.11, 0.38), (0, 0, 0.22), body, sub, round_xy=0.9, round_z=0.9, segs=14,
           rings=6)
    B.blob(B.uname(name + '_ubout'), (0.3, 0.1, 0.28), (0, 0, 0.5), body, sub, round_xy=0.9, round_z=0.9, segs=12,
           rings=6)
    B.cyl(B.uname(name + '_hole'), 0.055, 0.01, (0, -0.052, 0.42), 'plastic_black', sub, rot=(90, 0, 0), verts=16)
    B.box(B.uname(name + '_bridge'), (0.14, 0.02, 0.025), (0, -0.055, 0.2), neck, sub, bevel=0.004)
    B.box(B.uname(name + '_neck'), (0.055, 0.035, 0.5), (0, -0.03, 0.86), neck, sub, bevel=0.008)
    B.box(B.uname(name + '_head'), (0.08, 0.035, 0.16), (0, -0.025, 1.18), neck, sub, rot=(8, 0, 0), bevel=0.01)
    return g


def clothes_rail(name='clothes_rail', location=(0, 0, 0), rotation=0, w=1.2, seed=3, parent='root'):
    """Open clothing rail (front = local -Y): black steel frame, shirts on hangers, a shoe row and a woven basket."""
    rng = random.Random(seed)
    g = B.group(name, location, rotation, parent=parent)
    B.obstacle(g)
    h = 1.65
    for s in (-1, 1):
        B.cyl(B.uname(name + '_post'), 0.015, h, (s * w / 2, 0, h / 2), 'metal_dark', g, verts=8)
        B.box(B.uname(name + '_foot'), (0.04, 0.45, 0.03), (s * w / 2, 0, 0.015), 'metal_dark', g, bevel=0.008)
    B.cyl(B.uname(name + '_bar'), 0.013, w, (0, 0, h - 0.04), 'metal_dark', g, rot=(0, 90, 0), verts=8)
    B.box(B.uname(name + '_shelf'), (w - 0.04, 0.38, 0.025), (0, 0, 0.2), 'wood_light', g, bevel=0.006)
    mats = ['fabric_cream', 'fabric_navy', 'fabric_mustard', 'fabric_coral', 'fabric_cream']
    n = int(w / 0.09)
    for i in range(n):
        x = -w / 2 + 0.1 + i * (w - 0.2) / max(1, n - 1)
        if rng.random() < 0.18:
            continue
        ln = rng.uniform(0.55, 0.85)
        m = mats[rng.randrange(len(mats))]
        B.tube(B.uname(name + '_hanger'), [(x, -0.18, h - 0.1), (x, 0, h - 0.03), (x, 0.18, h - 0.1)], 0.004,
               'wood_light', g, res=4)
        B.prism(B.uname(name + '_shirt'), [(-0.2, -ln), (0.2, -ln), (0.22, -0.12), (0.12, 0.0), (-0.12, 0.0),
                                           (-0.22, -0.12)], 0.035, (x - 0.0175, 0, h - 0.09), m, g,
                rot=(90, 0, 90 + rng.uniform(-5, 5)), bevel=0.012, segments=1)
    # shoes on the bottom shelf + basket
    for i, m in enumerate(('plastic_white', 'fabric_coral')):
        for s in (-1, 1):
            B.box(B.uname(name + '_shoe'), (0.1, 0.25, 0.08), (-w / 2 + 0.22 + i * 0.28 + s * 0.06, 0.0, 0.255), m, g,
                  rot=s * 4, bevel=0.03, segments=2)
    B.lathe(B.uname(name + '_basket'), [(0.14, 0), (0.17, 0.2), (0.165, 0.2), (0.13, 0.01)], (w / 2 - 0.25, 0, 0.215),
            'kraft', g, verts=14)
    return g


def wall_sconce(name, loc, rot, arm='metal_dark', parent='root'):
    """Swing-arm wall sconce with a caged bulb; loc = centre of its back plate on the wall. Parent to the wall."""
    g = B.group(name, loc, rot, parent=parent)
    B.cyl(B.uname(name + '_plate'), 0.05, 0.02, (0, -0.01, 0), arm, g, rot=(90, 0, 0), verts=12)
    B.tube(B.uname(name + '_arm'), [(0, -0.02, 0), (0, -0.2, 0.05), (0, -0.3, 0.02)], 0.009, arm, g)
    B.cone(B.uname(name + '_shade'), 0.09, 0.1, (0, -0.3, -0.09), arm, g, r2=0.025, verts=14)
    B.sphere(B.uname(name + '_bulb'), 0.04, (0, -0.3, -0.1), 'lampshade', g, segs=10, rings=6)
    return g


def counter_stool(g, loc, rot=0.0, seat='fabric_mustard', frame='metal_dark', height=0.65, back=True):
    """Light counter stool (~300 tris) built into group g at local loc; the sitter faces local -Y of `rot`."""
    sub = B.group(B.uname(g.name + '_stool'), loc, rot, parent=g)
    B.cyl(B.uname(g.name + '_seat'), 0.19, 0.06, (0, 0, height - 0.03), seat, sub, verts=16, bevel=0.02)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        B.tube(B.uname(g.name + '_leg'), [(math.cos(a) * 0.12, math.sin(a) * 0.12, height - 0.06),
                                          (math.cos(a) * 0.19, math.sin(a) * 0.19, 0.0)], 0.012, frame, sub, res=5)
    B.torus(B.uname(g.name + '_ring'), 0.165, 0.009, (0, 0, 0.26), frame, sub, major=14, minor=4)
    if back:
        B.tube(B.uname(g.name + '_back'), [(-0.13, 0.12, height - 0.02), (-0.14, 0.15, height + 0.22),
                                           (0.14, 0.15, height + 0.22), (0.13, 0.12, height - 0.02)], 0.011, frame,
               sub, res=5)
        B.box(B.uname(g.name + '_backpad'), (0.28, 0.035, 0.09), (0, 0.155, height + 0.2), seat, sub, bevel=0.012)
    return sub


def island(length=2.4, depth=0.95, name='island', location=(0, 0, 0), rotation=0, body='fabric_navy',
           top='wood_light', slat='wood_light', stools=3, stool_mat='fabric_mustard', interact=None, anchors_eat=None,
           seed=1):
    """Kitchen island (top 0.9 m) with cabinet doors on local +Y (the kitchen side), a fluted slat panel and an
    overhang on local -Y with `stools` counter stools. A lighter stand-in for furniture.kitchen_island (~2.5k tris
    instead of ~7.5k). anchors_eat -> seat anchor at the middle stool facing +Y."""
    import furniture as F
    rng = random.Random(seed)
    g = B.group(name, location, rotation)
    B.obstacle(g)
    if interact:
        B.interactive(g, interact)
    H = 0.9
    cd = depth - 0.3
    L = length - 0.1
    B.box(B.uname(name + '_body'), (L, cd, H - 0.14), (0, 0.15, 0.1 + (H - 0.14) / 2), body, g, bevel=0.012)
    B.box(B.uname(name + '_kick'), (L - 0.06, cd - 0.06, 0.1), (0, 0.15, 0.05), 'metal_dark', g, bevel=0.004,
          segments=1)
    n = max(1, round(L / 0.6))
    wdt = L / n
    for i in range(n):
        x = -L / 2 + wdt / 2 + i * wdt
        B.box(B.uname(name + '_front'), (wdt - 0.014, 0.02, H - 0.17), (x, 0.15 + cd / 2 + 0.008, 0.1 + (H - 0.14) / 2),
              body, g, bevel=0.006, segments=1)
        B.box(B.uname(name + '_handle'), (0.12, 0.02, 0.014), (x, 0.15 + cd / 2 + 0.028, H - 0.12), 'metal', g,
              bevel=0.004, segments=1)
    k = int(L / 0.12)
    for i in range(k):
        B.box(B.uname(name + '_slat'), (0.07, 0.02, H - 0.2), (-L / 2 + 0.06 + i * (L - 0.12) / max(1, k - 1),
                                                               0.15 - cd / 2 - 0.01, 0.1 + (H - 0.14) / 2),
              slat, g, bevel=0.006, segments=1)
    B.box(B.uname(name + '_top'), (length, depth, 0.05), (0, 0, H - 0.025), top, g, bevel=0.014)
    # clutter: fruit bowl, cookbooks, a cutting board with bread, a little plant
    B.lathe(B.uname(name + '_bowl'), [(0.05, 0), (0.12, 0.06), (0.13, 0.08), (0.12, 0.08), (0.04, 0.01)],
            (0.35, 0.12, H), 'plastic_white', g, verts=14)
    for i, m in enumerate(('mcd_red', 'fabric_mustard', 'mcd_red', 'fabric_mustard')):
        B.sphere(B.uname(name + '_fruit'), 0.042, (0.35 + math.cos(i * 1.6) * 0.05, 0.12 + math.sin(i * 1.6) * 0.05,
                                                  H + 0.07 + (0.03 if i == 3 else 0)), m, g, segs=8, rings=5)
    for i, (m, hh) in enumerate((('fabric_navy', 0.035), ('fabric_mustard', 0.03), ('wood_light', 0.04))):
        B.box(B.uname(name + '_book'), (0.22 - i * 0.02, 0.16, hh), (-length / 2 + 0.3, 0.15, H + 0.02 + i * 0.037), m,
              g, rot=12 - i * 9, bevel=0.004)
    B.box(B.uname(name + '_board'), (0.36, 0.22, 0.02), (-0.2, 0.18, H + 0.01), 'wood_mid', g, rot=-8, bevel=0.006)
    B.blob(B.uname(name + '_bread'), (0.22, 0.1, 0.08), (-0.2, 0.18, H + 0.06), 'wood_light', g, rot=-8,
           round_xy=0.7, round_z=0.7, segs=10, rings=5)
    F.small_plant(parent=g, location=(length / 2 - 0.22, 0.2, H), style='succulent', obstacle=False, seed=seed)
    step = min(0.6, (length - 0.2) / max(1, stools))
    for i in range(stools):
        sx = (i - (stools - 1) / 2) * step
        counter_stool(g, (sx, -depth / 2 - 0.12 + rng.uniform(-0.02, 0.02), 0), 180 + rng.uniform(-6, 6), stool_mat)
    if anchors_eat and stools:
        B.anchor(anchors_eat, (0 if stools % 2 else -step / 2, -depth / 2 - 0.2, 0), 'n', frame=g)
    return g


def table_clutter(name, location, rotation=0, seed=1, top=0.42):
    """Light coffee-table clutter group (magazines, mug, remote, candle): not an obstacle, sits on a table top."""
    import furniture as F
    rng = random.Random(seed)
    g = B.group(name, location, rotation)
    B.box(B.uname(name + '_mag'), (0.24, 0.3, 0.01), (-0.18, 0.02, top + 0.005), 'poster_b', g, rot=12, bevel=0.0)
    B.box(B.uname(name + '_mag'), (0.22, 0.28, 0.01), (-0.16, 0.0, top + 0.015), 'fabric_coral', g, rot=-5, bevel=0.0)
    F.mug(g, (0.12, 0.08, top), 'fabric_teal')
    B.box(B.uname(name + '_remote'), (0.05, 0.16, 0.02), (0.18, -0.12, top + 0.01), 'plastic_black', g, rot=25,
          bevel=0.006, segments=1)
    B.cyl(B.uname(name + '_candle'), 0.04, 0.08, (0.0, 0.14, top + 0.04), 'paper', g, verts=12)
    return g
