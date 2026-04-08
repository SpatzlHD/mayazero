import { createFileRoute } from '@tanstack/react-router'
import { Chain } from '@vultisig/sdk'
import { ArrowDownUp, Settings, Wallet, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  useActiveWalletSession,
  useMayaWalletActions,
  useMayaWalletState,
} from '#/wallet'
import {
  AssetIcon,
  protocolAssets as hardcodedAssets,
  resolveSessionAddress,
  getObjectRecord,
  SelectionModal,
  type SwapPreparePayload,
  type ProtocolAsset,
} from '#/components/ProtocolPrimitives'
import { usePreferences } from '#/provider/PreferencesProvider'
import { useSettings } from '#/provider/SettingsProvider'
import {
  createAffiliateDrafts,
  quoteSwap as runQuoteSwap,
  type SwapQuoteEngineResult,
} from '#/lib/swap-quote-engine'

const chainPrefixMap: Record<string, Chain> = {
  ARB: Chain.Arbitrum,
  BASE: Chain.Base,
  BTC: Chain.Bitcoin,
  BCH: Chain.BitcoinCash,
  DASH: Chain.Dash,
  DOGE: Chain.Dogecoin,
  ETH: Chain.Ethereum,
  KUJI: Chain.Kujira,
  LTC: Chain.Litecoin,
  MAYA: Chain.MayaChain,
  THOR: Chain.THORChain,
  ZEC: Chain.Zcash,
}

const fallbackDecimals: Record<string, number> = {
  ETH: 18,
  BASE: 18,
  ARB: 18,
  BTC: 8,
  DOGE: 8,
  LTC: 8,
  BCH: 8,
  DASH: 8,
  ZEC: 8,
  THOR: 8,
  MAYA: 10,
  KUJI: 6,
}

type MayaPool = {
  asset: string
  status: string
  decimals?: number
}

function useMayaAssets() {
  const [assets, setAssets] = useState<ProtocolAsset[]>(hardcodedAssets)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    async function fetchPools() {
      setIsLoading(true)
      try {
        const res = await fetch('https://mayanode.mayachain.info/mayachain/pools')
        const data = (await res.json()) as MayaPool[]

        const activePools = data.filter((p) => p.status === 'Available')

        const dynamicAssets = activePools
          .map((pool) => {
            const assetString = pool.asset
            const [chainPrefix, rest] = assetString.split('.')
            const [ticker, tokenId] = (rest || '').split('-')

            const chain = chainPrefixMap[chainPrefix.toUpperCase()]

            if (!chain) return null

            const id = (tokenId || ticker).toLowerCase()

            const existing = hardcodedAssets.find(
              (a) => a.mayaAsset === assetString,
            )
            if (existing) {
              return {
                ...existing,
                decimals: pool.decimals ?? existing.decimals,
              }
            }

            return {
              id,
              label: ticker,
              chain,
              ticker,
              decimals:
                pool.decimals ??
                fallbackDecimals[chainPrefix.toUpperCase()] ??
                18,
              mayaAsset: assetString,
              tokenId,
              blurb: `${chainPrefix} Asset`,
            }
          })
          .filter(Boolean) as ProtocolAsset[]

        const cacaoAsset = hardcodedAssets.find((a) => a.id === 'cacao')!

        const unique = new Map<string, ProtocolAsset>()
        unique.set(cacaoAsset.mayaAsset, cacaoAsset)

        for (const da of dynamicAssets) {
          if (!unique.has(da.mayaAsset)) {
            unique.set(da.mayaAsset, da)
          }
        }

        for (const ha of hardcodedAssets) {
          if (!unique.has(ha.mayaAsset)) {
            unique.set(ha.mayaAsset, ha)
          }
        }

        setAssets(Array.from(unique.values()))
      } catch (err) {
        console.error('Failed to fetch pools:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPools()
  }, [])

  return { assets, isLoading }
}

export const Route = createFileRoute('/swap')({ component: SwapTerminalPage })

function SwapTerminalPage() {
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()
  const activeSession = useActiveWalletSession()
  const { isPowerUser } = usePreferences()
  const settings = useSettings()

  const { assets, isLoading: isAssetsLoading } = useMayaAssets()

  const [swapForm, setSwapForm] = useState({
    fromAssetId: 'cacao',
    toAssetId: 'eth',
    amount: '',
    slippageBps: '50',
    autoApprove: true,
    affiliateDrafts: createAffiliateDrafts(),
  })

  const [showFromModal, setShowFromModal] = useState(false)
  const [showToModal, setShowToModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [swapQuote, setSwapQuote] = useState<SwapQuoteEngineResult | null>(null)
  const [preparedSwap, setPreparedSwap] = useState<SwapPreparePayload | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const fromAsset = assets.find((asset) => asset.id === swapForm.fromAssetId)
  const toAsset = assets.find((asset) => asset.id === swapForm.toAssetId)
  
  const actionChain =
    state.activeChain ?? fromAsset?.chain ?? activeSession?.chains[0] ?? Chain.MayaChain

  const fromAddress = fromAsset ? resolveSessionAddress(activeSession, fromAsset.chain) : ''
  const toAddress = toAsset ? resolveSessionAddress(activeSession, toAsset.chain) : ''

  const sessionBalances = activeSession ? state.balancesBySession[activeSession.id] : null
  const maxCustomAffiliates = settings.useZeroPercentFee ? 5 : 4

  const [isQuoting, setIsQuoting] = useState(false)

  const canQuoteSwap =
    Boolean(activeSession && fromAsset && toAsset && fromAddress && toAddress) &&
    Number(swapForm.amount) > 0 &&
    swapForm.fromAssetId !== swapForm.toAssetId

  const canPrepareSwap = Boolean(
    swapQuote &&
      swapQuote.route === 'vultisig' &&
      swapQuote.canPrepare &&
      activeSession &&
      fromAsset &&
      toAsset &&
      fromAddress &&
      toAddress,
  )
  const primaryAction = getSwapPrimaryAction({
    hasActiveSession: Boolean(activeSession),
    hasQuote: Boolean(swapQuote),
    canPrepareSwap,
    hasPreparedSwap: Boolean(preparedSwap),
    isQuoting,
    quoteError: Boolean(quoteError),
  })

  function resetQuoteState() {
    setSwapQuote(null)
    setPreparedSwap(null)
    setQuoteError(null)
  }

  function updateSwapForm(
    updater: (current: typeof swapForm) => typeof swapForm,
  ) {
    setSwapForm((current) => updater(current))
  }

  useEffect(() => {
    if (!canQuoteSwap) {
       if (swapQuote || quoteError) {
         resetQuoteState()
       }
       return
    }

    let isActive = true
    const timer = setTimeout(async () => {
       setIsQuoting(true)
       setQuoteError(null)
       setPreparedSwap(null)
       
       try {
         const result = await runQuoteSwap({
           wallet,
           settings,
           sessionId: activeSession!.id,
           fromAsset: fromAsset!,
           toAsset: toAsset!,
           fromAddress,
           toAddress,
           amount: swapForm.amount,
           slippageBps: swapForm.slippageBps,
           affiliateDrafts: swapForm.affiliateDrafts,
         })
         if (isActive) {
            setSwapQuote(result)
         }
       } catch (error) {
         if (isActive) {
            setSwapQuote(null)
            setQuoteError((error as Error).message)
         }
       } finally {
         if (isActive) {
            setIsQuoting(false)
         }
       }
    }, 600)

    return () => {
       isActive = false
       clearTimeout(timer)
    }
  }, [
    canQuoteSwap,
    activeSession?.id,
    fromAsset?.id,
    toAsset?.id,
    fromAddress,
    toAddress,
    swapForm.amount,
    swapForm.slippageBps,
    JSON.stringify(swapForm.affiliateDrafts)
  ])

  async function connectActiveChain() {
    await wallet.execute('accounts.connect', { input: { chain: actionChain } })
  }

  async function prepareSwap() {
    if (
      !activeSession ||
      !fromAsset ||
      !toAsset ||
      !fromAddress ||
      !toAddress ||
      !swapQuote ||
      swapQuote.route !== 'vultisig'
    ) {
      return
    }

    const payload = await wallet.execute('swap.prepare', {
      input: {
        fromCoin: {
          chain: fromAsset.chain,
          ticker: fromAsset.ticker,
          decimals: fromAsset.decimals,
          address: fromAddress,
          ...(fromAsset.tokenId ? { id: fromAsset.tokenId } : {}),
        },
        toCoin: {
          chain: toAsset.chain,
          ticker: toAsset.ticker,
          decimals: toAsset.decimals,
          address: toAddress,
          ...(toAsset.tokenId ? { id: toAsset.tokenId } : {}),
        },
        amount: Number(swapForm.amount),
        swapQuote: swapQuote.rawQuote,
        autoApprove: swapForm.autoApprove,
      },
      sessionId: activeSession.id,
    })
    setPreparedSwap(payload.payload)
  }

  function flipSwapPair() {
    updateSwapForm((current) => ({
      ...current,
      fromAssetId: current.toAssetId,
      toAssetId: current.fromAssetId,
    }))
  }

  return (
    <main className="page-wrap flex flex-col items-center justify-center min-h-[85vh] px-4 relative z-0">
      
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] bg-[var(--maya-teal)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-[var(--cacao-neon)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow" style={{ animationDelay: '2s' }} />
      </div>

      <div className="text-center mb-8 rise-in">
        <h1 className="terminal-title mb-3 text-4xl sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--sea-ink-soft)] font-black tracking-tight drop-shadow-sm">
          Exchange
        </h1>
        <p className="text-[var(--sea-ink-soft)]/90 max-w-sm mx-auto text-sm sm:text-base font-medium">
          Lightning fast cross-chain swaps directly from your Vault.
        </p>
      </div>

      <article className="glass-panel-strong w-full max-w-lg p-2 sm:p-3 rise-in relative overflow-visible backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-[2.5rem] border border-[var(--line)]" style={{ animationDelay: '100ms' }}>
        
        <div className="flex justify-between items-center px-6 py-4">
          <span className="font-bold text-[var(--sea-ink)] tracking-wide">Swap</span>
          <div className="flex items-center gap-3">
             {isAssetsLoading && (
               <div className="flex items-center gap-1.5 text-[var(--maya-teal)] text-xs font-semibold px-2 py-1 rounded-full bg-[var(--maya-teal)]/10 border border-[var(--maya-teal)]/20 shadow-sm animate-pulse">
                 <Loader2 size={12} className="animate-spin" />
                 <span>Syncing Pools</span>
               </div>
             )}
          </div>
        </div>

        <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 mb-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group">
          <div className="flex justify-between mb-4">
            <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">Pay</span>
            <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] flex items-center gap-1.5 bg-[var(--surface-strong)] px-2.5 py-1 rounded-full border border-[var(--line)] group-hover:border-[var(--maya-teal)]/30 transition-colors">
               <Wallet size={12} />
               {sessionBalances ? 'Bal: Available' : 'Connect Vault'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <input
              aria-label="Swap amount"
              type="number"
              placeholder="0.0"
              className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold"
              value={swapForm.amount}
              onChange={(e) => {
                updateSwapForm((prev) => ({ ...prev, amount: e.target.value }))
              }}
            />

            <button
              className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-strong)] hover:bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--maya-teal)]/50 rounded-full py-2.5 pl-2.5 pr-4 sm:pr-5 shadow-md hover:shadow-lg transition-all active:scale-95 group/btn"
              onClick={() => setShowFromModal(true)}
            >
              <AssetIcon assetId={fromAsset?.ticker.toLowerCase() || swapForm.fromAssetId} className="w-8 h-8 sm:w-9 sm:h-9 shadow-sm group-hover/btn:rotate-6 transition-transform" />
              <span className="font-bold text-lg sm:text-xl tracking-tight text-[var(--sea-ink)]">{fromAsset?.ticker ?? 'Select'}</span>
              <ChevronDown size={16} className="text-[var(--sea-ink-soft)] group-hover/btn:text-[var(--maya-teal)] transition-colors" />
            </button>
          </div>
        </div>

        <div className="relative h-1 flex justify-center items-center z-10 my-2">
          <button
            onClick={flipSwapPair}
            className="absolute bg-[var(--surface)] border-[3px] border-[var(--surface-strong)] p-2.5 rounded-2xl text-[var(--sea-ink)] hover:text-[var(--bg-base)] hover:bg-[var(--maya-teal)] hover:border-[var(--maya-teal)] hover:scale-110 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.15)] group"
          >
            <ArrowDownUp size={18} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 mt-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300 group">
          <div className="flex justify-between mb-4">
            <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">Receive</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <input
              aria-label="Quote output"
              type="text"
              placeholder="0.0"
              className="super-input text-4xl sm:text-5xl bg-transparent flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold cursor-not-allowed pr-2"
              value={formatBaseUnits(swapQuote?.estimatedOutput, swapQuote?.outputDecimals ?? toAsset?.decimals)}
              readOnly
            />

            <button
              className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-strong)] hover:bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--maya-teal)]/50 rounded-full py-2.5 pl-2.5 pr-4 sm:pr-5 shadow-md hover:shadow-lg transition-all active:scale-95 group/btn"
              onClick={() => setShowToModal(true)}
            >
              <AssetIcon assetId={toAsset?.ticker.toLowerCase() || swapForm.toAssetId} className="w-8 h-8 sm:w-9 sm:h-9 shadow-sm group-hover/btn:rotate-6 transition-transform" />
              <span className="font-bold text-lg sm:text-xl tracking-tight text-[var(--sea-ink)]">{toAsset?.ticker ?? 'Select'}</span>
              <ChevronDown size={16} className="text-[var(--sea-ink-soft)] group-hover/btn:text-[var(--maya-teal)] transition-colors" />
            </button>
          </div>
        </div>

        {isPowerUser && (
          <div className="w-full mt-3 px-2">
            <div 
              className="flex justify-center items-center cursor-pointer group py-2"
              onClick={() => setShowSettings(!showSettings)}
            >
               <div className="bg-[var(--chip-bg)] hover:bg-[var(--surface)] rounded-full px-4 py-1.5 flex items-center gap-2 border border-transparent group-hover:border-[var(--line)] transition-all">
                  <Settings size={14} className={`text-[var(--sea-ink-soft)] transition-colors duration-500 ease-out ${showSettings ? 'rotate-90 text-[var(--maya-teal)]' : 'group-hover:text-[var(--maya-teal)]'}`} />
                  <span className={`text-[11px] uppercase font-bold text-[var(--sea-ink-soft)] transition-colors ${showSettings ? 'text-[var(--maya-teal)]' : 'group-hover:text-[var(--maya-teal)]'}`}>Pro Settings</span>
                  {showSettings ? <ChevronUp size={14} className="text-[var(--maya-teal)]" /> : <ChevronDown size={14} className="text-[var(--sea-ink-soft)] group-hover:text-[var(--maya-teal)] transition-colors" />}
               </div>
            </div>
            
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showSettings ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
               <div className="p-5 sm:p-6 bg-[var(--surface)]/80 backdrop-blur-sm border border-[var(--line)] rounded-[1.75rem] shadow-inner mb-2">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">Max Slippage (bps)</span>
                      <input
                        aria-label="Max slippage bps"
                        type="number"
                        className="bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-3 text-sm font-semibold text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all"
                        value={swapForm.slippageBps}
                        onChange={e => updateSwapForm((current) => ({ ...current, slippageBps: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">Custom Affiliates</span>
                      <span className="text-[10px] leading-tight text-[var(--sea-ink-soft)]/70">
                        {settings.useZeroPercentFee
                          ? 'Up to 5 MAYA affiliates.'
                          : 'Up to 4 custom affiliates. App holds 5th.'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-5 pt-5 border-t border-[var(--line)]/50">
                     <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-3">Affiliate Addresses & Fees</span>
                     <div className="grid gap-3">
                        {swapForm.affiliateDrafts.slice(0, maxCustomAffiliates).map((draft, index) => (
                          <div key={`affiliate-${index}`} className="grid grid-cols-[minmax(0,1fr)_100px] sm:grid-cols-[minmax(0,1fr)_120px] gap-3">
                            <input
                              aria-label={`Affiliate ${index + 1} value`}
                              type="text"
                              className="bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-sm md:text-base font-medium text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all placeholder-[var(--sea-ink-soft)]/40 text-ellipsis"
                              placeholder={`Address / MAYAName`}
                              value={draft.value}
                              onChange={(event) =>
                                updateSwapForm((current) => ({
                                  ...current,
                                  affiliateDrafts: current.affiliateDrafts.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? { ...entry, value: event.target.value }
                                      : entry,
                                  ),
                                }))
                              }
                            />
                            <div className="relative">
                              <input
                                aria-label={`Affiliate ${index + 1} bps`}
                                type="number"
                                className="w-full bg-[var(--bg-base)] border border-[var(--line)] rounded-xl pl-3 pr-8 py-2.5 text-sm md:text-base font-medium text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)] focus:shadow-[0_0_0_2px_rgba(79,209,197,0.2)] transition-all placeholder-[var(--sea-ink-soft)]/40"
                                placeholder="0"
                                value={draft.bps}
                                onChange={(event) =>
                                  updateSwapForm((current) => ({
                                    ...current,
                                    affiliateDrafts: current.affiliateDrafts.map((entry, entryIndex) =>
                                      entryIndex === index
                                        ? { ...entry, bps: event.target.value }
                                        : entry,
                                    ),
                                  }))
                                }
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs font-bold text-[var(--sea-ink-soft)] pointer-events-none">bps</span>
                            </div>
                          </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        )}

        <div className="mt-4 px-1 pb-1">
           {primaryAction.kind === 'connect' ? (
              <button className="w-full py-4.5 sm:py-5 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface)] hover:border-[var(--maya-teal)]/50 shadow-sm transition-all active:scale-[0.98]" onClick={connectActiveChain}>
                Connect Vault
              </button>
           ) : primaryAction.kind === 'quote' ? (
              <button
                className="w-full py-4.5 sm:py-5 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-gradient-to-r from-[var(--maya-teal)] to-teal-400 text-[var(--bg-base)] flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(79,209,197,0.4)] hover:shadow-[0_6px_24px_rgba(79,209,197,0.6)] hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                disabled={!canQuoteSwap}
                onClick={quoteSwap}
              >
                Get Quote <ArrowRight size={20} className="stroke-[3]" />
              </button>
           ) : primaryAction.kind === 'prepare' ? (
              <button
                className="w-full py-4.5 sm:py-5 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-gradient-to-r from-[var(--maya-teal)] to-teal-400 text-[var(--bg-base)] flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(79,209,197,0.4)] hover:shadow-[0_6px_24px_rgba(79,209,197,0.6)] hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                disabled={primaryAction.disabled}
                onClick={prepareSwap}
              >
                {primaryAction.label === 'Transaction Ready'
                  ? <><CheckCircle2 size={22} className="stroke-[3]" /> Transaction Ready</>
                  : primaryAction.label}
              </button>
           ) : (
              <button
                className="w-full py-4.5 sm:py-5 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-[var(--surface)] border border-[var(--line)] text-[var(--sea-ink-soft)] disabled:opacity-70 disabled:cursor-not-allowed"
                disabled
                title={swapQuote?.prepareReason}
              >
                {primaryAction.label}
              </button>
           )}
        </div>

        {(swapQuote || quoteError) ? (
          <div className="mt-4 p-5 bg-[var(--surface)]/90 border border-[var(--line)] rounded-[1.5rem] shadow-sm animate-in slide-in-from-top-2 fade-in duration-300">
            {quoteError ? (
              <div className="flex flex-col gap-2">
                 <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Error Occurred</span>
                 <p className="text-sm font-medium text-rose-400/90 leading-snug">{quoteError}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">Quote route</span>
                  <span className="text-xs font-black text-[var(--maya-teal)] uppercase bg-[var(--maya-teal)]/10 px-2 py-0.5 rounded border border-[var(--maya-teal)]/20">{swapQuote?.route}</span>
                </div>
                {swapQuote?.provider ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">Provider</span>
                    <span className="text-sm font-bold text-[var(--sea-ink)]">{swapQuote.provider}</span>
                  </div>
                ) : null}
                {swapQuote?.memo ? (
                  <div className="mt-2 p-3 bg-[var(--bg-base)] border border-[var(--line)] rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">Memo</span>
                    <div className="mt-1 text-[11px] font-mono break-all text-[var(--sea-ink)]/90 leading-tight">{swapQuote.memo}</div>
                  </div>
                ) : null}
                {swapQuote?.prepareReason ? (
                  <p className="mt-1 text-xs font-medium text-amber-500/90 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">{swapQuote.prepareReason}</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </article>

      <SelectionModal
        isOpen={showFromModal}
        title="Select Asset to Swap"
        onClose={() => setShowFromModal(false)}
        items={assets.map(a => ({ 
          id: a.id, 
          label: a.label, 
          iconMain: a.ticker.toLowerCase(), 
          subtitle: a.blurb 
        }))}
        onSelect={(id) => updateSwapForm((current) => ({ ...current, fromAssetId: id }))}
      />

      <SelectionModal
        isOpen={showToModal}
        title="Select Asset to Receive"
        onClose={() => setShowToModal(false)}
        items={assets.map(a => ({ 
          id: a.id, 
          label: a.label, 
          iconMain: a.ticker.toLowerCase(), 
          subtitle: a.blurb 
        }))}
        onSelect={(id) => updateSwapForm((current) => ({ ...current, toAssetId: id }))}
      />
    </main>
  )
}

export function formatBaseUnits(value: string | undefined, decimals?: number): string {
  if (!value || decimals === undefined) {
    return ''
  }

  const negative = value.startsWith('-')
  const digits = negative ? value.slice(1) : value
  const normalized = digits.replace(/^0+(?=\d)/, '') || '0'

  if (decimals === 0) {
    return `${negative ? '-' : ''}${normalized}`
  }

  const padded = normalized.padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, -decimals)
  const fractionalPart = padded.slice(-decimals).replace(/0+$/, '')

  return `${negative ? '-' : ''}${integerPart}${fractionalPart ? `.${fractionalPart}` : ''}`
}

function stringifyForDisplay(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === 'bigint' ? item.toString() : item),
    2,
  )
}

export function getSwapPrimaryAction(params: {
  hasActiveSession: boolean
  hasQuote: boolean
  canPrepareSwap: boolean
  hasPreparedSwap: boolean
  isQuoting?: boolean
  quoteError?: boolean
}): {
  kind: 'connect' | 'quote' | 'prepare' | 'quote-only'
  label: string
  disabled: boolean
} {
  if (!params.hasActiveSession) {
    return {
      kind: 'connect',
      label: 'Connect Vault',
      disabled: false,
    }
  }

  if (params.isQuoting) {
    return {
      kind: 'quote-only',
      label: 'Fetching Quote...',
      disabled: true,
    }
  }

  if (!params.hasQuote) {
    if (params.quoteError) {
      return {
        kind: 'quote-only',
        label: 'Quote Failed',
        disabled: true,
      }
    }
    return {
      kind: 'quote-only',
      label: 'Enter an amount',
      disabled: true,
    }
  }

  if (params.canPrepareSwap) {
    return {
      kind: 'prepare',
      label: params.hasPreparedSwap ? 'Transaction Ready' : 'Confirm Swap',
      disabled: false,
    }
  }

  return {
    kind: 'quote-only',
    label: 'Maya Quote Only',
    disabled: true,
  }
}
