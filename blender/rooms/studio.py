"""studio: the character preview diorama (docs/3D.md section 5, "studio"). Output: public/assets/3d/studio.glb

    node blender/run.mjs studio --preview
    node blender/inspect.mjs public/assets/3d/studio.glb --check studio

A small round pedestal (2.4 m across, soft rounded rim, pastel blush top on a rose drum) and nothing else: no walls,
no furniture. The new-game "Look" editor puts ONE actor on a_spawn (the centre, facing the default south-east
camera) and the runtime frames that actor's full body at any aspect, with drag-to-rotate turning the pedestal
like a turntable. Root extras {studio: true} switch the runtime camera to that framing.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))

import build as B          # noqa: E402

args = B.cli_args()
B.clean_scene()

R_TOP = 1.2              # pedestal radius (2.4 m across)
H = 0.34                 # pedestal height (the top surface is the floor, z = 0)
RIM = 0.09               # radius of the rounded top edge


def rounded_profile(r, z_top, rim, steps=6):
    """Rim quarter-circle from the side wall (r, z_top - rim) up and in to (r - rim, z_top)."""
    pts = []
    for i in range(steps + 1):
        a = (math.pi / 2) * i / steps
        pts.append((r - rim + rim * math.cos(a), z_top - rim + rim * math.sin(a)))
    return pts


B.set_root(None)
root = B.group('room', parent=None, room='studio', w=2 * R_TOP, d=2 * R_TOP, wallH=2.0, studio=True)
B.set_root(root)

# body: a soft drum, slightly narrower at the foot, dusty rose
body = [(R_TOP - 0.1, -H), (R_TOP - 0.06, -H + 0.015), (R_TOP - 0.02, -H + 0.06)]
body += [(R_TOP, -0.12)] + rounded_profile(R_TOP, -0.04, 0.08, 5)[1:]
B.lathe('slab', body, (0, 0, 0), 'rug_rose', 'root', verts=64, cap_bottom=True, cap_top=True)

# top: a blush disc with its own rounded lip sitting on the drum (the walkable floor)
top = [(R_TOP - 0.035, -0.05)] + rounded_profile(R_TOP - 0.035, 0.0, 0.045, 5)
fl = B.lathe('floor', top, (0, 0, 0), 'wall_blush', 'root', verts=64, cap_bottom=False, cap_top=True)
fl['floor'] = True

# a thin inset ring on the top, just for a touch of detail at the feet
B.lathe('ring', [(0.86, 0.001), (0.86, 0.003), (0.9, 0.003), (0.9, 0.001)], (0, 0, 0), 'plastic_white', 'root', verts=64,
        cap_bottom=False)

B.anchor('a_spawn', (0, 0, 0), 'se')
B.light('l_key', (1.4, -1.6, 2.4), 'lamp', '#fff1dc', 1.2, 6.0)

if args['preview']:
    B.preview_set('studio', views=('default',))

B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'studio.glb'), root)
