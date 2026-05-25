import { describe, expect, it } from 'vitest'
import type { EnhancedAction } from './cacaotracker-types'
import {
  extractNodeAddressFromBondAction,
  filterBondActivity,
  filterBondActivityByNode,
  parseNodeAddressFromBondMemo,
} from './pooled-nodes-activity'

describe('pooled nodes activity helpers', () => {
  it('parses node addresses from bond memos', () => {
    expect(parseNodeAddressFromBondMemo('BOND:maya1node')).toBe('maya1node')
    expect(parseNodeAddressFromBondMemo('UNBOND:maya1node:10000000000')).toBe(
      'maya1node',
    )
  })

  it('filters bond and unbond activity entries', () => {
    const actions = [
      { type: 'swap', txHash: '1' },
      { type: 'bond', txHash: '2', date: 1, height: 1, inAmount: 10, pools: [], toAddress: 'maya1node' },
      { type: 'unbond', txHash: '3', date: 2, height: 2, inAmount: 5, pools: [], toAddress: 'maya1node' },
    ] as EnhancedAction[]

    const filtered = filterBondActivity(actions)
    expect(filtered).toHaveLength(2)
    expect(filtered[0]?.type).toBe('bond')
    expect(filtered[1]?.type).toBe('unbond')
  })

  it('extracts node addresses from activity rows', () => {
    const action = {
      type: 'bond',
      txHash: 'abc',
      date: 1,
      height: 1,
      inAmount: 1,
      pools: ['BOND:maya1node'],
      toAddress: '',
    } as EnhancedAction

    expect(extractNodeAddressFromBondAction(action)).toBe('maya1node')
  })

  it('filters bond activity by node address', () => {
    const items = filterBondActivity([
      {
        type: 'bond',
        txHash: '1',
        date: 1,
        height: 1,
        inAmount: 1,
        pools: ['BOND:maya1node'],
        toAddress: 'maya1node',
      },
      {
        type: 'bond',
        txHash: '2',
        date: 2,
        height: 2,
        inAmount: 2,
        pools: ['BOND:maya1other'],
        toAddress: 'maya1other',
      },
    ] as EnhancedAction[])

    expect(filterBondActivityByNode(items, 'maya1node')).toHaveLength(1)
    expect(filterBondActivityByNode(items, 'maya1node')[0]?.txHash).toBe('1')
    expect(filterBondActivityByNode(items, null)).toEqual(items)
  })
})
