import { formatBaseUnits } from './cacao-pool'

type FetchLike = typeof fetch

type MidgardPoolRecord = {
  asset: string
  assetPrice?: string
  assetPriceUSD?: string
  status?: string
  volume24h?: string
}

export type MayaTokenPoolSnapshot = {
  asset: 'MAYA.MAYA'
  priceInCacao: number | null
  priceInUsd: number | null
  status: string | null
  volume24hCacao: number | null
}

export type MayaTokenPoolSnapshotOptions = {
  fetch?: FetchLike
  midgardUrl?: string
}

const DEFAULT_MIDGARD_URL = 'https://midgard.mayachain.info'
const MAYA_TOKEN_ASSET = 'MAYA.MAYA'
const MIDGARD_BASE_DECIMALS = 8

function resolveFetchImplementation(customFetch?: FetchLike): FetchLike {
  if (customFetch) {
    return customFetch
  }

  if (typeof fetch === 'function') {
    return fetch.bind(globalThis)
  }

  throw new Error('No fetch implementation is available for Maya token pricing.')
}

function normalizeMidgardUrl(value?: string): string {
  return (value ?? DEFAULT_MIDGARD_URL).replace(/\/+$/, '')
}

export async function fetchMayaTokenPoolSnapshot(
  options: MayaTokenPoolSnapshotOptions = {},
): Promise<MayaTokenPoolSnapshot | null> {
  const response = await resolveFetchImplementation(options.fetch)(
    `${normalizeMidgardUrl(options.midgardUrl)}/v2/pools`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to load Maya token pool pricing (${response.status})`)
  }

  const pools = (await response.json()) as MidgardPoolRecord[]
  return normalizeMayaTokenPoolSnapshot(pools)
}

export function normalizeMayaTokenPoolSnapshot(
  pools: MidgardPoolRecord[],
): MayaTokenPoolSnapshot | null {
  const pool = pools.find((entry) => entry.asset === MAYA_TOKEN_ASSET)

  if (!pool) {
    return null
  }

  return {
    asset: MAYA_TOKEN_ASSET,
    priceInCacao: parseFiniteNumber(pool.assetPrice),
    priceInUsd: parseFiniteNumber(pool.assetPriceUSD),
    status: typeof pool.status === 'string' ? pool.status : null,
    volume24hCacao: parseFiniteNumber(
      typeof pool.volume24h === 'string'
        ? formatBaseUnits(pool.volume24h, MIDGARD_BASE_DECIMALS)
        : undefined,
    ),
  }
}

function parseFiniteNumber(value: string | undefined): number | null {
  if (typeof value !== 'string') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
