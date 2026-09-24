// OWNER: sim-meta. Coach Kev's one-liners (portrait COACH_PORTRAIT). Each id fires once per save via core/notify.coach().
// Tone: ex-fry-cook hype man who actually knows e-commerce. Short, practical, a little bit extra.

export const COACH = {
  // ---- onboarding & first-time moments
  welcome: "Yo, I'm Kev — ex-fry cook, now I coach hustlers. Hit 🚀 New Launch, pick a product and let's cook something that isn't fries.",
  dayjob_slow: "Heads up: while you're still at McDoodle's you build at half speed. Quit once your launches out-earn the paycheck 2× — not before.",
  first_review: 'Four numbers run e-com: CTR (do they click?), CVR (do they buy?), AOV (how much?) and ROAS (does it pay?). ROAS above break-even = profit.',
  first_winner: "WINNER! 🏆 Now milk it: scale while ROAS holds and refresh creatives when they tire. Winners don't last forever.",
  first_loser: "Flops happen to everyone. The post-mortem tells you exactly why — combos, focus and complaints. Read it, then launch again.",
  first_scale: 'Scale call! Beating break-even by 25%+ means the ad account wants more budget. +50% is safe; doubling resets the algorithm a bit.',
  first_refresh: "Creative fatigue: people have seen your ad a dozen times and CTR is sliding. Fresh creatives are the cheapest fix in e-com.",
  first_kill: 'Killing a loser early is the most profitable button in e-commerce. Every extra week is cash on fire.',
  first_research: "First research! New angles and platforms mean new combos — and new combos are where the winners hide.",
  first_feature: 'Store apps charge a monthly fee but lift every launch. Flip them off in 🧩 Features if cash gets tight.',
  first_platform: "New platform! Every platform has its own crowd — aesthetic loves TikTak and Reels, pain points love Fadbook and Poogle.",
  standard_size: 'Standard launches: 5× the ad budget, 2.5× the expectations. Put three people on them — solo founders drown here.',
  first_hire: "Your first hire! Match people to launches: copywriters for pain points, video creators for TikTak, media buyers for targeting.",
  first_trend: 'Trends multiply demand for a niche, angle or platform. Launch INTO a trend while it\'s hot — they fade in a few months.',
  first_training: 'Training takes someone off the floor for 2 weeks but the stat bump lasts forever. Train between launches.',
  first_levelup: 'Level up! Every launch gives the team XP — even flops teach something.',

  // ---- money & career
  quit_nudge: "Your launches made over 2× your McDoodle's paycheck last month. Time to hang up the hairnet? (🍔 Day Job)",
  quit_nudge_big: "Real talk: you're making 4× your McDoodle's pay and still flipping burgers at half speed. The fryer will survive without you.",
  overdraft: "You're in overdraft. Stop the bleeding: kill losers, switch off apps you don't use, skip the fancy office.",
  bankrupt_danger: '🚨 Red alert: below −$3,000 for 3 weeks is game over. Kill flops, fire expensive hires, or rejoin McDoodle\'s for a paycheck.',
  move_out: "Mom's basement has zero desks for staff. Move into a Shared Apartment (🏠 Office) and hire your first teammate.",
  hire_first: "You've got a free desk! Hire someone whose strengths match your launches (👥 Staff). Salaries are monthly — hire when cash can carry it.",
  research_affordable: "You've got enough 🟣 RP for new research. Hit 🧪 Research — tiny investments, permanent upgrades.",
  idle: "Your team's been idle for weeks and idle hands don't print money. Start a new launch!",
  bar_rising: "The market's getting smarter every year — same effort, worse reviews. Grow the team, research, and go bigger to keep up.",

  // ---- world events
  bfcm_prep: 'BFCM is NEXT WEEK: CPMs jump ~50% but carts jump ~80%. Have winners live and scaled going in.',
  bfcm: 'Black Friday week. This is the Super Bowl of e-com — every live winner should be spending.',
  cny: "Chinese New Year shuts factories for two weeks. Real dropshippers stock up in January. A Sourcing Agent keeps quality steady.",
  viral: 'Going viral is luck + a great hook. CTR 8+ on TikTak-style platforms buys you more lottery tickets.',
  stockout: 'Stockouts kill momentum — ads keep spending, orders can\'t ship. A Backup Supplier (🧪 Research) makes them rare.',
  price_match: 'Copycats show up the moment you win. Matching price protects volume but eats margin; out-branding protects both.',
  influencer: 'Influencer deals are a gamble. They pay off when the product fits the audience and your page converts (CVR).',
  ad_ban: 'Before/After and bold health claims get ad accounts banned. Crisis PR and cleaner angles keep you online.',
  expo: "Trade shows are a fan and RP firehose. Bigger booths need bigger offices — and bigger wallets.",
  algo_update: "Fadbook moved the goalposts again. When CPMs spike, lean on other platforms until it settles.",
  ban_scare: "TikTak ban scare: reach is down while everyone panics. Diversify platforms — never bet the company on one app.",
  press: 'Press is free brand. Brand lifts conversion AND makes winners last longer.',
  chargeback: 'Chargebacks come from complaints 🔴. More Quality focus, Polish before launch, and a Chargeback Shield all help.',

  // ---- first time each dialog opens (ui calls coachDialog(s, id))
  'dlg:newLaunch': 'Pick a product, an angle (the "why buy"), a platform (where) and a size. Combos you discover get saved to your 📒 Playbook.',
  'dlg:sliders': 'Sliders = where your team spends its time this stage. Match the angle: pain points want Copy, aesthetic wants Visuals.',
  'dlg:review': 'Launch reviews! Scores are out of 10 and the overall weighs ROAS heaviest — profit beats pretty.',
  'dlg:postMortem': 'Post-mortems are free lessons. The focus tips tell you exactly which sliders to move next time.',
  'dlg:research': '🟣 RP comes from the Research & Targeting sliders plus every launch. Unlock angles & platforms first — they open new combos.',
  'dlg:staff': 'Stats matter: Copy powers Copy/Offer/Quality/Pricing, Creative powers Hooks/Visuals/Influencers, Research powers Research/Targeting.',
  'dlg:features': 'Features only help when they\'re ON, and ON costs a monthly fee. Early on: Reviews + Trust badges are cheap CVR.',
  'dlg:office': 'Bigger office = more desks, bigger launch research and bigger rent. Move when your launches can carry the rent 3× over.',
  'dlg:playbook': "Your Playbook remembers every combo you've tried: ✓✓ great, ✓ good, ~ ok, ✗ bad. Winners repeat patterns.",
  'dlg:finance': "Watch ROAS vs break-even and your monthly burn. Revenue is vanity, profit is sanity.",
  'dlg:dayJob': "McDoodle's pays the bills but halves your output. The classic move: quit when launches reliably beat 2× the paycheck.",
  'dlg:milestones': 'Milestones are bragging rights. Some are sneaky — try launching a little bit of everything.',
} as const

export type CoachId = keyof typeof COACH
