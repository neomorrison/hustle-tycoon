"""Sample room exercising the shared lib (not a game room). Output: blender/.out/_sample.glb (never public/).

    node blender/run.mjs _sample --preview
    node blender/inspect.mjs blender/.out/_sample.glb --check room --walk --map

Read it as a worked example of the conventions in blender/README.md: openings + fill_opening, furniture against
walls with B.against, wall decor parented with R.on_wall, builder anchors (anchors=True), hand-placed anchors,
a staff desk, light anchors, previews, export. Everything that matters sits on the north / west walls (the back
walls in the default south-east view) or free-standing.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import room as R           # noqa: E402
import furniture as F      # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D = 7.0, 5.5
X, Y = W / 2, D / 2          # half sizes: walls at x = +-3.5, y = +-2.75
door_op = R.door_opening('n', -0.35)
win_n = R.window_opening('n', -2.45, width=1.1, height=1.2, sill=1.0)
win_w = R.window_opening('w', -1.25, width=1.3, height=1.2, sill=1.0)
root = R.make_room('_sample', W, D, wall_mat={'n': 'wall_sage', 'w': 'wall_cream', 'e': 'wall_cream', 's': 'wall_sage'},
                   floor='planks', openings=[door_op, win_n, win_w])

# ---- openings -------------------------------------------------------------------------------------------------
R.fill_opening(door_op, style='hallway', anchors=True, ajar=20)          # a_door_stand + a_door_exit
R.fill_opening(win_n, style='standard')
R.fill_opening(win_w, style='standard', curtains='fabric_coral')

# ---- rugs first (flat, not obstacles) -------------------------------------------------------------------------
F.rug((2.4, 1.6), 'rug_living', location=(-0.4, -1.55, 0), mat='rug_green', pattern='border')
F.rug((1.5, 1.5), 'rug_round', location=(2.3, -1.3, 0), shape='round', mat='fabric_mustard', pattern='dots',
      accent='fabric_cream')

# ---- bed: head against the west wall, foot toward the room ----------------------------------------------------
F.bed('full', 'wood', location=(-X + 1.05, 1.35, 0), rotation=B.against('w'), duvet_mat='fabric_teal', messy=True,
      anchors=True, anchor_side='left')           # left of a west-wall bed = its south side, open floor
F.nightstand('wood', location=(-X + 0.25, 2.4, 0), rotation=B.against('w'))
lights = F.string_lights((-X + 0.02, 2.55, 2.2), (-X + 0.02, 0.2, 2.25), n=10, sag=0.2)
R.on_wall(lights, 'w')

# ---- computer desk against the west wall under the window, gear zone reserved on its left ----------------------
F.workstation('old', 'computer', location=(-X + 0.32, -1.25, 0), rotation=B.against('w'), monitors=1, lamp=True,
              anchors='computer', gear_anchor='a_gear_desk')

# ---- kitchen + fridge along the north wall (uppers parented to wall_n) ----------------------------------------
F.kitchen_run(1.9, 'kitchen', location=(1.55, Y - 0.31, 0), rotation=B.against('n'), style='sage',
              modules=[('drawers', 0.5), ('sink', 0.8), ('stove2', 0.6)], interact='fridge', anchors=True,
              wall='n')                                                    # a_stove_stand
F.fridge('tall', location=(2.9, Y - 0.36, 0), rotation=B.against('n'), anchors=True)   # a_fridge_stand

# ---- wall decor on the north wall between window and door -----------------------------------------------------
p = F.poster((0.5, 0.7), 'poster_1', location=R.wall_point('n', -1.35, 1.6), rotation=B.against('n'), style='sunset')
R.on_wall(p, 'n')
clock = F.wall_clock(location=R.wall_point('n', 0.45, 2.35), rotation=B.against('n'))
R.on_wall(clock, 'n')

# ---- living: couch with its back to the (cut-away) south wall, facing north --------------------------------------
F.couch('saggy', location=(-0.4, -Y + 0.5, 0), rotation=B.against('s'), mat='fabric_blue', anchors=True)
F.coffee_table('wood', location=(-0.4, -0.95, 0))
F.floor_lamp('shade', location=(-1.75, -Y + 0.35, 0), light_anchor='l_floor_lamp')

# ---- small dining table (eat seat) ----------------------------------------------------------------------------
F.dining_table('round', 2, location=(2.3, -1.3, 0), anchors_eat='a_eat_sit')

# ---- one staff desk, free standing, facing north ---------------------------------------------------------------
F.staff_desk_set(1, 'cheap', location=(1.0, 0.35, 0), rotation=0)

# ---- decor --------------------------------------------------------------------------------------------------------
F.potted_plant('monstera', 'plant_1', location=(-X + 0.45, -Y + 0.45, 0))
F.potted_plant('snake', 'plant_2', location=(X - 0.3, 0.9, 0))
F.moving_boxes(4, location=(X - 0.55, -Y + 0.45, 0), rotation=-6)
F.ceiling_lamp('pendant', 'pendant', location=(2.3, -1.3, 2.7), drop=0.8, light_anchor='l_ceiling')

# ---- hand-placed anchors -------------------------------------------------------------------------------------------
B.anchor('a_spawn', (0.0, 1.2, 0), 's')
B.anchor('a_idle_1', (-X + 1.0, -0.2, 0), 'w')                  # by the desk window
B.anchor('a_idle_2', (X - 0.9, 0.9, 0), (X - 0.3, 0.9))         # looking at the snake plant
B.anchor('a_idle_3', (0.45, 1.8, 0), 'n')                        # at the clock
B.anchor('a_film_stand', (0.9, -1.0, 0), 'se')
B.anchor('a_boxes_1', (X - 0.5, -0.3, 0), 'w', w=0.8, d=0.5, layers=3)
B.anchor('a_gear_floor_1', (-X + 0.45, -0.25, 0), 'e')
B.anchor('a_gear_floor_2', (-X + 1.2, -0.2, 0), 'e')

if args['preview']:
    B.preview_set('_sample', views=('default', 'top', 'walk', 'front'))
    B.render_preview(os.path.join(B.PREVIEWS, '_sample_close_bed.png'), 'close', target='bed')
    B.render_preview(os.path.join(B.PREVIEWS, '_sample_close_computer.png'), 'close', target='computer')
    B.render_preview(os.path.join(B.PREVIEWS, '_sample_close_kitchen.png'), 'close',
                     target=['kitchen', 'kitchen_upper', 'fridge'])

out = args['out'] or os.path.join(B.OUT_DIR, '_sample.glb')
B.export_glb(out, root)
if args['preview']:
    B.render_preview(os.path.join(B.PREVIEWS, '_sample_merged.png'), 'default')
