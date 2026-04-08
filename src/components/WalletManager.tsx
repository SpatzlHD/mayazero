import { useState, useRef, useEffect } from 'react'
import { WalletCards, LockKeyhole, RefreshCw, Activity, ChevronDown, Unplug, ShieldCheck, Zap } from 'lucide-react'
import {
  useActiveWalletSession,
  useMayaWalletActions,
  useMayaWalletState,
} from '#/wallet'
import { Chain } from '@vultisig/sdk'
import { AssetIcon, shortenAddress } from './ProtocolPrimitives'

export function WalletManager() {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()
  const activeSession = useActiveWalletSession()

  const actionChain = state.activeChain ?? activeSession?.chains[0] ?? Chain.MayaChain
  const availableChains = activeSession?.chains.length ? activeSession.chains : Object.values(Chain)
  
  const canConnect = wallet.canExecute('accounts.connect', {
    sessionId: activeSession?.id,
  })
  const canFetchData = wallet.canExecute('addresses.list', {
    sessionId: activeSession?.id,
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function runWalletAction(action: () => Promise<any>) {
    try { await action() } catch {}
  }
  
  async function connectSessionAccounts() {
    await wallet.execute('accounts.connect', {
      input: {},
    })
  }
  async function loadAllData() {
    try { await wallet.execute('addresses.list', { input: { chains: availableChains } }) } catch {}
    try { await wallet.execute('balances.list', { input: { chains: availableChains } }) } catch {}
  }

  async function toggleVaultLock() {
    if (!activeSession || activeSession.source !== 'sdk') return
    if (activeSession.status === 'locked') {
      const password = window.prompt(`Unlock ${activeSession.label}`)
      if (!password) return
      await wallet.execute('vault.unlock', {
        input: { password },
        sessionId: activeSession.id,
      })
      await wallet.refreshSessions()
      return
    }
    await wallet.execute('vault.lock', {
      input: {},
      sessionId: activeSession.id,
    })
    await wallet.refreshSessions()
  }

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-[1rem] border transition-all duration-300 font-bold text-sm ${
          activeSession 
            ? 'border-[var(--maya-teal)] bg-[rgba(26,154,141,0.1)] text-[var(--maya-teal)] shadow-[0_0_12px_rgba(26,154,141,0.2)] hover:bg-[rgba(26,154,141,0.15)]'
            : 'border-[var(--line)] hover:border-[var(--sea-ink-soft)] bg-[var(--surface-strong)] text-[var(--sea-ink)] shadow-sm'
        }`}
      >
        <WalletCards size={16} className={activeSession ? 'text-[var(--maya-teal)]' : 'text-[var(--sea-ink-soft)]'} />
        {activeSession ? (
          <>
            <span>{activeSession.label || 'Vault'}</span>
            {activeSession.status === 'locked' && <LockKeyhole size={14} className="ml-1 opacity-50" />}
            <ChevronDown size={14} className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        ) : (
          <span>Connect Vault</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-3 w-[min(calc(100vw-2rem),360px)] glass-panel-strong p-5 shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200 z-[100] border border-[var(--line)]">
          <div className="flex items-center justify-between mb-4">
             <span className="font-bold text-[var(--sea-ink)] flex items-center gap-2"><ShieldCheck size={18} className="text-[var(--maya-teal)]" /> Vault Manager</span>
             <span className="kicker !text-xs">{state.sessions.length} Sessions</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
             <button 
               className="flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--chip-bg)] border border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] transition-all group"
               onClick={() => { runWalletAction(() => wallet.initialize()); setIsOpen(false) }}
             >
                <Unplug size={16} className="text-[var(--sea-ink-soft)] group-hover:text-[var(--cacao-neon)] mb-1 transition-colors" />
                <span className="text-xs font-semibold text-[var(--sea-ink)]">Initialize</span>
             </button>
             <button 
               className="flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--chip-bg)] border border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] transition-all group"
               onClick={() => runWalletAction(() => wallet.refreshSessions())}
             >
                <RefreshCw size={16} className="text-[var(--sea-ink-soft)] group-hover:text-[var(--maya-teal)] mb-1 transition-colors" />
                <span className="text-xs font-semibold text-[var(--sea-ink)]">Refresh</span>
             </button>
          </div>

          {state.sessions.length > 0 && (
             <div className="mb-4 p-3 bg-[var(--surface)] border border-[var(--line)] rounded-xl">
               <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] block mb-2">Switch Wallet Session</span>
               <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                 {state.sessions.map((session) => (
                   <button 
                      key={session.id} 
                      onClick={() => runWalletAction(() => wallet.selectSession(session.id))}
                      className={`p-2 rounded-lg text-sm text-left flex items-center justify-between transition-colors ${state.activeSessionId === session.id ? 'bg-[var(--chip-bg)] text-[var(--maya-teal)] font-bold shadow-inner' : 'text-[var(--sea-ink)] hover:bg-[var(--surface-strong)]'}`}
                   >
                     <div className="flex flex-col">
                       <span>{session.label}</span>
                       <span className="text-[10px] font-normal text-[var(--sea-ink-soft)]">{session.kind}</span>
                     </div>
                     {state.activeSessionId === session.id && <Zap size={14} className="fill-[var(--maya-teal)]" />}
                   </button>
                 ))}
               </div>
             </div>
          )}

          {activeSession ? (
            <div className="space-y-3 mt-2">
              <div className="mb-2 bg-[var(--surface)] border border-[var(--line)] rounded-xl overflow-hidden">
                 <div className="p-3 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-strong)]">
                   <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)]">Session Chains</span>
                 </div>
                 <div className="flex flex-col max-h-[240px] overflow-y-auto custom-scrollbar p-1.5 gap-1">
                   {availableChains.map((chain) => {
                     const address = activeSession.addresses[chain];
                     const isConnected = !!address;
                     const isSelected = actionChain === chain;
                     return (
                       <button
                         key={chain}
                         onClick={() => runWalletAction(() => wallet.selectChain(chain))}
                         className={`p-2 rounded-lg flex items-center justify-between transition-all border ${isSelected ? 'border-[var(--maya-teal)] bg-[rgba(26,154,141,0.05)] shadow-sm' : 'border-transparent hover:bg-[var(--surface-strong)]'}`}
                       >
                         <div className="flex items-center gap-3">
                           <AssetIcon assetId={chain} className="w-6 h-6 shadow-sm" />
                           <span className={`text-sm font-bold ${isSelected ? 'text-[var(--maya-teal)]' : 'text-[var(--sea-ink)]'}`}>{chain}</span>
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
                     )
                   })}
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                 <button 
                   disabled={!canConnect}
                   onClick={() => runWalletAction(connectSessionAccounts)}
                   className="p-2.5 rounded-lg text-xs font-bold bg-[var(--maya-teal)] text-[var(--bg-base)] shadow-[0_0_10px_rgba(26,154,141,0.2)] hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                 >
                   <WalletCards size={14} /> Connect
                 </button>
                 <button 
                   disabled={!canFetchData}
                   onClick={() => runWalletAction(loadAllData)}
                   className="p-2.5 rounded-lg text-xs font-semibold bg-[var(--chip-bg)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] hover:border-[var(--sea-ink-soft)] transition-all flex items-center justify-center gap-1.5"
                 >
                   <Activity size={14} /> Refresh Data
                 </button>
              </div>

              {activeSession.source === 'sdk' && (
                <button 
                  onClick={() => runWalletAction(toggleVaultLock)}
                  className="w-full mt-2 p-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-slate-700 to-slate-800 shadow-md hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                >
                  <LockKeyhole size={14} />
                  {activeSession.status === 'locked' ? 'Unlock Vault' : 'Lock Vault'}
                </button>
              )}
            </div>
          ) : (
             <div className="mt-4 p-4 text-center rounded-xl bg-[var(--surface)] border border-[var(--line)]">
                <span className="text-xs font-semibold text-[var(--sea-ink-soft)]">No active session detected.</span>
             </div>
          )}
        </div>
      )}
    </div>
  )
}
