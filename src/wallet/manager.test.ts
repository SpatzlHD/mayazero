import {
  createTestManager,
  resetWalletTestMocks,
  keystoreStoreMocks,
  localSignerMocks,
  walletConnectMocks,
} from './test-mocks'
import {
  createEmptyExtensionWindow,
  createFakeExtensionWindow,
  createFakeKeystoreRecord,
  createMemoryStorage,
  createValidRawKeystore,
} from './test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { trackAnalyticsEvent } from '#/analytics'
import { WalletCapabilityError } from './errors'
import { createKeystoreImportJourneySteps } from './journeys'

vi.mock('#/analytics', async () => {
  const actual = await vi.importActual<typeof import('#/analytics')>('#/analytics')
  return {
    ...actual,
    trackAnalyticsEvent: vi.fn(),
  }
})

describe('MayaWalletManager', () => {
  beforeEach(() => {
    resetWalletTestMocks()
    vi.mocked(trackAnalyticsEvent).mockClear()
  })

  it('initializes, discovers extension and keystore sessions, and restores preferences', async () => {
    const storage = createMemoryStorage()
    storage.setItem(
      'maya-wallet-manager',
      JSON.stringify({
        selectedSessionId: 'keystore-primary',
        preferredKeystoreId: 'keystore-primary',
        activeChain: Chain.MayaChain,
      }),
    )

    const keystore = createFakeKeystoreRecord({
      id: 'keystore-primary',
      label: 'Primary Keystore',
    })
    keystoreStoreMocks.listStoredKeystores.mockResolvedValue([keystore])

    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
      keystores: [keystore],
    })

    await manager.initialize()

    const state = manager.getState()
    expect(state.initialized).toBe(true)
    expect(state.sessions).toHaveLength(2)
    expect(state.activeSessionId).toBe('keystore-primary')
    expect(state.activeChain).toBe(Chain.MayaChain)
    expect(
      state.sessions.find((session) => session.id === 'keystore-primary')?.source,
    ).toBe('keystore')
    expect(
      state.sessions.find((session) => session.id === 'extension:vultisig')?.source,
    ).toBe('extension')
  })

  it('refreshSessions discovers extension providers', async () => {
    const manager = createTestManager({
      extensionWindow: {
        vultisig: {
          ethereum: {
            request: async ({ method }) => {
              if (method === 'eth_accounts') {
                return ['0xabc']
              }
              return null
            },
          },
          mayachain: {
            request: async ({ method }) => {
              if (method === 'get_accounts') {
                return ['maya1abc']
              }
              return null
            },
          },
        },
      },
    })

    await manager.initialize()
    const sessions = await manager.refreshSessions()

    expect(sessions.some((session) => session.id === 'extension:vultisig')).toBe(true)
    expect(
      manager.getState().sessions.find((session) => session.id === 'extension:vultisig')?.status,
    ).toBe('ready')
  })

  it('rejects unsupported extension commands with a capability error', async () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
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
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
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

  it('tracks command results and balances in operation state', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'keystore-balance',
      label: 'Balance Keystore',
    })
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
      keystores: [keystore],
    })

    await manager.initialize()
    await manager.selectSession(keystore.id)
    await manager.execute('keystore.unlock', {
      sessionId: keystore.id,
      input: { password: 'vault-password' },
    })

    vi.spyOn(await import('./balance-fetcher'), 'fetchAddressBalances').mockResolvedValue({
      balances: [
        {
          id: 'native',
          amount: '1000000000000000000',
          formattedAmount: '1',
          decimals: 18,
          symbol: 'ETH',
          isNative: true,
        },
      ],
    })

    await manager.execute('balance.get', {
      input: { chain: Chain.Ethereum },
      sessionId: keystore.id,
    })

    expect(manager.getState().balancesBySession[keystore.id]?.Ethereum).toBeDefined()
  })

  it('imports keystore from file with mocked keystore-store', async () => {
    const imported = createFakeKeystoreRecord({
      id: 'imported-keystore',
      label: 'Imported Wallet',
    })
    keystoreStoreMocks.importXChainKeystoreWallet.mockResolvedValue(imported)
    keystoreStoreMocks.listStoredKeystores
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([imported])

    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
    })
    await manager.initialize()

    const journeyId = manager.createJourney({
      kind: 'keystore.import',
      title: 'Import Keystore',
      source: 'keystore-import',
      routePath: '/vault-setup',
      steps: createKeystoreImportJourneySteps(),
    })

    const rawKeystore = await createValidRawKeystore('keystore-pass')

    const result = await manager.importKeystoreFromFile({
      label: 'Imported Wallet',
      rawKeystore,
      keystorePassword: 'keystore-pass',
      vaultPassword: 'vault-pass',
      journeyId,
    })

    expect(result.keystoreId).toBe('imported-keystore')
    expect(keystoreStoreMocks.importXChainKeystoreWallet).toHaveBeenCalled()
    expect(localSignerMocks.deriveKeystoreAddresses).toHaveBeenCalled()
    expect(manager.getState().activeSessionId).toBe('imported-keystore')
  })

  it('persists new selections across manager instances', async () => {
    const storage = createMemoryStorage()
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })
    await manager.initialize()
    await manager.selectSession('extension:vultisig')
    await manager.execute('chain.switch', {
      input: { chain: Chain.Ethereum },
      sessionId: 'extension:vultisig',
    })

    const secondManager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: storage,
    })
    await secondManager.initialize()

    expect(secondManager.getState().activeSessionId).toBe('extension:vultisig')
    expect(secondManager.getState().activeChain).toBe(Chain.Ethereum)
  })

  it('connects all available extension providers in one accounts.connect call', async () => {
    const manager = createTestManager({
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
  })

  it('emits wallet_connected analytics only for explicit connect calls', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'analytics-keystore',
      label: 'Analytics Keystore',
    })
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
      keystores: [keystore],
    })

    await manager.initialize()
    await manager.selectSession(keystore.id)
    await manager.execute('keystore.unlock', {
      sessionId: keystore.id,
      input: { password: 'vault-password' },
    })

    await manager.execute('accounts.list', {
      input: { chain: Chain.Ethereum },
      sessionId: keystore.id,
    })
    expect(trackAnalyticsEvent).not.toHaveBeenCalled()

    await manager.execute('accounts.connect', {
      input: { chain: Chain.MayaChain },
      sessionId: keystore.id,
    })

    expect(trackAnalyticsEvent).toHaveBeenCalledWith({
      type: 'wallet_connected',
      source: 'keystore',
      session_kind: 'keystore',
      chain_count_bucket: '4_plus',
    })
  })

  it('connects WalletConnect and selects the session', async () => {
    const manager = createTestManager({
      extensionWindow: createEmptyExtensionWindow(),
    })
    await manager.initialize()

    await manager.connectWalletConnect()

    expect(walletConnectMocks.connectWalletConnect).toHaveBeenCalled()
    expect(manager.getState().activeSessionId).toBe('walletconnect:session')
    expect(
      manager.getState().sessions.find((session) => session.id === 'walletconnect:session')
        ?.source,
    ).toBe('walletconnect')
  })
})
