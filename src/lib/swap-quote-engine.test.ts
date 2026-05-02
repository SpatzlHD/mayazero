import { Chain } from '@vultisig/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsState } from '#/provider/SettingsProvider'
import type { ProtocolAsset } from '#/components/ProtocolPrimitives'
import { clearMayaNameValidationCache } from './mayaname'
import {
  DEFAULT_SUPPORT_REFERRER_BPS,
  INTERFACE_AFFILIATE_MAYANAME,
} from './swap-affiliates'
import {
  buildMayaQuoteUrl,
  quoteSwap,
  resolveEffectiveAffiliates,
  resolveQuoteStrategy,
  type AffiliateDraft,
} from './swap-quote-engine'

function createSettings(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    mayanodeUrl: 'https://mayanode.mayachain.info',
    midgardUrl: 'https://midgard.mayachain.info',
    tendermintUrl: 'https://tendermint.mayachain.info',
    useVultisigSwap: false,
    analyticsDisabled: false,
    referralMayaName: '',
    supportReferrerEnabled: false,
    supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
    supportReferrerForMayaName: '',
    impersonationEnabled: false,
    impersonationAddresses: {},
    updateSettings: () => {},
    setReferralMayaName: () => {},
    clearReferralMayaName: () => {},
    updateSupportReferrerSettings: () => {},
    resetSupportReferrerSettings: () => {},
    clearImpersonationSettings: () => {},
    ...overrides,
  } as SettingsState
}

function createAsset(overrides: Partial<ProtocolAsset>): ProtocolAsset {
  return {
    id: 'cacao',
    label: 'CACAO',
    chain: Chain.MayaChain,
    ticker: 'CACAO',
    decimals: 10,
    blurb: 'native',
    mayaAsset: 'MAYA.CACAO',
    ...overrides,
  }
}

function createDrafts(...drafts: Array<Partial<AffiliateDraft>>): AffiliateDraft[] {
  return drafts.map((draft) => ({
    value: '',
    bps: '',
    ...draft,
  }))
}

describe('swap-quote-engine', () => {
  beforeEach(() => {
    clearMayaNameValidationCache()
  })

  it('prepends m0 and accepts up to four manual affiliates', () => {
    const settings = createSettings({
      useVultisigSwap: false,
    })

    const result = resolveEffectiveAffiliates(
      settings,
      createDrafts(
        { value: 'alpha' },
        { value: 'beta' },
        { value: 'gamma' },
        { value: 'delta' },
      ),
    )

    expect(result).toHaveLength(5)
    expect(result[0]).toMatchObject({
      value: INTERFACE_AFFILIATE_MAYANAME,
      kind: 'mayaname',
      bps: 0,
      source: 'interface',
    })
    expect(result[1]).toMatchObject({
      value: 'alpha',
      kind: 'mayaname',
      source: 'user',
    })
    expect(result.at(-1)).toMatchObject({
      value: 'delta',
      kind: 'mayaname',
    })
  })

  it('accepts a custom affiliate address with basis points', () => {
    const settings = createSettings()

    const result = resolveEffectiveAffiliates(
      settings,
      createDrafts({ value: 'maya1customaffiliate', bps: '25' }),
    )

    expect(result.at(-1)).toMatchObject({
      value: 'maya1customaffiliate',
      kind: 'address',
      bps: 25,
    })
  })

  it('rejects more than four manual affiliates because m0 is reserved', () => {
    const settings = createSettings()

    expect(() =>
      resolveEffectiveAffiliates(
        settings,
        createDrafts(
          { value: 'one' },
          { value: 'two' },
          { value: 'three' },
          { value: 'four' },
          { value: 'five' },
        ),
      ),
    ).toThrow(/maximum of 5 total affiliates/i)
  })

  it('rejects affiliate addresses without basis points and allows MAYAName defaults', () => {
    const settings = createSettings()

    expect(() =>
      resolveEffectiveAffiliates(settings, createDrafts({ value: 'maya1abc123' })),
    ).toThrow(/requires a basis points value/i)

    expect(
      resolveEffectiveAffiliates(settings, createDrafts({ value: 'friendname' })),
    ).toMatchObject([
      { value: INTERFACE_AFFILIATE_MAYANAME, kind: 'mayaname', bps: 0, source: 'interface' },
      { value: 'friendname', kind: 'mayaname', bps: undefined, source: 'user' },
    ])
  })

  it('routes quotes according to settings and affiliate count', () => {
    const mayaSettings = createSettings({
      useVultisigSwap: false,
    })
    const vultisigSettings = createSettings({
      useVultisigSwap: true,
    })

    expect(resolveQuoteStrategy(mayaSettings, [])).toBe('maya')
    expect(resolveQuoteStrategy(vultisigSettings, [])).toBe('maya')
    expect(
      resolveQuoteStrategy(vultisigSettings, createDrafts({ value: 'alpha' })),
    ).toBe('maya')
    expect(
      resolveQuoteStrategy(
        vultisigSettings,
        createDrafts({ value: 'alpha' }, { value: 'beta' }),
      ),
    ).toBe('maya')
  })

  it('serializes Maya quote URLs with slash-delimited affiliates and fee slots', () => {
    const settings = createSettings({
      mayanodeUrl: 'https://mayanode.test/',
    })
    const url = buildMayaQuoteUrl({
      settings,
      fromAsset: createAsset({ mayaAsset: 'BTC.BTC', decimals: 8 }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      destinationAddress: '0xreceiver',
      amount: '1.25',
      slippageBps: '75',
      effectiveAffiliates: resolveEffectiveAffiliates(
        settings,
        createDrafts({ value: 'friend' }, { value: 'maya1abc123', bps: '20' }),
      ),
    })

    expect(url).toContain('amount=125000000')
    expect(url).toContain(`affiliate=${INTERFACE_AFFILIATE_MAYANAME}%2Ffriend%2Fmaya1abc123`)
    expect(url).toContain('affiliate_bps=0%2F%2F20')
    expect(url).toContain('liquidity_tolerance_bps=75')
  })

  it('preserves zero slippage so Maya can control memo min-out behavior', () => {
    const settings = createSettings()
    const url = buildMayaQuoteUrl({
      settings,
      fromAsset: createAsset({ mayaAsset: 'MAYA.CACAO', decimals: 10 }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ARB.ETH', chain: Chain.Arbitrum, decimals: 18 }),
      destinationAddress: '0xc405bC3b5Ed526042d53c2b46A28869Ca0042E75',
      amount: '1',
      slippageBps: '0',
      effectiveAffiliates: [],
    })
    const search = new URL(url).searchParams

    expect(search.get('liquidity_tolerance_bps')).toBe('0')
  })

  it('defaults omitted slippage to zero', () => {
    const settings = createSettings()
    const url = buildMayaQuoteUrl({
      settings,
      fromAsset: createAsset({ mayaAsset: 'MAYA.CACAO', decimals: 10 }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      destinationAddress: '0xreceiver',
      amount: '1',
      effectiveAffiliates: [],
    })
    const search = new URL(url).searchParams

    expect(search.get('liquidity_tolerance_bps')).toBe('0')
  })

  it('keeps m0 in the quote even when no other affiliate drafts are provided', () => {
    const settings = createSettings()
    const url = buildMayaQuoteUrl({
      settings,
      fromAsset: createAsset({ mayaAsset: 'MAYA.CACAO', decimals: 10 }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      destinationAddress: '0xreceiver',
      amount: '1',
      slippageBps: '50',
      effectiveAffiliates: [],
    })
    const search = new URL(url).searchParams

    expect(search.get('affiliate')).toBe(INTERFACE_AFFILIATE_MAYANAME)
    expect(search.get('affiliate_bps')).toBe('0')
  })

  it('encodes Maya quote amounts in source-asset base units', () => {
    const settings = createSettings()
    const url = buildMayaQuoteUrl({
      settings,
      fromAsset: createAsset({ mayaAsset: 'MAYA.CACAO', decimals: 10 }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      destinationAddress: '0xreceiver',
      amount: '10000',
      slippageBps: '50',
      effectiveAffiliates: [],
    })
    const amount = new URL(url).searchParams.get('amount')

    expect(amount).toBe('100000000000000')
  })

  it('encodes non-Maya quote inputs in the external 1e8 quote scale', () => {
    const settings = createSettings()
    const url = buildMayaQuoteUrl({
      settings,
      fromAsset: createAsset({
        id: 'usdt',
        label: 'USDT',
        chain: Chain.Ethereum,
        ticker: 'USDT',
        decimals: 6,
        mayaAsset: 'ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7',
      }),
      toAsset: createAsset({ id: 'maya', ticker: 'MAYA', mayaAsset: 'MAYA.MAYA', chain: Chain.MayaChain, decimals: 4 }),
      destinationAddress: 'maya1receiver',
      amount: '100',
      slippageBps: '50',
      effectiveAffiliates: [],
    })
    const amount = new URL(url).searchParams.get('amount')

    expect(amount).toBe('10000000000')
  })

  it('serializes streaming parameters when requested', () => {
    const settings = createSettings()
    const url = buildMayaQuoteUrl({
      settings,
      fromAsset: createAsset({
        id: 'usdt',
        label: 'USDT',
        chain: Chain.Ethereum,
        ticker: 'USDT',
        decimals: 6,
        mayaAsset: 'ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7',
      }),
      toAsset: createAsset({ id: 'maya', ticker: 'MAYA', mayaAsset: 'MAYA.MAYA', chain: Chain.MayaChain, decimals: 4 }),
      destinationAddress: 'maya1receiver',
      amount: '100',
      slippageBps: '50',
      streamingInterval: '1',
      streamingQuantity: '0',
      effectiveAffiliates: [],
    })
    const search = new URL(url).searchParams

    expect(search.get('streaming_interval')).toBe('1')
    expect(search.get('streaming_quantity')).toBe('0')
  })

  it('throws when Maya returns a structured quote error payload', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      String(url).includes('inbound_addresses')
        ? ({
            ok: true,
            json: async () => [],
          })
        : ({
            ok: true,
            json: async () => ({
              error: 'failed to simulate swap',
              recommended_min_amount_in: '123456789',
            }),
          }),
    )

    await expect(
      quoteSwap({
        wallet: {
          execute: vi.fn(),
          canExecute: () => false,
        },
        settings: createSettings(),
        sessionId: 'vault-1',
        fromAsset: createAsset({ mayaAsset: 'MAYA.CACAO' }),
        toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
        fromAddress: 'maya1sender',
        toAddress: '0xreceiver',
        amount: '1',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/failed to simulate swap.*123456789/i)
  })

  it('rejects invalid MAYANames before the quote request is sent', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'missing' }),
    }))

    await expect(
      quoteSwap({
        wallet: {
          execute: vi.fn(),
          canExecute: () => false,
        },
        settings: createSettings(),
        sessionId: 'vault-1',
        fromAsset: createAsset({ mayaAsset: 'MAYA.CACAO' }),
        toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
        fromAddress: 'maya1sender',
        toAddress: '0xreceiver',
        amount: '1',
        affiliateDrafts: createDrafts({ value: 'missing' }),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Affiliate MAYAName "missing" is invalid/i)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reuses cached MAYAName validation across repeated quotes', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/mayachain/mayaname/friend')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: 'friend' }),
        }
      }

      if (String(url).includes('inbound_addresses')) {
        return {
          ok: true,
          json: async () => [],
        }
      }

      return {
        ok: true,
        json: async () => ({
          expected_amount_out: '24004',
          memo: '=:MAYA.MAYA:maya1receiver',
          fees: {
            asset: 'MAYA.MAYA',
            total: '115',
            liquidity: '115',
          },
        }),
      }
    })

    const input = {
      wallet: {
        execute: vi.fn(),
        canExecute: () => false,
      },
      settings: createSettings(),
      sessionId: 'vault-1',
      fromAsset: createAsset({ id: 'maya', ticker: 'MAYA', decimals: 4, mayaAsset: 'MAYA.MAYA' }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      fromAddress: 'maya1sender',
      toAddress: '0xreceiver',
      amount: '100',
      affiliateDrafts: createDrafts({ value: 'friend' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    } satisfies Parameters<typeof quoteSwap>[0]

    await quoteSwap(input)
    await quoteSwap(input)

    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

  it('falls back to a plain quote when streaming quote generation fails', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('inbound_addresses')) {
        return {
          ok: true,
          json: async () => [],
        }
      }

      if (String(url).includes('streaming_interval=1')) {
        return {
          ok: true,
          json: async () => ({
            error: 'failed to simulate swap: not enough asset to pay fees',
          }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          expected_amount_out: '24004',
          memo: '=:MAYA.MAYA:maya1receiver',
          fees: {
            asset: 'MAYA.MAYA',
            total: '115',
            liquidity: '115',
          },
        }),
      }
    })

    const result = await quoteSwap({
      wallet: {
        execute: vi.fn(),
        canExecute: () => false,
      },
      settings: createSettings(),
      sessionId: 'vault-1',
      fromAsset: createAsset({ id: 'maya', ticker: 'MAYA', decimals: 4, mayaAsset: 'MAYA.MAYA' }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      fromAddress: 'maya1sender',
      toAddress: '0xreceiver',
      amount: '100',
      streamingInterval: '1',
      streamingQuantity: '0',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toMatchObject({
      route: 'maya',
      estimatedOutput: '24004',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('keeps Maya-native routing even when Vultisig quote support is available', async () => {
    const execute = vi.fn(async () => ({
      quote: {
        estimatedOutput: 12345n,
        fees: { network: 10n, affiliate: 2n, total: 12n },
        provider: 'thorchain',
        quote: { quote: '', discounts: [] },
        balance: 100n,
        maxSwapable: 90n,
        requiresApproval: false,
        warnings: [],
        fromCoin: { chain: Chain.MayaChain, ticker: 'CACAO', decimals: 10 },
        toCoin: { chain: Chain.Ethereum, ticker: 'ETH', decimals: 18 },
        expiresAt: Date.now() + 10_000,
      },
    }))
    const settings = createSettings({
      useVultisigSwap: true,
    })

    const result = await quoteSwap({
      wallet: {
        execute: execute as any,
        canExecute: (command) => command === 'swap.quote' || command === 'swap.prepare',
      },
      settings,
      sessionId: 'vault-1',
      fromAsset: createAsset({ mayaAsset: 'MAYA.CACAO' }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      fromAddress: 'maya1sender',
      toAddress: '0xreceiver',
      amount: '1.5',
      affiliateDrafts: [],
      fetchImpl: vi.fn(async (url: string) =>
        String(url).includes('inbound_addresses')
          ? ({
              ok: true,
              json: async () => [],
            })
          : ({
              ok: true,
              json: async () => ({
                expected_amount_out: '12345',
                memo: '=:ETH.ETH:0xreceiver',
                inbound_address: '0xinbound',
                fees: {
                  outbound: '10',
                },
              }),
            }),
      ) as unknown as typeof fetch,
    })

    expect(result.route).toBe('maya')
    expect(execute).not.toHaveBeenCalled()
  })

  it('normalizes Maya-native quote responses', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/mayachain/mayaname/alpha')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: 'alpha' }),
        }
      }

      if (String(url).includes('/mayachain/mayaname/beta')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: 'beta' }),
        }
      }

      if (String(url).includes('inbound_addresses')) {
        return {
          ok: true,
          json: async () => [
            {
              address: '0xinbound',
              chain: 'BTC',
              router: '0xrouter',
            },
          ],
        }
      }

      return {
        ok: true,
        json: async () => ({
          expected_amount_out: '450000000000000000',
          inbound_address: '0xinbound',
          expiry: 1_775_656_907,
          memo: '=:ETH.ETH:0xreceiver::alpha/beta:10/20',
          fees: {
            asset: 'ETH.ETH',
            outbound: '100000',
            affiliate: '5000',
          },
        }),
      }
    })
    const settings = createSettings({
      useVultisigSwap: true,
    })

    const result = await quoteSwap({
      wallet: {
        execute: vi.fn(),
        canExecute: () => false,
      },
      settings,
      sessionId: 'extension:vultisig',
      fromAsset: createAsset({ mayaAsset: 'BTC.BTC', chain: Chain.Bitcoin, ticker: 'BTC', decimals: 8 }),
      toAsset: createAsset({ id: 'eth', ticker: 'ETH', mayaAsset: 'ETH.ETH', chain: Chain.Ethereum, decimals: 18 }),
      fromAddress: 'btc1sender',
      toAddress: '0xreceiver',
      amount: '1',
      affiliateDrafts: createDrafts({ value: 'alpha' }, { value: 'beta' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result).toMatchObject({
      route: 'maya',
      estimatedOutput: '450000000000000000',
      outputDecimals: 8,
      inboundAddress: '0xinbound',
      memo: '=:ETH.ETH:0xreceiver::alpha/beta:10/20',
      canPrepare: false,
      prepareReason: 'Maya-native quotes require the custom execution flow.',
    })
    if (result.route === 'maya') {
      expect(result.inboundDetails?.router).toBe('0xrouter')
    }
    expect(result.fees).toMatchObject({
      asset: 'ETH.ETH',
      network: '100000',
      affiliate: '5000',
      liquidity: undefined,
      total: '105000',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })
})
