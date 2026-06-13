import { WalletChain as Chain } from '#/wallet/chain-types'
import type { WalletCommandMap, WalletSession } from './types'
import type { MayaWalletManager } from './manager'
import { resolveSigningRoute, type SigningRoute } from './signing-route'
import { WalletCapabilityError, WalletSessionNotFoundError } from './errors'

const CACAO_DECIMALS = 10
const CACAO_MEMO = 'POOL+'

export type CacaoPoolDepositInput = {
  amountBaseUnits: string
  journeyId?: string
  memo?: string
  sessionId?: string
}

export type CacaoPoolDepositResult = {
  route: SigningRoute
  txHash: string | null
  memo: string
  rawResult: unknown
}

export type CacaoPoolDepositSupport = {
  supported: boolean
  reason?: string
  source?: WalletSession['source']
  sessionId?: string
  address?: string
}

export function getCacaoPoolDepositSupport(
  manager: MayaWalletManager,
  sessionId?: string,
): CacaoPoolDepositSupport {
  const session = resolveSession(manager, sessionId)
  if (!session) {
    return {
      supported: false,
      reason: 'Connect a wallet session to deposit into CACAOPool.',
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
          reason: 'The connected extension session cannot submit MayaChain deposits.',
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
        reason: 'The active vault session cannot prepare MayaChain deposit transactions.',
        source: session.source,
        sessionId: session.id,
        address,
      }
}

export async function depositToCacaoPool(
  manager: MayaWalletManager,
  input: CacaoPoolDepositInput,
): Promise<CacaoPoolDepositResult> {
  if (!/^\d+$/.test(input.amountBaseUnits) || input.amountBaseUnits === '0') {
    throw new Error('Enter a valid CACAO amount to deposit.')
  }

  const session = resolveSession(manager, input.sessionId)
  if (!session) {
    throw new WalletSessionNotFoundError(input.sessionId ?? 'active')
  }

  const address = session.addresses[Chain.MayaChain]
  if (!address) {
    throw new Error('No MayaChain address is connected for the selected wallet session.')
  }

  const memo = input.memo ?? CACAO_MEMO

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
            amount: input.amountBaseUnits,
            decimals: CACAO_DECIMALS,
          },
          memo,
        },
      },
    })

    return {
      route: 'extension',
      txHash: extractTxHash(result.result),
      memo,
      rawResult: result.result,
    }
  }

  if (
    !manager.canExecute('tx.prepare.send', {
      sessionId: session.id,
      chain: Chain.MayaChain,
    })
  ) {
    throw new WalletCapabilityError(
      'tx.prepare.send',
      session.id,
      'MayaChain deposit preparation is unavailable for this vault session',
    )
  }

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
      amount: BigInt(input.amountBaseUnits),
      memo,
    },
  })

  const payload = prepared.payload as Record<string, unknown>
  payload.toAddress = ''
  payload.toAmount = input.amountBaseUnits
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
    route: resolveSigningRoute(session),
    txHash: broadcast.txHash ?? null,
    memo,
    rawResult: {
      payload: prepared.payload,
      txHash: broadcast.txHash,
    },
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
