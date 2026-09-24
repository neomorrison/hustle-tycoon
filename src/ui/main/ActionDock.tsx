// Action dock: every management screen one click away (GDT's context menu, but friendlier).
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { BookOpen, ChartLine, FlaskConical, Hamburger, House, Puzzle, Rocket, Settings, Trophy, Users } from 'lucide-react'
import { getGS, useGS, useGSShallow } from '../../core/store'
import { openDialog, type DialogId } from '../../core/ui'
import { canResearch, researchNodes } from '../../sim/research'
import { staffSlots } from '../../sim/staff'
import { canStartLaunch } from '../../sim/launch'

interface DockItem {
  id: DialogId
  label: string
  Icon: typeof Rocket
  color: string
  badge?: string | number | null
  dot?: boolean
  disabled?: boolean
  tip: string
  hero?: boolean
}

function useResearchAffordable(): number {
  const key = useGSShallow(s => ({ rp: Math.floor(s.rp), cash: Math.floor(s.cash / 100), n: s.unlocked.research.length, office: s.office, y: Math.floor(s.day / 28) }))
  return useMemo(() => {
    try {
      const s = getGS()
      return researchNodes().filter(n => !s.unlocked.research.includes(n.id) && canResearch(s, n.id).ok).length
    } catch {
      return 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key.rp, key.cash, key.n, key.office, key.y])
}

type Density = 'full' | 'compact' | 'mini' | 'scroll'
/** Approximate dock heights per density (10 buttons + gaps + padding), see .m-dock[data-density] in main.css. */
const DOCK_NEED: [Density, number][] = [['full', 680], ['compact', 520], ['mini', 365], ['scroll', 0]]

/** Pick the roomiest dock that fits the office stage (the tray below it grows/shrinks with live products). */
function useDockDensity() {
  const ref = useRef<HTMLElement>(null)
  const [density, setDensity] = useState<Density>('full')
  useLayoutEffect(() => {
    const stage = ref.current?.parentElement?.querySelector<HTMLElement>('.m-stage-wrap')
    if (!stage || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const avail = stage.clientHeight - 20
      setDensity((DOCK_NEED.find(([, need]) => avail >= need) ?? DOCK_NEED[3])[0])
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])
  return { ref, density }
}

export default function ActionDock() {
  const { ref: dockRef, density } = useDockDensity()
  const cur = useGSShallow(s => ({ name: s.current?.name ?? null, status: s.current?.status ?? null }))
  const employed = useGS(s => s.dayJob.employed)
  const milestones = useGS(s => s.milestones)
  const hireKey = useGSShallow(s => ({ staff: s.staff.length, cands: s.candidates.length, office: s.office }))
  const cashKey = useGS(s => Math.floor(s.cash / 50))
  const affordable = useResearchAffordable()

  const openSlots = useMemo(() => {
    try { return Math.max(0, staffSlots(getGS()) - hireKey.staff) } catch { return 0 }
  }, [hireKey.staff, hireKey.office])

  const launchBlock = useMemo(() => {
    if (cur.name) return null
    try {
      const r = canStartLaunch(getGS())
      return r.ok ? null : r.reason ?? null
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.name, cashKey])

  const msCount = Object.keys(milestones).length

  const items: DockItem[] = [
    {
      id: 'newLaunch', label: 'New Launch', Icon: Rocket, color: '#ff7a45', hero: !cur.name && !launchBlock, disabled: !!cur.name,
      tip: cur.name ? `Finish “${cur.name}” first. One launch in development at a time.` : launchBlock ? `New Launch\n${launchBlock}` : 'New Launch: pick a product, angle & platform',
    },
    { id: 'research', label: 'Research', Icon: FlaskConical, color: '#8b5cf6', badge: affordable > 0 ? affordable : null, tip: affordable > 0 ? `Research: ${affordable} thing${affordable === 1 ? '' : 's'} you can afford now!` : 'Research: new angles, niches, platforms & features' },
    { id: 'staff', label: 'Staff', Icon: Users, color: '#3b82f6', badge: openSlots > 0 && hireKey.cands > 0 ? '+' : null, tip: openSlots > 0 ? `Staff: ${openSlots} open desk${openSlots === 1 ? '' : 's'}, go hire!` : 'Staff: your team, training & hiring' },
    { id: 'features', label: 'Features', Icon: Puzzle, color: '#14b8a6', tip: 'Store features: switch researched apps on/off' },
    { id: 'playbook', label: 'Playbook', Icon: BookOpen, color: '#f59e0b', tip: 'Playbook: combos & focus you’ve discovered' },
    { id: 'finance', label: 'Finance', Icon: ChartLine, color: '#22c55e', tip: 'Finance: weekly revenue, profit & burn' },
    { id: 'office', label: 'Office', Icon: House, color: '#ec4899', tip: 'Office: move up (more desks), or down' },
    { id: 'dayJob', label: 'Day Job', Icon: Hamburger, color: '#ef4444', dot: employed, tip: employed ? 'McDoodle’s: you’re still on the fryer (steady pay, slower launches)' : 'McDoodle’s: you quit! Rejoin if things get rough' },
    { id: 'milestones', label: 'Milestones', Icon: Trophy, color: '#eab308', badge: msCount > 0 ? msCount : null, tip: 'Milestones & achievements' },
    { id: 'settings', label: 'Settings', Icon: Settings, color: '#64748b', tip: 'Settings, saves & sound' },
  ]

  return (
    <nav ref={dockRef} className="m-dock" data-density={density} aria-label="Actions">
      {items.map(it => (
        <button
          key={it.id}
          type="button"
          className={clsx('m-dock-btn', it.hero && 'hero', it.disabled && 'disabled', it.id === 'settings' && 'settings')}
          style={{ ['--c' as string]: it.color }}
          aria-disabled={it.disabled || undefined}
          aria-label={it.label}
          data-tip={it.tip}
          data-tip-pos="right"
          onClick={() => { if (!it.disabled) openDialog(it.id) }}
        >
          <span className="m-dock-ic"><it.Icon size={22} strokeWidth={2.3} /></span>
          <span className="m-dock-label">{it.label}</span>
          {it.badge != null && <span className={clsx('m-badge', it.id === 'milestones' && 'soft')}>{it.badge}</span>}
          {it.dot && <span className="m-dock-dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  )
}
