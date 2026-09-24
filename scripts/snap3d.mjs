#!/usr/bin/env node
// Screenshots of the 3D lab (src/three/lab) through headless Chromium.
//
//   node scripts/snap3d.mjs [options] "<query>" ["<query>" ...]
//
// Each positional argument is a lab query string, e.g. "room=tier0&actors=3&tasks=sit:computer_sit:sit_type;lie:bed_lie&tod=20&yaw=135"
// (add name=<file> to name the PNG). Options:
//   --out <dir>       output folder (default scripts/.cache/snap3d)
//   --w <px> --h <px> viewport (default 1280×720)
//   --wait <ms>       extra wait after onReady (default 1500)
//   --eval "<js>"     run in the page after ready (before the wait), e.g. "__stage.rotate(90)"
//   --gl auto|gpu|swiftshader   WebGL backend (default auto: GPU first, SwiftShader fallback)
//   --panel           keep the lab side panel visible
//
// As a module: import { withLab } from './snap3d.mjs'; await withLab(async ({ open, shot }) => { ... })
import { createServer } from 'vite'
import { chromium } from 'playwright'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer()
    s.unref()
    s.on('error', rej)
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)) })
  })
}

const GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-webgl', '--disable-gpu-sandbox']
const SWIFT_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']

async function probe(browser) {
  const page = await browser.newPage()
  try {
    return await page.evaluate(() => {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2')
      if (!gl) return null
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'webgl2'
    })
  } finally { await page.close() }
}

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

export async function launch(gl = 'auto') {
  const tries = gl === 'gpu' ? [GPU_ARGS] : gl === 'swiftshader' ? [SWIFT_ARGS] : [GPU_ARGS, SWIFT_ARGS]
  const exe = executablePath()
  for (const args of tries) {
    const browser = await chromium.launch({ headless: true, args, executablePath: exe })
    const renderer = await probe(browser).catch(() => null)
    if (renderer) return { browser, renderer }
    await browser.close()
  }
  throw new Error('no WebGL2 in headless Chromium (GPU and SwiftShader both failed)')
}

export async function startServer() {
  const port = await freePort()
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, clearScreen: false })
  await server.listen()
  return { server, base: `http://127.0.0.1:${port}` }
}

/**
 * Start Vite + Chromium, run `fn({ open, shot, browser, base, renderer })`, clean up.
 * open(query, {w,h}) → page after the lab's onReady; shot(page, file) saves a PNG of the viewport.
 */
export async function withLab(fn, { gl = 'auto', w = 1280, h = 720 } = {}) {
  const { server, base } = await startServer()
  let browser
  try {
    const l = await launch(gl)
    browser = l.browser
    const open = async (query, o = {}) => {
      const page = await browser.newPage({ viewport: { width: o.w ?? w, height: o.h ?? h }, deviceScaleFactor: 1 })
      page.on('pageerror', e => console.error('[pageerror]', e.message))
      page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/X4122|Program Info Log|status of 404/.test(t)) console.error(`[console.${m.type()}]`, t) })
      const q = query.includes('snap=') || o.panel ? query : `${query}${query ? '&' : ''}snap=1`
      await page.goto(`${base}/src/three/lab/index.html?${q}`, { waitUntil: 'load' })
      await page.waitForFunction(() => (window.__lab && (window.__lab.ready || window.__lab.errors.length)), null, { timeout: 60000 })
      const errs = await page.evaluate(() => window.__lab.errors)
      if (errs.length) console.error('[lab errors]', errs.join(' | '))
      return page
    }
    const shot = async (page, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      await page.screenshot({ path: file })
      return file
    }
    return await fn({ open, shot, browser, base, renderer: l.renderer })
  } finally {
    await browser?.close().catch(() => {})
    await server.close().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = { out: path.join(ROOT, 'scripts/.cache/snap3d'), w: 1280, h: 720, wait: 1500, eval: '', gl: 'auto', panel: false }
  const queries = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') opt.out = path.resolve(argv[++i])
    else if (a === '--w') opt.w = Number(argv[++i])
    else if (a === '--h') opt.h = Number(argv[++i])
    else if (a === '--wait') opt.wait = Number(argv[++i])
    else if (a === '--eval') opt.eval = argv[++i]
    else if (a === '--gl') opt.gl = argv[++i]
    else if (a === '--panel') opt.panel = true
    else queries.push(a)
  }
  if (!queries.length) queries.push('room=testroom&actors=2')
  const t0 = Date.now()
  await withLab(async ({ open, shot, renderer }) => {
    console.log(`webgl: ${renderer}`)
    let i = 0
    for (const q of queries) {
      const name = new URLSearchParams(q).get('name') ?? `shot_${i}`
      const page = await open(q, { panel: opt.panel })
      if (opt.eval) await page.evaluate(opt.eval)
      await page.waitForTimeout(opt.wait)
      const file = await shot(page, path.join(opt.out, `${name}.png`))
      const stats = await page.evaluate(() => window.__stage?.stats())
      console.log(`${file}  ${JSON.stringify(stats)}`)
      await page.close()
      i++
    }
  }, { gl: opt.gl, w: opt.w, h: opt.h })
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  process.exit(0)
}
