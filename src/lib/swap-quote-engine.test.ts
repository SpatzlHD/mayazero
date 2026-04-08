import { Chain } from '@vultisig/sdk'
import { describe, expect, it, vi } from 'vitest'
import type { SettingsState } from '#/provider/SettingsProvider'
import type { ProtocolAsset } from '#/components/ProtocolPrimitives'
import {
  APP_SUPPORT_AFFILIATE,
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
    useZeroPercentFee: true,
    useVultisigSwap: false,
    supportFeePercent: 0.1,
    updateSettings: () => {},
    ...overrides,
  }
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
  it('accepts up to five custom affiliates when support fees are disabled', () => {
    const settings = createSettings({
      useZeroPercentFee: true,
      useVultisigSwap: false,
    })

    const result = resolveEffectiveAffiliates(
      settings,
      createDrafts(
        { value: 'alpha' },
        { value: 'beta' },
        { value: 'gamma' },
        { value: 'delta' },
        { value: 'maya1customaffiliate', bps: '25' },
      ),
    )

    expect(result).toHaveLength(5)
    expect(result.at(-1)).toMatchObject({
      value: 'maya1customaffiliate',
      kind: 'address',
      bps: 25,
    })
  })

  it('injects the app affiliate when support fees are enabled', () => {
    const settings = createSettings({
      useZeroPercentFee: false,
      supportFeePercent: 0.35,
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
    expect(result.at(-1)).toMatchObject({
      value: APP_SUPPORT_AFFILIATE,
      source: 'support',
      bps: 35,
    })
  })

  it('rejects more affiliates than the route allows', () => {
    const settings = createSettings({
      useZeroPercentFee: false,
    })

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
    ).toThrow(/maximum of 4 custom affiliates/i)
  })

  it('rejects affiliate addresses without basis points and allows MAYAName defaults', () => {
    const settings = createSettings()

    expect(() =>
      resolveEffectiveAffiliates(settings, createDrafts({ value: 'maya1abc123' })),
    ).toThrow(/requires a basis points value/i)

    expect(
      resolveEffectiveAffiliates(settings, createDrafts({ value: 'friendname' })),
    ).toMatchObject([{ value: 'friendname', kind: 'mayaname', bps: undefined }])
  })

  it('routes quotes according to settings and affiliate count', () => {
    const mayaSettings = createSettings({
      useVultisigSwap: false,
    })
    const vultisigSettings = createSettings({
      useVultisigSwap: true,
    })

    expect(resolveQuoteStrategy(mayaSettings, [])).toBe('maya')
    expect(resolveQuoteStrategy(vultisigSettings, [])).toBe('vultisig')
    expect(
      resolveQuoteStrategy(vultisigSettings, createDrafts({ value: 'alpha' })),
    ).toBe('vultisig')
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
      useZeroPercentFee: false,
      supportFeePercent: 0.2,
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
    expect(url).toContain('affiliate=friend%2Fmaya1abc123%2Fmayazero')
    expect(url).toContain('affiliate_bps=%2F20%2F20')
    expect(url).toContain('tolerance_bps=75')
  })

  it('uses Vultisig referral input without unsupported fee fields', async () => {
    const execute = vi.fn(async () => ({
      quote: {
        estimatedOutput: 12345n,
        fees: { network: 10n, affiliate: 2n, total: 12n },
        provider: 'thorchain',
        quote: {},
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
      useZeroPercentFee: false,
    })

    const result = await quoteSwap({
      wallet: {
        execute,
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
    })

    expect(result.route).toBe('vultisig')
    expect(execute).toHaveBeenCalledWith(
      'swap.quote',
      expect.objectContaining({
        sessionId: 'vault-1',
        input: expect.objectContaining({
          referral: APP_SUPPORT_AFFILIATE,
          amount: 1.5,
        }),
      }),
    )
    const walletInput = execute.mock.calls[0]?.[1]?.input as Record<string, unknown>
    expect(walletInput).not.toHaveProperty('affiliate')
    expect(walletInput).not.toHaveProperty('feeBps')
  })

  it('normalizes Maya-native quote responses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        expected_amount_out: '450000000',
        memo: '=:ETH.ETH:0xreceiver::alpha/beta:10/20',
        fees: {
          asset: 'ETH.ETH',
          outbound: '100000',
          affiliate: '5000',
        },
      }),
    }))
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
      estimatedOutput: '450000000',
      memo: '=:ETH.ETH:0xreceiver::alpha/beta:10/20',
      canPrepare: false,
      prepareReason: 'Maya-native quotes are quote-only in this flow.',
    })
    expect(result.fees).toMatchObject({
      asset: 'ETH.ETH',
      network: '100000',
      affiliate: '5000',
      total: '105000',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
