import { formatBaseUnits } from "./cacao-pool";
import type { LiquidityPool, LiquidityPosition } from "./liquidity";

const MIDGARD_ASSET_DECIMALS = 8;
const CACAO_AMOUNT_DECIMALS = 10;

function readPositionBaseUnits(
  primary: string,
  fallback: string,
): string {
  return primary !== "0" ? primary : fallback;
}

export function deriveCacaoPriceUsd(pool: LiquidityPool): number {
  const assetPriceUsd = Number(pool.assetPriceUsd);
  const assetPrice = Number(pool.assetPrice);
  if (!Number.isFinite(assetPriceUsd) || !Number.isFinite(assetPrice) || assetPrice <= 0) {
    return 0;
  }
  return assetPriceUsd / assetPrice;
}

export function estimateLiquidityPositionValueUsd(
  position: LiquidityPosition,
  pool: LiquidityPool | undefined,
): number {
  if (!pool) {
    return 0;
  }

  const cacaoAmount = Number(formatBaseUnits(position.cacaoRedeemValue, 10)) || 0;
  const assetAmount =
    Number(formatBaseUnits(position.assetRedeemValue, pool.decimals)) || 0;
  const assetPriceUsd = Number(pool.assetPriceUsd) || 0;
  const cacaoPriceUsd = deriveCacaoPriceUsd(pool);

  return cacaoAmount * cacaoPriceUsd + assetAmount * assetPriceUsd;
}

export function estimateLiquidityPositionDepositedValueUsd(
  position: LiquidityPosition,
  pool: LiquidityPool | undefined,
): number {
  if (!pool) {
    return 0;
  }

  const cacaoAmount =
    Number(
      formatBaseUnits(
        readPositionBaseUnits(
          position.cacaoDepositValue,
          position.cacaoAdded,
        ),
        CACAO_AMOUNT_DECIMALS,
      ),
    ) || 0;
  const assetAmount =
    Number(
      formatBaseUnits(
        readPositionBaseUnits(
          position.assetDepositValue,
          position.assetAdded,
        ),
        MIDGARD_ASSET_DECIMALS,
      ),
    ) || 0;
  const assetPriceUsd = Number(pool.assetPriceUsd) || 0;
  const cacaoPriceUsd = deriveCacaoPriceUsd(pool);

  return cacaoAmount * cacaoPriceUsd + assetAmount * assetPriceUsd;
}

export function estimateLiquidityPositionRewardUsd(
  position: LiquidityPosition,
  pool: LiquidityPool | undefined,
): number {
  return (
    estimateLiquidityPositionValueUsd(position, pool) -
    estimateLiquidityPositionDepositedValueUsd(position, pool)
  );
}

export function estimatePortfolioRewardsUsd(
  positions: LiquidityPosition[],
  pools: LiquidityPool[],
): number {
  const poolMap = new Map(pools.map((pool) => [pool.asset, pool]));
  return positions.reduce((sum, position) => {
    if (position.state !== "active") {
      return sum;
    }
    return (
      sum +
      estimateLiquidityPositionRewardUsd(position, poolMap.get(position.pool))
    );
  }, 0);
}

export function estimatePortfolioValueUsd(
  positions: LiquidityPosition[],
  pools: LiquidityPool[],
): number {
  const poolMap = new Map(pools.map((pool) => [pool.asset, pool]));
  return positions.reduce(
    (sum, position) =>
      sum + estimateLiquidityPositionValueUsd(position, poolMap.get(position.pool)),
    0,
  );
}

export function formatLiquidityUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
    notation: value >= 1_000_000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

export function formatLiquidityPercent(value: string | number): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }
  const normalized = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(2)}%`;
}

export function formatLiquidityAnalyticsPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(2)}%`;
}

export function formatLiquidityCompact(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 1_000_000 ? 2 : 4,
    notation: numeric >= 10_000 ? "compact" : "standard",
  }).format(numeric);
}

export function formatLiquidityDaysInPool(days: number): string {
  if (!Number.isFinite(days) || days <= 0) {
    return "0d";
  }

  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }

  if (days < 30) {
    return `${Math.round(days)}d`;
  }

  const months = Math.floor(days / 30);
  const remainingDays = Math.round(days % 30);
  if (remainingDays === 0) {
    return `${months}mo`;
  }

  return `${months}mo ${remainingDays}d`;
}

export function resolveDefaultAnalyticsPoolAsset(
  positions: LiquidityPosition[],
  pools: LiquidityPool[],
  pendingPoolAsset?: string,
): string {
  if (pendingPoolAsset) {
    return pendingPoolAsset;
  }

  const activePosition = positions.find((position) => position.state === "active");
  if (activePosition) {
    return activePosition.pool;
  }

  const pendingPosition = positions.find((position) => position.state === "pending");
  if (pendingPosition) {
    return pendingPosition.pool;
  }

  return pools[0]?.asset ?? "";
}
