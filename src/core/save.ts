// Save slots (IndexedDB) + session resume after reloads + JSON export/import.
import type { GameState } from './types'

export const SAVE_VERSION = 1
export const SLOT_COUNT = 3
const DB = 'hustle-tycoon'
const STORE = 'saves'

export interface SaveMeta { slot: number; company: string; founder: string; difficulty: string; day: number; cash: number; savedAt: number }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
export async function saveGame(slot: number, s: GameState) {
  await tx('readwrite', os => os.put(JSON.stringify(s), `slot${slot}`))
  const meta: SaveMeta = { slot, company: s.meta.company, founder: s.meta.founder, difficulty: s.meta.difficulty, day: s.day, cash: s.cash, savedAt: Date.now() }
  await tx('readwrite', os => os.put(JSON.stringify(meta), `meta${slot}`))
}
export async function loadGame(slot: number): Promise<GameState | null> {
  const raw = await tx<string | undefined>('readonly', os => os.get(`slot${slot}`))
  return raw ? migrate(JSON.parse(raw)) : null
}
export async function listSaves(): Promise<(SaveMeta | null)[]> {
  const out: (SaveMeta | null)[] = []
  for (let i = 0; i < SLOT_COUNT; i++) {
    try {
      const raw = await tx<string | undefined>('readonly', os => os.get(`meta${i}`))
      out.push(raw ? JSON.parse(raw) : null)
    } catch {
      out.push(null)
    }
  }
  return out
}
export async function deleteSave(slot: number) {
  await tx('readwrite', os => os.delete(`slot${slot}`))
  await tx('readwrite', os => os.delete(`meta${slot}`))
}
export function exportSave(s: GameState) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: 'application/json' }))
  a.download = `hustle-tycoon-${s.meta.company.replace(/\W+/g, '_')}-Y${1 + Math.floor(s.day / 336)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
export async function importSave(file: File): Promise<GameState> {
  const parsed = JSON.parse(await file.text())
  if (!parsed?.meta || typeof parsed.day !== 'number') throw new Error('Not a Hustle Tycoon save file')
  return migrate(parsed)
}
function migrate(s: GameState): GameState {
  if ((s.version ?? 0) > SAVE_VERSION) throw new Error('Save is from a newer version')
  s.version = SAVE_VERSION
  return s
}
