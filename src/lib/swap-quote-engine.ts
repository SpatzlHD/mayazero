import type { ProtocolAsset } from '#/components/ProtocolPrimitives'
import type { SettingsState } from '#/provider/SettingsProvider'
import type { MayaWalletManager, WalletCommandMap } from '#/wallet'

export const APP_SUPPORT_AFFILIATE = 'mayazero'
const DEFAULT_SLIPPAGE_BPS = 50
const MAX_AFFILIATE_BPS = 500
const MAX_TOTAL_AFFILIATES = 5
const MAYA_QUOTE_AMOUNT_DECIMALS = 8

export type AffiliateDraft = {
  value: string
  bps: string
}

export type EffectiveAffiliate = {
  value: string
  bps?: number
  kind: 'address' | 'mayaname'
  source: 'support' | 'user'
}

export type QuoteStrategy = 'vultisig' | 'maya'

export type NormalizedQuoteFees = {
  asset?: string
  network?: string
  affiliate?: string
  total?: string
}

export type MayaQuoteResponse = {
  error?: string
  expected_amount_out?: string
  memo?: string
  slippage_bps?: number | string
  recommended_min_amount_in?: string
  fees?: {
    affiliate?: string
    asset?: string
    outbound?: string
  }
  [key: string]: unknown
}

type VultisigQuoteResult = WalletCommandMap['swap.quote']['output']['quote']

export type SwapQuoteEngineResult =
  | {
      route: 'vultisig'
      rawQuote: VultisigQuoteResult
      estimatedOutput: string
      outputDecimals: number
      fees: NormalizedQuoteFees
      memo?: string
      effectiveAffiliates: EffectiveAffiliate[]
      canPrepare: boolean
      prepareReason?: string
      provider?: string
    }
  | {
      route: 'maya'
      rawQuote: MayaQuoteResponse
      estimatedOutput: string
      outputDecimals: number
      fees: NormalizedQuoteFees
      memo?: string
      effectiveAffiliates: EffectiveAffiliate[]
      canPrepare: false
      prepareReason: string
      provider?: string
    }

type WalletQuoteExecutor = Pick<MayaWalletManager, 'execute' | 'canExecute'>

export type QuoteSwapParams = {
  wallet: WalletQuoteExecutor
  settings: SettingsState
  sessionId: string
  fromAsset: ProtocolAsset
  toAsset: ProtocolAsset
  fromAddress: string
  toAddress: string
  amount: string
  slippageBps?: string
  affiliateDrafts?: AffiliateDraft[]
  fiatCurrency?: WalletCommandMap['swap.quote']['input']['fiatCurrency']
  fetchImpl?: typeof fetch
}

export function createAffiliateDrafts(count = MAX_TOTAL_AFFILIATES): AffiliateDraft[] {
  return Array.from({ length: count }, () => ({ value: '', bps: '' }))
}

export function resolveQuoteStrategy(
  settings: SettingsState,
  affiliateDrafts: AffiliateDraft[] = [],
): QuoteStrategy {
  const effectiveAffiliates = resolveEffectiveAffiliates(settings, affiliateDrafts)
  if (!settings.useVultisigSwap) {
    return 'maya'
  }

  return effectiveAffiliates.length <= 1 ? 'vultisig' : 'maya'
}

export function resolveEffectiveAffiliates(
  settings: SettingsState,
  affiliateDrafts: AffiliateDraft[] = [],
): EffectiveAffiliate[] {
  const supportEnabled = !settings.useZeroPercentFee
  const userDrafts = affiliateDrafts.filter((draft) => draft.value.trim().length > 0)
  const allowedUserAffiliates = supportEnabled ? 4 : MAX_TOTAL_AFFILIATES

  if (userDrafts.length > allowedUserAffiliates) {
    throw new Error(
      `A maximum of ${allowedUserAffiliates} custom affiliates can be set with the current support-fee configuration.`,
    )
  }

  const effectiveAffiliates = userDrafts.map((draft) =>
    resolveAffiliateDraft(draft, 'user'),
  )

  if (supportEnabled) {
    effectiveAffiliates.push({
      value: APP_SUPPORT_AFFILIATE,
      bps: Math.round(settings.supportFeePercent * 100),
      kind: 'mayaname',
      source: 'support',
    })
  }

  if (effectiveAffiliates.length > MAX_TOTAL_AFFILIATES) {
    throw new Error(`A maximum of ${MAX_TOTAL_AFFILIATES} total affiliates is supported.`)
  }

  return effectiveAffiliates
}

export function buildMayaQuoteUrl(params: {
  settings: SettingsState
  fromAsset: ProtocolAsset
  toAsset: ProtocolAsset
  destinationAddress: string
  amount: string
  slippageBps?: string
  effectiveAffiliates?: EffectiveAffiliate[]
}): string {
  const mayanodeUrl = normalizeUrl(params.settings.mayanodeUrl)
  const searchParams = new URLSearchParams({
    from_asset: params.fromAsset.mayaAsset,
    to_asset: params.toAsset.mayaAsset,
    destination: params.destinationAddress,
    amount: decimalToBaseUnits(params.amount, MAYA_QUOTE_AMOUNT_DECIMALS),
    liquidity_tolerance_bps: String(normalizeSlippageBps(params.slippageBps)),
  })

  const effectiveAffiliates = params.effectiveAffiliates ?? []
  if (effectiveAffiliates.length > 0) {
    searchParams.set(
      'affiliate',
      effectiveAffiliates.map((affiliate) => affiliate.value).join('/'),
    )

    const bpsSegments = effectiveAffiliates.map((affiliate) =>
      affiliate.bps === undefined ? '' : String(affiliate.bps),
    )
    if (bpsSegments.some((segment) => segment.length > 0)) {
      searchParams.set('affiliate_bps', bpsSegments.join('/'))
    }
  }

  return `${mayanodeUrl}/mayachain/quote/swap?${searchParams.toString()}`
}

export async function quoteSwap(
  params: QuoteSwapParams,
): Promise<SwapQuoteEngineResult> {
  const effectiveAffiliates = resolveEffectiveAffiliates(
    params.settings,
    params.affiliateDrafts,
  )
  const preferredRoute = resolveQuoteStrategy(params.settings, params.affiliateDrafts)
  const canUseVultisig =
    preferredRoute === 'vultisig' &&
    params.wallet.canExecute('swap.quote', { sessionId: params.sessionId })
  const route: QuoteStrategy = canUseVultisig ? 'vultisig' : 'maya'

  if (route === 'vultisig') {
    return quoteWithVultisig({
      wallet: params.wallet,
      sessionId: params.sessionId,
      fromAsset: params.fromAsset,
      toAsset: params.toAsset,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
      amount: params.amount,
      slippageBps: params.slippageBps,
      effectiveAffiliates,
      fiatCurrency: params.fiatCurrency,
    })
  }

  return quoteWithMaya({
    settings: params.settings,
    fromAsset: params.fromAsset,
    toAsset: params.toAsset,
    toAddress: params.toAddress,
    amount: params.amount,
    slippageBps: params.slippageBps,
    effectiveAffiliates,
    fetchImpl: params.fetchImpl,
  })
}

async function quoteWithVultisig(params: {
  wallet: WalletQuoteExecutor
  sessionId: string
  fromAsset: ProtocolAsset
  toAsset: ProtocolAsset
  fromAddress: string
  toAddress: string
  amount: string
  slippageBps?: string
  effectiveAffiliates: EffectiveAffiliate[]
  fiatCurrency?: WalletCommandMap['swap.quote']['input']['fiatCurrency']
}): Promise<SwapQuoteEngineResult> {
  const referral = params.effectiveAffiliates[0]?.value
  const { quote } = await params.wallet.execute('swap.quote', {
    input: {
      fromCoin: toQuoteCoin(params.fromAsset, params.fromAddress),
      toCoin: toQuoteCoin(params.toAsset, params.toAddress),
      amount: Number(params.amount),
      slippageBps: normalizeSlippageBps(params.slippageBps),
      referral,
      fiatCurrency: params.fiatCurrency,
    },
    sessionId: params.sessionId,
  })

  const canPrepare = params.wallet.canExecute('swap.prepare', {
    sessionId: params.sessionId,
  })

  return {
    route: 'vultisig',
    rawQuote: quote,
    estimatedOutput: quote.estimatedOutput.toString(),
    outputDecimals: params.toAsset.decimals,
    fees: {
      network: quote.fees.network.toString(),
      affiliate: quote.fees.affiliate?.toString(),
      total: quote.fees.total.toString(),
    },
    memo: undefined,
    effectiveAffiliates: params.effectiveAffiliates,
    canPrepare,
    prepareReason: canPrepare
      ? undefined
      : 'This session cannot prepare Vultisig swap transactions.',
    provider: quote.provider,
  }
}

async function quoteWithMaya(params: {
  settings: SettingsState
  fromAsset: ProtocolAsset
  toAsset: ProtocolAsset
  toAddress: string
  amount: string
  slippageBps?: string
  effectiveAffiliates: EffectiveAffiliate[]
  fetchImpl?: typeof fetch
}): Promise<SwapQuoteEngineResult> {
  const fetchImpl = resolveFetchImpl(params.fetchImpl)
  const url = buildMayaQuoteUrl({
    settings: params.settings,
    fromAsset: params.fromAsset,
    toAsset: params.toAsset,
    destinationAddress: params.toAddress,
    amount: params.amount,
    slippageBps: params.slippageBps,
    effectiveAffiliates: params.effectiveAffiliates,
  })
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Maya quote request failed with status ${response.status}.`)
  }

  const rawQuote = (await response.json()) as MayaQuoteResponse
  if (rawQuote.error) {
    const minimumAmountNote = rawQuote.recommended_min_amount_in
      ? ` Recommended minimum inbound amount: ${rawQuote.recommended_min_amount_in}.`
      : ''
    throw new Error(`${rawQuote.error}.${minimumAmountNote}`)
  }

  const affiliateFee = rawQuote.fees?.affiliate
  const networkFee = rawQuote.fees?.outbound

  return {
    route: 'maya',
    rawQuote,
    estimatedOutput: rawQuote.expected_amount_out ?? '',
    outputDecimals: MAYA_QUOTE_AMOUNT_DECIMALS,
    fees: {
      asset: rawQuote.fees?.asset,
      network: networkFee,
      affiliate: affiliateFee,
      total: sumStringifiedBigInts(networkFee, affiliateFee),
    },
    memo: rawQuote.memo,
    effectiveAffiliates: params.effectiveAffiliates,
    canPrepare: false,
    prepareReason: 'Maya-native quotes are quote-only in this flow.',
    provider: 'maya',
  }
}

function resolveAffiliateDraft(
  draft: AffiliateDraft,
  source: EffectiveAffiliate['source'],
): EffectiveAffiliate {
  const value = draft.value.trim()
  const kind: EffectiveAffiliate['kind'] = isMayaAddress(value) ? 'address' : 'mayaname'
  const bps = parseAffiliateBps(draft.bps)

  if (kind === 'address' && bps === undefined) {
    throw new Error(`Affiliate address "${value}" requires a basis points value.`)
  }

  return {
    value,
    bps,
    kind,
    source,
  }
}

function parseAffiliateBps(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Affiliate basis points must be a whole number.')
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_AFFILIATE_BPS) {
    throw new Error(`Affiliate basis points must be between 0 and ${MAX_AFFILIATE_BPS}.`)
  }

  return parsed
}

function isMayaAddress(value: string): boolean {
  return /^(maya|tmaya)1[0-9a-z]+$/i.test(value.trim())
}

function toQuoteCoin(asset: ProtocolAsset, address: string) {
  return {
    chain: asset.chain,
    ticker: asset.ticker,
    decimals: asset.decimals,
    address,
    ...(asset.tokenId ? { id: asset.tokenId } : {}),
  }
}

function normalizeSlippageBps(value?: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLIPPAGE_BPS
}

function decimalToBaseUnits(value: string, decimals: number): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Swap amount is required.')
  }

  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) {
    throw new Error('Swap amount must be a valid positive decimal number.')
  }

  const integerPart = match[1] ?? '0'
  const fractionalPart = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0')
  const normalized = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, '')
  return normalized.length ? normalized : '0'
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveFetchImpl(customFetch?: typeof fetch): typeof fetch {
  if (customFetch) {
    return customFetch
  }

  if (typeof fetch === 'function') {
    return fetch.bind(globalThis)
  }

  throw new Error('No fetch implementation is available for Maya quote requests.')
}

function sumStringifiedBigInts(
  left?: string,
  right?: string,
): string | undefined {
  if (!left && !right) {
    return undefined
  }

  return (BigInt(left ?? '0') + BigInt(right ?? '0')).toString()
}
