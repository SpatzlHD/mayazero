import { describe, expect, it } from "vitest";
import {
  ANALYTICS_OPT_OUT_STORAGE_KEY,
  ANALYTICS_ROUTE_CHAIN,
  getBrowserAnalyticsPrivacy,
  isAnalyticsOptOutEnabled,
  isAnalyticsRuntimeEnabled,
  sanitizeAnalyticsBeforeSend,
  sanitizeAnalyticsUrl,
  syncAnalyticsOptOutPreference,
} from "./runtime";

describe("analytics runtime helpers", () => {
  it("strips query strings and hashes from analytics URLs", () => {
    expect(
      sanitizeAnalyticsUrl("https://app.mayazero.test/swap?ref=friend#quote"),
    ).toBe("https://app.mayazero.test/swap");
    expect(sanitizeAnalyticsUrl("/liquidity?pool=ETH.ETH#details")).toBe(
      "/liquidity",
    );
  });

  it("normalizes chain detail routes before analytics payloads are sent", () => {
    expect(
      sanitizeAnalyticsUrl("https://app.mayazero.test/chains/ethereum?foo=bar"),
    ).toBe(`https://app.mayazero.test${ANALYTICS_ROUTE_CHAIN}`);
    expect(
      sanitizeAnalyticsBeforeSend({
        type: "pageview",
        url: "https://app.mayazero.test/chains/bitcoin#send",
      }),
    ).toEqual({
      type: "pageview",
      url: `https://app.mayazero.test${ANALYTICS_ROUTE_CHAIN}`,
    });
  });

  it("disables analytics outside production or when privacy and host rules fail", () => {
    expect(
      isAnalyticsRuntimeEnabled({
        isProduction: false,
        hostname: "mayazero.app",
        allowedHosts: "mayazero.app",
      }),
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEnabled({
        isProduction: true,
        hostname: "preview.mayazero.app",
        allowedHosts: "mayazero.app",
      }),
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEnabled({
        isProduction: true,
        hostname: "mayazero.app",
        allowedHosts: "mayazero.app",
        doNotTrack: "1",
      }),
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEnabled({
        isProduction: true,
        hostname: "mayazero.app",
        allowedHosts: "mayazero.app",
        globalPrivacyControl: true,
      }),
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEnabled({
        isProduction: true,
        hostname: "mayazero.app",
        allowedHosts: "mayazero.app",
        analyticsOptOut: true,
      }),
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEnabled({
        isProduction: true,
        hostname: "mayazero.app",
        allowedHosts: "mayazero.app",
      }),
    ).toBe(true);
  });

  it("reads browser privacy signals from navigator and window fallbacks", () => {
    expect(
      getBrowserAnalyticsPrivacy({
        navigatorLike: {
          doNotTrack: "1",
          globalPrivacyControl: true,
        },
      }),
    ).toEqual({
      doNotTrack: "1",
      globalPrivacyControl: true,
    });

    expect(
      getBrowserAnalyticsPrivacy({
        navigatorLike: {},
        windowLike: {
          doNotTrack: "yes",
        },
      }),
    ).toEqual({
      doNotTrack: "yes",
      globalPrivacyControl: false,
    });
  });

  it("reads and writes the Vercel analytics opt-out flag", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
    };

    expect(isAnalyticsOptOutEnabled(storage)).toBe(false);

    syncAnalyticsOptOutPreference(storage, true);
    expect(storage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY)).toBe("1");
    expect(isAnalyticsOptOutEnabled(storage)).toBe(true);

    syncAnalyticsOptOutPreference(storage, false);
    expect(storage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY)).toBeNull();
    expect(isAnalyticsOptOutEnabled(storage)).toBe(false);
  });
});
