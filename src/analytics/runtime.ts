import type { BeforeSendEvent } from "@vercel/analytics/react";

const TEST_ANALYTICS_ORIGIN = "https://analytics.mayazero.invalid";
export const ANALYTICS_OPT_OUT_STORAGE_KEY = "va-disable";

export const ANALYTICS_ROUTE_CHAIN = "/chains/:chainKey";

type AnalyticsNavigatorLike = {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  msDoNotTrack?: string | null;
};

type AnalyticsWindowLike = {
  doNotTrack?: string | null;
};

export function parseAnalyticsAllowedHosts(
  value: string | undefined,
): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function normalizeAnalyticsRoute(pathname: string): string {
  if (/^\/chains\/[^/]+$/u.test(pathname)) {
    return ANALYTICS_ROUTE_CHAIN;
  }

  return pathname || "/";
}

export function sanitizeAnalyticsUrl(
  url: string,
  baseOrigin = TEST_ANALYTICS_ORIGIN,
): string {
  try {
    const parsed = new URL(url, baseOrigin);
    const pathname = normalizeAnalyticsRoute(parsed.pathname);
    const isAbsolute = /^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(url);

    return isAbsolute ? `${parsed.origin}${pathname}` : pathname;
  } catch {
    const [pathOnly] = url.split(/[?#]/u);
    return normalizeAnalyticsRoute(pathOnly || "/");
  }
}

export function getBrowserAnalyticsPrivacy(input: {
  navigatorLike?: AnalyticsNavigatorLike;
  windowLike?: AnalyticsWindowLike;
}): {
  doNotTrack: string | null;
  globalPrivacyControl: boolean;
} {
  const doNotTrack =
    input.navigatorLike?.doNotTrack ??
    input.navigatorLike?.msDoNotTrack ??
    input.windowLike?.doNotTrack ??
    null;

  return {
    doNotTrack,
    globalPrivacyControl: input.navigatorLike?.globalPrivacyControl === true,
  };
}

export function isDoNotTrackEnabled(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "yes";
}

export function isAnalyticsRuntimeEnabled(input: {
  isProduction: boolean;
  hostname?: string | null;
  allowedHosts: Set<string> | string | undefined;
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  analyticsOptOut?: boolean;
}): boolean {
  if (!input.isProduction) {
    return false;
  }

  const allowedHosts =
    input.allowedHosts instanceof Set
      ? input.allowedHosts
      : parseAnalyticsAllowedHosts(input.allowedHosts);

  if (allowedHosts.size === 0) {
    return false;
  }

  const hostname = input.hostname?.trim().toLowerCase();
  if (!hostname || !allowedHosts.has(hostname)) {
    return false;
  }

  if (
    isDoNotTrackEnabled(input.doNotTrack) ||
    input.globalPrivacyControl === true ||
    input.analyticsOptOut === true
  ) {
    return false;
  }

  return true;
}

export function isAnalyticsEnabledInBrowser(env = import.meta.env): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const privacy = getBrowserAnalyticsPrivacy({
    navigatorLike: window.navigator,
    windowLike: window as AnalyticsWindowLike,
  });

  return isAnalyticsRuntimeEnabled({
    isProduction: env.PROD,
    hostname: window.location.hostname,
    allowedHosts: env.VITE_ANALYTICS_ALLOWED_HOSTS,
    doNotTrack: privacy.doNotTrack,
    globalPrivacyControl: privacy.globalPrivacyControl,
    analyticsOptOut: isAnalyticsOptOutEnabled(),
  });
}

export function isAnalyticsOptOutEnabled(
  storage?: Pick<Storage, "getItem">,
): boolean {
  try {
    const resolvedStorage =
      storage ??
      (typeof localStorage !== "undefined" ? localStorage : undefined);
    return resolvedStorage?.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function syncAnalyticsOptOutPreference(
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined,
  disabled: boolean,
): void {
  try {
    if (!storage) {
      return;
    }

    if (disabled) {
      storage.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "1");
      return;
    }

    storage.removeItem(ANALYTICS_OPT_OUT_STORAGE_KEY);
  } catch {
    // Ignored
  }
}

export function sanitizeAnalyticsBeforeSend(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  if (isAnalyticsOptOutEnabled()) {
    return null;
  }

  return {
    ...event,
    url: sanitizeAnalyticsUrl(event.url),
  };
}
