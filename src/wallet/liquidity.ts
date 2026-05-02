import { Chain, type Signature } from '@vultisig/sdk'
import {
  type Address,
  type Hex,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  serializeTransaction,
} from 'viem'
import { arbitrum, base, mainnet } from 'viem/chains'
import type {
  LiquidityActionAvailability,
  LiquidityDepositMode,
  LiquidityPool,
  LiquidityPosition,
  LiquidityWithdrawMode,
} from '#/lib/liquidity'
import { normalizeEvmAddress } from '#/lib/evm-address'
import { shortenMayaAssetDenominator } from '#/lib/maya-asset-shorthand'
import type { WalletChain, WalletCommandMap, WalletSession } from './types'
import type { MayaWalletManager } from './manager'
import { WalletCapabilityError, WalletSessionNotFoundError } from './errors'

const CACAO_DECIMALS = 10
const MAX_LIQUIDITY_AFFILIATE_BPS = 1000
const APPROVAL_TIMEOUT_MS = 180_000
const APPROVAL_POLL_INTERVAL_MS = 2_500
const ROUTER_EXPIRY_WINDOW_SECONDS = 60 * 60

const mayaRouterAbi = [
  {
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'memo', type: 'string' },
      { name: 'expiration', type: 'uint256' },
    ],
    name: 'depositWithExpiry',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

type EvmPublicClientLike = {
  estimateFeesPerGas: (params?: { type?: 'eip1559' }) => Promise<{
    maxFeePerGas?: bigint
    maxPriorityFeePerGas?: bigint
  }>
  getGasPrice: () => Promise<bigint>
  getTransactionCount: (params: {
    address: Address
    blockTag?: 'pending'
  }) => Promise<number>
  estimateGas: (params: {
    account: Address
    to: Address
    data?: Hex
    value?: bigint
  }) => Promise<bigint>
  readContract: (params: {
    address: Address
    abi: typeof erc20Abi
    functionName: 'allowance'
    args: readonly [Address, Address]
  }) => Promise<bigint>
}

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
  router?: string
  sourceAddress: string
  ticker: string
  tokenId?: string
  type: 'send' | 'deposit' | 'erc20-router'
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
    const router = shouldUseLiquidityRouterStep(input.pool) ? input.pool.actionAvailability?.router : undefined
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
      ...(router ? { router } : {}),
      sourceAddress: assetAddress,
      ticker: input.pool.symbol,
      tokenId: input.pool.tokenId,
      type: router ? 'erc20-router' : 'send',
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
    evmClientFactory?: (chain: WalletChain) => EvmPublicClientLike
    journeyId?: string
    maxWaitMs?: number
    now?: () => number
    sessionId?: string
    sleep?: (ms: number) => Promise<void>
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
    position?: LiquidityPosition | null
    sessionId?: string
  },
): LiquidityWithdrawSupport {
  const pendingCancelMode = resolvePendingLiquidityCancelMode(input.position)
  const support = getLiquidityDepositSupport(manager, {
    pool: input.pool,
    mode: pendingCancelMode ?? input.mode,
    sessionId: input.sessionId,
  })

  if (!support.supported || pendingCancelMode !== 'asset') {
    return support
  }

  const session = resolveSession(manager, input.sessionId)
  if (session?.addresses[Chain.MayaChain]) {
    return support
  }

  return {
    ...support,
    supported: false,
    reason: 'Connect a MayaChain address for pending LP cancellation on the selected pool.',
  }
}

export async function submitLiquidityWithdraw(
  manager: MayaWalletManager,
  input: {
    basisPoints: number
    evmClientFactory?: (chain: WalletChain) => EvmPublicClientLike
    journeyId?: string
    maxWaitMs?: number
    mode: LiquidityWithdrawMode
    now?: () => number
    pool: LiquidityPool
    position?: LiquidityPosition | null
    sessionId?: string
    sleep?: (ms: number) => Promise<void>
  },
): Promise<LiquidityWithdrawResult> {
  const pendingCancelMode = resolvePendingLiquidityCancelMode(input.position)
  const basisPoints = pendingCancelMode ? 10_000 : input.basisPoints

  if (
    !pendingCancelMode &&
    (!Number.isInteger(input.basisPoints) || input.basisPoints <= 0 || input.basisPoints > 10_000)
  ) {
    throw new Error('Select a valid withdrawal percentage.')
  }

  const session = resolveRequiredSession(manager, input.sessionId)
  const mayaAddress = session.addresses[Chain.MayaChain]
  const assetChain = input.pool.walletChain
  const assetAddress = assetChain ? session.addresses[assetChain] : undefined
  const memoPoolAsset = shortenMayaAssetDenominator(input.pool.asset)
  const memo = pendingCancelMode
    ? buildPendingLiquidityCancelMemo({
        basisPoints,
        memoPoolAsset,
        mode: pendingCancelMode,
        pairedMayaAddress: mayaAddress,
      })
    : input.mode === 'asset'
      ? `WD:${memoPoolAsset}:${basisPoints}:${memoPoolAsset}`
      : input.mode === 'cacao'
        ? `WD:${memoPoolAsset}:${basisPoints}:${shortenMayaAssetDenominator('MAYA.CACAO')}`
        : `WD:${memoPoolAsset}:${basisPoints}`

  if ((pendingCancelMode ?? input.mode) === 'asset') {
    if (!assetChain || !assetAddress) {
      throw new Error(`No ${input.pool.chainName} address is connected for the selected wallet session.`)
    }
    if (!input.pool.actionAvailability?.inboundAddress) {
      throw new Error('No inbound address is available for the selected pool chain.')
    }

    return submitLiquidityStep(manager, {
      evmClientFactory: input.evmClientFactory,
      sessionId: session.id,
      journeyId: input.journeyId,
      maxWaitMs: input.maxWaitMs,
      now: input.now,
      sleep: input.sleep,
      step: {
        amountBaseUnits: resolveMinimumMemoAmount(
          input.pool.actionAvailability,
          input.pool.chainTicker,
          input.pool.tokenId,
        ),
        chain: assetChain,
        decimals: input.pool.decimals,
        destinationAddress: input.pool.actionAvailability.inboundAddress,
        id: 'asset',
        memo,
        ...(shouldUseLiquidityRouterStep(input.pool)
          ? { router: input.pool.actionAvailability.router }
          : {}),
        sourceAddress: assetAddress,
        ticker: input.pool.symbol,
        tokenId: input.pool.tokenId,
        type: shouldUseLiquidityRouterStep(input.pool) ? 'erc20-router' : 'send',
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
    evmClientFactory?: (chain: WalletChain) => EvmPublicClientLike
    journeyId?: string
    maxWaitMs?: number
    now?: () => number
    sessionId?: string
    sleep?: (ms: number) => Promise<void>
    step: LiquidityDepositStep
  },
): Promise<LiquidityStepSubmissionResult> {
  const session = resolveRequiredSession(manager, input.sessionId)
  const step = input.step

  if (step.type === 'deposit') {
    return submitMayaDepositMemo(manager, session, step, input.journeyId)
  }

  if (step.type === 'erc20-router') {
    return submitErc20RouterMemoSend(manager, session, step, {
      evmClientFactory: input.evmClientFactory,
      journeyId: input.journeyId,
      maxWaitMs: input.maxWaitMs,
      now: input.now,
      sleep: input.sleep,
    })
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

async function submitErc20RouterMemoSend(
  manager: MayaWalletManager,
  session: WalletSession,
  step: LiquidityDepositStep,
  input: {
    evmClientFactory?: (chain: WalletChain) => EvmPublicClientLike
    journeyId?: string
    maxWaitMs?: number
    now?: () => number
    sleep?: (ms: number) => Promise<void>
  },
): Promise<LiquidityStepSubmissionResult> {
  if (!step.destinationAddress) {
    throw new Error('No destination address is available for the selected liquidity action.')
  }
  if (!step.tokenId) {
    throw new Error('ERC-20 router liquidity steps require a token contract address.')
  }
  if (!step.router) {
    throw new Error('No router is available for the selected ERC-20 liquidity action.')
  }
  if (!isEvmChain(step.chain)) {
    throw new Error(`Unsupported chain for ERC-20 router liquidity step: ${step.chain}`)
  }

  const amount = BigInt(step.amountBaseUnits)
  const normalizedTokenAddress = normalizeEvmAddress(step.tokenId)
  const normalizedRouterAddress = normalizeEvmAddress(step.router)
  const normalizedInboundAddress = normalizeEvmAddress(step.destinationAddress)
  const routerData = encodeFunctionData({
    abi: mayaRouterAbi,
    functionName: 'depositWithExpiry',
    args: [
      normalizedInboundAddress,
      normalizedTokenAddress,
      amount,
      step.memo,
      BigInt(Math.floor((input.now?.() ?? Date.now()) / 1000) + ROUTER_EXPIRY_WINDOW_SECONDS),
    ],
  })

  if (session.source === 'extension') {
    await ensureExtensionChain(manager, session, step.chain)
    const approvalAmounts = await resolveExtensionApprovalAmounts(manager, {
      owner: step.sourceAddress,
      router: normalizedRouterAddress,
      sessionId: session.id,
      token: normalizedTokenAddress,
      chain: step.chain,
      targetAmount: amount,
    })
    const approvalResults: unknown[] = []

    for (const approvalAmount of approvalAmounts) {
      const approval = await manager.execute('tx.send', {
        sessionId: session.id,
        ...(input.journeyId
          ? { journey: { id: input.journeyId, stepKey: 'approval' } }
          : {}),
        input: {
          chain: step.chain,
          transaction: {
            data: buildErc20ApprovalData(normalizedRouterAddress, approvalAmount),
            from: step.sourceAddress,
            to: normalizedTokenAddress,
            value: '0x0',
          },
        },
      })
      const approvalTxHash = extractTxHash(approval.result)
      if (!approvalTxHash) {
        throw new Error('Approval transaction did not return a hash.')
      }

      approvalResults.push(approval.result)
      await waitForTransactionConfirmation(manager, {
        chain: step.chain,
        sessionId: session.id,
        sleep: input.sleep,
        txHash: approvalTxHash,
        intervalMs: APPROVAL_POLL_INTERVAL_MS,
        maxWaitMs: input.maxWaitMs ?? APPROVAL_TIMEOUT_MS,
      })
    }

    const swap = await manager.execute('tx.send', {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: 'provider' } }
        : {}),
      input: {
        chain: step.chain,
        transaction: {
          data: routerData,
          from: step.sourceAddress,
          to: normalizedRouterAddress,
          value: '0x0',
        },
      },
    })

    return {
      memo: step.memo,
      rawResult: {
        approval: approvalResults.length === 1 ? approvalResults[0] : approvalResults,
        swap: swap.result,
      },
      route: 'extension',
      stepId: step.id,
      txHash: extractTxHash(swap.result),
    }
  }

  const client = (input.evmClientFactory ?? createDefaultEvmClient)(step.chain)
  const approvalAmounts = await resolveSdkApprovalAmounts(client, {
    owner: step.sourceAddress as Address,
    router: normalizedRouterAddress,
    token: normalizedTokenAddress,
    targetAmount: amount,
  })
  const approvalBroadcasts: Array<{ hash: Hex; rawTx: Hex; txHash: string }> = []

  for (const approvalAmount of approvalAmounts) {
    const approvalTx = await buildEip1559Transaction(client, {
      account: step.sourceAddress as Address,
      chain: step.chain,
      data: buildErc20ApprovalData(normalizedRouterAddress, approvalAmount),
      to: normalizedTokenAddress,
      value: 0n,
    })
    const approvalSignature = await manager.execute('tx.sign.bytes', {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: 'signing' } }
        : {}),
      input: {
        chain: step.chain,
        data: approvalTx.hash,
      },
    })
    const approvalRawTx = serializeTransaction(
      approvalTx.request,
      toViemSignature(approvalSignature.signature),
    )
    const approvalBroadcast = await manager.execute('tx.broadcast.raw', {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: 'approval' } }
        : {}),
      input: {
        chain: step.chain,
        rawTx: approvalRawTx,
      },
    })

    approvalBroadcasts.push({
      hash: approvalTx.hash,
      rawTx: approvalRawTx,
      txHash: approvalBroadcast.txHash,
    })
    await waitForTransactionConfirmation(manager, {
      chain: step.chain,
      sessionId: session.id,
      sleep: input.sleep,
      txHash: approvalBroadcast.txHash,
      intervalMs: APPROVAL_POLL_INTERVAL_MS,
      maxWaitMs: input.maxWaitMs ?? APPROVAL_TIMEOUT_MS,
    })
  }

  const swapTx = await buildEip1559Transaction(client, {
    account: step.sourceAddress as Address,
    chain: step.chain,
    data: routerData,
    to: normalizedRouterAddress,
    value: 0n,
  })
  const swapSignature = await manager.execute('tx.sign.bytes', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'signing' } }
      : {}),
    input: {
      chain: step.chain,
      data: swapTx.hash,
    },
  })
  const rawTx = serializeTransaction(
    swapTx.request,
    toViemSignature(swapSignature.signature),
  )
  const broadcast = await manager.execute('tx.broadcast.raw', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'broadcasting' } }
      : {}),
    input: {
      chain: step.chain,
      rawTx,
    },
  })

  return {
    memo: step.memo,
    rawResult: {
      approval:
        approvalBroadcasts.length === 1 ? approvalBroadcasts[0] : approvalBroadcasts,
      swap: {
        hash: swapTx.hash,
        rawTx,
        txHash: broadcast.txHash,
      },
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

function resolvePendingLiquidityCancelMode(
  position?: LiquidityPosition | null,
): 'asset' | 'cacao' | null {
  if (
    !position ||
    position.state !== 'pending' ||
    position.units !== '0' ||
    (position.pendingAsset === '0' && position.pendingCacao === '0')
  ) {
    return null
  }

  if (position.pendingAsset !== '0' && position.pendingCacao === '0') {
    return 'asset'
  }

  return 'cacao'
}

function buildPendingLiquidityCancelMemo(input: {
  basisPoints: number
  memoPoolAsset: string
  mode: 'asset' | 'cacao'
  pairedMayaAddress?: string
}): string {
  if (input.mode === 'asset') {
    if (!input.pairedMayaAddress) {
      throw new Error('No MayaChain address is connected for the pending LP cancellation.')
    }
    return `WD:${input.memoPoolAsset}:${input.basisPoints}:${input.memoPoolAsset}:${input.pairedMayaAddress}`
  }

  return `WD:${input.memoPoolAsset}:${input.basisPoints}`
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

async function waitForTransactionConfirmation(
  manager: MayaWalletManager,
  input: {
    chain: WalletChain
    intervalMs: number
    maxWaitMs: number
    sessionId: string
    sleep?: (ms: number) => Promise<void>
    txHash: string
  },
): Promise<void> {
  const startedAt = Date.now()
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  while (Date.now() - startedAt <= input.maxWaitMs) {
    const statusResult = await manager.execute('tx.status', {
      sessionId: input.sessionId,
      track: false,
      input: {
        chain: input.chain,
        txHash: input.txHash,
      },
    })

    if (isConfirmedStatus(statusResult.status)) {
      return
    }
    if (isFailedStatus(statusResult.status)) {
      throw new Error(`Transaction ${input.txHash} failed before liquidity submission could continue.`)
    }

    await sleep(input.intervalMs)
  }

  throw new Error('Approval transaction confirmation timed out.')
}

function isConfirmedStatus(status: unknown): boolean {
  if (isFailedStatus(status)) {
    return false
  }

  if (!status) {
    return false
  }

  if (typeof status === 'object') {
    const record = status as Record<string, unknown>
    const normalized = typeof record.status === 'string' ? record.status.toLowerCase() : null
    if (normalized === 'success' || normalized === 'confirmed') {
      return true
    }
    const receipt = typeof record.receipt === 'object' && record.receipt !== null
      ? (record.receipt as Record<string, unknown>)
      : null
    if (receipt?.status === 1 || receipt?.status === '1' || receipt?.status === '0x1') {
      return true
    }
    if (
      record.status === 1 ||
      record.status === '1' ||
      record.status === '0x1' ||
      record.blockHash
    ) {
      return true
    }
  }

  return false
}

function isFailedStatus(status: unknown): boolean {
  if (!status || typeof status !== 'object') {
    return false
  }

  const record = status as Record<string, unknown>
  const normalized = typeof record.status === 'string' ? record.status.toLowerCase() : null
  if (normalized === 'error' || normalized === 'failed' || normalized === 'reverted') {
    return true
  }

  const receipt = typeof record.receipt === 'object' && record.receipt !== null
    ? (record.receipt as Record<string, unknown>)
    : null

  return (
    record.status === 0 ||
    record.status === '0' ||
    record.status === '0x0' ||
    receipt?.status === 0 ||
    receipt?.status === '0' ||
    receipt?.status === '0x0'
  )
}

function buildErc20ApprovalData(router: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [router, amount],
  })
}

async function resolveExtensionApprovalAmounts(
  manager: MayaWalletManager,
  input: {
    chain: WalletChain
    owner: string
    router: Address
    sessionId: string
    targetAmount: bigint
    token: Address
  },
): Promise<bigint[]> {
  const result = await manager.execute('provider.request', {
    sessionId: input.sessionId,
    track: false,
    input: {
      chain: input.chain,
      method: 'eth_call',
      params: [
        {
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'allowance',
            args: [input.owner as Address, input.router],
          }),
          to: input.token,
        },
        'latest',
      ],
    },
  })

  return resolveApprovalAmounts(
    parseAllowanceResult((result as { result: unknown }).result),
    input.targetAmount,
  )
}

async function resolveSdkApprovalAmounts(
  client: EvmPublicClientLike,
  input: {
    owner: Address
    router: Address
    targetAmount: bigint
    token: Address
  },
): Promise<bigint[]> {
  const currentAllowance = await client.readContract({
    abi: erc20Abi,
    address: input.token,
    functionName: 'allowance',
    args: [input.owner, input.router],
  })

  return resolveApprovalAmounts(currentAllowance, input.targetAmount)
}

function resolveApprovalAmounts(
  currentAllowance: bigint,
  targetAmount: bigint,
): bigint[] {
  if (currentAllowance >= targetAmount) {
    return []
  }

  if (currentAllowance > 0n) {
    return [0n, targetAmount]
  }

  return [targetAmount]
}

function parseAllowanceResult(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value
  }

  if (typeof value === 'number') {
    return BigInt(value)
  }

  if (typeof value === 'string') {
    if (value === '0x' || value.trim() === '') {
      return 0n
    }
    return BigInt(value)
  }

  throw new Error('Unable to read ERC-20 allowance from the connected provider.')
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
  tokenId?: string,
): string {
  const normalized = chainTicker.toUpperCase()

  if (normalized === 'MAYA') {
    return '1'
  }

  // Router-based ERC-20 memo sends transport the token amount directly, so
  // chain-native dust defaults like 10 gwei must not be reused as token units.
  if (tokenId) {
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

function shouldUseLiquidityRouterStep(pool: LiquidityPool): boolean {
  return Boolean(
    pool.walletChain &&
      isEvmChain(pool.walletChain) &&
      pool.tokenId &&
      pool.actionAvailability?.router,
  )
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

async function buildEip1559Transaction(
  client: EvmPublicClientLike,
  input: {
    account: Address
    chain: WalletChain
    data: Hex
    to: Address
    value: bigint
  },
): Promise<{
  hash: Hex
  request: {
    chainId: number
    data: Hex
    gas: bigint
    maxFeePerGas: bigint
    maxPriorityFeePerGas: bigint
    nonce: number
    to: Address
    type: 'eip1559'
    value: bigint
  }
}> {
  const fees = await client.estimateFeesPerGas({ type: 'eip1559' }).catch(async () => {
    const gasPrice = await client.getGasPrice()
    return {
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: gasPrice,
    }
  })
  const nonce = await client.getTransactionCount({
    address: input.account,
    blockTag: 'pending',
  })
  const gas = await client.estimateGas({
    account: input.account,
    data: input.data,
    to: input.to,
    value: input.value,
  })

  const request = {
    chainId: getEvmChainConfig(input.chain).id,
    data: input.data,
    gas,
    maxFeePerGas: fees.maxFeePerGas ?? 0n,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n,
    nonce,
    to: input.to,
    type: 'eip1559' as const,
    value: input.value,
  }

  const serialized = serializeTransaction(request)
  return {
    hash: keccak256(serialized),
    request,
  }
}

function toViemSignature(signature: Signature): {
  r: Hex
  s: Hex
  yParity: 0 | 1
} {
  const recovery = normalizeRecovery(signature.recovery)
  const firstSignature = signature.signatures?.[0]
  if (firstSignature?.r && firstSignature?.s) {
    return {
      r: ensureHex(firstSignature.r),
      s: ensureHex(firstSignature.s),
      yParity: recovery,
    }
  }

  const raw = ensureHex(signature.signature)
  const bytes = raw.slice(2)
  const derSignature = tryParseDerEcdsaSignature(bytes)
  if (derSignature) {
    return {
      ...derSignature,
      yParity: recovery,
    }
  }

  if (bytes.length < 128) {
    throw new Error('Received an unexpected ECDSA signature payload from the vault.')
  }

  const r = `0x${bytes.slice(0, 64)}` as Hex
  const s = `0x${bytes.slice(64, 128)}` as Hex
  const fallbackRecovery =
    bytes.length >= 130
      ? normalizeRecovery(Number.parseInt(bytes.slice(128, 130), 16))
      : recovery

  return {
    r,
    s,
    yParity: fallbackRecovery,
  }
}

function tryParseDerEcdsaSignature(
  bytes: string,
): { r: Hex; s: Hex } | null {
  if (!bytes.startsWith('30')) {
    return null
  }

  const der = hexToBytes(bytes)
  if (der.length < 8 || der[0] !== 0x30) {
    return null
  }

  const sequenceLength = der[1]
  if (sequenceLength + 2 > der.length) {
    return null
  }

  let offset = 2
  const r = readDerInteger(der, offset)
  if (!r) {
    return null
  }
  offset = r.nextOffset

  const s = readDerInteger(der, offset)
  if (!s) {
    return null
  }

  return {
    r: toFixedHex32(r.value),
    s: toFixedHex32(s.value),
  }
}

function readDerInteger(
  der: Uint8Array,
  offset: number,
): { value: Uint8Array; nextOffset: number } | null {
  if (offset + 2 > der.length || der[offset] !== 0x02) {
    return null
  }

  const length = der[offset + 1]
  const start = offset + 2
  const end = start + length
  if (end > der.length) {
    return null
  }

  let value = der.slice(start, end)
  while (value.length > 0 && value[0] === 0x00) {
    value = value.slice(1)
  }

  return {
    value,
    nextOffset: end,
  }
}

function toFixedHex32(value: Uint8Array): Hex {
  if (value.length > 32) {
    throw new Error('Received an oversized ECDSA signature component from the vault.')
  }

  const hex = bytesToHex(value).padStart(64, '0')
  return `0x${hex}` as Hex
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.length % 2 === 0 ? value : `0${value}`
  const bytes = new Uint8Array(normalized.length / 2)

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }

  return bytes
}

function normalizeRecovery(value?: number): 0 | 1 {
  if (value === 0 || value === 1) {
    return value
  }

  if (value === 27 || value === 28) {
    return (value - 27) as 0 | 1
  }

  return 0
}

function createDefaultEvmClient(chain: WalletChain): EvmPublicClientLike {
  return createPublicClient({
    chain: getEvmChainConfig(chain),
    transport: http(),
  })
}

function getEvmChainConfig(chain: WalletChain) {
  switch (chain) {
    case Chain.Ethereum:
      return mainnet
    case Chain.Arbitrum:
      return arbitrum
    case Chain.Base:
      return base
    default:
      throw new WalletCapabilityError(
        'tx.sign.bytes',
        String(chain),
        `Unsupported EVM chain for raw router liquidity steps: ${chain}`,
      )
  }
}

function ensureHex(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex
}

function isEvmChain(chain: WalletChain): boolean {
  return chain === Chain.Ethereum || chain === Chain.Arbitrum || chain === Chain.Base
}

async function ensureExtensionChain(
  manager: MayaWalletManager,
  session: WalletSession,
  chain: WalletChain,
): Promise<void> {
  if (session.source !== 'extension' || !isEvmChain(chain)) {
    return
  }

  const activeChain = manager.getState().activeChain
  if (activeChain === chain) {
    return
  }

  await manager.execute('chain.switch', {
    sessionId: session.id,
    input: { chain },
    track: false,
  })
}
