import { describe, expect, it } from "vitest";
import {
  buildCacaoPoolAnalyticsContext,
  buildLiquidityAnalyticsContext,
  buildSwapAnalyticsContext,
  sanitizeAnalyticsMayaName,
} from "./journey-enrichment";

describe("journey enrichment helpers", () => {
  it("builds swap analytics context from referral and affiliate drafts", () => {
    expect(
      buildSwapAnalyticsContext(
        {
          referralMayaName: "Friend.Name",
          supportReferrerEnabled: false,
          supportReferrerBps: "10",
          supportReferrerForMayaName: "",
        },
        [{ value: "alpha", bps: "25" }],
      ),
    ).toEqual({
      referral_mayaname: "friend.name",
      affiliate_mayaname: "alpha",
    });
  });

  it("falls back to the interface affiliate when no draft mayaname is present", () => {
    expect(
      buildSwapAnalyticsContext(
        {
          referralMayaName: "",
          supportReferrerEnabled: false,
          supportReferrerBps: "10",
          supportReferrerForMayaName: "",
        },
        [{ value: "0xabc123", bps: "25" }],
      ),
    ).toEqual({
      affiliate_mayaname: "m0",
    });
  });

  it("builds liquidity and cacao pool affiliate context", () => {
    expect(buildLiquidityAnalyticsContext()).toEqual({
      affiliate_mayaname: "m0",
    });
    expect(buildCacaoPoolAnalyticsContext()).toEqual({
      affiliate_mayaname: "m0",
    });
  });

  it("rejects malformed mayanames", () => {
    expect(sanitizeAnalyticsMayaName("bad name")).toBeNull();
    expect(sanitizeAnalyticsMayaName("valid.name")).toBe("valid.name");
  });
});
