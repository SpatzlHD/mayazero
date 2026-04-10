import { Chain } from '@vultisig/sdk'
import { describe, expect, it, vi } from 'vitest'
import { MayaWalletManager } from './manager'
import { getAssetSendSupport, submitAssetSend } from './asset-send'
import { createFakeSdkClient, createFakeVault, createMemoryStorage } from './test-utils'

describe('wallet asset send helper', () => {
  it('reports missing session support', async () => {
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()

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
    const vault = createFakeVault({
      id: 'asset-send-no-maya',
      name: 'No Maya Address',
      chains: [Chain.Ethereum],
      addresses: async (chains) => {
        const selectedChains = chains ?? [Chain.Ethereum]
        return selectedChains.reduce<Record<string, string>>((result, chain) => {
          if (chain === Chain.Ethereum) {
            result[chain] = 'ethereum-address'
          }
          return result
        }, {})
      },
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
      getAssetSendSupport(manager, {
        asset: {
          assetId: 'MAYA.CACAO',
          chain: Chain.MayaChain,
          decimals: 10,
          isNative: true,
          ticker: 'CACAO',
        },
        sessionId: vault.id,
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
                return '0xnative-send'
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
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'eth_sendTransaction',
        params: [
          expect.objectContaining({
            from: '0xextension',
            memo: 'test memo',
            to: '0xreceiver',
            amount: {
              amount: '1000000000000000000',
              decimals: 18,
            },
            asset: {
              chain: Chain.Ethereum,
              ticker: 'eth',
            },
          }),
        ],
      }),
    )
  })

  it('submits extension token sends and normalizes hash-shaped results', async () => {
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
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
      prefsStorage: createMemoryStorage(),
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

  it('submits sdk sends through prepare, sign, and broadcast with memo forwarding', async () => {
    const prepareSendTx = vi.fn(async (params) => ({
      coin: params.coin,
      memo: params.memo,
      toAddress: params.receiver,
      toAmount: params.amount.toString(),
    }))
    const sign = vi.fn(async () => ({
      signature: '0xsigned',
      format: 'ECDSA',
    }))
    const broadcastTx = vi.fn(async () => 'sdk-send-hash')
    const vault = createFakeVault({
      id: 'sdk-send-vault',
      name: 'SDK Send Vault',
      chains: [Chain.Ethereum],
      broadcastTx,
      prepareSendTx,
      sign,
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
      sessionId: vault.id,
    })

    expect(result).toMatchObject({
      memo: 'vault memo',
      recipient: '0xreceiver',
      route: 'sdk',
      sourceAddress: 'ethereum-address',
      txHash: 'sdk-send-hash',
    })
    expect(prepareSendTx).toHaveBeenCalledWith(
      {
        amount: 4200000n,
        coin: {
          address: 'ethereum-address',
          chain: Chain.Ethereum,
          contractAddress: '0xtoken',
          decimals: 6,
          isNativeToken: false,
          ticker: 'USDC',
        },
        memo: 'vault memo',
        receiver: '0xreceiver',
      },
    )
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: Chain.Ethereum,
        transaction: expect.objectContaining({
          memo: 'vault memo',
          toAddress: '0xreceiver',
          toAmount: '4200000',
        }),
      }),
      expect.any(Object),
    )
    expect(broadcastTx).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: Chain.Ethereum,
      }),
    )
  })
})
