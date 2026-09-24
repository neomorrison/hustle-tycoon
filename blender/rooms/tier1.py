"""tier1: Shared apartment, your bedroom + the kitchenette (6 x 5 m, planks). docs/3D.md section 5.

    node blender/run.mjs tier1 --preview
    node blender/inspect.mjs public/assets/3d/tier1.glb --check room --walk

"Your own room behind a door that mostly closes", plus kitchenette access. Default camera from the south-east, so
north + west are the visible back walls:
  north wall: full mattress on a low platform in the NW corner (string lights + posters above), the hallway door,
              the kitchenette (microwave counter, sink, 2-burner stove, tall fridge) under a small window
  west wall : cheap white desk under the window (gear zone for the laptop), a rolling clothes rack in the corner
  middle    : the folding kitchen table with a laptop = staffdesk_1 ("your office is the kitchen table"),
              bean bag on a round rug, plants, the inventory region by the east wall
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import room as R           # noqa: E402
import furniture as F      # noqa: E402
import extra_tier0 as X0   # noqa: E402
import extra_tier1 as X1   # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D = 6.4, 5.2                 # a touch roomier than the basement: the ladder has to feel like progress
HX, HY = W / 2, D / 2           # walls at x = +-3.2, y = +-2.6

door_op = R.door_opening('n', 0.05)
win_desk = R.window_opening('w', -0.6, width=1.15, height=1.15, sill=1.0)
win_kit = R.window_opening('n', 1.55, width=0.8, height=0.75, sill=1.3)
root = R.make_room('tier1', W, D, wall_mat={'n': 'wall_sky', 'w': 'wall_sky', 'e': 'wall_cream', 's': 'wall_cream'},
                   floor='planks', openings=[door_op, win_desk, win_kit], baseboard='plastic_white')

# ---- openings ------------------------------------------------------------------------------------------------
R.fill_opening(door_op, style='hallway', anchors=True, ajar=0)             # a_door_stand + a_door_exit
R.fill_opening(win_desk, style='standard', curtains='fabric_mustard')
R.fill_opening(win_kit, style='standard')

# ---- rugs first --------------------------------------------------------------------------------------------------
F.rug((1.7, 1.7), 'rug_round', location=(0.15, -1.35, 0), shape='round', mat='rug_rose', accent='fabric_cream',
      pattern='border')
F.rug((0.75, 1.2), 'rug_bed', location=(-0.95, 1.05, 0), mat='fabric_cream', accent='fabric_teal', pattern='stripes')

# ---- bed: full mattress on a low platform, head to the north wall ------------------------------------------------
bed = F.bed('full', 'platform', location=(-HX + 0.885, HY - 1.06, 0), rotation=B.against('n'), frame_mat='wood_light',
            duvet_mat='fabric_coral', pillow_mat='paper', sheet_mat='fabric_cream', throw_mat='fabric_mustard',
            messy=True, headboard=False, anchors=True, anchor_side='right', seed=7)
B.anchor('a_eat_sit', (0.57, -0.68, 0), 'e', frame=bed)             # bed edge near the foot (tier1 has no table)
ns = F.nightstand('crate', 'nightstand', location=(-HX + 1.98, HY - 0.22, 0), rotation=B.against('n'), clutter=True,
                  lamp=True, seed=2)
B.light('l_bed_lamp', (-HX + 1.98, HY - 0.25, 0.95), 'lamp', color='#ffd49a', intensity=0.8, distance=2.5)
X1.backpack('backpack', location=(-1.55, 0.3, 0), rotation=-140)
X0.sneakers('shoes_door', location=(-0.1, 1.7, 0), rotation=165, mat='plastic_white', accent='poster_b')
X0.clothes_pile('clothes_floor', location=(-HX + 1.25, 0.05, 0), rotation=30, n=3, seed=9,
                mats=['fabric_navy', 'fabric_mustard', 'fabric_cream'])
deco_n = [X0.string_bulbs_on_wall('n', -HX + 0.1, -HX + 1.9, 2.15, sag=0.2, n=10, name='string_lights_n')]
deco_w = [X0.string_bulbs_on_wall('w', HY - 0.1, 0.35, 2.2, sag=0.22, n=10, name='string_lights_w')]
B.light('l_string', (-HX + 0.6, HY - 0.6, 2.0), 'lamp', color='#ffcf8a', intensity=0.7, distance=3.0)
for i, (at, z, sz, st) in enumerate(((1.75, 1.45, (0.46, 0.62), 'wave'), (1.05, 1.55, (0.36, 0.5), 'grid'),
                                     (0.62, 1.3, (0.3, 0.3), 'plant'))):
    p = F.poster(sz, f'poster_{i + 1}', location=R.wall_point('w', at, z), rotation=B.against('w'), style=st,
                 seed=i + 11)
    R.on_wall(p, 'w')
    deco_w.append(p)

# ---- desk under the west window (gear zone for the laptop on the left) --------------------------------------------
comp = F.workstation('cheap', 'computer', location=(-HX + 0.28, -0.6, 0), rotation=B.against('w'), monitors=0,
                     laptop_style=None, chair='basic', chair_mat='fabric_teal', lamp='fabric_coral',
                     anchors='computer', gear_anchor='a_gear_desk', seed=5)
B.light('l_desk_lamp', (0.43, 0.1, 1.15), 'lamp', color='#ffd49a', intensity=1.1, distance=3.0, frame=comp)
X1.speaker(comp, (0.36, 0.14, 0.75))
X0.headphones(comp, (0.12, 0.15, 0.75), rot=-15, pad='fabric_mustard')
F.trash_bin('office', 'desk_bin', location=(-HX + 0.25, 0.2, 0))
deco_w.append(X0.sticky_notes('w', 0.05, 1.3, n=5, spread=(0.25, 0.3), seed=8))
X0.gather('decor_w', 'w', deco_w)

# ---- clothes rack in the SW corner --------------------------------------------------------------------------------
X1.clothes_rack('clothes_rack', location=(-HX + 0.3, -HY + 0.62, 0), rotation=B.against('w'), w=0.95)
F.laundry_basket('laundry', location=(-1.6, -HY + 0.35, 0), rotation=30, mat='fabric_cream', seed=3)

# ---- kitchenette on the north wall -------------------------------------------------------------------------------
kit = F.kitchen_run(1.75, 'kitchenette', location=(1.575, HY - 0.31, 0), rotation=B.against('n'), style='retro',
                    modules=[('cab', 0.55), ('sink', 0.6), ('stove2', 0.6)], upper=False, hood=False, clutter=True,
                    interact='fridge', anchors=True, wall='n')
F.microwave('microwave', location=(-0.6, 0.05, 0.9), rotation=0, parent=kit)
X1.dish_rack(kit, (-0.02, 0.1, 0.9))
fr = F.fridge('tall', 'fridge', location=(HX - 0.38, HY - 0.36, 0), rotation=B.against('n'), anchors=True, seed=4)
shelf = F.wall_shelf(0.44, 'kitchen_shelf', location=R.wall_point('n', 0.93, 1.6), rotation=B.against('n'),
                     mat='wood_light', items=False)
X0.mini_shelf_items(shelf, -0.21, 0.21, -0.11, 0.0175, seed=4)
R.on_wall(shelf, 'n')
deco_n += [shelf, X0.light_switch('n', -0.57, 1.15), X1.coat_hooks('n', -0.85, 1.7)]
# the hanging plant rides on the north wall's decor: it hides with the wall instead of floating in the cutaway
deco_n.append(F.hanging_plant('hanging_plant', location=(2.2, HY - 0.35, 2.7), drop=0.75, seed=3))
X0.gather('decor_n', 'n', deco_n)

# ---- the kitchen table = staff desk 1 (folding table + laptop) ------------------------------------------------------
sd = F.staff_desk_set(1, 'folding', location=(1.1, 0.25, 0), rotation=0, chair='folding', chair_mat='fabric_coral',
                      monitors=0, laptop_style='pro', seed=2)
X1.fruit_bowl(sd, (0.38, 0.12, 0.75))

# ---- lounge corner: bean bag on the round rug, plants ----------------------------------------------------------------
F.bean_bag('bean_bag', location=(0.15, -1.5, 0), rotation=150, mat='fabric_teal')
side = X0._g('side_table', (0.8, -2.1, 0), 10, obstacle=True)
B.box('side_table_crate', (0.42, 0.32, 0.36), (0, 0, 0.18), 'wood_light', side, bevel=0.01)
B.box('side_table_hole', (0.36, 0.01, 0.28), (0, -0.157, 0.18), 'wood_mid', side, bevel=0.004, segments=1)
X1.speaker(side, (-0.1, 0.02, 0.36), mat='fabric_coral')
F.mug(side, (0.1, -0.05, 0.36), 'mcd_yellow')
F.floor_lamp('tripod', 'floor_lamp', location=(-0.65, -2.05, 0), rotation=-60, light_anchor='l_floor_lamp')
F.potted_plant('small', 'plant_1', location=(1.45, -2.3, 0), pot_mat='plastic_white', seed=2)
cube = F.bookshelf('cube', 'cube_shelf', location=(HX - 0.19, 0.45, 0), rotation=B.against('e'), w=0.8, h=0.8, seed=6)
F.small_plant('cube_plant', location=(0.22, 0.0, 0.8), style='trailing', parent=cube, seed=4)
F.mug(cube, (-0.05, -0.02, 0.8), 'fabric_coral')
B.box('cube_books', (0.22, 0.16, 0.06), (-0.24, 0.0, 0.83), 'poster_b', cube, 8, bevel=0.006)
F.potted_plant('snake', 'plant_2', location=(HX - 0.35, -HY + 0.35, 0), pot_mat='terracotta', seed=3)
X1.skateboard('skateboard', location=(-HX + 0.08, -1.32, 0), rotation=B.against('w') + 4)
deco_e = [X1.wall_calendar('e', 0.9, 1.55),
          F.framed_art((0.6, 0.45), 'art_e', location=R.wall_point('e', -0.2, 1.6), rotation=B.against('e'),
                       style='sunset', frame='wood_light', seed=4)]
R.on_wall(deco_e[1], 'e')
X0.gather('decor_e', 'e', deco_e)
art_s = F.poster((0.5, 0.7), 'poster_s', location=R.wall_point('s', 0.2, 1.5), rotation=B.against('s'), style='sunset',
                 seed=21)
R.on_wall(art_s, 's')

# ---- inventory region by the east wall ----------------------------------------------------------------------------
B.anchor('a_boxes_1', (HX - 0.4, -0.75, 0), 'w', w=0.8, d=0.6, layers=3)

# ---- ceiling light ------------------------------------------------------------------------------------------------
B.light('l_window', R.wall_point('w', -0.55, 1.6, 0.4), 'window', color='#d6ecff', intensity=0.9, distance=4.0)

# ---- hand-placed anchors -------------------------------------------------------------------------------------------
B.anchor('a_spawn', (0.4, 1.3, 0), 's')
B.anchor('a_idle_1', (1.55, 1.7, 0), 'n')                        # kitchen window
B.anchor('a_idle_2', (-0.9, -0.05, 0), (-HX, 1.2))               # looking at the posters over the bed
B.anchor('a_idle_3', (2.45, -1.65, 0), (HX - 0.35, -HY + 0.35))  # the snake plant
B.anchor('a_idle_4', (-2.15, -1.75, 0), (-HX + 0.3, -1.98))      # picking clothes off the rack
B.anchor('a_film_stand', (0.2, -0.5, 0), 'se')
B.anchor('a_gear_floor_1', (-1.35, -1.3, 0), (0.2, -0.5))
B.anchor('a_gear_floor_2', (-1.2, 0.35, 0), (0.2, -0.5))

if args['preview']:
    B.preview_set('tier1', views=('default', 'top', 'walk'))
    B.render_preview(os.path.join(B.PREVIEWS, 'tier1_close_bed.png'), 'close', target=['bed', 'computer'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier1_close_kitchen.png'), 'close',
                     target=['kitchenette', 'fridge', 'staffdesk_1', 'door'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier1_close_lounge.png'), 'close',
                     target=['bean_bag', 'staffdesk_1', 'cube_shelf', 'side_table'], azimuth=20, elevation=28)
    B.render_preview(os.path.join(B.PREVIEWS, 'tier1_close_sw.png'), 'close', target=['bed', 'computer', 'kitchenette'],
                     azimuth=-40, elevation=32)

B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'tier1.glb'), root)
