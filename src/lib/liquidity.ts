import { Chain } from "@vultisig/sdk";
import { getMayaChainIdentity } from "./maya-asset-catalog";
import { formatBaseUnits } from "./cacao-pool";
import { tryNormalizeEvmAddress } from "./evm-address";

type FetchLike = typeof fetch;

type MidgardPoolRecord = {
  annualPercentageRate?: string;
  poolAPY?: string;
  asset: string;
  assetDepth?: string;
  assetPrice?: string;
  assetPriceUSD?: string;
  liquidityUnits?: string;
  nativeDecimal?: string | number;
  poolUnits?: string;
  runeDepth?: string;
  cacaoDepth?: string;
  status?: string;
  saversDepth?: string;
  synthUnits?: string;
  units?: string;
  volume24h?: string;
};

type MidgardMemberPoolRecord = {
  pool: string;
  liquidityUnits?: string;
  units?: string;
  assetAdded?: string;
  assetPending?: string;
  assetWithdrawn?: string;
  assetAddress?: string;
  runeAdded?: string;
  runePending?: string;
  runeWithdrawn?: string;
  runeAddress?: string;
  runeDepositValue?: string;
  runeRedeemValue?: string;
  cacaoAdded?: string;
  cacaoPending?: string;
  cacaoWithdrawn?: string;
  cacaoAddress?: string;
  cacaoDepositValue?: string;
  cacaoRedeemValue?: string;
  assetDepositValue?: string;
  assetRedeemValue?: string;
  withdrawCounter?: string;
  dateFirstAdded?: string;
  dateLastAdded?: string;
};

type MidgardMemberResponse =
  | {
      pools?: MidgardMemberPoolRecord[];
    }
  | MidgardMemberPoolRecord[];

type MidgardActionRecord = {
  date: string;
  height: string;
  in?: MidgardActionTx[];
  out?: MidgardActionTx[];
  metadata?: Record<string, unknown>;
  pools?: string[];
  status: "success" | "pending" | string;
  type: string;
};

type MidgardActionTx = {
  address?: string;
  coins?: Array<{
    amount: string;
    asset: string;
  }>;
  memo?: string;
  txID?: string;
};

type MidgardActionsResponse = {
  actions?: MidgardActionRecord[];
};

type MayanodeInboundAddress = {
  address: string;
  chain: string;
  chain_lp_actions_paused?: boolean;
  chain_trading_paused?: boolean;
  dust_threshold?: string;
  gas_rate?: string;
  gas_rate_units?: string;
  halted?: boolean;
  observed_fee_rate?: string;
  outbound_fee?: string;
  pub_key?: string;
  router?: string;
};

type MayanodeLiquidityProvider = {
  asset: string;
  asset_address?: string;
  asset_deposit_value?: string;
  asset_redeem_value?: string;
  bonded_nodes?: Array<{
    node_address: string;
    units: string;
  }>;
  cacao_address?: string;
  cacao_deposit_value?: string;
  cacao_redeem_value?: string;
  last_add_height?: number;
  last_withdraw_height?: number;
  pending_asset?: string;
  pending_cacao?: string;
  units?: string;
  withdraw_counter?: string;
};

export type LiquidityDepositMode = "symmetric" | "cacao" | "asset";
export type LiquidityWithdrawMode = "symmetric" | "cacao" | "asset";

export type LiquidityActionAvailability = {
  chain: string;
  inboundAddress: string;
  lpActionsPaused: boolean;
  tradingPaused: boolean;
  halted: boolean;
  dustThreshold: string;
  gasRate?: string;
  gasRateUnits?: string;
  outboundFee?: string;
  router?: string;
};

export type LiquidityPool = {
  actionAvailability: LiquidityActionAvailability | null;
  apr: string;
  asset: string;
  assetDepth: string;
  assetPrice: string;
  assetPriceUsd: string;
  chainKey: string;
  chainName: string;
  chainTicker: string;
  decimals: number;
  depthUsd: number;
  family: string;
  iconId: string;
  isActionable: boolean;
  lpUnits: string;
  poolUnits: string;
  saversDepth: string;
  status: string;
  symbol: string;
  ticker: string;
  tokenId?: string;
  volume24h: string;
  walletChain?: Chain;
  cacaoDepth: string;
};

export type LiquidityPosition = {
  assetAddress: string | null;
  assetAdded: string;
  assetDepositValue: string;
  assetRedeemValue: string;
  assetWithdrawn: string;
  cacaoAddress: string | null;
  cacaoAdded: string;
  cacaoDepositValue: string;
  cacaoRedeemValue: string;
  cacaoWithdrawn: string;
  firstAddedAt: number | null;
  lastAddedAt: number | null;
  matchingAddresses: string[];
  pendingAsset: string;
  pendingCacao: string;
  pool: string;
  state: "active" | "pending" | "empty";
  units: string;
  withdrawCounter: string | null;
};

export type LiquidityActivityItem = {
  basisPoints: string | null;
  memo: string | null;
  pool: string | null;
  status: string;
  timestamp: number;
  txHash: string | null;
  type: "deposit" | "withdraw";
};

export type LiquidityServiceOptions = {
  fetch?: FetchLike;
  mayanodeUrl?: string;
  midgardUrl?: string;
};

const DEFAULT_MIDGARD_URL = "https://midgard.mayachain.info";
const DEFAULT_MAYANODE_URL = "https://mayanode.mayachain.info";
const MIDGARD_BASE_DECIMALS = 8;
const CHAIN_TICKER_TO_IDENTITY_KEY: Record<string, string> = {
  ARB: "arbitrum",
  BTC: "bitcoin",
  DASH: "dash",
  ETH: "ethereum",
  MAYA: "mayachain",
  THOR: "thorchain",

  ZEC: "zcash",
  ADA: "cardano",
};

function defaultFetchMissing(): never {
  throw new Error(
    "No fetch implementation is available for liquidity requests.",
  );
}

function resolveFetchImplementation(customFetch?: FetchLike): FetchLike {
  if (customFetch) {
    return customFetch;
  }

  if (typeof fetch === "function") {
    return fetch.bind(globalThis);
  }

  return defaultFetchMissing;
}

function normalizeUrl(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\/+$/, "");
}

async function getJson<T>(
  url: string,
  options: LiquidityServiceOptions = {},
): Promise<T> {
  const response = await resolveFetchImplementation(options.fetch)(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load liquidity data (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function fetchLiquidityActionAvailability(
  options: LiquidityServiceOptions = {},
): Promise<Record<string, LiquidityActionAvailability>> {
  const mayanodeUrl = normalizeUrl(options.mayanodeUrl, DEFAULT_MAYANODE_URL);
  const records = await getJson<MayanodeInboundAddress[]>(
    `${mayanodeUrl}/mayachain/inbound_addresses`,
    options,
  );

  return normalizeLiquidityActionAvailability(records);
}

export function normalizeLiquidityActionAvailability(
  records: MayanodeInboundAddress[],
): Record<string, LiquidityActionAvailability> {
  return records.reduce<Record<string, LiquidityActionAvailability>>(
    (result, record) => {
      const chain = record.chain.toUpperCase();
      const identity = getMayaChainIdentity(
        CHAIN_TICKER_TO_IDENTITY_KEY[chain] ?? chain.toLowerCase(),
      );
      const isEvm = identity.family === "evm";

      result[chain] = {
        chain,
        inboundAddress: isEvm
          ? (tryNormalizeEvmAddress(record.address) ?? record.address)
          : record.address,
        lpActionsPaused: Boolean(record.chain_lp_actions_paused),
        tradingPaused: Boolean(record.chain_trading_paused),
        halted: Boolean(record.halted),
        dustThreshold: record.dust_threshold ?? "0",
        gasRate: record.gas_rate,
        gasRateUnits: record.gas_rate_units,
        outboundFee: record.outbound_fee,
        router:
          isEvm && record.router
            ? (tryNormalizeEvmAddress(record.router) ?? record.router)
            : record.router,
      };
      return result;
    },
    {},
  );
}

export async function fetchLiquidityPools(
  options: LiquidityServiceOptions = {},
): Promise<LiquidityPool[]> {
  const midgardUrl = normalizeUrl(options.midgardUrl, DEFAULT_MIDGARD_URL);
  const [pools, availability] = await Promise.all([
    getJson<MidgardPoolRecord[]>(`${midgardUrl}/v2/pools`, options),
    fetchLiquidityActionAvailability(options),
  ]);

  return normalizeLiquidityPools(pools, availability);
}

export function normalizeLiquidityPools(
  pools: MidgardPoolRecord[],
  availability: Record<string, LiquidityActionAvailability>,
): LiquidityPool[] {
  return pools
    .map((pool) => {
      const [chainTickerRaw, assetPartRaw = ""] = pool.asset.split(".");
      const chainTicker = chainTickerRaw.toUpperCase();
      const [tickerRaw, tokenIdRaw] = assetPartRaw.split("-", 2);
      const identity = getMayaChainIdentity(
        CHAIN_TICKER_TO_IDENTITY_KEY[chainTicker] ?? chainTicker.toLowerCase(),
      );
      const tokenId =
        identity.family === "evm" && tokenIdRaw
          ? (tryNormalizeEvmAddress(tokenIdRaw) ?? tokenIdRaw)
          : tokenIdRaw;
      const assetPriceUsd = Number(pool.assetPriceUSD ?? "0");
      const assetPrice = Number(pool.assetPrice ?? "0");
      const assetDepthBase = Number(
        formatBaseUnits(pool.assetDepth ?? "0", MIDGARD_BASE_DECIMALS),
      );
      const cacaoDepthBase = Number(
        formatBaseUnits(
          pool.cacaoDepth ?? pool.runeDepth ?? "0",
          MIDGARD_BASE_DECIMALS,
        ),
      );
      const cacaoUsdPrice =
        assetPriceUsd > 0 && assetPrice > 0 ? assetPriceUsd / assetPrice : 0;
      const depthUsd =
        assetDepthBase * assetPriceUsd + cacaoDepthBase * cacaoUsdPrice;
      const chainAvailability = availability[chainTicker] ?? null;
      const status = pool.status ?? "unknown";

      return {
        actionAvailability: chainAvailability,
        apr: pool.poolAPY ?? pool.annualPercentageRate ?? "0",
        asset: pool.asset,
        assetDepth: pool.assetDepth ?? "0",
        assetPrice: pool.assetPrice ?? "0",
        assetPriceUsd: pool.assetPriceUSD ?? "0",
        cacaoDepth: pool.cacaoDepth ?? pool.runeDepth ?? "0",
        chainKey: identity.key,
        chainName: identity.name,
        chainTicker,
        decimals: normalizeDecimals(pool.nativeDecimal),
        depthUsd,
        family: identity.family,
        iconId: identity.iconId || tickerRaw.toLowerCase(),
        isActionable:
          status.toLowerCase() === "available" &&
          chainAvailability !== null &&
          !chainAvailability.halted &&
          !chainAvailability.lpActionsPaused,
        lpUnits: pool.liquidityUnits ?? "0",
        poolUnits: pool.poolUnits ?? pool.units ?? "0",
        saversDepth: pool.saversDepth ?? "0",
        status,
        symbol: tickerRaw.toUpperCase(),
        ticker: tickerRaw.toUpperCase(),
        tokenId,
        volume24h: pool.volume24h ?? "0",
        walletChain: identity.walletChain,
      } satisfies LiquidityPool;
    })
    .sort((left, right) => right.depthUsd - left.depthUsd);
}

export async function fetchLiquidityPositions(
  addresses: string[],
  options: LiquidityServiceOptions = {},
): Promise<LiquidityPosition[]> {
  if (!addresses.length) {
    return [];
  }

  const midgardUrl = normalizeUrl(options.midgardUrl, DEFAULT_MIDGARD_URL);
  const encodedAddresses = addresses
    .map((address) => encodeURIComponent(address))
    .join(",");
  const response = await getJson<MidgardMemberResponse>(
    `${midgardUrl}/v2/member/${encodedAddresses}`,
    options,
  );

  return normalizeLiquidityPositions(response, addresses);
}

export function normalizeLiquidityPositions(
  response: MidgardMemberResponse,
  matchingAddresses: string[],
): LiquidityPosition[] {
  const pools = Array.isArray(response) ? response : (response.pools ?? []);
  const normalizedAddresses = matchingAddresses.map((address) =>
    address.toLowerCase(),
  );

  return pools
    .map((pool) => normalizeMemberPoolPosition(pool, normalizedAddresses))
    .filter((position): position is LiquidityPosition => Boolean(position))
    .sort((left, right) => {
      const leftWeight =
        left.state === "active" ? 2 : left.state === "pending" ? 1 : 0;
      const rightWeight =
        right.state === "active" ? 2 : right.state === "pending" ? 1 : 0;
      if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
      }
      return (right.lastAddedAt ?? 0) - (left.lastAddedAt ?? 0);
    });
}

function normalizeMemberPoolPosition(
  pool: MidgardMemberPoolRecord,
  matchingAddresses: string[],
): LiquidityPosition | null {
  const assetAddress = pool.assetAddress ?? null;
  const cacaoAddress = pool.cacaoAddress ?? pool.runeAddress ?? null;
  const units = pool.liquidityUnits ?? pool.units ?? "0";
  const pendingAsset = pool.assetPending ?? "0";
  const pendingCacao = pool.cacaoPending ?? pool.runePending ?? "0";
  const matched: string[] = [];

  for (const address of [assetAddress, cacaoAddress]) {
    if (address && matchingAddresses.includes(address.toLowerCase())) {
      matched.push(address);
    }
  }

  if (!matched.length) {
    return null;
  }

  const isActive = units !== "0";
  const isPending = !isActive && (pendingAsset !== "0" || pendingCacao !== "0");

  return {
    assetAddress,
    assetAdded: pool.assetAdded ?? "0",
    assetDepositValue: pool.assetDepositValue ?? "0",
    assetRedeemValue: pool.assetRedeemValue ?? "0",
    assetWithdrawn: pool.assetWithdrawn ?? "0",
    cacaoAddress,
    cacaoAdded: pool.cacaoAdded ?? pool.runeAdded ?? "0",
    cacaoDepositValue: pool.cacaoDepositValue ?? pool.runeDepositValue ?? "0",
    cacaoRedeemValue: pool.cacaoRedeemValue ?? pool.runeRedeemValue ?? "0",
    cacaoWithdrawn: pool.cacaoWithdrawn ?? pool.runeWithdrawn ?? "0",
    firstAddedAt: toUnixTimestamp(pool.dateFirstAdded),
    lastAddedAt: toUnixTimestamp(pool.dateLastAdded),
    matchingAddresses: matched,
    pendingAsset,
    pendingCacao,
    pool: pool.pool,
    state: isActive ? "active" : isPending ? "pending" : "empty",
    units,
    withdrawCounter: pool.withdrawCounter ?? null,
  };
}

export async function fetchLiquidityActivity(
  addresses: string[],
  options: LiquidityServiceOptions = {},
): Promise<LiquidityActivityItem[]> {
  if (!addresses.length) {
    return [];
  }

  const midgardUrl = normalizeUrl(options.midgardUrl, DEFAULT_MIDGARD_URL);
  const search = new URLSearchParams({
    address: addresses.join(","),
  });
  const response = await getJson<MidgardActionsResponse>(
    `${midgardUrl}/v2/actions?${search.toString()}`,
    options,
  );

  return normalizeLiquidityActivity(response.actions ?? []);
}

export function normalizeLiquidityActivity(
  actions: MidgardActionRecord[],
): LiquidityActivityItem[] {
  return actions
    .filter((action) => isLiquidityAction(action.type))
    .map((action) => {
      const tx = action.in?.[0] ?? action.out?.[0];
      return {
        basisPoints: extractBasisPoints(action.metadata),
        memo: tx?.memo ?? extractMemo(action.metadata),
        pool: action.pools?.[0] ?? null,
        status: action.status,
        timestamp: toUnixTimestamp(action.date) ?? 0,
        txHash: tx?.txID ?? null,
        type: action.type.toLowerCase().includes("add")
          ? "deposit"
          : "withdraw",
      } satisfies LiquidityActivityItem;
    })
    .sort((left, right) => right.timestamp - left.timestamp);
}

export async function fetchLiquidityProviderFallback(
  poolAsset: string,
  addresses: string[],
  options: LiquidityServiceOptions = {},
): Promise<LiquidityPosition | null> {
  if (!poolAsset || !addresses.length) {
    return null;
  }

  const mayanodeUrl = normalizeUrl(options.mayanodeUrl, DEFAULT_MAYANODE_URL);
  for (const address of addresses) {
    const provider = await getJson<MayanodeLiquidityProvider>(
      `${mayanodeUrl}/mayachain/pool/${encodeURIComponent(poolAsset)}/liquidity_provider/${encodeURIComponent(address)}`,
      options,
    ).catch(() => null);

    if (!provider) {
      continue;
    }

    const normalized = normalizeLiquidityProviderFallback(provider, [address]);
    if (normalized && normalized.state !== "empty") {
      return normalized;
    }
  }

  return null;
}

export function normalizeLiquidityProviderFallback(
  provider: MayanodeLiquidityProvider,
  matchingAddresses: string[],
): LiquidityPosition | null {
  const normalizedAddresses = matchingAddresses.map((address) =>
    address.toLowerCase(),
  );
  const matched: string[] = [];

  for (const address of [provider.asset_address, provider.cacao_address]) {
    if (address && normalizedAddresses.includes(address.toLowerCase())) {
      matched.push(address);
    }
  }

  if (!matched.length && matchingAddresses.length) {
    return null;
  }

  const units = provider.units ?? "0";
  const pendingAsset = provider.pending_asset ?? "0";
  const pendingCacao = provider.pending_cacao ?? "0";

  return {
    assetAddress: provider.asset_address ?? null,
    assetAdded: "0",
    assetDepositValue: provider.asset_deposit_value ?? "0",
    assetRedeemValue: provider.asset_redeem_value ?? "0",
    assetWithdrawn: "0",
    cacaoAddress: provider.cacao_address ?? null,
    cacaoAdded: "0",
    cacaoDepositValue: provider.cacao_deposit_value ?? "0",
    cacaoRedeemValue: provider.cacao_redeem_value ?? "0",
    cacaoWithdrawn: "0",
    firstAddedAt: null,
    lastAddedAt: provider.last_add_height ?? null,
    matchingAddresses: matched,
    pendingAsset,
    pendingCacao,
    pool: provider.asset,
    state:
      units !== "0"
        ? "active"
        : pendingAsset !== "0" || pendingCacao !== "0"
          ? "pending"
          : "empty",
    units,
    withdrawCounter:
      provider.withdraw_counter && provider.withdraw_counter !== "<nil>"
        ? provider.withdraw_counter
        : null,
  };
}

export function mergeLiquidityPositionsWithFallback(
  positions: LiquidityPosition[],
  fallback: LiquidityPosition | null,
): LiquidityPosition[] {
  if (!fallback) {
    return positions;
  }

  const matchIndex = positions.findIndex(
    (position) => position.pool === fallback.pool,
  );
  if (matchIndex === -1) {
    return [...positions, fallback];
  }

  const merged = [...positions];
  merged[matchIndex] = {
    ...fallback,
    ...merged[matchIndex],
    assetAddress: merged[matchIndex]?.assetAddress ?? fallback.assetAddress,
    cacaoAddress: merged[matchIndex]?.cacaoAddress ?? fallback.cacaoAddress,
    matchingAddresses: merged[matchIndex]?.matchingAddresses.length
      ? merged[matchIndex].matchingAddresses
      : fallback.matchingAddresses,
  };
  return merged;
}

export function getSessionLiquidityAddresses(
  addresses: Partial<Record<Chain, string>> | undefined,
): string[] {
  const unique = new Set<string>();
  for (const address of Object.values(addresses ?? {})) {
    if (address) {
      unique.add(address);
    }
  }
  return [...unique];
}

export function parseLiquidityAsset(asset: string): {
  chainTicker: string;
  symbol: string;
  tokenId?: string;
} {
  const [chainTickerRaw = "", assetPartRaw = ""] = asset.split(".");
  const [symbolRaw = "", tokenId] = assetPartRaw.split("-", 2);
  return {
    chainTicker: chainTickerRaw.toUpperCase(),
    symbol: symbolRaw.toUpperCase(),
    tokenId,
  };
}

function isLiquidityAction(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized.includes("liquidity") || normalized === "withdraw";
}

function extractBasisPoints(
  metadata: Record<string, unknown> | undefined,
): string | null {
  if (!metadata) {
    return null;
  }

  const candidates = Object.values(metadata);
  for (const candidate of candidates) {
    if (typeof candidate === "object" && candidate !== null) {
      const record = candidate as Record<string, unknown>;
      if (typeof record.basisPoints === "string") {
        return record.basisPoints;
      }
      if (typeof record.withdrawBasisPoints === "string") {
        return record.withdrawBasisPoints;
      }
    }
  }

  return null;
}

function extractMemo(
  metadata: Record<string, unknown> | undefined,
): string | null {
  if (!metadata) {
    return null;
  }

  const candidates = Object.values(metadata);
  for (const candidate of candidates) {
    if (typeof candidate === "object" && candidate !== null) {
      const record = candidate as Record<string, unknown>;
      if (typeof record.memo === "string") {
        return record.memo;
      }
    }
  }

  return null;
}

function normalizeDecimals(value: string | number | undefined): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 8;
}

function toUnixTimestamp(value: string | number | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return normalizeUnixTimestamp(value);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return normalizeUnixTimestamp(numeric);
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed / 1000);
}

function normalizeUnixTimestamp(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value >= 1_000_000_000_000_000_000) {
    return Math.floor(value / 1_000_000_000);
  }

  if (value >= 1_000_000_000_000) {
    return Math.floor(value / 1000);
  }

  return Math.floor(value);
}
