import { WalletChain as Chain } from "#/wallet/chain-types";
import { describe, expect, it } from "vitest";
import { createImpersonationSession } from "#/lib/impersonation";
import { supportedWalletChains } from "#/wallet/chains";
import type { WalletSession } from "#/wallet/types";
import { resolveEffectiveWalletSession } from "./ImpersonationProvider";

const activeSession: WalletSession = {
  id: "vault-1",
  source: "sdk",
  kind: "vault",
  label: "Primary Vault",
  status: "ready",
  capabilities: [],
  chains: [Chain.MayaChain, Chain.Ethereum],
  accounts: [],
  addresses: {
    [Chain.MayaChain]: "maya1realaddress0000000000",
    [Chain.Ethereum]: "0x000000000000000000000000000000000000beef",
  },
};

describe("ImpersonationProvider helpers", () => {
  it("creates a synthetic session that advertises all supported chains", () => {
    const session = createImpersonationSession({
      [Chain.MayaChain]: "maya1vieweraddress0000000000",
    });

    expect(session.id).toBe("viewer:impersonation");
    expect(session.isViewOnly).toBe(true);
    expect(session.chains).toEqual(supportedWalletChains);
  });

  it("prefers impersonation over a connected wallet session", () => {
    const session = resolveEffectiveWalletSession(activeSession, {
      impersonationEnabled: true,
      impersonationAddresses: {
        [Chain.MayaChain]: "maya1vieweraddress0000000000",
      },
    });

    expect(session).toMatchObject({
      id: "viewer:impersonation",
      isViewOnly: true,
      addresses: {
        [Chain.MayaChain]: "maya1vieweraddress0000000000",
      },
    });
  });

  it("falls back to the real wallet session when impersonation is disabled or invalid", () => {
    expect(
      resolveEffectiveWalletSession(activeSession, {
        impersonationEnabled: false,
        impersonationAddresses: {
          [Chain.MayaChain]: "maya1vieweraddress0000000000",
        },
      }),
    ).toMatchObject({
      id: "vault-1",
      isViewOnly: false,
    });

    expect(
      resolveEffectiveWalletSession(activeSession, {
        impersonationEnabled: true,
        impersonationAddresses: {
          [Chain.MayaChain]: "invalid",
        },
      }),
    ).toMatchObject({
      id: "vault-1",
      isViewOnly: false,
    });
  });
});
