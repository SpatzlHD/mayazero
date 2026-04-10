import { describe, expect, it } from 'vitest'
import {
  mergeLiquidityPositionsWithFallback,
  normalizeLiquidityActionAvailability,
  normalizeLiquidityPools,
  normalizeLiquidityPositions,
  type LiquidityActionAvailability,
} from './liquidity'

describe('liquidity service', () => {
  it('normalizes inbound address action availability', () => {
    const availability = normalizeLiquidityActionAvailability([
      {
        address: '0xinbound',
        chain: 'ETH',
        chain_lp_actions_paused: false,
        dust_threshold: '0',
        gas_rate: '15',
        gas_rate_units: 'gwei',
        halted: false,
      },
      {
        address: 'bc1qinbound',
        chain: 'BTC',
        chain_lp_actions_paused: true,
        dust_threshold: '10000',
        halted: false,
      },
    ])

    expect(availability).toEqual(
      expect.objectContaining({
        ETH: expect.objectContaining({
          inboundAddress: '0xinbound',
          lpActionsPaused: false,
        }),
        BTC: expect.objectContaining({
          dustThreshold: '10000',
          lpActionsPaused: true,
        }),
      }),
    )
  })

  it('normalizes pools into actionable rows', () => {
    const availability: Record<string, LiquidityActionAvailability> = {
      ETH: {
        chain: 'ETH',
        inboundAddress: '0xinbound',
        lpActionsPaused: false,
        tradingPaused: false,
        halted: false,
        dustThreshold: '0',
      },
    }

    const pools = normalizeLiquidityPools(
      [
        {
          asset: 'ETH.ETH',
          assetDepth: '100000000',
          assetPrice: '10',
          assetPriceUSD: '2500',
          liquidityUnits: '9000',
          nativeDecimal: '18',
          runeDepth: '1000000000',
          poolUnits: '10000',
          poolAPY: '0.12',
          status: 'available',
          volume24h: '400000000',
        },
      ],
      availability,
    )

    expect(pools).toHaveLength(1)
    expect(pools[0]).toEqual(
      expect.objectContaining({
        actionAvailability: expect.objectContaining({
          inboundAddress: '0xinbound',
        }),
        asset: 'ETH.ETH',
        chainTicker: 'ETH',
        decimals: 18,
        isActionable: true,
        symbol: 'ETH',
        walletChain: 'Ethereum',
      }),
    )
    expect(pools[0]!.depthUsd).toBeGreaterThan(0)
  })

  it('normalizes member positions from multiple addresses', () => {
    const positions = normalizeLiquidityPositions(
      {
        pools: [
          {
            pool: 'ETH.ETH',
            liquidityUnits: '100',
            assetAddress: '0xasset',
            cacaoAddress: 'maya1vault',
            assetAdded: '10',
            cacaoAdded: '20',
            assetDepositValue: '10',
            cacaoDepositValue: '20',
            assetRedeemValue: '11',
            cacaoRedeemValue: '22',
            dateFirstAdded: '1710000000',
            dateLastAdded: '1710000100',
          },
          {
            pool: 'BTC.BTC',
            liquidityUnits: '0',
            assetPending: '50',
            assetAddress: 'bc1pending',
            cacaoAddress: 'maya1vault',
          },
        ],
      },
      ['maya1vault', '0xasset'],
    )

    expect(positions).toHaveLength(2)
    expect(positions[0]).toEqual(
      expect.objectContaining({
        pool: 'ETH.ETH',
        state: 'active',
        matchingAddresses: ['0xasset', 'maya1vault'],
      }),
    )
    expect(positions[1]).toEqual(
      expect.objectContaining({
        pool: 'BTC.BTC',
        state: 'pending',
      }),
    )
  })

  it('merges Mayanode fallback records into member positions', () => {
    const merged = mergeLiquidityPositionsWithFallback(
      [
        {
          pool: 'ETH.ETH',
          state: 'active',
          units: '100',
          pendingAsset: '0',
          pendingCacao: '0',
          assetAdded: '10',
          assetDepositValue: '10',
          assetRedeemValue: '11',
          assetWithdrawn: '0',
          cacaoAdded: '20',
          cacaoDepositValue: '20',
          cacaoRedeemValue: '22',
          cacaoWithdrawn: '0',
          assetAddress: null,
          cacaoAddress: 'maya1vault',
          firstAddedAt: null,
          lastAddedAt: 1,
          matchingAddresses: ['maya1vault'],
          withdrawCounter: null,
        },
      ],
      {
        pool: 'ETH.ETH',
        state: 'active',
        units: '100',
        pendingAsset: '0',
        pendingCacao: '0',
        assetAdded: '0',
        assetDepositValue: '9',
        assetRedeemValue: '12',
        assetWithdrawn: '0',
        cacaoAdded: '0',
        cacaoDepositValue: '19',
        cacaoRedeemValue: '23',
        cacaoWithdrawn: '0',
        assetAddress: '0xasset',
        cacaoAddress: 'maya1vault',
        firstAddedAt: null,
        lastAddedAt: 2,
        matchingAddresses: ['0xasset'],
        withdrawCounter: null,
      },
    )

    expect(merged[0]).toEqual(
      expect.objectContaining({
        assetAddress: '0xasset',
        cacaoAddress: 'maya1vault',
        matchingAddresses: ['maya1vault'],
      }),
    )
  })
})
