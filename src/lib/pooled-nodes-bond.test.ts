import { describe, expect, it } from 'vitest'
import {
  buildBondablePositions,
  computeEffectiveBondUnits,
  computeLiquidityUnitFraction,
  formatBondablePositionOptionLabel,
  formatEffectiveBondUnits,
  CACAO_POOL_BOND_WEIGHT,
} from './pooled-nodes-bond'

describe('pooled nodes bond helpers', () => {
  it('applies half weight to cacao pool bond units', () => {
    expect(computeEffectiveBondUnits('1000', 'cacao-pool')).toBe(500n)
    expect(computeEffectiveBondUnits('1001', 'cacao-pool')).toBe(500n)
    expect(computeEffectiveBondUnits('1000', 'lp')).toBe(1000n)
    expect(formatEffectiveBondUnits('1000', 'cacao-pool')).toBe('500')
  })

  it('builds bondable positions from LP and cacao pool holdings', () => {
    const positions = buildBondablePositions({
      liquidityPositions: [
        {
          pool: 'BTC.BTC',
          units: '2500000000',
        } as import('./liquidity').LiquidityPosition,
      ],
      cacaoPoolPosition: {
        address: 'maya1abc',
        units: '1000',
        cacaoAdded: '0',
        cacaoDeposit: '0',
        cacaoWithdrawn: '0',
        netCacao: '0',
        firstAddedAt: null,
        lastAddedAt: null,
      },
    })

    expect(positions).toHaveLength(2)
    expect(positions.find((entry) => entry.source === 'lp')?.asset).toBe('BTC.BTC')
    expect(positions.find((entry) => entry.source === 'cacao-pool')?.bondWeight).toBe(
      CACAO_POOL_BOND_WEIGHT,
    )
    expect(positions.find((entry) => entry.source === 'lp')?.bondedUnits).toBe('0')
  })

  it('subtracts already bonded units from available bondable positions', () => {
    const positions = buildBondablePositions({
      liquidityPositions: [
        {
          pool: 'BTC.BTC',
          units: '2500000000',
        } as import('./liquidity').LiquidityPosition,
      ],
      cacaoPoolPosition: {
        address: 'maya1abc',
        units: '1000',
        cacaoAdded: '0',
        cacaoDeposit: '0',
        cacaoWithdrawn: '0',
        netCacao: '0',
        firstAddedAt: null,
        lastAddedAt: null,
      },
      bondedAllocations: [
        { asset: 'BTC.BTC', units: '500000000' },
        { asset: 'MAYA.CACAO', units: '1000' },
      ],
    })

    expect(positions).toHaveLength(1)
    expect(positions[0]?.asset).toBe('BTC.BTC')
    expect(positions[0]?.availableUnits).toBe('2000000000')
    expect(positions[0]?.bondedUnits).toBe('500000000')
  })

  it('omits positions that are fully bonded on the node', () => {
    const positions = buildBondablePositions({
      liquidityPositions: [
        {
          pool: 'BTC.BTC',
          units: '1000',
        } as import('./liquidity').LiquidityPosition,
      ],
      cacaoPoolPosition: null,
      bondedAllocations: [{ asset: 'BTC.BTC', units: '1000' }],
    })

    expect(positions).toHaveLength(0)
  })

  it('formats bondable position labels as integer units', () => {
    expect(
      formatBondablePositionOptionLabel({
        id: 'cacao-pool',
        source: 'cacao-pool',
        asset: 'MAYA.CACAO',
        label: 'CACAO Pool',
        walletUnits: '469937049864',
        bondedUnits: '97804245790261',
        availableUnits: '469937049864',
        bondWeight: CACAO_POOL_BOND_WEIGHT,
      }),
    ).toBe(
      'CACAO Pool — 469,937,049,864 units available (97,804,245,790,261 already bonded)',
    )
  })

  it('computes integer unit fractions with floor rounding', () => {
    expect(computeLiquidityUnitFraction('1000', 100)).toBe('1000')
    expect(computeLiquidityUnitFraction('1000', 75)).toBe('750')
    expect(computeLiquidityUnitFraction('1000', 50)).toBe('500')
    expect(computeLiquidityUnitFraction('1000', 25)).toBe('250')
    expect(computeLiquidityUnitFraction('1001', 50)).toBe('500')
    expect(computeLiquidityUnitFraction('0', 50)).toBeNull()
  })
})
