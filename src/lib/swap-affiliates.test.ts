import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPORT_REFERRER_BPS,
  INTERFACE_AFFILIATE_MAYANAME,
  createInterfaceAffiliateDraft,
  createSupportReferrerAffiliateDrafts,
  hasManualAffiliateOverride,
  isSupportReferrerEnabledForCurrentReferral,
  normalizeSupportReferrerBps,
  resolveSwapAffiliateDrafts,
  setStoredReferralSupport,
} from "./swap-affiliates";

describe("swap-affiliates", () => {
  it("normalizes support bps into a bounded whole number", () => {
    expect(normalizeSupportReferrerBps("")).toBe(DEFAULT_SUPPORT_REFERRER_BPS);
    expect(normalizeSupportReferrerBps("12.7")).toBe("13");
    expect(normalizeSupportReferrerBps("999")).toBe("500");
  });

  it("creates a single affiliate draft when support is enabled for the current referral", () => {
    const settings = {
      referralMayaName: "friend",
      supportReferrerEnabled: true,
      supportReferrerBps: "25",
      supportReferrerForMayaName: "friend",
    };

    expect(isSupportReferrerEnabledForCurrentReferral(settings)).toBe(true);
    expect(createSupportReferrerAffiliateDrafts(settings)).toEqual([
      {
        value: "friend",
        bps: "25",
      },
    ]);
  });

  it("treats any advanced affiliate input as a manual override", () => {
    expect(
      hasManualAffiliateOverride([
        { value: "", bps: "" },
        { value: "manual", bps: "" },
      ]),
    ).toBe(true);

    expect(
      resolveSwapAffiliateDrafts(
        {
          referralMayaName: "friend",
          supportReferrerEnabled: true,
          supportReferrerBps: "25",
          supportReferrerForMayaName: "friend",
        },
        [
          { value: "", bps: "" },
          { value: "manual", bps: "" },
        ],
      ),
    ).toEqual([
      { value: "", bps: "" },
      { value: "manual", bps: "" },
    ]);
  });

  it("falls back to the stored referrer support draft when no manual override is active", () => {
    expect(
      resolveSwapAffiliateDrafts(
        {
          referralMayaName: "friend",
          supportReferrerEnabled: true,
          supportReferrerBps: "25",
          supportReferrerForMayaName: "friend",
        },
        [
          { value: "", bps: "" },
          { value: "", bps: "" },
        ],
      ),
    ).toEqual([
      {
        value: "friend",
        bps: "25",
      },
    ]);
  });

  it("resets support preferences when the stored referral changes", () => {
    expect(
      setStoredReferralSupport(
        {
          referralMayaName: "alpha",
          supportReferrerEnabled: true,
          supportReferrerBps: "25",
          supportReferrerForMayaName: "alpha",
        },
        "beta",
      ),
    ).toEqual({
      referralMayaName: "beta",
      supportReferrerEnabled: false,
      supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
      supportReferrerForMayaName: "beta",
    });
  });

  it("builds the fixed interface affiliate draft at zero bps", () => {
    expect(createInterfaceAffiliateDraft()).toEqual({
      value: INTERFACE_AFFILIATE_MAYANAME,
      bps: "0",
    });
  });
});
