"""Reusable furniture / prop builders (docs/3D.md sections 1, 4, 5).

Every builder:
- returns its group empty (named `name`, auto-numbered if taken) with its meshes as children;
- takes name, location (x, y, z world or parent-local) and rotation (degrees about Z, or an XYZ tuple);
- FRONT = local -Y. Rotation 0 = back against the north wall, front toward the camera side. Use B.against(side).
- is deterministic (seeded); dimensions follow docs/3D.md (desk top 0.75, chair seat 0.46, bed top 0.5,
  counter 0.9, door 0.9 x 2.1);
- marks itself {obstacle:true} when people cannot walk through it (override with obstacle=False) and sets
  {interact:<key>} when interact= is given;
- optional anchors=True creates the contract anchors that belong to that piece (see each docstring).
"""
import math
import random

import build as B
from build import box, cyl, sphere, blob, tube, panel, prism, lathe, torus, bezier, catenary

TAU = math.pi * 2


# ----------------------------------------------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------------------------------------------


def _g(name, location, rotation, obstacle=True, interact=None, parent='root', **extras):
    """Create the furniture group empty with standard extras."""
    g = B.group(name, location, rotation, parent, **extras)
    if obstacle:
        B.obstacle(g)
    if interact:
        B.interactive(g, interact)
    return g


def _n(g, part):
    return f'{g.name}_{part}'


def _rng(name, seed):
    return random.Random((sum(ord(c) * (i + 1) for i, c in enumerate(name)) + seed * 7919) & 0xffffffff)


def leg4(g, w, d, h, r=0.022, mat='wood_mid', inset=0.04, z0=0.0, square=False, splay=0.0):
    """Four legs under a w x d footprint (local, centred), height h from z0. splay tilts them outward (degrees)."""
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - inset), sy * (d / 2 - inset)
            rot = (sy * -splay, sx * splay, 0) if splay else None
            if square:
                out.append(box(_n(g, 'leg'), (2 * r, 2 * r, h), (x, y, z0 + h / 2), mat, g, rot, bevel=0.004,
                               segments=1))
            else:
                out.append(cyl(_n(g, 'leg'), r, h, (x, y, z0 + h / 2), mat, g, rot, verts=10, r2=r * 0.8,
                               bevel=0.003))
    return out


def knob(g, loc, mat='metal', r=0.014, rot=None):
    """Small round knob on a -Y facing front."""
    return sphere(_n(g, 'knob'), r, loc, mat, g, scale=(1, 0.7, 1), segs=10, rings=6)


def bar_handle(g, loc, length=0.12, vertical=False, mat='metal', r=0.007, standoff=0.025):
    """Bar handle (with two standoffs) on a -Y facing front at loc (front surface point)."""
    x, y, z = loc
    if vertical:
        a, b = (x, y - standoff, z - length / 2), (x, y - standoff, z + length / 2)
        pts = [(x, y, z - length / 2), a, b, (x, y, z + length / 2)]
    else:
        a, b = (x - length / 2, y - standoff, z), (x + length / 2, y - standoff, z)
        pts = [(x - length / 2, y, z), a, b, (x + length / 2, y, z)]
    return tube(_n(g, 'handle'), pts, r, mat, g, res=6)


def books_row(g, x0, x1, y, z, depth=0.2, seed=1, hmin=0.17, hmax=0.27, lean_last=True,
              mats=('poster_a', 'poster_b', 'fabric_teal', 'fabric_mustard', 'fabric_coral', 'paper', 'fabric_navy',
                    'rug_green', 'wood_dark', 'mcd_red')):
    """A row of books standing on a shelf from x0 to x1 (local), spines facing -Y, bottoms at z."""
    rng = _rng(g.name, seed)
    x = x0
    out = []
    while x < x1 - 0.03:
        t = rng.uniform(0.022, 0.045)
        if x + t > x1:
            break
        h = rng.uniform(hmin, hmax)
        m = mats[rng.randrange(len(mats))]
        dd = depth * rng.uniform(0.78, 1.0)
        out.append(box(_n(g, 'book'), (t, dd, h), (x + t / 2, y + (depth - dd) / 2, z + h / 2), m, g,
                       bevel=0.003, segments=1))
        x += t + 0.002
        if rng.random() < 0.08 and x < x1 - 0.2:   # a gap with a leaning book
            h = rng.uniform(hmin, hmax)
            box(_n(g, 'book'), (0.03, depth * 0.9, h), (x + 0.06, y, z + h / 2 * math.cos(0.3)),
                mats[rng.randrange(len(mats))], g, (0, 17, 0), bevel=0.003, segments=1)
            x += 0.12
    return out


def mug(g, loc, mat='plastic_white', r=0.04, h=0.095):
    """Small mug with handle (loc = bottom centre)."""
    x, y, z = loc
    lathe(_n(g, 'mug'), [(r * 0.92, 0), (r, 0.01), (r, h), (r * 0.86, h), (r * 0.86, 0.012)], (x, y, z), mat, g,
          verts=14)
    torus(_n(g, 'mugh'), h * 0.28, 0.008, (x + r + 0.012, y, z + h * 0.55), mat, g, (90, 0, 0), major=10, minor=5)
    cyl(_n(g, 'coffee'), r * 0.86, 0.004, (x, y, z + h * 0.8), 'wood_dark', g, verts=14, bevel=0)


def plant_leaves(g, base, n=7, length=0.22, width=0.09, lift=40, mat='plant', seed=1, droop=0.0, spread=1.0,
                 z_jitter=0.05):
    """Rosette of flattened-ellipsoid leaves radiating from `base` (local point)."""
    rng = _rng(g.name, seed)
    for i in range(n):
        a = TAU * i / n + rng.uniform(-0.3, 0.3)
        L = length * rng.uniform(0.75, 1.15)
        tilt = math.radians(lift + rng.uniform(-12, 12))
        cx = base[0] + math.cos(a) * L * 0.45 * math.cos(tilt) * spread
        cy = base[1] + math.sin(a) * L * 0.45 * math.cos(tilt) * spread
        cz = base[2] + L * 0.45 * math.sin(tilt) + rng.uniform(0, z_jitter) - droop
        sphere(_n(g, 'leaf'), 0.5, (cx, cy, cz), mat if rng.random() > 0.3 else 'plant_dark', g,
               rot=(0, -math.degrees(tilt), math.degrees(a)), scale=(L, width, 0.02), segs=10, rings=5)


# ----------------------------------------------------------------------------------------------------------------
# beds + bedroom
# ----------------------------------------------------------------------------------------------------------------

BED_SIZES = {'twin': (0.99, 1.95), 'full': (1.37, 1.95), 'queen': (1.55, 2.05), 'king': (1.95, 2.05)}


def _duvet_deform(W, L, messy, rng, foot_drape=True):
    ph = [rng.uniform(0, TAU) for _ in range(4)]

    def f(x, y, z):
        # drape the sides and the foot down over the mattress edge (smooth, corner-safe)
        ex = max(0.0, abs(x) - (W / 2 - 0.12)) / 0.12
        ey = max(0.0, -(y) - (L / 2 - 0.12)) / 0.12 if foot_drape else 0.0
        e = min(1.0, math.sqrt(ex * ex + ey * ey))
        e = e * e * (3 - 2 * e)
        drop = 0.13 * e
        dz = -drop
        if messy:
            dz += 0.035 * math.sin(7 * x + ph[0]) * math.cos(5 * y + ph[1]) + \
                0.025 * math.sin(11 * y + 3 * x + ph[2])
            # a lump in the middle
            dz += 0.07 * math.exp(-((x - W * 0.12) ** 2 + (y - L * 0.08) ** 2) / 0.08)
        else:
            dz += 0.008 * math.sin(9 * x + ph[0]) * math.sin(6 * y + ph[1])
        return (x, y, z + dz)
    return f


def bed(size='queen', frame='wood', name='bed', location=(0, 0, 0), rotation=0, frame_mat=None,
        duvet_mat='fabric_blue', sheet_mat='paper', pillow_mat='fabric_cream', throw_mat=None, messy=False,
        pillows=None, headboard=True, interact='bed', anchors=False, anchor_side='right', seed=1, obstacle=True):
    """Bed with mattress, duvet, pillows. size twin|full|queen|king. frame wood|platform|metal|upholstered|none.
    Headboard at local +Y (against the wall), foot toward -Y. Mattress top = 0.5 m.
    messy=True crumples the duvet and knocks a pillow askew. throw_mat adds a folded throw across the foot.
    anchors=True creates a_bed_lie (pelvis on the mattress, facing the foot), a_bed_sit (edge on anchor_side
    'right' = local +X or 'left', feet on the floor, facing out) and a_bed_stand (floor beside it, facing it)."""
    W, L = BED_SIZES[size]
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle, interact)
    top = 0.5
    mh = 0.22
    base_top = top - mh + 0.02
    fm = frame_mat or {'wood': 'wood_mid', 'platform': 'wood_light', 'metal': 'metal_dark', 'upholstered':
                       'fabric_grey', 'none': 'wood_light'}[frame]
    if frame == 'wood':
        box(_n(g, 'rail'), (W + 0.06, L + 0.05, 0.16), (0, 0, base_top - 0.08), fm, g, bevel=0.015)
        leg4(g, W + 0.06, L + 0.05, base_top - 0.16, 0.03, fm, inset=0.035, square=True)
        if headboard:
            box(_n(g, 'head'), (W + 0.1, 0.06, 0.62), (0, L / 2 + 0.04, 0.62), fm, g, bevel=0.025, segments=3)
            for i in range(3 if W > 1.2 else 2):
                n = 3 if W > 1.2 else 2
                x = (i - (n - 1) / 2) * (W / n)
                box(_n(g, 'headp'), (W / n - 0.08, 0.02, 0.36), (x, L / 2 + 0.005, 0.66), fm, g, bevel=0.01)
            for sx in (-1, 1):
                cyl(_n(g, 'post'), 0.035, 1.0, (sx * (W / 2 + 0.05), L / 2 + 0.04, 0.5), fm, g, verts=12)
                sphere(_n(g, 'finial'), 0.04, (sx * (W / 2 + 0.05), L / 2 + 0.04, 1.02), fm, g, segs=12, rings=6)
        box(_n(g, 'foot'), (W + 0.1, 0.05, 0.24), (0, -L / 2 - 0.03, 0.34), fm, g, bevel=0.02, segments=3)
    elif frame == 'platform':
        box(_n(g, 'plinth'), (W + 0.1, L + 0.06, 0.1), (0, 0.02, 0.05), 'wood_dark', g, bevel=0.01)
        box(_n(g, 'deck'), (W + 0.36, L + 0.24, 0.16), (0, 0.06, base_top - 0.08), fm, g, bevel=0.02)
        if headboard:
            box(_n(g, 'head'), (W + 0.5, 0.1, 0.9), (0, L / 2 + 0.2, 0.62), fm, g, bevel=0.02)
            for sx in (-1, 1):   # side tables built into the headboard
                box(_n(g, 'shelf'), (0.42, 0.34, 0.04), (sx * (W / 2 + 0.25 + 0.2), L / 2 + 0.02, 0.48), fm, g,
                    bevel=0.01)
    elif frame == 'metal':
        box(_n(g, 'rail'), (W + 0.02, L + 0.02, 0.06), (0, 0, base_top - 0.05), fm, g, bevel=0.01)
        for yy, hh in ((L / 2 + 0.02, 1.0), (-L / 2 - 0.02, 0.62)):
            pts = [(-W / 2 - 0.02, yy, 0.0), (-W / 2 - 0.02, yy, hh), (W / 2 + 0.02, yy, hh), (W / 2 + 0.02, yy, 0.0)]
            tube(_n(g, 'frame'), pts, 0.018, fm, g, res=8)
            nb = 5 if W < 1.2 else 7
            for i in range(nb):
                x = -W / 2 + (i + 1) * W / (nb + 1)
                tube(_n(g, 'bar'), [(x, yy, base_top - 0.05), (x, yy, hh)], 0.01, fm, g, res=6)
            tube(_n(g, 'rail2'), [(-W / 2, yy, hh * 0.55), (W / 2, yy, hh * 0.55)], 0.012, fm, g, res=6)
    elif frame == 'upholstered':
        box(_n(g, 'base'), (W + 0.12, L + 0.08, base_top - 0.06), (0, 0, (base_top - 0.06) / 2 + 0.06), fm, g,
            bevel=0.04, segments=3)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl(_n(g, 'foot'), 0.025, 0.06, (sx * (W / 2 - 0.02), sy * (L / 2 - 0.02), 0.03), 'wood_dark', g)
        if headboard:
            box(_n(g, 'head'), (W + 0.16, 0.12, 0.72), (0, L / 2 + 0.07, 0.86), fm, g, bevel=0.05, segments=3)
            n = max(2, round(W / 0.4))
            for i in range(n):
                x = (i - (n - 1) / 2) * ((W + 0.06) / n)
                blob(_n(g, 'tuft'), ((W + 0.06) / n - 0.01, 0.06, 0.6), (x, L / 2 + 0.0, 0.86), fm, g,
                     round_xy=0.4, round_z=0.4, segs=12, rings=8)
    # mattress + duvet + pillows
    blob(_n(g, 'mattress'), (W, L, mh), (0, 0, top - mh / 2), sheet_mat, g, round_xy=0.12, round_z=0.3,
         segs=24, rings=8)
    footboard = frame in ('wood', 'metal')          # keep the duvet inside the footboard
    dl = L * 0.74
    dcy = -L / 2 + dl / 2 + (0.0 if footboard else -0.04)
    dfn = _duvet_deform(W + 0.1, dl + (0.0 if footboard else 0.08), messy, rng, foot_drape=not footboard)
    blob(_n(g, 'duvet'), (W + 0.1, dl + (0.0 if footboard else 0.08), 0.1), (0, dcy, top + 0.02), duvet_mat, g,
         (0, 0, rng.uniform(-3, 3) if messy else 0), round_xy=0.18, round_z=0.5, segs=28, rings=12,
         deform=lambda x, y, z: dfn(x, y, z))
    # folded top band
    if not messy:
        blob(_n(g, 'fold'), (W + 0.06, 0.2, 0.07), (0, dcy + dl / 2 - 0.02, top + 0.06), sheet_mat, g,
             round_xy=0.3, round_z=0.6, segs=20, rings=8)
    else:
        blob(_n(g, 'fold'), (W * 0.7, 0.35, 0.12), (W * 0.1, dcy + dl / 2 - 0.08, top + 0.07), duvet_mat, g,
             (0, 0, 14), round_xy=0.5, round_z=0.6, segs=16, rings=8)
    np_ = pillows if pillows is not None else (1 if W < 1.2 else 2 if W < 1.8 else 3)
    pw = min(0.62, (W - 0.1) / np_ - 0.04)
    for i in range(np_):
        x = (i - (np_ - 1) / 2) * (W - 0.1) / np_
        rz = rng.uniform(-6, 6) + (18 if messy and i == 0 else 0)
        blob(_n(g, 'pillow'), (pw, 0.36, 0.13), (x + (0.05 if messy and i == 0 else 0), L / 2 - 0.26, top + 0.08),
             pillow_mat, g, (-14, 0, rz), round_xy=0.45, round_z=0.7, segs=16, rings=8)
    if throw_mat:
        blob(_n(g, 'throw'), (W + 0.12, 0.42, 0.05), (0, -L / 2 + 0.3, top + 0.1), throw_mat, g,
             round_xy=0.2, round_z=0.5, segs=20, rings=8, deform=_duvet_deform(W + 0.12, 0.42, False, rng))
    if anchors:
        s = 1 if anchor_side == 'right' else -1
        B.anchor('a_bed_lie', (0, L / 2 - 1.05, top), 's', frame=g)
        B.anchor('a_bed_sit', (s * (W / 2 - 0.12), -0.15, 0), 'e' if s > 0 else 'w', frame=g)
        B.anchor('a_bed_stand', (s * (W / 2 + 0.5), -0.15, 0), 'w' if s > 0 else 'e', frame=g)
    return g


def nightstand(style='wood', name='nightstand', location=(0, 0, 0), rotation=0, mat=None, clutter=True, lamp=True,
               seed=1, obstacle=True):
    """Bedside table (0.45 x 0.4 x 0.55) with a drawer; style wood|white|crate. clutter adds a book + glass;
    lamp adds a small table lamp (m_lampshade shade)."""
    g = _g(name, location, rotation, obstacle)
    m = mat or {'wood': 'wood_light', 'white': 'plastic_white', 'crate': 'wood_light'}[style]
    W, D, H = 0.45, 0.4, 0.55
    if style == 'crate':
        for z in (0.02, H - 0.02):
            box(_n(g, 'slat'), (W, D, 0.03), (0, 0, z), m, g, bevel=0.005, segments=1)
        for sx in (-1, 1):
            for z in (0.12, 0.27, 0.42):
                box(_n(g, 'slat'), (0.02, D, 0.1), (sx * (W / 2 - 0.01), 0, z), m, g, bevel=0.004, segments=1)
        box(_n(g, 'back'), (W, 0.02, H), (0, D / 2 - 0.01, H / 2), m, g, bevel=0.004, segments=1)
        books_row(g, -0.18, 0.1, -0.12, 0.035, 0.24, seed, 0.14, 0.2)
    else:
        box(_n(g, 'body'), (W, D, H - 0.1), (0, 0, 0.1 + (H - 0.1) / 2), m, g, bevel=0.015)
        leg4(g, W, D, 0.1, 0.015, 'wood_mid' if style == 'white' else m, inset=0.04)
        box(_n(g, 'drawer'), (W - 0.05, 0.02, 0.16), (0, -D / 2 - 0.005, H - 0.12), m, g, bevel=0.008)
        knob(g, (0, -D / 2 - 0.02, H - 0.12), 'metal')
        box(_n(g, 'shelfgap'), (W - 0.05, 0.02, 0.18), (0, -D / 2 + 0.005, 0.25), 'wood_dark', g, bevel=0.006)
    if lamp:
        table_lamp(g, (0.08, 0.06, H))
    if clutter:
        box(_n(g, 'book'), (0.14, 0.2, 0.03), (-0.1, -0.03, H + 0.015), 'poster_b', g, 8, bevel=0.004, segments=1)
        cyl(_n(g, 'glass'), 0.03, 0.09, (-0.12, -0.1, H + 0.045 + 0.0), 'window_glass', g, verts=12, bevel=0)
    return g


def table_lamp(g, loc, h=0.34, shade_mat='lampshade', base_mat='terracotta'):
    """Small table lamp built INTO group g at local loc (bottom centre): ceramic base + fabric shade."""
    x, y, z = loc
    lathe(_n(g, 'lampbase'), [(0.05, 0), (0.07, 0.03), (0.075, 0.1), (0.05, 0.16), (0.015, 0.18), (0.012, 0.2)],
          (x, y, z), base_mat, g, verts=14)
    cyl(_n(g, 'lampstem'), 0.008, h - 0.2, (x, y, z + 0.2 + (h - 0.2) / 2), 'metal', g, verts=8, bevel=0)
    lathe(_n(g, 'lampshade'), [(0.13, 0), (0.09, 0.16), (0.085, 0.16), (0.125, 0.0)],
          (x, y, z + h - 0.1), shade_mat, g, verts=18, cap_bottom=False)


# ----------------------------------------------------------------------------------------------------------------
# desks, chairs, computers
# ----------------------------------------------------------------------------------------------------------------

DESK_H = 0.75


def desk(style='cheap', w=None, d=None, name='desk', location=(0, 0, 0), rotation=0, mat=None, interact=None,
         height=DESK_H, obstacle=True, seed=1, parent='root'):
    """Desk with its top at 0.75 m (height=). Front (the sitter's side) = local -Y.
    style: old (worn wooden, drawer pedestal) | cheap (white top, thin metal legs) | nook (small, hairpin legs) |
    standing (T-frame, motor column) | executive (dark wood, double pedestal, leather pad) | l_shaped (return on
    the local +X side toward -Y) | folding (white plastic folding table)."""
    dims = {'old': (1.2, 0.6), 'cheap': (1.1, 0.55), 'nook': (0.95, 0.5), 'standing': (1.4, 0.7),
            'executive': (1.8, 0.85), 'l_shaped': (1.6, 0.65), 'folding': (1.2, 0.6)}[style]
    W, D = w or dims[0], d or dims[1]
    H = height
    g = _g(name, location, rotation, obstacle, interact, parent=parent)
    tt = 0.035
    if style == 'old':
        m = mat or 'wood_mid'
        box(_n(g, 'top'), (W, D, tt), (0, 0, H - tt / 2), m, g, bevel=0.012)
        pw = 0.4
        px = W / 2 - pw / 2 - 0.02
        box(_n(g, 'ped'), (pw, D - 0.06, H - tt - 0.05), (px, 0.01, (H - tt - 0.05) / 2 + 0.05), m, g, bevel=0.01)
        for i in range(3):
            z = 0.14 + i * 0.2
            box(_n(g, 'drawer'), (pw - 0.04, 0.02, 0.17), (px, -D / 2 + 0.02, z + 0.02), 'wood_light', g, bevel=0.008)
            bar_handle(g, (px, -D / 2 + 0.01, z + 0.05), 0.08, mat='metal_dark', r=0.006, standoff=0.018)
        for sy in (-1, 1):
            box(_n(g, 'leg'), (0.05, 0.05, H - tt), (-W / 2 + 0.05, sy * (D / 2 - 0.05), (H - tt) / 2), m, g,
                bevel=0.008)
        box(_n(g, 'back'), (W - 0.1, 0.02, 0.35), (0, D / 2 - 0.04, H - tt - 0.2), m, g, bevel=0.006)
        box(_n(g, 'apron'), (W - pw - 0.12, 0.02, 0.08), (-pw / 2 + 0.0, -D / 2 + 0.03, H - tt - 0.05), m, g,
            bevel=0.006)
        box(_n(g, 'foot'), (pw, D - 0.06, 0.05), (px, 0.01, 0.025), 'wood_dark', g, bevel=0.008)
    elif style == 'cheap':
        m = mat or 'plastic_white'
        box(_n(g, 'top'), (W, D, 0.028), (0, 0, H - 0.014), m, g, bevel=0.008)
        leg4(g, W, D, H - 0.028, 0.018, 'plastic_white', inset=0.04, square=True)
        box(_n(g, 'shelf'), (W - 0.1, D - 0.1, 0.02), (0, 0.0, 0.14), m, g, bevel=0.005, segments=1)
        box(_n(g, 'rail'), (W - 0.08, 0.02, 0.05), (0, D / 2 - 0.04, H - 0.06), 'plastic_white', g, bevel=0.004)
    elif style == 'nook':
        m = mat or 'wood_light'
        box(_n(g, 'top'), (W, D, 0.03), (0, 0, H - 0.015), m, g, bevel=0.01)
        box(_n(g, 'drawer'), (0.5, D - 0.06, 0.08), (0, 0.01, H - 0.07), m, g, bevel=0.008)
        box(_n(g, 'drawerf'), (0.46, 0.01, 0.05), (0, -D / 2 + 0.03, H - 0.07), 'wood_mid', g, bevel=0.004)
        for sx in (-1, 1):
            for sy in (-1, 1):
                x, y = sx * (W / 2 - 0.06), sy * (D / 2 - 0.06)
                tube(_n(g, 'hairpin'), [(x, y, H - 0.03), (x + sx * 0.03, y + 0.02 * sy, 0.0),
                                        (x - sx * 0.02, y + 0.02 * sy, 0.0), (x - sx * 0.06, y, H - 0.03)],
                     0.006, 'metal_dark', g, res=6)
    elif style == 'standing':
        m = mat or 'wood_light'
        box(_n(g, 'top'), (W, D, 0.03), (0, 0, H - 0.015), m, g, bevel=0.01)
        box(_n(g, 'beam'), (W - 0.3, 0.06, 0.05), (0, 0.05, H - 0.06), 'metal_dark', g, bevel=0.006)
        for sx in (-1, 1):
            x = sx * (W / 2 - 0.2)
            box(_n(g, 'col'), (0.07, 0.07, H - 0.06), (x, 0.05, (H - 0.06) / 2), 'metal_dark', g, bevel=0.008)
            box(_n(g, 'colin'), (0.06, 0.06, 0.3), (x, 0.05, H - 0.3), 'plastic_black', g, bevel=0.006)
            box(_n(g, 'foot'), (0.07, D - 0.04, 0.035), (x, 0.0, 0.0175), 'metal_dark', g, bevel=0.01)
        box(_n(g, 'ctrl'), (0.1, 0.03, 0.02), (W / 2 - 0.12, -D / 2 - 0.005, H - 0.04), 'plastic_black', g,
            bevel=0.004)
    elif style == 'executive':
        m = mat or 'wood_dark'
        box(_n(g, 'top'), (W, D, 0.05), (0, 0, H - 0.025), m, g, bevel=0.015)
        pw = 0.45
        for sx in (-1, 1):
            px = sx * (W / 2 - pw / 2 - 0.03)
            box(_n(g, 'ped'), (pw, D - 0.08, H - 0.05), (px, 0.0, (H - 0.05) / 2), m, g, bevel=0.012)
            for i in range(3):
                z = 0.12 + i * 0.2
                box(_n(g, 'drawer'), (pw - 0.05, 0.02, 0.17), (px, -D / 2 + 0.035, z + 0.03), m, g, bevel=0.01)
                bar_handle(g, (px, -D / 2 + 0.025, z + 0.07), 0.1, mat='metal', r=0.006, standoff=0.018)
        box(_n(g, 'modesty'), (W - 2 * pw - 0.06, 0.03, 0.5), (0, D / 2 - 0.08, H - 0.3), m, g, bevel=0.01)
        box(_n(g, 'pad'), (0.7, 0.4, 0.006), (0, -0.08, H + 0.003), 'plastic_black', g, bevel=0.003, segments=1)
        box(_n(g, 'plinth'), (W - 0.04, D - 0.1, 0.04), (0, 0.0, 0.02), 'wood_dark', g, bevel=0.005)
    elif style == 'l_shaped':
        m = mat or 'plastic_white'
        R = 0.6   # return depth along -Y
        pts = [(-W / 2, -D / 2), (W / 2 - R, -D / 2), (W / 2 - R, -D / 2 - 0.85), (W / 2, -D / 2 - 0.85),
               (W / 2, D / 2), (-W / 2, D / 2)]
        prism(_n(g, 'top'), pts, 0.03, (0, 0, H - 0.03), m, g, bevel=0.008)
        for x, y in ((-W / 2 + 0.05, -D / 2 + 0.05), (-W / 2 + 0.05, D / 2 - 0.05), (W / 2 - 0.05, D / 2 - 0.05),
                     (W / 2 - 0.05, -D / 2 - 0.8), (W / 2 - R + 0.05, -D / 2 - 0.8)):
            box(_n(g, 'leg'), (0.045, 0.045, H - 0.03), (x, y, (H - 0.03) / 2), 'metal_dark', g, bevel=0.006)
        box(_n(g, 'cpu'), (0.2, 0.42, 0.44), (W / 2 - 0.3, D / 2 - 0.3, 0.23), 'plastic_black', g, bevel=0.012)
        box(_n(g, 'cpul'), (0.005, 0.3, 0.02), (W / 2 - 0.4 - 0.003, D / 2 - 0.3, 0.38), 'neon_cyan', g, bevel=0)
    elif style == 'folding':
        m = mat or 'plastic_white'
        box(_n(g, 'top'), (W, D, 0.04), (0, 0, H - 0.02), m, g, bevel=0.015, segments=3)
        box(_n(g, 'apron'), (W - 0.04, D - 0.04, 0.03), (0, 0, H - 0.055), 'plastic_grey', g, bevel=0.006)
        for sx in (-1, 1):
            x = sx * (W / 2 - 0.12)
            tube(_n(g, 'leg'), [(x, -D / 2 + 0.06, 0.0), (x, -D / 2 + 0.06, H - 0.06), (x, D / 2 - 0.06, H - 0.06),
                                (x, D / 2 - 0.06, 0.0)], 0.013, 'metal', g, res=8)
            tube(_n(g, 'brace'), [(x, -D / 2 + 0.06, 0.25), (x, D / 2 - 0.06, 0.25)], 0.008, 'metal', g, res=6)
    else:
        raise ValueError(style)
    return g


def office_chair(style='basic', name='chair', location=(0, 0, 0), rotation=0, mat=None, accent=None, arms=True,
                 obstacle=True, parent='root'):
    """Chair whose sitter faces local -Y; seat top 0.46 m. style: basic (mesh office chair) | gaming (racing
    bucket with accent stripes) | executive (tall tufted leather) | stool (round drafting stool, no back) |
    wood (dining chair) | folding (metal folding chair). mat = upholstery, accent = stripe colour (gaming)."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    S = 0.46
    if style in ('basic', 'gaming', 'executive'):
        up = mat or {'basic': 'fabric_grey', 'gaming': 'plastic_black', 'executive': 'plastic_black'}[style]
        base_m = 'metal' if style == 'executive' else 'plastic_black'
        for i in range(5):   # star base + casters
            a = TAU * i / 5 + math.pi / 2
            ex, ey = math.cos(a) * 0.3, math.sin(a) * 0.3
            tube(_n(g, 'star'), [(0, 0, 0.1), (ex * 0.95, ey * 0.95, 0.075)], 0.02, base_m, g, res=6)
            sphere(_n(g, 'caster'), 0.028, (ex, ey, 0.03), 'plastic_black', g, segs=8, rings=5)
        cyl(_n(g, 'hub'), 0.045, 0.06, (0, 0, 0.1), base_m, g, verts=12)
        cyl(_n(g, 'gas'), 0.025, S - 0.2, (0, 0, 0.1 + (S - 0.2) / 2), 'metal', g, verts=10, bevel=0)
        box(_n(g, 'mech'), (0.2, 0.2, 0.04), (0, 0.0, S - 0.1), 'plastic_black', g, bevel=0.01)
        seat_th = 0.09
        if style == 'gaming':
            blob(_n(g, 'seat'), (0.5, 0.5, seat_th), (0, 0, S - seat_th / 2), up, g, round_xy=0.35, round_z=0.6)
            for sx in (-1, 1):
                blob(_n(g, 'bolster'), (0.09, 0.46, 0.06), (sx * 0.22, 0, S + 0.01), up, g, (0, sx * 12, 0),
                     round_xy=0.5, round_z=0.6, segs=12, rings=6)
            back = blob(_n(g, 'back'), (0.52, 0.12, 0.8), (0, 0.27, S + 0.45), up, g, (-8, 0, 0),
                        round_xy=0.3, round_z=0.3)
            ac = accent or 'mcd_red'
            for sx in (-1, 1):
                box(_n(g, 'stripe'), (0.07, 0.02, 0.62), (sx * 0.15, 0.2, S + 0.42), ac, g, (-8, 0, 0),
                    bevel=0.008)
                blob(_n(g, 'wing'), (0.08, 0.13, 0.5), (sx * 0.25, 0.25, S + 0.32), up, g, (-8, 0, sx * 12),
                     round_xy=0.5, round_z=0.4, segs=12, rings=6)
            blob(_n(g, 'headrest'), (0.26, 0.08, 0.13), (0, 0.2, S + 0.72), ac, g, (-8, 0, 0),
                 round_xy=0.5, round_z=0.6, segs=12, rings=6)
        elif style == 'executive':
            blob(_n(g, 'seat'), (0.54, 0.52, 0.11), (0, 0, S - 0.055), up, g, round_xy=0.4, round_z=0.7)
            blob(_n(g, 'back'), (0.52, 0.13, 0.78), (0, 0.28, S + 0.44), up, g, (-9, 0, 0),
                 round_xy=0.35, round_z=0.45)
            for i in range(3):
                blob(_n(g, 'tuft'), (0.44, 0.06, 0.2), (0, 0.22 - i * 0.0, S + 0.2 + i * 0.22), up, g, (-9, 0, 0),
                     round_xy=0.5, round_z=0.6, segs=12, rings=6)
            blob(_n(g, 'head'), (0.44, 0.1, 0.18), (0, 0.29, S + 0.84), up, g, (-9, 0, 0),
                 round_xy=0.45, round_z=0.6, segs=14, rings=6)
        else:
            blob(_n(g, 'seat'), (0.48, 0.46, seat_th), (0, 0, S - seat_th / 2), up, g, round_xy=0.35, round_z=0.6)
            tube(_n(g, 'spine'), [(0, 0.12, S - 0.08), (0, 0.26, S - 0.05), (0, 0.27, S + 0.2)], 0.02,
                 'plastic_black', g, res=6)
            blob(_n(g, 'back'), (0.44, 0.07, 0.46), (0, 0.27, S + 0.33), up, g, (-6, 0, 0), round_xy=0.35,
                 round_z=0.45)
        if arms:
            for sx in (-1, 1):
                x = sx * (0.28 if style != 'executive' else 0.3)
                tube(_n(g, 'armpost'), [(x * 0.8, 0.02, S - 0.07), (x, 0.02, S - 0.02), (x, 0.03, S + 0.2)], 0.014,
                     'plastic_black' if style != 'executive' else 'metal', g, res=6)
                box(_n(g, 'armpad'), (0.07, 0.26, 0.035), (x, 0.0, S + 0.21), 'plastic_black', g, bevel=0.012,
                    segments=2)
    elif style == 'stool':
        up = mat or 'fabric_teal'
        blob(_n(g, 'seat'), (0.38, 0.38, 0.08), (0, 0, S - 0.04), up, g, round_xy=1.0, round_z=0.5, segs=20)
        cyl(_n(g, 'gas'), 0.022, S - 0.12, (0, 0, (S - 0.12) / 2 + 0.06), 'metal', g, verts=10, bevel=0)
        torus(_n(g, 'ring'), 0.2, 0.01, (0, 0, 0.22), 'metal', g, major=20, minor=6)
        for i in range(5):
            a = TAU * i / 5
            tube(_n(g, 'star'), [(0, 0, 0.07), (math.cos(a) * 0.26, math.sin(a) * 0.26, 0.05)], 0.016,
                 'plastic_black', g, res=6)
            sphere(_n(g, 'caster'), 0.024, (math.cos(a) * 0.27, math.sin(a) * 0.27, 0.025), 'plastic_black', g,
                   segs=8, rings=5)
        for i in range(3):
            a = TAU * i / 3 + 0.5
            tube(_n(g, 'ringarm'), [(0, 0, 0.22), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.22)], 0.007, 'metal', g,
                 res=5)
    elif style == 'wood':
        m = mat or 'wood_light'
        box(_n(g, 'seat'), (0.44, 0.42, 0.035), (0, 0, S - 0.0175), m, g, bevel=0.012)
        leg4(g, 0.42, 0.4, S - 0.035, 0.018, m, inset=0.03, splay=3)
        for sx in (-1, 1):
            box(_n(g, 'post'), (0.035, 0.035, 0.45), (sx * 0.18, 0.18, S + 0.22), m, g, (-6, 0, 0), bevel=0.008)
        for z in (0.2, 0.36):
            box(_n(g, 'slat'), (0.38, 0.025, 0.07), (0, 0.19 + z * 0.1, S + z), m, g, (-6, 0, 0), bevel=0.01)
        if mat is None:
            blob(_n(g, 'cushion'), (0.38, 0.36, 0.04), (0, -0.01, S + 0.015), 'fabric_mustard', g,
                 round_xy=0.35, round_z=0.6, segs=14, rings=6)
    elif style == 'folding':
        m = mat or 'metal_dark'
        box(_n(g, 'seat'), (0.42, 0.4, 0.03), (0, 0, S - 0.015), m, g, bevel=0.01)
        for sx in (-1, 1):
            x = sx * 0.2
            tube(_n(g, 'legf'), [(x, -0.2, 0.0), (x, 0.16, S - 0.02), (x, 0.2, S + 0.42)], 0.012, 'metal', g,
                 res=6)
            tube(_n(g, 'legb'), [(x, 0.22, 0.0), (x, 0.0, S - 0.03)], 0.012, 'metal', g, res=6)
        box(_n(g, 'back'), (0.4, 0.02, 0.16), (0, 0.19, S + 0.32), m, g, (-8, 0, 0), bevel=0.008)
    else:
        raise ValueError(style)
    return g


def bar_stool(name='stool', location=(0, 0, 0), rotation=0, mat='fabric_coral', frame='metal_dark', height=0.75,
              back=False, obstacle=True, parent='root'):
    """Counter / bar stool: seat at `height` (0.65 counter, 0.75 bar), four splayed legs and a foot ring."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    H = height
    blob(_n(g, 'seat'), (0.38, 0.38, 0.07), (0, 0, H - 0.035), mat, g, round_xy=1.0, round_z=0.5, segs=20)
    cyl(_n(g, 'seatbase'), 0.16, 0.025, (0, 0, H - 0.08), frame, g, verts=16)
    for i in range(4):
        a = TAU * i / 4 + math.pi / 4
        tube(_n(g, 'leg'), [(math.cos(a) * 0.12, math.sin(a) * 0.12, H - 0.08),
                            (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.0)], 0.013, frame, g, res=6)
    torus(_n(g, 'ring'), 0.175, 0.009, (0, 0, H * 0.35), frame, g, major=20, minor=6)
    if back:
        tube(_n(g, 'back'), [(-0.15, 0.13, H - 0.05), (-0.15, 0.16, H + 0.25), (0.15, 0.16, H + 0.25),
                             (0.15, 0.13, H - 0.05)], 0.012, frame, g, res=6)
    return g


def monitor(size='normal', name='monitor', location=(0, 0, 0), rotation=0, mat='plastic_black', parent='root',
            obstacle=False, arm=False):
    """Monitor on a stand (screen faces local -Y, m_screen with 0..1 UVs). size normal (0.6 m) | small (0.45) |
    ultrawide (0.86). location = bottom centre (desk top). arm=True clamps to the desk back instead of a foot."""
    sw, sh = {'normal': (0.6, 0.36), 'small': (0.46, 0.29), 'ultrawide': (0.86, 0.37)}[size]
    g = _g(name, location, rotation, obstacle, parent=parent)
    zc = 0.13 + sh / 2
    if arm:
        box(_n(g, 'clamp'), (0.06, 0.08, 0.05), (0, 0.2, 0.025), mat, g, bevel=0.008)
        tube(_n(g, 'arm'), [(0, 0.2, 0.05), (0, 0.2, 0.25), (0, 0.06, zc)], 0.014, 'metal_dark', g, res=8)
    else:
        box(_n(g, 'foot'), (0.22 if size != 'ultrawide' else 0.3, 0.16, 0.014), (0, 0.03, 0.007), mat, g,
            bevel=0.006)
        box(_n(g, 'neck'), (0.05, 0.025, zc), (0, 0.06, zc / 2), mat, g, (-6, 0, 0), bevel=0.008)
    box(_n(g, 'body'), (sw, 0.03, sh), (0, 0.025, zc), mat, g, bevel=0.01)
    box(_n(g, 'hump'), (sw * 0.5, 0.03, sh * 0.5), (0, 0.045, zc), mat, g, bevel=0.012)
    panel(_n(g, 'screen'), (sw - 0.022, sh - 0.022), (0, 0.009, zc + 0.003), 'screen', g)
    box(_n(g, 'led'), (0.006, 0.004, 0.006), (sw / 2 - 0.03, 0.009, zc - sh / 2 + 0.006), 'neon_green', g, bevel=0)
    return g


def keyboard(name='keyboard', location=(0, 0, 0), rotation=0, mat='plastic_white', keys='plastic_grey',
             parent='root', rgb=False):
    """Low-profile keyboard (0.36 x 0.12) with a key-block grid; rgb=True adds a neon under-glow edge."""
    g = _g(name, location, rotation, False, parent=parent)
    box(_n(g, 'base'), (0.36, 0.12, 0.018), (0, 0, 0.009), mat, g, (3, 0, 0), bevel=0.005)
    for r in range(4):
        box(_n(g, 'keys'), (0.3 if r < 3 else 0.16, 0.02, 0.008), (-0.02 if r < 3 else -0.01, -0.035 + r * 0.024,
                                                                    0.021 + r * 0.0012), keys, g, (3, 0, 0),
            bevel=0.003, segments=1)
    box(_n(g, 'numpad'), (0.05, 0.09, 0.008), (0.15, 0.0, 0.022), keys, g, (3, 0, 0), bevel=0.003, segments=1)
    if rgb:
        box(_n(g, 'glow'), (0.36, 0.124, 0.004), (0, 0, 0.002), 'neon_purple', g, bevel=0)
    return g


def mouse(name='mouse', location=(0, 0, 0), rotation=0, mat='plastic_white', pad='fabric_navy', parent='root'):
    """Mouse on a mouse pad (pad=None for no pad)."""
    g = _g(name, location, rotation, False, parent=parent)
    if pad:
        box(_n(g, 'pad'), (0.24, 0.2, 0.004), (0, 0, 0.002), pad, g, bevel=0.002, segments=1)
    blob(_n(g, 'mouse'), (0.06, 0.1, 0.035), (0.01, 0, 0.004 + 0.0175), mat, g, round_xy=0.8, round_z=0.6, segs=14,
         rings=8, deform=lambda x, y, z: (x, y, z * (1.0 if y > 0 else 0.9) - (0.004 if z < 0 else 0)))
    return g


def laptop(style='pro', name='laptop', location=(0, 0, 0), rotation=0, open_deg=105, parent='root', obstacle=False,
           sticker=True):
    """Open laptop, screen facing local -Y toward the user. style: old (chunky black plastic brick) | pro (thin
    aluminium). location = bottom centre on the desk."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    if style == 'old':
        W, D, T, body, keys = 0.38, 0.27, 0.04, 'plastic_black', 'plastic_grey'
    else:
        W, D, T, body, keys = 0.32, 0.22, 0.014, 'metal', 'plastic_black'
    box(_n(g, 'base'), (W, D, T), (0, 0, T / 2), body, g, bevel=0.006 if style == 'pro' else 0.01)
    box(_n(g, 'keys'), (W - 0.05, D * 0.42, 0.004), (0, 0.025, T + 0.001), keys, g, bevel=0.002, segments=1)
    box(_n(g, 'pad'), (W * 0.3, D * 0.22, 0.002), (0, -D * 0.3, T + 0.0005), keys, g, bevel=0.001, segments=1)
    a = math.radians(open_deg)
    lid_h = D * (0.95 if style == 'pro' else 0.92)
    lt = 0.007 if style == 'pro' else 0.022
    hy, hz = D / 2 - 0.005, T
    # lid: rotate about the hinge (local X axis at the back edge)
    cy = hy + math.cos(a) * lid_h / 2 * 1.0
    cz = hz + math.sin(a) * lid_h / 2
    tilt = open_deg - 90
    box(_n(g, 'lid'), (W, lt, lid_h), (0, cy + lt / 2 * math.sin(a), cz - lt / 2 * math.cos(a) * -1), body, g,
        (-tilt, 0, 0), bevel=0.005 if style == 'pro' else 0.01)
    inset = 0.018 if style == 'pro' else 0.035
    sy = cy - (lt / 2) * math.sin(a) + 0.0
    panel(_n(g, 'screen'), (W - inset, lid_h - inset * 1.2), (0, sy - 0.002, cz + 0.004), 'screen', g, (-tilt, 0, 0))
    if style == 'old':
        box(_n(g, 'vent'), (0.08, 0.01, 0.012), (W / 2 - 0.08, -D / 2, T / 2), 'metal_dark', g, bevel=0.002)
    if sticker and style == 'pro':
        sphere(_n(g, 'sticker'), 0.02, (0.05, cy + lt * 0.9, cz + 0.03), 'fabric_coral', g, (-tilt, 0, 0),
               scale=(1, 0.08, 1), segs=10, rings=5)
    return g


def desk_lamp(name='desk_lamp', location=(0, 0, 0), rotation=0, mat='fabric_mustard', parent='root', style='arm'):
    """Desk lamp: style arm (balanced-arm, coloured head, m_lampshade bulb) | dome (small mushroom lamp).
    Head points toward local -Y."""
    g = _g(name, location, rotation, False, parent=parent)
    if style == 'dome':
        lathe(_n(g, 'base'), [(0.06, 0), (0.07, 0.015), (0.02, 0.03), (0.015, 0.22)], (0, 0, 0), mat, g, verts=14)
        lathe(_n(g, 'shade'), [(0.13, 0.19), (0.12, 0.23), (0.07, 0.28), (0.0, 0.3)], (0, 0, 0), mat, g, verts=18,
              cap_bottom=False)
        cyl(_n(g, 'bulb'), 0.1, 0.01, (0, 0, 0.19), 'lampshade', g, verts=16, bevel=0)
        return g
    cyl(_n(g, 'base'), 0.075, 0.025, (0, 0, 0.0125), mat, g, verts=16, bevel=0.008)
    p0, p1, p2 = (0, 0.02, 0.025), (0, 0.1, 0.33), (0, -0.12, 0.45)
    tube(_n(g, 'arm1'), [p0, p1], 0.009, 'metal', g, res=6)
    tube(_n(g, 'arm2'), [p1, p2], 0.009, 'metal', g, res=6)
    sphere(_n(g, 'joint'), 0.016, p1, mat, g, segs=8, rings=5)
    lathe(_n(g, 'head'), [(0.07, -0.08), (0.055, -0.03), (0.03, 0.0), (0.0, 0.01)], (p2[0], p2[1] - 0.02, p2[2]),
          mat, g, (25, 0, 0), verts=16, cap_bottom=False)
    sphere(_n(g, 'bulb'), 0.028, (p2[0], p2[1] - 0.045, p2[2] - 0.055), 'lampshade', g, segs=10, rings=6)
    return g


def _desk_clutter(g, W, D, H, rng, amount=1.0, keep_left=False, lamp=False, laptop_right=False):
    """Mug, papers, notebook, pens, small plant on a desk top (local). keep_left=True leaves the left 0.45 m free
    (the a_gear_desk zone); lamp/laptop_right say what already sits on the right."""
    mugc = ['plastic_white', 'fabric_coral', 'fabric_teal', 'mcd_yellow'][rng.randrange(4)]
    r_mug, r_paper, r_note, r_pot, r_plant = (rng.random() for _ in range(5))
    if keep_left:
        if r_mug < 0.9 * amount and not laptop_right:
            mug(g, (W / 2 - 0.12, -D / 2 + 0.14, H), mugc)
        if r_paper < 0.8 * amount and not laptop_right:
            box(_n(g, 'paper'), (0.21, 0.297, 0.002), (W / 2 - 0.2, 0.0, H + 0.001), 'paper', g, rng.uniform(-20, 20),
                bevel=0, segments=1)
        if r_pot < 0.6 * amount:
            px = W / 2 - (0.26 if lamp else 0.1)
            lathe(_n(g, 'penpot'), [(0.035, 0), (0.035, 0.1), (0.032, 0.1), (0.032, 0.005)], (px, D / 2 - 0.1, H),
                  'terracotta', g, verts=12)
            for i, mcol in enumerate(('mcd_red', 'fabric_blue', 'plastic_black')):
                tube(_n(g, 'pen'), [(px + (i - 1) * 0.012, D / 2 - 0.1, H + 0.02),
                                    (px + (i - 1) * 0.02, D / 2 - 0.1 + 0.01 * i, H + 0.15)], 0.004, mcol, g, res=5)
        return
    if r_mug < 0.9 * amount:
        mug(g, (-W / 2 + 0.14, -D / 2 + 0.15 + rng.uniform(0, 0.1), H), mugc)
    if r_paper < 0.8 * amount:
        for i in range(rng.randint(1, 3)):
            box(_n(g, 'paper'), (0.21, 0.297, 0.002), (W / 2 - 0.2 + rng.uniform(-0.03, 0.03), -0.02 + rng.uniform(
                -0.05, 0.05), H + 0.001 + i * 0.002), 'paper', g, rng.uniform(-20, 20), bevel=0, segments=1)
    if r_note < 0.6 * amount:
        box(_n(g, 'notebook'), (0.15, 0.21, 0.015), (-W / 2 + 0.3, D / 2 - 0.2, H + 0.0075),
            ['poster_a', 'poster_b', 'fabric_teal'][rng.randrange(3)], g, rng.uniform(-15, 15), bevel=0.003)
    if r_pot < 0.5 * amount:
        lathe(_n(g, 'penpot'), [(0.035, 0), (0.035, 0.1), (0.032, 0.1), (0.032, 0.005)],
              (-W / 2 + 0.08, D / 2 - 0.1, H), 'terracotta', g, verts=12)
        for i, mcol in enumerate(('mcd_red', 'fabric_blue', 'plastic_black')):
            tube(_n(g, 'pen'), [(-W / 2 + 0.08 + (i - 1) * 0.012, D / 2 - 0.1, H + 0.02),
                                (-W / 2 + 0.08 + (i - 1) * 0.02, D / 2 - 0.1 + 0.01 * i, H + 0.15)], 0.004,
                 mcol, g, res=5)
    if r_plant < 0.35 * amount and not lamp:
        small_plant(parent=g, location=(W / 2 - 0.1, D / 2 - 0.1, H), style='succulent', obstacle=False)


def workstation(style='cheap', name='computer', location=(0, 0, 0), rotation=0, monitors=1, monitor_size='normal',
                laptop_style=None, chair='basic', chair_mat=None, desk_w=None, desk_d=None, lamp=False,
                clutter=1.0, interact='computer', anchors=None, gear_anchor=None, seed=1, obstacle=True,
                rgb=False):
    """A complete computer desk group: desk + chair (pulled out, facing the desk) + monitors and/or laptop +
    keyboard + mouse + clutter. Desk front (the sitter's side) = local -Y.
    anchors: None, or a prefix like 'computer' -> creates a_<prefix>_sit (floor point under the seated pelvis,
    facing the desk) and a_<prefix>_stand (behind the chair, facing the desk). gear_anchor='a_gear_desk' reserves
    the LEFT 0.45 m of the desk top for gear props (nothing else is put there), shifts the computer block right and
    creates that anchor there (extras w=0.4, d=0.3, facing the sitter like the desk).
    Note for Dropship: the player's computer gear (laptop_old / laptop_pro / workstation) appears on a_gear_desk at
    runtime, so a desk that should only show the gear can pass monitors=0 and laptop_style=None."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle, interact)
    desk(style, desk_w, desk_d, name + '_desk', parent=g, obstacle=False)
    dims = {'old': (1.2, 0.6), 'cheap': (1.1, 0.55), 'nook': (0.95, 0.5), 'standing': (1.4, 0.7),
            'executive': (1.8, 0.85), 'l_shaped': (1.6, 0.65), 'folding': (1.2, 0.6)}[style]
    W, D = desk_w or dims[0], desk_d or dims[1]
    H = DESK_H + (0.015 if style == 'executive' else 0.0)
    cy = -D / 2 - 0.3
    sh = 0.14 if gear_anchor else 0.0          # computer block shift to the right when the left is reserved
    office_chair(chair, name + '_chair', (rng.uniform(-0.04, 0.04) + sh * 0.5, cy, 0), 180 + rng.uniform(-8, 8),
                 chair_mat, parent=g, obstacle=False)
    n = monitors
    laptop_right = False
    if n:
        sw = {'normal': 0.6, 'small': 0.46, 'ultrawide': 0.86}[monitor_size]
        for i in range(n):
            off = (i - (n - 1) / 2) * (sw + 0.03)
            ang = 0 if n == 1 else (i - (n - 1) / 2) * -14
            monitor(monitor_size, name + '_monitor', (sh + off * (0.97 if n > 1 else 1),
                                                      D / 2 - 0.2 - abs(off) * 0.12, H), ang, parent=g)
        keyboard(name + '_keyboard', (sh, -D / 2 + 0.17, H), rng.uniform(-3, 3), parent=g, rgb=rgb,
                 mat='plastic_black' if rgb else 'plastic_white', keys='plastic_grey')
        mouse(name + '_mouse', (sh + 0.3, -D / 2 + 0.16, H), 0, parent=g,
              pad='fabric_navy' if not rgb else 'plastic_black')
    if laptop_style:
        if not n:
            lx, ly, lr = sh, -0.02, 0
        elif gear_anchor:
            lx, ly, lr, laptop_right = W / 2 - 0.22, -0.06, -18, True
        else:
            lx, ly, lr = -W / 2 + 0.25, -0.05, 18
        laptop(laptop_style, name + '_laptop', (lx, ly, H), lr, parent=g)
    if lamp:
        desk_lamp(name + '_lamp', (W / 2 - 0.12, D / 2 - 0.12, H), 210, parent=g,
                  mat=lamp if isinstance(lamp, str) else 'fabric_mustard')
    _desk_clutter(g, W, D, H, rng, clutter, keep_left=bool(gear_anchor), lamp=bool(lamp), laptop_right=laptop_right)
    if anchors:
        B.anchor(f'a_{anchors}_sit', (sh * 0.5, cy + 0.04, 0), 'n', frame=g)
        B.anchor(f'a_{anchors}_stand', (sh * 0.5, cy - 0.55, 0), 'n', frame=g)
    if gear_anchor:
        # gear rule (docs/3D.md section 7, "Baked gear"): a main desk that already shows a computer tags the group
        # with the gear id it stands for, so setGear never adds a duplicate; a bare desk names the laptop the
        # runtime shows until setGear puts a computer there, so the desk is never empty (Hustle has no gear)
        extras = {'w': 0.4, 'd': 0.3}
        if n:
            g['gear'] = 'workstation'
        elif laptop_style:
            g['gear'] = 'laptop_pro' if laptop_style == 'pro' else 'laptop_old'
        else:
            # bare desk: the laptop default (and any computer from setGear) sits `center` m along the anchor's +X,
            # i.e. in the middle of the desk, with small gear (phones, mic) in the gear zone beside it
            extras['default'] = 'laptop_old'
            extras['center'] = round(W / 2 - 0.25, 3)
        B.anchor(gear_anchor, (-W / 2 + 0.25, -0.03, H), 's', frame=g, **extras)
    return g


def staff_desk_set(n, style='cheap', location=(0, 0, 0), rotation=0, chair='basic', chair_mat=None, monitors=1,
                   laptop_style=None, seed=None, desk_w=None, desk_d=None):
    """Hustle staff desk `staffdesk_<n>` (extras {staffdesk:n, obstacle:true}): desk + chair + monitor(s) + small
    personal clutter, and anchor a_staff_<n>_sit at the seated position facing the desk. style as desk()."""
    name = f'staffdesk_{n}'
    rng = _rng(name, seed if seed is not None else n)
    g = workstation(style, name, location, rotation, monitors=monitors, laptop_style=laptop_style, chair=chair,
                    chair_mat=chair_mat or ['fabric_grey', 'fabric_navy', 'fabric_teal', 'fabric_coral',
                                            'fabric_blue'][n % 5],
                    desk_w=desk_w, desk_d=desk_d, clutter=0.9, interact=None, anchors=None, seed=seed or n)
    g['staffdesk'] = n
    B.obstacle(g)
    dims = {'old': (1.2, 0.6), 'cheap': (1.1, 0.55), 'nook': (0.95, 0.5), 'standing': (1.4, 0.7),
            'executive': (1.8, 0.85), 'l_shaped': (1.6, 0.65), 'folding': (1.2, 0.6)}[style]
    D = desk_d or dims[1]
    # personal touch: photo frame or figurine
    W = desk_w or dims[0]
    if rng.random() < 0.6:
        box(_n(g, 'photo'), (0.1, 0.015, 0.13), (-W / 2 + 0.1, D / 2 - 0.08, DESK_H + 0.065), 'wood_dark', g,
            (-10, 0, 20), bevel=0.004)
        panel(_n(g, 'photoimg'), (0.08, 0.1), (-W / 2 + 0.1 - 0.003, D / 2 - 0.088, DESK_H + 0.066),
              ['poster_a', 'poster_b', 'rug_green'][rng.randrange(3)], g, (-10, 0, 20))
    B.anchor(f'a_staff_{n}_sit', (0, -D / 2 - 0.26, 0), 'n', frame=g)
    return g


# ----------------------------------------------------------------------------------------------------------------
# kitchen
# ----------------------------------------------------------------------------------------------------------------


def fridge(style='tall', name='fridge', location=(0, 0, 0), rotation=0, mat=None, interact='fridge', anchors=False,
           magnets=True, seed=1, obstacle=True):
    """Fridge, door on local -Y. style mini (0.5 x 0.5 x 0.85) | tall (0.7 x 0.7 x 1.8, freezer on top) |
    built_in (0.75 x 0.65 x 2.1 flush panel, wood or white) | double (0.9 x 0.72 x 1.85 French doors).
    anchors=True -> a_fridge_stand 0.55 m in front, facing it."""
    rng = _rng(name, seed)
    g = _g(name, location, rotation, obstacle, interact)
    m = mat or ('metal' if style == 'double' else 'plastic_white')
    if style == 'mini':
        W, D, H = 0.5, 0.52, 0.85
        box(_n(g, 'body'), (W, D, H), (0, 0, H / 2), m, g, bevel=0.03, segments=3)
        box(_n(g, 'door'), (W - 0.02, 0.03, H - 0.06), (0, -D / 2 - 0.01, H / 2 + 0.01), m, g, bevel=0.02, segments=3)
        bar_handle(g, (W / 2 - 0.06, -D / 2 - 0.025, H - 0.25), 0.2, True, 'metal', 0.008)
        box(_n(g, 'kick'), (W - 0.04, 0.02, 0.05), (0, -D / 2 + 0.02, 0.03), 'plastic_grey', g, bevel=0.005)
    elif style == 'tall':
        W, D, H = 0.7, 0.68, 1.8
        box(_n(g, 'body'), (W, D, H), (0, 0, H / 2), m, g, bevel=0.035, segments=3)
        box(_n(g, 'freezer'), (W - 0.02, 0.035, 0.52), (0, -D / 2 - 0.012, H - 0.28), m, g, bevel=0.02, segments=3)
        box(_n(g, 'door'), (W - 0.02, 0.035, H - 0.62), (0, -D / 2 - 0.012, (H - 0.62) / 2 + 0.04), m, g,
            bevel=0.02, segments=3)
        bar_handle(g, (-W / 2 + 0.07, -D / 2 - 0.03, H - 0.4), 0.2, True, 'metal', 0.009)
        bar_handle(g, (-W / 2 + 0.07, -D / 2 - 0.03, H - 0.9), 0.36, True, 'metal', 0.009)
        box(_n(g, 'kick'), (W - 0.06, 0.02, 0.04), (0, -D / 2 + 0.02, 0.02), 'plastic_grey', g, bevel=0.004)
    elif style == 'built_in':
        W, D, H = 0.75, 0.65, 2.1
        mm = mat or 'wood_light'
        box(_n(g, 'body'), (W, D, H), (0, 0, H / 2), mm, g, bevel=0.012)
        box(_n(g, 'door'), (W - 0.03, 0.025, 1.25), (0, -D / 2 - 0.01, 0.1 + 0.625), mm, g, bevel=0.01)
        box(_n(g, 'freezer'), (W - 0.03, 0.025, 0.68), (0, -D / 2 - 0.01, 1.4 + 0.34), mm, g, bevel=0.01)
        bar_handle(g, (-W / 2 + 0.07, -D / 2 - 0.022, 0.9), 0.5, True, 'metal', 0.008)
        bar_handle(g, (-W / 2 + 0.07, -D / 2 - 0.022, 1.52), 0.24, True, 'metal', 0.008)
        box(_n(g, 'kick'), (W - 0.04, 0.02, 0.08), (0, -D / 2 + 0.03, 0.04), 'metal_dark', g, bevel=0.004)
        magnets = False
    elif style == 'double':
        W, D, H = 0.9, 0.72, 1.85
        box(_n(g, 'body'), (W, D, H), (0, 0, H / 2), m, g, bevel=0.03, segments=3)
        for sx in (-1, 1):
            box(_n(g, 'door'), (W / 2 - 0.015, 0.035, 1.12), (sx * W / 4, -D / 2 - 0.012, H - 0.6), m, g,
                bevel=0.018, segments=3)
            bar_handle(g, (sx * 0.04, -D / 2 - 0.03, H - 0.62), 0.6, True, 'metal_dark', 0.01, standoff=0.03)
        box(_n(g, 'drawer'), (W - 0.02, 0.035, 0.6), (0, -D / 2 - 0.012, 0.36), m, g, bevel=0.018, segments=3)
        bar_handle(g, (0, -D / 2 - 0.03, 0.6), 0.5, False, 'metal_dark', 0.01, standoff=0.03)
        box(_n(g, 'dispenser'), (0.2, 0.02, 0.3), (-W / 4, -D / 2 - 0.03, H - 0.55), 'plastic_black', g, bevel=0.02)
        magnets = False
    else:
        raise ValueError(style)
    if magnets:
        for i in range(rng.randint(3, 5)):
            mx, mz = rng.uniform(-W / 2 + 0.12, W / 2 - 0.08), rng.uniform(H * 0.4, H * 0.8)
            if rng.random() < 0.5:
                box(_n(g, 'note'), (rng.uniform(0.08, 0.14), 0.004, rng.uniform(0.1, 0.16)), (mx, -D / 2 - 0.033, mz),
                    ['paper', 'mcd_yellow', 'poster_b'][rng.randrange(3)], g, (0, rng.uniform(-10, 10), 0), bevel=0,
                    segments=1)
            else:
                sphere(_n(g, 'magnet'), 0.018, (mx, -D / 2 - 0.035, mz),
                       ['fabric_coral', 'fabric_teal', 'mcd_yellow', 'poster_a'][rng.randrange(4)], g,
                       scale=(1, 0.5, 1), segs=8, rings=5)
    if anchors:
        B.anchor('a_fridge_stand', (0, -D / 2 - 0.55, 0), 'n', frame=g)
    return g


# ----------------------------------------------------------------------------------------------------------------
# windows + doors
# ----------------------------------------------------------------------------------------------------------------


def window(width=1.2, height=1.2, wall_t=0.15, style='standard', name='window', location=(0, 0, 0), rotation=0,
           frame_mat='plastic_white', sill=True, sky=True, curtains=None, outside='sky', parent='root'):
    """Window that fills a wall opening. location = bottom centre of the opening on the wall centre line
    (room.opening_point), rotation = B.against(wall) so the interior side is local -Y.
    style standard (2 sashes + mullion) | basement (small hopper, window-well grass outside) | factory (steel grid)
    | floor (floor-to-ceiling thin frame). m_window_glass pane + m_window_sky plane just outside (sky=False when an
    `outside` skyline should show through instead, e.g. tier5; outside='grass' adds a lawn strip).
    curtains=<fabric material> adds curtains on a rod. Parent it to its wall (room.fill_opening does)."""
    g = _g(name, location, rotation, False, parent=parent)
    W, H, T = width, height, wall_t
    fm = frame_mat if style not in ('factory',) else 'metal_dark'
    ft = {'standard': 0.06, 'basement': 0.05, 'factory': 0.045, 'floor': 0.04}[style]
    fd = T * 0.55
    # frame (inside the hole)
    box(_n(g, 'fl'), (ft, fd, H), (-W / 2 + ft / 2, 0, H / 2), fm, g, bevel=0.006)
    box(_n(g, 'fr'), (ft, fd, H), (W / 2 - ft / 2, 0, H / 2), fm, g, bevel=0.006)
    box(_n(g, 'ft'), (W, fd, ft), (0, 0, H - ft / 2), fm, g, bevel=0.006)
    box(_n(g, 'fb'), (W, fd, ft), (0, 0, ft / 2), fm, g, bevel=0.006)
    box(_n(g, 'glass'), (W - 2 * ft, 0.01, H - 2 * ft), (0, 0.0, H / 2), 'window_glass', g, bevel=0)
    mt = ft * 0.6
    if style == 'standard':
        box(_n(g, 'mull'), (mt, fd * 0.8, H - 2 * ft), (0, 0, H / 2), fm, g, bevel=0.004)
        if H > 1.0:
            box(_n(g, 'rail'), (W - 2 * ft, fd * 0.8, mt), (0, 0, H * 0.62), fm, g, bevel=0.004)
    elif style == 'basement':
        box(_n(g, 'mull'), (mt, fd * 0.8, H - 2 * ft), (0, 0, H / 2), fm, g, bevel=0.004)
    elif style == 'factory':
        nx, nz = max(2, round(W / 0.4)), max(2, round(H / 0.4))
        for i in range(1, nx):
            box(_n(g, 'mull'), (mt, fd * 0.7, H - 2 * ft), (-W / 2 + i * W / nx, 0, H / 2), fm, g, bevel=0.003,
                segments=1)
        for j in range(1, nz):
            box(_n(g, 'rail'), (W - 2 * ft, fd * 0.7, mt), (0, 0, j * H / nz), fm, g, bevel=0.003, segments=1)
    elif style == 'floor':
        nx = max(1, round(W / 1.4))
        for i in range(1, nx):
            box(_n(g, 'mull'), (mt, fd, H - 2 * ft), (-W / 2 + i * W / nx, 0, H / 2), fm, g, bevel=0.003)
    if sill and style != 'floor':
        box(_n(g, 'sill'), (W + 0.12, T / 2 + 0.08, 0.035), (0, -T / 4 - 0.04, -0.0175 + 0.005), fm, g, bevel=0.01)
    if sky:
        # opaque backdrop plane 0.22 m outside the outer wall face; generous below (we look down through it),
        # tight above so it never pokes over the wall top
        below = min(0.55, location[2] + 0.2)
        z0, z1 = -below, H + 0.1
        panel(_n(g, 'sky'), (W + 0.7, z1 - z0), (0, T / 2 + 0.22, (z0 + z1) / 2), 'window_sky', g, (0, 0, 180))
        if style == 'basement' or outside == 'grass':
            box(_n(g, 'grass'), (W + 0.5, 0.18, H * 0.45 + below), (0, T / 2 + 0.12, (H * 0.45 - below) / 2),
                'plant', g, bevel=0.04, segments=2)
    if curtains:
        rod_w = W + 0.5
        tube(_n(g, 'rod'), [(-rod_w / 2, -T / 2 - 0.08, H + 0.12), (rod_w / 2, -T / 2 - 0.08, H + 0.12)], 0.012,
             'metal_dark', g, res=8)
        for sx in (-1, 1):
            sphere(_n(g, 'rodend'), 0.022, (sx * rod_w / 2, -T / 2 - 0.08, H + 0.12), 'metal_dark', g, segs=8,
                   rings=5)
            _curtain(g, (sx * (W / 2 + 0.05), -T / 2 - 0.1, H + 0.1), 0.38, H + 0.1 + (location[2] if location[2]
                                                                                        < 0.6 else 0.25),
                     curtains)
    return g


def _curtain(g, top_center, w, h, mat, folds=5):
    """Pleated curtain panel hanging from top_center (local), width w, height h."""
    x0, y0, z0 = top_center
    n = folds * 4
    verts, faces = [], []
    for j in range(2):
        z = z0 - j * h
        for i in range(n + 1):
            u = i / n
            x = x0 - w / 2 + u * w
            y = y0 + 0.03 * math.sin(u * folds * TAU) * (1.0 if j == 0 else 1.4)
            verts.append((x, y, z))
    for i in range(n):
        faces.append((i, i + 1, n + 1 + i + 1, n + 1 + i))
    o = B.mesh_from_data(_n(g, 'curtain'), verts, faces, mat, g)
    m = o.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = 0.015
    m.offset = 0
    return o


DOOR_STYLES = ('wood', 'hallway', 'metal', 'glass', 'elevator')


def door(width=0.9, height=2.1, wall_t=0.15, style='wood', name='door', location=(0, 0, 0), rotation=0,
         ajar=0.0, mat=None, frame_mat=None, interact='door', anchors=False, stand_dist=0.7, parent='root',
         hinge='left'):
    """Door with casing on both wall faces. location = bottom centre of the opening on the wall centre line,
    rotation = B.against(wall) (interior side = local -Y). style wood (panelled, brass knob) | hallway (flat white
    apartment door, peephole, number plate) | metal (industrial steel, push plate) | glass (aluminium frame, big
    pane, push bar) | elevator (brushed double sliding doors + call button). ajar = opening angle in degrees into
    the room (0 closed). Not an obstacle, not parented to the wall. anchors=True -> a_door_stand (stand_dist
    inside, facing the door) and a_door_exit (in the doorway, facing out)."""
    g = _g(name, location, rotation, False, interact, parent=parent)
    W, H, T = width, height, wall_t
    lm = mat or {'wood': 'wood_mid', 'hallway': 'plastic_white', 'metal': 'metal', 'glass': 'metal',
                 'elevator': 'metal'}[style]
    fm = frame_mat or {'wood': 'plastic_white', 'hallway': 'plastic_white', 'metal': 'metal_dark',
                       'glass': 'metal_dark', 'elevator': 'metal_dark'}[style]
    ct, cw = 0.02, 0.07
    # jambs lining the hole + casings proud of both faces
    for sx in (-1, 1):
        box(_n(g, 'jamb'), (0.03, T + 0.004, H), (sx * (W / 2 - 0.015), 0, H / 2), fm, g, bevel=0.004)
        for sy in (-1, 1):
            box(_n(g, 'casing'), (cw, ct, H + cw), (sx * (W / 2 + cw / 2 - 0.01), sy * (T / 2 + ct / 2),
                                                    (H + cw) / 2), fm, g, bevel=0.006)
    box(_n(g, 'head'), (W, T + 0.004, 0.03), (0, 0, H - 0.015), fm, g, bevel=0.004)
    for sy in (-1, 1):
        box(_n(g, 'headcasing'), (W + 2 * cw - 0.02, ct, cw), (0, sy * (T / 2 + ct / 2), H + cw / 2), fm, g,
            bevel=0.006)
    if style == 'elevator':
        for sx in (-1, 1):
            box(_n(g, 'leaf'), (W / 2 - 0.035, 0.04, H - 0.04), (sx * (W / 4 - 0.008), -0.01, (H - 0.03) / 2), lm, g,
                bevel=0.006)
        box(_n(g, 'panel'), (0.1, 0.02, 0.2), (W / 2 + 0.2, -T / 2 - 0.01, 1.1), 'metal_dark', g, bevel=0.01)
        for z in (1.05, 1.14):
            cyl(_n(g, 'btn'), 0.018, 0.012, (W / 2 + 0.2, -T / 2 - 0.025, z), 'neon_orange', g, (90, 0, 0), verts=12,
                bevel=0.002)
        box(_n(g, 'display'), (0.3, 0.02, 0.08), (0, -T / 2 - 0.02, H + 0.15), 'plastic_black', g, bevel=0.01)
        box(_n(g, 'displayled'), (0.12, 0.005, 0.03), (0, -T / 2 - 0.031, H + 0.15), 'neon_orange', g, bevel=0)
    else:
        lw, lh, lt = W - 0.06, H - 0.03, 0.04
        hx = -W / 2 + 0.03 if hinge == 'left' else W / 2 - 0.03
        sgn = 1 if hinge == 'left' else -1
        leaf = _g(name + '_leaf', (hx, -T / 2 + lt / 2 + 0.01, 0), sgn * -ajar, False, parent=g)
        cx = sgn * lw / 2
        if style == 'glass':
            ft = 0.07
            box(_n(leaf, 'st'), (ft, lt, lh), (sgn * ft / 2, 0, lh / 2), lm, leaf, bevel=0.006)
            box(_n(leaf, 'st'), (ft, lt, lh), (sgn * (lw - ft / 2), 0, lh / 2), lm, leaf, bevel=0.006)
            box(_n(leaf, 'rl'), (lw, lt, ft), (cx, 0, lh - ft / 2), lm, leaf, bevel=0.006)
            box(_n(leaf, 'rl'), (lw, lt, 0.18), (cx, 0, 0.09), lm, leaf, bevel=0.006)
            box(_n(leaf, 'pane'), (lw - 2 * ft, 0.012, lh - ft - 0.18), (cx, 0, 0.18 + (lh - ft - 0.18) / 2),
                'window_glass', leaf, bevel=0)
            tube(_n(leaf, 'bar'), [(sgn * 0.1, -lt / 2, 1.0), (sgn * 0.1, -0.06, 1.0), (sgn * (lw - 0.1), -0.06, 1.0),
                                   (sgn * (lw - 0.1), -lt / 2, 1.0)], 0.014, 'metal', leaf, res=8)
            box(_n(leaf, 'sticker'), (0.25, 0.004, 0.05), (cx, -0.008, 1.35), 'mcd_red', leaf, bevel=0)
        else:
            box(_n(leaf, 'slab'), (lw, lt, lh), (cx, 0, lh / 2), lm, leaf, bevel=0.008)
            if style == 'wood':
                for zc, ph in ((lh * 0.72, lh * 0.36), (lh * 0.27, lh * 0.34)):
                    for sy in (-1, 1):
                        box(_n(leaf, 'raised'), (lw * 0.62, 0.012, ph), (cx, sy * (lt / 2 + 0.004), zc), lm, leaf,
                            bevel=0.008)
                kx = sgn * (lw - 0.08)
                for sy in (-1, 1):
                    sphere(_n(leaf, 'knob'), 0.028, (kx, sy * (lt / 2 + 0.05), 1.0), 'mcd_yellow', leaf,
                           scale=(1, 0.8, 1), segs=12, rings=6)
                    cyl(_n(leaf, 'rose'), 0.03, 0.03, (kx, sy * (lt / 2 + 0.015), 1.0), 'mcd_yellow', leaf, (90, 0, 0),
                        verts=12, bevel=0.004)
            elif style == 'hallway':
                kx = sgn * (lw - 0.08)
                for sy in (-1, 1):
                    tube(_n(leaf, 'lever'), [(kx, sy * lt / 2, 1.0), (kx, sy * (lt / 2 + 0.05), 1.0),
                                             (kx - sgn * 0.12, sy * (lt / 2 + 0.05), 1.0)], 0.009, 'metal', leaf, res=6)
                    cyl(_n(leaf, 'rose'), 0.028, 0.012, (kx, sy * (lt / 2 + 0.006), 1.0), 'metal', leaf, (90, 0, 0),
                        verts=12)
                cyl(_n(leaf, 'peep'), 0.012, 0.01, (cx, -lt / 2 - 0.004, 1.55), 'metal', leaf, (90, 0, 0), verts=10)
                box(_n(leaf, 'plate'), (0.12, 0.006, 0.07), (cx, lt / 2 + 0.004, 1.6), 'mcd_yellow', leaf, bevel=0.003)
                box(_n(leaf, 'kickp'), (lw - 0.04, 0.004, 0.18), (cx, -lt / 2 - 0.002, 0.1), 'metal', leaf, bevel=0.002)
            elif style == 'metal':
                for zc in (0.25, lh * 0.5, lh - 0.25):
                    box(_n(leaf, 'rib'), (lw - 0.08, 0.01, 0.04), (cx, -lt / 2 - 0.004, zc), 'metal_dark', leaf,
                        bevel=0.004)
                box(_n(leaf, 'push'), (0.12, 0.008, 0.3), (sgn * (lw - 0.1), -lt / 2 - 0.004, 1.1), 'metal_dark', leaf,
                    bevel=0.003)
                tube(_n(leaf, 'pull'), [(sgn * (lw - 0.1), lt / 2, 0.9), (sgn * (lw - 0.1), lt / 2 + 0.05, 0.9),
                                        (sgn * (lw - 0.1), lt / 2 + 0.05, 1.3), (sgn * (lw - 0.1), lt / 2, 1.3)],
                     0.012, 'metal_dark', leaf, res=6)
                box(_n(leaf, 'window'), (0.14, 0.012, 0.5), (cx, 0, 1.45), 'window_glass', leaf, bevel=0)
        # hinges
        for z in (0.25, lh - 0.25):
            cyl(_n(g, 'hinge'), 0.009, 0.08, (hx, -T / 2 + 0.012, z), 'metal', g, verts=8, bevel=0.002)
    # threshold + doormat inside
    box(_n(g, 'threshold'), (W, T + 0.03, 0.012), (0, 0, 0.006), 'wood_dark' if style == 'wood' else 'metal', g,
        bevel=0.003, segments=1)
    if anchors:
        B.anchor('a_door_stand', (0, -T / 2 - stand_dist, 0), 'n', frame=g)
        B.anchor('a_door_exit', (0, 0, 0), 'n', frame=g)
    return g


# ----------------------------------------------------------------------------------------------------------------
# plants
# ----------------------------------------------------------------------------------------------------------------


def pot(g, loc, r=0.12, h=0.2, mat='terracotta', style='taper'):
    """Plant pot (local bottom centre) with soil; returns the soil top z. style taper | cylinder | bowl."""
    x, y, z = loc
    if style == 'cylinder':
        prof = [(r * 0.95, 0), (r, 0.01), (r, h), (r * 0.9, h), (r * 0.9, h * 0.85)]
    elif style == 'bowl':
        prof = [(r * 0.6, 0), (r * 0.9, h * 0.3), (r, h), (r * 0.92, h), (r * 0.9, h * 0.85)]
    else:
        prof = [(r * 0.72, 0), (r * 0.8, 0.01), (r, h - 0.03), (r * 1.06, h - 0.03), (r * 1.06, h), (r * 0.94, h),
                (r * 0.92, h * 0.85)]
    lathe(_n(g, 'pot'), prof, (x, y, z), mat, g, verts=16)
    cyl(_n(g, 'soil'), prof[-1][0] * 0.99, 0.01, (x, y, z + h * 0.85), 'wood_dark', g, verts=16, bevel=0)
    return z + h * 0.85


def small_plant(name='plant', location=(0, 0, 0), rotation=0, style='leafy', pot_mat='terracotta', parent='root',
                obstacle=False, seed=1):
    """Tabletop / shelf plant (~0.25 m): style leafy | succulent | cactus | trailing (vines spilling over).
    Nested inside another group (parent=<group>) it is named <group>_plant so it never takes a room-level name."""
    if name == 'plant' and parent not in ('root', None):
        name = parent.name + '_plant'
    g = _g(name, location, rotation, obstacle, parent=parent)
    if style == 'succulent':
        st = pot(g, (0, 0, 0), 0.05, 0.07, pot_mat, 'bowl')
        plant_leaves(g, (0, 0, st), 8, 0.07, 0.03, 30, 'rug_green', seed, spread=0.8)
        plant_leaves(g, (0, 0, st + 0.01), 5, 0.05, 0.025, 60, 'plant', seed + 1, spread=0.6)
    elif style == 'cactus':
        st = pot(g, (0, 0, 0), 0.06, 0.08, pot_mat, 'cylinder')
        blob(_n(g, 'cactus'), (0.07, 0.07, 0.2), (0, 0, st + 0.09), 'plant_dark', g, round_xy=0.9, round_z=0.8,
             segs=10, rings=8)
        blob(_n(g, 'arm'), (0.04, 0.04, 0.09), (0.045, 0, st + 0.12), 'plant_dark', g, (0, 30, 0), round_xy=0.9,
             round_z=0.8, segs=8, rings=6)
        sphere(_n(g, 'flower'), 0.015, (0, 0, st + 0.19), 'rug_rose', g, segs=8, rings=4)
    elif style == 'trailing':
        st = pot(g, (0, 0, 0), 0.08, 0.11, pot_mat, 'cylinder')
        plant_leaves(g, (0, 0, st), 7, 0.1, 0.05, 25, 'plant', seed)
        rng = _rng(g.name, seed)
        for k in range(4):
            a = TAU * k / 4 + 0.4
            pts = [(math.cos(a) * 0.07, math.sin(a) * 0.07, st + 0.01)]
            for i in range(1, 6):
                pts.append((math.cos(a) * (0.09 + 0.01 * i), math.sin(a) * (0.09 + 0.01 * i), st - 0.05 * i))
            tube(_n(g, 'vine'), pts, 0.003, 'plant_dark', g, res=4, caps=False)
            for p in pts[1::1]:
                sphere(_n(g, 'vleaf'), 0.018, p, 'plant' if rng.random() < 0.6 else 'rug_green', g,
                       scale=(1, 0.5, 0.25), segs=6, rings=4)
    else:
        st = pot(g, (0, 0, 0), 0.08, 0.12, pot_mat)
        plant_leaves(g, (0, 0, st), 9, 0.16, 0.07, 45, 'plant', seed)
        plant_leaves(g, (0, 0, st + 0.02), 5, 0.12, 0.06, 70, 'rug_green', seed + 3)
    return g


def potted_plant(style='tall', name='plant', location=(0, 0, 0), rotation=0, pot_mat='terracotta', seed=1,
                 obstacle=True, parent='root'):
    """Floor plant: style small (bushy 0.5 m) | tall (fiddle-leaf 1.6 m) | monstera (split leaves) |
    snake (upright blades) | palm (arching fronds)."""
    g = _g(name, location, rotation, obstacle, parent=parent)
    rng = _rng(g.name, seed)
    if style == 'small':
        st = pot(g, (0, 0, 0), 0.14, 0.24, pot_mat)
        plant_leaves(g, (0, 0, st), 11, 0.28, 0.11, 35, 'plant', seed)
        plant_leaves(g, (0, 0, st + 0.05), 7, 0.22, 0.09, 65, 'plant_dark', seed + 1)
    elif style == 'tall':
        st = pot(g, (0, 0, 0), 0.17, 0.32, pot_mat, 'cylinder')
        top = 1.55
        pts = [(0, 0, st), (0.03, 0.01, st + 0.4), (-0.02, 0.02, st + 0.8), (0.01, 0, top - 0.2)]
        tube(_n(g, 'trunk'), pts, 0.018, 'wood_mid', g, res=6)
        for i in range(22):
            t = i / 21
            z = st + 0.35 + t * (top - st - 0.35)
            a = i * 2.4
            L = 0.2 + 0.1 * math.sin(t * math.pi)
            sphere(_n(g, 'leaf'), 0.5, (math.cos(a) * L * 0.55, math.sin(a) * L * 0.55, z), 'plant' if i % 3 else
                   'plant_dark', g, (rng.uniform(-10, 10), -25, math.degrees(a)), scale=(L, L * 0.62, 0.025),
                   segs=10, rings=5)
    elif style == 'monstera':
        st = pot(g, (0, 0, 0), 0.18, 0.3, pot_mat, 'bowl')
        for i in range(9):
            a = TAU * i / 9 + rng.uniform(-0.2, 0.2)
            L = rng.uniform(0.55, 0.85)
            tip = (math.cos(a) * L * 0.55, math.sin(a) * L * 0.55, st + L * 0.85)
            tube(_n(g, 'stem'), [(0, 0, st), (tip[0] * 0.4, tip[1] * 0.4, st + L * 0.6), tip], 0.008, 'plant_dark',
                 g, res=5)
            # split leaf: a heart-ish disc with notches
            R = rng.uniform(0.16, 0.22)
            pts2 = []
            for k in range(24):
                th = TAU * k / 24
                rr = R * (1 - 0.35 * (abs(math.sin(th * 3.5)) > 0.85 and 0.2 < th % math.pi < 2.9))
                pts2.append((math.cos(th) * rr, math.sin(th) * rr * 0.85))
            prism(_n(g, 'leaf'), pts2, 0.012, (tip[0] + math.cos(a) * R * 0.6, tip[1] + math.sin(a) * R * 0.6,
                                               tip[2] - 0.05), 'plant' if i % 2 else 'plant_dark', g,
                  (rng.uniform(-35, -15), 0, math.degrees(a) + 90), bevel=0.004, segments=1)
    elif style == 'snake':
        st = pot(g, (0, 0, 0), 0.13, 0.26, pot_mat if pot_mat != 'terracotta' else 'plastic_white', 'cylinder')
        for i in range(11):
            a = TAU * i / 11 + rng.uniform(-0.2, 0.2)
            r0 = rng.uniform(0.02, 0.08)
            hgt = rng.uniform(0.45, 0.8)
            lean = rng.uniform(4, 14)
            x, y = math.cos(a) * r0, math.sin(a) * r0
            prism(_n(g, 'blade'), [(-0.03, 0), (0.03, 0), (0.035, hgt * 0.6), (0.0, hgt), (-0.035, hgt * 0.6)], 0.012,
                  (x, y, st - 0.02), 'plant_dark' if i % 2 else 'rug_green', g,
                  (90 - lean * math.sin(a) * 0 - 0, lean * math.cos(a), math.degrees(a) + 90), bevel=0.003, segments=1)
    elif style == 'palm':
        st = pot(g, (0, 0, 0), 0.17, 0.3, pot_mat, 'cylinder')
        for i in range(8):
            a = TAU * i / 8 + rng.uniform(-0.2, 0.2)
            L = rng.uniform(0.7, 1.0)
            p0 = (0, 0, st)
            p1 = (math.cos(a) * L * 0.2, math.sin(a) * L * 0.2, st + L * 0.9)
            p2 = (math.cos(a) * L * 0.6, math.sin(a) * L * 0.6, st + L * 1.05)
            p3 = (math.cos(a) * L * 0.85, math.sin(a) * L * 0.85, st + L * 0.7)
            pts = bezier(p0, p1, p2, p3, 8)
            tube(_n(g, 'frond'), pts, 0.006, 'plant_dark', g, res=4)
            for k in range(3, 9):
                p = pts[k]
                for side in (-1, 1):
                    sphere(_n(g, 'leaflet'), 0.5, (p[0] - math.sin(a) * side * 0.06, p[1] + math.cos(a) * side * 0.06,
                                                  p[2] - 0.02), 'plant', g, (0, 30, math.degrees(a) + side * 70),
                           scale=(0.16, 0.035, 0.01), segs=8, rings=4)
    else:
        raise ValueError(style)
    return g


def hanging_plant(name='hanging_plant', location=(0, 0, 2.7), rotation=0, pot_mat='plastic_white', drop=0.8, seed=1,
                  parent='root'):
    """Macrame-hung plant: location = ceiling hook point; the pot hangs `drop` m below, vines trail down."""
    g = _g(name, location, rotation, False, parent=parent)
    pz = -drop
    for i in range(3):
        a = TAU * i / 3
        tube(_n(g, 'cord'), [(0, 0, 0), (math.cos(a) * 0.11, math.sin(a) * 0.11, pz + 0.12)], 0.004, 'fabric_cream',
             g, res=4)
    torus(_n(g, 'ring'), 0.02, 0.005, (0, 0, -0.02), 'metal', g, (90, 0, 0), major=10, minor=4)
    sp = _g(name + '_p', (0, 0, pz), 0, False, parent=g)
    small_plant(parent=sp, location=(0, 0, 0), style='trailing', pot_mat=pot_mat, seed=seed)
    return g


# ----------------------------------------------------------------------------------------------------------------
# lighting fixtures
# ----------------------------------------------------------------------------------------------------------------


def floor_lamp(style='arc', name='floor_lamp', location=(0, 0, 0), rotation=0, mat='metal_dark', light_anchor=None,
               obstacle=True):
    """Floor lamp: style arc (arching over, dome shade toward local -Y) | shade (drum shade on a pole) |
    tripod (wooden tripod legs + drum shade). light_anchor='l_<name>' also creates the light anchor at the bulb."""
    g = _g(name, location, rotation, obstacle)
    if style == 'arc':
        cyl(_n(g, 'base'), 0.16, 0.04, (0, 0, 0.02), 'concrete', g, verts=20, bevel=0.01)
        pts = bezier((0, 0, 0.04), (0, 0.05, 1.6), (0, -0.7, 2.05), (0, -1.0, 1.75), 12)
        tube(_n(g, 'arc'), pts, 0.013, mat, g, res=6)
        lathe(_n(g, 'shade'), [(0.2, -0.12), (0.18, -0.06), (0.1, 0.0), (0.0, 0.02)], (0, -1.0, 1.75), mat, g,
              verts=18, cap_bottom=False)
        cyl(_n(g, 'diff'), 0.17, 0.01, (0, -1.0, 1.64), 'lampshade', g, verts=18, bevel=0)
        bulb = (0, -1.0, 1.62)
    elif style == 'tripod':
        for i in range(3):
            a = TAU * i / 3 + math.pi / 2
            tube(_n(g, 'leg'), [(math.cos(a) * 0.3, math.sin(a) * 0.3, 0), (0, 0, 1.2)], 0.014, 'wood_mid', g, res=6)
        lathe(_n(g, 'shade'), [(0.22, 1.18), (0.2, 1.5), (0.195, 1.5), (0.215, 1.18)], (0, 0, 0), 'lampshade', g,
              verts=20, cap_bottom=False)
        bulb = (0, 0, 1.3)
    else:
        cyl(_n(g, 'base'), 0.15, 0.03, (0, 0, 0.015), mat, g, verts=20, bevel=0.008)
        cyl(_n(g, 'pole'), 0.012, 1.4, (0, 0, 0.73), mat, g, verts=8, bevel=0)
        lathe(_n(g, 'shade'), [(0.22, 1.3), (0.16, 1.6), (0.155, 1.6), (0.215, 1.3)], (0, 0, 0), 'lampshade', g,
              verts=20, cap_bottom=False)
        bulb = (0, 0, 1.42)
    if light_anchor:
        B.light(light_anchor, bulb, 'lamp', '#ffd9a0', 1.2, 4.5, frame=g)
    return g


def ceiling_lamp(style='pendant', name='ceiling_lamp', location=(0, 0, 2.7), rotation=0, drop=0.7, mat='plastic_white',
                 light_anchor=None, parent='root'):
    """Ceiling light hung from `location` (the ceiling point): style pendant (dome on a cord) | globe (paper globe)
    | bulb (bare bulb on a cord) | flush (flush dome) | cage (industrial cage). Not an obstacle.
    light_anchor='l_<name>' creates a 'ceiling' light anchor at the bulb."""
    g = _g(name, location, rotation, False, parent=parent)
    cyl(_n(g, 'canopy'), 0.05, 0.03, (0, 0, -0.015), mat if style != 'cage' else 'metal_dark', g, verts=12)
    if style == 'flush':
        lathe(_n(g, 'dome'), [(0.2, -0.03), (0.18, -0.08), (0.1, -0.12), (0.0, -0.13)], (0, 0, 0), 'lampshade', g,
              verts=20, cap_bottom=False)
        bulb = (0, 0, -0.12)
    else:
        tube(_n(g, 'cord'), [(0, 0, -0.02), (0, 0, -drop + 0.05)], 0.005, 'plastic_black', g, res=4)
        z = -drop
        if style == 'pendant':
            lathe(_n(g, 'shade'), [(0.22, z - 0.1), (0.2, z - 0.05), (0.12, z + 0.04), (0.02, z + 0.08)], (0, 0, 0),
                  mat, g, verts=20, cap_bottom=False)
            sphere(_n(g, 'bulb'), 0.05, (0, 0, z - 0.04), 'lampshade', g, segs=10, rings=6)
            bulb = (0, 0, z - 0.06)
        elif style == 'globe':
            sphere(_n(g, 'globe'), 0.22, (0, 0, z - 0.14), 'lampshade', g, scale=(1, 1, 0.92), segs=20, rings=10)
            bulb = (0, 0, z - 0.14)
        elif style == 'cage':
            for i in range(6):
                a = TAU * i / 6
                tube(_n(g, 'cage'), [(0, 0, z + 0.06), (math.cos(a) * 0.09, math.sin(a) * 0.09, z - 0.03),
                                     (math.cos(a) * 0.07, math.sin(a) * 0.07, z - 0.18), (0, 0, z - 0.2)], 0.004,
                     'metal_dark', g, res=4)
            sphere(_n(g, 'bulb'), 0.055, (0, 0, z - 0.08), 'lampshade', g, scale=(1, 1, 1.3), segs=12, rings=6)
            bulb = (0, 0, z - 0.08)
        else:   # bulb
            cyl(_n(g, 'socket'), 0.018, 0.05, (0, 0, z + 0.03), 'plastic_black', g, verts=8)
            sphere(_n(g, 'bulb'), 0.04, (0, 0, z - 0.03), 'lampshade', g, scale=(1, 1, 1.25), segs=12, rings=6)
            bulb = (0, 0, z - 0.03)
    if light_anchor:
        B.light(light_anchor, bulb, 'ceiling', '#ffe2b8', 1.5, 6.0, frame=g)
    return g


def ceiling_light(style='pendant', name='ceiling_lamp', location=(0, 0, 2.7), rotation=0, drop=0.7, mat=None,
                  light_anchor=None, parent='root', color='#ffe2b8', intensity=1.5, distance=6.0):
    """What a room places instead of a hanging fixture: the cutaway diorama has no ceiling, so a pendant, globe or
    bare bulb on a cord reads as an object floating in mid-air. Creates only the light anchor (when
    `light_anchor` is given) at the height where the bulb would hang; takes ceiling_lamp's arguments so a room can
    swap one call for the other. Returns the light empty or None."""
    if not light_anchor:
        return None
    z = {'flush': -0.12, 'pendant': -drop - 0.06, 'globe': -drop - 0.14, 'cage': -drop - 0.08}.get(style, -drop - 0.03)
    x, y, zc = location
    return B.light(light_anchor, (x, y, zc + z), 'ceiling', color, intensity, distance, parent=parent)


# ----------------------------------------------------------------------------------------------------------------
# the rest of the catalogue lives in furniture2.py (split for size) and is re-exported here
# ----------------------------------------------------------------------------------------------------------------
from furniture2 import *   # noqa: E402,F401,F403
