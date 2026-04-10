export type MayaNameAlias = {
  chain: string;
  address: string;
};

export type MayaNameSubaffiliate = {
  name: string;
  shareBps: string;
  affiliateBps?: string;
  expire?: string;
};

export type MayaNameRecord = {
  name?: string;
  expire_block_height?: number | string;
  owner?: string;
  preferred_asset?: string;
  affiliate_collector_cacao?: string;
  aliases?: MayaNameAlias[];
  affiliate_bps?: number | string;
  [key: string]: unknown;
};

export type MidgardMayaNameLookupRecord = {
  owner?: string;
  registration_block?: string;
  expire?: string;
  preferred_asset?: string;
  affiliate_bps?: string;
  entries?: MayaNameAlias[];
  sub_affiliates?: Array<{
    name?: string;
    share_bps?: string;
    affiliate_bps?: string;
    expire?: string;
  }>;
};

export type ManagedMayaNameRecord = {
  name: string;
  owner: string;
  registrationBlock: string;
  expireBlockHeight: string;
  preferredAsset: string;
  affiliateCollectorCacao: string;
  affiliateBps: string;
  aliases: MayaNameAlias[];
  mayaAliasAddress: string;
  subaffiliates: MayaNameSubaffiliate[];
};

export type MayaNamePricing = {
  registerFeeBaseUnits: string;
  feePerBlockBaseUnits: string;
  currentBlockHeight: string;
};

export type MayaNameActionDraft = {
  name: string;
  owner?: string;
  aliasChain?: string;
  aliasAddress?: string;
  preferredAsset?: string;
  expiryBlockHeight?: string | number;
  affiliateBps?: string | number;
  subaffiliates?: Array<{
    name: string;
    shareBps: string | number;
  }>;
};

export type MayaNameServiceOptions = {
  fetch?: typeof fetch;
  mayanodeUrl?: string;
  midgardUrl?: string;
};

export type MayaNameValidationResult =
  | {
      status: "valid";
      name: string;
      record: MayaNameRecord;
    }
  | {
      status: "invalid";
      name: string;
      reason: string;
    }
  | {
      status: "unreachable";
      name: string;
      reason: string;
    };

export const DEFAULT_MAYANODE_URL = "https://mayanode.mayachain.info";
export const DEFAULT_MIDGARD_URL = "https://midgard.mayachain.info";
export const MAYA_NAME_BLOCKS_PER_YEAR = 5_256_000;
export const MAYA_NAME_UPDATE_AMOUNT_BASE_UNITS = "1000000000";

const validationCache = new Map<string, Promise<MayaNameValidationResult>>();

export async function validateMayaName(
  name: string,
  mayanodeUrl: string,
  fetchImpl?: typeof fetch,
): Promise<MayaNameValidationResult> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return {
      status: "invalid",
      name: "",
      reason: "MAYAName is required.",
    };
  }

  const cacheKey = `${normalizeUrl(mayanodeUrl || DEFAULT_MAYANODE_URL)}::${trimmedName}`;
  const cached = validationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const request = runMayaNameValidation(trimmedName, mayanodeUrl, fetchImpl);
  validationCache.set(cacheKey, request);

  const result = await request;
  if (result.status === "unreachable") {
    validationCache.delete(cacheKey);
  }

  return result;
}

export function clearMayaNameValidationCache() {
  validationCache.clear();
}

export async function fetchOwnedMayaNames(
  ownerAddress: string,
  options: MayaNameServiceOptions = {},
): Promise<string[]> {
  const trimmedAddress = ownerAddress.trim();
  if (!trimmedAddress) {
    return [];
  }

  const response = await resolveFetchImpl(options.fetch)(
    `${normalizeUrl(options.midgardUrl || DEFAULT_MIDGARD_URL)}/v2/mayaname/owner/${encodeURIComponent(trimmedAddress)}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed to load owned MAYANames (${response.status}).`);
  }

  const payload = (await response.json()) as unknown;
  return Array.isArray(payload)
    ? payload.filter((value): value is string => typeof value === "string")
    : [];
}

export async function fetchManagedMayaName(
  name: string,
  options: MayaNameServiceOptions = {},
): Promise<ManagedMayaNameRecord> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("MAYAName is required.");
  }

  const [mayanodeRecord, lookupRecord] = await Promise.all([
    fetchMayaNodeMayaName(trimmedName, options),
    fetchMidgardMayaNameLookup(trimmedName, options),
  ]);

  return normalizeManagedMayaName(trimmedName, mayanodeRecord, lookupRecord);
}

export async function fetchMayaNamePricing(
  options: MayaNameServiceOptions = {},
): Promise<MayaNamePricing> {
  const [mimir, lastBlock] = await Promise.all([
    fetchJson<Record<string, unknown>>(
      `${normalizeUrl(options.mayanodeUrl || DEFAULT_MAYANODE_URL)}/mayachain/mimir`,
      options.fetch,
      "Failed to load MAYAName pricing",
    ),
    fetchJson<Array<{ mayachain?: number | string }>>(
      `${normalizeUrl(options.mayanodeUrl || DEFAULT_MAYANODE_URL)}/mayachain/lastblock`,
      options.fetch,
      "Failed to load MayaChain block height",
    ),
  ]);

  const currentBlockHeight = String(
    lastBlock
      .map((entry) => Number(entry.mayachain ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((highest, value) => Math.max(highest, value), 0),
  );

  return {
    registerFeeBaseUnits: String(mimir.TNSREGISTERFEE ?? "0"),
    feePerBlockBaseUnits: String(
      mimir.TNSFEEPERBLOCK ?? mimir.tns_fee_per_block_rune ?? "0",
    ),
    currentBlockHeight,
  };
}

export function normalizeManagedMayaName(
  fallbackName: string,
  mayanodeRecord: MayaNameRecord,
  lookupRecord: MidgardMayaNameLookupRecord,
): ManagedMayaNameRecord {
  const aliases = mergeAliases(mayanodeRecord.aliases, lookupRecord.entries);
  const mayaAliasAddress =
    aliases.find((alias) => alias.chain === "MAYA")?.address ?? "";

  return {
    name: normalizeName(mayanodeRecord.name ?? fallbackName),
    owner: firstNonEmpty(mayanodeRecord.owner, lookupRecord.owner),
    registrationBlock: String(lookupRecord.registration_block ?? ""),
    expireBlockHeight: String(
      mayanodeRecord.expire_block_height ?? lookupRecord.expire ?? "",
    ),
    preferredAsset: firstNonEmpty(
      mayanodeRecord.preferred_asset,
      lookupRecord.preferred_asset,
    ),
    affiliateCollectorCacao: String(
      mayanodeRecord.affiliate_collector_cacao ?? "0",
    ),
    affiliateBps: String(
      lookupRecord.affiliate_bps ?? mayanodeRecord.affiliate_bps ?? "0",
    ),
    aliases,
    mayaAliasAddress,
    subaffiliates: normalizeSubaffiliates(lookupRecord.sub_affiliates),
  };
}

export function buildRegisterMayaNameMemo(draft: MayaNameActionDraft): string {
  return buildMayaNameMemo({
    name: draft.name,
    aliasChain: draft.aliasChain,
    aliasAddress: draft.aliasAddress,
    owner: draft.owner,
    preferredAsset: draft.preferredAsset,
    affiliateBps: draft.affiliateBps,
    subaffiliates: draft.subaffiliates,
  });
}

export function buildAliasUpdateMayaNameMemo(draft: {
  name: string;
  aliasChain: string;
  aliasAddress: string;
}): string {
  return buildMayaNameMemo({
    name: draft.name,
    aliasChain: draft.aliasChain,
    aliasAddress: draft.aliasAddress,
  });
}

export function buildReferralProfileMayaNameMemo(draft: {
  name: string;
  preferredAsset?: string;
  affiliateBps?: string | number;
  subaffiliates?: Array<{
    name: string;
    shareBps: string | number;
  }>;
}): string {
  return buildMayaNameMemo({
    name: draft.name,
    preferredAsset: draft.preferredAsset,
    affiliateBps: draft.affiliateBps,
    subaffiliates: draft.subaffiliates,
  });
}

export function buildRenewMayaNameMemo(input: {
  name: string;
  mayaAddress: string;
}): string {
  return ["~", input.name.trim(), "MAYA", input.mayaAddress.trim()].join(":");
}

export function buildMayaNameMemo(draft: MayaNameActionDraft): string {
  const subaffiliates = normalizeActionSubaffiliates(draft.subaffiliates);
  const segments = [
    "~",
    draft.name.trim(),
    normalizeOptionalSegment(draft.aliasChain),
    normalizeOptionalSegment(draft.aliasAddress),
    normalizeOptionalSegment(draft.owner),
    normalizeOptionalSegment(draft.preferredAsset),
    normalizeOptionalSegment(draft.expiryBlockHeight),
    normalizeOptionalSegment(draft.affiliateBps),
    subaffiliates.map((item) => item.name).join("/"),
    subaffiliates.map((item) => item.shareBps).join("/"),
  ];

  return segments.join(":");
}

export function calculateMayaNameExpiryBlock(
  pricing: MayaNamePricing,
  requestedBlocks: bigint | number,
): string {
  return (
    BigInt(pricing.currentBlockHeight || "0") + normalizeRequestedBlocks(requestedBlocks)
  ).toString();
}

export function calculateRegisterMayaNameAmountBaseUnits(
  pricing: MayaNamePricing,
  requestedBlocks: bigint | number,
): string {
  const normalizedBlocks = normalizeRequestedBlocks(requestedBlocks);
  return (
    BigInt(pricing.registerFeeBaseUnits || "0") +
    BigInt(pricing.feePerBlockBaseUnits || "0") * normalizedBlocks
  ).toString();
}

export function calculateRenewMayaNameAmountBaseUnits(
  pricing: MayaNamePricing,
  requestedBlocks: bigint | number,
): string {
  return (
    BigInt(pricing.feePerBlockBaseUnits || "0") *
    normalizeRequestedBlocks(requestedBlocks)
  ).toString();
}

export function buildMayaNameReferralHref(origin: string, name: string): string {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  return `${trimmedOrigin}/swap?ref=${encodeURIComponent(name.trim())}`;
}

async function runMayaNameValidation(
  name: string,
  mayanodeUrl: string,
  fetchImpl?: typeof fetch,
): Promise<MayaNameValidationResult> {
  try {
    const record = await fetchMayaNodeMayaName(name, {
      fetch: fetchImpl,
      mayanodeUrl,
    });
    return {
      status: "valid",
      name: normalizeName(record.name ?? name),
      record,
    };
  } catch (error) {
    if (error instanceof MayaNameInvalidError) {
      return {
        status: "invalid",
        name,
        reason: error.message,
      };
    }

    return {
      status: "unreachable",
      name,
      reason:
        error instanceof Error
          ? error.message
          : "MAYAName lookup is currently unavailable.",
    };
  }
}

async function fetchMayaNodeMayaName(
  name: string,
  options: MayaNameServiceOptions,
): Promise<MayaNameRecord> {
  const lookupUrl = `${normalizeUrl(options.mayanodeUrl || DEFAULT_MAYANODE_URL)}/mayachain/mayaname/${encodeURIComponent(name)}`;
  const response = await resolveFetchImpl(options.fetch)(lookupUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    const reason = await readErrorMessage(response, `${name} is not a valid MAYAName.`);
    throw new MayaNameInvalidError(reason);
  }

  if (!response.ok) {
    throw new Error(`MAYAName lookup failed with status ${response.status}.`);
  }

  return (await response.json()) as MayaNameRecord;
}

async function fetchMidgardMayaNameLookup(
  name: string,
  options: MayaNameServiceOptions,
): Promise<MidgardMayaNameLookupRecord> {
  return fetchJson<MidgardMayaNameLookupRecord>(
    `${normalizeUrl(options.midgardUrl || DEFAULT_MIDGARD_URL)}/v2/mayaname/lookup/${encodeURIComponent(name)}`,
    options.fetch,
    "Failed to load MAYAName lookup",
  );
}

async function fetchJson<T>(
  url: string,
  fetchImpl: typeof fetch | undefined,
  message: string,
): Promise<T> {
  const response = await resolveFetchImpl(fetchImpl)(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`${message} (${response.status}).`);
  }

  return (await response.json()) as T;
}

function mergeAliases(
  mayanodeAliases: MayaNameAlias[] | undefined,
  lookupAliases: MayaNameAlias[] | undefined,
): MayaNameAlias[] {
  const merged = new Map<string, MayaNameAlias>();

  for (const alias of [...(mayanodeAliases ?? []), ...(lookupAliases ?? [])]) {
    const chain = alias.chain?.trim().toUpperCase();
    const address = alias.address?.trim();
    if (!chain || !address) {
      continue;
    }
    merged.set(`${chain}:${address}`, { chain, address });
  }

  return [...merged.values()].sort((left, right) => left.chain.localeCompare(right.chain));
}

function normalizeSubaffiliates(
  subaffiliates: MidgardMayaNameLookupRecord["sub_affiliates"],
): MayaNameSubaffiliate[] {
  return (subaffiliates ?? [])
    .map((entry) => ({
      name: entry.name?.trim() ?? "",
      shareBps: String(entry.share_bps ?? "0"),
      affiliateBps:
        entry.affiliate_bps == null ? undefined : String(entry.affiliate_bps),
      expire: entry.expire,
    }))
    .filter((entry) => entry.name);
}

function normalizeActionSubaffiliates(
  subaffiliates: MayaNameActionDraft["subaffiliates"],
): Array<{ name: string; shareBps: string }> {
  return (subaffiliates ?? [])
    .map((entry) => ({
      name: entry.name.trim(),
      shareBps: String(entry.shareBps).trim(),
    }))
    .filter((entry) => entry.name && entry.shareBps !== "");
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error?.trim()) {
      return payload.error.trim();
    }
  } catch {
    // Ignore malformed payloads and fall back to a static message.
  }

  return fallback;
}

function normalizeName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeOptionalSegment(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    const normalized = normalizeOptionalSegment(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function normalizeRequestedBlocks(value: bigint | number): bigint {
  return typeof value === "bigint" ? value : BigInt(Math.max(0, Math.floor(value)));
}

function normalizeUrl(value: string): string {
  return (value || DEFAULT_MAYANODE_URL).replace(/\/+$/, "");
}

function resolveFetchImpl(customFetch?: typeof fetch): typeof fetch {
  if (customFetch) {
    return customFetch;
  }

  if (typeof fetch === "function") {
    return fetch.bind(globalThis);
  }

  throw new Error("No fetch implementation is available for MAYAName validation.");
}

class MayaNameInvalidError extends Error {}
