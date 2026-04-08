import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  fetchMayaAssetCatalog,
  getMayaSupportedChain,
  resetMayaAssetCatalogCache,
} from './maya-asset-catalog'

describe('maya-asset-catalog', () => {
  beforeEach(() => {
    resetMayaAssetCatalogCache()
  })

  it('builds a chain catalog from Midgard pools and supplements native assets', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          asset: 'ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          status: 'available',
          assetPriceUSD: '1',
          nativeDecimal: '6',
        },
        {
          asset: 'MAYA.MAYA',
          status: 'available',
          assetPriceUSD: '0.5',
          nativeDecimal: '4',
        },
      ],
    })) as unknown as typeof fetch

    const catalog = await fetchMayaAssetCatalog({
      fetch: fetchMock,
      midgardUrl: 'https://midgard.test',
      fallbackPriceFetcher: async () => ({
        cacao: 2.25,
        ethereum: 3000,
        bitcoin: 65000,
        dash: 25,
        zcash: 30,
        kujira: 0.8,
        thorchain: 5,
        radix: 0.02,
      }),
    })

    const ethereum = getMayaSupportedChain(catalog, 'ethereum')
    const mayachain = getMayaSupportedChain(catalog, 'mayachain')

    expect(ethereum?.assets.map((asset) => asset.symbol)).toContain('ETH')
    expect(ethereum?.assets.map((asset) => asset.symbol)).toContain('USDC')
    expect(
      ethereum?.assets.find((asset) => asset.symbol === 'USDC')?.tokenId,
    ).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')

    expect(mayachain?.assets.map((asset) => asset.symbol)).toEqual([
      'CACAO',
      'MAYA',
    ])
    expect(
      mayachain?.assets.find((asset) => asset.symbol === 'CACAO')?.priceUsd,
    ).toBe(2.25)
  })

  it('reuses the cached catalog within the ttl window', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [],
    })) as unknown as typeof fetch

    const options = {
      fetch: fetchMock,
      midgardUrl: 'https://midgard.test',
      fallbackPriceFetcher: async () => ({}),
      ttlMs: 60_000,
    }

    const first = await fetchMayaAssetCatalog(options)
    const second = await fetchMayaAssetCatalog(options)

    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('binds the global fetch fallback to avoid illegal invocation', async () => {
    const originalFetch = globalThis.fetch
    const globalScope = globalThis as typeof globalThis & { marker?: string }
    globalScope.marker = 'fetch-scope'

    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(function (this: typeof globalThis & { marker?: string }) {
          if (this.marker !== 'fetch-scope') {
            throw new TypeError('Illegal invocation')
          }

          return Promise.resolve({
            ok: true,
            json: async () => [],
          })
        }) as unknown as typeof fetch,
      )

      await expect(
        fetchMayaAssetCatalog({
          midgardUrl: 'https://midgard.test',
          fallbackPriceFetcher: async () => ({}),
        }),
      ).resolves.toMatchObject({
        chains: expect.any(Array),
        assets: expect.any(Array),
      })
    } finally {
      vi.unstubAllGlobals()
      globalThis.fetch = originalFetch
      delete globalScope.marker
    }
  })
})
