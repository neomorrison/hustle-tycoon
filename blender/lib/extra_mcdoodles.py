"""McDoodle's restaurant builders (docs/3D.md section 5, room `mcdoodles`), owned by the mcdoodles room script.

Everything here follows the lib conventions (blender/README.md): each builder makes one group empty with its meshes
as children, front = local -Y, rotation in degrees, location = bottom centre on the floor unless noted. Palette
materials only; no letters anywhere (menu boards use pictograms).
"""
import math
import random

import build as B
from build import box, sphere, blob, tube, prism, lathe, torus


def cyl(*a, **k):
    """B.cyl with a single bevel segment by default (small round parts; keeps the room under its triangle budget)."""
    k.setdefault('segments', 1)
    return B.cyl(*a, **k)

COUNTER_TOP = 1.0      # customer counter (register anim taps at 1.0 m)
KITCHEN_TOP = 0.9


def _g(name, location, rotation, obstacle=True, interact=None, parent='root', **extras):
    g = B.group(name, location, rotation, parent, **extras)
    if obstacle:
        B.obstacle(g)
    if interact:
        B.interactive(g, interact)
    return g


def _n(g, part):
    return f'{g.name}_{part}'


def _face(rot=None):
    """Rotation that turns prism()/lathe shapes built in the XY plane into the XZ plane facing -Y."""
    return (90, 0, 0) if rot is None else rot


# ----------------------------------------------------------------------------------------------------------------
# food (small, reused on trays, tables, the pass and the menu boards)
# ----------------------------------------------------------------------------------------------------------------


def burger(g, loc, s=1.0, cheese=True):
    """A little burger (bottom centre at loc) ~9 cm wide at s=1."""
    x, y, z = loc
    r = 0.045 * s
    blob(_n(g, 'bun_b'), (2 * r, 2 * r, 0.018 * s), (x, y, z + 0.009 * s), 'wood_light', g, round_xy=0.9,
         round_z=0.5, segs=12, rings=4)
    cyl(_n(g, 'patty'), r * 1.02, 0.014 * s, (x, y, z + 0.024 * s), 'wood_dark', g, verts=12, bevel=0.003,
        segments=1)
    if cheese:
        box(_n(g, 'cheese'), (1.55 * r, 1.55 * r, 0.004 * s), (x, y, z + 0.033 * s), 'mcd_yellow', g,
            rot=(0, 0, 45), bevel=0.001, segments=1)
    blob(_n(g, 'bun_t'), (2 * r, 2 * r, 0.036 * s), (x, y, z + 0.054 * s), 'wood_light', g, round_xy=0.95,
         round_z=0.85, segs=12, rings=5, deform=lambda px, py, pz: (px, py, pz if pz > 0 else pz * 0.3))


def fries(g, loc, s=1.0, rot=0, seed=1):
    """Red fry carton with a fan of fries (bottom centre at loc)."""
    rng = random.Random(seed)
    x, y, z = loc
    w, d, h = 0.07 * s, 0.035 * s, 0.075 * s
    c = B.group(_n(g, 'fries'), (x, y, z), rot, g)
    prism(_n(g, 'carton'), [(-w * 0.38, 0), (w * 0.38, 0), (w / 2, h), (-w / 2, h)], d, (0, d / 2, 0), 'mcd_red', c,
          rot=(90, 0, 0), bevel=0.002, segments=1)
    for i in range(7):
        fx = (i - 3) * w * 0.12 + rng.uniform(-0.003, 0.003)
        box(_n(g, 'fry'), (0.007 * s, 0.007 * s, 0.06 * s), (fx, rng.uniform(-0.008, 0.008) * s,
                                                            h + 0.012 * s + rng.uniform(-0.008, 0.01) * s),
            'mcd_yellow', c, rot=(rng.uniform(-8, 8), (i - 3) * 5, 0), bevel=0.0, segments=1)
    return c


def cup(g, loc, s=1.0, band='mcd_red', straw=True):
    """Soda cup with lid + straw (bottom centre at loc)."""
    x, y, z = loc
    h = 0.14 * s
    lathe(_n(g, 'cup'), [(0.03 * s, 0), (0.042 * s, h)], (x, y, z), 'plastic_white', g, verts=12, cap_top=True)
    lathe(_n(g, 'cupband'), [(0.0345 * s, h * 0.35), (0.0385 * s, h * 0.68)], (x, y, z), band, g, verts=12,
          cap_bottom=False)
    cyl(_n(g, 'lid'), 0.044 * s, 0.01 * s, (x, y, z + h + 0.004 * s), 'plastic_white', g, verts=12, bevel=0.002,
        segments=1)
    if straw:
        cyl(_n(g, 'straw'), 0.004 * s, 0.07 * s, (x + 0.008 * s, y, z + h + 0.035 * s), 'mcd_red', g, verts=6,
            rot=(0, 8, 0), bevel=0.0)


def tray(g, loc, rot=0, seed=1, meal=True):
    """Red plastic tray with a paper liner and (optionally) a meal."""
    rng = random.Random(seed)
    t = B.group(_n(g, 'tray'), loc, rot, g)
    box(_n(g, 'tray_b'), (0.42, 0.3, 0.02), (0, 0, 0.01), 'mcd_red', t, bevel=0.008, segments=2)
    box(_n(g, 'liner'), (0.34, 0.24, 0.003), (0, 0, 0.021), 'paper', t, rot=(0, 0, rng.uniform(-6, 6)),
        bevel=0.001, segments=1)
    if meal:
        burger(t, (-0.08, 0.02, 0.022), 1.0, cheese=rng.random() < 0.6)
        fries(t, (0.05, 0.05, 0.022), 1.0, rot=rng.uniform(-15, 15), seed=seed)
        cup(t, (0.12, -0.06, 0.022), 0.9)
        # ketchup cups
        for i in range(2):
            cyl(_n(g, 'ketchup'), 0.013, 0.012, (-0.02 + i * 0.03, -0.09, 0.028), 'mcd_red', t, verts=8,
                bevel=0.002, segments=1)
    return t


# ----------------------------------------------------------------------------------------------------------------
# menu pictograms (flat, facing -Y, drawn on a board's front face at local y = 0)
# ----------------------------------------------------------------------------------------------------------------


def icon_burger(g, cx, cz, s=1.0, y=0.0):
    """Burger pictogram centred at (cx, cz) on a board face at local y (extrudes toward -Y)."""
    d = 0.012
    r = 0.12 * s
    top = [(r * math.cos(math.pi * i / 10), r * 0.8 * math.sin(math.pi * i / 10)) for i in range(11)]
    prism(_n(g, 'ic_bun_t'), top, d, (cx, y, cz + 0.02 * s), 'wood_light', g, rot=(90, 0, 0), bevel=0.003, segments=1)
    # sesame seeds
    for sx, sz in ((-0.05, 0.05), (0.0, 0.075), (0.05, 0.05), (-0.02, 0.03), (0.035, 0.022)):
        box(_n(g, 'ic_seed'), (0.012 * s, 0.006, 0.007 * s), (cx + sx * s, y - d - 0.002, cz + 0.02 * s + sz * s),
            'paper', g, bevel=0.0, segments=1)
    # lettuce: zig-zag strip
    lz = []
    n = 8
    for i in range(n + 1):
        lz.append((-r * 1.05 + 2.1 * r * i / n, (0.0 if i % 2 else -0.018 * s)))
    lz = lz + [(r * 1.05, 0.012 * s), (-r * 1.05, 0.012 * s)]
    prism(_n(g, 'ic_lettuce'), lz, d * 0.8, (cx, y + 0.001, cz + 0.006 * s), 'plant', g, rot=(90, 0, 0), bevel=0.0,
          segments=1)
    box(_n(g, 'ic_cheese'), (2.1 * r, d * 0.7, 0.02 * s), (cx, y - d * 0.35, cz - 0.012 * s), 'mcd_yellow', g,
        bevel=0.004, segments=1)
    box(_n(g, 'ic_patty'), (2.15 * r, d, 0.04 * s), (cx, y - d / 2 - 0.001, cz - 0.04 * s), 'wood_dark', g,
        bevel=0.012 * s, segments=2)
    box(_n(g, 'ic_bun_b'), (2.0 * r, d, 0.04 * s), (cx, y - d / 2, cz - 0.085 * s), 'wood_light', g,
        bevel=0.014 * s, segments=2)


def icon_fries(g, cx, cz, s=1.0, y=0.0):
    d = 0.012
    w, h = 0.2 * s, 0.17 * s
    prism(_n(g, 'ic_carton'), [(-w * 0.36, 0), (w * 0.36, 0), (w / 2, h), (w * 0.2, h * 0.86), (0, h), (-w * 0.2, h * 0.86),
                                (-w / 2, h)], d, (cx, y, cz - 0.1 * s), 'mcd_red', g, rot=(90, 0, 0), bevel=0.003,
          segments=1)
    # the doodle smile on the carton
    tube(_n(g, 'ic_smile'), [(cx + 0.045 * s * math.cos(a), y - d - 0.002, cz - 0.045 * s + 0.03 * s * math.sin(a))
                             for a in [math.pi + math.pi * i / 6 for i in range(7)]], 0.006 * s, 'mcd_yellow', g, res=4)
    for i in range(6):
        fx = (i - 2.5) * 0.028 * s
        box(_n(g, 'ic_fry'), (0.02 * s, d * 0.8, 0.13 * s), (cx + fx, y + 0.002, cz - 0.1 * s + h - 0.02 * s + (0.02 if i % 2 else 0.0) * s),
            'mcd_yellow', g, rot=(0, (i - 2.5) * 5, 0), bevel=0.0, segments=1)


def icon_drink(g, cx, cz, s=1.0, y=0.0, band='mcd_red'):
    d = 0.012
    w, h = 0.16 * s, 0.22 * s
    prism(_n(g, 'ic_cup'), [(-w * 0.36, 0), (w * 0.36, 0), (w / 2, h), (-w / 2, h)], d, (cx, y, cz - 0.12 * s),
          'plastic_white', g, rot=(90, 0, 0), bevel=0.003, segments=1)
    box(_n(g, 'ic_band'), (w * 0.86, d * 0.4, 0.06 * s), (cx, y - d - 0.001, cz - 0.12 * s + h * 0.5), band, g,
        bevel=0.003, segments=1)
    box(_n(g, 'ic_lid'), (w * 1.08, d, 0.022 * s), (cx, y - d / 2, cz - 0.12 * s + h + 0.008 * s), 'plastic_grey', g,
        bevel=0.006, segments=1)
    box(_n(g, 'ic_straw'), (0.014 * s, d * 0.8, 0.1 * s), (cx + 0.03 * s, y - d / 2, cz - 0.12 * s + h + 0.055 * s),
        'mcd_red', g, rot=(0, -14, 0), bevel=0.003, segments=1)


def icon_cone(g, cx, cz, s=1.0, y=0.0):
    d = 0.012
    prism(_n(g, 'ic_cone'), [(0, 0), (0.06 * s, 0.14 * s), (-0.06 * s, 0.14 * s)], d, (cx, y, cz - 0.1 * s),
          'wood_light', g, rot=(90, 0, 0), bevel=0.003, segments=1)
    for k, (dx, dz, r) in enumerate(((0, 0.06, 0.055), (0, 0.11, 0.04), (0.0, 0.15, 0.022))):
        cyl(_n(g, 'ic_swirl'), r * s, d, (cx + dx * s, y - d / 2 - 0.001 * k, cz - 0.1 * s + (0.1 + dz) * s * 0.8 + 0.02 * s),
            'plastic_white', g, rot=(90, 0, 0), verts=16, bevel=0.003, segments=1)


def price_marks(g, cx, cz, s=1.0, y=0.0, mat='mcd_yellow', n=3, seed=1):
    """Abstract price 'digits' (pills and dots), no letters."""
    rng = random.Random(seed)
    x = cx - 0.05 * s * (n - 1) / 2
    box(_n(g, 'pr_dot'), (0.018 * s, 0.006, 0.018 * s), (x - 0.045 * s, y - 0.004, cz - 0.012 * s), mat, g, bevel=0.0,
        segments=1)
    for i in range(n):
        box(_n(g, 'pr_pill'), (0.032 * s, 0.006, (0.05 if rng.random() < 0.7 else 0.04) * s), (x + i * 0.045 * s, y - 0.004, cz),
            mat, g, bevel=0.0, segments=1)


def menu_board(name, location, rotation, items, frame='plastic_black', panel='mcd_red', parent='root', seed=1):
    """Menu board (0.95 x 0.62) facing local -Y; location = centre of its back on the wall. items: list of
    'burger' | 'fries' | 'drink' | 'cone' | 'combo' (1-3) laid out left to right with price marks under each."""
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    W, H = 0.95, 0.62
    box(_n(g, 'frame'), (W, 0.05, H), (0, -0.025, 0), frame, g, bevel=0.012, segments=2)
    box(_n(g, 'face'), (W - 0.07, 0.01, H - 0.07), (0, -0.052, 0), panel, g, bevel=0.006, segments=1)
    # header strip: yellow band with dots
    box(_n(g, 'band'), (W - 0.07, 0.008, 0.06), (0, -0.059, H / 2 - 0.08), 'mcd_yellow', g, bevel=0.004, segments=1)
    fy = -0.063
    n = len(items)
    for i, it in enumerate(items):
        cx = -W / 2 + W * (i + 0.5) / n
        s = 0.9 if n > 1 else 1.3
        cz = 0.02
        if it == 'burger':
            icon_burger(g, cx, cz, s, fy)
        elif it == 'fries':
            icon_fries(g, cx, cz, s, fy)
        elif it == 'drink':
            icon_drink(g, cx, cz, s, fy)
        elif it == 'cone':
            icon_cone(g, cx, cz, s, fy)
        elif it == 'combo':
            icon_burger(g, cx - 0.07, cz, 0.7, fy)
            icon_fries(g, cx + 0.1, cz + 0.02, 0.6, fy)
        price_marks(g, cx, -H / 2 + 0.1, 0.9, fy, 'paper' if panel != 'paper' else 'mcd_red', 3 if i % 2 else 2,
                    seed=seed * 7 + i)
    return g


# ----------------------------------------------------------------------------------------------------------------
# front of house
# ----------------------------------------------------------------------------------------------------------------


def register(g, loc, rot=0):
    """POS register on a counter top: a white till with a red stripe, the crew touch screen tilted up toward local
    +Y (the crew side, readable from above), a small customer display facing -Y and a card reader."""
    r = B.group(_n(g, 'register'), loc, rot, g)
    box(_n(g, 'reg_drawer'), (0.44, 0.4, 0.1), (0, 0, 0.05), 'plastic_white', r, bevel=0.018, segments=2)
    box(_n(g, 'reg_stripe'), (0.445, 0.405, 0.025), (0, 0, 0.06), 'mcd_red', r, bevel=0.008, segments=1)
    box(_n(g, 'reg_neck'), (0.08, 0.06, 0.1), (0, 0.04, 0.14), 'plastic_black', r, rot=(-15, 0, 0), bevel=0.012)
    scr = B.group(_n(g, 'reg_head'), (0, 0.03, 0.2), (-74, 0, 180), r)
    box(_n(g, 'reg_bezel'), (0.42, 0.035, 0.31), (0, 0, 0), 'plastic_black', scr, bevel=0.015, segments=2)
    box(_n(g, 'reg_receipt'), (0.07, 0.004, 0.09), (-0.14, 0.02, 0.19), 'paper', scr, rot=(-20, 0, 0), bevel=0.0)
    B.panel(_n(g, 'reg_screen'), (0.37, 0.26), (0, -0.019, 0), 'screen', scr)
    for i, m in enumerate(('mcd_red', 'mcd_yellow', 'plant', 'poster_b')):
        for j in range(2):
            box(_n(g, 'reg_btn'), (0.07, 0.004, 0.05), (-0.12 + i * 0.08, -0.022, -0.075 + j * 0.065), m, scr,
                bevel=0.002, segments=1)
    # customer pole display
    cyl(_n(g, 'reg_pole'), 0.014, 0.2, (0.17, -0.13, 0.19), 'plastic_black', r, verts=8)
    cd = B.group(_n(g, 'reg_cust'), (0.17, -0.13, 0.32), (12, 0, 0), r)
    box(_n(g, 'reg_cbox'), (0.22, 0.045, 0.13), (0, 0, 0), 'plastic_black', cd, bevel=0.012)
    B.panel(_n(g, 'reg_cscreen'), (0.19, 0.1), (0, -0.024, 0), 'screen', cd)
    box(_n(g, 'reg_card'), (0.08, 0.13, 0.045), (-0.16, -0.22, 0.022), 'plastic_black', r, rot=(12, 0, 0), bevel=0.012)
    return r


def front_counter(length=5.2, name='counter', location=(0, 0, 0), rotation=0, registers=(-1.5, 0.1),
                  interact='counter', seed=3):
    """Customer counter (top 1.0 m, depth 0.75): red front with a yellow band and tile kick, registers, trays,
    napkins, straws, a pickup shelf with a heat lamp and takeout bags. Customers stand on local -Y, crew on +Y."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, interact=interact)
    L, D, H = length, 0.75, COUNTER_TOP
    # carcass + top
    box(_n(g, 'body'), (L - 0.04, D - 0.1, H - 0.1), (0, 0.03, (H - 0.1) / 2 + 0.06), 'plastic_white', g, bevel=0.02)
    box(_n(g, 'kick'), (L - 0.1, D - 0.2, 0.08), (0, 0.04, 0.04), 'tile_check_dark', g, bevel=0.01, segments=1)
    box(_n(g, 'top'), (L, D, 0.05), (0, 0, H - 0.025), 'plastic_white', g, bevel=0.02, segments=2)
    box(_n(g, 'top_edge'), (L + 0.01, 0.04, 0.035), (0, -D / 2 + 0.01, H - 0.03), 'metal', g, bevel=0.012)
    # customer face: red panels separated by thin yellow pilasters, yellow band on top
    nseg = max(3, int(round(L / 0.9)))
    seg = (L - 0.06) / nseg
    for i in range(nseg):
        x = -L / 2 + 0.03 + seg * (i + 0.5)
        box(_n(g, 'panel'), (seg - 0.05, 0.03, H - 0.3), (x, -D / 2 + 0.03, 0.12 + (H - 0.3) / 2), 'mcd_red', g,
            bevel=0.012)
        # a smile doodle on alternating panels (the brand mark, no letters)
        if i % 2 == 1:
            pts = [(x + 0.13 * math.cos(a), -D / 2 + 0.006, 0.52 + 0.1 * math.sin(a))
                   for a in [math.pi + math.pi * k / 10 for k in range(11)]]
            tube(_n(g, 'smile'), pts, 0.018, 'mcd_yellow', g, res=6)
            for sx in (-0.07, 0.07):
                box(_n(g, 'eye'), (0.035, 0.012, 0.045), (x + sx, -D / 2 + 0.008, 0.62), 'mcd_yellow', g,
                    bevel=0.0, segments=1)
    box(_n(g, 'band'), (L - 0.02, 0.035, 0.12), (0, -D / 2 + 0.03, H - 0.13), 'mcd_yellow', g, bevel=0.012)
    # crew side: open shelves under the top
    box(_n(g, 'crew_shelf'), (L - 0.2, 0.3, 0.025), (0, D / 2 - 0.16, 0.55), 'metal', g, bevel=0.006, segments=1)
    for i in range(int(L / 0.6)):
        x = -L / 2 + 0.4 + i * 0.6
        if rng.random() < 0.6:
            box(_n(g, 'bagstack'), (0.26, 0.16, 0.08), (x, D / 2 - 0.16, 0.6), 'kraft', g, bevel=0.01)
    # registers
    for i, rx in enumerate(registers):
        register(g, (rx, 0.02, H), 0)
    # tray stack, napkin dispenser, straws
    x0 = registers[0] - 0.65
    for k in range(5):
        box(_n(g, 'traystack'), (0.42, 0.3, 0.018), (x0, -0.05, H + 0.01 + k * 0.019), 'mcd_red', g, bevel=0.007,
            segments=1)
    box(_n(g, 'napkins'), (0.14, 0.1, 0.13), (registers[-1] + 0.45, -0.18, H + 0.065), 'metal', g, bevel=0.012)
    box(_n(g, 'napkin_slot'), (0.1, 0.004, 0.04), (registers[-1] + 0.45, -0.232, H + 0.07), 'paper', g,
        bevel=0.001, segments=1)
    cyl(_n(g, 'strawcup'), 0.04, 0.14, (registers[-1] + 0.62, -0.18, H + 0.07), 'plastic_white', g, verts=12)
    for k in range(4):
        cyl(_n(g, 'straw'), 0.0045, 0.2, (registers[-1] + 0.62 + (k % 3 - 1) * 0.015, -0.18 + (k // 3 - 0.5) * 0.015,
                                          H + 0.18), 'mcd_red' if k % 2 else 'mcd_yellow', g, verts=6,
            rot=((k % 3 - 1) * 6, (k // 3 - 0.5) * 8, 0), bevel=0.0)
    # pickup zone at the +X end: heat-lamp shelf with bagged orders
    px = L / 2 - 0.55
    for sx in (-0.42, 0.42):
        cyl(_n(g, 'lamp_post'), 0.015, 0.55, (px + sx, 0.2, H + 0.275), 'metal', g, verts=8)
    box(_n(g, 'lamp_bar'), (0.95, 0.16, 0.06), (px, 0.2, H + 0.57), 'metal', g, bevel=0.015)
    box(_n(g, 'lamp_glow'), (0.85, 0.08, 0.015), (px, 0.2, H + 0.535), 'lampshade', g, bevel=0.004, segments=1)
    for k in range(3):
        bx = px - 0.3 + k * 0.3
        bh = 0.2 + 0.04 * (k % 2)
        box(_n(g, 'bag'), (0.18, 0.11, bh), (bx, 0.12, H + bh / 2), 'kraft', g, bevel=0.01)
        box(_n(g, 'bag_fold'), (0.185, 0.115, 0.03), (bx, 0.12, H + bh - 0.012), 'paper', g, bevel=0.006,
            segments=1)
        box(_n(g, 'bag_logo'), (0.07, 0.003, 0.07), (bx, 0.12 - 0.057, H + bh * 0.5), 'mcd_red', g, bevel=0.02,
            segments=1)
    # a finished tray waiting at the end, and a cup drink carrier
    tray(g, (px - 0.1, -0.2, H), rot=4, seed=seed + 1)
    return g


def queue_rope(name='queue_rope', location=(0, 0, 0), rotation=0, length=1.6, posts=3):
    """Stanchions with a red rope along local X (origin at the first post's floor point)."""
    g = _g(name, location, rotation, obstacle=True)
    xs = [length * i / (posts - 1) for i in range(posts)]
    for i, x in enumerate(xs):
        cyl(_n(g, 'base'), 0.13, 0.03, (x, 0, 0.015), 'metal_dark', g, verts=16, bevel=0.01)
        cyl(_n(g, 'post'), 0.025, 0.9, (x, 0, 0.47), 'metal', g, verts=10)
        sphere(_n(g, 'cap'), 0.035, (x, 0, 0.93), 'metal', g, segs=8, rings=5)
        if i < posts - 1:
            tube(_n(g, 'rope'), B.catenary((x + 0.03, 0, 0.86), (xs[i + 1] - 0.03, 0, 0.86), 0.14, 8), 0.02,
                 'mcd_red', g, res=6)
    return g


def booth(name='booth', location=(0, 0, 0), rotation=0, seat_mat='mcd_red', table_mat='plastic_white', seed=1,
          anchors=None, meals=(True, False)):
    """Diner booth: a table between two benches on local -X / +X; its local +Y end goes against a wall.
    anchors=('a_booth_sit_1', 'a_booth_sit_2') puts one seat on each bench (floor point under the pelvis, facing
    the table). Footprint ~2.0 (x) x 1.3 (y)."""
    rng = random.Random(seed)
    g = _g(name, location, rotation)
    L = 1.3
    for side in (-1, 1):
        bx = side * 0.66
        box(_n(g, 'base'), (0.5, L, 0.36), (bx, 0, 0.18), 'wood_mid', g, bevel=0.02)
        blob(_n(g, 'seat'), (0.5, L - 0.06, 0.13), (bx - side * 0.01, 0, 0.405), seat_mat, g, round_xy=0.25,
             round_z=0.55, segs=12, rings=5)
        # back shell + tufted back cushion (two pads)
        box(_n(g, 'shell'), (0.1, L, 1.1), (side * 0.96, 0, 0.55), 'wood_mid', g, bevel=0.03)
        box(_n(g, 'shell_cap'), (0.16, L + 0.02, 0.05), (side * 0.95, 0, 1.12), 'mcd_yellow', g, bevel=0.02)
        for k in (-1, 1):
            blob(_n(g, 'back'), (0.14, L / 2 - 0.05, 0.52), (side * 0.86, k * L / 4, 0.76), seat_mat, g,
                 rot=(0, -side * 8, 0), round_xy=0.35, round_z=0.4, segs=12, rings=5)
    # table
    box(_n(g, 'top'), (0.74, 1.08, 0.04), (0, 0.06, 0.745), table_mat, g, bevel=0.018, segments=2)
    box(_n(g, 'edge'), (0.76, 1.1, 0.02), (0, 0.06, 0.72), 'mcd_yellow', g, bevel=0.008, segments=1)
    cyl(_n(g, 'pedestal'), 0.045, 0.7, (0, 0.1, 0.36), 'metal', g, verts=12)
    box(_n(g, 'foot'), (0.5, 0.08, 0.03), (0, 0.1, 0.015), 'metal', g, bevel=0.01, segments=1)
    # condiments against the wall end
    cy = L / 2 - 0.18
    box(_n(g, 'napkin'), (0.12, 0.08, 0.12), (0, cy, 0.825), 'metal', g, bevel=0.012)
    for k, m in enumerate(('mcd_red', 'mcd_yellow')):
        lathe(_n(g, 'bottle'), [(0.025, 0), (0.028, 0.02), (0.026, 0.12), (0.012, 0.15), (0.004, 0.18)],
              (-0.17 + k * 0.06, cy, 0.765), m, g, verts=10)
    for k, side in enumerate((-1, 1)):
        if meals[k] if k < len(meals) else False:
            tray(g, (side * 0.18, -0.12 + rng.uniform(-0.05, 0.05), 0.765), rot=90 + rng.uniform(-8, 8),
                 seed=seed * 3 + k)
    if anchors:
        for k, side in enumerate((-1, 1)):
            if k < len(anchors) and anchors[k]:
                B.anchor(anchors[k], (side * 0.62, -0.15, 0), 'e' if side < 0 else 'w', frame=g)
    return g


def cafe_table(name='cafe_table', location=(0, 0, 0), rotation=0, seed=1, meal=False):
    """Small round two-top with two red bistro chairs (east/west)."""
    rng = random.Random(seed)
    g = _g(name, location, rotation)
    cyl(_n(g, 'top'), 0.36, 0.035, (0, 0, 0.745), 'plastic_white', g, verts=24, bevel=0.012)
    cyl(_n(g, 'rim'), 0.365, 0.018, (0, 0, 0.72), 'mcd_yellow', g, verts=24, bevel=0.006, segments=1)
    cyl(_n(g, 'post'), 0.035, 0.72, (0, 0, 0.37), 'metal', g, verts=10)
    cyl(_n(g, 'foot'), 0.22, 0.03, (0, 0, 0.015), 'metal_dark', g, verts=18, bevel=0.01)
    for side in (-1, 1):
        c = B.group(_n(g, 'chair'), (side * 0.58, 0, 0), 90 * side, g)   # facing the table
        cyl(_n(g, 'seat'), 0.2, 0.05, (0, 0, 0.45), 'mcd_red', c, verts=16, bevel=0.015)
        for lx, ly in ((-0.13, -0.13), (0.13, -0.13), (-0.13, 0.13), (0.13, 0.13)):
            cyl(_n(g, 'leg'), 0.012, 0.44, (lx, ly, 0.22), 'metal', c, verts=6, rot=(ly * 20, -lx * 20, 0))
        box(_n(g, 'back'), (0.36, 0.04, 0.26), (0, 0.19, 0.72), 'mcd_red', c, rot=(-8, 0, 0), bevel=0.018)
        cyl(_n(g, 'backpost'), 0.012, 0.3, (0, 0.18, 0.6), 'metal', c, verts=6, rot=(-8, 0, 0))
    if meal:
        tray(g, (0.0, 0.0, 0.765), rot=rng.uniform(-10, 10), seed=seed)
    else:
        cup(g, (0.1, 0.08, 0.763), 1.0)
        cup(g, (-0.12, -0.05, 0.763), 0.8, band='mcd_yellow')
    return g


def trash_station(name='trash_station', location=(0, 0, 0), rotation=0):
    """Wooden trash cabinet with a swing flap and a tray shelf on top (front local -Y)."""
    g = _g(name, location, rotation)
    box(_n(g, 'body'), (0.7, 0.55, 1.05), (0, 0, 0.525), 'wood_mid', g, bevel=0.025)
    box(_n(g, 'top'), (0.76, 0.6, 0.04), (0, 0, 1.07), 'plastic_white', g, bevel=0.015)
    box(_n(g, 'flap'), (0.44, 0.03, 0.3), (0, -0.28, 0.72), 'metal', g, bevel=0.012)
    box(_n(g, 'flap_slot'), (0.46, 0.02, 0.03), (0, -0.28, 0.885), 'plastic_black', g, bevel=0.006, segments=1)
    for k in range(4):
        box(_n(g, 'tray'), (0.42, 0.3, 0.018), (0, 0.02, 1.1 + k * 0.02), 'mcd_red', g, bevel=0.007, segments=1)
    # a recycling pictogram: two arrows as bent tubes
    for k in range(3):
        a0 = k * 2 * math.pi / 3 + 0.3
        pts = [(0.09 * math.cos(a0 + t * 1.6), -0.279, 0.42 + 0.09 * math.sin(a0 + t * 1.6)) for t in (0, 0.33, 0.66, 1)]
        tube(_n(g, 'recycle'), pts, 0.012, 'plant', g, res=5)
    return g


def high_chair(name='high_chair', location=(0, 0, 0), rotation=0):
    g = _g(name, location, rotation)
    for lx, ly in ((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)):
        cyl(_n(g, 'leg'), 0.018, 0.75, (lx * 0.8, ly * 0.8, 0.37), 'wood_light', g, verts=8, rot=(ly * 25, -lx * 25, 0))
    box(_n(g, 'seat'), (0.34, 0.32, 0.05), (0, 0, 0.72), 'wood_light', g, bevel=0.015)
    box(_n(g, 'back'), (0.34, 0.04, 0.34), (0, 0.16, 0.92), 'wood_light', g, bevel=0.015)
    box(_n(g, 'tray'), (0.4, 0.2, 0.03), (0, -0.2, 0.88), 'mcd_yellow', g, bevel=0.012)
    for sx in (-1, 1):
        box(_n(g, 'arm'), (0.03, 0.34, 0.03), (sx * 0.17, -0.04, 0.86), 'wood_light', g, bevel=0.01)
    return g


def wet_floor_sign(name='wet_floor', location=(0, 0, 0), rotation=0):
    """Yellow A-frame caution sign with a slipping-figure pictogram (no text)."""
    g = _g(name, location, rotation, obstacle=False)
    for side in (-1, 1):
        p = B.group(_n(g, 'leaf'), (0, side * 0.1, 0), (side * 12, 0, 0 if side < 0 else 180), g)
        box(_n(g, 'board'), (0.3, 0.02, 0.62), (0, 0, 0.31), 'mcd_yellow', p, bevel=0.01)
        box(_n(g, 'tri'), (0.14, 0.004, 0.14), (0, -0.012, 0.38), 'plastic_black', p, rot=(0, 45, 0), bevel=0.002,
            segments=1)
        box(_n(g, 'tri_in'), (0.1, 0.004, 0.1), (0, -0.015, 0.38), 'mcd_yellow', p, rot=(0, 45, 0), bevel=0.002,
            segments=1)
        sphere(_n(g, 'fig_head'), 0.014, (0.0, -0.018, 0.405), 'plastic_black', p, segs=8, rings=5)
        box(_n(g, 'fig_body'), (0.012, 0.004, 0.045), (0.004, -0.018, 0.37), 'plastic_black', p, rot=(0, 25, 0),
            bevel=0.001, segments=1)
    box(_n(g, 'hinge'), (0.3, 0.05, 0.03), (0, 0, 0.62), 'mcd_yellow', g, bevel=0.01)
    return g


def planter_box(name='planter', location=(0, 0, 0), rotation=0, length=1.0, seed=1, obstacle=True, parent='root'):
    """Long red planter with a hedge of leafy balls."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle=obstacle, parent=parent)
    box(_n(g, 'box'), (length, 0.32, 0.4), (0, 0, 0.2), 'mcd_red', g, bevel=0.025)
    box(_n(g, 'rim'), (length + 0.03, 0.35, 0.04), (0, 0, 0.41), 'mcd_yellow', g, bevel=0.015)
    n = max(3, int(length / 0.18))
    for i in range(n):
        x = -length / 2 + 0.1 + (length - 0.2) * i / (n - 1)
        r = rng.uniform(0.09, 0.13)
        sphere(_n(g, 'leaf'), r, (x, rng.uniform(-0.04, 0.04), 0.43 + r * 0.6), 'plant' if i % 3 else 'plant_dark', g,
               segs=10, rings=6)
    return g


def self_serve_drinks(length=2.2, name='drinks', location=(0, 0, 0), rotation=0, seed=5):
    """Self-serve soda station facing local -Y: yellow counter, soda fountain with six flavour tiles and nozzles,
    ice lever, drip tray, cup + lid dispensers, straws and napkins."""
    rng = random.Random(seed)
    g = _g(name, location, rotation)
    L, D, H = length, 0.68, KITCHEN_TOP
    box(_n(g, 'body'), (L - 0.04, D - 0.08, H - 0.1), (0, 0.02, (H - 0.1) / 2 + 0.06), 'mcd_yellow', g, bevel=0.02)
    box(_n(g, 'kick'), (L - 0.1, D - 0.16, 0.08), (0, 0.03, 0.04), 'tile_check_dark', g, bevel=0.01, segments=1)
    box(_n(g, 'top'), (L, D, 0.045), (0, 0, H - 0.022), 'plastic_white', g, bevel=0.018)
    for i in range(3):
        x = -L / 2 + L * (i + 0.5) / 3
        box(_n(g, 'door'), (L / 3 - 0.08, 0.02, H - 0.3), (x, -D / 2 + 0.02, 0.12 + (H - 0.3) / 2), 'mcd_yellow', g,
            bevel=0.012)
        box(_n(g, 'handle'), (0.14, 0.02, 0.02), (x, -D / 2, H - 0.22), 'metal', g, bevel=0.006, segments=1)
    # soda fountain
    fx = -0.25
    fw = 1.05
    fb = B.group(_n(g, 'fountain'), (fx, 0.06, H), 0, g)
    box(_n(g, 'f_body'), (fw, 0.52, 0.72), (0, 0.02, 0.36 + 0.05), 'metal', fb, bevel=0.03)
    box(_n(g, 'f_top'), (fw + 0.02, 0.54, 0.08), (0, 0.02, 0.8), 'mcd_red', fb, bevel=0.025)
    box(_n(g, 'f_header'), (fw - 0.06, 0.02, 0.22), (0, -0.25, 0.6), 'plastic_black', fb, bevel=0.01)
    flav = ['wood_dark', 'mcd_red', 'plant', 'poster_b', 'mcd_yellow', 'plastic_white']
    for i in range(6):
        x = -fw / 2 + 0.1 + (fw - 0.2) * i / 5
        box(_n(g, 'f_flav'), (0.12, 0.012, 0.16), (x, -0.262, 0.6), flav[i], fb, bevel=0.012)
        sphere(_n(g, 'f_bubble'), 0.022, (x - 0.02, -0.27, 0.63), 'paper', fb, scale=(1, 0.4, 1), segs=8, rings=4)
        cyl(_n(g, 'f_nozzle'), 0.018, 0.05, (x, -0.2, 0.42), 'plastic_grey', fb, verts=8)
        box(_n(g, 'f_lever'), (0.02, 0.03, 0.08), (x, -0.235, 0.39), 'plastic_black', fb, bevel=0.005, segments=1)
    box(_n(g, 'f_ice'), (0.2, 0.08, 0.14), (0, -0.22, 0.26), 'plastic_grey', fb, bevel=0.012)
    box(_n(g, 'f_tray'), (fw - 0.05, 0.22, 0.04), (0, -0.2, 0.06), 'metal_dark', fb, bevel=0.01)
    for i in range(9):
        box(_n(g, 'f_grate'), (0.008, 0.2, 0.006), (-fw / 2 + 0.1 + i * (fw - 0.2) / 8, -0.2, 0.082), 'metal', fb,
            bevel=0.001, segments=1)
    # a cup being filled
    cup(fb, (-fw / 2 + 0.1 + (fw - 0.2) * 2 / 5, -0.2, 0.085), 1.0, straw=False)
    # cup dispensers + lids at the +X end
    for k, (s, m) in enumerate(((0.8, 'mcd_red'), (1.0, 'mcd_red'), (1.2, 'mcd_yellow'))):
        x = 0.5 + k * 0.17
        lathe(_n(g, 'cupstack'), [(0.03 * s, 0), (0.045 * s, 0.1 * s), (0.034 * s, 0.1 * s), (0.049 * s, 0.24 * s)],
              (x, 0.12, H), 'plastic_white', g, verts=12, cap_top=True)
        lathe(_n(g, 'cupstack_b'), [(0.037 * s, 0.03 * s), (0.043 * s, 0.08 * s)], (x, 0.12, H), m, g, verts=12,
              cap_bottom=False)
    box(_n(g, 'lids'), (0.3, 0.14, 0.12), (0.65, -0.14, H + 0.06), 'plastic_grey', g, bevel=0.015)
    for k in range(3):
        cyl(_n(g, 'lidstack'), 0.04 + k * 0.006, 0.05, (0.56 + k * 0.09, -0.14, H + 0.145), 'plastic_white', g, verts=12,
            bevel=0.005, segments=1)
    # straws + napkins + ketchup pump at -X end
    cyl(_n(g, 'strawcup'), 0.04, 0.14, (-L / 2 + 0.14, -0.1, H + 0.07), 'metal', g, verts=12)
    for k in range(5):
        cyl(_n(g, 'straw'), 0.0045, 0.21, (-L / 2 + 0.14 + (k - 2) * 0.012, -0.1, H + 0.2), 'mcd_red', g, verts=6,
            rot=((k - 2) * 5, (k % 2) * 6, 0), bevel=0.0)
    for k, m in enumerate(('mcd_red', 'mcd_yellow')):
        px = L / 2 - 0.12 - k * 0.14
        cyl(_n(g, 'pump_jar'), 0.05, 0.16, (px, 0.18, H + 0.08), 'metal', g, verts=12)
        box(_n(g, 'pump_head'), (0.06, 0.1, 0.03), (px, 0.15, H + 0.19), m, g, bevel=0.01)
        cyl(_n(g, 'pump_stem'), 0.008, 0.05, (px, 0.18, H + 0.18), 'metal', g, verts=6)
    return g


# ----------------------------------------------------------------------------------------------------------------
# kitchen line (back of house). Everything stands with its back to local +Y (a wall), front = -Y, top 0.9 m.
# ----------------------------------------------------------------------------------------------------------------


def _steel_base(g, w, d=0.78, h=0.86, doors=1, legs=True, mat='metal'):
    """Stainless base cabinet with legs and door fronts, back at local +Y (y = d/2)."""
    y0 = 0.0
    box(_n(g, 'base'), (w - 0.02, d - 0.04, h - 0.14), (0, y0 + 0.02, 0.14 + (h - 0.14) / 2), mat, g, bevel=0.015)
    if legs:
        for lx in (-w / 2 + 0.06, w / 2 - 0.06):
            for ly in (-d / 2 + 0.08, d / 2 - 0.08):
                cyl(_n(g, 'leg'), 0.02, 0.14, (lx, ly, 0.07), 'metal_dark', g, verts=8, bevel=0.003, segments=1)
    for i in range(doors):
        x = -w / 2 + w * (i + 0.5) / doors
        box(_n(g, 'door'), (w / doors - 0.04, 0.015, h - 0.26), (x, -d / 2 + 0.005, 0.16 + (h - 0.26) / 2), mat, g,
            bevel=0.008, segments=1)
        box(_n(g, 'pull'), (min(0.2, w / doors - 0.14), 0.02, 0.018), (x, -d / 2 - 0.01, h - 0.18), 'metal_dark', g,
            bevel=0.005, segments=1)


def fryer_station(name='fryer', location=(0, 0, 0), rotation=0, vats=2, interact='fryer', seed=2):
    """Fry station: `vats` deep fryers (each 0.5 m) with golden oil and two baskets, plus a fry dump station with
    a heat lamp, a pile of fries and red cartons. Back at local +Y, crew stands on -Y. Width = vats*0.5 + 0.65."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, interact=interact)
    fw = 0.5
    W = vats * fw + 0.65
    x0 = -W / 2
    for v in range(vats):
        cx = x0 + fw * (v + 0.5)
        f = B.group(_n(g, 'vat'), (cx, 0, 0), 0, g)
        box(_n(g, 'cab'), (fw - 0.02, 0.8, 0.86), (0, 0, 0.5), 'metal', f, bevel=0.018)
        box(_n(g, 'panel'), (fw - 0.08, 0.02, 0.12), (0, -0.4, 0.8), 'plastic_black', f, bevel=0.008, segments=1)
        for k, m in enumerate(('mcd_red', 'plant', 'mcd_yellow')):
            cyl(_n(g, 'btn'), 0.014, 0.012, (-0.1 + k * 0.05, -0.412, 0.8), m, f, rot=(90, 0, 0), verts=8,
                bevel=0.002, segments=1)
        box(_n(g, 'tempscr'), (0.08, 0.006, 0.04), (0.12, -0.411, 0.8), 'screen', f, bevel=0.001, segments=1)
        box(_n(g, 'door'), (fw - 0.08, 0.015, 0.5), (0, -0.405, 0.43), 'metal', f, bevel=0.01, segments=1)
        box(_n(g, 'pull'), (0.18, 0.02, 0.02), (0, -0.42, 0.64), 'metal_dark', f, bevel=0.005, segments=1)
        for lx in (-0.18, 0.18):
            cyl(_n(g, 'caster'), 0.035, 0.05, (lx, -0.3, 0.035), 'plastic_black', f, rot=(0, 90, 0), verts=10)
        # oil well: rim + oil surface slightly below
        box(_n(g, 'rim'), (fw - 0.02, 0.62, 0.04), (0, 0.02, 0.93), 'metal', f, bevel=0.012)
        box(_n(g, 'oil'), (fw - 0.1, 0.52, 0.02), (0, 0.02, 0.935), 'fabric_mustard', f, bevel=0.004, segments=1)
        # baskets: one dunked, one hanging up on the back rail
        for k, bx in enumerate((-0.11, 0.11)):
            up = (v + k) % 2 == 1
            bz = 1.08 if up else 0.93
            bb = B.group(_n(g, 'basket'), (bx, -0.02 + (0.12 if up else 0.0), bz), (-20 if up else 0, 0, 0), f)
            box(_n(g, 'bsk'), (0.2, 0.32, 0.13), (0, 0, 0), 'metal_dark', bb, bevel=0.012)
            box(_n(g, 'bsk_in'), (0.17, 0.29, 0.02), (0, 0, 0.055), 'mcd_yellow' if up else 'fabric_mustard', bb,
                bevel=0.005, segments=1)
            tube(_n(g, 'bsk_handle'), [(0, -0.16, 0.04), (0, -0.28, 0.08), (0, -0.36, 0.1)], 0.012, 'metal', bb, res=6)
            box(_n(g, 'bsk_grip'), (0.035, 0.12, 0.035), (0, -0.38, 0.105), 'plastic_black', bb, bevel=0.012)
        # flue at the back
        box(_n(g, 'flue'), (fw - 0.1, 0.1, 0.22), (0, 0.33, 1.02), 'metal', f, bevel=0.015)
    # basket hanger rail
    box(_n(g, 'rail'), (vats * fw - 0.04, 0.04, 0.03), (x0 + vats * fw / 2, 0.3, 1.18), 'metal', g, bevel=0.01)
    # dump station
    dx = x0 + vats * fw + 0.325
    d = B.group(_n(g, 'dump'), (dx, 0, 0), 0, g)
    _steel_base(d, 0.63, 0.8, 0.86, doors=1)
    box(_n(g, 'dump_top'), (0.63, 0.8, 0.04), (0, 0, 0.88), 'metal', d, bevel=0.012)
    box(_n(g, 'dump_pan'), (0.5, 0.45, 0.06), (0, 0.0, 0.92), 'metal_dark', d, bevel=0.01)
    for i in range(26):
        box(_n(g, 'dump_fry'), (0.012, 0.012, rng.uniform(0.07, 0.1)),
            (rng.uniform(-0.2, 0.2), rng.uniform(-0.17, 0.17), 0.96 + rng.uniform(-0.005, 0.02)), 'mcd_yellow', d,
            rot=(rng.uniform(70, 110), 0, rng.uniform(0, 180)), bevel=0.0, segments=1)
    # carton rack + filled cartons ready
    for i in range(4):
        fries(d, (-0.22 + i * 0.12, -0.3, 0.9), 1.4, rot=0, seed=seed + i)
    for i in range(4):
        box(_n(g, 'carton_stack'), (0.1, 0.05, 0.08), (-0.22 + i * 0.13, 0.33, 0.94 + 0.0), 'mcd_red', d,
            bevel=0.006, segments=1)
    # heat lamp over the dump
    for sx in (-0.28, 0.28):
        cyl(_n(g, 'hl_post'), 0.014, 0.6, (sx, 0.3, 1.2), 'metal', d, verts=8)
    box(_n(g, 'hl_bar'), (0.62, 0.3, 0.07), (0, 0.18, 1.5), 'metal', d, bevel=0.02)
    box(_n(g, 'hl_glow'), (0.52, 0.2, 0.015), (0, 0.18, 1.462), 'lampshade', d, bevel=0.004, segments=1)
    # salt shaker
    lathe(_n(g, 'salt'), [(0.03, 0), (0.035, 0.08), (0.03, 0.1), (0.015, 0.12)], (0.26, -0.28, 0.9), 'metal', d, verts=10)
    return g


def grill(name='grill', location=(0, 0, 0), rotation=0, w=1.3, interact='fryer', seed=3):
    """Flat-top grill on a stainless base: black griddle with patties (some with cheese), a spatula, scraper,
    grease trough and a bun tray. Back at local +Y, crew stands on -Y."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, interact=interact)
    _steel_base(g, w, 0.8, 0.84, doors=2)
    box(_n(g, 'body'), (w, 0.8, 0.08), (0, 0, 0.86), 'metal', g, bevel=0.015)
    box(_n(g, 'plate'), (w - 0.1, 0.62, 0.035), (0, 0.02, 0.915), 'metal_dark', g, bevel=0.01)
    box(_n(g, 'splash'), (w, 0.04, 0.22), (0, 0.38, 1.02), 'metal', g, bevel=0.012)
    for sx in (-1, 1):
        box(_n(g, 'side'), (0.04, 0.7, 0.12), (sx * (w / 2 - 0.02), 0.03, 0.97), 'metal', g, bevel=0.01)
    box(_n(g, 'trough'), (w - 0.08, 0.06, 0.04), (0, -0.33, 0.9), 'metal', g, bevel=0.01)
    # knobs
    for i in range(4):
        cyl(_n(g, 'knob'), 0.02, 0.025, (-w / 2 + 0.2 + i * (w - 0.4) / 3, -0.41, 0.8), 'plastic_black', g,
            rot=(90, 0, 0), verts=10, bevel=0.004, segments=1)
    # patties in a 2 x 4 grid, a few with cheese, one being flipped
    for r in range(2):
        for c in range(4):
            px = -w / 2 + 0.22 + c * (w - 0.44) / 3 + rng.uniform(-0.02, 0.02)
            py = -0.12 + r * 0.24 + rng.uniform(-0.02, 0.02)
            cyl(_n(g, 'patty'), 0.058, 0.018, (px, py, 0.942), 'wood_dark', g, verts=12, bevel=0.004, segments=1)
            if (r + c) % 3 == 0:
                box(_n(g, 'cheese'), (0.085, 0.085, 0.004), (px, py, 0.953), 'mcd_yellow', g,
                    rot=(0, 0, rng.uniform(30, 60)), bevel=0.001, segments=1)
    # spatula + scraper resting on the edge
    sp = B.group(_n(g, 'spatula'), (w / 2 - 0.2, -0.26, 0.95), (0, 0, -30), g)
    box(_n(g, 'sp_blade'), (0.11, 0.13, 0.006), (0, 0.06, 0), 'metal', sp, bevel=0.002, segments=1)
    box(_n(g, 'sp_handle'), (0.03, 0.18, 0.025), (0, -0.1, 0.03), 'plastic_black', sp, rot=(18, 0, 0), bevel=0.01)
    # a bun tray on the splash shelf
    box(_n(g, 'shelf'), (w, 0.2, 0.025), (0, 0.3, 1.17), 'metal', g, bevel=0.006, segments=1)
    for i in range(5):
        blob(_n(g, 'bun'), (0.1, 0.1, 0.05), (-w / 2 + 0.15 + i * 0.24, 0.3, 1.207), 'wood_light', g, round_xy=0.95,
             round_z=0.8, segs=10, rings=4)
    return g


def prep_table(name='prep', location=(0, 0, 0), rotation=0, w=1.2, seed=4, toaster=True):
    """Stainless prep table: bun toaster, sauce guns, a tray of lettuce/tomato/pickles, wrapped burgers."""
    rng = random.Random(seed)
    g = _g(name, location, rotation)
    box(_n(g, 'top'), (w, 0.75, 0.04), (0, 0, 0.88), 'metal', g, bevel=0.012)
    box(_n(g, 'lip'), (w, 0.04, 0.1), (0, 0.355, 0.93), 'metal', g, bevel=0.01)
    box(_n(g, 'shelf'), (w - 0.1, 0.65, 0.025), (0, 0, 0.25), 'metal', g, bevel=0.006, segments=1)
    for lx in (-w / 2 + 0.05, w / 2 - 0.05):
        for ly in (-0.32, 0.32):
            cyl(_n(g, 'leg'), 0.02, 0.86, (lx, ly, 0.43), 'metal', g, verts=8)
    # boxes on the lower shelf
    for k in range(2):
        box(_n(g, 'lowbox'), (0.38, 0.3, 0.2), (-w / 2 + 0.3 + k * 0.45, 0.05, 0.36), 'kraft', g, bevel=0.012)
    if toaster:
        t = B.group(_n(g, 'toaster'), (-w / 2 + 0.27, 0.12, 0.9), 0, g)
        box(_n(g, 'ts_body'), (0.4, 0.4, 0.55), (0, 0, 0.275), 'metal', t, bevel=0.03)
        box(_n(g, 'ts_front'), (0.34, 0.02, 0.3), (0, -0.2, 0.3), 'metal_dark', t, bevel=0.01)
        box(_n(g, 'ts_chute'), (0.3, 0.12, 0.05), (0, -0.24, 0.06), 'metal', t, bevel=0.01)
        box(_n(g, 'ts_top'), (0.36, 0.06, 0.06), (0, 0.1, 0.58), 'plastic_black', t, bevel=0.012)
        for k in range(3):
            blob(_n(g, 'ts_bun'), (0.09, 0.09, 0.035), (-0.1 + k * 0.1, -0.24, 0.1), 'wood_light', t, round_xy=0.95,
                 round_z=0.7, segs=10, rings=4)
    # topping insert tray
    tx = 0.12 if toaster else -0.2
    box(_n(g, 'insert'), (0.46, 0.3, 0.06), (tx, 0.1, 0.93), 'metal_dark', g, bevel=0.01)
    for k, (m, n) in enumerate((('plant', 7), ('mcd_red', 5), ('plant_dark', 8))):
        for i in range(n):
            sphere(_n(g, 'topping'), 0.022, (tx - 0.15 + k * 0.15 + rng.uniform(-0.04, 0.04),
                                             0.1 + rng.uniform(-0.1, 0.1), 0.965), m, g, scale=(1, 1, 0.45), segs=7,
                   rings=4)
    # sauce guns + bottles
    for k, m in enumerate(('mcd_red', 'mcd_yellow', 'paper')):
        lathe(_n(g, 'sauce'), [(0.03, 0), (0.033, 0.02), (0.031, 0.15), (0.014, 0.18), (0.005, 0.22)],
              (w / 2 - 0.3 + k * 0.08, 0.25, 0.9), m, g, verts=10)
    # wrapped burgers + a couple of boxes ready to go
    for k in range(3):
        blob(_n(g, 'wrapped'), (0.11, 0.11, 0.05), (w / 2 - 0.35 + k * 0.12, -0.2, 0.925),
             'paper' if k % 2 else 'fabric_mustard', g, round_xy=0.8, round_z=0.6, segs=10, rings=4)
    return g


def bun_rack(name='bun_rack', location=(0, 0, 0), rotation=0, seed=6, trays=7):
    """Rolling speed rack with trays of buns (open side local -Y)."""
    g = _g(name, location, rotation)
    w, d, h = 0.52, 0.62, 1.7
    for lx in (-w / 2, w / 2):
        for ly in (-d / 2, d / 2):
            box(_n(g, 'post'), (0.03, 0.03, h), (lx, ly, 0.08 + h / 2), 'metal', g, bevel=0.006, segments=1)
            cyl(_n(g, 'caster'), 0.035, 0.04, (lx, ly, 0.035), 'metal_dark', g, rot=(0, 90, 0), verts=8)
    box(_n(g, 'cap'), (w + 0.04, d + 0.04, 0.03), (0, 0, 0.08 + h), 'metal', g, bevel=0.008, segments=1)
    rng = random.Random(seed)
    for t in range(trays):
        z = 0.2 + t * 0.22
        box(_n(g, 'tray'), (w - 0.02, d - 0.02, 0.02), (0, 0, z), 'metal_dark', g, bevel=0.005, segments=1)
        if t == 2:
            continue
        n = 6 if rng.random() < 0.8 else 3
        for i in range(n):
            bx = -0.13 + (i % 2) * 0.26
            by = -0.2 + (i // 2) * 0.2
            sphere(_n(g, 'bun'), 0.065, (bx, by, z + 0.02), 'wood_light', g, scale=(1, 1, 0.5), segs=8, rings=4)
    return g


def soft_serve(name='soft_serve', location=(0, 0, 0), rotation=0):
    """Soft-serve machine on a base... with yellow/black hazard tape across it (it is broken, of course)."""
    g = _g(name, location, rotation)
    box(_n(g, 'cab'), (0.62, 0.72, 0.8), (0, 0, 0.4), 'metal', g, bevel=0.02)
    box(_n(g, 'body'), (0.6, 0.7, 0.72), (0, 0.0, 1.16), 'metal', g, bevel=0.035)
    box(_n(g, 'face'), (0.5, 0.02, 0.38), (0, -0.36, 1.2), 'plastic_white', g, bevel=0.01)
    for k in range(2):
        cyl(_n(g, 'hopper'), 0.1, 0.12, (-0.14 + k * 0.28, 0.1, 1.58), 'metal', g, verts=14)
        cyl(_n(g, 'hopper_lid'), 0.11, 0.02, (-0.14 + k * 0.28, 0.1, 1.65), 'plastic_white', g, verts=14)
    for k in range(3):
        x = -0.15 + k * 0.15
        cyl(_n(g, 'spout'), 0.025, 0.08, (x, -0.4, 0.98), 'plastic_white', g, verts=10)
        box(_n(g, 'handle'), (0.03, 0.12, 0.02), (x, -0.44, 1.08), 'mcd_red', g, rot=(-25, 0, 0), bevel=0.006)
    box(_n(g, 'drip'), (0.5, 0.18, 0.03), (0, -0.44, 0.83), 'metal_dark', g, bevel=0.008)
    # hazard tape: yellow band with black diagonal stripes (no text)
    t = B.group(_n(g, 'tape'), (0, -0.375, 1.05), (0, 18, 0), g)
    box(_n(g, 'tape_band'), (0.78, 0.006, 0.06), (0, 0, 0), 'mcd_yellow', t, bevel=0.001, segments=1)
    for k in range(7):
        box(_n(g, 'tape_stripe'), (0.028, 0.004, 0.075), (-0.33 + k * 0.11, -0.004, 0), 'plastic_black', t,
            rot=(0, 40, 0), bevel=0.001, segments=1)
    # a sad little cone on top
    lathe(_n(g, 'cone'), [(0.0, 0), (0.035, 0.1)], (0.2, -0.22, 1.52), 'wood_light', g, verts=10, cap_top=True)
    return g


def hand_sink(name='hand_sink', location=(0, 0, 0), rotation=0):
    """Small stainless hand sink on legs + soap and a towel dispenser (back local +Y)."""
    g = _g(name, location, rotation)
    box(_n(g, 'bowl'), (0.45, 0.4, 0.22), (0, 0.0, 0.8), 'metal', g, bevel=0.03)
    box(_n(g, 'well'), (0.36, 0.3, 0.02), (0, -0.01, 0.905), 'metal_dark', g, bevel=0.01)
    box(_n(g, 'splash'), (0.45, 0.04, 0.3), (0, 0.19, 1.05), 'metal', g, bevel=0.012)
    tube(_n(g, 'faucet'), [(0, 0.16, 1.05), (0, 0.16, 1.15), (0, 0.08, 1.17), (0, 0.04, 1.12)], 0.012, 'metal', g, res=6)
    cyl(_n(g, 'drain'), 0.03, 0.62, (0, 0.1, 0.38), 'metal', g, verts=8)
    box(_n(g, 'soap'), (0.08, 0.06, 0.16), (-0.3, 0.17, 1.2), 'plastic_white', g, bevel=0.01)
    box(_n(g, 'towels'), (0.28, 0.12, 0.3), (0.0, 0.15, 1.5), 'plastic_white', g, bevel=0.02)
    box(_n(g, 'towel_slot'), (0.18, 0.02, 0.03), (0.0, 0.085, 1.37), 'paper', g, bevel=0.004, segments=1)
    return g


def hood(name='hood', location=(0, 0, 0), rotation=0, w=3.0, d=0.95, h=0.38, parent='root'):
    """Kitchen extraction canopy; location = bottom centre at the wall face (back at local +Y). Parent to a wall."""
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    pts = [(0.0, 0.0), (0.0, h), (-d + 0.15, h), (-d, 0.15), (-d, 0.0)]      # (y, z) side profile, CCW
    prism(_n(g, 'canopy'), pts, w, (-w / 2, 0, 0), 'metal', g, rot=(90, 0, 90), bevel=0.02, segments=2)
    box(_n(g, 'glow'), (w - 0.3, 0.12, 0.012), (0, -d + 0.3, -0.004), 'lampshade', g, bevel=0.003, segments=1)
    return g


def walkin_door(name='walkin', location=(0, 0, 0), rotation=0, parent='root'):
    """Walk-in cooler door panel mounted on a wall (location = bottom centre on the wall face, front local -Y)."""
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    box(_n(g, 'frame'), (1.0, 0.06, 2.15), (0, -0.03, 1.075), 'metal', g, bevel=0.02)
    box(_n(g, 'door'), (0.86, 0.05, 1.98), (0, -0.07, 1.02), 'metal', g, bevel=0.02)
    box(_n(g, 'handle'), (0.08, 0.1, 0.3), (0.34, -0.12, 1.1), 'metal_dark', g, bevel=0.02)
    box(_n(g, 'window'), (0.22, 0.02, 0.3), (0, -0.1, 1.55), 'window_glass', g, bevel=0.01)
    box(_n(g, 'kick'), (0.86, 0.02, 0.25), (0, -0.1, 0.16), 'metal_dark', g, bevel=0.006, segments=1)
    for zz in (0.35, 1.7):
        box(_n(g, 'hinge'), (0.08, 0.06, 0.12), (-0.43, -0.1, zz), 'metal_dark', g, bevel=0.012)
    # snowflake pictogram: three crossing bars (no text)
    for k in range(3):
        box(_n(g, 'snow'), (0.02, 0.006, 0.16), (0, -0.1, 1.95), 'poster_b', g, rot=(0, k * 60, 0), bevel=0.002,
            segments=1)
    return g


def crew_board(name='crew_board', location=(0, 0, 0), rotation=0, seed=8, parent='root'):
    """Cork board with sticky notes, a schedule grid and a photo of the 'employee of the month' (no text)."""
    rng = random.Random(seed)
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    box(_n(g, 'frame'), (0.9, 0.03, 0.6), (0, -0.015, 0), 'wood_mid', g, bevel=0.01)
    box(_n(g, 'cork'), (0.82, 0.01, 0.52), (0, -0.034, 0), 'kraft', g, bevel=0.003, segments=1)
    # schedule sheet with a grid of coloured blocks
    box(_n(g, 'sheet'), (0.3, 0.004, 0.4), (-0.2, -0.041, 0.0), 'paper', g, bevel=0.001, segments=1)
    for r in range(5):
        for c in range(3):
            if rng.random() < 0.6:
                box(_n(g, 'shift'), (0.07, 0.003, 0.05), (-0.29 + c * 0.09, -0.044, 0.14 - r * 0.07),
                    rng.choice(['mcd_red', 'mcd_yellow', 'poster_b', 'plant']), g, bevel=0.001, segments=1)
    for k in range(5):
        box(_n(g, 'note'), (0.08, 0.004, 0.08), (0.08 + (k % 3) * 0.1, -0.041, 0.14 - (k // 3) * 0.12),
            rng.choice(['mcd_yellow', 'fabric_coral', 'rug_green', 'wall_sky']), g, rot=(0, rng.uniform(-10, 10), 0),
            bevel=0.001, segments=1)
    # employee of the month frame
    box(_n(g, 'photo_f'), (0.14, 0.006, 0.16), (0.3, -0.042, -0.16), 'mcd_yellow', g, bevel=0.002, segments=1)
    box(_n(g, 'photo'), (0.1, 0.004, 0.12), (0.3, -0.046, -0.16), 'wall_sky', g, bevel=0.001, segments=1)
    sphere(_n(g, 'photo_head'), 0.025, (0.3, -0.049, -0.15), 'fabric_coral', g, scale=(1, 0.3, 1), segs=8, rings=4)
    for k in range(3):
        sphere(_n(g, 'pin'), 0.008, (-0.35 + k * 0.3, -0.05, 0.22), 'mcd_red', g, segs=6, rings=4)
    return g


def logo_badge(name='logo', location=(0, 0, 0), rotation=0, r=0.35, parent='root', neon=False):
    """Round McDoodle's brand mark: red disc, yellow rim, a doodled smiling burger (no letters). Facing -Y;
    location = centre of its back on the wall."""
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    cyl(_n(g, 'disc'), r, 0.04, (0, -0.02, 0), 'mcd_red', g, rot=(90, 0, 0), verts=32, bevel=0.012)
    torus(_n(g, 'rim'), r, 0.025, (0, -0.04, 0), 'neon_yellow' if neon else 'mcd_yellow', g, rot=(90, 0, 0), major=32,
          minor=6)
    icon_burger(g, 0, 0.02, r / 0.2, -0.042)
    return g


def neon_burger(name='neon_burger', location=(0, 0, 0), rotation=0, s=1.0, parent='root'):
    """Neon outline of a burger (bun dome, patty line, bun base) on a clear backing; facing -Y."""
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    box(_n(g, 'backing'), (0.8 * s, 0.015, 0.6 * s), (0, -0.01, 0), 'window_glass', g, bevel=0.008, segments=1)
    dome = [(0.3 * s * math.cos(a), -0.03, 0.05 * s + 0.22 * s * math.sin(a)) for a in [math.pi * i / 12 for i in range(13)]]
    tube(_n(g, 'n_dome'), dome + [dome[0]], 0.012, 'neon_yellow', g, res=6)
    zig = [(-0.3 * s + 0.6 * s * i / 10, -0.03, -0.02 * s + (0.025 * s if i % 2 else -0.01 * s)) for i in range(11)]
    tube(_n(g, 'n_lettuce'), zig, 0.01, 'neon_green', g, res=6)
    tube(_n(g, 'n_patty'), [(-0.3 * s, -0.03, -0.09 * s), (0.3 * s, -0.03, -0.09 * s)], 0.014, 'neon_orange', g, res=6)
    base = [(-0.28 * s, -0.03, -0.16 * s), (0.28 * s, -0.03, -0.16 * s), (0.25 * s, -0.03, -0.22 * s),
            (-0.25 * s, -0.03, -0.22 * s), (-0.28 * s, -0.03, -0.16 * s)]
    tube(_n(g, 'n_base'), base, 0.012, 'neon_yellow', g, res=6)
    return g


def wall_band(side, z0, z1, mat, holes=(), off=0.012, inset=0.0, name=None):
    """A flat band (wainscot / stripe) on the inner face of wall `side` from z0 to z1, split around `holes`
    [(at, width, sill, top)] where the band overlaps them. Parented to the wall. Returns the created meshes."""
    import room as R
    w, d = R.ROOM['w'], R.ROOM['d']
    lo, hi = (-w / 2, w / 2) if side in ('n', 's') else (-d / 2, d / 2)
    lo += inset
    hi -= inset
    cuts = []
    for at, width, sill, top in holes:
        if sill < z1 and top > z0:
            cuts.append((at - width / 2 - 0.06, at + width / 2 + 0.06))
    cuts.sort()
    segs, pos = [], lo
    for a, b in cuts:
        if a > pos:
            segs.append((pos, a))
        pos = max(pos, b)
    if pos < hi:
        segs.append((pos, hi))
    out = []
    for a, b in segs:
        if b - a < 0.04:
            continue
        c, ln = (a + b) / 2, b - a
        p = R.wall_point(side, c, (z0 + z1) / 2, off / 2)
        size = (ln, off, z1 - z0) if side in ('n', 's') else (off, ln, z1 - z0)
        o = box(name or f'band_{side}', size, p, mat, None, bevel=0.004, segments=1)
        B.reparent(o, R.wall(side))
        out.append(o)
    return out


def sconce(name='sconce', location=(0, 0, 1.9), rotation=0, mat='mcd_red', parent='root'):
    """Wall sconce: a half-dome shade over a glowing bulb; location = centre of its back plate on the wall."""
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    cyl(_n(g, 'plate'), 0.06, 0.02, (0, -0.01, 0), 'metal', g, rot=(90, 0, 0), verts=12, bevel=0.004, segments=1)
    tube(_n(g, 'arm'), [(0, -0.02, 0), (0, -0.12, 0.02), (0, -0.16, 0.08)], 0.01, 'metal', g, res=6)
    lathe(_n(g, 'shade'), [(0.13, 0.0), (0.12, 0.04), (0.08, 0.1), (0.02, 0.13)], (0, -0.18, 0.02), mat, g,
          verts=16, cap_bottom=False, cap_top=True)
    sphere(_n(g, 'bulb'), 0.045, (0, -0.18, 0.04), 'lampshade', g, segs=10, rings=6)
    return g


def mop_bucket(name='mop_bucket', location=(0, 0, 0), rotation=0):
    """Yellow mop bucket with wringer and a mop leaning in it."""
    g = _g(name, location, rotation)
    box(_n(g, 'bucket'), (0.42, 0.3, 0.3), (0, 0, 0.2), 'mcd_yellow', g, bevel=0.04)
    box(_n(g, 'water'), (0.34, 0.22, 0.02), (0.04, 0, 0.34), 'wall_sky', g, bevel=0.005, segments=1)
    box(_n(g, 'wringer'), (0.14, 0.26, 0.14), (-0.12, 0, 0.42), 'plastic_grey', g, bevel=0.02)
    for sx in (-0.15, 0.15):
        for sy in (-0.1, 0.1):
            cyl(_n(g, 'wheel'), 0.025, 0.02, (sx, sy, 0.025), 'plastic_black', g, rot=(90, 0, 0), verts=8)
    tube(_n(g, 'mop'), [(0.08, 0, 0.3), (0.12, 0.05, 0.9), (0.14, 0.08, 1.35)], 0.014, 'wood_light', g, res=6)
    blob(_n(g, 'mop_head'), (0.16, 0.16, 0.12), (0.08, 0, 0.3), 'paper', g, round_xy=0.8, round_z=0.8, segs=8, rings=4)
    return g


def mascot(name='mascot', location=(0, 0, 0), rotation=0, balloons=True, seed=3, scale=1.0):
    """The McDoodle's mascot statue: a big smiling burger on skinny legs with sneakers and white gloves, one hand
    waving, the other holding a bunch of balloons. ~1.5 m tall, facing local -Y."""
    rng = random.Random(seed)
    g = _g(name, location, rotation)
    cyl(_n(g, 'plinth'), 0.36, 0.1, (0, 0, 0.05), 'mcd_red', g, verts=24, bevel=0.02, segments=2)
    cyl(_n(g, 'plinth_top'), 0.33, 0.02, (0, 0, 0.11), 'mcd_yellow', g, verts=24, bevel=0.006)
    for sx in (-1, 1):
        tube(_n(g, 'leg'), [(sx * 0.1, 0, 0.14), (sx * 0.11, 0, 0.45), (sx * 0.1, 0, 0.62)], 0.028, 'plastic_white', g,
             res=8)
        blob(_n(g, 'shoe'), (0.13, 0.24, 0.09), (sx * 0.11, -0.05, 0.17), 'mcd_red', g, round_xy=0.7, round_z=0.7,
             segs=12, rings=5)
        box(_n(g, 'sole'), (0.13, 0.24, 0.025), (sx * 0.11, -0.05, 0.135), 'plastic_white', g, bevel=0.01)
    # burger body
    z0 = 0.6
    blob(_n(g, 'bun_b'), (0.72, 0.62, 0.16), (0, 0, z0 + 0.08), 'wood_light', g, round_xy=0.95, round_z=0.6, segs=24,
         rings=6)
    blob(_n(g, 'patty'), (0.76, 0.66, 0.12), (0, 0, z0 + 0.2), 'wood_dark', g, round_xy=0.95, round_z=0.5, segs=24,
         rings=5)
    cheese = [(0.4 * math.cos(a), 0.36 * math.sin(a)) for a in [2 * math.pi * i / 8 + math.pi / 8 for i in range(8)]]
    prism(_n(g, 'cheese'), cheese, 0.025, (0, 0, z0 + 0.25), 'mcd_yellow', g, bevel=0.008, segments=1)
    blob(_n(g, 'lettuce'), (0.8, 0.7, 0.06), (0, 0, z0 + 0.29), 'plant', g, round_xy=0.95, round_z=0.5, segs=24,
         rings=4, deform=lambda x, y, z: (x, y, z + 0.018 * math.sin(math.atan2(y, x) * 9)))
    blob(_n(g, 'bun_t'), (0.74, 0.64, 0.46), (0, 0, z0 + 0.31), 'wood_light', g, round_xy=0.95, round_z=0.95, segs=24,
         rings=10, deform=lambda x, y, z: (x, y, z if z > 0 else z * 0.15))
    for i in range(9):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.08, 0.28)
        zz = z0 + 0.31 + 0.23 * math.sqrt(max(0.0, 1 - (rr / 0.37) ** 2)) - 0.01
        if -math.cos(a) * rr > -0.05 and abs(math.sin(a) * rr) < 0.16 and zz < z0 + 0.46:
            continue                                            # keep the face clear
        box(_n(g, 'seed'), (0.035, 0.02, 0.012), (rr * math.cos(a), rr * math.sin(a), zz), 'paper', g,
            rot=(0, 0, rng.uniform(0, 180)), bevel=0.0)
    # face on the front of the top bun
    for sx in (-0.1, 0.1):
        sphere(_n(g, 'eye_w'), 0.065, (sx, -0.27, z0 + 0.46), 'plastic_white', g, scale=(1, 0.5, 1.15), segs=12,
               rings=6)
        sphere(_n(g, 'eye'), 0.03, (sx + 0.008, -0.3, z0 + 0.45), 'plastic_black', g, scale=(1, 0.5, 1.2), segs=8,
               rings=5)
    tube(_n(g, 'smile'), [(0.13 * math.cos(a), -0.3 - 0.04 * math.sin(a) * 0, z0 + 0.37 + 0.06 * math.sin(a))
                          for a in [math.pi + math.pi * k / 8 for k in range(9)]], 0.014, 'mcd_red', g, res=6)
    for sx in (-0.2, 0.2):
        sphere(_n(g, 'cheek'), 0.035, (sx, -0.27, z0 + 0.39), 'fabric_coral', g, scale=(1, 0.4, 0.7), segs=8, rings=4)
    # arms: left waves up, right holds the balloon strings
    tube(_n(g, 'arm_l'), [(-0.36, 0, z0 + 0.22), (-0.5, -0.02, z0 + 0.35), (-0.55, -0.04, z0 + 0.6)], 0.022,
         'plastic_white', g, res=8)
    sphere(_n(g, 'glove_l'), 0.06, (-0.56, -0.05, z0 + 0.66), 'plastic_white', g, scale=(1, 0.7, 1.15), segs=12, rings=6)
    tube(_n(g, 'arm_r'), [(0.36, 0, z0 + 0.22), (0.48, -0.04, z0 + 0.14), (0.52, -0.08, z0 + 0.2)], 0.022,
         'plastic_white', g, res=8)
    sphere(_n(g, 'glove_r'), 0.06, (0.53, -0.09, z0 + 0.22), 'plastic_white', g, scale=(1, 1, 1), segs=12, rings=6)
    if balloons:
        # the balloons are their own (non-obstacle) group so they do not widen the statue's walk footprint
        bg = _g(name + '_balloons', location, rotation, obstacle=False)
        hand = (0.53, -0.09, z0 + 0.25)
        for k, (bx, by, bz, m) in enumerate(((0.62, 0.0, 1.85, 'mcd_red'), (0.42, 0.12, 1.95, 'mcd_yellow'),
                                             (0.75, 0.15, 2.02, 'mcd_red'), (0.55, -0.12, 2.1, 'plastic_white'))):
            tube(_n(g, 'string'), B.bezier(hand, (hand[0], hand[1], hand[2] + 0.5), (bx, by, bz - 0.5),
                                            (bx, by, bz - 0.17), 6), 0.003, 'plastic_white', bg, res=4, caps=False)
            sphere(_n(g, 'balloon'), 0.15, (bx, by, bz), m, bg, scale=(1, 1, 1.18), segs=14, rings=8)
            cone(_n(g, 'knot'), 0.02, 0.03, (bx, by, bz - 0.2), m, bg, verts=6, r2=0.0)
        bg.scale = (scale, scale, scale)
    g.scale = (scale, scale, scale)
    return g


def cone(*a, **k):
    return B.cone(*a, **k)


def floor_mat(name='floor_mat', location=(0, 0, 0), rotation=0, size=(1.2, 0.6), mat='plastic_black', holes=True,
              parent='root'):
    """Anti-fatigue rubber mat (flat, not an obstacle; the name keeps it out of the shadow pass)."""
    g = _g(name, location, rotation, obstacle=False, parent=parent)
    box(_n(g, 'mat'), (size[0], size[1], 0.014), (0, 0, 0.007), mat, g, bevel=0.006, segments=1)
    if holes:
        nx, ny = int(size[0] / 0.12), int(size[1] / 0.12)
        for i in range(nx):
            for j in range(ny):
                box(_n(g, 'hole'), (0.05, 0.05, 0.004), (-size[0] / 2 + 0.06 + i * size[0] / nx + 0.0,
                                                          -size[1] / 2 + 0.06 + j * size[1] / ny, 0.0135),
                    'metal_dark', g, bevel=0.0)
    return g
