#!/usr/bin/env node
// Headless Blender runner for the 3D asset pipeline (docs/3D.md section 3).
//
//   node blender/run.mjs <target...|all> [--preview] [--stills] [--verbose] [-- extra args for the scripts]
//
// Targets are script names (without .py) under blender/rooms, blender/character or blender/props, plus
// `stills` (blender/stills.py). `all` = every room not starting with "_", then character, then props.
// --preview is passed to each script (they render blender/.previews/<id>_*.png).
// --stills renders public/assets/rooms/<id>.webp + hotspots.json for every room target after it is built.
// Finds Blender via env BLENDER, else C:/Program Files/Blender Foundation/Blender 5.1/blender.exe, else the newest
// "Blender x.y" folder there, else `blender` on PATH. Exits non-zero if any script raised a Python error.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const DIRS = ['rooms', 'character', 'props']

function findBlender() {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER
  const base = 'C:/Program Files/Blender Foundation'
  const pref = join(base, 'Blender 5.1', 'blender.exe')
  if (existsSync(pref)) return pref
  if (existsSync(base)) {
    const vers = readdirSync(base)
      .map((d) => ({ d, m: /^Blender (\d+)\.(\d+)/.exec(d) }))
      .filter((x) => x.m && existsSync(join(base, x.d, 'blender.exe')))
      .sort((a, b) => Number(b.m[1]) - Number(a.m[1]) || Number(b.m[2]) - Number(a.m[2]))
    if (vers.length) return join(base, vers[0].d, 'blender.exe')
  }
  for (const p of ['/Applications/Blender.app/Contents/MacOS/Blender']) if (existsSync(p)) return p
  return 'blender'
}

function scriptsIn(dir) {
  const p = join(HERE, dir)
  if (!existsSync(p)) return []
  return readdirSync(p).filter((f) => f.endsWith('.py')).map((f) => f.slice(0, -3)).sort()
}

function resolveTarget(name) {
  if (name === 'stills') return { name, kind: 'stills', script: join(HERE, 'stills.py') }
  for (const d of DIRS) {
    const s = join(HERE, d, `${name}.py`)
    if (existsSync(s)) return { name, kind: d, script: s }
  }
  return null
}

const NOISE = [/^\d\d:\d\d:\d\d \| INFO: /, /^Fra:\d+ /, /^\s*$/, /^Eevee /, /^\d\d:\d\d\.\d{3}\s+render\s+\|/]

function run(blender, script, args, verbose) {
  return new Promise((resolveP) => {
    const t0 = Date.now()
    const child = spawn(blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script, '--', ...args], {
      cwd: REPO,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })
    let pyError = false
    const tail = []
    const onLine = (line, isErr) => {
      if (/Traceback \(most recent call last\)/.test(line) || /^(\w+Error|Error): /.test(line.trim())) pyError = true
      tail.push(line)
      if (tail.length > 40) tail.shift()
      if (!verbose && NOISE.some((re) => re.test(line))) return
      ;(isErr ? process.stderr : process.stdout).write(`  ${line}\n`)
    }
    const pump = (stream, isErr) => {
      let buf = ''
      stream.on('data', (d) => {
        buf += d.toString()
        const lines = buf.split(/\r?\n/)
        buf = lines.pop()
        for (const l of lines) onLine(l, isErr)
      })
      stream.on('end', () => buf && onLine(buf, isErr))
    }
    pump(child.stdout, false)
    pump(child.stderr, true)
    child.on('error', (e) => {
      console.error(`  failed to start Blender (${blender}): ${e.message}`)
      resolveP({ ok: false, ms: Date.now() - t0 })
    })
    child.on('close', (code) => resolveP({ ok: code === 0 && !pyError, code, pyError, ms: Date.now() - t0 }))
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const dd = argv.indexOf('--')
  const passthrough = dd >= 0 ? argv.slice(dd + 1) : []
  const args = dd >= 0 ? argv.slice(0, dd) : argv
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  let names = args.filter((a) => !a.startsWith('--'))
  if (!names.length) {
    console.log('usage: node blender/run.mjs <target...|all> [--preview] [--stills] [--verbose] [-- script args]')
    console.log('targets:', [...DIRS.flatMap(scriptsIn), 'stills'].join(', '))
    process.exit(2)
  }
  if (names.includes('all')) {
    names = [...scriptsIn('rooms').filter((n) => !n.startsWith('_')), ...scriptsIn('character'), ...scriptsIn('props').filter((n) => !n.startsWith('_'))]
  }
  const targets = []
  for (const n of names) {
    const t = resolveTarget(n)
    if (!t) {
      console.error(`unknown target "${n}" (looked in blender/${DIRS.join(', blender/')} and stills)`)
      process.exit(2)
    }
    targets.push(t)
  }
  const blender = findBlender()
  console.log(`[run] blender: ${blender}`)
  const results = []
  const roomIds = []
  for (const t of targets) {
    const a = [...passthrough]
    if (flags.has('--preview')) a.push('--preview')
    console.log(`\n[run] ${t.kind}/${t.name}`)
    const r = await run(blender, t.script, t.kind === 'stills' ? [...a] : a, flags.has('--verbose'))
    results.push({ t, r })
    console.log(`[run] ${t.name}: ${r.ok ? 'ok' : 'FAILED'} (${(r.ms / 1000).toFixed(1)} s)`)
    if (r.ok && t.kind === 'rooms' && !t.name.startsWith('_')) roomIds.push(t.name)
  }
  if (flags.has('--stills') && roomIds.length) {
    console.log(`\n[run] stills ${roomIds.join(' ')}`)
    const r = await run(blender, join(HERE, 'stills.py'), [...roomIds, ...passthrough], flags.has('--verbose'))
    results.push({ t: { name: 'stills' }, r })
    console.log(`[run] stills: ${r.ok ? 'ok' : 'FAILED'} (${(r.ms / 1000).toFixed(1)} s)`)
  }
  const failed = results.filter((x) => !x.r.ok)
  console.log(`\n[run] ${results.length - failed.length}/${results.length} ok${failed.length ? `; failed: ${failed.map((x) => x.t.name).join(', ')}` : ''}`)
  process.exit(failed.length ? 1 : 0)
}

main()
