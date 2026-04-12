import { Chain } from "@vultisig/sdk";
import { isAddress as isEvmAddress } from "viem";
import { supportedWalletChains } from "#/wallet/chains";
import { type WalletChain, type WalletSession } from "#/wallet/types";

export const VIEW_ONLY_IMPERSONATION_REASON =
  "Impersonation mode is view-only.";

export type ImpersonationAddressMap = Partial<Record<WalletChain, string>>;
export type ImpersonationValidationErrors = Partial<Record<WalletChain, string>>;

export type EffectiveWalletSession = WalletSession & {
  isViewOnly: boolean;
};

export function hasAnyImpersonationAddresses(
  addresses: ImpersonationAddressMap | undefined,
): boolean {
  return Object.keys(normalizeImpersonationAddresses(addresses)).length > 0;
}

export function normalizeImpersonationAddresses(
  addresses: ImpersonationAddressMap | undefined,
): ImpersonationAddressMap {
  const normalized: ImpersonationAddressMap = {};
  if (!addresses) {
    return normalized;
  }

  for (const chain of supportedWalletChains) {
    const value = addresses[chain]?.trim();
    if (value) {
      normalized[chain] = value;
    }
  }

  return normalized;
}

export function validateImpersonationAddress(
  chain: WalletChain,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  switch (chain) {
    case Chain.Ethereum:
    case Chain.Arbitrum:
      return isEvmAddress(trimmed) ? null : "Enter a valid EVM address.";
    case Chain.MayaChain:
      return /^(maya|tmaya)1[0-9a-z]{10,}$/i.test(trimmed)
        ? null
        : "Enter a valid MayaChain address.";
    case Chain.THORChain:
      return /^(thor|tthor)1[0-9a-z]{10,}$/i.test(trimmed)
        ? null
        : "Enter a valid THORChain address.";
    case Chain.Kujira:
      return /^kujira1[0-9a-z]{10,}$/i.test(trimmed)
        ? null
        : "Enter a valid Kujira address.";
    case Chain.Bitcoin:
      return /^(bc1|tb1|[13]|[mn2])[0-9a-zA-Z]{20,90}$/i.test(trimmed)
        ? null
        : "Enter a valid Bitcoin address.";
    case Chain.Dash:
      return /^(X|7|y)[1-9A-HJ-NP-Za-km-z]{20,40}$/i.test(trimmed)
        ? null
        : "Enter a valid Dash address.";
    case Chain.Zcash:
      return /^(t1|t3|zs|ztestsapling1|tm)[0-9a-zA-Z]{20,120}$/i.test(trimmed)
        ? null
        : "Enter a valid Zcash address.";
    default:
      return "This chain is not supported for impersonation.";
  }
}

export function validateImpersonationAddresses(
  addresses: ImpersonationAddressMap | undefined,
): ImpersonationValidationErrors {
  const normalized = normalizeImpersonationAddresses(addresses);
  const errors: ImpersonationValidationErrors = {};

  for (const chain of supportedWalletChains) {
    const value = normalized[chain];
    if (!value) {
      continue;
    }

    const error = validateImpersonationAddress(chain, value);
    if (error) {
      errors[chain] = error;
    }
  }

  return errors;
}

export function createImpersonationSession(
  addresses: ImpersonationAddressMap,
): EffectiveWalletSession {
  const normalized = normalizeImpersonationAddresses(addresses);
  const accounts = supportedWalletChains.flatMap((chain) =>
    normalized[chain] ? [{ chain, address: normalized[chain]! }] : [],
  );

  return {
    id: "viewer:impersonation",
    source: "sdk",
    kind: "vault",
    label: "Impersonation Viewer",
    status: "ready",
    capabilities: [],
    chains: supportedWalletChains,
    accounts,
    addresses: normalized,
    isViewOnly: true,
  };
}
