"""Title screen diorama: a city block at dusk (docs/3D.md section 8) -> public/assets/3d/title_city.glb.

    node blender/run.mjs title_city --preview
    node blender/inspect.mjs public/assets/3d/title_city.glb --check title

A floating 40 x 30 m block: an E-W street and a N-S street crossing with zebra crossings, the player's walk-up
apartment (one warm window) with a delivery van unloading parcels, the corner McDoodle's with striped awnings and a
rooftop burger sign, a corner shop with a rooftop billboard (abstract shopping-bag icon), a small park with a bus
stop, street lamps (l_* anchors), trees, traffic lights, cars. a_cam / a_cam_target frame it from the south-east
with the upper third of a 16:9 frame left empty for the logo (vertical FOV 30, like the runtime camera); the
runtime's orbit mode keeps a_cam's elevation and FOV and refits the distance per yaw and aspect.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import bpy                         # noqa: E402
from mathutils import Vector       # noqa: E402

import build as B                  # noqa: E402
import extra_title_city as T       # noqa: E402
from palette import get_mat, hex_to_linear   # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D = 40.0, 30.0
X, Y = W / 2, D / 2
ROAD_Y = (-7.0, -1.0)            # E-W street
ROAD_X = (6.0, 12.0)             # N-S street
PAD_Z = 0.15                     # sidewalk / block height above the asphalt
FOV = 30.0                       # vertical, degrees (three.js PerspectiveCamera.fov)

B.set_root(None)
root = B.group('room', parent=None, room='title_city', w=W, d=D, wallH=3.0)
B.set_root(root)

# ---- ground: slab, asphalt, raised blocks with sidewalks, grass --------------------------------------------------
B.box('slab', (W + 0.6, D + 0.6, 1.3), (0, 0, -0.65 - 0.04), 'slab', 'root', bevel=0.3, segments=3)
B.box('slab_soil', (W + 0.3, D + 0.3, 0.3), (0, 0, -0.17), 'wood_dark', 'root', bevel=0.12, segments=2)
fl = B.box('floor', (W, D, 0.12), (0, 0, -0.06), 'tile_check_dark', 'root', bevel=0.04, segments=1)
fl['floor'] = True

blocks = {                               # x0, x1, y0, y1
    'nw': (-X, ROAD_X[0], ROAD_Y[1], Y),
    'ne': (ROAD_X[1], X, ROAD_Y[1], Y),
    'sw': (-X, ROAD_X[0], -Y, ROAD_Y[0]),
    'se': (ROAD_X[1], X, -Y, ROAD_Y[0]),
}
ground = B.group('ground')
for k, (x0, x1, y0, y1) in blocks.items():
    # the pad runs past the slab edge a little on the outer sides so the edge reads as one clean block
    B.box(f'pad_{k}', (x1 - x0, y1 - y0, PAD_Z), ((x0 + x1) / 2, (y0 + y1) / 2, PAD_Z / 2), 'wall_cream', ground,
          bevel=0.05, segments=1)
    # kerb: a white lip along the road edges
    for (ax, ay, bx, by) in ((x0, y0, x1, y0), (x0, y1, x1, y1), (x0, y0, x0, y1), (x1, y0, x1, y1)):
        on_road = (ay == by and (abs(ay - ROAD_Y[0]) < 0.01 or abs(ay - ROAD_Y[1]) < 0.01)) or \
                  (ax == bx and (abs(ax - ROAD_X[0]) < 0.01 or abs(ax - ROAD_X[1]) < 0.01))
        if not on_road:
            continue
        if ay == by:
            B.box(f'kerb_{k}', (x1 - x0, 0.22, PAD_Z + 0.02), ((x0 + x1) / 2, ay, (PAD_Z + 0.02) / 2), 'plastic_white',
                  ground, bevel=0.04, segments=1)
        else:
            B.box(f'kerb_{k}', (0.22, y1 - y0, PAD_Z + 0.02), (ax, (y0 + y1) / 2, (PAD_Z + 0.02) / 2), 'plastic_white',
                  ground, bevel=0.04, segments=1)


def grass(name, x0, x1, y0, y1, mat='rug_green'):
    B.box(name, (x1 - x0, y1 - y0, 0.06), ((x0 + x1) / 2, (y0 + y1) / 2, PAD_Z + 0.02), mat, ground, bevel=0.03,
          segments=1)


SW = 2.4                                    # sidewalk width
grass('grass_nw_back', -X + 0.3, -3.0, 12.4, Y - 0.3)
grass('grass_nw_side', -X + 0.3, -17.6, ROAD_Y[1] + SW + 0.2, 12.4)
grass('grass_ne_back', ROAD_X[1] + SW, X - 0.3, 9.0, Y - 0.3)
grass('grass_sw', -X + 0.3, ROAD_X[0] - SW, -Y + 0.3, ROAD_Y[0] - SW)
grass('grass_se', ROAD_X[1] + SW, X - 0.3, -Y + 0.3, ROAD_Y[0] - SW)
# park path (kraft gravel) through the south-west park
path_pts = [(-X + 0.3, -11.8), (-12, -12.4), (-6, -11.0), (-1.0, -10.6), (ROAD_X[0] - SW, -10.2)]
for i in range(len(path_pts) - 1):
    (ax, ay), (bx, by) = path_pts[i], path_pts[i + 1]
    L = math.hypot(bx - ax, by - ay)
    B.box('park_path', (L + 0.9, 1.4, 0.07), ((ax + bx) / 2, (ay + by) / 2, PAD_Z + 0.03), 'kraft', ground,
          rot=(0, 0, math.degrees(math.atan2(by - ay, bx - ax))), bevel=0.03, segments=1)

# ---- road markings: dashed centre lines + zebra crossings ------------------------------------------------------
marks = B.group('road_marks')
cy = sum(ROAD_Y) / 2
cx = sum(ROAD_X) / 2
x = -X + 1.0
while x < X - 1.0:
    if not (ROAD_X[0] - 3.2 < x < ROAD_X[1] + 3.2):
        B.box('dash', (1.4, 0.16, 0.02), (x, cy, 0.005), 'mcd_yellow', marks, bevel=0.0)
    x += 2.6
y = -Y + 1.0
while y < Y - 1.0:
    if not (ROAD_Y[0] - 3.2 < y < ROAD_Y[1] + 3.2):
        B.box('dash', (0.16, 1.4, 0.02), (cx, y, 0.005), 'mcd_yellow', marks, bevel=0.0)
    y += 2.6
for xx in (ROAD_X[0] - 1.6, ROAD_X[1] + 1.6):             # crossings over the E-W street
    for i in range(6):
        B.box('zebra', (2.0, 0.5, 0.02), (xx, ROAD_Y[0] + 0.5 + i * 1.0, 0.005), 'paper', marks, bevel=0.0)
for yy in (ROAD_Y[1] + 1.6, ROAD_Y[0] - 1.6):             # crossings over the N-S street
    for i in range(6):
        B.box('zebra', (0.5, 2.0, 0.02), (ROAD_X[0] + 0.5 + i * 1.0, yy, 0.005), 'paper', marks, bevel=0.0)
for xx, yy, sx, sy in ((ROAD_X[0] - 3.0, cy, 0.3, 5.8), (ROAD_X[1] + 3.0, cy, 0.3, 5.8),
                       (cx, ROAD_Y[1] + 3.0, 5.8, 0.3), (cx, ROAD_Y[0] - 3.0, 5.8, 0.3)):
    B.box('stop_line', (sx if sx < 1 else sx, sy, 0.02), (xx, yy, 0.005), 'paper', marks, bevel=0.0)

# ---- buildings -----------------------------------------------------------------------------------------------------
T.apartment('apartment', location=(-11.8, 8.6, PAD_Z), w=10.5, d=7.0, floors=4, floor_h=3.0,
            lit=(('s', 1, 2),), seed=3)
T.burger_joint('restaurant', location=(0.0, 4.9, PAD_Z), w=8.0, d=6.6, h=4.4)
T.shop('corner_shop', location=(16.4, 4.7, PAD_Z), w=6.4, d=6.0, floors=2, floor_h=3.3, wall='wall_sage',
       awning='fabric_coral', seed=5)
T.billboard('billboard', location=(16.4, 4.9, PAD_Z + 6.6 + 0.2), rotation=45, w=6.0, h=3.0)
# a low garage / storage block behind the restaurant (gives the back of the block some depth)
g = B.group('garage_block', (-0.5, 12.4, PAD_Z))
B.obstacle(g)
B.box('garage_body', (7.0, 4.6, 3.0), (0, 0, 1.5), 'wall_sky', g, bevel=0.05, segments=1)
B.box('garage_roof', (7.3, 4.9, 0.2), (0, 0, 3.05), 'plastic_white', g, bevel=0.04, segments=1)
for i in range(2):
    B.box('garage_door', (2.6, 0.08, 2.3), (-1.7 + i * 3.4, -2.33, 1.15), 'plastic_white', g, bevel=0.03, segments=1)
    for k in range(5):
        B.box('garage_slat', (2.5, 0.04, 0.03), (-1.7 + i * 3.4, -2.39, 0.3 + k * 0.42), 'plastic_grey', g, bevel=0.0)

# ---- street furniture -------------------------------------------------------------------------------------------
lamps = B.group('street_lamps')                 # all lamps merge into one mesh (draw calls); l_* anchors stay separate
sw_n = ROAD_Y[1] + 1.1          # lamp line on the north sidewalk of the E-W street
sw_s = ROAD_Y[0] - 1.1
T.street_lamp('lamp_1', (-15.5, sw_n, PAD_Z), 0, light='l_lamp_1', parent=lamps)
T.street_lamp('lamp_2', (-5.5, sw_n, PAD_Z), 0, light='l_lamp_2', parent=lamps)
T.street_lamp('lamp_3', (-9.0, sw_s, PAD_Z), 180, light='l_lamp_3', parent=lamps)
T.street_lamp('lamp_4', (1.5, sw_s, PAD_Z), 180, light='l_lamp_4', parent=lamps)
T.street_lamp('lamp_5', (ROAD_X[1] + 1.1, 10.0, PAD_Z), 90, light='l_lamp_5', parent=lamps)
T.street_lamp('lamp_6', (ROAD_X[1] + 1.1, -11.5, PAD_Z), 90, light='l_lamp_6', parent=lamps)
T.street_lamp('lamp_7', (17.0, sw_n, PAD_Z), 0, light='l_lamp_7', parent=lamps)
T.traffic_light('traffic_light_1', (ROAD_X[0] - 0.7, ROAD_Y[1] + 0.7, PAD_Z), 90, green=True)
T.traffic_light('traffic_light_2', (ROAD_X[1] + 0.7, ROAD_Y[0] - 0.7, PAD_Z), -90, green=True)
T.traffic_light('traffic_light_3', (ROAD_X[1] + 0.7, ROAD_Y[1] + 0.7, PAD_Z), 180, green=False)
T.hydrant('hydrant', (-2.5, sw_n - 0.3, PAD_Z), 0)
T.mailbox('mailbox', (ROAD_X[1] + 1.0, 1.4, PAD_Z), -90)
T.bus_stop('bus_stop', (-4.5, sw_s - 0.3, PAD_Z), 180)
T.bench('bench_park', (-6.9, -12.4, PAD_Z), -10)
T.apartment('flats_ne', location=(17.2, 12.35, PAD_Z), w=5.0, d=4.6, floors=3, floor_h=3.0, wall='wall_sky',
            base='wall_cream', trim='plastic_white', lit=(), seed=9)
T.dumpster('dumpster', (3.4, 9.3, PAD_Z), 180)
T.fountain('fountain', (-9.5, -11.4, PAD_Z + 0.06), 0)
T.flower_bed('flowers_1', (-3.2, -12.9, PAD_Z + 0.06), seed=6)
T.flower_bed('flowers_2', (-15.2, -10.6, PAD_Z + 0.06), r=0.8, seed=7)
T.flower_bed('flowers_3', (-19.0, 12.0, PAD_Z + 0.06), r=0.7, seed=8)
T.bike_rack('bike_rack', (ROAD_X[1] + 1.3, 8.0 - 0.5, PAD_Z), 90, bikes=1)
T.parking_pad('parking_se', (17.0, -11.4, PAD_Z + 0.02), 0, w=5.6, d=5.2, bays=2)
T.planter('planter_1', (-4.4, 0.9, PAD_Z), 0, 1.6, seed=3)
T.planter('planter_2', (ROAD_X[1] + 1.9, -2.2 + 3.4, PAD_Z), 90, 1.4, seed=4)
T.bench('bench_nw', (-15.8, 3.0, PAD_Z), 90, mat='fabric_mustard')
T.patio_table('patio_1', (-5.7, 3.0, PAD_Z), 0, umbrella='mcd_red')
T.patio_table('patio_2', (-5.7, 6.2, PAD_Z), 0, umbrella='mcd_yellow')
B.box('trash_can', (0.5, 0.5, 0.9), (3.4, sw_n - 0.5, PAD_Z + 0.45), 'fabric_teal', 'root', bevel=0.08, segments=1)

# ---- vehicles + the delivery ------------------------------------------------------------------------------------
T.van('van', (-12.6, ROAD_Y[1] - 1.35, 0.0), -90, body='plastic_white', accent='fabric_teal')   # parked, nose west
T.parcel_stack('parcels', (-8.4, ROAD_Y[1] + 1.2, PAD_Z), 8, n=6)
T.car('car_1', (ROAD_X[1] - 1.5, 7.0, 0.0), 180, body='fabric_coral')        # driving north
T.car('car_2', (-1.5, ROAD_Y[0] + 1.5, 0.0), 90, body='poster_b')             # driving east
T.car('car_3', (15.6, -11.0, PAD_Z + 0.07), 180, body='fabric_mustard')     # parked in the SE corner lot

# ---- trees and bushes -------------------------------------------------------------------------------------------
trees = [
    ('round', -18.5, 13.8, 5.0), ('pine', -15.0, 14.0, 5.5), ('round', -7.0, 13.8, 4.6), ('bush', -18.6, 3.5, 1.0),
    ('bush', -18.6, 7.0, 1.0), ('round', -18.4, 10.3, 4.2),
    ('pine', 13.6, 14.0, 4.6), ('bush', 19.2, 8.6, 1.0),
    ('round', -17.2, -9.8, 4.8), ('round', -13.5, -13.9, 4.2), ('pine', -18.8, -13.6, 5.0), ('round', -6.8, -13.8, 4.4),
    ('bush', -1.8, -13.9, 1.0), ('round', 2.0, -12.8, 4.0), ('bush', 3.9, -9.6, 1.0),
    ('round', 18.6, -9.6, 3.8), ('bush', 14.3, -14.2, 1.0),
]
greenery = B.group('trees')                     # all trees merge into one mesh
for i, (style, tx, ty, th) in enumerate(trees):
    T.tree(f'tree_{i + 1}', (tx, ty, PAD_Z + 0.02), style, th, seed=i + 1, pit=False, parent=greenery)
for i, tx in enumerate((-17.8, -9.6, -3.4)):                           # street trees in pits, north sidewalk
    if abs(tx - -8.4) < 1.0:
        continue
    T.tree(f'street_tree_{i + 1}', (tx, ROAD_Y[1] + 1.4 if tx > -9 else ROAD_Y[1] + 1.4, PAD_Z), 'round', 4.0,
           seed=40 + i, pit=True, parent=greenery)

# ---- camera ----------------------------------------------------------------------------------------------------------


def scene_points():
    pts = []
    for c in root.children:
        if c.name.startswith(('a_', 'l_')):
            continue
        try:
            lo, hi = B.world_bbox(c)
        except Exception:
            continue
        if lo is None:
            continue
        pts += [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
    return [Vector(p) for p in pts]


def fit_orbit(points, az_deg=45.0, el_deg=32.0, fov_v=FOV, aspect=16 / 9, top=0.30, bottom=-0.92, side=0.94,
              orbit_top=0.40, orbit_side=0.98, yaws=tuple(range(0, 360, 15))):
    """Camera looking at T = (0, 0, h) from azimuth/elevation. At the default yaw every point must land inside NDC
    x in [-side, side], y in [bottom, top] (top = 0.3 keeps the upper third empty for the logo); at the other orbit
    yaws (the runtime circles T) the limits are a little looser (orbit_top, orbit_side). Returns (cam_pos, target)
    with the closest distance over the best h."""
    tv = math.tan(math.radians(fov_v) / 2)
    th = tv * aspect
    el = math.radians(el_deg)
    best = None
    for h10 in range(-40, 400, 5):
        h = h10 / 10.0
        T_ = Vector((0, 0, h))

        def fits(dist):
            for yaw in yaws:
                lim_t, lim_s = (top, side) if yaw == 0 else (orbit_top, orbit_side)
                a = math.radians(az_deg + yaw)
                back = Vector((math.sin(a) * math.cos(el), -math.cos(a) * math.cos(el), math.sin(el)))
                fwd = -back
                right = fwd.cross(Vector((0, 0, 1))).normalized()
                up = right.cross(fwd)
                pos = T_ + back * dist
                for p in points:
                    v = p - pos
                    z = v.dot(fwd)
                    if z <= 0.1:
                        return False
                    xn = v.dot(right) / z / th
                    yn = v.dot(up) / z / tv
                    if xn < -lim_s or xn > lim_s or yn < bottom or yn > lim_t:
                        return False
            return True
        lo, hi = 20.0, 400.0
        if not fits(hi):
            continue
        for _ in range(20):
            mid = (lo + hi) / 2
            if fits(mid):
                hi = mid
            else:
                lo = mid
        if best is None or hi < best[0]:
            best = (hi, h)
    dist, h = best
    a = math.radians(az_deg)
    back = Vector((math.sin(a) * math.cos(el), -math.cos(a) * math.cos(el), math.sin(el)))
    tgt = Vector((0, 0, h))
    return tgt + back * dist, tgt


pts = scene_points()
# a_cam = the default (16:9) title view: the block spans ~76% of the width, everything below NDC y 0.3 so the upper
# third stays sky for the logo. Only the default yaw is constrained: the runtime's orbit refits every yaw itself
# (src/three/camera.ts ORBIT), so the slow circle keeps the same size and the same empty top third.
cam_pos, cam_tgt = fit_orbit(pts, el_deg=18.0, top=0.6, bottom=-1.0, side=0.8, yaws=(0,))
print(f'[title_city] a_cam {tuple(round(c, 2) for c in cam_pos)} -> target {tuple(round(c, 2) for c in cam_tgt)}')
B.anchor('a_cam_target', tuple(cam_tgt), 's')
a_cam = B.anchor('a_cam', tuple(cam_pos), 's', fov=FOV)
d = (cam_tgt - cam_pos).normalized()
a_cam.rotation_euler = d.to_track_quat('-Y', 'Z').to_euler()       # local -Y (anchor forward) looks at the target


# ---- previews (dusk look) ---------------------------------------------------------------------------------------------


def dusk_render(path, cam_loc, cam_tgt_, fov_v=FOV, res=(1600, 900), backdrop='#f6e7d8', ortho=None):
    B.clear_preview()
    B.setup_render(res, 48, backdrop)
    cd = bpy.data.cameras.new('_prev_title')
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    else:
        cd.sensor_fit = 'VERTICAL'
        cd.angle = math.radians(fov_v)
    cd.clip_start, cd.clip_end = 0.5, 800
    co = B._prev_obj('title_cam', cd)
    co.location = cam_loc
    co.rotation_euler = (Vector(cam_tgt_) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = co
    sun = bpy.data.lights.new('_prev_dusk_sun', 'SUN')
    sun.energy = 4.2
    sun.color = hex_to_linear('#ffb27a')[:3]
    sun.angle = math.radians(4)
    so = B._prev_obj('dusk_sun', sun)
    so.rotation_euler = Vector((0.9, 0.35, -0.42)).to_track_quat('-Z', 'Y').to_euler()   # low sun from the west
    fill = bpy.data.lights.new('_prev_dusk_fill', 'AREA')
    fill.energy = 16000
    fill.size = 40
    fill.color = hex_to_linear('#b9a8e6')[:3]
    fo = B._prev_obj('dusk_fill', fill)
    fo.location = (20, -30, 40)
    fo.rotation_euler = (Vector((0, 0, 0)) - Vector(fo.location)).to_track_quat('-Z', 'Y').to_euler()
    for o in list(bpy.data.objects):
        if o.name.startswith('l_'):
            pl = bpy.data.lights.new('_prev_' + o.name, 'POINT')
            pl.energy = 350
            pl.color = hex_to_linear(o.get('color', '#ffd9a0'))[:3]
            pl.shadow_soft_size = 0.3
            po = B._prev_obj('pl_' + o.name, pl)
            po.location = B.world_matrix(o).translation
    world = bpy.context.scene.world
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = hex_to_linear('#9d8fc4')
    bg.inputs['Strength'].default_value = 0.8
    B.render_to(path, backdrop)
    B.clear_preview()
    print(f'[preview] {path}')


def with_dusk_materials(fn):
    """Temporarily give the runtime-driven materials their dusk look (sky tint, glowing lamps) for previews."""
    sky, shade = get_mat('window_sky'), get_mat('lampshade')
    saved = []
    for m, col, st in ((sky, '#f2a97a', 0.9), (shade, '#ffd9a0', 4.0)):
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        saved.append((bsdf, bsdf.inputs['Emission Color'].default_value[:], bsdf.inputs['Emission Strength'].default_value,
                      bsdf.inputs['Base Color'].default_value[:]))
        bsdf.inputs['Emission Color'].default_value = hex_to_linear(col)
        bsdf.inputs['Emission Strength'].default_value = st
        bsdf.inputs['Base Color'].default_value = hex_to_linear(col)
    try:
        fn()
    finally:
        for bsdf, ec, es, bc in saved:
            bsdf.inputs['Emission Color'].default_value = ec
            bsdf.inputs['Emission Strength'].default_value = es
            bsdf.inputs['Base Color'].default_value = bc


def previews():
    P = B.PREVIEWS
    dusk_render(os.path.join(P, 'title_city_acam.png'), cam_pos, cam_tgt)
    off = cam_pos - cam_tgt
    for yaw in (90, 180, 270):
        a = math.radians(yaw)
        rot = Vector((off.x * math.cos(a) - off.y * math.sin(a), off.x * math.sin(a) + off.y * math.cos(a), off.z))
        dusk_render(os.path.join(P, f'title_city_orbit{yaw}.png'), cam_tgt + rot, cam_tgt, res=(1280, 720))
    dusk_render(os.path.join(P, 'title_city_top.png'), Vector((0, 0, 80)), Vector((0, 0.001, 0)), ortho=44,
                res=(1280, 900))
    for nm, tgt, loc in (('close_street', Vector((-8, 2, 2)), Vector((4, -16, 12))),
                         ('close_corner', Vector((2, 2, 3)), Vector((16, -14, 12)))):
        dusk_render(os.path.join(P, f'title_city_{nm}.png'), loc, tgt, fov_v=35, res=(1280, 720))


if args['preview']:
    with_dusk_materials(previews)

B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'title_city.glb'), root)
