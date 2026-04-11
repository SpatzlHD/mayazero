import { WalletCapabilityError, WalletSessionNotFoundError } from "./errors";
import type { MayaWalletManager } from "./manager";
import type { WalletCommandMap, WalletChain, WalletSession } from "./types";

export type AssetSendAsset = {
  assetId: string;
  chain: WalletChain;
  decimals: number;
  isNative: boolean;
  ticker: string;
  tokenId?: string;
};

export type AssetSendSupport = {
  reason?: string;
  sessionId?: string;
  source?: WalletSession["source"];
  sourceAddress?: string;
  supported: boolean;
};

export type AssetSendResult = {
  memo?: string;
  rawResult: unknown;
  recipient: string;
  route: "extension" | "sdk";
  sourceAddress: string;
  txHash: string | null;
};

export function getAssetSendSupport(
  manager: MayaWalletManager,
  input: {
    asset: AssetSendAsset;
    sessionId?: string;
  },
): AssetSendSupport {
  const session = resolveSession(manager, input.sessionId);
  if (!session) {
    return {
      supported: false,
      reason: "Connect a wallet session to send assets.",
    };
  }

  const sourceAddress = session.addresses[input.asset.chain];
  if (!sourceAddress) {
    return {
      supported: false,
      reason: `Connect a ${input.asset.chain} address for the active session.`,
      sessionId: session.id,
      source: session.source,
    };
  }

  if (session.source === "extension") {
    if (
      !manager.canExecute("tx.send", {
        sessionId: session.id,
        chain: input.asset.chain,
      })
    ) {
      return {
        supported: false,
        reason: `The connected extension session cannot submit ${input.asset.chain} transfers.`,
        sessionId: session.id,
        source: session.source,
        sourceAddress,
      };
    }
  } else if (!canSdkSessionSend(manager, session.id, input.asset.chain)) {
    return {
      supported: false,
      reason: `The active vault session cannot prepare ${input.asset.chain} transfers.`,
      sessionId: session.id,
      source: session.source,
      sourceAddress,
    };
  }

  return {
    supported: true,
    sessionId: session.id,
    source: session.source,
    sourceAddress,
  };
}

export async function submitAssetSend(
  manager: MayaWalletManager,
  input: {
    amountBaseUnits: string;
    asset: AssetSendAsset;
    journeyId?: string;
    memo?: string;
    recipient: string;
    sessionId?: string;
  },
): Promise<AssetSendResult> {
  const session = resolveRequiredSession(manager, input.sessionId);
  const sourceAddress = session.addresses[input.asset.chain];
  if (!sourceAddress) {
    throw new Error(
      `No ${input.asset.chain} address is connected for the selected wallet session.`,
    );
  }

  const normalizedRecipient = input.recipient.trim();
  if (!normalizedRecipient) {
    throw new Error("Recipient address is required.");
  }

  if (!/^\d+$/.test(input.amountBaseUnits) || input.amountBaseUnits === "0") {
    throw new Error("Enter a valid amount to send.");
  }

  const memo = normalizeOptionalMemo(input.memo);
  const tokenIdentifier = resolveAssetIdentifier(input.asset);

  if (session.source === "extension") {
    const result = await manager.execute("tx.send", {
      sessionId: session.id,
      ...(input.journeyId
        ? { journey: { id: input.journeyId, stepKey: "provider" } }
        : {}),
      input: {
        chain: input.asset.chain,
        transaction: {
          amount: {
            amount: input.amountBaseUnits,
            decimals: input.asset.decimals,
          },
          asset: {
            chain: input.asset.chain,
            ticker: input.asset.ticker.toLowerCase(),
            ...(tokenIdentifier ? { id: tokenIdentifier } : {}),
          },
          from: sourceAddress,
          ...(memo ? { memo } : {}),
          to: normalizedRecipient,
        },
      },
    });

    return {
      ...(memo ? { memo } : {}),
      rawResult: result.result,
      recipient: normalizedRecipient,
      route: "extension",
      sourceAddress,
      txHash: extractTxHash(result.result),
    };
  }

  ensureSdkSendSupport(manager, session.id, input.asset.chain);

  const prepared = await manager.execute("tx.prepare.send", {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: "preparing" } }
      : {}),
    input: {
      amount: BigInt(input.amountBaseUnits),
      coin: {
        address: sourceAddress,
        chain: input.asset.chain,
        ...(tokenIdentifier ? { contractAddress: tokenIdentifier } : {}),
        decimals: input.asset.decimals,
        isNativeToken: input.asset.isNative,
        ticker: input.asset.ticker,
      },
      ...(memo ? { memo } : {}),
      receiver: normalizedRecipient,
    },
  });

  const signature = await manager.execute("tx.sign", {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: "signing" } }
      : {}),
    input: {
      chain: input.asset.chain,
      payload: prepared.payload,
    },
  });

  const broadcast = await manager.execute("tx.broadcast", {
    sessionId: session.id,
    ...(input.journeyId
      ? { journey: { id: input.journeyId, stepKey: "broadcasting" } }
      : {}),
    input: {
      chain: input.asset.chain,
      payload: prepared.payload,
      signature: signature.signature,
    },
  });

  return {
    ...(memo ? { memo } : {}),
    rawResult: {
      payload: prepared.payload,
      txHash: broadcast.txHash,
    },
    recipient: normalizedRecipient,
    route: "sdk",
    sourceAddress,
    txHash: broadcast.txHash ?? null,
  };
}

function resolveRequiredSession(
  manager: MayaWalletManager,
  sessionId?: string,
): WalletSession {
  const session = resolveSession(manager, sessionId);
  if (!session) {
    throw new WalletSessionNotFoundError(sessionId ?? "active");
  }

  return session;
}

function resolveSession(
  manager: MayaWalletManager,
  sessionId?: string,
): WalletSession | null {
  const state = manager.getState();
  const resolvedId = sessionId ?? state.activeSessionId;
  if (!resolvedId) {
    return null;
  }

  return (
    state.sessions.find((candidate) => candidate.id === resolvedId) ?? null
  );
}

function canSdkSessionSend(
  manager: MayaWalletManager,
  sessionId: string,
  chain: WalletChain,
): boolean {
  return (
    manager.canExecute("tx.prepare.send", {
      sessionId,
      chain,
    }) &&
    manager.canExecute("tx.sign", {
      sessionId,
      chain,
    }) &&
    manager.canExecute("tx.broadcast", {
      sessionId,
      chain,
    })
  );
}

function ensureSdkSendSupport(
  manager: MayaWalletManager,
  sessionId: string,
  chain: WalletChain,
): void {
  if (!canSdkSessionSend(manager, sessionId, chain)) {
    throw new WalletCapabilityError(
      "tx.prepare.send",
      sessionId,
      "The active vault session cannot prepare the requested transfer.",
    );
  }
}

function resolveAssetIdentifier(asset: AssetSendAsset): string | undefined {
  if (asset.tokenId) {
    return asset.tokenId;
  }

  return asset.isNative ? undefined : asset.assetId;
}

function normalizeOptionalMemo(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function extractTxHash(
  result: WalletCommandMap["tx.send"]["output"]["result"],
): string | null {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result === "object" && result !== null) {
    const record = result as Record<string, unknown>;
    if (typeof record.txHash === "string") {
      return record.txHash;
    }
    if (typeof record.hash === "string") {
      return record.hash;
    }
  }

  return null;
}
