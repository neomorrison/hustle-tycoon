// The office stage: the live 3D office when the device can run it (settings: "3D office"), otherwise the room
// still by tier with founder/staff avatars on the chairs, working bob, hotspots. Both keep bubbles, tags and hotspots.
import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useGS, useGSShallow } from '../../core/store'
import { useUI, openDialog, togglePause } from '../../core/ui'
import { Pause } from 'lucide-react'
import { founderPortrait, portrait, roomImage } from '../../core/assets'
import type { Person } from '../../core/types'
import { officeDef } from '../../data/offices'
import { SIZES } from '../../data/sizes'
import { founderSeat, hotspot, staffSeat, useHotspots, useSeats, type Box, type Seat } from './layout'
import { founderMood, isWorking, ROLE_EMOJI, ROLE_LABEL, teamKey, useCheer, type Mood } from './sceneState'
import { ROOM_BG, use3d } from './three3d'

// three.js + the 3D office load on demand; the painted room shows meanwhile
const Office3D = lazy(() => import('./Office3D'))

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

/** The 2D art scene (fallback, and what shows while the 3D office loads). */
function Room2D({ tier }: { tier: number }) {
  const founder = useGS(s => s.founder)
  const staff = useGS(s => s.staff)
  const day = useGS(s => s.day)
  const derivedMood = useGS(founderMood)
  const working = useGS(isWorking)
  const team = useGS(teamKey)
  const { hasCurrent, awaiting, employed, size } = useGSShallow(s => ({ hasCurrent: !!s.current, awaiting: !!s.current?.awaitingSliders, employed: s.dayJob.employed, size: s.current?.size }))
  const paused = useUI(u => u.speed === 0)
  const hs = useHotspots()
  const seatMap = useSeats()
  const [imgOk, setImgOk] = useState<Record<number, boolean>>({})
  const cheer = useCheer()

  const mood: Mood = derivedMood === 'stressed' ? 'stressed' : cheer ? 'happy' : derivedMood
  const src = roomImage(tier)

  const seats = useMemo(() => staff.map((_, i) => staffSeat(seatMap, tier, i)), [staff, tier, seatMap])
  const fSeat = founderSeat(hs, seatMap, tier)
  const computer = hotspot(hs, tier, 'computer')
  const door = hotspot(hs, tier, 'door')
  const failed = imgOk[tier] === false
  const animate = working && !paused
  const office = officeDef(tier)
  const onTeam = useMemo(() => new Set(team.split(',')), [team])
  const cap = size ? SIZES[size] : undefined
  const bench = working && cap ? `On the bench: a ${cap.name} fits ${cap.maxTeam} people (you + ${cap.maxTeam - 1}). Bigger launches put more of the team to work.` : undefined

  return (
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
          onLoad={() => setImgOk(m => ({ ...m, [tier]: true }))}
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
  )
}

export default function OfficeScene() {
  const tier = useGS(s => s.office)
  const awaiting = useGS(s => !!s.current?.awaitingSliders)
  const paused = useUI(u => u.speed === 0)
  const dialogOpen = useUI(u => u.dialogs.length > 0)
  const want3d = use3d()
  const [ready3d, setReady3d] = useState(false)
  const [failed3d, setFailed3d] = useState(false)
  const show3d = want3d && !failed3d
  useEffect(() => { if (!show3d) setReady3d(false) }, [show3d])
  const office = officeDef(tier)
  const live3d = show3d && ready3d

  return (
    <div className={clsx('m-stage', `tier-${tier}`, tier === 5 && 'dark', live3d && 'is3d')} style={{ ['--room-bg' as string]: ROOM_BG[tier] ?? ROOM_BG[0] }}>
      <div className="m-stage-vignette" aria-hidden="true" />
      {!live3d && <Room2D tier={tier} />}
      {show3d && <Suspense fallback={null}><Office3D shown={ready3d} onReady={() => setReady3d(true)} onFail={() => setFailed3d(true)} /></Suspense>}
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
