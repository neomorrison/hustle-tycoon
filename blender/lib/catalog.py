"""Catalogue preview: builds every furniture builder in rows and renders one close-up per row to
blender/.previews/catalog_<row>.png. Useful for room builders to see what exists.

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
        --python blender/lib/catalog.py -- [row-name ...]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build as B       # noqa: E402
import furniture as F   # noqa: E402

ROWS = {
    'beds': [
        lambda: F.bed('twin', 'metal', 'b1', messy=True, duvet_mat='fabric_navy', interact=None),
        lambda: F.bed('full', 'platform', 'b2', duvet_mat='fabric_cream', throw_mat='fabric_mustard', interact=None),
        lambda: F.bed('queen', 'upholstered', 'b3', duvet_mat='rug_rose', interact=None),
        lambda: F.bed('king', 'wood', 'b4', duvet_mat='fabric_teal', interact=None),
        lambda: F.nightstand('wood', 'n1'),
        lambda: F.nightstand('crate', 'n2', lamp=False),
        lambda: F.dresser('d1'),
        lambda: F.wardrobe('w1'),
    ],
    'desks': [
        lambda: F.desk('old', name='d1'), lambda: F.desk('cheap', name='d2'), lambda: F.desk('nook', name='d3'),
        lambda: F.desk('standing', name='d4'), lambda: F.desk('executive', name='d5'),
        lambda: F.desk('l_shaped', name='d6'), lambda: F.desk('folding', name='d7'),
    ],
    'chairs': [
        lambda: F.office_chair('basic', 'c1'), lambda: F.office_chair('gaming', 'c2'),
        lambda: F.office_chair('executive', 'c3'), lambda: F.office_chair('stool', 'c4'),
        lambda: F.office_chair('wood', 'c5'), lambda: F.office_chair('folding', 'c6'),
        lambda: F.bar_stool('c7', back=True), lambda: F.armchair('club', 'a1'), lambda: F.armchair('mid', 'a2'),
        lambda: F.bean_bag('bb'),
    ],
    'computers': [
        lambda: F.workstation('old', 'ws1', laptop_style='old', monitors=0, lamp=True, interact=None),
        lambda: F.workstation('cheap', 'ws2', monitors=1, interact=None),
        lambda: F.workstation('standing', 'ws3', monitors=2, chair='gaming', rgb=True, interact=None),
        lambda: F.workstation('executive', 'ws4', monitors=2, monitor_size='ultrawide', chair='executive',
                              interact=None),
        lambda: F.workstation('l_shaped', 'ws5', monitors=3, chair='gaming', chair_mat='fabric_navy', interact=None),
        lambda: F.workstation('folding', 'ws6', monitors=0, laptop_style='pro', chair='folding', interact=None),
    ],
    'kitchen': [
        lambda: F.kitchen_run(2.6, 'k1', style='white'),
        lambda: F.kitchen_run(2.4, 'k2', style='sage', modules=[('cab', 0.6), ('sink', 0.8), ('stove2', 0.6),
                                                                 ('drawers', 0.4)]),
        lambda: F.kitchen_island(1.8, name='i1', style='designer', stools=3),
        lambda: F.fridge('mini', 'f1', interact=None), lambda: F.fridge('tall', 'f2', interact=None),
        lambda: F.fridge('built_in', 'f3', interact=None), lambda: F.fridge('double', 'f4', interact=None),
    ],
    'kitchen_small': [
        lambda: F.counter(1.2, 'ct1'),
        lambda: F.microwave('mw', location=(0, 0, 0)),
        lambda: F.hot_plate('hp'),
        lambda: F.coffee_machine('cm'),
        lambda: F.water_cooler('wc'),
        lambda: F.trash_bin('pedal', 't1'), lambda: F.trash_bin('office', 't2'), lambda: F.trash_bin('big', 't3'),
        lambda: F.dining_table('rect', 4, 'dt1'), lambda: F.dining_table('round', 3, 'dt2'),
    ],
    'living': [
        lambda: F.couch('saggy', 's1', mat='fabric_grey'), lambda: F.couch('three', 's2', mat='fabric_blue'),
        lambda: F.couch('sectional', 's3', mat='fabric_cream'), lambda: F.coffee_table('wood', 'ct1'),
        lambda: F.coffee_table('round', 'ct2'), lambda: F.coffee_table('glass', 'ct3'),
        lambda: F.coffee_table('crate', 'ct4'), lambda: F.tv(1.3, 'tv1'),
    ],
    'storage': [
        lambda: F.bookshelf('tall', 'bs1'), lambda: F.bookshelf('low', 'bs2'), lambda: F.bookshelf('cube', 'bs3'),
        lambda: F.bookshelf('ladder', 'bs4'), lambda: F.metal_shelving(name='ms1'),
        lambda: F.moving_boxes(6, 'mb'), lambda: F.washing_machine('wm'), lambda: F.laundry_basket('lb'),
    ],
    'plants': [
        lambda: F.potted_plant('small', 'p1'), lambda: F.potted_plant('tall', 'p2'),
        lambda: F.potted_plant('monstera', 'p3'), lambda: F.potted_plant('snake', 'p4'),
        lambda: F.potted_plant('palm', 'p5'), lambda: F.small_plant('sp1', style='leafy'),
        lambda: F.small_plant('sp2', style='succulent'), lambda: F.small_plant('sp3', style='cactus'),
        lambda: F.small_plant('sp4', style='trailing'), lambda: F.hanging_plant('hp', location=(0, 0, 1.6)),
    ],
    'lights': [
        lambda: F.floor_lamp('arc', 'fl1'), lambda: F.floor_lamp('shade', 'fl2'), lambda: F.floor_lamp('tripod', 'fl3'),
        lambda: F.ceiling_lamp('pendant', 'cl1', location=(0, 0, 1.6)),
        lambda: F.ceiling_lamp('globe', 'cl2', location=(0, 0, 1.6)),
        lambda: F.ceiling_lamp('cage', 'cl3', location=(0, 0, 1.6)),
        lambda: F.ceiling_lamp('bulb', 'cl4', location=(0, 0, 1.6)),
        lambda: F.desk_lamp('dl1'), lambda: F.desk_lamp('dl2', style='dome'),
    ],
    'creator': [
        lambda: F.ring_light('rl'), lambda: F.camera_tripod('cam'), lambda: F.softbox('sb'),
        lambda: F.whiteboard(name='wb'), lambda: F.office_divider(name='dv'), lambda: F.packing_table(name='pt'),
        lambda: F.stairs(name='st', landing=0.9),
    ],
    'wall': [
        lambda: F.poster((0.5, 0.7), 'po1', (0, 0, 1.2), style='abstract', seed=1),
        lambda: F.poster((0.5, 0.7), 'po2', (0, 0, 1.2), style='sunset', seed=2),
        lambda: F.poster((0.5, 0.7), 'po3', (0, 0, 1.2), style='wave', seed=3),
        lambda: F.framed_art((0.6, 0.45), 'po4', (0, 0, 1.2), style='grid', seed=4),
        lambda: F.framed_art((0.45, 0.6), 'po5', (0, 0, 1.2), style='plant', seed=5, frame='plastic_black'),
        lambda: F.wall_clock(name='clk', location=(0, 0, 1.2)),
        lambda: F.neon_sign('squiggle', 'ne1', (0, 0, 1.2)), lambda: F.neon_sign('bolt', 'ne2', (0, 0, 1.2)),
        lambda: F.neon_sign('heart', 'ne3', (0, 0, 1.2), colors=('neon_pink', 'neon_yellow')),
        lambda: F.wall_shelf(name='ws', location=(0, 0, 1.2)),
        lambda: F.radiator(name='rad'),
        lambda: F.curtains(1.2, 1.4, 'cu', (0, 0, 1.8)),
        lambda: F.mirror(name='mi'),
        lambda: F.rug((1.6, 1.0), 'r1', pattern='border'), lambda: F.rug((1.6, 1.0), 'r2', pattern='stripes',
                                                                        mat='rug_green'),
        lambda: F.rug((1.4, 1.4), 'r3', shape='round', mat='fabric_mustard', pattern='dots'),
    ],
    'openings': [
        lambda: F.window(1.2, 1.2, name='wi1', location=(0, 0, 0.9)),
        lambda: F.window(1.0, 0.5, name='wi2', style='basement', location=(0, 0, 1.7)),
        lambda: F.window(1.6, 1.8, name='wi3', style='factory', location=(0, 0, 0.6)),
        lambda: F.window(2.4, 2.4, name='wi4', style='floor', frame_mat='metal_dark', location=(0, 0, 0.0)),
        lambda: F.door(style='wood', name='do1', ajar=25, interact=None),
        lambda: F.door(style='hallway', name='do2', interact=None),
        lambda: F.door(style='metal', name='do3', interact=None),
        lambda: F.door(style='glass', name='do4', width=1.0, interact=None),
        lambda: F.door(style='elevator', name='do5', width=1.1, interact=None),
        lambda: F.roll_up_door(2.4, 2.2, name='ru'),
    ],
}


def main():
    args = B.cli_args()['rest']
    rows = args or list(ROWS)
    for row in rows:
        B.clean_scene()
        objs = []
        x = 0.0
        for mk in ROWS[row]:
            g = mk()
            lo, hi = B.world_bbox(g)
            w = hi[0] - lo[0]
            g.location.x += x - lo[0]
            x += w + 0.35
            objs.append(g)
        cx = x / 2
        for g in objs:
            g.location.x -= cx
        az = 20.0 if row not in ('wall', 'openings') else 8.0
        B.render_preview(os.path.join(B.PREVIEWS, f'catalog_{row}.png'), 'close', target=objs, root=None,
                         res=(1600, 700), azimuth=az, elevation=24.0, backdrop='#f6efe3')


main()
