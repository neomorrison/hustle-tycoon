# blender/ : headless asset pipeline

Python scripts that headless Blender 5.1 runs to build the game's GLB models (rooms, character, props) plus the
2D fallback stills. The contract every asset must meet is **docs/3D.md** (it wins over this file). This README is
the manual for the shared library in `blender/lib/`; room builders should not need to read the lib source.

```
blender/
  run.mjs            node runner (build targets, previews, stills)
  inspect.mjs        GLB inspector + contract checks + walk-grid check (no npm deps)
  lib/palette.py     palette + material factory (docs/3D.md section 4)
  lib/build.py       primitives, groups, anchors, lights, merge + export, preview renders
  lib/room.py        room shell: floor, slab, walls with real openings, trims, wall helpers
  lib/furniture.py   furniture catalogue (+ lib/furniture2.py, re-exported: always call F.<name>)
  lib/catalog.py     renders every catalogue item to .previews/catalog_<row>.png (see what exists)
  lib/gen_api.py     regenerates the API section of this README from the docstrings
  rooms/<id>.py      one script per room (tier0..tier5, mcdoodles, title_city, studio); rooms/_sample.py = lib demo
  character/         character.py (rig, meshes, morphs, clips)
  props/props.py     props.glb (hand props, gear props, box_stack_unit)
  stills.py          room stills (.webp) + hotspots.json + seats.json for the 2D fallback
  .previews/ .out/   renders and scratch output (gitignored)
```

## Running

```sh
node blender/run.mjs tier0                 # build public/assets/3d/tier0.glb
node blender/run.mjs tier0 --preview       # ... and render blender/.previews/tier0_*.png
node blender/run.mjs tier0 tier1 props     # several targets
node blender/run.mjs all                   # every room (not _*), character, props
node blender/run.mjs all --stills          # ... then stills + hotspots for every room built
node blender/run.mjs _sample --preview     # the lib demo room -> blender/.out/_sample.glb
node blender/run.mjs tier0 -- --out D:/tmp/x.glb   # args after -- go to the script (cli_args()['out'])
node blender/run.mjs tier0 --verbose       # also show exporter / render progress noise
```

Targets are script names (no `.py`) in `rooms/`, `character/`, `props/`, plus `stills`. Blender is found via env
`BLENDER`, else `C:/Program Files/Blender Foundation/Blender 5.1/blender.exe`, else the newest `Blender x.y` there,
else `blender` on PATH. Each script runs with `--background --factory-startup --python-exit-code 1`; the runner
streams its output and exits non-zero if any script raised (Python traceback) or Blender failed.

Direct call (same thing): `"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background
--factory-startup --python blender/rooms/tier0.py -- --preview`.

Catalogue sheet: `blender.exe --background --factory-startup --python blender/lib/catalog.py -- [row ...]`
renders `.previews/catalog_{beds,desks,chairs,computers,kitchen,kitchen_small,living,storage,plants,lights,creator,wall,openings}.png`.

## Checking a GLB

```sh
node blender/inspect.mjs public/assets/3d/tier0.glb                     # tree, extras, tris, materials, size
node blender/inspect.mjs public/assets/3d/tier0.glb --check room --walk # contract + reachability, exit 1 on violations
node blender/inspect.mjs public/assets/3d/tier0.glb --map --quiet       # ASCII walk map (north up)
node blender/inspect.mjs public/assets/3d/character.glb --check character
node blender/inspect.mjs public/assets/3d/props.glb --check props
node blender/inspect.mjs public/assets/3d/title_city.glb --check title
node blender/inspect.mjs public/assets/3d/studio.glb --check studio
```

- `--check room`: root `room` (top level) with extras `room, w, d, wallH`; `floor` {floor:true}, `slab`,
  `wall_n/e/s/w` {wall}; names lowercase `[a-z0-9_]` and unique; materials `m_*`; every `a_*` is an empty with
  `anchor` = its name minus `a_`; every `l_*` has `light` (lamp|ceiling|window), `color` #rrggbb, numeric
  `intensity`, `distance`; at least one light; interactive groups not parented to walls; budgets (90k tris, 2 MB,
  ~250 draw calls = mesh primitives). For `tier0..tier5`: interact keys `bed computer fridge door` (+`garage` in
  tier4), all home anchors of docs/3D.md section 5 (a_spawn, a_bed_lie/sit/stand, a_computer_sit/stand,
  a_fridge_stand, a_stove_stand, a_eat_sit, a_door_stand, a_door_exit, a_film_stand, a_idle_1..3, a_boxes_1
  {w,d,layers}, a_gear_desk {w,d}, a_gear_floor_1/2, a_garage_stand in tier4), `staffdesk_1..N` {staffdesk:n,
  obstacle} + `a_staff_<n>_sit` with N = 0,1,2,3,5,7; warnings for a couch without `a_couch_sit`, odd a_bed_lie
  height, anchors off the floor. `mcdoodles`: `counter fryer exit` + its anchor list. Other ids (e.g. `_sample`)
  skip the tier-specific part. Every room: a `gear` extra must name props.glb gear ids (comma list allowed) and an
  a_gear_desk `default` must be laptop_old / laptop_pro / workstation.
- `--check character`: rig + 20 bones, sockets under the hands, skinned `body` with the 7 material slots and the 4
  morphs, every `hair_*`, `top_*`, `acc_*` node, every clip name, root bone not translating horizontally in any clip,
  12k tris, 1.5 MB. `--check props`: every prop id as a top-level node, 0.8 MB. `--check title`: `a_cam` {fov},
  `a_cam_target`, lights, 120k tris. `--check studio`: root extras `room: "studio"`, `studio: true`, `floor`, `slab`,
  no walls (warning), `a_spawn` at the centre, a light, 20k tris, 0.5 MB.
- `--walk`: rebuilds the runtime grid: 0.2 m cells over the floor; blocked = inside (world AABB of each mesh under
  an `obstacle` group, or a `wall` node's own mesh) + 0.15 m padding. BFS (8-way, no corner cutting) from the free
  cell nearest `a_door_stand` (else `a_exit_stand`, `a_spawn`). An anchor is reachable if a reachable free cell lies
  within 1.0 m of it (anchors inside furniture, like chairs, are fine; `*_lie` anchors get 1.6 m because a king
  bed is 1.95 m wide). Leave >= 0.5 m between a couch and its coffee table, or `a_couch_sit` has no free cell
  near it. Skipped: `a_boxes_*`,
  `a_gear_desk`, `a_door_exit`, `a_exit_door`, `a_cam*`. It also warns when an anchor is only reachable through a
  path narrower than 0.8 m (3 free cells); `--strict` makes those violations. `--map` prints the grid:
  `#` blocked, `.` reachable, `:` free but cut off, letters = anchors (legend underneath).

## Coordinates, facing and anchors (read this twice)

- 1 unit = 1 m, Z up, floor top at z = 0 centred on the origin. **North = +Y, east = +X**, south = -Y, west = -X.
  The default camera looks from the south-east, so north and west are the visible back walls.
- All rotations you pass are **degrees**; a single number is a rotation about Z.
- **Front = local -Y** for characters, anchors and every furniture builder. Rotation 0 faces south (toward the
  camera side); 90 faces east; 180 faces north; -90 faces west.
  - Furniture against a wall: `rotation=B.against('n'|'e'|'s'|'w')` (n=0, w=90, e=-90, s=180) puts its back to that
    wall and its front into the room.
  - Anchors: `facing` is where the character LOOKS: a compass string `'n' 'e' 's' 'w' 'ne' ...`, a number (degrees as
    above), or an `(x, y)` point to look at. In glTF this becomes three.js +Z forward, so
    `actor.quaternion.copy(anchor.worldQuat)` just works.
- `frame=<group>` on `B.anchor` / `B.light` interprets `loc` and `facing` in that group's local frame, so anchors
  follow the furniture however you place it:

```python
fr = F.fridge('tall', location=(2.8, 0.6, 0), rotation=B.against('e'))   # back to the east wall, door faces west
B.anchor('a_fridge_stand', (0, -0.9, 0), 'n', frame=fr)   # 0.9 m in front of it (local -Y), looking at it (local +Y)
# In world terms: at (2.8 - 0.9, 0.6), facing EAST (toward the fridge). F.fridge(..., anchors=True) does the same
# at 0.55 m.
B.anchor('a_idle_1', (-1.5, -1.2, 0), 'w')                 # world coords, looking west
B.anchor('a_idle_2', (0.5, -1.0, 0), (0.5, 2.5))           # looking at the point (0.5, 2.5)
B.anchor('a_boxes_1', (2.4, -2.0, 0), 's', w=0.9, d=0.6, layers=3)   # extra extras
```

Anchor position = where the character's root (feet) goes; for seated/lying anchors it is the floor point (or the
mattress point for `a_bed_lie`) under the pelvis. Builders with `anchors=True` place their contract anchors for you:

| builder | anchors |
|---|---|
| `F.bed(..., anchors=True, anchor_side='right'/'left')` | a_bed_lie (mattress top 0.5 m, pelvis ~1.05 m from the headboard, facing the foot), a_bed_sit (edge on that side, facing out), a_bed_stand (0.5 m beside the bed, facing it) |
| `F.workstation(..., anchors='computer', gear_anchor='a_gear_desk')` | a_computer_sit (under the pelvis on the pulled-out chair, facing the desk), a_computer_stand (behind the chair), a_gear_desk (desk top, extras w=0.4 d=0.3) |
| `F.staff_desk_set(n, ...)` | group staffdesk_n {staffdesk:n, obstacle} + a_staff_n_sit |
| `F.fridge(..., anchors=True)` | a_fridge_stand (0.55 m in front) |
| `F.kitchen_run(..., anchors=True)` | a_stove_stand (0.5 m in front of the stove module, else the sink) |
| `F.door(..., anchors=True)` / `R.fill_opening(op, anchors=True)` | a_door_stand (0.7 m inside, facing the door), a_door_exit (in the doorway) |
| `F.couch(..., anchors=True)` | a_couch_sit (middle seat) |
| `F.dining_table(..., anchors_eat='a_eat_sit')`, `F.kitchen_island(..., anchors_eat='a_eat_sit')` | a seat facing the table / island |
| `F.metal_shelving(..., boxes_anchor='a_boxes_1')` | region anchor on the 2nd shelf {w, d, layers}; that shelf is left empty |
| `F.floor_lamp(..., light_anchor='l_x')`, `F.ceiling_light(..., light_anchor='l_x')` | light anchors at the bulb |

Anchors must be unique (a duplicate raises), so create each contract anchor once.

## Writing a room script

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import build as B, room as R, furniture as F

args = B.cli_args()          # {'preview': bool, 'stills': bool, 'out': str|None, 'rest': [...]}
B.clean_scene()
door = R.door_opening('n', 2.0)                                   # at = x along n/s walls, y along e/w walls
win = R.window_opening('w', 0.3, width=1.3, height=1.2, sill=0.95)
root = R.make_room('tier1', 6.0, 5.0, wall_mat={'n': 'wall_blush', 'w': 'wall_blush', 'e': 'wall_cream',
                   's': 'wall_cream'}, floor='planks', openings=[door, win])
R.fill_opening(door, style='hallway', anchors=True)               # door group (interactive 'door'), not on the wall
R.fill_opening(win, style='standard', curtains='fabric_coral')    # window parented to wall_w
F.rug((2.0, 1.4), location=(0, -0.5, 0), mat='rug_rose')          # rugs first (they are flat, not obstacles)
F.bed('full', 'platform', location=(-2.2, 1.3, 0), anchors=True)
F.workstation('cheap', 'computer', location=(0.4, 2.18, 0), anchors='computer', gear_anchor='a_gear_desk')
p = F.poster((0.5, 0.7), location=R.wall_point('n', -1.0, 1.6), rotation=B.against('n'), style='sunset')
R.on_wall(p, 'n')                                                  # decor hides with its wall
F.ceiling_light('globe', location=(0, 0, 2.7), light_anchor='l_ceiling')   # light only: no floating fixture
B.anchor('a_spawn', (0, 0, 0), 's')
...
if args['preview']:
    B.preview_set('tier1', views=('default', 'top', 'walk'))
B.export_glb(args['out'] or os.path.join(B.ASSETS_3D, 'tier1.glb'), root)
```

Rules of thumb:
- **Groups**: every builder makes one group empty (`bed`, `plant_2`, ...) holding its meshes. `B.export_glb` merges
  each group's meshes into ONE child mesh `<group>_mesh` (one draw call per material) and keeps the group's extras.
  Custom parts: `g = B.group('shelf_unit', loc, rot); B.obstacle(g); B.box('x', size, loc, 'wood_light', parent=g)`.
  Primitives take `parent=` and then `loc`/`rot` are LOCAL to it. Groups created without `parent` go under the room.
- **Wall decor** (windows, posters, shelves, clocks, curtains, wall TV, string lights, neon, upper cabinets built as
  their own group) must be parented to its wall: `R.on_wall(group, 'n')`. Place it with
  `R.wall_point(side, at, z, off)` (a point on the inner face) and `rotation=B.against(side)`. Doors and anything
  interactive are NOT parented to walls.
- **Interactive keys**: pass `interact='bed'` etc. (bed, fridge, door and workstation default to their key; pass
  `interact=None` for decorative duplicates). The picking/hover unit is the whole group, so put the chair inside the
  `computer` group (workstation does).
- **Obstacles**: furniture defaults to `obstacle=True`; rugs, doors, wall decor, ceiling lamps, desk items default to
  False. Keep a 0.8 m path from `a_door_stand` to everything (`inspect --walk` tells you).
- **Draw calls**: ~250 per room max. Each group costs (#materials it uses) draw calls; clutter with many colours adds
  up. `inspect` prints `draw calls ~N`.
- **Size**: exported rooms cost ~23 bytes per triangle, so the 2 MB cap bites at ~85k triangles, before the 90k
  triangle cap. Aim for <= 80k. Heavy items: kitchen_run ~5k, workstation 3-5k, bookshelf 3-6k, big plants 3k.
- **Kitchens**: pass `wall='n'` (the wall it stands against) to `F.kitchen_run`, so the backsplash, upper cabinets,
  open shelf and hood go into `<name>_upper`, parented to that wall. They then hide with the wall. Without it they
  float in view when that wall is cut away. For the same reason, keep tall furniture off the south and east walls
  (the cut-away side in the default view).
- **Dropship gear**: the player's computer gear (laptop_old / laptop_pro / workstation props) is placed on
  `a_gear_desk` at runtime. `F.workstation(gear_anchor='a_gear_desk')` keeps the left 0.45 m of the desk free for
  it. A baked-in laptop/monitor elsewhere on the same desk is fine for Hustle, but it duplicates the gear in Dropship.
- **Floors**: `floor=` planks | planks_mid | planks_dark | tile | checker | concrete | carpet; `floor_mats=[...]`
  overrides (checker takes two; planks with two materials alternate randomly). `floor_along='y'` turns planks.
- **Materials**: only palette names (docs/3D.md section 4) + `screen window_glass window_sky lampshade neon_<pink|cyan
  |yellow|purple|orange|green|red|blue>`. Addition: `kraft` (#c9a36b, the shipping-box colour of section 7).
  `P.custom_mat(name, hex)` exists for true one-offs; document them here if you add any.
- **Previews**: always render and LOOK at them (Read the PNG). `B.WORLD` holds the preview light knobs
  (`B.WORLD['sun'] = 5.0` in a dark room, e.g. tier5).

## Preview views (`B.render_preview(path, view, target=None, root=None, res=(1280, 720), samples=32, backdrop='#f6efe3')`)

| view | camera |
|---|---|
| `default` | perspective FOV 28, from the south-east at 40 deg, framing the slab + back-wall tops; walls whose outward normal faces the camera (s, e) cut to a 0.3 m stub and their decor hidden, like the runtime |
| `top` | orthographic plan; everything above 2.3 m clipped (lamps, wall tops); anchors drawn as discs + arrows (facing) + labels: green stand, blue sit, purple lie, yellow spawn, orange exit/other, cyan idle, pink gear, kraft outline = region anchors with w/d |
| `walk` | `top` + translucent red boxes = obstacle footprints with the 0.15 m padding |
| `front` | from due south at 14 deg, wall s stubbed |
| `close` | fits `target` (object, group, name or list) from the south-south-east at 30 deg; `azimuth=`/`elevation=` override |

`B.preview_set(id, views=('default', 'top'))` writes `blender/.previews/<id>_<view>.png`. Previews use a transparent
film composited over `backdrop`, Eevee, AgX Punchy, a warm sun from the south (soft shadows onto the back walls),
a soft sky and an area fill. They never touch the export (preview objects live in a `_preview` collection).

## Stills + hotspots (`blender/stills.py`, docs/3D.md section 9)

```sh
blender.exe -b --factory-startup --python blender/stills.py -- tier0 tier1        # from public/assets/3d/<id>.glb
blender.exe -b --factory-startup --python blender/stills.py -- _sample --glb blender/.out/_sample.glb --out blender/.out
node blender/run.mjs tier0 --stills                                               # build then still
```

Imports the room GLB and renders it the way the runtime frames it: a VERTICAL field of view (three.js
`PerspectiveCamera.fov`), rooms from the default high south-east camera (yaw 45, 40 deg, vertical FOV 28, walls s/e
cut to stubs, tier5's camera-side city sectors hidden, the diorama filling ~82% of the frame), `title_city` from
`a_cam` (its `fov` extra is vertical). Looks: daylight homes and McDoodle's, tier5 at night (glowing windows and
lamps, point lights at the `l_*` anchors), the title at dusk over a lavender-to-peach sky gradient. A bare main desk
(a_gear_desk with a `default`) gets that computer from props.glb, as in the game. 1600x900 over the room's backdrop
colour (`src/ui/shell/hotspots.ts` ROOM_BACKDROP; unknown ids use `#fbf3e7`); writes `<out>/<id>.webp` (default
`public/assets/rooms/`), and rewrites that room's entries in `<out>/hotspots.json` (`{room: {key: {x, y, w, h}}}` in
percent of the image, x/y = top-left, only the keys the games use: bed/computer/fridge/door, tier4 + garage,
McDoodle's counter/fryer/exit) and, for home tiers, `<out>/seats.json` (`{room: {computer_sit|staff_<n>_sit: {x, y,
top}}}`: the seat anchor's floor point and the y of a seated head 1.3 m above it). Other rooms' entries are kept.
`--hotspots <path>` overrides the JSON path; `--png` also keeps the PNG; `--samples <n>` (default 64). `studio` is
skipped (it is only a live preview).

```sh
node blender/run.mjs stills -- tier0 tier1 tier2 tier3 tier4 tier5 mcdoodles title_city   # every still (~15 s)
```

## Baked gear and the desk default (docs/3D.md section 7)

`F.ring_light`, `F.camera_tripod` and `F.softbox` tag their group `{gear: "ring_light" | "mirrorless_camera" |
"softbox_kit"}`, and `F.workstation(..., gear_anchor=...)` tags a desk that already shows monitors `{gear:
"workstation"}` (a baked laptop: `laptop_old` / `laptop_pro`). The runtime never places a second copy of a tagged id
through `setGear`. A bare main desk (no monitors, no laptop) instead gets `a_gear_desk` extras `{default:
"laptop_old", center: <m to the desk middle>}`: the runtime shows that laptop (in the middle of the desk) whenever
setGear has not put a computer there. Tag any other hand-built stand-in the same way (`g['gear'] = '<props id>'`);
`inspect.mjs --check room` rejects unknown ids.

## Ceiling fixtures

The cutaway diorama has no ceiling, so anything hanging from it (pendants, globes, bare bulbs, linear pendants)
reads as a floating object. Rooms call `F.ceiling_light(...)` (same arguments as `F.ceiling_lamp`), which places only
the `l_*` light anchor at the bulb height. Hanging decor near a wall (a hanging plant) is parented to that wall's
decor so it hides with the wall.

## Studio (`blender/rooms/studio.py` -> `public/assets/3d/studio.glb`)

The character preview pedestal for the new-game Look editor: a 2.4 m round drum with a soft rim (blush top, rose
body), no walls, `a_spawn` at the centre facing the default camera, one `l_key`, root extras `{studio: true}`.
`node blender/inspect.mjs public/assets/3d/studio.glb --check studio`.

## Props (`blender/props/props.py` -> `public/assets/3d/props.glb`)

One top-level empty per prop id (docs/3D.md section 7), each with one child mesh `<id>_mesh` and an identity
transform. Up = +Z, front / screen / lens = local -Y. Origins:

| prop | origin (grip / contact point) |
|---|---|
| `phone` | centre of the lower third, screen on -Y, top of the phone +Z |
| `mug` | middle of the handle (the cup sits on -X of it) |
| `plate` | centre of the underside (carried flat, burger + fries on it) |
| `burger` | its centre |
| `fries` | the carton's lower middle |
| `spatula` | middle of the handle, blade toward +Z |
| `box_small` | centre of the box (carried at chest height with both hands) |
| `takeout_bag` | top of the handles; the bag hangs below |
| `phone_cracked`, `phone_pro` | bottom centre of a small desk stand (phone leaning back, screen -Y) |
| `laptop_old`, `laptop_pro`, `workstation` (2 monitors + tower + keyboard), `lav_mic` | bottom centre, on the desk top |
| `ring_light`, `softbox_kit` (two stands), `mirrorless_camera` (on a tripod) | bottom centre, on the floor |
| `box_stack_unit` | bottom centre of a 0.4 x 0.3 x 0.3 kraft box with tape |

Preview: `node blender/run.mjs props --preview` -> `.previews/props_grid.png`, `.previews/props_hand.png`.

## API reference (generated from the docstrings by `python blender/lib/gen_api.py`)

<!-- api:start -->

### palette.py (`from palette import get_mat`)

- `srgb_to_linear(c)`<br>Convert one sRGB channel (0..1) to linear.
- `hex_to_linear(h, alpha=1.0)`<br>'#rrggbb' -> (r, g, b, a) linear floats, the form Blender colour sockets expect.
- `get_mat(name)`<br>Return the shared material for a palette/special name ('wood_light' or 'm_wood_light'), creating it once.
- `custom_mat(name, hexcol, rough=0.72, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0)`<br>Get-or-create an extra named material ``m_<name>`` for colours not in the palette. Use sparingly and list it in blender/README.md (e.g. character colours are the character builder's business, not this helper's).
- `all_names()`<br>Every material key get_mat accepts (without prefix), for docs and tests.

### build.py (`import build as B`)

- `cli_args(argv=None)`<br>Parse script args after '--'. Returns dict: preview (bool), stills (bool), out (str|None), rest (list).
- `clean_scene()`<br>Delete every object, mesh, material, curve, light, camera and collection: a truly empty file.
- `set_root(obj)`<br>Make `obj` the default parent for new groups/anchors/lights (make_room does this).
- `get_root()`<br>The current default parent (the room root) or None.
- `sanitize(name)`<br>Lowercase and replace anything outside [a-z0-9_] with '_'.
- `uname(base)`<br>A unique object name derived from `base`: base, base_2, base_3 ...
- `to_rad(rotation)`<br>Degrees -> radians Euler tuple. None -> (0,0,0); a number -> rotation about Z; a 3-tuple -> XYZ degrees.
- `facing_deg(facing, origin=(0, 0))`<br>Z rotation (degrees) that makes local -Y point along `facing`. facing: compass string ('n','e','s','w','ne',...), a number (already degrees: 0=s, 90=e, 180=n, -90=w), or an (x, y) point to look AT from `origin`.
- `against(wall)`<br>Rotation (degrees) for furniture standing with its back to a wall: 'n'->0, 'w'->90, 'e'->-90, 's'->180.
- `world_matrix(obj)`<br>World matrix computed from parents/basis without a depsgraph update (always current).
- `reparent(obj, parent)`<br>Parent `obj` to `parent` keeping its world transform (parent inverse stays identity).
- `set_props(obj, **extras)`<br>Set custom properties (exported as glTF extras). Bools are stored as bools.
- `interactive(g, key)`<br>Mark group `g` interactive with key (bed, computer, fridge, door, garage, couch, tv, counter, fryer, exit).
- `obstacle(g, on=True)`<br>Mark group `g` as a walk obstacle (its mesh footprint + 0.15 m padding is blocked at runtime).
- `group(name, loc=(0, 0, 0), rot=None, parent='root', **extras)`<br>Create an empty group (plain axes). Children built with parent=<group> use its local frame.
- `local_to_world(frame, loc)`<br>Point in `frame`'s local coords -> world coords (frame=None: identity).
- `anchor(name, loc, facing='s', frame=None, parent='root', **extras)`<br>Create anchor empty `a_<name>` (extras {anchor:<name>, ...extras}). loc: where the character's root (feet / floor point under the pelvis) goes. facing: where the character looks (compass, degrees, or an (x, y) point), see facing_deg(). frame: optional group; loc/facing are then in that group's LOCAL frame (converted to world here), so a builder can say "0.5 m in front of the fridge" and it follows the fridge's placement. The anchor's local -Y is the facing direction (docs/3D.md section 2). Duplicate names raise ValueError.
- `light(name, loc, kind='lamp', color='#ffd9a0', intensity=1.0, distance=4.0, frame=None, parent='root')`<br>Create a light anchor `l_<name>` (extras {light:kind, color, intensity, distance}); the runtime makes the actual point light. kind: 'lamp' | 'ceiling' | 'window'.
- `mesh_from_bm(name, bm, mat='plastic_white', parent=None, loc=(0, 0, 0), rot=None, scale=None, smooth=True)`<br>Wrap a bmesh into a new linked mesh object (the bmesh is freed).
- `mesh_from_data(name, verts, faces, mat='plastic_white', parent=None, loc=(0, 0, 0), rot=None, smooth=True, bevel=0.0, segments=1, mat_idx=None)`<br>Build a mesh object from raw verts/faces (optional per-face material indices + bevel).
- `box(name, size, loc=(0, 0, 0), mat='wood_light', parent=None, rot=None, bevel=0.012, segments=2, bottom=False)`<br>Rounded box. size=(x, y, z) m, loc = centre (or bottom centre with bottom=True), bevel width (m) auto-clamped to 45% of the thinnest side; segments 1 = chamfer, 2-3 = soft round. Small boxes (< 12 cm) or tiny bevels (< 5 mm) use 1 segment automatically (triangle budget).
- `cyl(name, r, h, loc=(0, 0, 0), mat='metal', parent=None, rot=None, verts=16, r2=None, bevel=0.006, segments=2, bottom=False)`<br>Cylinder (or cone/frustum when r2 is given for the top radius) along local Z, height h. loc = centre (bottom centre with bottom=True). Cap edges bevelled.
- `cone(name, r, h, loc=(0, 0, 0), mat='terracotta', parent=None, rot=None, verts=16, r2=0.0, bottom=False, bevel=0.0)`<br>Cone / frustum (r bottom, r2 top) along local Z.
- `sphere(name, r, loc=(0, 0, 0), mat='plant', parent=None, rot=None, scale=(1, 1, 1), segs=16, rings=8)`<br>UV sphere (smooth), scale for ellipsoids.
- `torus(name, R, r, loc=(0, 0, 0), mat='metal', parent=None, rot=None, major=24, minor=8, arc=360.0)`<br>Torus in the local XY plane (major radius R, tube radius r). arc < 360 makes an open ring segment.
- `blob(name, size, loc=(0, 0, 0), mat='fabric_cream', parent=None, rot=None, round_xy=0.35, round_z=0.6, segs=20, rings=10, deform=None)`<br>Soft superellipsoid: cushions, pillows, mattresses, bean bags, duvets, bread buns. size=(x, y, z) full extents; round_xy / round_z in (0..1]: small = boxy with round corners, 1 = ellipsoid. deform(x, y, z) -> (x, y, z) optional callable applied to each vertex in metres (local), e.g. to wrinkle a duvet.
- `tube(name, points, radius=0.01, mat='plastic_black', parent=None, loc=(0, 0, 0), rot=None, res=6, caps=True, closed=False, radii=None)`<br>Sweep a circle along a polyline (list of (x, y, z) local points): cables, neon tubes, lamp arms, frames, stems, hanger wires. radii: optional per-point radius list (tapering stems).
- `bezier(p0, p1, p2, p3, n=12)`<br>Cubic bezier -> list of n+1 points (tuples).
- `catenary(a, b, sag=0.15, n=12)`<br>Hanging-wire points from a to b sagging `sag` m at the middle (string lights, cables).
- `panel(name, size, loc=(0, 0, 0), mat='screen', parent=None, rot=None)`<br>Flat quad in the local XZ plane facing -Y (front), with 0..1 UVs (screens, poster faces, menu pictures). size=(width, height).
- `prism(name, pts2d, depth, loc=(0, 0, 0), mat='wood_light', parent=None, rot=None, bevel=0.01, segments=2)`<br>Extrude a 2D polygon (list of (x, y), counter-clockwise) along +Z by depth: L-shaped tops, signs, leaves. loc is the polygon origin at the bottom face.
- `lathe(name, profile, loc=(0, 0, 0), mat='terracotta', parent=None, rot=None, verts=16, cap_bottom=True, cap_top=False)`<br>Revolve a profile [(radius, z), ...] (bottom to top) around local Z: pots, vases, mugs, lamp bases, bottles.
- `descendants(obj)`<br>All descendants of obj (depth-first).
- `world_bbox(objs, include_children=True)`<br>World-space AABB ((minx,miny,minz),(maxx,maxy,maxz)) of the evaluated meshes in objs (+ descendants).
- `merge_meshes(target_name, parent, meshes)`<br>Merge evaluated `meshes` (modifiers applied, custom normals + UVs kept) into ONE mesh object child of `parent` at identity, one material slot per distinct material. The source objects are deleted.
- `merge_group(g)`<br>Collapse every mesh under group empty `g` (through nested empties) into one child mesh `<g>_mesh`. Nested anchors/lights/sockets and empties with extras {keep:true} are preserved (keep-groups merged on their own). Nested empties without meshes left are removed.
- `consolidate(root)`<br>Merge meshes per furniture group for few draw calls: every direct child empty of `root` (except a_/l_ markers) becomes empty + one `<name>_mesh`; each wall/floor mesh keeps its own mesh, and each group parented to a wall is merged the same way; loose meshes parented to a wall are merged into `<wall>_trim`. Outside groups likewise.
- `apply_all_modifiers(root)`<br>Apply modifiers on every mesh under root (not needed for export; used before measuring).
- `export_glb(path, root=None, merge=True, animations=False, **gltf_kw)`<br>Export `root` and its hierarchy only to a .glb: modifiers applied, extras on, +Y up, no cameras/lights. root may also be a LIST of top-level groups (props.glb: each becomes a top-level node, merged with merge_group). merge=True first consolidates each furniture group into one mesh (consolidate()). Extra glTF exporter keywords (e.g. export_skins, export_morph for the character) pass through. Returns the file size.
- `clear_preview()`<br>Remove preview cameras/lights/markers.
- `setup_render(res=(1280, 720), samples=32, backdrop='#f6efe3', transparent=False)`<br>Eevee + AgX, soft shadows, world = soft sky light with `backdrop` as the camera background colour.
- `fit_camera(cam, points, azimuth_deg, elevation_deg, res, margin=0.06, target=None)`<br>Aim perspective camera `cam` from direction (azimuth: 0 = from south (-Y), 90 = from east (+X); elevation up from horizontal) so all `points` fit inside the frame with `margin` (fraction), centred. Returns distance.
- `room_points(root)`<br>Framing points for a room: slab corners + back-wall tops (n/w) + stub height of front walls.
- `render_preview(path, view='default', target=None, root=None, res=(1280, 720), samples=32, backdrop='#f6efe3', azimuth=45.0, elevation=40.0, fov=28.0)`<br>Render a preview PNG. view: 'default' - perspective FOV 28 from the south-east at 40 deg, framing the floor, walls s/e stubbed (runtime cutaway); 'top' - orthographic plan, everything above 2.3 m clipped, anchors drawn as coloured discs + arrows + labels (green stand, blue sit, purple lie, yellow spawn, orange exit/other, cyan idle, kraft boxes region outline, pink gear); 'walk' - 'top' plus translucent red obstacle footprints (+0.15 m padding); 'front' - from the south at 14 deg, wall s stubbed; 'close' - fits `target` (object/group or name) from the south-east at 30 deg (walls facing the camera stubbed). azimuth/elevation override the default/close camera direction (azimuth 0 = from south, 90 = from east).
- `render_to(path, backdrop=None)`<br>Render the scene camera to a PNG at `path`. The film is transparent; with `backdrop` ('#rrggbb') the exact backdrop colour is composited behind it afterwards (AgX would otherwise grey a world colour).
- `composite_backdrop(path, hexcol)`<br>Flatten a straight-alpha PNG over a solid sRGB colour, in place.
- `preview_set(room_id, root=None, views=('default', 'top'), prefix=None)`<br>Render the usual previews to blender/.previews/<id>_<view>.png.

### room.py (`import room as R`)

- `door_opening(wall, at, width=0.9, height=2.1, name=None)`<br>Opening spec for a door. `at` = centre coordinate ALONG the wall in world units (x for walls n/s, y for e/w).
- `window_opening(wall, at, width=1.2, height=1.2, sill=0.9, name=None)`<br>Opening spec for a window (sill = bottom height above the floor).
- `make_floor(w, d, style='planks', mats=None, seed=1, along='x')`<br>Floor mesh `floor` (extras {floor:true}), top at z=0. style: planks | planks_mid | planks_dark | tile | checker | concrete | carpet. mats overrides the material list (checker takes two).
- `make_room(room_id, w, d, wall_h=2.7, wall_mat='wall_cream', floor='planks', floor_mats=None, openings=(), wall_t=0.15, baseboard='plastic_white', crown=None, slab_mat='slab', seed=None, floor_along='x')`<br>Build the room shell and set it as the build root. Returns the `room` root empty. wall_mat: one palette name or {'n':..,'e':..,'s':..,'w':..}. floor: see make_floor. openings: list from door_opening/window_opening (holes are cut into the wall mesh). baseboard / crown: trim material names or None. slab_mat: the base under the floor. seed: plank layout seed (default from the id). floor_along='y' turns planks. Also fills room.ROOM (id, w, d, h, t, openings, walls) for the helpers below.
- `wall(side)`<br>The wall object for side 'n'|'e'|'s'|'w' of the current room.
- `on_wall(obj, side)`<br>Parent decor (a group or mesh) to wall `side` keeping its world transform, so it hides with the wall. Do NOT use for doors or anything interactive.
- `wall_point(side, at, z=0.0, off=0.0)`<br>World point on the INNER face of wall `side`: `at` along the wall (x for n/s, y for e/w), height z, pushed `off` metres into the room. Pair with rotation B.against(side) so the object's front faces into the room.
- `opening_point(op)`<br>World point at the bottom centre of an opening, on the wall's centre line.
- `inside_point(op, dist=0.6)`<br>Floor point `dist` metres inside the room in front of an opening's centre (e.g. a_door_stand).
- `fill_opening(op, **kw)`<br>Put the matching furniture into an opening: windows (furniture.window, parented to the wall) or doors (furniture.door, NOT parented, interactive by default). kw passes through (style, name, interact, ajar ...). Returns the created group.

### furniture.py (`import furniture as F`)

- `leg4(g, w, d, h, r=0.022, mat='wood_mid', inset=0.04, z0=0.0, square=False, splay=0.0)`<br>Four legs under a w x d footprint (local, centred), height h from z0. splay tilts them outward (degrees).
- `knob(g, loc, mat='metal', r=0.014, rot=None)`<br>Small round knob on a -Y facing front.
- `bar_handle(g, loc, length=0.12, vertical=False, mat='metal', r=0.007, standoff=0.025)`<br>Bar handle (with two standoffs) on a -Y facing front at loc (front surface point).
- `books_row(g, x0, x1, y, z, depth=0.2, seed=1, hmin=0.17, hmax=0.27, lean_last=True, mats=('poster_a', 'poster_b', 'fabric_teal', 'fabric_mustard', 'fabric_coral', 'paper', 'fabric_navy', 'rug_green', 'wood_dark', 'mcd_red'))`<br>A row of books standing on a shelf from x0 to x1 (local), spines facing -Y, bottoms at z.
- `mug(g, loc, mat='plastic_white', r=0.04, h=0.095)`<br>Small mug with handle (loc = bottom centre).
- `plant_leaves(g, base, n=7, length=0.22, width=0.09, lift=40, mat='plant', seed=1, droop=0.0, spread=1.0, z_jitter=0.05)`<br>Rosette of flattened-ellipsoid leaves radiating from `base` (local point).
- `bed(size='queen', frame='wood', name='bed', location=(0, 0, 0), rotation=0, frame_mat=None, duvet_mat='fabric_blue', sheet_mat='paper', pillow_mat='fabric_cream', throw_mat=None, messy=False, pillows=None, headboard=True, interact='bed', anchors=False, anchor_side='right', seed=1, obstacle=True)`<br>Bed with mattress, duvet, pillows. size twin|full|queen|king. frame wood|platform|metal|upholstered|none. Headboard at local +Y (against the wall), foot toward -Y. Mattress top = 0.5 m. messy=True crumples the duvet and knocks a pillow askew. throw_mat adds a folded throw across the foot. anchors=True creates a_bed_lie (pelvis on the mattress, facing the foot), a_bed_sit (edge on anchor_side 'right' = local +X or 'left', feet on the floor, facing out) and a_bed_stand (floor beside it, facing it).
- `nightstand(style='wood', name='nightstand', location=(0, 0, 0), rotation=0, mat=None, clutter=True, lamp=True, seed=1, obstacle=True)`<br>Bedside table (0.45 x 0.4 x 0.55) with a drawer; style wood|white|crate. clutter adds a book + glass; lamp adds a small table lamp (m_lampshade shade).
- `table_lamp(g, loc, h=0.34, shade_mat='lampshade', base_mat='terracotta')`<br>Small table lamp built INTO group g at local loc (bottom centre): ceramic base + fabric shade.
- `desk(style='cheap', w=None, d=None, name='desk', location=(0, 0, 0), rotation=0, mat=None, interact=None, height=DESK_H, obstacle=True, seed=1, parent='root')`<br>Desk with its top at 0.75 m (height=). Front (the sitter's side) = local -Y. style: old (worn wooden, drawer pedestal) | cheap (white top, thin metal legs) | nook (small, hairpin legs) | standing (T-frame, motor column) | executive (dark wood, double pedestal, leather pad) | l_shaped (return on the local +X side toward -Y) | folding (white plastic folding table).
- `office_chair(style='basic', name='chair', location=(0, 0, 0), rotation=0, mat=None, accent=None, arms=True, obstacle=True, parent='root')`<br>Chair whose sitter faces local -Y; seat top 0.46 m. style: basic (mesh office chair) | gaming (racing bucket with accent stripes) | executive (tall tufted leather) | stool (round drafting stool, no back) | wood (dining chair) | folding (metal folding chair). mat = upholstery, accent = stripe colour (gaming).
- `bar_stool(name='stool', location=(0, 0, 0), rotation=0, mat='fabric_coral', frame='metal_dark', height=0.75, back=False, obstacle=True, parent='root')`<br>Counter / bar stool: seat at `height` (0.65 counter, 0.75 bar), four splayed legs and a foot ring.
- `monitor(size='normal', name='monitor', location=(0, 0, 0), rotation=0, mat='plastic_black', parent='root', obstacle=False, arm=False)`<br>Monitor on a stand (screen faces local -Y, m_screen with 0..1 UVs). size normal (0.6 m) | small (0.45) | ultrawide (0.86). location = bottom centre (desk top). arm=True clamps to the desk back instead of a foot.
- `keyboard(name='keyboard', location=(0, 0, 0), rotation=0, mat='plastic_white', keys='plastic_grey', parent='root', rgb=False)`<br>Low-profile keyboard (0.36 x 0.12) with a key-block grid; rgb=True adds a neon under-glow edge.
- `mouse(name='mouse', location=(0, 0, 0), rotation=0, mat='plastic_white', pad='fabric_navy', parent='root')`<br>Mouse on a mouse pad (pad=None for no pad).
- `laptop(style='pro', name='laptop', location=(0, 0, 0), rotation=0, open_deg=105, parent='root', obstacle=False, sticker=True)`<br>Open laptop, screen facing local -Y toward the user. style: old (chunky black plastic brick) | pro (thin aluminium). location = bottom centre on the desk.
- `desk_lamp(name='desk_lamp', location=(0, 0, 0), rotation=0, mat='fabric_mustard', parent='root', style='arm')`<br>Desk lamp: style arm (balanced-arm, coloured head, m_lampshade bulb) | dome (small mushroom lamp). Head points toward local -Y.
- `workstation(style='cheap', name='computer', location=(0, 0, 0), rotation=0, monitors=1, monitor_size='normal', laptop_style=None, chair='basic', chair_mat=None, desk_w=None, desk_d=None, lamp=False, clutter=1.0, interact='computer', anchors=None, gear_anchor=None, seed=1, obstacle=True, rgb=False)`<br>A complete computer desk group: desk + chair (pulled out, facing the desk) + monitors and/or laptop + keyboard + mouse + clutter. Desk front (the sitter's side) = local -Y. anchors: None, or a prefix like 'computer' -> creates a_<prefix>_sit (floor point under the seated pelvis, facing the desk) and a_<prefix>_stand (behind the chair, facing the desk). gear_anchor='a_gear_desk' reserves the LEFT 0.45 m of the desk top for gear props (nothing else is put there), shifts the computer block right and creates that anchor there (extras w=0.4, d=0.3, facing the sitter like the desk). Note for Dropship: the player's computer gear (laptop_old / laptop_pro / workstation) appears on a_gear_desk at runtime, so a desk that should only show the gear can pass monitors=0 and laptop_style=None.
- `staff_desk_set(n, style='cheap', location=(0, 0, 0), rotation=0, chair='basic', chair_mat=None, monitors=1, laptop_style=None, seed=None, desk_w=None, desk_d=None)`<br>Hustle staff desk `staffdesk_<n>` (extras {staffdesk:n, obstacle:true}): desk + chair + monitor(s) + small personal clutter, and anchor a_staff_<n>_sit at the seated position facing the desk. style as desk().
- `fridge(style='tall', name='fridge', location=(0, 0, 0), rotation=0, mat=None, interact='fridge', anchors=False, magnets=True, seed=1, obstacle=True)`<br>Fridge, door on local -Y. style mini (0.5 x 0.5 x 0.85) | tall (0.7 x 0.7 x 1.8, freezer on top) | built_in (0.75 x 0.65 x 2.1 flush panel, wood or white) | double (0.9 x 0.72 x 1.85 French doors). anchors=True -> a_fridge_stand 0.55 m in front, facing it.
- `window(width=1.2, height=1.2, wall_t=0.15, style='standard', name='window', location=(0, 0, 0), rotation=0, frame_mat='plastic_white', sill=True, sky=True, curtains=None, outside='sky', parent='root')`<br>Window that fills a wall opening. location = bottom centre of the opening on the wall centre line (room.opening_point), rotation = B.against(wall) so the interior side is local -Y. style standard (2 sashes + mullion) | basement (small hopper, window-well grass outside) | factory (steel grid) | floor (floor-to-ceiling thin frame). m_window_glass pane + m_window_sky plane just outside (sky=False when an `outside` skyline should show through instead, e.g. tier5; outside='grass' adds a lawn strip). curtains=<fabric material> adds curtains on a rod. Parent it to its wall (room.fill_opening does).
- `door(width=0.9, height=2.1, wall_t=0.15, style='wood', name='door', location=(0, 0, 0), rotation=0, ajar=0.0, mat=None, frame_mat=None, interact='door', anchors=False, stand_dist=0.7, parent='root', hinge='left')`<br>Door with casing on both wall faces. location = bottom centre of the opening on the wall centre line, rotation = B.against(wall) (interior side = local -Y). style wood (panelled, brass knob) | hallway (flat white apartment door, peephole, number plate) | metal (industrial steel, push plate) | glass (aluminium frame, big pane, push bar) | elevator (brushed double sliding doors + call button). ajar = opening angle in degrees into the room (0 closed). Not an obstacle, not parented to the wall. anchors=True -> a_door_stand (stand_dist inside, facing the door) and a_door_exit (in the doorway, facing out).
- `pot(g, loc, r=0.12, h=0.2, mat='terracotta', style='taper')`<br>Plant pot (local bottom centre) with soil; returns the soil top z. style taper | cylinder | bowl.
- `small_plant(name='plant', location=(0, 0, 0), rotation=0, style='leafy', pot_mat='terracotta', parent='root', obstacle=False, seed=1)`<br>Tabletop / shelf plant (~0.25 m): style leafy | succulent | cactus | trailing (vines spilling over). Nested inside another group (parent=<group>) it is named <group>_plant so it never takes a room-level name.
- `potted_plant(style='tall', name='plant', location=(0, 0, 0), rotation=0, pot_mat='terracotta', seed=1, obstacle=True, parent='root')`<br>Floor plant: style small (bushy 0.5 m) | tall (fiddle-leaf 1.6 m) | monstera (split leaves) | snake (upright blades) | palm (arching fronds).
- `hanging_plant(name='hanging_plant', location=(0, 0, 2.7), rotation=0, pot_mat='plastic_white', drop=0.8, seed=1, parent='root')`<br>Macrame-hung plant: location = ceiling hook point; the pot hangs `drop` m below, vines trail down.
- `floor_lamp(style='arc', name='floor_lamp', location=(0, 0, 0), rotation=0, mat='metal_dark', light_anchor=None, obstacle=True)`<br>Floor lamp: style arc (arching over, dome shade toward local -Y) | shade (drum shade on a pole) | tripod (wooden tripod legs + drum shade). light_anchor='l_<name>' also creates the light anchor at the bulb.
- `ceiling_lamp(style='pendant', name='ceiling_lamp', location=(0, 0, 2.7), rotation=0, drop=0.7, mat='plastic_white', light_anchor=None, parent='root')`<br>Ceiling light hung from `location` (the ceiling point): style pendant (dome on a cord) | globe (paper globe) | bulb (bare bulb on a cord) | flush (flush dome) | cage (industrial cage). Not an obstacle. light_anchor='l_<name>' creates a 'ceiling' light anchor at the bulb.
- `ceiling_light(style='pendant', name='ceiling_lamp', location=(0, 0, 2.7), rotation=0, drop=0.7, mat=None, light_anchor=None, parent='root', color='#ffe2b8', intensity=1.5, distance=6.0)`<br>What a room places instead of a hanging fixture: the cutaway diorama has no ceiling, so a pendant, globe or bare bulb on a cord reads as an object floating in mid-air. Creates only the light anchor (when `light_anchor` is given) at the height where the bulb would hang; takes ceiling_lamp's arguments so a room can swap one call for the other. Returns the light empty or None.

### furniture.py, continued (defined in furniture2.py; call as `F.<name>`)

- `stove(g, x, w, burners=4, oven=True, y_front=-0.3, top=COUNTER_H, style='glass')`<br>Cooktop (+ oven below) built into group g at module centre x.
- `sink(g, x, w, top=COUNTER_H, mat='metal')`<br>Inset sink basin + gooseneck faucet at module centre x.
- `kitchen_run(length=2.4, name='kitchen', location=(0, 0, 0), rotation=0, modules=None, style='white', front_mat=None, counter_mat=None, upper=True, hood=True, clutter=True, interact=None, anchors=False, wall_h=2.7, seed=1, obstacle=True, wall=None)`<br>A run of base cabinets with a countertop at 0.9 m, back against local +Y (depth 0.62). wall='n'|'e'|'s'|'w': the wall it stands against. PASS IT in a room: the backsplash, upper cabinets, open shelf and hood then go into a separate group `<name>_upper` parented to that wall (hidden with it in the cutaway); otherwise they stay in the base group and float in view when that wall is cut away. modules: list of (kind, width) left->right (local -X -> +X); kinds: cab | drawers | sink | stove2 | stove4 (4 burners + oven) | dishwasher | open (open shelf) | fridge_gap (empty slot, no counter). Default fills `length` with drawers, sink, cab, stove4, cab. style: white | wood | sage | navy | designer | retro. upper=True adds wall cabinets (open shelf with jars over the sink side), hood=True a range hood over the stove. anchors=True -> a_stove_stand in front of the stove (or the sink if there is no stove), facing it.
- `microwave(name='microwave', location=(0, 0, 0), rotation=0, mat='plastic_white', parent='root')`<br>Countertop microwave (0.48 x 0.36 x 0.28), door on local -Y; location = bottom centre.
- `hot_plate(name='hot_plate', location=(0, 0, 0), rotation=0, burners=2, pan=True, parent='root')`<br>Cheap electric hot plate (coil burners, dial knobs) with an optional frying pan.
- `counter(length=1.2, name='counter', location=(0, 0, 0), rotation=0, style='white', counter_mat=None, height=COUNTER_H, interact=None, obstacle=True, depth=0.6)`<br>Simple base-cabinet counter block (doors + top), for small kitchenettes (e.g. mini fridge + microwave). Top at 0.9 m (height=).
- `upper_cabinets(length=1.2, name='upper_cabinets', location=(0, 0, 1.5), rotation=0, style='white', h=0.7, parent='root')`<br>Wall cabinets (depth 0.34) — location = bottom centre of the back face line. Parent to a wall with room.on_wall so they hide with it.
- `range_hood(name='range_hood', location=(0, 0, 1.6), rotation=0, wall_h=2.7, parent='root')`<br>Chimney range hood; location = bottom centre at the wall face.
- `kitchen_island(length=1.8, depth=0.9, name='island', location=(0, 0, 0), rotation=0, style='white', counter_mat=None, stools=3, stool_mat='fabric_coral', interact=None, anchors_eat=None, obstacle=True, sink_on=False)`<br>Kitchen island (top 0.9 m) with an overhang on the local -Y side and `stools` counter stools under it. anchors_eat='a_eat_sit' creates that anchor at the middle stool (floor point under the pelvis, facing +Y).
- `dining_table(shape='rect', seats=4, name='dining_table', location=(0, 0, 0), rotation=0, mat='wood_light', chair_style='wood', chair_mat=None, place_settings=True, anchors_eat=None, obstacle=True, w=None, d=None)`<br>Dining table (top 0.75) with chairs around it. shape rect (seats 2/4/6) | round (seats 2-4) | small (café table, 2 seats). anchors_eat='a_eat_sit' puts that anchor at the first chair (local -Y side).
- `couch(style='three', name='couch', location=(0, 0, 0), rotation=0, mat='fabric_blue', pillow_mats=None, leg_mat='wood_dark', throw_mat=None, interact=None, anchors=False, seed=1, obstacle=True, length=None)`<br>Sofa, sitters face local -Y. style saggy (worn 2-seater, sagging cushions, afghan throw) | loveseat | three (3-seat) | sectional (L with a chaise on local +X toward -Y). Seat height ~0.44. anchors=True -> a_couch_sit at the middle seat (floor point under the pelvis, facing -Y).
- `armchair(style='club', name='armchair', location=(0, 0, 0), rotation=0, mat='fabric_mustard', leg_mat='wood_mid', obstacle=True)`<br>Armchair (sitter faces local -Y): style club (chunky, rounded) | mid (mid-century, thin arms, tapered legs).
- `bean_bag(name='bean_bag', location=(0, 0, 0), rotation=0, mat='fabric_coral', obstacle=True)`<br>Slouchy bean bag with a sitting dent, facing local -Y.
- `coffee_table(style='wood', name='coffee_table', location=(0, 0, 0), rotation=0, mat=None, clutter=True, seed=1, obstacle=True)`<br>Low table (0.42 m): style wood (rect, lower shelf) | round (pedestal) | glass (metal frame, glass top) | crate (pallet/crate table). clutter adds magazines, a mug, a remote and a small plant.
- `tv(size=1.2, name='tv', location=(0, 0, 0), rotation=0, stand=True, stand_style='low', interact=None, console=True, obstacle=True, parent='root')`<br>Flat TV (m_screen with UVs), screen width `size` m, facing local -Y. stand=True puts it on a media console (stand_style low | console | legs); stand=False gives a wall-mountable TV whose location is the centre of the screen's back (parent it to a wall with room.on_wall). console=True adds a game console + controller.
- `bookshelf(style='tall', name='bookshelf', location=(0, 0, 0), rotation=0, mat='wood_light', w=None, h=None, seed=1, obstacle=True, decor=True)`<br>Bookcase full of books (front local -Y): style tall (0.9 x 1.9, 5 shelves) | low (1.2 x 0.8) | cube (4 x 4 cube storage with bins) | ladder (leaning ladder shelf). decor adds a plant / box / trophy.
- `metal_shelving(w=1.2, h=1.8, d=0.5, levels=5, name='shelving', location=(0, 0, 0), rotation=0, mat='metal', stock=True, interact=None, seed=1, obstacle=True, boxes_anchor=None)`<br>Garage / warehouse metal shelving unit with angle posts and `levels` shelves, optionally stocked with bins, kraft boxes and paint cans. boxes_anchor='a_boxes_1' creates a box-region anchor on the 2nd shelf top (extras w, d, layers) and leaves that shelf empty for the runtime's stock boxes.
- `wall_shelf(w=0.9, name='wall_shelf', location=(0, 0, 1.4), rotation=0, mat='wood_light', items=True, seed=1, parent='root')`<br>Floating wall shelf; location = centre of the back edge at shelf height. Parent with room.on_wall.
- `dresser(name='dresser', location=(0, 0, 0), rotation=0, mat='wood_light', w=1.0, decor=True, obstacle=True)`<br>Chest of drawers (w x 0.45 x 0.85) with a mirror-less top: lamp, frame, jewellery dish.
- `wardrobe(name='wardrobe', location=(0, 0, 0), rotation=0, mat='plastic_white', w=1.0, h=2.0, obstacle=True)`<br>Two-door wardrobe (w x 0.58 x h) with a storage box on top.
- `rug(size=(2.0, 1.4), name='rug', location=(0, 0, 0), rotation=0, mat='rug_rose', accent='fabric_cream', shape='rect', pattern='border', fringe=False, seed=1)`<br>Floor rug (not an obstacle), 1.2 cm thick with a soft edge. shape rect | round | runner. pattern plain | border | stripes | diamond | dots. Put it BEFORE furniture on top of it.
- `poster(size=(0.5, 0.7), name='poster', location=(0, 0, 1.5), rotation=0, style='abstract', seed=1, frame=None, parent='root')`<br>Wall poster / print facing local -Y; location = centre of its BACK on the wall surface (use room.wall_point(side, at, z) + rotation B.against(side), then room.on_wall). style abstract (circles + blocks) | sunset (sun over stripes) | wave | grid (Swiss blocks) | plant (leaf). frame=None (taped corners) or a material name (thin frame).
- `framed_art(size=(0.6, 0.45), name='art', location=(0, 0, 1.5), rotation=0, style='abstract', frame='wood_dark', seed=1, parent='root')`<br>Framed print with a mat (poster with frame=...). Same placement rules as poster().
- `wall_clock(r=0.16, name='clock', location=(0, 0, 2.0), rotation=0, mat='plastic_white', rim='plastic_black', hour=10.1, parent='root')`<br>Round wall clock; location = centre of its back on the wall. Hands show `hour` (float).
- `curtains(width=1.4, height=1.6, name='curtains', location=(0, 0, 2.2), rotation=0, mat='fabric_coral', parent='root', open_frac=0.7)`<br>Rod + two pleated curtain panels; location = rod centre (on the wall face, rod 0.1 m proud). Parent to a wall with room.on_wall. open_frac = how pulled-apart they are (1 = fully open to the sides).
- `radiator(w=0.8, h=0.6, name='radiator', location=(0, 0, 0.12), rotation=0, mat='plastic_white', parent='root')`<br>Column radiator; location = bottom centre against the wall (parent it to the wall).
- `stairs(width=0.9, steps=6, rise=0.18, run=0.26, name='stairs', location=(0, 0, 0), rotation=0, mat='wood_light', stringer_mat='plastic_white', rail='left', landing=0.0, obstacle=True)`<br>Straight stair flight rising toward local +Y from its origin (bottom front centre). rail 'left' | 'right' | 'both' | None (handrail on posts). landing = depth of a top landing (m). Total rise = steps * rise.
- `washing_machine(name='washer', location=(0, 0, 0), rotation=0, mat='plastic_white', clutter=True, obstacle=True)`<br>Front-loading washing machine (0.6 x 0.6 x 0.85), porthole door on local -Y.
- `laundry_basket(name='laundry', location=(0, 0, 0), rotation=0, mat='plastic_white', overflow=True, seed=1, obstacle=True)`<br>Woven-look laundry basket with clothes spilling over the rim.
- `moving_boxes(n=5, name='boxes', location=(0, 0, 0), rotation=0, seed=1, open_top=True, obstacle=True)`<br>A believable stack/cluster of `n` kraft moving boxes (tape, labels, one open with flaps).
- `string_lights(a, b, n=12, sag=0.18, name='string_lights', parent='root', mat='lampshade', wire='plastic_black')`<br>Fairy lights hanging between world points a and b (sagging `sag` m) with n glowing bulbs. Built in world coords; parent the returned group to a wall with room.on_wall.
- `neon_sign(style='squiggle', name='neon', location=(0, 0, 1.8), rotation=0, colors=('neon_pink', 'neon_cyan'), size=1.0, backing=True, parent='root')`<br>Abstract neon sign made of glowing tubes (no letters) on a clear acrylic backing; location = centre of its back on the wall. style squiggle | bolt | heart | wave | star. Parent with room.on_wall.
- `ring_light(name='ring_light', location=(0, 0, 0), rotation=0, h=1.6, obstacle=True, phone=True, parent='root')`<br>Ring light on a tripod stand, facing local -Y (toward whoever is filmed), with a phone clamped in the middle. Origin at the floor.
- `camera_tripod(name='camera', location=(0, 0, 0), rotation=0, h=1.45, obstacle=True, parent='root')`<br>Mirrorless camera with a lens on a tripod, lens pointing local -Y. Origin at the floor.
- `softbox(name='softbox', location=(0, 0, 0), rotation=0, h=1.7, obstacle=True, parent='root')`<br>Photo softbox on a stand, facing local -Y (diffuser uses m_lampshade). Origin at the floor.
- `whiteboard(w=1.2, h=0.9, name='whiteboard', location=(0, 0, 0), rotation=0, stand=True, obstacle=True, seed=1, parent='root')`<br>Whiteboard with doodles (arrows, a chart, sticky notes), facing local -Y. stand=True: rolling A-frame stand (origin at the floor); stand=False: wall board whose location is the centre of its back (parent to a wall).
- `water_cooler(name='water_cooler', location=(0, 0, 0), rotation=0, obstacle=True)`<br>Office water cooler with a translucent blue bottle, taps and a cup stack.
- `coffee_machine(name='coffee_machine', location=(0, 0, 0), rotation=0, mat='metal', parent='root')`<br>Espresso machine for a counter: boiler body, group head, portafilter, drip tray, two cups on top.
- `trash_bin(style='pedal', name='trash', location=(0, 0, 0), rotation=0, mat=None, obstacle=False, parent='root')`<br>Trash can: pedal (kitchen step bin) | office (mesh basket with paper balls) | big (wheelie-ish bin with lid).
- `office_divider(w=1.4, h=1.2, name='divider', location=(0, 0, 0), rotation=0, mat='fabric_grey', obstacle=True)`<br>Fabric desk divider / low partition screen on feet (≤1.2 m so people stay visible).
- `partition(length=3.0, h=1.1, name='partition', location=(0, 0, 0), rotation=0, mat='wall_cream', cap='wood_light', t=0.12, obstacle=True)`<br>Half-height interior wall (≤1.2 m) along local X with a wooden cap — tier4 zones.
- `packing_table(w=1.6, d=0.8, name='packing_table', location=(0, 0, 0), rotation=0, interact=None, seed=1, obstacle=True)`<br>Garage packing station (top 0.9): tape gun, flattened boxes, bubble wrap roll, label printer, scale.
- `roll_up_door(w=2.6, h=2.3, wall_t=0.15, name='roll_up_door', location=(0, 0, 0), rotation=0, mat='plastic_white', open_frac=0.0, parent='root')`<br>Garage roll-up door filling an opening (location = bottom centre on the wall centre line, rotation = B.against(wall)). Horizontal slats + coil box; open_frac raises it. Parent it to its wall (decor).
- `mirror(w=0.5, h=1.5, name='mirror', location=(0, 0, 0), rotation=0, frame='wood_light', lean=True, parent='root')`<br>Full-length mirror; lean=True leans against a wall at the floor (origin at the floor, back at +Y).

<!-- api:end -->
