"""tier5: Penthouse HQ (docs/3D.md section 5). Output: public/assets/3d/tier5.glb

    node blender/run.mjs tier5 --preview
    node blender/inspect.mjs public/assets/3d/tier5.glb --check room --walk --map

A 13 x 10 m top-floor penthouse at night, 3.4 m walls. Floor-to-ceiling glass on the north (+Y) and west (-X)
walls with a low-poly skyline in `outside`; dark walnut floor; the solid part of the north wall is a walnut
feature wall holding the designer kitchen, the built-in fridge and the brushed-metal private elevator (= door).
Zones: NW bedroom (king platform bed facing the view), N dining for four by the glass, NE kitchen + island,
W executive desk with two ultrawides against the skyline, SW lounge (sectional, TV, bar cart),
SE a sleek 7-desk team bench (4 face the camera, 3 face away), E package plinths by the elevator (a_boxes_*).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402
import room as R           # noqa: E402
import furniture as F      # noqa: E402
import extra_tier4 as X4   # noqa: E402  (shared budget helpers)
import extra_tier5 as X5   # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D, H = 13.0, 10.0, 3.4
X, Y = W / 2, D / 2           # walls at x = +-6.5, y = +-5
BACKDROP = '#08143a'          # src/ui/shell/hotspots.ts ROOM_BACKDROP.tier5

# ---- openings: glass walls (n: x -6.4..1.1, w: y -4.9..4.9), elevator on the solid part of the north wall -------
GS, GH = 0.02, 3.28
glass_n = [R.window_opening('n', -5.15, width=2.5, height=GH, sill=GS, name='glass_n1'),
           R.window_opening('n', -2.55, width=2.5, height=GH, sill=GS, name='glass_n2'),
           R.window_opening('n', -0.05, width=2.3, height=GH, sill=GS, name='glass_n3')]
glass_w = [R.window_opening('w', y, width=2.3, height=GH, sill=GS, name=f'glass_w{i + 1}')
           for i, y in enumerate((3.75, 1.25, -1.25, -3.75))]
lift = R.door_opening('n', 5.7, width=1.1, height=2.4, name='elevator')

root = R.make_room('tier5', W, D, wall_h=H,
                   wall_mat={'n': 'wood_dark', 'w': 'plastic_black', 'e': 'wall_cream', 's': 'wall_cream'},
                   floor='planks_dark', openings=glass_n + glass_w + [lift], baseboard='plastic_black')
X4.rebuild_floor((0.3, 1.4, 2.8), ('wood_dark',), seed=5)

for op in glass_n + glass_w:
    R.fill_opening(op, style='floor', frame_mat='plastic_black', sky=False)
R.fill_opening(lift, style='elevator', anchors=True, stand_dist=0.8)

# ---- the city ----------------------------------------------------------------------------------------------------
X5.skyline(W, D, H, 'outside', seed=11, root=root)

# ---- rugs ----------------------------------------------------------------------------------------------------------
F.rug((3.3, 2.7), 'rug_bed', location=(-4.75, 3.2, 0), mat='fabric_grey', accent='fabric_cream', pattern='border')
F.rug((3.6, 3.0), 'rug_lounge', location=(-4.2, -3.35, 0), mat='fabric_cream', accent='fabric_mustard',
      pattern='border')
F.rug((2.2, 2.2), 'rug_dining', location=(-0.6, 3.4, 0), mat='fabric_navy', accent='fabric_cream', shape='round',
      pattern='border')
F.rug((5.6, 3.2), 'rug_office', location=(3.1, -2.2, 0), mat='fabric_blue', accent='fabric_navy', pattern='stripes')

# ---- bedroom (NW): king platform bed facing south, the skyline behind the headboard --------------------------------
F.bed('king', 'upholstered', location=(-4.55, 3.75, 0), rotation=B.against('n'), duvet_mat='fabric_cream',
      throw_mat='fabric_mustard', pillow_mat='plastic_white', sheet_mat='fabric_grey', anchors=True,
      anchor_side='right', seed=5)
F.nightstand('white', 'nightstand', location=(-6.0, 4.55, 0), rotation=B.against('n'), mat='wood_dark', seed=5)
B.light('l_bed', (-6.0, 4.55, 0.85), 'lamp', '#ffd49a', 1.0, 3.5)
F.floor_lamp('tripod', 'bed_lamp', location=(-3.0, 4.6, 0), rotation=160)
X5.bed_bench('bench_bed', location=(-4.55, 2.2, 0), w=1.6, mat='fabric_mustard')
F.potted_plant('tall', 'plant_bed', location=(-6.1, 2.1, 0), seed=21)

# ---- dining for four by the north glass --------------------------------------------------------------------------------
F.dining_table('round', 4, 'dining_table', location=(-0.6, 3.4, 0), mat='wood_dark', chair_style='wood',
               chair_mat='fabric_mustard', anchors_eat='a_eat_sit', place_settings=False)
X4.table_spread('table_spread', location=(-0.6, 3.4, 0.75))
F.ceiling_light('globe', 'pendant_dining', location=(-0.6, 3.4, H), drop=1.3, light_anchor='l_dining')

# ---- designer kitchen on the walnut wall + island ---------------------------------------------------------------------
F.kitchen_run(2.7, 'kitchen', location=(2.65, Y - 0.31, 0), rotation=B.against('n'), style='designer',
              modules=[('drawers', 0.6), ('sink', 0.8), ('dishwasher', 0.6), ('stove4', 0.7)], interact='fridge',
              anchors=True, wall='n', wall_h=H, seed=5)
F.fridge('built_in', location=(4.4, Y - 0.33, 0), rotation=B.against('n'), mat='plastic_white', anchors=True)
isl = F.kitchen_island(2.4, 1.0, 'island', location=(2.65, 2.45, 0), style='designer', counter_mat='plastic_white',
                       stools=3, stool_mat='fabric_navy')
B.light('l_kitchen', (2.65, 2.45, H - 1.45), 'ceiling', '#fff1d6', 1.6, 6.0)      # no hanging fixture: nothing floats
cm = F.coffee_machine('coffee_machine', location=(1.55, Y - 0.34, 0.9), rotation=B.against('n'), parent=root)

# ---- elevator foyer + package plinths (a_boxes_*) -------------------------------------------------------------------
X5.plinth('plinth_1', location=(6.0, 2.9, 0), rotation=-90, w=0.9, d=0.7)
B.anchor('a_boxes_1', (6.0, 2.9, 0.12), 'w', w=0.8, d=0.6, layers=3)
X5.plinth('plinth_2', location=(6.0, 1.75, 0), rotation=-90, w=0.9, d=0.7)
B.anchor('a_boxes_2', (6.0, 1.75, 0.12), 'w', w=0.8, d=0.6, layers=3)
F.potted_plant('snake', 'plant_lift', location=(6.15, 4.55, 0), seed=22)

# ---- executive desk (west glass) -------------------------------------------------------------------------------------
F.workstation('executive', 'computer', location=(-X + 0.5, 0.1, 0), rotation=B.against('w'), monitors=2,
              monitor_size='ultrawide', chair='executive', chair_mat='plastic_black', lamp='plastic_black',
              anchors='computer', gear_anchor='a_gear_desk', seed=5)
X5.sculpture('sculpture', location=(-X + 0.4, -1.9, 0))
F.potted_plant('monstera', 'plant_desk', location=(-X + 0.55, 1.75, 0), seed=23)

# ---- lounge (SW): sectional facing the TV and the west glass ----------------------------------------------------------
F.tv(1.6, 'tv', location=(-X + 0.3, -3.35, 0), rotation=B.against('w'), stand_style='console', console=False,
     interact='tv')
F.couch('sectional', 'couch', location=(-2.85, -3.1, 0), rotation=B.against('e'), mat='fabric_grey',
        pillow_mats=['fabric_mustard', 'fabric_teal'], interact='couch', anchors=True, seed=5)
F.coffee_table('round', 'coffee_table', location=(-4.35, -3.3, 0), mat='wood_dark', seed=5)
F.floor_lamp('arc', 'floor_lamp', location=(-2.3, -4.6, 0), rotation=-136, light_anchor='l_lounge')
X5.bar_cart('bar_cart', location=(-1.1, -4.6, 0), rotation=0)
F.armchair('club', 'armchair', location=(-4.35, -4.55, 0), rotation=B.facing_deg((-5.9, -3.3), (-4.35, -4.55)),
           mat='fabric_mustard', leg_mat='wood_dark')

# ---- games corner in the middle: pool table --------------------------------------------------------------
X5.pool_table('pool_table', location=(-1.3, -0.35, 0), rotation=0)
F.ceiling_light('pendant', 'pendant_pool', location=(-1.3, -0.35, H), drop=1.6, mat='plastic_black',
               light_anchor='l_pool')

# ---- team bench (SE): 4 desks on the north side face south (toward the camera), 3 on the south side face north --------
CY = -2.2
staff = [  # (n, x, side, monitors, chair)
    (1, 1.05, 'n', 2, 'fabric_teal'), (2, 2.25, 'n', 2, 'fabric_navy'), (3, 3.45, 'n', 1, 'fabric_coral'),
    (4, 4.65, 'n', 2, 'fabric_mustard'), (5, 1.05, 's', 1, 'fabric_blue'), (6, 2.25, 's', 2, 'fabric_teal'),
    (7, 3.45, 's', 1, 'fabric_navy'),
]
for n, xx, side, mons, cmat in staff:
    F.staff_desk_set(n, 'cheap', location=(xx, CY + (0.3 if side == 'n' else -0.3), 0),
                     rotation=B.against('s' if side == 'n' else 'n'), monitors=mons, chair_mat=cmat,
                     desk_w=1.2, desk_d=0.6)
X5.planter_box('planter_bench', location=(4.65, CY - 0.3, 0), w=1.1, d=0.5)
B.light('l_office', (2.85, CY + 0.35, H - 1.2), 'ceiling', '#fff1d6', 1.6, 6.0)
F.whiteboard(1.4, 0.95, 'whiteboard', location=(5.6, 0.05, 0), rotation=35, seed=5)
F.water_cooler('water_cooler', location=(X - 0.3, -4.55, 0), rotation=B.against('e'))

# ---- wall decor on the walnut wall + a neon accent ---------------------------------------------------------------------
art = F.framed_art((0.9, 0.6), 'art_kitchen', location=R.wall_point('n', 4.9 - 0.02, 2.75), rotation=B.against('n'),
                   style='abstract', frame='plastic_black')
R.on_wall(art, 'n')
neon = F.neon_sign('bolt', 'neon', location=R.wall_point('e', -2.2, 2.2), rotation=B.against('e'),
                   colors=('neon_cyan', 'neon_pink'), size=1.1)
R.on_wall(neon, 'e')
clock = F.wall_clock(0.2, location=R.wall_point('s', 2.8, 2.6), rotation=B.against('s'), mat='plastic_black',
                     rim='fabric_mustard')
R.on_wall(clock, 's')

# ---- hand-placed anchors ---------------------------------------------------------------------------------------------
B.anchor('a_spawn', (1.2, 0.4, 0), 's')
B.anchor('a_film_stand', (-4.35, 0.1, 0), 'w')
B.anchor('a_gear_floor_1', (-5.1, 1.35, 0), (-4.35, 0.1))
B.anchor('a_gear_floor_2', (-5.1, -1.05, 0), (-4.35, 0.1))
B.anchor('a_idle_1', (-2.45, 4.4, 0), 'n')                   # the north view
B.anchor('a_idle_2', (-5.1, -1.45, 0), 'w')                  # the west view by the sculpture
B.anchor('a_idle_3', (-1.4, -3.9, 0), (-1.1, -4.6))          # bar cart
B.anchor('a_idle_4', (5.95, -0.75, 0), (5.6, 0.05))           # whiteboard
B.anchor('a_idle_5', (0.2, 1.3, 0), (0.5, 5.0))              # between kitchen and dining, looking out
B.anchor('a_idle_6', (-1.9, -1.45, 0), (-1.3, -0.35))        # pool table

OFFICE = ['plastic_white', 'plastic_black', 'metal', 'plant', 'fabric_coral']
STAFF_CHAIR = {n: c for n, _, _, _, c in staff}
if 'report' in args['rest']:
    X4.tri_report(root)
X4.finish(root,
          reparent={'table_spread': 'dining_table', 'coffee_machine': 'kitchen', 'bed_lamp': 'nightstand'},
          merges={'floor_decor': (['rug_bed', 'rug_lounge', 'rug_dining', 'rug_office'], {}),
                  'kitchen_fridge': (['kitchen', 'fridge'], {'interact': 'fridge', 'obstacle': True}),
                  'plinths': (['plinth_1', 'plinth_2'], {'obstacle': True}),
                  },
          restricts={**{f'staffdesk_{i}': OFFICE + [STAFF_CHAIR[i]] for i in range(1, 8)},
                     'computer': OFFICE + ['wood_dark']},
          small=1.0)

if args['preview']:
    B.WORLD['sky'] = '#4a5a8e'        # dusky preview light; the runtime lights the room itself
    B.WORLD['sun'] = 2.4
    B.WORLD['sun_color'] = '#dfe6ff'
    B.preview_set('tier5', views=('default', 'top', 'walk'))
    B.render_preview(os.path.join(B.PREVIEWS, 'tier5_close_office.png'), 'close',
                     target=['staffdesk_1', 'staffdesk_4', 'staffdesk_7', 'planter_bench'], backdrop=BACKDROP)
    B.render_preview(os.path.join(B.PREVIEWS, 'tier5_close_home.png'), 'close',
                     target=['bed', 'computer', 'couch', 'kitchen_fridge', 'island', 'dining_table'],
                     backdrop=BACKDROP)
    B.render_preview(os.path.join(B.PREVIEWS, 'tier5_default_navy.png'), 'default', backdrop=BACKDROP)
    if 'skyline' in args['rest']:
        B.render_preview(os.path.join(B.PREVIEWS, 'tier5_skyline_debug.png'), 'close', target=['bed', 'plant_desk', 'plant_bed'],
                         azimuth=45.0001, elevation=40.0001, backdrop=BACKDROP)

out = args['out'] or os.path.join(B.ASSETS_3D, 'tier5.glb')
B.export_glb(out, root)
if args['preview']:
    B.render_preview(os.path.join(B.PREVIEWS, 'tier5_merged.png'), 'default', backdrop=BACKDROP)
