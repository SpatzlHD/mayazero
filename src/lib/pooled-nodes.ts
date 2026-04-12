type FetchLike = typeof fetch

type MayanodeNodeRecord = {
  active_block_height?: number
  bond?: string
  bond_address?: string
  bond_providers?: {
    node_address?: string
    node_operator_fee?: string
    providers?: Array<{
      bond_address?: string
      bonded?: boolean
      pools?: Record<string, string>
      reward?: string
    }>
  }
  forced_to_leave?: boolean
  leave_height?: number
  node_address: string
  preflight_status?: {
    code?: number
    reason?: string
    status?: string
  }
  requested_to_leave?: boolean
  reward?: string
  slash_points?: number
  status?: string
  status_since?: number
  version?: string
}

export type PooledNodeProvider = {
  bondAddress: string
  bonded: boolean
  isConnectedProvider: boolean
  isOperator: boolean
  pools: Record<string, string>
  reward: string
}

export type PooledNode = {
  activeBlockHeight: number
  bond: string
  bondAddress: string
  forcedToLeave: boolean
  isOperator: boolean
  isProvider: boolean
  leaveHeight: number
  nodeAddress: string
  operatorFeeBps: string
  preflightCode: number | null
  preflightReason: string
  preflightStatus: string
  providerCount: number
  providers: PooledNodeProvider[]
  related: boolean
  requestedToLeave: boolean
  reward: string
  slashPoints: number
  status: string
  statusSince: number
  version: string
}

export type PooledNodesServiceOptions = {
  connectedAddress?: string
  fetch?: FetchLike
  mayanodeUrl?: string
}

const DEFAULT_MAYANODE_URL = 'https://mayanode.mayachain.info'

function defaultFetchMissing(): never {
  throw new Error('No fetch implementation is available for pooled node requests.')
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

function normalizeUrl(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\/+$/, '')
}

async function getJson<T>(
  url: string,
  options: PooledNodesServiceOptions = {},
): Promise<T> {
  const response = await resolveFetchImplementation(options.fetch)(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to load pooled node data (${response.status})`)
  }

  return (await response.json()) as T
}

export async function fetchPooledNodes(
  options: PooledNodesServiceOptions = {},
): Promise<PooledNode[]> {
  const mayanodeUrl = normalizeUrl(options.mayanodeUrl, DEFAULT_MAYANODE_URL)
  const nodes = await getJson<MayanodeNodeRecord[]>(
    `${mayanodeUrl}/mayachain/nodes`,
    options,
  )

  return sortPooledNodes(
    filterRelatedPooledNodes(
      normalizePooledNodes(nodes, options.connectedAddress),
    ),
  )
}

export function normalizePooledNodes(
  records: MayanodeNodeRecord[],
  connectedAddress?: string,
): PooledNode[] {
  const connected = normalizeAddress(connectedAddress)

  return records.map((record) => {
    const providers = normalizePooledNodeProviders(
      record.bond_providers?.providers ?? [],
      connected,
      normalizeAddress(record.bond_address),
    )
    const firstProviderAddress = normalizeAddress(providers[0]?.bondAddress)
    const isOperator =
      Boolean(connected) &&
      (normalizeAddress(record.bond_address) === connected ||
        firstProviderAddress === connected)
    const isProvider =
      isOperator ||
      providers.some((provider) => normalizeAddress(provider.bondAddress) === connected)

    return {
      activeBlockHeight: normalizeInteger(record.active_block_height),
      bond: normalizeDigits(record.bond),
      bondAddress: record.bond_address?.trim() ?? '',
      forcedToLeave: Boolean(record.forced_to_leave),
      isOperator,
      isProvider,
      leaveHeight: normalizeInteger(record.leave_height),
      nodeAddress: record.node_address,
      operatorFeeBps: normalizeDigits(record.bond_providers?.node_operator_fee),
      preflightCode:
        typeof record.preflight_status?.code === 'number'
          ? record.preflight_status.code
          : null,
      preflightReason: record.preflight_status?.reason?.trim() ?? '',
      preflightStatus: record.preflight_status?.status?.trim() ?? 'Unknown',
      providerCount: providers.length,
      providers,
      related:
        Boolean(connected) &&
        (normalizeAddress(record.bond_address) === connected ||
          providers.some(
            (provider) => normalizeAddress(provider.bondAddress) === connected,
          )),
      requestedToLeave: Boolean(record.requested_to_leave),
      reward: normalizeDigits(record.reward),
      slashPoints: normalizeInteger(record.slash_points),
      status: record.status?.trim() ?? 'Unknown',
      statusSince: normalizeInteger(record.status_since),
      version: record.version?.trim() ?? 'Unknown',
    } satisfies PooledNode
  })
}

export function filterRelatedPooledNodes(nodes: PooledNode[]): PooledNode[] {
  return nodes.filter((node) => node.related)
}

export function sortPooledNodes(nodes: PooledNode[]): PooledNode[] {
  const statusWeight = (status: string): number => {
    switch (status.trim().toLowerCase()) {
      case 'active':
        return 3
      case 'ready':
        return 2
      case 'whitelisted':
        return 1
      default:
        return 0
    }
  }

  return [...nodes].sort((left, right) => {
    const leftRoleWeight = left.isOperator ? 2 : left.isProvider ? 1 : 0
    const rightRoleWeight = right.isOperator ? 2 : right.isProvider ? 1 : 0
    if (leftRoleWeight !== rightRoleWeight) {
      return rightRoleWeight - leftRoleWeight
    }

    const leftStatusWeight = statusWeight(left.status)
    const rightStatusWeight = statusWeight(right.status)
    if (leftStatusWeight !== rightStatusWeight) {
      return rightStatusWeight - leftStatusWeight
    }

    if (left.providerCount !== right.providerCount) {
      return right.providerCount - left.providerCount
    }

    return left.nodeAddress.localeCompare(right.nodeAddress)
  })
}

export function getPooledNodeWarnings(node: PooledNode | null): string[] {
  if (!node) {
    return []
  }

  const warnings: string[] = []
  const normalizedStatus = node.status.trim().toLowerCase()

  if (
    normalizedStatus !== 'active' &&
    normalizedStatus !== 'ready' &&
    normalizedStatus !== 'standby'
  ) {
    warnings.push(
      `Protocol docs describe bond changes primarily around standby, active, or non-churning states. This node is currently ${node.status}.`,
    )
  }

  if (node.requestedToLeave || node.forcedToLeave) {
    warnings.push(
      'This node is flagged to leave. Bonding and provider management may fail or behave differently on-chain.',
    )
  }

  if (node.preflightStatus && node.preflightStatus.toLowerCase() !== 'ready') {
    warnings.push(
      `Preflight status is ${node.preflightStatus}. Review node readiness before submitting a pooled-node transaction.`,
    )
  }

  return warnings
}

function normalizePooledNodeProviders(
  providers: Array<{
    bond_address?: string
    bonded?: boolean
    pools?: Record<string, string>
    reward?: string
  }>,
  connectedAddress: string,
  operatorAddress: string,
): PooledNodeProvider[] {
  return providers.map((provider) => {
    const bondAddress = provider.bond_address?.trim() ?? ''
    const normalizedAddress = normalizeAddress(bondAddress)

    return {
      bondAddress,
      bonded: Boolean(provider.bonded),
      isConnectedProvider: Boolean(connectedAddress) && normalizedAddress === connectedAddress,
      isOperator:
        Boolean(normalizedAddress) &&
        (normalizedAddress === operatorAddress ||
          (!operatorAddress &&
            normalizeAddress(providers[0]?.bond_address) === normalizedAddress)),
      pools: { ...(provider.pools ?? {}) },
      reward: normalizeDigits(provider.reward),
    } satisfies PooledNodeProvider
  })
}

function normalizeDigits(value: string | undefined): string {
  return /^\d+$/.test(value ?? '') ? (value as string) : '0'
}

function normalizeInteger(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0
}

function normalizeAddress(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}
