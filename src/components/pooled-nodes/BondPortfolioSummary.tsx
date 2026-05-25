import { Coins } from 'lucide-react'
import { formatBaseUnits } from '#/lib/cacao-pool'
import type { BondPortfolioSummary as BondPortfolioSummaryData } from '#/lib/pooled-nodes'
import { MetricTile, PanelHeader, PrimaryPanel } from './shared'

function formatCompactNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2,
  }).format(value)
}

export function BondPortfolioSummary(props: {
  summary: BondPortfolioSummaryData
  delay?: number
}) {
  const { summary } = props

  return (
    <PrimaryPanel delay={props.delay ?? 100} accent>
      <PanelHeader
        kicker="Bond Exposure"
        title="Your Bond Portfolio"
        description="Aggregated bond positions across related MAYANodes. Maya secures the network with bonded LP and CACAO pool units, not raw wallet CACAO."
        icon={<Coins size={20} className="text-[var(--sea-ink-soft)]" />}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricTile
          label="Total Bonded"
          value={
            summary.totalBondedCacao != null
              ? formatCompactNumber(summary.totalBondedCacao)
              : 'n/a'
          }
          subValue="CACAO"
          highlight
        />
        <MetricTile
          label="Total Rewards"
          value={
            summary.totalRewardCacao != null
              ? formatCompactNumber(summary.totalRewardCacao)
              : 'n/a'
          }
          subValue="CACAO"
          highlight
        />
        <MetricTile
          label="Related Nodes"
          value={String(summary.nodeCount ?? 0)}
          subValue="matched nodes"
        />
        <MetricTile
          label="Node Rewards (live)"
          value={formatBaseUnits(summary.totalNodeRewardsBaseUnits, 10) || '0'}
          subValue="CACAO"
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:gap-4">
        <MetricTile
          label="Operator Nodes"
          value={String(summary.operatorNodeCount)}
          size="sm"
        />
        <MetricTile
          label="Provider-only Nodes"
          value={String(summary.providerOnlyNodeCount)}
          size="sm"
        />
        <MetricTile
          label="Nodes With Warnings"
          value={String(summary.warningNodeCount)}
          size="sm"
        />
      </div>
    </PrimaryPanel>
  )
}
