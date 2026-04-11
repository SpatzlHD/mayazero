import { createFileRoute, Link } from '@tanstack/react-router'
import QRCode from 'react-qr-code'
import {
  Activity,
  ArrowLeft,
  Check,
  Coins,
  Copy,
  Link2Off,
  QrCode,
  SendHorizontal,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react'
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { AssetIcon } from '#/components/ProtocolPrimitives'
import { formatBaseUnits, parseDecimalToBaseUnits } from '#/lib/cacao-pool'
import {
  fetchMayaAssetCatalog,
  getMayaSupportedChain,
  type MayaAssetCatalog,
  type MayaSupportedChain,
} from '#/lib/maya-asset-catalog'
import { buildPageSeoHead, getChainSeoContent } from '#/lib/seo'
import { usePreferences } from '#/provider/PreferencesProvider'
import { useSettings } from '#/provider/SettingsProvider'
import {
  createExecutionJourneySteps,
  getAssetSendSupport,
  submitAssetSend,
  fetchAddressBalances,
  trackTransactionJourney,
  useActiveWalletSession,
  useMayaWalletActions,
  useWalletBalanceRefreshTick,
  waitForJourneyTransactionSettlement,
  type AddressBalanceResponse,
  type AssetSendResult,
  type AssetSendSupport,
} from '#/wallet'
import {
  buildChainAssetRows,
  createChainBalanceRequest,
  formatUsd,
  shortenAddress,
  type ChainAssetRow,
} from './-portfolio-data'

export const Route = createFileRoute('/chains/$chainKey')({
  head: ({ params }) => buildPageSeoHead(getChainSeoContent(params.chainKey)),
  component: ChainDetailPage,
})

type ChainDetailSubmitInput = {
  amountBaseUnits: string
  asset: ChainAssetRow
  memo?: string
  recipient: string
}

type ChainDetailContentProps = {
  activeSessionConnected: boolean
  chain: MayaSupportedChain
  chainAddress: string | null
  initialAmount?: string
  initialMemo?: string
  initialRecipient?: string
  initialSelectedAsset?: ChainAssetRow | null
  initialSendError?: string | null
  isAddressCopied: boolean
  isBalanceLoading: boolean
  isPowerUser: boolean
  onCopyChainAddress: () => Promise<void>
  onInitializeWallet: () => Promise<void>
  onResolveAssetSendSupport: (asset: ChainAssetRow) => AssetSendSupport
  onSubmitSend: (input: ChainDetailSubmitInput) => Promise<AssetSendResult>
  rows: ChainAssetRow[]
  totalUsdValue: number
}

export const DEFAULT_ASSET_SEND_SUPPORT_REASON =
  'This asset cannot be sent from the current chain view.'

function ChainDetailPage() {
  const { chainKey } = Route.useParams()
  const wallet = useMayaWalletActions()
  const activeSession = useActiveWalletSession()
  const balanceRefreshTick = useWalletBalanceRefreshTick()
  const settings = useSettings()
  const { isPowerUser } = usePreferences()

  const [catalog, setCatalog] = useState<MayaAssetCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [balanceResponse, setBalanceResponse] =
    useState<AddressBalanceResponse | null>(null)
  const [isBalanceLoading, setIsBalanceLoading] = useState(false)
  const [isAddressCopied, setIsAddressCopied] = useState(false)
  const attemptedAddressRefresh = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      setIsCatalogLoading(true)
      setCatalogError(null)

      try {
        const nextCatalog = await fetchMayaAssetCatalog({
          midgardUrl: settings.midgardUrl,
        })
        if (!cancelled) {
          startTransition(() => {
            setCatalog(nextCatalog)
          })
        }
      } catch (error) {
        if (!cancelled) {
          startTransition(() => {
            setCatalogError((error as Error).message)
          })
        }
      } finally {
        if (!cancelled) {
          setIsCatalogLoading(false)
        }
      }
    }

    void loadCatalog()

    return () => {
      cancelled = true
    }
  }, [settings.midgardUrl])

  const chain = useMemo(
    () => (catalog ? getMayaSupportedChain(catalog, chainKey) : undefined),
    [catalog, chainKey],
  )

  const portfolioSessionKey = useMemo(() => {
    if (!activeSession || !chain?.walletChain) {
      return `none:${chainKey}`
    }

    return [
      activeSession.id,
      activeSession.status,
      chain.key,
      activeSession.chains.join(','),
      activeSession.addresses[chain.walletChain] ?? '',
    ].join('::')
  }, [activeSession, chain, chainKey])

  async function refreshBalancesForChain(
    targetChain: MayaSupportedChain | undefined,
  ): Promise<void> {
    if (!targetChain) {
      startTransition(() => {
        setBalanceResponse(null)
        setIsBalanceLoading(false)
      })
      return
    }

    if (
      !activeSession ||
      !targetChain.walletChain ||
      !activeSession.chains.includes(targetChain.walletChain)
    ) {
      startTransition(() => {
        setBalanceResponse(null)
        setIsBalanceLoading(false)
      })
      return
    }

    setIsBalanceLoading(true)

    try {
      let resolvedAddresses = activeSession.addresses
      if (!resolvedAddresses[targetChain.walletChain]) {
        const refreshKey = `${activeSession.id}:${targetChain.key}`
        if (!attemptedAddressRefresh.current.has(refreshKey)) {
          attemptedAddressRefresh.current.add(refreshKey)
          try {
            const { addresses } = await wallet.execute('addresses.list', {
              input: { chains: [targetChain.walletChain] },
              sessionId: activeSession.id,
              track: false,
            })
            resolvedAddresses = { ...resolvedAddresses, ...addresses }
          } catch {
            // Keep the current address snapshot and surface the missing address state.
          }
        }
      }

      const request = createChainBalanceRequest(
        { ...activeSession, addresses: resolvedAddresses },
        targetChain,
      )

      if (!request) {
        startTransition(() => {
          setBalanceResponse(null)
        })
        return
      }

      const nextResponse = await fetchAddressBalances(request)
      startTransition(() => {
        setBalanceResponse(nextResponse)
      })
    } catch {
      startTransition(() => {
        setBalanceResponse(null)
      })
    } finally {
      setIsBalanceLoading(false)
    }
  }

  useEffect(() => {
    void refreshBalancesForChain(chain)
  }, [chain, portfolioSessionKey, wallet, balanceRefreshTick])

  const { rows, totalUsdValue } = useMemo(
    () =>
      chain
        ? buildChainAssetRows({
            session: activeSession,
            chain,
            response: balanceResponse,
          })
        : { rows: [], totalUsdValue: 0 },
    [activeSession, balanceResponse, chain],
  )

  const chainAddress =
    chain?.walletChain && activeSession
      ? activeSession.addresses[chain.walletChain] ?? null
      : null

  async function copyChainAddress() {
    if (!chainAddress) {
      return
    }

    try {
      await navigator.clipboard.writeText(chainAddress)
      setIsAddressCopied(true)
      window.setTimeout(() => {
        setIsAddressCopied(false)
      }, 2000)
    } catch {
      // Ignore clipboard failures in unsupported environments.
    }
  }

  function resolveAssetSendSupportForRow(asset: ChainAssetRow): AssetSendSupport {
    const sendAsset = toSendAsset(asset)
    if (!sendAsset) {
      return {
        supported: false,
        reason: DEFAULT_ASSET_SEND_SUPPORT_REASON,
      }
    }

    return getAssetSendSupport(wallet, {
      asset: sendAsset,
      sessionId: activeSession?.id,
    })
  }

  async function handleSubmitSend(
    input: ChainDetailSubmitInput,
  ): Promise<AssetSendResult> {
    const sendAsset = toSendAsset(input.asset)
    if (!sendAsset) {
      throw new Error(DEFAULT_ASSET_SEND_SUPPORT_REASON)
    }

    if (!activeSession) {
      throw new Error('Connect a wallet session before sending assets.')
    }

    const result = await trackTransactionJourney(wallet, {
      kind: 'send',
      title: `Send ${input.asset.symbol}`,
      sessionId: activeSession.id,
      source: activeSession.source,
      chain: sendAsset.chain,
      routePath: '/chains/:chainKey',
      analytics: {
        action: 'send',
        route: '/chains/:chainKey',
        subject: 'asset_send',
      },
      steps: createExecutionJourneySteps({
        source: activeSession.source,
        finalLabel: 'Transfer Complete',
      }),
      run: async (journey) => {
        journey.activateStep('preparing', 'Preparing transfer payload.')
        const sendResult = await submitAssetSend(wallet, {
          amountBaseUnits: input.amountBaseUnits,
          asset: sendAsset,
          journeyId: journey.journeyId,
          memo: input.memo,
          recipient: input.recipient,
          sessionId: activeSession.id,
        })

        journey.completeStep('preparing', 'Transfer payload prepared.')
        if (activeSession.source === 'extension') {
          journey.completeStep('provider', 'Extension accepted the transfer request.')
        } else {
          journey.completeStep('signing', 'Vault signing complete.')
        }
        journey.setPrimaryTxHash(sendResult.txHash)
        journey.completeStep(
          'broadcasting',
          sendResult.txHash
            ? 'Transfer broadcast submitted.'
            : 'Transfer submitted without a returned hash.',
        )
        journey.activateStep('confirming', 'Waiting for on-chain confirmation.')

        const settlement = await waitForJourneyTransactionSettlement(wallet, {
          chain: sendAsset.chain,
          journeyId: journey.journeyId,
          primary: true,
          sessionId: activeSession.id,
          stepKey: 'confirming',
          txHash: sendResult.txHash,
        })

        journey.updateStep('complete', {
          status:
            settlement === 'success'
              ? 'success'
              : settlement === 'error'
                ? 'error'
                : settlement === 'unconfirmed'
                  ? 'unconfirmed'
                  : 'attention',
          message:
            settlement === 'success'
              ? 'Transfer confirmed on-chain.'
              : settlement === 'error'
                ? 'Transfer failed on-chain.'
                : settlement === 'unconfirmed'
                  ? 'Transfer submitted, but confirmation timed out.'
                  : 'Transfer submitted, but automatic tracking is unavailable.',
        })
        journey.complete(sendResult, settlement)
        return sendResult
      },
    })

    try {
      await refreshBalancesForChain(chain)
    } catch {
      // Preserve the successful tx result even if the post-send balance refresh fails.
    }

    return result
  }

  if (isCatalogLoading) {
    return (
      <main className="page-wrap max-w-4xl mx-auto px-4 py-20 flex justify-center text-[var(--sea-ink-soft)]">
        <div className="w-8 h-8 rounded-full border-t-2 border-[var(--cacao-neon)] animate-spin" />
      </main>
    )
  }

  if (catalogError || !chain) {
    return (
      <main className="page-wrap max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-rose-500 mb-4">
          {catalogError ?? 'Network unavailable'}
        </h1>
        <Link
          to="/"
          className="text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] font-medium"
        >
          Back to Portfolio
        </Link>
      </main>
    )
  }

  return (
    <main className="page-wrap px-4 pb-20 pt-6 sm:pt-8 max-w-4xl mx-auto rise-in">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--sea-ink-soft)] no-underline hover:text-[var(--cacao-neon)] transition-colors mb-10"
      >
        <ArrowLeft size={16} /> Back to Portfolio
      </Link>

      <ChainDetailContent
        activeSessionConnected={Boolean(activeSession)}
        chain={chain}
        chainAddress={chainAddress}
        isAddressCopied={isAddressCopied}
        isBalanceLoading={isBalanceLoading}
        isPowerUser={isPowerUser}
        onCopyChainAddress={copyChainAddress}
        onInitializeWallet={() => wallet.initialize()}
        onResolveAssetSendSupport={resolveAssetSendSupportForRow}
        onSubmitSend={handleSubmitSend}
        rows={rows}
        totalUsdValue={totalUsdValue}
      />
    </main>
  )
}

export function ChainDetailContent(props: ChainDetailContentProps) {
  const [selectedAsset, setSelectedAsset] = useState<ChainAssetRow | null>(
    () => props.initialSelectedAsset ?? null,
  )
  const [recipient, setRecipient] = useState(() => props.initialRecipient ?? '')
  const [amount, setAmount] = useState(() => props.initialAmount ?? '')
  const [memo, setMemo] = useState(() => props.initialMemo ?? '')
  const [sendError, setSendError] = useState<string | null>(
    () => props.initialSendError ?? null,
  )
  const [isSending, setIsSending] = useState(false)

  const selectedSupport = selectedAsset
    ? props.onResolveAssetSendSupport(selectedAsset)
    : null
  const amountBaseUnits = selectedAsset
    ? parseDecimalToBaseUnits(amount, selectedAsset.decimals)
    : null
  const validationError = selectedAsset
    ? getChainAssetSendValidationError({
        amount,
        amountBaseUnits,
        asset: selectedAsset,
        recipient,
      })
    : null

  function resetSendState() {
    setRecipient('')
    setAmount('')
    setMemo('')
    setSendError(null)
    setIsSending(false)
  }

  function openSendModal(asset: ChainAssetRow) {
    setSelectedAsset(asset)
    resetSendState()
  }

  function closeSendModal() {
    setSelectedAsset(null)
    resetSendState()
  }

  function populateMaxAmount() {
    if (!selectedAsset?.balanceBaseUnits) {
      return
    }

    setAmount(formatBaseUnits(selectedAsset.balanceBaseUnits, selectedAsset.decimals))
    setSendError(null)
  }

  async function handleSendSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedAsset) {
      return
    }

    if (!selectedSupport?.supported) {
      setSendError(selectedSupport?.reason ?? DEFAULT_ASSET_SEND_SUPPORT_REASON)
      return
    }

    if (validationError || !amountBaseUnits) {
      setSendError(validationError ?? 'Enter a valid amount to send.')
      return
    }

    setIsSending(true)
    setSendError(null)

    try {
      await props.onSubmitSend({
        amountBaseUnits,
        asset: selectedAsset,
        memo: props.isPowerUser ? memo : undefined,
        recipient,
      })
      closeSendModal()
    } catch (error) {
      setSendError((error as Error).message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
        <div className="flex items-center gap-5">
          <AssetIcon
            assetId={props.chain.iconId}
            className="w-16 h-16 rounded-full border-[2px] border-[var(--line)] bg-[var(--surface)] shadow-md"
          />
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--sea-ink)] leading-none mb-2">
              {props.chain.name}
            </h1>
            <div className="text-[var(--sea-ink-soft)] font-medium text-sm flex items-center gap-2">
              {props.chain.ticker} Network
            </div>
          </div>
        </div>

        <div className="sm:text-right">
          <div className="text-[12px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)] mb-1">
            Total Balance
          </div>
          <div className="text-3xl sm:text-4xl font-black text-[var(--sea-ink)] tracking-tighter">
            {formatUsd(props.totalUsdValue)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-10">
        <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--surface-strong)] flex items-center justify-center text-[var(--cacao-neon)] opacity-80">
            <Coins size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
              Chain Assets
            </div>
            <div className="font-bold text-[var(--sea-ink)] leading-none">
              {props.chain.assets.length} listed
            </div>
          </div>
        </div>

        {!props.activeSessionConnected ? (
          <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
              <Link2Off size={16} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-rose-500/80 tracking-wider">
                Wallet Status
              </div>
              <div className="font-bold text-rose-500 leading-none">
                Disconnected
              </div>
            </div>
          </div>
        ) : props.chainAddress ? (
          <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--maya-teal)]/10 flex items-center justify-center text-[var(--maya-teal)]">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--maya-teal)]/80 tracking-wider">
                Connected Address
              </div>
              <div className="font-bold text-[var(--maya-teal)] leading-none">
                {shortenAddress(props.chainAddress)}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--surface-strong)] flex items-center justify-center text-[var(--sea-ink-soft)]">
              <Activity size={16} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                Wallet Status
              </div>
              <div className="font-bold text-[var(--sea-ink)] leading-none">
                Unsynced
              </div>
            </div>
          </div>
        )}
      </div>

      <section className="glass-panel shadow-sm rounded-[24px] border border-[var(--line)] p-5 sm:p-6 mb-10 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--maya-teal)]/30 to-transparent" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
          <div className="shrink-0 w-full sm:w-auto flex justify-center">
            <div className="rounded-[20px] border border-[var(--line)] bg-white p-3 shadow-sm inline-block">
              {props.chainAddress ? (
                <QRCode
                  value={props.chainAddress}
                  size={120}
                  className="w-[120px] h-[120px]"
                  bgColor="transparent"
                  fgColor="#062b2c"
                />
              ) : (
                <div className="w-[120px] h-[120px] rounded-[16px] border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
                  <QrCode size={28} className="mb-2 opacity-50" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center leading-tight">
                    Not
                    <br />
                    Synced
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]">
                <QrCode size={14} />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--sea-ink)] leading-none">
                Receive {props.chain.ticker}
              </h2>
            </div>

            <p className="text-sm text-[var(--sea-ink-soft)] mb-5 max-w-xl">
              Scan the QR code or copy the address below to receive {props.chain.ticker}{' '}
              and {props.chain.name} assets into your connected vault.
            </p>

            {props.chainAddress ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 shadow-inner flex items-center">
                  <span className="font-mono text-sm truncate text-[var(--sea-ink)] w-full block">
                    {props.chainAddress}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void props.onCopyChainAddress()}
                  className="shrink-0 inline-flex items-center justify-center gap-2 h-[46px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)] hover:border-[var(--maya-teal)]/50 hover:text-[var(--maya-teal)] transition-colors font-bold text-sm"
                  title="Copy address"
                >
                  {props.isAddressCopied ? <Check size={16} /> : <Copy size={16} />}
                  <span className="hidden sm:inline">
                    {props.isAddressCopied ? 'Copied' : 'Copy'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)]/60 px-4 py-4 text-sm text-[var(--sea-ink-soft)] text-center sm:text-left">
                {props.activeSessionConnected
                  ? `Connect or sync your ${props.chain.name} address to generate a receive address.`
                  : 'Connect your vault to generate a receive address for this chain.'}
              </div>
            )}
          </div>
        </div>
      </section>

      {!props.activeSessionConnected && (
        <div className="mb-10 flex">
          <button
            className="cacao-btn px-8 py-3 text-sm flex items-center justify-center gap-2 shadow-sm rounded-xl"
            onClick={() => void props.onInitializeWallet()}
          >
            <WalletCards size={18} /> Connect Vault to load balances
          </button>
        </div>
      )}

      <h2 className="text-xl font-bold text-[var(--sea-ink)] mb-4 ml-1 flex items-center gap-2">
        <Activity size={20} className="text-[var(--sea-ink-soft)]" /> Network Assets
      </h2>

      <div className="glass-panel shadow-lg rounded-[28px] border border-[var(--line)] relative min-h-[200px] overflow-hidden">
        {props.isBalanceLoading && (
          <div className="absolute top-4 right-4 z-10 w-4 h-4 rounded-full border-t-2 border-[var(--cacao-neon)] animate-spin" />
        )}

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-strong)]/50">
              <th className="py-4 px-6 text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">
                Asset
              </th>
              <th className="py-4 px-6 text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider text-right">
                Balance
              </th>
              <th className="py-4 px-6 text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((asset) => {
              const sendSupport =
                asset.status === 'ready'
                  ? props.onResolveAssetSendSupport(asset)
                  : {
                      supported: false,
                      reason:
                        asset.status === 'missing-address'
                          ? `Connect or sync a ${props.chain.name} address before sending.`
                          : DEFAULT_ASSET_SEND_SUPPORT_REASON,
                    }
              const sendDisabled = asset.status !== 'ready' || !sendSupport.supported

              return (
                <tr
                  key={asset.id}
                  className="border-b border-[var(--line)] hover:bg-[var(--surface-strong)] transition-colors group last:border-0"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <AssetIcon
                        assetId={asset.iconRaw}
                        className="w-10 h-10 rounded-full border border-[var(--line)] bg-[var(--surface)] group-hover:scale-105 transition-transform shadow-sm"
                      />
                      <div>
                        <div className="font-bold text-[var(--sea-ink)] text-lg leading-tight transition-colors group-hover:text-[var(--maya-teal)]">
                          {asset.label}
                        </div>
                        <div className="text-[12px] font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">
                          {asset.symbol}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="font-bold text-[var(--sea-ink)] text-xl leading-none mb-1">
                      {asset.balance}
                    </div>
                    <div className="text-[13px] font-medium text-[var(--sea-ink-soft)]">
                      {asset.usd}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      type="button"
                      disabled={sendDisabled}
                      title={sendDisabled ? sendSupport.reason : `Send ${asset.symbol}`}
                      onClick={() => openSendModal(asset)}
                      className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border font-bold text-sm transition-colors ${
                        sendDisabled
                          ? 'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)] cursor-not-allowed'
                          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)] hover:border-[var(--maya-teal)]/50 hover:text-[var(--maya-teal)]'
                      }`}
                    >
                      <SendHorizontal size={15} />
                      Send
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,43,44,0.55)] backdrop-blur-sm px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-asset-title"
            className="w-full max-w-xl glass-panel shadow-2xl rounded-[28px] border border-[var(--line)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--line)]">
              <div className="flex items-center gap-3">
                <AssetIcon
                  assetId={selectedAsset.iconRaw}
                  className="w-10 h-10 rounded-full border border-[var(--line)] bg-[var(--surface)]"
                />
                <div>
                  <h3
                    id="send-asset-title"
                    className="text-2xl font-bold tracking-tight text-[var(--sea-ink)]"
                  >
                    Send {selectedAsset.symbol}
                  </h3>
                  <p className="text-sm text-[var(--sea-ink-soft)]">
                    Transfer {selectedAsset.label} from this wallet session.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close send modal"
                onClick={closeSendModal}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <form className="space-y-5" onSubmit={(event) => void handleSendSubmit(event)}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="send-recipient"
                        className="text-xs font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]"
                      >
                        Recipient Address
                      </label>
                      <span className="text-xs text-[var(--sea-ink-soft)]">
                        From {shortenAddress(selectedAsset.address ?? selectedSupport?.sourceAddress ?? '')}
                      </span>
                    </div>
                    <input
                      id="send-recipient"
                      value={recipient}
                      onChange={(event) => {
                        setRecipient(event.target.value)
                        setSendError(null)
                      }}
                      placeholder={`Enter ${props.chain.name} destination`}
                      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="send-amount"
                        className="text-xs font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]"
                      >
                        Amount
                      </label>
                      <span className="text-xs text-[var(--sea-ink-soft)]">
                        Available {selectedAsset.balance}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="send-amount"
                        value={amount}
                        onChange={(event) => {
                          setAmount(event.target.value)
                          setSendError(null)
                        }}
                        inputMode="decimal"
                        placeholder={`0.0 ${selectedAsset.symbol}`}
                        className="flex-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)]"
                      />
                      <button
                        type="button"
                        onClick={populateMaxAmount}
                        className="inline-flex items-center justify-center h-11 px-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)] font-bold text-sm"
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  {props.isPowerUser && (
                    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]/70 px-4 py-4 space-y-4">
                      <div>
                        <label
                          htmlFor="send-memo"
                          className="text-xs font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]"
                        >
                          Memo
                        </label>
                        <input
                          id="send-memo"
                          value={memo}
                          onChange={(event) => {
                            setMemo(event.target.value)
                            setSendError(null)
                          }}
                          placeholder="Optional memo"
                          className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--maya-teal)]"
                        />
                      </div>
                      <div className="grid gap-3 text-sm">
                        <DiagnosticRow
                          label="Source address"
                          value={selectedAsset.address ?? selectedSupport?.sourceAddress ?? 'n/a'}
                          monospace
                        />
                        <DiagnosticRow
                          label="Token identifier"
                          value={selectedAsset.tokenId ?? (!selectedAsset.isNative ? selectedAsset.assetId : 'native')}
                          monospace
                        />
                        <DiagnosticRow
                          label="Base-unit preview"
                          value={amountBaseUnits ?? 'invalid'}
                          monospace
                        />
                      </div>
                    </div>
                  )}

                  {selectedSupport && !selectedSupport.supported && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                      {selectedSupport.reason}
                    </div>
                  )}

                  {(sendError || validationError) && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-600">
                      {sendError ?? validationError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeSendModal}
                      className="inline-flex items-center justify-center h-11 px-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSending || !selectedSupport?.supported || Boolean(validationError)}
                      className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-bold ${
                        isSending || !selectedSupport?.supported || Boolean(validationError)
                          ? 'border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)] cursor-not-allowed'
                          : 'cacao-btn'
                      }`}
                    >
                      {isSending ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-t-2 border-current animate-spin" />
                          Sending
                        </>
                      ) : (
                        <>
                          <SendHorizontal size={16} />
                          Send Asset
                        </>
                      )}
                    </button>
                  </div>
                </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function getChainAssetSendValidationError(_input: {
  amount: string
  amountBaseUnits: string | null
  asset: Pick<ChainAssetRow, 'balanceBaseUnits' | 'decimals' | 'symbol'>
  recipient: string
}): string | null {
  if (!_input.recipient.trim()) {
    return 'Recipient address is required.'
  }

  if (!_input.amount.trim()) {
    return 'Amount is required.'
  }

  if (_input.amountBaseUnits == null) {
    return `Amount must use at most ${_input.asset.decimals} decimal places.`
  }

  if (!/^\d+$/.test(_input.amountBaseUnits) || _input.amountBaseUnits === '0') {
    return 'Amount must be greater than zero.'
  }

  if (
    _input.asset.balanceBaseUnits &&
    BigInt(_input.amountBaseUnits) > BigInt(_input.asset.balanceBaseUnits)
  ) {
    return `Amount exceeds available ${_input.asset.symbol} balance.`
  }

  return null
}

function DiagnosticRow(props: {
  label: string
  monospace?: boolean
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[var(--sea-ink-soft)]">{props.label}</span>
      <span
        className={`text-right text-[var(--sea-ink)] break-all ${
          props.monospace ? 'font-mono text-xs' : 'font-semibold'
        }`}
      >
        {props.value}
      </span>
    </div>
  )
}

function toSendAsset(asset: ChainAssetRow) {
  if (!asset.walletChain) {
    return null
  }

  return {
    assetId: asset.assetId,
    chain: asset.walletChain,
    decimals: asset.decimals,
    isNative: asset.isNative,
    ticker: asset.symbol,
    ...(asset.tokenId ? { tokenId: asset.tokenId } : {}),
  }
}
