import { describe, expect, it } from "vitest";
import {
  buildReferralCaptureAnalyticsEvent,
  buildReferralCaptureAction,
  getIncomingReferralParam,
  stripReferralQueryParamFromUrl,
} from "./ReferralCaptureBanner";

describe("ReferralCaptureBanner helpers", () => {
  it("extracts the incoming ref from the query string", () => {
    expect(getIncomingReferralParam("?ref=friend&foo=bar")).toBe("friend");
    expect(getIncomingReferralParam("?foo=bar")).toBe("");
  });

  it("stores the referral immediately when no referral is already stored", () => {
    expect(
      buildReferralCaptureAction({
        currentReferral: "",
        validation: { status: "valid", name: "friend", record: { name: "friend" } },
      }),
    ).toEqual({
      type: "store",
      incoming: "friend",
    });
  });

  it("creates a pending replacement when a different referral is already stored", () => {
    expect(
      buildReferralCaptureAction({
        currentReferral: "alpha",
        validation: { status: "valid", name: "beta", record: { name: "beta" } },
      }),
    ).toEqual({
      type: "pending",
      current: "alpha",
      incoming: "beta",
    });
  });

  it("ignores invalid referrals and removes the ref query param", () => {
    expect(
      buildReferralCaptureAction({
        currentReferral: "alpha",
        validation: { status: "invalid", name: "bad", reason: "missing" },
      }),
    ).toEqual({
      type: "ignore",
      reason: "invalid",
    });

    expect(
      stripReferralQueryParamFromUrl("/swap", "?ref=bad&foo=bar", "section"),
    ).toBe("/swap?foo=bar#section");
  });

  it("maps referral outcomes into coarse analytics events without leaking the name", () => {
    expect(
      buildReferralCaptureAnalyticsEvent({
        currentReferral: "friend",
        outcome: "replaced",
      }),
    ).toEqual({
      type: "referral_capture",
      outcome: "replaced",
      had_existing_referral: true,
    });

    expect(
      buildReferralCaptureAnalyticsEvent({
        currentReferral: "",
        outcome: "stored",
      }),
    ).toEqual({
      type: "referral_capture",
      outcome: "stored",
      had_existing_referral: false,
    });
  });
});
