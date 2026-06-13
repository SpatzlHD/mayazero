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
import { BOND_DEPOSIT_BASE_UNITS } from '#/lib/pooled-nodes-bond'
import {
  buildPooledNodeMemo,
  getPooledNodeActionSupport,
  submitPooledNodeAction,
} from './pooled-nodes'

describe('wallet pooled-node helper', () => {
  beforeEach(() => {
    resetWalletTestMocks()
  })

  it('builds LP bond and unbond memos with 0.02 CACAO deposit amount', () => {
    expect(buildPooledNodeMemo({
      action: 'provider.bond',
      amountBaseUnits: '10',
      bondAsset: 'BTC.BTC',
      bondUnits: '5000000000',
      nodeAddress: 'maya1node',
    })).toBe('BOND:BTC.BTC:5000000000:maya1node')

    expect(buildPooledNodeMemo({
      action: 'provider.unbond',
      amountBaseUnits: '20',
      bondAsset: 'BTC.BTC',
      bondUnits: '1000000000',
      nodeAddress: 'maya1node',
    })).toBe('UNBOND:BTC.BTC:1000000000:maya1node')
  })

  it('builds legacy pooled operator memos', () => {
    expect(buildPooledNodeMemo({
      action: 'provider.bond',
      amountBaseUnits: '10',
      nodeAddress: 'maya1node',
    })).toBe('BOND:maya1node')

    expect(buildPooledNodeMemo({
      action: 'provider.unbond',
      amountBaseUnits: '20',
      nodeAddress: 'maya1node',
    })).toBe('UNBOND:maya1node:20')

    expect(buildPooledNodeMemo({
      action: 'operator.add-provider',
      amountBaseUnits: '30',
      nodeAddress: 'maya1node',
      operatorFeeBps: '2500',
      providerAddress: 'maya1provider',
    })).toBe('BOND:maya1node:maya1provider:2500')

    expect(buildPooledNodeMemo({
      action: 'operator.update-fee',
      amountBaseUnits: '1',
      nodeAddress: 'maya1node',
      operatorFeeBps: '4000',
    })).toBe('BOND:maya1node::4000')

    expect(buildPooledNodeMemo({
      action: 'operator.remove-provider',
      amountBaseUnits: '40',
      nodeAddress: 'maya1node',
      providerAddress: 'maya1provider',
    })).toBe('UNBOND:maya1node:40:maya1provider')
  })

  it('submits extension pooled-node deposits through deposit_transaction mode', async () => {
    const requests: Array<{ method: string; params?: unknown[] }> = []
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          mayachain: {
            request: async ({ method, params }) => {
              requests.push({ method, params })
              if (method === 'get_accounts' || method === 'request_accounts') return ['maya1extension']
              if (method === 'deposit_transaction') return 'maya-pooled-hash'
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    const result = await submitPooledNodeAction(manager, {
      action: 'provider.unbond',
      amountBaseUnits: '25000000000',
      bondAsset: 'BTC.BTC',
      bondUnits: '25000000000',
      nodeAddress: 'maya1node',
      sessionId: 'extension:vultisig',
    })

    expect(result).toMatchObject({
      route: 'extension',
      txHash: 'maya-pooled-hash',
      txAmountBaseUnits: BOND_DEPOSIT_BASE_UNITS,
      memo: 'UNBOND:BTC.BTC:25000000000:maya1node',
    })
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'deposit_transaction',
      }),
    )
  })

  it('submits keystore pooled-node deposits through prepare, sign, and broadcast', async () => {
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: { receiver?: string; amount?: bigint; memo?: string }) => ({
        coin: params,
        toAddress: params.receiver ?? '',
        toAmount: params.amount?.toString() ?? '0',
        memo: params.memo ?? '',
        blockchainSpecific: {
          case: 'mayaSpecific',
          value: { accountNumber: 7n, sequence: 11n, isDeposit: false },
        },
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-pooled-hash')

    const keystore = createFakeKeystoreRecord({
      id: 'keystore-pooled',
      label: 'Keystore Pooled',
      addresses: { [Chain.MayaChain]: 'mayachain-address' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

    const result = await submitPooledNodeAction(manager, {
      action: 'operator.add-provider',
      amountBaseUnits: '10000000000',
      nodeAddress: 'maya1node',
      operatorFeeBps: '500',
      providerAddress: 'maya1provider',
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      route: 'keystore',
      txHash: 'keystore-pooled-hash',
      txAmountBaseUnits: '10000000000',
      memo: 'BOND:maya1node:maya1provider:500',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver: 'mayachain-address',
        amount: 10000000000n,
        memo: 'BOND:maya1node:maya1provider:500',
      }),
    )
    expect(localSignerMocks.signLocalPayload).toHaveBeenCalled()
    expect(localSignerMocks.broadcastLocalTx).toHaveBeenCalled()
  })

  it('disables pooled-node actions when the active session lacks a MayaChain address', async () => {
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

    expect(getPooledNodeActionSupport(manager, keystore.id)).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })
})
