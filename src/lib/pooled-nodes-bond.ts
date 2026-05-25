import type { CacaoPoolPosition } from './cacao-pool'
import type { LiquidityPosition } from './liquidity'
import { parseDecimalToBaseUnits } from './cacao-pool'

export const POOLED_NODE_CACAO_DECIMALS = 10
/** CACAO sent with bond/unbond/remove-provider deposit memos (not the bonded LP amount). */
export const BOND_DEPOSIT_CACAO = '0.02'
export const BOND_DEPOSIT_BASE_UNITS =
  parseDecimalToBaseUnits(BOND_DEPOSIT_CACAO, POOLED_NODE_CACAO_DECIMALS) ??
  '200000000'

/** CACAO pool bond units count at half weight vs LP pool units on Maya. */
export const CACAO_POOL_BOND_WEIGHT = 0.5
export const LP_BOND_WEIGHT = 1

/** Asset key used in BOND/UNBOND memos for CACAO pool units. */
export const CACAO_POOL_BOND_ASSET = 'MAYA.CACAO'

export type BondPositionSource = 'lp' | 'cacao-pool'

export type BondablePosition = {
  id: string
  source: BondPositionSource
  asset: string
  label: string
  units: string
  availableUnits: string
  bondedUnits: string
  bondWeight: number
  effectiveUnits: string
}

export type BondedAllocationRef = {
  asset: string
  units: string
}

/** Liquidity / CACAO pool units are always whole on-chain integers — never decimal amounts. */
export function formatLiquidityUnits(value: string): string {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    return trimmed
  }
  return trimmed.replace(/^0+(?=\d)/, '') || '0'
}

export function formatLiquidityUnitsLabel(value: string): string {
  const normalized = formatLiquidityUnits(value)
  if (!/^\d+$/.test(normalized)) {
    return normalized
  }
  return BigInt(normalized).toLocaleString('en-US')
}

export function computeLiquidityUnitFraction(
  units: string,
  percent: number,
): string | null {
  const normalized = formatLiquidityUnits(units)
  if (!/^\d+$/.test(normalized) || normalized === '0') {
    return null
  }
  if (percent <= 0 || percent > 100) {
    return null
  }
  if (percent === 100) {
    return normalized
  }

  const amount = (BigInt(normalized) * BigInt(percent)) / 100n
  if (amount <= 0n) {
    return null
  }

  return amount.toString()
}

export function computeEffectiveBondUnits(
  units: string,
  source: BondPositionSource,
): bigint {
  const parsed = /^\d+$/.test(units) ? BigInt(units) : 0n
  if (parsed <= 0n) {
    return 0n
  }

  if (source === 'cacao-pool') {
    return parsed / 2n
  }

  return parsed
}

export function formatEffectiveBondUnits(
  units: string,
  source: BondPositionSource,
): string {
  const effective = computeEffectiveBondUnits(units, source)
  return effective > 0n ? effective.toString() : '0'
}

export function formatBondWeightLabel(source: BondPositionSource): string {
  return source === 'cacao-pool'
    ? `${CACAO_POOL_BOND_WEIGHT * 100}% of LP bond weight`
    : 'Full LP bond weight'
}

function resolveBondedUnitsForPosition(
  allocations: BondedAllocationRef[],
  asset: string,
  source: BondPositionSource,
): bigint {
  const exact = allocations.find((allocation) => allocation.asset === asset)
  if (exact && /^\d+$/.test(exact.units)) {
    return BigInt(exact.units)
  }

  if (source === 'cacao-pool') {
    for (const allocation of allocations) {
      if (classifyProviderPoolAsset(allocation.asset) !== 'cacao-pool') {
        continue
      }
      if (/^\d+$/.test(allocation.units)) {
        return BigInt(allocation.units)
      }
    }
  }

  return 0n
}

function computeAvailableBondUnits(
  walletUnits: string,
  bondedUnits: bigint,
): string | null {
  const wallet = BigInt(walletUnits)
  if (wallet <= bondedUnits) {
    return null
  }
  return (wallet - bondedUnits).toString()
}

export function buildBondablePositions(input: {
  liquidityPositions: LiquidityPosition[]
  cacaoPoolPosition: CacaoPoolPosition | null
  bondedAllocations?: BondedAllocationRef[]
}): BondablePosition[] {
  const positions: BondablePosition[] = []
  const bondedAllocations = input.bondedAllocations ?? []

  for (const position of input.liquidityPositions) {
    const units = position.units?.trim() ?? ''
    if (!/^\d+$/.test(units) || units === '0') {
      continue
    }

    const bondedUnits = resolveBondedUnitsForPosition(
      bondedAllocations,
      position.pool,
      'lp',
    )
    const availableUnits = computeAvailableBondUnits(units, bondedUnits)
    if (!availableUnits) {
      continue
    }

    positions.push({
      id: `lp:${position.pool}`,
      source: 'lp',
      asset: position.pool,
      label: position.pool,
      units,
      availableUnits,
      bondedUnits: bondedUnits.toString(),
      bondWeight: LP_BOND_WEIGHT,
      effectiveUnits: formatEffectiveBondUnits(availableUnits, 'lp'),
    })
  }

  const cacaoUnits = input.cacaoPoolPosition?.units?.trim() ?? ''
  if (/^\d+$/.test(cacaoUnits) && cacaoUnits !== '0') {
    const bondedUnits = resolveBondedUnitsForPosition(
      bondedAllocations,
      CACAO_POOL_BOND_ASSET,
      'cacao-pool',
    )
    const availableUnits = computeAvailableBondUnits(cacaoUnits, bondedUnits)
    if (availableUnits) {
      positions.push({
        id: 'cacao-pool',
        source: 'cacao-pool',
        asset: CACAO_POOL_BOND_ASSET,
        label: 'CACAO Pool',
        units: cacaoUnits,
        availableUnits,
        bondedUnits: bondedUnits.toString(),
        bondWeight: CACAO_POOL_BOND_WEIGHT,
        effectiveUnits: formatEffectiveBondUnits(availableUnits, 'cacao-pool'),
      })
    }
  }

  return positions.sort((left, right) => left.label.localeCompare(right.label))
}

export function formatBondablePositionOptionLabel(
  position: BondablePosition,
): string {
  const available = formatLiquidityUnitsLabel(position.availableUnits)
  const bonded = BigInt(position.bondedUnits)
  if (bonded > 0n) {
    return `${position.label} — ${available} units available (${formatLiquidityUnitsLabel(position.bondedUnits)} already bonded)`
  }
  return `${position.label} — ${available} units available`
}

export function formatBondedAllocationOptionLabel(input: {
  asset: string
  units: string
  source: BondPositionSource | null
}): string {
  const formatted = formatLiquidityUnitsLabel(input.units)
  const label =
    input.source === 'cacao-pool' && input.asset === CACAO_POOL_BOND_ASSET
      ? 'CACAO Pool'
      : input.asset
  return `${label} — ${formatted} units bonded`
}

export function findBondablePosition(
  positions: BondablePosition[],
  positionId: string,
): BondablePosition | null {
  return positions.find((position) => position.id === positionId) ?? null
}

export function parseBondUnitsInput(value: string): {
  units: string | null
  error: string | null
} {
  const trimmed = value.trim()
  if (!trimmed) {
    return { units: null, error: null }
  }

  if (!/^\d+$/.test(trimmed) || trimmed === '0') {
    return {
      units: null,
      error: 'Enter a whole-number LP or CACAO pool unit amount.',
    }
  }

  return { units: trimmed, error: null }
}

export function validateBondUnitsAgainstPosition(
  units: string,
  position: BondablePosition | null,
): string | null {
  if (!position) {
    return 'Select a bondable LP or CACAO pool position.'
  }

  if (BigInt(units) > BigInt(position.availableUnits)) {
    return `Amount exceeds available ${position.label} units (${formatLiquidityUnitsLabel(position.availableUnits)}).`
  }

  return null
}

export function classifyProviderPoolAsset(asset: string): BondPositionSource | null {
  const normalized = asset.trim().toUpperCase()
  if (
    normalized === CACAO_POOL_BOND_ASSET ||
    normalized.includes('CACAO.POOL') ||
    normalized.endsWith('.POOL')
  ) {
    return 'cacao-pool'
  }

  if (normalized.includes('.')) {
    return 'lp'
  }

  return null
}

export function summarizeProviderPoolEntry(
  asset: string,
  amount: string,
): { label: string; formattedAmount: string; bondWeightNote: string } {
  const source = classifyProviderPoolAsset(asset)
  const formattedAmount = formatLiquidityUnitsLabel(amount)
  const bondWeightNote =
    source === 'cacao-pool'
      ? `Counts at ${CACAO_POOL_BOND_WEIGHT}x LP bond weight`
      : source === 'lp'
        ? 'LP pool units'
        : 'Bond allocation'

  return {
    label: asset,
    formattedAmount,
    bondWeightNote,
  }
}
