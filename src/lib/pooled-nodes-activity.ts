import type { EnhancedAction } from "./cacaotracker-types";

export type BondActivityItem = {
  id: string;
  type: "bond" | "unbond";
  label: string;
  timestamp: number;
  height: number;
  amountCacao: number;
  txHash: string;
  nodeAddress: string | null;
};

export function formatBondActivityLabel(type: EnhancedAction["type"]): string {
  switch (type) {
    case "bond":
      return "Bond";
    case "unbond":
      return "Unbond";
    default:
      return type;
  }
}

export function parseNodeAddressFromBondMemo(
  memo: string | null | undefined,
): string | null {
  if (!memo) {
    return null;
  }

  const bondMatch = memo.match(/^BOND:(maya[0-9a-z]+)/i);
  if (bondMatch?.[1]) {
    return bondMatch[1];
  }

  const unbondMatch = memo.match(/^UNBOND:(maya[0-9a-z]+)/i);
  if (unbondMatch?.[1]) {
    return unbondMatch[1];
  }

  return null;
}

export function extractNodeAddressFromBondAction(
  action: EnhancedAction,
): string | null {
  for (const candidate of [action.toAddress, ...action.pools]) {
    const fromMemo = parseNodeAddressFromBondMemo(candidate);
    if (fromMemo) {
      console.log("fromMemo", fromMemo);
      return fromMemo;
    }
    if (/^maya[0-9a-z]+$/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function filterBondActivity(
  actions: EnhancedAction[],
  limit = 10,
): BondActivityItem[] {
  return actions
    .filter((action) => action.type === "bond" || action.type === "unbond")
    .slice(0, limit)
    .map((action) => ({
      id: action.txHash,
      type: action.type as "bond" | "unbond",
      label: formatBondActivityLabel(action.type),
      timestamp: action.date,
      height: action.height,
      amountCacao: action.inAmount,
      txHash: action.txHash,
      nodeAddress: extractNodeAddressFromBondAction(action),
    }));
}

export function filterBondActivityByNode(
  items: BondActivityItem[],
  nodeAddress: string | null | undefined,
): BondActivityItem[] {
  if (!nodeAddress) {
    return items;
  }

  const normalized = nodeAddress.trim().toLowerCase();
  return items.filter(
    (item) => item.nodeAddress?.trim().toLowerCase() === normalized,
  );
}
