import { Chain } from "@vultisig/sdk";
import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsEvent, toChainCountBucket } from "./events";

describe("analytics event helpers", () => {
  it("sanitizes valid custom events into coarse analytics payloads", () => {
    expect(
      sanitizeAnalyticsEvent({
        type: "journey_finished",
        subject: "swap",
        action: "submit",
        route: "/chains/ethereum",
        status: "success",
        source: "sdk",
        chain: Chain.Ethereum,
        has_referral: true,
      }),
    ).toEqual({
      name: "journey_finished",
      properties: {
        subject: "swap",
        action: "submit",
        route: "/chains/:chainKey",
        status: "success",
        source: "sdk",
        chain: Chain.Ethereum,
        has_referral: true,
      },
    });
  });

  it("rejects unknown properties instead of sending possibly sensitive payloads", () => {
    expect(
      sanitizeAnalyticsEvent({
        type: "journey_finished",
        subject: "swap",
        action: "submit",
        route: "/swap",
        status: "success",
        txHash: "0xdeadbeef",
      } as Record<string, unknown>),
    ).toBeNull();

    expect(
      sanitizeAnalyticsEvent({
        type: "referral_capture",
        outcome: "stored",
        had_existing_referral: false,
        referral: "friend.maya",
      } as Record<string, unknown>),
    ).toBeNull();
  });

  it("buckets chain counts without exposing exact wallet breadth", () => {
    expect(toChainCountBucket(1)).toBe("1");
    expect(toChainCountBucket(2)).toBe("2_3");
    expect(toChainCountBucket(7)).toBe("4_plus");
  });
});
