import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAYA_NAME_UPDATE_AMOUNT_BASE_UNITS,
  buildAliasUpdateMayaNameMemo,
  buildMayaNameReferralHref,
  buildReferralProfileMayaNameMemo,
  buildRegisterMayaNameMemo,
  buildRenewMayaNameMemo,
  calculateMayaNameExpiryBlock,
  calculateRegisterMayaNameAmountBaseUnits,
  calculateRenewMayaNameAmountBaseUnits,
  clearMayaNameValidationCache,
  fetchManagedMayaName,
  fetchMayaNamePricing,
  fetchOwnedMayaNames,
  normalizeManagedMayaName,
  validateMayaName,
} from "./mayaname";

describe("validateMayaName", () => {
  beforeEach(() => {
    clearMayaNameValidationCache();
  });

  it("returns valid MAYAName records", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: "friend" }),
    }));

    await expect(
      validateMayaName("friend", "https://mayanode.test", fetchImpl as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "valid",
      name: "friend",
    });
  });

  it("returns invalid for 404 responses", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "missing" }),
    }));

    await expect(
      validateMayaName("nope", "https://mayanode.test", fetchImpl as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "invalid",
      name: "nope",
      reason: "missing",
    });
  });

  it("caches valid and invalid lookups but not unreachable ones", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: "cached" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "missing" }),
      })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: "retry" }),
      });

    await validateMayaName("cached", "https://mayanode.test", fetchImpl as unknown as typeof fetch);
    await validateMayaName("cached", "https://mayanode.test", fetchImpl as unknown as typeof fetch);
    await validateMayaName("missing", "https://mayanode.test", fetchImpl as unknown as typeof fetch);
    await validateMayaName("missing", "https://mayanode.test", fetchImpl as unknown as typeof fetch);
    await validateMayaName("retry", "https://mayanode.test", fetchImpl as unknown as typeof fetch);
    await validateMayaName("retry", "https://mayanode.test", fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("MAYAName service helpers", () => {
  it("returns owned MAYANames and treats 404 as empty", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ["alpha", "beta"],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      });

    await expect(
      fetchOwnedMayaNames("maya1owner", {
        fetch: fetchImpl as unknown as typeof fetch,
        midgardUrl: "https://midgard.test",
      }),
    ).resolves.toEqual(["alpha", "beta"]);

    await expect(
      fetchOwnedMayaNames("maya1owner", {
        fetch: fetchImpl as unknown as typeof fetch,
        midgardUrl: "https://midgard.test",
      }),
    ).resolves.toEqual([]);
  });

  it("merges MAYANode and Midgard records into a managed shape", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/mayachain/mayaname/alpha")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: "Alpha",
            owner: "maya1owner",
            expire_block_height: 123,
            preferred_asset: "ETH.USDC-0X123",
            affiliate_collector_cacao: "99",
            aliases: [
              { chain: "BTC", address: "bc1one" },
              { chain: "MAYA", address: "maya1alias" },
            ],
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          owner: "maya1owner",
          registration_block: "77",
          expire: "123",
          preferred_asset: "",
          affiliate_bps: "50",
          entries: [{ chain: "BTC", address: "bc1one" }],
          sub_affiliates: [
            { name: "suba", share_bps: "2000", affiliate_bps: "50", expire: "999" },
          ],
        }),
      };
    });

    await expect(
      fetchManagedMayaName("alpha", {
        fetch: fetchImpl as unknown as typeof fetch,
        mayanodeUrl: "https://mayanode.test",
        midgardUrl: "https://midgard.test",
      }),
    ).resolves.toEqual({
      name: "Alpha",
      owner: "maya1owner",
      registrationBlock: "77",
      expireBlockHeight: "123",
      preferredAsset: "ETH.USDC-0X123",
      affiliateCollectorCacao: "99",
      affiliateBps: "50",
      aliases: [
        { chain: "BTC", address: "bc1one" },
        { chain: "MAYA", address: "maya1alias" },
      ],
      mayaAliasAddress: "maya1alias",
      subaffiliates: [
        { name: "suba", shareBps: "2000", affiliateBps: "50", expire: "999" },
      ],
    });
  });

  it("normalizes managed records when MAYANode omits optional fields", () => {
    expect(
      normalizeManagedMayaName(
        "alpha",
        {
          owner: "maya1owner",
          aliases: [{ chain: "eth", address: "0xabc" }],
        },
        {
          registration_block: "9",
          expire: "55",
          affiliate_bps: "0",
          entries: [{ chain: "MAYA", address: "maya1alias" }],
          sub_affiliates: [],
        },
      ),
    ).toEqual({
      name: "alpha",
      owner: "maya1owner",
      registrationBlock: "9",
      expireBlockHeight: "55",
      preferredAsset: "",
      affiliateCollectorCacao: "0",
      affiliateBps: "0",
      aliases: [
        { chain: "ETH", address: "0xabc" },
        { chain: "MAYA", address: "maya1alias" },
      ],
      mayaAliasAddress: "maya1alias",
      subaffiliates: [],
    });
  });

  it("loads pricing from mimir and the current lastblock", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/mayachain/mimir")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ TNSREGISTERFEE: 500000000000, TNSFEEPERBLOCK: 2000 }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => [
          { chain: "BTC", mayachain: 9 },
          { chain: "ETH", mayachain: 10 },
        ],
      };
    });

    await expect(
      fetchMayaNamePricing({
        fetch: fetchImpl as unknown as typeof fetch,
        mayanodeUrl: "https://mayanode.test",
      }),
    ).resolves.toEqual({
      registerFeeBaseUnits: "500000000000",
      feePerBlockBaseUnits: "2000",
      currentBlockHeight: "10",
    });
  });

  it("calculates register and renew amounts plus expiry blocks", () => {
    const pricing = {
      registerFeeBaseUnits: "500000000000",
      feePerBlockBaseUnits: "2000",
      currentBlockHeight: "100",
    };

    expect(calculateMayaNameExpiryBlock(pricing, 12n)).toBe("112");
    expect(calculateRegisterMayaNameAmountBaseUnits(pricing, 12n)).toBe("500000024000");
    expect(calculateRenewMayaNameAmountBaseUnits(pricing, 12n)).toBe("24000");
    expect(MAYA_NAME_UPDATE_AMOUNT_BASE_UNITS).toBe("1000000000");
  });

  it("serializes MAYAName memos for register, alias, profile, and renew actions", () => {
    expect(
      buildRegisterMayaNameMemo({
        name: "alpha",
        aliasChain: "MAYA",
        aliasAddress: "maya1owner",
        owner: "maya1owner",
        preferredAsset: "MAYA.CACAO",
        affiliateBps: "25",
        subaffiliates: [{ name: "suba", shareBps: "2000" }],
      }),
    ).toBe("~:alpha:MAYA:maya1owner:maya1owner:MAYA.CACAO::25:suba:2000");

    expect(
      buildAliasUpdateMayaNameMemo({
        name: "alpha",
        aliasChain: "ETH",
        aliasAddress: "0xabc",
      }),
    ).toBe("~:alpha:ETH:0xabc::::::");

    expect(
      buildReferralProfileMayaNameMemo({
        name: "alpha",
        preferredAsset: "ETH.USDC-0X123",
        affiliateBps: "75",
        subaffiliates: [
          { name: "suba", shareBps: "2000" },
          { name: "subb", shareBps: "0" },
        ],
      }),
    ).toBe("~:alpha::::ETH.USDC-0X123::75:suba/subb:2000/0");

    expect(
      buildRenewMayaNameMemo({ name: "alpha", mayaAddress: "maya1owner" }),
    ).toBe("~:alpha:MAYA:maya1owner");
  });

  it("builds swap referral links for MAYANames", () => {
    expect(buildMayaNameReferralHref("https://mayazero.app/", "friend")).toBe(
      "https://mayazero.app/swap?ref=friend",
    );
  });
});
