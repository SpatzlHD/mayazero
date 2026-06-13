import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ChevronDown,
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
import { WalletChain as Chain } from "#/wallet/chain-types";
import { AssetIcon, shortenAddress } from "./ProtocolPrimitives";
import { isDevModeEnabled } from "#/lib/dev-mode";
import { isWalletConnectConfigured } from "#/wallet/walletconnect-client";
import { toast } from "sonner";

const chainIconMap: Record<string, string> = {
  THORChain: "rune",
  MayaChain: "cacao",
  Bitcoin: "btc",
  Cardano: "ada",
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
  showDebugControls: boolean;
  unlockSessionId: string | null;
  unlockPassword: string;
  isUnlocking: boolean;
  unlockError: string;
  onUnlockPasswordChange: (value: string) => void;
  onUnlockSubmit: (e: React.FormEvent) => void;
  onUnlockClose: () => void;
  onImportKeystore: () => void;
  onConnectWallet: () => void;
  onSessionClick: (sessionId: string, status: string) => void;
  onSelectChain: (chain: Chain) => void;
  onConnect: () => void;
  onRefreshData: () => void;
  onToggleKeystoreLock: () => void;
  onInitialize: () => void;
  onRefreshSessions: () => void;
};

function getChainIconId(chain: string) {
  return chainIconMap[chain] || chain.toLowerCase();
}

function getSessionSourceLabel(source: WalletSession["source"]): string {
  switch (source) {
    case "keystore":
      return "Local keystore";
    case "walletconnect":
      return "WalletConnect";
    case "extension":
      return "Vultisig extension";
    default:
      return "Wallet";
  }
}

export function shouldShowWalletManagerDebugControls(
  isDev: boolean,
  search: string,
) {
  return isDevModeEnabled(isDev, search);
}

export function WalletManagerMenuContent({
  activeSession,
  sessions,
  activeSessionId,
  availableChains,
  actionChain,
  canConnect,
  canFetchData,
  showDebugControls,
  unlockSessionId,
  unlockPassword,
  isUnlocking,
  unlockError,
  onUnlockPasswordChange,
  onUnlockSubmit,
  onUnlockClose,
  onImportKeystore,
  onConnectWallet,
  onSessionClick,
  onSelectChain,
  onConnect,
  onRefreshData,
  onToggleKeystoreLock,
  onInitialize,
  onRefreshSessions,
}: WalletManagerMenuContentProps) {
  const connectLabel =
    activeSession?.source === "walletconnect"
      ? "Connect Wallet"
      : "Connect Extension";

  return (
    <div className="absolute top-full right-0 mt-3 w-[min(calc(100vw-2rem),360px)] max-h-[min(calc(100vh-7rem),720px)] glass-panel-strong p-5 shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200 z-[100] border border-[var(--line)] overflow-x-hidden overflow-y-auto overscroll-contain">
      {unlockSessionId && (
        <div className="absolute inset-0 z-40 glass-panel-strong bg-[var(--bg-base)]/95 backdrop-blur-xl p-5 flex flex-col justify-center animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-[var(--sea-ink)]">
              <LockKeyhole size={18} className="text-[var(--maya-teal)]" />
              <span className="font-bold text-base">Unlock Wallet</span>
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
                placeholder="Enter wallet encryption password"
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

      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-[var(--sea-ink)] flex items-center gap-2">
          <ShieldCheck size={18} className="text-[var(--maya-teal)]" />
          Wallet Manager
        </span>
        <span className="kicker !text-xs">{sessions.length} Sessions</span>
      </div>

      <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] block mb-2">
              Active Wallet
            </span>
            {activeSession ? (
              <>
                <div className="flex items-center gap-2 text-[var(--sea-ink)]">
                  <Vault
                    size={16}
                    className="text-[var(--maya-teal)] shrink-0"
                  />
                  <span className="font-bold truncate">
                    {activeSession.label || "Wallet"}
                  </span>
                  {activeSession.status === "locked" && (
                    <LockKeyhole size={14} className="opacity-50 shrink-0" />
                  )}
                </div>
                <p className="mt-1 text-xs font-medium text-[var(--sea-ink-soft)]">
                  {getSessionSourceLabel(activeSession.source)} -{" "}
                  {availableChains.length} supported chains
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[var(--sea-ink)]">
                  <Vault
                    size={16}
                    className="text-[var(--sea-ink-soft)] shrink-0"
                  />
                  <span className="font-bold">No active wallet</span>
                </div>
                <p className="mt-1 text-xs font-medium text-[var(--sea-ink-soft)]">
                  Import a keystore, connect via WalletConnect, or use the
                  Vultisig extension.
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
        <div className="grid grid-cols-2 items-start gap-3 mt-4">
          <button
            className="cacao-btn py-3 flex items-center justify-center gap-2 self-start"
            onClick={onImportKeystore}
          >
            <Plus size={14} />
            Import Keystore
          </button>
          <button
            className="secondary-btn py-3 flex items-center justify-center gap-2"
            onClick={onConnectWallet}
          >
            <WalletCards size={14} />
            Connect Wallet
          </button>
        </div>
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
                      {getSessionSourceLabel(session.source)}
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
          {activeSession.source === "keystore" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onToggleKeystoreLock}
                className="p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LockKeyhole size={14} />
                {activeSession.status === "locked"
                  ? "Unlock Wallet"
                  : "Lock Wallet"}
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
                  {connectLabel}
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
            onClick={onImportKeystore}
            className="w-full p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck size={14} />
            Import Keystore
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

  const availableChains = activeSession?.chains.length
    ? getSupportedSessionChains(activeSession.chains)
    : supportedWalletChains;
  const actionChain =
    state.activeChain && availableChains.includes(state.activeChain)
      ? state.activeChain
      : (availableChains[0] ?? activeSession?.chains[0] ?? Chain.MayaChain);

  const sessionNotReady =
    activeSession != null && activeSession.status !== "ready";
  const canConnect = activeSession
    ? activeSession.source === "extension"
      ? sessionNotReady &&
        wallet.canExecute("accounts.connect", {
          sessionId: activeSession.id,
        })
      : activeSession.source === "walletconnect"
        ? sessionNotReady
        : false
    : false;
  const canFetchData = wallet.canExecute("addresses.list", {
    sessionId: activeSession?.id,
  });
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

  async function runWalletAction(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Wallet action failed",
      );
    }
  }

  async function handleConnectWallet() {
    if (!isWalletConnectConfigured()) {
      toast.error(
        "WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID (free at cloud.reown.com).",
      );
      return;
    }

    await runWalletAction(async () => {
      await wallet.connectWalletConnect();
    });
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
      await wallet.execute("keystore.unlock", {
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

  async function connectWallet() {
    if (!activeSession) {
      await wallet.connectWalletConnect();
      return;
    }

    if (activeSession.source === "walletconnect") {
      await wallet.connectWalletConnect();
      return;
    }

    if (activeSession.source === "extension") {
      await connectExtensionAccounts();
    }
  }

  async function toggleKeystoreLock() {
    if (!activeSession || activeSession.source !== "keystore") return;

    if (activeSession.status === "locked") {
      setUnlockSessionId(activeSession.id);
      setUnlockPassword("");
      setUnlockError("");
      return;
    }

    await wallet.execute("keystore.lock", {
      input: {},
      sessionId: activeSession.id,
    });
    await wallet.refreshSessions();
  }

  function handleImportKeystore() {
    setIsOpen(false);
    navigate({ to: "/vault-setup" });
  }

  function handleCloseUnlock() {
    setUnlockSessionId(null);
    setUnlockPassword("");
    setUnlockError("");
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
            <span>{activeSession.label || "Wallet"}</span>
            {activeSession.status === "locked" && (
              <LockKeyhole size={14} className="ml-1 opacity-50" />
            )}
            <ChevronDown
              size={14}
              className={`ml-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </>
        ) : (
          <span>Connect Wallet</span>
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
          showDebugControls={showDebugControls}
          unlockSessionId={unlockSessionId}
          unlockPassword={unlockPassword}
          isUnlocking={isUnlocking}
          unlockError={unlockError}
          onUnlockPasswordChange={setUnlockPassword}
          onUnlockSubmit={handleUnlockSubmit}
          onUnlockClose={handleCloseUnlock}
          onImportKeystore={handleImportKeystore}
          onConnectWallet={() => {
            void handleConnectWallet();
          }}
          onSessionClick={(sessionId, status) => {
            void handleSessionClick(sessionId, status);
          }}
          onSelectChain={(chain) => {
            void runWalletAction(() => wallet.selectChain(chain));
          }}
          onConnect={() => {
            void runWalletAction(connectWallet);
          }}
          onRefreshData={() => {
            void runWalletAction(loadAllData);
          }}
          onToggleKeystoreLock={() => {
            void runWalletAction(toggleKeystoreLock);
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
