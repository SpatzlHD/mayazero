import { WalletChain as Chain } from '#/wallet/chain-types'
import { describe, expect, it } from 'vitest'
import type { LiquidityPool, LiquidityPosition } from '#/lib/liquidity'
import {
  filterVisibleLiquidityPools,
  getLiquidityFeedbackBanner,
  getInitialLiquidityPoolAsset,
  getPendingLiquidityCancelMode,
  getLiquidityPrimaryAction,
  sortLiquidityPools,
  syncSymmetricDepositAmounts,
} from './liquidity'

function makePool(overrides: Partial<LiquidityPool> = {}): LiquidityPool {
  return {
    actionAvailability: {
      chain: 'ETH',
      inboundAddress: '0xinbound',
      lpActionsPaused: false,
      tradingPaused: false,
      halted: false,
      dustThreshold: '0',
    },
    apr: '0.1',
    asset: 'ETH.ETH',
    assetDepth: '100000000',
    assetPrice: '10',
    assetPriceUsd: '2500',
    cacaoDepth: '1000000000',
    chainKey: 'ethereum',
    chainName: 'Ethereum',
    chainTicker: 'ETH',
    decimals: 18,
    depthUsd: 100000,
    family: 'evm',
    iconId: 'eth',
    isActionable: true,
    lpUnits: '100',
    poolUnits: '120',
    saversDepth: '0',
    status: 'available',
    symbol: 'ETH',
    ticker: 'ETH',
    volume24h: '100000000',
    volume24hCacao: 0.01,
    volume24hUsd: 2.5,
    walletChain: Chain.Ethereum,
    ...overrides,
  }
}

function makePosition(overrides: Partial<LiquidityPosition> = {}): LiquidityPosition {
  return {
    assetAddress: '0xasset',
    assetAdded: '10',
    assetDepositValue: '10',
    assetRedeemValue: '11',
    assetWithdrawn: '0',
    cacaoAddress: 'maya1vault',
    cacaoAdded: '20',
    cacaoDepositValue: '20',
    cacaoRedeemValue: '22',
    cacaoWithdrawn: '0',
    firstAddedAt: 1,
    lastAddedAt: 2,
    matchingAddresses: ['maya1vault'],
    pendingAsset: '0',
    pendingCacao: '0',
    pool: 'ETH.ETH',
    state: 'active',
    units: '100',
    withdrawCounter: null,
    ...overrides,
  }
}

describe('liquidity route helpers', () => {
  it('prioritizes active positions when sorting pools', () => {
    const pools = sortLiquidityPools(
      [
        makePool({ asset: 'BTC.BTC', chainTicker: 'BTC', chainName: 'Bitcoin', depthUsd: 200000, symbol: 'BTC', walletChain: Chain.Bitcoin }),
        makePool(),
      ],
      [makePosition()],
    )

    expect(pools[0]?.asset).toBe('ETH.ETH')
  })

  it('uses pending deposits before positions for initial selection', () => {
    expect(
      getInitialLiquidityPoolAsset(
        [makePool(), makePool({ asset: 'BTC.BTC' })],
        [makePosition()],
        {
          assetAmountBaseUnits: '1',
          cacaoAmountBaseUnits: '1',
          interfaceAffiliateBps: '0',
          poolAsset: 'BTC.BTC',
          source: 'stored',
          sessionId: 'vault-1',
        },
      ),
    ).toBe('BTC.BTC')
  })

  it('uses pending positions for initial selection when no local pending state exists', () => {
    expect(
      getInitialLiquidityPoolAsset(
        [makePool(), makePool({ asset: 'BTC.BTC' })],
        [makePosition({ pool: 'BTC.BTC', state: 'pending', units: '0', pendingAsset: '100', pendingCacao: '0' })],
        null,
      ),
    ).toBe('BTC.BTC')
  })

  it('detects pending-only LP cancels for cacao-side recovery', () => {
    expect(
      getPendingLiquidityCancelMode(
        makePosition({
          state: 'pending',
          units: '0',
          pendingAsset: '0',
          pendingCacao: '88',
        }),
      ),
    ).toBe('cacao')
  })

  it('detects pending-only LP cancels for asset-side recovery', () => {
    expect(
      getPendingLiquidityCancelMode(
        makePosition({
          state: 'pending',
          units: '0',
          pendingAsset: '55',
          pendingCacao: '0',
        }),
      ),
    ).toBe('asset')
  })

  it('hides staged pools outside power-user mode', () => {
    const pools = [
      makePool(),
      makePool({ asset: 'ARB.ETH', chainTicker: 'ARB', chainName: 'Arbitrum', status: 'staged' }),
    ]

    expect(filterVisibleLiquidityPools(pools, false).map((pool) => pool.asset)).toEqual(['ETH.ETH'])
    expect(filterVisibleLiquidityPools(pools, true).map((pool) => pool.asset)).toEqual([
      'ETH.ETH',
      'ARB.ETH',
    ])
  })

  it('keeps symmetric deposit inputs in sync', () => {
    expect(
      syncSymmetricDepositAmounts({
        assetPrice: '10',
        field: 'asset',
        nextValue: '2',
      }),
    ).toEqual({
      assetAmount: '2',
      cacaoAmount: '20',
    })

    expect(
      syncSymmetricDepositAmounts({
        assetPrice: '10',
        field: 'cacao',
        nextValue: '25',
      }),
    ).toEqual({
      assetAmount: '2.5',
      cacaoAmount: '25',
    })
  })

  it('gates deposit and withdraw actions deterministically', () => {
    expect(
      getLiquidityPrimaryAction({
        activeTab: 'deposit',
        assetAmountBaseUnits: null,
        assetBalanceBaseUnits: null,
        cacaoAmountBaseUnits: null,
        cacaoBalanceBaseUnits: null,
        depositMode: 'symmetric',
        hasPosition: false,
        hasSession: false,
        isSubmitting: false,
        pendingDepositMatches: false,
        pool: null,
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: 'connect',
        label: 'Connect Vault',
      }),
    )

    expect(
      getLiquidityPrimaryAction({
        activeTab: 'deposit',
        assetAmountBaseUnits: '200',
        assetBalanceBaseUnits: '100',
        cacaoAmountBaseUnits: '1',
        cacaoBalanceBaseUnits: '5',
        depositMode: 'symmetric',
        hasPosition: false,
        hasSession: true,
        isSubmitting: false,
        pendingDepositMatches: false,
        pool: makePool(),
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: true,
        label: 'Insufficient ETH',
      }),
    )

    expect(
      getLiquidityPrimaryAction({
        activeTab: 'deposit',
        assetAmountBaseUnits: '1',
        assetBalanceBaseUnits: '10',
        cacaoAmountBaseUnits: '1',
        cacaoBalanceBaseUnits: '10',
        depositMode: 'symmetric',
        hasPosition: false,
        hasSession: true,
        isViewOnly: true,
        isSubmitting: false,
        pendingDepositMatches: false,
        pendingDepositStoredAmount: false,
        pool: makePool(),
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: true,
        label: 'View Only',
      }),
    )

    expect(
      getLiquidityPrimaryAction({
        activeTab: 'deposit',
        assetAmountBaseUnits: '1',
        assetBalanceBaseUnits: '10',
        cacaoAmountBaseUnits: null,
        cacaoBalanceBaseUnits: '10',
        depositMode: 'symmetric',
        hasPosition: false,
        hasSession: true,
        isSubmitting: false,
        pendingDepositMatches: true,
        pendingDepositStoredAmount: false,
        pool: makePool(),
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: true,
        kind: 'resume',
        label: 'Enter CACAO Amount',
      }),
    )

    expect(
      getLiquidityPrimaryAction({
        activeTab: 'deposit',
        assetAmountBaseUnits: '1',
        assetBalanceBaseUnits: '10',
        cacaoAmountBaseUnits: '1',
        cacaoBalanceBaseUnits: '10',
        depositMode: 'symmetric',
        hasPosition: false,
        hasSession: true,
        isSubmitting: false,
        pendingDepositMatches: true,
        pendingDepositStoredAmount: false,
        pool: makePool(),
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: false,
        kind: 'resume',
        label: 'Submit CACAO Leg',
      }),
    )

    expect(
      getLiquidityPrimaryAction({
        activeTab: 'withdraw',
        assetAmountBaseUnits: null,
        assetBalanceBaseUnits: null,
        cacaoAmountBaseUnits: null,
        cacaoBalanceBaseUnits: null,
        depositMode: 'symmetric',
        hasPendingCancelPosition: false,
        hasPosition: true,
        hasSession: true,
        isSubmitting: false,
        pendingDepositMatches: false,
        pendingDepositStoredAmount: false,
        pool: makePool(),
        withdrawBasisPoints: 2500,
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: false,
        label: 'Submit Withdrawal',
      }),
    )

    expect(
      getLiquidityPrimaryAction({
        activeTab: 'withdraw',
        assetAmountBaseUnits: null,
        assetBalanceBaseUnits: null,
        cacaoAmountBaseUnits: null,
        cacaoBalanceBaseUnits: null,
        depositMode: 'symmetric',
        hasPendingCancelPosition: true,
        hasPosition: true,
        hasSession: true,
        isSubmitting: false,
        pendingDepositMatches: false,
        pendingDepositStoredAmount: false,
        pool: makePool(),
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: false,
        label: 'Cancel Pending Deposit',
      }),
    )
  })

  it('treats balance warnings as non-blocking for valid deposits', () => {
    expect(
      getLiquidityFeedbackBanner({
        balanceWarning: 'Unable to refresh USDT balance.',
      }),
    ).toEqual({
      tone: 'warning',
      message: 'Unable to refresh USDT balance.',
    })

    expect(
      getLiquidityPrimaryAction({
        activeTab: 'deposit',
        assetAmountBaseUnits: '1',
        assetBalanceBaseUnits: null,
        cacaoAmountBaseUnits: '1',
        cacaoBalanceBaseUnits: '10',
        depositMode: 'symmetric',
        hasPosition: false,
        hasSession: true,
        isSubmitting: false,
        pendingDepositMatches: false,
        pool: makePool(),
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: false,
        label: 'Start Guided Deposit',
      }),
    )
  })
})
