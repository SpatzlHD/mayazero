import {
  INTERFACE_AFFILIATE_MAYANAME,
  type AffiliateDraftLike,
  type SupportReferrerState,
} from "#/lib/swap-affiliates";
import type { JourneyAnalyticsContext, JourneySubject } from "./events";

export const TX_HASH_ALLOWED_SUBJECTS = new Set<JourneySubject>([
  "swap",
  "liquidity",
  "cacao_pool",
]);

export const MAYANAME_CONTEXT_SUBJECTS = new Set<JourneySubject>([
  "swap",
  "liquidity",
  "cacao_pool",
]);

export const MAX_JOURNEY_DURATION_MS = 30 * 60 * 1000;

const MAYANAME_PATTERN = /^[a-z0-9.]+$/;
const JOURNEY_ID_PATTERN = /^[0-9]+-[a-z0-9]+$/;
const TX_HASH_PATTERN = /^[0-9A-Za-zx]+$/;

export function allowsTxHash(subject: JourneySubject): boolean {
  return TX_HASH_ALLOWED_SUBJECTS.has(subject);
}

export function allowsMayaNameContext(subject: JourneySubject): boolean {
  return MAYANAME_CONTEXT_SUBJECTS.has(subject);
}

export function sanitizeAnalyticsMayaName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed.length > 64 ||
    trimmed.startsWith("0x") ||
    !MAYANAME_PATTERN.test(trimmed)
  ) {
    return null;
  }

  return trimmed;
}

export function isAllowedJourneyId(value: unknown): value is string {
  return typeof value === "string" && JOURNEY_ID_PATTERN.test(value);
}

export function isAllowedTxHash(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    TX_HASH_PATTERN.test(value)
  );
}

export function isAllowedDurationMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_JOURNEY_DURATION_MS
  );
}

export function resolvePrimaryAffiliateMayaName(
  affiliateDrafts: AffiliateDraftLike[],
): string {
  for (const draft of affiliateDrafts) {
    const candidate = sanitizeAnalyticsMayaName(draft.value);
    if (candidate) {
      return candidate;
    }
  }

  return INTERFACE_AFFILIATE_MAYANAME;
}

export function buildSwapAnalyticsContext(
  settings: SupportReferrerState,
  affiliateDrafts: AffiliateDraftLike[],
): Pick<JourneyAnalyticsContext, "referral_mayaname" | "affiliate_mayaname"> {
  const referral_mayaname = sanitizeAnalyticsMayaName(settings.referralMayaName);
  const affiliate_mayaname = resolvePrimaryAffiliateMayaName(affiliateDrafts);

  return {
    ...(referral_mayaname ? { referral_mayaname } : {}),
    affiliate_mayaname,
  };
}

export function buildLiquidityAnalyticsContext(): Pick<
  JourneyAnalyticsContext,
  "affiliate_mayaname"
> {
  return {
    affiliate_mayaname: INTERFACE_AFFILIATE_MAYANAME,
  };
}

export function buildCacaoPoolAnalyticsContext(): Pick<
  JourneyAnalyticsContext,
  "affiliate_mayaname"
> {
  return {
    affiliate_mayaname: INTERFACE_AFFILIATE_MAYANAME,
  };
}
