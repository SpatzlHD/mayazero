import { Chain } from '@vultisig/sdk'
import type { WalletChain } from './types'

export type WalletChainFamily =
  | 'evm'
  | 'utxo'
  | 'cosmos'
  | 'solana'
  | 'substrate'
  | 'ripple'
  | 'tron'
  | 'cardano'
  | 'sui'
  | 'ton'
  | 'other'

export type ExtensionProviderKey =
  | 'ethereum'
  | 'cosmos'
  | 'thorchain'
  | 'maya'
  | 'mayachain'
  | 'solana'
  | 'bitcoin'
  | 'bitcoincash'
  | 'dash'
  | 'dogecoin'
  | 'litecoin'
  | 'zcash'
  | 'cardano'

export type WalletChainDefinition = {
  chain: WalletChain
  family: WalletChainFamily
  extensionProviderKey?: ExtensionProviderKey
  extensionChainId?: string
}

export const chainRegistry: Partial<Record<WalletChain, WalletChainDefinition>> = {
  [Chain.THORChain]: {
    chain: Chain.THORChain,
    family: 'cosmos',
    extensionProviderKey: 'thorchain',
    extensionChainId: 'Thorchain_thorchain',
  },
  [Chain.MayaChain]: {
    chain: Chain.MayaChain,
    family: 'cosmos',
    extensionProviderKey: 'maya',
    extensionChainId: 'MayaChain-1',
  },
  [Chain.Cardano]: {
    chain: Chain.Cardano,
    family: 'cardano',
    extensionProviderKey: 'cardano',
    extensionChainId: 'Cardano_cardano',
  },
  [Chain.Bitcoin]: {
    chain: Chain.Bitcoin,
    family: 'utxo',
    extensionProviderKey: 'bitcoin',
    extensionChainId: '0x1f96',
  },
  [Chain.Dash]: {
    chain: Chain.Dash,
    family: 'utxo',
    extensionProviderKey: 'dash',
    extensionChainId: 'Dash_dash',
  },
  [Chain.Zcash]: {
    chain: Chain.Zcash,
    family: 'utxo',
    extensionProviderKey: 'zcash',
    extensionChainId: 'Zcash_zcash',
  },
  [Chain.Ethereum]: {
    chain: Chain.Ethereum,
    family: 'evm',
    extensionProviderKey: 'ethereum',
    extensionChainId: '0x1',
  },
  [Chain.Arbitrum]: {
    chain: Chain.Arbitrum,
    family: 'evm',
    extensionProviderKey: 'ethereum',
    extensionChainId: '0xa4b1',
  },
}

export const supportedWalletChains = Object.values(chainRegistry).map(
  ({ chain }) => chain,
)

const supportedWalletChainSet = new Set<WalletChain>(supportedWalletChains)

export const extensionProviderChainMap = Object.values(chainRegistry).reduce<
  Record<ExtensionProviderKey, WalletChain[]>
>(
  (result, definition) => {
    if (!definition.extensionProviderKey) {
      return result
    }

        const current = result[definition.extensionProviderKey] ?? []
    current.push(definition.chain)
    result[definition.extensionProviderKey] = current
    return result
  },
  {
    ethereum: [],
    cosmos: [],
    thorchain: [],
    maya: [],
    mayachain: [],
    solana: [],
    bitcoin: [],
    bitcoincash: [],
    dash: [],
    dogecoin: [],
    litecoin: [],
    zcash: [],
    cardano: [],
  },
)

function normalizeExtensionProviderKey(
  providerKey: ExtensionProviderKey,
): ExtensionProviderKey {
  return providerKey === 'maya' ? 'mayachain' : providerKey
}

export function getChainDefinition(chain: WalletChain): WalletChainDefinition {
  const definition = chainRegistry[chain]
  if (!definition) {
    throw new Error(`Unsupported Maya wallet chain: ${chain}`)
  }

  return definition
}

export function getChainsForExtensionProvider(
  providerKey: ExtensionProviderKey,
): WalletChain[] {
  if (providerKey === 'mayachain') {
    return extensionProviderChainMap.maya
  }

  return extensionProviderChainMap[providerKey]
}

export function getExtensionProviderKey(
  chain: WalletChain,
): ExtensionProviderKey | undefined {
  const providerKey = getChainDefinition(chain).extensionProviderKey
  return providerKey ? normalizeExtensionProviderKey(providerKey) : providerKey
}

export function resolveChainFromExtensionChainId(
  providerKey: ExtensionProviderKey,
  chainId: string,
): WalletChain | null {
  const match = getChainsForExtensionProvider(providerKey).find(
    (candidate) => getChainDefinition(candidate).extensionChainId === chainId,
  )

  return match ?? null
}

export function canSwitchChainInExtension(chain: WalletChain): boolean {
  const providerKey = getExtensionProviderKey(chain)
  return providerKey === 'ethereum' || providerKey === 'cosmos'
}

export function getSupportedSessionChains(chains: WalletChain[]): WalletChain[] {
  return chains.filter((chain) => supportedWalletChainSet.has(chain))
}
