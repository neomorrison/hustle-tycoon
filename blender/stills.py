"""Room stills + hotspots + seats for the 2D fallback (docs/3D.md section 9).

    blender -b --factory-startup --python blender/stills.py -- <id...> [--glb <path>] [--out <dir>]
                                                             [--hotspots <json>] [--png] [--samples <n>]
    node blender/run.mjs stills -- tier0 tier1 tier2 tier3 tier4 tier5 mcdoodles title_city

For each id: imports public/assets/3d/<id>.glb (or --glb, single id only) and renders it at 1600x900 like the runtime
sees it: VERTICAL field of view (three.js PerspectiveCamera.fov), rooms from the default high south-east camera (yaw
45, elevation 40, FOV 28) with the walls facing the camera cut to 0.3 m stubs and tier5's camera-side city sectors
hidden, the diorama filling ~82% of the frame; title_city from its a_cam (extras fov = vertical FOV). Each room gets
the look the game shows it in: daylight homes and McDoodle's, tier5 at night (lamps and windows glowing), the title
at dusk over a lavender-to-peach sky gradient with the upper third left for the logo. A bare main desk (a_gear_desk
with extras {default}) gets that default computer from props.glb, as the runtime shows it.

Writes <out>/<id>.webp (title_city -> title.webp) over the room's backdrop colour and updates, per room:
  hotspots.json  one {x, y, w, h} rect (percent of the image, x/y = top-left) per interactive key the games use
                 (homes: bed, computer, fridge, door, tier4 also garage; mcdoodles: counter, fryer, exit) = the
                 projected bounding box of every group with that `interact` extra
  seats.json     home tiers only: {"computer_sit": {x, y, top}, "staff_<n>_sit": {...}} = the percent position of
                 each seat anchor's floor point (x, y) and the y of a seated head top 1.3 m above it (top), so a 2D
                 scene can stand avatars on the art
Other rooms' entries are kept. --out defaults to public/assets/rooms. --png keeps the intermediate PNG.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))

import bpy                 # noqa: E402
from mathutils import Matrix, Vector   # noqa: E402
from bpy_extras.object_utils import world_to_camera_view   # noqa: E402

import build as B          # noqa: E402
from palette import hex_to_linear   # noqa: E402

# keep in sync with src/ui/shell/hotspots.ts ROOM_BACKDROP
BACKDROP = {'tier0': '#fbf3e7', 'tier1': '#fdf6e8', 'tier2': '#fdf4e3', 'tier3': '#fcf6e7', 'tier4': '#fbf4e5',
            'tier5': '#08143a', 'mcdoodles': '#fffcec', 'title_city': '#f6e7d8'}
# title sky: top to bottom (matches the title screens' CSS backdrop, lavender -> pink -> peach)
TITLE_SKY = [(0.0, '#c9b6ff'), (0.5, '#f3b8d8'), (1.0, '#ffd2a8')]
RES = (1600, 900)
FOV_V = 28.0               # runtime camera (src/three/camera.ts FOV), vertical
KEYS = {'home': ['bed', 'computer', 'fridge', 'door'], 'tier4': ['bed', 'computer', 'fridge', 'door', 'garage'],
        'mcdoodles': ['counter', 'fryer', 'exit']}
MOOD = {'tier5': 'night', 'title_city': 'dusk'}


def parse():
    a = B.cli_args()
    rest = a['rest']
    opts = {'ids': [], 'glb': None, 'out': a['out'], 'hotspots': None, 'png': False, 'samples': 64}
    i = 0
    while i < len(rest):
        t = rest[i]
        if t == '--glb':
            opts['glb'] = rest[i + 1]
            i += 1
        elif t == '--hotspots':
            opts['hotspots'] = rest[i + 1]
            i += 1
        elif t == '--samples':
            opts['samples'] = int(rest[i + 1])
            i += 1
        elif t == '--png':
            opts['png'] = True
        elif not t.startswith('--'):
            opts['ids'].append(t)
        i += 1
    opts['out'] = os.path.abspath(opts['out'] or os.path.join(B.REPO, 'public', 'assets', 'rooms'))
    opts['hotspots'] = os.path.abspath(opts['hotspots'] or os.path.join(opts['out'], 'hotspots.json'))
    if opts['glb'] and len(opts['ids']) != 1:
        raise SystemExit('--glb needs exactly one room id')
    return opts


def import_room(path):
    """Clean the scene and import a GLB; returns the `room` root object (or None for non-room files)."""
    B.clean_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    root = bpy.data.objects.get('room')
    B.set_root(root)
    return root


def mesh_corners(objs):
    """World-space bounding-box corners of all evaluated meshes under objs."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        for m in [o] + B.descendants(o):
            if m.type != 'MESH' or m.hide_render:
                continue
            ev = m.evaluated_get(dg)
            mw = ev.matrix_world
            pts += [mw @ Vector(c) for c in ev.bound_box]
    return pts


def to_image(cam, p):
    """Percent (x, y) of world point p in the rendered image, top-left origin."""
    v = world_to_camera_view(bpy.context.scene, cam, Vector(p))
    return v.x * 100, (1 - v.y) * 100


def project_rect(cam, pts):
    """Percent rect {x, y, w, h} (top-left origin) of the projected points, clamped to the image."""
    sc = bpy.context.scene
    xs, ys = [], []
    for p in pts:
        v = world_to_camera_view(sc, cam, p)
        xs.append(min(1.0, max(0.0, v.x)))
        ys.append(min(1.0, max(0.0, v.y)))
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    r = lambda v: round(v * 100, 1)
    return {'x': r(x0), 'y': r(1 - y1), 'w': r(x1 - x0), 'h': r(y1 - y0)}


def fmt_rects(data, fields):
    """Same layout as the hand-written file: one line per key, aligned."""
    lines = ['{']
    rooms = list(data.items())
    width = max([len(k) + 3 for _, spots in rooms for k in spots] or [10])
    for ri, (room, spots) in enumerate(rooms):
        lines.append(f'  "{room}": {{')
        items = list(spots.items())
        for ki, (k, r) in enumerate(items):
            key = f'"{k}":'.ljust(width)
            vals = ', '.join(f'"{c}": {json.dumps(r[c])}' for c in fields if c in r)
            lines.append(f'    {key} {{ {vals} }}' + (',' if ki < len(items) - 1 else ''))
        lines.append('  }' + (',' if ri < len(rooms) - 1 else ''))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def update_json(path, room_id, entry, fields):
    data = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    data[room_id] = entry
    order = ['tier0', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'mcdoodles']
    data = {k: data[k] for k in sorted(data, key=lambda k: order.index(k) if k in order else 99)}
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(fmt_rects(data, fields))


# ---- looks --------------------------------------------------------------------------------------------------------


def bsdf_of(mat):
    if not mat or not mat.use_nodes:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def set_emit(name, color, strength, base=None):
    b = bsdf_of(bpy.data.materials.get(name))
    if not b:
        return
    b.inputs['Emission Color'].default_value = hex_to_linear(color)
    b.inputs['Emission Strength'].default_value = strength
    if base:
        b.inputs['Base Color'].default_value = hex_to_linear(base)


def point_lights(energy, radius=0.25):
    for o in list(bpy.data.objects):
        if o.name.startswith('l_'):
            kind = o.get('light', 'lamp')
            if kind == 'window':
                continue
            pl = bpy.data.lights.new('_prev_' + o.name, 'POINT')
            pl.energy = energy * float(o.get('intensity', 1.0))
            pl.color = hex_to_linear(o.get('color', '#ffd9a0'))[:3]
            pl.shadow_soft_size = radius
            po = B._prev_obj('pl_' + o.name, pl)
            po.location = o.matrix_world.translation


def apply_mood(mood, span):
    """Lights + runtime-driven materials for the room's look (the runtime sets these per time of day)."""
    if mood == 'night':
        B.WORLD.update({'sky': '#3a4674', 'sky_strength': 0.55, 'sun': 1.3, 'sun_color': '#b8c6f0',
                        'sun_dir': (-0.3, -1.0, 1.6), 'fill': 9.0})
        set_emit('m_window_sky', '#1f2a4a', 0.85, '#1f2a4a')
        set_emit('m_lampshade', '#ffd49a', 1.4)
        set_emit('m_window_glass', '#2c3a63', 0.0, '#2c3a63')
        B._lights((0, 0, 0), span)
        point_lights(120.0)
    elif mood == 'dusk':
        B.WORLD.update({'sky': '#9d8fc4', 'sky_strength': 0.8})
        set_emit('m_window_sky', '#f2a97a', 0.9, '#f2a97a')
        set_emit('m_lampshade', '#ffd9a0', 4.0, '#ffd9a0')
        sun = bpy.data.lights.new('_prev_dusk_sun', 'SUN')
        sun.energy = 4.2
        sun.color = hex_to_linear('#ffb27a')[:3]
        sun.angle = math.radians(4)
        so = B._prev_obj('dusk_sun', sun)
        so.rotation_euler = Vector((0.9, 0.35, -0.42)).to_track_quat('-Z', 'Y').to_euler()   # low sun from the west
        fill = bpy.data.lights.new('_prev_dusk_fill', 'AREA')
        fill.energy = 16000
        fill.size = 40
        fill.color = hex_to_linear('#b9a8e6')[:3]
        fo = B._prev_obj('dusk_fill', fill)
        fo.location = (20, -30, 40)
        fo.rotation_euler = (Vector((0, 0, 0)) - Vector(fo.location)).to_track_quat('-Z', 'Y').to_euler()
        point_lights(350.0, 0.3)
    else:
        B.WORLD.update({'sky': '#e9eef6', 'sky_strength': 0.72, 'sun': 4.4, 'sun_color': '#fff0da',
                        'sun_dir': (0.35, -1.0, 1.5), 'fill': 25.0})
        B._lights((0, 0, 0), span)
    # a touch brighter than the builder previews: the stills sit on light UI cards and backdrops
    bpy.context.scene.view_settings.exposure = {'day': 0.3, 'night': 0.35, 'dusk': 0.1}[mood]
    world = bpy.context.scene.world
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = hex_to_linear(B.WORLD['sky'])
    bg.inputs['Strength'].default_value = B.WORLD['sky_strength']


def hide_camera_side_sectors(cam_loc):
    """tier5's city: hide the outside sectors on the camera's side, like the runtime cutaway (dot > 0.3)."""
    d = Vector((cam_loc.x, cam_loc.y))
    if d.length == 0:
        return
    d.normalize()
    for o in bpy.data.objects:
        if 'sector' in o.keys():
            a = math.radians(float(o['sector']))
            if math.cos(a) * d.x + math.sin(a) * d.y > 0.3:
                for m in [o] + B.descendants(o):
                    m.hide_render = True


def desk_default():
    """A bare main desk (a_gear_desk extras {default, center}) shows its default computer, as in the game."""
    a = bpy.data.objects.get('a_gear_desk')
    if a is None or not a.get('default'):
        return
    node, center = str(a['default']), float(a.get('center', 0.0))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(B.ASSETS_3D, 'props.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    keep = next((o for o in new if o.name == node or o.name.startswith(node + '.')), None)
    keep_set = set([keep] + B.descendants(keep)) if keep else set()
    for o in new:
        if o not in keep_set:
            bpy.data.objects.remove(o, do_unlink=True)
    if keep:
        keep.parent = None
        keep.matrix_world = a.matrix_world @ Matrix.Translation((center, 0, 0))


def gradient_backdrop(path, stops):
    """Flatten a straight-alpha PNG over a vertical sRGB gradient (stops: [(0..1 from the top, '#rrggbb')])."""
    import numpy as np
    img = bpy.data.images.load(os.path.abspath(path), check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)                    # row 0 = the BOTTOM of the image

    def rgb(hx):
        hx = hx.lstrip('#')
        return np.array([int(hx[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)
    t = 1.0 - (np.arange(h, dtype=np.float32) + 0.5) / h      # 0 at the top row
    ts = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.stack([rgb(s[1]) for s in stops])
    bg = np.stack([np.interp(t, ts, cols[:, c]) for c in range(3)], axis=1)     # h x 3
    a = px[:, :, 3:4]
    px[:, :, :3] = px[:, :, :3] * a + bg[:, None, :] * (1 - a)
    px[:, :, 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = os.path.abspath(path)
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


# ---- one still ------------------------------------------------------------------------------------------------------


def still(room_id, glb, out_dir, hotspots_path, keep_png, samples):
    root = import_room(glb)
    backdrop = BACKDROP.get(room_id, '#fbf3e7')
    mood = MOOD.get(room_id, 'day')
    B.clear_preview()
    B.setup_render(RES, samples, backdrop)
    info = B._room_info(root) if root else None
    cam = B._camera('still', fov=FOV_V, sensor_fit='VERTICAL')
    a_cam = bpy.data.objects.get('a_cam')
    restore = lambda: None
    if a_cam is not None:
        mw = a_cam.matrix_world
        fwd = (mw.to_3x3() @ Vector((0, -1, 0))).normalized()
        cam.location = mw.translation
        cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
        if 'fov' in a_cam:
            cam.data.angle = math.radians(float(a_cam['fov']))     # vertical, like the runtime
        cam.data.clip_end = 800
    else:
        pts = B.room_points(root) if root else [tuple(p) for p in mesh_corners(list(bpy.data.objects))]
        B.fit_camera(cam, pts, 45.0, 40.0, RES, margin=0.14)
        if root:
            restore = B._stub_walls(root, cam.location)
        hide_camera_side_sectors(cam.location)
        desk_default()
    span = max(info[0], info[1]) if info else 12.0
    apply_mood(mood, span)
    bpy.context.view_layer.update()
    os.makedirs(out_dir, exist_ok=True)
    name = 'title' if room_id == 'title_city' else room_id
    png = os.path.join(out_dir, f'{name}.png')
    if room_id == 'title_city':
        B.render_to(png, None)
        gradient_backdrop(png, TITLE_SKY)
    else:
        B.render_to(png, backdrop)
    webp = os.path.join(out_dir, f'{name}.webp')
    # the PNG is already display-referred (AgX applied at render): re-encode it as lossy WebP through save_render
    # with the Standard view (identity for an sRGB image), or the view transform would run twice and wash it out
    img = bpy.data.images.load(png, check_existing=False)
    sc = bpy.context.scene
    vs = sc.view_settings
    saved = (vs.view_transform, vs.look, vs.exposure, vs.gamma)
    vs.view_transform, vs.look, vs.exposure, vs.gamma = 'Standard', 'None', 0.0, 1.0
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.quality = 86
    sc.render.image_settings.color_mode = 'RGB'
    img.save_render(webp, scene=sc)
    vs.view_transform, vs.look, vs.exposure, vs.gamma = saved
    bpy.data.images.remove(img)
    if not keep_png:
        os.remove(png)
    print(f'[stills] {webp}')
    if room_id != 'title_city' and root is not None:
        # hotspots: the keys the games use for this room
        keys = KEYS['mcdoodles'] if room_id == 'mcdoodles' else KEYS['tier4'] if room_id == 'tier4' else KEYS['home']
        groups = {}
        for o in B.descendants(root):
            k = o.get('interact')
            if k in keys:
                groups.setdefault(k, []).append(o)
        spots = {}
        for k in keys:
            pts = mesh_corners(groups.get(k, []))
            if pts:
                spots[k] = project_rect(cam, pts)
            else:
                print(f'[stills] WARNING {room_id}: no group with interact "{k}"')
        update_json(hotspots_path, room_id, spots, ('x', 'y', 'w', 'h'))
        print(f'[stills] {hotspots_path}: {room_id} -> {json.dumps(spots)}')
        # seats (home tiers): computer + staff seat anchors
        if room_id.startswith('tier'):
            seats = {}
            names = ['a_computer_sit'] + sorted((o.name for o in bpy.data.objects if o.name.startswith('a_staff_') and
                                                 o.name.endswith('_sit')), key=lambda n: int(n.split('_')[2]))
            for n in names:
                o = bpy.data.objects.get(n)
                if o is None:
                    continue
                p = o.matrix_world.translation
                x, y = to_image(cam, p)
                _, top = to_image(cam, p + Vector((0, 0, 1.3)))
                seats[n[2:]] = {'x': round(x, 1), 'y': round(y, 1), 'top': round(top, 1)}
            seats_path = os.path.join(os.path.dirname(hotspots_path), 'seats.json')
            update_json(seats_path, room_id, seats, ('x', 'y', 'top'))
            print(f'[stills] {seats_path}: {room_id} -> {json.dumps(seats)}')
    restore()


def main():
    o = parse()
    if not o['ids']:
        raise SystemExit('usage: stills.py -- <id...> [--glb path] [--out dir] [--hotspots json] [--png] [--samples n]')
    for rid in o['ids']:
        if rid == 'studio':
            print('[stills] studio: no still (it is only a live preview)')
            continue
        glb = o['glb'] or os.path.join(B.ASSETS_3D, f'{rid}.glb')
        if not os.path.exists(glb):
            raise SystemExit(f'missing {glb}')
        still(rid, glb, o['out'], o['hotspots'], o['png'], o['samples'])


main()
