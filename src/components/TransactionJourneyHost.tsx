import { Activity, AlertCircle, CheckCircle2, Clock3, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react'
import QRCode from 'react-qr-code'
import { useEffect, useMemo, useRef, useState } from 'react'
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
      <div className="glass-panel-strong w-full max-w-5xl max-h-[90vh] overflow-hidden border border-[var(--line)] rounded-[2rem] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--line)] shrink-0">
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
            className="p-2 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] shrink-0"
            onClick={() => wallet.closeJourneyDialog()}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] flex-1 min-h-0">
          <aside className="border-r border-[var(--line)] bg-[var(--surface)]/50 p-4 shrink-0 overflow-y-auto custom-scrollbar">
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
            <div className="max-w-[700px] mx-auto space-y-6">
              <JourneySummaryCard journey={activeJourney} />

              <SwapJourneyRealizedActionPanel journey={activeJourney} />

              <SwapJourneyStreamingPanel journey={activeJourney} />

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

              <JourneyDevicePanels journey={activeJourney} />

              <AdvancedDetailsToggle journey={activeJourney} />

              <div className="flex justify-end gap-3 pt-4 pb-8">
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
          </section>
        </div>
      </div>
    </div>
  )
}

function JourneyToastCard({ journey }: { journey: WalletJourney }) {
  const step = resolvePrimaryStep(journey)
  const summary = journey.swapTracking?.trackerState?.summary
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{renderStatusIcon(journey.status)}</div>
      <div className="min-w-0">
        <div className="font-semibold text-sm text-[var(--sea-ink)]">
          {journey.title}
        </div>
        <div className="mt-1 text-xs text-[var(--sea-ink-soft)]">
          {summary ?? step?.label ?? 'Tracking update'}
          {!summary && step?.message ? `: ${step.message}` : ''}
        </div>
      </div>
    </div>
  )
}

function JourneySummaryCard({ journey }: { journey: WalletJourney }) {
  const step = resolvePrimaryStep(journey)
  const trackerState = journey.swapTracking?.trackerState
  return (
    <div className="glass-panel p-5 rounded-[1.5rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
            Current Status
          </div>
          <div className="mt-2 text-xl font-bold text-[var(--sea-ink)]">
            {trackerState?.summary ?? step?.label ?? journey.title}
          </div>
          <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
            {resolveAttentionMessage(journey, step)}
          </p>
          {journey.kind === 'swap' && journey.swapTracking ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <MiniPill
                label={formatTrackerTransportLabel(
                  journey.swapTracking.transportStatus,
                )}
              />
              {trackerState?.stage ? (
                <MiniPill label={trackerState.stage} accent />
              ) : null}
              {trackerState?.swapType ? (
                <MiniPill label={trackerState.swapType} />
              ) : null}
            </div>
          ) : null}

          {journey.primaryTxHash || journey.secondaryTxHash ? (
            <div className="mt-4 space-y-2">
              {journey.primaryTxHash ? (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--sea-ink-soft)] mb-1">
                    Primary Hash
                  </div>
                  <div className="text-xs font-mono text-[var(--maya-teal)] break-all bg-[var(--maya-teal)]/10 px-2.5 py-1.5 rounded-lg border border-[var(--maya-teal)]/20 inline-block max-w-full">
                    {journey.primaryTxHash}
                  </div>
                </div>
              ) : null}
              {journey.secondaryTxHash ? (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--sea-ink-soft)] mb-1">
                    Secondary Hash
                  </div>
                  <div className="text-xs font-mono text-[var(--maya-teal)] break-all bg-[var(--maya-teal)]/10 px-2.5 py-1.5 rounded-lg border border-[var(--maya-teal)]/20 inline-block max-w-full">
                    {journey.secondaryTxHash}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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

function MiniPill(props: { label: string; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
        props.accent
          ? 'border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]'
          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)]'
      }`}
    >
      {props.label}
    </span>
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
  if (journey.kind === 'swap' && journey.swapTracking?.trackerState?.summary) {
    if (journey.swapTracking.transportStatus === 'fallback') {
      return (
        journey.swapTracking.fallbackReason ??
        'Live protocol tracking is unavailable. Falling back to local transaction confirmation.'
      )
    }
    return journey.swapTracking.trackerState.summary
  }
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

function formatTrackerTransportLabel(
  value: NonNullable<WalletJourney['swapTracking']>['transportStatus'],
) {
  switch (value) {
    case 'connecting':
      return 'Connecting'
    case 'subscribed':
      return 'Subscribed'
    case 'live':
      return 'Live Updates'
    case 'fallback':
      return 'Fallback'
    case 'closed':
      return 'Closed'
    default:
      return 'Local'
  }
}

function formatTrackerStateLabel(value?: string | null) {
  if (!value) {
    return 'n/a'
  }
  return value.replace(/_/g, ' ')
}

function SwapJourneyRealizedActionPanel({ journey }: { journey: WalletJourney }) {
  const tracking = journey.swapTracking
  const state = tracking?.trackerState
  if (journey.kind !== 'swap' || !state || !state.from || !state.to) {
    return null
  }

  return (
    <div className="glass-panel p-5 rounded-[1.5rem]">
      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-4">
        Action Details
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 dark:bg-[var(--surface-strong)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
            Swapping From
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--sea-ink)] flex items-end gap-2">
            {state.from.display.amount.compact ?? state.from.display.amount.exact ?? 'n/a'}
            <span className="text-base font-semibold text-[var(--sea-ink-soft)] mb-1">{state.from.display.symbol}</span>
          </div>
          <div className="mt-2 text-xs text-[var(--sea-ink-soft)] break-all opacity-70">
            {state.from.address}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 dark:bg-[var(--surface-strong)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
            Receiving
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--sea-ink)] flex items-end gap-2">
            {(state.to.display.amountReceived.compact ??
              state.to.display.amountExpected.compact ??
              state.to.display.amountReceived.exact ??
              state.to.display.amountExpected.exact ??
              'n/a')}
            <span className="text-base font-semibold text-[var(--sea-ink-soft)] mb-1">{state.to.display.symbol}</span>
          </div>
          <div className="mt-2 text-xs text-[var(--sea-ink-soft)] break-all opacity-70">
            {state.to.address}
          </div>
        </div>
      </div>
    </div>
  )
}

function SwapJourneyStreamingPanel({ journey }: { journey: WalletJourney }) {
  const tracking = journey.swapTracking
  const state = tracking?.trackerState
  if (journey.kind !== 'swap' || !state?.streaming) {
    return null
  }

  return (
    <div className="glass-panel p-5 rounded-[1.5rem]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
          Streaming Progress
        </div>
        <div className="text-sm font-semibold text-[var(--sea-ink)]">
          {state.streaming.progressPercent.toFixed(0)}%
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface)]">
        <div
          className="h-full bg-[var(--maya-teal)] transition-[width] duration-300"
          style={{
            width: `${Math.max(
              0,
              Math.min(100, state.streaming.progressPercent),
            )}%`,
          }}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-8 text-sm">
         <div className="flex flex-col">
           <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">Completed Splits</span>
           <span className="font-semibold text-[var(--sea-ink)]">{state.streaming.count} / {state.streaming.quantity}</span>
         </div>
         <div className="flex flex-col">
           <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">Swapped In</span>
           <span className="font-semibold text-[var(--sea-ink)]">{state.streaming.swappedInAmount}</span>
         </div>
      </div>
      {state.streaming.failedReasons.length ? (
        <div className="mt-4 rounded-[1rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {state.streaming.failedReasons.join(', ')}
        </div>
      ) : null}
    </div>
  )
}

function JourneyDevicePanels({ journey }: { journey: WalletJourney }) {
  if (!journey.qrPayload && !journey.deviceJoin) return null;

  return (
    <div className="space-y-5">
      {journey.qrPayload ? (
        <div className="glass-panel p-5 rounded-[1.5rem]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-4">
            Scan To Continue
          </div>
          <div className="bg-white p-4 rounded-[1.5rem] inline-flex">
            <QRCode value={journey.qrPayload} size={180} />
          </div>
          <p className="mt-4 text-sm text-[var(--sea-ink-soft)]">
            Open Vultisig on the participating device and scan the session QR code.
          </p>
        </div>
      ) : null}

      {journey.deviceJoin ? (
        <div className="glass-panel p-5 rounded-[1.5rem]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)] mb-4">
            Device Join
          </div>
          <div className="flex justify-between text-sm font-semibold text-[var(--sea-ink)] mb-2">
            <span>Joined devices</span>
            <span>
              {journey.deviceJoin.joined} / {journey.deviceJoin.required}
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden border border-[var(--line)] bg-[var(--surface-strong)] flex">
            {Array.from({
              length: Math.max(journey.deviceJoin.required, 2),
            }).map((_, index) => (
              <div
                key={index}
                className={`flex-1 border-r border-[var(--line)] last:border-r-0 ${
                  index < journey.deviceJoin.joined
                    ? 'bg-[var(--cacao-neon)]'
                    : 'bg-transparent'
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AdvancedDetailsToggle({ journey }: { journey: WalletJourney }) {
  const [isOpen, setIsOpen] = useState(false);
  const tracking = journey.swapTracking;
  const state = tracking?.trackerState;

  return (
    <div className="glass-panel rounded-[1.5rem] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-[var(--surface)]/50 transition-colors"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
          Advanced Details
        </span>
        <div className="text-[var(--sea-ink-soft)]">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-5 pt-0 border-t border-[var(--line)] space-y-6">
          <div className="space-y-4 pt-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--sea-ink)]">
              Transaction Data
            </div>
            <div className="space-y-3 text-sm">
              <InfoLine label="Source" value={getJourneySourceLabel(journey.source)} />
              <InfoLine label="Chain" value={journey.chain ?? 'n/a'} />
            </div>
          </div>

          {journey.kind === 'swap' && tracking ? (
            <>
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--sea-ink)]">
                  Protocol Tracker
                </div>
                <div className="space-y-3 text-sm">
                  <InfoLine label="Transport" value={formatTrackerTransportLabel(tracking.transportStatus)} />
                  <InfoLine label="Tracking Source" value={tracking.trackingSource} />
                  <InfoLine label="Protocol Status" value={formatTrackerStateLabel(state?.status)} />
                  <InfoLine label="Stage" value={formatTrackerStateLabel(state?.stage)} />
                  <InfoLine label="Swap Type" value={formatTrackerStateLabel(state?.swapType)} />
                  <InfoLine label="Affiliate" value={
                    state?.affiliate?.interface?.name && state.affiliate.interface.code
                      ? `${state.affiliate.interface.name} (${state.affiliate.interface.code})`
                      : state?.affiliate?.interface?.name ?? state?.affiliate?.raw ?? 'n/a'
                  } />
                  {tracking.fallbackReason ? (
                    <InfoLine label="Fallback Note" value={tracking.fallbackReason} />
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--sea-ink)]">
                  Technical Details
                </div>
                <div className="space-y-3 text-sm">
                   <InfoLine
                    label="Pair"
                    value={
                      tracking.context
                        ? `${tracking.context.fromTicker} -> ${tracking.context.toTicker}`
                        : journey.title
                    }
                  />
                  <InfoLine label="Amount" value={tracking.context?.amount ?? 'n/a'} />
                  <InfoLine label="Execution" value={tracking.context?.executionMode ?? 'n/a'} />
                  <InfoLine label="Memo" value={tracking.context?.memo ?? 'n/a'} mono />
                  <InfoLine label="Inbound Address" value={tracking.context?.inboundAddress ?? 'n/a'} mono />
                  <InfoLine label="Router" value={tracking.context?.router ?? 'n/a'} mono />
                  <InfoLine label="Inbound Seen" value={state ? (state.chain.inboundSeen ? 'Yes' : 'No') : 'n/a'} />
                  <InfoLine label="Last Event" value={state?.chain.lastEventType ?? 'n/a'} />
                  <InfoLine label="Chain Height" value={String(state?.chain.height ?? 'n/a')} />
                </div>
                {tracking.historyHref ? (
                  <a
                    href={tracking.historyHref}
                    className="mt-4 inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline hover:border-[var(--maya-teal)] hover:text-[var(--maya-teal)] transition-colors"
                  >
                    Open Portfolio History
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
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
      <span className="hidden xl:inline font-semibold text-sm">Activity</span>
      {pendingCount > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[var(--cacao-neon)] text-white text-[10px] font-bold flex items-center justify-center">
          {pendingCount}
        </span>
      ) : null}
    </button>
  )
}
