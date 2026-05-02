import type {
  CacaotrackerTxTrackerMessage,
  CacaotrackerTxTrackerSessionResponse,
  CacaoPoolDetailResponse,
  CacaotrackerErrorResponse,
  LiquidityPoolDetailResponse,
  LiquiditySummaryResponse,
  MayaTokenRewardsResponse,
  PooledNodesDetailResponse,
  ProtocolDashboardResponse,
  WalletActivityResponse,
  WalletSummaryResponse,
} from "./cacaotracker-types";

type FetchLike = typeof fetch;

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

async function requestJson<T>(
  path: string,
  options: {
    fetchImpl?: FetchLike;
    method?: "GET" | "POST";
    body?: BodyInit;
    headers?: HeadersInit;
  } = {},
): Promise<T> {
  const response = await resolveFetchImplementation(options.fetchImpl)(path, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    ...(options.body ? { body: options.body } : {}),
  });

  if (!response.ok) {
    let message = `Failed to load CacaoTracker data (${response.status})`;

    try {
      const body = (await response.json()) as CacaotrackerErrorResponse;
      if (typeof body.error === "string" && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // Ignore response parsing failures and surface the generic message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function getJson<T>(path: string, fetchImpl?: FetchLike): Promise<T> {
  return requestJson(path, { fetchImpl });
}

export function fetchCacaotrackerWalletSummary(
  address: string,
  fetchImpl?: FetchLike,
): Promise<WalletSummaryResponse> {
  return getJson(
    `/api/cacaotracker/wallet/${encodeURIComponent(address)}/summary`,
    fetchImpl,
  );
}

export function fetchCacaotrackerWalletActivity(
  address: string,
  fetchImpl?: FetchLike,
): Promise<WalletActivityResponse> {
  return getJson(
    `/api/cacaotracker/wallet/${encodeURIComponent(address)}/activity`,
    fetchImpl,
  );
}

export function fetchCacaotrackerLiquiditySummary(
  address: string,
  fetchImpl?: FetchLike,
): Promise<LiquiditySummaryResponse> {
  return getJson(
    `/api/cacaotracker/liquidity/${encodeURIComponent(address)}/summary`,
    fetchImpl,
  );
}

export function fetchCacaotrackerLiquidityPoolDetail(
  address: string,
  pool: string,
  fetchImpl?: FetchLike,
): Promise<LiquidityPoolDetailResponse> {
  return getJson(
    `/api/cacaotracker/liquidity/${encodeURIComponent(address)}/pool/${encodeURIComponent(pool)}`,
    fetchImpl,
  );
}

export function fetchCacaotrackerCacaoPoolDetail(
  address: string,
  fetchImpl?: FetchLike,
): Promise<CacaoPoolDetailResponse> {
  return getJson(
    `/api/cacaotracker/cacao-pool/${encodeURIComponent(address)}`,
    fetchImpl,
  );
}

export function fetchCacaotrackerPooledNodesDetail(
  address: string,
  fetchImpl?: FetchLike,
): Promise<PooledNodesDetailResponse> {
  return getJson(
    `/api/cacaotracker/pooled-nodes/${encodeURIComponent(address)}`,
    fetchImpl,
  );
}

export function fetchCacaotrackerMayaTokenRewards(
  address: string,
  fetchImpl?: FetchLike,
): Promise<MayaTokenRewardsResponse> {
  return getJson(
    `/api/cacaotracker/maya-token/${encodeURIComponent(address)}`,
    fetchImpl,
  );
}

export function fetchCacaotrackerProtocolDashboard(
  fetchImpl?: FetchLike,
): Promise<ProtocolDashboardResponse> {
  return getJson("/api/cacaotracker/protocol/dashboard", fetchImpl);
}

export function createCacaotrackerTxTrackerSubscribeMessage(txHashes: string[]) {
  return JSON.stringify({
    type: "subscribe",
    txHashes,
  });
}

export function createCacaotrackerTxTrackerPingMessage() {
  return JSON.stringify({
    type: "ping",
  });
}

export function parseCacaotrackerTxTrackerMessage(
  payload: string,
): CacaotrackerTxTrackerMessage | null {
  try {
    return JSON.parse(payload) as CacaotrackerTxTrackerMessage;
  } catch {
    return null;
  }
}

export function fetchCacaotrackerTxTrackerSession(
  fetchImpl?: FetchLike,
): Promise<CacaotrackerTxTrackerSessionResponse> {
  return requestJson("/api/cacaotracker/tx-tracker/session", {
    fetchImpl,
    method: "POST",
  });
}
