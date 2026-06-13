import {
  createInitializedTestManager,
  createTestManager,
  initializeKeystoreSession,
  localSignerMocks,
  resetWalletTestMocks,
  walletConnectMocks,
} from './test-mocks'
import { createFakeKeystoreRecord } from './test-utils'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProtocolAsset } from '#/components/ProtocolPrimitives'
import type { SwapQuoteEngineResult } from '#/lib/swap-quote-engine'
import { getSwapExecutionSupport, submitSwap } from './swap'

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

function makeQuote(
  overrides: Partial<Extract<SwapQuoteEngineResult, { route: 'maya' }>> = {},
): Extract<SwapQuoteEngineResult, { route: 'maya' }> {
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
  const extensionEvmAddress = '0x00000000000000000000000000000000000000e1'

  beforeEach(() => {
    resetWalletTestMocks()
  })

  it('chooses deposit mode for MayaChain source swaps', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'keystore-maya-swap',
      label: 'Maya Swap',
      addresses: { [Chain.MayaChain]: 'mayachain-address' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
      unlockKeystores: true,
    })
    await manager.selectSession(keystore.id)

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
      sessionId: keystore.id,
    })

    expect(support).toMatchObject({
      supported: true,
      mode: 'deposit',
    })
  })

  it('chooses erc20-router mode for EVM token swaps with router data', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'keystore-router-swap',
      label: 'Router Swap',
      addresses: {
        [Chain.Ethereum]: extensionEvmAddress,
        [Chain.Arbitrum]: extensionEvmAddress,
      },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
      unlockKeystores: true,
    })
    await manager.selectSession(keystore.id)

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
      sessionId: keystore.id,
    })

    expect(support).toMatchObject({
      supported: true,
      mode: 'erc20-router',
      router: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    })
  })

  it('allows WalletConnect sessions to submit EVM router swaps via eth_sendTransaction', async () => {
    const manager = createTestManager({
      extensionWindow: {},
    })
    await manager.initialize()
    await manager.connectWalletConnect()
    await manager.selectSession('walletconnect:session')

    const support = getSwapExecutionSupport(manager, {
      fromAsset: makeAsset({
        id: 'usdt',
        label: 'USDT',
        ticker: 'USDT',
        decimals: 6,
        mayaAsset: 'ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7',
        tokenId: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      }),
      quote: makeQuote(),
      sessionId: 'walletconnect:session',
    })

    expect(support).toMatchObject({
      supported: true,
      mode: 'erc20-router',
      source: 'walletconnect',
    })
    expect(walletConnectMocks.connectWalletConnect).toHaveBeenCalled()
  })

  it('chooses send mode for native swaps', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'keystore-send-swap',
      label: 'Send Swap',
      addresses: { [Chain.Bitcoin]: 'bc1qsender' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
      unlockKeystores: true,
    })
    await manager.selectSession(keystore.id)

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
      sessionId: keystore.id,
    })

    expect(support).toMatchObject({
      supported: true,
      mode: 'send',
    })
  })

  it('submits extension Maya swaps through deposit_transaction mode', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    const manager = createTestManager({
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

  it('submits keystore Maya deposits using the selected MayaChain asset metadata', async () => {
    const mayaSpecific = {
      accountNumber: 4n,
      sequence: 7n,
      isDeposit: false,
    }
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: {
        coin?: { contractAddress?: string; isNativeToken?: boolean; ticker?: string }
        receiver?: string
        amount?: bigint
        memo?: string
      }) => ({
        coin: params.coin,
        toAddress: params.receiver ?? '',
        toAmount: params.amount?.toString() ?? '0',
        memo: params.memo ?? '',
        blockchainSpecific: {
          case: 'mayaSpecific',
          value: mayaSpecific,
        },
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-maya-swap')

    const keystore = createFakeKeystoreRecord({
      id: 'keystore-maya-asset',
      label: 'Keystore Maya Asset',
      addresses: { [Chain.MayaChain]: 'mayachain-address' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

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
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      mode: 'deposit',
      route: 'keystore',
      txHash: 'keystore-maya-swap',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
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
    expect(localSignerMocks.signLocalPayload).toHaveBeenCalled()
    expect(localSignerMocks.broadcastLocalTx).toHaveBeenCalled()
  })

  it('submits extension ERC-20 router swaps via approval and router eth_sendTransaction calls', async () => {
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
  })

  it('submits extension native EVM swaps as value transfers with the memo hex-encoded in data', async () => {
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
              if (method === 'eth_sendTransaction') {
                return '0xnative-router-swap'
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
    const txRequests = requests.filter((request) => request.method === 'eth_sendTransaction')
    expect(txRequests).toHaveLength(1)
  })
})
