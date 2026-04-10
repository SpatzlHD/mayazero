import { Activity, AlertCircle, CheckCircle2, Clock3, Loader2, X } from 'lucide-react'
import QRCode from 'react-qr-code'
import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  getJourneySourceLabel,
  getJourneyStatusTone,
  getStepTone,
  useMayaWalletActions,
  useMayaWalletState,
  type WalletJourney,
  type WalletJourneyStep,
} from '#/wallet'

export function TransactionJourneyHost() {
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()
  const toastIds = useRef(new Set<string>())
  const openedAt = useRef(new Map<string, number>())

  useEffect(() => {
    const activeIds = new Set(state.journeys.map((journey) => journey.id))
    for (const journey of state.journeys) {
      toast.custom(
        () => (
          <button
            type="button"
            className="w-full text-left cursor-pointer"
            onClick={() => wallet.openJourneyDialog(journey.id)}
          >
            <JourneyToastCard journey={journey} />
          </button>
        ),
        {
          id: journey.id,
          duration:
            journey.status === 'pending' || journey.status === 'attention'
              ? Infinity
              : 5000,
        },
      )
      toastIds.current.add(journey.id)

      if (
        journey.updatedAt !== openedAt.current.get(journey.id) &&
        (journey.openOnUpdate || journey.requiresAttention)
      ) {
        wallet.openJourneyDialog(journey.id)
        openedAt.current.set(journey.id, journey.updatedAt)
      }
    }

    for (const toastId of [...toastIds.current]) {
      if (activeIds.has(toastId)) {
        continue
      }
      toast.dismiss(toastId)
      toastIds.current.delete(toastId)
      openedAt.current.delete(toastId)
    }
  }, [state.journeys, wallet])

  const activeJourney = useMemo(() => {
    return (
      state.journeys.find(
        (journey) => journey.id === state.journeyDialog.activeJourneyId,
      ) ??
      state.journeys[0] ??
      null
    )
  }, [state.journeys, state.journeyDialog.activeJourneyId])

  if (!state.journeyDialog.isOpen || !activeJourney) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[var(--bg-base)]/82 backdrop-blur-md p-4">
      <div className="glass-panel-strong w-full max-w-5xl max-h-[90vh] overflow-hidden border border-[var(--line)] rounded-[2rem] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--line)]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
              Transaction Tracker
            </div>
            <h2 className="mt-2 text-2xl font-bold text-[var(--sea-ink)]">
              {activeJourney.title}
            </h2>
          </div>
          <button
            type="button"
            className="p-2 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            onClick={() => wallet.closeJourneyDialog()}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] max-h-[calc(90vh-92px)]">
          <aside className="border-r border-[var(--line)] bg-[var(--surface)]/50 p-4 overflow-y-auto custom-scrollbar">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-3">
              Recent Journeys
            </div>
            <div className="space-y-2">
              {state.journeys.map((journey) => (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() => wallet.openJourneyDialog(journey.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    journey.id === activeJourney.id
                      ? 'border-[var(--maya-teal)] bg-[var(--maya-teal)]/10'
                      : 'border-[var(--line)] bg-[var(--surface-strong)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm text-[var(--sea-ink)]">
                        {journey.title}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
                        {getJourneySourceLabel(journey.source)}
                      </div>
                    </div>
                    <StatusPill status={journey.status} />
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="p-6 overflow-y-auto custom-scrollbar">
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-5">
                <JourneySummaryCard journey={activeJourney} />
                <div className="glass-panel p-5 rounded-[1.5rem]">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-4">
                    Progress
                  </div>
                  <div className="space-y-4">
                    {activeJourney.steps.map((step) => (
                      <JourneyStepRow key={step.key} step={step} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {activeJourney.qrPayload ? (
                  <div className="glass-panel p-5 rounded-[1.5rem]">
                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-4">
                      Scan To Continue
                    </div>
                    <div className="bg-white p-4 rounded-[1.5rem] inline-flex">
                      <QRCode value={activeJourney.qrPayload} size={180} />
                    </div>
                    <p className="mt-4 text-sm text-[var(--sea-ink-soft)]">
                      Open Vultisig on the participating device and scan the session QR code.
                    </p>
                  </div>
                ) : null}

                {activeJourney.deviceJoin ? (
                  <div className="glass-panel p-5 rounded-[1.5rem]">
                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-4">
                      Device Join
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-[var(--sea-ink)] mb-2">
                      <span>Joined devices</span>
                      <span>
                        {activeJourney.deviceJoin.joined} / {activeJourney.deviceJoin.required}
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden border border-[var(--line)] bg-[var(--surface-strong)] flex">
                      {Array.from({
                        length: Math.max(activeJourney.deviceJoin.required, 2),
                      }).map((_, index) => (
                        <div
                          key={index}
                          className={`flex-1 border-r border-[var(--line)] last:border-r-0 ${
                            index < activeJourney.deviceJoin.joined
                              ? 'bg-[var(--cacao-neon)]'
                              : 'bg-transparent'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="glass-panel p-5 rounded-[1.5rem]">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-4">
                    Transaction Data
                  </div>
                  <div className="space-y-3 text-sm">
                    <InfoLine label="Source" value={getJourneySourceLabel(activeJourney.source)} />
                    <InfoLine label="Chain" value={activeJourney.chain ?? 'n/a'} />
                    <InfoLine label="Primary hash" value={activeJourney.primaryTxHash ?? 'n/a'} mono />
                    <InfoLine label="Secondary hash" value={activeJourney.secondaryTxHash ?? 'n/a'} mono />
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => wallet.dismissJourney(activeJourney.id)}
                    className="secondary-btn px-5 py-3"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => wallet.closeJourneyDialog()}
                    className="cacao-btn px-5 py-3"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function JourneyToastCard({ journey }: { journey: WalletJourney }) {
  const step = resolvePrimaryStep(journey)
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{renderStatusIcon(journey.status)}</div>
      <div className="min-w-0">
        <div className="font-semibold text-sm text-[var(--sea-ink)]">
          {journey.title}
        </div>
        <div className="mt-1 text-xs text-[var(--sea-ink-soft)]">
          {step?.label ?? 'Tracking update'}
          {step?.message ? `: ${step.message}` : ''}
        </div>
      </div>
    </div>
  )
}

function JourneySummaryCard({ journey }: { journey: WalletJourney }) {
  const step = resolvePrimaryStep(journey)
  return (
    <div className="glass-panel p-5 rounded-[1.5rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
            Current Status
          </div>
          <div className="mt-2 text-xl font-bold text-[var(--sea-ink)]">
            {step?.label ?? journey.title}
          </div>
          <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
            {resolveAttentionMessage(journey, step)}
          </p>
        </div>
        <StatusPill status={journey.status} />
      </div>
    </div>
  )
}

function JourneyStepRow({ step }: { step: WalletJourneyStep }) {
  const tone = getStepTone(step.status)
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-1 w-3 h-3 rounded-full ${
          tone === 'success'
            ? 'bg-[var(--maya-teal)]'
            : tone === 'error'
              ? 'bg-rose-500'
              : tone === 'warning'
                ? 'bg-[var(--cacao-neon)]'
                : tone === 'active'
                  ? 'bg-sky-500 animate-pulse'
                  : 'bg-[var(--line)]'
        }`}
      />
      <div className="min-w-0">
        <div className="font-semibold text-sm text-[var(--sea-ink)]">
          {step.label}
        </div>
        {step.message ? (
          <div className="mt-1 text-sm text-[var(--sea-ink-soft)]">
            {step.message}
          </div>
        ) : null}
        {step.txHash ? (
          <div className="mt-1 text-xs font-mono break-all text-[var(--sea-ink-soft)]">
            {step.txHash}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: WalletJourney['status'] }) {
  const tone = getJourneyStatusTone(status)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
        tone === 'success'
          ? 'border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]'
          : tone === 'error'
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
            : tone === 'warning'
              ? 'border-[var(--cacao-neon)]/30 bg-[var(--cacao-neon)]/10 text-[var(--cacao-neon)]'
              : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)]'
      }`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function InfoLine(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--sea-ink-soft)]">{props.label}</span>
      <span
        className={`text-right text-[var(--sea-ink)] ${
          props.mono ? 'font-mono break-all' : 'font-semibold'
        }`}
      >
        {props.value}
      </span>
    </div>
  )
}

function resolvePrimaryStep(journey: WalletJourney) {
  return (
    journey.steps.find((step) => step.status === 'attention') ??
    journey.steps.find((step) => step.status === 'active') ??
    [...journey.steps].reverse().find((step) => step.status === 'success') ??
    journey.steps[0]
  )
}

function resolveAttentionMessage(
  journey: WalletJourney,
  step?: WalletJourneyStep,
) {
  if (journey.qrPayload) {
    return 'Scan the QR code in Vultisig to continue the journey.'
  }
  if (journey.requiresAttention && step?.message) {
    return step.message
  }
  if (journey.status === 'unconfirmed') {
    return 'The transaction was submitted, but confirmation did not arrive before the timeout.'
  }
  if (journey.status === 'submitted_no_hash') {
    return 'The provider accepted the request without returning a hash, so tracking cannot continue automatically.'
  }
  return step?.message ?? 'Tracking the latest wallet activity.'
}

function renderStatusIcon(status: WalletJourney['status']) {
  const tone = getJourneyStatusTone(status)
  if (tone === 'success') {
    return <CheckCircle2 size={16} className="text-[var(--maya-teal)]" />
  }
  if (tone === 'error') {
    return <AlertCircle size={16} className="text-rose-500" />
  }
  if (tone === 'warning') {
    return <Clock3 size={16} className="text-[var(--cacao-neon)]" />
  }
  return <Loader2 size={16} className="text-sky-500 animate-spin" />
}

export function TransactionJourneyActivityButton() {
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()
  const pendingCount = state.journeys.filter(
    (journey) => journey.status === 'pending' || journey.status === 'attention',
  ).length
  const latestJourney = state.journeys[0]
  const tone = latestJourney
    ? getJourneyStatusTone(latestJourney.status)
    : 'neutral'

  return (
    <button
      type="button"
      className={`relative flex items-center gap-2 px-3 py-2 rounded-[1rem] border transition-all duration-300 ${
        tone === 'success'
          ? 'border-[var(--maya-teal)] bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]'
          : tone === 'error'
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
            : tone === 'warning'
              ? 'border-[var(--cacao-neon)]/30 bg-[var(--cacao-neon)]/10 text-[var(--cacao-neon)]'
              : 'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)]'
      }`}
      onClick={() => wallet.openJourneyDialog()}
    >
      <Activity size={16} />
      <span className="hidden md:inline font-semibold text-sm">Activity</span>
      {pendingCount > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[var(--cacao-neon)] text-white text-[10px] font-bold flex items-center justify-center">
          {pendingCount}
        </span>
      ) : null}
    </button>
  )
}
