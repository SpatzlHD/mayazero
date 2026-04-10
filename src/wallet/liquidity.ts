import { Chain } from '@vultisig/sdk'
import type {
  LiquidityActionAvailability,
  LiquidityDepositMode,
  LiquidityPool,
  LiquidityWithdrawMode,
} from '#/lib/liquidity'
import { shortenMayaAssetDenominator } from '#/lib/maya-asset-shorthand'
import type { WalletCommandMap, WalletSession } from './types'
import type { MayaWalletManager } from './manager'
import { WalletCapabilityError, WalletSessionNotFoundError } from './errors'

const CACAO_DECIMALS = 10
const MAX_LIQUIDITY_AFFILIATE_BPS = 1000

export type LiquidityDepositAffiliate = {
  affiliateBps: string
  affiliateName?: string
}

export type LiquidityDepositStep = {
  amountBaseUnits: string
  chain: Chain
  decimals: number
  destinationAddress: string | null
  id: 'asset' | 'cacao'
  memo: string
  sourceAddress: string
  ticker: string
  tokenId?: string
  type: 'send' | 'deposit'
}

export type LiquidityDepositPreparation = {
  steps: LiquidityDepositStep[]
}

export type LiquidityDepositSupport = {
  reason?: string
  sessionId?: string
  source?: WalletSession['source']
  supported: boolean
}

export type LiquidityStepSubmissionResult = {
  memo: string
  rawResult: unknown
  route: 'extension' | 'sdk'
  stepId: LiquidityDepositStep['id']
  txHash: string | null
}

export type LiquidityWithdrawSupport = LiquidityDepositSupport

export type LiquidityWithdrawResult = LiquidityStepSubmissionResult

export function getLiquidityDepositSupport(
  manager: MayaWalletManager,
  input: {
    pool: LiquidityPool | null
    mode: LiquidityDepositMode
    sessionId?: string
  },
): LiquidityDepositSupport {
  const session = resolveSession(manager, input.sessionId)
  if (!session) {
    return {
      supported: false,
      reason: 'Connect a wallet session to manage liquidity.',
    }
  }

  if (!input.pool) {
    return {
      supported: false,
      reason: 'Select a liquidity pool.',
      sessionId: session.id,
      source: session.source,
    }
  }

  const mayaAddress = session.addresses[Chain.MayaChain]
  const assetAddress = input.pool.walletChain
    ? session.addresses[input.pool.walletChain]
    : undefined

  if (input.mode !== 'asset' && !mayaAddress) {
    return {
      supported: false,
      reason: 'Connect a MayaChain address for the active session.',
      sessionId: session.id,
      source: session.source,
    }
  }

  if (input.mode !== 'cacao' && input.pool.walletChain && !assetAddress) {
    return {
      supported: false,
      reason: `Connect a ${input.pool.chainName} address for the selected pool.`,
      sessionId: session.id,
      source: session.source,
    }
  }

  if (input.mode !== 'asset') {
    const mayaSupport = canSubmitLiquidityForChain(manager, session, Chain.MayaChain)
    if (!mayaSupport) {
      return {
        supported: false,
        reason:
          session.source === 'extension'
            ? 'The connected extension session cannot submit MayaChain liquidity transactions.'
            : 'The active vault session cannot prepare MayaChain liquidity transactions.',
        sessionId: session.id,
        source: session.source,
      }
    }
  }

  if (input.mode !== 'cacao' && input.pool.walletChain) {
    const assetSupport = canSubmitLiquidityForChain(manager, session, input.pool.walletChain)
    if (!assetSupport) {
      return {
        supported: false,
        reason:
          session.source === 'extension'
            ? `The connected extension session cannot submit ${input.pool.chainName} liquidity transactions.`
            : `The active vault session cannot prepare ${input.pool.chainName} liquidity transactions.`,
        sessionId: session.id,
        source: session.source,
      }
    }
  }

  return {
    supported: true,
    sessionId: session.id,
    source: session.source,
  }
}

export function prepareLiquidityDepositSteps(
  manager: MayaWalletManager,
  input: {
    affiliate?: LiquidityDepositAffiliate
    assetAmountBaseUnits?: string | null
    cacaoAmountBaseUnits?: string | null
    mode: LiquidityDepositMode
    pool: LiquidityPool
    sessionId?: string
  },
): LiquidityDepositPreparation {
  const session = resolveRequiredSession(manager, input.sessionId)
  const mayaAddress = session.addresses[Chain.MayaChain]
  const assetChain = input.pool.walletChain
  const assetAddress = assetChain ? session.addresses[assetChain] : undefined
  const steps: LiquidityDepositStep[] = []
  const memoPoolAsset = shortenMayaAssetDenominator(input.pool.asset)
  const affiliate = normalizeLiquidityDepositAffiliate(input.affiliate)

  if (input.mode !== 'asset' && !mayaAddress) {
    throw new Error('No MayaChain address is connected for the selected wallet session.')
  }

  if (input.mode !== 'cacao') {
    if (!assetChain || !assetAddress) {
      throw new Error(`No ${input.pool.chainName} address is connected for the selected wallet session.`)
    }
    if (!input.pool.actionAvailability?.inboundAddress) {
      throw new Error('No inbound address is available for the selected pool chain.')
    }
    if (!isPositiveBaseUnitAmount(input.assetAmountBaseUnits)) {
      throw new Error(`Enter a valid ${input.pool.symbol} amount to deposit.`)
    }
  }

  if (input.mode !== 'asset' && !isPositiveBaseUnitAmount(input.cacaoAmountBaseUnits)) {
    throw new Error('Enter a valid CACAO amount to deposit.')
  }

  if (input.mode !== 'cacao' && assetChain && assetAddress) {
    steps.push({
      amountBaseUnits: input.assetAmountBaseUnits!,
      chain: assetChain,
      decimals: input.pool.decimals,
      destinationAddress: input.pool.actionAvailability!.inboundAddress,
      id: 'asset',
      memo: buildLiquidityAddMemo({
        affiliate,
        memoPoolAsset,
        pairedAddress: input.mode === 'symmetric' ? mayaAddress : undefined,
      }),
      sourceAddress: assetAddress,
      ticker: input.pool.symbol,
      tokenId: input.pool.tokenId,
      type: 'send',
    })
  }

  if (input.mode !== 'asset' && mayaAddress) {
    steps.push({
      amountBaseUnits: input.cacaoAmountBaseUnits!,
      chain: Chain.MayaChain,
      decimals: CACAO_DECIMALS,
      destinationAddress: null,
      id: 'cacao',
      memo: buildLiquidityAddMemo({
        affiliate,
        memoPoolAsset,
        pairedAddress: input.mode === 'symmetric' ? assetAddress : undefined,
      }),
      sourceAddress: mayaAddress,
      ticker: 'CACAO',
      type: 'deposit',
    })
  }

  return { steps }
}

export async function submitLiquidityDepositStep(
  manager: MayaWalletManager,
  input: {
    journeyId?: string
    sessionId?: string
    step: LiquidityDepositStep
  },
): Promise<LiquidityStepSubmissionResult> {
  return submitLiquidityStep(manager, input)
}

export function getLiquidityWithdrawSupport(
  manager: MayaWalletManager,
  input: {
    mode: LiquidityWithdrawMode
    pool: LiquidityPool | null
    sessionId?: string
  },
): LiquidityWithdrawSupport {
  return getLiquidityDepositSupport(manager, {
    pool: input.pool,
    mode: input.mode,
    sessionId: input.sessionId,
  })
}

export async function submitLiquidityWithdraw(
  manager: MayaWalletManager,
  input: {
    basisPoints: number
    journeyId?: string
    mode: LiquidityWithdrawMode
    pool: LiquidityPool
    sessionId?: string
  },
): Promise<LiquidityWithdrawResult> {
  if (!Number.isInteger(input.basisPoints) || input.basisPoints <= 0 || input.basisPoints > 10_000) {
    throw new Error('Select a valid withdrawal percentage.')
  }

  const session = resolveRequiredSession(manager, input.sessionId)
  const mayaAddress = session.addresses[Chain.MayaChain]
  const assetChain = input.pool.walletChain
  const assetAddress = assetChain ? session.addresses[assetChain] : undefined
  const memoPoolAsset = shortenMayaAssetDenominator(input.pool.asset)
  const memo =
    input.mode === 'asset'
      ? `WD:${memoPoolAsset}:${input.basisPoints}:${memoPoolAsset}`
      : input.mode === 'cacao'
        ? `WD:${memoPoolAsset}:${input.basisPoints}:${shortenMayaAssetDenominator('MAYA.CACAO')}`
        : `WD:${memoPoolAsset}:${input.basisPoints}`

  if (input.mode === 'asset') {
    if (!assetChain || !assetAddress) {
      throw new Error(`No ${input.pool.chainName} address is connected for the selected wallet session.`)
    }
    if (!input.pool.actionAvailability?.inboundAddress) {
      throw new Error('No inbound address is available for the selected pool chain.')
    }

    return submitLiquidityStep(manager, {
      sessionId: session.id,
      journeyId: input.journeyId,
      step: {
        amountBaseUnits: resolveMinimumMemoAmount(input.pool.actionAvailability, input.pool.chainTicker),
        chain: assetChain,
        decimals: input.pool.decimals,
        destinationAddress: input.pool.actionAvailability.inboundAddress,
        id: 'asset',
        memo,
        sourceAddress: assetAddress,
        ticker: input.pool.symbol,
        tokenId: input.pool.tokenId,
        type: 'send',
      },
    })
  }

  if (!mayaAddress) {
    throw new Error('No MayaChain address is connected for the selected wallet session.')
  }

  return submitLiquidityStep(manager, {
    sessionId: session.id,
    journeyId: input.journeyId,
    step: {
      amountBaseUnits: resolveMinimumMemoAmount(null, 'MAYA'),
      chain: Chain.MayaChain,
      decimals: CACAO_DECIMALS,
      destinationAddress: null,
      id: 'cacao',
      memo,
      sourceAddress: mayaAddress,
      ticker: 'CACAO',
      type: 'deposit',
    },
  })
}

function resolveRequiredSession(
  manager: MayaWalletManager,
  sessionId?: string,
): WalletSession {
  const session = resolveSession(manager, sessionId)
  if (!session) {
    throw new WalletSessionNotFoundError(sessionId ?? 'active')
  }
  return session
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

async function submitLiquidityStep(
  manager: MayaWalletManager,
  input: {
    journeyId?: string
    sessionId?: string
    step: LiquidityDepositStep
  },
): Promise<LiquidityStepSubmissionResult> {
  const session = resolveRequiredSession(manager, input.sessionId)
  const step = input.step

  if (step.type === 'deposit') {
    return submitMayaDepositMemo(manager, session, step, input.journeyId)
  }

  return submitStandardMemoSend(manager, session, step, input.journeyId)
}

async function submitStandardMemoSend(
  manager: MayaWalletManager,
  session: WalletSession,
  step: LiquidityDepositStep,
  journeyId?: string,
): Promise<LiquidityStepSubmissionResult> {
  if (!step.destinationAddress) {
    throw new Error('No destination address is available for the selected liquidity action.')
  }

  if (session.source === 'extension') {
    const result = await manager.execute('tx.send', {
      sessionId: session.id,
      ...(journeyId
        ? { journey: { id: journeyId, stepKey: 'provider' } }
        : {}),
      input: {
        chain: step.chain,
        transaction: {
          amount: {
            amount: step.amountBaseUnits,
            decimals: step.decimals,
          },
          asset: {
            chain: step.chain,
            ticker: step.ticker.toLowerCase(),
            ...(step.tokenId ? { id: step.tokenId } : {}),
          },
          from: step.sourceAddress,
          memo: step.memo,
          to: step.destinationAddress,
        },
      },
    })

    return {
      memo: step.memo,
      rawResult: result.result,
      route: 'extension',
      stepId: step.id,
      txHash: extractTxHash(result.result),
    }
  }

  ensureSdkSendSupport(manager, session.id, step.chain)

  const prepared = await manager.execute('tx.prepare.send', {
    sessionId: session.id,
    ...(journeyId
      ? { journey: { id: journeyId, stepKey: 'preparing' } }
      : {}),
    input: {
      amount: BigInt(step.amountBaseUnits),
      coin: {
        address: step.sourceAddress,
        chain: step.chain,
        contractAddress: step.tokenId,
        decimals: step.decimals,
        isNativeToken: !step.tokenId,
        ticker: step.ticker,
      },
      memo: step.memo,
      receiver: step.destinationAddress,
    },
  })

  const signature = await manager.execute('tx.sign', {
    sessionId: session.id,
    ...(journeyId
      ? { journey: { id: journeyId, stepKey: 'signing' } }
      : {}),
    input: {
      chain: step.chain,
      payload: prepared.payload,
    },
  })

  const broadcast = await manager.execute('tx.broadcast', {
    sessionId: session.id,
    ...(journeyId
      ? { journey: { id: journeyId, stepKey: 'broadcasting' } }
      : {}),
    input: {
      chain: step.chain,
      payload: prepared.payload,
      signature: signature.signature,
    },
  })

  return {
    memo: step.memo,
    rawResult: {
      payload: prepared.payload,
      txHash: broadcast.txHash,
    },
    route: 'sdk',
    stepId: step.id,
    txHash: broadcast.txHash ?? null,
  }
}

function buildLiquidityAddMemo(input: {
  affiliate: Required<LiquidityDepositAffiliate> | null
  memoPoolAsset: string
  pairedAddress?: string
}): string {
  const base = input.pairedAddress
    ? `ADD:${input.memoPoolAsset}:${input.pairedAddress}`
    : `ADD:${input.memoPoolAsset}`

  if (!input.affiliate) {
    return base
  }

  return input.pairedAddress
    ? `${base}:${input.affiliate.affiliateName}:${input.affiliate.affiliateBps}`
    : `${base}::${input.affiliate.affiliateName}:${input.affiliate.affiliateBps}`
}

async function submitMayaDepositMemo(
  manager: MayaWalletManager,
  session: WalletSession,
  step: LiquidityDepositStep,
  journeyId?: string,
): Promise<LiquidityStepSubmissionResult> {
  if (session.source === 'extension') {
    const result = await manager.execute('tx.send', {
      sessionId: session.id,
      ...(journeyId
        ? { journey: { id: journeyId, stepKey: 'provider' } }
        : {}),
      input: {
        chain: Chain.MayaChain,
        mode: 'deposit',
        transaction: {
          amount: {
            amount: step.amountBaseUnits,
            decimals: step.decimals,
          },
          asset: {
            chain: Chain.MayaChain,
            ticker: 'cacao',
          },
          from: step.sourceAddress,
          memo: step.memo,
        },
      },
    })

    return {
      memo: step.memo,
      rawResult: result.result,
      route: 'extension',
      stepId: step.id,
      txHash: extractTxHash(result.result),
    }
  }

  ensureSdkSendSupport(manager, session.id, Chain.MayaChain)

  const prepared = await manager.execute('tx.prepare.send', {
    sessionId: session.id,
    ...(journeyId
      ? { journey: { id: journeyId, stepKey: 'preparing' } }
      : {}),
    input: {
      amount: BigInt(step.amountBaseUnits),
      coin: {
        address: step.sourceAddress,
        chain: Chain.MayaChain,
        decimals: CACAO_DECIMALS,
        isNativeToken: true,
        ticker: 'CACAO',
      },
      memo: step.memo,
      receiver: step.sourceAddress,
    },
  })

  const payload = prepared.payload as Record<string, unknown>
  payload.toAddress = ''
  payload.toAmount = step.amountBaseUnits
  payload.memo = step.memo
  payload.blockchainSpecific = {
    case: 'mayaSpecific',
    value: {
      ...extractMayaSpecific(payload.blockchainSpecific),
      isDeposit: true,
    },
  }

  const signature = await manager.execute('tx.sign', {
    sessionId: session.id,
    ...(journeyId
      ? { journey: { id: journeyId, stepKey: 'signing' } }
      : {}),
    input: {
      chain: Chain.MayaChain,
      payload: prepared.payload,
    },
  })

  const broadcast = await manager.execute('tx.broadcast', {
    sessionId: session.id,
    ...(journeyId
      ? { journey: { id: journeyId, stepKey: 'broadcasting' } }
      : {}),
    input: {
      chain: Chain.MayaChain,
      payload: prepared.payload,
      signature: signature.signature,
    },
  })

  return {
    memo: step.memo,
    rawResult: {
      payload: prepared.payload,
      txHash: broadcast.txHash,
    },
    route: 'sdk',
    stepId: step.id,
    txHash: broadcast.txHash ?? null,
  }
}

function ensureSdkSendSupport(
  manager: MayaWalletManager,
  sessionId: string,
  chain: Chain,
): void {
  if (
    !manager.canExecute('tx.prepare.send', {
      sessionId,
      chain,
    }) ||
    !manager.canExecute('tx.sign', {
      sessionId,
      chain,
    }) ||
    !manager.canExecute('tx.broadcast', {
      sessionId,
      chain,
    })
  ) {
    throw new WalletCapabilityError(
      'tx.prepare.send',
      sessionId,
      'The active vault session cannot prepare the requested liquidity transaction.',
    )
  }
}

function canSubmitLiquidityForChain(
  manager: MayaWalletManager,
  session: WalletSession,
  chain: Chain,
): boolean {
  if (session.source === 'extension') {
    return manager.canExecute('tx.send', {
      sessionId: session.id,
      chain,
    })
  }

  return (
    manager.canExecute('tx.prepare.send', {
      sessionId: session.id,
      chain,
    }) &&
    manager.canExecute('tx.sign', {
      sessionId: session.id,
      chain,
    }) &&
    manager.canExecute('tx.broadcast', {
      sessionId: session.id,
      chain,
    })
  )
}

function resolveMinimumMemoAmount(
  availability: LiquidityActionAvailability | null,
  chainTicker: string,
): string {
  const normalized = chainTicker.toUpperCase()

  if (normalized === 'MAYA') {
    return '1'
  }

  if (normalized === 'BTC' || normalized === 'DASH' || normalized === 'ZEC') {
    return '10001'
  }

  if (normalized === 'ETH' || normalized === 'ARB') {
    return '10000000000'
  }

  if (normalized === 'KUJI' || normalized === 'THOR') {
    return '1'
  }

  const dustThreshold = availability?.dustThreshold ?? '0'
  if (/^\d+$/.test(dustThreshold) && dustThreshold !== '0') {
    return dustThreshold
  }

  return '1'
}

function isPositiveBaseUnitAmount(value: string | null | undefined): value is string {
  return Boolean(value && /^\d+$/.test(value) && value !== '0')
}

function normalizeLiquidityDepositAffiliate(
  affiliate: LiquidityDepositAffiliate | undefined,
): Required<LiquidityDepositAffiliate> | null {
  const affiliateName = affiliate?.affiliateName?.trim()
  const affiliateBps = affiliate?.affiliateBps?.trim()

  if (!affiliateName) {
    return null
  }

  if (!affiliateBps || !/^\d+$/.test(affiliateBps)) {
    throw new Error('Liquidity affiliate basis points must be a whole number.')
  }

  if (Number(affiliateBps) > MAX_LIQUIDITY_AFFILIATE_BPS) {
    throw new Error(`Liquidity affiliate basis points must be between 0 and ${MAX_LIQUIDITY_AFFILIATE_BPS}.`)
  }

  return {
    affiliateName,
    affiliateBps,
  }
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
