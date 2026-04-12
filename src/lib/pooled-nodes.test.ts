import { describe, expect, it } from 'vitest'
import {
  filterRelatedPooledNodes,
  getPooledNodeWarnings,
  normalizePooledNodes,
} from './pooled-nodes'

describe('pooled nodes service', () => {
  it('normalizes live node payloads and keeps provider pool maps', () => {
    const nodes = normalizePooledNodes(
      [
        {
          node_address: 'maya1node',
          status: 'Active',
          bond: '25000000000',
          reward: '5000000000',
          bond_address: 'maya1operator',
          slash_points: 7,
          version: '1.128.2',
          preflight_status: { status: 'Ready', reason: 'OK', code: 0 },
          bond_providers: {
            node_operator_fee: '2500',
            providers: [
              {
                bond_address: 'maya1operator',
                bonded: true,
                reward: '0',
                pools: { 'BTC.BTC': '123' },
              },
              {
                bond_address: 'maya1provider',
                bonded: true,
                reward: '100',
                pools: { 'ETH.ETH': '456', 'THOR.RUNE': '789' },
              },
            ],
          },
        },
      ],
      'maya1provider',
    )

    expect(nodes[0]).toEqual(
      expect.objectContaining({
        nodeAddress: 'maya1node',
        operatorFeeBps: '2500',
        related: true,
        isOperator: false,
        isProvider: true,
        providers: [
          expect.objectContaining({
            bondAddress: 'maya1operator',
            pools: { 'BTC.BTC': '123' },
          }),
          expect.objectContaining({
            bondAddress: 'maya1provider',
            isConnectedProvider: true,
            pools: { 'ETH.ETH': '456', 'THOR.RUNE': '789' },
          }),
        ],
      }),
    )
  })

  it('filters related nodes by operator and provider addresses', () => {
    const nodes = normalizePooledNodes(
      [
        {
          node_address: 'maya1provider-node',
          bond_address: 'maya1other',
          status: 'Active',
          bond_providers: {
            providers: [{ bond_address: 'maya1provider', pools: {} }],
          },
        },
        {
          node_address: 'maya1unrelated-node',
          bond_address: 'maya1someone',
          status: 'Active',
          bond_providers: {
            providers: [{ bond_address: 'maya1another', pools: {} }],
          },
        },
      ],
      'maya1provider',
    )

    expect(filterRelatedPooledNodes(nodes).map((node) => node.nodeAddress)).toEqual([
      'maya1provider-node',
    ])

    const operatorNode = normalizePooledNodes(
      [
        {
          node_address: 'maya1operator-node',
          bond_address: 'maya1operator',
          status: 'Active',
          bond_providers: {
            providers: [{ bond_address: 'maya1operator', pools: {} }],
          },
        },
      ],
      'maya1operator',
    )[0]

    expect(operatorNode).toEqual(
      expect.objectContaining({
        isOperator: true,
        isProvider: true,
        related: true,
      }),
    )
  })

  it('surfaces warn-first guidance from live status and leave flags', () => {
    const warnings = getPooledNodeWarnings(
      normalizePooledNodes(
        [
          {
            node_address: 'maya1node',
            bond_address: 'maya1operator',
            status: 'Whitelisted',
            requested_to_leave: true,
            preflight_status: {
              status: 'Whitelisted',
              reason: 'Not ready',
              code: 1,
            },
          },
        ],
        'maya1operator',
      )[0]!,
    )

    expect(warnings).toHaveLength(3)
    expect(warnings.join(' ')).toContain('Whitelisted')
    expect(warnings.join(' ')).toContain('leave')
  })
})
