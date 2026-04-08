import { describe, expect, it } from 'vitest'
import { Chain } from '@vultisig/sdk'
import { WalletCapabilityError } from './errors'
import { MayaWalletManager } from './manager'
import {
  createFakeExtensionWindow,
  createMemoryStorage,
  createFakeSdkClient,
  createFakeVault,
} from './test-utils'

describe('MayaWalletManager', () => {
  it('initializes, discovers sdk and extension sessions, and restores preferences', async () => {
    const storage = createMemoryStorage()
    storage.setItem(
      'maya-wallet-manager',
      JSON.stringify({
        selectedSessionId: 'vault-1',
        preferredVaultId: 'vault-1',
        activeChain: Chain.MayaChain,
      }),
    )

    const vault = createFakeVault({
      id: 'vault-1',
      name: 'Primary Vault',
      chains: [Chain.Ethereum, Chain.MayaChain],
    })
    const { sdk } = createFakeSdkClient({
      vaults: [vault],
      activeVaultId: vault.id,
    })
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })

    await manager.initialize()

    const state = manager.getState()
    expect(state.initialized).toBe(true)
    expect(state.sessions).toHaveLength(2)
    expect(state.activeSessionId).toBe('vault-1')
    expect(state.activeChain).toBe(Chain.MayaChain)
    expect(
      state.sessions.find((session) => session.id === 'vault-1')?.chains,
    ).toEqual(
      expect.arrayContaining([
        Chain.MayaChain,
        Chain.THORChain,
        Chain.Kujira,
        Chain.Arbitrum,
        Chain.Dash,
        Chain.Zcash,
      ]),
    )
    expect(
      state.sessions.find((session) => session.id === 'vault-1')?.chains,
    ).not.toContain(Chain.Solana)
  })

  it('rejects unsupported extension commands with a capability error', async () => {
    const storage = createMemoryStorage()
    const { sdk } = createFakeSdkClient()
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    await expect(
      manager.execute('portfolio.get', {
        input: {},
      }),
    ).rejects.toBeInstanceOf(WalletCapabilityError)
  })

  it('exposes chain-aware command support for extension sessions', async () => {
    const storage = createMemoryStorage()
    const { sdk } = createFakeSdkClient()
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    expect(
      manager.canExecute('balance.get', {
        chain: Chain.Ethereum,
      }),
    ).toBe(true)
    expect(
      manager.canExecute('balance.get', {
        chain: Chain.Arbitrum,
      }),
    ).toBe(true)
    expect(
      manager.canExecute('balance.get', {
        chain: Chain.MayaChain,
      }),
    ).toBe(false)
  })

  it('tracks command results, balances, and secure vault progress in operation state', async () => {
    const storage = createMemoryStorage()
    const vault = createFakeVault({
      id: 'vault-2',
      name: 'Secure Vault',
      chains: [Chain.Ethereum],
    })
    const { sdk } = createFakeSdkClient({
      vaults: [vault],
      activeVaultId: vault.id,
    })
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })

    await manager.initialize()
    await manager.selectSession('vault-2')
    await manager.execute('balance.get', {
      input: { chain: Chain.Ethereum },
    })

    expect(manager.getState().balancesBySession['vault-2']?.Ethereum).toBeDefined()

    const secureResult = await manager.createSecureVault({
      name: 'Team Wallet',
      devices: 2,
      threshold: 2,
    })

    expect(secureResult.vaultId).toContain('secure-team-wallet')
    const secureOperation = manager
      .getState()
      .operations.find((operation) => operation.name === 'vault.create.secure')
    expect(secureOperation?.status).toBe('success')
    expect(secureOperation?.qrPayload).toBe('vultisig://qr-payload')
    expect(secureOperation?.deviceJoin?.required).toBe(2)
  })

  it('persists new selections across manager instances', async () => {
    const storage = createMemoryStorage()
    const vault = createFakeVault({
      id: 'persisted-vault',
      name: 'Persisted Vault',
      chains: [Chain.Ethereum, Chain.MayaChain],
    })
    const { sdk } = createFakeSdkClient({
      vaults: [vault],
      activeVaultId: vault.id,
    })

    const firstManager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })
    await firstManager.initialize()
    await firstManager.selectSession('extension:vultisig')
    await firstManager.execute('chain.switch', {
      input: { chain: Chain.Ethereum },
      sessionId: 'extension:vultisig',
    })

    const secondManager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })
    await secondManager.initialize()

    expect(secondManager.getState().activeSessionId).toBe('extension:vultisig')
    expect(secondManager.getState().activeChain).toBe(Chain.Ethereum)
  })

  it('connects all available extension providers in one accounts.connect call', async () => {
    const storage = createMemoryStorage()
    const { sdk } = createFakeSdkClient()
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method }) => {
              if (method === 'eth_accounts') {
                return []
              }
              if (method === 'eth_requestAccounts') {
                return ['0xabc']
              }
              return null
            },
          },
          mayachain: {
            request: async ({ method }) => {
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['maya1abc']
              }
              return null
            },
          },
          bitcoin: {
            request: async ({ method }) => {
              if (method === 'get_accounts' || method === 'request_accounts') {
                return ['bc1qabc']
              }
              return null
            },
          },
        },
      },
      prefsStorage: storage,
    })

    await manager.initialize()
    await manager.selectSession('extension:vultisig')

    const result = await manager.execute('accounts.connect', {
      input: {},
      sessionId: 'extension:vultisig',
    })

    expect(result.accounts).toEqual(
      expect.arrayContaining([
        { chain: Chain.Ethereum, address: '0xabc' },
        { chain: Chain.Arbitrum, address: '0xabc' },
        { chain: Chain.MayaChain, address: 'maya1abc' },
        { chain: Chain.Bitcoin, address: 'bc1qabc' },
      ]),
    )
    expect(
      manager
        .getState()
        .sessions.find((session) => session.id === 'extension:vultisig')
        ?.addresses,
    ).toMatchObject({
      [Chain.Ethereum]: '0xabc',
      [Chain.Arbitrum]: '0xabc',
      [Chain.MayaChain]: 'maya1abc',
      [Chain.Bitcoin]: 'bc1qabc',
    })
  })
})
