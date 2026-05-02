import { Chain } from '@vultisig/sdk'
import { describe, expect, it, vi } from 'vitest'
import type { ProtocolAsset } from '#/components/ProtocolPrimitives'
import type { SwapQuoteEngineResult } from '#/lib/swap-quote-engine'
import { MayaWalletManager } from './manager'
import { getSwapExecutionSupport, submitSwap } from './swap'
import { createFakeSdkClient, createFakeVault, createMemoryStorage } from './test-utils'

function makeAsset(overrides: Partial<ProtocolAsset>): ProtocolAsset {
  return {
    id: 'eth',
    label: 'ETH',
    chain: Chain.Ethereum,
    ticker: 'ETH',
    decimals: 18,
    blurb: 'Ethereum',
    mayaAsset: 'ETH.ETH',
    ...overrides,
  }
}

function makeQuote(overrides: Partial<Extract<SwapQuoteEngineResult, { route: 'maya' }>> = {}): Extract<SwapQuoteEngineResult, { route: 'maya' }> {
  return {
    route: 'maya',
    rawQuote: {
      expected_amount_out: '1000',
      inbound_address: '0x2222222222222222222222222222222222222222',
      memo: '=:BTC.BTC:bc1destination',
    },
    estimatedOutput: '1000',
    outputDecimals: 8,
    fees: {
      network: '100',
      total: '100',
    },
    memo: '=:BTC.BTC:bc1destination',
    effectiveAffiliates: [],
    canPrepare: false,
    prepareReason: 'Maya-native quotes require the custom execution flow.',
    provider: 'maya',
    inboundAddress: '0x2222222222222222222222222222222222222222',
    expiry: Date.now() + 60_000,
    inboundDetails: {
      chain: 'ETH',
      inboundAddress: '0x2222222222222222222222222222222222222222',
      lpActionsPaused: false,
      tradingPaused: false,
      halted: false,
      dustThreshold: '0',
      router: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    },
    ...overrides,
  }
}

describe('wallet swap helper', () => {
  it('chooses deposit mode for MayaChain source swaps', async () => {
    const vault = createFakeVault({
      id: 'vault-maya-swap',
      name: 'Maya Swap',
      chains: [Chain.MayaChain],
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

    const support = getSwapExecutionSupport(manager, {
      fromAsset: makeAsset({
        id: 'cacao',
        label: 'CACAO',
        chain: Chain.MayaChain,
        ticker: 'CACAO',
        decimals: 10,
        mayaAsset: 'MAYA.CACAO',
      }),
      quote: makeQuote({
        rawQuote: {
          expected_amount_out: '1000',
          memo: '=:BTC.BTC:bc1destination',
        },
        inboundDetails: {
          chain: 'MAYA',
          lpActionsPaused: false,
          tradingPaused: false,
          halted: false,
          dustThreshold: '0',
        },
      }),
      sessionId: vault.id,
    })

    expect(support).toMatchObject({
      supported: true,
      mode: 'deposit',
    })
  })

  it('chooses erc20-router mode for EVM token swaps with router data', async () => {
    const vault = createFakeVault({
      id: 'vault-router-swap',
      name: 'Router Swap',
      chains: [Chain.Ethereum],
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

    const support = getSwapExecutionSupport(manager, {
      fromAsset: makeAsset({
        id: 'usdc',
        label: 'USDC',
        ticker: 'USDC',
        decimals: 6,
        mayaAsset: 'ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tokenId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      }),
      quote: makeQuote(),
      sessionId: vault.id,
    })

    expect(support).toMatchObject({
      supported: true,
      mode: 'erc20-router',
      router: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    })
  })

  it('chooses send mode for native swaps', async () => {
    const vault = createFakeVault({
      id: 'vault-send-swap',
      name: 'Send Swap',
      chains: [Chain.Bitcoin],
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

    const support = getSwapExecutionSupport(manager, {
      fromAsset: makeAsset({
        id: 'btc',
        label: 'BTC',
        chain: Chain.Bitcoin,
        ticker: 'BTC',
        decimals: 8,
        mayaAsset: 'BTC.BTC',
      }),
      quote: makeQuote({
        rawQuote: {
          expected_amount_out: '1000',
          inbound_address: 'bc1qinbound',
          memo: '=:ETH.ETH:0xreceiver',
        },
        inboundAddress: 'bc1qinbound',
        inboundDetails: {
          chain: 'BTC',
          inboundAddress: 'bc1qinbound',
          lpActionsPaused: false,
          tradingPaused: false,
          halted: false,
          dustThreshold: '10000',
        },
      }),
      sessionId: vault.id,
    })

    expect(support).toMatchObject({
      supported: true,
      mode: 'send',
    })
  })

  it('submits extension Maya swaps through deposit_transaction mode', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
      extensionWindow: {
        vultisig: {
          mayachain: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['maya1extension']
              }
              if (method === 'deposit_transaction') {
                return 'maya-swap-hash'
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

    const result = await submitSwap(manager, {
      amount: '1',
      fromAsset: makeAsset({
        id: 'cacao',
        label: 'CACAO',
        chain: Chain.MayaChain,
        ticker: 'CACAO',
        decimals: 10,
        mayaAsset: 'MAYA.CACAO',
      }),
      quote: makeQuote({
        rawQuote: {
          expected_amount_out: '1000',
          memo: '=:ETH.ETH:0xreceiver',
        },
        inboundDetails: {
          chain: 'MAYA',
          lpActionsPaused: false,
          tradingPaused: false,
          halted: false,
          dustThreshold: '0',
        },
      }),
      sessionId: 'extension:vultisig',
    })

    expect(result).toMatchObject({
      mode: 'deposit',
      route: 'extension',
      txHash: 'maya-swap-hash',
    })
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'deposit_transaction',
        params: [
          expect.objectContaining({
            amount: expect.objectContaining({
              decimals: 10,
            }),
            asset: expect.objectContaining({
              ticker: 'cacao',
            }),
          }),
        ],
      }),
    )
  })

  it('submits SDK Maya deposits using the selected MayaChain asset metadata', async () => {
    const mayaSpecific = {
      accountNumber: 4n,
      sequence: 7n,
      isDeposit: false,
    }
    Object.defineProperty(mayaSpecific, '__bufMessage', {
      value: true,
      enumerable: false,
    })
    const prepareSendTx = vi.fn(async (params) => ({
      coin: params.coin,
      toAddress: params.receiver,
      toAmount: params.amount.toString(),
      memo: params.memo,
      blockchainSpecific: {
        case: 'mayaSpecific',
        value: mayaSpecific,
      },
    }))
    const sign = vi.fn(async () => ({
      signature: 'sdk-signature',
      format: 'ECDSA',
    }))
    const broadcastTx = vi.fn(async () => 'sdk-maya-maya-swap')
    const vault = createFakeVault({
      id: 'vault-sdk-maya-asset',
      name: 'SDK Maya Asset',
      chains: [Chain.MayaChain],
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

    const result = await submitSwap(manager, {
      amount: '1.5',
      fromAsset: makeAsset({
        id: 'maya',
        label: 'MAYA',
        chain: Chain.MayaChain,
        ticker: 'MAYA',
        decimals: 4,
        mayaAsset: 'MAYA.MAYA',
      }),
      quote: makeQuote({
        rawQuote: {
          expected_amount_out: '5881311',
          memo: '=:ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831:0x8CcB8B8B30faBe30591b20D9A1B55CfAeF69B4e2:585190444/3/0',
        },
        memo: '=:ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831:0x8CcB8B8B30faBe30591b20D9A1B55CfAeF69B4e2:585190444/3/0',
        inboundDetails: {
          chain: 'MAYA',
          lpActionsPaused: false,
          tradingPaused: false,
          halted: false,
          dustThreshold: '0',
        },
      }),
      sessionId: vault.id,
    })

    expect(result).toMatchObject({
      mode: 'deposit',
      route: 'sdk',
      txHash: 'sdk-maya-maya-swap',
    })
    expect(prepareSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 15000n,
        coin: expect.objectContaining({
          chain: Chain.MayaChain,
          contractAddress: 'MAYA.MAYA',
          decimals: 4,
          isNativeToken: false,
          ticker: 'MAYA',
        }),
        memo: '=:ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831:0x8CcB8B8B30faBe30591b20D9A1B55CfAeF69B4e2:585190444/3/0',
        receiver: 'mayachain-address',
      }),
    )
    expect(sign).toHaveBeenCalled()
    expect(broadcastTx).toHaveBeenCalled()
    const signedPayload = sign.mock.calls[0]?.[0]?.transaction as {
      coin?: { contractAddress?: string; isNativeToken?: boolean; ticker?: string }
      toAddress?: string
      toAmount?: string
      memo?: string
      blockchainSpecific?: { case?: string; value?: unknown }
    }
    expect(signedPayload.coin).toEqual(
      expect.objectContaining({
        contractAddress: 'MAYA.MAYA',
        isNativeToken: false,
        ticker: 'MAYA',
      }),
    )
    expect(signedPayload.toAddress).toBe('')
    expect(signedPayload.toAmount).toBe('15000')
    expect(signedPayload.memo).toBe(
      '=:ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831:0x8CcB8B8B30faBe30591b20D9A1B55CfAeF69B4e2:585190444/3/0',
    )
    expect(signedPayload.blockchainSpecific?.case).toBe('mayaSpecific')
    expect(signedPayload.blockchainSpecific?.value).toBe(mayaSpecific)
    expect(
      Object.getOwnPropertyDescriptor(mayaSpecific, '__bufMessage')?.value,
    ).toBe(true)
  })

  it('submits extension ERC-20 router swaps via approval and router eth_sendTransaction calls', async () => {
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
                  : '0xswap'
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
        },
      },
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')
    await manager.selectChain(Chain.Arbitrum)

    const statuses: string[] = []
    const result = await submitSwap(manager, {
      amount: '12.5',
      fromAsset: makeAsset({
        id: 'usdc',
        label: 'USDC',
        ticker: 'USDC',
        decimals: 6,
        mayaAsset: 'ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tokenId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      }),
      quote: makeQuote({
        memo: '=:BTC.BTC:bc1destination',
      }),
      sessionId: 'extension:vultisig',
      onStatusChange: (status) => {
        statuses.push(status)
      },
      sleep: async () => {},
    })

    expect(result).toMatchObject({
      mode: 'erc20-router',
      route: 'extension',
      approvalTxHash: '0xapproval',
      txHash: '0xswap',
    })
    expect(statuses).toEqual(['approving', 'waiting-approval', 'submitting'])
    expect(requests.filter((request) => request.method === 'eth_sendTransaction')).toHaveLength(2)
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      }),
    )
  })

  it('submits extension native EVM swaps as value transfers with the memo hex-encoded in data', async () => {
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
              if (method === 'wallet_switchEthereumChain') {
                return null
              }
              if (method === 'eth_sendTransaction') {
                return '0xnative-router-swap'
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
    await manager.selectChain(Chain.Arbitrum)
    await manager.selectChain(Chain.Ethereum)

    const statuses: string[] = []
    const result = await submitSwap(manager, {
      amount: '0.0005',
      fromAsset: makeAsset({
        id: 'arb-eth',
        chain: Chain.Arbitrum,
        mayaAsset: 'ARB.ETH',
      }),
      quote: makeQuote({
        inboundAddress: '0XAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
        inboundDetails: {
          chain: 'ARB',
          inboundAddress: '0XAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
          lpActionsPaused: false,
          tradingPaused: false,
          halted: false,
          dustThreshold: '0',
          router: '0X700E97EF07219440487840DC472E7120A7FF11F4',
        },
        memo: '=:ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831:0xreceiver',
      }),
      sessionId: 'extension:vultisig',
      onStatusChange: (status) => {
        statuses.push(status)
      },
    })

    expect(result).toMatchObject({
      mode: 'send',
      route: 'extension',
      txHash: '0xnative-router-swap',
    })
    expect(statuses).toEqual(['submitting'])
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa4b1' }],
      }),
    )
    const txRequests = requests.filter((request) => request.method === 'eth_sendTransaction')
    expect(txRequests).toHaveLength(1)
    expect(txRequests[0]).toMatchObject({
      params: [
        {
          from: '0xextension',
          to: '0xAB1722696e2320687B80D9dc62030bd6fBc8Bbfd',
          value: '0x1c6bf52634000',
          data: '0x3d3a4152422e555344432d3058414638384430363545373743384343323233393332374335454442334134333232363845353833313a30787265636569766572',
        },
      ],
    })
  })

  it('submits SDK router swaps through raw signing and raw broadcast after approval confirmation', async () => {
    let statusCalls = 0
    const signBytes = vi
      .fn()
      .mockResolvedValue({
        signature: '0x304402206afc74687c9fdc312e96b3cb2a9c3cbdbca46611c896b5c71a1a96b2a02600552902200ef0d2daf91dce60e5343a69f2465eba711d001dbf4a712fac53',
        recovery: 0,
        format: 'ECDSA',
      })
    const broadcastRawTx = vi
      .fn()
      .mockResolvedValueOnce('0xapproval-raw')
      .mockResolvedValueOnce('0xswap-raw')
    const getTxStatus = vi.fn(async () => {
      statusCalls += 1
      return statusCalls >= 2
        ? { status: 'success' }
        : { status: 'pending' }
    })
    const vault = createFakeVault({
      id: 'vault-sdk-router',
      name: 'SDK Router',
      chains: [Chain.Ethereum],
      signBytes,
      broadcastRawTx,
      getTxStatus,
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

    const statuses: string[] = []
    const result = await submitSwap(manager, {
      amount: '25',
      fromAsset: makeAsset({
        id: 'usdc',
        label: 'USDC',
        ticker: 'USDC',
        decimals: 6,
        mayaAsset: 'ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831',
        tokenId: '0XAF88D065E77C8CC2239327C5EDB3A432268E5831',
      }),
      quote: makeQuote({
        inboundAddress: '0XAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
        inboundDetails: {
          chain: 'ARB',
          inboundAddress: '0XAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
          lpActionsPaused: false,
          tradingPaused: false,
          halted: false,
          dustThreshold: '0',
          router: '0X700E97EF07219440487840DC472E7120A7FF11F4',
        },
      }),
      sessionId: vault.id,
      evmClientFactory: () => ({
        estimateFeesPerGas: async () => ({
          maxFeePerGas: 10n,
          maxPriorityFeePerGas: 1n,
        }),
        getGasPrice: async () => 10n,
        getTransactionCount: async () => 9,
        estimateGas: async () => 120000n,
      }),
      onStatusChange: (status) => {
        statuses.push(status)
      },
      sleep: async () => {},
    })

    expect(result).toMatchObject({
      mode: 'erc20-router',
      route: 'sdk',
      approvalTxHash: '0xapproval-raw',
      txHash: '0xswap-raw',
    })
    expect(signBytes).toHaveBeenCalledTimes(2)
    expect(broadcastRawTx).toHaveBeenCalledTimes(2)
    expect(getTxStatus).toHaveBeenCalled()
    expect(statuses).toEqual(['approving', 'waiting-approval', 'submitting'])
    const firstRawTx = broadcastRawTx.mock.calls[0]?.[0]?.rawTx as string
    expect(firstRawTx).toMatch(/^0x02/i)
  })
})
