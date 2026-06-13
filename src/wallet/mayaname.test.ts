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
import { getMayaNameDepositSupport, submitMayaNameDeposit } from './mayaname'

describe('wallet MAYAName helper', () => {
  beforeEach(() => {
    resetWalletTestMocks()
  })

  it('submits extension MAYAName deposits through deposit_transaction mode', async () => {
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
                return 'maya-mayaname-hash'
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    const result = await submitMayaNameDeposit(manager, {
      amountBaseUnits: '1000000000',
      memo: '~:alpha:MAYA:maya1extension',
      sessionId: 'extension:vultisig',
    })

    expect(result).toMatchObject({
      route: 'extension',
      txHash: 'maya-mayaname-hash',
      memo: '~:alpha:MAYA:maya1extension',
    })
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'deposit_transaction',
      }),
    )
  })

  it('submits keystore MAYAName deposits through prepare, sign, and broadcast', async () => {
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: { receiver?: string; amount?: bigint; memo?: string }) => ({
        coin: params,
        toAddress: params.receiver ?? '',
        toAmount: params.amount?.toString() ?? '0',
        memo: params.memo ?? '',
        blockchainSpecific: {
          case: 'mayaSpecific',
          value: {
            accountNumber: 3n,
            sequence: 4n,
            isDeposit: false,
          },
        },
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-mayaname-hash')

    const keystore = createFakeKeystoreRecord({
      id: 'keystore-mayaname',
      label: 'Keystore MAYAName',
      addresses: { [Chain.MayaChain]: 'mayachain-address' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

    const result = await submitMayaNameDeposit(manager, {
      amountBaseUnits: '500000000000',
      memo: '~:alpha:MAYA:mayachain-address',
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      route: 'keystore',
      txHash: 'keystore-mayaname-hash',
      memo: '~:alpha:MAYA:mayachain-address',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver: 'mayachain-address',
        amount: 500000000000n,
        memo: '~:alpha:MAYA:mayachain-address',
      }),
    )
    expect(localSignerMocks.signLocalPayload).toHaveBeenCalled()
    expect(localSignerMocks.broadcastLocalTx).toHaveBeenCalled()
  })

  it('disables MAYAName deposits when the active session lacks a MayaChain address', async () => {
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

    expect(getMayaNameDepositSupport(manager, keystore.id)).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })
})
