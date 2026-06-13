import { WalletChain as Chain } from "#/wallet/chain-types";
import { describe, expect, it } from "vitest";
import {
  clearStoredReferralMayaName,
  loadStoredSettings,
  persistSettings,
  setStoredReferralMayaName,
} from "./SettingsProvider";
import { DEFAULT_SUPPORT_REFERRER_BPS } from "#/lib/swap-affiliates";
import { syncAnalyticsOptOutPreference } from "#/analytics/runtime";

function createStorage(seed?: Record<string, string>) {
  const store = new Map(Object.entries(seed ?? {}));

  return {
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
}

describe("SettingsProvider helpers", () => {
  it("loads defaults with impersonation disabled", () => {
    expect(loadStoredSettings()).toMatchObject({
      impersonationEnabled: false,
      impersonationAddresses: {},
    });
  });

  it("loads persisted settings including the referral MAYAName", () => {
    const storage = createStorage({
      "maya-settings": JSON.stringify({
        mayanodeUrl: "https://mayanode.test",
        analyticsDisabled: true,
        referralMayaName: "friend",
        supportReferrerEnabled: true,
        supportReferrerBps: "25",
        supportReferrerForMayaName: "friend",
        impersonationEnabled: true,
        impersonationAddresses: {
          [Chain.MayaChain]: "maya1friendaddress0000000000",
          [Chain.Ethereum]: "0x000000000000000000000000000000000000dEaD",
        },
      }),
    });

    expect(loadStoredSettings(storage)).toMatchObject({
      mayanodeUrl: "https://mayanode.test",
      analyticsDisabled: true,
      referralMayaName: "friend",
      supportReferrerEnabled: true,
      supportReferrerBps: "25",
      supportReferrerForMayaName: "friend",
      impersonationEnabled: true,
      impersonationAddresses: {
        [Chain.MayaChain]: "maya1friendaddress0000000000",
        [Chain.Ethereum]: "0x000000000000000000000000000000000000dEaD",
      },
    });
  });

  it("disables invalid stored impersonation settings while preserving valid entries", () => {
    const storage = createStorage({
      "maya-settings": JSON.stringify({
        impersonationEnabled: true,
        impersonationAddresses: {
          [Chain.MayaChain]: "invalid",
          [Chain.Ethereum]: "0x000000000000000000000000000000000000dEaD",
        },
      }),
    });

    expect(loadStoredSettings(storage)).toMatchObject({
      impersonationEnabled: false,
      impersonationAddresses: {
        [Chain.MayaChain]: "invalid",
        [Chain.Ethereum]: "0x000000000000000000000000000000000000dEaD",
      },
    });
  });

  it("persists settings updates to storage", () => {
    const storage = createStorage();
    persistSettings(
      storage,
      setStoredReferralMayaName(
        {
          ...loadStoredSettings(storage),
          analyticsDisabled: true,
        },
        "alpha",
      ),
    );

    expect(JSON.parse(storage.getItem("maya-settings") ?? "{}")).toMatchObject({
      analyticsDisabled: true,
      referralMayaName: "alpha",
      supportReferrerEnabled: false,
      supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
      supportReferrerForMayaName: "alpha",
    });
  });

  it("clears the stored referral MAYAName", () => {
    expect(clearStoredReferralMayaName(
      setStoredReferralMayaName(loadStoredSettings(), "friend"),
    )).toMatchObject({
      referralMayaName: "",
      supportReferrerEnabled: false,
      supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
      supportReferrerForMayaName: "",
    });
  });

  it("resets remembered support when the stored referral changes", () => {
    expect(
      setStoredReferralMayaName(
        {
          ...loadStoredSettings(),
          referralMayaName: "alpha",
          supportReferrerEnabled: true,
          supportReferrerBps: "50",
          supportReferrerForMayaName: "alpha",
        },
        "beta",
      ),
    ).toMatchObject({
      referralMayaName: "beta",
      supportReferrerEnabled: false,
      supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
      supportReferrerForMayaName: "beta",
    });
  });

  it("preserves remembered support when the stored referral stays the same", () => {
    expect(
      setStoredReferralMayaName(
        {
          ...loadStoredSettings(),
          referralMayaName: "alpha",
          supportReferrerEnabled: true,
          supportReferrerBps: "50",
          supportReferrerForMayaName: "alpha",
        },
        "alpha",
      ),
    ).toMatchObject({
      referralMayaName: "alpha",
      supportReferrerEnabled: true,
      supportReferrerBps: "50",
      supportReferrerForMayaName: "alpha",
    });
  });

  it("drops legacy fee settings from stored state during load", () => {
    const storage = createStorage({
      "maya-settings": JSON.stringify({
        useZeroPercentFee: false,
        supportFeePercent: 0.5,
        interfaceSupportSwapEnabled: true,
        interfaceSupportSwapBps: "40",
        interfaceSupportBannerDismissed: true,
      }),
    });

    const loaded = loadStoredSettings(storage) as Record<string, unknown>;

    expect(loaded.useZeroPercentFee).toBeUndefined();
    expect(loaded.supportFeePercent).toBeUndefined();
    expect(loaded.interfaceSupportSwapEnabled).toBeUndefined();
    expect(loaded.interfaceSupportSwapBps).toBeUndefined();
    expect(loaded.interfaceSupportBannerDismissed).toBeUndefined();
  });

  it("syncs the Vercel opt-out flag into localStorage", () => {
    const storage = createStorage();

    syncAnalyticsOptOutPreference(storage, true);
    expect(storage.getItem("va-disable")).toBe("1");

    syncAnalyticsOptOutPreference(storage, false);
    expect(storage.getItem("va-disable")).toBeNull();
  });

  it("prefers an existing Vercel opt-out flag when loading settings", () => {
    const storage = createStorage({
      "va-disable": "1",
    });

    expect(loadStoredSettings(storage)).toMatchObject({
      analyticsDisabled: true,
    });
  });
});
