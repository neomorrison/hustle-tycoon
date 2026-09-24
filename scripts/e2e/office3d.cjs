// 3D QA: the live office, title city and Look editor through a GPU-backed headless Chromium.
//   title (live city) → New game → Look step → clock in → every office tier 0-5 with its max staff →
//   a launch waiting on its focus call → the team typing with bubbles mid-flight → a winner cheer → phone size.
// Asserts the 3D stage is live (not the 2D fallback), people are at their desks, bubbles pop from the heads
// (data-person anchors track the 3D people), and fails on page errors / console errors.
// Screenshots → scripts/e2e/out/office3d/*.png. LOOK at them.
// Usage: node scripts/e2e/office3d.cjs   (starts its own Vite on a free port; env URL=... to reuse a server,
//        GL=gpu|swiftshader|auto, OUT=<dir>)
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

const OUT = process.env.OUT || path.join(__dirname, 'out', 'office3d')
fs.mkdirSync(OUT, { recursive: true })
// GPU driver chatter from ANGLE/D3D shader compiles, not the game
const NOISE = /X4122|X3557|Program Info Log|GPU stall due to ReadPixels|GL Driver Message|WebGL: INVALID_VALUE: uniform|\[\.WebGL-/

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${extra ? ` (${extra})` : ''}`)
  if (!ok) fails.push(label)
}

const ROLES = ['copywriter', 'video_creator', 'media_buyer', 'researcher', 'generalist']
const NAMES = ['Maya Ortiz', 'Jin Park', 'Rosa Diaz', 'Walt Becker', 'Aisha Khan', 'Dre Wallace', 'Ivy Moore', 'Mei Lin']
const PORTRAITS = ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08']
const SLOTS = [0, 1, 2, 3, 5, 7]

;(async () => {
  const snap = await import(pathToFileURL(path.join(__dirname, '..', 'snap3d.mjs')).href)
  const srv = process.env.URL ? null : await snap.startServer()
  const base = (process.env.URL || srv.base).replace(/\/$/, '')
  const { browser, renderer } = await snap.launch(process.env.GL || 'auto')
  console.log(`webgl: ${renderer}\nserver: ${base}`)
  const errs = []
  const t0 = Date.now()

  async function newPage(width, height) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    page.on('pageerror', e => errs.push(`pageerror: ${e.message}`))
    page.on('console', m => {
      const t = m.text()
      if ((m.type() === 'error' || m.type() === 'warning') && !NOISE.test(t)) errs.push(`${m.type()}: ${t}`)
    })
    page.setDefaultTimeout(15000)
    return page
  }
  const shot = async (page, name) => {
    const p = path.join(OUT, `${name}.png`)
    await page.screenshot({ path: p })
    console.log('  [shot]', p)
  }
  const act = (page, fn, arg) => page.evaluate(([f, a]) => { window.__ht.act(s => { new Function('s', 'a', 'return (' + f + ')(s, a)')(s, a) }) }, [fn.toString(), arg])
  const stats = page => page.evaluate(() => window.__stage?.stats() ?? null)
  const actors = page => page.evaluate(() => window.__stage?.debugActors() ?? [])
  const waitStage = (page, pred, arg, timeout = 30000) =>
    page.waitForFunction(([p, a]) => { const s = window.__stage; if (!s) return false; return new Function('st', 'a', 'return (' + p + ')(st, a)')(s, a) }, [pred.toString(), arg], { timeout })
  const visibleBubbles = page => page.evaluate(() => [...document.querySelectorAll('.m-bubble')].filter(e => Number(getComputedStyle(e).opacity) > 0.5).length)

  try {
    // ------------------------------------------------------------------ title
    console.log('\n# Title')
    const page = await newPage(1440, 900)
    await page.goto(base + '/', { waitUntil: 'load' })
    await page.evaluate(async () => {
      sessionStorage.clear()
      try { localStorage.removeItem('hustle-tycoon:gfx') } catch { /* ignore */ }
      await new Promise(r => { const q = indexedDB.deleteDatabase('hustle-tycoon'); q.onsuccess = q.onerror = q.onblocked = () => r() })
    })
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__ht)
    const cityOk = await page.waitForSelector('.m-title-3d.on', { timeout: 40000 }).then(() => true, () => false)
    check(cityOk, 'title city diorama is live behind the title')
    check(await page.locator('.m-title-bg').count() === 0, 'the title still steps aside once the city is live')
    await page.waitForTimeout(1800)
    await shot(page, '01-title')

    // ------------------------------------------------------------------ look editor
    console.log('\n# New game → Look step')
    await page.getByText('New game', { exact: true }).click()
    await page.getByRole('button', { name: /Your look/ }).click()
    const lookOk = await page.waitForSelector('.m-look-preview.on', { timeout: 30000 }).then(() => true, () => false)
    check(lookOk, 'look preview renders on the studio pedestal')
    const titleIdle = await page.evaluate(() => { const s = window.__titleStage; return s ? s.stats().calls : -1 })
    await page.getByRole('button', { name: 'Curly', exact: true }).click()
    await page.getByRole('button', { name: /Glasses/ }).click()
    await page.getByRole('button', { name: /Hoodie/ }).click()
    await page.waitForTimeout(1600)
    const look = await page.evaluate(() => window.__lookStage?.debugActors()?.[0] ?? null)
    check(!!look && !look.hidden, 'preview person stands on the pedestal', look ? `${look.anim}` : 'none')
    await shot(page, '02-look-editor')
    check(titleIdle >= 0, 'title city pauses while the Look step is open')

    await page.getByRole('button', { name: /Clock in/ }).click()
    await page.waitForFunction(() => window.__ht.useUI.getState().screen === 'game')
    const savedLook = await page.evaluate(() => window.__ht.useGame.getState().state.founder.look ?? null)
    check(!!savedLook && savedLook.hairStyle === 'curly' && (savedLook.acc || []).includes('glasses'), 'the new founder keeps the picked look')
    await page.getByRole('button', { name: /Let.s hustle/ }).click().catch(() => {})
    await page.waitForTimeout(300)
    await page.evaluate(() => window.__ht.useUI.getState().set({ dialogs: [] }))

    // ------------------------------------------------------------------ tiers
    console.log('\n# Offices 0-5 with a full team')
    const officeOk = await waitStage(page, st => st.stats().room === 'tier0' && st.stats().actors >= 1).then(() => true, () => false)
    check(officeOk, 'office renders in 3D (tier0)')
    check(await page.locator('.m-stage.is3d').count() === 1, '2D art steps aside once the 3D office is live')
    for (let t = 0; t <= 5; t++) {
      const n = SLOTS[t]
      await act(page, (s, a) => {
        s.office = a.t
        s.current = null
        s.modals = []
        s.cash = 60000
        s.staff = Array.from({ length: a.n }, (_, i) => ({
          id: `qa${i}`, name: a.names[i], portrait: a.portraits[i], role: a.roles[i % a.roles.length],
          stats: { copy: 40, creative: 40, research: 40, speed: 40 }, level: 1 + (i % 3), xp: 0, salary: 1200, hiredDay: s.day,
        }))
      }, { t, n, names: NAMES, portraits: PORTRAITS, roles: ROLES })
      const ok = await waitStage(page, (st, a) => st.stats().room === `tier${a.t}` && st.stats().actors === a.n + 1, { t, n }).then(() => true, () => false)
      await page.waitForTimeout(t === 0 ? 3500 : 7000)
      const st = await stats(page)
      const acts = await actors(page)
      const seated = acts.filter(a => a.posture === 'sit').length
      check(ok, `tier${t}: room + ${n + 1} people`, st ? `calls ${st.calls}, tris ${st.triangles}, seated ${seated}/${acts.length}` : 'no stats')
      if (st) check(st.calls <= 250, `tier${t}: draw calls within budget`, String(st.calls))
      const tags = await page.locator('.m-p3:visible').count()
      check(tags >= 1, `tier${t}: name tags follow the people`, `${tags} visible`)
      await shot(page, `03-tier${t}`)
    }

    // ------------------------------------------------------------------ launch
    console.log('\n# A launch: focus call → the team typing, bubbles flying')
    await act(page, s => {
      s.office = 4
      s.modals = []
      s.staff = s.staff.slice(0, 5)
      s.unlocked.sizes = ['test', 'standard', 'big', 'mega']
      s.cash = 200000
    })
    await waitStage(page, st => st.stats().room === 'tier4')
    await page.waitForTimeout(1500)
    await page.evaluate(async () => {
      const L = await import('/src/sim/launch.ts')
      const C = await import('/src/data/catalog.ts')
      window.__ht.act(s => {
        const p = C.productsByNiche('gadgets')[0] || C.PRODUCTS[0]
        s.modals = []
        L.startLaunch(s, { name: 'QA Glow Lamp', productId: p.id, angle: s.unlocked.angles[0], platform: 'fadbook', size: 'big', priceTier: 'standard', features: [] })
      })
    })
    const awaitOk = await page.waitForFunction(() => window.__ht.useUI.getState().dialogs.some(d => d.id === 'sliders')).then(() => true, () => false)
    check(awaitOk, 'the Sliders dialog opens for the focus call')
    // (the founder may be across the room on a coffee run: give them time to walk back)
    let thinking = null
    for (let i = 0; i < 30 && thinking?.anim !== 'sit_think'; i++) { await page.waitForTimeout(400); thinking = (await actors(page)).find(a => a.id === 'founder') }
    check(thinking?.anim === 'sit_think', 'founder thinks at the desk while the focus call waits', thinking?.anim)
    await shot(page, '04-awaiting-sliders')
    await page.evaluate(async () => {
      const L = await import('/src/sim/launch.ts')
      window.__ht.act(s => L.setStageSliders(s, [1, 1, 1]))
      window.__ht.useUI.getState().set({ dialogs: [], speed: 1, lastSpeed: 1 })
    })
    await page.waitForTimeout(2500)
    await page.waitForTimeout(3500)
    const crew = await page.evaluate(() => { const d = window.__director.debug(); const a = window.__stage.debugActors(); return d.map(x => ({ ...x, ...(a.find(y => y.id === x.id) || {}) })) })
    const typing = crew.filter(a => a.anim === 'sit_type').length
    const notSeated = crew.filter(a => a.mode === 'work' && a.anim !== 'sit_type').map(a => `${a.id}:${a.step}/${a.anim}`)
    check(typing >= 3 && notSeated.length === 0, 'the whole launch team types at their desks', `${typing} typing${notSeated.length ? `, not yet: ${notSeated.join(' ')}` : ''}`)
    // bubbles: pop from the heads (anchor near the 3D head), then fly to the project card
    const anchorGap = await page.evaluate(() => {
      const st = window.__stage
      const cv = st.canvas.getBoundingClientRect()
      let worst = 0, n = 0
      for (const el of document.querySelectorAll('.m-p3')) {
        const id = el.getAttribute('data-person')
        const head = st.screenPoint(id, 'head')
        if (!head || el.style.display === 'none') continue
        const r = el.getBoundingClientRect()
        const dx = Math.abs(r.left + r.width / 2 - (cv.left + head.x)), dy = (cv.top + head.y) - r.bottom
        worst = Math.max(worst, dx, Math.abs(dy - 20))
        n++
      }
      return { worst: Math.round(worst), n }
    })
    check(anchorGap.n >= 3 && anchorGap.worst < 40, 'bubble anchors sit right above each 3D head', `${anchorGap.n} anchors, worst ${anchorGap.worst}px`)
    // news / event popups pause the clock: wave them off so the team keeps building
    const unblock = () => page.evaluate(() => { window.__ht.act(s => { s.modals = [] }); window.__ht.useUI.getState().set({ dialogs: [] }) })
    let bubbles = 0
    for (let i = 0; i < 60 && bubbles < 3; i++) { await unblock(); await page.waitForTimeout(150); bubbles = await visibleBubbles(page) }
    check(bubbles >= 1, 'point bubbles pop over the working team', `${bubbles} visible`)
    await shot(page, '05-dev-typing-bubbles')
    await unblock()
    await page.waitForTimeout(700)
    await shot(page, '05b-dev-bubbles-flying')

    // ------------------------------------------------------------------ cheer
    console.log('\n# Winner cheer')
    await page.evaluate(() => window.__ht.emitFX([{ kind: 'confetti', amount: 1 }, { kind: 'sound', sound: 'winner' }]))
    await page.waitForTimeout(800)
    await shot(page, '06-winner-cheer')
    await page.evaluate(() => { window.__stage.zoom(3) })
    await page.evaluate(() => window.__ht.emitFX([{ kind: 'sound', sound: 'levelup' }]))
    await page.waitForTimeout(1100)
    await shot(page, '06b-cheer-close')
    await page.evaluate(() => window.__stage.resetView())

    // ------------------------------------------------------------------ interactions
    console.log('\n# Hotspots + people')
    await act(page, s => { s.current = null; s.modals = [] })
    await page.waitForTimeout(1200)
    const idea = await page.locator('.m-3d-idea').isVisible()
    check(idea, 'the idea bubble floats over the desk when there is no launch')
    await page.locator('.m-3d-idea').click()
    check(await page.evaluate(() => window.__ht.useUI.getState().dialogs.at(-1)?.id) === 'newLaunch', 'the desk opens New Launch')
    await page.evaluate(() => window.__ht.useUI.getState().set({ dialogs: [] }))
    await page.locator('.m-p3[data-person="founder"]').click()
    check(await page.evaluate(() => window.__ht.useUI.getState().dialogs.at(-1)?.id) === 'staff', 'clicking a person opens Staff')
    await page.evaluate(() => window.__ht.useUI.getState().set({ dialogs: [] }))
    const door = await page.evaluate(() => window.__stage.screenRect('door'))
    if (door) {
      const cv = await page.locator('.m-3d-canvas').boundingBox()
      await page.mouse.move(cv.x + door.x + door.w / 2, cv.y + door.y + door.h / 2)
      await page.waitForTimeout(400)
      await shot(page, '07-door-hover')
      await page.mouse.click(cv.x + door.x + door.w / 2, cv.y + door.y + door.h / 2)
      await page.waitForTimeout(300)
      check(await page.evaluate(() => window.__ht.useUI.getState().dialogs.at(-1)?.id) === 'office', 'the door opens Office')
      await page.evaluate(() => window.__ht.useUI.getState().set({ dialogs: [] }))
    } else check(false, 'door is on screen')
    // training: hidden with a 📚 marker at the empty desk
    await act(page, s => { s.staff[0].trainingUntil = s.day + 40; s.modals = [] })
    let trainee = null
    for (let i = 0; i < 30 && !(trainee && trainee.hidden); i++) { await page.waitForTimeout(500); trainee = (await actors(page)).find(a => a.id === 'qa0') }
    check(!!trainee && trainee.hidden, 'staff away at training leave the office')
    check(await page.locator('.m-3d-mark:visible').count() === 1, 'a 📚 marker waits at their empty desk')
    await shot(page, '08-training-marker')

    // ------------------------------------------------------------------ settings, edit look, 2D fallback
    console.log('\n# Settings: graphics, Edit look, 3D off')
    await page.evaluate(() => { window.__ht.act(s => { s.modals = [] }); window.__ht.openDialog('settings') })
    await page.waitForSelector('.m-seg')
    await page.waitForTimeout(600)
    await shot(page, '10-settings-graphics')
    await page.getByRole('button', { name: /Edit look/ }).click()
    const editOk = await page.waitForSelector('.m-look-preview.on', { timeout: 30000 }).then(() => true, () => false)
    check(editOk, 'Settings → Edit look shows the live preview')
    await page.getByRole('button', { name: /Surprise me/ }).click()
    await page.waitForTimeout(1200)
    await shot(page, '11-edit-look')
    await page.getByRole('button', { name: /Save look/ }).click()
    const saved = await page.evaluate(() => !!window.__ht.useGame.getState().state.founder.look)
    check(saved, 'the new look is saved on the founder')
    await page.locator('.m-set-row', { hasText: '3D office' }).locator('.k-toggle').click()
    await page.evaluate(() => window.__ht.useUI.getState().set({ dialogs: [] }))
    const flat = await page.waitForSelector('.m-room-img', { timeout: 8000 }).then(() => true, () => false)
    check(flat && (await page.locator('.m-3d-canvas').count()) === 0, '3D office off: the painted room comes back')
    await page.waitForTimeout(1200)
    await shot(page, '12-2d-fallback')
    await page.evaluate(() => window.__ht.useUI.getState().set({ office3d: true }))
    const back = await waitStage(page, st => st.stats().room === 'tier4').then(() => true, () => false)
    check(back, '3D office on again: the live office returns')

    const state = await page.evaluate(() => JSON.stringify(window.__ht.useGame.getState().state))
    await page.close()

    // ------------------------------------------------------------------ phone
    console.log('\n# Phone')
    const phone = await newPage(390, 844)
    await phone.goto(base + '/', { waitUntil: 'load' })
    await phone.waitForFunction(() => !!window.__ht)
    await phone.evaluate(st => {
      const s = JSON.parse(st)
      s.current = null
      window.__ht.useGame.getState().load(s)
      window.__ht.useUI.getState().set({ screen: 'game', slot: 0, dialogs: [], speed: 1, lastSpeed: 1 })
    }, state)
    const phoneOk = await waitStage(phone, st => st.stats().room === 'tier4' && st.stats().actors >= 2).then(() => true, () => false)
    check(phoneOk, 'phone: the 3D office runs')
    await phone.waitForTimeout(3500)
    await shot(phone, '09-phone')
    const hscroll = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    check(!hscroll, 'phone: no sideways scroll')
    await phone.close()
  } catch (e) {
    fails.push(`crash: ${e.message}`)
    console.error(e)
  } finally {
    await browser.close().catch(() => {})
    if (srv) await srv.server.close().catch(() => {})
  }
  const uniq = [...new Set(errs)]
  console.log(`\n== console errors/warnings: ${uniq.length}`)
  for (const e of uniq) console.log('  -', e.slice(0, 400))
  if (uniq.length) fails.push('console errors')
  console.log(`\n${fails.length ? `FAILED (${fails.length}): ${fails.join('; ')}` : 'ALL GOOD'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  process.exit(fails.length ? 1 : 0)
})()
