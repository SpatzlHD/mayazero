import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ChevronDown,
  Download,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Vault,
  WalletCards,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  getSupportedSessionChains,
  supportedWalletChains,
  useActiveWalletSession,
  useMayaWalletActions,
  useMayaWalletState,
} from "#/wallet";
import type { WalletSession } from "#/wallet";
import { Chain } from "@vultisig/sdk";
import { AssetIcon, shortenAddress } from "./ProtocolPrimitives";
import { isDevModeEnabled } from "#/lib/dev-mode";

const chainIconMap: Record<string, string> = {
  THORChain: "rune",
  MayaChain: "cacao",
  Bitcoin: "btc",
  Kujira: "kuji",
  Ethereum: "eth",
  Dash: "dash",
  Arbitrum: "arb",
  Zcash: "zec",
};

type WalletManagerMenuContentProps = {
  activeSession: WalletSession | null;
  sessions: WalletSession[];
  activeSessionId: string | null;
  availableChains: Chain[];
  actionChain: Chain;
  canConnect: boolean;
  canFetchData: boolean;
  canExport: boolean;
  showDebugControls: boolean;
  unlockSessionId: string | null;
  unlockPassword: string;
  isUnlocking: boolean;
  unlockError: string;
  onUnlockPasswordChange: (value: string) => void;
  onUnlockSubmit: (e: React.FormEvent) => void;
  onUnlockClose: () => void;
  isExportModalOpen: boolean;
  exportPassword: string;
  isExporting: boolean;
  exportError: string;
  onExportPasswordChange: (value: string) => void;
  onExportSubmit: (e: React.FormEvent) => void;
  onExportOpen: () => void;
  onExportClose: () => void;
  onCreateVault: () => void;
  onSessionClick: (sessionId: string, status: string) => void;
  onSelectChain: (chain: Chain) => void;
  onConnect: () => void;
  onRefreshData: () => void;
  onToggleVaultLock: () => void;
  onInitialize: () => void;
  onRefreshSessions: () => void;
};

function getChainIconId(chain: string) {
  return chainIconMap[chain] || chain.toLowerCase();
}

export function shouldShowWalletManagerDebugControls(
  isDev: boolean,
  search: string,
) {
  return isDevModeEnabled(isDev, search);
}

export function downloadWalletExportFile(
  exported: { filename: string; data: string },
  dependencies: {
    documentLike?: {
      createElement: (tagName: string) => HTMLAnchorElement;
      body: {
        appendChild: (node: HTMLAnchorElement) => unknown;
        removeChild: (node: HTMLAnchorElement) => unknown;
      };
    };
    urlLike?: {
      createObjectURL: (blob: Blob) => string;
      revokeObjectURL: (url: string) => void;
    };
  } = {},
) {
  const documentLike = dependencies.documentLike ?? document;
  const urlLike = dependencies.urlLike ?? URL;
  const blob = new Blob([exported.data], { type: "text/plain;charset=utf-8" });
  const url = urlLike.createObjectURL(blob);
  const link = documentLike.createElement("a") as HTMLAnchorElement;

  link.href = url;
  link.download = exported.filename;
  documentLike.body.appendChild(link);
  link.click();
  documentLike.body.removeChild(link);
  urlLike.revokeObjectURL(url);
}

export function WalletManagerMenuContent({
  activeSession,
  sessions,
  activeSessionId,
  availableChains,
  actionChain,
  canConnect,
  canFetchData,
  canExport,
  showDebugControls,
  unlockSessionId,
  unlockPassword,
  isUnlocking,
  unlockError,
  onUnlockPasswordChange,
  onUnlockSubmit,
  onUnlockClose,
  isExportModalOpen,
  exportPassword,
  isExporting,
  exportError,
  onExportPasswordChange,
  onExportSubmit,
  onExportOpen,
  onExportClose,
  onCreateVault,
  onSessionClick,
  onSelectChain,
  onConnect,
  onRefreshData,
  onToggleVaultLock,
  onInitialize,
  onRefreshSessions,
}: WalletManagerMenuContentProps) {
  return (
    <div className="absolute top-full right-0 mt-3 w-[min(calc(100vw-2rem),360px)] max-h-[min(calc(100vh-7rem),720px)] glass-panel-strong p-5 shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200 z-[100] border border-[var(--line)] overflow-x-hidden overflow-y-auto overscroll-contain">
      {unlockSessionId && (
        <div className="absolute inset-0 z-40 glass-panel-strong bg-[var(--bg-base)]/95 backdrop-blur-xl p-5 flex flex-col justify-center animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-[var(--sea-ink)]">
              <LockKeyhole size={18} className="text-[var(--maya-teal)]" />
              <span className="font-bold text-base">Unlock Vault</span>
            </div>
            <button
              onClick={onUnlockClose}
              className="p-1.5 rounded-full hover:bg-[var(--surface)] text-[var(--sea-ink-soft)] transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <form onSubmit={onUnlockSubmit} className="flex flex-col gap-4">
            <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center focus-within:border-[var(--maya-teal)] transition-colors">
              <input
                type="password"
                required
                value={unlockPassword}
                onChange={(e) => onUnlockPasswordChange(e.target.value)}
                placeholder="Enter vault encryption password"
                className="super-input text-sm w-full"
                disabled={isUnlocking}
                autoFocus
              />
            </div>
            {unlockError && (
              <p className="text-red-500 text-xs font-bold px-1">
                {unlockError}
              </p>
            )}

            <button
              type="submit"
              disabled={isUnlocking || !unlockPassword}
              className="w-full mt-2 p-3 text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] rounded-xl shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isUnlocking ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Unlock & Switch Session"
              )}
            </button>
          </form>
        </div>
      )}

      {isExportModalOpen && (
        <div className="absolute inset-0 z-40 glass-panel-strong bg-[var(--bg-base)]/95 backdrop-blur-xl p-5 flex flex-col justify-center animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-[var(--sea-ink)]">
              <Download size={18} className="text-[var(--maya-teal)]" />
              <span className="font-bold text-base">Export Vault Backup</span>
            </div>
            <button
              onClick={onExportClose}
              className="p-1.5 rounded-full hover:bg-[var(--surface)] text-[var(--sea-ink-soft)] transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <form onSubmit={onExportSubmit} className="flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs font-medium text-[var(--sea-ink-soft)]">
              Create a downloadable backup for{" "}
              <span className="font-bold text-[var(--sea-ink)]">
                {activeSession?.label || "your vault"}
              </span>
              . Add a backup password to encrypt the exported file.
            </div>
            <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center focus-within:border-[var(--maya-teal)] transition-colors">
              <input
                type="password"
                value={exportPassword}
                onChange={(e) => onExportPasswordChange(e.target.value)}
                placeholder="Optional backup password"
                className="super-input text-sm w-full"
                disabled={isExporting}
                autoFocus
              />
            </div>
            {exportError && (
              <p className="text-red-500 text-xs font-bold px-1">
                {exportError}
              </p>
            )}

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={onExportClose}
                className="secondary-btn flex-1 py-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isExporting}
                className="cacao-btn flex-1 py-3 flex items-center justify-center gap-2"
              >
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <Download size={14} />
                    Export
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-[var(--sea-ink)] flex items-center gap-2">
          <ShieldCheck size={18} className="text-[var(--maya-teal)]" />
          Vault Manager
        </span>
        <span className="kicker !text-xs">{sessions.length} Sessions</span>
      </div>

      <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] block mb-2">
              Active Vault
            </span>
            {activeSession ? (
              <>
                <div className="flex items-center gap-2 text-[var(--sea-ink)]">
                  <Vault
                    size={16}
                    className="text-[var(--maya-teal)] shrink-0"
                  />
                  <span className="font-bold truncate">
                    {activeSession.label || "Vault"}
                  </span>
                  {activeSession.status === "locked" && (
                    <LockKeyhole size={14} className="opacity-50 shrink-0" />
                  )}
                </div>
                <p className="mt-1 text-xs font-medium text-[var(--sea-ink-soft)]">
                  {activeSession.source === "sdk"
                    ? `${activeSession.vaultMeta?.type === "fast" ? "Fast" : "Secure"} vault`
                    : "Vultisig extension"}{" "}
                  - {availableChains.length} supported chains
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[var(--sea-ink)]">
                  <Vault
                    size={16}
                    className="text-[var(--sea-ink-soft)] shrink-0"
                  />
                  <span className="font-bold">No active vault</span>
                </div>
                <p className="mt-1 text-xs font-medium text-[var(--sea-ink-soft)]">
                  Create or import a vault to manage addresses, balances, and
                  secure backups.
                </p>
              </>
            )}
          </div>
          {activeSession && (
            <span className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
              {activeSession.status}
            </span>
          )}
        </div>
        {canExport ? (
          <div className="grid grid-cols-2 items-start gap-3 mt-4">
            <button
              className="cacao-btn py-3 flex items-center justify-center gap-2 self-start"
              onClick={onCreateVault}
            >
              <Plus size={14} />
              Add Vault
            </button>

            <button
              className="secondary-btn py-3 flex items-center justify-center gap-2"
              onClick={onExportOpen}
            >
              <Download size={14} />
              Export Vault
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 mt-4">
            <button
              className="cacao-btn py-3 flex items-center justify-center gap-2 self-start"
              onClick={onCreateVault}
            >
              <Plus size={14} />
              Add Vault
            </button>
            <p className="text-xs text-[var(--sea-ink-soft)]">
              Create a new vault or import an existing one from setup. Export is
              available for the active SDK vault.
            </p>
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="mb-4 p-3 bg-[var(--surface)] border border-[var(--line)] rounded-xl">
          <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] block mb-2">
            Switch Wallet Session
          </span>
          <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSessionClick(session.id, session.status)}
                className={`p-2 rounded-lg text-sm text-left flex items-center justify-between transition-colors ${
                  activeSessionId === session.id
                    ? "bg-[var(--chip-bg)] text-[var(--maya-teal)] font-bold shadow-inner"
                    : "text-[var(--sea-ink)] hover:bg-[var(--surface-strong)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5">
                      {session.label}
                      {session.status === "locked" && (
                        <LockKeyhole size={12} className="opacity-50" />
                      )}
                    </span>
                    <span className="text-[10px] font-normal text-[var(--sea-ink-soft)] capitalize">
                      {session.kind} {session.source === "sdk" ? "vault" : ""}
                    </span>
                  </div>
                </div>
                {activeSessionId === session.id && (
                  <Zap size={14} className="fill-[var(--maya-teal)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeSession ? (
        <div className="space-y-3 mt-2">
          <div className="mb-2 bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
            <div className="p-3 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-strong)]">
              <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)]">
                Session Chains
              </span>
            </div>
            <div className="flex flex-col max-h-[240px] overflow-y-auto custom-scrollbar p-1.5 gap-1">
              {availableChains.length ? (
                availableChains.map((chain) => {
                  const address = activeSession.addresses[chain];
                  const isConnected = !!address;
                  const isSelected = actionChain === chain;

                  return (
                    <button
                      key={chain}
                      onClick={() => onSelectChain(chain)}
                      className={`p-2 rounded-lg flex items-center justify-between transition-all border ${
                        isSelected
                          ? "border-[var(--maya-teal)] bg-[rgba(26,154,141,0.05)] shadow-sm"
                          : "border-transparent hover:bg-[var(--surface-strong)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <AssetIcon
                          assetId={getChainIconId(chain)}
                          className="w-6 h-6 shadow-sm"
                        />
                        <span
                          className={`text-sm font-bold ${
                            isSelected
                              ? "text-[var(--maya-teal)]"
                              : "text-[var(--sea-ink)]"
                          }`}
                        >
                          {chain}
                        </span>
                      </div>
                      <div className="text-right flex flex-col">
                        {isConnected ? (
                          <span className="text-xs font-mono text-[var(--sea-ink-soft)] bg-[var(--bg-base)] px-2 py-0.5 rounded-md border border-[var(--line)] shadow-sm">
                            {shortenAddress(address)}
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] opacity-60 flex items-center gap-1 bg-[var(--surface)] px-2 py-0.5 rounded-md border border-[var(--line)]">
                            <Unplug size={10} />
                            Offline
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-xs font-medium text-[var(--sea-ink-soft)]">
                  No Maya-supported chains are available for this session.
                </div>
              )}
            </div>
          </div>
          {activeSession.source === "sdk" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onToggleVaultLock}
                className="p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LockKeyhole size={14} />
                {activeSession.status === "locked"
                  ? "Unlock Vault"
                  : "Lock Vault"}
              </button>

              <button
                disabled={!canFetchData}
                onClick={onRefreshData}
                className="p-2.5 rounded-lg text-xs font-semibold bg-[var(--chip-bg)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] hover:border-[var(--sea-ink-soft)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Activity size={14} />
                Refresh Data
              </button>
            </div>
          ) : (
            <div
              className={`grid gap-2 ${canConnect ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {canConnect && (
                <button
                  onClick={onConnect}
                  className="p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <WalletCards size={14} />
                  Connect Extension
                </button>
              )}

              <button
                disabled={!canFetchData}
                onClick={onRefreshData}
                className="p-2.5 rounded-lg text-xs font-semibold bg-[var(--chip-bg)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] hover:border-[var(--sea-ink-soft)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Activity size={14} />
                Refresh Data
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 p-4 text-center rounded-xl bg-[var(--surface)] border border-[var(--line)]">
          <span className="text-xs font-semibold text-[var(--sea-ink-soft)] block mb-3">
            No active session detected.
          </span>
          <button
            onClick={onCreateVault}
            className="w-full p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck size={14} />
            Add Vault
          </button>
        </div>
      )}

      {showDebugControls && (
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <div className="flex items-center gap-2 mb-3 text-[var(--sea-ink-soft)]">
            <Wrench size={14} />
            <span className="text-[10px] uppercase font-bold tracking-[0.2em]">
              Debug
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--chip-bg)] border border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] transition-all group"
              onClick={onInitialize}
            >
              <Unplug
                size={16}
                className="text-[var(--sea-ink-soft)] group-hover:text-[var(--cacao-neon)] mb-1 transition-colors"
              />
              <span className="text-xs font-semibold text-[var(--sea-ink)]">
                Initialize
              </span>
            </button>
            <button
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--chip-bg)] border border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] transition-all group"
              onClick={onRefreshSessions}
            >
              <RefreshCw
                size={16}
                className="text-[var(--sea-ink-soft)] group-hover:text-[var(--maya-teal)] mb-1 transition-colors"
              />
              <span className="text-xs font-semibold text-[var(--sea-ink)]">
                Refresh
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WalletManager() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const wallet = useMayaWalletActions();
  const state = useMayaWalletState();
  const activeSession = useActiveWalletSession();

  const [unlockSessionId, setUnlockSessionId] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const availableChains = activeSession?.chains.length
    ? getSupportedSessionChains(activeSession.chains)
    : supportedWalletChains;
  const actionChain =
    state.activeChain && availableChains.includes(state.activeChain)
      ? state.activeChain
      : (availableChains[0] ?? activeSession?.chains[0] ?? Chain.MayaChain);

  const canFetchData = wallet.canExecute("addresses.list", {
    sessionId: activeSession?.id,
  });
  const canConnect =
    activeSession?.source === "extension"
      ? wallet.canExecute("accounts.connect", {
          sessionId: activeSession.id,
        })
      : false;
  const canExport =
    activeSession?.source === "sdk"
      ? wallet.canExecute("vault.export", {
          sessionId: activeSession.id,
        })
      : false;
  const showDebugControls = shouldShowWalletManagerDebugControls(
    import.meta.env.DEV,
    typeof window !== "undefined" ? window.location.search : "",
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen && unlockSessionId) {
      setTimeout(() => {
        setUnlockSessionId(null);
        setUnlockPassword("");
        setUnlockError("");
      }, 200);
    }
  }, [isOpen, unlockSessionId]);

  useEffect(() => {
    if (!isOpen && isExportModalOpen) {
      setTimeout(() => {
        setIsExportModalOpen(false);
        setExportPassword("");
        setExportError("");
      }, 200);
    }
  }, [isOpen, isExportModalOpen]);

  async function runWalletAction(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {}
  }

  async function loadAllData() {
    if (!availableChains.length) return;

    try {
      await wallet.execute("addresses.list", {
        input: { chains: availableChains },
      });
    } catch {}

    try {
      await wallet.execute("balances.list", {
        input: { chains: availableChains },
      });
    } catch {}
  }

  async function handleSessionClick(sessionId: string, status: string) {
    if (status === "locked") {
      setUnlockSessionId(sessionId);
      setUnlockPassword("");
      setUnlockError("");
      return;
    }

    await runWalletAction(() => wallet.selectSession(sessionId));
  }

  async function handleUnlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unlockSessionId || !unlockPassword) return;

    setIsUnlocking(true);
    setUnlockError("");

    try {
      await wallet.execute("vault.unlock", {
        input: { password: unlockPassword },
        sessionId: unlockSessionId,
      });
      await wallet.refreshSessions();
      await wallet.selectSession(unlockSessionId);
      setUnlockSessionId(null);
      setUnlockPassword("");
    } catch (err: any) {
      setUnlockError(
        err?.message || "Unlock failed. Please check your password.",
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  async function connectExtensionAccounts() {
    if (!activeSession || activeSession.source !== "extension") return;

    await wallet.execute("accounts.connect", {
      sessionId: activeSession.id,
      input: {},
    });
  }

  async function handleExportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession || activeSession.source !== "sdk" || !canExport) return;

    setIsExporting(true);
    setExportError("");

    try {
      const exported = await wallet.execute("vault.export", {
        sessionId: activeSession.id,
        input: {
          password: exportPassword || undefined,
        },
      });

      downloadWalletExportFile(exported);
      setIsExportModalOpen(false);
      setExportPassword("");
    } catch (err: any) {
      setExportError(err?.message || "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  async function toggleVaultLock() {
    if (!activeSession || activeSession.source !== "sdk") return;

    if (activeSession.status === "locked") {
      setUnlockSessionId(activeSession.id);
      setUnlockPassword("");
      setUnlockError("");
      return;
    }

    await wallet.execute("vault.lock", {
      input: {},
      sessionId: activeSession.id,
    });
    await wallet.refreshSessions();
  }

  function handleCreateVault() {
    setIsOpen(false);
    navigate({ to: "/vault-setup" });
  }

  function handleCloseUnlock() {
    setUnlockSessionId(null);
    setUnlockPassword("");
    setUnlockError("");
  }

  function handleOpenExport() {
    setIsExportModalOpen(true);
    setExportPassword("");
    setExportError("");
  }

  function handleCloseExport() {
    setIsExportModalOpen(false);
    setExportPassword("");
    setExportError("");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-[1rem] border transition-all duration-300 font-bold text-sm ${
          activeSession
            ? "border-[var(--maya-teal)] bg-[rgba(26,154,141,0.1)] text-[var(--maya-teal)] shadow-[0_0_12px_rgba(26,154,141,0.2)] hover:bg-[rgba(26,154,141,0.15)]"
            : "border-[var(--line)] hover:border-[var(--sea-ink-soft)] bg-[var(--surface-strong)] text-[var(--sea-ink)] shadow-sm"
        }`}
      >
        <WalletCards
          size={16}
          className={
            activeSession
              ? "text-[var(--maya-teal)]"
              : "text-[var(--sea-ink-soft)]"
          }
        />
        {activeSession ? (
          <>
            <span>{activeSession.label || "Vault"}</span>
            {activeSession.status === "locked" && (
              <LockKeyhole size={14} className="ml-1 opacity-50" />
            )}
            <ChevronDown
              size={14}
              className={`ml-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </>
        ) : (
          <span>Connect Vault</span>
        )}
      </button>

      {isOpen && (
        <WalletManagerMenuContent
          activeSession={activeSession}
          sessions={state.sessions}
          activeSessionId={state.activeSessionId}
          availableChains={availableChains}
          actionChain={actionChain}
          canConnect={canConnect}
          canFetchData={canFetchData}
          canExport={canExport}
          showDebugControls={showDebugControls}
          unlockSessionId={unlockSessionId}
          unlockPassword={unlockPassword}
          isUnlocking={isUnlocking}
          unlockError={unlockError}
          onUnlockPasswordChange={setUnlockPassword}
          onUnlockSubmit={handleUnlockSubmit}
          onUnlockClose={handleCloseUnlock}
          isExportModalOpen={isExportModalOpen}
          exportPassword={exportPassword}
          isExporting={isExporting}
          exportError={exportError}
          onExportPasswordChange={setExportPassword}
          onExportSubmit={handleExportSubmit}
          onExportOpen={handleOpenExport}
          onExportClose={handleCloseExport}
          onCreateVault={handleCreateVault}
          onSessionClick={(sessionId, status) => {
            void handleSessionClick(sessionId, status);
          }}
          onSelectChain={(chain) => {
            void runWalletAction(() => wallet.selectChain(chain));
          }}
          onConnect={() => {
            void runWalletAction(connectExtensionAccounts);
          }}
          onRefreshData={() => {
            void runWalletAction(loadAllData);
          }}
          onToggleVaultLock={() => {
            void runWalletAction(toggleVaultLock);
          }}
          onInitialize={() => {
            void runWalletAction(() => wallet.initialize());
            setIsOpen(false);
          }}
          onRefreshSessions={() => {
            void runWalletAction(() => wallet.refreshSessions());
          }}
        />
      )}
    </div>
  );
}
