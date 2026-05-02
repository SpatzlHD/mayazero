import { describe, expect, it } from 'vitest'
import { normalizeMayaTokenPoolSnapshot } from './maya-token'

describe('maya-token helpers', () => {
  it('returns null when the MAYA token pool is unavailable', () => {
    expect(normalizeMayaTokenPoolSnapshot([])).toBeNull()
  })

  it('normalizes the MAYA.MAYA pool pricing snapshot', () => {
    expect(
      normalizeMayaTokenPoolSnapshot([
        {
          asset: 'BTC.BTC',
          assetPrice: '20',
          assetPriceUSD: '2000',
          volume24h: '100000000',
        },
        {
          asset: 'MAYA.MAYA',
          assetPrice: '2.5',
          assetPriceUSD: '1.25',
          status: 'available',
          volume24h: '250000000',
        },
      ]),
    ).toEqual({
      asset: 'MAYA.MAYA',
      priceInCacao: 2.5,
      priceInUsd: 1.25,
      status: 'available',
      volume24hCacao: 2.5,
    })
  })
})
