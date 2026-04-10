import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  WalletCards,
  LockKeyhole,
  RefreshCw,
  Activity,
  ChevronDown,
  Unplug,
  ShieldCheck,
  Zap,
  Loader2,
  X
} from "lucide-react";
import {
  useActiveWalletSession,
  useMayaWalletActions,
  useMayaWalletState,
  getSupportedSessionChains,
  supportedWalletChains,
} from "#/wallet";
import { Chain } from "@vultisig/sdk";
import { AssetIcon, shortenAddress } from "./ProtocolPrimitives";

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

function getChainIconId(chain: string) {
  return chainIconMap[chain] || chain.toLowerCase();
}

export function WalletManager() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const wallet = useMayaWalletActions();
  const state = useMayaWalletState();
  const activeSession = useActiveWalletSession();

  // Dialog states for unlocking
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

  const canConnect = wallet.canExecute("accounts.connect", {
    sessionId: activeSession?.id,
  });
  const canFetchData = wallet.canExecute("addresses.list", {
    sessionId: activeSession?.id,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Close the unlock dialog if we close the menu
  useEffect(() => {
    if (!isOpen && unlockSessionId) {
      setTimeout(() => {
        setUnlockSessionId(null);
        setUnlockPassword("");
        setUnlockError("");
      }, 200); // Wait for transition
    }
  }, [isOpen, unlockSessionId]);

  async function runWalletAction(action: () => Promise<any>) {
    try {
      await action();
    } catch {}
  }

  async function connectSessionAccounts() {
    await wallet.execute("accounts.connect", {
      input: {},
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
      await wallet.execute("vault.unlock", {
        input: { password: unlockPassword },
        sessionId: unlockSessionId,
      });
      await wallet.refreshSessions();
      await wallet.selectSession(unlockSessionId);
      setUnlockSessionId(null);
      setUnlockPassword("");
    } catch (err: any) {
      setUnlockError(err?.message || "Unlock failed. Please check your password.");
    } finally {
      setIsUnlocking(false);
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
        <div className="absolute top-full right-0 mt-3 w-[min(calc(100vw-2rem),360px)] glass-panel-strong p-5 shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200 z-[100] border border-[var(--line)] overflow-hidden">
          
          {/* Unlock Dialog Overlay */}
          {unlockSessionId && (
            <div className="absolute inset-0 z-40 glass-panel-strong bg-[var(--bg-base)]/95 backdrop-blur-xl p-5 flex flex-col justify-center animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-[var(--sea-ink)]">
                  <LockKeyhole size={18} className="text-[var(--maya-teal)]" />
                  <span className="font-bold text-base">Unlock Vault</span>
                </div>
                <button 
                  onClick={() => { setUnlockSessionId(null); setUnlockPassword(''); setUnlockError(''); }}
                  className="p-1.5 rounded-full hover:bg-[var(--surface)] text-[var(--sea-ink-soft)] transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
              
              <form onSubmit={handleUnlockSubmit} className="flex flex-col gap-4">
                <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center focus-within:border-[var(--maya-teal)] transition-colors">
                  <input
                    type="password"
                    required
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="Enter vault encryption password"
                    className="super-input text-sm w-full"
                    disabled={isUnlocking}
                    autoFocus
                  />
                </div>
                {unlockError && <p className="text-red-500 text-xs font-bold px-1">{unlockError}</p>}
                
                <button
                  type="submit"
                  disabled={isUnlocking || !unlockPassword}
                  className="w-full mt-2 p-3 text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] rounded-xl shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isUnlocking ? <Loader2 size={14} className="animate-spin" /> : 'Unlock & Switch Session'}
                </button>
              </form>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <span className="font-bold text-[var(--sea-ink)] flex items-center gap-2">
              <ShieldCheck size={18} className="text-[var(--maya-teal)]" />{" "}
              Vault Manager
            </span>
            <span className="kicker !text-xs">
              {state.sessions.length} Sessions
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--chip-bg)] border border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] transition-all group"
              onClick={() => {
                runWalletAction(() => wallet.initialize());
                setIsOpen(false);
              }}
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
              onClick={() => runWalletAction(() => wallet.refreshSessions())}
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

          {state.sessions.length > 0 && (
            <div className="mb-4 p-3 bg-[var(--surface)] border border-[var(--line)] rounded-xl">
              <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] block mb-2">
                Switch Wallet Session
              </span>
              <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                {state.sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleSessionClick(session.id, session.status)}
                    className={`p-2 rounded-lg text-sm text-left flex items-center justify-between transition-colors ${state.activeSessionId === session.id ? "bg-[var(--chip-bg)] text-[var(--maya-teal)] font-bold shadow-inner" : "text-[var(--sea-ink)] hover:bg-[var(--surface-strong)]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5">
                          {session.label}
                          {session.status === "locked" && <LockKeyhole size={12} className="opacity-50" />}
                        </span>
                        <span className="text-[10px] font-normal text-[var(--sea-ink-soft)] capitalize">
                          {session.kind} {session.source === 'sdk' ? 'vault' : ''}
                        </span>
                      </div>
                    </div>
                    {state.activeSessionId === session.id && (
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
                          onClick={() =>
                            runWalletAction(() => wallet.selectChain(chain))
                          }
                          className={`p-2 rounded-lg flex items-center justify-between transition-all border ${isSelected ? "border-[var(--maya-teal)] bg-[rgba(26,154,141,0.05)] shadow-sm" : "border-transparent hover:bg-[var(--surface-strong)]"}`}
                        >
                          <div className="flex items-center gap-3">
                            <AssetIcon
                              assetId={getChainIconId(chain)}
                              className="w-6 h-6 shadow-sm"
                            />
                            <span
                              className={`text-sm font-bold ${isSelected ? "text-[var(--maya-teal)]" : "text-[var(--sea-ink)]"}`}
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
                                <Unplug size={10} /> Offline
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

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={!canConnect}
                  onClick={() => runWalletAction(connectSessionAccounts)}
                  className="p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <WalletCards size={14} /> Connect
                </button>
                <button
                  disabled={!canFetchData}
                  onClick={() => runWalletAction(loadAllData)}
                  className="p-2.5 rounded-lg text-xs font-semibold bg-[var(--chip-bg)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] hover:border-[var(--sea-ink-soft)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Activity size={14} /> Refresh Data
                </button>
              </div>

              {activeSession.source === "sdk" && (
                <button
                  onClick={() => runWalletAction(toggleVaultLock)}
                  className="w-full mt-2 p-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-slate-700 to-slate-800 shadow-md hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LockKeyhole size={14} />
                  {activeSession.status === "locked"
                    ? "Unlock Vault"
                    : "Lock Vault"}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 p-4 text-center rounded-xl bg-[var(--surface)] border border-[var(--line)]">
              <span className="text-xs font-semibold text-[var(--sea-ink-soft)] block mb-3">
                No active session detected.
              </span>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate({ to: "/vault-setup" });
                }}
                className="w-full p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck size={14} /> Create New Vault
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
