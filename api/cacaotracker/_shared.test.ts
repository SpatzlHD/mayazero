import { describe, expect, it, vi } from 'vitest'
import {
  CacaotrackerApiError,
  buildCacaotrackerUrl,
  clearCacaotrackerResponseCache,
  fetchCacaotrackerJson,
} from './_shared'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  })
}

describe('cacaotracker shared client', () => {
  it('builds upstream URLs with normalized query params', () => {
    expect(
      buildCacaotrackerUrl(
        '/rewards/maya1test/by-pool',
        { days: 30 },
        'https://api.test/',
      ),
    ).toBe('https://api.test/rewards/maya1test/by-pool?days=30')
  })

  it('injects the api key header and parses json bodies', async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        'x-api-key': 'secret-key',
      })
      return jsonResponse({ ok: true })
    }) as typeof fetch

    await expect(
      fetchCacaotrackerJson('/protocol/dashboard', {
        apiKey: 'secret-key',
        baseUrl: 'https://api.test',
        fetchImpl,
      }),
    ).resolves.toEqual({ ok: true })
  })

  it('reuses cached results for the same request within the ttl window', async () => {
    clearCacaotrackerResponseCache()
    let now = 1_000
    const fetchImpl = vi.fn(async () => jsonResponse({ value: 'cached' })) as typeof fetch

    const first = await fetchCacaotrackerJson('/protocol/dashboard', {
      apiKey: 'secret-key',
      baseUrl: 'https://api.test',
      cacheBucket: 'protocol',
      fetchImpl,
      now: () => now,
    })
    now += 500
    const second = await fetchCacaotrackerJson('/protocol/dashboard', {
      apiKey: 'secret-key',
      baseUrl: 'https://api.test',
      cacheBucket: 'protocol',
      fetchImpl,
      now: () => now,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  it('surfaces upstream errors with their status codes', async () => {
    await expect(
      fetchCacaotrackerJson('/protocol/dashboard', {
        apiKey: 'secret-key',
        baseUrl: 'https://api.test',
        fetchImpl: vi.fn(async () =>
          jsonResponse({ error: 'boom' }, { status: 503 }),
        ) as typeof fetch,
      }),
    ).rejects.toMatchObject<CacaotrackerApiError>({
      message: 'boom',
      status: 503,
    })
  })

  it('fails early when the server key is missing', async () => {
    await expect(
      fetchCacaotrackerJson('/protocol/dashboard', {
        apiKey: '',
        baseUrl: 'https://api.test',
        fetchImpl: vi.fn() as typeof fetch,
      }),
    ).rejects.toMatchObject<CacaotrackerApiError>({
      message: 'CACAOTRACKER_API_KEY is not configured on the server.',
      status: 500,
    })
  })
})
