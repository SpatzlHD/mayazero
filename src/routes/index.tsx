import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  WalletCards,
  Layers,
  Coins,
  Link2,
  Activity,
  Droplets,
  X,
} from "lucide-react";
import { Chain } from "@vultisig/sdk";
import { startTransition, useEffect, useMemo, useState } from "react";
import { AssetIcon } from "#/components/ProtocolPrimitives";
import { useSettings } from "#/provider/SettingsProvider";
import { useEffectiveWalletSession } from "#/provider/ImpersonationProvider";
import {
  fetchMayaAssetCatalog,
  type MayaAssetCatalog,
} from "#/lib/maya-asset-catalog";
import { fetchCacaoPoolPosition, formatCacaoBaseUnits } from "#/lib/cacao-pool";
import {
  fetchAddressBalances,
  useWalletBalanceRefreshTick,
} from "#/wallet";
import {
  getChainSessionStatus,
  createChainBalanceRequest,
  buildChainAssetRows,
  formatUsd,
} from "./-portfolio-data";
import { buildPageSeoHead } from "#/lib/seo";
import { changelogEntries, type ChangelogEntry, type ChangelogLink } from "#/content/changelog";

export const DISMISSED_CHANGELOG_ENTRY_STORAGE_KEY =
  "maya-home-dismissed-changelog-entry";

export const Route = createFileRoute("/")({
  head: () =>
    buildPageSeoHead({
      title: "Portfolio",
      description:
        "Track Maya Protocol-supported balances across chains and review synced vault positions in one portfolio view.",
    }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const activeSession = useEffectiveWalletSession();
  const balanceRefreshTick = useWalletBalanceRefreshTick();
  const [catalog, setCatalog] = useState<MayaAssetCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBalancesLoading, setIsBalancesLoading] = useState(false);
  const [cacaoPoolUsd, setCacaoPoolUsd] = useState<number>(0);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [chainBalancesUsd, setChainBalancesUsd] = useState<
    Record<string, number>
  >({});
  const [dismissedChangelogEntryId, setDismissedChangelogEntryId] = useState<
    string | null
  >(() =>
    loadDismissedChangelogEntryId(
      typeof localStorage !== "undefined" ? localStorage : undefined,
    ),
  );

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setIsLoading(true);
      try {
        const nextCatalog = await fetchMayaAssetCatalog({
          midgardUrl: settings.midgardUrl,
        });
        if (!cancelled) {
          startTransition(() => {
            setCatalog(nextCatalog);
          });
        }
      } catch (e) {
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [settings.midgardUrl]);

  const activeSessionKey = activeSession
    ? `${activeSession.id}:${Object.values(activeSession.addresses).join(",")}`
    : "none";

  useEffect(() => {
    let cancelled = false;
    async function loadAllBalances() {
      if (!catalog || !activeSession) {
        setChainBalancesUsd({});
        return;
      }
      setIsBalancesLoading(true);

      const totals: Record<string, number> = {};

      await Promise.all(
        catalog.chains.map(async (chain) => {
          const request = createChainBalanceRequest(
            { ...activeSession },
            chain,
          );
          if (!request) return;

          try {
            const response = await fetchAddressBalances(request);
            if (cancelled) return;
            const { totalUsdValue } = buildChainAssetRows({
              session: activeSession,
              chain,
              response,
            });
            totals[chain.key] = totalUsdValue;
          } catch (err) {
            console.log("Balance fetch skipped for", chain.key);
          }
        }),
      );

      if (!cancelled) {
        setChainBalancesUsd(totals);
        setIsBalancesLoading(false);
      }
    }

    void loadAllBalances();

    return () => {
      cancelled = true;
    };
  }, [catalog, activeSession, activeSessionKey, balanceRefreshTick]);

  useEffect(() => {
    let cancelled = false;
    async function loadPool() {
      if (!catalog || !activeSession) {
        setCacaoPoolUsd(0);
        return;
      }

      const mayaAddress = activeSession.addresses[Chain.MayaChain];
      if (!mayaAddress) return;

      setIsPoolLoading(true);
      try {
        const position = await fetchCacaoPoolPosition(mayaAddress, {
          midgardUrl: settings.midgardUrl,
        });
        if (cancelled) return;

        if (position) {
          const mayaChain = catalog.chains.find((c) => c.key === "mayachain");
          const cacaoPriceUsd =
            mayaChain?.assets.find((a) => a.isNative)?.priceUsd ?? 0;
          const cacaoDepositNum = Number(
            formatCacaoBaseUnits(position.cacaoDeposit),
          );

          setCacaoPoolUsd(cacaoDepositNum * cacaoPriceUsd);
        } else {
          setCacaoPoolUsd(0);
        }
      } catch (err) {
        console.log("CACAOPool fetch skipped");
      } finally {
        if (!cancelled) setIsPoolLoading(false);
      }
    }

    void loadPool();
    return () => {
      cancelled = true;
    };
  }, [
    catalog,
    activeSession,
    activeSessionKey,
    settings.midgardUrl,
    balanceRefreshTick,
  ]);

  const chainCards = useMemo(() => {
    return (catalog?.chains ?? []).map((chain) => {
      const status = getChainSessionStatus(activeSession, chain);
      return { ...chain, status };
    });
  }, [activeSession, catalog]);

  const totalAssets = catalog?.assets.length ?? 0;
  const syncCount = chainCards.filter((c) => c.status === "ready").length;
  const globalNetWorth =
    Object.values(chainBalancesUsd).reduce((a, b) => a + b, 0) + cacaoPoolUsd;
  const latestChangelogEntry = changelogEntries[0];
  const shouldShowChangelogPreview = shouldShowHomeChangelogPreview(
    latestChangelogEntry,
    dismissedChangelogEntryId,
  );

  const dismissLatestChangelogEntry = () => {
    if (!latestChangelogEntry) {
      return;
    }

    setDismissedChangelogEntryId(latestChangelogEntry.id);
    persistDismissedChangelogEntryId(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      latestChangelogEntry.id,
    );
  };

  return (
    <main className="page-wrap px-4 pb-20 pt-8 sm:pt-12 max-w-5xl mx-auto rise-in">
      {/* Wallet Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--sea-ink)]">
            Portfolio
          </h1>
          <p className="text-(--sea-ink-soft) font-medium mt-1 flex items-center gap-2">
            {!activeSession ? (
              "Multi-chain Network Hub"
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--maya-teal)] shadow-[0_0_8px_var(--maya-teal)] animate-pulse" />
                {activeSession.label} Secured
              </>
            )}
          </p>
        </div>

        {!activeSession ? (
          <button
            className="cacao-btn px-6 py-3 text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-[0_0_20px_rgba(232,122,78,0.3)] transition-all"
            onClick={() => navigate({ to: "/vault-setup" })}
          >
            <WalletCards size={18} /> Connect Vault
          </button>
        ) : (
          <div className="sm:text-right">
            <div className="text-[12px] font-bold uppercase tracking-widest text-[var(--maya-teal)] mb-1 flex items-center gap-1.5 justify-start sm:justify-end">
              {isBalancesLoading && (
                <Activity size={12} className="animate-spin" />
              )}{" "}
              Global Net Worth
            </div>
            <div className="text-4xl sm:text-5xl font-black text-[var(--sea-ink)] tracking-tighter">
              {isBalancesLoading && globalNetWorth === 0
                ? "---"
                : formatUsd(globalNetWorth)}
            </div>
          </div>
        )}
      </div>

      {/* Network Stats Row */}
      <div className="flex flex-wrap items-center gap-4 mb-10">
        <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--surface-strong)] flex items-center justify-center text-[var(--sea-ink-soft)]">
            <Layers size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
              Networks
            </div>
            <div className="font-bold text-[var(--sea-ink)] leading-none">
              {chainCards.length} Indexed
            </div>
          </div>
        </div>
        <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--surface-strong)] flex items-center justify-center text-[var(--cacao-neon)] opacity-80">
            <Coins size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
              Total Assets
            </div>
            <div className="font-bold text-[var(--sea-ink)] leading-none">
              {totalAssets} Available
            </div>
          </div>
        </div>
        <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--surface-strong)] flex items-center justify-center text-[var(--maya-teal)]">
            <Link2 size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
              Wallets Linked
            </div>
            <div className="font-bold text-[var(--sea-ink)] leading-none">
              {syncCount} Synced
            </div>
          </div>
        </div>
      </div>

      {shouldShowChangelogPreview && latestChangelogEntry ? (
        <HomeChangelogPreview
          entry={latestChangelogEntry}
          onDismiss={dismissLatestChangelogEntry}
        />
      ) : null}

      {/* Yield Positions Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-strong)] border border-[var(--line)] shadow-sm flex items-center justify-center text-[var(--cacao-neon)]">
            <Droplets size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--sea-ink)] leading-none mb-1">
              Yield Positions
            </h2>
            <p className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">
              Native & Liquidity
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/cacao-pool"
            className="glass-panel p-5 rounded-3xl transition-all hover:-translate-y-1 hover:border-[var(--cacao-neon)]/50 hover:shadow-[0_10px_30px_-10px_rgba(232,122,78,0.2)] no-underline group flex flex-col justify-between relative overflow-hidden"
          >
            {isPoolLoading && (
              <div className="absolute top-4 right-4 animate-pulse opacity-50">
                <Activity size={12} className="text-[var(--sea-ink-soft)]" />
              </div>
            )}

            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <AssetIcon
                  assetId="cacao"
                  className="w-12 h-12 rounded-full border border-[var(--line)] shadow-sm bg-[var(--surface)] group-hover:scale-105 transition-transform"
                />
                <div>
                  <div className="font-bold text-[var(--sea-ink)] text-lg leading-tight transition-colors group-hover:text-[var(--cacao-neon)]">
                    CACAOPool
                  </div>
                  {activeSession ? (
                    <div className="font-bold text-[13px] text-[var(--sea-ink)] mt-0.5">
                      {isPoolLoading ? "..." : formatUsd(cacaoPoolUsd)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[var(--sea-ink-soft)] font-bold uppercase tracking-wider mt-0.5">
                      Native Yield
                    </div>
                  )}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--sea-ink-soft)] group-hover:bg-[var(--cacao-neon)] group-hover:text-[var(--bg-base)] group-hover:border-[var(--cacao-neon)] transition-all">
                <ChevronRight size={16} />
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="text-[12px] font-medium text-[var(--sea-ink-soft)] flex items-center gap-1.5">
                <Coins size={12} /> Protocol Pool
              </div>
              {activeSession && (
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow-inner border border-transparent ${cacaoPoolUsd > 0 ? "bg-[var(--maya-teal)]/10 text-[var(--maya-teal)] border-[var(--maya-teal)]/20" : "bg-[var(--surface-strong)] text-[var(--sea-ink-soft)]"}`}
                >
                  {cacaoPoolUsd > 0 ? "Active" : "Ready"}
                </div>
              )}
            </div>
          </Link>

          <div className="glass-panel p-5 rounded-3xl opacity-60 border-dashed border-2 border-[var(--line)] flex flex-col items-center justify-center text-center select-none">
            <div className="w-12 h-12 rounded-full bg-[var(--surface-strong)] border border-[var(--line)] flex items-center justify-center text-[var(--sea-ink-soft)] mb-3">
              <Layers size={20} />
            </div>
            <div className="font-bold text-[var(--sea-ink)] text-lg">
              LP Positions
            </div>
            <div className="text-[11px] text-[var(--sea-ink-soft)] font-bold uppercase tracking-wider mt-1">
              Coming Soon
            </div>
          </div>
        </div>
      </div>

      {/* Network Balances Section */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-strong)] border border-[var(--line)] shadow-sm flex items-center justify-center text-[var(--maya-teal)]">
            <Layers size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--sea-ink)] leading-none mb-1">
              Network Balances
            </h2>
            <p className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">
              Layer 1 Assets
            </p>
          </div>
        </div>

        {/* Loading State or Chains Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--sea-ink-soft)] glass-panel rounded-3xl">
            <div className="w-8 h-8 rounded-full border-t-2 border-[var(--cacao-neon)] animate-spin mb-4" />
            <p className="font-medium animate-pulse">Syncing Networks...</p>
          </div>
        ) : chainCards.length === 0 ? (
          <div className="py-20 text-center text-[var(--sea-ink-soft)] font-medium glass-panel rounded-3xl">
            No networks found.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {chainCards.map((chain) => (
              <Link
                key={chain.key}
                to="/chains/$chainKey"
                params={{ chainKey: chain.key }}
                className="glass-panel p-5 rounded-3xl transition-all hover:-translate-y-1 hover:border-[var(--maya-teal)] hover:shadow-[0_10px_30px_-10px_rgba(26,154,141,0.2)] no-underline group flex flex-col justify-between relative overflow-hidden"
              >
                {isBalancesLoading &&
                chain.status === "ready" &&
                !(chain.key in chainBalancesUsd) ? (
                  <div className="absolute top-4 right-4 animate-pulse opacity-50">
                    <Activity
                      size={12}
                      className="text-[var(--sea-ink-soft)]"
                    />
                  </div>
                ) : null}

                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <AssetIcon
                      assetId={chain.iconId}
                      className="w-12 h-12 rounded-full border border-[var(--line)] shadow-sm bg-[var(--surface)] group-hover:scale-105 transition-transform"
                    />
                    <div>
                      <div className="font-bold text-[var(--sea-ink)] text-lg leading-tight transition-colors group-hover:text-[var(--maya-teal)]">
                        {chain.name}
                      </div>
                      {activeSession && chain.status === "ready" ? (
                        <div className="font-bold text-[13px] text-[var(--sea-ink)] mt-0.5">
                          {formatUsd(chainBalancesUsd[chain.key] ?? 0)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-[var(--sea-ink-soft)] font-bold uppercase tracking-wider mt-0.5">
                          {chain.ticker}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--sea-ink-soft)] group-hover:bg-[var(--maya-teal)] group-hover:text-[var(--bg-base)] group-hover:border-[var(--maya-teal)] transition-all">
                    <ChevronRight size={16} />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <div className="text-[12px] font-medium text-[var(--sea-ink-soft)] flex items-center gap-1.5">
                    <Coins size={12} /> {chain.assets.length} items
                  </div>
                  {activeSession && (
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow-inner border border-transparent ${chain.status === "ready" ? "bg-[var(--maya-teal)]/10 text-[var(--maya-teal)] border-[var(--maya-teal)]/20" : "bg-[var(--surface-strong)] text-[var(--sea-ink-soft)]"}`}
                    >
                      {chain.status === "ready"
                        ? "Connected"
                        : chain.walletChain
                          ? "Requires Sync"
                          : "Catalog Only"}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export function HomeChangelogPreview({
  entry,
  onDismiss,
}: {
  entry: ChangelogEntry;
  onDismiss?: () => void;
}) {
  return (
    <section className="glass-panel mb-12 overflow-hidden p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="kicker mb-2">What&apos;s new</p>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
            {entry.title}
          </h2>
          <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--maya-teal)]">
            Updated on {entry.date}
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)] transition-all hover:border-[var(--cacao-neon)]/40 hover:text-[var(--cacao-neon)]"
            aria-label="Dismiss what's new"
            title="Dismiss what's new"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="mt-4 max-w-3xl">
        <ul className="space-y-2 pl-5 text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
          {entry.items.slice(0, 2).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap gap-3">
          {entry.links?.map((link) => (
            <HomeChangelogLink key={`${entry.id}:${link.href}`} link={link} />
          ))}
          <Link
            to="/changelog"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition-all hover:border-[var(--cacao-neon)]/40 hover:text-[var(--cacao-neon)]"
          >
            View full changelog
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function HomeChangelogLink({ link }: { link: ChangelogLink }) {
  const isExternal = /^https?:\/\//.test(link.href);

  return (
    <a
      href={link.href}
      {...(isExternal ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition-all hover:border-[var(--cacao-neon)]/40 hover:text-[var(--cacao-neon)]"
    >
      {link.label}
    </a>
  );
}

export function loadDismissedChangelogEntryId(
  storage?: Pick<Storage, "getItem">,
): string | null {
  try {
    return storage?.getItem(DISMISSED_CHANGELOG_ENTRY_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function persistDismissedChangelogEntryId(
  storage: Pick<Storage, "setItem"> | undefined,
  entryId: string,
) {
  try {
    storage?.setItem(DISMISSED_CHANGELOG_ENTRY_STORAGE_KEY, entryId);
  } catch {
    // Ignored
  }
}

export function shouldShowHomeChangelogPreview(
  latestEntry: ChangelogEntry | undefined,
  dismissedEntryId: string | null,
) {
  return Boolean(latestEntry && latestEntry.id !== dismissedEntryId);
}
