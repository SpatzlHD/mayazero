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
