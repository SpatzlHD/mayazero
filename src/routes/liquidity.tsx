import { createFileRoute } from '@tanstack/react-router'
import { Chain } from '@vultisig/sdk'
import { Settings, Droplet, ArrowDownUp } from 'lucide-react'
import { useState, useMemo } from 'react'
import {
  useActiveWalletSession,
  useMayaWalletActions,
  useMayaWalletState,
} from '#/wallet'
import {
  AssetIcon,
  lpPositions,
  SelectionModal
} from '#/components/ProtocolPrimitives'
import { usePreferences } from '#/provider/PreferencesProvider'

export const Route = createFileRoute('/liquidity')({ component: LiquidityTerminalPage })

function LiquidityTerminalPage() {
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()
  const activeSession = useActiveWalletSession()
  const { isPowerUser } = usePreferences()

  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [showPoolModal, setShowPoolModal] = useState(false)
  const [liquidityForm, setLiquidityForm] = useState({
    pool: 'CACAO / ETH',
    addAssetAmount: '',
    addCacaoAmount: '',
    withdrawShare: '25',
    withdrawMode: 'symmetrical',
  })

  // Basic mock resolution to figure out which icons to show based on pool string
  const poolAssets = useMemo(() => {
    const defaultSplit = liquidityForm.pool.split(' / ')
    const sym1 = defaultSplit[0]?.toLowerCase() === 'cacao' ? 'cacao' : 'eth'
    const sym2 = defaultSplit[1]?.toLowerCase() ?? 'eth'
    return { asset1: sym1, asset2: sym2 }
  }, [liquidityForm.pool])

  const actionChain = state.activeChain ?? activeSession?.chains[0] ?? Chain.MayaChain

  async function connectActiveChain() {
    await wallet.execute('accounts.connect', { input: { chain: actionChain } })
  }

  return (
    <main className="page-wrap flex flex-col items-center justify-center min-h-[85vh] px-4">
      {/* Hero */}
      <div className="text-center mb-6 rise-in">
        <h1 className="terminal-title mb-2">Liquidity Studio</h1>
        <p className="text-[var(--sea-ink-soft)] max-w-md mx-auto">
          Provide cross-chain liquidity. Earn frictionless yield.
        </p>
      </div>

      {/* The Central Terminal */}
      <article className="glass-panel-strong w-full max-w-lg p-3 rise-in" style={{ animationDelay: '100ms' }}>
        
        {/* Terminal Header & Tabs */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--line)] mb-4">
          <div className="flex gap-6">
            <button 
              onClick={() => setActiveTab('deposit')}
              className={`font-bold text-lg transition-colors pb-1 border-b-2 ${activeTab === 'deposit' ? 'text-[var(--sea-ink)] border-[var(--cacao-neon)]' : 'text-[var(--sea-ink-soft)] border-transparent hover:text-[var(--sea-ink)]'}`}
            >
              Deposit
            </button>
            <button 
              onClick={() => setActiveTab('withdraw')}
              className={`font-bold text-lg transition-colors pb-1 border-b-2 ${activeTab === 'withdraw' ? 'text-[var(--sea-ink)] border-[var(--maya-teal)]' : 'text-[var(--sea-ink-soft)] border-transparent hover:text-[var(--sea-ink)]'}`}
            >
              Withdraw
            </button>
          </div>
          <div className="flex items-center gap-2 text-[var(--sea-ink-soft)]">
             {isPowerUser && <Settings size={18} className="cursor-pointer hover:text-[var(--maya-teal)] transition-colors" />}
          </div>
        </div>

        {/* POOL SELECTOR */}
        <div className="bg-[var(--chip-bg)] rounded-[1.25rem] p-5 mb-3 relative border border-[var(--line)] hover:border-[var(--sea-ink-soft)] transition-all cursor-pointer group" onClick={() => setShowPoolModal(true)}>
           <div className="flex justify-between items-center mb-3">
             <span className="text-xs font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider">Selected Pool</span>
           </div>
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="flex -space-x-4">
                   <AssetIcon assetId={poolAssets.asset1} className="w-10 h-10 z-10 border-2 border-[var(--chip-bg)] shadow-md group-hover:scale-105 transition-transform duration-300" />
                   <AssetIcon assetId={poolAssets.asset2} className="w-10 h-10 z-0 border-2 border-[var(--chip-bg)] shadow-md group-hover:scale-105 transition-transform duration-300 delay-75" />
                 </div>
                 <span className="font-bold text-2xl tracking-tight group-hover:text-[var(--cacao-neon)] transition-colors">{liquidityForm.pool}</span>
              </div>
              <ArrowDownUp size={16} className="text-[var(--sea-ink-soft)] opacity-50 group-hover:opacity-100 transition-opacity" />
           </div>
        </div>

        {activeTab === 'deposit' ? (
           <div className="animate-in fade-in slide-in-from-left-4 duration-300">
              <div className="bg-[var(--chip-bg)] rounded-[1.25rem] p-5 mb-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:shadow-[0_0_15px_var(--halo-glow)] transition-all">
                <div className="flex justify-between mb-3">
                  <span className="text-xs font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider">Asset Side</span>
                </div>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" placeholder="0.0" className="super-input text-4xl"
                    value={liquidityForm.addAssetAmount} onChange={(e) => setLiquidityForm(p => ({...p, addAssetAmount: e.target.value}))}
                  />
                  <div className="flex items-center gap-2 bg-[var(--surface-strong)] border border-[var(--line)] rounded-full py-2 pl-2 pr-4 shadow-sm">
                    <AssetIcon assetId={poolAssets.asset2} className="w-7 h-7" />
                    <span className="font-bold text-lg">{poolAssets.asset2.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center my-1 z-10 relative h-2">
                 <div className="bg-[var(--bg-base)] border border-[var(--line)] p-1.5 rounded-full text-[var(--cacao-neon)] shadow-md">
                   <Droplet size={14} className="fill-current" />
                 </div>
              </div>

              <div className="bg-[var(--chip-bg)] rounded-[1.25rem] p-5 mt-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:shadow-[0_0_15px_var(--halo-glow)] transition-all">
                <div className="flex justify-between mb-3">
                  <span className="text-xs font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider">Cacao Side</span>
                </div>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" placeholder="0.0" className="super-input text-4xl"
                    value={liquidityForm.addCacaoAmount} onChange={(e) => setLiquidityForm(p => ({...p, addCacaoAmount: e.target.value}))}
                  />
                  <div className="flex items-center gap-2 bg-[var(--surface-strong)] border border-[var(--line)] rounded-full py-2 pl-2 pr-4 shadow-sm">
                    <AssetIcon assetId={poolAssets.asset1} className="w-7 h-7" />
                    <span className="font-bold text-lg">CACAO</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-1">
                 {!activeSession ? (
                    <button className="cacao-btn w-full py-4.5 text-xl tracking-tight shadow-xl" onClick={connectActiveChain}>Connect Vault</button>
                 ) : (
                    <button className="cacao-btn w-full py-4.5 text-xl tracking-tight shadow-xl" disabled>Provide Liquidity</button>
                 )}
              </div>
           </div>
        ) : (
           <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-[var(--chip-bg)] rounded-[1.25rem] p-6 border border-[var(--line)] transition-all shadow-inner">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-sm font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider">Withdraw Share</span>
                  <span className="text-[var(--maya-teal)] font-bold text-3xl">{liquidityForm.withdrawShare}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" 
                  className="w-full h-3 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, var(--maya-teal) ${liquidityForm.withdrawShare}%, var(--line) ${liquidityForm.withdrawShare}%)` }}
                  value={liquidityForm.withdrawShare} 
                  onChange={(e) => setLiquidityForm(p => ({...p, withdrawShare: e.target.value}))}
                />
              </div>

              {/* POWER USER SETTINGS */}
              {isPowerUser && (
                <div className="mt-3 p-5 bg-[var(--surface)] border border-[var(--line)] rounded-[1.25rem] shadow-inner">
                   <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] relative">Withdrawal Mode (Asymmetric)</span>
                   <select 
                     className="super-input mt-3 bg-[var(--chip-bg)] px-4 py-3 rounded-xl border border-[var(--line)] cursor-pointer focus:border-[var(--maya-teal)] transition-colors"
                     value={liquidityForm.withdrawMode}
                     onChange={(e) => setLiquidityForm(p => ({...p, withdrawMode: e.target.value}))}
                   >
                     <option value="symmetrical">Symmetrical Distribution</option>
                     <option value="cacao">CACAO native only</option>
                     <option value="asset">Asset native only</option>
                   </select>
                </div>
              )}

              <div className="mt-4 p-1">
                 {!activeSession ? (
                    <button className="cacao-btn w-full py-4.5 text-xl tracking-tight shadow-xl bg-gradient-to-r from-red-500 to-rose-600" onClick={connectActiveChain}>Connect Vault</button>
                 ) : (
                    <button className="w-full py-4.5 text-xl tracking-tight font-bold text-[var(--bg-base)] rounded-full bg-gradient-to-r from-[var(--maya-teal)] to-teal-400 shadow-[0_4px_24px_rgba(79,209,197,0.4)] hover:scale-[1.02] transition-transform" disabled>
                      Execute Withdrawal
                    </button>
                 )}
              </div>
           </div>
        )}
      </article>

      <SelectionModal 
        isOpen={showPoolModal} 
        onClose={() => setShowPoolModal(false)}
        title="Select Liquidity Pool"
        items={lpPositions.map(p => { 
           const parts = p.pool.split(' / ')
           const sym1 = parts[0]?.toLowerCase() === 'cacao' ? 'cacao' : 'eth'
           const sym2 = parts[1]?.toLowerCase() ?? 'eth'
           return { 
             id: p.pool, 
             label: p.pool, 
             iconMain: sym1, 
             iconSub: sym2, 
             subtitle: `APR: ${p.apr} • Vol: ${p.depth}` 
           }
        })}
        onSelect={(id) => setLiquidityForm(p => ({...p, pool: id}))}
      />

    </main>
  )
}
