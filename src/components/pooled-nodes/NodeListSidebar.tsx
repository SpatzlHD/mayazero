import { shortenAddress } from '#/components/ProtocolPrimitives'
import { formatBaseUnits } from '#/lib/cacao-pool'
import { getPooledNodeWarnings, type PooledNode } from '#/lib/pooled-nodes'
import { AlertCircle, Server } from 'lucide-react'
import { NodeStatusBadge, PanelHeader, PrimaryPanel, RoleBadge } from './shared'

function formatNodeBond(bond: string): string {
  const formatted = formatBaseUnits(bond, 10)
  return formatted ? `${formatted} CACAO` : '0 CACAO'
}

function getNodeCardLabel(node: PooledNode): string {
  const roles: string[] = []
  if (node.isOperator) roles.push('Operator')
  if (node.isProvider && !node.isOperator) roles.push('Provider')
  const role = roles.join(' + ') || 'Related'
  return `${role} • ${node.status} • ${formatNodeBond(node.bond)}`
}

export function NodeListSidebar(props: {
  nodes: PooledNode[]
  selectedNodeAddress: string
  onSelect: (nodeAddress: string) => void
}) {
  return (
    <PrimaryPanel className="hidden xl:block xl:sticky xl:top-24 xl:self-start" delay={200}>
      <PanelHeader
        kicker="Node Rail"
        title="Your MAYANodes"
        description={`${props.nodes.length} related ${props.nodes.length === 1 ? 'node' : 'nodes'}`}
        icon={<Server size={20} className="text-[var(--sea-ink-soft)]" />}
      />
      <div className="grid gap-3">
        {props.nodes.map((node) => {
          const selected = node.nodeAddress === props.selectedNodeAddress
          const warnings = getPooledNodeWarnings(node)
          return (
            <button
              key={node.nodeAddress}
              type="button"
              className={`rounded-2xl border p-4 text-left transition-all ${
                selected
                  ? 'border-[var(--maya-teal)]/40 border-l-4 border-l-[var(--maya-teal)] bg-[var(--maya-teal)]/5 shadow-[0_4px_20px_rgba(79,209,197,0.08)]'
                  : 'border-[var(--line)] hover:-translate-y-px hover:border-[var(--maya-teal)]/30'
              }`}
              onClick={() => props.onSelect(node.nodeAddress)}
            >
              <div className="flex flex-wrap items-center gap-2">
                {node.isOperator ? <RoleBadge label="Operator" tone="operator" /> : null}
                {!node.isOperator && node.isProvider ? (
                  <RoleBadge label="Provider" />
                ) : null}
                <NodeStatusBadge status={node.status} />
                {warnings.length ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-400"
                    title={`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
                  >
                    <AlertCircle size={12} />
                    {warnings.length}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 font-mono text-sm" title={node.nodeAddress}>
                {shortenAddress(node.nodeAddress)}
              </p>
              <p
                className={`mt-2 text-xs ${selected ? 'font-semibold text-[var(--sea-ink)]' : 'text-[var(--sea-ink-soft)]'}`}
              >
                Bond {formatNodeBond(node.bond)}
              </p>
              <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
                Fee {node.operatorFeeBps} bps • {node.providerCount} providers
              </p>
            </button>
          )
        })}
      </div>
    </PrimaryPanel>
  )
}

export function NodeListSelect(props: {
  nodes: PooledNode[]
  selectedNodeAddress: string
  onSelect: (nodeAddress: string) => void
}) {
  return (
    <div className="xl:hidden">
      <label
        className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-[var(--sea-ink-soft)]"
        htmlFor="pooled-node-select"
      >
        Selected node
      </label>
      <select
        id="pooled-node-select"
        aria-label="Selected node"
        className="super-input rounded-2xl border-[var(--line)] bg-[var(--chip-bg)]"
        value={props.selectedNodeAddress}
        onChange={(event) => props.onSelect(event.target.value)}
      >
        {props.nodes.map((node) => (
          <option key={node.nodeAddress} value={node.nodeAddress}>
            {getNodeCardLabel(node)} — {shortenAddress(node.nodeAddress)}
          </option>
        ))}
      </select>
    </div>
  )
}
