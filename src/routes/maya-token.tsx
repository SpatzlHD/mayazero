import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { AlertCircle, Coins, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AssetIcon, shortenAddress } from '#/components/ProtocolPrimitives'
import { fetchCacaotrackerMayaTokenRewards } from '#/lib/cacaotracker'
import { formatBaseUnits } from '#/lib/cacao-pool'
import type { MayaTokenRewardsResponse } from '#/lib/cacaotracker-types'
import { VIEW_ONLY_IMPERSONATION_REASON } from '#/lib/impersonation'
import { buildPageSeoHead } from '#/lib/seo'
import {
  useEffectiveWalletSession,
  useIsViewOnlyImpersonation,
} from '#/provider/ImpersonationProvider'
import {
  fetchAddressBalances,
  useMayaWalletActions,
  useWalletBalanceRefreshTick,
  WalletSessionNotFoundError,
  type AddressBalanceAsset,
  type AddressBalanceResponse,
} from '#/wallet'

export const Route = createFileRoute('/maya-token')({
  head: () =>
    buildPageSeoHead({
      title: 'Maya Token',
      description:
        'Review MAYA token holdings and token reward distributions for the connected MayaChain address.',
    }),
  component: MayaTokenRoute,
})

const MAYA_TOKEN_HINT = {
  decimals: 4,
  id: 'maya',
  name: 'Maya',
  symbol: 'MAYA',
} as const

const defaultLoadBalances = fetchAddressBalances
const defaultLoadRewards = fetchCacaotrackerMayaTokenRewards

type MayaTokenPageProps = {
  loadBalances?: (input: {
    address: string
    assetHints?: Array<{ id: string; symbol?: string; name?: string; decimals?: number }>
    chain: Chain
    includeZeroBalances?: boolean
  }) => Promise<AddressBalanceResponse>
  loadRewards?: (address: string) => Promise<MayaTokenRewardsResponse>
  onMissingSession?: () => void
}

function MayaTokenRoute() {
  const navigate = useNavigate()

  return (
    <MayaTokenPage
      onMissingSession={() => navigate({ to: '/vault-setup' })}
    />
  )
}

export function MayaTokenPage({
  loadBalances = defaultLoadBalances,
  loadRewards = defaultLoadRewards,
  onMissingSession,
}: MayaTokenPageProps) {
  const wallet = useMayaWalletActions()
  const activeSession = useEffectiveWalletSession()
  const isViewOnly = useIsViewOnlyImpersonation()
  const balanceRefreshTick = useWalletBalanceRefreshTick()
  const mayaAddress = activeSession?.addresses[Chain.MayaChain] ?? ''

  const [balanceAsset, setBalanceAsset] = useState<AddressBalanceAsset | null>(null)
  const [isBalanceLoading, setIsBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [rewards, setRewards] = useState<MayaTokenRewardsResponse | null>(null)
  const [isRewardsLoading, setIsRewardsLoading] = useState(false)
  const [rewardsError, setRewardsError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const resolvedBalance = useMemo(
    () => resolveMayaTokenBalance(balanceAsset),
    [balanceAsset],
  )
  const sortedRewards = useMemo(
    () => sortMayaTokenRewards(rewards?.rewards ?? []),
    [rewards?.rewards],
  )
  const latestReward = sortedRewards[0] ?? null

  useEffect(() => {
    let cancelled = false

    async function refreshBalances() {
      if (!mayaAddress) {
        setBalanceAsset(null)
        setBalanceError(null)
        setIsBalanceLoading(false)
        return
      }

      setIsBalanceLoading(true)
      setBalanceError(null)
      try {
        const response = await loadBalances({
          address: mayaAddress,
          assetHints: [MAYA_TOKEN_HINT],
          chain: Chain.MayaChain,
          includeZeroBalances: true,
        })
        if (!cancelled) {
          setBalanceAsset(findMayaTokenBalance(response))
        }
      } catch (error) {
        if (!cancelled) {
          setBalanceAsset(null)
          setBalanceError((error as Error).message)
        }
      } finally {
        if (!cancelled) {
          setIsBalanceLoading(false)
        }
      }
    }

    void refreshBalances()
    return () => {
      cancelled = true
    }
  }, [balanceRefreshTick, loadBalances, mayaAddress, refreshNonce])

  useEffect(() => {
    let cancelled = false

    async function refreshRewards() {
      if (!mayaAddress) {
        setRewards(null)
        setRewardsError(null)
        setIsRewardsLoading(false)
        return
      }

      setIsRewardsLoading(true)
      setRewardsError(null)
      try {
        const nextRewards = await loadRewards(mayaAddress)
        if (!cancelled) {
          setRewards(nextRewards)
        }
      } catch (error) {
        if (!cancelled) {
          setRewards(null)
          setRewardsError((error as Error).message)
        }
      } finally {
        if (!cancelled) {
          setIsRewardsLoading(false)
        }
      }
    }

    void refreshRewards()
    return () => {
      cancelled = true
    }
  }, [balanceRefreshTick, loadRewards, mayaAddress, refreshNonce])

  async function connectMayaChain() {
    if (isViewOnly) {
      return
    }

    if (!activeSession) {
      onMissingSession?.()
      return
    }

    await wallet
      .execute('accounts.connect', {
        sessionId: activeSession.id,
        input: { chain: Chain.MayaChain },
      })
      .catch((error) => {
        if (error instanceof WalletSessionNotFoundError) {
          onMissingSession?.()
          return
        }
        throw error
      })
  }

  const disconnected = !activeSession || !mayaAddress

  if (disconnected) {
    return (
      <PageShell
        title="Maya Token"
        subtitle={
          activeSession
            ? 'Connect a MayaChain address for the active session to inspect MAYA holdings and token rewards.'
            : 'Connect a vault session to inspect MAYA holdings and token rewards.'
        }
      >
        <section className="glass-panel-strong p-6 sm:p-8 max-w-xl mx-auto w-full rise-in relative overflow-visible backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-[2.5rem] border border-[var(--line)]">
          <button
            className="w-full h-[60px] pb-1 text-lg sm:text-xl font-bold tracking-tight rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--surface)] hover:border-[var(--maya-teal)]/50 shadow-sm transition-all active:scale-[0.98]"
            type="button"
            disabled={isViewOnly}
            onClick={() => void connectMayaChain()}
          >
            {isViewOnly
              ? 'View Only'
              : activeSession
                ? 'Connect MayaChain'
                : 'Connect Vault'}
          </button>
          {isViewOnly ? <Warning>{VIEW_ONLY_IMPERSONATION_REASON}</Warning> : null}
        </section>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Maya Token"
      subtitle="Track MAYA token holdings from your MayaChain wallet and inspect token reward distributions from CacaoTracker."
    >
      <section className="max-w-4xl mx-auto w-full grid gap-8 mt-2">
        <article
          className="glass-panel-strong p-2 sm:p-3 rise-in relative overflow-visible backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-[2.5rem] border border-[var(--line)]"
          style={{ animationDelay: '100ms' }}
        >
          <div className="flex justify-between items-center px-6 py-4">
            <span className="font-bold text-[var(--sea-ink)] tracking-wide">
              Token Position
            </span>
            <div className="flex items-center gap-3">
              <button
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink-soft)] hover:text-[var(--maya-teal)] hover:border-[var(--maya-teal)]/30 hover:bg-[var(--surface)] shadow-sm transition-all active:scale-95"
                type="button"
                onClick={() => {
                  setRefreshNonce((current) => current + 1)
                }}
              >
                <RefreshCw
                  size={16}
                  className={
                    isBalanceLoading || isRewardsLoading
                      ? 'animate-spin'
                      : undefined
                  }
                />
              </button>
            </div>
          </div>

          <div className="bg-[var(--chip-bg)]/80 rounded-[2rem] p-5 sm:p-6 mb-1.5 mx-1 sm:mx-0 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300">
            <div className="flex justify-between mb-4">
              <span className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
                Wallet Holding
              </span>
              <div className="text-[11px] font-bold text-[var(--sea-ink-soft)] flex items-center gap-1.5 bg-[var(--surface-strong)] px-2.5 py-1 rounded-full border border-[var(--line)] transition-colors">
                <AssetIcon assetId="maya" className="w-4 h-4 shadow-sm" />
                <span className="text-[var(--sea-ink)]">{shortenAddress(mayaAddress)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-4xl sm:text-5xl flex-1 min-w-0 text-ellipsis overflow-hidden outline-none text-[var(--sea-ink)] font-semibold">
                {isBalanceLoading && !balanceAsset
                  ? '...'
                  : formatTokenAmount(resolvedBalance.formattedAmount, 4)}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-strong)] border border-[var(--line)] rounded-full py-2.5 pl-2.5 pr-4 sm:pr-5 shadow-sm select-none">
                <AssetIcon
                  assetId="maya"
                  className="w-8 h-8 sm:w-9 sm:h-9 shadow-sm"
                />
                <span className="font-bold text-lg sm:text-xl tracking-tight text-[var(--sea-ink)]">
                  MAYA
                </span>
              </div>
            </div>
          </div>

          {(balanceError || rewardsError) ? (
            <div className="px-3 pb-3 mt-4 space-y-3">
              {balanceError ? <Warning>{balanceError}</Warning> : null}
              {rewardsError ? <Warning>{rewardsError}</Warning> : null}
            </div>
          ) : null}
        </article>

        <section
          className="glass-panel-strong p-6 sm:p-8 relative overflow-hidden rise-in backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-[2.5rem] border border-[var(--line)]"
          style={{ animationDelay: '200ms' }}
        >
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="island-kicker mb-1">CacaoTracker</p>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
                Latest Rewards
              </h2>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--chip-bg)] border border-[var(--line)] shadow-sm">
              <Coins size={20} className="text-[var(--cacao-neon)]" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <MetricTile
              label="Total Rewards"
              value={
                isRewardsLoading && rewards == null
                  ? '...'
                  : formatRewardAmount(rewards?.total_cacao ?? '0')
              }
              highlight
            />
            <MetricTile
              label="Distributions"
              value={
                isRewardsLoading && rewards == null
                  ? '...'
                  : String(rewards?.distribution_count ?? 0)
              }
            />
            <MetricTile
              label="Latest Reward"
              value={
                isRewardsLoading && rewards == null
                  ? '...'
                  : formatRewardDistributionDate(latestReward?.block_time ?? null)
              }
            />
          </div>

          <div className="bg-[var(--chip-bg)]/80 rounded-[1.75rem] border border-[var(--line)] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
                Recent Distributions
              </span>
              {isRewardsLoading ? (
                <Loader2 size={14} className="animate-spin text-[var(--sea-ink-soft)]" />
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              {sortedRewards.length ? (
                sortedRewards.slice(0, 8).map((reward) => (
                  <div
                    key={`${reward.block_height}-${reward.block_time}`}
                    className="flex justify-between items-center bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-3 group hover:border-[var(--sea-ink-soft)]/30 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-[var(--sea-ink)] text-sm">
                        {formatRewardAmount(reward.amount)}
                      </p>
                      <p className="text-[10px] text-[var(--sea-ink-soft)] font-bold tracking-wide mt-0.5 uppercase">
                        Block {reward.block_height}
                      </p>
                    </div>
                    <div className="text-right text-xs text-[var(--sea-ink-soft)] font-medium">
                      {formatRewardDistributionDate(reward.block_time)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-sm font-medium text-[var(--sea-ink-soft)]">
                  No token reward distributions were found for this Maya address yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </section>
    </PageShell>
  )
}

function PageShell(props: {
  children: ReactNode
  subtitle: string
  title: string
}) {
  return (
    <main className="page-wrap flex flex-col items-center gap-6 min-h-[85vh] px-4 relative z-0 pb-16 pt-8">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[30rem] h-[30rem] bg-[var(--cacao-neon)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow" />
        <div
          className="absolute bottom-1/4 left-1/4 w-[30rem] h-[30rem] bg-[var(--maya-teal)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow"
          style={{ animationDelay: '2s' }}
        />
      </div>

      <div className="text-center rise-in mb-2 mt-4">
        <p className="island-kicker mb-2 flex justify-center items-center gap-2">
          <Coins size={14} /> Maya Token Rail
        </p>
        <h1 className="terminal-title mb-3 text-4xl sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--sea-ink-soft)] font-black tracking-tight drop-shadow-sm">
          {props.title}
        </h1>
        <p className="text-[var(--sea-ink-soft)]/90 max-w-xl mx-auto text-sm sm:text-base font-medium">
          {props.subtitle}
        </p>
      </div>
      {props.children}
    </main>
  )
}

function MetricTile(props: {
  label: string
  value: string
  highlight?: boolean
  subValue?: string
}) {
  return (
    <div
      className={`rounded-2xl border bg-[var(--bg-base)] p-4 ${props.highlight ? 'border-[var(--maya-teal)]/30 shadow-[0_0_15px_rgba(79,209,197,0.1)]' : 'border-[var(--line)]'}`}
    >
      <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-[0.2em]">
        {props.label}
      </div>
      <div
        className={`mt-2 text-xl sm:text-2xl font-black tracking-tight ${props.highlight ? 'text-[var(--maya-teal)]' : 'text-[var(--sea-ink)]'}`}
      >
        {props.value}
      </div>
      {props.subValue ? (
        <div className="mt-1 text-xs text-[var(--sea-ink-soft)]">{props.subValue}</div>
      ) : null}
    </div>
  )
}

function Warning(props: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 p-3.5 text-sm font-medium text-amber-500">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <p>{props.children}</p>
    </div>
  )
}

function findMayaTokenBalance(
  response: AddressBalanceResponse,
): AddressBalanceAsset | null {
  return (
    response.balances.find((asset) => asset.id.toLowerCase() === MAYA_TOKEN_HINT.id) ??
    response.balances.find((asset) => asset.symbol.toUpperCase() === MAYA_TOKEN_HINT.symbol) ??
    null
  )
}

export function resolveMayaTokenBalance(
  balance: AddressBalanceAsset | null,
): AddressBalanceAsset {
  return (
    balance ?? {
      amount: '0',
      chain: Chain.MayaChain,
      decimals: MAYA_TOKEN_HINT.decimals,
      formattedAmount: '0',
      id: MAYA_TOKEN_HINT.id,
      isNative: false,
      name: MAYA_TOKEN_HINT.name,
      source: 'cosmos-bank',
      symbol: MAYA_TOKEN_HINT.symbol,
    }
  )
}

export function sortMayaTokenRewards(
  rewards: MayaTokenRewardsResponse['rewards'],
): MayaTokenRewardsResponse['rewards'] {
  return [...rewards].sort((left, right) => {
    const leftTime = Date.parse(left.block_time)
    const rightTime = Date.parse(right.block_time)

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime
    }

    return right.block_height - left.block_height
  })
}

export function formatTokenAmount(value: string, maximumFractionDigits = 4): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '0'
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(numeric)
}

export function formatRewardAmount(value: string): string {
  return `${formatTokenAmount(formatBaseUnits(value, 10), 4)} CACAO`
}

export function formatRewardDistributionDate(value: string | null): string {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
