type FetchLike = typeof fetch

type MidgardCacaoPoolPosition = {
  cacaoAddress: string
  units: string
  cacaoAdded: string
  cacaoDeposit: string
  cacaoWithdrawn: string
  dateFirstAdded: string
  dateLastAdded: string
}

type MidgardHistoryResponse = {
  intervals?: Array<{
    startTime: string
    endTime: string
    count: string
    units: string
  }>
}

type MidgardActionsResponse = {
  actions?: MidgardAction[]
}

type MidgardAction = {
  date: string
  height: string
  in?: MidgardTransaction[]
  out?: MidgardTransaction[]
  type: string
  status: 'success' | 'pending'
  metadata?: {
    cacaoPoolDeposit?: {
      units?: string
    }
    cacaoPoolWithdraw?: {
      units?: string
      basisPoints?: string
      affiliateAmount?: string
      affiliateAddress?: string
      affiliateBasisPoint?: string
    }
  }
}

type MidgardTransaction = {
  txID?: string
  memo?: string
  coins?: Array<{
    asset: string
    amount: string
  }>
}

export type CacaoPoolPosition = {
  address: string
  units: string
  cacaoAdded: string
  cacaoDeposit: string
  cacaoWithdrawn: string
  netCacao: string
  firstAddedAt: number | null
  lastAddedAt: number | null
}

export type CacaoPoolHistoryPoint = {
  startTime: number
  endTime: number
  label: string
  members: string
  units: string
}

export type CacaoPoolActivityItem = {
  id: string
  type: 'deposit' | 'withdraw'
  timestamp: number
  height: string
  status: 'success' | 'pending'
  memo: string | null
  txHash: string | null
  inboundAmount: string | null
  outboundAmount: string | null
  units: string | null
  basisPoints: string | null
}

export type CacaoPoolSnapshot = {
  position: CacaoPoolPosition | null
  history: CacaoPoolHistoryPoint[]
  activity: CacaoPoolActivityItem[]
  fetchedAt: string
}

export type CacaoPoolServiceOptions = {
  fetch?: FetchLike
  midgardUrl?: string
}

const DEFAULT_MIDGARD_URL = 'https://midgard.mayachain.info'
const CACAO_DECIMALS = 10

function defaultFetchMissing(): never {
  throw new Error('No fetch implementation is available for CACAOPool requests.')
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

function normalizeMidgardUrl(value?: string): string {
  return (value ?? DEFAULT_MIDGARD_URL).replace(/\/+$/, '')
}

async function getJson<T>(
  path: string,
  options: CacaoPoolServiceOptions = {},
): Promise<T> {
  const response = await resolveFetchImplementation(options.fetch)(
    `${normalizeMidgardUrl(options.midgardUrl)}${path}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to load CACAOPool data (${response.status})`)
  }

  return (await response.json()) as T
}

export async function fetchCacaoPoolPosition(
  address: string,
  options: CacaoPoolServiceOptions = {},
): Promise<CacaoPoolPosition | null> {
  const positions = await getJson<MidgardCacaoPoolPosition[]>(
    `/v2/cacaopool/${encodeURIComponent(address)}`,
    options,
  )

  const match = positions.find((item) => item.cacaoAddress === address) ?? positions[0]
  if (!match) {
    return null
  }

  const added = BigInt(match.cacaoAdded || '0')
  const withdrawn = BigInt(match.cacaoWithdrawn || '0')

  return {
    address: match.cacaoAddress,
    units: match.units || '0',
    cacaoAdded: match.cacaoAdded || '0',
    cacaoDeposit: match.cacaoDeposit || '0',
    cacaoWithdrawn: match.cacaoWithdrawn || '0',
    netCacao: (added - withdrawn).toString(),
    firstAddedAt: toUnixTimestamp(match.dateFirstAdded),
    lastAddedAt: toUnixTimestamp(match.dateLastAdded),
  }
}

export async function fetchCacaoPoolHistory(
  options: CacaoPoolServiceOptions = {},
): Promise<CacaoPoolHistoryPoint[]> {
  const history = await getJson<MidgardHistoryResponse>(
    '/v2/history/cacaopool?interval=day&count=30',
    options,
  )

  return (history.intervals ?? []).map((interval) => ({
    startTime: toUnixTimestamp(interval.startTime) ?? 0,
    endTime: toUnixTimestamp(interval.endTime) ?? 0,
    label: formatHistoryLabel(interval.endTime),
    members: interval.count || '0',
    units: interval.units || '0',
  }))
}

export async function fetchCacaoPoolActivity(
  address: string,
  options: CacaoPoolServiceOptions = {},
): Promise<CacaoPoolActivityItem[]> {
  const response = await getJson<MidgardActionsResponse>(
    `/v2/actions?address=${encodeURIComponent(address)}`,
    options,
  )

  return normalizeCacaoPoolActivity(response.actions ?? [])
}

export async function fetchCacaoPoolSnapshot(
  address: string,
  options: CacaoPoolServiceOptions = {},
): Promise<CacaoPoolSnapshot> {
  const [position, history, activity] = await Promise.all([
    fetchCacaoPoolPosition(address, options),
    fetchCacaoPoolHistory(options),
    fetchCacaoPoolActivity(address, options),
  ])

  return {
    position,
    history,
    activity,
    fetchedAt: new Date().toISOString(),
  }
}

export function normalizeCacaoPoolActivity(
  actions: MidgardAction[],
): CacaoPoolActivityItem[] {
  return actions
    .filter(
      (action) =>
        action.type === 'cacaoPoolDeposit' || action.type === 'cacaoPoolWithdraw',
    )
    .map((action) => {
      const type: CacaoPoolActivityItem['type'] =
        action.type === 'cacaoPoolDeposit' ? 'deposit' : 'withdraw'
      const tx = action.in?.[0] ?? action.out?.[0]

      return {
        id: tx?.txID ?? `${action.type}-${action.date}-${action.height}`,
        type,
        timestamp: toUnixTimestamp(action.date) ?? 0,
        height: action.height,
        status: action.status,
        memo: tx?.memo ?? null,
        txHash: tx?.txID ?? null,
        inboundAmount: findCoinAmount(action.in, 'MAYA.CACAO'),
        outboundAmount: findCoinAmount(action.out, 'MAYA.CACAO'),
        units: type === 'deposit'
          ? action.metadata?.cacaoPoolDeposit?.units ?? null
          : action.metadata?.cacaoPoolWithdraw?.units ?? null,
        basisPoints: action.metadata?.cacaoPoolWithdraw?.basisPoints ?? null,
      }
    })
    .sort((left, right) => right.timestamp - left.timestamp)
}

export function formatCacaoBaseUnits(value: string): string {
  return formatBaseUnits(value, CACAO_DECIMALS)
}

export function formatBaseUnits(value: string, decimals: number): string {
  const negative = value.startsWith('-')
  const digits = negative ? value.slice(1) : value
  const normalized = digits.replace(/^0+(?=\d)/, '') || '0'

  if (decimals <= 0) {
    return `${negative ? '-' : ''}${normalized}`
  }

  const padded = normalized.padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, -decimals)
  const fractionalPart = padded.slice(-decimals).replace(/0+$/, '')

  return `${negative ? '-' : ''}${integerPart}${fractionalPart ? `.${fractionalPart}` : ''}`
}

export function parseDecimalToBaseUnits(value: string, decimals: number): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null
  }

  const [whole, fractional = ''] = trimmed.split('.')
  const normalizedFraction = fractional.padEnd(decimals, '0')
  if (normalizedFraction.length > decimals) {
    return null
  }

  return `${whole}${normalizedFraction}`.replace(/^0+(?=\d)/, '') || '0'
}

export function formatHistoryLabel(unixSeconds: string): string {
  const date = toDate(unixSeconds)
  if (!date) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function formatTimestamp(unixSeconds: number | null): string {
  const date = toDate(unixSeconds)
  if (!date) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function toUnixTimestamp(value: string | number | undefined): number | null {
  if (value == null || value === '') {
    return null
  }

  if (typeof value === 'number') {
    return normalizeUnixTimestamp(value)
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return normalizeUnixTimestamp(numeric)
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.floor(parsed / 1000)
}

function normalizeUnixTimestamp(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }

  return value >= 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
}

function toDate(value: string | number | null | undefined): Date | null {
  const unixSeconds =
    typeof value === 'string' || typeof value === 'number'
      ? toUnixTimestamp(value)
      : null

  if (!unixSeconds) {
    return null
  }

  const date = new Date(unixSeconds * 1000)
  return Number.isNaN(date.getTime()) ? null : date
}

function findCoinAmount(
  transactions: MidgardTransaction[] | undefined,
  asset: string,
): string | null {
  for (const transaction of transactions ?? []) {
    const match = transaction.coins?.find((coin) => coin.asset === asset)
    if (match) {
      return match.amount
    }
  }

  return null
}
