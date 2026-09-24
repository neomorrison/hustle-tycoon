"""props.glb (docs/3D.md section 7): hand props, gear props and the inventory box, one top-level node each.

    node blender/run.mjs props --preview      -> public/assets/3d/props.glb (+ blender/.previews/props_grid.png)

Conventions (also in blender/README.md "Props"):
- every prop is a top-level empty named by its id with ONE child mesh `<id>_mesh`, identity transform in the file;
- origin = the grip point (hand props) or the floor / desk contact point, bottom centre (gear props, box);
- up = Blender +Z; front / screen / lens = local -Y (like furniture). A phone held for 'phone' has its screen on -Y.
Hand props: grip points
  phone        centre of the lower third of the phone, screen -Y, top of the phone +Z
  mug          the middle of the handle (handle on +X of the cup)
  plate        centre of the underside (carried flat), with a burger + fries on it
  burger       its centre
  fries        the carton's lower middle
  spatula      the middle of the handle; the blade points +Z
  box_small    the centre of the box (carried at chest height with both hands)
  takeout_bag  the top of the handles; the bag hangs below (-Z)
Gear props sit on a_gear_desk (desk top) or a_gear_floor_* (floor), origin at their bottom centre, front -Y.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import furniture as F      # noqa: E402
from build import box, cyl, sphere, blob, tube, panel, lathe, torus   # noqa: E402

args = B.cli_args()
B.clean_scene()


def top(name):
    """Top-level prop group (no room root)."""
    return B.group(name, (0, 0, 0), 0, parent=None)


def phone_body(g, style, z0=0.0, y0=0.0, tilt=0.0):
    """Phone slab standing on its bottom edge at z0, screen facing -Y (tilt leans it back, degrees)."""
    W, H, T = (0.072, 0.15, 0.009) if style != 'pro' else (0.074, 0.155, 0.0085)
    body = 'plastic_black' if style == 'cracked' else 'metal_dark'
    # a pivot group at the phone's bottom edge, leaned back by `tilt`; parts are built upright inside it
    s = B.group(f'{g.name}_ph', (0, y0, z0), (-tilt, 0, 0), parent=g)
    box(f'{g.name}_body', (W, T, H), (0, 0, H / 2), body, s, bevel=0.008, segments=2)
    panel(f'{g.name}_screen', (W - 0.008, H - 0.012), (0, -T / 2 - 0.0008, H / 2), 'screen', s)
    cam = (-W * 0.25, T / 2 + 0.002, H * 0.86)
    if style == 'pro':
        box(f'{g.name}_bump', (0.034, 0.004, 0.034), cam, 'metal', s, bevel=0.006)
        for dx, dz in ((-0.008, 0.008), (0.008, 0.008), (-0.008, -0.008)):
            cyl(f'{g.name}_lens', 0.0055, 0.004, (cam[0] + dx, cam[1] + 0.003, cam[2] + dz), 'plastic_black', s,
                (90, 0, 0), verts=10, bevel=0.001)
    else:
        cyl(f'{g.name}_lens', 0.006, 0.003, cam, 'plastic_black', s, (90, 0, 0), verts=10, bevel=0.001)
    if style == 'cracked':   # spiderweb crack lines over the upper screen corner
        cx, cz = W * 0.18, H * 0.78
        fy = -T / 2 - 0.0016
        for k in range(6):
            a = k * 1.05 + 0.3
            L = 0.03 + 0.012 * (k % 3)
            p0 = (cx, fy, cz)
            p1 = (cx + math.cos(a) * L, fy, cz + math.sin(a) * L)
            tube(f'{g.name}_crack', [p0, ((p0[0] + p1[0]) / 2 + 0.003, fy, (p0[2] + p1[2]) / 2), p1], 0.0007, 'paper',
                 s, res=3)
        torus(f'{g.name}_crackring', 0.012, 0.0006, (cx, fy, cz), 'paper', s, (90, 0, 0), major=10, minor=3)


def desk_stand(g, color='plastic_white'):
    """Small phone stand (the gear phone leans on it on the desk)."""
    box(f'{g.name}_standbase', (0.08, 0.07, 0.008), (0, 0.01, 0.004), color, g, bevel=0.003)
    box(f'{g.name}_standback', (0.06, 0.008, 0.08), (0, 0.035, 0.045), color, g, (-20, 0, 0), bevel=0.003)
    box(f'{g.name}_standlip', (0.08, 0.012, 0.012), (0, -0.012, 0.014), color, g, bevel=0.003)


props = []

# ---- hand props -------------------------------------------------------------------------------------------------
g = top('phone')
phone_body(g, 'plain', z0=-0.05)
props.append(g)

g = top('mug')
lathe('mug_body', [(0.037, 0), (0.042, 0.008), (0.043, 0.1), (0.038, 0.1), (0.038, 0.01)], (-0.065, 0, -0.05),
      'fabric_coral', g, verts=16)
cyl('mug_coffee', 0.038, 0.004, (-0.065, 0, 0.03), 'wood_dark', g, verts=16, bevel=0)
torus('mug_handle', 0.026, 0.0075, (-0.014, 0, 0.0), 'fabric_coral', g, (90, 0, 0), major=12, minor=6)
props.append(g)

g = top('plate')
lathe('plate_dish', [(0.06, 0), (0.12, 0.012), (0.13, 0.02), (0.123, 0.02), (0.05, 0.006)], (0, 0, 0), 'plastic_white',
      g, verts=24)
blob('plate_bun', (0.1, 0.1, 0.04), (-0.02, 0.0, 0.05), 'wood_light', g, round_xy=1.0, round_z=0.6, segs=14, rings=7)
cyl('plate_patty', 0.05, 0.016, (-0.02, 0.0, 0.028), 'wood_dark', g, verts=14, bevel=0.005)
cyl('plate_lettuce', 0.054, 0.006, (-0.02, 0.0, 0.038), 'plant', g, verts=14, bevel=0.002)
for i in range(7):
    a = i * 0.9
    box(f'plate_fry{i}', (0.008, 0.008, 0.07), (0.06 + math.cos(a) * 0.012, 0.03 + math.sin(a) * 0.015, 0.025),
        'mcd_yellow', g, (80, 0, i * 25), bevel=0.002, segments=1)
props.append(g)

g = top('burger')
blob('burger_bottom', (0.1, 0.1, 0.028), (0, 0, -0.026), 'wood_light', g, round_xy=1.0, round_z=0.5, segs=16, rings=6)
cyl('burger_patty', 0.052, 0.018, (0, 0, -0.005), 'wood_dark', g, verts=16, bevel=0.006)
cyl('burger_cheese', 0.05, 0.004, (0, 0, 0.006), 'fabric_mustard', g, (0, 0, 45), verts=4, bevel=0.001)
cyl('burger_lettuce', 0.056, 0.006, (0, 0, 0.011), 'plant', g, verts=16, bevel=0.002)
cyl('burger_tomato', 0.045, 0.006, (0, 0, 0.017), 'mcd_red', g, verts=16, bevel=0.002)
blob('burger_top', (0.104, 0.104, 0.05), (0, 0, 0.033), 'wood_light', g, round_xy=1.0, round_z=0.7, segs=16, rings=8,
     deform=lambda x, y, z: (x, y, max(z, -0.012)))
for i in range(6):
    a = i * 1.1
    sphere(f'burger_seed{i}', 0.004, (math.cos(a) * 0.025, math.sin(a) * 0.025, 0.056), 'paper', g,
           scale=(1, 0.6, 0.5), segs=6, rings=3)
props.append(g)

g = top('fries')
bw, bd, tw, td, zb, zt = 0.03, 0.018, 0.048, 0.026, -0.03, 0.07     # half sizes of a flared carton
B.mesh_from_data('fries_carton', [(-bw, -bd, zb), (bw, -bd, zb), (bw, bd, zb), (-bw, bd, zb),
                                  (-tw, -td, zt), (tw, -td, zt), (tw, td, zt), (-tw, td, zt)],
                 [(3, 2, 1, 0), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], 'mcd_red', g,
                 bevel=0.004, segments=2)
for i in range(11):
    x = -0.025 + (i % 6) * 0.01
    y = -0.008 + (i // 6) * 0.012
    box(f'fries_fry{i}', (0.008, 0.008, 0.09), (x, y, 0.05 + (i % 3) * 0.008), 'mcd_yellow', g,
        (((i * 7) % 11) - 5, ((i * 5) % 9) - 4, 0), bevel=0.002, segments=1)
sphere('fries_logo', 0.012, (0, -0.028, 0.02), 'mcd_yellow', g, scale=(1, 0.2, 1), segs=8, rings=4)
props.append(g)

g = top('spatula')
box('spatula_handle', (0.022, 0.014, 0.12), (0, 0, 0), 'plastic_black', g, bevel=0.006)
tube('spatula_shaft', [(0, 0, 0.06), (0, 0, 0.17), (0, -0.02, 0.21)], 0.004, 'metal', g, res=6)
box('spatula_blade', (0.08, 0.003, 0.1), (0, -0.03, 0.26), 'metal', g, (-15, 0, 0), bevel=0.004)
for i in range(3):
    box(f'spatula_slot{i}', (0.006, 0.004, 0.06), (-0.018 + i * 0.018, -0.032, 0.265), 'metal_dark', g, (-15, 0, 0),
        bevel=0.001, segments=1)
props.append(g)

g = top('box_small')
box('box_small_box', (0.26, 0.2, 0.16), (0, 0, 0), 'kraft', g, bevel=0.008)
box('box_small_tape', (0.05, 0.202, 0.004), (0, 0, 0.081), 'carpet_beige', g, bevel=0, segments=1)
box('box_small_tape2', (0.05, 0.004, 0.06), (0, -0.101, 0.05), 'carpet_beige', g, bevel=0, segments=1)
box('box_small_label', (0.08, 0.004, 0.05), (0.06, -0.101, -0.02), 'paper', g, bevel=0, segments=1)
props.append(g)

g = top('takeout_bag')
box('takeout_bag_bag', (0.22, 0.13, 0.26), (0, 0, -0.07 - 0.13), 'kraft', g, bevel=0.01)
box('takeout_bag_fold', (0.222, 0.132, 0.03), (0, 0, -0.07 - 0.015), 'wood_light', g, bevel=0.006)
for sy in (-1, 1):
    torus(f'takeout_bag_handle{sy}', 0.05, 0.006, (0, sy * 0.05, -0.07), 'kraft', g, (90, 0, 0), major=14, minor=4,
          arc=180)
sphere('takeout_bag_logo', 0.035, (0, -0.066, -0.2), 'mcd_red', g, scale=(1, 0.1, 1), segs=12, rings=6)
box('takeout_bag_logo2', (0.03, 0.004, 0.04), (0, -0.07, -0.2), 'mcd_yellow', g, bevel=0, segments=1)
props.append(g)

# ---- gear props (desk / floor, origin at the bottom centre) ------------------------------------------------------
g = top('phone_cracked')
desk_stand(g, 'plastic_grey')
phone_body(g, 'cracked', z0=0.012, y0=-0.005, tilt=18)
props.append(g)

g = top('phone_pro')
desk_stand(g, 'plastic_white')
phone_body(g, 'pro', z0=0.012, y0=-0.005, tilt=18)
props.append(g)

g = F.ring_light('ring_light', (0, 0, 0), 0, parent=None, obstacle=False)
props.append(g)

g = top('softbox_kit')
for sx, rz in ((-0.45, 25), (0.45, -25)):
    sb = F.softbox('softbox_kit_sb', (sx, 0, 0), rz, parent=g, obstacle=False)
props.append(g)

g = F.camera_tripod('mirrorless_camera', (0, 0, 0), 0, parent=None, obstacle=False)
box('mirrorless_camera_flip', (0.06, 0.008, 0.045), (0.1, -0.01, 1.45), 'plastic_black', g, (0, 0, 30), bevel=0.004)
panel('mirrorless_camera_flipscreen', (0.05, 0.036), (0.1 - 0.002, -0.015, 1.45), 'screen', g, (0, 0, 30))
props.append(g)

g = F.laptop('old', 'laptop_old', (0, 0, 0), 0, parent=None)
props.append(g)
g = F.laptop('pro', 'laptop_pro', (0, 0, 0), 0, parent=None)
props.append(g)

g = top('workstation')
for i, (x, rz) in enumerate(((-0.33, 12), (0.33, -12))):
    F.monitor('normal', 'workstation_monitor', (x, 0.02, 0), rz, parent=g)
box('workstation_tower', (0.2, 0.42, 0.45), (0.78, 0.05, 0.225), 'plastic_black', g, bevel=0.015)
box('workstation_glass', (0.004, 0.36, 0.38), (0.78 - 0.101, 0.05, 0.24), 'window_glass', g, bevel=0)
for k in range(3):
    torus(f'workstation_fan{k}', 0.045, 0.006, (0.78 - 0.098, 0.05, 0.1 + k * 0.12), 'neon_purple', g, (0, 90, 0),
          major=16, minor=4)
F.keyboard('workstation_keyboard', (0, -0.25, 0), 0, parent=g, mat='plastic_black', rgb=True)
F.mouse('workstation_mouse', (0.32, -0.25, 0), 0, parent=g, mat='plastic_black', pad='plastic_black')
props.append(g)

g = top('lav_mic')
box('lav_mic_receiver', (0.05, 0.03, 0.07), (0.05, 0.02, 0.035), 'plastic_black', g, bevel=0.008)
box('lav_mic_led', (0.006, 0.004, 0.006), (0.05, 0.004, 0.058), 'neon_green', g, bevel=0)
for i, x in enumerate((-0.05, -0.1)):
    cyl(f'lav_mic_tx{i}', 0.014, 0.035, (x, -0.02, 0.0175), 'plastic_black', g, verts=12, bevel=0.004)
    box(f'lav_mic_clip{i}', (0.012, 0.008, 0.025), (x, -0.005, 0.02), 'metal', g, bevel=0.002)
    sphere(f'lav_mic_foam{i}', 0.009, (x, -0.02, 0.043), 'plastic_grey', g, segs=8, rings=5)
cyl('lav_mic_case', 0.06, 0.012, (-0.02, 0.06, 0.006), 'plastic_grey', g, verts=16, bevel=0.004)
props.append(g)

# ---- inventory ---------------------------------------------------------------------------------------------------
g = top('box_stack_unit')
box('box_stack_unit_box', (0.4, 0.3, 0.3), (0, 0, 0.15), 'kraft', g, bevel=0.008)
box('box_stack_unit_tape', (0.06, 0.302, 0.003), (0, 0, 0.3005), 'carpet_beige', g, bevel=0, segments=1)
for sy in (-1, 1):
    box(f'box_stack_unit_tape{sy}', (0.06, 0.003, 0.08), (0, sy * 0.1505, 0.26), 'carpet_beige', g, bevel=0,
        segments=1)
box('box_stack_unit_label', (0.1, 0.003, 0.07), (0.1, -0.1505, 0.12), 'paper', g, bevel=0, segments=1)
props.append(g)

ids = [p.name for p in props]
assert ids == ['phone', 'mug', 'plate', 'burger', 'fries', 'spatula', 'box_small', 'takeout_bag', 'phone_cracked',
               'phone_pro', 'ring_light', 'softbox_kit', 'mirrorless_camera', 'laptop_old', 'laptop_pro',
               'workstation', 'lav_mic', 'box_stack_unit'], ids

if args['preview']:
    # lay them out in a grid only for the render, then put every prop back at the origin
    small = props[:8] + [props[8], props[9], props[16]]
    big = [props[i] for i in (10, 11, 12, 13, 14, 15, 17)]
    for row, items, sp in ((0, small, 0.34), (1, big, 1.25)):
        x = -(len(items) - 1) * sp / 2
        for p in items:
            p.location = (x, -row * 1.6, 0.25 if p in props[:8] else 0)
            x += sp
    B.render_preview(os.path.join(B.PREVIEWS, 'props_grid.png'), 'close', target=big + small, root=None,
                     res=(1600, 900), azimuth=18, elevation=30)
    B.render_preview(os.path.join(B.PREVIEWS, 'props_hand.png'), 'close', target=small, root=None, res=(1600, 700),
                     azimuth=18, elevation=22)
    for p in props:
        p.location = (0, 0, 0)

out = args['out'] or os.path.join(B.ASSETS_3D, 'props.glb')
B.export_glb(out, props)
