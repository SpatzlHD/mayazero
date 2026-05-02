import type { ProtocolAsset } from "#/components/ProtocolPrimitives";
import {
  fetchLiquidityActionAvailability,
  type LiquidityActionAvailability,
} from "#/lib/liquidity";
import { validateMayaName } from "#/lib/mayaname";
import {
  createInterfaceAffiliateDraft,
  INTERFACE_AFFILIATE_MAYANAME,
} from "#/lib/swap-affiliates";
import type { SettingsState } from "#/provider/SettingsProvider";
import type { MayaWalletManager, WalletCommandMap } from "#/wallet";

const DEFAULT_SLIPPAGE_BPS = 0;
const MAX_AFFILIATE_BPS = 500;
const MAX_TOTAL_AFFILIATES = 5;
const MAYA_QUOTE_EXTERNAL_INPUT_DECIMALS = 8;

export type AffiliateDraft = {
  value: string;
  bps: string;
};

export type EffectiveAffiliate = {
  value: string;
  bps?: number;
  kind: "address" | "mayaname";
  source: "interface" | "user";
};

export type QuoteStrategy = "vultisig" | "maya";

export type NormalizedQuoteFees = {
  asset?: string;
  network?: string;
  affiliate?: string;
  liquidity?: string;
  slippageBps?: number;
  totalBps?: number;
  total?: string;
};

export type MayaQuoteResponse = {
  error?: string;
  expected_amount_out?: string;
  memo?: string;
  inbound_address?: string;
  inbound_confirmation_blocks?: number | string;
  inbound_confirmation_seconds?: number | string;
  outbound_delay_blocks?: number | string;
  outbound_delay_seconds?: number | string;
  expiry?: number | string;
  warning?: string;
  notes?: string;
  dust_threshold?: string;
  recommended_gas_rate?: string;
  gas_rate_units?: string;
  max_streaming_quantity?: number | string;
  streaming_swap_blocks?: number | string;
  total_swap_seconds?: number | string;
  slippage_bps?: number | string;
  recommended_min_amount_in?: string;
  fees?: {
    affiliate?: string;
    asset?: string;
    liquidity?: string;
    outbound?: string;
    total?: string;
    slippage_bps?: number | string;
    total_bps?: number | string;
  };
  [key: string]: unknown;
};

type VultisigQuoteResult = WalletCommandMap["swap.quote"]["output"]["quote"];

export type SwapQuoteEngineResult =
  | {
      route: "vultisig";
      rawQuote: VultisigQuoteResult;
      estimatedOutput: string;
      outputDecimals: number;
      fees: NormalizedQuoteFees;
      memo?: string;
      effectiveAffiliates: EffectiveAffiliate[];
      canPrepare: boolean;
      prepareReason?: string;
      provider?: string;
    }
  | {
      route: "maya";
      rawQuote: MayaQuoteResponse;
      estimatedOutput: string;
      outputDecimals: number;
      fees: NormalizedQuoteFees;
      memo?: string;
      effectiveAffiliates: EffectiveAffiliate[];
      canPrepare: false;
      prepareReason: string;
      provider?: string;
      inboundAddress?: string;
      expiry?: number;
      warning?: string;
      notes?: string;
      dustThreshold?: string;
      recommendedGasRate?: string;
      gasRateUnits?: string;
      inboundDetails?: LiquidityActionAvailability | null;
    };

type WalletQuoteExecutor = Pick<MayaWalletManager, "execute" | "canExecute">;

export type QuoteSwapParams = {
  wallet: WalletQuoteExecutor;
  settings: SettingsState;
  sessionId: string;
  fromAsset: ProtocolAsset;
  toAsset: ProtocolAsset;
  fromAddress: string;
  toAddress: string;
  amount: string;
  slippageBps?: string;
  affiliateDrafts?: AffiliateDraft[];
  fiatCurrency?: WalletCommandMap["swap.quote"]["input"]["fiatCurrency"];
  fetchImpl?: typeof fetch;
  customRefundAddress?: string;
  streamingInterval?: string;
  streamingQuantity?: string;
};

export function createAffiliateDrafts(
  count = MAX_TOTAL_AFFILIATES - 1,
): AffiliateDraft[] {
  return Array.from({ length: count }, () => ({ value: "", bps: "" }));
}

export function resolveQuoteStrategy(
  _settings: SettingsState,
  _affiliateDrafts: AffiliateDraft[] = [],
): QuoteStrategy {
  return "maya";
}

export function resolveEffectiveAffiliates(
  _settings: SettingsState,
  affiliateDrafts: AffiliateDraft[] = [],
): EffectiveAffiliate[] {
  const interfaceAffiliate = resolveAffiliateDraft(
    createInterfaceAffiliateDraft(),
    "interface",
  );
  const userDrafts = affiliateDrafts.filter(
    (draft) => draft.value.trim().length > 0,
  );

  const effectiveAffiliates = [
    interfaceAffiliate,
    ...userDrafts.map((draft) => resolveAffiliateDraft(draft, "user")),
  ];

  if (effectiveAffiliates.length > MAX_TOTAL_AFFILIATES) {
    throw new Error(
      `A maximum of ${MAX_TOTAL_AFFILIATES} total affiliates is supported.`,
    );
  }

  return effectiveAffiliates;
}

export function buildMayaQuoteUrl(params: {
  settings: SettingsState;
  fromAsset: ProtocolAsset;
  toAsset: ProtocolAsset;
  destinationAddress: string;
  amount: string;
  slippageBps?: string;
  effectiveAffiliates?: EffectiveAffiliate[];
  refundAddress?: string;
  streamingInterval?: string;
  streamingQuantity?: string;
}): string {
  const mayanodeUrl = normalizeUrl(params.settings.mayanodeUrl);
  const searchParams = new URLSearchParams({
    from_asset: params.fromAsset.mayaAsset,
    to_asset: params.toAsset.mayaAsset,
    destination: params.destinationAddress,
    amount: decimalToBaseUnits(
      params.amount,
      resolveMayaQuoteInputDecimals(params.fromAsset),
    ),
    liquidity_tolerance_bps: String(normalizeSlippageBps(params.slippageBps)),
  });

  if (params.refundAddress) {
    searchParams.set("refund_address", params.refundAddress);
  }

  const streamingInterval = normalizeStreamingInteger(params.streamingInterval);
  if (streamingInterval !== undefined) {
    searchParams.set("streaming_interval", String(streamingInterval));
  }

  const streamingQuantity = normalizeStreamingInteger(params.streamingQuantity);
  if (streamingQuantity !== undefined) {
    searchParams.set("streaming_quantity", String(streamingQuantity));
  }

  const effectiveAffiliates =
    params.effectiveAffiliates && params.effectiveAffiliates.length > 0
      ? params.effectiveAffiliates
      : resolveEffectiveAffiliates(params.settings, []);
  if (effectiveAffiliates.length > 0) {
    searchParams.set(
      "affiliate",
      effectiveAffiliates.map((affiliate) => affiliate.value).join("/"),
    );

    const bpsSegments = effectiveAffiliates.map((affiliate) =>
      affiliate.bps === undefined ? "" : String(affiliate.bps),
    );
    if (bpsSegments.some((segment) => segment.length > 0)) {
      searchParams.set("affiliate_bps", bpsSegments.join("/"));
    }
  }

  return `${mayanodeUrl}/mayachain/quote/swap?${searchParams.toString()}`;
}

export async function quoteSwap(
  params: QuoteSwapParams,
): Promise<SwapQuoteEngineResult> {
  const effectiveAffiliates = resolveEffectiveAffiliates(
    params.settings,
    params.affiliateDrafts,
  );
  await validateAffiliateMayaNames(
    effectiveAffiliates,
    params.settings,
    params.fetchImpl,
  );
  const preferredRoute = resolveQuoteStrategy(
    params.settings,
    params.affiliateDrafts,
  );
  const canUseVultisig =
    preferredRoute === "vultisig" &&
    params.wallet.canExecute("swap.quote", { sessionId: params.sessionId });
  const route: QuoteStrategy = canUseVultisig ? "vultisig" : "maya";

  if (route === "vultisig") {
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
    });
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
    refundAddress: params.customRefundAddress,
    streamingInterval: params.streamingInterval,
    streamingQuantity: params.streamingQuantity,
  });
}

async function quoteWithVultisig(params: {
  wallet: WalletQuoteExecutor;
  sessionId: string;
  fromAsset: ProtocolAsset;
  toAsset: ProtocolAsset;
  fromAddress: string;
  toAddress: string;
  amount: string;
  slippageBps?: string;
  effectiveAffiliates: EffectiveAffiliate[];
  fiatCurrency?: WalletCommandMap["swap.quote"]["input"]["fiatCurrency"];
}): Promise<SwapQuoteEngineResult> {
  const referral = params.effectiveAffiliates[0]?.value;
  const { quote } = await params.wallet.execute("swap.quote", {
    input: {
      fromCoin: toQuoteCoin(params.fromAsset, params.fromAddress),
      toCoin: toQuoteCoin(params.toAsset, params.toAddress),
      amount: Number(params.amount),
      slippageBps: normalizeSlippageBps(params.slippageBps),
      referral,
      fiatCurrency: params.fiatCurrency,
    },
    sessionId: params.sessionId,
  });

  const canPrepare = params.wallet.canExecute("swap.prepare", {
    sessionId: params.sessionId,
  });

  return {
    route: "vultisig",
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
      : "This session cannot prepare Vultisig swap transactions.",
    provider: quote.provider,
  };
}

async function quoteWithMaya(params: {
  settings: SettingsState;
  fromAsset: ProtocolAsset;
  toAsset: ProtocolAsset;
  toAddress: string;
  amount: string;
  slippageBps?: string;
  effectiveAffiliates: EffectiveAffiliate[];
  fetchImpl?: typeof fetch;
  refundAddress?: string;
  streamingInterval?: string;
  streamingQuantity?: string;
}): Promise<SwapQuoteEngineResult> {
  const fetchImpl = resolveFetchImpl(params.fetchImpl);
  const quoteRequest = (streaming?: { interval?: string; quantity?: string }) =>
    fetchQuoteResponse(
      fetchImpl,
      buildMayaQuoteUrl({
        settings: params.settings,
        fromAsset: params.fromAsset,
        toAsset: params.toAsset,
        destinationAddress: params.toAddress,
        amount: params.amount,
        slippageBps: params.slippageBps,
        effectiveAffiliates: params.effectiveAffiliates,
        refundAddress: params.refundAddress,
        streamingInterval: streaming?.interval,
        streamingQuantity: streaming?.quantity,
      }),
    );

  const [initialQuote, inboundAvailability] = await Promise.all([
    quoteRequest({
      interval: params.streamingInterval,
      quantity: params.streamingQuantity,
    }),
    fetchLiquidityActionAvailability({
      fetch: fetchImpl,
      mayanodeUrl: params.settings.mayanodeUrl,
    }).catch(() => ({}) as Record<string, LiquidityActionAvailability>),
  ]);

  const rawQuote =
    initialQuote.error &&
    (params.streamingInterval !== undefined ||
      params.streamingQuantity !== undefined)
      ? await quoteRequest()
      : initialQuote;

  if (rawQuote.error) {
    const minimumAmountNote = rawQuote.recommended_min_amount_in
      ? ` Recommended minimum inbound amount: ${rawQuote.recommended_min_amount_in}.`
      : "";
    throw new Error(`${rawQuote.error}.${minimumAmountNote}`);
  }

  const affiliateFee = rawQuote.fees?.affiliate;
  const liquidityFee = rawQuote.fees?.liquidity;
  const networkFee = rawQuote.fees?.outbound;
  const inboundChainTicker =
    params.fromAsset.mayaAsset.split(".")[0]?.toUpperCase() ?? "";
  const inboundDetails = inboundAvailability[inboundChainTicker] ?? null;
  const expiry = normalizeQuoteExpiry(rawQuote.expiry);

  return {
    route: "maya",
    rawQuote,
    estimatedOutput: rawQuote.expected_amount_out ?? "",
    outputDecimals: resolveMayaQuoteOutputDecimals(params.toAsset),
    fees: {
      asset: rawQuote.fees?.asset,
      network: networkFee,
      affiliate: affiliateFee,
      liquidity: liquidityFee,
      slippageBps: normalizeMaybeNumber(
        rawQuote.fees?.slippage_bps ?? rawQuote.slippage_bps,
      ),
      totalBps: normalizeMaybeNumber(rawQuote.fees?.total_bps),
      total:
        rawQuote.fees?.total ??
        sumStringifiedBigInts(networkFee, affiliateFee, liquidityFee),
    },
    memo: rawQuote.memo,
    effectiveAffiliates: params.effectiveAffiliates,
    canPrepare: false,
    prepareReason: "Maya-native quotes require the custom execution flow.",
    provider: "maya",
    inboundAddress: rawQuote.inbound_address,
    expiry,
    warning: rawQuote.warning,
    notes: rawQuote.notes,
    dustThreshold: rawQuote.dust_threshold,
    recommendedGasRate: rawQuote.recommended_gas_rate,
    gasRateUnits: rawQuote.gas_rate_units,
    inboundDetails,
  };
}

function resolveAffiliateDraft(
  draft: AffiliateDraft,
  source: EffectiveAffiliate["source"],
): EffectiveAffiliate {
  const value = draft.value.trim();
  const kind: EffectiveAffiliate["kind"] = isMayaAddress(value)
    ? "address"
    : "mayaname";
  const bps = parseAffiliateBps(draft.bps);

  if (kind === "address" && bps === undefined) {
    throw new Error(
      `Affiliate address "${value}" requires a basis points value.`,
    );
  }

  return {
    value,
    bps,
    kind,
    source,
  };
}

async function validateAffiliateMayaNames(
  affiliates: EffectiveAffiliate[],
  settings: SettingsState,
  fetchImpl?: typeof fetch,
) {
  for (const affiliate of affiliates) {
    if (affiliate.value === INTERFACE_AFFILIATE_MAYANAME) {
      continue;
    }
    if (affiliate.kind !== "mayaname") {
      continue;
    }

    const validation = await validateMayaName(
      affiliate.value,
      settings.mayanodeUrl,
      fetchImpl,
    );

    if (validation.status === "valid") {
      continue;
    }

    if (validation.status === "invalid") {
      throw new Error(`Affiliate MAYAName "${affiliate.value}" is invalid.`);
    }

    throw new Error(
      `Unable to validate MAYAName "${affiliate.value}" right now.`,
    );
  }
}

function parseAffiliateBps(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Affiliate basis points must be a whole number.");
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_AFFILIATE_BPS) {
    throw new Error(
      `Affiliate basis points must be between 0 and ${MAX_AFFILIATE_BPS}.`,
    );
  }

  return parsed;
}

function isMayaAddress(value: string): boolean {
  return /^(maya|tmaya)1[0-9a-z]+$/i.test(value.trim());
}

function toQuoteCoin(asset: ProtocolAsset, address: string) {
  return {
    chain: asset.chain,
    ticker: asset.ticker,
    decimals: asset.decimals,
    address,
    ...(asset.tokenId ? { id: asset.tokenId } : {}),
  };
}

function normalizeSlippageBps(value?: string): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_SLIPPAGE_BPS;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_SLIPPAGE_BPS;
}

function decimalToBaseUnits(value: string, decimals: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Swap amount is required.");
  }

  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Error("Swap amount must be a valid positive decimal number.");
  }

  const integerPart = match[1] ?? "0";
  const fractionalPart = (match[2] ?? "")
    .slice(0, decimals)
    .padEnd(decimals, "0");
  const normalized = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "");
  return normalized.length ? normalized : "0";
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveFetchImpl(customFetch?: typeof fetch): typeof fetch {
  if (customFetch) {
    return customFetch;
  }

  if (typeof fetch === "function") {
    return fetch.bind(globalThis);
  }

  throw new Error(
    "No fetch implementation is available for Maya quote requests.",
  );
}

function sumStringifiedBigInts(
  ...values: Array<string | undefined>
): string | undefined {
  const definedValues = values.filter((value): value is string =>
    Boolean(value),
  );
  if (!definedValues.length) {
    return undefined;
  }

  return definedValues
    .reduce((sum, value) => sum + BigInt(value), 0n)
    .toString();
}

function normalizeQuoteExpiry(value?: number | string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
}

function resolveMayaQuoteOutputDecimals(asset: ProtocolAsset): number {
  const chainTicker = asset.mayaAsset.split(".")[0]?.toUpperCase();
  return chainTicker === "MAYA" ? asset.decimals : 8;
}

function resolveMayaQuoteInputDecimals(asset: ProtocolAsset): number {
  const chainTicker = asset.mayaAsset.split(".")[0]?.toUpperCase();
  return chainTicker === "MAYA"
    ? asset.decimals
    : MAYA_QUOTE_EXTERNAL_INPUT_DECIMALS;
}

function normalizeStreamingInteger(value?: string): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Streaming settings must be whole numbers.");
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Streaming settings must be zero or greater.");
  }

  return parsed;
}

function normalizeMaybeNumber(value?: number | string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchQuoteResponse(
  fetchImpl: typeof fetch,
  url: string,
): Promise<MayaQuoteResponse> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Maya quote request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as MayaQuoteResponse;
}
