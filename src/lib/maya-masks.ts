import { isAddress, getAddress } from 'viem'

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

export async function fetchMayaMasks(
  owner: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MayaMasksResponse> {
  if (!isAddress(owner)) {
    throw new Error('A valid Ethereum address is required to load Maya Masks.')
  }

  const normalizedOwner = getAddress(owner)
  const endpoint = new URL('/api/maya-masks', resolveOrigin())
  endpoint.searchParams.set('owner', normalizedOwner)

  const response = await fetchImpl(endpoint)

  const payload = (await response.json()) as
    | MayaMasksResponse
    | { error?: string }

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load Maya Masks.')
  }

  return payload as MayaMasksResponse
}

function resolveOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  return 'http://localhost'
}
