import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMayaNameValidationCache } from "#/lib/mayaname";
import {
  toReferralValidationState,
  validateSettingsReferralMayaName,
} from "./settings";

describe("settings referral helpers", () => {
  beforeEach(() => {
    clearMayaNameValidationCache();
  });

  it("validates a valid referral MAYAName for saving", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: "friend" }),
    }));

    await expect(
      validateSettingsReferralMayaName(" friend ", "https://mayanode.test", fetchImpl as typeof fetch),
    ).resolves.toMatchObject({
      status: "valid",
      message: 'Validated MAYAName "friend".',
      trimmedReferral: "friend",
    });
  });

  it("blocks saving an invalid referral MAYAName", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "missing" }),
    }));

    await expect(
      validateSettingsReferralMayaName("missing", "https://mayanode.test", fetchImpl as typeof fetch),
    ).resolves.toMatchObject({
      status: "invalid",
      message: "Invalid MAYAName: missing.",
    });
  });

  it("treats an empty referral MAYAName as a clear action", async () => {
    await expect(
      validateSettingsReferralMayaName("   ", "https://mayanode.test"),
    ).resolves.toMatchObject({
      status: "idle",
      message: "No referral MAYAName stored.",
      trimmedReferral: "",
    });
  });

  it("maps unreachable validation responses to a transient settings state", () => {
    expect(
      toReferralValidationState({
        status: "unreachable",
        name: "friend",
        reason: "offline",
      }),
    ).toEqual({
      status: "unreachable",
      message: "Validation is temporarily unavailable.",
      trimmedReferral: "friend",
    });
  });
});
