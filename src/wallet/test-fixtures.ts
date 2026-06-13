import { encryptToKeyStore } from '@xchainjs/xchain-crypto'
import { WalletChain as Chain } from '#/wallet/chain-types'
import type { ExtensionProviderLike, ExtensionWindowLike } from './adapters'
import type { StoredKeystoreRecord } from './keystore-store'

const defaultKeystoreAddresses: Partial<Record<Chain, string>> = {
  [Chain.Ethereum]: '0x00000000000000000000000000000000000000e1',
  [Chain.Arbitrum]: '0x00000000000000000000000000000000000000e1',
  [Chain.MayaChain]: 'mayachain-address',
  [Chain.Bitcoin]: 'bc1qabc',
  [Chain.THORChain]: 'thor1address',
}

export function createFakeKeystoreRecord(
  overrides: Partial<StoredKeystoreRecord> & { id: string; label: string },
): StoredKeystoreRecord {
  return {
    id: overrides.id,
    label: overrides.label,
    keystore: overrides.keystore ?? {
      crypto: {},
      id: overrides.id,
      version: 1,
      activeAccounts: [],
    },
    addresses: overrides.addresses ?? { ...defaultKeystoreAddresses },
    createdAt: overrides.createdAt ?? Date.now(),
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

export function createEmptyExtensionWindow(): ExtensionWindowLike {
  return {}
}

export function createFakeExtensionWindow(
  overrides?: Partial<ExtensionWindowLike>,
): ExtensionWindowLike {
  const ethereum = createFakeExtensionProvider()
  return {
    vultisig: {
      ethereum: ethereum.provider,
      ...(overrides?.vultisig ?? {}),
    },
    ethereum: overrides?.ethereum ?? ethereum.provider,
    ...overrides,
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

export { defaultKeystoreAddresses }

const testMnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

export async function createValidRawKeystore(
  keystorePassword = 'keystore-pass',
): Promise<string> {
  const keystore = await encryptToKeyStore(testMnemonic, keystorePassword)
  return JSON.stringify(keystore)
}
