import { describe, expect, it } from 'vitest'
import {
  angleDiff, approachAnchor, boxCapacity, boxCount, BOX_UNIT, exitAnchor, exitStandAnchor, gearNode, nextCutState,
  regionSlotList, regionSlots, Reservations, sameTask, taskAnchor, taskKey, wallFacing, yawToDir,
} from '../math'
import { timeOfDay, TOD_KEYS } from '../timeofday'
import { accNodes, hairNode, lookColors, presetLook, resolveLook, topNode } from '../looks'

describe('cutaway facing', () => {
  const cutAt = (yaw: number) => {
    const [x, z] = yawToDir(yaw)
    return (['n', 'e', 's', 'w'] as const).filter(s => nextCutState(false, wallFacing(s, x, z)))
  }
  it('default south-east camera cuts the south and east walls', () => {
    expect(cutAt(45).sort()).toEqual(['e', 's'])
  })
  it('each quarter turn cuts the two walls facing the camera', () => {
    expect(cutAt(135).sort()).toEqual(['e', 'n'])
    expect(cutAt(225).sort()).toEqual(['n', 'w'])
    expect(cutAt(315).sort()).toEqual(['s', 'w'])
  })
  it('a camera straight from the south cuts only the south wall', () => {
    expect(cutAt(0)).toEqual(['s'])
  })
  it('uses hysteresis around the threshold', () => {
    expect(nextCutState(false, 0.15)).toBe(false)
    expect(nextCutState(true, 0.15)).toBe(true)
    expect(nextCutState(true, 0.05)).toBe(false)
    expect(nextCutState(false, 0.25)).toBe(true)
  })
})

describe('tasks', () => {
  it('keys are stable and ignore the a_ prefix', () => {
    expect(taskKey({ kind: 'sit', at: 'a_computer_sit', anim: 'sit_type' })).toBe(taskKey({ kind: 'sit', at: 'computer_sit', anim: 'sit_type' }))
    expect(sameTask({ kind: 'wander' }, { kind: 'wander' })).toBe(true)
    expect(sameTask({ kind: 'lie', at: 'bed_lie' }, { kind: 'sit', at: 'bed_sit' })).toBe(false)
    expect(sameTask({ kind: 'goto', point: { x: 1.001, z: 2 } }, { kind: 'goto', point: { x: 1.004, z: 2 } })).toBe(true)
    expect(sameTask({ kind: 'use', at: 'stove_stand', anim: 'cook' }, { kind: 'use', at: 'stove_stand', anim: 'idle' })).toBe(false)
  })
  it('knows which anchor a task occupies', () => {
    expect(taskAnchor({ kind: 'sit', at: 'a_staff_2_sit' })).toBe('staff_2_sit')
    expect(taskAnchor({ kind: 'idle' })).toBeNull()
    expect(taskAnchor({ kind: 'wander' })).toBeNull()
    expect(taskAnchor({ kind: 'use', at: 'counter_stand', anim: 'register' })).toBe('counter_stand')
  })
  it('finds approach and exit anchors', () => {
    const has = (n: string) => ['bed_stand', 'computer_stand', 'door_exit', 'door_stand', 'exit_door', 'exit_stand'].includes(n)
    expect(approachAnchor('bed_lie', has)).toBe('bed_stand')
    expect(approachAnchor('computer_sit', has)).toBe('computer_stand')
    expect(approachAnchor('staff_3_sit', has)).toBeNull()
    expect(approachAnchor('fridge_stand', has)).toBeNull()
    expect(exitAnchor(undefined, has)).toBe('door_exit')
    expect(exitAnchor(undefined, n => n === 'exit_door')).toBe('exit_door')
    expect(exitStandAnchor('door_exit', has)).toBe('door_stand')
    expect(exitStandAnchor('exit_door', has)).toBe('exit_stand')
  })
  it('reservations: one actor per anchor, released on change', () => {
    const r = new Reservations()
    expect(r.reserve('computer_sit', 'a')).toBe(true)
    expect(r.reserve('computer_sit', 'b')).toBe(false)
    expect(r.reserve('computer_sit', 'a')).toBe(true) // idempotent
    expect(r.reserve('bed_lie', 'a')).toBe(true) // moving releases the old one
    expect(r.holder('computer_sit')).toBeUndefined()
    expect(r.reserve('computer_sit', 'b')).toBe(true)
    r.release('b')
    expect(r.holder('computer_sit')).toBeUndefined()
  })
  it('angleDiff takes the short way round', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2)
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
  })
})

describe('boxes', () => {
  it('slot counts follow the region size', () => {
    expect(regionSlots({ w: 0.8, d: 0.6, layers: 3 })).toBe(2 * 2 * 3)
    expect(regionSlots({ w: 1.3, d: 0.65, layers: 2 })).toBe(3 * 2 * 2)
    expect(regionSlots({ w: 0.2, d: 0.2, layers: 1 })).toBe(1)
    expect(boxCapacity([{ w: 0.8, d: 0.6, layers: 3 }, { w: 1.3, d: 0.65, layers: 2 }])).toBe(24)
  })
  it('log scale: none for 0, at least one for any stock, full at the cap, monotonic', () => {
    expect(boxCount(0, 30)).toBe(0)
    expect(boxCount(-5, 30)).toBe(0)
    expect(boxCount(1, 30)).toBeGreaterThanOrEqual(1)
    expect(boxCount(1500, 30)).toBe(30)
    expect(boxCount(1e6, 30)).toBe(30)
    let prev = 0
    for (const u of [1, 3, 10, 30, 100, 300, 1000]) { const c = boxCount(u, 30); expect(c).toBeGreaterThanOrEqual(prev); prev = c }
    expect(boxCount(10, 30)).toBeLessThan(boxCount(1000, 30))
  })
  it('stacks bottom layer first inside the region', () => {
    const r = { w: 0.9, d: 0.7, layers: 3 }
    const s = regionSlotList(r)
    expect(s.length).toBe(regionSlots(r))
    const perLayer = regionSlots({ ...r, layers: 1 })
    for (let i = 0; i < s.length; i++) expect(s[i].y).toBeCloseTo(Math.floor(i / perLayer) * BOX_UNIT.y)
    for (const q of s) {
      expect(Math.abs(q.x) + BOX_UNIT.x / 2).toBeLessThanOrEqual(r.w / 2 + 0.05)
      expect(Math.abs(q.z) + BOX_UNIT.z / 2).toBeLessThanOrEqual(r.d / 2 + 0.05)
    }
  })
  it('gear ids map hyphens to node names', () => {
    expect(gearNode('ring-light')).toBe('ring_light')
    expect(gearNode('softbox_kit')).toBe('softbox_kit')
  })
})

describe('looks', () => {
  it('resolves presets and partial looks', () => {
    const l = resolveLook({ skin: '#AABBCC', hairStyle: 'nope' as never, height: 3 })
    expect(l.skin).toBe('#aabbcc')
    expect(l.height).toBe(1.1)
    expect(l.hairStyle).toBe(presetLook('player').hairStyle)
  })
  it('maps looks to visible nodes', () => {
    expect(hairNode({ hairStyle: 'afro', acc: [] })).toBe('hair_afro')
    expect(hairNode({ hairStyle: 'long', acc: ['hijab'] })).toBeNull()
    expect(hairNode({ hairStyle: 'bald', acc: [] })).toBeNull()
    expect(topNode({ topStyle: 'tee' })).toBeNull()
    expect(topNode({ topStyle: 'hoodie' })).toBe('top_hoodie')
    expect(accNodes({ acc: ['glasses', 'beard'] }).sort()).toEqual(['acc_beard', 'acc_glasses'])
  })
  it('colours every recolourable material', () => {
    const c = lookColors(presetLook('p01'))
    for (const k of ['m_skin', 'm_hair', 'm_top', 'm_bottom', 'm_shoes', 'm_acc']) expect(c[k]).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('time of day', () => {
  it('hits the keys at their hours and blends between', () => {
    expect(timeOfDay(12).sunIntensity).toBeCloseTo(TOD_KEYS.day.sunIntensity)
    expect(timeOfDay(18).lamps).toBeCloseTo(TOD_KEYS.dusk.lamps)
    expect(timeOfDay(23).lamps).toBeCloseTo(TOD_KEYS.night.lamps)
    expect(timeOfDay(2).lamps).toBeCloseTo(TOD_KEYS.night.lamps)
    expect(timeOfDay(6).sunElev).toBeCloseTo(TOD_KEYS.dawn.sunElev)
    const mid = timeOfDay(17).lamps
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(TOD_KEYS.dusk.lamps)
  })
  it('is continuous across midnight and wraps', () => {
    const a = timeOfDay(23.99), b = timeOfDay(0.01)
    expect(Math.abs(a.sunIntensity - b.sunIntensity)).toBeLessThan(1e-3)
    expect(timeOfDay(36).sunIntensity).toBeCloseTo(timeOfDay(12).sunIntensity)
  })
})
