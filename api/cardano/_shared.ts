import type { IncomingMessage, ServerResponse } from 'node:http'

export const DEFAULT_KOIOS_API_URL =
  'https://api.koios.rest/api/v1/address_info'

const CARDANO_ADDRESS_PATTERN = /^(addr1|addr_test1)[0-9a-z]{10,}$/i

type KoiosAddressInfoResponse = Array<{
  address?: string
  balance?: string
}>

export type CardanoAddressBalanceResponse = {
  address: string
  balance: string
}

export class CardanoApiError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message)
    this.name = 'CardanoApiError'
  }
}

export function isValidCardanoAddress(value: string): boolean {
  return CARDANO_ADDRESS_PATTERN.test(value.trim())
}

export function getRequestPathSegments(request: Request): string[] {
  return new URL(request.url).pathname.split('/').filter(Boolean)
}

export function readPathSegment(
  request: Request,
  index: number,
  label: string,
): string {
  const value = getRequestPathSegments(request)[index]
  if (!value) {
    throw new CardanoApiError(`Missing ${label} in request path.`, 400)
  }

  return decodeURIComponent(value)
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'public, max-age=15')

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof CardanoApiError) {
    return jsonResponse({ error: error.message }, { status: error.status })
  }

  return jsonResponse(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to fetch Cardano address balance.',
    },
    { status: 500 },
  )
}

export async function fetchCardanoAddressBalance(
  address: string,
  dependencies: {
    fetchImpl?: typeof fetch
    koiosApiUrl?: string
  } = {},
): Promise<CardanoAddressBalanceResponse> {
  const normalizedAddress = address.trim()
  if (!isValidCardanoAddress(normalizedAddress)) {
    throw new CardanoApiError('Invalid Cardano address.', 400)
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch
  const response = await fetchImpl(
    dependencies.koiosApiUrl ?? DEFAULT_KOIOS_API_URL,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        _addresses: [normalizedAddress],
      }),
    },
  )

  if (!response.ok) {
    throw new CardanoApiError(
      `Koios address lookup failed (${response.status}).`,
      502,
    )
  }

  const payload = (await response.json()) as KoiosAddressInfoResponse
  const match =
    payload.find(
      (entry) =>
        entry.address?.toLowerCase() === normalizedAddress.toLowerCase(),
    ) ?? payload[0]

  return {
    address: normalizedAddress,
    balance: match?.balance ?? '0',
  }
}

export function createNodeHandler(
  handler: (request: Request) => Promise<Response>,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const host = req.headers.host ?? 'localhost'
      const request = new Request(`http://${host}${req.url ?? '/'}`, {
        method: req.method,
      })
      const response = await handler(request)
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      const response = errorResponse(error)
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      res.end(Buffer.from(await response.arrayBuffer()))
    }
  }
}
