import { Chain, Vultisig } from '@vultisig/sdk'
import type { WalletChain } from '#/wallet'

type FetchLike = typeof fetch

type MayaPoolRecord = {
  asset: string
  status?: string
  assetPriceUSD?: string
  nativeDecimal?: string | number
}

type NativeAssetDefinition = {
  symbol: string
  name: string
  decimals: number
  priceId?: string
}

type MayaChainDefinition = {
  key: string
  ticker: string
  name: string
  iconId: string
  family: 'evm' | 'cosmos' | 'utxo' | 'unknown'
  walletChain?: WalletChain
  nativeAsset?: NativeAssetDefinition
}

export type MayaSupportedAsset = {
  id: string
  asset: string
  symbol: string
  name: string
  decimals: number
  tokenId?: string
  isNative: boolean
  priceUsd: number
  iconId: string
  chainKey: string
  chainTicker: string
  chainName: string
  walletChain?: WalletChain
}

export type MayaSupportedChain = {
  key: string
  ticker: string
  name: string
  iconId: string
  family: 'evm' | 'cosmos' | 'utxo' | 'unknown'
  walletChain?: WalletChain
  assets: MayaSupportedAsset[]
}

export type MayaAssetCatalog = {
  chains: MayaSupportedChain[]
  assets: MayaSupportedAsset[]
  fetchedAt: string
}

export type MayaAssetCatalogOptions = {
  fetch?: FetchLike
  midgardUrl?: string
  ttlMs?: number
  fallbackPriceFetcher?: (ids: string[]) => Promise<Record<string, number>>
}

const DEFAULT_MIDGARD_URL = 'https://midgard.mayachain.info'
const DEFAULT_TTL_MS = 60_000

const mayaChainDefinitions: Record<string, MayaChainDefinition> = {
  MAYA: {
    key: 'mayachain',
    ticker: 'MAYA',
    name: 'MayaChain',
    iconId: 'cacao',
    family: 'cosmos',
    walletChain: Chain.MayaChain,
    nativeAsset: {
      symbol: 'CACAO',
      name: 'Cacao',
      decimals: 10,
      priceId: 'cacao',
    },
  },
  THOR: {
    key: 'thorchain',
    ticker: 'THOR',
    name: 'THORChain',
    iconId: 'rune',
    family: 'cosmos',
    walletChain: Chain.THORChain,
    nativeAsset: {
      symbol: 'RUNE',
      name: 'Rune',
      decimals: 8,
      priceId: 'thorchain',
    },
  },
  KUJI: {
    key: 'kujira',
    ticker: 'KUJI',
    name: 'Kujira',
    iconId: 'kuji',
    family: 'cosmos',
    walletChain: Chain.Kujira,
    nativeAsset: {
      symbol: 'KUJI',
      name: 'Kujira',
      decimals: 6,
      priceId: 'kujira',
    },
  },
  ETH: {
    key: 'ethereum',
    ticker: 'ETH',
    name: 'Ethereum',
    iconId: 'eth',
    family: 'evm',
    walletChain: Chain.Ethereum,
    nativeAsset: {
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      priceId: 'ethereum',
    },
  },
  ARB: {
    key: 'arbitrum',
    ticker: 'ARB',
    name: 'Arbitrum',
    iconId: 'arbitrum',
    family: 'evm',
    walletChain: Chain.Arbitrum,
    nativeAsset: {
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      priceId: 'ethereum',
    },
  },
  BTC: {
    key: 'bitcoin',
    ticker: 'BTC',
    name: 'Bitcoin',
    iconId: 'btc',
    family: 'utxo',
    walletChain: Chain.Bitcoin,
    nativeAsset: {
      symbol: 'BTC',
      name: 'Bitcoin',
      decimals: 8,
      priceId: 'bitcoin',
    },
  },
  DASH: {
    key: 'dash',
    ticker: 'DASH',
    name: 'Dash',
    iconId: 'dash',
    family: 'utxo',
    walletChain: Chain.Dash,
    nativeAsset: {
      symbol: 'DASH',
      name: 'Dash',
      decimals: 8,
      priceId: 'dash',
    },
  },
  ZEC: {
    key: 'zcash',
    ticker: 'ZEC',
    name: 'Zcash',
    iconId: 'zec',
    family: 'utxo',
    walletChain: Chain.Zcash,
    nativeAsset: {
      symbol: 'ZEC',
      name: 'Zcash',
      decimals: 8,
      priceId: 'zcash',
    },
  },
  XRD: {
    key: 'radix',
    ticker: 'XRD',
    name: 'Radix',
    iconId: 'xrd',
    family: 'unknown',
    nativeAsset: {
      symbol: 'XRD',
      name: 'Radix',
      decimals: 18,
      priceId: 'radix',
    },
  },
}

const chainSortOrder = [
  'mayachain',
  'bitcoin',
  'ethereum',
  'arbitrum',
  'kujira',
  'thorchain',
  'dash',
  'zcash',
  'radix',
] as const

const catalogCache = new Map<
  string,
  { expiresAt: number; promise: Promise<MayaAssetCatalog> }
>()

function defaultFetchMissing(): never {
  throw new Error('No fetch implementation is available for Maya catalog loading.')
}

function resolveFetchImplementation(customFetch?: FetchLike): FetchLike {
  if (customFetch) {
    return customFetch
  }

  if (typeof fetch === 'function') {
    return fetch.bind(globalThis)
  }

  return defaultFetchMissing
}

async function defaultFallbackPriceFetcher(
  ids: string[],
): Promise<Record<string, number>> {
  if (!ids.length) {
    return {}
  }

  return Vultisig.getCoinPrices({
    ids,
    fiatCurrency: 'usd',
  })
}

export function resetMayaAssetCatalogCache(): void {
  catalogCache.clear()
}

export async function fetchMayaAssetCatalog(
  options: MayaAssetCatalogOptions = {},
): Promise<MayaAssetCatalog> {
  const midgardUrl = normalizeMidgardUrl(options.midgardUrl)
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const now = Date.now()
  const cached = catalogCache.get(midgardUrl)

  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = loadMayaAssetCatalog({
    fetchImpl: resolveFetchImplementation(options.fetch),
    midgardUrl,
    fallbackPriceFetcher:
      options.fallbackPriceFetcher ?? defaultFallbackPriceFetcher,
  }).catch((error) => {
    const latest = catalogCache.get(midgardUrl)
    if (latest?.promise === promise) {
      catalogCache.delete(midgardUrl)
    }
    throw error
  })

  catalogCache.set(midgardUrl, {
    expiresAt: now + ttlMs,
    promise,
  })

  return promise
}

export function getMayaSupportedChain(
  catalog: MayaAssetCatalog,
  chainKey: string,
): MayaSupportedChain | undefined {
  return catalog.chains.find((chain) => chain.key === chainKey)
}

async function loadMayaAssetCatalog(params: {
  fetchImpl: FetchLike
  midgardUrl: string
  fallbackPriceFetcher: (ids: string[]) => Promise<Record<string, number>>
}): Promise<MayaAssetCatalog> {
  const response = await params.fetchImpl(`${params.midgardUrl}/v2/pools`, {
    headers: {
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to load Maya pools (${response.status})`)
  }

  const pools = ((await response.json()) as MayaPoolRecord[]).filter(
    (pool) => pool.asset && (pool.status ?? '').toLowerCase() === 'available',
  )

  const fallbackPriceIds = [...new Set(
    Object.values(mayaChainDefinitions)
      .map((definition) => definition.nativeAsset?.priceId)
      .filter((value): value is string => Boolean(value)),
  )]
  const fallbackPrices = await params.fallbackPriceFetcher(fallbackPriceIds).catch(
    () => ({}),
  )

  const chains = new Map<string, MayaSupportedChain>()
  for (const definition of Object.values(mayaChainDefinitions)) {
    const chain = ensureChain(chains, definition)
    if (definition.nativeAsset) {
      upsertAsset(
        chain,
        createNativeAsset(definition, fallbackPrices[definition.nativeAsset.priceId ?? ''] ?? 0),
      )
    }
  }

  for (const pool of pools) {
    const asset = createPoolAsset(pool)
    if (!asset) {
      continue
    }

    const definition = getChainDefinition(asset.chainTicker)
    const chain = ensureChain(chains, definition)
    upsertAsset(
      chain,
      {
        ...asset,
        chainKey: chain.key,
        chainName: chain.name,
        walletChain: chain.walletChain,
      },
    )
  }

  const chainList = [...chains.values()]
    .filter((chain) => chain.assets.length > 0)
    .map((chain) => ({
      ...chain,
      assets: [...chain.assets].sort(compareAssets),
    }))
    .sort(compareChains)

  return {
    chains: chainList,
    assets: chainList.flatMap((chain) => chain.assets),
    fetchedAt: new Date().toISOString(),
  }
}

function normalizeMidgardUrl(value?: string): string {
  return (value ?? DEFAULT_MIDGARD_URL).replace(/\/+$/, '')
}

function ensureChain(
  chains: Map<string, MayaSupportedChain>,
  definition: MayaChainDefinition,
): MayaSupportedChain {
  const existing = chains.get(definition.key)
  if (existing) {
    return existing
  }

  const created: MayaSupportedChain = {
    key: definition.key,
    ticker: definition.ticker,
    name: definition.name,
    iconId: definition.iconId,
    family: definition.family,
    walletChain: definition.walletChain,
    assets: [],
  }
  chains.set(definition.key, created)
  return created
}

function createNativeAsset(
  definition: MayaChainDefinition,
  priceUsd: number,
): MayaSupportedAsset {
  const nativeAsset = definition.nativeAsset
  if (!nativeAsset) {
    throw new Error(`Chain ${definition.name} is missing native asset metadata`)
  }

  return {
    id: `${definition.ticker}.${nativeAsset.symbol}`.toLowerCase(),
    asset: `${definition.ticker}.${nativeAsset.symbol}`,
    symbol: nativeAsset.symbol,
    name: nativeAsset.name,
    decimals: nativeAsset.decimals,
    isNative: true,
    priceUsd,
    iconId: nativeAsset.symbol.toLowerCase(),
    chainKey: definition.key,
    chainTicker: definition.ticker,
    chainName: definition.name,
    walletChain: definition.walletChain,
  }
}

function createPoolAsset(pool: MayaPoolRecord): MayaSupportedAsset | null {
  const [chainTickerRaw, assetPartRaw] = pool.asset.split('.')
  if (!chainTickerRaw || !assetPartRaw) {
    return null
  }

  const chainTicker = chainTickerRaw.toUpperCase()
  const definition = getChainDefinition(chainTicker)
  const [symbolRaw, tokenIdRaw] = assetPartRaw.split('-', 2)
  const symbol = symbolRaw.toUpperCase()
  const tokenId = tokenIdRaw ? normalizeTokenId(tokenIdRaw, definition.family) : undefined
  const nativeSymbol = definition.nativeAsset?.symbol.toUpperCase()
  const isNative = !tokenId && nativeSymbol === symbol
  const decimals = normalizeDecimals(
    pool.nativeDecimal,
    isNative ? definition.nativeAsset?.decimals : undefined,
  )

  return {
    id: pool.asset.toLowerCase(),
    asset: pool.asset,
    symbol,
    name: symbol,
    decimals,
    tokenId,
    isNative,
    priceUsd: Number(pool.assetPriceUSD ?? 0) || 0,
    iconId: symbol.toLowerCase(),
    chainKey: definition.key,
    chainTicker,
    chainName: definition.name,
    walletChain: definition.walletChain,
  }
}

function getChainDefinition(chainTicker: string): MayaChainDefinition {
  return (
    mayaChainDefinitions[chainTicker] ?? {
      key: chainTicker.toLowerCase(),
      ticker: chainTicker,
      name: chainTicker,
      iconId: chainTicker.toLowerCase(),
      family: 'unknown',
    }
  )
}

function normalizeTokenId(
  value: string,
  family: MayaChainDefinition['family'],
): string {
  return family === 'evm' ? value.toLowerCase() : value
}

function normalizeDecimals(
  value: string | number | undefined,
  fallback = 8,
): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  return Number.isFinite(numeric) ? numeric : fallback
}

function upsertAsset(chain: MayaSupportedChain, asset: MayaSupportedAsset): void {
  const index = chain.assets.findIndex((candidate) => candidate.id === asset.id)
  if (index === -1) {
    chain.assets.push(asset)
    return
  }

  chain.assets[index] = {
    ...chain.assets[index],
    ...asset,
    priceUsd: asset.priceUsd || chain.assets[index]?.priceUsd || 0,
  }
}

function compareChains(left: MayaSupportedChain, right: MayaSupportedChain): number {
  const leftIndex = chainSortOrder.indexOf(left.key as (typeof chainSortOrder)[number])
  const rightIndex = chainSortOrder.indexOf(right.key as (typeof chainSortOrder)[number])

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) {
      return 1
    }
    if (rightIndex === -1) {
      return -1
    }
    return leftIndex - rightIndex
  }

  return left.name.localeCompare(right.name)
}

function compareAssets(left: MayaSupportedAsset, right: MayaSupportedAsset): number {
  if (left.isNative !== right.isNative) {
    return left.isNative ? -1 : 1
  }

  return left.symbol.localeCompare(right.symbol)
}
