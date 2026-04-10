import { describe, expect, it } from "vitest";
import {
  clearStoredReferralMayaName,
  loadStoredSettings,
  persistSettings,
  setStoredReferralMayaName,
} from "./SettingsProvider";
import { DEFAULT_SUPPORT_REFERRER_BPS } from "#/lib/swap-affiliates";

function createStorage(seed?: Record<string, string>) {
  const store = new Map(Object.entries(seed ?? {}));

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("SettingsProvider helpers", () => {
  it("loads persisted settings including the referral MAYAName", () => {
    const storage = createStorage({
      "maya-settings": JSON.stringify({
        mayanodeUrl: "https://mayanode.test",
        referralMayaName: "friend",
        supportReferrerEnabled: true,
        supportReferrerBps: "25",
        supportReferrerForMayaName: "friend",
        interfaceSupportSwapEnabled: true,
        interfaceSupportSwapBps: "40",
        interfaceSupportBannerDismissed: true,
      }),
    });

    expect(loadStoredSettings(storage)).toMatchObject({
      mayanodeUrl: "https://mayanode.test",
      referralMayaName: "friend",
      supportReferrerEnabled: true,
      supportReferrerBps: "25",
      supportReferrerForMayaName: "friend",
      interfaceSupportSwapEnabled: true,
      interfaceSupportSwapBps: "40",
      interfaceSupportBannerDismissed: true,
    });
  });

  it("persists settings updates to storage", () => {
    const storage = createStorage();
    persistSettings(
      storage,
      setStoredReferralMayaName(loadStoredSettings(storage), "alpha"),
    );

    expect(JSON.parse(storage.getItem("maya-settings") ?? "{}")).toMatchObject({
      referralMayaName: "alpha",
      supportReferrerEnabled: false,
      supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
      supportReferrerForMayaName: "alpha",
      interfaceSupportSwapEnabled: false,
      interfaceSupportSwapBps: DEFAULT_SUPPORT_REFERRER_BPS,
      interfaceSupportBannerDismissed: false,
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
      interfaceSupportSwapEnabled: false,
      interfaceSupportSwapBps: DEFAULT_SUPPORT_REFERRER_BPS,
      interfaceSupportBannerDismissed: false,
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
          interfaceSupportSwapEnabled: true,
          interfaceSupportSwapBps: "35",
          interfaceSupportBannerDismissed: true,
        },
        "beta",
      ),
    ).toMatchObject({
      referralMayaName: "beta",
      supportReferrerEnabled: false,
      supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
      supportReferrerForMayaName: "beta",
      interfaceSupportSwapEnabled: true,
      interfaceSupportSwapBps: "35",
      interfaceSupportBannerDismissed: true,
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
          interfaceSupportSwapEnabled: true,
          interfaceSupportSwapBps: "35",
          interfaceSupportBannerDismissed: true,
        },
        "alpha",
      ),
    ).toMatchObject({
      referralMayaName: "alpha",
      supportReferrerEnabled: true,
      supportReferrerBps: "50",
      supportReferrerForMayaName: "alpha",
      interfaceSupportSwapEnabled: true,
      interfaceSupportSwapBps: "35",
      interfaceSupportBannerDismissed: true,
    });
  });
});
