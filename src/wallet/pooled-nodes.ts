import { Chain } from '@vultisig/sdk'
import type { WalletCommandMap, WalletSession } from './types'
import type { MayaWalletManager } from './manager'
import { WalletCapabilityError, WalletSessionNotFoundError } from './errors'

const CACAO_DECIMALS = 10
const MINIMUM_DEPOSIT_AMOUNT = '1'

export type PooledNodeActionKind =
  | 'provider.bond'
  | 'provider.unbond'
  | 'operator.add-provider'
  | 'operator.update-fee'
  | 'operator.remove-provider'

export type PooledNodeActionSupport = {
  supported: boolean
  reason?: string
  source?: WalletSession['source']
  sessionId?: string
  address?: string
}

export type SubmitPooledNodeActionInput = {
  action: PooledNodeActionKind
  amountBaseUnits: string
  journeyId?: string
  nodeAddress: string
  operatorFeeBps?: string
  providerAddress?: string
  sessionId?: string
}

export type PooledNodeActionResult = {
  action: PooledNodeActionKind
  memo: string
  rawResult: unknown
  route: 'extension' | 'sdk'
  txAmountBaseUnits: string
  txHash: string | null
}

export function getPooledNodeActionSupport(
  manager: MayaWalletManager,
  sessionId?: string,
): PooledNodeActionSupport {
  const session = resolveSession(manager, sessionId)
  if (!session) {
    return {
      supported: false,
      reason: 'Connect a wallet session to manage pooled nodes.',
    }
  }

  const address = session.addresses[Chain.MayaChain]
  if (!address) {
    return {
      supported: false,
      reason: 'Connect a MayaChain address for the active session.',
      source: session.source,
      sessionId: session.id,
    }
  }

  if (session.source === 'extension') {
    return manager.canExecute('tx.send', {
      sessionId: session.id,
      chain: Chain.MayaChain,
    })
      ? {
          supported: true,
          source: session.source,
          sessionId: session.id,
          address,
        }
      : {
          supported: false,
          reason: 'The connected extension session cannot submit MayaChain pooled-node deposits.',
          source: session.source,
          sessionId: session.id,
          address,
        }
  }

  const canPrepare =
    manager.canExecute('tx.prepare.send', {
      sessionId: session.id,
      chain: Chain.MayaChain,
    }) &&
    manager.canExecute('tx.sign', {
      sessionId: session.id,
      chain: Chain.MayaChain,
    }) &&
    manager.canExecute('tx.broadcast', {
      sessionId: session.id,
      chain: Chain.MayaChain,
    })

  return canPrepare
    ? {
        supported: true,
        source: session.source,
        sessionId: session.id,
        address,
      }
    : {
        supported: false,
        reason: 'The active vault session cannot prepare MayaChain pooled-node deposit transactions.',
        source: session.source,
        sessionId: session.id,
        address,
      }
}

export function buildPooledNodeMemo(
  input: Pick<
    SubmitPooledNodeActionInput,
    'action' | 'amountBaseUnits' | 'nodeAddress' | 'operatorFeeBps' | 'providerAddress'
  >,
): string {
  const nodeAddress = normalizeMayaAddress(input.nodeAddress, 'Node address')

  switch (input.action) {
    case 'provider.bond':
      return `BOND:${nodeAddress}`
    case 'provider.unbond':
      return `UNBOND:${nodeAddress}:${normalizeBaseUnitAmount(input.amountBaseUnits)}`
    case 'operator.add-provider':
      return `BOND:${nodeAddress}:${normalizeMayaAddress(
        input.providerAddress,
        'Bond provider address',
      )}:${normalizeOperatorFeeBps(input.operatorFeeBps)}`
    case 'operator.update-fee':
      return `BOND:${nodeAddress}::${normalizeOperatorFeeBps(input.operatorFeeBps)}`
    case 'operator.remove-provider':
      return `UNBOND:${nodeAddress}:${normalizeBaseUnitAmount(
        input.amountBaseUnits,
      )}:${normalizeMayaAddress(input.providerAddress, 'Bond provider address')}`
  }
}

export async function submitPooledNodeAction(
  manager: MayaWalletManager,
  input: SubmitPooledNodeActionInput,
): Promise<PooledNodeActionResult> {
  const session = resolveSession(manager, input.sessionId)
  if (!session) {
    throw new WalletSessionNotFoundError(input.sessionId ?? 'active')
  }

  const address = session.addresses[Chain.MayaChain]
  if (!address) {
    throw new Error('No MayaChain address is connected for the selected wallet session.')
  }

  const memo = buildPooledNodeMemo(input)
  const txAmountBaseUnits = resolveTxAmountBaseUnits(input)

  if (session.source === 'extension') {
    const result = await manager.execute('tx.send', {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: 'provider' } }
        : {}),
      input: {
        chain: Chain.MayaChain,
        mode: 'deposit',
        transaction: {
          from: address,
          asset: {
            chain: Chain.MayaChain,
            ticker: 'cacao',
          },
          amount: {
            amount: txAmountBaseUnits,
            decimals: CACAO_DECIMALS,
          },
          memo,
        },
      },
    })

    return {
      action: input.action,
      route: 'extension',
      txHash: extractTxHash(result.result),
      memo,
      rawResult: result.result,
      txAmountBaseUnits,
    }
  }

  ensureMayaDepositSupport(manager, session.id)

  const prepared = await manager.execute('tx.prepare.send', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'preparing' } }
      : {}),
    input: {
      coin: {
        chain: Chain.MayaChain,
        address,
        decimals: CACAO_DECIMALS,
        ticker: 'CACAO',
        isNativeToken: true,
      },
      receiver: address,
      amount: BigInt(txAmountBaseUnits),
      memo,
    },
  })

  const payload = prepared.payload as Record<string, unknown>
  payload.toAddress = ''
  payload.toAmount = txAmountBaseUnits
  payload.memo = memo
  payload.blockchainSpecific = {
    case: 'mayaSpecific',
    value: {
      ...extractMayaSpecific(payload.blockchainSpecific),
      isDeposit: true,
    },
  }

  const signature = await manager.execute('tx.sign', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'signing' } }
      : {}),
    input: {
      payload: prepared.payload,
      chain: Chain.MayaChain,
    },
  })

  const broadcast = await manager.execute('tx.broadcast', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'broadcasting' } }
      : {}),
    input: {
      chain: Chain.MayaChain,
      payload: prepared.payload,
      signature: signature.signature,
    },
  })

  return {
    action: input.action,
    route: 'sdk',
    txHash: broadcast.txHash ?? null,
    memo,
    rawResult: {
      payload: prepared.payload,
      txHash: broadcast.txHash,
    },
    txAmountBaseUnits,
  }
}

function resolveTxAmountBaseUnits(input: SubmitPooledNodeActionInput): string {
  switch (input.action) {
    case 'provider.bond':
    case 'operator.add-provider':
    case 'operator.update-fee':
      return normalizeBaseUnitAmount(input.amountBaseUnits)
    case 'provider.unbond':
    case 'operator.remove-provider':
      normalizeBaseUnitAmount(input.amountBaseUnits)
      return MINIMUM_DEPOSIT_AMOUNT
  }
}

function resolveSession(
  manager: MayaWalletManager,
  sessionId?: string,
): WalletSession | null {
  const state = manager.getState()
  const resolvedId = sessionId ?? state.activeSessionId
  if (!resolvedId) {
    return null
  }

  return state.sessions.find((candidate) => candidate.id === resolvedId) ?? null
}

function ensureMayaDepositSupport(
  manager: MayaWalletManager,
  sessionId: string,
): void {
  if (
    !manager.canExecute('tx.prepare.send', {
      sessionId,
      chain: Chain.MayaChain,
    }) ||
    !manager.canExecute('tx.sign', {
      sessionId,
      chain: Chain.MayaChain,
    }) ||
    !manager.canExecute('tx.broadcast', {
      sessionId,
      chain: Chain.MayaChain,
    })
  ) {
    throw new WalletCapabilityError(
      'tx.prepare.send',
      sessionId,
      'MayaChain pooled-node deposit preparation is unavailable for this vault session',
    )
  }
}

function normalizeBaseUnitAmount(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  if (!/^\d+$/.test(normalized) || normalized === '0') {
    throw new Error('Enter a valid positive on-chain amount.')
  }
  return normalized
}

function normalizeMayaAddress(value: string | undefined, label: string): string {
  const normalized = value?.trim() ?? ''
  if (!/^maya[0-9a-z]+$/i.test(normalized)) {
    throw new Error(`${label} must be a valid MAYAChain address.`)
  }
  return normalized
}

function normalizeOperatorFeeBps(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Operator fee must be a whole-number basis points value.')
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error('Operator fee basis points must be between 0 and 10000.')
  }

  return normalized
}

function extractTxHash(
  result: WalletCommandMap['tx.send']['output']['result'],
): string | null {
  if (typeof result === 'string') {
    return result
  }

  if (typeof result === 'object' && result !== null) {
    const record = result as Record<string, unknown>
    if (typeof record.txHash === 'string') {
      return record.txHash
    }
    if (typeof record.hash === 'string') {
      return record.hash
    }
  }

  return null
}

function extractMayaSpecific(blockchainSpecific: unknown): {
  accountNumber?: bigint
  sequence?: bigint
} {
  if (
    typeof blockchainSpecific === 'object' &&
    blockchainSpecific !== null &&
    'case' in blockchainSpecific &&
    'value' in blockchainSpecific &&
    (blockchainSpecific as { case?: unknown }).case === 'mayaSpecific'
  ) {
    const value = (blockchainSpecific as { value?: unknown }).value
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>
      return {
        accountNumber:
          typeof record.accountNumber === 'bigint'
            ? record.accountNumber
            : undefined,
        sequence:
          typeof record.sequence === 'bigint' ? record.sequence : undefined,
      }
    }
  }

  return {}
}
