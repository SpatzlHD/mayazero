import { WalletChain as Chain } from '#/wallet/chain-types'
import type { Signature } from '#/wallet/wallet-primitives'
import {
  type Address,
  type Hex,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  serializeTransaction,
  stringToHex,
  toHex,
} from 'viem'
import { arbitrum, base, mainnet } from 'viem/chains'
import type { ProtocolAsset } from '#/components/ProtocolPrimitives'
import { normalizeEvmAddress } from '#/lib/evm-address'
import type { SwapQuoteEngineResult } from '#/lib/swap-quote-engine'
import type { MayaWalletManager } from './manager'
import { resolveSigningRoute, type SigningRoute } from './signing-route'
import type { WalletChain, WalletSession } from './types'
import { WalletCapabilityError, WalletSessionNotFoundError } from './errors'
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

type MayaSwapQuote = Extract<SwapQuoteEngineResult, { route: 'maya' }>

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

export type SwapExecutionMode = 'send' | 'erc20-router' | 'deposit'

export type SwapExecutionSupport = {
  supported: boolean
  sessionId?: string
  source?: WalletSession['source']
  mode?: SwapExecutionMode
  reason?: string
  memo?: string
  inboundAddress?: string
  router?: string
}

export type SwapSubmitResult = {
  approvalRawResult?: unknown
  approvalTxHash?: string | null
  inboundAddress?: string
  memo: string
  mode: SwapExecutionMode
  rawResult: unknown
  route: SigningRoute
  router?: string
  txHash: string | null
}

export type SwapExecutionStatus =
  | 'approving'
  | 'refreshing'
  | 'submitting'
  | 'waiting-approval'

export async function submitSwap(
  manager: MayaWalletManager,
  input: {
    amount: string
    fromAsset: ProtocolAsset
    journeyId?: string
    quote: MayaSwapQuote
    sessionId?: string
    evmClientFactory?: (chain: WalletChain) => EvmPublicClientLike
    maxWaitMs?: number
    now?: () => number
    onStatusChange?: (status: SwapExecutionStatus) => void
    sleep?: (ms: number) => Promise<void>
  },
): Promise<SwapSubmitResult> {
  const support = getSwapExecutionSupport(manager, {
    fromAsset: input.fromAsset,
    quote: input.quote,
    sessionId: input.sessionId,
  })

  if (!support.supported || !support.mode || !support.sessionId) {
    throw new Error(support.reason ?? 'Swap execution is unavailable for the active session.')
  }

  const session = resolveRequiredSession(manager, support.sessionId)
  const sourceAddress = session.addresses[input.fromAsset.chain]
  if (!sourceAddress) {
    throw new Error(`No ${input.fromAsset.chain} address is connected for the selected wallet session.`)
  }

  const amountBaseUnits = parseDecimalToBaseUnits(input.amount, input.fromAsset.decimals)
  const memo = input.quote.memo
  const inboundAddress = input.quote.inboundAddress
  const mode = support.mode

  if (!memo) {
    throw new Error('The latest Maya quote is missing execution details. Refresh and try again.')
  }

  if (mode !== 'deposit' && !inboundAddress) {
    throw new Error('The latest Maya quote is missing execution details. Refresh and try again.')
  }

  const requiredInboundAddress = mode === 'deposit' ? undefined : inboundAddress

  switch (mode) {
    case 'deposit':
      input.onStatusChange?.('submitting')
      return submitMayaDepositSwap(manager, session, input.fromAsset, {
        amountBaseUnits,
        journeyId: input.journeyId,
        memo,
      })
    case 'erc20-router':
      return submitErc20RouterSwap(manager, session, input.fromAsset, {
        amountBaseUnits,
        inboundAddress: requiredInboundAddress!,
        journeyId: input.journeyId,
        memo,
        router: support.router!,
        evmClientFactory: input.evmClientFactory,
        maxWaitMs: input.maxWaitMs,
        now: input.now,
        onStatusChange: input.onStatusChange,
        sleep: input.sleep,
      })
    case 'send':
      input.onStatusChange?.('submitting')
      return submitStandardMemoSwap(manager, session, input.fromAsset, {
        amountBaseUnits,
        inboundAddress: requiredInboundAddress!,
        journeyId: input.journeyId,
        memo,
      })
  }
}

export function getSwapExecutionSupport(
  manager: MayaWalletManager,
  input: {
    fromAsset: ProtocolAsset
    quote: SwapQuoteEngineResult | null
    sessionId?: string
  },
): SwapExecutionSupport {
  const session = resolveSession(manager, input.sessionId)
  if (!session) {
    return {
      supported: false,
      reason: 'Connect a wallet session to submit a swap.',
    }
  }

  if (!input.quote) {
    return {
      supported: false,
      reason: 'A fresh quote is required before swapping.',
      sessionId: session.id,
      source: session.source,
    }
  }

  if (input.quote.route !== 'maya') {
    return {
      supported: false,
      reason: 'Only Maya-native quotes can be executed in this flow.',
      sessionId: session.id,
      source: session.source,
    }
  }

  const mode = resolveSwapExecutionMode(input.fromAsset, input.quote)

  if (!input.quote.memo) {
    return {
      supported: false,
      reason: 'The latest quote is missing memo data.',
      sessionId: session.id,
      source: session.source,
    }
  }

  if (mode !== 'deposit' && !input.quote.inboundAddress) {
    return {
      supported: false,
      reason: 'The latest quote is missing inbound address data.',
      sessionId: session.id,
      source: session.source,
    }
  }

  if (input.quote.expiry && input.quote.expiry <= Date.now()) {
    return {
      supported: false,
      reason: 'The quote has expired. Refresh before submitting.',
      sessionId: session.id,
      source: session.source,
    }
  }

  const sourceAddress = session.addresses[input.fromAsset.chain]
  if (!sourceAddress) {
    return {
      supported: false,
      reason: `Connect a ${input.fromAsset.chain} address for the active session.`,
      sessionId: session.id,
      source: session.source,
    }
  }

  if (mode === 'erc20-router' && !input.quote.inboundDetails?.router) {
    return {
      supported: false,
      reason: 'No router is available for the current inbound vault.',
      sessionId: session.id,
      source: session.source,
    }
  }

  if (supportsEvmProviderSend(session) && isEvmChain(input.fromAsset.chain)) {
    if (
      !manager.canExecute('tx.send', {
        sessionId: session.id,
        chain: input.fromAsset.chain,
      })
    ) {
      return {
        supported: false,
        reason:
          session.source === 'walletconnect'
            ? `WalletConnect cannot submit ${input.fromAsset.chain} transactions. Reconnect and approve the Ethereum chain in your wallet.`
            : `The connected extension session cannot submit ${input.fromAsset.chain} swap transactions.`,
        sessionId: session.id,
        source: session.source,
      }
    }

    if (
      mode === 'erc20-router' &&
      !manager.canExecute('tx.status', {
        sessionId: session.id,
        chain: input.fromAsset.chain,
      })
    ) {
      return {
        supported: false,
        reason: 'The active session cannot track EVM approval transactions.',
        sessionId: session.id,
        source: session.source,
      }
    }
  } else if (session.source === 'extension') {
    if (
      !manager.canExecute('tx.send', {
        sessionId: session.id,
        chain: input.fromAsset.chain,
      })
    ) {
      return {
        supported: false,
        reason: `The connected extension session cannot submit ${input.fromAsset.chain} swap transactions.`,
        sessionId: session.id,
        source: session.source,
      }
    }
  } else if (mode === 'erc20-router') {
    if (
      !manager.canExecute('tx.sign.bytes', {
        sessionId: session.id,
        chain: input.fromAsset.chain,
      }) ||
      !manager.canExecute('tx.broadcast.raw', {
        sessionId: session.id,
        chain: input.fromAsset.chain,
      }) ||
      !manager.canExecute('tx.status', {
        sessionId: session.id,
        chain: input.fromAsset.chain,
      })
    ) {
      return {
        supported: false,
        reason: 'The active vault session cannot sign and broadcast raw EVM swap transactions.',
        sessionId: session.id,
        source: session.source,
      }
    }
  } else if (
    !manager.canExecute('tx.prepare.send', {
      sessionId: session.id,
      chain: input.fromAsset.chain,
    }) ||
    !manager.canExecute('tx.sign', {
      sessionId: session.id,
      chain: input.fromAsset.chain,
    }) ||
    !manager.canExecute('tx.broadcast', {
      sessionId: session.id,
      chain: input.fromAsset.chain,
    })
  ) {
    return {
      supported: false,
      reason: `The active vault session cannot prepare the requested ${input.fromAsset.chain} swap transaction.`,
      sessionId: session.id,
      source: session.source,
    }
  }

  return {
    supported: true,
    sessionId: session.id,
    source: session.source,
    mode,
    memo: input.quote.memo,
    inboundAddress: input.quote.inboundAddress,
    router: input.quote.inboundDetails?.router,
  }
}

function resolveSwapExecutionMode(
  fromAsset: ProtocolAsset,
  quote: MayaSwapQuote,
): SwapExecutionMode {
  if (fromAsset.chain === Chain.MayaChain) {
    return 'deposit'
  }

  if (isEvmChain(fromAsset.chain) && fromAsset.tokenId && quote.inboundDetails?.router) {
    return 'erc20-router'
  }

  return 'send'
}

async function submitStandardMemoSwap(
  manager: MayaWalletManager,
  session: WalletSession,
  fromAsset: ProtocolAsset,
  input: {
    amountBaseUnits: string
    inboundAddress: string
    journeyId?: string
    memo: string
  },
): Promise<SwapSubmitResult> {
  const sourceAddress = session.addresses[fromAsset.chain]!

  if (supportsEvmProviderSend(session)) {
    await ensureExtensionChain(manager, session, fromAsset.chain)
    if (isEvmChain(fromAsset.chain) && !fromAsset.tokenId) {
      const result = await manager.execute('tx.send', {
        sessionId: session.id,
        ...(input.journeyId
          ? { journey: { id: input.journeyId, stepKey: 'provider' } }
          : {}),
        input: {
          chain: fromAsset.chain,
          transaction: {
            data: encodeEvmMemoData(input.memo),
            from: sourceAddress,
            to: normalizeEvmAddress(input.inboundAddress),
            value: toHex(BigInt(input.amountBaseUnits)),
          },
        },
      })

      return {
        inboundAddress: input.inboundAddress,
        memo: input.memo,
        mode: 'send',
        rawResult: result.result,
        route: session.source === 'extension' ? 'extension' : resolveSigningRoute(session),
        txHash: extractTxHash(result.result),
      }
    }

    if (session.source !== 'extension') {
      throw new WalletCapabilityError(
        'tx.send',
        session.id,
        `${fromAsset.chain} memo swaps via WalletConnect require native EVM assets or ERC-20 router mode.`,
      )
    }

    const result = await manager.execute('tx.send', {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: 'provider' } }
        : {}),
      input: {
        chain: fromAsset.chain,
        transaction: {
          amount: {
            amount: input.amountBaseUnits,
            decimals: fromAsset.decimals,
          },
          asset: {
            chain: fromAsset.chain,
            ticker: fromAsset.ticker.toLowerCase(),
            ...(fromAsset.tokenId ? { id: fromAsset.tokenId } : {}),
          },
          from: sourceAddress,
          memo: input.memo,
          to: input.inboundAddress,
        },
      },
    })

    return {
      inboundAddress: input.inboundAddress,
      memo: input.memo,
      mode: 'send',
      rawResult: result.result,
      route: 'extension',
      txHash: extractTxHash(result.result),
    }
  }

  const prepared = await manager.execute('tx.prepare.send', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'preparing' } }
      : {}),
    input: {
      amount: BigInt(input.amountBaseUnits),
      coin: {
        address: sourceAddress,
        chain: fromAsset.chain,
        contractAddress: fromAsset.tokenId,
        decimals: fromAsset.decimals,
        isNativeToken: !fromAsset.tokenId,
        ticker: fromAsset.ticker,
      },
      memo: input.memo,
      receiver: input.inboundAddress,
    },
  })

  const signature = await manager.execute('tx.sign', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'signing' } }
      : {}),
    input: {
      chain: fromAsset.chain,
      payload: prepared.payload,
    },
  })

  const broadcast = await manager.execute('tx.broadcast', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'broadcasting' } }
      : {}),
    input: {
      chain: fromAsset.chain,
      payload: prepared.payload,
      signature: signature.signature,
    },
  })

  return {
    inboundAddress: input.inboundAddress,
    memo: input.memo,
    mode: 'send',
    rawResult: {
      payload: prepared.payload,
      txHash: broadcast.txHash,
    },
    route: resolveSigningRoute(session),
    txHash: broadcast.txHash ?? null,
  }
}

async function submitMayaDepositSwap(
  manager: MayaWalletManager,
  session: WalletSession,
  fromAsset: ProtocolAsset,
  input: {
    amountBaseUnits: string
    journeyId?: string
    memo: string
  },
): Promise<SwapSubmitResult> {
  const sourceAddress = session.addresses[Chain.MayaChain]
  if (!sourceAddress) {
    throw new Error('No MayaChain address is connected for the selected wallet session.')
  }

  const assetIdentifier = resolveMayaChainAssetIdentifier(fromAsset)

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
          amount: {
            amount: input.amountBaseUnits,
            decimals: fromAsset.decimals,
          },
          asset: {
            chain: Chain.MayaChain,
            ticker: fromAsset.ticker.toLowerCase(),
            ...(assetIdentifier ? { id: assetIdentifier } : {}),
          },
          from: sourceAddress,
          memo: input.memo,
        },
      },
    })

    return {
      memo: input.memo,
      mode: 'deposit',
      rawResult: result.result,
      route: 'extension',
      txHash: extractTxHash(result.result),
    }
  }

  const prepared = await manager.execute('tx.prepare.send', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'preparing' } }
      : {}),
    input: {
      amount: BigInt(input.amountBaseUnits),
      coin: {
        address: sourceAddress,
        chain: Chain.MayaChain,
        ...(assetIdentifier ? { contractAddress: assetIdentifier } : {}),
        decimals: fromAsset.decimals,
        isNativeToken: !assetIdentifier,
        ticker: fromAsset.ticker,
      },
      memo: input.memo,
      receiver: sourceAddress,
    },
  })

  const payload = prepared.payload as Record<string, unknown>
  payload.toAddress = ''
  payload.toAmount = input.amountBaseUnits
  payload.memo = input.memo
  markMayaPayloadAsDeposit(payload)

  const signature = await manager.execute('tx.sign', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'signing' } }
      : {}),
    input: {
      chain: Chain.MayaChain,
      payload: prepared.payload,
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
    memo: input.memo,
    mode: 'deposit',
    rawResult: {
      payload: prepared.payload,
      txHash: broadcast.txHash,
    },
    route: resolveSigningRoute(session),
    txHash: broadcast.txHash ?? null,
  }
}

async function submitErc20RouterSwap(
  manager: MayaWalletManager,
  session: WalletSession,
  fromAsset: ProtocolAsset,
  input: {
    amountBaseUnits: string
    inboundAddress: string
    journeyId?: string
    memo: string
    router: string
    evmClientFactory?: (chain: WalletChain) => EvmPublicClientLike
    maxWaitMs?: number
    now?: () => number
    onStatusChange?: (status: SwapExecutionStatus) => void
    sleep?: (ms: number) => Promise<void>
  },
): Promise<SwapSubmitResult> {
  if (!fromAsset.tokenId) {
    throw new Error('ERC-20 router swaps require a token contract address.')
  }

  const sourceAddress = session.addresses[fromAsset.chain]
  if (!sourceAddress) {
    throw new Error(`No ${fromAsset.chain} address is connected for the selected wallet session.`)
  }

  const amount = BigInt(input.amountBaseUnits)
  const normalizedTokenAddress = normalizeEvmAddress(fromAsset.tokenId)
  const normalizedRouterAddress = normalizeEvmAddress(input.router)
  const normalizedInboundAddress = normalizeEvmAddress(input.inboundAddress)
  const routerData = encodeFunctionData({
    abi: mayaRouterAbi,
    functionName: 'depositWithExpiry',
    args: [
      normalizedInboundAddress,
      normalizedTokenAddress,
      amount,
      input.memo,
      BigInt(Math.floor((input.now?.() ?? Date.now()) / 1000) + ROUTER_EXPIRY_WINDOW_SECONDS),
    ],
  })

  if (supportsEvmProviderSend(session)) {
    await ensureExtensionChain(manager, session, fromAsset.chain)
    const approvalAmounts = await resolveExtensionApprovalAmounts(manager, {
      chain: fromAsset.chain,
      owner: sourceAddress,
      router: normalizedRouterAddress,
      sessionId: session.id,
      targetAmount: amount,
      token: normalizedTokenAddress,
    })
    const approvalResults: unknown[] = []
    let lastApprovalTxHash: string | null = null

    for (const approvalAmount of approvalAmounts) {
      input.onStatusChange?.('approving')
      const approval = await manager.execute('tx.send', {
        sessionId: session.id,
        ...(input.journeyId
          ? { journey: { id: input.journeyId, stepKey: 'approval' } }
          : {}),
        input: {
          chain: fromAsset.chain,
          transaction: {
            data: buildErc20ApprovalData(normalizedRouterAddress, approvalAmount),
            from: sourceAddress,
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
      lastApprovalTxHash = approvalTxHash
      input.onStatusChange?.('waiting-approval')
      await waitForTransactionConfirmation(manager, {
        chain: fromAsset.chain,
        sessionId: session.id,
        sleep: input.sleep,
        txHash: approvalTxHash,
        intervalMs: APPROVAL_POLL_INTERVAL_MS,
        maxWaitMs: input.maxWaitMs ?? APPROVAL_TIMEOUT_MS,
      })
    }

    input.onStatusChange?.('submitting')
    const swap = await manager.execute('tx.send', {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: 'provider' } }
        : {}),
      input: {
        chain: fromAsset.chain,
        transaction: {
          data: routerData,
          from: sourceAddress,
          to: normalizedRouterAddress,
          value: '0x0',
        },
      },
    })

    return {
      approvalRawResult:
        approvalResults.length <= 1 ? approvalResults[0] ?? null : approvalResults,
      approvalTxHash: lastApprovalTxHash,
      inboundAddress: input.inboundAddress,
      memo: input.memo,
      mode: 'erc20-router',
      rawResult: swap.result,
      route: session.source === 'extension' ? 'extension' : resolveSigningRoute(session),
      router: input.router,
      txHash: extractTxHash(swap.result),
    }
  }

  const client = (input.evmClientFactory ?? createDefaultEvmClient)(fromAsset.chain)
  const approvalAmounts = await resolveSdkApprovalAmounts(client, {
    owner: sourceAddress as Address,
    router: normalizedRouterAddress,
    targetAmount: amount,
    token: normalizedTokenAddress,
  })
  const approvalBroadcasts: Array<{ hash: Hex; rawTx: Hex; txHash: string }> = []
  let lastApprovalTxHash: string | null = null

  for (const approvalAmount of approvalAmounts) {
    const approvalTx = await buildEip1559Transaction(client, {
      account: sourceAddress as Address,
      chain: fromAsset.chain,
      data: buildErc20ApprovalData(normalizedRouterAddress, approvalAmount),
      to: normalizedTokenAddress,
      value: 0n,
    })
    input.onStatusChange?.('approving')
    const approvalSignature = await manager.execute('tx.sign.bytes', {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: 'signing' } }
        : {}),
      input: {
        chain: fromAsset.chain,
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
        chain: fromAsset.chain,
        rawTx: approvalRawTx,
      },
    })

    approvalBroadcasts.push({
      hash: approvalTx.hash,
      rawTx: approvalRawTx,
      txHash: approvalBroadcast.txHash,
    })
    lastApprovalTxHash = approvalBroadcast.txHash
    input.onStatusChange?.('waiting-approval')
    await waitForTransactionConfirmation(manager, {
      chain: fromAsset.chain,
      sessionId: session.id,
      sleep: input.sleep,
      txHash: approvalBroadcast.txHash,
      intervalMs: APPROVAL_POLL_INTERVAL_MS,
      maxWaitMs: input.maxWaitMs ?? APPROVAL_TIMEOUT_MS,
    })
  }

  const swapTx = await buildEip1559Transaction(client, {
    account: sourceAddress as Address,
    chain: fromAsset.chain,
    data: routerData,
    to: normalizedRouterAddress,
    value: 0n,
  })
  input.onStatusChange?.('submitting')
  const swapSignature = await manager.execute('tx.sign.bytes', {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: 'signing' } }
      : {}),
    input: {
      chain: fromAsset.chain,
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
      chain: fromAsset.chain,
      rawTx,
    },
  })

  return {
    approvalRawResult:
      approvalBroadcasts.length <= 1
        ? approvalBroadcasts[0] ?? null
        : approvalBroadcasts,
    approvalTxHash: lastApprovalTxHash,
    inboundAddress: input.inboundAddress,
    memo: input.memo,
    mode: 'erc20-router',
    rawResult: {
      hash: swapTx.hash,
      rawTx,
      txHash: broadcast.txHash,
    },
    route: resolveSigningRoute(session),
    router: normalizedRouterAddress,
    txHash: broadcast.txHash ?? null,
  }
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

async function waitForTransactionConfirmation(
  manager: MayaWalletManager,
  input: {
    chain: WalletChain
    sessionId: string
    txHash: string
    intervalMs: number
    maxWaitMs: number
    sleep?: (ms: number) => Promise<void>
  },
): Promise<void> {
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const deadline = Date.now() + input.maxWaitMs

  while (Date.now() < deadline) {
    const status = await manager.execute('tx.status', {
      sessionId: input.sessionId,
      input: {
        chain: input.chain,
        txHash: input.txHash,
      },
      track: false,
    })

    const state = normalizeTxState(status.status)
    if (state === 'success') {
      return
    }
    if (state === 'error') {
      throw new Error(`Transaction ${input.txHash} failed before the swap could continue.`)
    }

    await sleep(input.intervalMs)
  }

  throw new Error(`Timed out waiting for approval transaction ${input.txHash} to confirm.`)
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
      if (normalized === 'error' || normalized === 'failed' || normalized === 'reverted') {
        return 'error'
      }
    }

    if (typeof record.receipt === 'object' && record.receipt !== null) {
      const receipt = record.receipt as Record<string, unknown>
      if (receipt.status === 0 || receipt.status === '0' || receipt.status === '0x0') {
        return 'error'
      }
      if (
        receipt.status === 1 ||
        receipt.status === '1' ||
        receipt.status === '0x1' ||
        receipt.blockHash ||
        receipt.blockNumber ||
        receipt.block_height ||
        receipt.height
      ) {
        return 'success'
      }
    }

    if (record.status === 0 || record.status === '0' || record.status === '0x0') {
      return 'error'
    }
    if (record.status === 1 || record.status === '1' || record.status === '0x1') {
      return 'success'
    }

    if (
      record.blockHash ||
      record.blockNumber ||
      record.block_height ||
      record.height ||
      (typeof record.confirmations === 'number' && record.confirmations > 0) ||
      (typeof record.confirmations === 'string' && Number(record.confirmations) > 0)
    ) {
      return 'success'
    }
  }

  return 'pending'
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

function hexToBytes(value: string): Uint8Array {
  const normalized = value.length % 2 === 0 ? value : `0${value}`
  const bytes = new Uint8Array(normalized.length / 2)

  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16)
  }

  return bytes
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
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
        `Unsupported EVM chain for raw router swaps: ${chain}`,
      )
  }
}

function ensureHex(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex
}

function parseDecimalToBaseUnits(value: string, decimals: number): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Swap amount is required.')
  }

  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) {
    throw new Error('Swap amount must be a valid positive decimal number.')
  }

  const integerPart = match[1] ?? '0'
  const fractionalPart = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0')
  const normalized = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, '')
  return normalized.length ? normalized : '0'
}

function extractTxHash(result: unknown): string | null {
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

function markMayaPayloadAsDeposit(payload: Record<string, unknown>): void {
  const mayaSpecific = extractMayaSpecific(payload.blockchainSpecific)
  if (!mayaSpecific) {
    throw new Error('Prepared MayaChain payload is missing mayaSpecific signing details.')
  }

  mayaSpecific.isDeposit = true
}

function extractMayaSpecific(
  blockchainSpecific: unknown,
): { accountNumber?: bigint; sequence?: bigint; isDeposit?: boolean } | null {
  if (
    typeof blockchainSpecific === 'object' &&
    blockchainSpecific !== null &&
    'case' in blockchainSpecific &&
    'value' in blockchainSpecific &&
    (blockchainSpecific as { case?: unknown }).case === 'mayaSpecific'
  ) {
    const value = (blockchainSpecific as { value?: unknown }).value
    if (typeof value === 'object' && value !== null) {
      return value as {
        accountNumber?: bigint
        sequence?: bigint
        isDeposit?: boolean
      }
    }
  }

  return null
}

function resolveMayaChainAssetIdentifier(asset: ProtocolAsset): string | undefined {
  return asset.mayaAsset.toUpperCase() === 'MAYA.CACAO' ? undefined : asset.mayaAsset
}

function isEvmChain(chain: WalletChain): boolean {
  return chain === Chain.Ethereum || chain === Chain.Arbitrum || chain === Chain.Base
}

function supportsEvmProviderSend(session: WalletSession): boolean {
  return session.source === 'extension' || session.source === 'walletconnect'
}

function encodeEvmMemoData(memo: string): Hex {
  const trimmed = memo.trim()
  if (!trimmed) {
    throw new Error('The latest Maya quote is missing memo data.')
  }

  return stringToHex(trimmed)
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
