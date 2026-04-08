import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  WalletCards,
  Activity,
  Coins,
  ShieldCheck,
  Link2Off,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { AssetIcon } from "#/components/ProtocolPrimitives";
import { useSettings } from "#/provider/SettingsProvider";
import {
  fetchMayaAssetCatalog,
  getMayaSupportedChain,
  type MayaAssetCatalog,
  type MayaSupportedChain,
} from "#/lib/maya-asset-catalog";
import {
  fetchAddressBalances,
  useActiveWalletSession,
  useMayaWalletActions,
  type AddressBalanceResponse,
} from "#/wallet";
import {
  buildChainAssetRows,
  createChainBalanceRequest,
  formatUsd,
  shortenAddress,
} from "./-portfolio-data";

export const Route = createFileRoute("/chains/$chainKey")({
  component: ChainDetailPage,
});

function ChainDetailPage() {
  const { chainKey } = Route.useParams();
  const wallet = useMayaWalletActions();
  const settings = useSettings();
  const activeSession = useActiveWalletSession();

  const [catalog, setCatalog] = useState<MayaAssetCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [balanceResponse, setBalanceResponse] =
    useState<AddressBalanceResponse | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const attemptedAddressRefresh = useRef(new Set<string>());

  // Catalog loading
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setIsCatalogLoading(true);
      try {
        const nextCatalog = await fetchMayaAssetCatalog({
          midgardUrl: settings.midgardUrl,
        });
        if (!cancelled)
          startTransition(() => {
            setCatalog(nextCatalog);
          });
      } catch (err) {
        if (!cancelled)
          startTransition(() => {
            setCatalogError((err as Error).message);
          });
      } finally {
        if (!cancelled) setIsCatalogLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [settings.midgardUrl]);

  const chain = useMemo(
    () => (catalog ? getMayaSupportedChain(catalog, chainKey) : undefined),
    [catalog, chainKey],
  );

  const portfolioSessionKey = useMemo(() => {
    if (!activeSession || !chain?.walletChain) return `none:${chainKey}`;
    return [
      activeSession.id,
      activeSession.status,
      chain.key,
      activeSession.chains.join(","),
      activeSession.addresses[chain.walletChain] ?? "",
    ].join("::");
  }, [activeSession, chain, chainKey]);

  // Balance loading
  useEffect(() => {
    let cancelled = false;

    async function loadBalances(targetChain: MayaSupportedChain) {
      if (
        !activeSession ||
        !targetChain.walletChain ||
        !activeSession.chains.includes(targetChain.walletChain)
      ) {
        startTransition(() => {
          setBalanceResponse(null);
          setIsBalanceLoading(false);
        });
        return;
      }

      setIsBalanceLoading(true);
      try {
        let resolvedAddresses = activeSession.addresses;
        if (!resolvedAddresses[targetChain.walletChain]) {
          const refreshKey = `${activeSession.id}:${targetChain.key}`;
          if (!attemptedAddressRefresh.current.has(refreshKey)) {
            attemptedAddressRefresh.current.add(refreshKey);
            try {
              const { addresses } = await wallet.execute("addresses.list", {
                input: { chains: [targetChain.walletChain] },
                sessionId: activeSession.id,
                track: false,
              });
              resolvedAddresses = { ...resolvedAddresses, ...addresses };
            } catch {}
          }
        }

        const request = createChainBalanceRequest(
          { ...activeSession, addresses: resolvedAddresses },
          targetChain,
        );
        if (!request) return;

        const nextResponse = await fetchAddressBalances(request);
        if (!cancelled)
          startTransition(() => {
            setBalanceResponse(nextResponse);
          });
      } catch (e) {
        if (!cancelled)
          startTransition(() => {
            setBalanceResponse(null);
          });
      } finally {
        if (!cancelled) setIsBalanceLoading(false);
      }
    }

    if (chain) void loadBalances(chain);
    return () => {
      cancelled = true;
    };
  }, [portfolioSessionKey, wallet, chain]);

  const { rows, totalUsdValue } = useMemo(
    () =>
      chain
        ? buildChainAssetRows({
            session: activeSession,
            chain,
            response: balanceResponse,
          })
        : { rows: [], totalUsdValue: 0 },
    [activeSession, balanceResponse, chain],
  );

  if (isCatalogLoading) {
    return (
      <main className="page-wrap max-w-4xl mx-auto px-4 py-20 flex justify-center text-[var(--sea-ink-soft)]">
        <div className="w-8 h-8 rounded-full border-t-2 border-[var(--cacao-neon)] animate-spin" />
      </main>
    );
  }

  if (catalogError || !chain) {
    return (
      <main className="page-wrap max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-rose-500 mb-4">
          {catalogError ?? "Network Unavailable"}
        </h1>
        <Link
          to="/"
          className="text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] font-medium"
        >
          ← Back to Portfolio
        </Link>
      </main>
    );
  }

  const chainAddress =
    chain.walletChain && activeSession
      ? (activeSession.addresses[chain.walletChain] ?? null)
      : null;

  return (
    <main className="page-wrap px-4 pb-20 pt-6 sm:pt-8 max-w-4xl mx-auto rise-in">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--sea-ink-soft)] no-underline hover:text-[var(--cacao-neon)] transition-colors mb-10"
      >
        <ArrowLeft size={16} /> Back to Portfolio
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
        <div className="flex items-center gap-5">
          <AssetIcon
            assetId={chain.iconId}
            className="w-16 h-16 rounded-full border-[2px] border-[var(--line)] bg-[var(--surface)] shadow-md"
          />
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--sea-ink)] leading-none mb-2">
              {chain.name}
            </h1>
            <div className="text-[var(--sea-ink-soft)] font-medium text-sm flex items-center gap-2">
              {chain.ticker} Network
            </div>
          </div>
        </div>

        <div className="sm:text-right">
          <div className="text-[12px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)] mb-1">
            Total Balance
          </div>
          <div className="text-3xl sm:text-4xl font-black text-[var(--sea-ink)] tracking-tighter">
            {formatUsd(totalUsdValue)}
          </div>
        </div>
      </div>

      {/* Network Stats Row */}
      <div className="flex flex-wrap items-center gap-4 mb-10">
        <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--surface-strong)] flex items-center justify-center text-[var(--cacao-neon)] opacity-80">
            <Coins size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
              Chain Assets
            </div>
            <div className="font-bold text-[var(--sea-ink)] leading-none">
              {chain.assets.length} listed
            </div>
          </div>
        </div>

        {!activeSession ? (
          <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
              <Link2Off size={16} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-rose-500/80 tracking-wider">
                Wallet Status
              </div>
              <div className="font-bold text-rose-500 leading-none">
                Disconnected
              </div>
            </div>
          </div>
        ) : chainAddress ? (
          <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--maya-teal)]/10 flex items-center justify-center text-[var(--maya-teal)]">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--maya-teal)]/80 tracking-wider">
                Connected Address
              </div>
              <div className="font-bold text-[var(--maya-teal)] leading-none">
                {shortenAddress(chainAddress)}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--surface-strong)] flex items-center justify-center text-[var(--sea-ink-soft)]">
              <Activity size={16} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                Wallet Status
              </div>
              <div className="font-bold text-[var(--sea-ink)] leading-none">
                Unsynced
              </div>
            </div>
          </div>
        )}
      </div>

      {!activeSession && (
        <div className="mb-10 flex">
          <button
            className="cacao-btn px-8 py-3 text-sm flex items-center justify-center gap-2 shadow-sm rounded-xl"
            onClick={() => void wallet.initialize()}
          >
            <WalletCards size={18} /> Connect Vault to load balances
          </button>
        </div>
      )}

      {/* Assets Wallet List */}
      <h2 className="text-xl font-bold text-[var(--sea-ink)] mb-4 ml-1 flex items-center gap-2">
        <Activity size={20} className="text-[var(--sea-ink-soft)]" /> Network
        Assets
      </h2>

      <div className="glass-panel shadow-lg rounded-[28px] border border-[var(--line)] relative min-h-[200px] overflow-hidden">
        {isBalanceLoading && (
          <div className="absolute top-4 right-4 z-10 w-4 h-4 rounded-full border-t-2 border-[var(--cacao-neon)] animate-spin" />
        )}

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-strong)]/50">
              <th className="py-4 px-6 text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">
                Asset
              </th>
              <th className="py-4 px-6 text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider text-right">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((asset) => (
              <tr
                key={asset.id}
                className="border-b border-[var(--line)] hover:bg-[var(--surface-strong)] transition-colors group last:border-0"
              >
                <td className="py-4 px-6">
                  <div className="flex items-center gap-4">
                    <AssetIcon
                      assetId={asset.iconRaw}
                      className="w-10 h-10 rounded-full border border-[var(--line)] bg-[var(--surface)] group-hover:scale-105 transition-transform shadow-sm"
                    />
                    <div>
                      <div className="font-bold text-[var(--sea-ink)] text-lg leading-tight transition-colors group-hover:text-[var(--maya-teal)]">
                        {asset.label}
                      </div>
                      <div className="text-[12px] font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">
                        {asset.symbol}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6 text-right">
                  <div className="font-bold text-[var(--sea-ink)] text-xl leading-none mb-1">
                    {asset.balance}
                  </div>
                  <div className="text-[13px] font-medium text-[var(--sea-ink-soft)]">
                    {asset.usd}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
