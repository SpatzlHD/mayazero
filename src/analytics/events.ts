import { Chain } from "@vultisig/sdk";
import { track } from "@vercel/analytics/react";
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
      chain?: Chain;
      route: AnalyticsJourneyRoute;
      source?: JourneySource;
    } & JourneyAnalyticsContext)
  | ({
      type: "journey_finished";
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

type AnalyticsProperties = Record<string, string | boolean>;

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
          "subject",
          "action",
          "route",
          "source",
          "chain",
          "has_referral",
        ]) ||
        !isAllowedString(event.subject, JOURNEY_SUBJECTS) ||
        !isAllowedString(event.action, JOURNEY_ACTIONS) ||
        !isAllowedRoute(event.route) ||
        (event.source !== undefined &&
          !isAllowedString(event.source, JOURNEY_SOURCES)) ||
        (event.chain !== undefined && !isAllowedChain(event.chain)) ||
        (event.has_referral !== undefined &&
          !isAllowedBoolean(event.has_referral))
      ) {
        return null;
      }

      return {
        name: event.type,
        properties: {
          subject: event.subject,
          action: event.action,
          route: normalizeAnalyticsRoute(event.route),
          ...(event.source ? { source: event.source } : {}),
          ...(event.chain ? { chain: event.chain } : {}),
          ...(event.has_referral !== undefined
            ? { has_referral: event.has_referral }
            : {}),
        },
      };
    }
    case "journey_finished": {
      if (
        !hasOnlyKeys(event, [
          "type",
          "subject",
          "action",
          "route",
          "status",
          "source",
          "chain",
          "has_referral",
        ]) ||
        !isAllowedString(event.subject, JOURNEY_SUBJECTS) ||
        !isAllowedString(event.action, JOURNEY_ACTIONS) ||
        !isAllowedRoute(event.route) ||
        !isAllowedString(event.status, JOURNEY_STATUSES) ||
        (event.source !== undefined &&
          !isAllowedString(event.source, JOURNEY_SOURCES)) ||
        (event.chain !== undefined && !isAllowedChain(event.chain)) ||
        (event.has_referral !== undefined &&
          !isAllowedBoolean(event.has_referral))
      ) {
        return null;
      }

      return {
        name: event.type,
        properties: {
          subject: event.subject,
          action: event.action,
          route: normalizeAnalyticsRoute(event.route),
          status: event.status,
          ...(event.source ? { source: event.source } : {}),
          ...(event.chain ? { chain: event.chain } : {}),
          ...(event.has_referral !== undefined
            ? { has_referral: event.has_referral }
            : {}),
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

  track(sanitized.name, sanitized.properties);
}
