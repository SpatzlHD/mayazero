import { Chain } from '@vultisig/sdk'
import type {
  ExtensionProviderLike,
  ExtensionWindowLike,
  SdkClientLike,
  SdkVaultLike,
} from './adapters'

function makeBalance(chain: Chain, symbol = 'ETH') {
  return {
    amount: '1000000000000000000',
    formattedAmount: '1',
    decimals: 18,
    symbol,
    chainId: chain,
    value: 1,
    fiatValue: 1,
    fiatCurrency: 'usd',
  }
}

export function createFakeVault(
  overrides: Partial<SdkVaultLike> & { id: string; name: string },
): SdkVaultLike {
  const addresses = overrides.chains?.reduce<Record<string, string>>((accumulator, chain) => {
    accumulator[chain] = `${chain.toLowerCase()}-address`
    return accumulator
  }, {}) ?? { [Chain.Ethereum]: 'ethereum-address' }

  let name = overrides.name
  let unlocked = true

  return {
    id: overrides.id,
    name,
    type: overrides.type ?? 'secure',
    isEncrypted: overrides.isEncrypted ?? false,
    chains: overrides.chains ?? [Chain.Ethereum, Chain.MayaChain],
    localPartyId: overrides.localPartyId ?? 'local-party',
    createdAt: overrides.createdAt ?? Date.now(),
    isUnlocked: overrides.isUnlocked ?? (() => unlocked),
    loadPreferences: overrides.loadPreferences ?? (async () => {}),
    address:
      overrides.address ??
      (async (chain) => addresses[chain] ?? `${chain.toLowerCase()}-address`),
    addresses:
      overrides.addresses ??
      (async (chains) => {
        const selectedChains = chains ?? (overrides.chains ?? [Chain.Ethereum])
        return selectedChains.reduce<Record<string, string>>((accumulator, chain) => {
          accumulator[chain] = addresses[chain] ?? `${chain.toLowerCase()}-address`
          return accumulator
        }, {})
      }),
    balance: overrides.balance ?? (async (chain) => makeBalance(chain)),
    balances:
      overrides.balances ??
      (async (chains) => {
        const selectedChains = chains ?? (overrides.chains ?? [Chain.Ethereum])
        return selectedChains.reduce<Record<string, unknown>>((accumulator, chain) => {
          accumulator[chain] = makeBalance(chain)
          return accumulator
        }, {})
      }),
    balancesWithPrices:
      overrides.balancesWithPrices ??
      (async (chains) => {
        const selectedChains = chains ?? (overrides.chains ?? [Chain.Ethereum])
        return selectedChains.reduce<Record<string, unknown>>((accumulator, chain) => {
          accumulator[chain] = makeBalance(chain)
          return accumulator
        }, {})
      }),
    portfolio:
      overrides.portfolio ??
      (async () => ({
        totalValue: 1,
        fiatCurrency: 'usd',
        balances: [],
      })),
    send:
      overrides.send ??
      (async (params) => ({
        dryRun: false,
        txHash: `tx-${params.chain}`,
        chain: params.chain,
      })),
    getTxStatus:
      overrides.getTxStatus ??
      (async ({ chain, txHash }) => ({
        chain,
        txHash,
        status: 'success',
      })),
    signMessage:
      overrides.signMessage ??
      (async (message) => ({
        signature: `signed:${message}`,
        format: 'ECDSA',
      })),
    prepareSendTx:
      overrides.prepareSendTx ??
      (async (params) => ({
        coin: params.coin,
        toAddress: params.receiver,
      })),
    prepareSignAminoTx:
      overrides.prepareSignAminoTx ??
      (async (params) => ({
        chain: params.chain,
        msgs: params.msgs,
        memo: params.memo,
      })),
    extractMessageHashes:
      overrides.extractMessageHashes ??
      (async () => ['0xmessagehash']),
    sign:
      overrides.sign ??
      (async (_payload, options) => {
        options?.onProgress?.({
          step: 'signing',
          progress: 50,
          message: 'Signing payload',
        })
        return {
          signature: '0xsigned',
          format: 'ECDSA',
        }
      }),
    signBytes:
      overrides.signBytes ??
      (async () => ({
        signature: '0xsigned',
        recovery: 1,
        format: 'ECDSA',
      })),
    broadcastTx:
      overrides.broadcastTx ??
      (async ({ chain }) => `broadcast-${chain}`),
    broadcastRawTx:
      overrides.broadcastRawTx ??
      (async ({ chain }) => `broadcast-raw-${chain}`),
    getSwapQuote:
      overrides.getSwapQuote ??
      (async (params) => ({
        provider: 'thorchain',
        balance: 1n,
        maxSwapable: 1n,
        quote: {} as never,
        estimatedOutput: 1n,
        fromCoin: params.fromCoin,
        toCoin: params.toCoin,
        amount: params.amount,
      })),
    prepareSwapTx:
      overrides.prepareSwapTx ??
      (async () => ({
        keysignPayload: { toAddress: 'swap' },
        quote: {
          provider: 'thorchain',
          balance: 1n,
          maxSwapable: 1n,
          quote: {} as never,
          estimatedOutput: 1n,
        },
      })),
    discoverTokens: overrides.discoverTokens ?? (async () => []),
    validateTransaction:
      overrides.validateTransaction ??
      (async () => ({ isRisky: false, riskLevel: 'low' })),
    simulateTransaction:
      overrides.simulateTransaction ??
      (async () => ({ changes: [] })),
    export:
      overrides.export ??
      (async () => ({ filename: `${overrides.id}.vult`, data: 'vault-backup' })),
    lock:
      overrides.lock ??
      (() => {
        unlocked = false
      }),
    unlock:
      overrides.unlock ??
      (async () => {
        unlocked = true
      }),
    rename:
      overrides.rename ??
      (async (nextName) => {
        name = nextName
      }),
    delete: overrides.delete ?? (async () => {}),
  }
}

export function createFakeSdkClient(options?: {
  vaults?: SdkVaultLike[]
  activeVaultId?: string | null
}) {
  const vaults = [...(options?.vaults ?? [])]
  let activeVaultId: string | null =
    options?.activeVaultId ?? vaults[0]?.id ?? null
  let initializeCount = 0
  let lastSeedphraseImportOptions:
    | Parameters<SdkClientLike['createFastVaultFromSeedphrase']>[0]
    | null = null

  const sdk: SdkClientLike = {
    initialize: async () => {
      initializeCount += 1
    },
    dispose: () => {},
    listVaults: async () => vaults,
    setActiveVault: async (vault) => {
      activeVaultId = vault?.id ?? null
    },
    getActiveVault: async () =>
      vaults.find((vault) => vault.id === activeVaultId) ?? null,
    validateSeedphrase: async (mnemonic) => ({
      valid: mnemonic.trim().split(/\s+/).length >= 3,
      wordCount: mnemonic.trim().split(/\s+/).length,
      ...(mnemonic.trim().split(/\s+/).length >= 3
        ? {}
        : { error: 'Seedphrase is invalid.' }),
    }),
    discoverChainsFromSeedphrase: async (_mnemonic, chains = [], onProgress) => {
      onProgress?.({
        phase: 'complete',
        chainsProcessed: chains.length,
        chainsTotal: chains.length,
        chainsWithBalance: chains,
        message: 'Discovery complete',
      })
      return {
        results: chains.map((chain) => ({
          chain,
          address: `${chain.toLowerCase()}-address`,
          balance: '1',
          decimals: 8,
          symbol: chain.slice(0, 3).toUpperCase(),
          hasBalance: true,
        })),
        usePhantomSolanaPath: false,
      }
    },
    createFastVault: async ({ onProgress }) => {
      onProgress?.({
        step: 'initializing',
        progress: 15,
        message: 'Creating fast vault',
      })
      return 'pending-fast-vault'
    },
    createFastVaultFromSeedphrase: async (input) => {
      lastSeedphraseImportOptions = input
      input.onChainDiscovery?.({
        phase: 'fetching',
        chainsProcessed: input.chainsToScan?.length ?? 0,
        chainsTotal: input.chainsToScan?.length ?? 0,
        chainsWithBalance: input.chainsToScan ?? [],
        message: 'Discovering balances',
      })
      input.onProgress?.({
        step: 'creating-fast-vault',
        progress: 65,
        message: 'Creating imported fast vault',
      })
      return 'pending-imported-fast-vault'
    },
    verifyVault: async (vaultId) => {
      const verified = createFakeVault({
        id: vaultId,
        name: 'Verified Fast Vault',
        type: 'fast',
        chains: [Chain.Ethereum],
      })
      vaults.push(verified)
      activeVaultId = verified.id
      return verified
    },
    createSecureVault: async ({
      name,
      devices,
      threshold,
      onProgress,
      onQRCodeReady,
      onDeviceJoined,
    }) => {
      onProgress?.({
        step: 'initializing',
        progress: 10,
        message: 'Preparing secure vault',
      })
      onQRCodeReady?.('vultisig://qr-payload')
      onDeviceJoined?.('device-2', threshold ?? devices, devices)
      const vault = createFakeVault({
        id: `secure-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        type: 'secure',
        chains: [Chain.MayaChain, Chain.Ethereum],
      })
      vaults.push(vault)
      activeVaultId = vault.id
      return {
        vault,
        vaultId: vault.id,
        sessionId: 'secure-session',
      }
    },
    joinSecureVault: async (_qrPayload, { onProgress, onDeviceJoined }) => {
      onProgress?.({
        step: 'initializing',
        progress: 5,
        message: 'Joining secure vault',
      })
      onDeviceJoined?.('device-join', 2, 2)
      const vault = createFakeVault({
        id: 'joined-secure-vault',
        name: 'Joined Vault',
        type: 'secure',
        chains: [Chain.MayaChain],
      })
      vaults.push(vault)
      activeVaultId = vault.id
      return { vault, vaultId: vault.id }
    },
    importVault: async () => {
      const vault = createFakeVault({
        id: 'imported-vault',
        name: 'Imported Vault',
        type: 'secure',
        chains: [Chain.Ethereum],
      })
      vaults.push(vault)
      activeVaultId = vault.id
      return vault
    },
  }

  return {
    sdk,
    getInitializeCount: () => initializeCount,
    getVaults: () => vaults,
    getLastSeedphraseImportOptions: () => lastSeedphraseImportOptions,
  }
}

export function createFakeExtensionProvider(): {
  provider: ExtensionProviderLike
  getChainId: () => string
} {
  let chainId = '0x1'

  return {
    provider: {
      request: async ({ method, params }) => {
        switch (method) {
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return ['0xabc']
          case 'eth_chainId':
            return chainId
          case 'wallet_switchEthereumChain':
            chainId = String((params?.[0] as { chainId?: string })?.chainId ?? chainId)
            return null
          case 'eth_getBalance':
            return '0xde0b6b3a7640000'
          case 'eth_getTransactionByHash':
            return { hash: params?.[0], chainId }
          case 'personal_sign':
            return '0xsigned'
          case 'eth_sendTransaction':
            return '0xhash'
          default:
            return null
        }
      },
      on: () => {},
      removeListener: () => {},
    },
    getChainId: () => chainId,
  }
}

export function createFakeExtensionWindow(): ExtensionWindowLike {
  const ethereum = createFakeExtensionProvider()
  return {
    vultisig: {
      ethereum: ethereum.provider,
    },
    ethereum: ethereum.provider,
  }
}

export function createMemoryStorage(): Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
> {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}
