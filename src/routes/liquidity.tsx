import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  Droplet,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AssetIcon,
  SelectionModal,
  shortenAddress,
} from "#/components/ProtocolPrimitives";
import {
  fetchCacaotrackerLiquidityPoolDetail,
  fetchCacaotrackerLiquiditySummary,
} from "#/lib/cacaotracker";
import type {
  LiquidityPoolDetailResponse,
  LiquiditySummaryResponse,
} from "#/lib/cacaotracker-types";
import {
  type LiquidityActivityItem,
  type LiquidityDepositMode,
  type LiquidityPool,
  type LiquidityPosition,
  type LiquidityWithdrawMode,
  fetchLiquidityActivity,
  fetchLiquidityPools,
  fetchLiquidityPositions,
  fetchLiquidityProviderFallback,
  getSessionLiquidityAddresses,
  mergeLiquidityPositionsWithFallback,
} from "#/lib/liquidity";
import { VIEW_ONLY_IMPERSONATION_REASON } from "#/lib/impersonation";
import { parseDecimalToBaseUnits, formatBaseUnits } from "#/lib/cacao-pool";
import { INTERFACE_AFFILIATE_MAYANAME } from "#/lib/swap-affiliates";
import { buildPageSeoHead } from "#/lib/seo";
import {
  useEffectiveWalletSession,
  useIsViewOnlyImpersonation,
} from "#/provider/ImpersonationProvider";
import { usePreferences } from "#/provider/PreferencesProvider";
import { useSettings } from "#/provider/SettingsProvider";
import {
  type AddressBalanceAsset,
  createExecutionJourneySteps,
  fetchAddressBalances,
  getLiquidityDepositSupport,
  getLiquidityWithdrawSupport,
  prepareLiquidityDepositSteps,
  submitLiquidityDepositStep,
  submitLiquidityWithdraw,
  trackTransactionJourney,
  useMayaWalletActions,
  useWalletBalanceRefreshTick,
  waitForJourneyTransactionSettlement,
  WalletSessionNotFoundError,
} from "#/wallet";

export const Route = createFileRoute("/liquidity")({
  head: () =>
    buildPageSeoHead({
      title: "Liquidity",
      description:
        "Review current Maya Protocol LP positions, monitor pool health, and submit guided liquidity actions from MayaZero.",
    }),
  component: LiquidityTerminalPage,
});

type PendingSymmetricDeposit = {
  assetAmountBaseUnits: string;
  cacaoAmountBaseUnits: string;
  interfaceAffiliateBps: string;
  poolAsset: string;
  source: "stored" | "recovered";
  sessionId: string;
};

type LiquidityActionState = {
  disabled: boolean;
  kind: "connect" | "resume" | "submit";
  label: string;
  note?: string;
};

type LiquidityFeedbackBanner = {
  tone: "error" | "warning";
  message: string;
};

const PENDING_DEPOSIT_STORAGE_KEY = "maya-liquidity-pending-symmetric";
const INTERFACE_TRACKING_BPS = "0";

function LiquidityTerminalPage() {
  const navigate = useNavigate();
  const wallet = useMayaWalletActions();
  const activeSession = useEffectiveWalletSession();
  const mayaAddress = activeSession?.addresses[Chain.MayaChain] ?? "";
  const isViewOnly = useIsViewOnlyImpersonation();
  const balanceRefreshTick = useWalletBalanceRefreshTick();
  const { isPowerUser } = usePreferences();
  const settings = useSettings();
  const sessionAddresses = useMemo(
    () => getSessionLiquidityAddresses(activeSession?.addresses),
    [activeSession?.addresses],
  );

  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [depositMode, setDepositMode] =
    useState<LiquidityDepositMode>("symmetric");
  const [withdrawMode, setWithdrawMode] =
    useState<LiquidityWithdrawMode>("symmetric");
  const [assetAmount, setAssetAmount] = useState("");
  const [cacaoAmount, setCacaoAmount] = useState("");
  const [withdrawShare, setWithdrawShare] = useState("25");
  const [selectedPoolAsset, setSelectedPoolAsset] = useState("");
  const [pools, setPools] = useState<LiquidityPool[]>([]);
  const [positions, setPositions] = useState<LiquidityPosition[]>([]);
  const [activity, setActivity] = useState<LiquidityActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assetBalance, setAssetBalance] = useState<AddressBalanceAsset | null>(
    null,
  );
  const [cacaoBalance, setCacaoBalance] = useState<AddressBalanceAsset | null>(
    null,
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceWarning, setBalanceWarning] = useState<string | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [storedPendingDeposit, setStoredPendingDeposit] =
    useState<PendingSymmetricDeposit | null>(null);
  const [liquiditySummary, setLiquiditySummary] =
    useState<LiquiditySummaryResponse | null>(null);
  const [liquiditySummaryError, setLiquiditySummaryError] = useState<
    string | null
  >(null);
  const [liquidityPoolDetail, setLiquidityPoolDetail] =
    useState<LiquidityPoolDetailResponse | null>(null);
  const [liquidityPoolDetailError, setLiquidityPoolDetailError] = useState<
    string | null
  >(null);

  const visiblePools = useMemo(
    () => filterVisibleLiquidityPools(pools, isPowerUser),
    [isPowerUser, pools],
  );
  const visiblePositions = useMemo(() => {
    const visiblePoolAssets = new Set(visiblePools.map((pool) => pool.asset));
    return positions.filter((position) => visiblePoolAssets.has(position.pool));
  }, [positions, visiblePools]);
  const hiddenStagedPoolCount = useMemo(
    () =>
      pools.filter((pool) => isStagedLiquidityPool(pool)).length -
      visiblePools.filter((pool) => isStagedLiquidityPool(pool)).length,
    [pools, visiblePools],
  );
  const sortedPools = useMemo(
    () => sortLiquidityPools(visiblePools, visiblePositions),
    [visiblePools, visiblePositions],
  );
  const selectedPool = useMemo(
    () =>
      sortedPools.find((pool) => pool.asset === selectedPoolAsset) ??
      sortedPools[0] ??
      null,
    [selectedPoolAsset, sortedPools],
  );
  const selectedPosition = useMemo(
    () =>
      visiblePositions.find(
        (position) => position.pool === selectedPool?.asset,
      ) ?? null,
    [visiblePositions, selectedPool?.asset],
  );
  const pendingCancelMode = useMemo(
    () => getPendingLiquidityCancelMode(selectedPosition),
    [selectedPosition],
  );
  const inferredPendingDeposit = useMemo(
    () =>
      inferRecoverablePendingSymmetricDeposit(
        activeSession?.id,
        visiblePositions,
      ),
    [activeSession?.id, visiblePositions],
  );
  const pendingDeposit = storedPendingDeposit ?? inferredPendingDeposit;
  const selectedActivity = useMemo(
    () =>
      activity.filter((item) => item.pool === selectedPool?.asset).slice(0, 5),
    [activity, selectedPool?.asset],
  );

  const assetAmountBaseUnits = useMemo(
    () =>
      selectedPool
        ? parseDecimalToBaseUnits(assetAmount, selectedPool.decimals)
        : null,
    [assetAmount, selectedPool],
  );
  const cacaoAmountBaseUnits = useMemo(
    () => parseDecimalToBaseUnits(cacaoAmount, 10),
    [cacaoAmount],
  );
  const withdrawBasisPoints = useMemo(() => {
    const share = Number(withdrawShare);
    return Number.isFinite(share) ? Math.round(share * 100) : 0;
  }, [withdrawShare]);

  const depositSupport = getLiquidityDepositSupport(wallet, {
    pool: selectedPool,
    mode: depositMode,
    sessionId: activeSession?.id,
  });
  const withdrawSupport = getLiquidityWithdrawSupport(wallet, {
    pool: selectedPool,
    mode: withdrawMode,
    position: selectedPosition,
    sessionId: activeSession?.id,
  });

  const actionState = getLiquidityPrimaryAction({
    activeTab,
    assetAmountBaseUnits,
    assetBalanceBaseUnits: assetBalance?.amount ?? null,
    cacaoAmountBaseUnits,
    cacaoBalanceBaseUnits: cacaoBalance?.amount ?? null,
    depositMode,
    depositSupportReason: isViewOnly
      ? VIEW_ONLY_IMPERSONATION_REASON
      : depositSupport.reason,
    hasPendingCancelPosition: Boolean(pendingCancelMode),
    hasPosition: Boolean(
      selectedPosition &&
        (selectedPosition.units !== "0" || pendingCancelMode !== null),
    ),
    hasSession: Boolean(activeSession),
    isViewOnly,
    isSubmitting,
    pendingDepositMatches: Boolean(
      pendingDeposit &&
      activeSession?.id === pendingDeposit.sessionId &&
      selectedPool?.asset === pendingDeposit.poolAsset &&
      depositMode === "symmetric",
    ),
    pendingDepositStoredAmount: Boolean(
      pendingDeposit?.cacaoAmountBaseUnits &&
      pendingDeposit.cacaoAmountBaseUnits !== "0",
    ),
    pool: selectedPool,
    withdrawBasisPoints,
    withdrawSupportReason: isViewOnly
      ? VIEW_ONLY_IMPERSONATION_REASON
      : withdrawSupport.reason,
  });
  const feedbackBanner = getLiquidityFeedbackBanner({
    balanceError,
    balanceWarning,
    submitError,
  });

  async function refreshLiquidityData() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [nextPools, nextPositions, nextActivity] = await Promise.all([
        fetchLiquidityPools({
          mayanodeUrl: settings.mayanodeUrl,
          midgardUrl: settings.midgardUrl,
        }),
        fetchLiquidityPositions(sessionAddresses, {
          mayanodeUrl: settings.mayanodeUrl,
          midgardUrl: settings.midgardUrl,
        }),
        fetchLiquidityActivity(sessionAddresses, {
          mayanodeUrl: settings.mayanodeUrl,
          midgardUrl: settings.midgardUrl,
        }),
      ]);

      let resolvedPositions = nextPositions;
      const targetPoolAsset = selectedPoolAsset || pendingDeposit?.poolAsset;
      if (
        targetPoolAsset &&
        !resolvedPositions.some((position) => position.pool === targetPoolAsset)
      ) {
        const fallback = await fetchLiquidityProviderFallback(
          targetPoolAsset,
          sessionAddresses,
          {
            mayanodeUrl: settings.mayanodeUrl,
            midgardUrl: settings.midgardUrl,
          },
        );
        resolvedPositions = mergeLiquidityPositionsWithFallback(
          resolvedPositions,
          fallback,
        );
      }

      setPools(nextPools);
      setPositions(resolvedPositions);
      setActivity(nextActivity);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshSelectedBalances() {
    if (!activeSession || !selectedPool) {
      setAssetBalance(null);
      setCacaoBalance(null);
      setBalanceError(null);
      setBalanceWarning(null);
      return;
    }

    const mayaAddress = activeSession.addresses[Chain.MayaChain];
    const assetChain = selectedPool.walletChain;
    const assetAddress = assetChain
      ? activeSession.addresses[assetChain]
      : undefined;

    setIsBalanceLoading(true);
    setBalanceError(null);
    setBalanceWarning(null);
    try {
      const [assetResponse, cacaoResponse] = await Promise.all([
        assetChain && assetAddress
          ? fetchAddressBalances({
              address: assetAddress,
              assetHints: selectedPool.tokenId
                ? [
                    {
                      decimals: selectedPool.decimals,
                      id: selectedPool.tokenId,
                      symbol: selectedPool.symbol,
                    },
                  ]
                : undefined,
              chain: assetChain,
              includeZeroBalances: true,
            })
          : Promise.resolve(null),
        mayaAddress
          ? fetchAddressBalances({
              address: mayaAddress,
              chain: Chain.MayaChain,
              includeZeroBalances: true,
            })
          : Promise.resolve(null),
      ]);

      setAssetBalance(
        findSelectedAssetBalance(assetResponse?.balances ?? [], selectedPool),
      );
      setCacaoBalance(
        cacaoResponse?.balances.find(
          (balance) =>
            balance.id === "cacao" || balance.symbol.toUpperCase() === "CACAO",
        ) ?? null,
      );
      const warningMessages = [
        ...(assetResponse?.warnings ?? []),
        ...(cacaoResponse?.warnings ?? []),
      ].map((warning) => warning.message);
      setBalanceWarning(
        warningMessages.length ? warningMessages.join(" ") : null,
      );
    } catch (error) {
      setBalanceWarning(null);
      setBalanceError((error as Error).message);
    } finally {
      setIsBalanceLoading(false);
    }
  }

  useEffect(() => {
    void refreshLiquidityData();
  }, [
    pendingDeposit?.poolAsset,
    selectedPoolAsset,
    sessionAddresses.join(","),
    settings.mayanodeUrl,
    settings.midgardUrl,
  ]);

  useEffect(() => {
    void refreshSelectedBalances();
  }, [activeSession?.id, selectedPool?.asset, balanceRefreshTick]);

  useEffect(() => {
    const pending = loadPendingSymmetricDeposit(activeSession?.id);
    setStoredPendingDeposit(pending);
    if (pending && !selectedPoolAsset) {
      setSelectedPoolAsset(pending.poolAsset);
    }
  }, [activeSession?.id, selectedPoolAsset]);

  useEffect(() => {
    if (
      !pendingDeposit ||
      pendingDeposit.source !== "recovered" ||
      !selectedPool ||
      selectedPool.asset !== pendingDeposit.poolAsset
    ) {
      return;
    }

    if (!assetAmount.trim()) {
      setAssetAmount(
        formatBaseUnits(
          pendingDeposit.assetAmountBaseUnits,
          selectedPool.decimals,
        ) || "",
      );
    }

    if (!cacaoAmount.trim()) {
      const assetValue = formatBaseUnits(
        pendingDeposit.assetAmountBaseUnits,
        selectedPool.decimals,
      );
      const estimated = syncSymmetricDepositAmounts({
        assetPrice: selectedPool.assetPrice,
        field: "asset",
        nextValue: assetValue || "",
      }).cacaoAmount;
      if (estimated) {
        setCacaoAmount(estimated);
      }
    }
  }, [assetAmount, cacaoAmount, pendingDeposit, selectedPool]);

  useEffect(() => {
    const initialPoolAsset = getInitialLiquidityPoolAsset(
      sortedPools,
      visiblePositions,
      pendingDeposit,
    );
    if (!selectedPoolAsset && initialPoolAsset) {
      setSelectedPoolAsset(initialPoolAsset);
    }
  }, [pendingDeposit, visiblePositions, selectedPoolAsset, sortedPools]);

  useEffect(() => {
    let cancelled = false;

    async function refreshLiquiditySummary() {
      if (!mayaAddress) {
        setLiquiditySummary(null);
        setLiquiditySummaryError(null);
        return;
      }

      setLiquiditySummaryError(null);
      try {
        const nextSummary =
          await fetchCacaotrackerLiquiditySummary(mayaAddress);
        if (!cancelled) {
          setLiquiditySummary(nextSummary);
        }
      } catch (error) {
        if (!cancelled) {
          setLiquiditySummary(null);
          setLiquiditySummaryError((error as Error).message);
        }
      }
    }

    void refreshLiquiditySummary();
    return () => {
      cancelled = true;
    };
  }, [balanceRefreshTick, mayaAddress]);

  useEffect(() => {
    let cancelled = false;

    async function refreshSelectedPoolAnalytics() {
      if (!mayaAddress || !selectedPool?.asset) {
        setLiquidityPoolDetail(null);
        setLiquidityPoolDetailError(null);
        return;
      }

      setLiquidityPoolDetailError(null);
      try {
        const nextDetail = await fetchCacaotrackerLiquidityPoolDetail(
          mayaAddress,
          selectedPool.asset,
        );
        if (!cancelled) {
          setLiquidityPoolDetail(nextDetail);
        }
      } catch (error) {
        if (!cancelled) {
          setLiquidityPoolDetail(null);
          setLiquidityPoolDetailError((error as Error).message);
        }
      }
    }

    void refreshSelectedPoolAnalytics();
    return () => {
      cancelled = true;
    };
  }, [balanceRefreshTick, mayaAddress, selectedPool?.asset]);

  async function connectPoolChain() {
    if (isViewOnly) {
      return;
    }

    const connectChain = selectedPool?.walletChain ?? Chain.MayaChain;
    await wallet
      .execute("accounts.connect", {
        sessionId: activeSession?.id,
        input: { chain: connectChain },
      })
      .catch((err) => {
        if (err instanceof WalletSessionNotFoundError) {
          navigate({
            to: "/vault-setup",
          });
        }
      });
  }

  async function trackLiquidityJourney(input: {
    action: "deposit" | "withdraw";
    title: string;
    chain: Chain;
    submit: (journeyId: string) => Promise<{ txHash: string | null }>;
    successMessage: string;
  }) {
    if (!activeSession) {
      return;
    }

    return trackTransactionJourney(wallet, {
      kind: "liquidity",
      title: input.title,
      sessionId: activeSession.id,
      source: activeSession.source,
      chain: input.chain,
      routePath: "/liquidity",
      analytics: {
        action: input.action,
        route: "/liquidity",
        subject: "liquidity",
      },
      steps: createExecutionJourneySteps({
        source: activeSession.source,
        finalLabel: "Liquidity Update Complete",
      }),
      run: async (journey) => {
        journey.activateStep("preparing", "Preparing liquidity transaction.");
        const result = await input.submit(journey.journeyId);
        journey.completeStep("preparing", "Liquidity transaction prepared.");
        if (activeSession.source === "extension") {
          journey.completeStep("provider", "Extension accepted the request.");
        } else {
          journey.completeStep("signing", "Vault signing complete.");
        }

        journey.setPrimaryTxHash(result.txHash);
        journey.completeStep(
          "broadcasting",
          result.txHash
            ? "Liquidity transaction broadcast submitted."
            : "Liquidity transaction submitted without a returned hash.",
        );
        journey.activateStep(
          "confirming",
          "Waiting for on-chain confirmation.",
        );

        const settlement = await waitForJourneyTransactionSettlement(wallet, {
          chain: input.chain,
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
              ? input.successMessage
              : settlement === "error"
                ? "Liquidity transaction failed on-chain."
                : settlement === "unconfirmed"
                  ? "Liquidity transaction submitted, but confirmation timed out."
                  : "Liquidity transaction submitted, but automatic tracking is unavailable.",
        });
        journey.complete(result, settlement);
        return result;
      },
    });
  }

  function handleAssetAmountChange(nextValue: string) {
    if (!selectedPool || depositMode !== "symmetric") {
      setAssetAmount(nextValue);
      return;
    }
    const next = syncSymmetricDepositAmounts({
      assetPrice: selectedPool.assetPrice,
      field: "asset",
      nextValue,
    });
    setAssetAmount(next.assetAmount);
    setCacaoAmount(next.cacaoAmount);
  }

  function handleCacaoAmountChange(nextValue: string) {
    if (!selectedPool || depositMode !== "symmetric") {
      setCacaoAmount(nextValue);
      return;
    }
    const next = syncSymmetricDepositAmounts({
      assetPrice: selectedPool.assetPrice,
      field: "cacao",
      nextValue,
    });
    setAssetAmount(next.assetAmount);
    setCacaoAmount(next.cacaoAmount);
  }

  async function handlePrimaryAction() {
    if (isViewOnly) {
      setSubmitError(VIEW_ONLY_IMPERSONATION_REASON);
      return;
    }

    if (!activeSession) {
      await connectPoolChain();
      return;
    }

    if (!selectedPool) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (activeTab === "deposit") {
        if (
          pendingDeposit &&
          pendingDeposit.sessionId === activeSession.id &&
          pendingDeposit.poolAsset === selectedPool.asset &&
          depositMode === "symmetric"
        ) {
          const resumedCacaoAmountBaseUnits =
            pendingDeposit.cacaoAmountBaseUnits || cacaoAmountBaseUnits;
          if (
            !resumedCacaoAmountBaseUnits ||
            resumedCacaoAmountBaseUnits === "0"
          ) {
            throw new Error(
              "Enter the CACAO amount needed to complete this symmetric deposit.",
            );
          }
          const steps = prepareLiquidityDepositSteps(wallet, {
            affiliate: {
              affiliateBps: pendingDeposit.interfaceAffiliateBps,
              affiliateName: INTERFACE_AFFILIATE_MAYANAME,
            },
            assetAmountBaseUnits: pendingDeposit.assetAmountBaseUnits,
            cacaoAmountBaseUnits: resumedCacaoAmountBaseUnits,
            mode: "symmetric",
            pool: selectedPool,
            sessionId: activeSession.id,
          }).steps;
          const cacaoStep = steps.find((step) => step.id === "cacao");
          if (!cacaoStep) {
            throw new Error(
              "Unable to restore the pending CACAO leg for this deposit.",
            );
          }
          await trackLiquidityJourney({
            action: "deposit",
            title: `Complete Symmetric Deposit: ${selectedPool.symbol}`,
            chain: cacaoStep.chain,
            submit: (journeyId) =>
              submitLiquidityDepositStep(wallet, {
                journeyId,
                sessionId: activeSession.id,
                step: cacaoStep,
              }),
            successMessage: "Symmetric deposit completed.",
          });
          clearPendingSymmetricDeposit();
          setStoredPendingDeposit(null);
          setAssetAmount("");
          setCacaoAmount("");
        } else {
          const steps = prepareLiquidityDepositSteps(wallet, {
            affiliate: {
              affiliateBps: INTERFACE_TRACKING_BPS,
              affiliateName: INTERFACE_AFFILIATE_MAYANAME,
            },
            assetAmountBaseUnits,
            cacaoAmountBaseUnits,
            mode: depositMode,
            pool: selectedPool,
            sessionId: activeSession.id,
          }).steps;

          if (depositMode === "symmetric") {
            const assetStep = steps.find((step) => step.id === "asset");
            if (!assetStep || !assetAmountBaseUnits || !cacaoAmountBaseUnits) {
              throw new Error("Unable to prepare a valid symmetric deposit.");
            }
            const nextPending: PendingSymmetricDeposit = {
              assetAmountBaseUnits,
              cacaoAmountBaseUnits,
              interfaceAffiliateBps: INTERFACE_TRACKING_BPS,
              poolAsset: selectedPool.asset,
              source: "stored",
              sessionId: activeSession.id,
            };
            await trackLiquidityJourney({
              action: "deposit",
              title: `Start Symmetric Deposit: ${selectedPool.symbol}`,
              chain: assetStep.chain,
              submit: (journeyId) =>
                submitLiquidityDepositStep(wallet, {
                  journeyId,
                  sessionId: activeSession.id,
                  step: assetStep,
                }),
              successMessage:
                "Asset leg confirmed. Resume the CACAO leg to finish the symmetric add.",
            });
            persistPendingSymmetricDeposit(nextPending);
            setStoredPendingDeposit(nextPending);
          } else {
            const activeStep = steps[0]!;
            await trackLiquidityJourney({
              action: "deposit",
              title:
                depositMode === "asset"
                  ? `Deposit ${selectedPool.symbol} Liquidity`
                  : "Deposit CACAO Liquidity",
              chain: activeStep.chain,
              submit: (journeyId) =>
                submitLiquidityDepositStep(wallet, {
                  journeyId,
                  sessionId: activeSession.id,
                  step: activeStep,
                }),
              successMessage: "Liquidity deposit confirmed on-chain.",
            });
            setAssetAmount("");
            setCacaoAmount("");
          }
        }
      } else {
        const isPendingCancel = pendingCancelMode !== null;
        const withdrawChain = isPendingCancel
          ? pendingCancelMode === "asset"
            ? (selectedPool.walletChain ?? Chain.MayaChain)
            : Chain.MayaChain
          : withdrawMode === "asset"
            ? (selectedPool.walletChain ?? Chain.MayaChain)
            : Chain.MayaChain;
        await trackLiquidityJourney({
          action: "withdraw",
          title: isPendingCancel
            ? `Cancel Pending Deposit: ${selectedPool.symbol}`
            : `Withdraw Liquidity: ${selectedPool.symbol}`,
          chain: withdrawChain,
          submit: (journeyId) =>
            submitLiquidityWithdraw(wallet, {
              basisPoints: isPendingCancel ? 10_000 : withdrawBasisPoints,
              journeyId,
              mode: pendingCancelMode ?? withdrawMode,
              pool: selectedPool,
              position: selectedPosition,
              sessionId: activeSession.id,
            }),
          successMessage: isPendingCancel
            ? "Pending deposit cancellation confirmed on-chain."
            : "Liquidity withdrawal confirmed on-chain.",
        });
        if (
          isPendingCancel &&
          storedPendingDeposit &&
          storedPendingDeposit.sessionId === activeSession.id &&
          storedPendingDeposit.poolAsset === selectedPool.asset
        ) {
          clearPendingSymmetricDeposit();
          setStoredPendingDeposit(null);
          setAssetAmount("");
          setCacaoAmount("");
        }
      }

      await Promise.all([refreshLiquidityData(), refreshSelectedBalances()]);
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-wrap flex flex-col items-center min-h-[85vh] px-4 relative z-0 pb-16 pt-8">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[30rem] h-[30rem] bg-[var(--maya-teal)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow" />
        <div
          className="absolute bottom-1/4 left-1/4 w-[30rem] h-[30rem] bg-[var(--cacao-neon)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="text-center mb-10 rise-in">
        <p className="island-kicker mb-2 flex justify-center items-center gap-2">
          <Droplet size={14} /> Maya Liquidity
        </p>
        <h1 className="terminal-title mb-3 text-4xl sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--sea-ink-soft)] font-black tracking-tight drop-shadow-sm">
          Liquidity Studio
        </h1>
        <p className="text-[var(--sea-ink-soft)]/90 max-w-xl mx-auto text-sm sm:text-base font-medium">
          Real-time LP positions, pool health, and guided Maya Protocol
          liquidity actions from your connected vault.
        </p>
      </div>

      <section className="w-full max-w-6xl mt-2 grid gap-8 lg:grid-cols-[440px_minmax(0,1fr)] items-start">
        <article
          className="glass-panel-strong p-2 sm:p-3 rise-in relative overflow-visible backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-[2.5rem] border border-[var(--line)]"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex justify-between items-center px-6 py-4">
            <div className="flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1 shadow-sm">
              <button
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === "deposit" ? "bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm" : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"}`}
                type="button"
                onClick={() => setActiveTab("deposit")}
              >
                Deposit
              </button>
              <button
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === "withdraw" ? "bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm" : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"}`}
                type="button"
                onClick={() => setActiveTab("withdraw")}
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

          <button
            className="w-[calc(100%-1rem)] mx-auto mt-2 rounded-[2rem] border border-[var(--line)] bg-[var(--bg-base)] p-5 text-left transition-all hover:border-[var(--sea-ink-soft)]/30 group block shadow-inner"
            type="button"
            onClick={() => setShowPoolModal(true)}
          >
            <div className="flex justify-between items-start mb-4">
              <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
                Selected Pool
              </span>
              {selectedPool && isStagedLiquidityPool(selectedPool) && (
                <PoolStatusBadge status={selectedPool.status} />
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-4">
                  <AssetIcon
                    assetId="cacao"
                    className="w-10 h-10 border border-[var(--line)] bg-[var(--surface)] shadow-sm"
                  />
                  <AssetIcon
                    assetId={selectedPool?.iconId ?? "maya"}
                    className="w-10 h-10 border-2 border-[var(--bg-base)] bg-[var(--surface)] shadow-sm"
                  />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--sea-ink)] group-hover:text-[var(--maya-teal)] transition-colors">
                    {selectedPool
                      ? `CACAO / ${selectedPool.symbol}`
                      : "Select a pool"}
                  </p>
                  <p className="text-xs font-medium text-[var(--sea-ink-soft)] mt-1">
                    {selectedPool
                      ? `${selectedPool.chainName} • ${formatPercent(selectedPool.apr)} APR`
                      : "Sync a pool list to begin"}
                  </p>
                </div>
              </div>
              <ArrowDownUp
                size={18}
                className="text-[var(--sea-ink-soft)] group-hover:text-[var(--sea-ink)] transition-colors"
              />
            </div>
          </button>

          <div className="px-3 mt-5 mb-2">
            <ModeSwitch<LiquidityDepositMode | LiquidityWithdrawMode>
              current={activeTab === "deposit" ? depositMode : withdrawMode}
              items={[
                { label: "Symmetric", value: "symmetric" },
                { label: "CACAO only", value: "cacao" },
                { label: "Asset only", value: "asset" },
              ]}
              onChange={(mode) =>
                activeTab === "deposit"
                  ? setDepositMode(mode as LiquidityDepositMode)
                  : setWithdrawMode(mode as LiquidityWithdrawMode)
              }
            />
          </div>

          {activeTab === "deposit" ? (
            <div className="flex flex-col gap-2 mt-2 px-2">
              <div
                className={`bg-[${depositMode === "cacao" ? "var(--bg-base)" : "var(--chip-bg)"}]/80 rounded-[2rem] p-5 sm:p-6 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group ${depositMode === "cacao" ? "opacity-50 grayscale" : ""}`}
              >
                <div className="flex justify-between mb-4">
                  <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
                    {selectedPool?.symbol ?? "Asset"} side
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <input
                    aria-label="Asset amount"
                    className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold"
                    inputMode="decimal"
                    placeholder="0.0"
                    disabled={depositMode === "cacao"}
                    value={assetAmount}
                    onChange={(event) =>
                      handleAssetAmountChange(event.target.value)
                    }
                  />
                  <div className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-strong)] border border-[var(--line)] rounded-full py-2.5 pl-2.5 pr-4 sm:pr-5 shadow-sm select-none">
                    <AssetIcon
                      assetId={selectedPool?.iconId ?? "maya"}
                      className="w-8 h-8 sm:w-9 sm:h-9 shadow-sm"
                    />
                    <span className="font-bold text-lg sm:text-xl tracking-tight text-[var(--sea-ink)] truncate max-w-[100px]">
                      {selectedPool?.symbol ?? "ASSET"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-4 mt-3 px-1">
                  <button
                    type="button"
                    disabled={depositMode === "cacao"}
                    className="text-xs font-medium text-[var(--sea-ink-soft)] flex items-center gap-1 cursor-pointer hover:text-[var(--maya-teal)] disabled:hover:text-[var(--sea-ink-soft)] transition-colors select-none"
                    onClick={() =>
                      handleAssetAmountChange(
                        assetBalance?.formattedAmount ?? "",
                      )
                    }
                  >
                    Balance:{" "}
                    <span className="font-bold text-[var(--sea-ink)]">
                      {isBalanceLoading
                        ? "syncing"
                        : (assetBalance?.formattedAmount ?? "0")}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex justify-center -my-3 relative z-10">
                <div className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] p-2.5 text-[var(--maya-teal)] shadow-sm">
                  <Droplet size={16} className="fill-current" />
                </div>
              </div>

              <div
                className={`bg-[${depositMode === "asset" ? "var(--bg-base)" : "var(--chip-bg)"}]/80 rounded-[2rem] p-5 sm:p-6 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group ${depositMode === "asset" ? "opacity-50 grayscale" : ""}`}
              >
                <div className="flex justify-between mb-4">
                  <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
                    CACAO side
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <input
                    aria-label="Cacao amount"
                    className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold"
                    inputMode="decimal"
                    placeholder="0.0"
                    disabled={depositMode === "asset"}
                    value={cacaoAmount}
                    onChange={(event) =>
                      handleCacaoAmountChange(event.target.value)
                    }
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
                  <button
                    type="button"
                    disabled={depositMode === "asset"}
                    className="text-xs font-medium text-[var(--sea-ink-soft)] flex items-center gap-1 cursor-pointer hover:text-[var(--cacao-neon)] disabled:hover:text-[var(--sea-ink-soft)] transition-colors select-none"
                    onClick={() =>
                      handleCacaoAmountChange(
                        cacaoBalance?.formattedAmount ?? "",
                      )
                    }
                  >
                    Balance:{" "}
                    <span className="font-bold text-[var(--sea-ink)]">
                      {isBalanceLoading
                        ? "syncing"
                        : (cacaoBalance?.formattedAmount ?? "0")}
                    </span>
                  </button>
                </div>
              </div>

              <div className="bg-[var(--bg-base)] rounded-[1.75rem] border border-[var(--line)] p-4 sm:p-5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]">
                      MayaZero Interface LP
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--sea-ink-soft)]">
                      Every deposit includes{" "}
                      <span className="font-mono text-[var(--sea-ink)]">
                        {INTERFACE_AFFILIATE_MAYANAME}
                      </span>{" "}
                      at 0 bps for tracking only. MayaZero attribution is kept
                      on the deposit without exposing any user-configurable fee.
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1 text-xs font-bold text-[var(--sea-ink)]">
                    0.00%
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Fixed at 0 bps for attribution
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-2 px-2">
              {pendingCancelMode ? (
                <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 border border-[var(--line)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]">
                      Pending Deposit Recovery
                    </span>
                    <span className="text-3xl font-bold text-[var(--maya-teal)]">
                      100%
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[var(--sea-ink-soft)]">
                    This action cancels the pending-only LP add and returns the{" "}
                    {pendingCancelMode === "asset"
                      ? selectedPool?.symbol ?? "asset"
                      : "CACAO"}{" "}
                    side in full.
                  </p>
                </div>
              ) : (
                <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 border border-[var(--line)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]">
                      Withdraw Share
                    </span>
                    <span className="text-3xl font-bold text-[var(--maya-teal)]">
                      {withdrawShare}%
                    </span>
                  </div>
                  <input
                    className="mt-6 w-full cursor-pointer accent-[var(--maya-teal)]"
                    max="100"
                    min="0"
                    step="1"
                    type="range"
                    value={withdrawShare}
                    onChange={(event) => setWithdrawShare(event.target.value)}
                  />
                </div>
              )}

              {selectedPosition && !pendingCancelMode ? (
                <div className="bg-[var(--bg-base)] rounded-[1.5rem] border border-[var(--line)] p-4 sm:p-5 text-sm">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)] mb-3">
                    Est. Outcome
                  </p>
                  <div className="grid gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sea-ink-soft)] font-medium">
                        Redeem CACAO
                      </span>
                      <span className="font-bold text-[var(--sea-ink)]">
                        {formatBaseUnits(
                          selectedPosition.cacaoRedeemValue,
                          10,
                        ) || "0"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sea-ink-soft)] font-medium">
                        Redeem Asset
                      </span>
                      <span className="font-bold text-[var(--sea-ink)]">
                        {selectedPool
                          ? formatBaseUnits(
                              selectedPosition.assetRedeemValue,
                              selectedPool.decimals,
                            ) || "0"
                          : selectedPosition.assetRedeemValue}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-4 px-3 flex flex-col gap-3">
            {pendingDeposit ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/10 p-3.5 text-xs text-[var(--sea-ink)] font-medium">
                <AlertCircle
                  size={14}
                  className="mt-0.5 shrink-0 text-[var(--maya-teal)]"
                />
                <p className="leading-snug">
                  Symmetric deposit pending for {pendingDeposit.poolAsset}.
                  Resume with the CACAO leg on the deposit tab or cancel it on
                  the withdraw tab to return the pending asset side.
                  {pendingDeposit.source === "recovered"
                    ? " Recovery was inferred from your on-chain LP state because the local pending record is missing."
                    : ` The stored ${INTERFACE_AFFILIATE_MAYANAME} affiliate remains tracking-only at 0%.`}
                </p>
              </div>
            ) : null}

            {!pendingDeposit && pendingCancelMode ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/10 p-3.5 text-xs text-[var(--sea-ink)] font-medium">
                <AlertCircle
                  size={14}
                  className="mt-0.5 shrink-0 text-[var(--maya-teal)]"
                />
                <p className="leading-snug">
                  Pending-only LP deposit detected for{" "}
                  {selectedPosition?.pool ?? selectedPool?.asset}. Use the
                  withdraw tab to cancel it and return the pending{" "}
                  {pendingCancelMode === "asset"
                    ? selectedPool?.symbol ?? "asset"
                    : "CACAO"}{" "}
                  side.
                </p>
              </div>
            ) : null}

            {actionState.note ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-500 font-medium">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="leading-snug">{actionState.note}</p>
              </div>
            ) : null}

            {feedbackBanner ? (
              <div
                className={
                  feedbackBanner.tone === "error"
                    ? "flex items-start gap-3 rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-400 font-medium"
                    : "flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-500 font-medium"
                }
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="leading-snug">{feedbackBanner.message}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 px-1 pb-1 flex justify-between gap-2">
            <div className="flex-1">
              {actionState.kind === "connect" ? (
                <button
                  className="w-full h-[60px] pb-1 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface)] hover:border-[var(--maya-teal)]/50 shadow-sm transition-all active:scale-[0.98]"
                  type="button"
                  onClick={connectPoolChain}
                >
                  Connect Vault
                </button>
              ) : (
                <button
                  className="w-full h-[60px] relative overflow-hidden text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-gradient-to-r from-[var(--maya-teal)] to-cyan-500 text-[var(--bg-base)] shadow-[0_4px_20px_rgba(79,209,197,0.4)] hover:shadow-[0_6px_24px_rgba(79,209,197,0.6)] hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed group/dep"
                  disabled={actionState.disabled || isSubmitting}
                  type="button"
                  onClick={() => void handlePrimaryAction()}
                >
                  <span className="flex items-center justify-center gap-2 relative top-[-1px] z-10">
                    {isSubmitting ? (
                      <Loader2
                        size={18}
                        className="animate-spin text-[var(--bg-base)]/90"
                      />
                    ) : (
                      <RefreshCw
                        size={18}
                        className="group-hover/dep:rotate-45 transition-transform text-[var(--bg-base)]/90"
                      />
                    )}
                    <span className="text-[var(--bg-base)] drop-shadow-sm">
                      {actionState.label}
                    </span>
                  </span>
                </button>
              )}
            </div>

            <button
              className="w-16 h-[60px] flex items-center justify-center rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink-soft)] hover:text-[var(--maya-teal)] hover:border-[var(--maya-teal)]/30 hover:bg-[var(--surface)] shadow-sm transition-all active:scale-95"
              type="button"
              onClick={() => {
                void refreshLiquidityData();
                void refreshSelectedBalances();
              }}
            >
              <RefreshCw
                size={20}
                className={isLoading || isBalanceLoading ? "animate-spin" : ""}
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
                  Pool Positions
                </h2>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--chip-bg)] border border-[var(--line)] shadow-sm">
                <Wallet size={20} className="text-[var(--sea-ink-soft)]" />
              </div>
            </div>

            {loadError ? (
              <div className="p-5 rounded-3xl border border-rose-500/20 bg-rose-500/10 mb-5">
                <p className="font-semibold text-rose-500 text-lg">
                  Failed to load positions
                </p>
                <p className="mt-2 text-sm text-rose-400 font-medium">
                  {loadError}
                </p>
                <button
                  className="secondary-btn mt-5 px-5 py-2.5 text-sm font-semibold shadow-sm"
                  type="button"
                  onClick={() => void refreshLiquidityData()}
                >
                  Retry Connect
                </button>
              </div>
            ) : null}

            {!isPowerUser && hiddenStagedPoolCount > 0 ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-[13px] text-amber-500 font-medium mb-5">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <p className="leading-snug">
                  {hiddenStagedPoolCount} staged pool
                  {hiddenStagedPoolCount === 1 ? "" : "s"} hidden in normie
                  mode. Enable Pro Mode to inspect them.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3">
              {isLoading ? (
                <div className="empty-state bg-[var(--bg-base)] border border-[var(--line)] rounded-3xl py-12 mb-2">
                  <Loader2
                    size={32}
                    className="animate-spin text-[var(--maya-teal)] mb-4"
                  />
                  <p className="font-semibold text-lg text-[var(--sea-ink)]">
                    Loading positions...
                  </p>
                </div>
              ) : visiblePositions.length ? (
                visiblePositions.map((position) => {
                  const pool = visiblePools.find(
                    (candidate) => candidate.asset === position.pool,
                  );
                  const isSelected = selectedPool?.asset === position.pool;
                  return (
                    <button
                      key={`${position.pool}-${position.matchingAddresses.join("-")}`}
                      className={`rounded-[1.75rem] border p-4 sm:p-5 text-left transition-all ${isSelected ? "border-[var(--maya-teal)] bg-[var(--surface-strong)] shadow-[0_0_20px_rgba(79,209,197,0.15)] ring-1 ring-[var(--maya-teal)]" : "border-[var(--line)] bg-[var(--bg-base)] hover:border-[var(--line-strong)] hover:bg-[var(--chip-bg)]/50"}`}
                      type="button"
                      onClick={() => setSelectedPoolAsset(position.pool)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-3">
                            <AssetIcon
                              assetId="cacao"
                              className="w-10 h-10 border border-[var(--line)] bg-[var(--surface)]"
                            />
                            <AssetIcon
                              assetId={pool?.iconId ?? "maya"}
                              className="w-10 h-10 border-2 border-[var(--bg-base)] bg-[var(--surface)]"
                            />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-bold text-[var(--sea-ink)] tracking-tight">
                                {pool?.symbol
                                  ? `CACAO / ${pool.symbol}`
                                  : position.pool}
                              </p>
                              {pool && isStagedLiquidityPool(pool) ? (
                                <PoolStatusBadge status={pool.status} />
                              ) : null}
                            </div>
                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]">
                              {position.state}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${position.state === "active" ? "bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]" : "bg-amber-500/10 text-amber-500"}`}
                        >
                          {position.units !== "0" ? "LP active" : "Pending"}
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <MetricTile
                          label="LP units"
                          value={formatCompactNumber(position.units)}
                          size="sm"
                        />
                        <MetricTile
                          label="Redeem CACAO"
                          value={
                            formatBaseUnits(position.cacaoRedeemValue, 10) ||
                            "0"
                          }
                          size="sm"
                        />
                        <MetricTile
                          label="Redeem Asset"
                          value={
                            pool
                              ? formatBaseUnits(
                                  position.assetRedeemValue,
                                  pool.decimals,
                                ) || "0"
                              : position.assetRedeemValue
                          }
                          size="sm"
                        />
                        <MetricTile
                          label="Wallet Address"
                          value={shortenAddress(
                            position.cacaoAddress ??
                              position.assetAddress ??
                              "n/a",
                          )}
                          size="sm"
                        />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="empty-state bg-[var(--bg-base)] border border-[var(--line)] rounded-3xl py-12 px-6 shadow-inner mx-1">
                  <div className="w-16 h-16 rounded-full bg-[var(--surface-strong)] flex items-center justify-center border border-[var(--line)] shadow-sm mb-5">
                    <Wallet size={28} className="text-[var(--maya-teal)]" />
                  </div>
                  <p className="font-bold text-[var(--sea-ink)] text-xl tracking-tight">
                    No LP positions found
                  </p>
                  <p className="text-sm font-medium text-[var(--sea-ink-soft)] max-w-sm mt-3 text-center leading-relaxed">
                    {hiddenStagedPoolCount > 0 && !isPowerUser
                      ? "Connected wallet addresses do not match any non-staged liquidity positions."
                      : "Connected wallet addresses do not currently match any liquidity positions."}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section
            className="glass-panel-strong p-6 sm:p-8 rise-in"
            style={{ animationDelay: "300ms" }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="w-full flex items-center justify-between">
                <div>
                  <p className="island-kicker mb-1">Global Analytics</p>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
                    Health & Activity
                  </h2>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--chip-bg)] border border-[var(--line)] shadow-sm">
                  <CheckCircle2
                    size={20}
                    className="text-[var(--sea-ink-soft)]"
                  />
                </div>
              </div>
            </div>

            {liquiditySummary ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
                <MetricTile
                  label="Tracked Positions"
                  value={String(liquiditySummary.ilSummary.position_count)}
                  size="sm"
                />
                <MetricTile
                  label="Total IL"
                  value={formatUsdCompact(
                    liquiditySummary.ilSummary.total_il_amount_usd,
                  )}
                  size="sm"
                />
                <MetricTile
                  label="ILP Eligible"
                  value={formatUsdCompact(
                    liquiditySummary.ilSummary.total_ilp_eligible_usd,
                  )}
                  size="sm"
                />
                <MetricTile
                  label="30D Rewards"
                  value={formatUsdCompact(
                    liquiditySummary.rewardsByPool.reduce(
                      (sum, item) => sum + item.total_usd,
                      0,
                    ),
                  )}
                  size="sm"
                  highlight
                />
              </div>
            ) : null}

            {liquiditySummaryError ? (
              <div className="mb-6 flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-500 font-medium">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="leading-snug">{liquiditySummaryError}</p>
              </div>
            ) : null}

            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-4">
                  Selected Pool Metrics
                </h3>
                {selectedPool ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricTile
                        label="APR"
                        value={
                          liquidityPoolDetail
                            ? formatAnalyticsPercent(
                                liquidityPoolDetail.analytics.apr,
                              )
                            : formatPercent(selectedPool.apr)
                        }
                        highlight
                      />
                      <MetricTile
                        label="Depth Usd"
                        value={formatUsdCompact(selectedPool.depthUsd)}
                        size="sm"
                      />
                      <MetricTile
                        label="24h volume"
                        value={
                          liquidityPoolDetail
                            ? formatUsdCompact(
                                liquidityPoolDetail.analytics.volume24hUSD,
                              )
                            : formatUsdCompact(
                                Number(
                                  formatBaseUnits(selectedPool.volume24h, 8),
                                ),
                              )
                        }
                        size="sm"
                      />
                      <MetricTile
                        label="Status"
                        value={
                          selectedPool.actionAvailability?.lpActionsPaused
                            ? "Paused"
                            : selectedPool.status
                        }
                        size="sm"
                      />
                    </div>

                    {liquidityPoolDetail ? (
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <MetricTile
                          label="LUVI"
                          value={liquidityPoolDetail.analytics.luvi.toFixed(2)}
                          size="sm"
                        />
                        <MetricTile
                          label="24h Fees"
                          value={formatUsdCompact(
                            liquidityPoolDetail.analytics.feesEarned24hUSD,
                          )}
                          size="sm"
                        />
                        <MetricTile
                          label="Net Earnings"
                          value={formatUsdCompact(
                            liquidityPoolDetail.analytics.netEarnings24hUSD,
                          )}
                          size="sm"
                        />
                        <MetricTile
                          label="IL Protection"
                          value={formatUsdCompact(
                            liquidityPoolDetail.analytics
                              .ilProtectionPaid24hUSD,
                          )}
                          size="sm"
                        />
                      </div>
                    ) : null}

                    {liquidityPoolDetailError ? (
                      <div className="mb-6 flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-500 font-medium">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <p className="leading-snug">
                          {liquidityPoolDetailError}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="h-32 flex items-center justify-center text-sm font-medium text-[var(--sea-ink-soft)] bg-[var(--bg-base)] border border-[var(--line)] rounded-2xl mb-6">
                    Select a pool to view health.
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-4">
                  Recent LP Activity
                </h3>
                <div className="bg-[var(--chip-bg)]/80 rounded-[1.75rem] border border-[var(--line)] p-4">
                  <div className="flex flex-col gap-2">
                    {selectedActivity.length ? (
                      selectedActivity.map((item) => (
                        <div
                          key={`${item.txHash ?? item.timestamp}-${item.type}`}
                          className="flex justify-between items-center bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-3 group hover:border-[var(--sea-ink-soft)]/30 transition-colors"
                        >
                          <div>
                            <p className="font-bold text-[var(--sea-ink)] capitalize text-sm">
                              {item.type}
                            </p>
                            <p className="text-[10px] text-[var(--sea-ink-soft)] font-mono break-all font-bold tracking-wide mt-0.5 max-w-[120px] sm:max-w-[150px] truncate">
                              {item.memo ?? "No memo"}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <p
                                className={`text-sm font-bold uppercase ${item.type === "deposit" ? "text-[var(--maya-teal)]" : "text-amber-500"}`}
                              >
                                {item.status}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-sm font-medium text-[var(--sea-ink-soft)]">
                        No tracked LP activity yet.
                      </div>
                    )}
                  </div>
                </div>

                {liquidityPoolDetail?.ilAnalysis ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MetricTile
                      label="Pool IL"
                      value={formatUsdCompact(
                        liquidityPoolDetail.ilAnalysis.impermanentLoss
                          .amountUSD,
                      )}
                      size="sm"
                    />
                    <MetricTile
                      label="Coverage"
                      value={`${liquidityPoolDetail.ilAnalysis.protection.coveragePercent.toFixed(0)}%`}
                      size="sm"
                    />
                    <MetricTile
                      label="Days In Pool"
                      value={String(
                        liquidityPoolDetail.ilAnalysis.protection.daysInPool,
                      )}
                      size="sm"
                    />
                    <MetricTile
                      label="Rank"
                      value={
                        liquidityPoolDetail.comparison
                          ? `#${liquidityPoolDetail.comparison.rank}`
                          : "n/a"
                      }
                      size="sm"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </section>

      <SelectionModal
        isOpen={showPoolModal}
        onClose={() => setShowPoolModal(false)}
        title="Select Liquidity Pool"
        items={sortedPools.map((pool) => ({
          balanceRaw: visiblePositions.some(
            (position) => position.pool === pool.asset,
          )
            ? "1"
            : "0",
          chainBadge: pool.chainTicker,
          iconMain: "cacao",
          iconSub: pool.iconId,
          id: pool.asset,
          label: `CACAO / ${pool.symbol}`,
          priceUsd: pool.assetPriceUsd,
          statusBadge: isStagedLiquidityPool(pool) ? "Staged" : undefined,
          subtitle: `${formatPercent(pool.apr)} • ${formatUsdCompact(pool.depthUsd)} depth`,
        }))}
        onSelect={(id) => setSelectedPoolAsset(id)}
      />
    </main>
  );
}
function ModeSwitch<T extends string>(props: {
  current: T;
  items: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.items.map((item) => (
        <button
          key={item.value}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${props.current === item.value ? "border-[var(--maya-teal)] bg-[var(--maya-teal)]/10 text-[var(--sea-ink)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)]"}`}
          type="button"
          onClick={() => props.onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function findSelectedAssetBalance(
  balances: AddressBalanceAsset[],
  pool: LiquidityPool,
): AddressBalanceAsset | null {
  return (
    balances.find((balance) => {
      if (pool.tokenId) {
        return balance.id.toLowerCase() === pool.tokenId.toLowerCase();
      }
      return (
        balance.isNative ||
        balance.symbol.toUpperCase() === pool.symbol.toUpperCase()
      );
    }) ?? null
  );
}

function loadPendingSymmetricDeposit(
  sessionId: string | undefined,
): PendingSymmetricDeposit | null {
  if (!sessionId || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PENDING_DEPOSIT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingSymmetricDeposit;
    if (parsed.sessionId !== sessionId) {
      return null;
    }
    return {
      ...parsed,
      interfaceAffiliateBps: INTERFACE_TRACKING_BPS,
      source: "stored",
    };
  } catch {
    return null;
  }
}

function persistPendingSymmetricDeposit(value: PendingSymmetricDeposit): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      PENDING_DEPOSIT_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    // ignored
  }
}

function clearPendingSymmetricDeposit(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(PENDING_DEPOSIT_STORAGE_KEY);
  } catch {
    // ignored
  }
}

export function sortLiquidityPools(
  pools: LiquidityPool[],
  positions: LiquidityPosition[],
): LiquidityPool[] {
  const positionMap = new Map(
    positions.map((position) => [position.pool, position]),
  );
  return [...pools].sort((left, right) => {
    const leftPosition = positionMap.get(left.asset);
    const rightPosition = positionMap.get(right.asset);
    const leftWeight = leftPosition
      ? leftPosition.state === "active"
        ? 3
        : 2
      : 0;
    const rightWeight = rightPosition
      ? rightPosition.state === "active"
        ? 3
        : 2
      : 0;
    if (leftWeight !== rightWeight) {
      return rightWeight - leftWeight;
    }
    if (left.isActionable !== right.isActionable) {
      return left.isActionable ? -1 : 1;
    }
    if (left.depthUsd !== right.depthUsd) {
      return right.depthUsd - left.depthUsd;
    }
    return right.asset.localeCompare(left.asset);
  });
}

export function filterVisibleLiquidityPools(
  pools: LiquidityPool[],
  isPowerUser: boolean,
): LiquidityPool[] {
  if (isPowerUser) {
    return pools;
  }

  return pools.filter((pool) => !isStagedLiquidityPool(pool));
}

export function getInitialLiquidityPoolAsset(
  pools: LiquidityPool[],
  positions: LiquidityPosition[],
  pendingDeposit: PendingSymmetricDeposit | null,
): string {
  if (pendingDeposit) {
    return pendingDeposit.poolAsset;
  }
  const pendingPosition = positions.find(
    (position) => position.state === "pending",
  );
  if (pendingPosition) {
    return pendingPosition.pool;
  }
  const activePosition = positions.find(
    (position) => position.state === "active",
  );
  return activePosition?.pool ?? pools[0]?.asset ?? "";
}

export function inferRecoverablePendingSymmetricDeposit(
  sessionId: string | undefined,
  positions: LiquidityPosition[],
): PendingSymmetricDeposit | null {
  if (!sessionId) {
    return null;
  }

  const candidate = positions.find(
    (position) =>
      position.state === "pending" &&
      position.pendingAsset !== "0" &&
      position.pendingCacao === "0",
  );
  if (!candidate) {
    return null;
  }

  return {
    assetAmountBaseUnits: candidate.pendingAsset,
    cacaoAmountBaseUnits: "",
    interfaceAffiliateBps: INTERFACE_TRACKING_BPS,
    poolAsset: candidate.pool,
    source: "recovered",
    sessionId,
  };
}

export function getPendingLiquidityCancelMode(
  position: LiquidityPosition | null | undefined,
): "asset" | "cacao" | null {
  if (
    !position ||
    position.state !== "pending" ||
    position.units !== "0" ||
    (position.pendingAsset === "0" && position.pendingCacao === "0")
  ) {
    return null;
  }

  if (position.pendingAsset !== "0" && position.pendingCacao === "0") {
    return "asset";
  }

  return "cacao";
}

export function syncSymmetricDepositAmounts(input: {
  assetPrice: string;
  field: "asset" | "cacao";
  nextValue: string;
}): { assetAmount: string; cacaoAmount: string } {
  const price = Number(input.assetPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return input.field === "asset"
      ? { assetAmount: input.nextValue, cacaoAmount: "" }
      : { assetAmount: "", cacaoAmount: input.nextValue };
  }
  if (!input.nextValue.trim()) {
    return { assetAmount: "", cacaoAmount: "" };
  }
  const numeric = Number(input.nextValue);
  if (!Number.isFinite(numeric)) {
    return input.field === "asset"
      ? { assetAmount: input.nextValue, cacaoAmount: "" }
      : { assetAmount: "", cacaoAmount: input.nextValue };
  }
  return input.field === "asset"
    ? {
        assetAmount: input.nextValue,
        cacaoAmount: trimNumericString((numeric * price).toFixed(8)),
      }
    : {
        assetAmount: trimNumericString((numeric / price).toFixed(8)),
        cacaoAmount: input.nextValue,
      };
}

export function getLiquidityPrimaryAction(input: {
  activeTab: "deposit" | "withdraw";
  assetAmountBaseUnits: string | null;
  assetBalanceBaseUnits: string | null;
  cacaoAmountBaseUnits: string | null;
  cacaoBalanceBaseUnits: string | null;
  depositMode: LiquidityDepositMode;
  depositSupportReason?: string;
  hasPendingCancelPosition?: boolean;
  hasPosition: boolean;
  hasSession: boolean;
  isViewOnly?: boolean;
  isSubmitting: boolean;
  pendingDepositMatches: boolean;
  pendingDepositStoredAmount?: boolean;
  pool: LiquidityPool | null;
  withdrawBasisPoints: number;
  withdrawSupportReason?: string;
}): LiquidityActionState {
  if (input.isViewOnly) {
    return {
      disabled: true,
      kind: "submit",
      label: "View Only",
      note: VIEW_ONLY_IMPERSONATION_REASON,
    };
  }

  if (!input.hasSession) {
    return { disabled: false, kind: "connect", label: "Connect Vault" };
  }
  if (!input.pool) {
    return { disabled: true, kind: "submit", label: "Select Pool" };
  }
  if (input.pool.status.toLowerCase() !== "available") {
    return {
      disabled: true,
      kind: "submit",
      label: "Pool Unavailable",
      note: `The selected pool is ${input.pool.status.toLowerCase()}.`,
    };
  }
  if (input.pool.actionAvailability?.halted) {
    return {
      disabled: true,
      kind: "submit",
      label: "Chain Halted",
      note: "Inbound actions are currently halted for the selected chain.",
    };
  }
  if (input.pool.actionAvailability?.lpActionsPaused) {
    return {
      disabled: true,
      kind: "submit",
      label: "LP Actions Paused",
      note: "Liquidity actions are paused for the selected inbound chain.",
    };
  }
  if (input.isSubmitting) {
    return {
      disabled: true,
      kind: "submit",
      label:
        input.activeTab === "deposit"
          ? "Submitting Deposit"
          : "Submitting Withdrawal",
    };
  }

  if (input.activeTab === "deposit") {
    if (input.depositSupportReason) {
      return {
        disabled: true,
        kind: "submit",
        label: "Deposit Unavailable",
        note: input.depositSupportReason,
      };
    }
    if (input.pendingDepositMatches) {
      if (
        !input.pendingDepositStoredAmount &&
        (!input.cacaoAmountBaseUnits || input.cacaoAmountBaseUnits === "0")
      ) {
        return { disabled: true, kind: "resume", label: "Enter CACAO Amount" };
      }
      return { disabled: false, kind: "resume", label: "Submit CACAO Leg" };
    }
    if (input.depositMode !== "cacao") {
      if (!input.assetAmountBaseUnits || input.assetAmountBaseUnits === "0") {
        return {
          disabled: true,
          kind: "submit",
          label: `Enter ${input.pool.symbol} Amount`,
        };
      }
      if (
        input.assetBalanceBaseUnits &&
        BigInt(input.assetAmountBaseUnits) > BigInt(input.assetBalanceBaseUnits)
      ) {
        return {
          disabled: true,
          kind: "submit",
          label: `Insufficient ${input.pool.symbol}`,
        };
      }
    }
    if (input.depositMode !== "asset") {
      if (!input.cacaoAmountBaseUnits || input.cacaoAmountBaseUnits === "0") {
        return { disabled: true, kind: "submit", label: "Enter CACAO Amount" };
      }
      if (
        input.cacaoBalanceBaseUnits &&
        BigInt(input.cacaoAmountBaseUnits) > BigInt(input.cacaoBalanceBaseUnits)
      ) {
        return { disabled: true, kind: "submit", label: "Insufficient CACAO" };
      }
    }
    return {
      disabled: false,
      kind: "submit",
      label:
        input.depositMode === "symmetric"
          ? "Start Guided Deposit"
          : "Submit Deposit",
    };
  }

  if (input.withdrawSupportReason) {
    return {
      disabled: true,
      kind: "submit",
      label: "Withdraw Unavailable",
      note: input.withdrawSupportReason,
    };
  }
  if (!input.hasPosition) {
    return { disabled: true, kind: "submit", label: "No Position Selected" };
  }
  if (input.hasPendingCancelPosition) {
    return {
      disabled: false,
      kind: "submit",
      label: "Cancel Pending Deposit",
    };
  }
  if (
    !Number.isInteger(input.withdrawBasisPoints) ||
    input.withdrawBasisPoints <= 0
  ) {
    return { disabled: true, kind: "submit", label: "Set Withdrawal Share" };
  }
  return { disabled: false, kind: "submit", label: "Submit Withdrawal" };
}

export function getLiquidityFeedbackBanner(input: {
  balanceError?: string | null;
  balanceWarning?: string | null;
  submitError?: string | null;
}): LiquidityFeedbackBanner | null {
  if (input.submitError) {
    return {
      tone: "error",
      message: input.submitError,
    };
  }

  if (input.balanceError) {
    return {
      tone: "error",
      message: input.balanceError,
    };
  }

  if (input.balanceWarning) {
    return {
      tone: "warning",
      message: input.balanceWarning,
    };
  }

  return null;
}

function formatPercent(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(2)}%` : "n/a";
}

function formatAnalyticsPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(2)}%`;
}

function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0";
  }
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
    notation: value >= 1000000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

function formatCompactNumber(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    notation: numeric >= 1000000 ? "compact" : "standard",
  }).format(numeric);
}

function PoolStatusBadge(props: { status: string }) {
  return (
    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">
      {props.status}
    </span>
  );
}

function trimNumericString(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function isStagedLiquidityPool(pool: LiquidityPool): boolean {
  return pool.status.trim().toLowerCase() === "staged";
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
        className={`font-bold text-[var(--sea-ink)] truncate ${size === "sm" ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"} ${highlight ? "text-[var(--maya-teal)]" : ""}`}
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
