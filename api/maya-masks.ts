import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAddress, getAddress } from 'viem'

export const MAYA_MASKS_CONTRACT_ADDRESS =
  '0xe00d8f3dCA2ac474F4D7F177570f77de0774e754'
const ALCHEMY_ETH_MAINNET_BASE_URL = 'https://eth-mainnet.g.alchemy.com/nft/v3'
const PAGE_SIZE = 100

export type MayaMaskHolding = {
  tokenId: string
  name: string
  imageUrl: string | null
  description: string | null
}

export type MayaMasksResponse = {
  owner: string
  contractAddress: string
  totalCount: number
  masks: MayaMaskHolding[]
}

type AlchemyOwnedNft = {
  tokenId?: string
  name?: string
  description?: string | null
  image?: {
    cachedUrl?: string | null
    thumbnailUrl?: string | null
    pngUrl?: string | null
    originalUrl?: string | null
  } | null
  contract?: {
    address?: string
  } | null
}

type AlchemyGetNftsForOwnerResponse = {
  ownedNfts?: AlchemyOwnedNft[] | null
  totalCount?: number | null
  pageKey?: string | null
}

type HandlerDependencies = {
  alchemyApiKey?: string
  fetchImpl?: typeof fetch
}

function readServerEnv(name: string): string | undefined {
  const env = (
    globalThis as typeof globalThis & {
      process?: {
        env?: Record<string, string | undefined>
      }
    }
  ).process?.env

  return env?.[name]
}

export async function GET(
  request: Request,
  dependencies: HandlerDependencies = {},
): Promise<Response> {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')?.trim() ?? ''
  const alchemyApiKey = dependencies.alchemyApiKey ?? readServerEnv('ALCHEMY_API_KEY')
  const fetchImpl = dependencies.fetchImpl ?? fetch

  if (!isAddress(owner)) {
    return jsonResponse(
      { error: 'Invalid Ethereum address supplied via "owner".' },
      { status: 400 },
    )
  }

  if (!alchemyApiKey) {
    return jsonResponse(
      { error: 'ALCHEMY_API_KEY is not configured on the server.' },
      { status: 500 },
    )
  }

  try {
    const normalizedOwner = getAddress(owner)
    const masks = await fetchAllMayaMasksForOwner({
      owner: normalizedOwner,
      alchemyApiKey,
      fetchImpl,
    })

    return jsonResponse({
      owner: normalizedOwner,
      contractAddress: MAYA_MASKS_CONTRACT_ADDRESS,
      totalCount: masks.length,
      masks,
    })
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch Maya Masks from Alchemy.',
      },
      { status: 502 },
    )
  }
}

export default async function handler(
  req: IncomingMessage & { url?: string; method?: string; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse,
) {
  const method = req.method ?? 'GET'

  if (method !== 'GET') {
    const response = jsonResponse(
      { error: `Method ${method} not allowed.` },
      {
        status: 405,
        headers: {
          Allow: 'GET',
        },
      },
    )
    await writeNodeResponse(res, response)
    return
  }

  const originHeader = req.headers.host ? `https://${req.headers.host}` : 'http://localhost'
  const request = new Request(new URL(req.url ?? '/', originHeader), {
    method,
  })

  const response = await GET(request)
  await writeNodeResponse(res, response)
}

async function fetchAllMayaMasksForOwner(input: {
  owner: string
  alchemyApiKey: string
  fetchImpl: typeof fetch
}): Promise<MayaMaskHolding[]> {
  const masks: MayaMaskHolding[] = []
  let pageKey: string | undefined

  do {
    const { nextPageKey, pageMasks } = await fetchMayaMasksPage({
      ...input,
      pageKey,
    })

    masks.push(...pageMasks)
    pageKey = nextPageKey
  } while (pageKey)

  return masks
}

async function fetchMayaMasksPage(input: {
  owner: string
  alchemyApiKey: string
  fetchImpl: typeof fetch
  pageKey?: string
}): Promise<{
  pageMasks: MayaMaskHolding[]
  nextPageKey?: string
}> {
  const endpoint = new URL(
    `${ALCHEMY_ETH_MAINNET_BASE_URL}/${input.alchemyApiKey}/getNFTsForOwner`,
  )
  endpoint.searchParams.set('owner', input.owner)
  endpoint.searchParams.set('withMetadata', 'true')
  endpoint.searchParams.set('pageSize', String(PAGE_SIZE))
  endpoint.searchParams.append(
    'contractAddresses[]',
    MAYA_MASKS_CONTRACT_ADDRESS,
  )

  if (input.pageKey) {
    endpoint.searchParams.set('pageKey', input.pageKey)
  }

  const response = await input.fetchImpl(endpoint)
  if (!response.ok) {
    throw new Error(`Alchemy request failed with status ${response.status}.`)
  }

  const payload =
    (await response.json()) as AlchemyGetNftsForOwnerResponse
  const pageMasks = (payload.ownedNfts ?? []).map(normalizeMayaMaskHolding)

  return {
    pageMasks,
    nextPageKey: payload.pageKey ?? undefined,
  }
}

function normalizeMayaMaskHolding(nft: AlchemyOwnedNft): MayaMaskHolding {
  const tokenId = normalizeTokenId(nft.tokenId)
  const name = nft.name?.trim() || `Maya Mask #${tokenId}`
  const imageUrl =
    nft.image?.cachedUrl ??
    nft.image?.thumbnailUrl ??
    nft.image?.pngUrl ??
    nft.image?.originalUrl ??
    null

  return {
    tokenId,
    name,
    imageUrl,
    description: nft.description?.trim() || null,
  }
}

function normalizeTokenId(tokenId?: string): string {
  if (!tokenId) {
    return 'unknown'
  }

  try {
    if (tokenId.startsWith('0x')) {
      return BigInt(tokenId).toString(10)
    }
  } catch {
    // Fall back to the raw token id below.
  }

  return tokenId
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  })
}

async function writeNodeResponse(
  res: ServerResponse,
  response: Response,
) {
  res.statusCode = response.status

  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}
