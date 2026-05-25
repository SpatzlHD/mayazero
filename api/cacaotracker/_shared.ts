import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AddressRewardsResponse,
  BondProviderResponse,
  BondProviderSummary,
  CacaoPoolApyResponse,
  CacaoPoolDetailResponse,
  CacaoPoolHistoryEntry,
  CacaoPoolStats,
  EnhancedActionsResponse,
  ILAnalysis,
  ILHistoryResponse,
  ILSummary,
  ILSummaryAggregated,
  LiquidityPoolDetailResponse,
  LiquiditySummaryResponse,
  MayaTokenRewardsResponse,
  PoolAnalytics,
  PoolComparisonResult,
  PoolMetrics,
  PoolReward,
  PoolTVLHistory,
  PoolVolumeHourly,
  PooledNodesDetailResponse,
  ProtocolDashboardResponse,
  SyncStatus,
  UnknownRecord,
  WalletActivityResponse,
  WalletSummaryResponse,
} from "./types.js";

export const CACAOTRACKER_DEFAULT_BASE_URL = "https://api.cacaotracker.xyz";

const CACHE_TTL_MS = {
  protocol: 60_000,
  wallet: 20_000,
  liquidity: 20_000,
  cacaoPool: 20_000,
  pooledNodes: 20_000,
} as const;

type CacheBucket = keyof typeof CACHE_TTL_MS;
type FetchLike = typeof fetch;

type CacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

type CacaotrackerDependencies = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
};

type ProcessEnvLike = Record<string, string | undefined>;

const responseCache = new Map<string, CacheEntry>();

export class CacaotrackerApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CacaotrackerApiError";
    this.status = status;
  }
}

export function clearCacaotrackerResponseCache(): void {
  responseCache.clear();
}

function normalizeBaseUrl(value?: string): string {
  return (value?.trim() || CACAOTRACKER_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readServerEnv(name: string): string | undefined {
  const env = (
    globalThis as typeof globalThis & {
      process?: {
        env?: ProcessEnvLike;
      };
    }
  ).process?.env;

  return env?.[name];
}

function resolveFetchImplementation(customFetch?: FetchLike): FetchLike {
  if (customFetch) {
    return customFetch;
  }

  if (typeof fetch === "function") {
    return fetch.bind(globalThis);
  }

  throw new Error(
    "No fetch implementation is available for CacaoTracker requests.",
  );
}

export function buildCacaotrackerUrl(
  path: string,
  query: Record<string, string | number | null | undefined> = {},
  baseUrl?: string,
): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${path}`);

  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function readUpstreamErrorMessage(response: Response): Promise<string> {
  const fallback = `CacaoTracker request failed with status ${response.status}.`;

  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) {
        return text.trim();
      }
    } catch {
      // Ignore parsing failures and fall through to the fallback.
    }
  }

  return fallback;
}

function readNumericField(
  record: UnknownRecord,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function normalizeBondProviderResponse(payload: unknown): BondProviderResponse {
  if (!isRecord(payload)) {
    return null;
  }

  const nodes = Array.isArray(payload.nodes)
    ? payload.nodes
        .filter(isRecord)
        .map((entry) => ({
          nodeAddress:
            typeof entry.nodeAddress === "string"
              ? entry.nodeAddress
              : typeof entry.node_address === "string"
                ? entry.node_address
                : "",
          bondedCacao:
            readNumericField(entry, ["bondedCacao", "bonded_cacao"]) ?? 0,
          rewardCacao: readNumericField(entry, [
            "rewardCacao",
            "reward_cacao",
            "reward",
          ]),
        }))
        .filter((entry) => entry.nodeAddress)
    : undefined;

  const summary: BondProviderSummary = {
    totalBondedCacao: readNumericField(payload, [
      "totalBondedCacao",
      "total_bonded_cacao",
      "bondedCacao",
    ]),
    totalRewardCacao: readNumericField(payload, [
      "totalRewardCacao",
      "total_reward_cacao",
      "reward",
      "rewards",
    ]),
    providerCount: readNumericField(payload, [
      "providerCount",
      "provider_count",
    ]),
    nodeCount: readNumericField(payload, ["nodeCount", "node_count"]),
    nodes,
  };

  const hasData =
    summary.totalBondedCacao != null ||
    summary.totalRewardCacao != null ||
    summary.providerCount != null ||
    summary.nodeCount != null ||
    (summary.nodes?.length ?? 0) > 0;

  return hasData ? summary : null;
}

function normalizeCacaoPoolHistoryResponse(
  payload: unknown,
): CacaoPoolHistoryEntry[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord) as CacaoPoolHistoryEntry[];
  }

  if (isRecord(payload) && Array.isArray(payload.history)) {
    return payload.history.filter(isRecord) as CacaoPoolHistoryEntry[];
  }

  return [];
}

function normalizeCacaoPoolStatsResponse(payload: unknown): CacaoPoolStats {
  if (isRecord(payload?.global)) {
    return payload.global as CacaoPoolStats;
  }

  if (isRecord(payload)) {
    return payload as CacaoPoolStats;
  }

  return {};
}

function normalizeILSummaryResponse(payload: unknown): ILSummaryAggregated {
  if (isRecord(payload) && isRecord(payload.totals)) {
    const totals = payload.totals;
    const positions = Array.isArray(payload.positions)
      ? payload.positions.filter(isRecord)
      : [];

    let totalIlLossUsd = 0;
    let totalIlpEligibleUsd = 0;
    let hasDetailedPositions = false;

    for (const position of positions) {
      const impermanentLoss = isRecord(position.impermanentLoss)
        ? position.impermanentLoss
        : null;
      const protection = isRecord(position.protection)
        ? position.protection
        : null;

      if (impermanentLoss || protection) {
        hasDetailedPositions = true;
      }

      const ilAmountUsd =
        readNumericField(impermanentLoss ?? {}, ["amountUSD", "amount_usd"]) ??
        0;

      if (ilAmountUsd > 0) {
        totalIlLossUsd += ilAmountUsd;
      }

      totalIlpEligibleUsd +=
        readNumericField(protection ?? {}, [
          "eligibleAmountUSD",
          "eligible_amount_usd",
        ]) ?? 0;
    }

    return {
      total_hodl_value_usd:
        readNumericField(totals, [
          "totalHodlValueUSD",
          "total_hodl_value_usd",
        ]) ?? 0,
      total_current_value_usd:
        readNumericField(totals, [
          "totalCurrentValueUSD",
          "total_current_value_usd",
        ]) ?? 0,
      total_il_amount_usd: hasDetailedPositions
        ? totalIlLossUsd
        : (readNumericField(totals, [
            "totalILAmountUSD",
            "total_il_amount_usd",
          ]) ?? 0),
      total_ilp_eligible_usd: hasDetailedPositions
        ? totalIlpEligibleUsd
        : (readNumericField(totals, [
            "totalILPEligibleUSD",
            "total_ilp_eligible_usd",
          ]) ?? 0),
      position_count:
        positions.length ||
        readNumericField(payload, ["position_count", "positionCount"]) ||
        0,
    };
  }

  if (isRecord(payload)) {
    return {
      total_hodl_value_usd:
        readNumericField(payload, [
          "total_hodl_value_usd",
          "totalHodlValueUSD",
        ]) ?? 0,
      total_current_value_usd:
        readNumericField(payload, [
          "total_current_value_usd",
          "totalCurrentValueUSD",
        ]) ?? 0,
      total_il_amount_usd:
        readNumericField(payload, [
          "total_il_amount_usd",
          "totalILAmountUSD",
        ]) ?? 0,
      total_ilp_eligible_usd:
        readNumericField(payload, [
          "total_ilp_eligible_usd",
          "totalILPEligibleUSD",
        ]) ?? 0,
      position_count:
        readNumericField(payload, ["position_count", "positionCount"]) ?? 0,
    };
  }

  return {
    total_hodl_value_usd: 0,
    total_current_value_usd: 0,
    total_il_amount_usd: 0,
    total_ilp_eligible_usd: 0,
    position_count: 0,
  };
}

function normalizeTokenRewardsResponse(
  payload: unknown,
): MayaTokenRewardsResponse {
  const rewards =
    isRecord(payload) && Array.isArray(payload.rewards)
      ? payload.rewards.filter(isRecord).map((entry) => ({
          amount: typeof entry.amount === "string" ? entry.amount : "0",
          block_height:
            typeof entry.block_height === "number" &&
            Number.isFinite(entry.block_height)
              ? entry.block_height
              : 0,
          block_time:
            typeof entry.block_time === "string" ? entry.block_time : "",
        }))
      : [];

  return {
    address:
      isRecord(payload) && typeof payload.address === "string"
        ? payload.address
        : "",
    total_cacao:
      isRecord(payload) && typeof payload.total_cacao === "string"
        ? payload.total_cacao
        : "0",
    distribution_count:
      isRecord(payload) &&
      typeof payload.distribution_count === "number" &&
      Number.isFinite(payload.distribution_count)
        ? payload.distribution_count
        : rewards.length,
    rewards,
  };
}

export async function fetchCacaotrackerJson<T>(
  path: string,
  options: CacaotrackerDependencies & {
    cacheBucket?: CacheBucket;
    cacheTtlMs?: number;
    method?: "GET" | "POST";
    body?: BodyInit;
    headers?: HeadersInit;
    query?: Record<string, string | number | null | undefined>;
  } = {},
): Promise<T> {
  const apiKey = options.apiKey ?? readServerEnv("CACAOTRACKER_API_KEY");
  if (!apiKey?.trim()) {
    throw new CacaotrackerApiError(
      "CACAOTRACKER_API_KEY is not configured on the server.",
      500,
    );
  }

  const url = buildCacaotrackerUrl(
    path,
    options.query,
    options.baseUrl ?? readServerEnv("CACAOTRACKER_API_BASE_URL"),
  );
  const now = options.now ?? Date.now;
  const ttl =
    options.method && options.method !== "GET"
      ? 0
      : (options.cacheTtlMs ??
        (options.cacheBucket ? CACHE_TTL_MS[options.cacheBucket] : 0));
  const cacheKey = ttl > 0 ? `${options.cacheBucket ?? "default"}:${url}` : "";
  const cached = ttl > 0 ? responseCache.get(cacheKey) : undefined;

  if (cached && cached.expiresAt > now()) {
    return (await cached.value) as T;
  }

  const fetchPromise = (async () => {
    const response = await resolveFetchImplementation(options.fetchImpl)(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
      ...(options.body ? { body: options.body } : {}),
    });

    if (!response.ok) {
      throw new CacaotrackerApiError(
        await readUpstreamErrorMessage(response),
        response.status,
      );
    }

    return (await response.json()) as T;
  })();

  if (ttl > 0) {
    responseCache.set(cacheKey, {
      expiresAt: now() + ttl,
      value: fetchPromise,
    });
  }

  try {
    return await fetchPromise;
  } catch (error) {
    if (ttl > 0) {
      responseCache.delete(cacheKey);
    }
    throw error;
  }
}

export async function fetchOptionalCacaotrackerJson<T>(
  path: string,
  options: Parameters<typeof fetchCacaotrackerJson<T>>[1] = {},
): Promise<T | null> {
  try {
    return await fetchCacaotrackerJson<T>(path, options);
  } catch {
    return null;
  }
}

function normalizeRewardsByPool(payload: unknown): PoolReward[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord) as PoolReward[];
  }

  if (isRecord(payload) && Array.isArray(payload.byPool)) {
    return payload.byPool.filter(isRecord) as PoolReward[];
  }

  return [];
}

async function resolvePoolILAnalysis(
  address: string,
  pool: string,
  dependencies: CacaotrackerDependencies,
): Promise<ILAnalysis | null> {
  const encodedAddress = encodeURIComponent(address);
  const encodedPool = encodeURIComponent(pool);
  const direct = await fetchOptionalCacaotrackerJson<ILAnalysis>(
    `/il/${encodedAddress}/${encodedPool}`,
    {
      ...dependencies,
      cacheBucket: "liquidity",
    },
  );

  if (direct) {
    return direct;
  }

  const aggregate = await fetchOptionalCacaotrackerJson<ILSummary>(
    `/il/${encodedAddress}`,
    {
      ...dependencies,
      cacheBucket: "liquidity",
    },
  );
  if (!aggregate?.positions?.length) {
    return null;
  }

  const normalizedPool = pool.toUpperCase();
  return (
    aggregate.positions.find(
      (entry) => entry.pool.toUpperCase() === normalizedPool,
    ) ?? null
  );
}

async function fetchRewardsByPool(
  address: string,
  dependencies: CacaotrackerDependencies,
): Promise<PoolReward[]> {
  const encodedAddress = encodeURIComponent(address);
  const rewardsQuery = {
    ...dependencies,
    cacheBucket: "liquidity" as const,
    query: { days: 30 },
  };

  let rewards = normalizeRewardsByPool(
    await fetchOptionalCacaotrackerJson<unknown>(
      `/rewards/${encodedAddress}/by-pool`,
      rewardsQuery,
    ),
  );

  if (rewards.length > 0) {
    return rewards;
  }

  const syncStatus = await fetchOptionalCacaotrackerJson<SyncStatus>(
    `/rewards/${encodedAddress}/sync-status`,
    {
      ...dependencies,
      cacheBucket: "liquidity",
    },
  );

  if (!syncStatus?.synced) {
    await fetchOptionalCacaotrackerJson(`/rewards/${encodedAddress}/sync`, {
      ...dependencies,
      method: "POST",
      body: JSON.stringify({ days: 30 }),
    });

    rewards = normalizeRewardsByPool(
      await fetchOptionalCacaotrackerJson<unknown>(
        `/rewards/${encodedAddress}/by-pool`,
        rewardsQuery,
      ),
    );

    if (rewards.length > 0) {
      return rewards;
    }
  }

  const comprehensive =
    await fetchOptionalCacaotrackerJson<AddressRewardsResponse>(
      `/rewards/${encodedAddress}`,
      rewardsQuery,
    );

  return normalizeRewardsByPool(comprehensive?.byPool);
}

export function getRequestPathSegments(request: Request): string[] {
  return new URL(request.url).pathname.split("/").filter(Boolean);
}

export function readPathSegment(
  request: Request,
  index: number,
  label: string,
): string {
  const value = getRequestPathSegments(request)[index];
  if (!value) {
    throw new CacaotrackerApiError(`Missing ${label} in request path.`, 400);
  }

  return decodeURIComponent(value);
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof CacaotrackerApiError) {
    return jsonResponse({ error: error.message }, { status: error.status });
  }

  return jsonResponse(
    {
      error:
        error instanceof Error
          ? error.message
          : "Failed to load CacaoTracker data.",
    },
    { status: 502 },
  );
}

export function createNodeHandler(
  getResponse: (request: Request) => Promise<Response>,
) {
  return createNodeRouteHandler({
    GET: getResponse,
  });
}

export function createNodeRouteHandler(handlers: {
  GET?: (request: Request) => Promise<Response>;
  POST?: (request: Request) => Promise<Response>;
}) {
  return async function handler(
    req: IncomingMessage & {
      url?: string;
      method?: string;
      headers: Record<string, string | string[] | undefined>;
    },
    res: ServerResponse,
  ) {
    const method = req.method ?? "GET";
    const normalizedMethod = method.toUpperCase();
    const routeHandler =
      normalizedMethod === "GET"
        ? handlers.GET
        : normalizedMethod === "POST"
          ? handlers.POST
          : undefined;

    if (!routeHandler) {
      const allow = Object.entries(handlers)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
        .join(", ");
      const response = jsonResponse(
        { error: `Method ${method} not allowed.` },
        {
          status: 405,
          headers: {
            Allow: allow || "GET",
          },
        },
      );
      await writeNodeResponse(res, response);
      return;
    }

    const originHeader = req.headers.host
      ? `https://${req.headers.host}`
      : "http://localhost";
    const body =
      normalizedMethod === "POST" ? await readNodeRequestBody(req) : undefined;
    const request = new Request(new URL(req.url ?? "/", originHeader), {
      method: normalizedMethod,
      ...(body !== undefined ? { body } : {}),
    });
    await writeNodeResponse(res, await routeHandler(request));
  };
}

async function writeNodeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function readNodeRequestBody(
  req: IncomingMessage,
): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }

  if (!chunks.length) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

export async function fetchWalletSummary(
  address: string,
  dependencies: CacaotrackerDependencies = {},
): Promise<WalletSummaryResponse> {
  const encodedAddress = encodeURIComponent(address);
  const [rewards, syncStatus] = await Promise.all([
    fetchCacaotrackerJson<AddressRewardsResponse>(
      `/rewards/${encodedAddress}`,
      {
        ...dependencies,
        cacheBucket: "wallet",
      },
    ),
    fetchCacaotrackerJson<SyncStatus>(
      `/rewards/${encodedAddress}/sync-status`,
      {
        ...dependencies,
        cacheBucket: "wallet",
      },
    ).catch(() => null),
  ]);

  return { rewards, syncStatus };
}

export function fetchWalletActivity(
  address: string,
  dependencies: CacaotrackerDependencies = {},
): Promise<WalletActivityResponse> {
  const encodedAddress = encodeURIComponent(address);
  return fetchCacaotrackerJson<EnhancedActionsResponse>(
    `/enhanced-actions/${encodedAddress}`,
    {
      ...dependencies,
      cacheBucket: "wallet",
    },
  );
}

export function createTxTrackerSession(
  dependencies: CacaotrackerDependencies = {},
): Promise<{
  wsUrl: string;
  expiresAt: string;
  heartbeatSeconds: number;
}> {
  return fetchCacaotrackerJson("/tx-tracker/session", {
    ...dependencies,
    method: "POST",
  });
}

export async function fetchLiquiditySummary(
  address: string,
  dependencies: CacaotrackerDependencies = {},
): Promise<LiquiditySummaryResponse> {
  const encodedAddress = encodeURIComponent(address);

  fetchCacaotrackerJson("/il/track", {
    ...dependencies,
    method: "POST",
    body: JSON.stringify({ address }),
  }).catch(() => undefined);

  const [ilPayload, rewardsByPool] = await Promise.all([
    fetchCacaotrackerJson<ILSummary>(`/il/${encodedAddress}`, {
      ...dependencies,
      cacheBucket: "liquidity",
    }),
    fetchRewardsByPool(address, dependencies),
  ]);

  return {
    ilSummary: normalizeILSummaryResponse(ilPayload),
    rewardsByPool,
  };
}

export async function fetchLiquidityPoolDetail(
  address: string,
  pool: string,
  dependencies: CacaotrackerDependencies = {},
): Promise<LiquidityPoolDetailResponse> {
  const encodedAddress = encodeURIComponent(address);
  const encodedPool = encodeURIComponent(pool);
  const [
    analyticsPayload,
    metricsHistory,
    tvlHistory,
    volumeHistory,
    comparisonSet,
    ilAnalysis,
    ilHistory,
  ] = await Promise.all([
    fetchOptionalCacaotrackerJson<PoolAnalytics>(
      `/pool-analytics/${encodedPool}`,
      {
        ...dependencies,
        cacheBucket: "liquidity",
      },
    ),
    fetchOptionalCacaotrackerJson<PoolMetrics[]>(
      `/pool-analytics/${encodedPool}/metrics/history`,
      {
        ...dependencies,
        cacheBucket: "liquidity",
        query: { days: 30 },
      },
    ),
    fetchOptionalCacaotrackerJson<PoolTVLHistory[]>(
      `/pool-analytics/${encodedPool}/tvl`,
      {
        ...dependencies,
        cacheBucket: "liquidity",
        query: { days: 30 },
      },
    ),
    fetchOptionalCacaotrackerJson<PoolVolumeHourly[]>(
      `/pool-analytics/${encodedPool}/volume`,
      {
        ...dependencies,
        cacheBucket: "liquidity",
        query: { hours: 24 },
      },
    ),
    fetchOptionalCacaotrackerJson<PoolComparisonResult[]>(
      "/pool-analytics/compare",
      {
        ...dependencies,
        cacheBucket: "liquidity",
        query: { days: 30 },
      },
    ),
    resolvePoolILAnalysis(address, pool, dependencies),
    fetchOptionalCacaotrackerJson<ILHistoryResponse>(
      `/il/${encodedAddress}/${encodedPool}/history`,
      {
        ...dependencies,
        cacheBucket: "liquidity",
        query: { days: 30 },
      },
    ),
  ]);

  return {
    analytics: analyticsPayload,
    metricsHistory: metricsHistory ?? [],
    tvlHistory: tvlHistory ?? [],
    volumeHistory: volumeHistory ?? [],
    comparison:
      (comparisonSet ?? []).find(
        (entry) => entry.pool.toUpperCase() === pool.toUpperCase(),
      ) ?? null,
    ilAnalysis,
    ilHistory: ilHistory?.history ?? [],
  };
}

export async function fetchCacaoPoolDetail(
  address: string,
  dependencies: CacaotrackerDependencies = {},
): Promise<CacaoPoolDetailResponse> {
  const encodedAddress = encodeURIComponent(address);
  const [apy, historyPayload, statsPayload, tokenRewardsPayload] =
    await Promise.all([
      fetchCacaotrackerJson<CacaoPoolApyResponse>(
        `/cacao/apy/${encodedAddress}`,
        {
          ...dependencies,
          cacheBucket: "cacaoPool",
        },
      ),
      fetchCacaotrackerJson<unknown>(`/cacao/history/${encodedAddress}`, {
        ...dependencies,
        cacheBucket: "cacaoPool",
      }).catch(() => []),
      fetchCacaotrackerJson<unknown>("/cacao/stats", {
        ...dependencies,
        cacheBucket: "cacaoPool",
      }).catch(() => ({})),
      fetchCacaotrackerJson<unknown>(`/maya/token-rewards/${encodedAddress}`, {
        ...dependencies,
        cacheBucket: "cacaoPool",
      }).catch(() => ({})),
    ]);

  return {
    apy,
    history: normalizeCacaoPoolHistoryResponse(historyPayload),
    stats: normalizeCacaoPoolStatsResponse(statsPayload),
    tokenRewards: normalizeTokenRewardsResponse(tokenRewardsPayload),
  };
}

export async function fetchPooledNodesDetail(
  address: string,
  dependencies: CacaotrackerDependencies = {},
): Promise<PooledNodesDetailResponse> {
  const encodedAddress = encodeURIComponent(address);
  const providerBond = normalizeBondProviderResponse(
    await fetchCacaotrackerJson<unknown>(`/bond/provider/${encodedAddress}`, {
      ...dependencies,
      cacheBucket: "pooledNodes",
    }).catch(() => null),
  );

  return { providerBond };
}

export async function fetchMayaTokenRewards(
  address: string,
  dependencies: CacaotrackerDependencies = {},
): Promise<MayaTokenRewardsResponse> {
  const encodedAddress = encodeURIComponent(address);
  const payload = await fetchCacaotrackerJson<unknown>(
    `/maya/token-rewards/${encodedAddress}`,
    {
      ...dependencies,
      cacheBucket: "wallet",
    },
  );

  return normalizeTokenRewardsResponse(payload);
}

export function fetchProtocolDashboard(
  dependencies: CacaotrackerDependencies = {},
): Promise<ProtocolDashboardResponse> {
  return fetchCacaotrackerJson<ProtocolDashboardResponse>(
    "/protocol/dashboard",
    {
      ...dependencies,
      cacheBucket: "protocol",
    },
  );
}
