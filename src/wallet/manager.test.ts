import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Chain } from '@vultisig/sdk'
import { trackAnalyticsEvent } from '#/analytics'
import { supportedWalletChains } from './chains'
import { WalletCapabilityError } from './errors'
import { createFastVaultImportJourneySteps } from './journeys'
import { MayaWalletManager } from './manager'
import {
  createFakeExtensionWindow,
  createMemoryStorage,
  createFakeSdkClient,
  createFakeVault,
} from './test-utils'

vi.mock('#/analytics', async () => {
  const actual = await vi.importActual<typeof import('#/analytics')>('#/analytics')
  return {
    ...actual,
    trackAnalyticsEvent: vi.fn(),
  }
})

describe('MayaWalletManager', () => {
  beforeEach(() => {
    vi.mocked(trackAnalyticsEvent).mockClear()
  })

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
        Chain.Cardano,
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

  it('creates a fast vault from seedphrase with Maya-supported chain discovery only', async () => {
    const storage = createMemoryStorage()
    const { sdk, getLastSeedphraseImportOptions } = createFakeSdkClient()
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })
    await manager.initialize()

    const journeyId = manager.createJourney({
      kind: 'vault.fast.import',
      title: 'Import Fast Vault',
      source: 'fast-vault',
      routePath: '/vault-setup',
      steps: createFastVaultImportJourneySteps(),
    })

    const result = await manager.createFastVaultFromSeedphrase({
      mnemonic:
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      name: 'Imported Vault',
      email: 'user@example.com',
      password: 'StrongPassword123!',
      journeyId,
    })

    expect(result.vaultId).toBe('pending-imported-fast-vault')
    expect(getLastSeedphraseImportOptions()).toMatchObject({
      discoverChains: true,
      chainsToScan: supportedWalletChains,
      name: 'Imported Vault',
      email: 'user@example.com',
    })

    const operation = manager
      .getState()
      .operations.find((candidate) => candidate.name === 'vault.create.fast.import')
    expect(operation?.status).toBe('success')
    expect(operation?.progress).toMatchObject({
      message: 'Creating imported fast vault',
    })

    const journey = manager
      .getState()
      .journeys.find((candidate) => candidate.id === journeyId)
    expect(journey?.steps.find((step) => step.key === 'discovering-chains')).toMatchObject({
      status: 'success',
      message: 'Discovering balances',
    })
    expect(journey?.steps.find((step) => step.key === 'creating')).toMatchObject({
      status: 'success',
      message: 'Creating imported fast vault',
    })
  })

  it('verifies an imported fast vault and selects it as the active session', async () => {
    const storage = createMemoryStorage()
    const { sdk } = createFakeSdkClient()
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })
    await manager.initialize()

    await manager.verifyFastVault('pending-imported-fast-vault', '123456')

    expect(manager.getState().activeSessionId).toBe('pending-imported-fast-vault')
    expect(
      manager.getState().sessions.some((session) => session.id === 'pending-imported-fast-vault'),
    ).toBe(true)
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

  it('emits wallet_connected analytics only for explicit connect calls', async () => {
    const storage = createMemoryStorage()
    const vault = createFakeVault({
      id: 'analytics-vault',
      name: 'Analytics Vault',
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
    await manager.selectSession(vault.id)

    await manager.execute('accounts.list', {
      input: { chain: Chain.Ethereum },
      sessionId: vault.id,
    })
    expect(trackAnalyticsEvent).not.toHaveBeenCalled()

    await manager.execute('accounts.connect', {
      input: { chain: Chain.MayaChain },
      sessionId: vault.id,
    })

    expect(trackAnalyticsEvent).toHaveBeenCalledWith({
      type: 'wallet_connected',
      source: 'sdk',
      session_kind: 'vault',
      chain_count_bucket: '4_plus',
    })
  })

  it('omits empty extracted message hashes when signing sdk payloads', async () => {
    const storage = createMemoryStorage()
    const sign = vi.fn(async () => ({
      signature: '0xsigned',
      format: 'ECDSA',
    }))
    const extractMessageHashes = vi.fn(async () => [])
    const vault = createFakeVault({
      id: 'vault-empty-hashes',
      name: 'Empty Hashes',
      chains: [Chain.MayaChain],
      extractMessageHashes,
      sign,
    })
    const { sdk } = createFakeSdkClient({
      vaults: [vault],
      activeVaultId: vault.id,
    })
    const manager = new MayaWalletManager({
      sdk,
      prefsStorage: storage,
    })

    await manager.initialize()
    await manager.selectSession(vault.id)

    await manager.execute('tx.sign', {
      input: {
        chain: Chain.MayaChain,
        payload: { kind: 'custom-maya-deposit' } as never,
      },
    })

    expect(extractMessageHashes).toHaveBeenCalled()
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: Chain.MayaChain,
        transaction: { kind: 'custom-maya-deposit' },
      }),
      expect.any(Object),
    )
    expect(sign.mock.calls[0]?.[0]).not.toHaveProperty('messageHashes')
  })
})
