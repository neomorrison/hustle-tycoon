// QA playtest helpers (Playwright). Uses the DEV-only window.__ht hook from src/main.tsx.
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const URL = process.env.URL || 'http://localhost:5320/'
const OUT = process.env.OUT || path.join(__dirname, 'tmp', 'qa')
// GPU driver chatter from ANGLE/D3D shader compiles in the 3D office (three.js logs the HLSL compiler's warnings), not the game
const GPU_NOISE = /X4122|X3557|Program Info Log|GPU stall due to ReadPixels|GL Driver Message|\[\.WebGL-/

/** Playwright's own Chromium when its revision is installed, else the newest installed ms-playwright Chromium. */
function executablePath() {
  try {
    const own = chromium.executablePath()
    if (own && fs.existsSync(own)) return undefined
  } catch { /* fall through */ }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.LOCALAPPDATA || path.join(process.env.HOME || '', '.cache'), 'ms-playwright')
  if (!fs.existsSync(dir)) return undefined
  const cands = fs.readdirSync(dir).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const d of cands) {
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = path.join(dir, d, rel)
      if (fs.existsSync(p)) return p
    }
  }
  return undefined
}

async function open({ width = 1440, height = 900, fresh = true } = {}) {
  const browser = await chromium.launch({ executablePath: executablePath() })
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')))
  page.on('console', m => { if (m.text().startsWith('scroller')) console.log(m.text()); if ((m.type() === 'error' || m.type() === 'warning') && !GPU_NOISE.test(m.text())) errs.push(m.type() + ': ' + m.text()) })
  await page.goto(URL, { waitUntil: 'networkidle' })
  if (fresh) {
    await page.evaluate(async () => {
      sessionStorage.clear()
      await new Promise(r => { const q = indexedDB.deleteDatabase('hustle-tycoon'); q.onsuccess = q.onerror = q.onblocked = () => r() })
    })
    await page.reload({ waitUntil: 'networkidle' })
  }
  await page.waitForFunction(() => !!window.__ht)
  const shot = async (name, opts = {}) => {
    const p = path.join(OUT, name + '.png')
    await page.screenshot({ path: p, ...opts })
    console.log('  [shot]', p)
    return p
  }
  const gs = (fn, arg) => page.evaluate(([f, a]) => { const s = window.__ht.useGame.getState().state; return new Function('s', 'a', 'return (' + f + ')(s, a)')(s, a) }, [fn.toString(), arg])
  const act = (fn, arg) => page.evaluate(([f, a]) => { window.__ht.act(s => { new Function('s', 'a', 'return (' + f + ')(s, a)')(s, a) }) }, [fn.toString(), arg])
  const dialogs = () => page.evaluate(() => window.__ht.useUI.getState().dialogs.map(d => d.id))
  const speed = n => page.evaluate(n => window.__ht.setSpeed(n), n)
  const wait = ms => page.waitForTimeout(ms)
  /** Run the sim headlessly for n days via the real sim modules (emits FX so UI reacts). */
  const tick = (n, stopWhen) => page.evaluate(async ([n, stop]) => {
    const { tickDay } = await import('/src/sim/index.ts')
    const stopFn = stop ? new Function('s', 'return (' + stop + ')(s)') : null
    let i = 0
    for (; i < n; i++) {
      let fx = []
      window.__ht.act(s => { fx = tickDay(s) })
      window.__ht.emitFX(fx)
      const s = window.__ht.useGame.getState().state
      if (stopFn && stopFn(s)) break
    }
    return i
  }, [n, stopWhen ? stopWhen.toString() : null])
  /** Load a saved GameState JSON (from a previous script) straight into the game screen. */
  const loadState = async (file, patch) => {
    const st = JSON.parse(require('fs').readFileSync(file, 'utf8'))
    await page.evaluate(([st, patch]) => {
      if (patch) new Function('s', 'return (' + patch + ')(s)')(st)
      window.__ht.useGame.getState().load(st)
      window.__ht.useUI.getState().set({ screen: 'game', slot: 0, dialogs: [], speed: 1, lastSpeed: 1 })
    }, [st, patch ? patch.toString() : null])
    await page.waitForTimeout(600)
  }
  const save = (file) => gs(s => s).then(st => require('fs').writeFileSync(file, JSON.stringify(st)))
  return { browser, context, page, errs, shot, gs, act, dialogs, speed, wait, tick, loadState, save }
}
function report(errs, label = '') {
  const uniq = [...new Set(errs)]
  console.log(`\n== console errors/warnings ${label}: ${uniq.length}`)
  for (const e of uniq) console.log('  -', e.slice(0, 600))
}
module.exports = { open, report, URL, OUT }
