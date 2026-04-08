import { createFileRoute } from '@tanstack/react-router'
import { Chain } from '@vultisig/sdk'
import { ArrowDownUp, Settings, Wallet, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import {
  useActiveWalletSession,
  useMayaWalletActions,
  useMayaWalletState,
} from '#/wallet'
import {
  AssetIcon,
  protocolAssets,
  resolveSessionAddress,
  getObjectRecord,
  SelectionModal,
  type SwapPreparePayload,
} from '#/components/ProtocolPrimitives'
import { usePreferences } from '#/provider/PreferencesProvider'
import { useSettings } from '#/provider/SettingsProvider'
import {
  createAffiliateDrafts,
  quoteSwap as runQuoteSwap,
  type SwapQuoteEngineResult,
} from '#/lib/swap-quote-engine'

export const Route = createFileRoute('/swap')({ component: SwapTerminalPage })

function SwapTerminalPage() {
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()
  const activeSession = useActiveWalletSession()
  const { isPowerUser } = usePreferences()
  const settings = useSettings()

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

  const [swapQuote, setSwapQuote] = useState<SwapQuoteEngineResult | null>(null)
  const [preparedSwap, setPreparedSwap] = useState<SwapPreparePayload | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const fromAsset = protocolAssets.find((asset) => asset.id === swapForm.fromAssetId)
  const toAsset = protocolAssets.find((asset) => asset.id === swapForm.toAssetId)
  const actionChain =
    state.activeChain ?? fromAsset?.chain ?? activeSession?.chains[0] ?? Chain.MayaChain

  const fromAddress = fromAsset ? resolveSessionAddress(activeSession, fromAsset.chain) : ''
  const toAddress = toAsset ? resolveSessionAddress(activeSession, toAsset.chain) : ''

  const sessionBalances = activeSession ? state.balancesBySession[activeSession.id] : null
  const maxCustomAffiliates = settings.useZeroPercentFee ? 5 : 4

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
    resetQuoteState()
  }

  async function connectActiveChain() {
    await wallet.execute('accounts.connect', { input: { chain: actionChain } })
  }

  async function quoteSwap() {
    if (!activeSession || !fromAsset || !toAsset || !fromAddress || !toAddress) return

    setQuoteError(null)
    setPreparedSwap(null)

    try {
      const result = await runQuoteSwap({
        wallet,
        settings,
        sessionId: activeSession.id,
        fromAsset,
        toAsset,
        fromAddress,
        toAddress,
        amount: swapForm.amount,
        slippageBps: swapForm.slippageBps,
        affiliateDrafts: swapForm.affiliateDrafts,
      })
      setSwapQuote(result)
    } catch (error) {
      setSwapQuote(null)
      setQuoteError((error as Error).message)
    }
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

    const result = await wallet.execute('swap.prepare', {
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
    setPreparedSwap(result.payload)
  }

  function flipSwapPair() {
    updateSwapForm((current) => ({
      ...current,
      fromAssetId: current.toAssetId,
      toAssetId: current.fromAssetId,
    }))
  }

  return (
    <main className="page-wrap flex flex-col items-center justify-center min-h-[85vh] px-4">
      <div className="text-center mb-6 rise-in">
        <h1 className="terminal-title mb-2">Exchange</h1>
        <p className="text-[var(--sea-ink-soft)] max-w-md mx-auto">
          Lightning fast cross-chain swaps directly from your Vault.
        </p>
      </div>

      <article className="glass-panel-strong w-full max-w-lg p-3 rise-in" style={{ animationDelay: '100ms' }}>
        <div className="flex justify-between items-center px-4 py-3">
          <span className="font-bold text-[var(--sea-ink)]">Swap</span>
          <div className="flex items-center gap-2 text-[var(--sea-ink-soft)]">
             {isPowerUser && <Settings size={18} className="cursor-pointer hover:text-[var(--cacao-neon)] transition-colors" />}
          </div>
        </div>

        <div className="bg-[var(--chip-bg)] rounded-[1.25rem] p-5 mb-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:shadow-[0_0_15px_var(--halo-glow)] transition-all">
          <div className="flex justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider">Pay</span>
            <span className="text-xs font-semibold text-[var(--sea-ink-soft)] flex items-center gap-1">
               <Wallet size={12} />
               {sessionBalances ? 'Bal: Available' : 'Connect Vault'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <input
              aria-label="Swap amount"
              type="number"
              placeholder="0.0"
              className="super-input text-5xl"
              value={swapForm.amount}
              onChange={(e) => {
                updateSwapForm((prev) => ({ ...prev, amount: e.target.value }))
              }}
            />

            <button
              className="flex items-center gap-2 bg-[var(--surface-strong)] hover:bg-[var(--surface)] border border-[var(--line)] rounded-full py-2 pl-2 pr-4 shadow-sm transition-colors group"
              onClick={() => setShowFromModal(true)}
            >
              <AssetIcon assetId={swapForm.fromAssetId} className="w-8 h-8 group-hover:scale-105 transition-transform" />
              <span className="font-bold text-xl">{fromAsset?.ticker}</span>
              <ArrowDownUp size={14} className="ml-1 text-[var(--sea-ink-soft)] opacity-50 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        <div className="relative h-2 flex justify-center items-center z-10 my-1">
          <button
            onClick={flipSwapPair}
            className="bg-[var(--bg-base)] border border-[var(--line)] p-2.5 rounded-xl text-[var(--sea-ink-soft)] hover:text-[var(--cacao-neon)] hover:border-[var(--cacao-neon)] hover:scale-110 transition-all shadow-lg group"
          >
            <ArrowDownUp size={16} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        <div className="bg-[var(--chip-bg)] rounded-[1.25rem] p-5 mt-1.5 border border-transparent focus-within:border-[var(--line)] focus-within:shadow-[0_0_15px_var(--halo-glow)] transition-all">
          <div className="flex justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider">Receive</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <input
              aria-label="Quote output"
              type="text"
              placeholder="0.0"
              className="super-input text-5xl"
              value={formatBaseUnits(swapQuote?.estimatedOutput, toAsset?.decimals)}
              readOnly
            />

            <button
              className="flex items-center gap-2 bg-[var(--surface-strong)] hover:bg-[var(--surface)] border border-[var(--line)] rounded-full py-2 pl-2 pr-4 shadow-sm transition-colors group"
              onClick={() => setShowToModal(true)}
            >
              <AssetIcon assetId={swapForm.toAssetId} className="w-8 h-8 group-hover:scale-105 transition-transform" />
              <span className="font-bold text-xl">{toAsset?.ticker}</span>
              <ArrowDownUp size={14} className="ml-1 text-[var(--sea-ink-soft)] opacity-50 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        {isPowerUser && (
          <div className="mt-3 p-5 bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-inner">
             <div className="flex justify-between items-center mb-4">
               <span className="kicker">Pro Settings</span>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)]">Max Slippage (bps)</span>
                  <input
                    aria-label="Max slippage bps"
                    type="number"
                    className="bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none focus:border-[var(--cacao-neon)] transition-colors"
                    value={swapForm.slippageBps}
                    onChange={e => updateSwapForm((current) => ({ ...current, slippageBps: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)]">Custom Affiliates</span>
                  <span className="text-[11px] text-[var(--sea-ink-soft)]">
                    {settings.useZeroPercentFee
                      ? 'Up to 5 custom MAYA affiliates.'
                      : 'Up to 4 custom affiliates. App support uses the fifth slot.'}
                  </span>
                </div>
             </div>
             <div className="grid gap-3 mt-4">
                {swapForm.affiliateDrafts.slice(0, maxCustomAffiliates).map((draft, index) => (
                  <div key={`affiliate-${index}`} className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
                    <input
                      aria-label={`Affiliate ${index + 1} value`}
                      type="text"
                      className="bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none focus:border-[var(--cacao-neon)] transition-colors"
                      placeholder={`Affiliate ${index + 1} MAYAName or address`}
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
                    <input
                      aria-label={`Affiliate ${index + 1} bps`}
                      type="number"
                      className="bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none focus:border-[var(--cacao-neon)] transition-colors"
                      placeholder="bps"
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
                  </div>
                ))}
             </div>
          </div>
        )}

        <div className="mt-3 p-1">
           {primaryAction.kind === 'connect' ? (
              <button className="cacao-btn w-full py-4.5 text-xl tracking-tight shadow-xl" onClick={connectActiveChain}>
                Connect Vault
              </button>
           ) : primaryAction.kind === 'quote' ? (
              <button
                className="cacao-btn w-full py-4.5 text-xl tracking-tight flex items-center justify-center gap-2 shadow-xl"
                disabled={!canQuoteSwap}
                onClick={quoteSwap}
              >
                Get Quote <ArrowRight size={20} />
              </button>
           ) : primaryAction.kind === 'prepare' ? (
              <button
                className="w-full py-4.5 text-xl flex items-center justify-center gap-2 font-bold rounded-full bg-gradient-to-r from-[var(--maya-teal)] to-teal-400 text-[var(--bg-base)] shadow-[0_4px_24px_rgba(79,209,197,0.5)] hover:scale-[1.02] transition-transform"
                disabled={primaryAction.disabled}
                onClick={prepareSwap}
              >
                {primaryAction.label === 'Transaction Ready'
                  ? <><CheckCircle2 size={20} /> Transaction Ready</>
                  : primaryAction.label}
              </button>
           ) : (
              <button
                className="w-full py-4.5 text-xl flex items-center justify-center gap-2 font-bold rounded-full bg-[var(--surface)] border border-[var(--line)] text-[var(--sea-ink-soft)]"
                disabled
                title={swapQuote?.prepareReason}
              >
                {primaryAction.label}
              </button>
           )}
        </div>

        {(swapQuote || quoteError) ? (
          <div className="mt-3 p-4 bg-[var(--surface)] border border-[var(--line)] rounded-2xl">
            {quoteError ? (
              <p className="text-sm text-rose-500">{quoteError}</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm gap-3">
                  <span className="text-[var(--sea-ink-soft)]">Quote route</span>
                  <span className="font-bold text-[var(--sea-ink)] uppercase">{swapQuote?.route}</span>
                </div>
                {swapQuote?.provider ? (
                  <div className="flex items-center justify-between text-sm gap-3 mt-2">
                    <span className="text-[var(--sea-ink-soft)]">Provider</span>
                    <span className="font-bold text-[var(--sea-ink)]">{swapQuote.provider}</span>
                  </div>
                ) : null}
                {swapQuote?.memo ? (
                  <div className="mt-3">
                    <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)]">Memo</div>
                    <div className="mt-1 text-xs font-mono break-all text-[var(--sea-ink)]">{swapQuote.memo}</div>
                  </div>
                ) : null}
                {swapQuote?.prepareReason ? (
                  <p className="mt-3 text-xs text-[var(--sea-ink-soft)]">{swapQuote.prepareReason}</p>
                ) : null}
                {swapQuote ? (
                  <pre className="mt-3 text-xs overflow-auto text-[var(--sea-ink-soft)]">
                    <code>{stringifyForDisplay(getObjectRecord(swapQuote.rawQuote))}</code>
                  </pre>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </article>

      <SelectionModal
        isOpen={showFromModal}
        title="Select Asset to Swap"
        onClose={() => setShowFromModal(false)}
        items={protocolAssets.map(a => ({ id: a.id, label: a.label, iconMain: a.id, subtitle: `${a.chain} Network` }))}
        onSelect={(id) => updateSwapForm((current) => ({ ...current, fromAssetId: id }))}
      />

      <SelectionModal
        isOpen={showToModal}
        title="Select Asset to Receive"
        onClose={() => setShowToModal(false)}
        items={protocolAssets.map(a => ({ id: a.id, label: a.label, iconMain: a.id, subtitle: `${a.chain} Network` }))}
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

  if (!params.hasQuote) {
    return {
      kind: 'quote',
      label: 'Get Quote',
      disabled: false,
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
