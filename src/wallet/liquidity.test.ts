import {
  createInitializedTestManager,
  createTestManager,
  initializeKeystoreSession,
  localSignerMocks,
  resetWalletTestMocks,
} from './test-mocks'
import { createFakeKeystoreRecord } from './test-utils'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { decodeFunctionData, encodeFunctionData, erc20Abi } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiquidityPool, LiquidityPosition } from '#/lib/liquidity'
import {
  getLiquidityDepositSupport,
  prepareLiquidityDepositSteps,
  submitLiquidityDepositStep,
  submitLiquidityWithdraw,
} from './liquidity'

const routerAbi = [
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

function makePool(): LiquidityPool {
  return {
    actionAvailability: {
      chain: 'ETH',
      inboundAddress: '0xinbound',
      lpActionsPaused: false,
      tradingPaused: false,
      halted: false,
      dustThreshold: '0',
      router: '0xrouter',
    },
    apr: '0.12',
    asset: 'ETH.ETH',
    assetDepth: '100000000',
    assetPrice: '10',
    assetPriceUsd: '2500',
    cacaoDepth: '1000000000',
    chainKey: 'ethereum',
    chainName: 'Ethereum',
    chainTicker: 'ETH',
    decimals: 18,
    depthUsd: 50000,
    family: 'evm',
    iconId: 'eth',
    isActionable: true,
    lpUnits: '9000',
    poolUnits: '10000',
    saversDepth: '0',
    status: 'available',
    symbol: 'ETH',
    ticker: 'ETH',
    volume24h: '400000000',
    volume24hCacao: 0.04,
    volume24hUsd: 10,
    walletChain: Chain.Ethereum,
  }
}

function makeArbUsdcPool(): LiquidityPool {
  return {
    actionAvailability: {
      chain: 'ARB',
      inboundAddress: '0xAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
      lpActionsPaused: false,
      tradingPaused: false,
      halted: false,
      dustThreshold: '0',
      router: '0x700E97EF07219440487840DC472E7120A7FF11F4',
    },
    apr: '0.12',
    asset: 'ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831',
    assetDepth: '100000000',
    assetPrice: '1',
    assetPriceUsd: '1',
    cacaoDepth: '1000000000',
    chainKey: 'arbitrum',
    chainName: 'Arbitrum',
    chainTicker: 'ARB',
    decimals: 6,
    depthUsd: 50000,
    family: 'evm',
    iconId: 'usdc',
    isActionable: true,
    lpUnits: '9000',
    poolUnits: '10000',
    saversDepth: '0',
    status: 'available',
    symbol: 'USDC',
    ticker: 'USDC',
    tokenId: '0XAF88D065E77C8CC2239327C5EDB3A432268E5831',
    volume24h: '400000000',
    volume24hCacao: 0.04,
    volume24hUsd: 10,
    walletChain: Chain.Arbitrum,
  }
}

function makePosition(overrides: Partial<LiquidityPosition> = {}): LiquidityPosition {
  return {
    assetAddress: 'ethereum-address',
    assetAdded: '0',
    assetDepositValue: '0',
    assetRedeemValue: '0',
    assetWithdrawn: '0',
    cacaoAddress: 'mayachain-address',
    cacaoAdded: '0',
    cacaoDepositValue: '0',
    cacaoRedeemValue: '0',
    cacaoWithdrawn: '0',
    firstAddedAt: null,
    lastAddedAt: null,
    matchingAddresses: ['mayachain-address', 'ethereum-address'],
    pendingAsset: '0',
    pendingCacao: '0',
    pool: 'ETH.ETH',
    state: 'active',
    units: '100',
    withdrawCounter: null,
    ...overrides,
  }
}

const defaultLiquidityAddresses = {
  [Chain.MayaChain]: 'mayachain-address',
  [Chain.Ethereum]: 'ethereum-address',
  [Chain.Arbitrum]: 'arbitrum-address',
}

async function setupKeystoreLiquiditySession(
  id: string,
  addresses: Partial<Record<Chain, string>> = defaultLiquidityAddresses,
) {
  const keystore = createFakeKeystoreRecord({
    id,
    label: id,
    addresses,
  })
  const { manager } = await createInitializedTestManager({
    keystores: [keystore],
    unlockKeystores: true,
  })
  await manager.selectSession(keystore.id)
  return { manager, keystore }
}

describe('wallet liquidity helper', () => {
  const extensionEvmAddress = '0x00000000000000000000000000000000000000e1'

  beforeEach(() => {
    resetWalletTestMocks()
  })

  it('prepares guided symmetric deposit steps', async () => {
    const { manager, keystore } = await setupKeystoreLiquiditySession('keystore-liquidity')

    const steps = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '0',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '1000000000000000000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makePool(),
      sessionId: keystore.id,
    }).steps

    expect(steps).toEqual([
      expect.objectContaining({
        amountBaseUnits: '1000000000000000000',
        id: 'asset',
        memo: 'ADD:e:mayachain-address:m0:0',
        sourceAddress: 'ethereum-address',
        destinationAddress: '0xinbound',
      }),
      expect.objectContaining({
        amountBaseUnits: '10000000000',
        id: 'cacao',
        memo: 'ADD:e:ethereum-address:m0:0',
        sourceAddress: 'mayachain-address',
        destinationAddress: null,
        type: 'deposit',
      }),
    ])
  })

  it('routes ERC-20 asset legs through the Maya router', async () => {
    const { manager, keystore } = await setupKeystoreLiquiditySession('keystore-router-liquidity')

    const [assetStep, cacaoStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '10',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '12500000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makeArbUsdcPool(),
      sessionId: keystore.id,
    }).steps

    expect(assetStep).toEqual(
      expect.objectContaining({
        amountBaseUnits: '12500000',
        chain: Chain.Arbitrum,
        destinationAddress: '0xAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
        memo: 'ADD:ac:mayachain-address:m0:10',
        router: '0x700E97EF07219440487840DC472E7120A7FF11F4',
        tokenId: '0XAF88D065E77C8CC2239327C5EDB3A432268E5831',
        type: 'erc20-router',
      }),
    )
    expect(cacaoStep).toEqual(
      expect.objectContaining({
        memo: 'ADD:ac:arbitrum-address:m0:10',
        type: 'deposit',
      }),
    )
  })

  it('submits extension asset and cacao steps via eth_sendTransaction and deposit_transaction', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return ['0xextension']
              }
              if (method === 'eth_sendTransaction') {
                return 'eth-send-hash'
              }
              return null
            },
          },
          mayachain: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['maya1extension']
              }
              if (method === 'deposit_transaction') {
                return 'maya-deposit-hash'
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    const [assetStep, cacaoStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '25',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '1000000000000000000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makePool(),
      sessionId: 'extension:vultisig',
    }).steps

    const assetResult = await submitLiquidityDepositStep(manager, {
      sessionId: 'extension:vultisig',
      step: assetStep!,
    })
    const cacaoResult = await submitLiquidityDepositStep(manager, {
      sessionId: 'extension:vultisig',
      step: cacaoStep!,
    })

    expect(assetResult.txHash).toBe('eth-send-hash')
    expect(cacaoResult.txHash).toBe('maya-deposit-hash')
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'eth_sendTransaction',
        params: [
          expect.objectContaining({
            from: '0xextension',
            memo: 'ADD:e:maya1extension:m0:25',
            to: '0xinbound',
          }),
        ],
      }),
    )
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'deposit_transaction',
        params: [
          expect.objectContaining({
            from: 'maya1extension',
            memo: 'ADD:e:0xextension:m0:25',
          }),
        ],
      }),
    )
  })

  it('submits extension ERC-20 asset legs via approval and depositWithExpiry router calls', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    let txQueryCount = 0
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return [extensionEvmAddress]
              }
              if (method === 'wallet_switchEthereumChain') {
                return null
              }
              if (method === 'eth_call') {
                return '0x0'
              }
              if (method === 'eth_sendTransaction') {
                return requests.filter((request) => request.method === 'eth_sendTransaction').length === 1
                  ? '0xapproval'
                  : '0xliquidity'
              }
              if (method === 'eth_getTransactionByHash') {
                txQueryCount += 1
                return txQueryCount >= 2
                  ? { hash: params?.[0], blockHash: '0xblock' }
                  : { hash: params?.[0], blockHash: null }
              }
              return null
            },
          },
          mayachain: {
            request: async ({ method }) => {
              requests.push({ method })
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['maya1extension']
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')
    await manager.selectChain(Chain.Ethereum)

    const [assetStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '25',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '12500000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makeArbUsdcPool(),
      sessionId: 'extension:vultisig',
    }).steps

    expect(assetStep?.type).toBe('erc20-router')

    const result = await submitLiquidityDepositStep(manager, {
      sessionId: 'extension:vultisig',
      sleep: async () => {},
      step: assetStep!,
    })

    expect(result).toMatchObject({
      route: 'extension',
      stepId: 'asset',
      txHash: '0xliquidity',
    })
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa4b1' }],
      }),
    )
    expect(requests.filter((request) => request.method === 'eth_sendTransaction')).toHaveLength(2)
    const [approvalRequest, routerRequest] = requests.filter(
      (request) => request.method === 'eth_sendTransaction',
    )
    expect(approvalRequest).toMatchObject({
      params: [
        {
          from: extensionEvmAddress,
          to: expect.stringMatching(/^0xaf88d065e77c8c/i),
          value: '0x0',
        },
      ],
    })
    expect(routerRequest).toMatchObject({
      params: [
        {
          from: extensionEvmAddress,
          to: expect.stringMatching(/^0x700e97/i),
          value: '0x0',
        },
      ],
    })
    expect((routerRequest?.params?.[0] as { data?: string })?.data).toMatch(/^0x/)
  })

  it('uses a 1-base-unit ERC-20 router amount for pending asset-side cancels', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    let txQueryCount = 0
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return [extensionEvmAddress]
              }
              if (method === 'wallet_switchEthereumChain') {
                return null
              }
              if (method === 'eth_call') {
                return '0x0'
              }
              if (method === 'eth_sendTransaction') {
                return requests.filter((request) => request.method === 'eth_sendTransaction').length === 1
                  ? '0xapproval-cancel'
                  : '0xcancel-liquidity'
              }
              if (method === 'eth_getTransactionByHash') {
                txQueryCount += 1
                return txQueryCount >= 2
                  ? { hash: params?.[0], blockHash: '0xblock' }
                  : { hash: params?.[0], blockHash: null }
              }
              return null
            },
          },
          mayachain: {
            request: async ({ method }) => {
              requests.push({ method })
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['maya1extension']
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')
    await manager.selectChain(Chain.Arbitrum)

    const result = await submitLiquidityWithdraw(manager, {
      basisPoints: 5000,
      mode: 'cacao',
      pool: makeArbUsdcPool(),
      position: makePosition({
        assetAddress: 'arbitrum-address',
        matchingAddresses: ['maya1extension', '0xextension'],
        pendingAsset: '12500000',
        pendingCacao: '0',
        pool: makeArbUsdcPool().asset,
        state: 'pending',
        units: '0',
      }),
      sessionId: 'extension:vultisig',
      sleep: async () => {},
    })

    expect(result).toMatchObject({
      memo: 'WD:ac:10000:ac:maya1extension',
      route: 'extension',
      txHash: '0xcancel-liquidity',
    })

    const [approvalRequest, routerRequest] = requests.filter(
      (request) => request.method === 'eth_sendTransaction',
    )

    expect(approvalRequest).toMatchObject({
      params: [
        {
          from: extensionEvmAddress,
          to: expect.stringMatching(/^0xaf88d065e77c8c/i),
          value: '0x0',
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: ['0x700e97ef07219440487840dc472e7120a7ff11f4', 1n],
          }),
        },
      ],
    })

    const decodedRouterCall = decodeFunctionData({
      abi: routerAbi,
      data: (routerRequest?.params?.[0] as { data?: `0x${string}` })?.data!,
    })

    expect(decodedRouterCall.functionName).toBe('depositWithExpiry')
    expect(decodedRouterCall.args?.[2]).toBe(1n)
    expect(decodedRouterCall.args?.[3]).toBe('WD:ac:10000:ac:maya1extension')
  })

  it('stops before the router call when an extension approval receipt reverts', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return [extensionEvmAddress]
              }
              if (method === 'wallet_switchEthereumChain') {
                return null
              }
              if (method === 'eth_call') {
                return '0x0'
              }
              if (method === 'eth_sendTransaction') {
                return '0xapproval-failed'
              }
              if (method === 'eth_getTransactionByHash') {
                return { hash: params?.[0], blockHash: '0xblock' }
              }
              if (method === 'eth_getTransactionReceipt') {
                return { transactionHash: params?.[0], blockHash: '0xblock', status: '0x0' }
              }
              return null
            },
          },
          mayachain: {
            request: async ({ method }) => {
              requests.push({ method })
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['maya1extension']
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')
    await manager.selectChain(Chain.Arbitrum)

    const [assetStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '25',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '12500000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makeArbUsdcPool(),
      sessionId: 'extension:vultisig',
    }).steps

    await expect(
      submitLiquidityDepositStep(manager, {
        sessionId: 'extension:vultisig',
        sleep: async () => {},
        step: assetStep!,
      }),
    ).rejects.toThrow('failed before liquidity submission could continue')

    expect(requests.filter((request) => request.method === 'eth_sendTransaction')).toHaveLength(1)
  })

  it('resets a nonzero extension allowance before approving the router amount', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return [extensionEvmAddress]
              }
              if (method === 'wallet_switchEthereumChain') {
                return null
              }
              if (method === 'eth_call') {
                return '0x1'
              }
              if (method === 'eth_sendTransaction') {
                const txCount = requests.filter((request) => request.method === 'eth_sendTransaction').length
                return txCount === 1
                  ? '0xapproval-reset'
                  : txCount === 2
                    ? '0xapproval-final'
                    : '0xliquidity'
              }
              if (method === 'eth_getTransactionByHash') {
                return { hash: params?.[0], blockHash: '0xblock' }
              }
              if (method === 'eth_getTransactionReceipt') {
                return { transactionHash: params?.[0], blockHash: '0xblock', status: '0x1' }
              }
              return null
            },
          },
          mayachain: {
            request: async ({ method }) => {
              requests.push({ method })
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['maya1extension']
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')
    await manager.selectChain(Chain.Arbitrum)

    const [assetStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '25',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '12500000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makeArbUsdcPool(),
      sessionId: 'extension:vultisig',
    }).steps

    const result = await submitLiquidityDepositStep(manager, {
      sessionId: 'extension:vultisig',
      sleep: async () => {},
      step: assetStep!,
    })

    expect(result.txHash).toBe('0xliquidity')
    const [resetApproval, finalApproval, routerRequest] = requests.filter(
      (request) => request.method === 'eth_sendTransaction',
    )

    expect(resetApproval).toMatchObject({
      params: [
        {
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: ['0x700e97ef07219440487840dc472e7120a7ff11f4', 0n],
          }),
        },
      ],
    })
    expect(finalApproval).toMatchObject({
      params: [
        {
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: ['0x700e97ef07219440487840dc472e7120a7ff11f4', 12_500_000n],
          }),
        },
      ],
    })
    expect(routerRequest).toMatchObject({
      params: [
        {
          to: expect.stringMatching(/^0x700e97/i),
        },
      ],
    })
  })

  it('submits keystore maya-side withdraws as deposit memos', async () => {
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: { receiver?: string; amount?: bigint; memo?: string }) => ({
        coin: params,
        toAddress: params.receiver ?? '',
        toAmount: params.amount?.toString() ?? '0',
        memo: params.memo ?? '',
        blockchainSpecific: {
          case: 'mayaSpecific',
          value: {
            accountNumber: 9n,
            sequence: 3n,
            isDeposit: false,
          },
        },
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-withdraw-hash')

    const { manager, keystore } = await setupKeystoreLiquiditySession('keystore-withdraw')
    await initializeKeystoreSession(manager, keystore)

    const result = await submitLiquidityWithdraw(manager, {
      basisPoints: 5000,
      mode: 'symmetric',
      pool: makePool(),
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      memo: 'WD:e:5000',
      route: 'keystore',
      txHash: 'keystore-withdraw-hash',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1n,
        memo: 'WD:e:5000',
        receiver: 'mayachain-address',
      }),
    )
    expect(localSignerMocks.signLocalPayload).toHaveBeenCalled()
  })

  it('builds a MayaChain pending-cacao cancel memo with fixed 10000 bps', async () => {
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: { receiver?: string; memo?: string }) => ({
        coin: params,
        toAddress: params.receiver ?? '',
        memo: params.memo ?? '',
        blockchainSpecific: {
          case: 'mayaSpecific',
          value: {
            accountNumber: 9n,
            sequence: 3n,
            isDeposit: false,
          },
        },
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-pending-cacao-cancel-hash')

    const { manager, keystore } = await setupKeystoreLiquiditySession('keystore-pending-cacao-cancel')
    await initializeKeystoreSession(manager, keystore)

    const result = await submitLiquidityWithdraw(manager, {
      basisPoints: 2500,
      mode: 'asset',
      pool: makePool(),
      position: makePosition({
        state: 'pending',
        units: '0',
        pendingAsset: '0',
        pendingCacao: '5000000000',
      }),
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      memo: 'WD:e:10000',
      route: 'keystore',
      txHash: 'keystore-pending-cacao-cancel-hash',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: 'WD:e:10000',
        receiver: 'mayachain-address',
      }),
    )
  })

  it('builds an external-chain paired-address memo for pending-asset cancels', async () => {
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: { receiver?: string; memo?: string }) => ({
        coin: params,
        toAddress: params.receiver ?? '',
        memo: params.memo ?? '',
        blockchainSpecific: {
          case: 'ethereumSpecific',
          value: {
            nonce: 3n,
            gasLimit: 21_000n,
            maxFeePerGasWei: 1n,
            maxPriorityFeePerGasWei: 1n,
            chainId: 1n,
          },
        },
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-pending-asset-cancel-hash')

    const { manager, keystore } = await setupKeystoreLiquiditySession('keystore-pending-asset-cancel')
    await initializeKeystoreSession(manager, keystore)

    const result = await submitLiquidityWithdraw(manager, {
      basisPoints: 5000,
      mode: 'cacao',
      pool: makePool(),
      position: makePosition({
        state: 'pending',
        units: '0',
        pendingAsset: '1000000000000000000',
        pendingCacao: '0',
      }),
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      memo: 'WD:e:10000:e:mayachain-address',
      route: 'keystore',
      txHash: 'keystore-pending-asset-cancel-hash',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: 'WD:e:10000:e:mayachain-address',
        receiver: '0xinbound',
      }),
    )
  })

  it('keeps the empty paired-address slot for asymmetric affiliate deposits', async () => {
    const { manager, keystore } = await setupKeystoreLiquiditySession('keystore-asym')

    const [assetStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '25',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '1000000000000000000',
      mode: 'asset',
      pool: makePool(),
      sessionId: keystore.id,
    }).steps

    expect(assetStep?.memo).toBe('ADD:e::m0:25')
  })

  it('gates liquidity support when MayaChain is missing', async () => {
    const { manager, keystore } = await setupKeystoreLiquiditySession('keystore-no-maya', {
      [Chain.Ethereum]: 'ethereum-address',
    })

    expect(
      getLiquidityDepositSupport(manager, {
        pool: makePool(),
        mode: 'symmetric',
        sessionId: keystore.id,
      }),
    ).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })
})
