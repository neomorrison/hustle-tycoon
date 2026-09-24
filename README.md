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
```
Design doc: [`DESIGN.md`](DESIGN.md).
