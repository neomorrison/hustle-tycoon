"""QA renders for the character (run via character.py --preview). Writes blender/.previews/character_*.png:

  character_turntable.png   default look from 8 angles (idle pose)
  character_lineup.png      a row of preset looks (from src/three/looks.ts)
  character_faces.png       neutral / smile / frown / sleepy / worried close-ups
  character_anims_<n>.png   contact sheets: key frames of every clip
  character_seated.png      sit_type at a 0.75 m desk on a 0.46 m chair + sit_idle, eat_sit
  character_sleep.png       sleep on a 0.5 m bed box (side + top view)
  character_props.png       placeholder props in socket_r / socket_l (phone, film, carry)
"""
import bpy
import json
import math
import os
import re
import numpy as np
from mathutils import Vector, Matrix, Euler

V = Vector
ROOT = None
PREV = None
TMP = None
CH = None   # character module


def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    try:
        sc.eevee.taa_render_samples = 24
    except Exception:
        pass
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.78, 0.74, 0.70, 1)
    bg.inputs['Strength'].default_value = 0.75
    sc.world = world
    # sun + fill
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.2
    sun.angle = math.radians(8)
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = Euler((math.radians(50), math.radians(8), math.radians(35)))
    sc.collection.objects.link(so)
    fill = bpy.data.lights.new('fill', 'AREA')
    fill.energy = 300
    fill.size = 4
    fo = bpy.data.objects.new('fill', fill)
    fo.location = (-3, -4, 3)
    fo.rotation_euler = Euler((math.radians(60), 0, math.radians(-35)))
    sc.collection.objects.link(fo)
    # floor
    me = bpy.data.meshes.new('floor')
    s = 6
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    fl = bpy.data.objects.new('floor', me)
    m = bpy.data.materials.new('floor_mat')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.52, 0.42, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    me.materials.append(m)
    sc.collection.objects.link(fl)
    cam = bpy.data.cameras.new('cam')
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    return sc


def look_at(cam, pos, target, lens=50, ortho=None):
    cam.location = pos
    d = (V(target) - V(pos)).normalized()
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'


def render(path, w, h):
    sc = bpy.context.scene
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def load_px(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1]     # top-down


def compose(paths, cols, out, pad=4, bg=(0.93, 0.91, 0.88)):
    ims = [load_px(p) for p in paths]
    h = max(i.shape[0] for i in ims)
    w = max(i.shape[1] for i in ims)
    rows = (len(ims) + cols - 1) // cols
    H = rows * h + (rows + 1) * pad
    Wd = cols * w + (cols + 1) * pad
    sheet = np.ones((H, Wd, 4), dtype=np.float32)
    sheet[..., 0], sheet[..., 1], sheet[..., 2] = bg
    for k, im in enumerate(ims):
        r, c = divmod(k, cols)
        y = pad + r * (h + pad)
        x = pad + c * (w + pad)
        sheet[y:y + im.shape[0], x:x + im.shape[1]] = im
    img = bpy.data.images.new('sheet', Wd, H, alpha=True)
    img.pixels.foreach_set(sheet[::-1].ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass
    print('[preview] wrote', out)


def label(text, loc, size=0.07):
    cu = bpy.data.curves.get('lbl') or bpy.data.curves.new('lbl', 'FONT')
    ob = bpy.data.objects.get('lbl')
    if not ob:
        ob = bpy.data.objects.new('lbl', cu)
        bpy.context.scene.collection.objects.link(ob)
        m = bpy.data.materials.new('lblm')
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.05, 0.08, 1)
        cu.materials.append(m)
    cu.body = text
    cu.size = size
    cu.align_x = 'CENTER'
    ob.location = loc
    ob.rotation_euler = Euler((math.radians(90), 0, 0))
    return ob


# ------------------------------------------------------------------------------------------------
def parse_looks():
    src = open(os.path.join(ROOT, 'src', 'three', 'looks.ts'), encoding='utf-8').read()
    m = re.search(r'//\s*@presets-begin\s*\n\s*const PRESETS\s*=\s*(\{.*?\n\})\s*\n\s*//\s*@presets-end', src, re.S)
    return json.loads(m.group(1))


HIDDEN_BY = {
    'hijab': ['short', 'messy', 'long', 'bun', 'braids', 'afro', 'buzz', 'curly', 'ponytail', 'bob'],
    'cap': ['messy', 'afro', 'bun'], 'cap_back': ['messy', 'afro', 'bun'], 'beanie': ['messy', 'afro', 'bun'],
    'flatcap': ['messy', 'afro', 'bun'], 'visor': ['afro'],
}
UNDER_HAT = {'messy': 'short', 'afro': 'curly', 'bun': 'ponytail'}


def effective_hair(look):
    style = look['hairStyle']
    for a in look.get('acc', []):
        hid = HIDDEN_BY.get(a)
        if not hid or style not in hid:
            continue
        if a == 'hijab':
            return 'bald'
        sw = UNDER_HAT.get(style)
        style = sw if sw and sw not in hid else 'bald'
    return style


def mouth_color(skin):
    r, g, b = (int(skin[i:i + 2], 16) for i in (1, 3, 5))
    c = lambda v: max(0, min(255, round(v)))
    return '#%02x%02x%02x' % (c(r * 0.55 + 40), c(g * 0.3 + 10), c(b * 0.3 + 12))


def apply_look(ctx, look):
    objs = ctx['objs']
    hair = effective_hair(look)
    top = look.get('topStyle', 'tee')
    acc = set(look.get('acc', []))
    for name, ob in objs.items():
        if name == 'body':
            vis = True
        elif name.startswith('hair_'):
            vis = name == 'hair_' + hair
        elif name.startswith('top_'):
            vis = name == 'top_' + top
        else:
            vis = name[4:] in acc
        ob.hide_render = not vis
        ob.hide_viewport = not vis
    cols = {'m_skin': look['skin'], 'm_hair': look['hair'], 'm_top': look['top'], 'm_bottom': look['bottom'],
            'm_shoes': look['shoes'], 'm_acc': look.get('accColor', look['top']), 'm_acc2': '#f3f2ef',
            'm_mouth': mouth_color(look['skin'])}
    for mn, hx in cols.items():
        m = CH.MATS[mn]
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = CH.hex_rgba(hx)
    s = look.get('height', 1.0)
    b = look.get('build', 1.0)
    ctx['rig'].scale = (s * b, s * b, s)


def set_clip(ctx, name, frame):
    rig = ctx['rig']
    act = ctx['actions'][name]
    rig.animation_data.action = act
    keys = ctx['body'].data.shape_keys
    if name in CH.MORPH_CLIPS:
        keys.animation_data.action = act
        try:
            slots = [s for s in act.slots if s.target_id_type == 'KEY']
            if slots:
                keys.animation_data.action_slot = slots[0]
        except AttributeError:
            pass
    else:
        keys.animation_data.action = None
        for kb in keys.key_blocks[1:]:
            kb.value = 0.0
    try:
        slots = [s for s in act.slots if s.target_id_type == 'OBJECT']
        if slots:
            rig.animation_data.action_slot = slots[0]
    except AttributeError:
        pass
    bpy.context.scene.frame_set(frame)


def box(name, lo, hi, color=(0.8, 0.7, 0.55, 1)):
    me = bpy.data.meshes.new(name)
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    vs = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(vs, [], fs)
    m = bpy.data.materials.new(name + '_m')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = color
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def prop_phone(parent_obj):
    """Placeholder phone modelled per the props contract: grip at origin, up = +Z."""
    ob = box('ph', (-0.035, -0.006, -0.02), (0.035, 0.006, 0.13), (0.15, 0.15, 0.2, 1))
    ob.parent = parent_obj
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = (0, 0, 0)
    return ob


# ------------------------------------------------------------------------------------------------
def run(ctx, character_module):
    global ROOT, PREV, TMP, CH
    CH = character_module
    ROOT = CH.ROOT
    PREV = os.path.join(ROOT, 'blender', '.previews')
    TMP = os.path.join(PREV, '_tmp')
    os.makedirs(TMP, exist_ok=True)
    only = None
    for a in CH.ARGS:
        if a.startswith('--only='):
            only = set(a[7:].split(','))
    sc = setup_scene()
    cam = sc.camera
    looks = parse_looks()
    apply_look(ctx, looks['player'])
    rig = ctx['rig']

    def want(k):
        return only is None or k in only

    # (a) turntable
    if want('turntable'):
        set_clip(ctx, 'idle', 0)
        paths = []
        for k in range(8):
            a = math.radians(k * 45)
            d = 3.4
            pos = V((math.sin(a) * d, -math.cos(a) * d, 1.25))
            look_at(cam, pos, (0, 0, 0.88), lens=50)
            paths.append(render(os.path.join(TMP, f'tt_{k}.png'), 320, 480))
        compose(paths, 8, os.path.join(PREV, 'character_turntable.png'))
        # big hero shot
        look_at(cam, V((1.3, -2.6, 1.55)), (0, 0, 1.05), lens=55)
        set_clip(ctx, 'idle', 30)
        render(os.path.join(PREV, 'character_hero.png'), 800, 1000)

    # (b) lineup of looks
    if want('lineup'):
        set_clip(ctx, 'idle', 0)
        ids = [k for k in looks.keys() if k != 'founder']
        paths = []
        for k in ids:
            apply_look(ctx, looks[k])
            lb = label(k, (0, -0.4, 0.05), 0.12)
            look_at(cam, V((0.9, -3.2, 1.45)), (0, 0, 0.92), lens=50)
            paths.append(render(os.path.join(TMP, f'lu_{k}.png'), 240, 400))
        bpy.data.objects.remove(bpy.data.objects['lbl'])
        compose(paths, 10, os.path.join(PREV, 'character_lineup.png'))
        apply_look(ctx, looks['player'])

    # faces
    if want('faces'):
        set_clip(ctx, 'idle', 0)
        rig.animation_data.action = None
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        keys = ctx['body'].data.shape_keys
        keys.animation_data.action = None
        paths = []
        for lk in ('player', 'p01', 'p07'):
            apply_look(ctx, looks[lk])
            for mo in ('neutral', 'smile', 'frown', 'sleepy', 'worried'):
                for kb in keys.key_blocks[1:]:
                    kb.value = 1.0 if kb.name == mo else 0.0
                bpy.context.view_layer.update()
                h = rig.scale.z
                look_at(cam, V((0.25, -1.0, 1.66 * h)), (0, 0, 1.58 * h), lens=85)
                paths.append(render(os.path.join(TMP, f'face_{lk}_{mo}.png'), 300, 300))
        for kb in keys.key_blocks[1:]:
            kb.value = 0.0
        compose(paths, 5, os.path.join(PREV, 'character_faces.png'))
        apply_look(ctx, looks['player'])

    # (c) animation contact sheets
    if want('anims'):
        names = list(CH.CLIPS.keys())
        per_sheet = 6
        for si in range(0, len(names), per_sheet):
            paths = []
            for name in names[si:si + per_sheet]:
                fn, frames, loop, upper = CH.CLIPS[name]
                ncol = 5
                for k in range(ncol):
                    f = round(frames * k / (ncol if loop else ncol - 1))
                    set_clip(ctx, name, f)
                    if name == 'sleep':
                        look_at(cam, V((2.6, -1.2, 1.6)), (0, 0.05, 0.2), lens=45)
                    elif name.startswith('sit') or name == 'eat_sit':
                        look_at(cam, V((2.2, -2.4, 1.3)), (0, -0.15, 0.62), lens=50)
                    else:
                        look_at(cam, V((1.7, -2.9, 1.35)), (0, 0, 0.9), lens=50)
                    label(f'{name} f{f}', (0, 0.6, 0.02) if name != 'sleep' else (0, 1.2, 0.02), 0.09)
                    paths.append(render(os.path.join(TMP, f'an_{name}_{k}.png'), 256, 320))
            compose(paths, 5, os.path.join(PREV, f'character_anims_{si // per_sheet + 1}.png'))
        if 'lbl' in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects['lbl'])

    # (d) seated + sleep proofs
    if want('seated'):
        chair = box('chair', (-0.22, -0.2, 0.0), (0.22, 0.24, 0.46), (0.45, 0.55, 0.75, 1))
        back = box('chairback', (-0.22, 0.2, 0.46), (0.22, 0.26, 0.95), (0.45, 0.55, 0.75, 1))
        desk = box('desk', (-0.7, -0.95, 0.72), (0.7, -0.27, 0.75), (0.85, 0.7, 0.5, 1))
        kb = box('keyboard', (-0.22, -0.48, 0.75), (0.22, -0.33, 0.77), (0.2, 0.2, 0.22, 1))
        paths = []
        for name, f in (('sit_type', 10), ('sit_idle', 30), ('eat_sit', 45), ('sit_think', 30)):
            set_clip(ctx, name, f)
            look_at(cam, V((2.4, -0.25, 0.85)), (0, -0.2, 0.62), lens=45)
            paths.append(render(os.path.join(TMP, f'seat_side_{name}.png'), 420, 420))
            look_at(cam, V((1.4, -2.2, 1.6)), (0, -0.2, 0.7), lens=45)
            paths.append(render(os.path.join(TMP, f'seat_34_{name}.png'), 420, 420))
        compose(paths, 4, os.path.join(PREV, 'character_seated.png'))
        for o in (chair, back, desk, kb):
            bpy.data.objects.remove(o)
        bed = box('bed', (-0.55, -1.2, 0.0), (0.55, 1.0, 0.5), (0.85, 0.85, 0.92, 1))
        pillow = box('pillow', (-0.35, 0.62, 0.5), (0.35, 0.95, 0.6), (0.95, 0.95, 0.97, 1))
        rig.location = (0, 0, 0.5)     # a_bed_lie sits on the mattress top
        set_clip(ctx, 'sleep', 20)
        paths = []
        look_at(cam, V((2.8, 0.0, 0.75)), (0, 0.0, 0.62), lens=40)
        paths.append(render(os.path.join(TMP, 'sleep_side.png'), 560, 400))
        look_at(cam, V((1.6, -2.4, 2.4)), (0, 0.0, 0.55), lens=40)
        paths.append(render(os.path.join(TMP, 'sleep_34.png'), 560, 400))
        compose(paths, 2, os.path.join(PREV, 'character_sleep.png'))
        rig.location = (0, 0, 0)
        for o in (bed, pillow):
            bpy.data.objects.remove(o)

    if want('props'):
        ph = prop_phone(ctx['socks']['r'])
        paths = []
        for name, f in (('phone', 10), ('film', 10), ('eat_sit', 45), ('wave', 22)):
            set_clip(ctx, name, f)
            look_at(cam, V((1.2, -2.2, 1.5)), (0, -0.1, 1.1), lens=55)
            paths.append(render(os.path.join(TMP, f'prop_{name}.png'), 360, 420))
        bpy.data.objects.remove(ph)
        compose(paths, 4, os.path.join(PREV, 'character_props.png'))
    try:
        os.rmdir(TMP)
    except OSError:
        pass
