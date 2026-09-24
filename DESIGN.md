# Hustle Tycoon — Design Doc

**Game Dev Tycoon, but you're a fry cook launching products.** Start in Mom's basement working McDoodle's shifts.
Each **launch** is a project: pick a niche + product + marketing angle + platform + size, set GDT-style **focus sliders**
through 3 stages while point bubbles pop off your team, **launch**, get **4 review scores** (CTR, CVR, AOV, ROAS),
then ride the **sales curve** — making quick **scale calls** (scale / refresh / kill) — until it fades. Read the
**post-mortem**, learn combos into your **Playbook**, research new angles/platforms/features, hire staff, move offices,
quit McDoodle's, and chase the penthouse. Pure sandbox with milestones.

**Pillars:** (1) *Arcade pace* — no waiting on samples, no form-filling; every 20–60 s something happens.
(2) *Real lessons, light touch* — real metric names and real-world logic (pain-point products want great copy;
aesthetic products want visuals + TikTak; kill losers early; refresh fatigued creatives), but scored /10 with one-liners.
(3) *GDT progression* — rising market expectations force you to grow team, research and office.
(4) *Juice* — bubbles, cha-chings, confetti, big numbers, satisfying verdict reveals.

---

## 1. Engineering conventions (every agent)
- Stack: Vite + React 19 + TS + zustand 5 + immer. `src/core/types.ts` is the STATE CONTRACT (add optional fields only).
- Mutate state only through `act(s => ...)` (immer). Sim functions take `(s: GameState, ...)` and mutate `s`.
- RNG: `core/rng.ts` with the state (`rand(s)`, `randRange`, `chance`, `pick`, `lognormal`...). Never `Math.random()` in `src/sim`.
- Money: `spend(s, amt, cat)` / `earn(s, amt, cat)` from `core/money.ts` (they update the weekly finance roll-up).
- Messages: `toast(s, kind, text, amount?)`, `coach(s, id, text)` (`core/notify.ts`). Blocking popups: push to `s.modals`
  (resolved by `sim/world.resolveModal`). Non-blocking scale calls: push to `s.decisions` (resolved by `sim/sales.resolveDecision`).
- Visual FX: sim tick functions RETURN `FX[]` (`bubble` per worker/point type, `cash`, `confetti`, `sound`); the engine emits them on
  the FX bus (`onFX` in `core/store.ts`). Keep bubbles meaningful (≈1–3 per worker per day, aggregate small amounts).
- UI: import primitives from `src/ui/kit` (Button, Panel, Badge, StatBar, Money, DialogFrame, Tabs) and its CSS tokens (`--k-*`).
  Dialogs are components in `src/ui/dialogs/<Name>.tsx` receiving `{ props, close }`, opened with `openDialog(id, props)`;
  any open dialog pauses the clock. Class prefixes per owner: `k-` kit, `m-` main, `l-` launch, `g-` management.
- Zustand selectors must return stable references (slice or primitive) — derive with `useMemo`, or `useGSShallow`.
- Typecheck: `npx tsc --noEmit`. Tests: `npx vitest run`. Bots: `npm run sim` (`scripts/bots.ts`).
- Engine: 1 tick = 1 in-game day; **1× = 0.5 s/day** (2×, 4×). Week start (day % 7 === 0): finance roll + weekly sales.
  Month start (day % 28 === 0): bills. Calendar: 7-day weeks, 4 weeks/month, 336-day years; day 0 = Y1 · Mar · W1.
- Parody brands only: Fadbook, TikTak, Instaglam Reels ("reels"), Pinterestt, Poogle Shopping ("poogle"), TikTak Shop,
  McDoodle's, AliExprez, Shopifly. Coach Kev portrait = `COACH_PORTRAIT` (p12) — never a staff member.

### Ownership
| agent | files |
|---|---|
| sim-core | `src/sim/{launch,evaluate,sales,economy,playbook,newGame,index}.ts`, `src/data/{catalog,angles,platforms,sizes,areas,combos,quotes}.ts`, `src/sim/__tests__/**`, `scripts/bots.ts` |
| sim-meta | `src/sim/{research,staff,world}.ts`, `src/data/{research,features,offices,names,events,trends,milestones,coach}.ts` |
| ui-main | `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/ui/main/**`, `src/ui/audio.ts`, `src/ui/dialogs/{DialogHost,Settings}.tsx`, `src/ui/kit/**` (additive) |
| ui-launch | `src/ui/launch/**`, `src/ui/dialogs/{NewLaunch,Sliders,Review,PostMortem,LaunchDetail}.tsx` |
| ui-management | `src/ui/manage/**`, `src/ui/dialogs/{Research,Staff,Features,Office,Playbook,Finance,DayJob,Milestones}.tsx` |

---

## 2. Content
**Niches** (from catalog.json, 63 products with images `productImage(id)`): pet, beauty, home, kitchen, fitness, wellness,
car, gadgets, baby, kids, fashion, outdoor. Start unlocked: pet, home, kitchen, gadgets.

**Angles** (= GDT genres). Start: Pain Point 🩹, Convenience ⚡, Gift 🎁. Research: Aesthetic ✨, Social Proof ⭐, Budget 💸,
Wholesome 🐶, Before/After 🔁, Luxury 💎.

**Platforms**: Fadbook (start), TikTak (research, cheap), Instaglam Reels, Pinterestt, Poogle Shopping, TikTak Shop (unlocks after a
Y2 news event + research).
| platform | base CTR | base CVR | CPM $ | fatigue/wk | audience notes |
|---|---|---|---|---|---|
| fadbook | 1.1% | 1.8% | 14 | 0.06 | 25–55, women-skew, pain point / wholesome / social proof |
| tiktak | 0.95% | 1.3% | 10.5 | 0.09 | 16–34, impulse, aesthetic / before-after / budget |
| reels | 1.0% | 1.5% | 12 | 0.08 | 18–40, aesthetic / luxury / gift |
| pinterestt | 0.7% | 1.6% | 8 | 0.04 | planners; home, beauty, fashion, kitchen, baby, gift |
| poogle | 2.2% | 3.0% | 30 | 0.03 | search intent; pain point / convenience; weak for aesthetic |
| tiktak_shop | 1.3% | 2.4% | 9 | 0.1 | in-app checkout; budget / social proof / impulse beauty & gadgets |

**Sizes** (= GDT game sizes): test (start; upfront $300, ad budget $700/wk, 28 dev days, expected-points ×1),
standard (office ≥1 + research; $2,500, $3,500/wk, 42 days, ×3), big (office ≥3 + research; $15,000, $17,500/wk, 70 days, ×9),
mega (office 5 + research; $80,000, $80,000/wk, 100 days, ×25).

**Price tier**: budget (0.7× perceived value, CVR ×1.25), standard (0.95×, ×1.0), premium (1.35×, ×0.72; luxury angle ×0.95).
Price is rounded to x.99.

**Focus areas** (sliders; 3 per stage):
Stage 1 Sourcing — Research 🔎 (→ RP + some 🔵), Quality 🧪 (removes 🔴, some 🔵), Pricing 🏷️ (→ 💜 + 🔵).
Stage 2 Store — Copy ✍️ (→ 🔵), Visuals 📸 (→ 🔵 + 🟠), Offer 🎁 (→ 💜 + 🔵).
Stage 3 Marketing — Hooks 🎬 (→ 🟠), Targeting 🎯 (→ 🟠 + RP), Influencers 🤳 (→ 🟠 + fans).

**Ideal focus per angle** (normalized sliders per stage [a,b,c]):
| angle | Sourcing [research, quality, pricing] | Store [copy, visuals, offer] | Marketing [hooks, targeting, influencers] |
|---|---|---|---|
| pain_point | .30 .50 .20 | .55 .20 .25 | .45 .40 .15 |
| convenience | .35 .35 .30 | .45 .30 .25 | .35 .50 .15 |
| gift | .25 .35 .40 | .25 .40 .35 | .35 .35 .30 |
| aesthetic | .30 .30 .40 | .15 .60 .25 | .45 .15 .40 |
| social_proof | .25 .45 .30 | .35 .35 .30 | .30 .30 .40 |
| budget | .25 .25 .50 | .30 .20 .50 | .40 .45 .15 |
| wholesome | .30 .40 .30 | .40 .40 .20 | .40 .25 .35 |
| before_after | .35 .45 .20 | .30 .50 .20 | .55 .25 .20 |
| luxury | .25 .55 .20 | .35 .50 .15 | .30 .25 .45 |
Platform shifts the Marketing ideal: tiktak/reels hooks +.10 targeting −.10; poogle targeting +.15 hooks −.15; tiktak_shop influencers +.10 targeting −.10; pinterestt Store visuals +.10 copy −.10.

**Combos** (hidden; revealed in the Playbook after you launch them): great ×1.25, good ×1.08, ok ×0.9, bad ×0.62.
- *product × angle*: map catalog `bestAngles` → angles (pain_point, health→pain_point; convenience, time_saving→convenience; gift→gift;
  social_proof→social_proof; savings→budget; aspirational→luxury (if perceived ≥ $60) else aesthetic; curiosity→aesthetic;
  pet_love, parenting, self_care→wholesome). First mapped = great, others good. Otherwise by traits: gift good if giftable ≥ .6, bad < .3;
  aesthetic good if wow ≥ .7; before_after good for beauty/cleaning with problemSolving ≥ .7, else bad; luxury good if perceived ≥ $60,
  bad < $25; budget good if perceived ≤ $25, bad ≥ $60; wholesome good for pet/baby/kids; else ok.
- *angle × platform* (9×6 table in `data/combos.ts`, sensible real-world fits, e.g. aesthetic×tiktak great, luxury×tiktak bad,
  pain_point×poogle great, aesthetic×poogle bad, budget×tiktak_shop great, gift×pinterestt great).
- *niche × platform*: fadbook/tiktak from product.platformFit (≥.8 great, ≥.65 good, ≥.45 ok, else bad); others per niche table.

---

## 3. Development (GDT dev loop) — sim-core
- `startLaunch`: pay upfront (size cost × (1 − 0.05×features researched sourcing_agent)), create `s.current` with `awaitingSliders=true`
  (engine pauses; UI opens Sliders dialog automatically). `devDays = sizeDays × (dayJob ? 1.5 : 1) × (1.2 − avgTeamSpeed/250)`.
  Stage split: 30% / 35% / 35% of devDays. Entering a new stage sets `awaitingSliders=true` again.
- Per day, each active worker (founder + staff not in training; founder output ×0.5 while employed at McDoodle's) produces
  `r = 2.0 × (0.9..1.1)` raw points split by the current stage's normalized sliders into areas; each area's points ×
  statFactor (copy stat for Copy/Quality/Pricing/Offer, creative stat for Hooks/Visuals/Influencers, research stat for Research/Targeting;
  `statFactor = 0.5 + stat/40`) × feature boosts (ai_copywriter Copy ×1.15, ugc_library Hooks/Visuals ×1.15, influencer_network Influencers ×1.3)
  → converted to point types per §2. Bugs: `+0.35 × (0.6 + defectRate×6)` per worker-day (sourcing_agent ×0.75); Quality points remove bugs 0.6:1.
  Emit `bubble` FX per worker per point type (amounts rounded; skip < 0.3).
- When the last stage completes: status `qc` offered: "Polish" spends up to 25% extra days removing bugs at 1.5/worker-day (no new points), or
  **Launch now**. `launchNow` → `evaluate` → status `live`, start SalesRun, `flags.pendingReview = id` (UI opens Review dialog), FX sound 'launch'.
- Only one launch in development at a time (office ≥4 could allow two later — not required).

## 4. Evaluation (review) — sim-core
Expected points (GDT reviewer expectation): `E = market.bar × sizeMult` (bar starts 50 on normal: easy 40, hard 60), split
expected 🔵 = 0.42E, 🟠 = 0.42E, 💜 = 0.16E, bugs = 0.25E. Ratios `C = conv/E🔵`, `T = traffic/E🟠`, `A = aov/E💜`, `B = bugs/Ebugs`.
Focus accuracy per stage `acc_i = 1 − 0.5 × L1(normalized sliders, ideal)`.
- **CTR** = baseCTR × clamp(T,.2,2.5)^0.6 × fitAP × (0.7 + 0.6·wow) × fitNP^0.5 × trend^0.5 × (0.7 + 0.3·acc₃) × seasonCTR × noise(±8%)
- **CVR** = baseCVR × clamp(C,.2,2.5)^0.6 × fitPA × fitNP^0.5 × priceTierCVR × (1 − min(.45, .25·B)×(shield ? .5 : 1)) ×
  (1 + reviews .12 + trust .05 + speed .04 + private_label .10) × (1 + brand/400) × demand(.6 + .6·baseDemand·season·(1−.5·saturation)) × (0.7 + 0.3·acc₂) × trend^0.5 × noise
- **AOV** = price × (1 + .15·clamp(A−.5, 0, 1.5) + bundles .12 + upsell .06) × (0.85 + 0.15·acc₁)
- **CPM** = platformCPM × world.cpmMultiplier(season, BFCM, inflation, platform drift) × fitNP^-0.3. CPC = CPM/(1000·CTR), CPA = CPC/CVR, **ROAS = AOV/CPA**.
- Landed unit cost = cogs + shipCost + 0.25·cogs (duty) (sourcing_agent −5%, warehouse_3pl −15% on standard+). Fees = 3% + $0.30/order.
  marginPerOrder = AOV − landed·(AOV/price) − 0.03·AOV − 0.30; **breakEvenRoas = AOV / marginPerOrder**.
- **Scores /10** (piecewise-linear): CTR 0.4%→1, 0.8%→3.5, 1.2%→5.5, 1.8%→7.5, 2.5%→9, 3.2%+→10 · CVR 0.5%→1, 1%→3.5, 1.5%→5, 2.5%→7, 3.5%→8.5, 4.7%+→10 ·
  AOV $15→2, $30→5, $50→7, $80→8.5, $120+→10 (+1 if bundles/upsell lifted it ≥10%, cap 10) · ROAS by ROAS/BE 0.5→1, 0.8→3, 1.0→5, 1.3→7, 1.7→8.5, 2.2+→10.
  **Overall** = .2 CTR + .25 CVR + .15 AOV + .4 ROAS. Verdict: ≥8.5 🏆 winner · ≥7 solid · ≥5 breakeven · else flop.
- **Quotes** (`data/quotes.ts`): 4–6 templates per metric × bucket (bad/meh/good/great) with the real number, e.g.
  "2.9% CTR — thumbs are STOPPING. That hook slaps." / "0.9% CVR — page feels sketchy. Reviews? Trust badges?" / "ROAS 2.6 vs 1.6 break-even — printing money."
- **Market bar** after each launch: `bar = max(bar·0.98 + 0.06·(totalPoints/sizeMult), bar)` and +5% per year (industry competition).
  Repeating the same product: saturation +0.25 per previous launch (demand penalty) — encourages variety like GDT.

## 5. Sales run & scale calls — sim-core
Weekly per live launch: `spend = sizeBudget × budgetMult` (paid weekly via `spend(s, …, 'adSpend')`).
`roas_t = ROAS₀ × life(t) × (1 − fatigue) × season × trend × budgetMult^(−0.2 (automation: −0.14)) × (lookalikes on fadbook ×1.05) × noise(±10%)`
- `life(t)`: week 0 = 0.8 (learning), then `exp(−(t−1)/L)`, L weeks: evergreen 22, rising 14, fad 7, declining 9 (× 1.2 if brand ≥ 50).
- `fatigue += platform fatigue/wk`; Refresh resets to 0, costs `0.08·weekly budget + $150·sizeMult`.
- revenue = spend·roas_t (+ organic repeat from fans with email_flows); units ≈ revenue/price; cogs = units·landed (×(1−marginBoost));
  fees; profit. Update stats, fans (+0.6/order, email_flows ×1.5), brand (±), finance, `peakWeekRevenue`. FX: `cash` + 'chaching' when profit > 0.
- **Scale calls** (non-blocking `Decision`s, max 1 per launch, expire in 21 days → default "hold"):
  - *scale* when roas_t ≥ 1.25·BE and ≥2 weeks since last scale: "+50% budget" (×1.5) · "Double it" (×2, next week ×0.85 learning reset) · "Hold".
  - *refresh* when fatigue ≥ 0.25: "CTR down ~N% — fresh creatives for $X?" · Refresh · Ignore.
  - *kill* when roas_t < 0.85·BE for 2 weeks: "Losing $X/wk" · Kill it · Cut budget 50% · Keep going.
  - *go_bulk* (warehouse_3pl researched, verdict ≥ solid, size ≥ standard, not yet): pay 4× weekly COGS upfront → marginBoost 0.18.
  - world events add: *price_match* (competitor undercut), *influencer* offer, *restock* (stockout).
- Run ends when revenue < 12% of peak for 2 consecutive weeks (week ≥ 4) or killed → `endLaunch` builds the post-mortem,
  pushes `LaunchRecord`, updates playbook, `flags.pendingPostMortem = id`.
- **Post-mortem** notes: combo ratings revealed; per-stage slider advice from largest deviations vs ideal ("Store: more ✍️ Copy, less 📸 Visuals
  suits Pain Point"); bugs; price tier; trend; scaling behaviour ("Kept a loser running 5 weeks (−$2.1k)" / "Scaled 3× at the right time").

## 6. Economy — sim-core
Start: cash $2,000 (easy $4,000, hard $1,000), McDoodle's day job $1,600/mo (founder output ×0.5, dev time ×1.5). Monthly: rent (office),
salaries, feature fees, day-job pay. Quit day job anytime (milestone + coach celebration); rejoin allowed (monthly $1,400, humbling toast).
Overdraft to −$3,000; below −$3,000 for 21 days → game-over modal (Load save / Start over / "Move back to Mom's": keep research & playbook,
cash $500, lose staff/office, rejoin McDoodle's) — hard difficulty has no Mom option.

## 7. Research, features, staff, offices — sim-meta
**Research points** (🟣 RP) come from dev (Research/Targeting areas + 0.3/worker-day) and launches (+10 per launch, +25 winner).
Research tree (~40 nodes, `data/research.ts`): angles (Aesthetic 30, Social Proof 45, Budget 45, Wholesome 60, Before/After 110, Luxury 180),
niches (Beauty 30, Fitness 45, Wellness 60, Car 45, Baby 75, Kids 75, Fashion 90, Outdoor 70), platforms (TikTak 20, Instaglam Reels 70
(available after "Reels launched" news Y1 Jun), Pinterestt 110, Poogle Shopping 150, TikTak Shop 160 (after Y2 news)), sizes
(Standard 60 + office ≥1, Big 300 + office ≥3, Mega 1,200 + office 5), features (Reviews app 25, Trust badges 25, Bundles 40, Upsell 50,
Email flows 60, Speed booster 40, Chargeback shield 70, UGC library 80, AI copywriter 120, Lookalikes 90, Automation 150,
Influencer network 140, Sourcing agent 100, 3PL warehouse 250 (office ≥4), Private label 400), boosts (Hook lab: Hooks ×1.1, Copy
bootcamp, Data dashboard: reveal combo hints in the New Launch dialog for known niches…). Costs RP + some cash for big ones.
**Store features** once researched are toggled on/off (monthly app fee $10–$400 each); only active features apply to launches.
**Staff**: slots by office; candidates (3–5, refresh monthly; portraits p01–p18 except p12) with role specialties
(copywriter: copy↑, video_creator: creative↑, media_buyer: research/targeting & creative, researcher: research↑, generalist),
stats 10–90 scaling with office tier & game year, salary ≈ $25 × (sum of stats) /mo. Hire/fire; training ($1,500×level, 14 days away,
+6–12 to one stat); XP per launch → level ups (+stats). Staff produce bubbles like the founder.
**Offices** (room art `roomImage(tier)`): 0 Mom's Basement ($0, 0 staff) · 1 Shared Apartment ($950, 1) · 2 Studio ($1,650, 2) ·
3 Creator Loft ($2,600, 3) · 4 House + Garage HQ ($4,200, 5) · 5 Penthouse HQ ($11,500, 7). Moving costs 2× rent; downgrade allowed.

## 8. World — sim-meta
- **Season**: Jan demand ×.8 & CPM ×.8; Feb gift ×1.3 (Valentine's); May gift/wellness/beauty ×1.25; Jun–Aug outdoor ×1.35;
  Aug gadgets/kids ×1.2; Oct CPM ×1.1; **BFCM** (Nov W4): revenue ×1.8, CPM ×1.5, toast + confetti; Dec giftable ×1.3, CPM ×1.2.
  Yearly CPM inflation +5%.
- **CNY** (Feb W1–W2): warning modal in Jan W1 ("Factories close for Chinese New Year — prep?" pay $ to pre-stock live winners or accept a
  1-week stockout); launches in dev during CNY get +30% bugs unless sourcing_agent.
- **Trends**: every 8–14 weeks a new trend (niche/angle/platform) for 10–16 weeks, ×1.3–1.6; toast + HUD ticker; `trendMult` applies to eval & sales.
- **Platform news**: Y1 Jun "Instaglam Reels launches" (research unlock), Y2 Mar "TikTak Shop is here", random "Fadbook algorithm update"
  (CPM ×1.2, 8 weeks), Y3 "TikTak ban scare" (reach ×.7, 12 weeks).
- **Random events** (weekly rolls, cooldowns): viral (live on tiktak/reels/tiktak_shop with CTR score ≥ 8: 8%/wk → that week revenue ×3, fans +),
  influencer offer (decision), competitor undercut (price_match decision on a solid+ run ≥4 wks), supplier stockout (restock decision),
  ad account ban (before_after or claimRisk ≥ .5: 6%/wk → pay agency $X or lose 2 weeks), press feature (brand +, fans +), chargeback wave
  (high bugs), Mom calls / family flavour toasts.
- **Ecom Expo** (Sep W2, office ≥1): modal — skip / $500 booth (fans +200, RP +20) / $5,000 (fans +2k, brand +5, RP +60, office ≥3) / $40,000 (office ≥5).
- **Milestones** (`data/milestones.ts`): first launch, first winner, $10k profit, quit day job, first hire, first move, 10 launches, $100k
  revenue week, BFCM $50k week, millionaire (cash ≥ $1M), all angles, penthouse, 10-year founder… toast + confetti.
- **Coach Kev** tips (`coach`) at key moments: first dialog of each kind, first review, first scale call, first loser, when monthly profit
  > 2× day job ("Time to quit McDoodle's?"), bankrupt danger, new research affordable.

## 9. UI — GDT-style
- **Title**: `roomImage('title')` backdrop, big "Hustle Tycoon" logo (Fredoka, lightning ⚡ gradient), New game (company, founder, difficulty
  cards), Continue / Load 3 slots (delete, import/export), settings. Session autosave/resume via `core/session.ts`.
- **Game screen**: office art (tier) filling the stage with a soft vignette; founder avatar (`founderPortrait(mood)`) at the desk
  (use `rooms/hotspots.json` computer box), staff avatars at sensible floor positions; working bob animation; point **bubbles** float up
  from avatars (🔵🟠💜🟣🔴 with icons) and fly toward the project card. Top HUD: company, date, **cash** (animated counter with ± pops), fans,
  RP, speed (⏸ ▶ ▶▶ ▶▶▶, Space/1/2/3), trend ticker. Bottom: **ProjectCard** (current launch: product thumb, stage segments, progress,
  point counters, Polish/Launch buttons) and **LiveProducts** strip (cards: thumb, week N, weekly revenue/profit, sparkline bars, ROAS vs BE,
  attached **decision chips** with buttons). Action dock: 🚀 New Launch, 🧪 Research (badge when something affordable), 👥 Staff,
  🧩 Features, 📒 Playbook, 📈 Finance, 🏠 Office, 🍔 Day Job, 🏆 Milestones, ⚙️ Settings. Toast feed bottom-left (GDT style) with coach
  bubble (Kev portrait). Event modals centered.
- **New Launch** wizard (one screen, card pickers): niche tabs → product grid (image, name, price range, "Amazin $X", competition, trend
  arrow, times launched; locked niches greyed) → angle cards (icon, name, one-liner) → platform cards → size → price tier → features toggles
  → name (auto-suggest) → cost summary (upfront, weekly ads, dev time) → Start. Show **Playbook knowledge** only (✓✓ great / ✓ good /
  ~ ok / ✗ bad / ? unknown) for combos already discovered.
- **Sliders**: GDT-style stage card with 3 big sliders (icons, names, short hints), live "focus" preview, playbook note for the angle.
- **Review**: drumroll → 4 score cards flip in sequence (metric name, real value, big /10, quote), overall + verdict banner; winner = confetti + fanfare.
- **Post-mortem**: totals, combo reveals, focus tips, "Saved to Playbook".
- Management dialogs: Research tree (category columns, nodes with cost/lock/owned), Staff (team cards with stats bars, training;
  candidates to hire), Features (toggles with monthly fee & effect), Office (tier cards with art, rent, slots, move), Playbook (combo matrix
  + focus notes), Finance (weekly revenue/profit chart, lifetime stats, monthly burn), Day Job (quit/rejoin), Milestones.

## 10. Balance targets (verify with `npm run sim` bots)
- *Expert bot* (learns combos from post-mortems, uses near-ideal sliders, kills losers, scales winners, refreshes): first winner by ~launch 3–5;
  quits McDoodle's Y1 M7–M11; ~$1M lifetime revenue by Y3–4; penthouse by Y5–7; ≥40% winners after year 1.
- *Random bot* (random combos/sliders, never kills/scales): ≤10% winners, stagnates or goes bankrupt within ~3 years.
- A test launch flop costs ~$500–900; an early test winner nets ~$4–15k; standard hits $30–80k; big hits $200–600k; mega $1–5M.
- Something noticeable should happen at least every ~20–40 s at 1×.

## 11. As-built tuning (supersedes the numbers above)
Balance passes with `npm run sim` moved several constants away from §2–§8. The code is the source of truth; every
tuned value is marked `*` in its constant table (`TUNING` evaluate.ts, `DEV` launch.ts, `SALES` sales.ts, `ECONOMY`
economy.ts, `data/sizes.ts`, `data/offices.ts`, `data/research.ts`).
- **Sizes** (upfront / weekly ads / dev days / expected-points × / team cap / min office): test $300 / $700 / 28 / ×1 / 2 / 0 ·
  standard $2,500 / $3,500 / 42 / ×2.5 / 4 / **Studio (2)** · big $15,000 / $17,500 / 70 / ×6.5 / 6 / 3 · mega $80,000 / $80,000 / 100 / ×13 / 8 / 5.
  Research: Standard 90 RP · Big 300 RP + $5,000 · Mega 1,200 RP + $25,000.
- **Offices**: moving in costs a one-off deposit, not 2× rent: $0 / $2,500 / $15,000 / $75,000 / $250,000 / $600,000. Rent and desks as §7.
- **Market bar**: `nextMarketBar` closes 45% of the gap to the team's per-size output (down 50% only when reviews suffer),
  max 2× jump per launch; reviews above 8.7 add hype (+12%/pt × size weight test .35 · standard .8 · big 1 · mega 1.2);
  reviews under 7 relax it 4%/pt; +5%/yr floor; halved on the move back to Mom's. Starting bar: easy 40 · normal 50 · hard 57.
- **Evaluation**: execution multipliers CTR ×1.6 / CVR ×1.5; price friction `(32/price)^0.8`; focus weight 0.45 on CTR/CVR
  (0.2 on AOV): `metric × (1 − w + w·acc)`; ROAS/break-even soft cap (knee 2.1 → cap 3.0) via rising CPM; competition and
  relaunch fatigue (+0.3 saturation per relaunch, −0.04/month).
- **Sales**: learning week 0.85, 4-week plateau before decay, dampened weekly seasonality (BFCM full), launch buzz
  (+25% organic per review point above 8, max +50%, over the first 4 weeks), scale caps test ×3 · standard ×2.5 · big/mega ×4.
  Calls last **28 days**; refresh at 30% fatigue; "dead on arrival" kill call when week 1 is under half of break-even.
- **Staff**: salary `16·Σstats + 0.036·Σstats²` (≈ $20–28 per stat point), +3% per level-up.
- **World**: first trend in weeks 7–9 (then every 8–14 weeks); company-wide viral cooldown 5 weeks; milestones and
  Coach Kev tips are spaced out (2 and 6 days).
