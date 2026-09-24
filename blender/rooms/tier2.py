"""tier2: the Studio ("Bright studio with a real desk nook", Midtown). ~7.6 x 6 m, 2.7 m walls, 2 staff desks.

    node blender/run.mjs tier2 --preview
    node blender/inspect.mjs public/assets/3d/tier2.glb --check room --walk

Layout (default camera from the south-east; north + west are the visible back walls):
  NW   queen bed, head against the west wall, nightstand + lamp in the corner, gallery wall above
  N    dresser under the neon squiggle, kitchenette (sink + 4-burner stove, uppers on wall_n), tall fridge,
       front door (hallway style) near the NE corner with coat hooks + shoes
  W    desk nook under the west window (monitor + desk lamp, gear zone on the left), ring light beside it
  mid  small cafe table for two (a_eat_sit) on a round rug
  SE   two staff desks side by side facing north (their screens face the camera) on a rug, snake plant corner
  S    the big south-facing window (key light for filming), curtains, hanging plants; loveseat + round coffee table
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import room as R           # noqa: E402
import furniture as F      # noqa: E402
import extra_tier2 as X2   # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D = 7.6, 6.0
X, Y = W / 2, D / 2

door_op = R.door_opening('n', 2.95)
win_w = R.window_opening('w', -0.95, width=1.3, height=1.25, sill=1.05)
win_s = R.window_opening('s', -0.9, width=2.6, height=1.7, sill=0.55)
root = R.make_room('tier2', W, D, wall_mat={'n': 'wall_sky', 'w': 'wall_cream', 'e': 'wall_cream', 's': 'wall_sky'},
                   floor='planks', openings=[door_op, win_w, win_s], crown='plastic_white')

# ---- openings -------------------------------------------------------------------------------------------------
R.fill_opening(door_op, style='hallway', anchors=True, ajar=0)
R.fill_opening(win_w, style='standard')
R.fill_opening(win_s, style='standard', curtains='fabric_mustard')

# ---- rugs -----------------------------------------------------------------------------------------------------
F.rug((2.3, 1.7), 'rug_bed', location=(-2.35, 1.55, 0), mat='rug_rose', pattern='border', accent='fabric_cream')
F.rug((1.5, 1.5), 'rug_dining', location=(0.0, 1.1, 0), shape='round', mat='rug_green', pattern='dots',
      accent='fabric_cream')
F.rug((0.9, 0.55), 'doormat', location=(2.95, Y - 0.55, 0), mat='wood_mid', pattern='stripes', accent='kraft')

# ---- bed zone (NW) --------------------------------------------------------------------------------------------
F.bed('queen', 'upholstered', location=(-X + 1.1, 1.62, 0), rotation=B.against('w'), duvet_mat='fabric_teal',
      pillow_mat='fabric_cream', throw_mat='fabric_mustard', anchors=True, anchor_side='left', frame_mat='fabric_grey')
F.nightstand('white', location=(-X + 0.27, 2.72, 0), rotation=B.against('w'))
B.light('bed_lamp', (-X + 0.27, 2.72, 0.85), 'lamp', '#ffd9a0', 1.0, 3.5)

# ---- north wall: dresser + neon, kitchenette, fridge, door ----------------------------------------------------
F.dresser(location=(-1.15, Y - 0.24, 0), rotation=B.against('n'), mat='wood_light', w=0.95)
neon = F.neon_sign('squiggle', location=R.wall_point('n', -1.15, 1.85), rotation=B.against('n'),
                   colors=('neon_pink', 'neon_cyan'), size=1.25)
R.on_wall(neon, 'n')
F.kitchen_run(2.1, 'kitchen', location=(0.5, Y - 0.31, 0), rotation=B.against('n'), style='white',
              modules=[('drawers', 0.45), ('sink', 0.7), ('cab', 0.35), ('stove4', 0.6)], interact='fridge',
              anchors=True, wall='n', seed=2)
fridge = F.fridge('tall', location=(1.93, Y - 0.36, 0), rotation=B.against('n'), anchors=True)
B.reparent(F.microwave('microwave', location=(1.93, Y - 0.4, 1.8), rotation=B.against('n'), mat='plastic_white'),
           fridge)                                                   # studio classic: microwave on the fridge

# ---- desk nook under the west window --------------------------------------------------------------------------
F.workstation('nook', 'computer', location=(-X + 0.27, -0.95, 0), rotation=B.against('w'), monitors=1, lamp=True,
              anchors='computer', gear_anchor='a_gear_desk', desk_w=1.3, chair='basic', chair_mat='fabric_coral')
F.ring_light(location=(-X + 0.42, -2.55, 0), rotation=-130)

# ---- dining ---------------------------------------------------------------------------------------------------
F.dining_table('small', 2, location=(0.0, 1.1, 0), rotation=0, mat='wood_light', chair_style='wood',
               anchors_eat='a_eat_sit')

# ---- staff desks (SE), facing north so their screens face the camera ------------------------------------------
F.staff_desk_set(1, 'cheap', location=(1.65, -0.8, 0), rotation=0, desk_w=1.0)
F.staff_desk_set(2, 'cheap', location=(2.9, -0.8, 0), rotation=0, desk_w=1.0)

F.rug((3.1, 1.9), 'rug_staff', location=(2.28, -1.15, 0), mat='carpet_beige', pattern='border', accent='fabric_cream')

# ---- living corner under the south window: loveseat + coffee table ---------------------------------------------
F.rug((2.2, 1.5), 'rug_living', location=(-0.7, -2.0, 0), mat='fabric_cream', pattern='stripes', accent='rug_rose')
F.couch('loveseat', location=(-0.7, -Y + 0.48, 0), rotation=B.against('s'), mat='fabric_coral',
        pillow_mats=['fabric_mustard', 'fabric_teal'], anchors=True, interact='couch')
F.coffee_table('round', location=(-0.7, -1.2, 0))
F.floor_lamp('shade', location=(0.4, -Y + 0.32, 0), light_anchor='l_floor_lamp')

# ---- plants + lights ------------------------------------------------------------------------------------------
F.potted_plant('snake', 'plant_1', location=(-X + 0.3, 0.15, 0))
F.potted_plant('tall', 'plant_2', location=(X - 0.4, 0.3, 0))
F.potted_plant('snake', 'plant_4', location=(X - 0.3, -Y + 0.3, 0), seed=4)
B.light('ceiling', (-0.5, -0.2, 2.55), 'ceiling', '#ffe6c0', 1.0, 6.0)
B.light('pendant', (0.0, 1.1, 1.9), 'ceiling', '#ffd9a0', 0.8, 3.5)
B.light('window', R.inside_point(win_s, 0.4)[:2] + (1.3,), 'window', '#fff4e0', 1.2, 5.0)
B.light('desk_lamp', (-X + 0.45, -0.45, 1.15), 'lamp', '#ffd9a0', 0.7, 2.5)

X2.decor(R, B, F, X, Y, door_op)

# ---- anchors --------------------------------------------------------------------------------------------------
B.anchor('a_spawn', (1.9, 1.5, 0), 's')
B.anchor('a_film_stand', (-2.3, -1.75, 0), (-X + 0.42, -2.55))
B.anchor('a_idle_1', (X - 1.0, -2.45, 0), (X - 0.3, -Y + 0.3))        # by the snake plant in the SE corner
B.anchor('a_idle_2', (-1.15, 2.2, 0), 'n')                            # admiring the neon
B.anchor('a_idle_3', (X - 1.0, 0.3, 0), 'e')                          # watering the tall plant
B.anchor('a_idle_4', (-2.1, 0.05, 0), (-X, -0.95))                    # gazing out the west window
B.anchor('a_boxes_1', (X - 0.45, 1.55, 0), 'w', w=0.8, d=0.6, layers=3)
B.anchor('a_gear_floor_1', (-2.8, -2.65, 0), (-2.3, -1.75))
B.anchor('a_gear_floor_2', (-1.85, -2.7, 0), (-2.3, -1.75))

if args['preview']:
    B.preview_set('tier2', views=('default', 'top', 'walk'))
    B.render_preview(os.path.join(B.PREVIEWS, 'tier2_close_bed.png'), 'close', target=['bed', 'nightstand', 'dresser'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier2_close_kitchen.png'), 'close',
                     target=['kitchen', 'kitchen_upper', 'fridge', 'door'])
    B.render_preview(os.path.join(B.PREVIEWS, 'tier2_close_desk.png'), 'close',
                     target=['computer', 'ring_light'], azimuth=70)
    B.render_preview(os.path.join(B.PREVIEWS, 'tier2_close_staff.png'), 'close',
                     target=['staffdesk_1', 'staffdesk_2'])

# ---- draw-call diet: fuse pure decor into one group per wall / floor ------------------------------------------
X2.fuse('decor_w', ['art_bed', 'art_bed_2', 'art_bed_3', 'art_sw', 'art_sw_2', 'corkboard'] + X2.windows_on('w'), wall='w', R=R)
X2.fuse('decor_n', ['clock', 'neon', 'kitchen_upper'], wall='n', R=R)
X2.fuse('decor_s', ['hanging_plant_1', 'hanging_plant_2', 'curtains'] + X2.windows_on('s'), wall='s', R=R)
X2.fuse('rugs', ['rug_bed', 'rug_dining', 'doormat', 'rug_living', 'rug_staff', 'shoes', 'bed_clutter'])
X2.fuse('bins', ['trash_office', 'trash_kitchen'])

B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'tier2.glb'), root)
