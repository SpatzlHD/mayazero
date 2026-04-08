import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  WalletCards,
  Layers,
  Coins,
  Link2,
  Activity,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { AssetIcon } from "#/components/ProtocolPrimitives";
import { useSettings } from "#/provider/SettingsProvider";
import {
  fetchMayaAssetCatalog,
  type MayaAssetCatalog,
} from "#/lib/maya-asset-catalog";
import {
  useActiveWalletSession,
  useMayaWalletActions,
  fetchAddressBalances,
} from "#/wallet";
import {
  getChainSessionStatus,
  createChainBalanceRequest,
  buildChainAssetRows,
  formatUsd,
} from "./-portfolio-data";

export const Route = createFileRoute("/")({ component: PortfolioPage });

function PortfolioPage() {
  const wallet = useMayaWalletActions();
  const settings = useSettings();
  const activeSession = useActiveWalletSession();
  const [catalog, setCatalog] = useState<MayaAssetCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBalancesLoading, setIsBalancesLoading] = useState(false);
  const [chainBalancesUsd, setChainBalancesUsd] = useState<
    Record<string, number>
  >({});

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
  }, [catalog, activeSession, activeSessionKey]);

  const chainCards = useMemo(() => {
    return (catalog?.chains ?? []).map((chain) => {
      const status = getChainSessionStatus(activeSession, chain);
      return { ...chain, status };
    });
  }, [activeSession, catalog]);

  const totalAssets = catalog?.assets.length ?? 0;
  const syncCount = chainCards.filter((c) => c.status === "ready").length;
  const globalNetWorth = Object.values(chainBalancesUsd).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <main className="page-wrap px-4 pb-20 pt-8 sm:pt-12 max-w-5xl mx-auto rise-in">
      {/* Wallet Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--sea-ink)]">
            Portfolio
          </h1>
          <p className="text-[var(--sea-ink-soft)] font-medium mt-1 flex items-center gap-2">
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
            onClick={() => void wallet.initialize()}
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
                  <Activity size={12} className="text-[var(--sea-ink-soft)]" />
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
    </main>
  );
}
