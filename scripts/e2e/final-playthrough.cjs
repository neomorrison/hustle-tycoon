// Final verifier: a fresh Normal game played through the real UI at 4× by a *sensible* player for N real minutes.
// Every action is a click/keypress in the UI (the DEV-only window.__ht hook is used only to READ state for checks).
//   New Launch: reads Playbook chips, product traits, season/competition tags and break-even ROAS from the wizard.
//   Sliders: uses the Playbook recipe when there is one, else a split read off the angle's "wants" note.
//   Calls: scales winners, refreshes fatigue it can afford, kills losers, takes supply deals it can afford.
//   Management: researches a sensible order, quits McDoodle's, moves office, hires into free desks.
// Watches for: console/page errors, freezes, auto-dialogs that fail to open, NaN/undefined/Infinity on screen,
// insane numbers in state. Screenshots → scripts/e2e/out/final-*.png.
// Usage: node scripts/e2e/final-playthrough.cjs [minutes=6]   (env URL=http://localhost:5320/)
const path = require('path')
const fs = require('fs')
process.env.OUT = process.env.OUT || path.join(__dirname, 'out')
fs.mkdirSync(process.env.OUT, { recursive: true })
const { open, report } = require('./qa-lib.cjs')
const MINUTES = Number(process.argv[2] || 6)

const RATING = { great: 3, good: 2, ok: -0.5, bad: -3 }
// sliders a player would set after reading each angle's "wants" line (not the hidden ideal)
const WANTS = {
  pain_point: [[0.3, 0.6, 0.25], [0.8, 0.3, 0.35], [0.6, 0.55, 0.2]],
  convenience: [[0.5, 0.5, 0.45], [0.6, 0.4, 0.35], [0.4, 0.7, 0.2]],
  gift: [[0.3, 0.4, 0.6], [0.3, 0.6, 0.55], [0.5, 0.5, 0.4]],
  aesthetic: [[0.4, 0.4, 0.5], [0.2, 0.8, 0.3], [0.8, 0.2, 0.5]],
  social_proof: [[0.3, 0.6, 0.4], [0.5, 0.5, 0.4], [0.4, 0.4, 0.6]],
  budget: [[0.3, 0.3, 0.8], [0.4, 0.3, 0.8], [0.5, 0.5, 0.2]],
  wholesome: [[0.4, 0.5, 0.4], [0.6, 0.6, 0.3], [0.5, 0.4, 0.4]],
  before_after: [[0.4, 0.7, 0.3], [0.3, 0.7, 0.3], [0.8, 0.4, 0.3]],
  luxury: [[0.3, 0.8, 0.3], [0.4, 0.7, 0.2], [0.4, 0.3, 0.7]],
}
const RESEARCH_ORDER = [
  ['Platforms', 'TikTak ads'], ['Store features', 'Reviews app'], ['Store features', 'Trust badges'], ['Angles', 'Aesthetic angle'],
  ['Niches', 'Beauty niche'], ['Launch sizes', 'Standard launches'], ['Angles', 'Social Proof angle'], ['Store features', 'Bundles'],
  ['Platforms', 'Instaglam Reels'], ['Boosts', 'Copy bootcamp'], ['Angles', 'Budget angle'], ['Store features', 'Speed booster'],
  ['Boosts', 'Hook lab'], ['Store features', 'Post-purchase upsell'], ['Niches', 'Fitness niche'], ['Boosts', 'Data dashboard'],
  ['Angles', 'Wholesome angle'], ['Store features', 'Email flows'], ['Niches', 'Wellness niche'], ['Platforms', 'Pinterestt ads'],
  ['Store features', 'Lookalike audiences'], ['Store features', 'UGC library'], ['Supply chain', 'Sourcing agent'],
]
const OFFICE_AT = [9000, 30000, 110000, 330000, 800000] // cash a careful player wants before each move

const log = (...a) => console.log(`[${new Date().toISOString().slice(14, 19)}]`, ...a)
const issues = []
const issue = (msg) => { if (!issues.includes(msg)) { issues.push(msg); log('!! ISSUE', msg) } }

;(async () => {
  const q = await open({ width: 1440, height: 900 })
  const { page, wait, gs } = q
  page.setDefaultTimeout(2500)
  const shots = new Set()
  const shot = async (name, opts) => {
    const p = path.join(process.env.OUT, `final-${name}.png`)
    await page.screenshot({ path: p, ...opts })
    shots.add(name)
    log('[shot]', p)
  }
  // screenshot helpers: bubbles fade in after a stagger (DOM count ≠ visible); confetti lives on a canvas
  const visibleBubbles = () => page.evaluate(() => [...document.querySelectorAll('.m-bubble')].filter(e => Number(getComputedStyle(e).opacity) > 0.5).length)
  // (reads a quarter-size copy on our own canvas: repeated getImageData on the game's canvas makes Chrome warn)
  const confettiClear = () => page.evaluate(() => {
    const c = document.querySelector('.m-confetti')
    if (!c || !c.width || !c.height) return true
    const probe = window.__confettiProbe ??= document.createElement('canvas')
    probe.width = Math.ceil(c.width / 4)
    probe.height = Math.ceil(c.height / 4)
    const g = probe.getContext('2d', { willReadFrequently: true })
    g.clearRect(0, 0, probe.width, probe.height)
    g.drawImage(c, 0, 0, probe.width, probe.height)
    const d = g.getImageData(0, 0, probe.width, probe.height).data
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false
    return true
  })
  const toastCount = () => page.locator('.m-toasts .m-toast:not(.leaving)').count()
  const top = () => page.evaluate(() => window.__ht.useUI.getState().dialogs.at(-1)?.id ?? '')
  const dialogCount = () => page.evaluate(() => window.__ht.useUI.getState().dialogs.length)
  const snap = () => gs(s => ({
    day: s.day, cash: s.cash, rp: s.rp, fans: s.fans, brand: s.brand, office: s.office, staff: s.staff.length,
    emp: s.dayJob.employed, cur: s.current ? { status: s.current.status, aw: s.current.awaitingSliders, pol: !!s.current.polishing, angle: s.current.angle, stage: s.current.stage, bugs: s.current.points.bugs, fixed: s.current.bugsFixed ?? 0, qcDays: s.current.qcDays } : null,
    live: s.live.length, dec: s.decisions.length, modals: s.modals.length, over: !!s.gameOver,
    pr: s.flags.pendingReview ?? null, pm: s.flags.pendingPostMortem ?? null,
  }))

  // ---------------------------------------------------------------- title → new game (Normal)
  await wait(1200)
  await shot('01-title')
  await page.getByText('New game', { exact: true }).click()
  await wait(300)
  await page.locator('.m-diff.d-normal').click()
  await page.getByRole('button', { name: /Clock in/ }).click()
  await wait(800)
  if (await page.locator('.m-intro').count() !== 1) issue('Coach Kev intro card missing on a fresh game')
  await page.getByRole('button', { name: /Let.s hustle/ }).click()
  await wait(500)
  const diff = await gs(s => s.meta.difficulty)
  if (diff !== 'normal') issue(`difficulty is ${diff}, expected normal`)

  const counts = { launches: 0, sliders: 0, recipes: 0, reviews: 0, postmortems: 0, modals: 0, decisions: 0, polish: 0, research: 0, hires: 0, moves: 0, quit: 0, freezes: 0 }
  const verdicts = []
  const decisionLog = {}
  const t0 = Date.now()
  let lastDay = -1, lastChange = Date.now(), lastMgmt = Date.now()
  const pending = { sliders: 0, review: 0, post: 0 }
  let lastDomCheck = 0
  let builtSince = 0

  // ---------------------------------------------------------------- New Launch: pick like someone who reads the screen
  async function newLaunch() {
    await page.locator('.l-nl').waitFor()
    await wait(250)
    const st = await snap()
    const nicheTabs = page.locator('.l-niche:not(.locked)')
    const nNiches = await nicheTabs.count()
    const cands = []
    for (let i = 0; i < nNiches; i++) {
      await nicheTabs.nth(i).click()
      await wait(60)
      const prods = await page.evaluate(() => [...document.querySelectorAll('.l-prod:not(.locked)')].map((el, idx) => {
        const minis = [...el.querySelectorAll('.l-mini')]
        const comp = minis[0]?.className ?? ''
        const txt = el.innerText
        const known = el.querySelector('.l-prod-known .l-combo')?.className.split(' ')[1] ?? null
        const times = Number((el.querySelector('.l-prod-times')?.innerText ?? '').replace(/\D/g, '')) || 0
        return { idx, name: el.querySelector('.l-prod-name')?.innerText, comp, rising: /Rising/.test(txt), cooling: /Cooling/.test(txt), fad: /Fad/.test(txt), hot: /Season/.test(txt), off: /Off/.test(txt), known, times }
      }))
      for (const p of prods) {
        let sc = Math.random() * 0.8
        sc += /good/.test(p.comp) ? 1 : /info/.test(p.comp) ? 0.4 : /bad/.test(p.comp) ? -1.2 : -0.3
        sc += p.rising ? 0.6 : p.cooling ? -0.6 : 0
        sc += p.hot ? 1 : p.off ? -1 : 0
        sc -= p.times * 1.6
        if (p.known) sc += RATING[p.known]
        cands.push({ niche: i, ...p, sc })
      }
    }
    cands.sort((a, b) => b.sc - a.sc)
    const short = cands.slice(0, 5)
    let best = null
    for (const c of short) {
      await nicheTabs.nth(c.niche).click()
      await page.locator('.l-prod:not(.locked)').nth(c.idx).click()
      await wait(80)
      const angleInfo = await page.evaluate(() => {
        const traits = [...document.querySelectorAll('.l-sum-traits span')].map(e => e.innerText).join(' ')
        const sec = document.querySelectorAll('.l-nl-sec')[1]
        const opts = [...sec.querySelectorAll('.l-opt')].map((el, idx) => ({ idx, name: el.querySelector('b')?.innerText.replace(/📈/g, '').trim(), locked: el.classList.contains('locked'), rating: el.querySelector('.l-combo')?.className.split(' ')[1] ?? 'unknown', trend: !!el.querySelector('.l-hot') }))
        return { traits, opts }
      })
      const T = angleInfo.traits
      const guess = {
        'Pain Point': /real problem/.test(T) ? 1.4 : 0.2,
        Convenience: 0.5,
        Gift: /giftable/.test(T) ? 1.3 : -0.3,
        Aesthetic: /Wow factor/.test(T) ? 1.3 : 0,
        'Social Proof': 0.4,
        Budget: /Tiny price|Impulse/.test(T) ? 1.1 : -0.4,
        Wholesome: 0.4,
        'Before / After': /real problem/.test(T) && /Wow/.test(T) ? 1 : -0.5,
        Luxury: /High ticket/.test(T) ? 1.1 : -1,
      }
      let bestAngle = null
      for (const o of angleInfo.opts) {
        if (o.locked) continue
        const sc = (o.rating !== 'unknown' ? RATING[o.rating] : guess[o.name] ?? 0) + (o.trend ? 0.6 : 0)
        if (!bestAngle || sc > bestAngle.sc) bestAngle = { ...o, sc }
      }
      await page.locator('.l-nl-sec').nth(1).locator('.l-opt').nth(bestAngle.idx).click()
      await wait(60)
      const plats = await page.evaluate(() => {
        const sec = document.querySelectorAll('.l-nl-sec')[2]
        return [...sec.querySelectorAll('.l-opt')].map((el, idx) => {
          const chips = [...el.querySelectorAll('.l-combo')]
          return { idx, name: el.querySelector('b')?.innerText.replace(/📈/g, '').trim(), locked: el.classList.contains('locked'), pitch: chips[0]?.className.split(' ')[1] ?? 'unknown', buyers: chips[1]?.className.split(' ')[1] ?? 'unknown', typical: chips[1]?.classList.contains('typical'), trend: !!el.querySelector('.l-hot') }
        })
      })
      const visualAngle = /Aesthetic|Before|Budget/.test(bestAngle.name)
      let bestPlat = null
      for (const p of plats) {
        if (p.locked) continue
        const pitch = p.pitch !== 'unknown' ? RATING[p.pitch] : p.name === 'TikTak' ? (visualAngle ? 1 : -0.3) : p.name === 'Fadbook' ? (visualAngle ? 0 : 0.8) : 0.3
        const buyers = p.buyers !== 'unknown' ? RATING[p.buyers] * (p.typical ? 0.6 : 1) : 0.2
        const sc = pitch + buyers + (p.trend ? 0.5 : 0)
        if (!bestPlat || sc > bestPlat.sc) bestPlat = { ...p, sc }
      }
      await page.locator('.l-nl-sec').nth(2).locator('.l-opt').nth(bestPlat.idx).click()
      await wait(60)
      const be = await page.evaluate(() => {
        const st = [...document.querySelectorAll('.l-sum-grid .l-stat')].find(e => /BE ROAS/.test(e.innerText))
        return st ? parseFloat(st.querySelector('b').innerText.replace(/[^\d.]/g, '')) : 2
      })
      const total = c.sc + bestAngle.sc + bestPlat.sc - Math.max(0, be - 2.2) * 2
      if (!best || total > best.total) best = { c, angle: bestAngle, plat: bestPlat, be, total }
    }
    // commit the best pick
    await nicheTabs.nth(best.c.niche).click()
    await page.locator('.l-prod:not(.locked)').nth(best.c.idx).click()
    await page.locator('.l-nl-sec').nth(1).locator('.l-opt').nth(best.angle.idx).click()
    await page.locator('.l-nl-sec').nth(2).locator('.l-opt').nth(best.plat.idx).click()
    // size: biggest affordable size, keeping ~4 weeks of ads in the bank
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.l-nl-sec')[3].querySelectorAll('.l-opt')].map((el, idx) => {
      const m = (el.querySelector('small')?.innerText ?? '').match(/\$([\d,]+)\s*\+\s*\$([\d,]+)/)
      return { idx, name: el.querySelector('b')?.innerText, locked: el.classList.contains('locked'), up: m ? Number(m[1].replace(/,/g, '')) : 0, ads: m ? Number(m[2].replace(/,/g, '')) : 0 }
    }))
    let size = sizes[0]
    for (const z of sizes) if (!z.locked && st.cash - z.up >= z.ads * 4 && st.office >= 1) size = z
    await page.locator('.l-nl-sec').nth(3).locator('.l-opt').nth(size.idx).click()
    // price: budget pitch → budget tag, luxury → premium, else the tier with the easiest break-even unless it's premium on a cheap item
    const tiers = await page.evaluate(() => [...document.querySelectorAll('.l-nl-sec')[4].querySelectorAll('.l-opt')].map((el, idx) => ({ idx, name: el.querySelector('b')?.innerText, be: parseFloat(((el.querySelector('small')?.innerText ?? '').match(/break-even ROAS ([\d.]+)/) ?? [])[1] ?? '9') })))
    let tier = tiers.find(t => /Standard/i.test(t.name)) ?? tiers[1]
    if (/Budget/.test(best.angle.name)) tier = tiers.find(t => /Budget/i.test(t.name)) ?? tier
    else if (/Luxury/.test(best.angle.name)) tier = tiers.find(t => /Premium/i.test(t.name)) ?? tier
    else if (tier.be > 2.4) tier = tiers.find(t => /Premium/i.test(t.name)) ?? tier
    await page.locator('.l-nl-sec').nth(4).locator('.l-opt').nth(tier.idx).click()
    await wait(150)
    if (!shots.has('03-new-launch')) {
      await page.mouse.move(720, 30)
      await page.evaluate(() => document.querySelectorAll('.k-dialog-body, .l-nl-picks').forEach(e => { e.scrollTop = 0 }))
      await wait(250)
      await shot('03-new-launch')
    }
    const start = page.locator('.l-start')
    if (await start.isEnabled()) {
      await start.click()
      counts.launches++
      log(`launch #${counts.launches}: ${best.c.name} · ${best.angle.name} (${best.angle.rating}) · ${best.plat.name} (${best.plat.pitch}/${best.plat.buyers}) · ${size.name} · ${tier.name} · BE ${best.be} · cash $${Math.round(st.cash)}`)
    } else {
      const why = await page.locator('.l-sum-reason').innerText()
      log('cannot start:', why)
      await page.keyboard.press('Escape')
      return false
    }
    return true
  }

  async function sliders() {
    const cur = (await snap()).cur
    const use = page.locator('.l-sl-note.recipe .k-btn', { hasText: 'Use it' })
    if (await use.count() && await use.isEnabled()) { await use.click(); counts.recipes++ }
    else if (!(await page.locator('.l-sl-note.recipe').count())) {
      const w = (WANTS[cur?.angle] ?? WANTS.convenience)[cur?.stage ?? 0]
      const r = page.locator('.l-sl-row input[type=range]')
      for (let i = 0; i < 3; i++) await r.nth(i).fill(String(w[i]))
    }
    await wait(120)
    if (!shots.has('04-sliders')) await shot('04-sliders')
    await page.locator('.k-dialog-foot .k-btn').last().click()
    counts.sliders++
  }

  async function review() {
    const first = counts.reviews === 0
    if (!first) { const skip = page.locator('.k-dialog-foot .k-btn', { hasText: 'Skip' }); if (await skip.count()) await skip.click() }
    const t = Date.now()
    while (Date.now() - t < 15000 && !(await page.locator('.l-rv-banner-title').count())) await wait(150)
    // the footer swaps Skip → "Let's sell!" once the ceremony finishes
    while (Date.now() - t < 15000 && await page.locator('.k-dialog-foot .k-btn', { hasText: 'Skip' }).count()) await wait(150)
    await wait(first ? 1600 : 300)
    const r = await gs(s => { const id = s.flags.pendingReview; const l = s.live.find(x => x.id === id) ?? s.archive?.find(x => x.id === id); return l?.review ? { name: l.name, overall: l.review.overall, verdict: l.review.verdict, scores: l.review.scores, roas: l.review.roas, be: l.review.breakEvenRoas } : null })
    if (r) {
      verdicts.push(r.verdict)
      log(`review: ${r.name} ${r.overall.toFixed(1)} ${r.verdict} (ctr ${r.scores.ctr.toFixed(1)} cvr ${r.scores.cvr.toFixed(1)} aov ${r.scores.aov.toFixed(1)} roas ${r.scores.roas.toFixed(1)} · ${r.roas.toFixed(2)} vs BE ${r.be.toFixed(2)})`)
      for (const [k, v] of Object.entries(r.scores)) if (!(v >= 1 && v <= 10)) issue(`review score ${k}=${v} out of 1..10`)
      if (!(r.overall >= 1 && r.overall <= 10)) issue(`overall ${r.overall} out of range`)
    }
    // shots: the first review, then the first one with a different verdict (after Skip the scores still count up ~1 s)
    const want = !shots.has('05-review') ? '05-review' : r && r.verdict !== verdicts[0] && !shots.has('05b-review-other-verdict') ? '05b-review-other-verdict' : null
    if (want) {
      const final = r ? r.overall.toFixed(1) : ''
      const t1 = Date.now()
      while (Date.now() - t1 < 3000 && (await page.locator('.l-rv-overall b').innerText().catch(() => '')) !== final) await wait(100)
      await wait(250)
      await shot(want)
    }
    await page.locator('.k-dialog-foot .k-btn').last().click()
    counts.reviews++
  }

  async function postMortem() {
    await wait(counts.postmortems === 0 ? 2200 : 500)
    if (!shots.has('09-post-mortem')) await shot('09-post-mortem')
    await page.getByRole('button', { name: /Got it/ }).click()
    counts.postmortems++
  }

  async function modal() {
    const m = await gs(s => s.modals[0] && { kind: s.modals[0].kind, title: s.modals[0].title, options: s.modals[0].options })
    const cash = (await snap()).cash
    const opts = page.locator('.l-modal-opt:not(:disabled)')
    const labels = await opts.allInnerTexts()
    const pickBy = async (re) => { const i = labels.findIndex(l => re.test(l)); if (i >= 0) { await opts.nth(i).click(); return labels[i] } return null }
    let chosen = null
    const cost = (re) => { const o = m.options.find(o => re.test(o.label)); return o?.cost ?? Infinity }
    if (m.kind === 'bankrupt') chosen = await pickBy(/Mom/)
    else if (/Pre-stock/.test(labels.join())) chosen = cost(/Pre-stock/) < cash * 0.25 ? await pickBy(/Pre-stock/) : await pickBy(/Risk it/)
    else if (/Booth/.test(labels.join())) chosen = cash > 5000 ? await pickBy(/^Booth|Booth \(/) : await pickBy(/Skip/)
    else if (/agency/.test(labels.join())) chosen = cost(/agency/) < cash * 0.2 ? await pickBy(/agency/) : await pickBy(/Appeal/)
    if (!chosen) { const i = m.options.findIndex(o => o.tone === 'primary' && !(o.cost > cash * 0.3)); chosen = await pickBy(new RegExp('^' + (m.options[i >= 0 ? i : 0].label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 12)))) }
    if (!chosen) { await opts.first().click(); chosen = labels[0] }
    log(`modal ${m.kind}: "${m.title}" → ${chosen}`)
    counts.modals++
  }

  async function decisions() {
    const tray = page.locator('.m-decisions .l-tray')
    if (!(await tray.count())) return
    // move the mouse over the tray: it holds the clock while you read the call (like a player would)
    const box = await tray.boundingBox()
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + 12); await page.mouse.move(box.x + box.width / 2 + 10, box.y + 20, { steps: 3 }) }
    const card = page.locator('.m-decisions .l-decision').first()
    if (!(await card.count())) return
    const info = await card.evaluate(el => ({ kind: el.querySelector('.l-dec-title small')?.innerText.split(' · ')[0], title: el.querySelector('.l-dec-title b')?.innerText, opts: [...el.querySelectorAll('.l-dec-opt')].map(o => ({ label: o.querySelector('.l-dec-label')?.innerText, cost: Number((o.querySelector('small')?.innerText ?? '').replace(/[^\d]/g, '')) || 0, disabled: o.querySelector('button').disabled })) }))
    if (!shots.has('06-live-decision') && (await page.locator('.l-livecard').count())) await shot('06-live-decision')
    const cash = (await snap()).cash
    const want = {
      'Scale call': cash > 6000 ? /\+50%/ : /Hold/,
      'Ad fatigue': /Refresh/,
      'Kill call': /Kill it/,
      'Supply deal': /Buy in bulk/,
      'Price war': /Match price/,
      'Influencer offer': /Send free/,
      Stockout: /Air-freight/,
    }[info.kind] ?? /./
    const afford = o => !o.disabled && (!o.cost || o.cost < cash * (info.kind === 'Ad fatigue' ? 0.35 : 0.25))
    let i = info.opts.findIndex(o => want.test(o.label) && afford(o))
    if (i < 0) i = info.opts.findIndex(o => !o.disabled && !o.cost)
    if (i < 0) return
    await card.locator('.l-dec-opt button').nth(i).click()
    const key = `${info.kind} → ${info.opts[i].label}`
    decisionLog[key] = (decisionLog[key] ?? 0) + 1
    counts.decisions++
    await page.mouse.move(700, 200)
  }

  async function research() {
    await page.locator('.m-dock-btn', { hasText: 'Research' }).click()
    await page.locator('.g-rs-tree').waitFor()
    let done = 0
    for (const [cat, name] of RESEARCH_ORDER) {
      const tab = page.locator('.g-tabs-bar button', { hasText: cat })
      if (!(await tab.count())) continue
      await tab.first().click()
      const node = page.locator('.g-rs-node.ready', { has: page.locator('.g-rs-name', { hasText: new RegExp(`^${name.replace(/[/()]/g, '.')}$`) }) })
      if (await node.count()) {
        await node.locator('.g-rs-foot button', { hasText: 'Research' }).click()
        counts.research++
        done++
        log(`research: ${name}`)
        await wait(700)
        if (!shots.has('07-research')) await shot('07-research')
        if (done >= 2) break
      }
    }
    await page.keyboard.press('Escape')
    return done
  }

  async function management(st) {
    if ((await top()) || (await snap()).modals) return // something popped up since the loop looked
    // 1) research when the dock badge says something is affordable
    const badge = await page.locator('.m-dock-btn', { hasText: 'Research' }).locator('.m-badge').count()
    if (badge) { await research(); return }
    // 2) quit McDoodle's once there is a real cushion
    if (st.emp && st.cash > 11000 && verdicts.some(v => v === 'winner' || v === 'solid')) {
      await page.locator('.m-dock-btn', { hasText: 'Day Job' }).click()
      const qb = page.locator('.k-dialog button', { hasText: /Quit McDoodle/ })
      await qb.first().waitFor()
      await qb.first().click()
      await page.locator('.k-dialog button', { hasText: /🎉 Quit/ }).click()
      counts.quit++
      log('quit McDoodle\'s at day', st.day, 'cash', Math.round(st.cash))
      await wait(1500)
      await page.keyboard.press('Escape')
      return
    }
    // 3) move up when the bank can carry it
    if (st.office < 5 && st.cash > OFFICE_AT[st.office] && (st.office > 0 || !st.emp)) {
      await page.locator('.m-dock-btn', { hasText: 'Office' }).click()
      await wait(400)
      const up = page.locator('.k-dialog button:not([disabled])', { hasText: '🚚 Move in' })
      if (await up.count()) {
        await up.first().click()
        await page.locator('.k-dialog button', { hasText: 'Move in!' }).click()
        counts.moves++
        log('moved office →', st.office + 1, 'cash', Math.round(st.cash))
        await wait(1200)
      }
      await page.keyboard.press('Escape')
      return
    }
    // 4) hire into a free desk
    const plus = await page.locator('.m-dock-btn', { hasText: 'Staff' }).locator('.m-badge').count()
    if (plus && st.cash > 8000) {
      await page.locator('.m-dock-btn', { hasText: 'Staff' }).click()
      await wait(300)
      await page.locator('.k-dialog button', { hasText: 'Hiring' }).first().click()
      await wait(200)
      const h = page.locator('.k-dialog button:not([disabled])', { hasText: /👋 Hire/ })
      if (await h.count()) {
        await h.first().click()
        counts.hires++
        log('hired, staff now', st.staff + 1)
        await wait(600)
        await page.locator('.k-dialog button', { hasText: /^Team/ }).first().click().catch(() => {})
        await wait(300)
        await shot('08-staff')
      }
      await page.keyboard.press('Escape')
    }
  }

  // ---------------------------------------------------------------- main loop
  while (Date.now() - t0 < MINUTES * 60000) {
    const t = await top()
    const st = await snap()
    const locks = await page.evaluate(() => window.__ht.useUI.getState().pauseLocks)
    const spd = await page.evaluate(() => window.__ht.useUI.getState().speed)
    // --- health checks
    if (!Number.isFinite(st.cash) || !Number.isFinite(st.rp) || !Number.isFinite(st.fans) || !Number.isFinite(st.brand)) issue(`non-finite numbers: ${JSON.stringify(st)}`)
    if (st.brand < 0 || st.brand > 100) issue(`brand out of range: ${st.brand}`)
    const blocked = !!t || st.modals > 0 || !!st.cur?.aw || st.over || locks.length > 0 || spd === 0
    // a freeze = the clock should run but the day doesn't move; time spent blocked (dialogs, popups, pause) doesn't count
    if (st.day !== lastDay || blocked) { lastDay = st.day; lastChange = Date.now() }
    if (!blocked && Date.now() - lastChange > 5000) { counts.freezes++; issue(`freeze at day ${st.day}: ${JSON.stringify(st)}`); await shot(`freeze-${counts.freezes}`); lastChange = Date.now() }
    const nDialogs = await dialogCount()
    // a finished launch must not sit unlaunched (driver or UI problem)
    const built = st.cur && (st.cur.status === 'qc' || st.cur.status === 'ready') && !st.cur.pol
    if (built && !nDialogs && !st.modals) { if (!builtSince) builtSince = Date.now(); else if (Date.now() - builtSince > 15000) { issue(`finished launch left unlaunched for 15 s at day ${st.day}`); builtSince = Date.now() + 600000 } } else builtSince = 0
    const check = (key, cond, label) => { if (cond) { if (!pending[key]) pending[key] = Date.now(); else if (Date.now() - pending[key] > 2500) { issue(`${label} did not auto-open (day ${st.day})`); pending[key] = Date.now() + 60000 } } else pending[key] = 0 }
    check('sliders', st.cur?.aw && nDialogs === 0 && !st.pr && !st.pm, 'Sliders')
    check('review', st.pr && nDialogs === 0, 'Review')
    check('post', st.pm && nDialogs === 0 && st.modals === 0 && !st.pr, 'Post-mortem')
    if (Date.now() - lastDomCheck > 4000) {
      lastDomCheck = Date.now()
      const bad = await page.evaluate(() => { const txt = document.body.innerText; const m = txt.match(/.{0,40}\b(NaN|undefined|Infinity|null)\b.{0,40}/); return m ? m[0] : null })
      if (bad) issue(`suspicious text on screen: "${bad.replace(/\n/g, ' ')}"`)
      const bad2 = await gs(s => { const out = []; for (const l of s.live) { const r = l.sales; if (!r) continue; for (const w of r.weeks) if (![w.revenue, w.spend, w.profit, w.roas, w.units].every(Number.isFinite) || w.revenue < 0 || w.spend < 0) out.push(`${l.name} wk${w.week}`) } for (const tt of s.toasts) if (/NaN|undefined|Infinity/.test(tt.text)) out.push('toast: ' + tt.text); return out })
      if (bad2.length) issue(`bad numbers: ${bad2.slice(0, 3).join(' | ')}`)
    }
    try {
      if (st.over) { issue(`game over at day ${st.day}`); await shot('gameover'); break }
      if (t === 'sliders') await sliders()
      else if (t === 'review') await review()
      else if (t === 'postMortem') await postMortem()
      else if (t === 'newLaunch') { if (!(await newLaunch())) lastMgmt = Date.now() }
      else if (t) { log('closing unexpected dialog', t); await page.keyboard.press('Escape') }
      else if (st.modals) await modal()
      else if (st.dec) await decisions()
      else if (st.cur && (st.cur.status === 'qc' || st.cur.status === 'ready')) {
        const polish = page.locator('.l-project-actions .k-btn', { hasText: 'Polish' })
        if (st.cur.status === 'qc' && !st.cur.pol && st.cur.qcDays === 0 && st.cur.bugs >= 4 && await polish.count() && await polish.isEnabled()) { await polish.click(); counts.polish++ }
        // force: "Launch it!" throbs (CSS scale animation), which Playwright's stability check never accepts
        else if (!st.cur.pol || st.cur.bugs - st.cur.fixed < 1) await page.locator('.l-launch-btn').first().click({ force: true })
      } else if (!st.cur) {
        if (Date.now() - lastMgmt > 4000) { lastMgmt = Date.now(); await management(st) }
        if (!(await top())) await page.locator('.m-dock-btn', { hasText: 'New Launch' }).click()
      } else {
        if (spd !== 4) await page.keyboard.press('3')
        if (st.cur.status === 'dev' && !shots.has('02-office-bubbles') && (await visibleBubbles()) >= 2 && (await confettiClear())) await shot('02-office-bubbles')
        // the team shot waits for the hire fanfare (confetti + toasts) to clear so the office itself is visible
        if (st.cur.status === 'dev' && st.staff > 0 && !shots.has('02b-office-team-bubbles') && (await visibleBubbles()) >= 2 && (await toastCount()) <= 3 && (await confettiClear())) await shot('02b-office-team-bubbles')
        if (Date.now() - lastMgmt > 9000) { lastMgmt = Date.now(); await management(st) }
      }
    } catch (e) {
      const L = String(e.message).split('\n')
      q.errs.push('driver: ' + [L[0], ...L.filter(x => /waiting for locator|intercepts|not stable|not enabled|not visible/.test(x)).slice(0, 2)].join(' | '))
      await page.keyboard.press('Escape').catch(() => {})
    }
    await wait(120)
  }

  // ---------------------------------------------------------------- wrap-up
  if ((await top()) === 'newLaunch') { await page.keyboard.press('Escape').catch(() => {}); await wait(300) }
  await page.keyboard.press('Space').catch(() => {})
  await wait(400)
  await shot('10-end-state')
  const s = await gs(s => ({ day: s.day, date: `Y${Math.floor(s.day / 336) + 1} M${Math.floor((s.day % 336) / 28) + 1}`, cash: Math.round(s.cash), rp: Math.round(s.rp), fans: Math.round(s.fans), brand: Math.round(s.brand), launches: s.stats.launches, winners: s.stats.winners, lifetimeRevenue: Math.round(s.stats.lifetimeRevenue), lifetimeProfit: Math.round(s.stats.lifetimeProfit), live: s.live.length, history: s.history.map(h => `${h.name}:${h.verdict}:${Math.round(h.profit)}`), office: s.office, staff: s.staff.length, employed: s.dayJob.employed, research: s.unlocked.research, bar: Math.round(s.market.bar), milestones: Object.keys(s.milestones).length }))
  fs.writeFileSync(path.join(process.env.OUT, 'final-state.json'), JSON.stringify(await gs(s => s)))
  log('counts', JSON.stringify(counts))
  log('verdicts', verdicts.join(' '))
  log('decisions', JSON.stringify(decisionLog))
  log('state', JSON.stringify(s, null, 1))
  report(q.errs, 'final')
  log(`issues: ${issues.length}`)
  for (const i of issues) log('  -', i)
  await q.browser.close()
  process.exit(issues.length || q.errs.some(e => !e.startsWith('driver:')) ? 1 : 0)
})().catch(e => { console.error('CRASHED', e); process.exit(1) })
