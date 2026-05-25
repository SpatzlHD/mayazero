import { shortenAddress } from '#/components/ProtocolPrimitives'
import { ExternalLink, History } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BondActivityItem } from '#/lib/pooled-nodes-activity'
import { filterBondActivityByNode } from '#/lib/pooled-nodes-activity'
import { EmptyState, PanelHeader, PrimaryPanel, SegmentedTabs } from './shared'

function formatActivityDate(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return String(timestamp)
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function BondActivityPanel(props: {
  items: BondActivityItem[]
  error: string | null
  isLoading: boolean
  nodeAddress?: string | null
  embedded?: boolean
}) {
  const [showAllNodes, setShowAllNodes] = useState(false)

  const visibleItems = useMemo(() => {
    if (showAllNodes || !props.nodeAddress) {
      return props.items
    }
    return filterBondActivityByNode(props.items, props.nodeAddress)
  }, [props.items, props.nodeAddress, showAllNodes])

  const content = (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PanelHeader
          kicker="On-chain History"
          title="Recent Bond Activity"
          description="Bond and unbond transactions for your connected MayaChain address."
          icon={<History size={20} className="text-[var(--sea-ink-soft)]" />}
        />
        {props.nodeAddress ? (
          <SegmentedTabs
            tabs={[
              { id: 'filtered', label: 'This node' },
              { id: 'all', label: 'All nodes' },
            ]}
            activeTab={showAllNodes ? 'all' : 'filtered'}
            onChange={(tab) => setShowAllNodes(tab === 'all')}
          />
        ) : null}
      </div>

      {props.isLoading ? (
        <EmptyState
          isLoading
          title="Loading activity"
          body="Syncing bond and unbond transactions for your wallet."
        />
      ) : null}
      {props.error ? (
        <p className="mb-4 text-sm font-medium text-amber-500">{props.error}</p>
      ) : null}
      {!props.isLoading && !props.error && !visibleItems.length ? (
        <EmptyState
          title="No activity yet"
          body={
            showAllNodes || !props.nodeAddress
              ? 'No recent bond or unbond activity found.'
              : 'No bond or unbond activity found for this node yet.'
          }
        />
      ) : null}

      {visibleItems.length ? (
        <div className="grid gap-3">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[var(--line)] bg-[var(--bg-base)] p-4 text-sm transition-colors hover:border-[var(--maya-teal)]/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      item.type === 'bond' ? 'bg-[var(--maya-teal)]' : 'bg-amber-400'
                    }`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                          item.type === 'bond'
                            ? 'bg-[var(--maya-teal)]/10 text-[var(--maya-teal)]'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {item.label}
                      </span>
                      <span className="font-bold text-[var(--sea-ink)]">
                        {new Intl.NumberFormat('en-US', {
                          maximumFractionDigits: 4,
                        }).format(item.amountCacao)}{' '}
                        CACAO
                      </span>
                    </div>
                    {item.nodeAddress ? (
                      <p className="mt-1 font-mono text-xs text-[var(--sea-ink-soft)]">
                        Node: {shortenAddress(item.nodeAddress)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="text-xs text-[var(--sea-ink-soft)]">
                  {formatActivityDate(item.timestamp)}
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1.5 font-mono text-xs text-[var(--sea-ink-soft)]">
                <a
                  className="inline-flex items-center gap-1 text-[var(--maya-teal)] hover:underline"
                  href={`https://explorer.mayachain.info/tx/${item.txHash}`}
                  rel="noreferrer"
                  target="_blank"
                  title={item.txHash}
                >
                  {shortenAddress(item.txHash)}
                  <ExternalLink size={12} />
                </a>
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )

  if (props.embedded) {
    return <div>{content}</div>
  }

  return <PrimaryPanel accent>{content}</PrimaryPanel>
}
