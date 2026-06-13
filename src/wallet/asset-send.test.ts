import {
  createInitializedTestManager,
  createTestManager,
  initializeKeystoreSession,
  localSignerMocks,
  resetWalletTestMocks,
} from './test-mocks'
import { createFakeKeystoreRecord, createEmptyExtensionWindow } from './test-utils'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAssetSendSupport, submitAssetSend } from './asset-send'

describe('wallet asset send helper', () => {
  beforeEach(() => {
    resetWalletTestMocks()
  })

  it('reports missing session support', async () => {
    const { manager } = await createInitializedTestManager({
      extensionWindow: createEmptyExtensionWindow(),
    })

    expect(
      getAssetSendSupport(manager, {
        asset: {
          assetId: 'ETH.ETH',
          chain: Chain.Ethereum,
          decimals: 18,
          isNative: true,
          ticker: 'ETH',
        },
      }),
    ).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a wallet session to send assets.',
      }),
    )
  })

  it('reports missing chain addresses in support checks', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'asset-send-no-maya',
      label: 'No Maya Address',
      addresses: { [Chain.Ethereum]: 'ethereum-address' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
      unlockKeystores: true,
    })
    await manager.selectSession(keystore.id)

    expect(
      getAssetSendSupport(manager, {
        asset: {
          assetId: 'MAYA.CACAO',
          chain: Chain.MayaChain,
          decimals: 10,
          isNative: true,
          ticker: 'CACAO',
        },
        sessionId: keystore.id,
      }),
    ).toEqual(
      expect.objectContaining({
        supported: false,
        reason: 'Connect a MayaChain address for the active session.',
      }),
    )
  })

  it('submits extension native sends through provider transaction payloads', async () => {
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
                return '0xnative-send'
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    const result = await submitAssetSend(manager, {
      amountBaseUnits: '1000000000000000000',
      asset: {
        assetId: 'ETH.ETH',
        chain: Chain.Ethereum,
        decimals: 18,
        isNative: true,
        ticker: 'ETH',
      },
      memo: 'test memo',
      recipient: '0xreceiver',
      sessionId: 'extension:vultisig',
    })

    expect(result).toMatchObject({
      memo: 'test memo',
      recipient: '0xreceiver',
      route: 'extension',
      sourceAddress: '0xextension',
      txHash: '0xnative-send',
    })
  })

  it('submits extension token sends and normalizes hash-shaped results', async () => {
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method }) => {
              if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return ['0xextension']
              }
              if (method === 'eth_sendTransaction') {
                return { hash: '0xtoken-send' }
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    const result = await submitAssetSend(manager, {
      amountBaseUnits: '5000000',
      asset: {
        assetId: 'ETH.USDC-0xToken',
        chain: Chain.Ethereum,
        decimals: 6,
        isNative: false,
        ticker: 'USDC',
        tokenId: '0xtoken',
      },
      recipient: '0xreceiver',
      sessionId: 'extension:vultisig',
    })

    expect(result.txHash).toBe('0xtoken-send')
    expect(result.route).toBe('extension')
  })

  it('submits keystore sends through prepare, sign, and broadcast with memo forwarding', async () => {
    localSignerMocks.prepareLocalSendTx.mockImplementation(
      async (params: { coin?: unknown; memo?: string; receiver?: string; amount?: bigint }) => ({
        coin: params.coin,
        memo: params.memo,
        toAddress: params.receiver,
        toAmount: params.amount?.toString() ?? '0',
      }),
    )
    localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-send-hash')

    const keystore = createFakeKeystoreRecord({
      id: 'keystore-send',
      label: 'Keystore Send',
      addresses: { [Chain.Ethereum]: '0x00000000000000000000000000000000000000e1' },
    })
    const { manager } = await createInitializedTestManager({
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

    const result = await submitAssetSend(manager, {
      amountBaseUnits: '4200000',
      asset: {
        assetId: 'ETH.USDC-0xToken',
        chain: Chain.Ethereum,
        decimals: 6,
        isNative: false,
        ticker: 'USDC',
        tokenId: '0xtoken',
      },
      memo: 'vault memo',
      recipient: '0xreceiver',
      sessionId: keystore.id,
    })

    expect(result).toMatchObject({
      memo: 'vault memo',
      recipient: '0xreceiver',
      route: 'keystore',
      sourceAddress: '0x00000000000000000000000000000000000000e1',
      txHash: 'keystore-send-hash',
    })
    expect(localSignerMocks.prepareLocalSendTx).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4200000n,
        memo: 'vault memo',
        receiver: '0xreceiver',
      }),
    )
    expect(localSignerMocks.signLocalPayload).toHaveBeenCalled()
    expect(localSignerMocks.broadcastLocalTx).toHaveBeenCalled()
  })
})
