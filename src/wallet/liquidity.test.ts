import { Chain } from '@vultisig/sdk'
import { describe, expect, it, vi } from 'vitest'
import type { LiquidityPool } from '#/lib/liquidity'
import { MayaWalletManager } from './manager'
import {
  getLiquidityDepositSupport,
  prepareLiquidityDepositSteps,
  submitLiquidityDepositStep,
  submitLiquidityWithdraw,
} from './liquidity'
import { createFakeSdkClient, createFakeVault, createMemoryStorage } from './test-utils'

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
    walletChain: Chain.Arbitrum,
  }
}

describe('wallet liquidity helper', () => {
  it('prepares guided symmetric deposit steps', async () => {
    const vault = createFakeVault({
      id: 'vault-liquidity',
      name: 'Liquidity Vault',
      chains: [Chain.MayaChain, Chain.Ethereum],
    })
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient({
        vaults: [vault],
        activeVaultId: vault.id,
      }).sdk,
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()
    await manager.selectSession(vault.id)

    const steps = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '0',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '1000000000000000000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makePool(),
      sessionId: vault.id,
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
    const vault = createFakeVault({
      id: 'vault-router-liquidity',
      name: 'Router Liquidity Vault',
      chains: [Chain.MayaChain, Chain.Arbitrum],
    })
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient({
        vaults: [vault],
        activeVaultId: vault.id,
      }).sdk,
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()
    await manager.selectSession(vault.id)

    const [assetStep, cacaoStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '10',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '12500000',
      cacaoAmountBaseUnits: '10000000000',
      mode: 'symmetric',
      pool: makeArbUsdcPool(),
      sessionId: vault.id,
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
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
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
      prefsStorage: createMemoryStorage(),
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
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return ['0xextension']
              }
              if (method === 'wallet_switchEthereumChain') {
                return null
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
      prefsStorage: createMemoryStorage(),
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
          from: '0xextension',
          to: expect.stringMatching(/^0xaf88d065e77c8c/i),
          value: '0x0',
        },
      ],
    })
    expect(routerRequest).toMatchObject({
      params: [
        {
          from: '0xextension',
          to: expect.stringMatching(/^0x700e97/i),
          value: '0x0',
        },
      ],
    })
    expect((routerRequest?.params?.[0] as { data?: string })?.data).toMatch(/^0x/)
  })

  it('submits sdk maya-side withdraws as deposit memos', async () => {
    const prepareSendTx = vi.fn(async (params) => ({
      coin: params.coin,
      toAddress: params.receiver,
      toAmount: params.amount.toString(),
      memo: params.memo,
      blockchainSpecific: {
        case: 'mayaSpecific',
        value: {
          accountNumber: 9n,
          sequence: 3n,
          isDeposit: false,
        },
      },
    }))
    const sign = vi.fn(async () => ({
      signature: 'sdk-signature',
      format: 'ECDSA',
    }))
    const broadcastTx = vi.fn(async () => 'sdk-withdraw-hash')
    const vault = createFakeVault({
      id: 'vault-withdraw',
      name: 'Withdraw Vault',
      chains: [Chain.MayaChain, Chain.Ethereum],
      prepareSendTx,
      sign,
      broadcastTx,
    })
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient({
        vaults: [vault],
        activeVaultId: vault.id,
      }).sdk,
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()
    await manager.selectSession(vault.id)

    const result = await submitLiquidityWithdraw(manager, {
      basisPoints: 5000,
      mode: 'symmetric',
      pool: makePool(),
      sessionId: vault.id,
    })

    expect(result).toMatchObject({
      memo: 'WD:e:5000',
      route: 'sdk',
      txHash: 'sdk-withdraw-hash',
    })
    expect(prepareSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1n,
        memo: 'WD:e:5000',
        receiver: 'mayachain-address',
      }),
    )
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: Chain.MayaChain,
        transaction: expect.objectContaining({
          blockchainSpecific: {
            case: 'mayaSpecific',
            value: {
              accountNumber: 9n,
              sequence: 3n,
              isDeposit: true,
            },
          },
          memo: 'WD:e:5000',
          toAddress: '',
        }),
      }),
      expect.any(Object),
    )
  })

  it('keeps the empty paired-address slot for asymmetric affiliate deposits', async () => {
    const vault = createFakeVault({
      id: 'vault-asym',
      name: 'Asymmetric Vault',
      chains: [Chain.MayaChain, Chain.Ethereum],
    })
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient({
        vaults: [vault],
        activeVaultId: vault.id,
      }).sdk,
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()
    await manager.selectSession(vault.id)

    const [assetStep] = prepareLiquidityDepositSteps(manager, {
      affiliate: {
        affiliateBps: '25',
        affiliateName: 'm0',
      },
      assetAmountBaseUnits: '1000000000000000000',
      mode: 'asset',
      pool: makePool(),
      sessionId: vault.id,
    }).steps

    expect(assetStep?.memo).toBe('ADD:e::m0:25')
  })

  it('gates liquidity support when MayaChain is missing', async () => {
    const vault = createFakeVault({
      id: 'vault-no-maya',
      name: 'No Maya',
      chains: [Chain.Ethereum],
      addresses: async () => ({
        [Chain.Ethereum]: 'ethereum-address',
      }),
    })
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient({
        vaults: [vault],
        activeVaultId: vault.id,
      }).sdk,
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()
    await manager.selectSession(vault.id)

    expect(
      getLiquidityDepositSupport(manager, {
        pool: makePool(),
        mode: 'symmetric',
        sessionId: vault.id,
      }),
    ).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })
})
