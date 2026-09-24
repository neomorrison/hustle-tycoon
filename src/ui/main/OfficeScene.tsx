// The office stage: room art by tier, founder at the computer, staff on the floor, working bob, hotspots.
import { memo, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useGS, useGSShallow, onFX } from '../../core/store'
import { useUI, openDialog, togglePause } from '../../core/ui'
import { Pause } from 'lucide-react'
import { founderPortrait, portrait, roomImage } from '../../core/assets'
import type { GameState, Person } from '../../core/types'
import { officeDef } from '../../data/offices'
import { SIZES } from '../../data/sizes'
import { launchTeam } from '../../sim/launch'
import { founderSeat, hotspot, staffSeat, useHotspots, type Box, type Seat } from './layout'

type Mood = 'neutral' | 'happy' | 'tired' | 'stressed'

const ROLE_LABEL: Record<Person['role'], string> = {
  founder: 'Founder',
  copywriter: 'Copywriter',
  video_creator: 'Video Creator',
  media_buyer: 'Media Buyer',
  researcher: 'Researcher',
  generalist: 'Generalist',
}
const ROLE_EMOJI: Record<Person['role'], string> = {
  founder: '⚡', copywriter: '✍️', video_creator: '🎬', media_buyer: '🎯', researcher: '🔎', generalist: '🧰',
}

/** Derived founder mood (primitive → stable selector). */
function founderMood(s: GameState): Mood {
  if (s.cash < 0) return 'stressed'
  const recentWin = s.live.some(l => l.review && (l.review.verdict === 'winner' || l.review.verdict === 'solid') && s.day - (l.launchDay ?? -999) <= 28)
  const last = s.history[s.history.length - 1]
  if (recentWin || (last && last.verdict === 'winner' && s.day - last.endDay <= 21)) return 'happy'
  if (s.dayJob.employed && s.day % 28 >= 21) return 'tired'
  return 'neutral'
}

const isWorking = (s: GameState) => {
  const c = s.current
  if (!c) return false
  return (c.status === 'dev' && !c.awaitingSliders) || (c.status === 'qc' && !!c.polishing)
}

/** Who is actually on the current launch (sizes cap the team: a Test fits you + 1). Joined ids → stable selector. */
const teamKey = (s: GameState) => (s.current ? launchTeam(s, s.current.size).map(p => p.id).join(',') : '')

/** Sample the room art's corner color so the stage blends seamlessly with the picture. */
const bgCache = new Map<string, string>()
function sampleCorner(img: HTMLImageElement): string | null {
  try {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 8
    const g = c.getContext('2d', { willReadFrequently: true })
    if (!g) return null
    g.drawImage(img, 0, 0, 24, 24, 0, 0, 8, 8)
    const d = g.getImageData(1, 1, 1, 1).data
    return `rgb(${d[0]}, ${d[1]}, ${d[2]})`
  } catch {
    return null
  }
}

const Avatar = memo(function Avatar({ person, seat, founder, mood, working, training, delay, employed, bench }: {
  person: Person; seat: Seat; founder?: boolean; mood?: Mood; working: boolean; training: boolean; delay: number; employed?: boolean
  /** set when a launch is being built without this person (the size's team cap is full) */
  bench?: string
}) {
  const [broken, setBroken] = useState(false)
  const src = founder ? founderPortrait(mood ?? 'neutral') : portrait(person.portrait)
  useEffect(() => setBroken(false), [src])
  const first = person.name.split(' ')[0]
  const tip = founder
    ? `${person.name} · Founder${employed ? '\nStill flipping burgers at McDoodle’s' : ''}`
    : `${person.name} · ${ROLE_LABEL[person.role]} · Lv ${person.level}${training ? '\nAway at training' : bench ? `\n${bench}` : ''}`
  return (
    <button
      type="button"
      className={clsx('m-avatar', founder && 'founder', `r-${person.role}`, working && !training && 'working', training && 'training', bench && !training && 'benched', mood && `mood-${mood}`)}
      style={{ left: `${seat.x}%`, top: `${seat.y}%`, ['--d' as string]: `${delay}s` }}
      data-person={person.id}
      data-tip={tip}
      aria-label={tip}
      onClick={() => openDialog('staff')}
    >
      <span className="m-avatar-shadow" aria-hidden="true" />
      <span className="m-avatar-bob">
        <span className="m-avatar-ring">
          {broken ? <span className="m-avatar-fallback">{ROLE_EMOJI[person.role]}</span> : <img src={src} alt="" draggable={false} onError={() => setBroken(true)} />}
        </span>
        {founder && employed && <span className="m-avatar-tag" aria-hidden="true">🍔</span>}
        {!founder && <span className="m-avatar-tag" aria-hidden="true">{training ? '📚' : bench ? '💤' : ROLE_EMOJI[person.role]}</span>}
        {working && !training && <span className="m-typing" aria-hidden="true"><i /><i /><i /></span>}
      </span>
      <span className="m-avatar-name">{first}</span>
    </button>
  )
})

function HotspotButton({ box, label, onClick, className, children }: { box: Box; label: string; onClick: () => void; className?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      className={clsx('m-hotspot', className)}
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
      aria-label={label}
      data-tip={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function OfficeScene() {
  const tier = useGS(s => s.office)
  const founder = useGS(s => s.founder)
  const staff = useGS(s => s.staff)
  const day = useGS(s => s.day)
  const derivedMood = useGS(founderMood)
  const working = useGS(isWorking)
  const team = useGS(teamKey)
  const { hasCurrent, awaiting, employed, size } = useGSShallow(s => ({ hasCurrent: !!s.current, awaiting: !!s.current?.awaitingSliders, employed: s.dayJob.employed, size: s.current?.size }))
  const paused = useUI(u => u.speed === 0)
  const dialogOpen = useUI(u => u.dialogs.length > 0)
  const hs = useHotspots()
  const [imgOk, setImgOk] = useState<Record<number, boolean>>({})
  const [bg, setBg] = useState<string | undefined>(() => bgCache.get(roomImage(tier)))
  const [cheer, setCheer] = useState(false)

  // Transient happy face after confetti / winner fanfare.
  useEffect(() => {
    let t = 0
    const off = onFX(list => {
      if (list.some(f => f.kind === 'confetti' || (f.kind === 'sound' && (f.sound === 'winner' || f.sound === 'levelup')))) {
        setCheer(true)
        window.clearTimeout(t)
        t = window.setTimeout(() => setCheer(false), 9000)
      }
    })
    return () => { off(); window.clearTimeout(t) }
  }, [])

  const mood: Mood = derivedMood === 'stressed' ? 'stressed' : cheer ? 'happy' : derivedMood
  const src = roomImage(tier)
  useEffect(() => { setBg(bgCache.get(src)) }, [src])

  const seats = useMemo(() => staff.map((_, i) => staffSeat(tier, i)), [staff, tier])
  const fSeat = founderSeat(hs, tier)
  const computer = hotspot(hs, tier, 'computer')
  const door = hotspot(hs, tier, 'door')
  const failed = imgOk[tier] === false
  const animate = working && !paused
  const office = officeDef(tier)
  const onTeam = useMemo(() => new Set(team.split(',')), [team])
  const cap = size ? SIZES[size] : undefined
  const bench = working && cap ? `On the bench: a ${cap.name} fits ${cap.maxTeam} people (you + ${cap.maxTeam - 1}). Bigger launches put more of the team to work.` : undefined

  return (
    <div className={clsx('m-stage', `tier-${tier}`, tier === 5 && 'dark')} style={bg ? { ['--room-bg' as string]: bg } : undefined}>
      <div className="m-stage-vignette" aria-hidden="true" />
      <div className="m-room" key={tier}>
        {failed ? (
          <div className="m-room-fallback" aria-hidden="true">
            <div className="m-rf-floor" />
            <div className="m-rf-wall l" />
            <div className="m-rf-wall r" />
            <div className="m-rf-desk">🖥️</div>
          </div>
        ) : (
          <img
            className="m-room-img"
            src={src}
            alt={office.name}
            draggable={false}
            onLoad={e => {
              setImgOk(m => ({ ...m, [tier]: true }))
              const c = sampleCorner(e.currentTarget)
              if (c) { bgCache.set(src, c); setBg(c) }
            }}
            onError={() => setImgOk(m => ({ ...m, [tier]: false }))}
          />
        )}

        {computer && (!hasCurrent || awaiting) && (
          <HotspotButton
            box={computer}
            className={clsx('computer', 'idle')}
            label={awaiting ? 'Set this stage’s focus' : 'Start a new launch'}
            onClick={() => openDialog(awaiting ? 'sliders' : 'newLaunch')}
          >
            <span className="m-idea" aria-hidden="true">{awaiting ? '🎛️ Set focus' : '💡 New launch?'}</span>
          </HotspotButton>
        )}
        {door && <HotspotButton box={door} className="door" label="Office & moving" onClick={() => openDialog('office')} />}

        <Avatar person={founder} seat={fSeat} founder mood={mood} working={animate} training={false} delay={0} employed={employed} />
        {staff.map((p, i) => {
          const benched = !!bench && !onTeam.has(p.id)
          return (
            <Avatar key={p.id} person={p} seat={seats[i]} working={animate && !benched} training={!!p.trainingUntil && p.trainingUntil > day} delay={0.13 * (i + 1)} bench={benched ? bench : undefined} />
          )
        })}
      </div>
      {paused && !dialogOpen && (
        <button type="button" className="m-paused" onClick={() => togglePause()} data-silent>
          <Pause size={14} strokeWidth={3} /> Paused <span className="m-paused-hint">· Space or tap to resume</span>
        </button>
      )}
      <div className="m-room-label">
        <span>{office.emoji}</span> {office.name}
        {awaiting && <span className="m-room-state">Waiting on your focus call…</span>}
      </div>
    </div>
  )
}
