import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  BarChart3,
  ChevronRight,
  Loader2,
  Shield,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AssetIcon, shortenAddress } from "#/components/ProtocolPrimitives";
import type {
  LiquidityPoolDetailResponse,
  LiquiditySummaryResponse,
} from "#/lib/cacaotracker-types";
import { formatBaseUnits } from "#/lib/cacao-pool";
import {
  estimateLiquidityPositionValueUsd,
  estimateLiquidityPositionRewardUsd,
  estimatePortfolioRewardsUsd,
  estimatePortfolioValueUsd,
  formatLiquidityAnalyticsPercent,
  formatLiquidityCompact,
  formatLiquidityDaysInPool,
  formatLiquidityPercent,
  formatLiquidityUsd,
} from "#/lib/liquidity-insights";
import type {
  LiquidityActivityItem,
  LiquidityPool,
  LiquidityPosition,
} from "#/lib/liquidity";

type InsightsTab = "overview" | "pool" | "il" | "activity";

type LiquidityPortfolioPanelProps = {
  activity: LiquidityActivityItem[];
  analyticsPoolAsset: string;
  depositPoolAsset: string;
  hiddenStagedPoolCount: number;
  isLoading: boolean;
  isPowerUser: boolean;
  loadError: string | null;
  onFocusAnalyticsPool: (poolAsset: string) => void;
  onRetryLoad: () => void;
  onSyncDepositToAnalytics: () => void;
  poolDetail: LiquidityPoolDetailResponse | null;
  poolDetailError: string | null;
  pools: LiquidityPool[];
  positions: LiquidityPosition[];
  summary: LiquiditySummaryResponse | null;
  summaryError: string | null;
};

export function LiquidityPortfolioPanel(props: LiquidityPortfolioPanelProps) {
  const [activeTab, setActiveTab] = useState<InsightsTab>("overview");

  const poolMap = useMemo(
    () => new Map(props.pools.map((pool) => [pool.asset, pool])),
    [props.pools],
  );

  const analyticsPool = poolMap.get(props.analyticsPoolAsset);
  const depositPool = poolMap.get(props.depositPoolAsset);
  const analyticsPosition = props.positions.find(
    (position) => position.pool === props.analyticsPoolAsset,
  );
  const focusedActivity = useMemo(
    () =>
      props.activity
        .filter((item) => item.pool === props.analyticsPoolAsset)
        .slice(0, 8),
    [props.activity, props.analyticsPoolAsset],
  );

  const portfolioValueUsd = useMemo(
    () => estimatePortfolioValueUsd(props.positions, props.pools),
    [props.positions, props.pools],
  );

  const lpRewardsUsd = useMemo(
    () => estimatePortfolioRewardsUsd(props.positions, props.pools),
    [props.positions, props.pools],
  );

  const depositDiffersFromAnalytics =
    props.depositPoolAsset.length > 0 &&
    props.analyticsPoolAsset.length > 0 &&
    props.depositPoolAsset !== props.analyticsPoolAsset;

  const tabs: Array<{ id: InsightsTab; label: string; icon: typeof BarChart3 }> =
    [
      { id: "overview", label: "Overview", icon: BarChart3 },
      { id: "pool", label: "Pool", icon: Activity },
      { id: "il", label: "IL & Protection", icon: Shield },
      { id: "activity", label: "Activity", icon: ArrowRightLeft },
    ];

  return (
    <section className="glass-panel-strong overflow-hidden rise-in rounded-[2rem] border border-[var(--line)]">
      <div className="border-b border-[var(--line)] bg-[linear-gradient(180deg,rgba(79,209,197,0.08),transparent)] px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="island-kicker mb-1">Portfolio</p>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
              LP Positions & Insights
            </h2>
            <p className="mt-1 max-w-xl text-sm font-medium text-[var(--sea-ink-soft)]">
              Track redeemable value, rewards, and pool health. Select a position
              to drill into analytics.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[28rem]">
            <SummaryChip
              label="Portfolio"
              value={formatLiquidityUsd(portfolioValueUsd)}
              highlight
            />
            <SummaryChip
              label="Positions"
              value={String(props.summary?.ilSummary.position_count ?? props.positions.length)}
            />
            <SummaryChip
              label="LP Rewards"
              value={formatLiquidityUsd(lpRewardsUsd)}
            />
            <SummaryChip
              label="Total IL"
              value={formatLiquidityUsd(
                props.summary?.ilSummary.total_il_amount_usd ?? 0,
              )}
              tone={
                (props.summary?.ilSummary.total_il_amount_usd ?? 0) > 0
                  ? "warning"
                  : "default"
              }
            />
          </div>
        </div>
      </div>

      {props.summaryError ? (
        <InlineNotice tone="warning" message={props.summaryError} />
      ) : null}

      {!props.isPowerUser && props.hiddenStagedPoolCount > 0 ? (
        <InlineNotice
          tone="info"
          message={`${props.hiddenStagedPoolCount} staged pool${props.hiddenStagedPoolCount === 1 ? "" : "s"} hidden in normie mode. Enable Pro Mode to inspect them.`}
        />
      ) : null}

      {loadSection(props)}

      {props.positions.length > 0 ? (
        <div className="border-t border-[var(--line)] px-5 py-5 sm:px-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Your Positions
              </h3>
              <p className="text-xs font-medium text-[var(--sea-ink-soft)]/80">
                Click a position to focus analytics below.
              </p>
            </div>
            {depositDiffersFromAnalytics ? (
              <button
                className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition-colors hover:border-[var(--maya-teal)]/40 hover:text-[var(--maya-teal)]"
                type="button"
                onClick={props.onSyncDepositToAnalytics}
              >
                Deposit pool differs
                <ChevronRight size={14} />
                Sync deposit to{" "}
                {analyticsPool?.symbol ?? props.analyticsPoolAsset}
              </button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {props.positions.map((position) => {
              const pool = poolMap.get(position.pool);
              const isFocused = position.pool === props.analyticsPoolAsset;
              const valueUsd = estimateLiquidityPositionValueUsd(position, pool);

              return (
                <button
                  key={`${position.pool}-${position.matchingAddresses.join("-")}`}
                  className={`group rounded-[1.5rem] border p-4 text-left transition-all sm:p-5 ${
                    isFocused
                      ? "border-[var(--maya-teal)] bg-[var(--surface-strong)] shadow-[0_0_24px_rgba(79,209,197,0.12)] ring-1 ring-[var(--maya-teal)]/60"
                      : "border-[var(--line)] bg-[var(--bg-base)] hover:border-[var(--line-strong)] hover:bg-[var(--chip-bg)]/40"
                  }`}
                  type="button"
                  onClick={() => {
                    props.onFocusAnalyticsPool(position.pool);
                    setActiveTab("overview");
                  }}
                >
                  <PositionCardHeader
                    pool={pool}
                    position={position}
                    valueUsd={valueUsd}
                    isFocused={isFocused}
                  />
                  <PositionCardBreakdown pool={pool} position={position} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="border-t border-[var(--line)] bg-[var(--bg-base)]/40 px-5 py-5 sm:px-7 sm:py-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {analyticsPool ? (
              <div className="flex -space-x-3">
                <AssetIcon
                  assetId="cacao"
                  className="h-9 w-9 border border-[var(--line)] bg-[var(--surface)]"
                />
                <AssetIcon
                  assetId={analyticsPool.iconId}
                  className="h-9 w-9 border-2 border-[var(--bg-base)] bg-[var(--surface)]"
                />
              </div>
            ) : null}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]">
                Focused Insights
              </p>
              <h3 className="text-lg font-bold text-[var(--sea-ink)]">
                {analyticsPool
                  ? `CACAO / ${analyticsPool.symbol}`
                  : "Select a position"}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    isActive
                      ? "bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm"
                      : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                  }`}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {!props.analyticsPoolAsset ? (
          <EmptyInsights message="Select an LP position above to view pool analytics." />
        ) : (
          <>
            {props.poolDetailError ? (
              <InlineNotice tone="warning" message={props.poolDetailError} />
            ) : null}

            {activeTab === "overview" ? (
              <OverviewTab
                analyticsPool={analyticsPool}
                analyticsPosition={analyticsPosition}
                poolDetail={props.poolDetail}
              />
            ) : null}

            {activeTab === "pool" ? (
              <PoolTab analyticsPool={analyticsPool} poolDetail={props.poolDetail} />
            ) : null}

            {activeTab === "il" ? (
              <ImpermanentLossTab
                analyticsPosition={analyticsPosition}
                poolDetail={props.poolDetail}
                summary={props.summary}
              />
            ) : null}

            {activeTab === "activity" ? (
              <ActivityTab activity={focusedActivity} />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function loadSection(props: LiquidityPortfolioPanelProps) {
  if (props.loadError) {
    return (
      <div className="px-5 py-5 sm:px-7">
        <InlineNotice tone="error" message={props.loadError} />
        <button
          className="secondary-btn mt-4 px-5 py-2.5 text-sm font-semibold"
          type="button"
          onClick={props.onRetryLoad}
        >
          Retry loading positions
        </button>
      </div>
    );
  }

  if (props.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-14">
        <Loader2
          size={28}
          className="mb-3 animate-spin text-[var(--maya-teal)]"
        />
        <p className="text-sm font-semibold text-[var(--sea-ink)]">
          Loading LP positions...
        </p>
      </div>
    );
  }

  if (props.positions.length > 0) {
    return null;
  }

  return (
    <div className="px-5 py-8 sm:px-7">
      <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--bg-base)] px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-strong)]">
          <Wallet size={24} className="text-[var(--maya-teal)]" />
        </div>
        <p className="text-lg font-bold text-[var(--sea-ink)]">
          No LP positions yet
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-relaxed text-[var(--sea-ink-soft)]">
          {props.hiddenStagedPoolCount > 0 && !props.isPowerUser
            ? "Connected wallets do not match any visible liquidity positions. Staged pools are hidden in normie mode."
            : "Use the deposit panel to add liquidity, or connect a vault that already has Maya LP units."}
        </p>
      </div>
    </div>
  );
}

function PositionCardHeader(props: {
  pool: LiquidityPool | undefined;
  position: LiquidityPosition;
  valueUsd: number;
  isFocused: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-3">
          <AssetIcon
            assetId="cacao"
            className="h-10 w-10 border border-[var(--line)] bg-[var(--surface)]"
          />
          <AssetIcon
            assetId={props.pool?.iconId ?? "maya"}
            className="h-10 w-10 border-2 border-[var(--bg-base)] bg-[var(--surface)]"
          />
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight text-[var(--sea-ink)]">
            {props.pool?.symbol
              ? `CACAO / ${props.pool.symbol}`
              : props.position.pool}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
            {props.position.state}
            {props.isFocused ? " • focused" : ""}
          </p>
        </div>
      </div>

      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
          Est. value
        </p>
        <p className="text-xl font-bold text-[var(--maya-teal)] sm:text-2xl">
          {formatLiquidityUsd(props.valueUsd)}
        </p>
        <span
          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            props.position.state === "active"
              ? "bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]"
              : "bg-amber-500/10 text-amber-500"
          }`}
        >
          {props.position.units !== "0" ? "LP active" : "Pending"}
        </span>
      </div>
    </div>
  );
}

function PositionCardBreakdown(props: {
  pool: LiquidityPool | undefined;
  position: LiquidityPosition;
}) {
  const cacaoReadable =
    formatBaseUnits(props.position.cacaoRedeemValue, 10) || "0";
  const assetReadable = props.pool
    ? formatBaseUnits(props.position.assetRedeemValue, props.pool.decimals) || "0"
    : props.position.assetRedeemValue;

  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      <MiniStat label="Redeem CACAO" value={formatLiquidityCompact(cacaoReadable)} />
      <MiniStat
        label={`Redeem ${props.pool?.symbol ?? "Asset"}`}
        value={formatLiquidityCompact(assetReadable)}
      />
      <MiniStat
        label="LP Units"
        value={formatLiquidityCompact(props.position.units)}
        mono
      />
    </div>
  );
}

function OverviewTab(props: {
  analyticsPool: LiquidityPool | undefined;
  analyticsPosition: LiquidityPosition | undefined;
  poolDetail: LiquidityPoolDetailResponse | null;
}) {
  const positionValueUsd = props.analyticsPosition
    ? estimateLiquidityPositionValueUsd(
        props.analyticsPosition,
        props.analyticsPool,
      )
    : 0;

  const positionRewardsUsd = props.analyticsPosition
    ? estimateLiquidityPositionRewardUsd(
        props.analyticsPosition,
        props.analyticsPool,
      )
    : 0;

  return (
    <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)]/50 p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
        Position Snapshot
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <DetailMetric
          label="Estimated Value"
          value={formatLiquidityUsd(positionValueUsd)}
          highlight
        />
        <DetailMetric
          label="Pool APR"
          value={
            props.poolDetail?.analytics
              ? formatLiquidityAnalyticsPercent(props.poolDetail.analytics.apr)
              : props.analyticsPool
                ? formatLiquidityPercent(props.analyticsPool.apr)
                : "n/a"
          }
        />
        <DetailMetric
          label="Pool Depth"
          value={
            props.analyticsPool
              ? formatLiquidityUsd(props.analyticsPool.depthUsd)
              : "n/a"
          }
        />
        <DetailMetric
          label="LP Rewards"
          value={formatLiquidityUsd(positionRewardsUsd)}
        />
      </div>

      {props.analyticsPosition ? (
        <p className="mt-4 text-xs font-medium text-[var(--sea-ink-soft)]">
          Wallet{" "}
          <span className="font-mono text-[var(--sea-ink)]">
            {shortenAddress(
              props.analyticsPosition.cacaoAddress ??
                props.analyticsPosition.assetAddress ??
                "n/a",
            )}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function PoolTab(props: {
  analyticsPool: LiquidityPool | undefined;
  poolDetail: LiquidityPoolDetailResponse | null;
}) {
  if (!props.analyticsPool) {
    return <EmptyInsights message="Pool metadata unavailable." />;
  }

  const analytics = props.poolDetail?.analytics;
  const volumeUsd = analytics
    ? analytics.volume24hUSD
    : props.analyticsPool.volume24hUsd;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <DetailMetric
        label="APR"
        value={
          analytics
            ? formatLiquidityAnalyticsPercent(analytics.apr)
            : formatLiquidityPercent(props.analyticsPool.apr)
        }
        highlight
      />
      <DetailMetric
        label="Pool Depth"
        value={formatLiquidityUsd(props.analyticsPool.depthUsd)}
      />
      <DetailMetric label="24H Volume" value={formatLiquidityUsd(volumeUsd)} />
      <DetailMetric
        label="Status"
        value={
          props.analyticsPool.actionAvailability?.lpActionsPaused
            ? "Paused"
            : props.analyticsPool.status
        }
      />
      {analytics ? (
        <>
          <DetailMetric label="LUVI" value={analytics.luvi.toFixed(2)} />
          <DetailMetric
            label="24H Fees"
            value={formatLiquidityUsd(analytics.feesEarned24hUSD)}
          />
          <DetailMetric
            label="Net Earnings (24H)"
            value={formatLiquidityUsd(analytics.netEarnings24hUSD)}
          />
          <DetailMetric
            label="IL Protection Paid (24H)"
            value={formatLiquidityUsd(analytics.ilProtectionPaid24hUSD)}
          />
          {props.poolDetail?.comparison ? (
            <DetailMetric
              label="Pool Rank"
              value={`#${props.poolDetail.comparison.rank}`}
            />
          ) : null}
        </>
      ) : (
        <div className="sm:col-span-2 xl:col-span-3">
          <InlineNotice
            tone="info"
            message="Advanced pool analytics (LUVI, fees) load from CacaoTracker when available. APR, depth, and volume above come from Midgard."
          />
        </div>
      )}
    </div>
  );
}

function ImpermanentLossTab(props: {
  analyticsPosition: LiquidityPosition | undefined;
  poolDetail: LiquidityPoolDetailResponse | null;
  summary: LiquiditySummaryResponse | null;
}) {
  const il = props.poolDetail?.ilAnalysis;

  if (!il && !props.summary) {
    return (
      <EmptyInsights message="Impermanent loss data is not available for this address yet." />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)]/50 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <TrendingDown size={16} className="text-[var(--sea-ink-soft)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
            Portfolio IL Summary
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DetailMetric
            label="Total IL"
            value={formatLiquidityUsd(
              props.summary?.ilSummary.total_il_amount_usd ?? 0,
            )}
          />
          <DetailMetric
            label="ILP Eligible"
            value={formatLiquidityUsd(
              props.summary?.ilSummary.total_ilp_eligible_usd ?? 0,
            )}
          />
          <DetailMetric
            label="Current LP Value"
            value={formatLiquidityUsd(
              props.summary?.ilSummary.total_current_value_usd ?? 0,
            )}
          />
          <DetailMetric
            label="HODL Value"
            value={formatLiquidityUsd(
              props.summary?.ilSummary.total_hodl_value_usd ?? 0,
            )}
          />
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)]/50 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Shield size={16} className="text-[var(--sea-ink-soft)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
            Focused Pool IL
          </p>
        </div>
        {il ? (
          <div className="grid grid-cols-2 gap-3">
            <DetailMetric
              label="Pool IL"
              value={formatLiquidityUsd(il.impermanentLoss.amountUSD)}
              highlight={il.impermanentLoss.isLoss}
            />
            <DetailMetric
              label="Coverage"
              value={`${il.protection.coveragePercent.toFixed(0)}%`}
            />
            <DetailMetric
              label="Days In Pool"
              value={formatLiquidityDaysInPool(il.protection.daysInPool)}
            />
            <DetailMetric
              label="Eligible Protection"
              value={formatLiquidityUsd(il.protection.eligibleAmountUSD)}
            />
            <DetailMetric
              label="Current Value"
              value={formatLiquidityUsd(il.breakdown.currentValueUSD)}
            />
            <DetailMetric
              label="HODL Value"
              value={formatLiquidityUsd(il.breakdown.hodlValueUSD)}
            />
          </div>
        ) : (
          <p className="text-sm font-medium text-[var(--sea-ink-soft)]">
            {props.analyticsPosition
              ? "No impermanent loss detected for this pool position, or data is still syncing."
              : "Select a pool where you have an active LP position."}
          </p>
        )}
      </div>
    </div>
  );
}

function ActivityTab(props: { activity: LiquidityActivityItem[] }) {
  if (!props.activity.length) {
    return (
      <EmptyInsights message="No recent add/remove liquidity activity for this pool." />
    );
  }

  return (
    <div className="space-y-2">
      {props.activity.map((item) => (
        <div
          key={`${item.txHash ?? item.timestamp}-${item.type}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)]/60 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold capitalize text-[var(--sea-ink)]">
              {item.type}
            </p>
            <p className="truncate font-mono text-[11px] font-semibold text-[var(--sea-ink-soft)]">
              {item.memo ?? item.txHash ?? "No memo"}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-[var(--sea-ink-soft)]">
              {item.timestamp
                ? new Date(item.timestamp * 1000).toLocaleString()
                : "Unknown time"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              item.type === "deposit"
                ? "bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]"
                : "bg-amber-500/10 text-amber-500"
            }`}
          >
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function SummaryChip(props: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        props.highlight
          ? "border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/5"
          : props.tone === "warning"
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-[var(--line)] bg-[var(--bg-base)]/70"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
        {props.label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-bold sm:text-base ${
          props.highlight
            ? "text-[var(--maya-teal)]"
            : props.tone === "warning"
              ? "text-amber-500"
              : "text-[var(--sea-ink)]"
        }`}
      >
        {props.value}
      </p>
    </div>
  );
}

function MiniStat(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/40 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
        {props.label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-bold text-[var(--sea-ink)] ${props.mono ? "font-mono" : ""}`}
      >
        {props.value}
      </p>
    </div>
  );
}

function DetailMetric(props: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        props.highlight
          ? "border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/5"
          : "border-[var(--line)] bg-[var(--bg-base)]/60"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
        {props.label}
      </p>
      <p
        className={`mt-1 text-lg font-bold ${props.highlight ? "text-[var(--maya-teal)]" : "text-[var(--sea-ink)]"}`}
      >
        {props.value}
      </p>
    </div>
  );
}

function InlineNotice(props: {
  tone: "error" | "warning" | "info";
  message: string;
}) {
  const styles =
    props.tone === "error"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
      : props.tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
        : "border-[var(--line)] bg-[var(--surface)]/60 text-[var(--sea-ink-soft)]";

  return (
    <div
      className={`mx-5 mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs font-medium sm:mx-7 ${styles}`}
    >
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <p className="leading-snug">{props.message}</p>
    </div>
  );
}

function EmptyInsights(props: { message: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-[var(--line)] bg-[var(--bg-base)]/50 px-5 py-10 text-center">
      <p className="text-sm font-medium text-[var(--sea-ink-soft)]">
        {props.message}
      </p>
    </div>
  );
}
