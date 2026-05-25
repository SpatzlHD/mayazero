import { Link } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import { type HTMLInputTypeAttribute, useState } from "react";
import QRCode from "react-qr-code";
import {
  Activity,
  type LucideIcon,
  LockKeyhole,
  QrCode,
  Radar,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
  Search,
} from "lucide-react";
import {
  type WalletChain,
  type WalletCommandMap,
  type WalletOperation,
  type WalletSession,
} from "#/wallet";

export type ProtocolAsset = {
  id: string;
  label: string;
  chain: WalletChain;
  ticker: string;
  decimals: number;
  blurb: string;
  mayaAsset: string;
  tokenId?: string;
  priceUsd?: string;
};

const rawIcons = import.meta.glob("../assets/assets/icons/*.{png,svg}", {
  eager: true,
});
const iconMap: Record<string, string> = {};
for (const path in rawIcons) {
  const filename = path.split("/").pop()?.split(".")[0];
  if (filename) {
    iconMap[filename.toLowerCase()] =
      (rawIcons[path] as { default: string }).default ||
      (rawIcons[path] as string);
  }
}

export function AssetIcon({
  assetId,
  className = "w-6 h-6",
}: {
  assetId: string;
  className?: string;
}) {
  const src = iconMap[assetId.toLowerCase()];

  if (!src) {
    return (
      <div
        className={`rounded-full bg-[var(--line)] border border-[var(--sea-ink-soft)] ${className}`}
      />
    );
  }
  return (
    <img
      src={src}
      alt={assetId}
      className={`rounded-full object-contain ${className}`}
    />
  );
}

export const protocolAssets: ProtocolAsset[] = [
  {
    id: "cacao",
    label: "CACAO",
    chain: Chain.MayaChain,
    ticker: "CACAO",
    decimals: 10,
    mayaAsset: "MAYA.CACAO",
    blurb: "MayaChain native settlement asset",
  },
  {
    id: "eth",
    label: "ETH",
    chain: Chain.Ethereum,
    ticker: "ETH",
    decimals: 18,
    mayaAsset: "ETH.ETH",
    blurb: "Ethereum gas asset and common route origin",
  },
  {
    id: "usdc",
    label: "USDC",
    chain: Chain.Ethereum,
    ticker: "USDC",
    decimals: 6,
    mayaAsset: "ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    tokenId: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    blurb: "Stable route anchor on Ethereum",
  },
  {
    id: "btc",
    label: "BTC",
    chain: Chain.Bitcoin,
    ticker: "BTC",
    decimals: 8,
    mayaAsset: "BTC.BTC",
    blurb: "Bitcoin settlement destination",
  },
  {
    id: "ada",
    label: "ADA",
    chain: Chain.Cardano,
    ticker: "ADA",
    decimals: 6,
    mayaAsset: "ADA.ADA",
    blurb: "Cardano settlement destination",
  },
];

export const lpPositions = [
  { pool: "CACAO / ETH", apr: "14.2%", depth: "$12.4m", status: "balanced" },
  { pool: "CACAO / BTC", apr: "9.8%", depth: "$18.1m", status: "deep" },
  { pool: "CACAO / ADA", apr: "21.5%", depth: "$3.9m", status: "volatile" },
];

export function BoardHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <p className="island-kicker">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
        <p className="section-copy">{description}</p>
      </div>
      <div className="icon-chip">
        <Icon size={20} />
      </div>
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <p className="panel-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="panel-micro">{detail}</p>
    </article>
  );
}

export function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <article className="mini-metric">
      <p className="panel-label">{label}</p>
      <p className="mini-metric-value">{value}</p>
    </article>
  );
}

export function SignalTag({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "muted";
}) {
  return (
    <div className={`signal-tag signal-tag-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="summary-pill">
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DataCard({ title, data }: { title: string; data: unknown }) {
  const isEmptyObject =
    typeof data === "object" &&
    data !== null &&
    Object.keys(data as object).length === 0;

  return (
    <article className="data-card">
      <h3 className="data-card-title">{title}</h3>
      {isEmptyObject ? (
        <p className="panel-micro mt-3">No data captured yet.</p>
      ) : (
        <pre className="data-pre">
          <code>{JSON.stringify(data, null, 2)}</code>
        </pre>
      )}
    </article>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: HTMLInputTypeAttribute;
}) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      <select
        className="field-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="field-block field-toggle">
      <span className="field-label">{label}</span>
      <button
        className={`toggle-pill ${checked ? "toggle-pill-on" : ""}`}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span />
        {checked ? "Enabled" : "Disabled"}
      </button>
    </label>
  );
}

export function SessionCard({
  session,
  isSelected,
  actionChain,
  onSelect,
  onSwitchChain,
}: {
  session: WalletSession;
  isSelected: boolean;
  actionChain: string | null;
  onSelect: () => void;
  onSwitchChain: (chain: WalletChain) => void;
}) {
  return (
    <article
      className={`session-card ${isSelected ? "session-card-active" : ""}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="session-title">{session.label}</h3>
            <span className="status-badge">{session.status}</span>
          </div>
          <p className="session-kicker">
            {session.kind} / {session.source}
          </p>
        </div>
        <button className="wallet-btn" onClick={onSelect}>
          {isSelected ? "Selected" : "Select"}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {session.chains.map((chain) => (
          <button
            key={`${session.id}-${chain}`}
            className={`wallet-chip ${chain === actionChain ? "wallet-chip-active" : ""}`}
            onClick={() => onSwitchChain(chain)}
          >
            {chain}
          </button>
        ))}
      </div>

      <div className="session-meta-grid mt-5">
        <MetaItem label="Accounts" value={String(session.accounts.length)} />
        <MetaItem label="Vault type" value={session.vaultMeta?.type ?? "n/a"} />
        <MetaItem
          label="Encrypted"
          value={
            session.vaultMeta
              ? session.vaultMeta.isEncrypted
                ? "yes"
                : "no"
              : "n/a"
          }
        />
        <MetaItem label="Session id" value={session.id} monospace />
      </div>
    </article>
  );
}

export function SessionDeck({
  sessions,
  activeSessionId,
  activeChain,
  onSelect,
  onSwitchChain,
}: {
  sessions: WalletSession[];
  activeSessionId: string | null;
  activeChain: string | null;
  onSelect: (sessionId: string) => void;
  onSwitchChain: (sessionId: string, chain: WalletChain) => void;
}) {
  return sessions.length ? (
    <div className="grid gap-4">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          actionChain={activeChain}
          isSelected={session.id === activeSessionId}
          onSelect={() => onSelect(session.id)}
          onSwitchChain={(chain) => onSwitchChain(session.id, chain)}
          session={session}
        />
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <WalletCards size={24} />
      <div>
        <p className="empty-title">No sessions discovered</p>
        <p className="empty-copy">
          Initialize and refresh the wallet manager to populate extension or SDK
          contexts for protocol actions.
        </p>
      </div>
    </div>
  );
}

export function OperationFeed({
  latestOperation,
}: {
  latestOperation: WalletOperation | null;
}) {
  const progressValue =
    typeof latestOperation?.progress?.value === "number"
      ? Math.max(0, Math.min(100, latestOperation.progress.value))
      : null;

  return latestOperation ? (
    <div className="mt-6 space-y-5">
      <div className="operation-header">
        <div>
          <p className="panel-label">{latestOperation.name}</p>
          <h3 className="operation-title">
            {latestOperation.progress?.message ?? "Waiting for next update"}
          </h3>
        </div>
        <span className="status-badge">{latestOperation.status}</span>
      </div>

      {progressValue !== null ? (
        <div className="space-y-2">
          <div className="progress-track">
            <span style={{ width: `${progressValue}%` }} />
          </div>
          <p className="panel-micro">{progressValue}% complete</p>
        </div>
      ) : null}

      {latestOperation.deviceJoin ? (
        <div className="join-meter">
          <span>Devices joined</span>
          <strong>
            {latestOperation.deviceJoin.joined}/
            {latestOperation.deviceJoin.required}
          </strong>
        </div>
      ) : null}

      {latestOperation.qrPayload ? (
        <div className="qr-shell">
          <QRCode value={latestOperation.qrPayload} />
        </div>
      ) : null}
    </div>
  ) : (
    <div className="empty-state mt-6">
      <Radar size={24} />
      <div>
        <p className="empty-title">No protocol action has run yet</p>
        <p className="empty-copy">
          Quotes, prepared payloads, and multi-device signing prompts will
          surface here once a swap or wallet action is executed.
        </p>
      </div>
    </div>
  );
}

export function WalletDock({
  actionChain,
  activeSession,
  sessionCount,
  canConnect,
  canFetchAddress,
  canFetchBalance,
  onInitialize,
  onRefresh,
  onConnect,
  onFetchAddress,
  onFetchBalance,
  onToggleVaultLock,
}: {
  actionChain: string;
  activeSession: WalletSession | null;
  sessionCount: number;
  canConnect: boolean;
  canFetchAddress: boolean;
  canFetchBalance: boolean;
  onInitialize: () => void;
  onRefresh: () => void;
  onConnect: () => void;
  onFetchAddress: () => void;
  onFetchBalance: () => void;
  onToggleVaultLock?: () => void;
}) {
  return (
    <>
      <div className="summary-ribbon mt-6">
        <SummaryPill label="Active chain" value={actionChain} />
        <SummaryPill label="Session" value={activeSession?.label ?? "none"} />
        <SummaryPill label="Sessions" value={String(sessionCount)} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button className="wallet-btn" onClick={onInitialize}>
          Initialize
        </button>
        <button className="wallet-btn" onClick={onRefresh}>
          <RefreshCw size={16} />
          Refresh
        </button>
        <button
          className="wallet-btn"
          disabled={!canConnect}
          onClick={onConnect}
        >
          Connect chain
        </button>
        <button
          className="wallet-btn"
          disabled={!canFetchAddress}
          onClick={onFetchAddress}
        >
          Fetch address
        </button>
        <button
          className="wallet-btn sm:col-span-2"
          disabled={!canFetchBalance}
          onClick={onFetchBalance}
        >
          <Activity size={16} />
          Fetch balance
        </button>
      </div>

      {activeSession?.source === "sdk" && onToggleVaultLock ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button className="wallet-btn" onClick={onToggleVaultLock}>
            <LockKeyhole size={16} />
            {activeSession.status === "locked" ? "Unlock vault" : "Lock vault"}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function QuickLinkCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="quick-link-card no-underline">
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <h3 className="session-title">{title}</h3>
      <p className="panel-micro mt-2">{description}</p>
    </Link>
  );
}

function MetaItem({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="meta-item">
      <span>{label}</span>
      <strong className={monospace ? "font-mono text-xs" : ""}>{value}</strong>
    </div>
  );
}

export function resolveSessionAddress(
  session: WalletSession | null,
  chain: WalletChain,
): string {
  if (!session) {
    return "";
  }

  return (
    session.addresses[chain] ??
    session.accounts.find((account) => account.chain === chain)?.address ??
    ""
  );
}

export function toAccountCoin(asset: ProtocolAsset, address: string) {
  return {
    chain: asset.chain,
    ticker: asset.ticker,
    decimals: asset.decimals,
    address,
    ...(asset.tokenId ? { id: asset.tokenId } : {}),
  };
}

export function shortenAddress(value: string): string {
  return value.length > 14
    ? `${value.slice(0, 8)}...${value.slice(-4)}`
    : value;
}

export function formatUnknown(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (typeof value === "object") {
    return "available";
  }

  return "n/a";
}

export function getObjectRecord(
  value: unknown,
): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export type SwapQuote = WalletCommandMap["swap.quote"]["output"]["quote"];
export type SwapPreparePayload =
  WalletCommandMap["swap.prepare"]["output"]["payload"];

export const protocolIcons = {
  ShieldCheck,
  QrCode,
};

export function SelectionModal({
  isOpen,
  onClose,
  title,
  items,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: {
    id: string;
    label: string;
    iconMain: string;
    iconSub?: string;
    subtitle?: string;
    priceUsd?: string;
    balanceRaw?: string;
    chainBadge?: string;
    statusBadge?: string;
  }[];
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  if (!isOpen) return null;

  const filtered = items.filter(
    (i) =>
      i.label.toLowerCase().includes(search.toLowerCase()) ||
      i.id.toLowerCase().includes(search.toLowerCase()) ||
      i.subtitle?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="glass-panel-strong w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl relative overflow-hidden bg-[var(--bg-base)] border border-[var(--line)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b border-[var(--line)] bg-[var(--surface)]">
          <span className="font-bold text-lg text-[var(--sea-ink)] tracking-tight">
            {title}
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--sea-ink-soft)] hover:text-[var(--cacao-neon)] hover:bg-[var(--chip-bg)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center gap-3 bg-[var(--chip-bg)] border border-[var(--line)] focus-within:border-[var(--maya-teal)] rounded-xl px-4 py-3 transition-colors shadow-inner">
            <Search size={18} className="text-[var(--sea-ink-soft)]" />
            <input
              autoFocus
              className="super-input text-base"
              placeholder="Search name or symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 bg-[var(--bg-base)]">
          {filtered.map((item) => (
            <button
              key={item.id}
              className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-[var(--surface-strong)] transition-all text-left group"
              onClick={() => {
                onSelect(item.id);
                onClose();
              }}
            >
              <div className="relative flex items-center justify-center min-w-[3rem]">
                <AssetIcon
                  assetId={item.iconMain}
                  className="w-10 h-10 relative z-10 shadow-sm border border-[var(--line)] bg-[var(--bg-base)]"
                />
                {item.iconSub && (
                  <AssetIcon
                    assetId={item.iconSub}
                    className="w-10 h-10 relative -ml-4 z-0 shadow-sm border-2 border-[var(--bg-base)] opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                )}
              </div>
              <div className="flex flex-col flex-1 pl-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--sea-ink)] text-lg leading-tight group-hover:text-[var(--maya-teal)] transition-colors">
                    {item.label}
                  </span>
                  {item.chainBadge && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)] bg-[var(--surface-strong)] px-1.5 py-0.5 rounded border border-[var(--line)]">
                      {item.chainBadge}
                    </span>
                  )}
                  {item.statusBadge && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      {item.statusBadge}
                    </span>
                  )}
                </div>
                {item.subtitle && (
                  <span className="text-xs font-medium text-[var(--sea-ink-soft)] mt-0.5">
                    {item.subtitle}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end pr-2 text-right">
                {item.balanceRaw !== undefined ? (
                  <span
                    className={`font-bold text-base ${Number(item.balanceRaw) > 0 ? "text-[var(--maya-teal)]" : "text-[var(--sea-ink)]"}`}
                  >
                    {Number(item.balanceRaw) > 0
                      ? Number(item.balanceRaw)
                          .toFixed(4)
                          .replace(/\.?0+$/, "")
                      : "0.00"}
                  </span>
                ) : null}
                {item.priceUsd && (
                  <span className="text-[11px] font-medium text-[var(--sea-ink-soft)] mt-0.5">
                    $
                    {Number(item.priceUsd) < 0.01
                      ? "<0.01"
                      : Number(item.priceUsd).toFixed(2)}
                  </span>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 text-[var(--sea-ink-soft)]">
              <Search
                size={32}
                className="opacity-30 mb-3 text-[var(--sea-ink-soft)]"
              />
              <p>No assets found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
