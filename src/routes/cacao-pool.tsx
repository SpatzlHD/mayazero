import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import {
  Activity,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Loader2,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { buildCacaoPoolAnalyticsContext } from "#/analytics/journey-enrichment";
import {
  createExecutionJourneySteps,
  depositToCacaoPool,
  fetchAddressBalances,
  getCacaoPoolDepositSupport,
  trackTransactionJourney,
  type AddressBalanceResponse,
  useMayaWalletActions,
  useWalletBalanceRefreshTick,
  waitForJourneyTransactionSettlement,
  WalletSessionNotFoundError,
} from "#/wallet";
import {
  fetchCacaoPoolSnapshot,
  fetchCurrentMayaBlockHeight,
  formatCacaoBaseUnits,
  formatTimestamp,
  parseDecimalToBaseUnits,
  type CacaoPoolHistoryPoint,
  type CacaoPoolSnapshot,
} from "#/lib/cacao-pool";
import { fetchCacaotrackerCacaoPoolDetail } from "#/lib/cacaotracker";
import type {
  CacaoPoolDetailResponse,
  CacaoPoolHistoryEntry,
} from "#/lib/cacaotracker-types";
import { VIEW_ONLY_IMPERSONATION_REASON } from "#/lib/impersonation";
import { AssetIcon, shortenAddress } from "#/components/ProtocolPrimitives";
import {
  useEffectiveWalletSession,
  useIsViewOnlyImpersonation,
} from "#/provider/ImpersonationProvider";
import { useSettings } from "#/provider/SettingsProvider";
import { buildPageSeoHead } from "#/lib/seo";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/cacao-pool")({
  head: () =>
    buildPageSeoHead({
      title: "CACAOPool",
      description:
        "Deposit CACAO into the Maya Protocol CACAOPool and review your pool position, activity, and global trend data.",
    }),
  component: CacaoPoolRoute,
});

type CacaoPoolPageProps = {
  loadSnapshot?: (address: string) => Promise<CacaoPoolSnapshot>;
  loadBalances?: (input: {
    chain: Chain;
    address: string;
    includeZeroBalances?: boolean;
  }) => Promise<AddressBalanceResponse>;
  submitDeposit?: typeof depositToCacaoPool;
  loadAnalytics?: (address: string) => Promise<CacaoPoolDetailResponse>;
  loadCurrentBlockHeight?: (input: { mayanodeUrl?: string }) => Promise<number>;
};

type CacaoPoolActionTab = "deposit" | "withdraw";

const CACAO_POOL_WITHDRAW_DUST_BASE_UNITS = parseDecimalToBaseUnits("0", 10);
const CACAO_POOL_MATURITY_BLOCKS = 302_400;

function CacaoPoolRoute() {
  return <CacaoPoolPage />;
}

export function CacaoPoolPage({
  loadSnapshot = fetchCacaoPoolSnapshot,
  loadBalances = fetchAddressBalances,
  submitDeposit = depositToCacaoPool,
  loadAnalytics = fetchCacaotrackerCacaoPoolDetail,
  loadCurrentBlockHeight = fetchCurrentMayaBlockHeight,
}: CacaoPoolPageProps) {
  const wallet = useMayaWalletActions();
  const navigate = useNavigate();
  const activeSession = useEffectiveWalletSession();
  const isViewOnly = useIsViewOnlyImpersonation();
  const balanceRefreshTick = useWalletBalanceRefreshTick();
  const settings = useSettings();
  const mayaAddress = activeSession?.addresses[Chain.MayaChain] ?? "";

  const [activeTab, setActiveTab] = useState<CacaoPoolActionTab>("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawBasisPoints, setWithdrawBasisPoints] = useState("2500");
  const [snapshot, setSnapshot] = useState<CacaoPoolSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [cacaoBalance, setCacaoBalance] = useState<{
    amount: string;
    formattedAmount: string;
  } | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [cacaoUsdPrice, setCacaoUsdPrice] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<CacaoPoolDetailResponse | null>(
    null,
  );
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [currentBlockHeight, setCurrentBlockHeight] = useState<number | null>(
    null,
  );
  const [isBlockHeightLoading, setIsBlockHeightLoading] = useState(false);

  const depositSupport = getCacaoPoolDepositSupport(wallet, activeSession?.id);
  const depositAmountBaseUnits = useMemo(
    () => parseDecimalToBaseUnits(depositAmount, 10),
    [depositAmount],
  );
  const normalizedWithdrawBasisPoints = useMemo(() => {
    const parsed = Number(withdrawBasisPoints);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.max(0, Math.min(10_000, Math.round(parsed)));
  }, [withdrawBasisPoints]);
  const withdrawMemo = useMemo(
    () => buildCacaoPoolWithdrawMemo(normalizedWithdrawBasisPoints),
    [normalizedWithdrawBasisPoints],
  );
  const withdrawPreviewBaseUnits = useMemo(
    () =>
      getCacaoPoolWithdrawPreviewBaseUnits({
        analyticsCurrentValueCacao:
          analytics?.apy.details?.current_value_cacao ?? null,
        fallbackBaseUnits:
          snapshot?.position?.cacaoDeposit ??
          snapshot?.position?.netCacao ??
          "0",
        withdrawBasisPoints: normalizedWithdrawBasisPoints,
      }),
    [
      analytics?.apy.details?.current_value_cacao,
      normalizedWithdrawBasisPoints,
      snapshot?.position?.cacaoDeposit,
      snapshot?.position?.netCacao,
    ],
  );
  const withdrawPreviewAmount = useMemo(
    () => formatCacaoBaseUnits(withdrawPreviewBaseUnits),
    [withdrawPreviewBaseUnits],
  );
  const latestDepositHeight = useMemo(
    () => getLatestCacaoPoolDepositHeight(snapshot),
    [snapshot],
  );
  const withdrawMaturity = useMemo(
    () =>
      getCacaoPoolWithdrawMaturityState({
        currentBlockHeight,
        hasPosition: Boolean(
          snapshot?.position && snapshot.position.units !== "0",
        ),
        isLoading: isBlockHeightLoading,
        latestDepositHeight,
        requiredBlocks: CACAO_POOL_MATURITY_BLOCKS,
      }),
    [
      currentBlockHeight,
      isBlockHeightLoading,
      latestDepositHeight,
      snapshot?.position,
    ],
  );
  const submitAmountBaseUnits =
    activeTab === "deposit"
      ? depositAmountBaseUnits
      : normalizedWithdrawBasisPoints > 0
        ? CACAO_POOL_WITHDRAW_DUST_BASE_UNITS
        : null;

  const depositState = getCacaoPoolPrimaryAction({
    activeTab,
    hasSession: Boolean(activeSession),
    hasMayaAddress: Boolean(mayaAddress),
    hasPosition: Boolean(snapshot?.position && snapshot.position.units !== "0"),
    isViewOnly,
    supportReason: isViewOnly
      ? VIEW_ONLY_IMPERSONATION_REASON
      : depositSupport.reason,
    amountBaseUnits: submitAmountBaseUnits,
    balanceBaseUnits: cacaoBalance?.amount ?? null,
    isSubmitting,
    withdrawBasisPoints: normalizedWithdrawBasisPoints,
    withdrawMaturityNote:
      activeTab === "withdraw" ? withdrawMaturity.note : undefined,
  });

  async function connectMayaChain() {
    if (isViewOnly) {
      return;
    }

    await wallet
      .execute("accounts.connect", {
        sessionId: activeSession?.id,
        input: { chain: Chain.MayaChain },
      })
      .catch((err) => {
        if (err instanceof WalletSessionNotFoundError) {
          navigate({
            to: "/vault-setup",
          });
        }
      });
  }

  async function refreshPositionData() {
    if (!mayaAddress) {
      setSnapshot(null);
      setSnapshotError(null);
      return;
    }

    setIsSnapshotLoading(true);
    setSnapshotError(null);
    try {
      const nextSnapshot = await loadSnapshot(mayaAddress);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshotError((error as Error).message);
    } finally {
      setIsSnapshotLoading(false);
    }
  }

  async function refreshBalance() {
    if (!mayaAddress) {
      setCacaoBalance(null);
      setBalanceError(null);
      return;
    }

    setIsBalanceLoading(true);
    setBalanceError(null);
    try {
      const response = await loadBalances({
        chain: Chain.MayaChain,
        address: mayaAddress,
        includeZeroBalances: true,
      });
      const cacao =
        response.balances.find(
          (asset) =>
            asset.id === "cacao" ||
            asset.isNative ||
            asset.symbol.toUpperCase() === "CACAO",
        ) ?? null;

      setCacaoBalance(
        cacao
          ? {
              amount: cacao.amount,
              formattedAmount: cacao.formattedAmount,
            }
          : { amount: "0", formattedAmount: "0" },
      );
    } catch (error) {
      setBalanceError((error as Error).message);
    } finally {
      setIsBalanceLoading(false);
    }
  }

  async function refreshCurrentBlockHeight(options?: {
    cancelled?: () => boolean;
  }) {
    if (options?.cancelled?.()) {
      return;
    }

    setIsBlockHeightLoading(true);
    try {
      const nextBlockHeight = await loadCurrentBlockHeight({
        mayanodeUrl: settings.mayanodeUrl,
      });
      if (options?.cancelled?.()) {
        return;
      }
      setCurrentBlockHeight(nextBlockHeight);
    } catch {
      if (options?.cancelled?.()) {
        return;
      }
      setCurrentBlockHeight(null);
    } finally {
      if (options?.cancelled?.()) {
        return;
      }
      setIsBlockHeightLoading(false);
    }
  }

  useEffect(() => {
    void refreshPositionData();
    void refreshBalance();
  }, [mayaAddress, balanceRefreshTick]);

  useEffect(() => {
    let cancelled = false;

    void refreshCurrentBlockHeight({ cancelled: () => cancelled }).catch(() => {
      if (cancelled) {
        return;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [balanceRefreshTick, loadCurrentBlockHeight, settings.mayanodeUrl]);

  useEffect(() => {
    let cancelled = false;

    async function refreshAnalytics() {
      if (!mayaAddress) {
        setAnalytics(null);
        setAnalyticsError(null);
        return;
      }

      setAnalyticsError(null);
      try {
        const nextAnalytics = await loadAnalytics(mayaAddress);
        if (!cancelled) {
          setAnalytics(nextAnalytics);
        }
      } catch (error) {
        if (!cancelled) {
          setAnalytics(null);
          setAnalyticsError((error as Error).message);
        }
      }
    }

    void refreshAnalytics();
    return () => {
      cancelled = true;
    };
  }, [balanceRefreshTick, loadAnalytics, mayaAddress]);

  useEffect(() => {
    let active = true;
    async function fetchPrice() {
      try {
        const res = await fetch("https://midgard.mayachain.info/v2/pools");
        const data = (await res.json()) as any[];
        const usdcPool = data.find(
          (p) => p.asset.includes("USDC") || p.asset.includes("USDT"),
        );
        if (
          usdcPool &&
          usdcPool.assetPriceUSD &&
          usdcPool.assetPrice &&
          active
        ) {
          setCacaoUsdPrice(
            Number(usdcPool.assetPriceUSD) / Number(usdcPool.assetPrice),
          );
        }
      } catch (err) {
        console.error("Failed to fetch CACAO price", err);
      }
    }
    void fetchPrice();
    return () => {
      active = false;
    };
  }, []);

  async function handlePrimaryAction() {
    if (isViewOnly) {
      setSubmitError(VIEW_ONLY_IMPERSONATION_REASON);
      return;
    }

    if (!submitAmountBaseUnits || !activeSession || !depositSupport.supported) {
      return;
    }

    const isWithdraw = activeTab === "withdraw";
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await trackTransactionJourney(wallet, {
        kind: "cacao-pool",
        title: isWithdraw ? "CACAOPool Withdraw" : "CACAOPool Deposit",
        sessionId: activeSession.id,
        source: activeSession.source,
        chain: Chain.MayaChain,
        routePath: "/cacao-pool",
        analytics: {
          action: isWithdraw ? "withdraw" : "deposit",
          route: "/cacao-pool",
          subject: "cacao_pool",
          ...buildCacaoPoolAnalyticsContext(),
        },
        steps: createExecutionJourneySteps({
          source: activeSession.source,
          finalLabel: isWithdraw ? "Withdrawal Complete" : "Deposit Complete",
        }),
        run: async (journey) => {
          journey.activateStep(
            "preparing",
            isWithdraw
              ? "Preparing CACAOPool withdrawal memo."
              : "Preparing native CACAO deposit.",
          );
          const result = await submitDeposit(wallet, {
            sessionId: activeSession.id,
            amountBaseUnits: submitAmountBaseUnits,
            journeyId: journey.journeyId,
            memo: isWithdraw ? withdrawMemo : undefined,
          });

          journey.completeStep(
            "preparing",
            isWithdraw
              ? "Withdrawal request prepared."
              : "Deposit request prepared.",
          );
          if (activeSession.source === "extension") {
            journey.completeStep(
              "provider",
              isWithdraw
                ? "Extension accepted the withdrawal request."
                : "Extension accepted the deposit request.",
            );
          } else {
            journey.completeStep("signing", "Vault signing complete.");
          }

          journey.setPrimaryTxHash(result.txHash);
          journey.completeStep(
            "broadcasting",
            result.txHash
              ? isWithdraw
                ? "Withdrawal broadcast submitted."
                : "Deposit broadcast submitted."
              : isWithdraw
                ? "Withdrawal submitted without a returned hash."
                : "Deposit submitted without a returned hash.",
          );
          journey.activateStep(
            "confirming",
            "Waiting for MayaChain confirmation.",
          );

          const settlement = await waitForJourneyTransactionSettlement(wallet, {
            chain: Chain.MayaChain,
            journeyId: journey.journeyId,
            primary: true,
            sessionId: activeSession.id,
            stepKey: "confirming",
            txHash: result.txHash,
          });

          journey.updateStep("complete", {
            status:
              settlement === "success"
                ? "success"
                : settlement === "error"
                  ? "error"
                  : settlement === "unconfirmed"
                    ? "unconfirmed"
                    : "attention",
            message:
              settlement === "success"
                ? isWithdraw
                  ? "Withdrawal confirmed on-chain."
                  : "Deposit confirmed on-chain."
                : settlement === "error"
                  ? isWithdraw
                    ? "Withdrawal failed on-chain."
                    : "Deposit failed on-chain."
                  : settlement === "unconfirmed"
                    ? isWithdraw
                      ? "Withdrawal submitted, but confirmation timed out."
                      : "Deposit submitted, but confirmation timed out."
                    : isWithdraw
                      ? "Withdrawal submitted, but automatic tracking is unavailable."
                      : "Deposit submitted, but automatic tracking is unavailable.",
          });
          journey.complete(result, settlement);
          return result;
        },
      });
      if (!isWithdraw) {
        setDepositAmount("");
      }
      await Promise.all([refreshPositionData(), refreshBalance()]);
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const latestHistory = snapshot?.history[snapshot.history.length - 1] ?? null;
  // Trend chart loading state logic
  const analyticsLoading = analytics === null && !analyticsError;
  let trendPoints: Array<
    CacaoPoolHistoryPoint & { metric?: "rewards" | "members"; value?: number }
  > = [];
  let trendTitle = "30 Day Member Trend";
  const analyticsTrend =
    Array.isArray(analytics?.history) && analytics?.history.length > 0
      ? buildCacaotrackerTrendPoints(analytics.history)
      : [];
  if (analyticsTrend.length > 0) {
    trendPoints = analyticsTrend;
    trendTitle =
      analyticsTrend[0].metric === "rewards"
        ? "30 Day Rewards Trend"
        : "30 Day Member Trend";
  } else if (Array.isArray(snapshot?.history) && snapshot.history.length > 0) {
    trendPoints = snapshot.history.map((p) => ({
      ...p,
      metric: "members",
      value: Number(p.members),
    }));
    trendTitle = "30 Day Member Trend";
  }

  return (
    <main className="page-wrap flex flex-col items-center min-h-[85vh] px-4 relative z-0 pb-16 pt-8">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[30rem] h-[30rem] bg-[var(--cacao-neon)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow" />
        <div
          className="absolute bottom-1/4 left-1/4 w-[30rem] h-[30rem] bg-[var(--maya-teal)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="text-center mb-10 rise-in">
        <p className="island-kicker mb-2 flex justify-center items-center gap-2">
          <Coins size={14} /> Native Yield Rail
        </p>
        <h1 className="terminal-title mb-3 text-4xl sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--sea-ink-soft)] font-black tracking-tight drop-shadow-sm">
          CACAOPool
        </h1>
        <p className="text-[var(--sea-ink-soft)]/90 max-w-xl mx-auto text-sm sm:text-base font-medium">
          Deposit native CACAO into Maya Protocol's dedicated pool, track
          deposited and earned CACAO, and inspect pool participation directly
          from your vault.
        </p>
      </div>

      <div className="w-full max-w-6xl mt-2 grid gap-8 lg:grid-cols-[440px_minmax(0,1fr)] items-start">
        <article
          className="glass-panel-strong p-2 sm:p-3 rise-in relative overflow-visible backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-[2.5rem] border border-[var(--line)]"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex justify-between items-center px-6 py-4">
            <div className="flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1 shadow-sm">
              <button
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === "deposit" ? "bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm" : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"}`}
                type="button"
                onClick={() => {
                  setActiveTab("deposit");
                  setSubmitError(null);
                }}
              >
                Deposit
              </button>
              <button
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === "withdraw" ? "bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm" : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"}`}
                type="button"
                onClick={() => {
                  setActiveTab("withdraw");
                  setSubmitError(null);
                }}
              >
                Withdraw
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-bold text-[var(--sea-ink-soft)] bg-[var(--surface-strong)] px-2.5 py-1 rounded-full border border-[var(--line)] shadow-sm">
                {activeSession?.label ?? "None"}
              </div>
            </div>
          </div>

          {activeTab === "deposit" ? (
            <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 mb-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group">
              <div className="flex justify-between mb-4">
                <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
                  Amount
                </span>
                <button
                  onClick={
                    !mayaAddress && !isViewOnly ? connectMayaChain : undefined
                  }
                  className={`text-[11px] font-bold text-[var(--sea-ink-soft)] flex items-center gap-1.5 bg-[var(--surface-strong)] px-2.5 py-1 rounded-full border border-[var(--line)] transition-colors ${!mayaAddress && !isViewOnly ? "cursor-pointer hover:bg-[var(--surface)] hover:text-[var(--cacao-neon)] hover:border-[var(--cacao-neon)]/30" : "cursor-default"}`}
                >
                  <Wallet size={12} />
                  {mayaAddress
                    ? shortenAddress(mayaAddress)
                    : isViewOnly
                      ? "No Address"
                      : "Connect Vault"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-4">
                <input
                  aria-label="Deposit amount"
                  className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={depositAmount}
                  onChange={(event) => {
                    setDepositAmount(event.target.value);
                    setSubmitError(null);
                  }}
                />
                <div className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-strong)] border border-[var(--line)] rounded-full py-2.5 pl-2.5 pr-4 sm:pr-5 shadow-sm select-none">
                  <AssetIcon
                    assetId="cacao"
                    className="w-8 h-8 sm:w-9 sm:h-9 shadow-sm"
                  />
                  <span className="font-bold text-lg sm:text-xl tracking-tight text-[var(--sea-ink)]">
                    CACAO
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-4 mt-3 px-1">
                <span
                  className="text-xs font-medium text-[var(--sea-ink-soft)] flex items-center gap-1 cursor-pointer hover:text-[var(--cacao-neon)] transition-colors select-none"
                  onClick={() => {
                    setDepositAmount(cacaoBalance?.formattedAmount ?? "");
                    setSubmitError(null);
                  }}
                >
                  Balance:{" "}
                  <span className="font-bold text-[var(--sea-ink)]">
                    {isBalanceLoading
                      ? "syncing"
                      : (cacaoBalance?.formattedAmount ?? "0")}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-1.5 px-2">
              <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 border border-[var(--line)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]">
                    Withdraw Share
                  </span>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-[var(--maya-teal)]">
                      {formatBasisPointsPercentage(
                        normalizedWithdrawBasisPoints,
                      )}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                      {normalizedWithdrawBasisPoints} bps
                    </div>
                  </div>
                </div>
                <input
                  aria-label="Withdraw share"
                  className="mt-6 w-full cursor-pointer accent-[var(--maya-teal)]"
                  max="10000"
                  min="0"
                  step="1"
                  type="range"
                  value={withdrawBasisPoints}
                  onChange={(event) => {
                    setWithdrawBasisPoints(event.target.value);
                    setSubmitError(null);
                  }}
                />
                <div className="mt-3 flex justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]/80">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="bg-[var(--bg-base)] rounded-[1.5rem] border border-[var(--line)] p-4 sm:p-5 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)] mb-3">
                  Est. CACAO Returned
                </p>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl sm:text-3xl font-bold text-[var(--sea-ink)]">
                      {withdrawPreviewAmount}
                    </p>
                    <p className="mt-2 text-xs text-[var(--sea-ink-soft)] leading-snug">
                      Based on your current pool value and the selected share.
                    </p>
                    <p className="mt-3 text-[11px] font-semibold text-[var(--sea-ink-soft)]">
                      Latest deposit block:{" "}
                      <span className="font-mono text-[var(--sea-ink)]">
                        {latestDepositHeight ?? "n/a"}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-[var(--sea-ink-soft)]">
                      Current block:{" "}
                      <span className="font-mono text-[var(--sea-ink)]">
                        {currentBlockHeight ?? "n/a"}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                      Tx amount
                    </p>
                    <p className="mt-1 font-mono text-xs text-[var(--sea-ink)]">
                      {formatCacaoBaseUnits(
                        CACAO_POOL_WITHDRAW_DUST_BASE_UNITS ?? "0",
                      )}{" "}
                      CACAO
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[11px] text-[var(--sea-ink-soft)]">
                  {withdrawMaturity.ready ? (
                    <span className="font-semibold text-[var(--maya-teal)]">
                      Position matured. Latest deposit is more than{" "}
                      {CACAO_POOL_MATURITY_BLOCKS.toLocaleString()} blocks
                      behind the current chain height.
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-500">
                      {withdrawMaturity.note ??
                        "Withdraw maturity is not available yet."}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-2 mb-4 px-3 flex flex-col gap-3">
            <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--bg-base)] p-4 flex items-start gap-3">
              <div className="mt-0.5 text-[var(--maya-teal)]">
                {activeTab === "deposit" ? (
                  <ArrowUpRight size={16} />
                ) : (
                  <ArrowDownLeft size={16} />
                )}
              </div>
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-[var(--sea-ink)]">
                  Protocol Memo:{" "}
                  <span className="font-mono bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 rounded-md ml-1">
                    {activeTab === "deposit" ? "POOL+" : withdrawMemo}
                  </span>
                </p>
                <p className="text-[var(--sea-ink-soft)] leading-snug">
                  {activeTab === "deposit"
                    ? "Your CACAO will be transferred to the protocol and enter the native yield generation pool."
                    : "The withdraw request sends the required MayaChain dust amount and uses the memo basis points to redeem your selected pool share."}
                </p>
              </div>
            </div>

            {depositState.note ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-500 font-medium">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="leading-snug">{depositState.note}</p>
              </div>
            ) : null}

            {balanceError ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-400 font-medium">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="leading-snug">{balanceError}</p>
              </div>
            ) : null}

            {submitError ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-400 font-medium">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="leading-snug">{submitError}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-2 px-1 pb-1 flex justify-between gap-2">
            <div className="flex-1">
              {depositState.kind === "connect" ? (
                <button
                  className="w-full h-[60px] pb-1 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface)] hover:border-[var(--maya-teal)]/50 shadow-sm transition-all active:scale-[0.98]"
                  type="button"
                  onClick={connectMayaChain}
                >
                  Connect Vault
                </button>
              ) : (
                <button
                  className="w-full h-[60px] relative overflow-hidden text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-gradient-to-r from-[#FF9B70] to-[var(--cacao-neon)] text-[var(--bg-base)] shadow-[0_4px_20px_rgba(232,122,78,0.4)] hover:shadow-[0_6px_24px_rgba(232,122,78,0.6)] hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed group/dep"
                  disabled={depositState.disabled}
                  type="button"
                  onClick={() => void handlePrimaryAction()}
                >
                  <span className="flex items-center justify-center gap-2 relative top-[-1px] z-10">
                    {isSubmitting ? (
                      <Loader2
                        size={18}
                        className="animate-spin text-white/90"
                      />
                    ) : (
                      <>
                        {activeTab === "deposit" ? (
                          <Coins
                            size={18}
                            className="group-hover/dep:rotate-12 transition-transform text-white/90"
                          />
                        ) : (
                          <ArrowDownLeft
                            size={18}
                            className="group-hover/dep:-translate-y-0.5 transition-transform text-white/90"
                          />
                        )}
                      </>
                    )}
                    <span className="text-white drop-shadow-sm">
                      {depositState.label}
                    </span>
                  </span>
                </button>
              )}
            </div>

            <button
              className="w-16 h-[60px] flex items-center justify-center rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink-soft)] hover:text-[var(--maya-teal)] hover:border-[var(--maya-teal)]/30 hover:bg-[var(--surface)] shadow-sm transition-all active:scale-95"
              type="button"
              onClick={() => {
                void refreshPositionData();
                void refreshBalance();
                void refreshCurrentBlockHeight();
              }}
            >
              <RefreshCw
                size={20}
                className={
                  isSnapshotLoading || isBalanceLoading || isBlockHeightLoading
                    ? "animate-spin"
                    : ""
                }
              />
            </button>
          </div>
        </article>

        <div className="grid gap-6">
          <section
            className="glass-panel-strong p-6 sm:p-8 relative overflow-hidden rise-in"
            style={{ animationDelay: "200ms" }}
          >
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <p className="island-kicker mb-1">Account Portfolio</p>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
                  Pool Position
                </h2>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--chip-bg)] border border-[var(--line)] shadow-sm">
                <Wallet size={20} className="text-[var(--sea-ink-soft)]" />
              </div>
            </div>

            {isSnapshotLoading ? (
              <div className="empty-state bg-[var(--bg-base)] border border-[var(--line)] rounded-3xl py-12 mb-2">
                <Loader2
                  size={32}
                  className="animate-spin text-[var(--cacao-neon)] mb-4"
                />
                <p className="font-semibold text-lg text-[var(--sea-ink)]">
                  Loading position...
                </p>
                <p className="text-sm text-[var(--sea-ink-soft)] max-w-sm mt-3 text-center">
                  Syncing midgard history for your connected wallet.
                </p>
              </div>
            ) : snapshotError ? (
              <div className="p-5 rounded-3xl border border-rose-500/20 bg-rose-500/10 mb-2">
                <p className="font-semibold text-rose-500 text-lg">
                  Failed to load data
                </p>
                <p className="mt-2 text-sm text-rose-400 font-medium">
                  {snapshotError}
                </p>
                <button
                  className="secondary-btn mt-5 px-5 py-2.5 text-sm font-semibold shadow-sm"
                  onClick={refreshPositionData}
                >
                  Retry Connection
                </button>
              </div>
            ) : snapshot?.position && snapshot.position.units !== "0" ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
                  {(() => {
                    const netCacaoStr = formatCacaoBaseUnits(
                      snapshot.position!.netCacao,
                    );
                    const currentWorthStr = formatCacaoBaseUnits(
                      snapshot.position!.cacaoDeposit,
                    );
                    const netCacaoNum = Number(netCacaoStr);
                    const currentWorthNum = Number(currentWorthStr);

                    //calculate total return percentage from the analytics data
                    const totalReturnPct =
                      analytics?.apy.details?.net_pnl_cacao ||
                      (0 / netCacaoNum) * 100 ||
                      0;

                    const formatUsd = (cacao: number) =>
                      cacaoUsdPrice
                        ? `$${(cacao * cacaoUsdPrice).toLocaleString(undefined, { notation: "compact", minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : undefined;

                    return (
                      <>
                        <MetricTile
                          label="Net CACAO Added"
                          value={netCacaoStr}
                          subValue={formatUsd(netCacaoNum)}
                        />
                        {analytics ? (
                          <>
                            <MetricTile
                              label="Current Value (CACAO)"
                              value={
                                analytics.apy.details?.current_value_cacao.toLocaleString(
                                  undefined,
                                  {
                                    notation: "compact",
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 4,
                                  },
                                ) ?? "--"
                              }
                              subValue={formatUsd(currentWorthNum)}
                            />

                            <MetricTile
                              label="CACAO Earned"
                              value={`${analytics.apy.details?.net_pnl_cacao || 0 > 0 ? "+" : ""}${analytics.apy.details?.net_pnl_cacao.toLocaleString(undefined, { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 4 })}`}
                              subValue={formatUsd(
                                analytics.apy.details?.net_pnl_cacao ?? 0,
                              )}
                              highlight
                            />
                            <MetricTile
                              label="ROI (CACAO)"
                              value={`${totalReturnPct > 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%`}
                            />

                            <MetricTile
                              label="APY (CACAO)"
                              value={formatPercentValue(
                                analytics.apy.apy_cacao,
                              )}
                              size="sm"
                            />
                          </>
                        ) : null}
                      </>
                    );
                  })()}
                </div>

                <div className="bg-[var(--chip-bg)]/80 rounded-[1.75rem] border border-[var(--line)] p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                      Recent Activity
                    </span>
                    <Activity
                      size={14}
                      className="text-[var(--sea-ink-soft)]"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    {snapshot.activity.length ? (
                      snapshot.activity.slice(0, 4).map((item) => (
                        <a
                          href={
                            item.txHash
                              ? `https://explorer.mayachain.info/tx/${item.txHash}`
                              : "#"
                          }
                          target="_blank"
                          rel="noopener"
                          key={item.id}
                          className="flex justify-between items-center bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-3 group hover:border-[var(--sea-ink-soft)]/30 transition-colors"
                        >
                          <div>
                            <p className="font-bold text-[var(--sea-ink)] capitalize text-sm">
                              {item.type}
                            </p>
                            <p className="text-[10px] text-[var(--sea-ink-soft)] font-bold tracking-wide mt-0.5 uppercase">
                              {formatTimestamp(item.timestamp)}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <p className="font-bold text-[var(--sea-ink)] text-sm">
                                {item.inboundAmount
                                  ? `+${formatCacaoBaseUnits(item.inboundAmount)}`
                                  : `-${formatCacaoBaseUnits(item.outboundAmount || "0")}`}
                              </p>
                              <p className="text-[10px] text-[var(--maya-teal)] font-mono font-bold tracking-wide mt-0.5">
                                {item.txHash
                                  ? shortenAddress(item.txHash)
                                  : item.status}
                              </p>
                            </div>
                          </div>
                        </a>
                      ))
                    ) : (
                      <div className="py-6 text-center text-sm font-medium text-[var(--sea-ink-soft)]">
                        No activity recorded for this address.
                      </div>
                    )}
                  </div>
                </div>

                {analyticsError ? (
                  <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-500 font-medium">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <p className="leading-snug">{analyticsError}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state bg-[var(--bg-base)] border border-[var(--line)] rounded-3xl py-12 px-6 shadow-inner mx-1">
                <div className="w-16 h-16 rounded-full bg-[var(--surface-strong)] flex items-center justify-center border border-[var(--line)] shadow-sm mb-5">
                  <Coins size={28} className="text-[var(--cacao-neon)]" />
                </div>
                <p className="font-bold text-[var(--sea-ink)] text-xl tracking-tight">
                  No Active Position
                </p>
                <p className="text-sm font-medium text-[var(--sea-ink-soft)] max-w-sm mt-3 text-center leading-relaxed">
                  We didn't detect a CACAOPool membership for this vault
                  address. Send a MsgDeposit to seed your first native yield
                  position.
                </p>
              </div>
            )}
          </section>

          <section
            className="glass-panel-strong p-6 sm:p-8 rise-in"
            style={{ animationDelay: "300ms" }}
          >
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <p className="island-kicker mb-1">Global Analytics</p>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
                  Protocol Trend
                </h2>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--chip-bg)] border border-[var(--line)] shadow-sm">
                <TrendingUp size={20} className="text-[var(--sea-ink-soft)]" />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
              {(() => {
                const latestMembers = latestHistory
                  ? Number(latestHistory.members)
                  : 0;
                const firstMembers = snapshot?.history[0]
                  ? Number(snapshot.history[0].members)
                  : 0;
                const memberDelta = latestMembers - firstMembers;
                const formatUsd = (cacao: number) =>
                  cacaoUsdPrice
                    ? `$${(cacao * cacaoUsdPrice).toLocaleString(undefined, { notation: "compact", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : undefined;

                return (
                  <>
                    <MetricTile
                      label="Active Members"
                      value={latestHistory?.members ?? "--"}
                      highlight
                    />
                    <MetricTile
                      label="30D Member Change"
                      value={
                        latestHistory
                          ? `${memberDelta >= 0 ? "+" : ""}${memberDelta}`
                          : "--"
                      }
                    />
                    <MetricTile
                      label="CACAO Price"
                      value={
                        cacaoUsdPrice ? `$${cacaoUsdPrice.toFixed(4)}` : "--"
                      }
                    />
                    {analytics ? (
                      <>
                        <MetricTile
                          label="Total Pool Value (CACAO)"
                          value={
                            analytics.stats.total_value_cacao?.toLocaleString(
                              undefined,
                              {
                                notation: "compact",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              },
                            ) ?? "--"
                          }
                          subValue={formatUsd(
                            analytics.stats.total_value_cacao ?? 0,
                          )}
                        />
                        <MetricTile
                          label="Pool Rewards (CACAO"
                          value={
                            analytics.stats.total_earnings_cacao?.toLocaleString(
                              undefined,
                              {
                                notation: "compact",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              },
                            ) ?? "--"
                          }
                          subValue={formatUsd(
                            analytics.stats.total_earnings_cacao ?? 0,
                          )}
                        />
                      </>
                    ) : null}
                  </>
                );
              })()}
            </div>

            <div className="bg-[var(--chip-bg)]/80 rounded-[1.75rem] border border-[var(--line)] p-4 sm:p-5 pt-8 overflow-hidden relative">
              <div className="absolute top-4 left-5">
                <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                  {trendTitle}
                </span>
              </div>
              {analyticsLoading ? (
                <div className="h-40 flex items-center justify-center text-sm font-medium text-[var(--sea-ink-soft)] bg-[var(--bg-base)] border border-[var(--line)] rounded-2xl mt-4 animate-pulse">
                  <Loader2
                    size={24}
                    className="animate-spin mr-3 text-[var(--cacao-neon)]"
                  />
                  Loading trend data...
                </div>
              ) : trendPoints.length ? (
                <>
                  <PoolTrendChart points={trendPoints} />
                  <div className="mt-3 flex justify-between text-[10px] font-bold text-[var(--sea-ink-soft)]/70 uppercase tracking-widest px-1">
                    <span>{trendPoints[0]?.label}</span>
                    <span>{trendPoints[trendPoints.length - 1]?.label}</span>
                  </div>
                </>
              ) : (
                <div className="h-40 flex items-center justify-center text-sm font-medium text-[var(--sea-ink-soft)] bg-[var(--bg-base)] border border-[var(--line)] rounded-2xl mt-4">
                  Waiting for historical data sync...
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export function getCacaoPoolPrimaryAction(params: {
  activeTab: CacaoPoolActionTab;
  hasSession: boolean;
  hasMayaAddress: boolean;
  hasPosition?: boolean;
  isViewOnly?: boolean;
  supportReason?: string;
  amountBaseUnits: string | null;
  balanceBaseUnits: string | null;
  isSubmitting: boolean;
  withdrawBasisPoints?: number;
  withdrawMaturityNote?: string;
}) {
  if (params.isViewOnly) {
    return {
      kind: "submit" as const,
      label: "View Only",
      disabled: true,
      note: VIEW_ONLY_IMPERSONATION_REASON,
    };
  }

  if (!params.hasSession || !params.hasMayaAddress) {
    return {
      kind: "connect" as const,
      label: "Connect MayaChain",
      disabled: false,
      note: params.supportReason,
    };
  }

  if (params.isSubmitting) {
    return {
      kind: "submit" as const,
      label:
        params.activeTab === "withdraw"
          ? "Submitting Withdrawal"
          : "Submitting Deposit",
      disabled: true,
      note: undefined,
    };
  }

  if (params.activeTab === "withdraw") {
    if (params.supportReason) {
      return {
        kind: "submit" as const,
        label: "Withdraw Unavailable",
        disabled: true,
        note: params.supportReason,
      };
    }

    if (!params.hasPosition) {
      return {
        kind: "submit" as const,
        label: "No Active Position",
        disabled: true,
        note: undefined,
      };
    }

    if (
      !Number.isInteger(params.withdrawBasisPoints) ||
      (params.withdrawBasisPoints ?? 0) <= 0
    ) {
      return {
        kind: "submit" as const,
        label: "Set Withdrawal Share",
        disabled: true,
        note: undefined,
      };
    }

    if (params.withdrawMaturityNote) {
      return {
        kind: "submit" as const,
        label: "Position Maturing",
        disabled: true,
        note: params.withdrawMaturityNote,
      };
    }
  }

  if (params.supportReason) {
    return {
      kind: "submit" as const,
      label: "Deposit Unavailable",
      disabled: true,
      note: params.supportReason,
    };
  }

  if (!params.amountBaseUnits || params.amountBaseUnits === "0") {
    return {
      kind: "submit" as const,
      label: "Enter Deposit Amount",
      disabled: true,
      note: undefined,
    };
  }

  if (
    params.balanceBaseUnits &&
    BigInt(params.amountBaseUnits) > BigInt(params.balanceBaseUnits)
  ) {
    return {
      kind: "submit" as const,
      label: "Insufficient CACAO",
      disabled: true,
      note:
        params.activeTab === "withdraw"
          ? "One base unit of MayaChain CACAO is required to send the withdrawal memo."
          : "The deposit amount exceeds the available MayaChain CACAO balance.",
    };
  }

  return {
    kind: "submit" as const,
    label:
      params.activeTab === "withdraw" ? "Send MsgWithdraw" : "Send MsgDeposit",
    disabled: false,
    note: undefined,
  };
}

export function getCacaoPoolViewState(params: {
  hasSession: boolean;
  hasMayaAddress: boolean;
  isLoading: boolean;
  hasError: boolean;
  hasPosition: boolean;
}) {
  if (!params.hasSession || !params.hasMayaAddress) {
    return "disconnected";
  }

  if (params.isLoading) {
    return "loading";
  }

  if (params.hasError) {
    return "error";
  }

  return params.hasPosition ? "position" : "empty";
}

function MetricTile({
  label,
  value,
  highlight,
  size,
  subValue,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  size?: "sm" | "md";
  subValue?: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-[var(--bg-base)] p-3 sm:p-4 flex flex-col justify-center ${highlight ? "border-[var(--maya-teal)]/30 shadow-[0_0_15px_rgba(79,209,197,0.1)]" : "border-[var(--line)]"}`}
    >
      <span className="text-[10px] sm:text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider truncate mb-1.5">
        {label}
      </span>
      <span
        className={`font-bold text-[var(--sea-ink)] truncate ${size === "sm" ? "text-lg sm:text-lg" : "text-xl sm:text-2xl"} ${highlight ? "text-[var(--maya-teal)]" : ""}`}
      >
        {value}
      </span>
      {subValue && (
        <span className="text-xs font-semibold text-[var(--sea-ink-soft)] mt-0.5">
          {subValue}
        </span>
      )}
    </div>
  );
}

export function buildCacaoPoolWithdrawMemo(
  withdrawBasisPoints: number,
): string {
  const normalized = Number.isFinite(withdrawBasisPoints)
    ? Math.max(0, Math.min(10_000, Math.round(withdrawBasisPoints)))
    : 0;
  return `POOL-:${normalized}`;
}

export function getCacaoPoolWithdrawPreviewBaseUnits(input: {
  analyticsCurrentValueCacao: number | null;
  fallbackBaseUnits: string;
  withdrawBasisPoints: number;
}): string {
  const resolvedBaseUnits = resolveCacaoPoolCurrentValueBaseUnits(
    input.analyticsCurrentValueCacao,
    input.fallbackBaseUnits,
  );
  const normalizedBasisPoints = Number.isFinite(input.withdrawBasisPoints)
    ? Math.max(0, Math.min(10_000, Math.round(input.withdrawBasisPoints)))
    : 0;

  return (
    (BigInt(resolvedBaseUnits) * BigInt(normalizedBasisPoints)) /
    10_000n
  ).toString();
}

export function getLatestCacaoPoolDepositHeight(
  snapshot: CacaoPoolSnapshot | null,
): number | null {
  if (!snapshot) {
    return null;
  }

  const heights = snapshot.activity
    .filter((item) => item.type === "deposit")
    .map((item) => Number(item.height))
    .filter((height) => Number.isFinite(height) && height > 0);

  return heights.length ? Math.max(...heights) : null;
}

export function getCacaoPoolWithdrawMaturityState(input: {
  currentBlockHeight: number | null;
  hasPosition: boolean;
  isLoading?: boolean;
  latestDepositHeight: number | null;
  requiredBlocks: number;
}): {
  maturedBlocks: number | null;
  note?: string;
  ready: boolean;
  remainingBlocks: number | null;
} {
  if (!input.hasPosition) {
    return {
      maturedBlocks: null,
      ready: false,
      remainingBlocks: null,
    };
  }

  if (input.isLoading) {
    return {
      maturedBlocks: null,
      note: "Checking MayaChain block maturity for the latest deposit.",
      ready: false,
      remainingBlocks: null,
    };
  }

  if (
    !Number.isFinite(input.latestDepositHeight) ||
    (input.latestDepositHeight ?? 0) <= 0
  ) {
    return {
      maturedBlocks: null,
      note: "Unable to verify the latest deposit block height for this position.",
      ready: false,
      remainingBlocks: null,
    };
  }

  if (
    !Number.isFinite(input.currentBlockHeight) ||
    (input.currentBlockHeight ?? 0) <= 0
  ) {
    return {
      maturedBlocks: null,
      note: "Unable to load the current MayaChain block height.",
      ready: false,
      remainingBlocks: null,
    };
  }

  const maturedBlocks =
    (input.currentBlockHeight ?? 0) - (input.latestDepositHeight ?? 0);
  if (maturedBlocks > input.requiredBlocks) {
    return {
      maturedBlocks,
      ready: true,
      remainingBlocks: 0,
    };
  }

  const remainingBlocks = Math.max(0, input.requiredBlocks - maturedBlocks + 1);
  return {
    maturedBlocks,
    note: `Withdrawals unlock after ${input.requiredBlocks.toLocaleString()} blocks. ${remainingBlocks.toLocaleString()} more blocks are required after the latest deposit.`,
    ready: false,
    remainingBlocks,
  };
}

function resolveCacaoPoolCurrentValueBaseUnits(
  analyticsCurrentValueCacao: number | null,
  fallbackBaseUnits: string,
): string {
  if (
    typeof analyticsCurrentValueCacao === "number" &&
    Number.isFinite(analyticsCurrentValueCacao) &&
    analyticsCurrentValueCacao >= 0
  ) {
    const parsed = parseDecimalToBaseUnits(
      analyticsCurrentValueCacao.toFixed(10),
      10,
    );
    if (parsed) {
      return parsed;
    }
  }

  return /^\d+$/.test(fallbackBaseUnits) ? fallbackBaseUnits : "0";
}

function formatBasisPointsPercentage(withdrawBasisPoints: number): string {
  return `${(withdrawBasisPoints / 100).toFixed(2)}%`;
}

function PoolTrendChart({
  points,
}: {
  points: Array<
    CacaoPoolHistoryPoint & { metric?: "rewards" | "members"; value?: number }
  >;
}) {
  const path = buildTrendPath(points);
  const valueLabel =
    points[0]?.metric === "rewards" ? "USD rewards" : "active members";
  return (
    <div>
      <svg
        aria-label="CACAOPool trend"
        className="h-48 w-full"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="cacaoPoolTrend" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(232,122,78,0.45)" />
            <stop offset="100%" stopColor="rgba(232,122,78,0.04)" />
          </linearGradient>
        </defs>
        <path d={`${path} L 100 40 L 0 40 Z`} fill="url(#cacaoPoolTrend)" />
        <path
          d={path}
          fill="none"
          stroke="var(--cacao-neon)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {points.slice(-3).map((point) => (
          <div
            key={`${point.startTime}-${point.endTime}`}
            className="rounded-[1rem] border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3"
          >
            <p className="panel-label">{point.label}</p>
            <p className="mt-1 font-semibold text-[var(--sea-ink)]">
              {point.value} {valueLabel}
            </p>
            <p className="panel-micro">Bucket ending {point.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildTrendPath(
  points: Array<CacaoPoolHistoryPoint & { value?: number }>,
): string {
  if (!points.length) {
    return "M 0 40";
  }

  if (points.length === 1) {
    return "M 0 20 L 100 20";
  }

  const values = points.map((point) => Number(point.value ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 36 - ((value - min) / range) * 28;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildCacaotrackerTrendPoints(
  history: CacaoPoolHistoryEntry[] | null | undefined,
): Array<
  CacaoPoolHistoryPoint & { metric: "rewards" | "members"; value: number }
> {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      const rawDate = entry.date ?? entry.timestamp;
      const timestamp = rawDate ? Date.parse(rawDate) : Number.NaN;
      let value: number | null = null;
      let metric: "rewards" | "members" = "members";
      if (normalizeTrendMetric(entry.total_rewards_usd) != null) {
        value = normalizeTrendMetric(entry.total_rewards_usd);
        metric = "rewards";
      } else if (normalizeTrendMetric(entry.rewards_usd) != null) {
        value = normalizeTrendMetric(entry.rewards_usd);
        metric = "rewards";
      } else if (normalizeTrendMetric(entry.current_value_usd) != null) {
        value = normalizeTrendMetric(entry.current_value_usd);
        metric = "rewards";
      } else if (normalizeTrendMetric(entry.current_value_cacao) != null) {
        value = normalizeTrendMetric(entry.current_value_cacao);
        metric = "rewards";
      } else if (normalizeTrendMetric(entry.members) != null) {
        value = normalizeTrendMetric(entry.members);
        metric = "members";
      }

      if (!Number.isFinite(timestamp) || value == null) {
        return null;
      }

      const pointTimestamp = Math.floor(timestamp / 1000);
      return {
        startTime: pointTimestamp - 86_400,
        endTime: pointTimestamp,
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
        }).format(new Date(timestamp)),
        value,
        metric,
      };
    })
    .filter(
      (
        point,
      ): point is CacaoPoolHistoryPoint & {
        metric: "rewards" | "members";
        value: number;
      } => Boolean(point),
    )
    .slice(-30);
}

function normalizeTrendMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPercentValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)}%`
    : "--";
}
