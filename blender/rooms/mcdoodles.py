"""McDoodle's: the burger restaurant where the player works shifts (docs/3D.md section 5, room `mcdoodles`).

    node blender/run.mjs mcdoodles --preview
    node blender/inspect.mjs public/assets/3d/mcdoodles.glb --check room --walk

11 x 8 m, 3.0 m walls. Kitchen line along the north wall (bun rack, prep + bun toaster, grill, fryers + dump
station, assembly pass, broken soft-serve, hand sink, dry storage), front counter with two registers across the
room, self-serve drinks to its east, dining room to the south: three red booths along the south wall, a two-top,
trash station, glass exit door + storefront window on the west wall. Checkered floor, red quarry tile in the kitchen.
"""
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B              # noqa: E402
import room as R               # noqa: E402
import furniture as F          # noqa: E402
import extra_mcdoodles as M    # noqa: E402

args = B.cli_args()
B.clean_scene()

W, D, H = 11.0, 8.0, 3.0
X, Y = W / 2, D / 2
COUNTER_Y = 1.25              # front counter centre line (depth 0.75 -> 0.875 .. 1.625)
LINE_Y = Y - 0.4              # kitchen equipment centre line (depth 0.8 -> fronts at y = 3.2)

door_op = R.door_opening('w', -0.95, width=1.0, height=2.2)
win_w = R.window_opening('w', -2.85, width=1.6, height=1.45, sill=0.95)
win_s1 = R.window_opening('s', -3.1, width=1.7, height=1.45, sill=1.2)
win_s2 = R.window_opening('s', -0.6, width=1.7, height=1.45, sill=1.2)
win_s3 = R.window_opening('s', 1.9, width=1.7, height=1.45, sill=1.2)
win_e = R.window_opening('e', -2.6, width=1.5, height=1.45, sill=0.95)
openings = [door_op, win_w, win_s1, win_s2, win_s3, win_e]
root = R.make_room('mcdoodles', W, D, wall_h=H,
                   wall_mat={'n': 'tile_white', 'w': 'wall_cream', 'e': 'wall_cream', 's': 'wall_cream'},
                   floor='checker', openings=openings, baseboard='tile_check_dark', crown=None)

# ---- floor: rebuilt as ONE mesh: black/white diner checks in the dining room, red quarry tile in the kitchen ------
KY = 0.95                                            # kitchen tile starts under the counter
old = bpy.data.objects['floor']
bpy.data.objects.remove(old, do_unlink=True)
dv, dfc, dm = R._floor_tiles(W, KY + Y, 0.5, 2, random.Random(1), groove=0.01, depth=0.006)
kv, kfc, km = R._floor_tiles(W, Y - KY, 0.42, 1, random.Random(4), groove=0.008, depth=0.006)
verts = [(x, y + (KY - Y) / 2, z) for x, y, z in dv]
off = len(verts)
verts += [(x, y + (KY + Y) / 2, z) for x, y, z in kv]
faces = list(dfc) + [tuple(i + off for i in f) for f in kfc]
mids = list(dm) + [2] * len(km)
fl = B.mesh_from_data('floor', verts, faces, ['tile_white', 'tile_check_dark', 'terracotta'], parent='root',
                      smooth=False, mat_idx=mids)
fl['floor'] = True

# ---- wall finishes: red wainscot + yellow stripe in the dining room, red frieze on top ------------------------------
holes = {s: [(op['at'], op['width'], op['sill'], op['sill'] + op['height']) for op in openings if op['wall'] == s]
         for s in 'nesw'}
holes['w'].append((2.7, 1.0, 0.0, 2.15))                     # walk-in cooler door on the kitchen part of wall w
for side in ('w', 's', 'e'):
    M.wall_band(side, 0.1, 0.9, 'mcd_red', holes[side], off=0.016, name=f'wainscot_{side}')
    M.wall_band(side, 0.9, 0.97, 'mcd_yellow', holes[side], off=0.026, name=f'stripe_{side}')
for side in ('n', 'w', 's', 'e'):
    M.wall_band(side, H - 0.2, H, 'mcd_red', [], off=0.02, name=f'frieze_{side}')
    if side != 'n':
        M.wall_band(side, H - 0.26, H - 0.2, 'mcd_yellow', [], off=0.03, name=f'frieze_line_{side}')
# kitchen wall: a red tile stripe at 1.4 m behind the line
M.wall_band('n', 1.38, 1.46, 'mcd_red', [], off=0.012, name='tile_stripe_n')

# ---- openings --------------------------------------------------------------------------------------------------
# wall decor: one group per wall (merged into one mesh each on export -> few draw calls), parented at the end
dec = {side: B.group(f'decor_{side}') for side in 'nesw'}
R.fill_opening(door_op, style='glass', name='exit_door', interact='exit', anchors=False)
for op, style, nm in ((win_w, 'floor', 'window_w'), (win_s1, 'standard', 'window_s1'),
                      (win_s2, 'standard', 'window_s2'), (win_s3, 'standard', 'window_s3'), (win_e, 'floor', 'window_e')):
    wg = R.fill_opening(op, style=style, name=nm)
    B.reparent(wg, dec[op['wall']])
B.anchor('a_exit_stand', R.inside_point(door_op, 0.75), 'w')
B.anchor('a_exit_door', R.opening_point(door_op)[:2] + (0.0,), 'w')

# ---- kitchen line along the north wall (west -> east) ------------------------------------------------------------
M.bun_rack('bun_rack', location=(-X + 0.42, Y - 0.38, 0), rotation=B.against('n'))
M.prep_table('prep', location=(-3.95, LINE_Y + 0.02, 0), rotation=B.against('n'), w=1.2)
M.grill('grill', location=(-2.65, LINE_Y, 0), rotation=B.against('n'), w=1.3)
M.fryer_station('fryer', location=(-1.02, LINE_Y, 0), rotation=B.against('n'), vats=2)
M.prep_table('assembly', location=(0.52, LINE_Y + 0.02, 0), rotation=B.against('n'), w=1.2, toaster=False, seed=9)
M.soft_serve('soft_serve', location=(1.55, LINE_Y + 0.02, 0), rotation=B.against('n'))
M.hand_sink('hand_sink', location=(2.3, Y - 0.25, 0), rotation=B.against('n'))
F.metal_shelving(1.2, 1.8, 0.5, 5, 'dry_storage', location=(4.75, Y - 0.3, 0), rotation=B.against('n'), seed=3)
F.trash_bin('big', 'kitchen_bin', location=(3.35, Y - 0.35, 0), rotation=B.against('n'), mat='plastic_grey',
            obstacle=True)

M.hood('hood', location=R.wall_point('n', -1.85, 1.95), rotation=B.against('n'), w=3.15, d=0.78, h=0.24,
       parent=dec['n'])
menu_items = [('combo', 'burger'), ('burger', 'fries'), ('fries', 'drink'), ('drink', 'cone')]
for i, items in enumerate(menu_items):
    M.menu_board(f'menu_board_{i + 1}', location=R.wall_point('n', -3.45 + i * 1.05, 2.5), rotation=B.against('n'),
                 items=list(items), seed=i + 1, panel='mcd_red' if i % 2 == 0 else 'tile_check_dark',
                 parent=dec['n'])
M.walkin_door('walkin', location=R.wall_point('w', 2.7, 0.0), rotation=B.against('w'), parent=dec['w'])
M.crew_board('crew_board', location=R.wall_point('n', 3.5, 1.6), rotation=B.against('n'), parent=dec['n'])
F.wall_clock(0.17, 'kitchen_clock', location=R.wall_point('n', 2.3, 2.35), rotation=B.against('n'),
             mat='plastic_white', rim='mcd_red', hour=11.9, parent=dec['n'])
M.logo_badge('logo_kitchen', location=R.wall_point('n', 1.25, 2.45), rotation=B.against('n'), r=0.3, parent=dec['n'])

# ---- front counter + self-serve drinks ---------------------------------------------------------------------------
M.front_counter(5.3, 'counter', location=(-1.05, COUNTER_Y, 0), rotation=0, registers=(-0.85, 0.75))
M.self_serve_drinks(2.2, 'drinks', location=(X - 1.15, COUNTER_Y - 0.03, 0), rotation=0)
# half wall with a planter closing the kitchen off on the west
F.partition(1.6, 1.0, 'half_wall', location=(-X + 0.8, COUNTER_Y, 0), rotation=0, mat='mcd_red', cap='mcd_yellow')
M.planter_box('planter_half_wall', location=(-X + 0.8, COUNTER_Y, 1.04), rotation=0, length=1.5, obstacle=False,
              parent=B.get_root())
M.queue_rope('queue_rope', location=(-2.45, 0.55, 0), rotation=-90, length=1.8, posts=3)

# ---- dining room -------------------------------------------------------------------------------------------------
BOOTH_Y = -Y + 0.66
for i, bx in enumerate((-3.1, -0.6, 1.9)):
    M.booth(f'booth_{i + 1}', location=(bx, BOOTH_Y, 0), rotation=180, seed=i + 2,
            anchors=(f'a_booth_sit_{2 * i + 1}', f'a_booth_sit_{2 * i + 2}'),
            meals=((True, False), (False, True), (True, True))[i])
M.cafe_table('cafe_table', location=(4.3, -1.35, 0), rotation=0, seed=4, meal=False)
M.trash_station('trash_station', location=(-X + 0.35, 0.1, 0), rotation=B.against('w'))
M.high_chair('high_chair', location=(3.35, -3.45, 0), rotation=-60)
M.mascot('mascot', location=(-4.8, -2.75, 0), rotation=50, scale=1.25)
# flat mats (one non-obstacle group): red doormat at the exit, black rubber mats along the cook line
mats = B.group('floor_mats')
M.floor_mat('doormat', location=(-X + 0.5, -0.95, 0), size=(0.8, 1.25), mat='mcd_red', holes=False, parent=mats)
box_ = B.box('doormat_border', (0.6, 1.05, 0.006), (-X + 0.5, -0.95, 0.016), 'mcd_yellow', mats, bevel=0.0)
M.floor_mat('floor_mat_1', location=(-2.1, 2.62, 0), size=(2.6, 0.6), holes=False, parent=mats)
M.floor_mat('floor_mat_2', location=(0.55, 2.62, 0), size=(1.3, 0.6), holes=False, parent=mats)
M.wet_floor_sign('wet_floor', location=(0.4, -0.2, 0), rotation=25)
F.potted_plant('small', 'plant_1', location=(-X + 0.42, -Y + 0.42, 0), pot_mat='mcd_red', seed=2)
F.potted_plant('snake', 'plant_2', location=(X - 0.35, -Y + 0.35, 0), pot_mat='mcd_yellow', seed=3)

# dining wall decor: logo + neon on the west wall, framed food pictures, sconces over the booths
M.logo_badge('logo_west', location=R.wall_point('w', 0.9, 1.75), rotation=B.against('w'), r=0.34, parent=dec['w'])
M.neon_burger('neon_burger', location=R.wall_point('w', -2.85, 2.65), rotation=B.against('w'), s=0.55,
              parent=dec['w'])
for side, at, items, pm in (('e', -0.9, ['burger'], 'mcd_yellow'), ('s', -4.55, ['drink'], 'mcd_yellow'),
                            ('s', 3.15 + 1.2, ['cone'], 'mcd_red'), ('w', -4.35 + 0.0, ['fries'], 'mcd_red')):
    if side == 'w':
        continue
    fp = M.menu_board(f'food_art_{side}_{int(abs(at) * 10)}', location=R.wall_point(side, at, 1.85),
                      rotation=B.against(side), items=items, frame='mcd_yellow' if pm == 'mcd_red' else 'mcd_red',
                      panel=pm, seed=11, parent=dec[side])
    fp.scale = (0.6, 1, 0.75)
BOOTH_X = (-3.1, -0.6, 1.9)
for i, sx in enumerate((-4.35, -1.85, 0.65, 3.15)):
    M.sconce(f'sconce_s{i + 1}', location=R.wall_point('s', sx, 2.05), rotation=B.against('s'), parent=dec['s'])
for i, sy in enumerate((-1.95, 0.05)):
    M.sconce(f'sconce_w{i + 1}', location=R.wall_point('w', sy, 2.05), rotation=B.against('w'), mat='mcd_yellow',
             parent=dec['w'])
M.sconce('sconce_e1', location=R.wall_point('e', -1.35, 2.05), rotation=B.against('e'), parent=dec['e'])
for side in 'nesw':
    R.on_wall(dec[side], side)

# ---- back-of-house clutter -----------------------------------------------------------------------------------------
M.mop_bucket('mop_bucket', location=(3.0, 2.35, 0), rotation=-20)
F.moving_boxes(3, 'supply_boxes', location=(4.7, 2.5, 0), rotation=8, seed=4, open_top=False)

# ---- lights ------------------------------------------------------------------------------------------------------
for i, bx in enumerate(BOOTH_X):
    B.light(f'l_booth_{i + 1}', (bx, -Y + 0.45, 2.05), 'lamp', '#ffd9a0', 1.0, 3.5)
B.light('l_west', (-X + 0.3, -1.95, 2.0), 'lamp', '#ffe2b0', 0.8, 3.0)
B.light('l_cafe', (X - 0.3, -1.35, 2.0), 'lamp', '#ffd9a0', 0.8, 3.0)
B.light('l_counter', (-1.05, COUNTER_Y - 0.3, 2.6), 'ceiling', '#fff1dc', 1.2, 5.0)
B.light('l_kitchen', (-1.2, 2.8, 2.4), 'ceiling', '#fff1dc', 1.4, 6.0)
B.light('l_heat_lamp', (-0.52, 3.3, 1.35), 'lamp', '#ffb46b', 0.8, 2.5)

# ---- anchors -----------------------------------------------------------------------------------------------------
REG1, REG2 = -1.05 - 0.85, -1.05 + 0.75
B.anchor('a_spawn', (REG2, 2.25, 0), 's')
B.anchor('a_counter_stand', (REG1, 2.0, 0), 's')
B.anchor('a_fryer_stand', (-1.27, 2.65, 0), 'n')
B.anchor('a_grill_stand', (-2.65, 2.65, 0), 'n')
B.anchor('a_crew_1', (0.52, 2.65, 0), 'n')              # assembly / pass
B.anchor('a_crew_2', (REG2, 2.0, 0), 's')               # second register
for i in range(4):
    B.anchor(f'a_queue_{i + 1}', (REG1, 0.45 - i * 0.7, 0), 'n')
B.anchor('a_idle_1', (X - 1.3, 0.25, 0), 'n')            # at the drinks machine
B.anchor('a_idle_2', (-3.75, -1.55, 0), (-4.8, -2.75))   # admiring the mascot by the storefront window
B.anchor('a_idle_3', (0.9, -0.6, 0), (0.0, Y))           # reading the menu boards
B.anchor('a_idle_4', (3.2, -1.1, 0), 'se')               # near the café table

if args['preview']:
    B.preview_set('mcdoodles', views=('default', 'top', 'walk'))
    B.render_preview(os.path.join(B.PREVIEWS, 'mcdoodles_close_kitchen.png'), 'close',
                     target=['grill', 'fryer', 'prep', 'assembly', 'hood'])
    B.render_preview(os.path.join(B.PREVIEWS, 'mcdoodles_close_counter.png'), 'close', target=['counter', 'drinks'])
    B.render_preview(os.path.join(B.PREVIEWS, 'mcdoodles_close_dining.png'), 'close',
                     target=['booth_1', 'booth_2', 'booth_3', 'exit_door'], azimuth=20.0)

B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'mcdoodles.glb'), root)
