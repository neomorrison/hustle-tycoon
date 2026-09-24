# Hustle Tycoon ⚡

**Game Dev Tycoon, but you're a fry cook launching products.**

Start in Mom's basement working McDoodle's shifts. Pick a niche, a product, a marketing angle and a platform, set your
focus sliders while your team pops ideas, then hit **Launch** and sweat the reviews: **CTR, CVR, AOV, ROAS**.
Ride the sales curve, make the scale calls (scale it, refresh the creatives, or kill it), learn winning combos,
research new platforms, hire a team, and move from the basement to a penthouse HQ.

▶ **Play:** https://neomorrison.github.io/hustle-tycoon/

Real e-commerce logic under the hood (pain-point products need great copy, aesthetic products want visuals on
TikTak, kill losers early, refresh fatigued creatives) — scored like a tycoon game. All brands are parodies.

Sibling project (the hardcore simulator): [Dropship Tycoon](https://github.com/neomorrison/dropship-tycoon).

## Develop
```bash
npm install
npm run dev
```

Checks:
```bash
npm run typecheck && npm test                  # types + sim unit tests
npm run sim                                    # bot players vs the balance targets in DESIGN.md §10
node scripts/e2e/qa-playthrough.cjs            # UI regression, desktop + phone (needs `npm run dev` on :5320)
node scripts/e2e/final-playthrough.cjs 6       # 6-minute Normal playthrough at 4× → scripts/e2e/out/final-*.png
node scripts/e2e/office3d.cjs                  # 3D office/title/Look editor on a GPU Chromium (own server) → scripts/e2e/out/office3d/
```
Design doc: [`DESIGN.md`](DESIGN.md).

## 3D world
The office is a live three.js diorama (Game Dev Tycoon desks, Sims-style people): the founder and one desk per hire,
everyone typing while a launch is built, coffee runs and chats between launches, bubbles popping from heads.
The title screen orbits a live city block, and New game / Settings have a Look editor for the founder.
- `src/three/`, `blender/`, `public/assets/3d/`, the room stills and `docs/3D.md` are copied byte-for-byte from
  [Dropship Tycoon](https://github.com/neomorrison/dropship-tycoon), the canonical copy. Change them there, then re-copy.
- Game side: `src/ui/main/Office3D.tsx` (stage + DOM overlays), `director.ts` (who does what), `LookEditor.tsx`,
  `TitleCity.tsx`, `three3d.ts` (settings, looks). three.js loads lazily; the 2D stills show meanwhile.
- Settings → Graphics: "3D office" on/off and Auto / High / Low. Without WebGL, or if the stage fails, the game quietly
  keeps the painted rooms (`OfficeScene.tsx`, avatars placed from `public/assets/rooms/seats.json`).
- Controls: drag to turn, wheel/pinch to zoom, right-drag to pan, Q / E turn, + / − zoom. Click the desk, the door or a
  person; click the fridge, bed or floor between launches and the founder goes there.
