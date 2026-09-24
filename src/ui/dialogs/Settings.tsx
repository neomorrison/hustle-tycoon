// Settings: sound & music, coach tips, save/export/import, quit to title. OWNER: ui-main.
import { useRef, useState } from 'react'
import { Bell, Download, LogOut, Music, Save, Upload, Volume2 } from 'lucide-react'
import type { DialogProps } from './types'
import { DialogFrame, Button, Range, Toggle } from '../kit'
import { act, getGS, useGame } from '../../core/store'
import { useUI } from '../../core/ui'
import { saveNow } from '../../core/session'
import { exportSave, importSave } from '../../core/save'
import { formatDate } from '../../core/time'
import { playSfx, setMasterVolume, setMusicOn, setMusicVolume, setMuted, setSfxOn, setSfxVolume, unlockAudio, useAudioPrefs } from '../audio'
import { enterGame, quitToTitle } from '../main/nav'

function Row({ icon, label, hint, children }: { icon: React.ReactNode; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="m-set-row">
      <div className="m-set-ic">{icon}</div>
      <div className="m-set-label"><b>{label}</b>{hint && <small>{hint}</small>}</div>
      <div className="m-set-ctl">{children}</div>
    </div>
  )
}

export default function SettingsDialog({ close }: DialogProps) {
  const inGame = useUI(u => u.screen === 'game')
  const slot = useUI(u => u.slot)
  const muted = useUI(u => u.muted)
  const musicOn = useUI(u => u.musicOn)
  const volume = useUI(u => u.volume)
  const { musicVolume, sfxVolume, sfxOn } = useAudioPrefs()
  const hasGame = useGame(g => g.state !== null)
  const coachOff = useGame(g => !!g.state?.flags.coachOff)
  const company = useGame(g => g.state?.meta.company ?? '')
  const day = useGame(g => g.state?.day ?? 0)
  const [status, setStatus] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [confirmImport, setConfirmImport] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const game = inGame && hasGame

  const say = (tone: 'good' | 'bad', text: string) => { setStatus({ tone, text }); playSfx(tone === 'good' ? 'ping' : 'error') }

  const doSave = async () => {
    try {
      await saveNow(true)
      say('good', `Saved to slot ${slot + 1} ✓`)
    } catch {
      say('bad', 'Save failed. Is storage blocked in this browser?')
    }
  }
  const doImport = async (f: File) => {
    try {
      const st = await importSave(f)
      setConfirmImport(null)
      await enterGame(st, slot)
      say('good', `Loaded “${st.meta.company}” into slot ${slot + 1}.`)
    } catch (e) {
      setConfirmImport(null)
      say('bad', e instanceof Error ? e.message : 'That file is not a Hustle Tycoon save')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <DialogFrame
      title="Settings"
      subtitle={game ? `${company} · ${formatDate(day)} · slot ${slot + 1}` : 'Sound, music & saves'}
      icon="⚙️"
      width={560}
      onClose={close}
      footer={
        <>
          <span className="m-set-foot k-muted">Space pause · 1 / 2 / 3 speed · N new launch</span>
          <Button onClick={close}>Done</Button>
        </>
      }
    >
      <div className="m-set">
        <h3 className="m-set-h">Sound</h3>
        <Row icon={<Volume2 size={18} />} label="Master volume" hint={muted ? 'Muted' : `${Math.round(volume * 100)}%`}>
          <Range value={volume} onChange={v => { unlockAudio(); setMasterVolume(v); if (muted && v > 0) setMuted(false) }} label="Master volume" />
          <Toggle checked={!muted} onChange={on => { unlockAudio(); setMuted(!on) }} />
        </Row>
        <Row icon={<Music size={18} />} label="Lo-fi music" hint={musicOn ? `${Math.round(musicVolume * 100)}%` : 'Off'}>
          <Range value={musicVolume} disabled={!musicOn} color="var(--k-orange)" onChange={v => setMusicVolume(v)} label="Music volume" />
          <Toggle checked={musicOn} onChange={on => { unlockAudio(); setMusicOn(on) }} />
        </Row>
        <Row icon={<Bell size={18} />} label="Sound effects" hint={sfxOn ? `${Math.round(sfxVolume * 100)}%` : 'Off'}>
          <Range value={sfxVolume} disabled={!sfxOn} color="var(--k-green)" onChange={v => setSfxVolume(v)} label="Sound effects volume" />
          <Toggle checked={sfxOn} onChange={on => { unlockAudio(); setSfxOn(on); if (on) setTimeout(() => playSfx('chaching'), 30) }} />
        </Row>
        <div className="m-set-test">
          <span className="k-muted">Test:</span>
          <Button size="sm" variant="secondary" onClick={() => { unlockAudio(); playSfx('chaching') }}>💰 Cha-ching</Button>
          <Button size="sm" variant="secondary" onClick={() => { unlockAudio(); playSfx('winner') }}>🏆 Fanfare</Button>
          <Button size="sm" variant="secondary" onClick={() => { unlockAudio(); playSfx('flop') }}>📉 Womp</Button>
        </div>

        {game && (
          <>
            <h3 className="m-set-h">Gameplay</h3>
            <Row icon={<span>🧢</span>} label="Coach Kev tips" hint={coachOff ? 'Kev is on a smoke break' : 'Friendly advice at key moments'}>
              <Toggle checked={!coachOff} onChange={on => act(s => { if (on) delete s.flags.coachOff; else s.flags.coachOff = true })} />
            </Row>

            <h3 className="m-set-h">Save</h3>
            <div className="m-set-btns">
              <Button variant="primary" onClick={() => void doSave()}><Save size={16} /> Save now</Button>
              <Button variant="secondary" onClick={() => { try { exportSave(getGS()); say('good', 'Exported your save as a .json file.') } catch { say('bad', 'Export failed') } }}><Download size={16} /> Export</Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import</Button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setConfirmImport(f) }} />
            </div>
            {confirmImport && (
              <div className="m-warn">
                Replace <b>{company}</b> in slot {slot + 1} with “{confirmImport.name}”?
                <span className="m-warn-actions">
                  <Button size="sm" variant="danger" onClick={() => void doImport(confirmImport)}>Replace</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setConfirmImport(null); if (fileRef.current) fileRef.current.value = '' }}>Cancel</Button>
                </span>
              </div>
            )}
            {status && <div className={`m-warn ${status.tone}`} role="status">{status.text}</div>}
            <div className="m-set-quit">
              <Button variant="danger" onClick={() => { close(); void quitToTitle('menu') }}><LogOut size={16} /> Save & quit to title</Button>
            </div>
          </>
        )}
        {!game && status && <div className={`m-warn ${status.tone}`} role="status">{status.text}</div>}
        <p className="m-set-credits">Hustle Tycoon · All brands are parodies. Any resemblance to real platforms is purely satirical.</p>
      </div>
    </DialogFrame>
  )
}
