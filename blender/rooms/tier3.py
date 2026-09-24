"""tier3: the Creator Loft ("Industrial 1BR loft, 14-ft ceilings", Arts District). ~10 x 7.5 m, 3.4 m walls,
exposed-brick north wall, steel factory windows, 3 staff desks.

    node blender/run.mjs tier3 --preview
    node blender/inspect.mjs public/assets/3d/tier3.glb --check room --walk

Layout (default camera from the south-east; north + west are the visible back walls):
  NW   bedroom corner: king bed on a platform against the brick under a factory window, sconces, nightstands,
       clothes rail on the west wall, a low bookshelf at the bed's foot as a divider
  N    open kitchen along the brick (sink under a factory window, stove + hood), double fridge, metal front door;
       island with three stools in front (a_eat_sit); exposed duct along the top of the brick
  W    standing desk with dual monitors under the west factory window (gear zone on its left)
  SW   filming corner: seamless paper backdrop, camera on a tripod, two softboxes (a clear lane runs down the
       west side so the film spot and the south strip stay reachable)
  mid  three staff desks in a row facing north (screens toward the camera) on a rug
  SE   living corner: three-seat couch + rug + crate coffee table, armchair, tripod lamp, guitar
  E    coat hooks + shoes by the door, inventory box regions along the east wall
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import room as R           # noqa: E402
import furniture as F      # noqa: E402
import extra_tier2 as X2   # noqa: E402
import extra_tier3 as X3   # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D, H = 10.0, 7.5, 3.4
X, Y = W / 2, D / 2

door_op = R.door_opening('n', 4.15, width=1.0, height=2.2)
win_bed = R.window_opening('n', -3.1, width=2.3, height=1.8, sill=1.35)
win_kit = R.window_opening('n', 0.55, width=1.5, height=1.5, sill=1.4)
win_w = R.window_opening('w', -0.3, width=2.0, height=2.0, sill=1.1)
win_s = R.window_opening('s', 1.0, width=2.6, height=2.1, sill=0.9)
win_e = R.window_opening('e', -0.8, width=1.8, height=2.0, sill=1.0)
root = R.make_room('tier3', W, D, wall_h=H,
                   wall_mat={'n': 'fabric_cream', 'w': 'wall_cream', 'e': 'wall_cream', 's': 'wall_cream'},
                   floor='planks', floor_along='y', openings=[door_op, win_bed, win_kit, win_w, win_s, win_e],
                   baseboard='wood_mid', seed=31)
X3.brick_face(R, 'n', course=0.12, blen=0.33)

# ---- openings -------------------------------------------------------------------------------------------------
R.fill_opening(door_op, style='metal', anchors=True, stand_dist=0.75)
for op in (win_bed, win_kit, win_w, win_s, win_e):
    R.fill_opening(op, style='factory', frame_mat='metal_dark')

# ---- rugs -----------------------------------------------------------------------------------------------------
F.rug((3.4, 2.6), 'rug_bed', location=(-3.1, 2.2, 0), mat='fabric_cream', pattern='border', accent='rug_rose')
F.rug((3.6, 2.5), 'rug_living', location=(3.2, -2.55, 0), mat='rug_green', pattern='diamond', accent='fabric_cream')
F.rug((2.6, 0.8), 'rug_kitchen', location=(0.95, 2.65, 0), shape='runner', mat='rug_rose', pattern='stripes',
      accent='fabric_cream')
F.rug((1.0, 0.6), 'doormat', location=(4.15, Y - 0.5, 0), mat='plastic_black', pattern='plain')

# ---- bedroom corner (NW) --------------------------------------------------------------------------------------
bed = F.bed('king', 'platform', location=(-3.1, Y - 1.2, 0), rotation=B.against('n'), duvet_mat='fabric_navy',
            pillow_mat='fabric_cream', throw_mat='fabric_mustard', anchors=True, anchor_side='right',
            frame_mat='wood_mid', headboard=False)
# own headboard: the lib's platform headboard carries built-in side shelves that widen the walk footprint to 3.3 m
B.box('bed_head', (1.95 + 0.5, 0.1, 0.9), (0, 2.05 / 2 + 0.2, 0.62), 'wood_mid', bed, bevel=0.02)
B.box('bed_head_strip', (1.95 + 0.3, 0.03, 0.08), (0, 2.05 / 2 + 0.14, 0.95), 'wood_dark', bed, bevel=0.01)
F.nightstand('wood', 'nightstand_1', location=(-4.58, Y - 0.3, 0), rotation=B.against('n'))
F.nightstand('wood', 'nightstand_2', location=(-1.58, Y - 0.3, 0), rotation=B.against('n'), seed=2, clutter=False)
for i, x in enumerate((-4.58, -1.58)):
    s = X3.wall_sconce(f'sconce_{i + 1}', R.wall_point('n', x, 1.95), B.against('n'))
    R.on_wall(s, 'n')
    B.light(f'sconce_{i + 1}', (x, Y - 0.3, 1.85), 'lamp', '#ffd29a', 0.9, 3.5)
F.bookshelf('low', 'bookshelf', location=(-3.1, 0.85, 0), rotation=0, mat='wood_mid', seed=4)
X3.clothes_rail('clothes_rail', location=(-X + 0.3, 1.75, 0), rotation=B.against('w'), w=1.1)

# ---- kitchen along the brick (N) ------------------------------------------------------------------------------
F.kitchen_run(2.8, 'kitchen', location=(0.9, Y - 0.31, 0), rotation=B.against('n'), style='navy',
              counter_mat='wood_light', upper=False, hood=True, wall_h=H,
              modules=[('drawers', 0.5), ('sink', 0.8), ('dishwasher', 0.6), ('cab', 0.3), ('stove4', 0.6)],
              interact='fridge', anchors=True, wall='n', seed=3)
B.reparent(F.coffee_machine('coffee_machine', location=(-0.28, Y - 0.36, 0.9), rotation=B.against('n')),
           B.bpy.data.objects['kitchen'])        # merged into the kitchen group (saves draw calls)
F.fridge('double', location=(2.85, Y - 0.38, 0), rotation=B.against('n'), anchors=True)
X3.island(2.4, 0.95, 'island', location=(0.9, 1.55, 0), stools=3, stool_mat='fabric_mustard', anchors_eat='a_eat_sit',
          interact='fridge')
B.light('island', (0.9, 1.55, 2.6), 'ceiling', '#ffe0b0', 1.1, 5.0)

# ---- standing desk (W) ----------------------------------------------------------------------------------------
F.workstation('standing', 'computer', location=(-X + 0.37, -0.3, 0), rotation=B.against('w'), monitors=2,
              anchors='computer', gear_anchor='a_gear_desk', desk_w=1.7, chair='gaming', chair_mat='fabric_navy',
              lamp='fabric_coral', rgb=True, seed=3)

# ---- filming corner (SW) --------------------------------------------------------------------------------------
X3.backdrop('backdrop', location=(-X + 0.2, -2.6, 0), rotation=B.against('w'), mat='fabric_teal')
FILM = (-4.05, -2.55)            # the creator stands on the paper, facing the camera (south-east)
CAM = (-2.95, -3.35)
F.camera_tripod('camera', location=CAM + (0,), rotation=B.facing_deg(FILM, CAM))
F.softbox('softbox_1', location=(-4.55, -1.7, 0), rotation=B.facing_deg(FILM, (-4.55, -1.7)))
F.softbox('softbox_2', location=(-2.1, -3.45, 0), rotation=B.facing_deg(FILM, (-2.1, -3.45)))
B.light('softbox', (-4.55, -1.7, 1.6), 'lamp', '#fff6ea', 1.2, 4.0)

# ---- staff desks (mid), facing north --------------------------------------------------------------------------
STAFF_X, STAFF_Y = -0.85, -0.8
for n in (1, 2, 3):
    F.staff_desk_set(n, 'standing', location=(STAFF_X + (n - 1) * 1.4, STAFF_Y, 0), rotation=0, desk_w=1.25, desk_d=0.65,
                     chair='basic', monitors=1)

F.rug((4.6, 2.2), 'rug_staff', location=(STAFF_X + 1.4, STAFF_Y - 0.25, 0), mat='carpet_beige', pattern='border',
      accent='fabric_cream')

# ---- living corner (SE) ---------------------------------------------------------------------------------------
F.couch('three', location=(3.2, -Y + 0.5, 0), rotation=B.against('s'), mat='fabric_grey',
        pillow_mats=['fabric_mustard', 'fabric_coral', 'fabric_teal'], throw_mat='rug_rose', anchors=True,
        interact='couch')
F.coffee_table('crate', location=(3.2, -1.95, 0), clutter=False)
X3.table_clutter('table_clutter', (3.2, -1.95, 0), seed=2, top=0.42)
F.armchair('mid', location=(4.5, -2.2, 0), rotation=B.facing_deg((3.2, -2.0), (4.5, -2.2)), mat='fabric_coral')
F.floor_lamp('tripod', location=(1.8, -Y + 0.4, 0), light_anchor='l_floor_lamp')
X3.guitar_stand('guitar', location=(X - 0.35, -Y + 0.4, 0), rotation=B.facing_deg('se'))   # face the camera

# ---- plants ---------------------------------------------------------------------------------------------------
F.potted_plant('monstera', 'plant_1', location=(X - 0.5, 1.2, 0), seed=2)
F.potted_plant('tall', 'plant_2', location=(-0.95, Y - 0.35, 0), seed=3)
F.potted_plant('snake', 'plant_3', location=(X - 0.35, 2.5, 0), seed=5)

# ---- wall decor -----------------------------------------------------------------------------------------------
X3.duct_run(R, 'n', -X + 0.1, X - 0.1, z=3.08, off=0.2, r=0.12)
clock = F.wall_clock(0.3, location=R.wall_point('n', -0.95, 2.55), rotation=B.against('n'), hour=4.6,
                     mat='plastic_white', rim='metal_dark')
R.on_wall(clock, 'n')
art = F.framed_art((1.0, 0.7), 'art_w', location=R.wall_point('w', 1.75, 2.35), rotation=B.against('w'),
                   style='grid', frame='metal_dark', seed=4)
R.on_wall(art, 'w')
neon = F.neon_sign('bolt', 'neon', location=R.wall_point('w', -2.7, 2.75), rotation=B.against('w'),
                   colors=('neon_yellow', 'neon_pink'), size=0.8)
R.on_wall(neon, 'w')
art_s = F.framed_art((1.3, 0.8), 'art_s', location=R.wall_point('s', 3.2, 1.75), rotation=B.against('s'),
                     style='sunset', frame='wood_mid', seed=6)
R.on_wall(art_s, 's')
art_e = F.framed_art((0.7, 0.9), 'art_e', location=R.wall_point('e', 1.2, 1.75), rotation=B.against('e'),
                     style='plant', frame='wood_mid', seed=7)
R.on_wall(art_e, 'e')
B.light('window_n', (-3.1, Y - 0.6, 2.2), 'window', '#fff4e0', 1.0, 5.0)
B.light('window_w', (-X + 0.6, -0.3, 2.0), 'window', '#fff4e0', 1.0, 5.0)

hooks = X2.coat_hooks('coat_hooks', R.wall_point('e', 2.75, 1.7), B.against('e'),
                      coats=(('fabric_mustard', 0.85), ('fabric_navy', 0.7), ('rug_green', 0.6)), bag='fabric_cream')
R.on_wall(hooks, 'e')
shoes = B.group('shoes', (0, 0, 0))
X2.shoe_pair(shoes, (X - 0.3, 3.3, 0), -80, 'plastic_black', 'plastic_white')
X2.shoe_pair(shoes, (X - 0.32, 2.75, 0), -95, 'fabric_mustard', 'plastic_white', scale=0.95)
B.light('desk', (-X + 0.5, 0.35, 1.3), 'lamp', '#ffd9a0', 0.7, 2.5)

# ---- anchors --------------------------------------------------------------------------------------------------
B.anchor('a_spawn', (3.0, 2.0, 0), 's')
B.anchor('a_film_stand', FILM + (0,), CAM)
B.anchor('a_idle_1', (X - 1.25, 1.2, 0), 'e')                   # at the monstera
B.anchor('a_idle_2', (-3.1, 0.3, 0), 'n')                       # browsing the low bookshelf
B.anchor('a_idle_3', (-0.95, 2.6, 0), (-0.95, Y))               # under the big clock
B.anchor('a_idle_4', (2.3, -1.9, 0), (X - 0.35, -Y + 0.4))      # eyeing the guitar
B.anchor('a_idle_5', (X - 1.0, -0.8, 0), 'e')                   # at the east window
B.anchor('a_boxes_1', (X - 0.45, 3.0 - 0.9, 0), 'w', w=0.8, d=0.6, layers=3)
B.anchor('a_boxes_2', (X - 0.4, -0.1, 0), 'w', w=0.5, d=0.9, layers=2)
B.anchor('a_gear_floor_1', (-3.7, -1.45, 0), FILM)
B.anchor('a_gear_floor_2', (-2.35, -0.15, 0), (-X + 0.37, -0.3))

if args['preview']:
    B.preview_set('tier3', views=('default', 'top', 'walk'))
    B.render_preview(os.path.join(B.PREVIEWS, 'tier3_close_bed.png'), 'close',
                     target=['bed', 'nightstand_1', 'nightstand_2', 'bookshelf'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier3_close_kitchen.png'), 'close',
                     target=['kitchen', 'kitchen_upper', 'fridge', 'island', 'door'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier3_close_film.png'), 'close',
                     target=['computer', 'backdrop', 'camera', 'softbox_1', 'softbox_2'], azimuth=70)
    B.render_preview(os.path.join(B.PREVIEWS, 'tier3_close_staff.png'), 'close',
                     target=['staffdesk_1', 'staffdesk_2', 'staffdesk_3', 'couch'])

# ---- draw-call diet ---------------------------------------------------------------------------------------------
X2.fuse('floor_decor', ['rug_bed', 'rug_living', 'rug_kitchen', 'doormat', 'rug_staff', 'table_clutter', 'backdrop',
                        'guitar', 'shoes'])
X2.fuse('decor_n', ['clock', 'sconce_1', 'sconce_2', 'duct', 'kitchen_upper'] + X2.windows_on('n'), wall='n', R=R)
X2.fuse('decor_w', ['art_w', 'neon'] + X2.windows_on('w'), wall='w', R=R)
X2.fuse('decor_s', ['art_s'] + X2.windows_on('s'), wall='s', R=R)
X2.fuse('decor_e', ['art_e', 'coat_hooks'] + X2.windows_on('e'), wall='e', R=R)

B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'tier3.glb'), root)
