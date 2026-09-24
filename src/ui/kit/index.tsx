// Shared UI primitives. Keep the look consistent: import these instead of re-styling basics.
import './kit.css'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { money } from '../../core/format'

export function Button({ variant = 'primary', size, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'; size?: 'sm' | 'lg' }) {
  return <button type="button" {...p} className={clsx('k-btn', variant, size, className)} />
}
export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('k-panel', className)}>
      {(title || actions) && <div className="k-panel-head"><span>{title}</span>{actions}</div>}
      <div className="k-panel-body">{children}</div>
    </section>
  )
}
export function Badge({ tone, children }: { tone?: 'good' | 'bad' | 'warn' | 'info' | 'purple' | 'gold'; children: ReactNode }) {
  return <span className={clsx('k-badge', tone)}>{children}</span>
}
export function StatBar({ value, max = 100, color = 'var(--k-purple)' }: { value: number; max?: number; color?: string }) {
  return <div className="k-statbar"><i style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} /></div>
}
export function Money({ value, sign, cents = false, colored }: { value: number; sign?: boolean; cents?: boolean; colored?: boolean }) {
  return <span className={clsx('k-money', colored && (value > 0 ? 'pos' : value < 0 ? 'neg' : ''))}>{money(value, { cents, sign })}</span>
}
/** Standard dialog frame. Dialogs are rendered by DialogHost and already pause the game. */
export function DialogFrame({ title, subtitle, icon, onClose, footer, width, children }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; onClose?: () => void; footer?: ReactNode; width?: number; children: ReactNode }) {
  return (
    <div className="k-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="k-panel k-dialog" style={width ? { width: `min(${width}px, 100%)` } : undefined} role="dialog" aria-modal="true">
        <div className="k-dialog-head">
          {icon && <div style={{ fontSize: 34, lineHeight: 1 }}>{icon}</div>}
          <div>
            <h2 className="k-dialog-title">{title}</h2>
            {subtitle && <div className="k-dialog-sub">{subtitle}</div>}
          </div>
          {onClose && <button className="k-x" aria-label="Close" onClick={onClose}>×</button>}
        </div>
        <div className="k-dialog-body">{children}</div>
        {footer && <div className="k-dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return <div className="k-tabs">{tabs.map(t => <button key={t.id} className={clsx('k-tab', value === t.id && 'on')} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>
}

/** On/off switch. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (on: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('k-toggle', checked && 'on', disabled && 'disabled')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="k-toggle-track" aria-hidden="true"><i /></span>
      {label && <span className="k-toggle-label">{label}</span>}
    </label>
  )
}
/** Styled range slider (0..max). */
export function Range({ value, onChange, min = 0, max = 1, step = 0.01, disabled, color = 'var(--k-purple)', label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; color?: string; label?: string }) {
  const pctFill = ((value - min) / (max - min || 1)) * 100
  return (
    <input
      type="range" className="k-range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled}
      style={{ ['--fill' as string]: `${pctFill}%`, ['--c' as string]: color }}
      onChange={e => onChange(Number(e.target.value))}
    />
  )
}
