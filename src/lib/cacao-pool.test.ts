import { describe, expect, it, vi } from 'vitest'
import {
  fetchCacaoPoolHistory,
  fetchCacaoPoolPosition,
  fetchCacaoPoolSnapshot,
  formatHistoryLabel,
  formatTimestamp,
  normalizeCacaoPoolActivity,
  parseDecimalToBaseUnits,
} from './cacao-pool'

describe('cacao-pool service', () => {
  it('parses an empty position response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [],
    })) as unknown as typeof fetch

    await expect(
      fetchCacaoPoolPosition('maya1empty', { fetch: fetchMock }),
    ).resolves.toBeNull()
  })

  it('parses populated position responses and history buckets', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/v2/cacaopool/')) {
        return {
          ok: true,
          json: async () => [
            {
              cacaoAddress: 'maya1abc',
              units: '120000000000',
              cacaoAdded: '35000000000',
              cacaoDeposit: '34000000000',
              cacaoWithdrawn: '1000000000',
              dateFirstAdded: '1710000000',
              dateLastAdded: '1711000000',
            },
          ],
        }
      }

      return {
        ok: true,
        json: async () => ({
          intervals: [
            {
              startTime: '1711929600',
              endTime: '1712016000',
              count: '42',
              units: '900000000000',
            },
          ],
        }),
      }
    }) as unknown as typeof fetch

    const position = await fetchCacaoPoolPosition('maya1abc', {
      fetch: fetchMock,
    })
    const history = await fetchCacaoPoolHistory({ fetch: fetchMock })

    expect(position).toMatchObject({
      address: 'maya1abc',
      units: '120000000000',
      netCacao: '34000000000',
      firstAddedAt: 1710000000,
      lastAddedAt: 1711000000,
    })
    expect(history).toEqual([
      expect.objectContaining({
        members: '42',
        units: '900000000000',
      }),
    ])
  })

  it('filters CACAOPool activity and builds a snapshot', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/v2/actions?')) {
        return {
          ok: true,
          json: async () => ({
            actions: [
              {
                type: 'swap',
                date: '1711000000',
                height: '10',
                status: 'success',
              },
              {
                type: 'cacaoPoolDeposit',
                date: '1712000000',
                height: '11',
                status: 'success',
                in: [
                  {
                    txID: 'deposit-hash',
                    memo: 'POOL+',
                    coins: [{ asset: 'MAYA.CACAO', amount: '25000000000' }],
                  },
                ],
                metadata: {
                  cacaoPoolDeposit: {
                    units: '88000000000',
                  },
                },
              },
              {
                type: 'cacaoPoolWithdraw',
                date: '1713000000',
                height: '12',
                status: 'pending',
                out: [
                  {
                    txID: 'withdraw-hash',
                    memo: 'POOL-',
                    coins: [{ asset: 'MAYA.CACAO', amount: '5000000000' }],
                  },
                ],
                metadata: {
                  cacaoPoolWithdraw: {
                    units: '15000000000',
                    basisPoints: '2500',
                  },
                },
              },
            ],
          }),
        }
      }

      if (url.includes('/v2/history/cacaopool')) {
        return {
          ok: true,
          json: async () => ({
            intervals: [
              {
                startTime: '1711929600',
                endTime: '1712016000',
                count: '42',
                units: '900000000000',
              },
            ],
          }),
        }
      }

      return {
        ok: true,
        json: async () => [
          {
            cacaoAddress: 'maya1abc',
            units: '120000000000',
            cacaoAdded: '35000000000',
            cacaoDeposit: '34000000000',
            cacaoWithdrawn: '1000000000',
            dateFirstAdded: '1710000000',
            dateLastAdded: '1711000000',
          },
        ],
      }
    }) as unknown as typeof fetch

    const activity = normalizeCacaoPoolActivity([
      {
        type: 'cacaoPoolDeposit',
        date: '1712000000',
        height: '11',
        status: 'success',
        in: [
          {
            txID: 'deposit-hash',
            memo: 'POOL+',
            coins: [{ asset: 'MAYA.CACAO', amount: '25000000000' }],
          },
        ],
        metadata: {
          cacaoPoolDeposit: {
            units: '88000000000',
          },
        },
      },
      {
        type: 'swap',
        date: '1711000000',
        height: '10',
        status: 'success',
      },
    ])
    const snapshot = await fetchCacaoPoolSnapshot('maya1abc', {
      fetch: fetchMock,
    })

    expect(activity).toEqual([
      expect.objectContaining({
        type: 'deposit',
        txHash: 'deposit-hash',
        inboundAmount: '25000000000',
        units: '88000000000',
      }),
    ])
    expect(snapshot.activity).toHaveLength(2)
    expect(snapshot.position?.address).toBe('maya1abc')
    expect(snapshot.history).toHaveLength(1)
  })

  it('parses decimal user inputs into CACAO base units', () => {
    expect(parseDecimalToBaseUnits('1.25', 10)).toBe('12500000000')
    expect(parseDecimalToBaseUnits('0.0000000001', 10)).toBe('1')
    expect(parseDecimalToBaseUnits('1.12345678901', 10)).toBeNull()
  })

  it('handles invalid and iso timestamps without throwing', () => {
    expect(formatTimestamp(null)).toBe('n/a')
    expect(formatTimestamp(Number.NaN)).toBe('n/a')
    expect(formatHistoryLabel('')).toBe('n/a')
    expect(formatHistoryLabel('2026-04-08T10:30:00Z')).toBe('Apr 8')
  })
})
