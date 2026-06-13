import { WalletChain as Chain } from "#/wallet/chain-types";
import { track } from "@vercel/analytics/react";
import {
  allowsMayaNameContext,
  allowsTxHash,
  isAllowedDurationMs,
  isAllowedJourneyId,
  isAllowedTxHash,
  sanitizeAnalyticsMayaName,
} from "./journey-enrichment";
import { trackOpenPanelEvent } from "./openpanel";
import {
  ANALYTICS_ROUTE_CHAIN,
  isAnalyticsEnabledInBrowser,
  isAnalyticsOptOutEnabled,
  normalizeAnalyticsRoute,
} from "./runtime";

const ANALYTICS_JOURNEY_ROUTES = new Set([
  "/swap",
  "/liquidity",
  "/cacao-pool",
  "/mayanames",
  "/vault-setup",
  ANALYTICS_ROUTE_CHAIN,
]);

const ANALYTICS_CHAIN_VALUES = new Set(
  Object.values(Chain).filter((value): value is Chain => typeof value === "string"),
);

const CHAIN_COUNT_BUCKETS = ["1", "2_3", "4_plus"] as const;
const JOURNEY_SUBJECTS = [
  "swap",
  "liquidity",
  "cacao_pool",
  "mayaname",
  "asset_send",
  "vault",
] as const;
const JOURNEY_ACTIONS = [
  "submit",
  "deposit",
  "withdraw",
  "register",
  "renew",
  "send",
  "fast_create",
  "fast_verify",
  "secure_create",
] as const;
const JOURNEY_STATUSES = [
  "success",
  "error",
  "cancelled",
  "unconfirmed",
  "submitted_no_hash",
] as const;
const JOURNEY_SOURCES = ["sdk", "extension", "fast-vault", "secure-vault"] as const;
const REFERRAL_OUTCOMES = [
  "stored",
  "replaced",
  "kept_current",
  "invalid",
  "unreachable",
] as const;

export type ChainCountBucket = (typeof CHAIN_COUNT_BUCKETS)[number];
export type JourneySubject = (typeof JOURNEY_SUBJECTS)[number];
export type JourneyAction = (typeof JOURNEY_ACTIONS)[number];
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];
export type JourneySource = (typeof JOURNEY_SOURCES)[number];
export type ReferralCaptureOutcome = (typeof REFERRAL_OUTCOMES)[number];
export type AnalyticsJourneyRoute =
  | "/swap"
  | "/liquidity"
  | "/cacao-pool"
  | "/mayanames"
  | "/vault-setup"
  | typeof ANALYTICS_ROUTE_CHAIN;

export type JourneyAnalyticsContext = {
  action: JourneyAction;
  route: AnalyticsJourneyRoute;
  subject: JourneySubject;
  has_referral?: boolean;
  referral_mayaname?: string;
  affiliate_mayaname?: string;
};

export type AnalyticsEvent =
  | {
      type: "wallet_connected";
      source: "sdk" | "extension";
      session_kind: "vault" | "extension";
      chain_count_bucket: ChainCountBucket;
    }
  | ({
      type: "journey_started";
      journey_id: string;
      chain?: Chain;
      route: AnalyticsJourneyRoute;
      source?: JourneySource;
    } & JourneyAnalyticsContext)
  | ({
      type: "journey_finished";
      journey_id: string;
      duration_ms: number;
      tx_hash?: string;
      chain?: Chain;
      route: AnalyticsJourneyRoute;
      source?: JourneySource;
      status: JourneyStatus;
    } & JourneyAnalyticsContext)
  | {
      type: "referral_capture";
      outcome: ReferralCaptureOutcome;
      had_existing_referral: boolean;
    };

export type AnalyticsProperties = Record<string, string | boolean | number>;

type SanitizedAnalyticsEvent = {
  name: AnalyticsEvent["type"];
  properties: AnalyticsProperties;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isAllowedString<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
): value is TValue {
  return typeof value === "string" && allowedValues.includes(value as TValue);
}

function isAllowedBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isAllowedChain(value: unknown): value is Chain {
  return typeof value === "string" && ANALYTICS_CHAIN_VALUES.has(value as Chain);
}

function isAllowedRoute(value: unknown): value is AnalyticsJourneyRoute {
  return (
    typeof value === "string" &&
    ANALYTICS_JOURNEY_ROUTES.has(normalizeAnalyticsRoute(value))
  );
}

function sanitizeJourneyMayaNameFields(
  event: Record<string, unknown>,
  subject: JourneySubject,
): Pick<AnalyticsProperties, "referral_mayaname" | "affiliate_mayaname"> | null {
  const hasReferralField = event.referral_mayaname !== undefined;
  const hasAffiliateField = event.affiliate_mayaname !== undefined;

  if (!hasReferralField && !hasAffiliateField) {
    return {};
  }

  if (!allowsMayaNameContext(subject)) {
    return null;
  }

  const referral_mayaname = hasReferralField
    ? sanitizeAnalyticsMayaName(event.referral_mayaname)
    : undefined;
  const affiliate_mayaname = hasAffiliateField
    ? sanitizeAnalyticsMayaName(event.affiliate_mayaname)
    : undefined;

  if (
    (hasReferralField && !referral_mayaname) ||
    (hasAffiliateField && !affiliate_mayaname)
  ) {
    return null;
  }

  return {
    ...(referral_mayaname ? { referral_mayaname } : {}),
    ...(affiliate_mayaname ? { affiliate_mayaname } : {}),
  };
}

function sanitizeJourneyContext(
  event: Record<string, unknown>,
): SanitizedAnalyticsEvent["properties"] | null {
  if (
    !isAllowedString(event.subject, JOURNEY_SUBJECTS) ||
    !isAllowedString(event.action, JOURNEY_ACTIONS) ||
    !isAllowedRoute(event.route) ||
    (event.source !== undefined &&
      !isAllowedString(event.source, JOURNEY_SOURCES)) ||
    (event.chain !== undefined && !isAllowedChain(event.chain)) ||
    (event.has_referral !== undefined && !isAllowedBoolean(event.has_referral))
  ) {
    return null;
  }

  const mayaNameFields = sanitizeJourneyMayaNameFields(event, event.subject);
  if (mayaNameFields === null) {
    return null;
  }

  return {
    subject: event.subject,
    action: event.action,
    route: normalizeAnalyticsRoute(event.route),
    ...(event.source ? { source: event.source } : {}),
    ...(event.chain ? { chain: event.chain } : {}),
    ...(event.has_referral !== undefined
      ? { has_referral: event.has_referral }
      : {}),
    ...mayaNameFields,
  };
}

function toVercelProperties(
  properties: AnalyticsProperties,
): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "number") {
      result[key] = String(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function toChainCountBucket(count: number): ChainCountBucket {
  if (count <= 1) {
    return "1";
  }

  if (count <= 3) {
    return "2_3";
  }

  return "4_plus";
}

export function sanitizeAnalyticsEvent(
  event: AnalyticsEvent | Record<string, unknown>,
): SanitizedAnalyticsEvent | null {
  if (!isObjectRecord(event) || typeof event.type !== "string") {
    return null;
  }

  switch (event.type) {
    case "wallet_connected": {
      if (
        !hasOnlyKeys(event, [
          "type",
          "source",
          "session_kind",
          "chain_count_bucket",
        ]) ||
        !isAllowedString(event.source, ["sdk", "extension"]) ||
        !isAllowedString(event.session_kind, ["vault", "extension"]) ||
        !isAllowedString(event.chain_count_bucket, CHAIN_COUNT_BUCKETS)
      ) {
        return null;
      }

      return {
        name: event.type,
        properties: {
          source: event.source,
          session_kind: event.session_kind,
          chain_count_bucket: event.chain_count_bucket,
        },
      };
    }
    case "journey_started": {
      if (
        !hasOnlyKeys(event, [
          "type",
          "journey_id",
          "subject",
          "action",
          "route",
          "source",
          "chain",
          "has_referral",
          "referral_mayaname",
          "affiliate_mayaname",
        ]) ||
        !isAllowedJourneyId(event.journey_id)
      ) {
        return null;
      }

      const context = sanitizeJourneyContext(event);
      if (!context) {
        return null;
      }

      return {
        name: event.type,
        properties: {
          journey_id: event.journey_id,
          ...context,
        },
      };
    }
    case "journey_finished": {
      if (
        !hasOnlyKeys(event, [
          "type",
          "journey_id",
          "duration_ms",
          "tx_hash",
          "subject",
          "action",
          "route",
          "status",
          "source",
          "chain",
          "has_referral",
          "referral_mayaname",
          "affiliate_mayaname",
        ]) ||
        !isAllowedJourneyId(event.journey_id) ||
        !isAllowedDurationMs(event.duration_ms) ||
        !isAllowedString(event.status, JOURNEY_STATUSES) ||
        (event.tx_hash !== undefined &&
          (!isAllowedTxHash(event.tx_hash) ||
            !allowsTxHash(event.subject as JourneySubject)))
      ) {
        return null;
      }

      const context = sanitizeJourneyContext(event);
      if (!context) {
        return null;
      }

      return {
        name: event.type,
        properties: {
          journey_id: event.journey_id,
          duration_ms: event.duration_ms,
          status: event.status,
          ...(event.tx_hash ? { tx_hash: event.tx_hash } : {}),
          ...context,
        },
      };
    }
    case "referral_capture": {
      if (
        !hasOnlyKeys(event, ["type", "outcome", "had_existing_referral"]) ||
        !isAllowedString(event.outcome, REFERRAL_OUTCOMES) ||
        !isAllowedBoolean(event.had_existing_referral)
      ) {
        return null;
      }

      return {
        name: event.type,
        properties: {
          outcome: event.outcome,
          had_existing_referral: event.had_existing_referral,
        },
      };
    }
    default:
      return null;
  }
}

export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  const sanitized = sanitizeAnalyticsEvent(event);
  if (
    !sanitized ||
    !isAnalyticsEnabledInBrowser() ||
    isAnalyticsOptOutEnabled()
  ) {
    return;
  }

  track(sanitized.name, toVercelProperties(sanitized.properties));
  trackOpenPanelEvent(sanitized.name, sanitized.properties);
}
