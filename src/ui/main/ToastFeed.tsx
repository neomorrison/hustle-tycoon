// GDT-style toast feed (bottom-left): stacked cards, colored by kind, auto-fade; Coach Kev speaks in bubbles.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useGS } from '../../core/store'
import { useUI } from '../../core/ui'
import { COACH_PORTRAIT, portrait } from '../../core/assets'
import { money } from '../../core/format'
import type { Toast } from '../../core/types'
import { playSfx } from '../audio'

const TTL: Record<Toast['kind'], number> = { info: 6000, good: 6500, bad: 8000, money: 5500, coach: 15000, research: 7000, milestone: 9000 }
const ICON: Record<Toast['kind'], string> = { info: '💬', good: '✅', bad: '⚠️', money: '💰', coach: '🧢', research: '🧪', milestone: '🏆' }
const MAX_VISIBLE = 4
const MAX_COACH = 2

/** How many cards fit: fewer on short stages (they'd bury the office) and on phones (the office strip is short).
 *  Measured on demand too: the tray can appear in the same commit as a burst of toasts (launch start, loading a save),
 *  before the ResizeObserver has reported the smaller stage. */
function useToastCap(ref: RefObject<HTMLDivElement | null>) {
  const cap = useRef({ total: MAX_VISIBLE, coach: MAX_COACH })
  const measure = useCallback(() => {
    const stage = ref.current?.parentElement?.querySelector<HTMLElement>('.m-stage-wrap')
    if (!stage) return cap.current
    const phone = window.innerWidth <= 760
    const h = stage.clientHeight
    const total = phone ? 2 : h < 440 ? 2 : h < 560 ? 3 : MAX_VISIBLE
    cap.current = { total, coach: Math.min(MAX_COACH, phone ? 1 : Math.max(1, total - 1)) }
    return cap.current
  }, [ref])
  useLayoutEffect(() => {
    const stage = ref.current?.parentElement?.querySelector<HTMLElement>('.m-stage-wrap')
    if (!stage || typeof ResizeObserver === 'undefined') return
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(stage)
    return () => ro.disconnect()
  }, [ref, measure])
  return measure
}

interface Live { t: Toast; born: number; leaving: boolean }
/** Sim messages often lead with their own emoji; then we skip the kind icon. */
const LEADING_EMOJI = /^\s*(\p{Extended_Pictographic}|\p{Regional_Indicator})/u

function KevFace() {
  const [broken, setBroken] = useState(false)
  return broken ? <span className="m-kev-fallback">🧢</span> : <img src={portrait(COACH_PORTRAIT)} alt="" onError={() => setBroken(true)} draggable={false} />
}

export default function ToastFeed() {
  const toasts = useGS(s => s.toasts)
  const seen = useRef<Set<string> | null>(null)
  const [live, setLive] = useState<Live[]>([])
  const hover = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const measureCap = useToastCap(rootRef)

  // New toasts only: whatever existed when the screen mounted (e.g. after loading a save) stays in the log.
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(toasts.map(t => t.id))
      return
    }
    const fresh = toasts.filter(t => !seen.current!.has(t.id))
    if (!fresh.length) return
    for (const t of fresh) seen.current.add(t.id)
    if (fresh.some(t => t.kind === 'coach')) playSfx('pop')
    const now = performance.now()
    const { total, coach } = measureCap()
    setLive(cur => {
      const next = [...cur, ...fresh.map((t, i) => ({ t, born: now + i * 120, leaving: false }))]
      // collapse overflow: at most `coach` coach bubbles, then oldest non-coach first
      while (next.filter(x => !x.leaving && x.t.kind === 'coach').length > coach) {
        next.splice(next.findIndex(x => !x.leaving && x.t.kind === 'coach'), 1)
      }
      while (next.filter(x => !x.leaving).length > total) {
        const idx = next.findIndex(x => !x.leaving && x.t.kind !== 'coach')
        next.splice(idx >= 0 ? idx : next.findIndex(x => !x.leaving), 1)
      }
      return next
    })
  }, [toasts])

  useEffect(() => {
    if (!live.length) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = now - last
      last = now
      // messages don't age while you can't read them: hovered, or covered by a dialog (e.g. the Review ceremony)
      const frozen = hover.current || useUI.getState().dialogs.length > 0
      setLive(cur => {
        let changed = false
        const next = cur
          .map(x => {
            if (x.leaving) return x
            if (frozen) { changed = true; return { ...x, born: x.born + dt } }
            if (now - x.born > TTL[x.t.kind]) { changed = true; return { ...x, leaving: true, born: now } }
            return x
          })
          .filter(x => {
            const keep = !(x.leaving && now - x.born > 420)
            if (!keep) changed = true
            return keep
          })
        return changed ? next : cur
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [live.length])

  const dismiss = (id: string) => setLive(cur => cur.map(x => (x.t.id === id ? { ...x, leaving: true, born: performance.now() } : x)))

  return (
    <div
      ref={rootRef}
      className="m-toasts"
      aria-live="polite"
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => (hover.current = false)}
    >
      {live.map(({ t, leaving }) =>
        t.kind === 'coach' ? (
          <div key={t.id} className={clsx('m-toast m-coach', leaving && 'leaving')} role="status">
            <div className="m-kev"><KevFace /></div>
            <div className="m-coach-bubble">
              <div className="m-coach-name">Coach Kev</div>
              <div className="m-coach-text">{t.text}</div>
              <button type="button" className="m-toast-x" aria-label="Dismiss tip" onClick={() => dismiss(t.id)}><X size={14} /></button>
            </div>
          </div>
        ) : (
          <div key={t.id} className={clsx('m-toast', `t-${t.kind}`, leaving && 'leaving')} role="status" onClick={() => dismiss(t.id)}>
            {!LEADING_EMOJI.test(t.text) && <span className="m-toast-ic" aria-hidden="true">{ICON[t.kind]}</span>}
            <span className="m-toast-text">{t.text}</span>
            {typeof t.amount === 'number' && t.amount !== 0 && (
              <span className={clsx('m-toast-amt', t.amount > 0 ? 'pos' : 'neg')}>{money(t.amount, { cents: false, sign: true, compact: Math.abs(t.amount) >= 100_000 })}</span>
            )}
          </div>
        ),
      )}
    </div>
  )
}
