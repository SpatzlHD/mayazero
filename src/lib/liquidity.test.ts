import { describe, expect, it } from 'vitest'
import {
  computeLiquidityRedeemValues,
  enrichLiquidityPositionsWithPoolData,
  mergeLiquidityPositionsWithFallback,
  normalizeLiquidityActionAvailability,
  normalizeLiquidityPools,
  normalizeLiquidityPositions,
  type LiquidityActionAvailability,
  type LiquidityPool,
  type LiquidityPosition,
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

  it('converts 24h volume from CACAO base units to USD', () => {
    const availability = normalizeLiquidityActionAvailability([
      {
        address: 'bc1qexample',
        chain: 'BTC',
        chain_lp_actions_paused: false,
        dust_threshold: '0',
        halted: false,
      },
    ])

    const pools = normalizeLiquidityPools(
      [
        {
          asset: 'BTC.BTC',
          assetDepth: '10000000000',
          assetPrice: '534549.4854816278',
          assetPriceUSD: '77592.05806160417',
          liquidityUnits: '9000',
          nativeDecimal: '8',
          runeDepth: '50000000000',
          poolUnits: '10000',
          poolAPY: '0.01',
          status: 'available',
          volume24h: '99266175709741625',
        },
      ],
      availability,
    )

    const pool = pools[0]!
    const expectedCacaoUsd =
      77_592.05806160417 / 534_549.4854816278

    expect(pool.volume24hCacao).toBeCloseTo(9_926_617.57, 0)
    expect(pool.volume24hUsd).toBeCloseTo(
      pool.volume24hCacao * expectedCacaoUsd,
      2,
    )
  })

  it('converts pool depth from Midgard base units to USD', () => {
    const availability = normalizeLiquidityActionAvailability([
      {
        address: 'bc1qexample',
        chain: 'BTC',
        chain_lp_actions_paused: false,
        dust_threshold: '0',
        halted: false,
      },
    ])

    const pools = normalizeLiquidityPools(
      [
        {
          asset: 'BTC.BTC',
          assetDepth: '3088803441',
          assetPrice: '534422.4169712635',
          assetPriceUSD: '77609.0485316727',
          liquidityUnits: '9000',
          nativeDecimal: '8',
          runeDepth: '165072580048837539',
          poolUnits: '10000',
          poolAPY: '0.3',
          status: 'available',
          volume24h: '0',
        },
      ],
      availability,
    )

    const pool = pools[0]!
    const cacaoUsd = 77_609.0485316727 / 534_422.4169712635

    expect(pool.depthUsd).toBeCloseTo(
      30.88803441 * 77_609.0485316727 + 16_507_258.004883753 * cacaoUsd,
      -3,
    )
  })

  it('normalizes EVM pool token identifiers and inbound router addresses', () => {
    const availability = normalizeLiquidityActionAvailability([
      {
        address: '0XAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
        chain: 'ARB',
        chain_lp_actions_paused: false,
        dust_threshold: '0',
        halted: false,
        router: '0X700E97EF07219440487840DC472E7120A7FF11F4',
      },
      {
        address: '0XAB1722696E2320687B80D9DC62030BD6FBC8BBFD',
        chain: 'ETH',
        chain_lp_actions_paused: false,
        dust_threshold: '0',
        halted: false,
      },
    ])

    const pools = normalizeLiquidityPools(
      [
        {
          asset: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
          assetDepth: '100000000',
          assetPrice: '1',
          assetPriceUSD: '1',
          liquidityUnits: '9000',
          nativeDecimal: '6',
          runeDepth: '1000000000',
          poolUnits: '10000',
          poolAPY: '0.12',
          status: 'available',
          volume24h: '400000000',
        },
        {
          asset: 'ARB.USDT-0XFD086BC7CD5C481DCC9C85EBE478A1C0B69FCBB9',
          assetDepth: '100000000',
          assetPrice: '1',
          assetPriceUSD: '1',
          liquidityUnits: '9000',
          nativeDecimal: '6',
          runeDepth: '1000000000',
          poolUnits: '10000',
          poolAPY: '0.12',
          status: 'available',
          volume24h: '400000000',
        },
      ],
      availability,
    )

    const ethUsdcPool = pools.find((pool) => pool.asset.startsWith('ETH.USDC'))
    const arbUsdtPool = pools.find((pool) => pool.asset.startsWith('ARB.USDT'))

    expect(ethUsdcPool?.tokenId?.startsWith('0x')).toBe(true)
    expect(ethUsdcPool?.tokenId?.toLowerCase()).toBe(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    )
    expect(arbUsdtPool?.tokenId?.startsWith('0x')).toBe(true)
    expect(arbUsdtPool?.tokenId?.toLowerCase()).toBe(
      '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    )
    expect(arbUsdtPool?.actionAvailability?.inboundAddress.startsWith('0x')).toBe(true)
    expect(arbUsdtPool?.actionAvailability?.router?.startsWith('0x')).toBe(true)
    expect(arbUsdtPool?.actionAvailability?.inboundAddress.toLowerCase()).toBe(
      '0xab1722696e2320687b80d9dc62030bd6fbc8bbfd',
    )
    expect(arbUsdtPool?.actionAvailability?.router?.toLowerCase()).toBe(
      '0x700e97ef07219440487840dc472e7120a7ff11f4',
    )
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

  it('normalizes midgard member fields and computes redeem values from pool depth', () => {
    const positions = normalizeLiquidityPositions(
      {
        pools: [
          {
            pool: 'BTC.BTC',
            liquidity_units: '2280000000000000',
            asset_address: 'bc1asset',
            rune_address: 'maya1vault',
            cacao_deposit: '1000000000',
            asset_deposit: '200000000',
          },
        ],
      },
      ['maya1vault'],
    )

    expect(positions).toHaveLength(1)
    expect(positions[0]).toEqual(
      expect.objectContaining({
        pool: 'BTC.BTC',
        units: '2280000000000000',
        cacaoDepositValue: '1000000000',
        assetDepositValue: '200000000',
        cacaoRedeemValue: '0',
        assetRedeemValue: '0',
      }),
    )

    const pool: LiquidityPool = {
      actionAvailability: null,
      apr: '0.01',
      asset: 'BTC.BTC',
      assetDepth: '10000000000',
      assetPrice: '1',
      assetPriceUsd: '90000',
      cacaoDepth: '50000000000',
      chainKey: 'bitcoin',
      chainName: 'Bitcoin',
      chainTicker: 'BTC',
      decimals: 8,
      depthUsd: 1,
      family: 'utxo',
      iconId: 'btc',
      isActionable: true,
      lpUnits: '10000000000000000',
      poolUnits: '10000000000000000',
      saversDepth: '0',
      status: 'available',
      symbol: 'BTC',
      ticker: 'BTC',
      volume24h: '0',
      volume24hCacao: 0,
      volume24hUsd: 0,
    }

    const redeem = computeLiquidityRedeemValues('2280000000000000', pool)
    expect(redeem.cacaoRedeemValue).toBe('11400000000')
    expect(redeem.assetRedeemValue).toBe('2280000000')

    const enriched = enrichLiquidityPositionsWithPoolData(
      positions as LiquidityPosition[],
      [pool],
    )

    expect(enriched[0]?.cacaoRedeemValue).toBe('11400000000')
    expect(enriched[0]?.assetRedeemValue).toBe('2280000000')
  })
})
