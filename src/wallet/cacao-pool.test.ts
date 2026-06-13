import {
  createInitializedTestManager,
  createTestManager,
  initializeKeystoreSession,
  localSignerMocks,
  resetWalletTestMocks,
} from './test-mocks'
import { createFakeKeystoreRecord } from './test-utils'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { beforeEach, describe, expect, it } from 'vitest'
import { depositToCacaoPool, getCacaoPoolDepositSupport } from './cacao-pool'

describe('wallet CACAOPool helper', () => {
  beforeEach(() => {
    resetWalletTestMocks()
  })

  it('submits extension deposits through deposit_transaction mode', async () => {
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
      }),
    )
  })

  it('submits keystore deposits through send prepare, sign, and broadcast', async () => {
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: { receiver?: string; amount?: bigint; memo?: string }) => ({
        coin: params,
        toAddress: params.receiver ?? '',
        toAmount: params.amount?.toString() ?? '0',
        memo: params.memo ?? '',
        blockchainSpecific: {
          case: 'mayaSpecific',
          value: {
            accountNumber: 7n,
            sequence: 11n,
            isDeposit: false,
          },
        },
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-broadcast-hash')

    const keystore = createFakeKeystoreRecord({
      id: 'keystore-cacao',
      label: 'Keystore Cacao',
      addresses: { [Chain.MayaChain]: 'mayachain-address' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

    const result = await depositToCacaoPool(manager, {
      amountBaseUnits: '10000000000',
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      route: 'keystore',
      txHash: 'keystore-broadcast-hash',
      memo: 'POOL+',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver: 'mayachain-address',
        amount: 10000000000n,
        memo: 'POOL+',
      }),
    )
    expect(localSignerMocks.signLocalPayload).toHaveBeenCalled()
    expect(localSignerMocks.broadcastLocalTx).toHaveBeenCalled()
  })

  it('disables deposits when the active session lacks a MayaChain address', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'keystore-no-maya',
      label: 'No Maya',
      addresses: {},
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
      unlockKeystores: true,
    })
    await manager.selectSession(keystore.id)

    expect(getCacaoPoolDepositSupport(manager, keystore.id)).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })

  it('forwards custom withdraw memos through the deposit helper', async () => {
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
                return 'maya-withdraw-hash'
              }
              return null
            },
          },
        },
      },
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
  })
})
