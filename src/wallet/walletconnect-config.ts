import { WalletChain } from './chain-types'

export const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? ''

export const walletConnectMetadata = {
  name: 'MayaZero',
  description: 'Maya Protocol liquidity and portfolio tracker',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://mayazero.app',
  icons: [
    typeof window !== 'undefined'
      ? `${window.location.origin}/favicon.ico`
      : 'https://mayazero.app/favicon.ico',
  ],
}

export const walletConnectEip155Chains = ['eip155:1', 'eip155:42161'] as const

export const walletConnectCosmosChains = [
  'cosmos:mayachain-mainnet-v1',
  'cosmos:thorchain-1',
] as const

/** Bitcoin mainnet genesis hash (BIP122 CAIP-2) */
export const walletConnectBip122Chains = [
  'bip122:000000000019d6689c085ae165831e93',
] as const

export type WalletConnectNamespace = 'eip155' | 'cosmos' | 'bip122'

export const walletConnectNamespaces = {
  eip155: {
    methods: [
      'eth_sendTransaction',
      'eth_signTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v4',
    ],
    chains: [...walletConnectEip155Chains],
    events: ['chainChanged', 'accountsChanged'] as string[],
  },
  cosmos: {
    methods: ['cosmos_signDirect', 'cosmos_signAmino'],
    chains: [...walletConnectCosmosChains],
    events: ['accountsChanged'] as string[],
  },
  bip122: {
    methods: ['sendTransfer', 'signPsbt', 'signMessage'],
    chains: [...walletConnectBip122Chains],
    events: ['accountsChanged'] as string[],
  },
}

export type Caip10Account = {
  namespace: WalletConnectNamespace
  chainId: string
  address: string
  raw: string
}

const eip155ChainMap: Record<string, WalletChain> = {
  'eip155:1': WalletChain.Ethereum,
  'eip155:42161': WalletChain.Arbitrum,
}

const cosmosChainMap: Record<string, WalletChain> = {
  'cosmos:mayachain-mainnet-v1': WalletChain.MayaChain,
  'cosmos:thorchain-1': WalletChain.THORChain,
}

const bip122ChainMap: Record<string, WalletChain> = {
  'bip122:000000000019d6689c085ae165831e93': WalletChain.Bitcoin,
}

export function parseCaip10Account(account: string): Caip10Account | null {
  const colonIndex = account.indexOf(':')
  if (colonIndex === -1) return null

  const namespace = account.slice(0, colonIndex)
  if (namespace !== 'eip155' && namespace !== 'cosmos' && namespace !== 'bip122') {
    return null
  }

  const remainder = account.slice(colonIndex + 1)
  const secondColonIndex = remainder.indexOf(':')
  if (secondColonIndex === -1) return null

  const chainRef = remainder.slice(0, secondColonIndex)
  const address = remainder.slice(secondColonIndex + 1)
  if (!chainRef || !address) return null

  return {
    namespace,
    chainId: `${namespace}:${chainRef}`,
    address,
    raw: account,
  }
}

export function walletConnectChainToWalletChain(
  namespace: WalletConnectNamespace,
  chainId: string,
): WalletChain | null {
  if (namespace === 'eip155') {
    return eip155ChainMap[chainId] ?? null
  }
  if (namespace === 'cosmos') {
    return cosmosChainMap[chainId] ?? null
  }
  return bip122ChainMap[chainId] ?? null
}

export function walletChainToWalletConnectId(chain: WalletChain): string | null {
  switch (chain) {
    case WalletChain.Ethereum:
      return 'eip155:1'
    case WalletChain.Arbitrum:
      return 'eip155:42161'
    case WalletChain.MayaChain:
      return 'cosmos:mayachain-mainnet-v1'
    case WalletChain.THORChain:
      return 'cosmos:thorchain-1'
    case WalletChain.Bitcoin:
      return 'bip122:000000000019d6689c085ae165831e93'
    default:
      return null
  }
}

export function walletConnectNamespaceForChain(
  chain: WalletChain,
): WalletConnectNamespace | null {
  const id = walletChainToWalletConnectId(chain)
  if (!id) return null
  if (id.startsWith('eip155:')) return 'eip155'
  if (id.startsWith('cosmos:')) return 'cosmos'
  if (id.startsWith('bip122:')) return 'bip122'
  return null
}

export function resolveWalletConnectAddressesFromCaip10(
  caipAccounts: string[],
): Partial<Record<WalletChain, string>> {
  const addresses: Partial<Record<WalletChain, string>> = {}

  for (const raw of caipAccounts) {
    const parsed = parseCaip10Account(raw)
    if (!parsed) continue

    const walletChain = walletConnectChainToWalletChain(
      parsed.namespace,
      parsed.chainId,
    )
    if (!walletChain) continue

    addresses[walletChain] = parsed.address
  }

  return addresses
}

/** Chains we request during pairing (wallet may approve a subset). */
export const walletConnectRequestedChains: WalletChain[] = [
  WalletChain.Ethereum,
  WalletChain.Arbitrum,
  WalletChain.MayaChain,
  WalletChain.THORChain,
  WalletChain.Bitcoin,
]

/** Chains with no WalletConnect namespace in this app. */
export const walletConnectUnsupportedChains: WalletChain[] = [
  WalletChain.Cardano,
  WalletChain.Dash,
  WalletChain.Zcash,
]
