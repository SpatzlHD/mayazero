import { describe, expect, it } from 'vitest'
import {
  buildBondPortfolioSummary,
  filterRelatedPooledNodes,
  getConnectedProviderPosition,
  normalizePooledNodes,
  sumProviderPoolBaseUnits,
} from './pooled-nodes'

describe('pooled nodes portfolio helpers', () => {
  it('sums provider pool base units', () => {
    expect(sumProviderPoolBaseUnits({ 'BTC.BTC': '100', 'ETH.ETH': '250' })).toBe(
      350n,
    )
    expect(sumProviderPoolBaseUnits({ 'BTC.BTC': 'abc' })).toBe(0n)
  })

  it('derives connected provider position and node bond share', () => {
    const node = normalizePooledNodes(
      [
        {
          node_address: 'maya1node',
          bond: '1000',
          bond_address: 'maya1operator',
          status: 'Active',
          bond_providers: {
            providers: [
              {
                bond_address: 'maya1provider',
                bonded: true,
                reward: '0',
                pools: { 'BTC.BTC': '250' },
              },
            ],
          },
        },
      ],
      'maya1provider',
    )[0]!

    const position = getConnectedProviderPosition(node, 'maya1provider')
    expect(position.provider?.bondAddress).toBe('maya1provider')
    expect(position.poolSumBaseUnits).toBe('250')
    expect(position.effectiveBondUnits).toBe('250')
    expect(position.nodeBondShareBps).toBe(2500)
  })

  it('builds a portfolio summary from nodes and enrichment', () => {
    const nodes = filterRelatedPooledNodes(
      normalizePooledNodes(
      [
        {
          node_address: 'maya1operator-node',
          bond_address: 'maya1operator',
          status: 'Active',
          reward: '100',
          bond_providers: {
            providers: [{ bond_address: 'maya1operator', pools: {} }],
          },
        },
        {
          node_address: 'maya1provider-node',
          bond_address: 'maya1other',
          status: 'Whitelisted',
          reward: '50',
          bond_providers: {
            providers: [{ bond_address: 'maya1provider', pools: {} }],
          },
        },
      ],
      'maya1operator',
      ),
    )

    const summary = buildBondPortfolioSummary(nodes, {
      totalBondedCacao: 500,
      totalRewardCacao: 25,
      nodeCount: 2,
    })

    expect(summary.operatorNodeCount).toBe(1)
    expect(summary.providerOnlyNodeCount).toBe(0)
    expect(summary.warningNodeCount).toBe(0)
    expect(summary.totalBondedCacao).toBe(500)
    expect(summary.totalNodeRewardsBaseUnits).toBe('100')
  })
})
