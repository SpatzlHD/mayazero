import { describe, expect, it, vi } from 'vitest'
import { GET } from './address/[address]'
import { fetchCardanoAddressBalance } from './_shared'

describe('cardano address balance api', () => {
  it('returns 400 for an invalid address', async () => {
    const response = await GET(
      new Request('https://mayazero.app/api/cardano/address/not-an-address'),
    )

    await expect(response.json()).resolves.toEqual({
      error: 'Invalid Cardano address.',
    })
    expect(response.status).toBe(400)
  })

  it('proxies Koios address_info and returns lovelace balance', async () => {
    const address = 'addr1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
    const fetchImpl = vi.fn(async () =>
      Response.json([
        {
          address,
          balance: '2500000',
        },
      ]),
    ) as typeof fetch

    const direct = await fetchCardanoAddressBalance(address, { fetchImpl })
    expect(direct).toEqual({
      address,
      balance: '2500000',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.koios.rest/api/v1/address_info',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ _addresses: [address] }),
      }),
    )

    const response = await GET(
      new Request(`https://mayazero.app/api/cardano/address/${address}`),
      { fetchImpl },
    )

    await expect(response.json()).resolves.toEqual({
      address,
      balance: '2500000',
    })
  })
})
