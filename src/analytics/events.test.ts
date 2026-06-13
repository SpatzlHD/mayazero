import { WalletChain as Chain } from "#/wallet/chain-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeAnalyticsEvent, toChainCountBucket } from "./events";

const { vercelTrack, trackOpenPanelEvent, isAnalyticsEnabledInBrowser, isAnalyticsOptOutEnabled } =
  vi.hoisted(() => ({
    vercelTrack: vi.fn(),
    trackOpenPanelEvent: vi.fn(),
    isAnalyticsEnabledInBrowser: vi.fn(() => true),
    isAnalyticsOptOutEnabled: vi.fn(() => false),
  }));

vi.mock("@vercel/analytics/react", () => ({
  track: vercelTrack,
}));

vi.mock("./openpanel", () => ({
  trackOpenPanelEvent,
}));

vi.mock("./runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("./runtime")>();
  return {
    ...original,
    isAnalyticsEnabledInBrowser,
    isAnalyticsOptOutEnabled,
  };
});

describe("analytics event helpers", () => {
  it("sanitizes valid custom events into coarse analytics payloads", () => {
    expect(
      sanitizeAnalyticsEvent({
        type: "journey_finished",
        journey_id: "1710000000000-abc123",
        duration_ms: 1200,
        subject: "swap",
        action: "submit",
        route: "/chains/ethereum",
        status: "success",
        source: "sdk",
        chain: Chain.Ethereum,
        has_referral: true,
        affiliate_mayaname: "m0",
        tx_hash: "0xdeadbeef",
      }),
    ).toEqual({
      name: "journey_finished",
      properties: {
        journey_id: "1710000000000-abc123",
        duration_ms: 1200,
        subject: "swap",
        action: "submit",
        route: "/chains/:chainKey",
        status: "success",
        source: "sdk",
        chain: Chain.Ethereum,
        has_referral: true,
        affiliate_mayaname: "m0",
        tx_hash: "0xdeadbeef",
      },
    });
  });

  it("accepts correlated journey_started events with mayaname context", () => {
    expect(
      sanitizeAnalyticsEvent({
        type: "journey_started",
        journey_id: "1710000000000-abc123",
        subject: "liquidity",
        action: "deposit",
        route: "/liquidity",
        affiliate_mayaname: "m0",
      }),
    ).toEqual({
      name: "journey_started",
      properties: {
        journey_id: "1710000000000-abc123",
        subject: "liquidity",
        action: "deposit",
        route: "/liquidity",
        affiliate_mayaname: "m0",
      },
    });
  });

  it("rejects tx_hash on asset_send journeys", () => {
    expect(
      sanitizeAnalyticsEvent({
        type: "journey_finished",
        journey_id: "1710000000000-abc123",
        duration_ms: 500,
        subject: "asset_send",
        action: "send",
        route: "/chains/:chainKey",
        status: "success",
        tx_hash: "0xdeadbeef",
      }),
    ).toBeNull();
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

describe("trackAnalyticsEvent", () => {
  beforeEach(() => {
    vercelTrack.mockClear();
    trackOpenPanelEvent.mockClear();
    isAnalyticsEnabledInBrowser.mockReturnValue(true);
    isAnalyticsOptOutEnabled.mockReturnValue(false);
  });

  it("fans out sanitized events to Vercel Analytics and OpenPanel", async () => {
    const { trackAnalyticsEvent } = await import("./events");

    trackAnalyticsEvent({
      type: "wallet_connected",
      source: "sdk",
      session_kind: "vault",
      chain_count_bucket: "2_3",
    });

    expect(vercelTrack).toHaveBeenCalledWith("wallet_connected", {
      source: "sdk",
      session_kind: "vault",
      chain_count_bucket: "2_3",
    });
    expect(trackOpenPanelEvent).toHaveBeenCalledWith("wallet_connected", {
      source: "sdk",
      session_kind: "vault",
      chain_count_bucket: "2_3",
    });
  });

  it("stringifies numeric properties for Vercel while preserving numbers for OpenPanel", async () => {
    const { trackAnalyticsEvent } = await import("./events");

    trackAnalyticsEvent({
      type: "journey_finished",
      journey_id: "1710000000000-abc123",
      duration_ms: 2500,
      subject: "swap",
      action: "submit",
      route: "/swap",
      status: "success",
      affiliate_mayaname: "m0",
      tx_hash: "ABC123",
    });

    expect(vercelTrack).toHaveBeenCalledWith("journey_finished", {
      journey_id: "1710000000000-abc123",
      duration_ms: "2500",
      subject: "swap",
      action: "submit",
      route: "/swap",
      status: "success",
      affiliate_mayaname: "m0",
      tx_hash: "ABC123",
    });
    expect(trackOpenPanelEvent).toHaveBeenCalledWith("journey_finished", {
      journey_id: "1710000000000-abc123",
      duration_ms: 2500,
      subject: "swap",
      action: "submit",
      route: "/swap",
      status: "success",
      affiliate_mayaname: "m0",
      tx_hash: "ABC123",
    });
  });

  it("does not send invalid or opted-out events to either provider", async () => {
    const { trackAnalyticsEvent } = await import("./events");

    trackAnalyticsEvent({
      type: "journey_finished",
      subject: "swap",
      action: "submit",
      route: "/swap",
      status: "success",
      txHash: "0xdeadbeef",
    } as Record<string, unknown> as never);

    expect(vercelTrack).not.toHaveBeenCalled();
    expect(trackOpenPanelEvent).not.toHaveBeenCalled();

    isAnalyticsOptOutEnabled.mockReturnValue(true);

    trackAnalyticsEvent({
      type: "referral_capture",
      outcome: "stored",
      had_existing_referral: false,
    });

    expect(vercelTrack).not.toHaveBeenCalled();
    expect(trackOpenPanelEvent).not.toHaveBeenCalled();
  });
});
