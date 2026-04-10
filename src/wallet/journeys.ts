import { serializeWalletError } from './errors'
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
  }

  try {
    return await input.run(controller)
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
    const statusResult = await manager.execute('tx.status', {
      sessionId: input.sessionId,
      input: {
        chain: input.chain,
        txHash: input.txHash,
      },
      track: false,
    })

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
      if (normalized === 'success') {
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

    if (record.blockHash || record.blockNumber) {
      return 'success'
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
