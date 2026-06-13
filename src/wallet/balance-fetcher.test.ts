import { WalletChain as Chain } from '#/wallet/chain-types'
import { describe, expect, it, vi } from 'vitest'
import {
  CrossChainBalanceService,
  type AddressBalanceAssetHint,
} from './balance-fetcher'

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('CrossChainBalanceService', () => {
  it('fetches native and hinted ERC20 balances for EVM chains', async () => {
    const hintedToken: AddressBalanceAssetHint = {
      id: '0X00000000000000000000000000000000000000FF',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    }
    let seenTokenAddress: string | undefined
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      if (body.method === 'eth_getBalance') {
        return jsonResponse({ result: '0xde0b6b3a7640000' })
      }
      if (body.method === 'eth_call') {
        seenTokenAddress = body.params?.[0]?.to
        return jsonResponse({ result: '0xf4240' })
      }

      throw new Error(`Unexpected RPC method ${body.method as string}`)
    })

    const service = new CrossChainBalanceService({ fetch: fetchMock as typeof fetch })
    const result = await service.fetchBalances({
      chain: Chain.Ethereum,
      address: '0x000000000000000000000000000000000000abcd',
      assetHints: [hintedToken],
    })

    expect(result.balances).toHaveLength(2)
    expect(result.balances[0]).toMatchObject({
      symbol: 'ETH',
      amount: '1000000000000000000',
      formattedAmount: '1',
      isNative: true,
      source: 'evm-native',
    })
    expect(result.balances[1]).toMatchObject({
      id: '0x00000000000000000000000000000000000000ff',
      symbol: 'USDC',
      amount: '1000000',
      formattedAmount: '1',
      isNative: false,
      source: 'erc20',
    })
    expect(seenTokenAddress).toBe('0x00000000000000000000000000000000000000ff')
  })

  it('keeps native balances when an ERC20 read fails and returns warnings', async () => {
    const goodToken: AddressBalanceAssetHint = {
      id: '0X00000000000000000000000000000000000000AA',
      symbol: 'GOOD',
      decimals: 6,
    }
    const badToken: AddressBalanceAssetHint = {
      id: '0X00000000000000000000000000000000000000BB',
      symbol: 'BAD',
      decimals: 6,
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      if (body.method === 'eth_getBalance') {
        return jsonResponse({ result: '0xde0b6b3a7640000' })
      }
      if (body.method === 'eth_call') {
        if (String(body.params?.[0]?.to).toLowerCase() === '0x00000000000000000000000000000000000000aa') {
          return jsonResponse({ result: '0xf4240' })
        }

        return jsonResponse({
          error: {
            code: -32602,
            message: 'Invalid params',
          },
        })
      }

      throw new Error(`Unexpected RPC method ${body.method as string}`)
    })

    const service = new CrossChainBalanceService({ fetch: fetchMock as typeof fetch })
    const result = await service.fetchBalances({
      chain: Chain.Ethereum,
      address: '0x000000000000000000000000000000000000abcd',
      assetHints: [goodToken, badToken],
    })

    expect(result.balances).toHaveLength(2)
    expect(result.balances.map((balance) => balance.id.toLowerCase())).toEqual([
      'native',
      '0x00000000000000000000000000000000000000aa',
    ])
    expect(result.warnings).toEqual([
      expect.objectContaining({
        assetId: '0x00000000000000000000000000000000000000bb',
        message: expect.stringContaining('Unable to refresh BAD balance.'),
      }),
    ])
  })

  it('fetches Cosmos bank balances and hinted wasm balances', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/cosmos/bank/v1beta1/balances/')) {
        return jsonResponse({
          balances: [
            { denom: 'cacao', amount: '1230000000000' },
            { denom: 'maya', amount: '10000' },
          ],
        })
      }
      if (url.includes('/cosmwasm/wasm/v1/contract/')) {
        return jsonResponse({
          data: {
            balance: '5500',
          },
        })
      }

      throw new Error(`Unexpected URL ${url}`)
    })

    const service = new CrossChainBalanceService({ fetch: fetchMock as typeof fetch })
    const result = await service.fetchBalances({
      chain: Chain.MayaChain,
      address: 'maya1n5w3v7t6n5w3v7t6n5w3v7t6n5w3v7t6zy',
      assetHints: [
        {
          id: 'maya1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq4d7sg',
          symbol: 'AZTEC',
          decimals: 4,
          name: 'Aztec',
        },
      ],
    })

    expect(result.balances).toHaveLength(3)
    expect(result.balances[0]).toMatchObject({
      id: 'cacao',
      symbol: 'CACAO',
      formattedAmount: '123',
      isNative: true,
      source: 'cosmos-bank',
    })
    expect(result.balances[1]).toMatchObject({
      id: 'maya',
      symbol: 'MAYA',
      formattedAmount: '1',
      isNative: false,
      source: 'cosmos-bank',
    })
    expect(result.balances[2]).toMatchObject({
      symbol: 'AZTEC',
      formattedAmount: '0.55',
      isNative: false,
      source: 'cosmos-wasm',
    })
  })

  it('fetches UTXO balances from blockchair-compatible endpoints', async () => {
    const address = 'bc1qexampleaddress'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain(`/dashboards/address/${address}`)
      return jsonResponse({
        data: {
          [address]: {
            utxo: [{ value: 1000 }, { value: 2345 }],
          },
        },
      })
    })

    const service = new CrossChainBalanceService({ fetch: fetchMock as typeof fetch })
    const result = await service.fetchBalances({
      chain: Chain.Bitcoin,
      address,
    })

    expect(result.balances).toEqual([
      expect.objectContaining({
        symbol: 'BTC',
        amount: '3345',
        formattedAmount: '0.00003345',
        source: 'utxo',
      }),
    ])
  })

  it('fetches Cardano native balances through the local API proxy', async () => {
    const address = 'addr1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain(`/api/cardano/address/${encodeURIComponent(address)}`)
      return jsonResponse({
        address,
        balance: '2500000',
      })
    })

    const service = new CrossChainBalanceService({ fetch: fetchMock as typeof fetch })
    const result = await service.fetchBalances({
      chain: Chain.Cardano,
      address,
    })

    expect(result.balances).toEqual([
      expect.objectContaining({
        symbol: 'ADA',
        amount: '2500000',
        formattedAmount: '2.5',
        isNative: true,
        source: 'cardano',
      }),
    ])
  })

  it('can fetch multiple chain balances and rejects unsupported chains', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      if (body.method === 'getaddressutxos') {
        return jsonResponse({
          result: [{ satoshis: 125000000 }],
          error: null,
        })
      }

      throw new Error(`Unexpected RPC method ${body.method as string}`)
    })

    const service = new CrossChainBalanceService({ fetch: fetchMock as typeof fetch })
    const results = await service.fetchManyBalances([
      {
        chain: Chain.Dash,
        address: 'XdashExample',
      },
    ])

    expect(results[0].balances[0]).toMatchObject({
      symbol: 'DASH',
      formattedAmount: '1.25',
    })

    await expect(
      service.fetchBalances({
        chain: Chain.Solana,
        address: 'So11111111111111111111111111111111111111112',
      }),
    ).rejects.toThrow(/Unsupported Maya wallet chain|not implemented/)
  })
})
