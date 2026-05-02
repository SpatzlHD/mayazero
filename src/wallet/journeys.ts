import { serializeWalletError } from './errors'
import {
  createCacaotrackerTxTrackerSubscribeMessage,
  parseCacaotrackerTxTrackerMessage,
} from '#/lib/cacaotracker'
import type {
  CacaotrackerTxTrackerSessionResponse,
  CacaotrackerTxTrackerState,
} from '#/lib/cacaotracker-types'
import {
  trackAnalyticsEvent,
  type JourneyAnalyticsContext,
  type JourneyStatus,
} from '#/analytics'
import type { MayaWalletManager } from './manager'
import type {
  WalletChain,
  WalletJourney,
  WalletJourneySource,
  WalletJourneyStatus,
  WalletJourneyStep,
  WalletJourneyStepStatus,
} from './types'

const DEFAULT_POLL_INTERVAL_MS = 2_500
const DEFAULT_MAX_WAIT_MS = 300_000
const DEFAULT_TRACKER_WAIT_MS = 120_000

type WebSocketLike = {
  addEventListener: (
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: unknown) => void,
  ) => void
  removeEventListener: (
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: unknown) => void,
  ) => void
  send: (data: string) => void
  close: () => void
}

type MessageEventLike = {
  data?: string
}

export type JourneyController = {
  journeyId: string
  activateStep: (stepKey: string, message?: string) => void
  updateStep: (
    stepKey: string,
    patch: Partial<WalletJourneyStep>,
    options?: {
      status?: WalletJourneyStatus
      requiresAttention?: boolean
      openOnUpdate?: boolean
    },
  ) => void
  completeStep: (stepKey: string, message?: string) => void
  attentionStep: (stepKey: string, message?: string) => void
  failStep: (stepKey: string, error: unknown) => never
  complete: (result?: unknown, status?: Exclude<WalletJourneyStatus, 'pending' | 'attention'>) => void
  setPrimaryTxHash: (txHash: string | null | undefined) => void
  setSecondaryTxHash: (txHash: string | null | undefined) => void
  patchJourney: (patch: Partial<WalletJourney>) => void
}

export async function trackTransactionJourney<T>(
  manager: MayaWalletManager,
  input: {
    kind: WalletJourney['kind']
    title: string
    sessionId?: string | null
    source?: WalletJourneySource
    chain?: WalletChain
    routePath?: string
    analytics?: JourneyAnalyticsContext
    steps: WalletJourneyStep[]
    run: (controller: JourneyController) => Promise<T>
  },
): Promise<T> {
  const journeyId = manager.createJourney({
    kind: input.kind,
    title: input.title,
    sessionId: input.sessionId,
    source: input.source,
    chain: input.chain,
    routePath: input.routePath,
    steps: input.steps,
  })
  if (input.analytics) {
    trackAnalyticsEvent({
      type: 'journey_started',
      action: input.analytics.action,
      route: input.analytics.route,
      subject: input.analytics.subject,
      ...(input.source ? { source: input.source } : {}),
      ...(input.chain ? { chain: input.chain } : {}),
      ...(input.analytics.has_referral !== undefined
        ? { has_referral: input.analytics.has_referral }
        : {}),
    })
  }

  let hasTrackedOutcome = false
  const emitJourneyOutcome = (status: JourneyStatus) => {
    if (!input.analytics || hasTrackedOutcome) {
      return
    }

    hasTrackedOutcome = true
    trackAnalyticsEvent({
      type: 'journey_finished',
      action: input.analytics.action,
      route: input.analytics.route,
      status,
      subject: input.analytics.subject,
      ...(input.source ? { source: input.source } : {}),
      ...(input.chain ? { chain: input.chain } : {}),
      ...(input.analytics.has_referral !== undefined
        ? { has_referral: input.analytics.has_referral }
        : {}),
    })
  }

  const controller: JourneyController = {
    journeyId,
    activateStep: (stepKey, message) => {
      patchJourneyStep(manager, journeyId, stepKey, {
        status: 'active',
        ...(message ? { message } : {}),
      })
    },
    updateStep: (stepKey, patch, options) => {
      patchJourneyStep(manager, journeyId, stepKey, patch, options)
    },
    completeStep: (stepKey, message) => {
      patchJourneyStep(manager, journeyId, stepKey, {
        status: 'success',
        ...(message ? { message } : {}),
      })
    },
    attentionStep: (stepKey, message) => {
      patchJourneyStep(
        manager,
        journeyId,
        stepKey,
        {
          status: 'attention',
          ...(message ? { message } : {}),
        },
        {
          status: 'attention',
          requiresAttention: true,
          openOnUpdate: true,
        },
      )
    },
    failStep: (stepKey, error) => {
      const serialized = serializeWalletError(error)
      patchJourneyStep(
        manager,
        journeyId,
        stepKey,
        {
          status: 'error',
          message: serialized.message,
        },
        {
          status: 'error',
          requiresAttention: true,
          openOnUpdate: true,
        },
      )
      manager.completeJourney(journeyId, {
        status: 'error',
        result: undefined,
        requiresAttention: true,
        openOnUpdate: true,
      })
      manager.patchJourney(journeyId, { error: serialized })
      throw error
    },
    complete: (result, status = 'success') => {
      manager.completeJourney(journeyId, {
        status,
        result,
        requiresAttention: status === 'error',
        openOnUpdate: true,
      })
      emitJourneyOutcome(status)
    },
    setPrimaryTxHash: (txHash) => {
      manager.patchJourney(journeyId, {
        primaryTxHash: txHash ?? undefined,
      })
    },
    setSecondaryTxHash: (txHash) => {
      manager.patchJourney(journeyId, {
        secondaryTxHash: txHash ?? undefined,
      })
    },
    patchJourney: (patch) => {
      manager.patchJourney(journeyId, patch)
    },
  }

  try {
    const result = await input.run(controller)
    if (!hasTrackedOutcome && input.analytics) {
      emitJourneyOutcome('success')
    }
    return result
  } catch (error) {
    const journey = manager.getState().journeys.find((item) => item.id === journeyId)
    if (journey && journey.status !== 'error') {
      manager.patchJourney(journeyId, {
        status: 'error',
        error: serializeWalletError(error),
        requiresAttention: true,
        openOnUpdate: true,
      })
    }
    emitJourneyOutcome(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'cancelled'
        : 'error',
    )
    throw error
  }
}

export async function waitForJourneyTransactionSettlement(
  manager: MayaWalletManager,
  input: {
    journeyId: string
    sessionId?: string
    chain: WalletChain
    txHash: string | null | undefined
    stepKey: string
    primary?: boolean
    intervalMs?: number
    maxWaitMs?: number
    sleep?: (ms: number) => Promise<void>
  },
): Promise<'success' | 'error' | 'unconfirmed' | 'submitted_no_hash'> {
  if (!input.txHash) {
    patchJourneyStep(
      manager,
      input.journeyId,
      input.stepKey,
      {
        status: 'attention',
        message: 'Submitted, but automatic tracking is unavailable.',
      },
      {
        status: 'submitted_no_hash',
        openOnUpdate: true,
      },
    )
    return 'submitted_no_hash'
  }

  manager.patchJourney(input.journeyId, {
    ...(input.primary
      ? { primaryTxHash: input.txHash }
      : { secondaryTxHash: input.txHash }),
  })
  patchJourneyStep(manager, input.journeyId, input.stepKey, {
    status: 'active',
    txHash: input.txHash,
    chain: input.chain,
    message: 'Waiting for on-chain confirmation.',
  })

  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const deadline = Date.now() + (input.maxWaitMs ?? DEFAULT_MAX_WAIT_MS)

  while (Date.now() < deadline) {
    let statusResult
    try {
      statusResult = await manager.execute('tx.status', {
        sessionId: input.sessionId,
        input: {
          chain: input.chain,
          txHash: input.txHash,
        },
        track: false,
      })
    } catch (error) {
      const serialized = serializeWalletError(error)
      patchJourneyStep(
        manager,
        input.journeyId,
        input.stepKey,
        {
          status: 'unconfirmed',
          txHash: input.txHash,
          chain: input.chain,
          message: `Submitted, but automatic confirmation tracking failed${serialized.message ? `: ${serialized.message}` : '.'}`,
        },
        {
          status: 'unconfirmed',
          openOnUpdate: true,
        },
      )
      return 'unconfirmed'
    }

    const state = normalizeTxState(statusResult.status)
    if (state === 'success') {
      patchJourneyStep(manager, input.journeyId, input.stepKey, {
        status: 'success',
        txHash: input.txHash,
        chain: input.chain,
        message: 'Confirmed on-chain.',
      })
      return 'success'
    }

    if (state === 'error') {
      patchJourneyStep(
        manager,
        input.journeyId,
        input.stepKey,
        {
          status: 'error',
          txHash: input.txHash,
          chain: input.chain,
          message: `Transaction ${input.txHash} failed on-chain.`,
        },
        {
          status: 'error',
          requiresAttention: true,
          openOnUpdate: true,
        },
      )
      return 'error'
    }

    await sleep(input.intervalMs ?? DEFAULT_POLL_INTERVAL_MS)
  }

  patchJourneyStep(
    manager,
    input.journeyId,
    input.stepKey,
    {
      status: 'unconfirmed',
      txHash: input.txHash,
      chain: input.chain,
      message: 'Submitted, but confirmation timed out.',
    },
    {
      status: 'unconfirmed',
      openOnUpdate: true,
    },
  )

  return 'unconfirmed'
}

export function patchJourneyStep(
  manager: MayaWalletManager,
  journeyId: string,
  stepKey: string,
  patch: Partial<WalletJourneyStep>,
  options?: {
    status?: WalletJourneyStatus
    requiresAttention?: boolean
    openOnUpdate?: boolean
  },
): void {
  manager.patchJourney(journeyId, (journey) => ({
    steps: journey.steps.map((step) =>
      step.key === stepKey ? { ...step, ...patch } : step,
    ),
    ...(options?.status ? { status: options.status } : {}),
    ...(options?.requiresAttention !== undefined
      ? { requiresAttention: options.requiresAttention }
      : {}),
    ...(options?.openOnUpdate !== undefined
      ? { openOnUpdate: options.openOnUpdate }
      : {}),
  }))
}

export function patchSwapJourneyTracking(
  manager: MayaWalletManager,
  journeyId: string,
  patch: Partial<NonNullable<WalletJourney['swapTracking']>>,
): void {
  manager.patchJourney(journeyId, (journey) => ({
    swapTracking: {
      trackingSource: journey.swapTracking?.trackingSource ?? 'local',
      transportStatus: journey.swapTracking?.transportStatus ?? 'idle',
      ...(journey.swapTracking ?? {}),
      ...patch,
    },
  }))
}

export function resolveJourneyStatusFromTrackerState(
  state: CacaotrackerTxTrackerState,
): Exclude<WalletJourneyStatus, 'pending' | 'attention'> {
  const normalized = state.status.trim().toLowerCase()
  if (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('reject')
  ) {
    return 'error'
  }

  if (
    normalized.includes('refund') ||
    normalized.includes('cancel') ||
    normalized.includes('revert')
  ) {
    return 'unconfirmed'
  }

  return 'success'
}

export async function trackSwapJourneyWithCacaotracker(
  manager: MayaWalletManager,
  input: {
    journeyId: string
    txHash: string | null | undefined
    createSession: () => Promise<CacaotrackerTxTrackerSessionResponse>
    historyHref?: string
    timeoutMs?: number
    webSocketFactory?: (url: string) => WebSocketLike
  },
): Promise<{
  outcome: 'final' | 'fallback'
  trackerState?: CacaotrackerTxTrackerState
}> {
  if (!input.txHash) {
    patchSwapJourneyTracking(manager, input.journeyId, {
      trackingSource: 'fallback',
      transportStatus: 'fallback',
      fallbackReason: 'Submitted swap did not return a transaction hash.',
      historyHref: input.historyHref,
    })
    return { outcome: 'fallback' }
  }

  patchSwapJourneyTracking(manager, input.journeyId, {
    trackingSource: 'cacaotracker-ws',
    transportStatus: 'connecting',
    historyHref: input.historyHref,
    fallbackReason: undefined,
  })

  let session: CacaotrackerTxTrackerSessionResponse
  try {
    session = await input.createSession()
  } catch (error) {
    patchSwapJourneyTracking(manager, input.journeyId, {
      trackingSource: 'fallback',
      transportStatus: 'fallback',
      fallbackReason:
        error instanceof Error
          ? error.message
          : 'Failed to create a live tracker session.',
    })
    return { outcome: 'fallback' }
  }

  patchSwapJourneyTracking(manager, input.journeyId, {
    trackingSource: 'cacaotracker-ws',
    transportStatus: 'connecting',
    session: {
      expiresAt: session.expiresAt,
      heartbeatSeconds: session.heartbeatSeconds,
    },
  })

  const webSocketFactory =
    input.webSocketFactory ??
    ((url: string) => new WebSocket(url) as unknown as WebSocketLike)

  let ws: WebSocketLike
  try {
    ws = webSocketFactory(session.wsUrl)
  } catch (error) {
    patchSwapJourneyTracking(manager, input.journeyId, {
      trackingSource: 'fallback',
      transportStatus: 'fallback',
      fallbackReason:
        error instanceof Error
          ? error.message
          : 'Failed to open the live tracker websocket.',
    })
    return { outcome: 'fallback' }
  }

  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      finalize('fallback')
    }, input.timeoutMs ?? DEFAULT_TRACKER_WAIT_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      ws.removeEventListener('open', handleOpen)
      ws.removeEventListener('message', handleMessage)
      ws.removeEventListener('error', handleError)
      ws.removeEventListener('close', handleClose)
    }

    const finalize = (
      outcome: 'final' | 'fallback',
      trackerState?: CacaotrackerTxTrackerState,
    ) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      try {
        ws.close()
      } catch {
        // Ignore close failures.
      }

      if (outcome === 'final') {
        patchSwapJourneyTracking(manager, input.journeyId, {
          transportStatus: 'closed',
          trackerState,
          lastMessageType: 'tx_update',
        })
      } else {
        patchSwapJourneyTracking(manager, input.journeyId, {
          trackingSource: 'fallback',
          transportStatus: 'fallback',
          fallbackReason:
            manager
              .getState()
              .journeys.find((journey) => journey.id === input.journeyId)
              ?.swapTracking?.fallbackReason ??
            'Live tracker disconnected before a final protocol update arrived.',
        })
      }

      resolve(
        outcome === 'final'
          ? { outcome, trackerState }
          : { outcome },
      )
    }

    const handleOpen = () => {
      ws.send(createCacaotrackerTxTrackerSubscribeMessage([input.txHash!]))
    }

    const handleMessage = (event: unknown) => {
      const payload = parseCacaotrackerTxTrackerMessage(
        String((event as MessageEventLike).data ?? ''),
      )
      if (!payload) {
        return
      }

      if (payload.type === 'ready') {
        patchSwapJourneyTracking(manager, input.journeyId, {
          transportStatus: 'connecting',
          lastMessageType: payload.type,
          session: {
            expiresAt: session.expiresAt,
            heartbeatSeconds:
              payload.heartbeatSeconds ?? session.heartbeatSeconds,
          },
        })
        return
      }

      if (payload.type === 'subscribed') {
        const accepted = payload.accepted ?? []
        const rejected = payload.rejected ?? []
        patchSwapJourneyTracking(manager, input.journeyId, {
          transportStatus: accepted.includes(input.txHash!)
            ? 'subscribed'
            : 'fallback',
          acceptedTxHashes: accepted,
          rejectedTxHashes: rejected,
          lastMessageType: payload.type,
          ...(rejected.includes(input.txHash!)
            ? {
                trackingSource: 'fallback',
                fallbackReason:
                  'Live tracker rejected the submitted transaction hash.',
              }
            : {}),
        })
        if (!accepted.includes(input.txHash!)) {
          finalize('fallback')
        }
        return
      }

      if (payload.type === 'snapshot' || payload.type === 'tx_update') {
        patchSwapJourneyTracking(manager, input.journeyId, {
          trackingSource: 'cacaotracker-ws',
          transportStatus: payload.state.isFinal ? 'closed' : 'live',
          trackerState: payload.state,
          lastMessageType: payload.type,
        })

        if (payload.state.isFinal) {
          finalize('final', payload.state)
        }
      }
    }

    const handleError = () => {
      patchSwapJourneyTracking(manager, input.journeyId, {
        trackingSource: 'fallback',
        transportStatus: 'fallback',
        fallbackReason: 'Live tracker websocket returned an error.',
      })
      finalize('fallback')
    }

    const handleClose = () => {
      finalize('fallback')
    }

    ws.addEventListener('open', handleOpen)
    ws.addEventListener('message', handleMessage)
    ws.addEventListener('error', handleError)
    ws.addEventListener('close', handleClose)
  })
}

export function createJourneyStep(
  key: string,
  label: string,
  message?: string,
): WalletJourneyStep {
  return {
    key,
    label,
    status: 'pending',
    ...(message ? { message } : {}),
  }
}

export function createExecutionJourneySteps(input: {
  source: WalletJourneySource
  includeApproval?: boolean
  finalLabel?: string
}): WalletJourneyStep[] {
  const steps: WalletJourneyStep[] = [
    createJourneyStep('preparing', 'Preparing'),
  ]

  if (input.includeApproval) {
    steps.push(createJourneyStep('approval', 'Approval'))
  }

  if (input.source === 'extension') {
    steps.push(createJourneyStep('provider', 'Check Extension'))
  } else {
    steps.push(createJourneyStep('signing', 'Awaiting Device Approval'))
    steps.push(createJourneyStep('broadcasting', 'Broadcasting'))
  }

  if (input.source === 'extension') {
    steps.push(createJourneyStep('broadcasting', 'Broadcast Submitted'))
  }

  steps.push(createJourneyStep('confirming', 'Confirming On-Chain'))
  steps.push(createJourneyStep('complete', input.finalLabel ?? 'Complete'))

  return steps
}

export function createFastVaultJourneySteps(): WalletJourneyStep[] {
  return [
    createJourneyStep('creating', 'Creating Vault'),
    createJourneyStep('verification-sent', 'Verification Email Sent'),
    createJourneyStep('awaiting-code', 'Awaiting Code'),
  ]
}

export function createFastVaultImportJourneySteps(): WalletJourneyStep[] {
  return [
    createJourneyStep('decrypting-keystore', 'Decrypting Keystore'),
    createJourneyStep('validating-seed', 'Validating Seedphrase'),
    createJourneyStep('discovering-chains', 'Discovering Chains'),
    createJourneyStep('creating', 'Creating Vault'),
    createJourneyStep('verification-sent', 'Verification Email Sent'),
    createJourneyStep('awaiting-code', 'Awaiting Code'),
  ]
}

export function createFastVaultVerifyJourneySteps(): WalletJourneyStep[] {
  return [
    createJourneyStep('verifying', 'Verifying Code'),
    createJourneyStep('refreshing-session', 'Refreshing Session'),
    createJourneyStep('vault-ready', 'Vault Ready'),
  ]
}

export function createSecureVaultJourneySteps(): WalletJourneyStep[] {
  return [
    createJourneyStep('creating-session', 'Creating Session'),
    createJourneyStep('scan-qr', 'Scan QR'),
    createJourneyStep('devices-joined', 'Devices Joined'),
    createJourneyStep('keygen', 'Key Generation'),
    createJourneyStep('vault-ready', 'Vault Ready'),
  ]
}

export function getJourneySourceLabel(source?: WalletJourneySource): string {
  switch (source) {
    case 'sdk':
      return 'SDK vault'
    case 'extension':
      return 'Extension'
    case 'fast-vault':
      return 'Fast vault'
    case 'secure-vault':
      return 'Secure vault'
    default:
      return 'Wallet'
  }
}

export function getJourneyStatusTone(
  status: WalletJourneyStatus,
): 'neutral' | 'success' | 'error' | 'warning' {
  switch (status) {
    case 'success':
      return 'success'
    case 'error':
      return 'error'
    case 'attention':
    case 'unconfirmed':
    case 'submitted_no_hash':
      return 'warning'
    default:
      return 'neutral'
  }
}

function normalizeTxState(status: unknown): 'pending' | 'success' | 'error' {
  if (typeof status === 'object' && status !== null) {
    const record = status as Record<string, unknown>
    if (typeof record.status === 'string') {
      const normalized = record.status.toLowerCase()
      if (
        normalized === 'success' ||
        normalized === 'completed' ||
        normalized === 'confirmed' ||
        normalized === 'finalized' ||
        normalized === 'done'
      ) {
        return 'success'
      }
      if (
        normalized === 'error' ||
        normalized === 'failed' ||
        normalized === 'reverted'
      ) {
        return 'error'
      }
    }

    if (
      record.blockHash ||
      record.blockNumber ||
      record.block_height ||
      record.height ||
      (typeof record.confirmations === 'number' && record.confirmations > 0) ||
      (typeof record.confirmations === 'string' &&
        Number(record.confirmations) > 0)
    ) {
      return 'success'
    }

    if (typeof record.receipt === 'object' && record.receipt !== null) {
      const receipt = record.receipt as Record<string, unknown>
      if (
        receipt.blockHash ||
        receipt.blockNumber ||
        receipt.block_height ||
        receipt.height ||
        receipt.status === 1 ||
        receipt.status === '1' ||
        receipt.status === '0x1'
      ) {
        return 'success'
      }

      if (
        receipt.status === 0 ||
        receipt.status === '0' ||
        receipt.status === '0x0'
      ) {
        return 'error'
      }
    }

    if (
      record.status === 1 ||
      record.status === '1' ||
      record.status === '0x1'
    ) {
      return 'success'
    }

    if (
      record.status === 0 ||
      record.status === '0' ||
      record.status === '0x0'
    ) {
      return 'error'
    }
  }

  return 'pending'
}

export function getStepTone(
  status: WalletJourneyStepStatus,
): 'idle' | 'active' | 'success' | 'error' | 'warning' {
  switch (status) {
    case 'active':
      return 'active'
    case 'success':
      return 'success'
    case 'error':
    case 'cancelled':
      return 'error'
    case 'attention':
    case 'unconfirmed':
      return 'warning'
    default:
      return 'idle'
  }
}
