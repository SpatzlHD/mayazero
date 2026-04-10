import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Coins,
  Loader2,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createExecutionJourneySteps,
  depositToCacaoPool,
  fetchAddressBalances,
  getCacaoPoolDepositSupport,
  trackTransactionJourney,
  type AddressBalanceResponse,
  useActiveWalletSession,
  useMayaWalletActions,
  useWalletBalanceRefreshTick,
  waitForJourneyTransactionSettlement,
  WalletSessionNotFoundError,
} from "#/wallet";
import {
  fetchCacaoPoolSnapshot,
  formatBaseUnits,
  formatCacaoBaseUnits,
  formatTimestamp,
  parseDecimalToBaseUnits,
  type CacaoPoolHistoryPoint,
  type CacaoPoolSnapshot,
} from "#/lib/cacao-pool";
import { AssetIcon, shortenAddress } from "#/components/ProtocolPrimitives";
import { buildPageSeoHead } from "#/lib/seo";

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
};

function CacaoPoolRoute() {
  return <CacaoPoolPage />;
}

export function CacaoPoolPage({
  loadSnapshot = fetchCacaoPoolSnapshot,
  loadBalances = fetchAddressBalances,
  submitDeposit = depositToCacaoPool,
}: CacaoPoolPageProps) {
  const wallet = useMayaWalletActions();
  const navigate = useNavigate();
  const activeSession = useActiveWalletSession();
  const balanceRefreshTick = useWalletBalanceRefreshTick();
  const mayaAddress = activeSession?.addresses[Chain.MayaChain] ?? "";

  const [depositAmount, setDepositAmount] = useState("");
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

  const depositSupport = getCacaoPoolDepositSupport(wallet, activeSession?.id);
  const amountBaseUnits = useMemo(
    () => parseDecimalToBaseUnits(depositAmount, 10),
    [depositAmount],
  );

  const depositState = getCacaoPoolPrimaryAction({
    hasSession: Boolean(activeSession),
    hasMayaAddress: Boolean(mayaAddress),
    supportReason: depositSupport.reason,
    amountBaseUnits,
    balanceBaseUnits: cacaoBalance?.amount ?? null,
    isSubmitting,
  });

  async function connectMayaChain() {
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

  useEffect(() => {
    void refreshPositionData();
    void refreshBalance();
  }, [mayaAddress, balanceRefreshTick]);

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

  async function handleDeposit() {
    if (!amountBaseUnits || !activeSession || !depositSupport.supported) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await trackTransactionJourney(wallet, {
        kind: "cacao-pool",
        title: "CACAOPool Deposit",
        sessionId: activeSession.id,
        source: activeSession.source,
        chain: Chain.MayaChain,
        routePath: "/cacao-pool",
        steps: createExecutionJourneySteps({
          source: activeSession.source,
          finalLabel: "Deposit Complete",
        }),
        run: async (journey) => {
          journey.activateStep("preparing", "Preparing native CACAO deposit.");
          const result = await submitDeposit(wallet, {
            sessionId: activeSession.id,
            amountBaseUnits,
            journeyId: journey.journeyId,
          });

          journey.completeStep("preparing", "Deposit request prepared.");
          if (activeSession.source === "extension") {
            journey.completeStep(
              "provider",
              "Extension accepted the deposit request.",
            );
          } else {
            journey.completeStep("signing", "Vault signing complete.");
          }

          journey.setPrimaryTxHash(result.txHash);
          journey.completeStep(
            "broadcasting",
            result.txHash
              ? "Deposit broadcast submitted."
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
                ? "Deposit confirmed on-chain."
                : settlement === "error"
                  ? "Deposit failed on-chain."
                  : settlement === "unconfirmed"
                    ? "Deposit submitted, but confirmation timed out."
                    : "Deposit submitted, but automatic tracking is unavailable.",
          });
          journey.complete(result, settlement);
          return result;
        },
      });
      setDepositAmount("");
      await Promise.all([refreshPositionData(), refreshBalance()]);
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const latestHistory = snapshot?.history[snapshot.history.length - 1] ?? null;

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
            <span className="font-bold text-[var(--sea-ink)] tracking-wide">
              Deposit
            </span>
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-bold text-[var(--sea-ink-soft)] bg-[var(--surface-strong)] px-2.5 py-1 rounded-full border border-[var(--line)] shadow-sm">
                {activeSession?.label ?? "None"}
              </div>
            </div>
          </div>

          <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 mb-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group">
            <div className="flex justify-between mb-4">
              <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
                Amount
              </span>
              <button
                onClick={!mayaAddress ? connectMayaChain : undefined}
                className={`text-[11px] font-bold text-[var(--sea-ink-soft)] flex items-center gap-1.5 bg-[var(--surface-strong)] px-2.5 py-1 rounded-full border border-[var(--line)] transition-colors ${!mayaAddress ? "cursor-pointer hover:bg-[var(--surface)] hover:text-[var(--cacao-neon)] hover:border-[var(--cacao-neon)]/30" : "cursor-default"}`}
              >
                <Wallet size={12} />
                {mayaAddress ? shortenAddress(mayaAddress) : "Connect Vault"}
              </button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <input
                aria-label="Deposit amount"
                className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold"
                inputMode="decimal"
                placeholder="0.0"
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
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
                onClick={() =>
                  setDepositAmount(cacaoBalance?.formattedAmount ?? "")
                }
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

          <div className="mt-2 mb-4 px-3 flex flex-col gap-3">
            <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--bg-base)] p-4 flex items-start gap-3">
              <div className="mt-0.5 text-[var(--maya-teal)]">
                <ArrowUpRight size={16} />
              </div>
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-[var(--sea-ink)]">
                  Protocol Memo:{" "}
                  <span className="font-mono bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 rounded-md ml-1">
                    POOL+
                  </span>
                </p>
                <p className="text-[var(--sea-ink-soft)] leading-snug">
                  Your CACAO will be transferred to the protocol and enter the
                  native yield generation pool.
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
                  onClick={handleDeposit}
                >
                  <span className="flex items-center justify-center gap-2 relative top-[-1px] z-10">
                    {isSubmitting ? (
                      <Loader2
                        size={18}
                        className="animate-spin text-white/90"
                      />
                    ) : (
                      <Coins
                        size={18}
                        className="group-hover/dep:rotate-12 transition-transform text-white/90"
                      />
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
              }}
            >
              <RefreshCw
                size={20}
                className={
                  isSnapshotLoading || isBalanceLoading ? "animate-spin" : ""
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
                    const earnedCacaoNum = currentWorthNum - netCacaoNum;
                    const totalReturnPct =
                      netCacaoNum > 0
                        ? (earnedCacaoNum / netCacaoNum) * 100
                        : 0;

                    const formatUsd = (cacao: number) =>
                      cacaoUsdPrice
                        ? `$${(cacao * cacaoUsdPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : undefined;

                    return (
                      <>
                        <MetricTile
                          label="Net CACAO Added"
                          value={netCacaoStr}
                          subValue={formatUsd(netCacaoNum)}
                        />
                        <MetricTile
                          label="Current Deposit"
                          value={currentWorthStr}
                          subValue={formatUsd(currentWorthNum)}
                          highlight
                        />
                        <MetricTile
                          label="CACAO Earned"
                          value={`${earnedCacaoNum > 0 ? "+" : ""}${earnedCacaoNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}`}
                          subValue={formatUsd(earnedCacaoNum)}
                        />
                        <MetricTile
                          label="Yield Return"
                          value={`${totalReturnPct > 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%`}
                        />
                        <MetricTile
                          label="Cacao Price"
                          value={
                            cacaoUsdPrice
                              ? `$${cacaoUsdPrice.toFixed(4)}`
                              : "--"
                          }
                        />
                        <MetricTile
                          label="Last Updated"
                          value={formatTimestamp(
                            snapshot.position!.lastAddedAt,
                          )}
                          size="sm"
                        />
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
                        <div
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
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-sm font-medium text-[var(--sea-ink-soft)]">
                        No activity recorded for this address.
                      </div>
                    )}
                  </div>
                </div>
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
                  </>
                );
              })()}
            </div>

            <div className="bg-[var(--chip-bg)]/80 rounded-[1.75rem] border border-[var(--line)] p-4 sm:p-5 pt-8 overflow-hidden relative">
              <div className="absolute top-4 left-5">
                <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                  30 Day Member Trend
                </span>
              </div>
              {snapshot?.history.length ? (
                <>
                  <PoolTrendChart points={snapshot.history} />
                  <div className="mt-3 flex justify-between text-[10px] font-bold text-[var(--sea-ink-soft)]/70 uppercase tracking-widest px-1">
                    <span>{snapshot.history[0]?.label}</span>
                    <span>
                      {snapshot.history[snapshot.history.length - 1]?.label}
                    </span>
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
  hasSession: boolean;
  hasMayaAddress: boolean;
  supportReason?: string;
  amountBaseUnits: string | null;
  balanceBaseUnits: string | null;
  isSubmitting: boolean;
}) {
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
      kind: "deposit" as const,
      label: "Submitting Deposit",
      disabled: true,
      note: undefined,
    };
  }

  if (params.supportReason) {
    return {
      kind: "deposit" as const,
      label: "Deposit Unavailable",
      disabled: true,
      note: params.supportReason,
    };
  }

  if (!params.amountBaseUnits || params.amountBaseUnits === "0") {
    return {
      kind: "deposit" as const,
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
      kind: "deposit" as const,
      label: "Insufficient CACAO",
      disabled: true,
      note: "The deposit amount exceeds the available MayaChain CACAO balance.",
    };
  }

  return {
    kind: "deposit" as const,
    label: "Send MsgDeposit",
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

function PoolTrendChart({ points }: { points: CacaoPoolHistoryPoint[] }) {
  const path = buildTrendPath(points);

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
              {point.members} active members
            </p>
            <p className="panel-micro">Bucket ending {point.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildTrendPath(points: CacaoPoolHistoryPoint[]): string {
  if (!points.length) {
    return "M 0 40";
  }

  if (points.length === 1) {
    return "M 0 20 L 100 20";
  }

  const values = points.map((point) => Number(point.members));
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
