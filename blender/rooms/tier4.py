"""tier4: House + Garage HQ (docs/3D.md section 5). Output: public/assets/3d/tier4.glb

    node blender/run.mjs tier4 --preview
    node blender/inspect.mjs public/assets/3d/tier4.glb --check room --walk --map

A 12 x 9 m single-storey open-plan house seen from the south-east. Zones (north = +Y, the back wall):
  NW  bedroom (king bed under a window, dresser, half-height partitions)
  N   front door + entry, kitchen run + tall fridge, island (the "product set")
  W   founder office (3-monitor desk under a window, ring-light / tripod spots)
  SW  living (TV on the west wall, couch, coffee table, rug)
  S   dining table
  E   converted garage: concrete floor, roll-up door (east wall), metal shelving = `garage` with the stock
      regions a_boxes_*, packing table, and the 5-desk team bench ("the garage office").
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import room as R           # noqa: E402
import furniture as F      # noqa: E402
import extra_tier4 as X4   # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D = 12.0, 9.0
X, Y = W / 2, D / 2           # walls at x = +-6, y = +-4.5
GX = 2.45                     # garage partition line (garage = x > GX)

# ---- openings ---------------------------------------------------------------------------------------------------
door_op = R.door_opening('n', -1.95, width=0.95)
win_bed = R.window_opening('n', -4.55, width=1.5, height=1.0, sill=1.4)
win_gar1 = R.window_opening('n', 3.2, width=1.0, height=0.5, sill=2.0)
win_gar2 = R.window_opening('n', 4.95, width=1.0, height=0.5, sill=2.0)
win_wbed = R.window_opening('w', 3.05, width=1.1, height=1.25, sill=0.95)
win_office = R.window_opening('w', -0.15, width=1.4, height=1.3, sill=1.05)
win_s_living = R.window_opening('s', -3.6, width=1.6, height=1.4, sill=0.85)
win_s_dining = R.window_opening('s', 0.2, width=1.4, height=1.4, sill=0.85)
win_e = R.window_opening('e', -2.6, width=1.2, height=1.1, sill=1.1)
garage_op = R.door_opening('e', 2.25, width=2.6, height=2.3, name='garage_door')

root = R.make_room('tier4', W, D,
                   wall_mat={'n': 'wall_sage', 'w': 'wall_cream', 's': 'wall_cream', 'e': 'concrete'},
                   floor='planks', openings=[door_op, win_bed, win_gar1, win_gar2, win_wbed, win_office,
                                             win_s_living, win_s_dining, win_e, garage_op],
                   crown='plastic_white')

# wall paint zones (decor on the walls): blush accent behind the bed, grey garage paint on n + s
X4.wall_paint('n', -6.0, -2.6, 'wall_blush', name='paint_bedroom', skip=[win_bed])
X4.wall_paint('n', GX, 6.0, 'concrete', name='paint_garage_n', skip=[win_gar1, win_gar2])
X4.wall_paint('s', GX, 6.0, 'concrete', name='paint_garage_s')

# ---- openings filled ----------------------------------------------------------------------------------------------
R.fill_opening(door_op, style='wood', anchors=True, stand_dist=0.75)
R.fill_opening(win_bed, style='standard', curtains='fabric_cream')
R.fill_opening(win_gar1, style='factory')
R.fill_opening(win_gar2, style='factory')
R.fill_opening(win_wbed, style='standard', curtains='rug_rose', outside='grass')
R.fill_opening(win_office, style='standard', outside='grass')
R.fill_opening(win_s_living, style='standard', curtains='fabric_teal', outside='grass')
R.fill_opening(win_s_dining, style='standard', outside='grass')
R.fill_opening(win_e, style='standard')
rud = F.roll_up_door(2.6, 2.3, location=R.opening_point(garage_op), rotation=B.against('e'), open_frac=0.0)
R.on_wall(rud, 'e')

# ---- floors + rugs (flat, first) ------------------------------------------------------------------------------------
X4.garage_floor(GX, X, -Y, Y, door_y=2.25)
X4.rebuild_floor((0.26, 1.2, 2.4), ('wood_light',), seed=4)
X4.trim_floor(lambda x, y: x > GX + 0.02)
F.rug((2.9, 2.2), 'rug_bed', location=(-4.55, 2.9, 0), mat='rug_rose', accent='fabric_cream', pattern='border')
F.rug((2.6, 2.0), 'rug_living', location=(-4.45, -3.25, 0), mat='rug_green', accent='fabric_cream',
      pattern='diamond')
F.rug((2.9, 2.2), 'rug_dining', location=(-0.35, -2.7, 0), mat='wall_sky', accent='fabric_cream',
      pattern='border')
F.rug((1.1, 0.6), 'doormat', location=(-1.95, 3.9, 0), mat='wood_mid', accent='fabric_mustard', pattern='border')

# ---- bedroom (NW) ----------------------------------------------------------------------------------------------------
F.bed('king', 'upholstered', location=(-4.55, 3.4, 0), rotation=B.against('n'), duvet_mat='fabric_blue',
      throw_mat='fabric_mustard', pillow_mat='fabric_cream', anchors=True, anchor_side='right', seed=4)
F.nightstand('wood', 'nightstand_l', location=(-5.75, 4.25, 0), rotation=B.against('n'), seed=2)
ns_r = F.nightstand('wood', 'nightstand_r', location=(-3.3, 4.25, 0), rotation=B.against('n'), seed=3)
B.light('l_bed_lamp', (-3.3, 4.25, 0.8), 'lamp', '#ffd49a', 1.0, 3.5)
F.dresser('dresser', location=(-5.76, 1.95, 0), rotation=B.against('w'), mat='wood_light', w=1.0)
pb = F.partition(2.1, 1.1, 'partition_bed', location=(-4.95, 1.15, 0), mat='wall_cream')
X4.cap_decor(pb, 2.1, seed=3, items=('books', 'plant', 'frame'))
X4.laundry_pile('laundry_floor', location=(-3.35, 1.6, 0))
X4.slippers('slippers', location=(-3.3, 2.75, 0), rotation=-70)
art = F.framed_art((0.55, 0.42), 'art_bed_w', location=R.wall_point('w', 1.95, 1.6), rotation=B.against('w'),
                   style='plant', frame='wood_light')
R.on_wall(art, 'w')

# ---- entry (front door on the north wall) --------------------------------------------------------------------------
X4.sneakers(B.bpy.data.objects['doormat'], (-0.25, -0.02, 0.012), rot=80)
hooks = X4.coat_hooks('coat_hooks', location=R.wall_point('n', -1.05, 1.65), rotation=B.against('n'))
R.on_wall(hooks, 'n')

# ---- kitchen (north) + island ------------------------------------------------------------------------------------------
F.kitchen_run(2.4, 'kitchen', location=(0.15, Y - 0.31, 0), rotation=B.against('n'), style='sage',
              modules=[('drawers', 0.5), ('sink', 0.8), ('dishwasher', 0.5), ('stove4', 0.6)],
              interact='fridge', anchors=True, wall='n', seed=4)
F.fridge('tall', location=(1.8, Y - 0.36, 0), rotation=B.against('n'), anchors=True, seed=4)
F.kitchen_island(2.0, 0.9, 'island', location=(0.15, 2.25, 0), style='wood', counter_mat='plastic_white',
                 stools=3, stool_mat='fabric_mustard')
X4.product_set('island_set', location=(0.15, 2.25, 0.9))
F.ceiling_light('pendant', 'pendant_island_1', location=(-0.45, 2.25, 2.7), drop=0.95, mat='fabric_mustard',
               light_anchor='l_kitchen')
F.ceiling_light('pendant', 'pendant_island_2', location=(0.75, 2.25, 2.7), drop=0.95, mat='fabric_mustard')

# ---- founder office (west wall, under the window) ----------------------------------------------------------------------
F.workstation('l_shaped', 'computer', location=(-X + 0.34, -0.15, 0), rotation=B.against('w'), monitors=3,
              monitor_size='small', chair='gaming', chair_mat='fabric_navy', desk_w=2.0, lamp='fabric_coral',
              anchors='computer', gear_anchor='a_gear_desk', seed=4)
F.bookshelf('tall', 'bookshelf', location=(-X + 0.2, -1.75, 0), rotation=B.against('w'), w=0.8, h=1.55, seed=4)
F.potted_plant('tall', 'plant_office', location=(-X + 0.4, 0.95, 0), seed=5)

# ---- living (SW) -----------------------------------------------------------------------------------------------------------
F.tv(1.4, 'tv', location=(-X + 0.25, -3.3, 0), rotation=B.against('w'), stand_style='low', interact='tv')
F.couch('three', 'couch', location=(-3.05, -3.3, 0), rotation=B.against('e'), mat='fabric_coral',
        pillow_mats=['fabric_cream', 'fabric_teal'], throw_mat='fabric_mustard', interact='couch', anchors=True,
        seed=4)
F.coffee_table('wood', 'coffee_table', location=(-4.75, -3.3, 0), rotation=90, seed=4)
F.floor_lamp('arc', 'floor_lamp', location=(-2.95, -4.2, 0), rotation=-145, light_anchor='l_living')
F.potted_plant('snake', 'plant_living', location=(-X + 0.28, -Y + 0.26, 0), seed=6)
F.potted_plant('monstera', 'plant_big', location=(-1.9, -Y + 0.62, 0), seed=6)

# ---- dining (south middle) --------------------------------------------------------------------------------------------------
F.dining_table('rect', 4, 'dining_table', location=(-0.35, -2.7, 0), rotation=0, mat='wood_light',
               chair_style='wood', anchors_eat='a_eat_sit', place_settings=False)
X4.table_spread('table_spread', location=(-0.35, -2.7, 0.75))
F.ceiling_light('globe', 'pendant_dining', location=(-0.35, -2.7, 2.7), drop=0.9, light_anchor='l_dining')
F.bean_bag('bean_bag', location=(0.95, -3.95, 0), rotation=150, mat='fabric_mustard')
X4.robot_vacuum('robot_vacuum', location=(0.9, -0.6, 0), rotation=35)

# ---- garage: shelving (= garage), packing table, team bench ---------------------------------------------------------------
sh1 = F.metal_shelving(1.2, 1.85, 0.5, 5, 'shelving_1', location=(3.2, Y - 0.27, 0), rotation=B.against('n'),
                       interact='garage', seed=41, boxes_anchor='a_boxes_1')
sh2 = F.metal_shelving(1.2, 1.85, 0.5, 5, 'shelving_2', location=(4.45, Y - 0.27, 0), rotation=B.against('n'),
                       interact='garage', seed=42, boxes_anchor='a_boxes_2')
sh3 = F.metal_shelving(0.85, 1.85, 0.5, 5, 'shelving_3', location=(5.55, Y - 0.27, 0), rotation=B.against('n'),
                       interact='garage', seed=43)
B.anchor('a_garage_stand', (3.8, Y - 1.2, 0), 'n')
X4.pallet('pallet', location=(5.35, 3.2, 0))
B.anchor('a_boxes_3', (5.35, 3.2, 0.14), 'w', w=0.9, d=0.7, layers=3)       # floor pallet by the shelves
pt = F.packing_table(1.6, 0.8, 'packing_table', location=(4.0, 2.05, 0), rotation=0, seed=4)
X4.floor_boxes(pt, [(1.05, 0.12, 2)], seed=3)
pg = F.partition(1.5, 1.1, 'partition_garage_n', location=(GX, 1.65, 0), rotation=90, mat='concrete', cap='wood_light')
X4.cap_decor(pg, 1.5, seed=7, items=('plant', 'books'))
F.partition(1.8, 1.1, 'partition_garage_s', location=(GX, -2.3, 0), rotation=90, mat='concrete', cap='wood_light')

# team bench along X: 3 desks on the north side face south (faces read from the default camera), 2 on the south
# side face north; monitors back to back down the middle
CY = -2.15
staff_cfg = [  # (n, x, side, monitors, laptop, chair colour)
    (1, 3.15, 'n', 2, None, 'fabric_teal'), (2, 4.25, 'n', 1, 'pro', 'fabric_mustard'),
    (3, 5.35, 'n', 1, None, 'fabric_coral'), (4, 3.15, 's', 1, None, 'fabric_blue'),
    (5, 4.25, 's', 2, None, 'fabric_teal'),
]
STAFF_CHAIR = {}
for n, xx, side, mons, lap, cm in staff_cfg:
    STAFF_CHAIR[n] = cm
    F.staff_desk_set(n, 'cheap', location=(xx, CY + (0.285 if side == 'n' else -0.285), 0),
                     rotation=B.against('s' if side == 'n' else 'n'), monitors=mons, laptop_style=lap,
                     chair_mat=cm)
F.potted_plant('snake', 'plant_bench', location=(5.35, CY - 0.55, 0), seed=9)
F.whiteboard(1.3, 0.9, 'whiteboard', location=(4.55, 0.5, 0), rotation=-8, seed=4)
F.water_cooler('water_cooler', location=(X - 0.3, 0.2, 0), rotation=B.against('e'))
F.ceiling_light('cage', 'garage_lamp_1', location=(4.1, 2.4, 2.7), drop=0.45, mat='metal_dark',
               light_anchor='l_garage')
F.ceiling_light('cage', 'garage_lamp_2', location=(4.25, CY, 2.7), drop=0.45, mat='metal_dark',
               light_anchor='l_team')
X4.bike('bike', location=(X - 0.35, -3.75, 0), rotation=0)

# ---- wall decor ----------------------------------------------------------------------------------------------------------
clock = F.wall_clock(location=R.wall_point('n', -0.9, 2.3), rotation=B.against('n'))
R.on_wall(clock, 'n')
p1 = F.poster((0.55, 0.75), 'poster_garage', location=R.wall_point('w', -3.3, 1.75), rotation=B.against('w'),
              style='sunset', frame='wood_light')
R.on_wall(p1, 'w')
sl = F.string_lights(R.wall_point('n', 2.6, 2.45, 0.03), R.wall_point('n', 5.9, 2.45, 0.03), n=12, sag=0.14,
                     name='string_lights_garage')
R.on_wall(sl, 'n')

# ---- hand-placed anchors ----------------------------------------------------------------------------------------------------
B.anchor('a_spawn', (-1.0, 0.4, 0), 's')
B.anchor('a_film_stand', (-3.85, -0.35, 0), 'w')
B.anchor('a_gear_floor_1', (-4.95, 0.95, 0), (-3.85, -0.35))
B.anchor('a_gear_floor_2', (-4.95, -1.55, 0), (-3.85, -0.35))
B.anchor('a_idle_1', (-4.9, 2.1, 0), (-X, 3.05))           # bedroom window
B.anchor('a_idle_2', (-X + 1.05, -1.75, 0), 'w')            # bookshelf
B.anchor('a_idle_3', (4.45, -0.35, 0), (4.55, 0.5))            # whiteboard
B.anchor('a_idle_4', (1.5, -Y + 1.2, 0), 's')               # south window
B.anchor('a_idle_5', (0.9, 1.35, 0), 'n')                   # island
B.anchor('a_idle_6', (4.0, 1.15, 0), 'n')                     # packing table

# ---- budget: merge decor that shares a wall / the floor, trim bevels on small parts ------------------------------
OFFICE = ['plastic_white', 'plastic_black', 'metal', 'plant', 'fabric_coral']
HALF = ['wood_light', 'plastic_white', 'plant', 'fabric_coral', 'fabric_teal']
X4.finish(root,
          reparent={'island_set': 'island', 'table_spread': 'dining_table', 'laundry_floor': 'rug_bed'},
          merges={'floor_decor': (['rug_bed', 'rug_living', 'rug_dining', 'doormat', 'garage_floor',
                                   'robot_vacuum', 'slippers'], {}),
                  'garage': (['shelving_1', 'shelving_2', 'shelving_3'], {'interact': 'garage', 'obstacle': True}),
                  'kitchen_fridge': (['kitchen', 'fridge'], {'interact': 'fridge', 'obstacle': True}),
                  'nightstands': (['nightstand_l', 'nightstand_r'], {'obstacle': True}),
                  'living_wall': (['tv', 'plant_living', 'bookshelf'], {'obstacle': True}),
                  'sofa': (['couch', 'floor_lamp'], {'interact': 'couch', 'obstacle': True}),
                  'team_corner': (['whiteboard', 'water_cooler'], {'obstacle': True})},
          restricts={**{f'staffdesk_{i}': OFFICE + [STAFF_CHAIR[i]] for i in range(1, 6)}, 'computer': OFFICE + ['fabric_navy'],
                     'partition_bed': (HALF + ['wall_cream'], 1.0),
                     'partition_garage_n': (HALF + ['concrete'], 1.0),
                     'team_corner': ['plastic_white', 'metal', 'fabric_blue', 'fabric_coral', 'plastic_black'],
                     'floor_decor': ['fabric_mustard', 'wood_mid', 'plastic_black', 'slab', 'concrete',
                                     'plastic_white', 'fabric_cream', 'rug_rose', 'wall_sky', 'rug_green',
                                     'fabric_coral'],
                     'wall_w_decor': ['wood_light', 'plant', 'plastic_white', 'plastic_black', 'fabric_coral',
                                      'rug_rose'],
                     'coffee_table': ['wood_mid', 'plastic_white', 'fabric_coral', 'plant'],
                     'living_wall': (['wood_light', 'plastic_black', 'plastic_white', 'plant', 'fabric_teal',
                                      'fabric_coral', 'fabric_mustard'], 1.0),
                     'dresser': ['wood_light', 'fabric_coral', 'plastic_white'],
                     'nightstands': ['wood_light', 'fabric_blue', 'fabric_coral'],
                     'packing_table': ['wood_light', 'kraft', 'plastic_black', 'plastic_white'],
                     'garage': ['metal', 'wood_light', 'kraft', 'fabric_blue', 'fabric_coral', 'fabric_mustard'],
                     'wall_n_decor': ['plastic_white', 'plastic_black', 'fabric_cream', 'wall_sage', 'wood_light',
                                      'fabric_navy', 'fabric_teal', 'metal'],
                     'island': ['wood_light', 'plastic_white', 'fabric_mustard', 'plant', 'fabric_coral'],
                     'kitchen_fridge': ['plastic_white', 'metal', 'wall_sage', 'wood_light', 'plant',
                                        'fabric_coral', 'plastic_black']},
          small=1.0)

if 'report' in args['rest']:
    X4.tri_report(root)
if args['preview']:
    B.preview_set('tier4', views=('default', 'top', 'walk'))
    B.render_preview(os.path.join(B.PREVIEWS, 'tier4_close_garage.png'), 'close',
                     target=['garage', 'packing_table', 'staffdesk_1', 'staffdesk_3', 'staffdesk_5'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier4_close_house.png'), 'close',
                     target=['bed', 'computer', 'couch', 'kitchen_fridge', 'island'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier4_close_office.png'), 'close',
                     target=['computer', 'bookshelf', 'plant_office'])

out = args['out'] or os.path.join(B.ASSETS_3D, 'tier4.glb')
B.export_glb(out, root)
if args['preview']:
    B.render_preview(os.path.join(B.PREVIEWS, 'tier4_merged.png'), 'default')
