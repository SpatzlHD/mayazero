import { shortenAddress } from '#/components/ProtocolPrimitives'
import { formatBaseUnits } from '#/lib/cacao-pool'
import {
  getConnectedProviderPosition,
  getPooledNodeWarnings,
  type PooledNode,
} from '#/lib/pooled-nodes'
import { TrendingUp } from 'lucide-react'
import {
  AddressChip,
  Metric,
  MetricTile,
  NodeStatusBadge,
  PanelHeader,
  PrimaryPanel,
  Warning,
} from './shared'

export function NodeDetailPanel(props: {
  node: PooledNode
  connectedAddress: string
}) {
  const warnings = getPooledNodeWarnings(props.node)
  const position = getConnectedProviderPosition(props.node, props.connectedAddress)
  const sharePercent =
    position.nodeBondShareBps != null
      ? `${(position.nodeBondShareBps / 100).toFixed(2)}%`
      : null

  return (
    <PrimaryPanel accent>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PanelHeader
          kicker="Node Overview"
          title="Node Detail"
          description={`Version ${props.node.version} • ${props.node.providerCount} providers`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <NodeStatusBadge status={props.node.status} />
          <AddressChip address={props.node.nodeAddress} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Node Bond"
          value={formatBaseUnits(props.node.bond, 10) || '0'}
          subValue="CACAO"
          highlight
        />
        <MetricTile
          label="Reward"
          value={formatBaseUnits(props.node.reward, 10) || '0'}
          subValue="CACAO"
        />
        <MetricTile
          label="Operator Fee"
          value={`${props.node.operatorFeeBps}`}
          subValue="basis points"
        />
        <MetricTile label="Preflight" value={props.node.preflightStatus} size="sm" />
      </div>

      {position.provider ? (
        <div className="relative mt-6 overflow-hidden rounded-[1.5rem] border border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/5 p-5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--maya-teal)]/40 to-transparent" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-[var(--maya-teal)]/20 bg-[var(--maya-teal)]/10 p-2.5">
                <TrendingUp size={18} className="text-[var(--maya-teal)]" />
              </div>
              <div>
                <h3 className="font-bold text-[var(--sea-ink)]">Your Position</h3>
                <p className="text-sm text-[var(--sea-ink-soft)]">
                  {shortenAddress(props.connectedAddress)}
                </p>
              </div>
            </div>
            {sharePercent ? (
              <div className="text-right">
                <p className="text-3xl font-bold text-[var(--maya-teal)]">{sharePercent}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Share of node bond
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric
              label="Bonded"
              value={position.provider.bonded ? 'Yes' : 'No'}
            />
            <Metric
              label="Reward"
              value={`${formatBaseUnits(position.provider.reward, 10) || '0'} CACAO`}
            />
            <Metric
              label="Raw Allocation Sum"
              value={
                position.poolSumBaseUnits
                  ? `${formatBaseUnits(position.poolSumBaseUnits, 8) || position.poolSumBaseUnits} units`
                  : 'No allocation map'
              }
            />
            <Metric
              label="Effective Bond"
              value={
                position.effectiveBondUnits
                  ? `${formatBaseUnits(position.effectiveBondUnits, 8) || position.effectiveBondUnits} weighted units`
                  : 'n/a'
              }
            />
          </div>
        </div>
      ) : null}

      {warnings.map((warning) => (
        <Warning key={warning}>{warning}</Warning>
      ))}
    </PrimaryPanel>
  )
}
