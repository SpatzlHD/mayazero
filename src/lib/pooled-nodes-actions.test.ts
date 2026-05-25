import { describe, expect, it } from 'vitest'
import { normalizePooledNodes } from './pooled-nodes'
import { getPooledNodePrimaryAction, MIN_DUST_BASE_UNITS } from './pooled-nodes-actions'

function makeNode(overrides: Record<string, unknown> = {}) {
  return normalizePooledNodes(
    [
      {
        node_address: 'maya1node',
        bond: '100000000000',
        bond_address: 'maya1operator',
        status: 'Active',
        bond_providers: {
          node_operator_fee: '2500',
          providers: [
            {
              bond_address: 'maya1provider',
              bonded: true,
              reward: '0',
              pools: { 'BTC.BTC': '5000000000' },
            },
          ],
        },
        ...overrides,
      },
    ],
    'maya1provider',
  )[0]!
}

describe('pooled node primary actions', () => {
  it('builds LP bond memos with a 0.02 CACAO deposit', () => {
    const action = getPooledNodePrimaryAction({
      action: 'provider.bond',
      amountInput: '5000000000',
      balanceBaseUnits: MIN_DUST_BASE_UNITS,
      connectedAddress: 'maya1provider',
      node: makeNode(),
      bondPosition: {
        id: 'lp:BTC.BTC',
        source: 'lp',
        asset: 'BTC.BTC',
        label: 'BTC.BTC',
        units: '9000000000',
        availableUnits: '9000000000',
        bondWeight: 1,
        effectiveUnits: '9000000000',
      },
    })

    expect(action.disabled).toBe(false)
    expect(action.memo).toBe('BOND:BTC.BTC:5000000000:maya1node')
    expect(action.txAmountBaseUnits).toBe(MIN_DUST_BASE_UNITS)
  })

  it('blocks bond when memo CACAO is insufficient', () => {
    const action = getPooledNodePrimaryAction({
      action: 'provider.bond',
      amountInput: '5000000000',
      balanceBaseUnits: '1',
      connectedAddress: 'maya1provider',
      node: makeNode(),
      bondPosition: {
        id: 'lp:BTC.BTC',
        source: 'lp',
        asset: 'BTC.BTC',
        label: 'BTC.BTC',
        units: '9000000000',
        availableUnits: '9000000000',
        bondWeight: 1,
        effectiveUnits: '9000000000',
      },
    })

    expect(action.disabled).toBe(true)
    expect(action.label).toBe('Insufficient CACAO')
  })

  it('builds unbond memos against bonded node allocations', () => {
    const node = makeNode()
    const allocation = node.providers[0]?.bondAddress
      ? {
          asset: 'BTC.BTC',
          units: '5000000000',
          source: 'lp' as const,
          effectiveUnits: '5000000000',
        }
      : null

    const action = getPooledNodePrimaryAction({
      action: 'provider.unbond',
      amountInput: '1000000000',
      balanceBaseUnits: MIN_DUST_BASE_UNITS,
      node,
      bondedAllocation: allocation,
    })

    expect(action.disabled).toBe(false)
    expect(action.memo).toBe('UNBOND:BTC.BTC:1000000000:maya1node')
  })

  it('validates operator fee range for add provider', () => {
    const action = getPooledNodePrimaryAction({
      action: 'operator.add-provider',
      amountInput: '2',
      balanceBaseUnits: '50000000000',
      connectedAddress: 'maya1operator',
      node: makeNode(),
      operatorFeeBps: '50',
      providerAddress: 'maya1newprovider',
    })

    expect(action.disabled).toBe(true)
    expect(action.note).toContain('100')
  })
})
