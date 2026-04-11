import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import {
  ArrowDownUp,
  Settings,
  Wallet,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  useActiveWalletSession,
  useMayaWalletActions,
  useMayaWalletState,
  fetchAddressBalances,
  createExecutionJourneySteps,
  createJourneyStep,
  getSwapExecutionSupport,
  submitSwap,
  trackTransactionJourney,
  useWalletBalanceRefreshTick,
  type AddressBalanceAsset,
  type SwapExecutionStatus,
  waitForJourneyTransactionSettlement,
  WalletSessionNotFoundError,
} from "#/wallet";
import {
  AssetIcon,
  protocolAssets as hardcodedAssets,
  resolveSessionAddress,
  SelectionModal,
  shortenAddress,
  type ProtocolAsset,
} from "#/components/ProtocolPrimitives";
import { usePreferences } from "#/provider/PreferencesProvider";
import { useSettings } from "#/provider/SettingsProvider";
import {
  quoteSwap as runQuoteSwap,
  type SwapQuoteEngineResult,
} from "#/lib/swap-quote-engine";
import {
  INTERFACE_AFFILIATE_MAYANAME,
  hasManualAffiliateOverride,
  isSupportReferrerEnabledForCurrentReferral,
  normalizeSupportReferrerBps,
  resolveSwapAffiliateDrafts,
} from "#/lib/swap-affiliates";
import {
  getMayaAssetChainTicker,
  getMayaAssetTicker,
  matchesMayaAssetDenominator,
} from "#/lib/maya-asset-shorthand";
import { buildPageSeoHead } from "#/lib/seo";

const chainPrefixMap: Record<string, Chain> = {
  ARB: Chain.Arbitrum,
  BASE: Chain.Base,
  BTC: Chain.Bitcoin,
  BCH: Chain.BitcoinCash,
  DASH: Chain.Dash,
  DOGE: Chain.Dogecoin,
  ETH: Chain.Ethereum,
  KUJI: Chain.Kujira,
  LTC: Chain.Litecoin,
  MAYA: Chain.MayaChain,
  THOR: Chain.THORChain,
  ZEC: Chain.Zcash,
};

const fallbackDecimals: Record<string, number> = {
  ETH: 18,
  BASE: 18,
  ARB: 18,
  BTC: 8,
  DOGE: 8,
  LTC: 8,
  BCH: 8,
  DASH: 8,
  ZEC: 8,
  THOR: 8,
  MAYA: 10,
  KUJI: 6,
};

const MAX_TOTAL_AFFILIATES = 5;
const RESERVED_INTERFACE_AFFILIATE_SLOTS = 1;
const MAX_MANUAL_AFFILIATES =
  MAX_TOTAL_AFFILIATES - RESERVED_INTERFACE_AFFILIATE_SLOTS;

function useMayaAssets() {
  const [assets, setAssets] = useState<ProtocolAsset[]>(hardcodedAssets);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchPools() {
      setIsLoading(true);
      try {
        const res = await fetch("https://midgard.mayachain.info/v2/pools");
        const data = (await res.json()) as any[];

        const activePools = data.filter((p) => p.status === "available");
        let cacaoUsdPrice = "0";

        const usdcPool = activePools.find(
          (p) => p.asset.includes("USDC") || p.asset.includes("USDT"),
        );
        if (usdcPool && usdcPool.assetPriceUSD && usdcPool.assetPrice) {
          cacaoUsdPrice = (
            Number(usdcPool.assetPriceUSD) / Number(usdcPool.assetPrice)
          ).toString();
        }

        const dynamicAssets = activePools
          .map((pool) => {
            const assetString = pool.asset;
            const [chainPrefix, rest] = assetString.split(".");
            const [ticker, tokenId] = (rest || "").split("-");

            const chain = chainPrefixMap[chainPrefix.toUpperCase()];

            if (!chain) return null;

            const id = (tokenId || ticker).toLowerCase();
            const decimals = pool.nativeDecimal
              ? parseInt(pool.nativeDecimal)
              : (fallbackDecimals[chainPrefix.toUpperCase()] ?? 18);

            const existing = hardcodedAssets.find(
              (a) => a.mayaAsset === assetString,
            );
            if (existing) {
              return {
                ...existing,
                decimals: decimals,
                priceUsd: pool.assetPriceUSD,
              };
            }

            return {
              id,
              label: ticker,
              chain,
              ticker,
              decimals: decimals,
              mayaAsset: assetString,
              tokenId,
              blurb: `${chainPrefix} Network`,
              priceUsd: pool.assetPriceUSD,
            };
          })
          .filter(Boolean) as ProtocolAsset[];

        const cacaoAsset = hardcodedAssets.find((a) => a.id === "cacao")!;
        const cacaoWithPrice = { ...cacaoAsset, priceUsd: cacaoUsdPrice };

        const unique = new Map<string, ProtocolAsset>();
        unique.set(cacaoAsset.mayaAsset, cacaoWithPrice);

        for (const da of dynamicAssets) {
          if (!unique.has(da.mayaAsset)) {
            unique.set(da.mayaAsset, da);
          }
        }

        for (const ha of hardcodedAssets) {
          if (!unique.has(ha.mayaAsset)) {
            unique.set(ha.mayaAsset, ha);
          }
        }

        setAssets(Array.from(unique.values()));
      } catch (err) {
        console.error("Failed to fetch pools:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPools();
  }, []);

  return { assets, isLoading };
}

export const Route = createFileRoute("/swap")({
  head: () =>
    buildPageSeoHead({
      title: "Swap",
      description:
        "Quote cross-chain swaps across Maya Protocol assets and prepare vault-signed routes from a single MayaZero terminal.",
    }),
  component: SwapTerminalPage,
});

function SwapTerminalPage() {
  const wallet = useMayaWalletActions();
  const navigate = useNavigate();
  const state = useMayaWalletState();
  const activeSession = useActiveWalletSession();
  const balanceRefreshTick = useWalletBalanceRefreshTick();
  const { isPowerUser } = usePreferences();
  const settings = useSettings();

  const { assets, isLoading: isAssetsLoading } = useMayaAssets();

  const [swapForm, setSwapForm] = useState({
    fromAssetId: "cacao",
    toAssetId: "eth",
    amount: "",
    slippageBps: "50",
    autoApprove: true,
    streamingEnabled: true,
    streamingInterval: "3",
    streamingQuantity: "0",
    affiliateDrafts: Array.from({ length: MAX_MANUAL_AFFILIATES }, () => ({
      value: "",
      bps: "",
    })),
    customRecipient: "",
    customRefund: "",
  });

  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [swapQuote, setSwapQuote] = useState<SwapQuoteEngineResult | null>(
    null,
  );
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SwapExecutionStatus | null>(
    null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fromAsset = assets.find((asset) => asset.id === swapForm.fromAssetId);
  const toAsset = assets.find((asset) => asset.id === swapForm.toAssetId);

  const actionChain =
    state.activeChain ??
    fromAsset?.chain ??
    activeSession?.chains[0] ??
    Chain.MayaChain;

  const fromAddress = fromAsset
    ? resolveSessionAddress(activeSession, fromAsset.chain)
    : "";
  const toAddress = toAsset
    ? resolveSessionAddress(activeSession, toAsset.chain)
    : "";

  const [sessionBalances, setSessionBalances] = useState<AddressBalanceAsset[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadBalances() {
      if (!activeSession) {
        setSessionBalances([]);
        return;
      }
      let allAssets: AddressBalanceAsset[] = [];
      await Promise.all(
        activeSession.chains.map(async (walletChain) => {
          const address = activeSession.addresses[walletChain];
          if (!address) return;
          try {
            const response = await fetchAddressBalances({
              chain: walletChain,
              address,
              assetHints: assets
                .filter((asset) => asset.chain === walletChain)
                .map((asset) => ({
                  id: asset.tokenId ?? asset.id,
                  symbol: asset.ticker,
                  name: asset.label,
                  decimals: asset.decimals,
                })),
              includeZeroBalances: false,
            });
            if (cancelled) return;
            allAssets = [...allAssets, ...response.balances];
            setSessionBalances([...allAssets]);
          } catch (err) {
            console.log("Balance fetch skipped for", walletChain);
          }
        }),
      );
    }
    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [activeSession, balanceRefreshTick]);

  const hasStoredReferral = Boolean(settings.referralMayaName.trim());
  const manualAffiliateOverride = hasManualAffiliateOverride(
    swapForm.affiliateDrafts,
  );
  const isSupportingReferrer =
    isSupportReferrerEnabledForCurrentReferral(settings);
  const supportReferrerBps = normalizeSupportReferrerBps(
    settings.supportReferrerBps,
  );
  const isSupportingMayaZero = settings.interfaceSupportSwapEnabled;
  const interfaceSupportSwapBps = normalizeSupportReferrerBps(
    settings.interfaceSupportSwapBps,
  );
  const showMayaZeroBanner = !settings.interfaceSupportBannerDismissed;
  const effectiveAffiliateDrafts = resolveSwapAffiliateDrafts(
    settings,
    swapForm.affiliateDrafts,
  );

  let lastFilledAffiliate = -1;
  for (let i = 0; i < MAX_MANUAL_AFFILIATES; i++) {
    if (
      swapForm.affiliateDrafts[i]?.value ||
      swapForm.affiliateDrafts[i]?.bps
    ) {
      lastFilledAffiliate = i;
    }
  }
  const visibleAffiliatesCount = Math.min(
    MAX_MANUAL_AFFILIATES,
    lastFilledAffiliate + 2,
  );

  const [isQuoting, setIsQuoting] = useState(false);

  function getAssetBalance(
    targetAsset: ProtocolAsset | undefined | null,
    balances: AddressBalanceAsset[],
  ) {
    if (!targetAsset || !balances.length) return "0";
    const match = balances.find((b) => {
      if (b.chain !== targetAsset.chain) return false;
      if (targetAsset.tokenId) {
        return b.id.toLowerCase() === targetAsset.tokenId.toLowerCase();
      }
      if (b.isNative) {
        return (
          b.symbol.toUpperCase() === targetAsset.ticker.toUpperCase() ||
          targetAsset.ticker.toUpperCase().includes(b.symbol.toUpperCase()) ||
          b.symbol.toUpperCase().includes(targetAsset.ticker.toUpperCase())
        );
      }
      return b.symbol.toUpperCase() === targetAsset.ticker.toUpperCase();
    });
    return match ? match.formattedAmount : "0";
  }

  const fromBalance = getAssetBalance(fromAsset, sessionBalances);
  const toBalance = getAssetBalance(toAsset, sessionBalances);

  const canQuoteSwap =
    Boolean(
      activeSession &&
      fromAsset &&
      toAsset &&
      fromAddress &&
      (toAddress || swapForm.customRecipient?.trim()),
    ) &&
    Number(swapForm.amount) > 0 &&
    swapForm.fromAssetId !== swapForm.toAssetId;

  const swapExecutionSupport = fromAsset
    ? getSwapExecutionSupport(wallet, {
        fromAsset,
        quote: swapQuote,
        sessionId: activeSession?.id,
      })
    : {
        supported: false,
        reason: "Select an asset to continue.",
      };
  const primaryAction = getSwapPrimaryAction({
    hasActiveSession: Boolean(activeSession),
    hasQuote: Boolean(swapQuote),
    isQuoting,
    isSubmitting,
    quoteError: Boolean(quoteError),
    canSubmitSwap: swapExecutionSupport.supported,
    submitStatus,
  });

  function resetQuoteState() {
    setSwapQuote(null);
    setQuoteError(null);
    setSubmitStatus(null);
  }

  function updateSwapForm(
    updater: (current: typeof swapForm) => typeof swapForm,
  ) {
    setSubmitError(null);
    setSwapForm((current) => updater(current));
  }

  useEffect(() => {
    if (!canQuoteSwap) {
      if (swapQuote || quoteError) {
        resetQuoteState();
      }
      return;
    }

    let isActive = true;
    const timer = setTimeout(async () => {
      setIsQuoting(true);
      setQuoteError(null);

      try {
        const shouldUseStreaming = !isPowerUser || swapForm.streamingEnabled;
        const result = await runQuoteSwap({
          wallet,
          settings,
          sessionId: activeSession!.id,
          fromAsset: fromAsset!,
          toAsset: toAsset!,
          fromAddress,
          toAddress: swapForm.customRecipient?.trim() || toAddress,
          amount: swapForm.amount,
          slippageBps: swapForm.slippageBps,
          affiliateDrafts: effectiveAffiliateDrafts,
          customRefundAddress: swapForm.customRefund?.trim(),
          streamingInterval: shouldUseStreaming
            ? swapForm.streamingInterval
            : undefined,
          streamingQuantity: shouldUseStreaming
            ? swapForm.streamingQuantity
            : undefined,
        });
        if (isActive) {
          setSwapQuote(result);
        }
      } catch (error) {
        if (isActive) {
          setSwapQuote(null);
          setQuoteError((error as Error).message);
        }
      } finally {
        if (isActive) {
          setIsQuoting(false);
        }
      }
    }, 600);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [
    canQuoteSwap,
    activeSession?.id,
    fromAsset?.id,
    toAsset?.id,
    fromAddress,
    toAddress,
    swapForm.amount,
    swapForm.slippageBps,
    swapForm.streamingEnabled,
    swapForm.streamingInterval,
    swapForm.streamingQuantity,
    JSON.stringify(effectiveAffiliateDrafts),
    settings.interfaceSupportSwapEnabled,
    settings.interfaceSupportSwapBps,
    swapForm.customRecipient,
    swapForm.customRefund,
  ]);

  async function connectActiveChain() {
    await wallet
      .execute("accounts.connect", {
        input: { chain: actionChain },
      })
      .catch((err) => {
        if (err instanceof WalletSessionNotFoundError) {
          navigate({
            to: "/vault-setup",
          });
        }
      });
  }

  async function submitCurrentSwap() {
    if (
      !activeSession ||
      !fromAsset ||
      !toAsset ||
      !fromAddress ||
      !(toAddress || swapForm.customRecipient?.trim()) ||
      !swapQuote
    ) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitStatus("refreshing");

    try {
      const shouldUseStreaming = !isPowerUser || swapForm.streamingEnabled;
      const freshQuote = await runQuoteSwap({
        wallet,
        settings,
        sessionId: activeSession.id,
        fromAsset,
        toAsset,
        fromAddress,
        toAddress: swapForm.customRecipient?.trim() || toAddress,
        amount: swapForm.amount,
        slippageBps: swapForm.slippageBps,
        affiliateDrafts: effectiveAffiliateDrafts,
        customRefundAddress: swapForm.customRefund?.trim(),
        streamingInterval: shouldUseStreaming
          ? swapForm.streamingInterval
          : undefined,
        streamingQuantity: shouldUseStreaming
          ? swapForm.streamingQuantity
          : undefined,
      });
      setSwapQuote(freshQuote);

      if (freshQuote.route !== "maya") {
        throw new Error(
          "Only Maya-native quotes can be executed in this flow.",
        );
      }

      const executionSupport = getSwapExecutionSupport(wallet, {
        fromAsset,
        quote: freshQuote,
        sessionId: activeSession.id,
      });
      const journeySource = activeSession.source;
      const journeySteps = [
        ...createExecutionJourneySteps({
          source: journeySource,
          includeApproval: executionSupport.mode === "erc20-router",
          finalLabel: "Swap Complete",
        }),
        ...(freshQuote.route === "maya" && freshQuote.inboundAddress
          ? [createJourneyStep("routing", "Protocol Route")]
          : []),
      ];

      await trackTransactionJourney(wallet, {
        kind: "swap",
        title: `Swap ${fromAsset.ticker} to ${toAsset.ticker}`,
        sessionId: activeSession.id,
        source: journeySource,
        chain: fromAsset.chain,
        routePath: "/swap",
        analytics: {
          action: "submit",
          route: "/swap",
          subject: "swap",
          has_referral: hasStoredReferral,
        },
        steps: journeySteps,
        run: async (journey) => {
          journey.activateStep(
            "preparing",
            "Refreshing quote and execution route.",
          );
          if (freshQuote.inboundAddress) {
            journey.updateStep("routing", {
              status: "success",
              message: freshQuote.inboundAddress,
            });
          }

          const result = await submitSwap(wallet, {
            amount: swapForm.amount,
            fromAsset,
            journeyId: journey.journeyId,
            quote: freshQuote,
            sessionId: activeSession.id,
            onStatusChange: (status) => {
              setSubmitStatus(status);
              if (status === "approving") {
                journey.activateStep(
                  "approval",
                  "Submit the token approval request.",
                );
              } else if (status === "waiting-approval") {
                journey.updateStep("approval", {
                  status: "active",
                  message: "Approval submitted. Waiting for confirmation.",
                });
              } else if (status === "submitting") {
                journey.completeStep(
                  "preparing",
                  "Quote locked and execution started.",
                );
                if (journeySource === "extension") {
                  journey.activateStep(
                    "provider",
                    "Approve the transaction in the extension.",
                  );
                }
              }
            },
          });

          if (result.approvalTxHash) {
            journey.setSecondaryTxHash(result.approvalTxHash);
            journey.updateStep("approval", {
              status: "success",
              txHash: result.approvalTxHash,
              message: "Approval confirmed. Submitting the swap transaction.",
            });
          }

          if (journeySource === "extension") {
            journey.completeStep(
              "provider",
              "Extension accepted the transaction request.",
            );
            journey.activateStep("broadcasting", "Broadcast submitted.");
          } else {
            journey.completeStep("signing", "Signing complete.");
            journey.activateStep(
              "broadcasting",
              "Broadcasting signed transaction.",
            );
          }

          journey.setPrimaryTxHash(result.txHash);
          journey.completeStep(
            "broadcasting",
            result.txHash
              ? "Broadcast submitted."
              : "Broadcast submitted without a returned hash.",
          );
          journey.activateStep(
            "confirming",
            "Waiting for on-chain confirmation.",
          );

          const settlement = await waitForJourneyTransactionSettlement(wallet, {
            chain: fromAsset.chain,
            journeyId: journey.journeyId,
            primary: true,
            sessionId: activeSession.id,
            stepKey: "confirming",
            txHash: result.txHash,
          });

          if (settlement === "success") {
            journey.completeStep("complete", "Swap confirmed on-chain.");
            journey.complete(result);
          } else {
            journey.updateStep("complete", {
              status:
                settlement === "unconfirmed"
                  ? "unconfirmed"
                  : settlement === "submitted_no_hash"
                    ? "attention"
                    : "error",
              message:
                settlement === "unconfirmed"
                  ? "Swap submitted, but confirmation timed out."
                  : settlement === "submitted_no_hash"
                    ? "Swap submitted, but automatic tracking is unavailable."
                    : "Swap failed on-chain.",
            });
            journey.complete(result, settlement);
          }

          return result;
        },
      });
      setSwapForm((current) => ({
        ...current,
        amount: "",
      }));
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setIsSubmitting(false);
      setSubmitStatus(null);
    }
  }

  function flipSwapPair() {
    updateSwapForm((current) => ({
      ...current,
      fromAssetId: current.toAssetId,
      toAssetId: current.fromAssetId,
    }));
  }

  return (
    <main className="page-wrap flex flex-col items-center justify-center min-h-[85vh] px-4 relative z-0">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] bg-[var(--maya-teal)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow" />
        <div
          className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-[var(--cacao-neon)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="text-center mb-8 rise-in">
        <h1 className="terminal-title mb-3 text-4xl sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--sea-ink-soft)] font-black tracking-tight drop-shadow-sm">
          Exchange
        </h1>
        <p className="text-[var(--sea-ink-soft)]/90 max-w-sm mx-auto text-sm sm:text-base font-medium">
          Lightning fast cross-chain swaps directly from your Vault.
        </p>
      </div>

      <article
        className="glass-panel-strong w-full max-w-lg p-2 sm:p-3 rise-in relative overflow-visible backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-[2.5rem] border border-[var(--line)]"
        style={{ animationDelay: "100ms" }}
      >
        <div className="flex justify-between items-center px-6 py-4">
          <span className="font-bold text-[var(--sea-ink)] tracking-wide">
            Swap
          </span>
          <div className="flex items-center gap-3">
            {isAssetsLoading && (
              <div className="flex items-center gap-1.5 text-[var(--maya-teal)] text-xs font-semibold px-2 py-1 rounded-full bg-[var(--maya-teal)]/10 border border-[var(--maya-teal)]/20 shadow-sm animate-pulse">
                <Loader2 size={12} className="animate-spin" />
                <span>Syncing Pools</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 mb-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group">
          <div className="flex justify-between mb-4">
            <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
              Pay
            </span>
            <button
              onClick={!fromAddress ? connectActiveChain : undefined}
              className={`text-[11px] font-bold text-[var(--sea-ink-soft)] flex items-center gap-1.5 bg-[var(--surface-strong)] px-2.5 py-1 rounded-full border border-[var(--line)] transition-colors ${!fromAddress ? "cursor-pointer hover:bg-[var(--surface)] hover:text-[var(--maya-teal)] hover:border-[var(--maya-teal)]/30" : "cursor-default"}`}
            >
              <Wallet size={12} />
              {fromAddress ? shortenAddress(fromAddress) : "Connect Vault"}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <input
              aria-label="Swap amount"
              type="number"
              placeholder="0.0"
              className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold"
              value={swapForm.amount}
              onChange={(e) => {
                updateSwapForm((prev) => ({ ...prev, amount: e.target.value }));
              }}
            />

            <button
              className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-strong)] hover:bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--maya-teal)]/50 rounded-full py-2.5 pl-2.5 pr-4 sm:pr-5 shadow-md hover:shadow-lg transition-all active:scale-95 group/btn"
              onClick={() => setShowFromModal(true)}
            >
              <AssetIcon
                assetId={
                  fromAsset?.ticker.toLowerCase() || swapForm.fromAssetId
                }
                className="w-8 h-8 sm:w-9 sm:h-9 shadow-sm group-hover/btn:rotate-6 transition-transform"
              />
              <span className="font-bold text-lg sm:text-xl tracking-tight text-[var(--sea-ink)]">
                {fromAsset?.ticker ?? "Select"}
              </span>
              <ChevronDown
                size={16}
                className="text-[var(--sea-ink-soft)] group-hover/btn:text-[var(--maya-teal)] transition-colors"
              />
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 mt-3 px-1">
            <span className="text-xs font-medium text-[var(--sea-ink-soft)]">
              {fromAsset?.priceUsd && swapForm.amount
                ? `$${(Number(swapForm.amount || "0") * Number(fromAsset.priceUsd)).toFixed(2)}`
                : ""}
            </span>
            {fromAsset && (
              <span
                className="text-xs font-medium text-[var(--sea-ink-soft)] flex items-center gap-1 cursor-pointer hover:text-[var(--maya-teal)] transition-colors select-none"
                onClick={() =>
                  updateSwapForm((curr) => ({ ...curr, amount: fromBalance }))
                }
              >
                Balance:{" "}
                <span className="font-bold text-[var(--sea-ink)]">
                  {Number(fromBalance) > 0
                    ? Number(fromBalance)
                        .toFixed(4)
                        .replace(/\.?0+$/, "")
                    : "0.00"}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="relative h-1 flex justify-center items-center z-10 my-2">
          <button
            onClick={flipSwapPair}
            className="absolute bg-[var(--surface)] border-[3px] border-[var(--surface-strong)] p-2.5 rounded-2xl text-[var(--sea-ink)] hover:text-[var(--bg-base)] hover:bg-[var(--maya-teal)] hover:border-[var(--maya-teal)] hover:scale-110 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.15)] group"
          >
            <ArrowDownUp
              size={18}
              className="group-hover:rotate-180 transition-transform duration-500"
            />
          </button>
        </div>

        <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 mt-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group">
          <div className="flex justify-between mb-4">
            <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
              Receive
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <input
              aria-label="Quote output"
              type="text"
              placeholder="0.0"
              className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold cursor-not-allowed pr-2"
              value={formatBaseUnits(
                swapQuote?.estimatedOutput,
                swapQuote?.outputDecimals ?? toAsset?.decimals,
              )}
              readOnly
            />

            <button
              className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-strong)] hover:bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--maya-teal)]/50 rounded-full py-2.5 pl-2.5 pr-4 sm:pr-5 shadow-md hover:shadow-lg transition-all active:scale-95 group/btn"
              onClick={() => setShowToModal(true)}
            >
              <AssetIcon
                assetId={toAsset?.ticker.toLowerCase() || swapForm.toAssetId}
                className="w-8 h-8 sm:w-9 sm:h-9 shadow-sm group-hover/btn:rotate-6 transition-transform"
              />
              <span className="font-bold text-lg sm:text-xl tracking-tight text-[var(--sea-ink)]">
                {toAsset?.ticker ?? "Select"}
              </span>
              <ChevronDown
                size={16}
                className="text-[var(--sea-ink-soft)] group-hover/btn:text-[var(--maya-teal)] transition-colors"
              />
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 mt-3 px-1">
            <span className="text-xs font-medium text-[var(--sea-ink-soft)]">
              {toAsset?.priceUsd && swapQuote?.estimatedOutput
                ? `$${(Number(formatBaseUnits(swapQuote.estimatedOutput, swapQuote.outputDecimals ?? toAsset.decimals)) * Number(toAsset.priceUsd)).toFixed(2)}`
                : ""}
            </span>
            {toAsset && (
              <span className="text-xs font-medium text-[var(--sea-ink-soft)] flex items-center gap-1 select-none">
                Balance:{" "}
                <span className="font-bold text-[var(--sea-ink)]">
                  {Number(toBalance) > 0
                    ? Number(toBalance)
                        .toFixed(4)
                        .replace(/\.?0+$/, "")
                    : "0.00"}
                </span>
              </span>
            )}
          </div>
        </div>

        {showMayaZeroBanner ? (
          <div className="mt-3 bg-[var(--chip-bg)]/50 backdrop-blur-md rounded-[1.75rem] border border-[var(--line)] p-4 sm:p-5 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5 flex-1 pr-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--sea-ink-soft)]">
                    Support MayaZero
                  </span>
                  <span className="text-sm font-semibold text-[var(--sea-ink)] truncate">
                    {INTERFACE_AFFILIATE_MAYANAME}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] leading-relaxed text-[var(--sea-ink-soft)]/90 mt-1">
                  MayaZero attribution is always attached with 0 bps for
                  tracking. Enable support to raise the interface fee above 0%.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <div
                  className={`mt-1 flex-shrink-0 flex items-center justify-between bg-[var(--bg-base)] border rounded-xl px-3 py-2 transition-all cursor-pointer ${
                    isSupportingMayaZero
                      ? "border-[var(--maya-teal)] shadow-[0_0_0_1px_rgba(79,209,197,0.3)]"
                      : "border-[var(--line)] hover:border-[var(--line-strong)]"
                  }`}
                  onClick={() =>
                    settings.updateInterfaceSupportSettings({
                      interfaceSupportSwapEnabled: !isSupportingMayaZero,
                    })
                  }
                >
                  <span
                    className={`text-xs font-semibold mr-3 transition-colors ${
                      isSupportingMayaZero
                        ? "text-[var(--sea-ink)]"
                        : "text-[var(--sea-ink-soft)]"
                    }`}
                  >
                    {isSupportingMayaZero ? "Enabled" : "Tracking only"}
                  </span>
                  <div
                    className={`w-8 h-4.5 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${
                      isSupportingMayaZero
                        ? "bg-[var(--maya-teal)]"
                        : "bg-[var(--sea-ink-soft)]/30"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${
                        isSupportingMayaZero
                          ? "translate-x-3.5"
                          : "translate-x-0"
                      }`}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-2.5 py-2 text-xs font-semibold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                  onClick={() =>
                    settings.updateInterfaceSupportSettings({
                      interfaceSupportBannerDismissed: true,
                    })
                  }
                >
                  <X size={14} />
                  Dismiss
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--line)]/50 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--sea-ink-soft)]">
                  Interface Fee
                </span>
                <span className="text-sm font-semibold text-[var(--sea-ink)]">
                  {(
                    Number(
                      isSupportingMayaZero ? interfaceSupportSwapBps : "0",
                    ) / 100
                  ).toFixed(2)}
                  %
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="500"
                step="1"
                className="w-full accent-[var(--maya-teal)]"
                value={interfaceSupportSwapBps}
                onChange={(event) =>
                  settings.updateInterfaceSupportSettings({
                    interfaceSupportSwapBps: event.target.value,
                  })
                }
              />
              <p className="text-[10px] leading-relaxed text-[var(--sea-ink-soft)]/80">
                Disabling support keeps the fixed {INTERFACE_AFFILIATE_MAYANAME}{" "}
                entry at 0 bps so swaps remain attributable without charging an
                interface fee.
              </p>
            </div>
          </div>
        ) : null}

        {hasStoredReferral ? (
          <div className="mt-3 bg-[var(--chip-bg)]/50 backdrop-blur-md rounded-[1.75rem] border border-[var(--line)] p-4 sm:p-5 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5 flex-1 pr-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--sea-ink-soft)]">
                    Support Referrer
                  </span>
                  <span className="text-sm font-semibold text-[var(--sea-ink)] truncate">
                    {settings.referralMayaName}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] leading-relaxed text-[var(--sea-ink-soft)]/90 mt-1">
                  When enabled, a chosen percentage is attached as an affiliate
                  fee to your swaps to support your referrer. The default
                  remains 0%.
                </p>
              </div>
              <div
                className={`mt-1 flex-shrink-0 flex items-center justify-between bg-[var(--bg-base)] border rounded-xl px-3 py-2 transition-all ${
                  manualAffiliateOverride
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                } ${
                  isSupportingReferrer && !manualAffiliateOverride
                    ? "border-[var(--maya-teal)] shadow-[0_0_0_1px_rgba(79,209,197,0.3)]"
                    : "border-[var(--line)] hover:border-[var(--line-strong)]"
                }`}
                onClick={() => {
                  if (!manualAffiliateOverride) {
                    settings.updateSupportReferrerSettings({
                      supportReferrerEnabled: !isSupportingReferrer,
                      supportReferrerForMayaName:
                        settings.referralMayaName.trim(),
                    });
                  }
                }}
              >
                <span
                  className={`text-xs font-semibold mr-3 transition-colors ${
                    isSupportingReferrer
                      ? "text-[var(--sea-ink)]"
                      : "text-[var(--sea-ink-soft)]"
                  }`}
                >
                  {isSupportingReferrer ? "Enabled" : "Disabled"}
                </span>
                <div
                  className={`w-8 h-4.5 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${
                    isSupportingReferrer
                      ? "bg-[var(--maya-teal)]"
                      : "bg-[var(--sea-ink-soft)]/30"
                  }`}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${
                      isSupportingReferrer ? "translate-x-3.5" : "translate-x-0"
                    }`}
                  />
                </div>
              </div>
            </div>

            {isSupportingReferrer && !manualAffiliateOverride && (
              <div className="mt-4 pt-4 border-t border-[var(--line)]/50 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--sea-ink-soft)]">
                    Amount
                  </span>
                  <span className="text-sm font-semibold text-[var(--sea-ink)]">
                    {(Number(supportReferrerBps) / 100).toFixed(2)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="500"
                  step="1"
                  className="w-full accent-[var(--maya-teal)]"
                  value={supportReferrerBps}
                  onChange={(event) =>
                    settings.updateSupportReferrerSettings({
                      supportReferrerBps: event.target.value,
                      supportReferrerForMayaName:
                        settings.referralMayaName.trim(),
                    })
                  }
                />
              </div>
            )}

            {manualAffiliateOverride && (
              <p className="mt-3 text-xs text-amber-500/90 leading-relaxed bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                Advanced pro settings are overriding this simple toggle.
              </p>
            )}
          </div>
        ) : null}

        {isPowerUser && (
          <div className="w-full mt-3 px-2">
            <div
              className="flex justify-center items-center cursor-pointer group py-2"
              onClick={() => setShowSettings(!showSettings)}
            >
              <div className="bg-[var(--chip-bg)] hover:bg-[var(--surface)] rounded-full px-4 py-1.5 flex items-center gap-2 border border-transparent group-hover:border-[var(--line)] transition-all">
                <Settings
                  size={14}
                  className={`text-[var(--sea-ink-soft)] transition-colors duration-500 ease-out ${showSettings ? "rotate-90 text-[var(--maya-teal)]" : "group-hover:text-[var(--maya-teal)]"}`}
                />
                <span
                  className={`text-[11px] uppercase font-bold text-[var(--sea-ink-soft)] transition-colors ${showSettings ? "text-[var(--maya-teal)]" : "group-hover:text-[var(--maya-teal)]"}`}
                >
                  Pro Settings
                </span>
                {showSettings ? (
                  <ChevronUp size={14} className="text-[var(--maya-teal)]" />
                ) : (
                  <ChevronDown
                    size={14}
                    className="text-[var(--sea-ink-soft)] group-hover:text-[var(--maya-teal)] transition-colors"
                  />
                )}
              </div>
            </div>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${showSettings ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}
            >
              <div className="p-5 sm:p-6 bg-[var(--surface)]/80 backdrop-blur-sm border border-[var(--line)] rounded-[1.75rem] shadow-inner mb-2 space-y-6">
                <div className="grid grid-cols-2 gap-5">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                      Max Slippage
                    </span>
                    <div className="relative">
                      <input
                        aria-label="Max slippage bps"
                        type="number"
                        className="w-full bg-[var(--bg-base)] border border-[var(--line)] rounded-xl pl-4 pr-12 py-3 text-sm font-semibold text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all"
                        value={swapForm.slippageBps}
                        onChange={(e) =>
                          updateSwapForm((current) => ({
                            ...current,
                            slippageBps: e.target.value,
                          }))
                        }
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--sea-ink-soft)] pointer-events-none">
                        bps
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                      Auto Approve
                    </span>
                    <div
                      className={`flex-1 flex items-center justify-between bg-[var(--bg-base)] border rounded-xl px-4 py-3 cursor-pointer transition-all ${swapForm.autoApprove ? "border-[var(--maya-teal)] shadow-[0_0_0_1px_rgba(79,209,197,0.3)]" : "border-[var(--line)] hover:border-[var(--line-strong)]"}`}
                      onClick={() =>
                        updateSwapForm((current) => ({
                          ...current,
                          autoApprove: !current.autoApprove,
                        }))
                      }
                    >
                      <span
                        className={`text-sm font-semibold transition-colors ${swapForm.autoApprove ? "text-[var(--sea-ink)]" : "text-[var(--sea-ink-soft)]"}`}
                      >
                        {swapForm.autoApprove ? "Enabled" : "Disabled"}
                      </span>
                      <div
                        className={`w-9 h-5 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${swapForm.autoApprove ? "bg-[var(--maya-teal)]" : "bg-[var(--sea-ink-soft)]/30"}`}
                      >
                        <div
                          className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${swapForm.autoApprove ? "translate-x-3.5" : "translate-x-0"}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-5">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                      Streaming
                    </span>
                    <div
                      className={`flex-1 flex items-center justify-between bg-[var(--bg-base)] border rounded-xl px-4 py-3 cursor-pointer transition-all ${swapForm.streamingEnabled ? "border-[var(--maya-teal)] shadow-[0_0_0_1px_rgba(79,209,197,0.3)]" : "border-[var(--line)] hover:border-[var(--line-strong)]"}`}
                      onClick={() =>
                        updateSwapForm((current) => ({
                          ...current,
                          streamingEnabled: !current.streamingEnabled,
                        }))
                      }
                    >
                      <span
                        className={`text-sm font-semibold transition-colors ${swapForm.streamingEnabled ? "text-[var(--sea-ink)]" : "text-[var(--sea-ink-soft)]"}`}
                      >
                        {swapForm.streamingEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <div
                        className={`w-9 h-5 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${swapForm.streamingEnabled ? "bg-[var(--maya-teal)]" : "bg-[var(--sea-ink-soft)]/30"}`}
                      >
                        <div
                          className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${swapForm.streamingEnabled ? "translate-x-3.5" : "translate-x-0"}`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                      Interval
                    </span>
                    <div className="relative">
                      <input
                        aria-label="Streaming interval"
                        type="number"
                        min="1"
                        className="w-full bg-[var(--bg-base)] border border-[var(--line)] rounded-xl pl-4 pr-12 py-3 text-sm font-semibold text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all disabled:opacity-50"
                        value={swapForm.streamingInterval}
                        disabled={!swapForm.streamingEnabled}
                        onChange={(e) =>
                          updateSwapForm((current) => ({
                            ...current,
                            streamingInterval: e.target.value,
                          }))
                        }
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--sea-ink-soft)] pointer-events-none">
                        blk
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                      Quantity
                    </span>
                    <div className="relative">
                      <input
                        aria-label="Streaming quantity"
                        type="number"
                        min="0"
                        className="w-full bg-[var(--bg-base)] border border-[var(--line)] rounded-xl pl-4 pr-12 py-3 text-sm font-semibold text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all disabled:opacity-50"
                        value={swapForm.streamingQuantity}
                        disabled={!swapForm.streamingEnabled}
                        onChange={(e) =>
                          updateSwapForm((current) => ({
                            ...current,
                            streamingQuantity: e.target.value,
                          }))
                        }
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--sea-ink-soft)] pointer-events-none">
                        auto
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-5 border-t border-[var(--line)]/50">
                  <div className="flex flex-col gap-1 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                        Custom Routing Addresses
                      </span>
                      <span className="text-[10px] font-bold text-[var(--maya-teal)] bg-[var(--maya-teal)]/10 px-2 py-0.5 rounded-md border border-[var(--maya-teal)]/20 shadow-sm">
                        Adv.
                      </span>
                    </div>
                    <span className="text-[10px] leading-tight text-[var(--sea-ink-soft)]/70">
                      Overrides the default connected vault route.
                    </span>
                  </div>
                  <div className="grid gap-3 mb-5">
                    <input
                      aria-label="Custom Recipient"
                      type="text"
                      className="bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-sm md:text-base font-medium text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all placeholder-[var(--sea-ink-soft)]/40 text-ellipsis"
                      placeholder={`Recipient Address (${toAsset?.chain || "Dynamic"})`}
                      value={swapForm.customRecipient}
                      onChange={(e) =>
                        updateSwapForm((current) => ({
                          ...current,
                          customRecipient: e.target.value,
                        }))
                      }
                    />
                    <input
                      aria-label="Custom Refund"
                      type="text"
                      className="bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-sm md:text-base font-medium text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all placeholder-[var(--sea-ink-soft)]/40 text-ellipsis"
                      placeholder={`Refund Address (${fromAsset?.chain || "Dynamic"})`}
                      value={swapForm.customRefund}
                      onChange={(e) =>
                        updateSwapForm((current) => ({
                          ...current,
                          customRefund: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="pt-5 border-t border-[var(--line)]/50">
                  <div className="flex flex-col gap-1 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                        Affiliate Addresses & Fees
                      </span>
                      <span className="text-[10px] font-bold text-[var(--maya-teal)] bg-[var(--maya-teal)]/10 px-2 py-0.5 rounded-md border border-[var(--maya-teal)]/20 shadow-sm">
                        Max 4 manual + m0
                      </span>
                    </div>
                    <span className="text-[10px] leading-tight text-[var(--sea-ink-soft)]/70">
                      Configure up to 4 manual MAYA affiliate addresses or
                      MAYANames. MayaZero is always attached first, and referral
                      support may add one more automatic slot.
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {swapForm.affiliateDrafts
                      .slice(0, visibleAffiliatesCount)
                      .map((draft, index) => {
                        return (
                          <div
                            key={`affiliate-${index}`}
                            className="grid grid-cols-[minmax(0,1fr)_100px] sm:grid-cols-[minmax(0,1fr)_120px] gap-3"
                          >
                            <input
                              aria-label={`Affiliate ${index + 1} value`}
                              type="text"
                              className="bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-sm md:text-base font-medium text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all text-ellipsis placeholder-[var(--sea-ink-soft)]/40"
                              placeholder={
                                index === 0
                                  ? "Address / MAYAName"
                                  : "Optional next affiliate"
                              }
                              value={draft.value}
                              onChange={(event) =>
                                updateSwapForm((current) => {
                                  const newVal = event.target.value;
                                  return {
                                    ...current,
                                    affiliateDrafts:
                                      current.affiliateDrafts.map(
                                        (entry, entryIndex) =>
                                          entryIndex === index
                                            ? {
                                                ...entry,
                                                value: newVal,
                                                ...(newVal === "" && !entry.bps
                                                  ? { bps: "" }
                                                  : {}),
                                              }
                                            : entry,
                                      ),
                                  };
                                })
                              }
                            />
                            <div className="relative">
                              <input
                                aria-label={`Affiliate ${index + 1} bps`}
                                type="number"
                                className="w-full bg-[var(--bg-base)] border border-[var(--line)] rounded-xl pl-3 pr-8 py-2.5 text-sm md:text-base font-medium text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all placeholder-[var(--sea-ink-soft)]/40"
                                placeholder="0"
                                value={draft.bps}
                                onChange={(event) =>
                                  updateSwapForm((current) => {
                                    return {
                                      ...current,
                                      affiliateDrafts:
                                        current.affiliateDrafts.map(
                                          (entry, entryIndex) =>
                                            entryIndex === index
                                              ? {
                                                  ...entry,
                                                  bps: event.target.value,
                                                }
                                              : entry,
                                        ),
                                    };
                                  })
                                }
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs font-bold text-[var(--sea-ink-soft)] pointer-events-none">
                                bps
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 px-1 pb-1">
          {primaryAction.kind === "connect" ? (
            <button
              className="w-full py-4.5 sm:py-5 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface)] hover:border-[var(--maya-teal)]/50 shadow-sm transition-all active:scale-[0.98]"
              onClick={connectActiveChain}
            >
              Connect Vault
            </button>
          ) : primaryAction.kind === "submit" ? (
            <button
              className="w-full py-4.5 sm:py-5 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-gradient-to-r from-[var(--maya-teal)] to-teal-400 text-[var(--bg-base)] flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(79,209,197,0.4)] hover:shadow-[0_6px_24px_rgba(79,209,197,0.6)] hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
              disabled={primaryAction.disabled}
              onClick={submitCurrentSwap}
            >
              {isSubmitting ? (
                <Loader2 size={20} className="animate-spin" />
              ) : null}
              {primaryAction.label}
            </button>
          ) : (
            <button
              className="w-full py-4.5 sm:py-5 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-[var(--surface)] border border-[var(--line)] text-[var(--sea-ink-soft)] disabled:opacity-70 disabled:cursor-not-allowed"
              disabled
              title={swapExecutionSupport.reason ?? swapQuote?.prepareReason}
            >
              {primaryAction.label}
            </button>
          )}
        </div>

        {swapQuote || quoteError || submitError ? (
          <div className="mt-4 p-5 bg-[var(--surface)]/90 border border-[var(--line)] rounded-[1.5rem] shadow-sm animate-in slide-in-from-top-2 fade-in duration-300">
            {quoteError ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">
                  Error Occurred
                </span>
                <p className="text-sm font-medium text-rose-400/90 leading-snug">
                  {quoteError}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Quote route
                  </span>
                  <span className="text-xs font-black text-[var(--maya-teal)] uppercase bg-[var(--maya-teal)]/10 px-2 py-0.5 rounded border border-[var(--maya-teal)]/20">
                    {swapQuote?.route}
                  </span>
                </div>
                {swapQuote?.provider ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                      Provider
                    </span>
                    <span className="text-sm font-bold text-[var(--sea-ink)]">
                      {swapQuote.provider}
                    </span>
                  </div>
                ) : null}
                {swapQuote?.memo ? (
                  <div className="mt-2 p-3 bg-[var(--bg-base)] border border-[var(--line)] rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                      Memo
                    </span>
                    <div className="mt-1 text-[11px] font-mono break-all text-[var(--sea-ink)]/90 leading-tight">
                      {swapQuote.memo}
                    </div>
                  </div>
                ) : null}
                {swapQuote?.route === "maya" ? (
                  <div
                    className={`grid gap-3 ${swapQuote.inboundAddress ? "grid-cols-2" : "grid-cols-1"}`}
                  >
                    {swapQuote.inboundAddress ? (
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-3 py-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--sea-ink-soft)]">
                          Inbound
                        </span>
                        <div className="mt-1 text-xs font-mono break-all text-[var(--sea-ink)]/90">
                          {swapQuote.inboundAddress}
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-3 py-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--sea-ink-soft)]">
                        Execution
                      </span>
                      <div className="mt-1 text-sm font-semibold text-[var(--sea-ink)]">
                        {swapExecutionSupport.mode ?? "quote-only"}
                      </div>
                    </div>
                  </div>
                ) : null}
                {swapQuote ? (
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-3 py-3 text-xs text-[var(--sea-ink)]/90">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                        Expected Out
                      </span>
                      <span className="font-semibold">
                        {formatBaseUnits(
                          swapQuote.estimatedOutput,
                          swapQuote.outputDecimals,
                        )}{" "}
                        {toAsset?.ticker ?? ""}
                      </span>
                    </div>
                    {swapQuote.fees.network ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Network Fee
                        </span>
                        <span className="font-semibold">
                          {formatQuoteFeeAmount(
                            swapQuote.fees.network,
                            resolveQuoteFeeDecimals(swapQuote, assets, toAsset),
                          )}{" "}
                          {resolveQuoteFeeAssetLabel(swapQuote, toAsset)}
                        </span>
                      </div>
                    ) : null}
                    {swapQuote.fees.affiliate ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          {manualAffiliateOverride
                            ? "Affiliate Fee"
                            : isSupportingMayaZero && isSupportingReferrer
                              ? `Support Fees (${(Number(interfaceSupportSwapBps) / 100).toFixed(2)}% + ${(Number(supportReferrerBps) / 100).toFixed(2)}%)`
                              : isSupportingMayaZero
                                ? `MayaZero Support (${(Number(interfaceSupportSwapBps) / 100).toFixed(2)}%)`
                                : isSupportingReferrer
                                  ? `Referrer Support (${(Number(supportReferrerBps) / 100).toFixed(2)}%)`
                                  : "Affiliate Fee"}
                        </span>
                        <span className="font-semibold">
                          {formatQuoteFeeAmount(
                            swapQuote.fees.affiliate,
                            resolveQuoteFeeDecimals(swapQuote, assets, toAsset),
                          )}{" "}
                          {resolveQuoteFeeAssetLabel(swapQuote, toAsset)}
                        </span>
                      </div>
                    ) : null}
                    {swapQuote.fees.liquidity ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Liquidity Fee
                        </span>
                        <span className="font-semibold">
                          {formatQuoteFeeAmount(
                            swapQuote.fees.liquidity,
                            resolveQuoteFeeDecimals(swapQuote, assets, toAsset),
                          )}{" "}
                          {resolveQuoteFeeAssetLabel(swapQuote, toAsset)}
                        </span>
                      </div>
                    ) : null}
                    {swapQuote.fees.total ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Total Fees
                        </span>
                        <span className="font-semibold">
                          {formatQuoteFeeAmount(
                            swapQuote.fees.total,
                            resolveQuoteFeeDecimals(swapQuote, assets, toAsset),
                          )}{" "}
                          {resolveQuoteFeeAssetLabel(swapQuote, toAsset)}
                        </span>
                      </div>
                    ) : null}
                    {swapQuote.fees.slippageBps !== undefined ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Slip Fee
                        </span>
                        <span className="font-semibold">
                          {(swapQuote.fees.slippageBps / 100).toFixed(2)}%
                        </span>
                      </div>
                    ) : null}
                    {swapQuote.fees.totalBps !== undefined ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Total Impact
                        </span>
                        <span className="font-semibold">
                          {(swapQuote.fees.totalBps / 100).toFixed(2)}%
                        </span>
                      </div>
                    ) : null}
                    {swapQuote.route === "maya" && swapQuote.expiry ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Quote Expiry
                        </span>
                        <span className="font-semibold">
                          {formatQuoteExpiry(swapQuote.expiry)}
                        </span>
                      </div>
                    ) : null}
                    {swapQuote.route === "maya" ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Streaming
                        </span>
                        <span className="font-semibold">
                          {swapQuote.rawQuote.streaming_swap_blocks &&
                          Number(swapQuote.rawQuote.streaming_swap_blocks) > 0
                            ? `${swapQuote.rawQuote.streaming_swap_blocks} blocks`
                            : "Off"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {swapQuote?.route === "maya" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-3 py-3 text-xs text-[var(--sea-ink)]/90">
                      <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                        Vault Status
                      </span>
                      <div className="mt-2 grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="uppercase tracking-wider text-[var(--sea-ink-soft)]">
                            Trading
                          </span>
                          <span
                            className={
                              swapQuote.inboundDetails?.tradingPaused
                                ? "text-amber-400 font-semibold"
                                : "text-emerald-400 font-semibold"
                            }
                          >
                            {swapQuote.inboundDetails?.tradingPaused
                              ? "Paused"
                              : "Live"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="uppercase tracking-wider text-[var(--sea-ink-soft)]">
                            LP Actions
                          </span>
                          <span
                            className={
                              swapQuote.inboundDetails?.lpActionsPaused
                                ? "text-amber-400 font-semibold"
                                : "text-emerald-400 font-semibold"
                            }
                          >
                            {swapQuote.inboundDetails?.lpActionsPaused
                              ? "Paused"
                              : "Live"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="uppercase tracking-wider text-[var(--sea-ink-soft)]">
                            Halted
                          </span>
                          <span
                            className={
                              swapQuote.inboundDetails?.halted
                                ? "text-rose-400 font-semibold"
                                : "text-emerald-400 font-semibold"
                            }
                          >
                            {swapQuote.inboundDetails?.halted ? "Yes" : "No"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-3 py-3 text-xs text-[var(--sea-ink)]/90">
                      <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                        Chain Hints
                      </span>
                      <div className="mt-2 grid gap-2">
                        {swapQuote.dustThreshold ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="uppercase tracking-wider text-[var(--sea-ink-soft)]">
                              Dust Threshold
                            </span>
                            <span className="font-semibold">
                              {swapQuote.dustThreshold}
                            </span>
                          </div>
                        ) : null}
                        {swapQuote.recommendedGasRate ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="uppercase tracking-wider text-[var(--sea-ink-soft)]">
                              Gas Rate
                            </span>
                            <span className="font-semibold">
                              {swapQuote.recommendedGasRate}
                              {swapQuote.gasRateUnits
                                ? ` ${swapQuote.gasRateUnits}`
                                : ""}
                            </span>
                          </div>
                        ) : null}
                        {swapQuote.inboundDetails?.router ? (
                          <div className="grid gap-1">
                            <span className="uppercase tracking-wider text-[var(--sea-ink-soft)]">
                              Router
                            </span>
                            <span className="font-mono break-all">
                              {swapQuote.inboundDetails.router}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                {swapQuote?.route === "maya" &&
                (swapQuote.warning || swapQuote.notes) ? (
                  <div className="grid gap-3">
                    {swapQuote.warning ? (
                      <p className="text-xs font-medium text-amber-500/90 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                        {swapQuote.warning}
                      </p>
                    ) : null}
                    {swapQuote.notes ? (
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-3 py-3 text-xs text-[var(--sea-ink)]/90">
                        <span className="font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                          Notes
                        </span>
                        <p className="mt-2 leading-relaxed">
                          {swapQuote.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {swapExecutionSupport.reason ? (
                  <p className="mt-1 text-xs font-medium text-amber-500/90 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                    {swapExecutionSupport.reason}
                  </p>
                ) : null}
                {submitError ? (
                  <p className="mt-1 text-xs font-medium text-rose-500/90 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                    {submitError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </article>

      <SelectionModal
        isOpen={showFromModal}
        title="Select Asset to Swap"
        onClose={() => setShowFromModal(false)}
        items={assets.map((a) => {
          const balanceVal = getAssetBalance(a, sessionBalances);
          return {
            id: a.id,
            label: a.label,
            iconMain: a.ticker.toLowerCase(),
            subtitle: a.blurb,
            chainBadge: a.chain,
            priceUsd: a.priceUsd,
            balanceRaw: balanceVal,
          };
        })}
        onSelect={(id) =>
          updateSwapForm((current) => ({ ...current, fromAssetId: id }))
        }
      />

      <SelectionModal
        isOpen={showToModal}
        title="Select Asset to Receive"
        onClose={() => setShowToModal(false)}
        items={assets.map((a) => {
          const balanceVal = getAssetBalance(a, sessionBalances);
          return {
            id: a.id,
            label: a.label,
            iconMain: a.ticker.toLowerCase(),
            subtitle: a.blurb,
            chainBadge: a.chain,
            priceUsd: a.priceUsd,
            balanceRaw: balanceVal,
          };
        })}
        onSelect={(id) =>
          updateSwapForm((current) => ({ ...current, toAssetId: id }))
        }
      />
    </main>
  );
}

export function formatBaseUnits(
  value: string | undefined,
  decimals?: number,
): string {
  if (!value || decimals === undefined) {
    return "";
  }

  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const normalized = digits.replace(/^0+(?=\d)/, "") || "0";

  if (decimals === 0) {
    return `${negative ? "-" : ""}${normalized}`;
  }

  const padded = normalized.padStart(decimals + 1, "0");
  const integerPart = padded.slice(0, -decimals);
  const fractionalPart = padded.slice(-decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${integerPart}${fractionalPart ? `.${fractionalPart}` : ""}`;
}

function formatQuoteFeeAmount(
  value: string | undefined,
  decimals?: number,
): string {
  const formatted = formatBaseUnits(value, decimals);
  return formatted || (value ?? "");
}

function resolveQuoteFeeAssetLabel(
  quote: SwapQuoteEngineResult,
  toAsset?: ProtocolAsset,
): string {
  if (quote.route === "maya" && quote.fees.asset) {
    return getMayaAssetTicker(quote.fees.asset) || toAsset?.ticker || "";
  }

  return toAsset?.ticker || "";
}

function resolveQuoteFeeDecimals(
  quote: SwapQuoteEngineResult,
  assets: ProtocolAsset[],
  toAsset?: ProtocolAsset,
): number | undefined {
  if (quote.route === "maya" && quote.fees.asset) {
    const feeAsset = assets.find((asset) =>
      matchesMayaAssetDenominator(quote.fees.asset!, asset.mayaAsset),
    );
    if (feeAsset) {
      return feeAsset.mayaAsset.split(".")[0]?.toUpperCase() === "MAYA"
        ? feeAsset.decimals
        : 8;
    }

    if (getMayaAssetChainTicker(quote.fees.asset) === "MAYA") {
      const feeTicker = getMayaAssetTicker(quote.fees.asset);
      if (feeTicker === "CACAO") {
        return 10;
      }
      if (feeTicker === "MAYA") {
        return 4;
      }
      return toAsset?.decimals;
    }

    return 8;
  }

  return toAsset?.decimals;
}

function formatQuoteExpiry(expiryMs: number): string {
  const remainingMs = expiryMs - Date.now();
  if (remainingMs <= 0) {
    return "Expired";
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  if (remainingSeconds < 60) {
    return `${remainingSeconds}s remaining`;
  }

  const remainingMinutes = Math.ceil(remainingSeconds / 60);
  if (remainingMinutes < 60) {
    return `${remainingMinutes}m remaining`;
  }

  const remainingHours = Math.ceil(remainingMinutes / 60);
  return `${remainingHours}h remaining`;
}

export function getSwapPrimaryAction(params: {
  hasActiveSession: boolean;
  hasQuote: boolean;
  canSubmitSwap: boolean;
  isQuoting?: boolean;
  isSubmitting?: boolean;
  submitStatus?: SwapExecutionStatus | null;
  quoteError?: boolean;
}): {
  kind: "connect" | "submit" | "quote-only";
  label: string;
  disabled: boolean;
} {
  if (!params.hasActiveSession) {
    return {
      kind: "connect",
      label: "Connect Vault",
      disabled: false,
    };
  }

  if (params.isQuoting) {
    return {
      kind: "quote-only",
      label: "Fetching Quote...",
      disabled: true,
    };
  }

  if (params.isSubmitting) {
    return {
      kind: "submit",
      label:
        params.submitStatus === "refreshing"
          ? "Refreshing Quote"
          : params.submitStatus === "approving"
            ? "Approving Token"
            : params.submitStatus === "waiting-approval"
              ? "Waiting for Approval"
              : "Submitting Swap",
      disabled: true,
    };
  }

  if (!params.hasQuote) {
    if (params.quoteError) {
      return {
        kind: "quote-only",
        label: "Quote Failed",
        disabled: true,
      };
    }
    return {
      kind: "quote-only",
      label: "Enter an amount",
      disabled: true,
    };
  }

  if (params.canSubmitSwap) {
    return {
      kind: "submit",
      label: "Submit Swap",
      disabled: false,
    };
  }

  return {
    kind: "quote-only",
    label: "Maya Quote Only",
    disabled: true,
  };
}
