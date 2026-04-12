import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import { AlertCircle, Loader2, RefreshCw, Shield } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { VIEW_ONLY_IMPERSONATION_REASON } from "#/lib/impersonation";
import { buildPageSeoHead } from "#/lib/seo";
import { formatBaseUnits } from "#/lib/cacao-pool";
import {
  fetchPooledNodes,
  getPooledNodeWarnings,
  type PooledNode,
} from "#/lib/pooled-nodes";
import {
  useEffectiveWalletSession,
  useIsViewOnlyImpersonation,
} from "#/provider/ImpersonationProvider";
import { useSettings } from "#/provider/SettingsProvider";
import {
  createExecutionJourneySteps,
  getPooledNodeActionSupport,
  submitPooledNodeAction,
  trackTransactionJourney,
  useMayaWalletActions,
  useWalletBalanceRefreshTick,
  waitForJourneyTransactionSettlement,
  WalletSessionNotFoundError,
  type PooledNodeActionKind,
} from "#/wallet";
import { useHypertune } from "#/generated/hypertune.react";
import FeatureGate from "#/components/FeatureGate";

export const Route = createFileRoute("/pooled-nodes")({
  head: () =>
    buildPageSeoHead({
      title: "Pooled Nodes",
      description:
        "Manage pooled MAYANodes related to your connected MayaChain address.",
    }),
  component: PooledNodesRoute,
});

type LoadNodes = (input: {
  connectedAddress: string;
  mayanodeUrl: string;
}) => Promise<PooledNode[]>;

type Props = {
  loadNodes?: LoadNodes;
  onMissingSession?: () => void;
  submitAction?: typeof submitPooledNodeAction;
};

const defaultLoadNodes: LoadNodes = (input) =>
  fetchPooledNodes({
    connectedAddress: input.connectedAddress,
    mayanodeUrl: input.mayanodeUrl,
  });

function PooledNodesRoute() {
  const navigate = useNavigate();
  return (
    <PooledNodesPage
      onMissingSession={() => navigate({ to: "/vault-setup" })}
    />
  );
}

export function PooledNodesPage({
  loadNodes = defaultLoadNodes,
  onMissingSession,
  submitAction = submitPooledNodeAction,
}: Props) {
  const wallet = useMayaWalletActions();
  const settings = useSettings();
  const activeSession = useEffectiveWalletSession();
  const isViewOnly = useIsViewOnlyImpersonation();
  const balanceRefreshTick = useWalletBalanceRefreshTick();
  const mayaAddress = activeSession?.addresses[Chain.MayaChain] ?? "";
  const support = isViewOnly
    ? { supported: false, reason: VIEW_ONLY_IMPERSONATION_REASON }
    : getPooledNodeActionSupport(wallet, activeSession?.id);
  const hypertune = useHypertune();
  const [nodes, setNodes] = useState<PooledNode[]>([]);
  const [selectedNodeAddress, setSelectedNodeAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerBondAmount, setProviderBondAmount] = useState("");
  const [providerUnbondAmount, setProviderUnbondAmount] = useState("");
  const [operatorAddProviderAddress, setOperatorAddProviderAddress] =
    useState("");
  const [operatorAddProviderFee, setOperatorAddProviderFee] = useState("0");
  const [operatorAddProviderAmount, setOperatorAddProviderAmount] =
    useState("");
  const [operatorFeeUpdateBps, setOperatorFeeUpdateBps] = useState("0");
  const [operatorFeeUpdateAmount, setOperatorFeeUpdateAmount] = useState("1");
  const [operatorRemoveProviderAddress, setOperatorRemoveProviderAddress] =
    useState("");
  const [operatorRemoveProviderAmount, setOperatorRemoveProviderAmount] =
    useState("");
  const loadNodesRef = useRef(loadNodes);

  useEffect(() => {
    loadNodesRef.current = loadNodes;
  }, [loadNodes]);

  const selectedNode = useMemo(
    () =>
      nodes.find((node) => node.nodeAddress === selectedNodeAddress) ??
      nodes[0] ??
      null,
    [nodes, selectedNodeAddress],
  );
  const warnings = useMemo(
    () => getPooledNodeWarnings(selectedNode),
    [selectedNode],
  );
  const removableProviders =
    selectedNode?.providers.filter(
      (provider) => provider.bondAddress !== selectedNode.bondAddress,
    ) ?? [];

  useEffect(() => {
    if (!selectedNode) {
      setOperatorRemoveProviderAddress("");
      return;
    }
    setOperatorRemoveProviderAddress((current) =>
      removableProviders.some((provider) => provider.bondAddress === current)
        ? current
        : (removableProviders[0]?.bondAddress ?? ""),
    );
  }, [removableProviders, selectedNode]);

  useEffect(() => {
    if (!mayaAddress) {
      setNodes([]);
      setSelectedNodeAddress("");
      setLoadError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    async function refresh() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const next = await loadNodesRef.current({
          connectedAddress: mayaAddress,
          mayanodeUrl: settings.mayanodeUrl,
        });
        if (cancelled) return;
        setNodes(next);
        setSelectedNodeAddress((current) =>
          next.some((node) => node.nodeAddress === current)
            ? current
            : (next[0]?.nodeAddress ?? ""),
        );
      } catch (error) {
        if (!cancelled) {
          setNodes([]);
          setSelectedNodeAddress("");
          setLoadError((error as Error).message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [balanceRefreshTick, mayaAddress, settings.mayanodeUrl]);

  async function connectMayaChain() {
    if (isViewOnly) {
      return;
    }

    await wallet
      .execute("accounts.connect", {
        sessionId: activeSession?.id,
        input: { chain: Chain.MayaChain },
      })
      .catch((error) => {
        if (error instanceof WalletSessionNotFoundError) {
          onMissingSession?.();
          return;
        }
        throw error;
      });
  }

  async function refreshNodes() {
    if (!mayaAddress) return;
    setIsLoading(true);
    try {
      const next = await loadNodesRef.current({
        connectedAddress: mayaAddress,
        mayanodeUrl: settings.mayanodeUrl,
      });
      setNodes(next);
      setSelectedNodeAddress((current) =>
        next.some((node) => node.nodeAddress === current)
          ? current
          : (next[0]?.nodeAddress ?? ""),
      );
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function executeAction(input: {
    action: PooledNodeActionKind;
    amountBaseUnits: string;
    nodeAddress: string;
    operatorFeeBps?: string;
    providerAddress?: string;
    title: string;
    successMessage: string;
    reset: () => void;
  }) {
    if (isViewOnly) {
      setSubmitError(VIEW_ONLY_IMPERSONATION_REASON);
      return;
    }
    if (!activeSession) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await trackTransactionJourney(wallet, {
        kind: "pooled-node",
        title: input.title,
        sessionId: activeSession.id,
        source: activeSession.source,
        chain: Chain.MayaChain,
        routePath: "/pooled-nodes",
        steps: createExecutionJourneySteps({
          source: activeSession.source,
          finalLabel: "Pooled Node Update Complete",
        }),
        run: async (journey) => {
          journey.activateStep("preparing", "Preparing pooled-node memo.");
          const result = await submitAction(wallet, {
            action: input.action,
            amountBaseUnits: input.amountBaseUnits,
            journeyId: journey.journeyId,
            nodeAddress: input.nodeAddress,
            operatorFeeBps: input.operatorFeeBps,
            providerAddress: input.providerAddress,
            sessionId: activeSession.id,
          });
          journey.completeStep("preparing", "Pooled-node deposit prepared.");
          if (activeSession.source === "extension")
            journey.completeStep("provider", "Extension accepted the request.");
          else journey.completeStep("signing", "Vault signing complete.");
          journey.setPrimaryTxHash(result.txHash);
          journey.completeStep(
            "broadcasting",
            result.txHash
              ? "Pooled-node transaction broadcast submitted."
              : "Pooled-node transaction submitted without a returned hash.",
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
                ? input.successMessage
                : settlement === "error"
                  ? "Pooled-node transaction failed on-chain."
                  : settlement === "unconfirmed"
                    ? "Pooled-node transaction submitted, but confirmation timed out."
                    : "Pooled-node transaction submitted, but automatic tracking is unavailable.",
          });
          journey.complete(result, settlement);
          return result;
        },
      });
      input.reset();
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }
  if (!hypertune.beta({ fallback: false })) return <FeatureGate />;
  const disconnected = !activeSession || !mayaAddress;
  if (disconnected) {
    return (
      <PageShell
        title="Pooled Nodes"
        subtitle={
          activeSession
            ? "Connect a MayaChain address for the active session to load related pooled nodes."
            : "Connect a vault session to review related pooled MAYANodes."
        }
      >
        <PrimaryPanel>
          <button
            className="primary-btn"
            type="button"
            disabled={isViewOnly}
            onClick={() => void connectMayaChain()}
          >
            {isViewOnly
              ? "View Only"
              : activeSession
                ? "Connect MayaChain"
                : "Connect Vault"}
          </button>
          {isViewOnly ? (
            <Warning>{VIEW_ONLY_IMPERSONATION_REASON}</Warning>
          ) : null}
        </PrimaryPanel>
      </PageShell>
    );
  }

  if (isLoading && !nodes.length) {
    return (
      <MessageState
        title="Loading Pooled Nodes"
        body="Syncing related pooled MAYANodes from the configured Mayanode endpoint."
        icon={
          <Loader2 size={28} className="animate-spin text-[var(--maya-teal)]" />
        }
      />
    );
  }
  if (loadError && !nodes.length) {
    return (
      <MessageState
        title="Failed to Load Nodes"
        body={loadError}
        icon={<AlertCircle size={28} className="text-rose-400" />}
      />
    );
  }
  if (!nodes.length) {
    return (
      <MessageState
        title="No Related Pooled Nodes Found"
        body="The connected MayaChain address is not currently matched as a node operator or bond provider on the live node set."
        icon={<Shield size={28} className="text-[var(--maya-teal)]" />}
      />
    );
  }

  return (
    <PageShell
      title="Pooled Nodes"
      subtitle="Review pooled MAYANodes related to your MayaChain address and submit operator or provider bond actions."
    >
      <PrimaryPanel>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold">
            {mayaAddress}
          </span>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => void refreshNodes()}
          >
            <span className="flex items-center gap-2">
              <RefreshCw
                size={14}
                className={isLoading ? "animate-spin" : undefined}
              />
              Refresh Nodes
            </span>
          </button>
        </div>
        {support.reason ? <Warning>{support.reason}</Warning> : null}
        {submitError ? <ErrorBanner>{submitError}</ErrorBanner> : null}
      </PrimaryPanel>
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <PrimaryPanel>
          <h2 className="text-xl font-bold">Your MAYANodes</h2>
          <div className="mt-4 grid gap-3">
            {nodes.map((node) => (
              <button
                key={node.nodeAddress}
                type="button"
                className="rounded-2xl border border-[var(--line)] p-4 text-left"
                onClick={() => setSelectedNodeAddress(node.nodeAddress)}
              >
                <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider">
                  {node.isOperator ? <span>Operator</span> : null}
                  {!node.isOperator && node.isProvider ? (
                    <span>Provider</span>
                  ) : null}
                  <span>{node.status}</span>
                </div>
                <p className="mt-2 font-mono text-sm break-all">
                  {node.nodeAddress}
                </p>
                <p className="mt-2 text-xs">
                  Fee {node.operatorFeeBps} bps • Providers {node.providerCount}
                </p>
              </button>
            ))}
          </div>
        </PrimaryPanel>
        <div className="grid gap-6">
          <PrimaryPanel>
            <h2 className="text-xl font-bold">Node Detail</h2>
            <p className="mt-2 font-mono text-sm break-all">
              {selectedNode?.nodeAddress}
            </p>
            <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
              <Metric
                label="Operator Fee"
                value={`${selectedNode?.operatorFeeBps ?? "0"} bps`}
              />
              <Metric
                label="Node Bond"
                value={formatBaseUnits(selectedNode?.bond ?? "0", 10) || "0"}
              />
              <Metric
                label="Reward"
                value={formatBaseUnits(selectedNode?.reward ?? "0", 10) || "0"}
              />
              <Metric
                label="Preflight"
                value={selectedNode?.preflightStatus ?? "Unknown"}
              />
            </div>
            {warnings.map((warning) => (
              <Warning key={warning}>{warning}</Warning>
            ))}
          </PrimaryPanel>
          <PrimaryPanel>
            <h2 className="text-xl font-bold">Provider Registry</h2>
            <div className="mt-4 grid gap-3">
              {selectedNode?.providers.map((provider) => (
                <div
                  key={provider.bondAddress}
                  className="rounded-2xl border border-[var(--line)] p-4"
                >
                  <p className="font-mono text-sm break-all">
                    {provider.bondAddress}
                  </p>
                  <p className="mt-2 text-xs">
                    Reward {formatBaseUnits(provider.reward, 10) || "0"} CACAO
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {Object.entries(provider.pools).length ? (
                      Object.entries(provider.pools).map(([asset, amount]) => (
                        <span key={`${provider.bondAddress}-${asset}`}>
                          {asset}: {amount}
                        </span>
                      ))
                    ) : (
                      <span>No pool allocation map reported.</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PrimaryPanel>
          {selectedNode?.isProvider || selectedNode?.isOperator ? (
            <PrimaryPanel>
              <h2 className="text-xl font-bold">Provider Actions</h2>
              <ActionBlock
                title="Provider Bond"
                label="Bond amount"
                value={providerBondAmount}
                setValue={setProviderBondAmount}
                helper={formatAmountPreview(providerBondAmount)}
                buttonLabel={isSubmitting ? "Submitting Bond" : "Submit Bond"}
                disabled={
                  !support.supported ||
                  isSubmitting ||
                  !providerBondAmount.trim()
                }
                onSubmit={() =>
                  void executeAction({
                    action: "provider.bond",
                    amountBaseUnits: providerBondAmount,
                    nodeAddress: selectedNode!.nodeAddress,
                    title: "Provider Bond",
                    successMessage: "Provider bond confirmed on-chain.",
                    reset: () => setProviderBondAmount(""),
                  })
                }
              />
              <ActionBlock
                title="Provider Unbond"
                label="Unbond amount"
                value={providerUnbondAmount}
                setValue={setProviderUnbondAmount}
                helper={formatAmountPreview(providerUnbondAmount)}
                buttonLabel={
                  isSubmitting ? "Submitting Unbond" : "Submit Unbond"
                }
                disabled={
                  !support.supported ||
                  isSubmitting ||
                  !providerUnbondAmount.trim()
                }
                onSubmit={() =>
                  void executeAction({
                    action: "provider.unbond",
                    amountBaseUnits: providerUnbondAmount,
                    nodeAddress: selectedNode!.nodeAddress,
                    title: "Provider Unbond",
                    successMessage:
                      "Provider unbond request confirmed on-chain.",
                    reset: () => setProviderUnbondAmount(""),
                  })
                }
              />
            </PrimaryPanel>
          ) : null}
          {selectedNode?.isOperator ? (
            <PrimaryPanel>
              <h2 className="text-xl font-bold">Operator Controls</h2>
              <label className="mt-4 block text-sm font-semibold">
                Provider address
              </label>
              <input
                aria-label="Provider address"
                className="super-input mt-2"
                value={operatorAddProviderAddress}
                onChange={(event) =>
                  setOperatorAddProviderAddress(event.target.value)
                }
              />
              <label className="mt-4 block text-sm font-semibold">
                Operator fee basis points
              </label>
              <input
                aria-label="Operator fee basis points"
                className="super-input mt-2"
                value={operatorAddProviderFee}
                onChange={(event) =>
                  setOperatorAddProviderFee(event.target.value)
                }
              />
              <label className="mt-4 block text-sm font-semibold">
                Operator bond amount
              </label>
              <input
                aria-label="Operator bond amount"
                className="super-input mt-2"
                value={operatorAddProviderAmount}
                onChange={(event) =>
                  setOperatorAddProviderAmount(event.target.value)
                }
              />
              <button
                className="primary-btn mt-4"
                type="button"
                disabled={
                  !support.supported ||
                  isSubmitting ||
                  !operatorAddProviderAddress.trim() ||
                  !operatorAddProviderAmount.trim()
                }
                onClick={() =>
                  void executeAction({
                    action: "operator.add-provider",
                    amountBaseUnits: operatorAddProviderAmount,
                    nodeAddress: selectedNode.nodeAddress,
                    operatorFeeBps: operatorAddProviderFee,
                    providerAddress: operatorAddProviderAddress,
                    title: "Operator Add Provider",
                    successMessage:
                      "Bond provider add request confirmed on-chain.",
                    reset: () => {
                      setOperatorAddProviderAddress("");
                      setOperatorAddProviderAmount("");
                    },
                  })
                }
              >
                Add Provider
              </button>
              <label className="mt-6 block text-sm font-semibold">
                Fee update basis points
              </label>
              <input
                aria-label="Fee update basis points"
                className="super-input mt-2"
                value={operatorFeeUpdateBps}
                onChange={(event) =>
                  setOperatorFeeUpdateBps(event.target.value)
                }
              />
              <label className="mt-4 block text-sm font-semibold">
                Fee update transaction amount
              </label>
              <input
                aria-label="Fee update transaction amount"
                className="super-input mt-2"
                value={operatorFeeUpdateAmount}
                onChange={(event) =>
                  setOperatorFeeUpdateAmount(event.target.value)
                }
              />
              <button
                className="primary-btn mt-4"
                type="button"
                disabled={
                  !support.supported ||
                  isSubmitting ||
                  !operatorFeeUpdateBps.trim() ||
                  !operatorFeeUpdateAmount.trim()
                }
                onClick={() =>
                  void executeAction({
                    action: "operator.update-fee",
                    amountBaseUnits: operatorFeeUpdateAmount,
                    nodeAddress: selectedNode.nodeAddress,
                    operatorFeeBps: operatorFeeUpdateBps,
                    title: "Operator Update Fee",
                    successMessage: "Operator fee update confirmed on-chain.",
                    reset: () => {},
                  })
                }
              >
                Update Fee
              </button>
              <label className="mt-6 block text-sm font-semibold">
                Provider to remove
              </label>
              <select
                aria-label="Provider to remove"
                className="super-input mt-2"
                value={operatorRemoveProviderAddress}
                onChange={(event) =>
                  setOperatorRemoveProviderAddress(event.target.value)
                }
              >
                <option value="">Select provider</option>
                {removableProviders.map((provider) => (
                  <option
                    key={provider.bondAddress}
                    value={provider.bondAddress}
                  >
                    {provider.bondAddress}
                  </option>
                ))}
              </select>
              <label className="mt-4 block text-sm font-semibold">
                Remove provider amount
              </label>
              <input
                aria-label="Remove provider amount"
                className="super-input mt-2"
                value={operatorRemoveProviderAmount}
                onChange={(event) =>
                  setOperatorRemoveProviderAmount(event.target.value)
                }
              />
              <button
                className="primary-btn mt-4"
                type="button"
                disabled={
                  !support.supported ||
                  isSubmitting ||
                  !operatorRemoveProviderAddress ||
                  !operatorRemoveProviderAmount.trim()
                }
                onClick={() =>
                  void executeAction({
                    action: "operator.remove-provider",
                    amountBaseUnits: operatorRemoveProviderAmount,
                    nodeAddress: selectedNode.nodeAddress,
                    providerAddress: operatorRemoveProviderAddress,
                    title: "Operator Remove Provider",
                    successMessage:
                      "Provider removal request confirmed on-chain.",
                    reset: () => setOperatorRemoveProviderAmount(""),
                  })
                }
              >
                Remove Provider
              </button>
            </PrimaryPanel>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}

function PageShell(props: {
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <main className="page-wrap flex flex-col gap-6 min-h-[85vh] px-4 pb-16 pt-8">
      <div className="text-center">
        <p className="island-kicker mb-2 flex justify-center items-center gap-2">
          <Shield size={14} /> MayaChain Validator Rail
        </p>
        <h1 className="terminal-title mb-3 text-4xl sm:text-5xl font-black tracking-tight">
          {props.title}
        </h1>
        <p className="text-[var(--sea-ink-soft)]/90 max-w-3xl mx-auto text-sm sm:text-base font-medium">
          {props.subtitle}
        </p>
      </div>
      {props.children}
    </main>
  );
}

function PrimaryPanel(props: { children: ReactNode }) {
  return (
    <section className="glass-panel-strong p-6 sm:p-8">
      {props.children}
    </section>
  );
}

function MessageState(props: { body: string; icon: ReactNode; title: string }) {
  return (
    <PageShell title="Pooled Nodes" subtitle={props.body}>
      <PrimaryPanel>
        <div className="flex flex-col items-center text-center gap-4">
          {props.icon}
          <h2 className="text-2xl font-bold">{props.title}</h2>
          <p>{props.body}</p>
        </div>
      </PrimaryPanel>
    </PageShell>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] p-3">
      <div className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">
        {props.label}
      </div>
      <div className="mt-1 font-bold break-all">{props.value}</div>
    </div>
  );
}

function Warning(props: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-sm font-medium text-amber-500">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <p>{props.children}</p>
    </div>
  );
}

function ErrorBanner(props: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 p-3.5 text-sm font-medium text-rose-400">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <p>{props.children}</p>
    </div>
  );
}

function ActionBlock(props: {
  buttonLabel: string;
  disabled: boolean;
  helper: string;
  label: string;
  onSubmit: () => void;
  setValue: (value: string) => void;
  title: string;
  value: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[var(--line)] p-4">
      <h3 className="font-bold">{props.title}</h3>
      <label className="mt-3 block text-sm font-semibold">{props.label}</label>
      <input
        aria-label={props.label}
        className="super-input mt-2"
        value={props.value}
        onChange={(event) => props.setValue(event.target.value)}
      />
      <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">{props.helper}</p>
      <button
        className="primary-btn mt-4"
        type="button"
        disabled={props.disabled}
        onClick={props.onSubmit}
      >
        {props.buttonLabel}
      </button>
    </div>
  );
}

function formatAmountPreview(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "Enter a raw on-chain integer amount.";
  if (!/^\d+$/.test(normalized))
    return "Amounts must use raw on-chain integers only.";
  return `Preview: ${formatBaseUnits(normalized, 10) || "0"} CACAO`;
}
