// QA autopilot soak: plays a new game through the real UI at 4x like a (slightly chaotic) player.
// Handles sliders/review/post-mortem/new launch/modals/decisions, researches, hires, moves office, quits the day job.
// Flags freezes (day not advancing while nothing should block), console errors and driver failures.
// Usage: node scripts/e2e/qa-soak.cjs [seconds]   (env W/H for viewport)
const { open, report, OUT } = require('./qa-lib.cjs')
const SECS = Number(process.argv[2] || 150)
;(async () => {
  const q = await open({ width: Number(process.env.W || 1440), height: Number(process.env.H || 900) })
  const { page, shot, wait, gs, act } = q
  page.setDefaultTimeout(4000)
  await page.getByText('New game', { exact: true }).click()
  await page.getByRole('button', { name: /Clock in/ }).click()
  await wait(600)
  await page.getByRole('button', { name: /Let.s hustle/ }).click()
  await wait(500)
  const counts = { launches: 0, sliders: 0, reviews: 0, postmortems: 0, modals: 0, decisions: 0, launchNow: 0, research: 0, hires: 0, moves: 0, quit: 0, freezes: 0 }
  const rnd = n => Math.floor(Math.random() * n)
  const t0 = Date.now()
  let lastDay = -1, lastChange = Date.now(), shots = 0, lastMgmt = Date.now()
  const top = () => page.evaluate(() => window.__ht.useUI.getState().dialogs.at(-1)?.id ?? '')
  while (Date.now() - t0 < SECS * 1000) {
    await page.evaluate(() => { const u = window.__ht.useUI.getState(); if (u.speed !== 4) window.__ht.setSpeed(4) })
    const t = await top()
    const st = await gs(s => ({ day: s.day, cur: s.current ? s.current.status : null, aw: !!(s.current && s.current.awaitingSliders), pol: !!(s.current && s.current.polishing), live: s.live.length, dec: s.decisions.length, modals: s.modals.length, over: !!s.gameOver, cash: Math.round(s.cash), emp: s.dayJob.employed, office: s.office }))
    const locks = await page.evaluate(() => window.__ht.useUI.getState().pauseLocks)
    if (st.day !== lastDay) { lastDay = st.day; lastChange = Date.now() }
    else if (!t && !st.modals && !st.aw && !st.over && !locks.length && Date.now() - lastChange > 6000) {
      counts.freezes++; console.log('!! FREEZE day', st.day, JSON.stringify(st), 'locks', locks); await shot('soak-freeze-' + counts.freezes); lastChange = Date.now()
    }
    try {
      if (st.over) { console.log('game over at day', st.day); await shot('soak-gameover'); break }
      if (t === 'sliders') {
        const r = page.locator('.l-sl-row input[type=range]')
        for (let i = 0; i < 3; i++) await r.nth(i).fill(String(Math.round((Math.random() * 0.9 + 0.1) * 100) / 100)) // range inputs normalise '0.10' → '0.1'
        await page.locator('.k-dialog-foot .k-btn').last().click(); counts.sliders++
      } else if (t === 'review') {
        const skip = page.locator('.k-dialog-foot .k-btn', { hasText: 'Skip' })
        if (await skip.count()) await skip.click()
        await wait(200)
        await page.locator('.k-dialog-foot .k-btn').last().click(); counts.reviews++
      } else if (t === 'postMortem') {
        await wait(150)
        await page.locator('.k-dialog-foot .k-btn', { hasText: 'Got it' }).click(); counts.postmortems++
      } else if (t === 'newLaunch') {
        const tabs = page.locator('.l-niche:not(.locked)')
        await tabs.nth(rnd(await tabs.count())).click()
        const prods = page.locator('.l-prod:not(.locked)')
        await prods.nth(rnd(await prods.count())).click()
        for (const sec of [1, 2]) {
          const opts = page.locator('.l-nl-sec').nth(sec).locator('.l-opt:not(.locked)')
          const n = await opts.count(); if (n) await opts.nth(rnd(n)).click()
        }
        const start = page.locator('.l-start')
        if (await start.isEnabled()) { await start.click(); counts.launches++ } else await page.keyboard.press('Escape')
      } else if (t) {
        await page.keyboard.press('Escape')
        await wait(100)
        if ((await top()) === t) await page.evaluate(() => window.__ht.closeDialog())
      } else if (st.modals) {
        const opts = page.locator('.l-modal-opt:not(:disabled)')
        const n = await opts.count()
        // avoid ending the run on the bankrupt modal: prefer Mom
        const mom = page.locator('.l-modal-opt', { hasText: "Mom's" })
        if (await mom.count()) await mom.click(); else await opts.nth(rnd(n)).click()
        counts.modals++
      } else if (st.dec && Math.random() < 0.6) {
        const opts = page.locator('.m-decisions .k-btn:not(:disabled)')
        const n = await opts.count()
        if (n) { await opts.nth(rnd(n)).click(); counts.decisions++ }
      } else if (st.cur === 'qc' || st.cur === 'ready') {
        if (st.cur === 'qc' && !st.pol && Math.random() < 0.4) await page.locator('.l-project-actions .k-btn', { hasText: 'Polish' }).click().catch(() => {})
        else { await page.locator('.l-launch-btn').first().click({ force: true }); counts.launchNow++ }
      } else if (!st.cur) {
        await page.locator('.m-dock-btn', { hasText: 'New Launch' }).click({ force: true })
      } else if (Date.now() - lastMgmt > 7000) {
        lastMgmt = Date.now()
        const pick = rnd(5)
        if (pick === 0) {
          await page.locator('.m-dock-btn', { hasText: 'Research' }).click()
          await wait(300)
          const tabs = page.locator('.g-tabs-bar button')
          await tabs.nth(rnd(await tabs.count())).click()
          const b = page.locator('.g-rs-foot button', { hasText: 'Research' })
          if (await b.count()) { await b.first().click(); counts.research++; await wait(300) }
          await page.keyboard.press('Escape')
        } else if (pick === 1 && st.cash > 6000) {
          await page.locator('.m-dock-btn', { hasText: 'Staff' }).click()
          await wait(300)
          await page.locator('.k-dialog button', { hasText: 'Hiring' }).first().click().catch(() => {})
          const h = page.locator('.k-dialog button:not([disabled])', { hasText: /👋 Hire/ })
          if (await h.count()) { await h.first().click(); counts.hires++ }
          await page.keyboard.press('Escape')
        } else if (pick === 2 && st.cash > 15000 * (st.office + 1)) {
          await page.locator('.m-dock-btn', { hasText: 'Office' }).click()
          await wait(300)
          const up = page.locator('.k-dialog button:not([disabled])', { hasText: '🚚 Move in' })
          if (await up.count()) { await up.first().click(); await page.locator('.k-dialog button', { hasText: 'Move in!' }).click(); counts.moves++ }
          await wait(200)
          await page.keyboard.press('Escape')
        } else if (pick === 3 && st.emp && st.cash > 12000) {
          await page.locator('.m-dock-btn', { hasText: 'Day Job' }).click()
          await wait(300)
          const qb = page.locator('.k-dialog button', { hasText: /Quit McDoodle/ })
          if (await qb.count()) { await qb.first().click(); await page.locator('.k-dialog button', { hasText: /🎉 Quit/ }).click(); counts.quit++ }
          await wait(200)
          await page.keyboard.press('Escape')
        } else if (st.live) {
          await page.locator('.l-livecard').first().click()
          await wait(400)
          await page.keyboard.press('Escape')
        }
      }
    } catch (e) {
      const L = String(e.message).split('\n')
      q.errs.push('driver: ' + [L[0], ...L.filter(x => /waiting for locator|intercepts|not stable|not enabled|not visible/.test(x)).slice(0, 2)].join(' | '))
    }
    if (Date.now() - t0 > (shots + 1) * (SECS * 1000 / 4)) await shot(`soak-${++shots}`)
    await wait(110)
  }
  const s = await gs(s => ({ day: s.day, cash: Math.round(s.cash), launches: s.stats.launches, winners: s.stats.winners, live: s.live.length, history: s.history.length, rp: Math.round(s.rp), office: s.office, staff: s.staff.length, employed: s.dayJob.employed }))
  console.log('counts', JSON.stringify(counts))
  console.log('state', JSON.stringify(s))
  await q.save(OUT + '/state-soak.json')
  report(q.errs, 'soak')
  await q.browser.close()
})().catch(e => { console.error('FAILED', e); process.exit(1) })
