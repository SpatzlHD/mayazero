import { Chain } from '@vultisig/sdk'
import { describe, expect, it, vi } from 'vitest'
import { MayaWalletManager } from './manager'
import { createFakeSdkClient, createFakeVault, createMemoryStorage } from './test-utils'
import { getMayaNameDepositSupport, submitMayaNameDeposit } from './mayaname'

describe('wallet MAYAName helper', () => {
  it('submits extension MAYAName deposits through deposit_transaction mode', async () => {
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
                return 'maya-mayaname-hash'
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
        params: [
          expect.objectContaining({
            from: 'maya1extension',
            asset: {
              chain: Chain.MayaChain,
              ticker: 'cacao',
            },
            amount: {
              amount: '1000000000',
              decimals: 10,
            },
            memo: '~:alpha:MAYA:maya1extension',
          }),
        ],
      }),
    )
  })

  it('submits sdk MAYAName deposits through prepare, sign, and broadcast', async () => {
    const prepareSendTx = vi.fn(async (params) => ({
      coin: params.coin,
      toAddress: params.receiver,
      toAmount: params.amount.toString(),
      memo: params.memo,
      blockchainSpecific: {
        case: 'mayaSpecific',
        value: {
          accountNumber: 3n,
          sequence: 4n,
          isDeposit: false,
        },
      },
    }))
    const extractMessageHashes = vi.fn(async () => ['0xhash'])
    const sign = vi.fn(async () => ({
      signature: 'sdk-signature',
      format: 'ECDSA',
    }))
    const broadcastTx = vi.fn(async () => 'sdk-mayaname-hash')

    const vault = createFakeVault({
      id: 'vault-mayaname',
      name: 'Vault MAYAName',
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

    const result = await submitMayaNameDeposit(manager, {
      amountBaseUnits: '500000000000',
      memo: '~:alpha:MAYA:mayachain-address',
      sessionId: vault.id,
    })

    expect(result).toMatchObject({
      route: 'sdk',
      txHash: 'sdk-mayaname-hash',
      memo: '~:alpha:MAYA:mayachain-address',
    })
    expect(prepareSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver: 'mayachain-address',
        amount: 500000000000n,
        memo: '~:alpha:MAYA:mayachain-address',
      }),
    )
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: Chain.MayaChain,
        messageHashes: ['0xhash'],
        transaction: expect.objectContaining({
          toAddress: '',
          toAmount: '500000000000',
          memo: '~:alpha:MAYA:mayachain-address',
          blockchainSpecific: {
            case: 'mayaSpecific',
            value: {
              accountNumber: 3n,
              sequence: 4n,
              isDeposit: true,
            },
          },
        }),
      }),
      expect.any(Object),
    )
    expect(broadcastTx).toHaveBeenCalled()
  })

  it('disables MAYAName deposits when the active session lacks a MayaChain address', async () => {
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

    expect(getMayaNameDepositSupport(manager, vault.id)).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })
})
