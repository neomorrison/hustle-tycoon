// QA regression playthrough: one run through every core flow of Hustle Tycoon via the real UI.
//   title → new game → intro → New Launch → 3 slider stages → polish → launch → review → weekly sales →
//   scale call → post-mortem → research → office move → hire → features → quit day job → event modal →
//   save + reload resume → save & quit → load slot → bankruptcy → game over → call Mom, then a phone pass.
// Every step asserts something; the run fails (exit 1) on a failed step or any console error.
// Usage: node scripts/e2e/qa-playthrough.cjs            (env URL=http://localhost:5320/  OUT=<screenshot dir>)
const path = require('path')
const fs = require('fs')
process.env.OUT = process.env.OUT || path.join(__dirname, 'tmp', 'playthrough')
fs.mkdirSync(process.env.OUT, { recursive: true })
const { open, report } = require('./qa-lib.cjs')

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${extra ? ` (${extra})` : ''}`)
  if (!ok) fails.push(label)
}

async function desktop() {
  const q = await open({ width: 1440, height: 900 })
  const { page, shot, wait, gs, act, dialogs, speed, tick } = q
  page.setDefaultTimeout(6000)
  const top = () => page.evaluate(() => window.__ht.useUI.getState().dialogs.at(-1)?.id ?? '')
  const untilTop = async (id, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await top()) === id) return true; await wait(120) } return false }

  console.log('\n# Title & new game')
  await shot('01-title')
  await page.getByText('New game', { exact: true }).click()
  await page.getByRole('button', { name: /Clock in/ }).click()
  await wait(700)
  check(await page.locator('.m-intro').count() === 1, 'Coach Kev intro card shows on a fresh game')
  await shot('02-intro')
  await page.getByRole('button', { name: /Let.s hustle/ }).click()
  check(await untilTop('newLaunch'), 'Let’s hustle opens New Launch')

  console.log('\n# First launch')
  await page.locator('.l-prod:not(.locked)').first().click()
  await wait(250)
  check(await page.locator('.l-start').isEnabled(), 'Start is enabled once a product is picked')
  await shot('03-newlaunch')
  await page.locator('.l-start').click()
  for (let stage = 0; stage < 3; stage++) {
    check(await untilTop('sliders'), `Sliders open for stage ${stage + 1}`)
    if (stage === 0) await shot('04-sliders')
    await page.locator('.k-dialog-foot .k-btn').last().click()
    await speed(4)
    const t0 = Date.now()
    while (Date.now() - t0 < 20000) {
      const r = await gs(s => ({ aw: !!s.current?.awaitingSliders, st: s.current?.status }))
      if (r.aw || r.st !== 'dev') break
      await wait(120)
    }
    if (stage === 0) await shot('05-dev-bubbles')
  }
  await speed(1)
  await wait(400)
  check((await gs(s => s.current?.status)) === 'qc', 'Launch reaches QC after the 3rd stage')
  const polish = page.locator('.l-project-actions .k-btn', { hasText: 'Polish' })
  if (await polish.isEnabled()) { await polish.click(); await wait(1200) }
  await page.locator('.l-launch-btn').first().click()
  check(await untilTop('review'), 'Launch opens the review ceremony')
  await wait(1800)
  await shot('06-review-reveal')
  const t1 = Date.now()
  while (Date.now() - t1 < 12000 && !(await page.locator('.k-dialog-foot .k-btn', { hasText: /sell|Got it|Close|Onward|Next/i }).count())) await wait(200)
  await shot('07-review-final')
  await page.locator('.k-dialog-foot .k-btn').last().click()
  await wait(300)
  check((await dialogs()).length === 0 && !(await gs(s => s.flags.pendingReview)), 'Review closes and clears pendingReview')
  check((await gs(s => s.live.length)) === 1, 'The launch is live')

  console.log('\n# Weekly sales, calls, post-mortem')
  let sawCall = false
  for (let w = 0; w < 40; w++) {
    await tick(7, s => s.decisions.length > 0 || !!s.flags.pendingPostMortem || s.modals.length > 0)
    await wait(250)
    const r = await gs(s => ({ d: s.decisions.length, m: s.modals.length, pm: s.flags.pendingPostMortem ?? null }))
    if (r.m) { await page.locator('.l-modal-opt:not(:disabled)').first().click(); await wait(250); continue }
    if (r.d && !sawCall) {
      sawCall = true
      await shot('08-scale-call')
      const n0 = await gs(s => s.decisions.length)
      await page.locator('.m-decisions .l-decision .k-btn:not(:disabled)').first().click()
      await wait(250)
      check((await gs(s => s.decisions.length)) < n0, 'Clicking a call option resolves it')
      continue
    }
    if (r.d) await page.locator('.m-decisions .l-decision .k-btn:not(:disabled)').last().click().catch(() => {})
    if (r.pm) break
  }
  check(sawCall, 'At least one scale/refresh/kill call appeared')
  if (!(await gs(s => s.flags.pendingPostMortem))) {
    await page.locator('.l-livecard .l-qbtn.kill').first().click()
    await page.locator('.l-livecard .l-qbtn.kill').first().click()
  }
  check(await untilTop('postMortem', 8000), 'The run ends in a post-mortem')
  await wait(1500)
  await shot('09-postmortem')
  await page.getByRole('button', { name: /Got it/ }).click()
  await wait(300)
  check(!(await gs(s => s.flags.pendingPostMortem)), 'Post-mortem clears pendingPostMortem')
  check((await gs(s => Object.keys(s.playbook.combos).length)) >= 3, 'Combos were revealed into the Playbook')

  console.log('\n# Management')
  await speed(0)
  await act(s => { s.cash += 80000; s.rp += 400 })
  await page.locator('.m-dock-btn', { hasText: 'Research' }).click()
  await wait(700)
  const rp0 = await gs(s => s.unlocked.research.length)
  await page.locator('.g-rs-foot button', { hasText: 'Research' }).first().click()
  await wait(700)
  check((await gs(s => s.unlocked.research.length)) === rp0 + 1, 'Research unlocks a node')
  await shot('10-research')
  await page.keyboard.press('Escape')
  await page.locator('.m-dock-btn', { hasText: 'Office' }).click()
  await wait(700)
  await page.locator('.k-dialog button:not([disabled])', { hasText: '🚚 Move in' }).first().click()
  await page.locator('.k-dialog button', { hasText: 'Move in!' }).click()
  await wait(900)
  check((await gs(s => s.office)) === 1, 'Office move to the Shared Apartment')
  await page.keyboard.press('Escape')
  await page.locator('.m-dock-btn', { hasText: 'Staff' }).click()
  await wait(700)
  await page.locator('.k-dialog button', { hasText: 'Hiring' }).first().click()
  await page.locator('.k-dialog button:not([disabled])', { hasText: /👋 Hire/ }).first().click()
  await wait(600)
  check((await gs(s => s.staff.length)) === 1, 'Hiring a candidate fills the desk')
  await shot('11-staff')
  await page.keyboard.press('Escape')
  await page.locator('.m-dock-btn', { hasText: 'Features' }).click()
  await wait(600)
  check((await top()) === 'features', 'Features opens')
  await page.keyboard.press('Escape')
  await page.locator('.m-dock-btn', { hasText: 'Day Job' }).click()
  await wait(600)
  await page.locator('.k-dialog button', { hasText: /Quit McDoodle/ }).first().click()
  await page.locator('.k-dialog button', { hasText: /🎉 Quit/ }).click()
  await wait(900)
  check(!(await gs(s => s.dayJob.employed)), 'Quitting McDoodle’s')
  await page.keyboard.press('Escape')
  for (const d of ['Finance', 'Playbook', 'Milestones', 'Settings']) {
    await page.locator('.m-dock-btn', { hasText: d }).click()
    await wait(500)
    const open = (await top()).toLowerCase() === d.toLowerCase()
    await page.keyboard.press('Escape')
    await wait(200)
    check(open && (await dialogs()).length === 0, `${d} opens and Esc closes it`)
  }
  await wait(400)
  await shot('12-office-with-staff')

  console.log('\n# Event modal')
  await act(s => { s.modals.push({ id: 'qa-expo', kind: 'expo', title: 'Ecom Expo — Year 1', body: 'Grab a booth?', emoji: '🎪', options: [{ id: 'skip', label: 'Skip it' }, { id: 'booth', label: 'Booth ($500)', cost: 500, tone: 'primary', hint: '+200 fans' }], data: { year: 1 } }) })
  await wait(500)
  await shot('13-event')
  await page.locator('.l-modal-opt', { hasText: 'Booth' }).click()
  await wait(300)
  check((await gs(s => s.modals.length)) === 0, 'Event modal resolves')

  console.log('\n# Save, reload, load slot')
  await page.evaluate(async () => { const m = await import('/src/core/session.ts'); await m.saveNow(true) })
  const day = await gs(s => s.day)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__ht && window.__ht.useGame.getState().state)
  await wait(900)
  check((await gs(s => s.day)) === day && (await page.evaluate(() => window.__ht.useUI.getState().screen)) === 'game', 'Reload resumes the same game')
  await speed(0)
  await page.locator('.m-dock-btn', { hasText: 'Settings' }).click()
  await page.getByRole('button', { name: /Save & quit/ }).click()
  await wait(800)
  check((await page.evaluate(() => window.__ht.useUI.getState().screen)) === 'title', 'Save & quit returns to the title')
  await page.getByText('Load', { exact: true }).first().click()
  await wait(500)
  await shot('14-load')
  await page.locator('.m-save .k-btn', { hasText: 'Load' }).first().click()
  await wait(900)
  check((await page.evaluate(() => window.__ht.useUI.getState().screen)) === 'game' && (await gs(s => s.day)) >= day, 'Loading the slot re-enters the game')

  console.log('\n# Bankruptcy & game over')
  await act(s => { s.cash = -9000; s.brokeDays = 20 })
  await speed(4)
  const t2 = Date.now()
  while (Date.now() - t2 < 6000 && !(await gs(s => s.modals.some(m => m.kind === 'bankrupt')))) await wait(150)
  check(await gs(s => s.modals.some(m => m.kind === 'bankrupt')), 'Bankruptcy modal fires after 21 days in overdraft')
  await wait(400)
  await shot('15-bankrupt')
  await page.locator('.l-modal-opt', { hasText: 'Load a save' }).click()
  await wait(900)
  check(await page.locator('.m-over').count() === 1, 'Game-over screen shows')
  await shot('16-gameover')
  await page.getByRole('button', { name: /call Mom/ }).click()
  await wait(800)
  check(!(await gs(s => s.gameOver)) && (await gs(s => s.office)) === 0, 'Calling Mom restarts in the basement')
  report(q.errs, 'desktop')
  const errs = [...new Set(q.errs)]
  await q.browser.close()
  return errs
}

async function phone() {
  console.log('\n# Phone 390×844')
  const q = await open({ width: 390, height: 844 })
  const { page, shot, wait, gs, speed, tick } = q
  page.setDefaultTimeout(6000)
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  await page.getByText('New game', { exact: true }).click()
  await page.getByRole('button', { name: /Clock in/ }).click()
  await wait(600)
  await page.getByRole('button', { name: /Let.s hustle/ }).click()
  await wait(700)
  check((await overflow()) <= 0, 'Phone: New Launch fits the width')
  await page.locator('.l-prod:not(.locked)').first().click()
  await page.locator('.l-start').click()
  await wait(700)
  await shot('20-phone-sliders')
  for (let i = 0; i < 3; i++) {
    await page.locator('.k-dialog-foot .k-btn').last().click()
    await speed(4)
    const t0 = Date.now()
    while (Date.now() - t0 < 20000) { const r = await gs(s => ({ aw: !!s.current?.awaitingSliders, st: s.current?.status })); if (r.aw || r.st !== 'dev') break; await wait(120) }
  }
  await page.locator('.l-launch-btn').first().click()
  await wait(900)
  await page.locator('.k-dialog-foot .k-btn', { hasText: 'Skip' }).click().catch(() => {})
  await wait(500)
  await shot('21-phone-review')
  await page.locator('.k-dialog-foot .k-btn').last().click()
  await speed(0)
  await tick(14)
  await wait(500)
  await shot('22-phone-live', { fullPage: true })
  check((await overflow()) <= 0, 'Phone: game screen has no sideways scroll')
  report(q.errs, 'phone')
  const errs = [...new Set(q.errs)]
  await q.browser.close()
  return errs
}

;(async () => {
  const errs = [...(await desktop()), ...(await phone())]
  console.log(`\n${fails.length ? `FAILED ${fails.length} step(s): ${fails.join(' · ')}` : 'All steps passed'}; ${errs.length} console error(s). Screenshots: ${process.env.OUT}`)
  process.exit(fails.length || errs.length ? 1 : 0)
})().catch(e => { console.error('CRASHED', e); process.exit(1) })
