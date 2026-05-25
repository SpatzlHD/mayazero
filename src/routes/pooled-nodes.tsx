import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Chain } from '@vultisig/sdk'
import { AlertCircle, RefreshCw, Shield, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BondPortfolioSummary } from '#/components/pooled-nodes/BondPortfolioSummary'
import { PooledNodeWorkspace } from '#/components/pooled-nodes/PooledNodeWorkspace'
import {
  AddressChip,
  AlertStack,
  CompactToolbar,
  MessageState,
  PageContent,
  PageShell,
  PrimaryPanel,
  SessionBadge,
  SkeletonPanel,
  Warning,
  type AlertItem,
} from '#/components/pooled-nodes/shared'
import { fetchCacaotrackerPooledNodesDetail, fetchCacaotrackerWalletActivity } from '#/lib/cacaotracker'
import type {
  BondProviderSummary,
  PooledNodesDetailResponse,
  WalletActivityResponse,
} from '#/lib/cacaotracker-types'
import { formatCacaoBaseUnits, fetchCacaoPoolPosition, type CacaoPoolPosition } from '#/lib/cacao-pool'
import { fetchLiquidityPositions, type LiquidityPosition } from '#/lib/liquidity'
import { VIEW_ONLY_IMPERSONATION_REASON } from '#/lib/impersonation'
import { filterBondActivity } from '#/lib/pooled-nodes-activity'
import {
  buildBondPortfolioSummary,
  fetchPooledNodes,
  type PooledNode,
} from '#/lib/pooled-nodes'
import {
  useEffectiveWalletSession,
  useIsViewOnlyImpersonation,
} from '#/provider/ImpersonationProvider'
import { useSettings } from '#/provider/SettingsProvider'
import { buildPageSeoHead } from '#/lib/seo'
import {
  createExecutionJourneySteps,
  fetchAddressBalances,
  getPooledNodeActionSupport,
  submitPooledNodeAction,
  trackTransactionJourney,
  useMayaWalletActions,
  useWalletBalanceRefreshTick,
  waitForJourneyTransactionSettlement,
  WalletSessionNotFoundError,
  type AddressBalanceResponse,
  type PooledNodeActionKind,
} from '#/wallet'

type PooledNodesSearch = {
  node?: string
}

export const Route = createFileRoute('/pooled-nodes')({
  validateSearch: (search: Record<string, unknown>): PooledNodesSearch => ({
    node: typeof search.node === 'string' && search.node.trim() ? search.node : undefined,
  }),
  head: () =>
    buildPageSeoHead({
      title: 'Pooled Nodes',
      description:
        'Manage pooled MAYANodes related to your connected MayaChain address.',
    }),
  component: PooledNodesRoute,
})

type LoadNodes = (input: {
  connectedAddress: string
  mayanodeUrl: string
}) => Promise<PooledNode[]>

type Props = {
  loadNodes?: LoadNodes
  onMissingSession?: () => void
  submitAction?: typeof submitPooledNodeAction
  loadAnalytics?: (address: string) => Promise<PooledNodesDetailResponse>
  loadBalances?: (input: {
    chain: Chain
    address: string
    includeZeroBalances?: boolean
  }) => Promise<AddressBalanceResponse>
  loadActivity?: (address: string) => Promise<WalletActivityResponse>
  loadLiquidityPositions?: (address: string) => Promise<LiquidityPosition[]>
  loadCacaoPoolPosition?: (address: string) => Promise<CacaoPoolPosition | null>
  preferredNodeAddress?: string
  onNodeChange?: (nodeAddress: string) => void
}

const defaultLoadNodes: LoadNodes = (input) =>
  fetchPooledNodes({
    connectedAddress: input.connectedAddress,
    mayanodeUrl: input.mayanodeUrl,
  })

const defaultLoadLiquidityPositions = (address: string) =>
  fetchLiquidityPositions([address])

function resolveSelectedNodeAddress(
  nodes: PooledNode[],
  current: string,
  preferred?: string,
): string {
  if (preferred && nodes.some((node) => node.nodeAddress === preferred)) {
    return preferred
  }
  if (current && nodes.some((node) => node.nodeAddress === current)) {
    return current
  }
  return nodes[0]?.nodeAddress ?? ''
}

function PooledNodesRoute() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const handleNodeChange = useCallback(
    (nodeAddress: string) => {
      navigate({
        to: '/pooled-nodes',
        search: nodeAddress ? { node: nodeAddress } : {},
        replace: true,
      })
    },
    [navigate],
  )

  return (
    <PooledNodesPage
      preferredNodeAddress={search.node}
      onMissingSession={() => navigate({ to: '/vault-setup' })}
      onNodeChange={handleNodeChange}
    />
  )
}

export function PooledNodesPage({
  loadNodes = defaultLoadNodes,
  onMissingSession,
  submitAction = submitPooledNodeAction,
  loadAnalytics = fetchCacaotrackerPooledNodesDetail,
  loadBalances = fetchAddressBalances,
  loadActivity = fetchCacaotrackerWalletActivity,
  loadLiquidityPositions = defaultLoadLiquidityPositions,
  loadCacaoPoolPosition = fetchCacaoPoolPosition,
  preferredNodeAddress,
  onNodeChange,
}: Props) {
  const wallet = useMayaWalletActions()
  const settings = useSettings()
  const activeSession = useEffectiveWalletSession()
  const isViewOnly = useIsViewOnlyImpersonation()
  const balanceRefreshTick = useWalletBalanceRefreshTick()
  const mayaAddress = activeSession?.addresses[Chain.MayaChain] ?? ''
  const support = isViewOnly
    ? { supported: false, reason: VIEW_ONLY_IMPERSONATION_REASON }
    : getPooledNodeActionSupport(wallet, activeSession?.id)

  const [nodes, setNodes] = useState<PooledNode[]>([])
  const [selectedNodeAddress, setSelectedNodeAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [providerBondData, setProviderBondData] = useState<BondProviderSummary | null>(null)
  const [providerBondError, setProviderBondError] = useState<string | null>(null)
  const [liquidityPositions, setLiquidityPositions] = useState<LiquidityPosition[]>([])
  const [cacaoPoolPosition, setCacaoPoolPosition] = useState<CacaoPoolPosition | null>(null)
  const [positionsError, setPositionsError] = useState<string | null>(null)
  const [cacaoBalanceBaseUnits, setCacaoBalanceBaseUnits] = useState<string | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [bondActivity, setBondActivity] = useState<ReturnType<typeof filterBondActivity>>([])
  const [activityError, setActivityError] = useState<string | null>(null)
  const [isActivityLoading, setIsActivityLoading] = useState(false)
  const loadNodesRef = useRef(loadNodes)
  const loadAnalyticsRef = useRef(loadAnalytics)
  const loadBalancesRef = useRef(loadBalances)
  const loadActivityRef = useRef(loadActivity)
  const loadLiquidityPositionsRef = useRef(loadLiquidityPositions)
  const loadCacaoPoolPositionRef = useRef(loadCacaoPoolPosition)
  const preferredNodeRef = useRef(preferredNodeAddress)
  const onNodeChangeRef = useRef(onNodeChange)
  const mayanodeUrlRef = useRef(settings.mayanodeUrl)

  useEffect(() => {
    loadNodesRef.current = loadNodes
    loadAnalyticsRef.current = loadAnalytics
    loadBalancesRef.current = loadBalances
    loadActivityRef.current = loadActivity
    loadLiquidityPositionsRef.current = loadLiquidityPositions
    loadCacaoPoolPositionRef.current = loadCacaoPoolPosition
  }, [
    loadActivity,
    loadAnalytics,
    loadBalances,
    loadCacaoPoolPosition,
    loadLiquidityPositions,
    loadNodes,
  ])

  useEffect(() => {
    preferredNodeRef.current = preferredNodeAddress
  }, [preferredNodeAddress])

  useEffect(() => {
    onNodeChangeRef.current = onNodeChange
  }, [onNodeChange])

  useEffect(() => {
    mayanodeUrlRef.current = settings.mayanodeUrl
  }, [settings.mayanodeUrl])

  const selectedNode = useMemo(
    () =>
      nodes.find((node) => node.nodeAddress === selectedNodeAddress) ??
      nodes[0] ??
      null,
    [nodes, selectedNodeAddress],
  )

  const portfolioSummary = useMemo(
    () => buildBondPortfolioSummary(nodes, providerBondData),
    [nodes, providerBondData],
  )

  const formattedBalance = formatCacaoBaseUnits(cacaoBalanceBaseUnits ?? '0') || '0'

  const alerts = useMemo((): AlertItem[] => {
    const next: AlertItem[] = []
    if (support.reason) {
      next.push({ id: 'support', message: support.reason, tone: 'warning' })
    }
    if (submitError) {
      next.push({ id: 'submit', message: submitError, tone: 'error' })
    }
    if (balanceError) {
      next.push({ id: 'balance', message: balanceError, tone: 'warning' })
    }
    if (positionsError) {
      next.push({ id: 'positions', message: positionsError, tone: 'warning' })
    }
    if (providerBondError) {
      next.push({ id: 'provider-bond', message: providerBondError, tone: 'warning' })
    }
    if (loadError && nodes.length > 0) {
      next.push({ id: 'load', message: loadError, tone: 'warning' })
    }
    return next
  }, [
    balanceError,
    loadError,
    nodes.length,
    positionsError,
    providerBondError,
    submitError,
    support.reason,
  ])

  const selectNode = useCallback((nodeAddress: string) => {
    setSelectedNodeAddress(nodeAddress)
    onNodeChangeRef.current?.(nodeAddress)
  }, [])

  const syncSelectedNodeUrl = useCallback((resolved: string) => {
    if (!resolved || resolved === preferredNodeRef.current) {
      return
    }
    onNodeChangeRef.current?.(resolved)
  }, [])

  const loadAllData = useCallback(async () => {
    if (!mayaAddress) {
      return
    }

    const next = await loadNodesRef.current({
      connectedAddress: mayaAddress,
      mayanodeUrl: mayanodeUrlRef.current,
    })
    setNodes(next)
    setSelectedNodeAddress((current) => {
      const resolved = resolveSelectedNodeAddress(
        next,
        current,
        preferredNodeRef.current,
      )
      syncSelectedNodeUrl(resolved)
      return resolved
    })
    setLoadError(null)

    setProviderBondError(null)
    try {
      const analytics = await loadAnalyticsRef.current(mayaAddress)
      setProviderBondData(analytics.providerBond)
    } catch (error) {
      setProviderBondData(null)
      setProviderBondError((error as Error).message)
    }

    setBalanceError(null)
    try {
      const response = await loadBalancesRef.current({
        chain: Chain.MayaChain,
        address: mayaAddress,
        includeZeroBalances: true,
      })
      const cacao =
        response.balances.find(
          (asset) =>
            asset.id === 'cacao' ||
            asset.isNative ||
            asset.symbol.toUpperCase() === 'CACAO',
        ) ?? null
      setCacaoBalanceBaseUnits(cacao?.amount ?? '0')
    } catch (error) {
      setCacaoBalanceBaseUnits(null)
      setBalanceError((error as Error).message)
    }

    setIsActivityLoading(true)
    setActivityError(null)
    try {
      const response = await loadActivityRef.current(mayaAddress)
      setBondActivity(filterBondActivity(response.actions))
    } catch (error) {
      setBondActivity([])
      setActivityError((error as Error).message)
    } finally {
      setIsActivityLoading(false)
    }

    setPositionsError(null)
    try {
      const [liquidity, cacaoPool] = await Promise.all([
        loadLiquidityPositionsRef.current(mayaAddress),
        loadCacaoPoolPositionRef.current(mayaAddress).catch(() => null),
      ])
      setLiquidityPositions(liquidity)
      setCacaoPoolPosition(cacaoPool)
    } catch (error) {
      setLiquidityPositions([])
      setCacaoPoolPosition(null)
      setPositionsError((error as Error).message)
    }
  }, [mayaAddress, syncSelectedNodeUrl])

  const refreshAll = useCallback(
    async (options?: { initial?: boolean }) => {
      if (!mayaAddress) return

      if (options?.initial) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }

      try {
        await loadAllData()
      } catch (error) {
        setNodes([])
        setSelectedNodeAddress('')
        setLoadError((error as Error).message)
      } finally {
        if (options?.initial) {
          setIsLoading(false)
        } else {
          setIsRefreshing(false)
        }
      }
    },
    [loadAllData, mayaAddress],
  )

  useEffect(() => {
    if (!mayaAddress) {
      setNodes([])
      setSelectedNodeAddress('')
      setLoadError(null)
      setIsLoading(false)
      setIsRefreshing(false)
      setProviderBondData(null)
      setProviderBondError(null)
      setCacaoBalanceBaseUnits(null)
      setBalanceError(null)
      setBondActivity([])
      setActivityError(null)
      setLiquidityPositions([])
      setCacaoPoolPosition(null)
      setPositionsError(null)
      return
    }

    let cancelled = false

    async function loadInitial() {
      setIsLoading(true)
      try {
        await loadAllData()
      } catch (error) {
        if (!cancelled) {
          setNodes([])
          setSelectedNodeAddress('')
          setLoadError((error as Error).message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [balanceRefreshTick, loadAllData, mayaAddress, settings.mayanodeUrl])

  useEffect(() => {
    if (!preferredNodeAddress || !nodes.length) {
      return
    }

    if (nodes.some((node) => node.nodeAddress === preferredNodeAddress)) {
      setSelectedNodeAddress((current) =>
        current === preferredNodeAddress ? current : preferredNodeAddress,
      )
    }
  }, [nodes, preferredNodeAddress])

  async function connectMayaChain() {
    if (isViewOnly) {
      return
    }

    await wallet
      .execute('accounts.connect', {
        sessionId: activeSession?.id,
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

  async function executeAction(input: {
    action: PooledNodeActionKind
    amountBaseUnits: string
    bondAsset?: string
    bondUnits?: string
    nodeAddress: string
    operatorFeeBps?: string
    providerAddress?: string
    title: string
    successMessage: string
    reset: () => void
  }) {
    if (isViewOnly) {
      setSubmitError(VIEW_ONLY_IMPERSONATION_REASON)
      return
    }
    if (!activeSession) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await trackTransactionJourney(wallet, {
        kind: 'pooled-node',
        title: input.title,
        sessionId: activeSession.id,
        source: activeSession.source,
        chain: Chain.MayaChain,
        routePath: '/pooled-nodes',
        steps: createExecutionJourneySteps({
          source: activeSession.source,
          finalLabel: 'Pooled Node Update Complete',
        }),
        run: async (journey) => {
          journey.activateStep('preparing', 'Preparing pooled-node memo.')
          const result = await submitAction(wallet, {
            action: input.action,
            amountBaseUnits: input.amountBaseUnits,
            bondAsset: input.bondAsset,
            bondUnits: input.bondUnits,
            journeyId: journey.journeyId,
            nodeAddress: input.nodeAddress,
            operatorFeeBps: input.operatorFeeBps,
            providerAddress: input.providerAddress,
            sessionId: activeSession.id,
          })
          journey.completeStep('preparing', 'Pooled-node deposit prepared.')
          if (activeSession.source === 'extension')
            journey.completeStep('provider', 'Extension accepted the request.')
          else journey.completeStep('signing', 'Vault signing complete.')
          journey.setPrimaryTxHash(result.txHash)
          journey.completeStep(
            'broadcasting',
            result.txHash
              ? 'Pooled-node transaction broadcast submitted.'
              : 'Pooled-node transaction submitted without a returned hash.',
          )
          journey.activateStep(
            'confirming',
            'Waiting for MayaChain confirmation.',
          )
          const settlement = await waitForJourneyTransactionSettlement(wallet, {
            chain: Chain.MayaChain,
            journeyId: journey.journeyId,
            primary: true,
            sessionId: activeSession.id,
            stepKey: 'confirming',
            txHash: result.txHash,
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
                ? input.successMessage
                : settlement === 'error'
                  ? 'Pooled-node transaction failed on-chain.'
                  : settlement === 'unconfirmed'
                    ? 'Pooled-node transaction submitted, but confirmation timed out.'
                    : 'Pooled-node transaction submitted, but automatic tracking is unavailable.',
          })
          journey.complete(result, settlement)
          return result
        },
      })
      input.reset()
      void refreshAll()
    } catch (error) {
      setSubmitError((error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const disconnected = !activeSession || !mayaAddress
  if (disconnected) {
    return (
      <PageShell
        title="Pooled Nodes"
        subtitle={
          activeSession
            ? 'Connect a MayaChain address for the active session to load related pooled nodes.'
            : 'Connect a vault session to review related pooled MAYANodes.'
        }
      >
        <PrimaryPanel>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]">
              <Wallet size={24} />
            </div>
            <p className="max-w-md text-sm text-[var(--sea-ink-soft)]">
              {activeSession
                ? 'Your vault session is active, but MayaChain is not connected yet.'
                : 'Connect a vault to inspect operator and provider bond positions.'}
            </p>
            <button
              className="primary-btn"
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
            {isViewOnly ? (
              <Warning className="mt-0">{VIEW_ONLY_IMPERSONATION_REASON}</Warning>
            ) : null}
          </div>
        </PrimaryPanel>
      </PageShell>
    )
  }

  const showInitialSkeleton = isLoading && !nodes.length

  if (loadError && !nodes.length && !showInitialSkeleton) {
    return (
      <MessageState
        title="Failed to Load Nodes"
        body={loadError}
        icon={<AlertCircle size={28} className="text-rose-400" />}
        action={
          <button
            className="primary-btn"
            type="button"
            onClick={() => void refreshAll({ initial: true })}
          >
            Retry
          </button>
        }
      />
    )
  }

  if (!nodes.length && !showInitialSkeleton && !loadError) {
    return (
      <MessageState
        title="No Related Pooled Nodes Found"
        body="The connected MayaChain address is not currently matched as a node operator or bond provider on the live node set. You must bond as an operator or be added as a provider before this page shows related nodes."
        icon={<Shield size={28} className="text-[var(--maya-teal)]" />}
        action={
          <a
            className="secondary-btn inline-flex"
            href="https://docs.mayachain.info"
            rel="noreferrer"
            target="_blank"
          >
            Read Maya Protocol docs
          </a>
        }
      />
    )
  }

  return (
    <PageShell
      title="Pooled Nodes"
      subtitle="Review pooled MAYANodes related to your MayaChain address and submit operator or provider bond actions."
    >
      <PageContent>
        <CompactToolbar
          delay={0}
          actions={
            <button
              aria-label="Refresh pooled nodes"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] transition-colors hover:border-[var(--maya-teal)]/30 hover:text-[var(--maya-teal)] disabled:opacity-60"
              disabled={isRefreshing}
              type="button"
              onClick={() => void refreshAll()}
            >
              <RefreshCw
                size={18}
                className={isRefreshing ? 'animate-spin' : undefined}
              />
            </button>
          }
        >
          <AddressChip address={mayaAddress} />
          {activeSession?.label ? <SessionBadge label={activeSession.label} /> : null}
        </CompactToolbar>
        <AlertStack alerts={alerts} className="mt-0" />

        {showInitialSkeleton ? (
          <>
            <SkeletonPanel rows={4} delay={100} />
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <SkeletonPanel rows={3} delay={200} />
              <SkeletonPanel rows={4} delay={200} />
            </div>
          </>
        ) : (
          <>
            <BondPortfolioSummary summary={portfolioSummary} delay={100} />
            <PooledNodeWorkspace
            nodes={nodes}
            selectedNode={selectedNode}
            selectedNodeAddress={selectedNode?.nodeAddress ?? ''}
            onSelectNode={selectNode}
            connectedAddress={mayaAddress}
            balanceBaseUnits={cacaoBalanceBaseUnits}
            formattedBalance={formattedBalance}
            supportReason={support.supported ? undefined : support.reason}
            isViewOnly={isViewOnly}
            isSubmitting={isSubmitting}
            liquidityPositions={liquidityPositions}
            cacaoPoolPosition={cacaoPoolPosition}
            bondActivity={bondActivity}
            activityError={activityError}
            isActivityLoading={isActivityLoading}
            onSubmitBond={(input) =>
              void executeAction({
                action: 'provider.bond',
                amountBaseUnits: input.amountBaseUnits,
                bondAsset: input.bondAsset,
                bondUnits: input.bondUnits,
                nodeAddress: selectedNode!.nodeAddress,
                title: 'Provider Bond',
                successMessage: 'Provider bond confirmed on-chain.',
                reset: () => {},
              })
            }
            onSubmitUnbond={(input) =>
              void executeAction({
                action: 'provider.unbond',
                amountBaseUnits: input.amountBaseUnits,
                bondAsset: input.bondAsset,
                bondUnits: input.bondUnits,
                nodeAddress: selectedNode!.nodeAddress,
                title: 'Provider Unbond',
                successMessage: 'Provider unbond request confirmed on-chain.',
                reset: () => {},
              })
            }
            onSubmitAddProvider={(input) =>
              void executeAction({
                action: 'operator.add-provider',
                amountBaseUnits: input.amountBaseUnits,
                nodeAddress: selectedNode!.nodeAddress,
                operatorFeeBps: input.operatorFeeBps,
                providerAddress: input.providerAddress,
                title: 'Operator Add Provider',
                successMessage: 'Bond provider add request confirmed on-chain.',
                reset: () => {},
              })
            }
            onSubmitUpdateFee={(input) =>
              void executeAction({
                action: 'operator.update-fee',
                amountBaseUnits: input.amountBaseUnits,
                nodeAddress: selectedNode!.nodeAddress,
                operatorFeeBps: input.operatorFeeBps,
                title: 'Operator Update Fee',
                successMessage: 'Operator fee update confirmed on-chain.',
                reset: () => {},
              })
            }
            onSubmitRemoveProvider={(input) =>
              void executeAction({
                action: 'operator.remove-provider',
                amountBaseUnits: input.amountBaseUnits,
                nodeAddress: selectedNode!.nodeAddress,
                providerAddress: input.providerAddress,
                title: 'Operator Remove Provider',
                successMessage: 'Provider removal request confirmed on-chain.',
                reset: () => {},
              })
            }
            />
          </>
        )}
      </PageContent>
    </PageShell>
  )
}
