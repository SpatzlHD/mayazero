import { describe, expect, it } from "vitest";
import {
  estimateLiquidityPositionRewardUsd,
  estimateLiquidityPositionValueUsd,
  estimatePortfolioRewardsUsd,
  estimatePortfolioValueUsd,
  formatLiquidityDaysInPool,
  resolveDefaultAnalyticsPoolAsset,
} from "./liquidity-insights";
import type { LiquidityPool, LiquidityPosition } from "./liquidity";

function makePool(overrides: Partial<LiquidityPool> = {}): LiquidityPool {
  return {
    actionAvailability: null,
    apr: "0.01",
    asset: "BTC.BTC",
    assetDepth: "10000000000",
    assetPrice: "90000",
    assetPriceUsd: "90000",
    cacaoDepth: "50000000000",
    chainKey: "bitcoin",
    chainName: "Bitcoin",
    chainTicker: "BTC",
    decimals: 8,
    depthUsd: 1_000_000,
    family: "utxo",
    iconId: "btc",
    isActionable: true,
    lpUnits: "10000000000000000",
    poolUnits: "10000000000000000",
    saversDepth: "0",
    status: "available",
    symbol: "BTC",
    ticker: "BTC",
    volume24h: "0",
    volume24hCacao: 0,
    volume24hUsd: 0,
    ...overrides,
  };
}

function makePosition(
  overrides: Partial<LiquidityPosition> = {},
): LiquidityPosition {
  return {
    assetAddress: null,
    assetAdded: "0",
    assetDepositValue: "0",
    assetRedeemValue: "2280000000",
    assetWithdrawn: "0",
    cacaoAddress: "maya1abc",
    cacaoAdded: "0",
    cacaoDepositValue: "0",
    cacaoRedeemValue: "11400000000",
    cacaoWithdrawn: "0",
    firstAddedAt: null,
    lastAddedAt: null,
    matchingAddresses: ["maya1abc"],
    pendingAsset: "0",
    pendingCacao: "0",
    pool: "BTC.BTC",
    state: "active",
    units: "2280000000000000",
    withdrawCounter: null,
    ...overrides,
  };
}

describe("liquidity insights", () => {
  it("estimates position value from redeemable amounts", () => {
    const pool = makePool();
    const position = makePosition();
    const value = estimateLiquidityPositionValueUsd(position, pool);

    expect(value).toBeGreaterThan(0);
  });

  it("aggregates portfolio value across positions", () => {
    const pools = [makePool()];
    const positions = [makePosition()];
    expect(estimatePortfolioValueUsd(positions, pools)).toBeGreaterThan(0);
  });

  it("estimates LP rewards as current value minus deposited value", () => {
    const pool = makePool({
      assetPrice: "90000",
      assetPriceUsd: "90000",
    });
    const position = makePosition({
      assetDepositValue: "50000",
      cacaoDepositValue: "500000000000",
      assetRedeemValue: "51000",
      cacaoRedeemValue: "505000000000",
    });

    const deposited = 50 + 0.0005 * 90_000;
    const current = 50.5 + 0.00051 * 90_000;
    const reward = estimateLiquidityPositionRewardUsd(position, pool);

    expect(reward).toBeCloseTo(current - deposited, 2);
    expect(estimatePortfolioRewardsUsd([position], [pool])).toBeCloseTo(
      reward,
      2,
    );
  });

  it("formats days in pool for display", () => {
    expect(formatLiquidityDaysInPool(1.993263888888889)).toBe("2d");
    expect(formatLiquidityDaysInPool(0.5)).toBe("12h");
    expect(formatLiquidityDaysInPool(45)).toBe("1mo 15d");
    expect(formatLiquidityDaysInPool(0)).toBe("0d");
  });

  it("prefers active positions when resolving analytics focus", () => {
    expect(
      resolveDefaultAnalyticsPoolAsset(
        [
          makePosition({ pool: "ETH.ETH", state: "pending" }),
          makePosition({ pool: "BTC.BTC", state: "active" }),
        ],
        [makePool(), makePool({ asset: "ETH.ETH", symbol: "ETH" })],
      ),
    ).toBe("BTC.BTC");
  });
});
