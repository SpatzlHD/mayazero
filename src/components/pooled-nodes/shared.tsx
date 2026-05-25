import { shortenAddress } from '#/components/ProtocolPrimitives'
import { computeLiquidityUnitFraction } from '#/lib/pooled-nodes-bond'
import { AlertCircle, Check, ChevronDown, Copy, Loader2, Shield } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export function PageShell(props: {
  children: ReactNode
  subtitle: string
  title: string
}) {
  return (
    <main className="page-wrap relative flex min-h-[85vh] flex-col gap-6 px-4 pb-16 pt-8">
      <div className="pointer-events-none absolute inset-0 z-[-1] overflow-hidden">
        <div className="absolute right-1/4 top-1/4 h-[30rem] w-[30rem] animate-pulse-slow rounded-full bg-[var(--maya-teal)]/10 opacity-50 mix-blend-screen blur-[100px]" />
        <div
          className="absolute bottom-1/4 left-1/4 h-[30rem] w-[30rem] animate-pulse-slow rounded-full bg-[var(--cacao-neon)]/10 opacity-50 mix-blend-screen blur-[100px]"
          style={{ animationDelay: '2s' }}
        />
      </div>

      <div className="rise-in text-center">
        <p className="island-kicker mb-2 flex items-center justify-center gap-2">
          <Shield size={14} /> MayaChain Validator Rail
        </p>
        <h1 className="terminal-title mb-3 bg-gradient-to-r from-white to-[var(--sea-ink-soft)] bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-sm sm:text-5xl">
          {props.title}
        </h1>
        <p className="mx-auto max-w-3xl text-sm font-medium text-[var(--sea-ink-soft)]/90 sm:text-base">
          {props.subtitle}
        </p>
      </div>
      {props.children}
    </main>
  )
}

export function PageContent(props: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-6xl flex-col gap-6 ${props.className ?? ''}`.trim()}
    >
      {props.children}
    </div>
  )
}

export function PrimaryPanel(props: {
  children: ReactNode
  className?: string
  delay?: number
  accent?: boolean
}) {
  return (
    <section
      className={`glass-panel-strong relative overflow-hidden p-6 sm:p-8 rise-in ${props.className ?? ''}`.trim()}
      style={props.delay != null ? { animationDelay: `${props.delay}ms` } : undefined}
    >
      {props.accent ? (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--maya-teal)]/30 to-transparent" />
      ) : null}
      {props.children}
    </section>
  )
}

export function PanelHeader(props: {
  kicker: string
  title: string
  description?: string
  icon?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <p className="island-kicker mb-1">{props.kicker}</p>
        <h2 className="text-xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-2xl">
          {props.title}
        </h2>
        {props.description ? (
          <p className="mt-2 max-w-2xl text-sm text-[var(--sea-ink-soft)]">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.icon ? (
        <div className="shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-3 shadow-sm">
          {props.icon}
        </div>
      ) : null}
    </div>
  )
}

export function MetricTile(props: {
  label: string
  value: string
  highlight?: boolean
  size?: 'sm' | 'md'
  subValue?: string
}) {
  const size = props.size ?? 'md'
  return (
    <div
      className={`flex flex-col justify-center rounded-2xl border bg-[var(--bg-base)] p-3 sm:p-4 ${
        props.highlight
          ? 'border-[var(--maya-teal)]/30 shadow-[0_0_15px_rgba(79,209,197,0.1)]'
          : 'border-[var(--line)]'
      }`}
    >
      <span className="mb-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)] sm:text-xs">
        {props.label}
      </span>
      <span
        className={`truncate font-bold text-[var(--sea-ink)] ${
          size === 'sm' ? 'text-lg' : 'text-xl sm:text-2xl'
        } ${props.highlight ? 'text-[var(--maya-teal)]' : ''}`}
      >
        {props.value}
      </span>
      {props.subValue ? (
        <span className="mt-0.5 text-xs font-semibold text-[var(--sea-ink-soft)]">
          {props.subValue}
        </span>
      ) : null}
    </div>
  )
}

export function FieldLabel(props: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      className="block text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]"
      htmlFor={props.htmlFor}
    >
      {props.children}
    </label>
  )
}

export function FormSelect(props: {
  id?: string
  'aria-label'?: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; disabled?: boolean }>
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`relative mt-2 ${props.className ?? ''}`.trim()}>
      <select
        id={props.id}
        aria-label={props['aria-label']}
        className="w-full appearance-none rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 pr-10 text-sm font-semibold text-[var(--sea-ink)] outline-none transition-colors [color-scheme:dark] focus:border-[var(--maya-teal)]/50 focus:ring-1 focus:ring-[var(--maya-teal)]/30"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.placeholder ? (
          <option value="" disabled={props.value !== ''}>
            {props.placeholder}
          </option>
        ) : null}
        {props.options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="bg-[var(--surface)] text-[var(--sea-ink)]"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sea-ink-soft)]"
      />
    </div>
  )
}

export function FormInput(props: {
  id?: string
  'aria-label'?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: 'text' | 'number'
}) {
  return (
    <input
      id={props.id}
      aria-label={props['aria-label']}
      type={props.type ?? 'text'}
      className={`mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--sea-ink)] outline-none transition-colors placeholder:text-[var(--sea-ink-soft)]/50 focus:border-[var(--maya-teal)]/50 focus:ring-1 focus:ring-[var(--maya-teal)]/30 ${props.className ?? ''}`.trim()}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
    />
  )
}

export const UNIT_FRACTION_PRESETS = [
  { label: 'Max', percent: 100 },
  { label: '75%', percent: 75 },
  { label: '50%', percent: 50 },
  { label: '25%', percent: 25 },
] as const

export function UnitFractionButtons(props: {
  totalUnits: string | null | undefined
  disabled?: boolean
  onSelect: (units: string) => void
  className?: string
}) {
  const hasTotal =
    Boolean(props.totalUnits) &&
    props.totalUnits !== '0' &&
    /^\d+$/.test(props.totalUnits?.trim() ?? '')

  return (
    <div className={`flex flex-wrap gap-2 ${props.className ?? ''}`.trim()}>
      {UNIT_FRACTION_PRESETS.map(({ label, percent }) => (
        <button
          key={label}
          type="button"
          disabled={props.disabled || !hasTotal}
          onClick={() => {
            if (!props.totalUnits) return
            const next = computeLiquidityUnitFraction(props.totalUnits, percent)
            if (next) props.onSelect(next)
          }}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--sea-ink-soft)] transition-colors hover:border-[var(--maya-teal)]/40 hover:text-[var(--maya-teal)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function SegmentedTabs<T extends string>(props: {
  tabs: Array<{ id: T; label: string }>
  activeTab: T
  onChange: (tab: T) => void
  className?: string
}) {
  return (
    <div
      className={`inline-flex rounded-full border border-[var(--line)] bg-[var(--surface)] p-1 shadow-sm ${props.className ?? ''}`.trim()}
    >
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            props.activeTab === tab.id
              ? 'bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm'
              : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
          }`}
          onClick={() => props.onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function ActionShell(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[2rem] border border-transparent bg-[var(--chip-bg)]/80 p-5 transition-all duration-300 focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] sm:p-6 ${props.className ?? ''}`.trim()}
    >
      {props.children}
    </div>
  )
}

export function MemoCallout(props: {
  memo: string | null
  txAmountCacao: string | null
  helperText?: string
}) {
  if (!props.memo) {
    return null
  }

  return (
    <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-[var(--line)] bg-[var(--bg-base)] p-4">
      <div className="mt-0.5 text-[var(--maya-teal)]">
        <Shield size={16} />
      </div>
      <div className="space-y-1 text-xs">
        <p className="font-semibold text-[var(--sea-ink)]">
          Protocol Memo:{' '}
          <span className="ml-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 font-mono">
            {props.memo}
          </span>
        </p>
        {props.txAmountCacao ? (
          <p className="text-[var(--sea-ink-soft)]">
            Tx amount:{' '}
            <span className="font-semibold text-[var(--sea-ink)]">
              {props.txAmountCacao} CACAO
            </span>
          </p>
        ) : null}
        {props.helperText ? (
          <p className="leading-snug text-[var(--sea-ink-soft)]">{props.helperText}</p>
        ) : null}
      </div>
    </div>
  )
}

export function GradientSubmitButton(props: {
  children: ReactNode
  disabled?: boolean
  isLoading?: boolean
  onClick: () => void
}) {
  return (
    <button
      className="group/submit relative mt-4 h-[56px] w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#FF9B70] to-[var(--cacao-neon)] text-lg font-bold tracking-tight text-[var(--bg-base)] shadow-[0_4px_20px_rgba(232,122,78,0.4)] transition-all hover:scale-[1.01] hover:shadow-[0_6px_24px_rgba(232,122,78,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={props.disabled || props.isLoading}
      type="button"
      onClick={props.onClick}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {props.isLoading ? (
          <Loader2 size={18} className="animate-spin text-white/90" />
        ) : null}
        <span className="text-white drop-shadow-sm">{props.children}</span>
      </span>
    </button>
  )
}

export function CompactToolbar(props: {
  children: ReactNode
  actions?: ReactNode
  delay?: number
}) {
  return (
    <div
      className="rise-in flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)]/80 px-4 py-3 shadow-sm backdrop-blur-xl sm:px-5"
      style={props.delay != null ? { animationDelay: `${props.delay}ms` } : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">{props.children}</div>
      {props.actions}
    </div>
  )
}

export function WorkspaceShell(props: { children: ReactNode; delay?: number }) {
  return (
    <article
      className="glass-panel-strong rise-in overflow-visible rounded-[2.5rem] border border-[var(--line)] bg-[var(--surface-strong)]/80 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-2xl sm:p-3"
      style={props.delay != null ? { animationDelay: `${props.delay}ms` } : undefined}
    >
      {props.children}
    </article>
  )
}

export function EmptyState(props: {
  title: string
  body: string
  isLoading?: boolean
}) {
  return (
    <div className="empty-state mb-2 rounded-3xl border border-[var(--line)] bg-[var(--bg-base)] py-12 text-center">
      {props.isLoading ? (
        <Loader2
          size={32}
          className="mx-auto mb-4 animate-spin text-[var(--maya-teal)]"
        />
      ) : null}
      <p className="text-lg font-semibold text-[var(--sea-ink)]">{props.title}</p>
      <p className="mx-auto mt-3 max-w-sm text-sm text-[var(--sea-ink-soft)]">
        {props.body}
      </p>
    </div>
  )
}

export function MessageState(props: {
  body: string
  icon: ReactNode
  subtitle?: string
  title: string
  action?: ReactNode
}) {
  return (
    <PageShell
      title="Pooled Nodes"
      subtitle={
        props.subtitle ??
        'Review pooled MAYANodes related to your MayaChain address.'
      }
    >
      <PageContent>
        <PrimaryPanel>
          <div className="flex flex-col items-center gap-4 text-center">
            {props.icon}
            <h2 className="text-2xl font-bold">{props.title}</h2>
            <p className="max-w-xl text-[var(--sea-ink-soft)]">{props.body}</p>
            {props.action}
          </div>
        </PrimaryPanel>
      </PageContent>
    </PageShell>
  )
}

export function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] p-3">
      <div className="text-xs font-bold uppercase text-[var(--sea-ink-soft)]">
        {props.label}
      </div>
      <div className="mt-1 break-all font-bold">{props.value}</div>
    </div>
  )
}

export function SkeletonMetric() {
  return (
    <div className="animate-pulse rounded-2xl border border-[var(--line)] p-3">
      <div className="h-3 w-20 rounded bg-[var(--line)]" />
      <div className="mt-2 h-5 w-28 rounded bg-[var(--line)]" />
    </div>
  )
}

export function SkeletonPanel(props: { rows?: number; delay?: number }) {
  const rows = props.rows ?? 3
  return (
    <PrimaryPanel delay={props.delay}>
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 rounded bg-[var(--line)]" />
        <div className="h-4 w-full max-w-md rounded bg-[var(--line)]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: rows }).map((_, index) => (
            <SkeletonMetric key={index} />
          ))}
        </div>
      </div>
    </PrimaryPanel>
  )
}

export function SessionBadge(props: { label: string }) {
  return (
    <div className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1 text-[11px] font-bold text-[var(--sea-ink-soft)] shadow-sm">
      {props.label}
    </div>
  )
}

export function AddressChip(props: { address: string }) {
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return
    }
    await navigator.clipboard.writeText(props.address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-sm font-semibold transition-colors hover:border-[var(--maya-teal)]/30 hover:bg-[var(--surface)]"
      title={props.address}
      onClick={() => void copyAddress()}
    >
      <span className="font-mono">{shortenAddress(props.address)}</span>
      {copied ? (
        <Check size={14} className="text-[var(--maya-teal)]" />
      ) : (
        <Copy size={14} className="text-[var(--sea-ink-soft)]" />
      )}
    </button>
  )
}

export type AlertItem = {
  id: string
  message: string
  tone: 'warning' | 'error'
}

export function AlertStack(props: { alerts: AlertItem[]; className?: string }) {
  if (!props.alerts.length) {
    return null
  }

  return (
    <div className={`space-y-2 ${props.className ?? ''}`.trim()}>
      {props.alerts.map((alert) =>
        alert.tone === 'error' ? (
          <ErrorBanner key={alert.id} className="mt-0">
            {alert.message}
          </ErrorBanner>
        ) : (
          <Warning key={alert.id} className="mt-0">
            {alert.message}
          </Warning>
        ),
      )}
    </div>
  )
}

export function Warning(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-sm font-medium text-amber-500 ${props.className ?? 'mt-4'}`.trim()}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <p>{props.children}</p>
    </div>
  )
}

export function ErrorBanner(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 p-3.5 text-sm font-medium text-rose-400 ${props.className ?? 'mt-4'}`.trim()}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <p>{props.children}</p>
    </div>
  )
}

export function TabPills<T extends string>(props: {
  tabs: Array<{ id: T; label: string }>
  activeTab: T
  onChange: (tab: T) => void
}) {
  return (
    <SegmentedTabs
      tabs={props.tabs}
      activeTab={props.activeTab}
      onChange={props.onChange}
    />
  )
}

export function getNodeStatusTone(status: string): {
  className: string
  label: string
} {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'active') {
    return {
      label: status,
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    }
  }
  if (normalized === 'standby' || normalized === 'ready') {
    return {
      label: status,
      className:
        'border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]',
    }
  }
  return {
    label: status,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  }
}

export function NodeStatusBadge(props: { status: string }) {
  const tone = getNodeStatusTone(props.status)
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${tone.className}`}
    >
      {tone.label}
    </span>
  )
}

export function RoleBadge(props: { label: string; tone?: 'operator' | 'provider' }) {
  const tone = props.tone ?? 'provider'
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        tone === 'operator'
          ? 'bg-[var(--maya-teal)]/15 text-[var(--maya-teal)]'
          : 'border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)]'
      }`}
    >
      {props.label}
    </span>
  )
}

export function MemoPreview(props: {
  memo: string | null
  txAmountCacao: string | null
}) {
  return (
    <MemoCallout
      memo={props.memo}
      txAmountCacao={props.txAmountCacao}
    />
  )
}

export function addressInitials(address: string): string {
  const trimmed = address.replace(/^maya1/i, '').slice(0, 2).toUpperCase()
  return trimmed || 'NA'
}
