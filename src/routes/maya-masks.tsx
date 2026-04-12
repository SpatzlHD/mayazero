import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import {
  Activity,
  AlertCircle,
  ExternalLink,
  type LucideIcon,
  Theater,
  RefreshCw,
  ShieldCheck,
  Wallet,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AssetIcon } from "#/components/ProtocolPrimitives";
import { VIEW_ONLY_IMPERSONATION_REASON } from "#/lib/impersonation";
import { fetchMayaMasks, type MayaMaskHolding } from "#/lib/maya-masks";
import { buildPageSeoHead } from "#/lib/seo";
import {
  useEffectiveWalletSession,
  useIsViewOnlyImpersonation,
} from "#/provider/ImpersonationProvider";

export const MAYA_MASKS_CONTRACT_ADDRESS =
  "0xe00d8f3dCA2ac474F4D7F177570f77de0774e754";

export const Route = createFileRoute("/maya-masks")({
  head: () =>
    buildPageSeoHead({
      title: "Maya Masks",
      description:
        "View all Maya Masks NFTs held by the connected Ethereum address in MayaZero.",
    }),
  component: MayaMasksRoute,
});

type MayaMasksViewState =
  | "disconnected"
  | "connect-eth"
  | "loading"
  | "empty"
  | "ready"
  | "error";

type MayaMasksPageProps = {
  loadMayaMasks?: typeof fetchMayaMasks;
};

type MayaMasksPageContentProps = {
  viewState: MayaMasksViewState;
  sessionLabel: string;
  isViewOnly: boolean;
  ethAddress: string;
  contractAddress: string;
  masks: MayaMaskHolding[];
  errorMessage: string | null;
  isRefreshing: boolean;
  onConnectWallet: () => void;
  onRefresh: () => void;
};

function MayaMasksRoute() {
  return <MayaMasksPage />;
}

export function MayaMasksPage({
  loadMayaMasks = fetchMayaMasks,
}: MayaMasksPageProps) {
  const navigate = useNavigate();
  const activeSession = useEffectiveWalletSession();
  const isViewOnly = useIsViewOnlyImpersonation();
  const ethAddress = activeSession?.addresses[Chain.Ethereum] ?? "";
  const [masks, setMasks] = useState<MayaMaskHolding[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeSession || !ethAddress) {
        setMasks([]);
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await loadMayaMasks(ethAddress);
        if (!cancelled) {
          setMasks(response.masks);
        }
      } catch (error) {
        if (!cancelled) {
          setMasks([]);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load Maya Masks.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeSession, ethAddress, loadMayaMasks]);

  const viewState = useMemo(
    () =>
      getMayaMasksViewState({
        hasSession: Boolean(activeSession),
        hasEthAddress: Boolean(ethAddress),
        isLoading,
        errorMessage,
        maskCount: masks.length,
      }),
    [activeSession, ethAddress, errorMessage, isLoading, masks.length],
  );

  async function refreshMasks() {
    if (!ethAddress) {
      return;
    }

    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const response = await loadMayaMasks(ethAddress);
      setMasks(response.masks);
    } catch (error) {
      setMasks([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load Maya Masks.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <MayaMasksPageContent
      viewState={viewState}
      sessionLabel={activeSession?.label || "Vault"}
      isViewOnly={isViewOnly}
      ethAddress={ethAddress}
      contractAddress={MAYA_MASKS_CONTRACT_ADDRESS}
      masks={masks}
      errorMessage={errorMessage}
      isRefreshing={isRefreshing}
      onConnectWallet={() => {
        if (!isViewOnly) {
          navigate({ to: "/vault-setup" });
        }
      }}
      onRefresh={() => {
        void refreshMasks();
      }}
    />
  );
}

export function MayaMasksPageContent(props: MayaMasksPageContentProps) {
  return (
    <main className="page-wrap px-4 pb-20 pt-8 sm:pt-12 max-w-6xl mx-auto rise-in">
      <section className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--cacao-neon)]">
            <Theater size={14} />
            MayaMask Inventory
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--sea-ink)]">
            Maya Masks
          </h1>
          <p className="mt-3 max-w-2xl text-base text-[var(--sea-ink-soft)]">
            Track the Maya Masks collection held by the connected Ethereum
            address!
          </p>
        </div>

        {props.viewState === "ready" ||
        props.viewState === "empty" ||
        props.viewState === "error" ? (
          <button
            type="button"
            className="secondary-btn px-5 py-3 flex items-center gap-2 self-start sm:self-auto"
            onClick={props.onRefresh}
            disabled={props.isRefreshing}
          >
            {props.isRefreshing ? (
              <Activity size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh Holdings
          </button>
        ) : null}
      </section>

      {props.viewState === "disconnected" ? (
        <StateGate
          icon={WalletCards}
          title="Connect a wallet session"
          body="Maya Masks uses the active wallet session to discover your Ethereum address before fetching NFT holdings."
          actionLabel={props.isViewOnly ? "View Only" : "Connect Vault"}
          disabled={props.isViewOnly}
          note={props.isViewOnly ? VIEW_ONLY_IMPERSONATION_REASON : undefined}
          onAction={props.onConnectWallet}
        />
      ) : null}

      {props.viewState === "connect-eth" ? (
        <StateGate
          icon={Wallet}
          title="Sync an Ethereum address"
          body={`The active session "${props.sessionLabel}" is connected, but it does not expose an Ethereum address yet.`}
          actionLabel={props.isViewOnly ? "View Only" : "Open Vault Setup"}
          disabled={props.isViewOnly}
          note={props.isViewOnly ? VIEW_ONLY_IMPERSONATION_REASON : undefined}
          onAction={props.onConnectWallet}
        />
      ) : null}

      {props.viewState === "loading" ? (
        <div className="glass-panel-strong rounded-[2rem] p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--line)] border-t-[var(--maya-teal)] animate-spin" />
          <div>
            <h2 className="text-2xl font-bold text-[var(--sea-ink)]">
              Loading Maya Masks
            </h2>
            <p className="mt-2 text-[var(--sea-ink-soft)]">
              Fetching MayaMasks...
            </p>
          </div>
        </div>
      ) : null}

      {props.viewState === "empty" ? (
        <section className="space-y-6">
          <SummaryCards
            ethAddress={props.ethAddress}
            contractAddress={props.contractAddress}
            totalCount={0}
          />
          <div className="glass-panel-strong rounded-[2rem] p-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)]">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-2xl font-bold text-[var(--sea-ink)]">
              No Maya Masks found
            </h2>
            <p className="mt-3 text-[var(--sea-ink-soft)]">
              The connected Ethereum address does not currently hold NFTs from
              the Maya Masks contract.
            </p>
          </div>
        </section>
      ) : null}

      {props.viewState === "error" ? (
        <section className="space-y-6">
          <SummaryCards
            ethAddress={props.ethAddress}
            contractAddress={props.contractAddress}
            totalCount={props.masks.length}
          />
          <div className="rounded-[2rem] border border-rose-500/20 bg-rose-500/10 p-6 text-rose-300">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <h2 className="text-xl font-bold text-rose-200">
                  Maya Masks could not be loaded
                </h2>
                <p className="mt-2 text-sm">{props.errorMessage}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {props.viewState === "ready" ? (
        <section className="space-y-6">
          <SummaryCards
            ethAddress={props.ethAddress}
            contractAddress={props.contractAddress}
            totalCount={props.masks.length}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {props.masks.map((mask) => (
              <article
                key={mask.tokenId}
                className="glass-panel-strong rounded-[2rem] overflow-hidden border border-[var(--line)]"
              >
                <div className="aspect-square bg-[var(--surface)] border-b border-[var(--line)] overflow-hidden">
                  {mask.imageUrl ? (
                    <img
                      src={mask.imageUrl}
                      alt={mask.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,var(--halo-glow),transparent_55%),var(--surface)] text-[var(--sea-ink-soft)]">
                      <Theater size={48} />
                    </div>
                  )}
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <h2 className="text-xl font-bold text-[var(--sea-ink)]">
                      {mask.name}
                    </h2>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-[var(--cacao-neon)]">
                      Token #{mask.tokenId}
                    </p>
                  </div>
                  <p className="min-h-[3rem] text-sm text-[var(--sea-ink-soft)]">
                    {mask.description ||
                      "No collection description returned for this token."}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SummaryCards(props: {
  ethAddress: string;
  contractAddress: string;
  totalCount: number;
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <article className="glass-panel rounded-[1.75rem] p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--maya-teal)]">
            <AssetIcon assetId="eth" className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
            Connected Address
          </p>
          <p className="mt-3 break-all font-mono text-sm text-[var(--sea-ink)]">
            {props.ethAddress}
          </p>
        </article>

        <article className="glass-panel rounded-[1.75rem] p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--cacao-neon)]">
            <Theater size={18} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
            Masks Held
          </p>
          <p className="mt-3 text-4xl font-black tracking-tight text-[var(--sea-ink)]">
            {props.totalCount}
          </p>
        </article>

        <article className="glass-panel rounded-[1.75rem] p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--maya-teal)]">
            <ExternalLink size={18} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
            Contract
          </p>
          <div className="mt-3 break-all font-mono text-sm text-[var(--sea-ink)]">
            {props.contractAddress}
          </div>
          <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
            Ethereum mainnet collection contract.
          </p>
        </article>
      </div>
    </>
  );
}

function StateGate(props: {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel: string;
  disabled?: boolean;
  note?: string;
  onAction: () => void;
}) {
  const Icon = props.icon;

  return (
    <article className="glass-panel-strong w-full max-w-2xl mx-auto p-10 rounded-[3rem] text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-[var(--maya-teal)]/10 border border-[var(--maya-teal)]/30 flex items-center justify-center mb-6">
        <Icon size={28} className="text-[var(--maya-teal)]" />
      </div>
      <h2 className="text-3xl font-black tracking-tight text-[var(--sea-ink)]">
        {props.title}
      </h2>
      <p className="mt-4 text-base font-medium text-[var(--sea-ink-soft)] leading-relaxed max-w-lg mx-auto">
        {props.body}
      </p>
      <button
        type="button"
        className="w-full sm:w-auto mt-8 px-8 py-4 text-lg font-bold rounded-2xl bg-gradient-to-r from-[var(--maya-teal)] to-emerald-400 text-[var(--bg-base)] shadow-[0_4px_20px_rgba(79,209,197,0.3)] hover:shadow-[0_6px_24px_rgba(79,209,197,0.5)] hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        disabled={props.disabled}
        onClick={props.onAction}
      >
        {props.actionLabel}
      </button>
      {props.note ? (
        <p className="mt-4 text-sm text-amber-500">{props.note}</p>
      ) : null}
    </article>
  );
}

export function getMayaMasksViewState(input: {
  hasSession: boolean;
  hasEthAddress: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  maskCount: number;
}): MayaMasksViewState {
  if (!input.hasSession) return "disconnected";
  if (!input.hasEthAddress) return "connect-eth";
  if (input.isLoading) return "loading";
  if (input.errorMessage) return "error";
  return input.maskCount > 0 ? "ready" : "empty";
}
