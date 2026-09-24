"""Throwaway contract-conformant test room for the three.js runtime (docs/3D.md section 5).

Run:
  "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
      --python blender/test/testroom.py -- [--render]
Writes blender/.out/testroom.glb (and blender/.out/testroom.png with --render).
Not a production room: the real rooms live in blender/rooms/. This one only exercises the runtime.
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '.out'))
os.makedirs(OUT, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

PALETTE = {
    'wood_light': '#d9b48a', 'wood_mid': '#b07e55', 'wood_dark': '#6f4b33', 'wall_cream': '#f2e6d3',
    'wall_sage': '#cdd9c4', 'fabric_blue': '#6f8fbf', 'fabric_navy': '#3e4f75', 'fabric_mustard': '#e2b24c',
    'fabric_teal': '#4f9a93', 'fabric_coral': '#e88c73', 'fabric_cream': '#efe4cf', 'carpet_beige': '#cdb89a',
    'rug_rose': '#d99a9a', 'metal': '#b9bfc7', 'metal_dark': '#3c4048', 'plastic_black': '#2b2d33',
    'plastic_white': '#f3f2ef', 'plastic_grey': '#9aa0a8', 'plant': '#5e9e55', 'plant_dark': '#3d7a42',
    'terracotta': '#c7704b', 'paper': '#f7f3ea', 'slab': '#8b7f74', 'poster_a': '#f08a5d', 'poster_b': '#6c8ebf',
}


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


_mats = {}


def mat(name, rough=0.75, metal=0.0, emit=None, alpha=None):
    key = 'm_' + name
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(key)
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    col = {'screen': '#8fd0ff', 'window_glass': '#bfe3f5', 'window_sky': '#bfe3f5', 'lampshade': '#fff1d6'}.get(name) or PALETTE[name]
    bsdf.inputs['Base Color'].default_value = srgb(col)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = srgb(col)
        bsdf.inputs['Emission Strength'].default_value = emit
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    _mats[key] = m
    return m


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def empty(name, parent=None, loc=(0, 0, 0), rot_z=0.0, **extras):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.3
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    e.rotation_euler = (0, 0, math.radians(rot_z))
    if parent:
        e.parent = parent
    for k, v in extras.items():
        e[k] = v
    return e


def facing(dx, dy):
    """rotation about Z (degrees) so that local -Y points along (dx, dy)"""
    return math.degrees(math.atan2(dx, -dy))


def box(name, size, loc, material, parent=None, bevel=0.02, segs=2, rot_z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    o.scale = size
    o.rotation_euler = (0, 0, math.radians(rot_z))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = min(bevel, min(size) * 0.45)
        b.segments = segs
        b.limit_method = 'ANGLE'
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = False
    if parent:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def cyl(name, r, h, loc, material, parent=None, verts=16, bevel=0.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    if bevel > 0:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = 2
        b.limit_method = 'ANGLE'
    o.data.materials.append(material)
    if parent:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def sphere(name, r, loc, material, parent=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=r, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    o.scale = scale
    bpy.ops.object.shade_smooth()
    o.data.materials.append(material)
    if parent:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def build(W=6.0, D=5.0, name='testroom'):
    clear()
    H, T = 2.7, 0.14
    room = empty('room', room=name, w=W, d=D, wallH=H)

    floor = box('floor', (W, D, 0.04), (0, 0, -0.02), mat('wood_light', 0.7), room, bevel=0)
    floor['floor'] = True
    box('slab', (W + 2 * T + 0.1, D + 2 * T + 0.1, 0.25), (0, 0, -0.145), mat('slab', 0.9), room, bevel=0.04)

    walls = {}
    # north wall with a door opening at x 0.3..1.2
    wn = box('wall_n', (0.3 + W / 2 + T, T, H), ((-W / 2 - T + 0.3) / 2, D / 2 + T / 2, H / 2), mat('wall_cream', 0.85), None, bevel=0.01)
    wn2 = box('wall_n_r', (W / 2 + T - 1.2, T, H), ((1.2 + W / 2 + T) / 2, D / 2 + T / 2, H / 2), mat('wall_cream', 0.85), None, bevel=0.01)
    wn3 = box('wall_n_top', (0.9, T, H - 2.15), (0.75, D / 2 + T / 2, 2.15 + (H - 2.15) / 2), mat('wall_cream', 0.85), None, bevel=0.01)
    for o in (wn2, wn3):
        o.select_set(True)
    wn.select_set(True)
    bpy.context.view_layer.objects.active = wn
    for o in (wn, wn2, wn3):
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier='bevel')
    bpy.ops.object.select_all(action='DESELECT')
    for o in (wn, wn2, wn3):
        o.select_set(True)
    bpy.context.view_layer.objects.active = wn
    bpy.ops.object.join()
    wn.name = 'wall_n'
    wn.parent = room
    walls['n'] = wn
    walls['s'] = box('wall_s', (W + 2 * T, T, H), (0, -D / 2 - T / 2, H / 2), mat('wall_cream', 0.85), room, bevel=0.01)
    walls['e'] = box('wall_e', (T, D, H), (W / 2 + T / 2, 0, H / 2), mat('wall_sage', 0.85), room, bevel=0.01)
    walls['w'] = box('wall_w', (T, D, H), (-W / 2 - T / 2, 0, H / 2), mat('wall_sage', 0.85), room, bevel=0.01)
    for k, o in walls.items():
        o['wall'] = k
    # baseboards parented to walls
    box('base_n', (W, 0.03, 0.1), (0, D / 2 - 0.015, 0.05), mat('plastic_white', 0.6), walls['n'], bevel=0.005)
    box('base_w', (0.03, D, 0.1), (-W / 2 + 0.015, 0, 0.05), mat('plastic_white', 0.6), walls['w'], bevel=0.005)
    # west window (decor on wall_w)
    win_y, win_z = -0.7, 1.55
    box('window_frame', (0.2, 1.2, 1.1), (-W / 2 - T / 2, win_y, win_z), mat('plastic_white', 0.5), walls['w'], bevel=0.02)
    box('window_glass', (0.22, 1.0, 0.9), (-W / 2 - T / 2, win_y, win_z), mat('window_glass', 0.1, alpha=0.35), walls['w'], bevel=0)
    box('window_sky', (0.02, 1.0, 0.9), (-W / 2 - T - 0.02, win_y, win_z), mat('window_sky', 1.0), walls['w'], bevel=0)
    box('window_sill', (0.26, 1.3, 0.05), (-W / 2 + 0.03, win_y, win_z - 0.57), mat('plastic_white', 0.5), walls['w'], bevel=0.01)
    # posters + clock on the north wall
    box('poster_1', (0.6, 0.02, 0.8), (-2.2, D / 2 - 0.01, 1.7), mat('poster_a', 0.8), walls['n'], bevel=0.005)
    box('poster_2', (0.45, 0.02, 0.6), (-1.45, D / 2 - 0.01, 1.85), mat('poster_b', 0.8), walls['n'], bevel=0.005)
    clock = cyl('clock', 0.16, 0.04, (2.4, D / 2 - 0.02, 2.1), mat('plastic_white', 0.5), walls['n'])
    clock.rotation_euler = (math.radians(90), 0, 0)

    # rug (not an obstacle)
    box('rug', (2.2, 1.5, 0.015), (0.4, -0.6, 0.008), mat('rug_rose', 0.95), room, bevel=0.006)

    # ---- bed (west, head against the west wall, foot toward +X)
    bed = empty('bed', room, (-2.0, 0.8, 0), interact='bed', obstacle=True)
    box('bed_frame', (2.05, 1.45, 0.3), (-2.0, 0.8, 0.17), mat('wood_mid', 0.7), bed, bevel=0.04)
    box('bed_mattress', (1.95, 1.35, 0.2), (-2.0, 0.8, 0.4), mat('plastic_white', 0.9), bed, bevel=0.06, segs=3)
    box('bed_duvet', (1.35, 1.42, 0.08), (-1.65, 0.8, 0.52), mat('fabric_blue', 0.9), bed, bevel=0.035, segs=3)
    box('bed_pillow', (0.4, 0.9, 0.13), (-2.72, 0.8, 0.56), mat('fabric_cream', 0.9), bed, bevel=0.05, segs=3)
    box('bed_head', (0.08, 1.45, 0.9), (-3.0 + 0.05, 0.8, 0.45), mat('wood_mid', 0.7), bed, bevel=0.03)
    empty('a_bed_lie', room, (-2.05, 0.8, 0.5), facing(1, 0), anchor='bed_lie')
    empty('a_bed_sit', room, (-1.7, 0.2, 0), facing(0, -1), anchor='bed_sit')
    empty('a_bed_stand', room, (-1.6, -0.35, 0), facing(0, 1), anchor='bed_stand')
    empty('a_eat_sit', room, (-2.3, 0.2, 0), facing(0, -1), anchor='eat_sit')

    # ---- nightstand
    ns = empty('nightstand', room, (-2.7, 1.85, 0), obstacle=True)
    box('ns_body', (0.45, 0.4, 0.5), (-2.7, 1.9, 0.25), mat('wood_light', 0.7), ns, bevel=0.025)
    cyl('ns_lamp_base', 0.06, 0.25, (-2.7, 1.9, 0.62), mat('metal_dark', 0.5, 0.6), ns)
    cyl('ns_lamp_shade', 0.14, 0.18, (-2.7, 1.9, 0.82), mat('lampshade', 0.8), ns, bevel=0.02)

    # ---- computer desk (north wall)
    comp = empty('computer', room, (-0.9, 2.15, 0), interact='computer', obstacle=True)
    box('desk_top', (1.3, 0.62, 0.05), (-0.9, 2.15, 0.725), mat('wood_light', 0.65), comp, bevel=0.015)
    for i, (dx, dy) in enumerate(((-0.6, -0.26), (0.6, -0.26), (-0.6, 0.26), (0.6, 0.26))):
        box('desk_leg_%d' % i, (0.05, 0.05, 0.7), (-0.9 + dx, 2.15 + dy, 0.35), mat('metal_dark', 0.5, 0.6), comp, bevel=0.01)
    box('laptop_base', (0.36, 0.25, 0.02), (-0.9, 2.1, 0.76), mat('plastic_grey', 0.5, 0.2), comp, bevel=0.006)
    lid = box('laptop_lid', (0.36, 0.015, 0.24), (-0.9, 2.23, 0.88), mat('plastic_grey', 0.5, 0.2), comp, bevel=0.006)
    box('laptop_screen', (0.32, 0.004, 0.2), (-0.9, 2.221, 0.88), mat('screen', 0.3, emit=1.0), comp, bevel=0)
    cyl('mug', 0.04, 0.09, (-0.45, 2.05, 0.795), mat('fabric_coral', 0.6), comp, bevel=0.005)
    # chair
    box('chair_seat', (0.46, 0.46, 0.07), (-0.9, 1.6, 0.46), mat('fabric_teal', 0.85), comp, bevel=0.03)
    box('chair_back', (0.44, 0.07, 0.45), (-0.9, 1.36, 0.75), mat('fabric_teal', 0.85), comp, bevel=0.03)
    cyl('chair_post', 0.03, 0.4, (-0.9, 1.6, 0.22), mat('metal_dark', 0.5, 0.6), comp)
    cyl('chair_foot', 0.24, 0.04, (-0.9, 1.6, 0.03), mat('metal_dark', 0.5, 0.6), comp)
    empty('a_computer_sit', room, (-0.9, 1.62, 0), facing(0, 1), anchor='computer_sit')
    empty('a_computer_stand', room, (-0.9, 1.05, 0), facing(0, 1), anchor='computer_stand')
    empty('a_gear_desk', room, (-0.9, 2.12, 0.75), facing(0, -1), anchor='gear_desk', w=1.1, d=0.5)
    empty('a_gear_floor_1', room, (0.0, 1.9, 0), facing(-1, -1), anchor='gear_floor_1')
    empty('a_gear_floor_2', room, (-1.9, 2.05, 0), facing(1, -1), anchor='gear_floor_2')
    empty('l_desk', room, (-0.9, 2.0, 1.4), light='lamp', color='#ffd9a0', intensity=1.2, distance=4.0)

    # ---- front door (north, at the opening)
    door = empty('door', room, (0.75, D / 2 + T / 2, 0), interact='door')
    box('door_leaf', (0.86, 0.06, 2.08), (0.75, D / 2 + T / 2, 1.05), mat('wood_mid', 0.65), door, bevel=0.015)
    box('door_frame_l', (0.06, T + 0.04, 2.14), (0.3 - 0.03, D / 2 + T / 2, 1.07), mat('plastic_white', 0.5), door, bevel=0.01)
    box('door_frame_r', (0.06, T + 0.04, 2.14), (1.2 + 0.03, D / 2 + T / 2, 1.07), mat('plastic_white', 0.5), door, bevel=0.01)
    box('door_frame_t', (1.02, T + 0.04, 0.06), (0.75, D / 2 + T / 2, 2.14), mat('plastic_white', 0.5), door, bevel=0.01)
    sphere('door_knob', 0.035, (1.05, D / 2 + T / 2 - 0.06, 1.0), mat('metal', 0.3, 1.0), door)
    empty('a_door_stand', room, (0.75, 1.85, 0), facing(0, 1), anchor='door_stand')
    empty('a_door_exit', room, (0.75, D / 2 + 0.02, 0), facing(0, 1), anchor='door_exit')

    # ---- kitchen corner (north-east): counter + hot plate + fridge
    kit = empty('kitchen', room, (1.85, 2.2, 0), interact='fridge', obstacle=True)
    box('counter_body', (0.7, 0.6, 0.86), (1.85, 2.2, 0.43), mat('plastic_white', 0.6), kit, bevel=0.02)
    box('counter_top', (0.74, 0.64, 0.04), (1.85, 2.2, 0.88), mat('wood_dark', 0.6), kit, bevel=0.01)
    box('hotplate', (0.4, 0.3, 0.05), (1.85, 2.2, 0.925), mat('metal_dark', 0.5, 0.5), kit, bevel=0.01)
    cyl('pot', 0.1, 0.1, (1.8, 2.2, 1.0), mat('metal', 0.35, 1.0), kit, bevel=0.01)
    fr = empty('fridge', room, (2.6, 2.15, 0), interact='fridge', obstacle=True)
    box('fridge_body', (0.7, 0.66, 1.75), (2.6, 2.15, 0.875), mat('plastic_white', 0.45), fr, bevel=0.05, segs=3)
    box('fridge_handle', (0.03, 0.04, 0.5), (2.35, 1.8, 1.2), mat('metal', 0.3, 1.0), fr, bevel=0.01)
    box('fridge_line', (0.66, 0.01, 0.015), (2.6, 1.815, 1.15), mat('plastic_grey', 0.5), fr, bevel=0)
    box('magnet', (0.08, 0.01, 0.1), (2.75, 1.81, 1.45), mat('poster_a', 0.6), fr, bevel=0)
    empty('a_fridge_stand', room, (2.6, 1.3, 0), facing(0, 1), anchor='fridge_stand')
    empty('a_stove_stand', room, (1.85, 1.4, 0), facing(0, 1), anchor='stove_stand')
    empty('l_kitchen', room, (2.1, 1.6, 2.3), light='ceiling', color='#fff1d6', intensity=1.0, distance=5.0)

    # ---- couch (south-west, facing north)
    couch = empty('couch', room, (-1.7, -1.75, 0), obstacle=True, interact='couch')
    box('couch_base', (1.8, 0.85, 0.42), (-1.7, -1.8, 0.21), mat('fabric_mustard', 0.9), couch, bevel=0.06, segs=3)
    box('couch_back', (1.8, 0.25, 0.45), (-1.7, -2.12, 0.62), mat('fabric_mustard', 0.9), couch, bevel=0.08, segs=3)
    for i, dx in enumerate((-0.95, 0.95)):
        box('couch_arm_%d' % i, (0.2, 0.85, 0.3), (-1.7 + dx, -1.8, 0.55), mat('fabric_mustard', 0.9), couch, bevel=0.08, segs=3)
    for i, dx in enumerate((-0.42, 0.42)):
        box('couch_cushion_%d' % i, (0.8, 0.6, 0.12), (-1.7 + dx, -1.72, 0.48), mat('fabric_cream', 0.9), couch, bevel=0.05, segs=3)
    empty('a_couch_sit', room, (-1.95, -1.6, 0), facing(0, 1), anchor='couch_sit')

    # ---- staff desk 1 (south-east)
    sd = empty('staffdesk_1', room, (1.7, -1.3, 0), staffdesk=1, obstacle=True)
    box('sd_top', (1.1, 0.6, 0.05), (1.7, -1.1, 0.725), mat('plastic_white', 0.6), sd, bevel=0.015)
    for i, (dx, dy) in enumerate(((-0.5, -0.25), (0.5, -0.25), (-0.5, 0.25), (0.5, 0.25))):
        box('sd_leg_%d' % i, (0.04, 0.04, 0.7), (1.7 + dx, -1.1 + dy, 0.35), mat('metal', 0.4, 0.8), sd, bevel=0.008)
    box('sd_monitor', (0.5, 0.04, 0.3), (1.7, -0.92, 1.0), mat('plastic_black', 0.5), sd, bevel=0.01)
    box('sd_screen', (0.46, 0.005, 0.26), (1.7, -0.945, 1.0), mat('screen', 0.3, emit=1.0), sd, bevel=0)
    box('sd_stand', (0.05, 0.05, 0.2), (1.7, -0.9, 0.82), mat('plastic_black', 0.5), sd, bevel=0.01)
    box('sd_chair', (0.44, 0.44, 0.07), (1.7, -1.62, 0.46), mat('fabric_coral', 0.85), sd, bevel=0.03)
    box('sd_chair_back', (0.42, 0.06, 0.4), (1.7, -1.85, 0.72), mat('fabric_coral', 0.85), sd, bevel=0.03)
    cyl('sd_chair_post', 0.03, 0.42, (1.7, -1.62, 0.21), mat('metal_dark', 0.5, 0.6), sd)
    empty('a_staff_1_sit', room, (1.7, -1.6, 0), facing(0, 1), anchor='staff_1_sit')

    # ---- plant
    pl = empty('plant_1', room, (2.6, -2.1, 0), obstacle=True)
    cyl('pot_1', 0.2, 0.35, (2.6, -2.1, 0.175), mat('terracotta', 0.8), pl, bevel=0.02)
    for i, (dx, dy, dz, r) in enumerate(((0, 0, 0.6, 0.28), (0.12, 0.08, 0.85, 0.2), (-0.1, -0.06, 0.8, 0.22))):
        sphere('leaf_%d' % i, r, (2.6 + dx, -2.1 + dy, dz), mat('plant' if i != 1 else 'plant_dark', 0.85), pl)

    # ---- anchors: spawn, idle, film, boxes
    empty('a_spawn', room, (0.3, 0.4, 0), facing(0, -1), anchor='spawn')
    empty('a_idle_1', room, (-2.3, -0.7, 0), facing(-1, 0), anchor='idle_1')
    empty('a_idle_2', room, (2.1, -1.95, 0), facing(1, 0), anchor='idle_2')
    empty('a_idle_3', room, (-2.1, 2.0, 0), facing(0, 1), anchor='idle_3')
    empty('a_idle_4', room, (0.6, -0.2, 0), facing(-1, -1), anchor='idle_4')
    empty('a_film_stand', room, (0.3, 0.8, 0), facing(0, -1), anchor='film_stand')
    empty('a_boxes_1', room, (2.55, 0.3, 0), facing(-1, 0), anchor='boxes_1', w=0.9, d=0.7, layers=3)
    empty('l_ceiling', room, (0.0, 0.0, 2.5), light='ceiling', color='#ffe8c2', intensity=1.4, distance=7.0)
    empty('l_bedside', room, (-2.7, 1.9, 1.0), light='lamp', color='#ffcf8a', intensity=0.8, distance=3.0)
    return room


def export(room, name='testroom'):
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)
    sel(room)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True,
                              export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                              export_animations=False)
    print('EXPORTED', path, os.path.getsize(path))


def render():
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x, scn.render.resolution_y = 1280, 720
    cam = bpy.data.cameras.new('cam')
    cam.lens_unit = 'FOV'
    cam.angle = math.radians(30)
    co = bpy.data.objects.new('cam', cam)
    scn.collection.objects.link(co)
    co.location = (9, -9, 8)
    co.rotation_euler = (math.radians(58), 0, math.radians(45))
    scn.camera = co
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(40), math.radians(20), math.radians(30))
    scn.collection.objects.link(so)
    scn.render.filepath = os.path.join(OUT, 'testroom.png')
    bpy.ops.render.render(write_still=True)


def build_props():
    """A few props.glb-style nodes (grip/floor point at the origin) for testing setGear/setBoxes/hold."""
    clear()
    root = empty('props_root')
    kraft = mat('wood_light', 0.8)
    kraft.name = 'm_kraft'
    kraft.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = srgb('#c9a36b')
    tape = mat('paper', 0.5)
    # box_stack_unit: 0.4 x 0.3 x 0.3 (X x Y x Z Blender), bottom centre at the origin
    b = empty('box_stack_unit', root)
    box('box_body', (0.4, 0.3, 0.3), (0, 0, 0.15), kraft, b, bevel=0.012)
    box('box_tape', (0.41, 0.06, 0.305), (0, 0, 0.1515), tape, b, bevel=0.0)
    # ring light on a tripod
    rl = empty('ring_light', root)
    cyl('rl_pole', 0.015, 1.5, (0, 0, 0.75), mat('metal_dark', 0.5, 0.6), rl, bevel=0)
    for i in range(3):
        a = i * 2.094
        leg = box('rl_leg_%d' % i, (0.025, 0.4, 0.025), (math.sin(a) * 0.15, math.cos(a) * 0.15, 0.08), mat('metal_dark', 0.5, 0.6), rl, bevel=0.005)
        leg.rotation_euler = (math.radians(20), 0, -a)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.22, minor_radius=0.03, location=(0, 0, 1.6), rotation=(math.radians(90), 0, 0))
    ring = bpy.context.active_object
    ring.name = 'rl_ring'
    ring.data.materials.append(mat('lampshade', 0.6))
    ring.parent = rl
    # laptop_old (grip/bottom at origin)
    lp = empty('laptop_old', root)
    box('lo_base', (0.38, 0.26, 0.03), (0, 0, 0.015), mat('plastic_black', 0.6), lp, bevel=0.006)
    box('lo_lid', (0.38, 0.02, 0.25), (0, 0.13, 0.15), mat('plastic_black', 0.6), lp, bevel=0.006)
    box('lo_screen', (0.34, 0.004, 0.21), (0, 0.118, 0.15), mat('screen', 0.3, emit=1.0), lp, bevel=0)
    # phone held at the grip
    ph = empty('phone', root)
    box('ph_body', (0.075, 0.012, 0.15), (0, 0, 0.05), mat('plastic_black', 0.4), ph, bevel=0.005)
    box('ph_screen', (0.066, 0.002, 0.135), (0, -0.007, 0.05), mat('screen', 0.3, emit=1.0), ph, bevel=0)
    mug = empty('mug', root)
    cyl('mug_body', 0.045, 0.1, (0, 0, 0.05), mat('fabric_coral', 0.6), mug)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        o.select_set(True)
    path = os.path.join(OUT, 'testprops.glb')
    # export the children of props_root as top-level nodes
    for c in list(root.children):
        mw = c.matrix_world.copy()
        c.parent = None
        c.matrix_world = mw
    root.select_set(False)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True,
                              export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                              export_animations=False)
    print('EXPORTED', path, os.path.getsize(path))


if __name__ == '__main__':
    if '--props' in ARGS:
        build_props()
    elif '--b' in ARGS:
        export(build(8.0, 6.5, 'testroom_b'), 'testroom_b')
    else:
        r = build()
        export(r)
        if '--render' in ARGS:
            render()
