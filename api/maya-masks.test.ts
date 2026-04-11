import { describe, expect, it, vi } from 'vitest'
import {
  GET,
  MAYA_MASKS_CONTRACT_ADDRESS,
} from './maya-masks'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  })
}

describe('maya masks api', () => {
  it('returns 400 for an invalid owner address', async () => {
    const response = await GET(new Request('https://mayazero.app/api/maya-masks?owner=bad'))

    await expect(response.json()).resolves.toEqual({
      error: 'Invalid Ethereum address supplied via "owner".',
    })
    expect(response.status).toBe(400)
  })

  it('returns 500 when the Alchemy API key is missing', async () => {
    const response = await GET(
      new Request(
        'https://mayazero.app/api/maya-masks?owner=0x000000000000000000000000000000000000dEaD',
      ),
      {
        alchemyApiKey: '',
      },
    )

    await expect(response.json()).resolves.toEqual({
      error: 'ALCHEMY_API_KEY is not configured on the server.',
    })
    expect(response.status).toBe(500)
  })

  it('normalizes a single-page Alchemy response', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain(encodeURIComponent(MAYA_MASKS_CONTRACT_ADDRESS))
      expect(url).toContain('withMetadata=true')

      return jsonResponse({
        ownedNfts: [
          {
            tokenId: '0x01',
            name: 'Mask One',
            description: 'Genesis mask',
            image: { cachedUrl: 'https://images.test/mask-1.png' },
          },
        ],
      })
    }) as typeof fetch

    const response = await GET(
      new Request(
        'https://mayazero.app/api/maya-masks?owner=0x000000000000000000000000000000000000dEaD',
      ),
      {
        alchemyApiKey: 'alchemy-key',
        fetchImpl,
      },
    )

    await expect(response.json()).resolves.toEqual({
      owner: '0x000000000000000000000000000000000000dEaD',
      contractAddress: MAYA_MASKS_CONTRACT_ADDRESS,
      totalCount: 1,
      masks: [
        {
          tokenId: '1',
          name: 'Mask One',
          imageUrl: 'https://images.test/mask-1.png',
          description: 'Genesis mask',
        },
      ],
    })
  })

  it('follows pageKey pagination and merges multiple pages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ownedNfts: [
            {
              tokenId: '0x01',
              name: 'Mask One',
              image: { thumbnailUrl: 'https://images.test/mask-1.png' },
            },
          ],
          pageKey: 'next-page',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ownedNfts: [
            {
              tokenId: '0x02',
              image: {},
            },
          ],
        }),
      ) as typeof fetch

    const response = await GET(
      new Request(
        'https://mayazero.app/api/maya-masks?owner=0x000000000000000000000000000000000000dEaD',
      ),
      {
        alchemyApiKey: 'alchemy-key',
        fetchImpl,
      },
    )

    const body = (await response.json()) as {
      totalCount: number
      masks: Array<{ tokenId: string; name: string; imageUrl: string | null }>
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(body.totalCount).toBe(2)
    expect(body.masks).toEqual([
      {
        tokenId: '1',
        name: 'Mask One',
        imageUrl: 'https://images.test/mask-1.png',
        description: null,
      },
      {
        tokenId: '2',
        name: 'Maya Mask #2',
        imageUrl: null,
        description: null,
      },
    ])
  })

  it('surfaces upstream failures as a 502 response', async () => {
    const response = await GET(
      new Request(
        'https://mayazero.app/api/maya-masks?owner=0x000000000000000000000000000000000000dEaD',
      ),
      {
        alchemyApiKey: 'alchemy-key',
        fetchImpl: vi.fn(async () => new Response('nope', { status: 503 })) as typeof fetch,
      },
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'Alchemy request failed with status 503.',
    })
  })
})
