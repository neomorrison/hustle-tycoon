// Display formatting (UI only).
export function money(n: number, opts: { cents?: boolean; compact?: boolean; sign?: boolean } = {}): string {
  const { cents = true, compact = false, sign = false } = opts
  const neg = n < 0
  const abs = Math.abs(n)
  let body: string
  if (compact && abs >= 1_000_000) body = `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`
  else if (compact && abs >= 10_000) body = `$${(abs / 1000).toFixed(1)}K`
  else body = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  if (neg) return `-${body}`
  return sign && n > 0 ? `+${body}` : body
}
export const pct = (x: number, digits = 2) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—')
export const num = (n: number, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—'
export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K'
  return num(n)
}
/** ratio with fallback dash when denominator is 0 */
export const safeDiv = (a: number, b: number) => (b ? a / b : 0)
export const ratioOrDash = (a: number, b: number, f: (x: number) => string) => (b ? f(a / b) : '—')
/** percent change current vs previous, e.g. "↑ 12%" */
export function delta(cur: number, prev: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (!prev) return { text: cur ? '—' : '0%', dir: 'flat' }
  const d = (cur - prev) / Math.abs(prev)
  if (Math.abs(d) < 0.005) return { text: '0%', dir: 'flat' }
  return { text: `${Math.round(Math.abs(d) * 100)}%`, dir: d > 0 ? 'up' : 'down' }
}
export const plural = (n: number, one: string, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`
