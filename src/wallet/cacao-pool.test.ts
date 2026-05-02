import { Chain } from '@vultisig/sdk'
import { describe, expect, it, vi } from 'vitest'
import { MayaWalletManager } from './manager'
import { createFakeSdkClient, createFakeVault, createMemoryStorage } from './test-utils'
import { depositToCacaoPool, getCacaoPoolDepositSupport } from './cacao-pool'

describe('wallet CACAOPool helper', () => {
  it('submits extension deposits through deposit_transaction mode', async () => {
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

    const result = await depositToCacaoPool(manager, {
      amountBaseUnits: '25000000000',
      sessionId: 'extension:vultisig',
    })

    expect(result).toMatchObject({
      route: 'extension',
      txHash: 'maya-deposit-hash',
      memo: 'POOL+',
    })
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'deposit_transaction',
        params: [
          expect.objectContaining({
            from: 'maya1extension',
            asset: {
              chain: Chain.MayaChain,
              ticker: 'cacao',
            },
            amount: {
              amount: '25000000000',
              decimals: 10,
            },
            memo: 'POOL+',
          }),
        ],
      }),
    )
    const depositRequest = requests.find(
      (request) => request.method === 'deposit_transaction',
    )
    const payload = depositRequest?.params?.[0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('to')
    expect(payload).not.toHaveProperty('data')
  })

  it('submits sdk vault deposits through send prepare, sign, and broadcast', async () => {
    const prepareSendTx = vi.fn(async (params) => ({
      coin: params.coin,
      toAddress: params.receiver,
      toAmount: params.amount.toString(),
      memo: params.memo,
      blockchainSpecific: {
        case: 'mayaSpecific',
        value: {
          accountNumber: 7n,
          sequence: 11n,
          isDeposit: false,
        },
      },
    }))
    const extractMessageHashes = vi.fn(async () => ['0xhash'])
    const sign = vi.fn(async () => ({
      signature: 'sdk-signature',
      format: 'ECDSA',
    }))
    const broadcastTx = vi.fn(async () => 'sdk-broadcast-hash')

    const vault = createFakeVault({
      id: 'vault-cacao',
      name: 'Vault Cacao',
      chains: [Chain.MayaChain],
      prepareSendTx,
      extractMessageHashes,
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

    const result = await depositToCacaoPool(manager, {
      amountBaseUnits: '10000000000',
      sessionId: vault.id,
    })

    expect(result).toMatchObject({
      route: 'sdk',
      txHash: 'sdk-broadcast-hash',
      memo: 'POOL+',
    })
    expect(prepareSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver: 'mayachain-address',
        amount: 10000000000n,
        memo: 'POOL+',
      }),
    )
    expect(extractMessageHashes).toHaveBeenCalled()
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: Chain.MayaChain,
        messageHashes: ['0xhash'],
        transaction: expect.objectContaining({
          toAddress: '',
          toAmount: '10000000000',
          memo: 'POOL+',
          blockchainSpecific: {
            case: 'mayaSpecific',
            value: {
              accountNumber: 7n,
              sequence: 11n,
              isDeposit: true,
            },
          },
        }),
      }),
      expect.any(Object),
    )
    expect(broadcastTx).toHaveBeenCalled()
  })

  it('disables deposits when the active session lacks a MayaChain address', async () => {
    const vault = createFakeVault({
      id: 'vault-no-maya',
      name: 'No Maya',
      chains: [Chain.MayaChain],
      addresses: async () => ({}),
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

    expect(getCacaoPoolDepositSupport(manager, vault.id)).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })

  it('forwards custom withdraw memos through the deposit helper', async () => {
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
                return 'maya-withdraw-hash'
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

    const result = await depositToCacaoPool(manager, {
      amountBaseUnits: '1',
      memo: 'POOL-:2500',
      sessionId: 'extension:vultisig',
    })

    expect(result).toMatchObject({
      route: 'extension',
      txHash: 'maya-withdraw-hash',
      memo: 'POOL-:2500',
    })
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'deposit_transaction',
        params: [
          expect.objectContaining({
            amount: {
              amount: '1',
              decimals: 10,
            },
            memo: 'POOL-:2500',
          }),
        ],
      }),
    )
  })
})
