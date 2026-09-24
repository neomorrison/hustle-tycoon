"""tier0: Mom's / Parents' basement (6.5 x 5 m, wood-panel walls, carpet). docs/3D.md section 5.

    node blender/run.mjs tier0 --preview
    node blender/inspect.mjs public/assets/3d/tier0.glb --check room --walk

Layout (default camera from the south-east, so north + west are the visible back walls):
  north wall: basement stairs rising west to the floor above (Mom's photo frames climbing with them),
              the walk-out door at floor level beside the stair foot, a kitchenette (counter + microwave + hot plate
              + mini fridge) and the washing machine in the NE corner
  west wall : the old desk under a high window-well window (cork board + sticky notes), the twin bed with a messy
              duvet under a second window, a crate nightstand with a lava lamp
  middle/east: saggy couch (back to the cut-away south wall) facing an old CRT TV on a crate, pizza on the crate
              table, moving boxes + inventory region along the east wall, laundry basket, storage tubs
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import room as R           # noqa: E402
import furniture as F      # noqa: E402
import extra_tier0 as X0   # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D = 6.2, 4.8                 # the smallest rung of the housing ladder (tier1 is 6.4 x 5.2)
HX, HY = W / 2, D / 2           # walls at x = +-3.1, y = +-2.4

door_op = R.door_opening('n', 0.42)
win_desk = R.window_opening('w', 0.7, width=0.95, height=0.46, sill=1.86)
win_bed = R.window_opening('w', -1.35, width=0.95, height=0.46, sill=1.86)
win_n = R.window_opening('n', 2.25, width=0.9, height=0.42, sill=1.9)
root = R.make_room('tier0', W, D, wall_mat='wall_panel', floor='carpet', floor_mats=['carpet_beige'],
                   openings=[door_op, win_desk, win_bed, win_n], baseboard='wood_dark', crown='wood_dark')

for side in ('n', 'w', 'e', 's'):
    X0.paneling(side, spacing=0.3, mat='wood_mid')

# ---- openings ------------------------------------------------------------------------------------------------
R.fill_opening(door_op, style='wood', anchors=True, ajar=0, hinge='left')     # a_door_stand + a_door_exit
R.fill_opening(win_desk, style='basement', frame_mat='plastic_white')
R.fill_opening(win_bed, style='basement', frame_mat='plastic_white')
R.fill_opening(win_n, style='basement', frame_mat='plastic_white')

# ---- rugs first --------------------------------------------------------------------------------------------------
F.rug((2.3, 1.7), 'rug_lounge', location=(1.12, -0.95, 0), shape='round', mat='rug_green', accent='fabric_cream',
      pattern='stripes')
F.rug((1.3, 0.8), 'rug_bed', location=(-1.85, -0.3, 0), mat='rug_rose', accent='fabric_cream', pattern='border')

# ---- stairs up to the house: along the north wall, rising west to the wall top ----------------------------
ST_W, ST_N, ST_RUN = 0.9, 12, 0.23
ST_RISE = 2.7 / ST_N                            # the top tread is flush with the wall top = the floor upstairs
st_x0 = -0.27                                   # bottom front edge (x), stairs rise toward -X
stairs = F.stairs(ST_W, ST_N, ST_RISE, ST_RUN, 'stairs', location=(st_x0, HY - ST_W / 2 - 0.01, 0), rotation=90,
                  mat='wood_light', stringer_mat='plastic_white', rail=None)
X0.stair_rail(stairs, ST_W, ST_N, ST_RISE, ST_RUN, side=-1, zmax=2.66)   # open (south) side, stops at the wall top
deco_n = []
# Mom's family photos climbing with the stairs
for i, (k, sz, st) in enumerate(((1, (0.26, 0.32), 'plant'), (3, (0.3, 0.24), 'sunset'), (5, (0.24, 0.3), 'abstract'),
                                  (7, (0.3, 0.22), 'wave'))):
    x = st_x0 - k * ST_RUN - ST_RUN / 2
    z = min(2.32, (k + 1) * ST_RISE + 1.0)
    a = F.framed_art(sz, f'photo_{i + 1}', location=R.wall_point('n', x, z), rotation=B.against('n'), style=st,
                     frame=['wood_dark', 'plastic_white', 'wood_mid', 'fabric_mustard'][i], seed=i + 3)
    R.on_wall(a, 'n')
    deco_n.append(a)
# holiday storage tubs tucked under the stairs
X0.storage_tubs('tubs', location=(-2.35, HY - 0.3, 0), rotation=0, n=3)

# ---- kitchenette on the north wall east of the door (+ mini fridge) ----------------------------------------------
kc = F.counter(0.95, 'kitchenette', location=(1.46, HY - 0.3, 0), rotation=B.against('n'), style='white',
               counter_mat='wood_light', interact='fridge')
F.microwave('microwave', location=(-0.2, 0.02, 0.9), rotation=0, parent=kc)
F.hot_plate('hot_plate', location=(0.22, -0.02, 0.9), rotation=0, parent=kc)
X0.soda_can(kc, (0.41, -0.21, 0.9), 'fabric_teal')
fr = F.fridge('mini', 'fridge', location=(2.19, HY - 0.28, 0), rotation=B.against('n'), anchors=True)
B.box('fridge_top_box', (0.3, 0.22, 0.2), (0, 0.02, 0.95), 'mcd_yellow', fr, 6, bevel=0.01)   # cereal on the fridge
B.anchor('a_stove_stand', (1.68, HY - 0.9, 0), 'n')
shelf = F.wall_shelf(0.9, 'kitchen_shelf', location=R.wall_point('n', 1.46, 1.5), rotation=B.against('n'),
                     mat='wood_light', items=False)
X0.mini_shelf_items(shelf, -0.42, 0.42, -0.11, 0.0175)
R.on_wall(shelf, 'n')
deco_n.append(shelf)
pipes = X0.pipe_run('pipes_n', [(1.02, HY - 0.06, 2.52), (HX - 0.15, HY - 0.06, 2.52), (HX - 0.15, HY - 0.06, 1.15)], 'n',
            r=0.022, mat='terracotta')
deco_n.append(pipes)

# ---- laundry corner (NE) ---------------------------------------------------------------------------------------------
F.washing_machine('washer', location=(HX - 0.31, HY - 0.33, 0), rotation=B.against('n'))
F.laundry_basket('laundry', location=(HX - 0.3, 1.18, 0), rotation=20, mat='plastic_white')

# ---- the old desk under the window (west wall), gear zone on its left ------------------------------------------------
comp = F.workstation('old', 'computer', location=(-HX + 0.31, 0.7, 0), rotation=B.against('w'), monitors=0,
                     laptop_style=None, chair='basic', chair_mat='fabric_grey', lamp='fabric_mustard',
                     anchors='computer', gear_anchor='a_gear_desk', seed=3)
X0.soda_can(comp, (0.36, 0.18, 0.75), 'mcd_red')
X0.soda_can(comp, (0.2, 0.2, 0.75), 'rug_green')
X0.headphones(comp, (0.34, -0.12, 0.75), rot=20)
B.box('computer_notebook', (0.16, 0.22, 0.02), (-0.02, 0.12, 0.76), 'poster_b', comp, 12, bevel=0.004)
B.light('l_desk_lamp', (0.46, 0.05, 1.12), 'lamp', color='#ffd49a', intensity=1.2, distance=3.5, frame=comp)
deco_w = [X0.cork_board('w', 0.12, 1.45, w=0.62, h=0.44), X0.sticky_notes('w', 1.12, 1.35, n=6, spread=(0.3, 0.25))]

# ---- twin bed, head to the west wall, crate nightstand in the SW corner ----------------------------------------------
bed = F.bed('twin', 'metal', location=(-HX + 0.99, -1.35, 0), rotation=B.against('w'), duvet_mat='fabric_navy',
      pillow_mat='fabric_cream', sheet_mat='paper', messy=True, anchors=True, anchor_side='right', seed=4)
X0.plushie(bed, (-0.27, 0.6, 0.52), rot=-20, mat='fabric_mustard', accent='fabric_cream')      # childhood teddy
ns = F.nightstand('crate', 'nightstand', location=(-HX + 0.25, -HY + 0.25, 0), rotation=B.against('w'), clutter=True,
                  lamp=False)
X0.lava_lamp(ns, (0.1, 0.05, 0.55))
B.light('l_lava', (-HX + 0.25, -HY + 0.25, 0.85), 'lamp', color='#c79bff', intensity=0.6, distance=2.2)
deco_w.append(X0.pennant('w', -0.25, 1.55, mat='mcd_red', accent='fabric_mustard', length=0.6, rot=-10))
X0.guitar('guitar', location=(-HX + 0.2, -0.3, 0), rotation=B.against('w') + 8, lean=13)
poster = F.poster((0.42, 0.58), 'poster_bed', location=R.wall_point('w', -HY + 0.25, 1.4), rotation=B.against('w'),
                  style='abstract', seed=7)
R.on_wall(poster, 'w')
deco_w.append(poster)
X0.gather('decor_w', 'w', deco_w)
X0.clothes_pile('clothes_floor', location=(-1.0, -1.95, 0), rotation=20, n=4, seed=5)
X0.sneakers('shoes_bed', location=(-1.05, -0.62, 0), rotation=-70, mat='plastic_white', accent='fabric_coral')

# ---- lounge: saggy couch facing an old CRT TV on a crate -------------------------------------------------------------
couch = F.couch('saggy', 'couch', location=(1.12, -HY + 0.47, 0), rotation=B.against('s'), mat='fabric_blue',
                throw_mat='fabric_mustard', interact='couch', seed=2)
B.anchor('a_couch_sit', (-0.3, -0.12, 0), 's', frame=couch)
B.anchor('a_eat_sit', (0.3, -0.12, 0), 's', frame=couch)
ct = F.coffee_table('crate', 'coffee_table', location=(1.12, -0.26, 0), rotation=0, clutter=False)
X0.pizza_box(ct, (-0.22, 0.02, 0.42), rot=8)
X0.soda_can(ct, (0.18, -0.12, 0.42), 'mcd_red')
X0.soda_can(ct, (0.3, 0.1, 0.42), 'poster_b', tipped=True)
F.mug(ct, (0.3, -0.15, 0.42), 'fabric_coral')
X0.crt_tv('tv', location=(1.12, 0.62, 0), rotation=0, stand='crate', interact='tv')
F.floor_lamp('shade', 'floor_lamp', location=(0.1, -2.1, 0), mat='wood_mid', light_anchor='l_floor_lamp')
X0.dumbbells('dumbbells', location=(-0.7, -1.6, 0), rotation=-20)
X0.dartboard('e', 0.4, 1.6)
deco_n.append(X0.light_switch('n', 1.02, 1.2))
X0.gather('decor_n', 'n', deco_n)

# ---- boxes: moving boxes in the SE corner, inventory region along the east wall -----------------------------------
F.moving_boxes(5, 'boxes', location=(HX - 0.35, -1.5, 0), rotation=90, seed=3)
B.anchor('a_boxes_1', (HX - 0.4, -0.2, 0), 'w', w=0.8, d=0.6, layers=3)

# ---- ceiling light (anchor only: a bulb on a cord would float in the cutaway) --------------------------------------
F.ceiling_light('bulb', 'ceiling_bulb', location=(0.3, -0.2, 2.7), drop=0.55, light_anchor='l_ceiling')
B.light('l_window', R.wall_point('w', 0.7, 2.0, 0.4), 'window', color='#d6ecff', intensity=0.8, distance=4.0)

# ---- hand-placed anchors -------------------------------------------------------------------------------------------
B.anchor('a_spawn', (0.25, 1.05, 0), 's')
B.anchor('a_idle_1', (1.45, 1.45, 0), 'n')                      # snacks shelf
B.anchor('a_idle_2', (-0.55, 1.1, 0), (-1.2, 2.2))              # foot of the stairs, looking up
B.anchor('a_idle_3', (2.2, 0.65, 0), (HX - 0.3, 1.18))          # laundry basket
B.anchor('a_idle_4', (0.1, -1.0, 0), (1.12, 0.62))              # watching TV standing
B.anchor('a_film_stand', (-0.7, 0.2, 0), 'se')
B.anchor('a_gear_floor_1', (-1.5, -0.1, 0), (-0.7, 0.2))
B.anchor('a_gear_floor_2', (-1.55, 1.05, 0), (-0.7, 0.2))

if args['preview']:
    B.preview_set('tier0', views=('default', 'top', 'walk'))
    B.render_preview(os.path.join(B.PREVIEWS, 'tier0_close_bed.png'), 'close', target=['bed', 'computer'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier0_close_kitchen.png'), 'close',
                     target=['kitchenette', 'fridge', 'washer', 'door'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier0_close_lounge.png'), 'close', target=['couch', 'tv', 'coffee_table'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier0_close_sw.png'), 'close', target=['stairs', 'computer', 'kitchenette'],
                     azimuth=-40, elevation=32)

B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'tier0.glb'), root)
