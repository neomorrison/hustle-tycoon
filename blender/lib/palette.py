"""Shared colour palette and material factory (docs/3D.md section 4).

Every material in a file is created once and cached by name, so two objects with the same colour always share
one material (one glTF material, fewer draw calls at runtime).

    from palette import get_mat
    obj.data.materials.append(get_mat('wood_light'))     # 'm_wood_light'
    get_mat('m_screen')                                  # special materials keep their exact names

Names may be given with or without the ``m_`` prefix. Unknown names raise KeyError (typos should fail loudly),
except ``neon_<colour>`` which accepts any key of NEON.
"""
import bpy

# --- docs/3D.md section 4 palette (sRGB hex) -------------------------------------------------------------------
PALETTE = {
    'wood_light': '#d9b48a', 'wood_mid': '#b07e55', 'wood_dark': '#6f4b33',
    'wall_cream': '#f2e6d3', 'wall_sage': '#cdd9c4', 'wall_blush': '#efd2cc', 'wall_sky': '#cddff0',
    'wall_panel': '#a8744c', 'brick': '#b5654d', 'concrete': '#a8a29a', 'tile_white': '#eef0ef',
    'tile_check_dark': '#3d3d45',
    'fabric_blue': '#6f8fbf', 'fabric_navy': '#3e4f75', 'fabric_mustard': '#e2b24c', 'fabric_teal': '#4f9a93',
    'fabric_coral': '#e88c73', 'fabric_grey': '#a7a3a0', 'fabric_cream': '#efe4cf',
    'carpet_beige': '#cdb89a', 'rug_rose': '#d99a9a', 'rug_green': '#8fae8a',
    'mcd_red': '#d8352a', 'mcd_yellow': '#f5c342', 'poster_a': '#f08a5d', 'poster_b': '#6c8ebf',
    'metal': '#b9bfc7', 'metal_dark': '#3c4048', 'plastic_black': '#2b2d33', 'plastic_white': '#f3f2ef',
    'plastic_grey': '#9aa0a8', 'plant': '#5e9e55', 'plant_dark': '#3d7a42', 'terracotta': '#c7704b',
    'paper': '#f7f3ea', 'slab': '#8b7f74',
    # additions (documented in blender/README.md): shipping-box kraft from docs/3D.md section 7
    'kraft': '#c9a36b',
}

# roughness / metallic per palette entry (default roughness 0.72, metallic 0)
ROUGH = {
    'metal': 0.35, 'metal_dark': 0.4, 'plastic_black': 0.45, 'plastic_white': 0.5, 'plastic_grey': 0.5,
    'tile_white': 0.4, 'tile_check_dark': 0.45, 'wood_light': 0.62, 'wood_mid': 0.6, 'wood_dark': 0.58,
    'fabric_blue': 0.9, 'fabric_navy': 0.9, 'fabric_mustard': 0.9, 'fabric_teal': 0.9, 'fabric_coral': 0.9,
    'fabric_grey': 0.9, 'fabric_cream': 0.9, 'carpet_beige': 0.9, 'rug_rose': 0.9, 'rug_green': 0.9,
    'concrete': 0.85, 'brick': 0.85, 'slab': 0.85, 'paper': 0.8, 'plant': 0.6, 'plant_dark': 0.6,
    'mcd_red': 0.5, 'mcd_yellow': 0.5, 'kraft': 0.85,
}
METALLIC = {'metal': 0.8, 'metal_dark': 0.6}

# always-emissive neon accents: use get_mat('neon_pink') etc.
NEON = {
    'pink': '#ff5fa2', 'cyan': '#5fe3ff', 'yellow': '#ffe066', 'purple': '#b77dff', 'orange': '#ff9a4d',
    'green': '#6dff9a', 'red': '#ff4d4d', 'blue': '#5f8bff',
}

SPECIAL = ('screen', 'window_glass', 'window_sky', 'lampshade')


def srgb_to_linear(c):
    """Convert one sRGB channel (0..1) to linear."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h, alpha=1.0):
    """'#rrggbb' -> (r, g, b, a) linear floats, the form Blender colour sockets expect."""
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def _principled(name, hexcol, rough=0.72, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    """Create a Principled BSDF material (no textures)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = hex_to_linear(hexcol)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = hex_to_linear(emit)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
        try:
            m.blend_method = 'BLEND'
        except Exception:
            pass
        m.use_transparent_shadow = True
    m.diffuse_color = hex_to_linear(hexcol, alpha)   # viewport / solid colour
    m.roughness = rough
    return m


def _make(key):
    """Build material ``m_<key>`` (key without prefix)."""
    name = 'm_' + key
    if key in PALETTE:
        return _principled(name, PALETTE[key], ROUGH.get(key, 0.72), METALLIC.get(key, 0.0))
    if key == 'screen':
        return _principled(name, '#8fd0ff', 0.3, 0.0, emit='#8fd0ff', emit_strength=1.0)
    if key == 'window_glass':
        return _principled(name, '#bfe3f5', 0.35, 0.0, alpha=0.35)
    if key == 'window_sky':
        # unlit-looking: emissive so the sky reads bright behind the glass in previews too
        return _principled(name, '#bfe3f5', 0.9, 0.0, emit='#bfe3f5', emit_strength=0.6)
    if key == 'lampshade':
        # warm, slightly glowing even by day (the runtime boosts emission at night)
        return _principled(name, '#fbe7c2', 0.8, 0.0, emit='#ffd9a0', emit_strength=0.25)
    if key.startswith('neon_'):
        col = NEON[key[5:]]
        return _principled(name, col, 0.4, 0.0, emit=col, emit_strength=4.0)
    raise KeyError(f'unknown material "{key}" (palette keys: {sorted(PALETTE)}; specials: {SPECIAL}; neon_*: {sorted(NEON)})')


def get_mat(name):
    """Return the shared material for a palette/special name ('wood_light' or 'm_wood_light'), creating it once."""
    key = name[2:] if name.startswith('m_') else name
    full = 'm_' + key
    m = bpy.data.materials.get(full)
    if m is None:
        m = _make(key)
        if m.name != full:        # a stale datablock held the name; force it
            m.name = full
    return m


def custom_mat(name, hexcol, rough=0.72, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    """Get-or-create an extra named material ``m_<name>`` for colours not in the palette. Use sparingly and list it
    in blender/README.md (e.g. character colours are the character builder's business, not this helper's)."""
    full = name if name.startswith('m_') else 'm_' + name
    m = bpy.data.materials.get(full)
    if m is None:
        m = _principled(full, hexcol, rough, metal, emit, emit_strength, alpha)
    return m


def all_names():
    """Every material key get_mat accepts (without prefix), for docs and tests."""
    return sorted(PALETTE) + list(SPECIAL) + ['neon_' + k for k in sorted(NEON)]
