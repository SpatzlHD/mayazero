import { formatBaseUnits, parseDecimalToBaseUnits } from "./cacao-pool";
import {
  BOND_DEPOSIT_BASE_UNITS,
  BOND_DEPOSIT_CACAO,
  POOLED_NODE_CACAO_DECIMALS,
  type BondablePosition,
  parseBondUnitsInput,
  validateBondUnitsAgainstPosition,
} from "./pooled-nodes-bond";
import {
  getConnectedProviderPosition,
  type PooledNode,
  type PooledNodeProvider,
  type ProviderBondAllocation,
} from "./pooled-nodes";
import {
  buildPooledNodeMemo,
  type PooledNodeActionKind,
} from "#/wallet/pooled-nodes";

export { POOLED_NODE_CACAO_DECIMALS } from "./pooled-nodes-bond";
export const MIN_OPERATOR_FEE_BPS = 100;
export const MAX_OPERATOR_FEE_BPS = 9900;
export const MAX_BOND_PROVIDERS = 8;
export const MIN_OPERATOR_ADD_TX_CACAO = "2";
export const MIN_DUST_CACAO = BOND_DEPOSIT_CACAO;
export const MIN_DUST_BASE_UNITS = BOND_DEPOSIT_BASE_UNITS;

export const MIN_OPERATOR_ADD_TX_BASE_UNITS =
  parseDecimalToBaseUnits(
    MIN_OPERATOR_ADD_TX_CACAO,
    POOLED_NODE_CACAO_DECIMALS,
  ) ?? "20000000000";

export type PooledNodeActionTab =
  | "provider.bond"
  | "provider.unbond"
  | "operator.add-provider"
  | "operator.update-fee"
  | "operator.remove-provider";

export type PooledNodePrimaryAction = {
  disabled: boolean;
  label: string;
  note?: string;
  amountBaseUnits: string | null;
  memo: string | null;
  txAmountBaseUnits: string | null;
};

export function isValidMayaAddress(value: string): boolean {
  return /^maya[0-9a-z]+$/i.test(value.trim());
}

export function parseCacaoAmountInput(value: string): {
  baseUnits: string | null;
  error: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { baseUnits: null, error: null };
  }

  const baseUnits = parseDecimalToBaseUnits(
    trimmed,
    POOLED_NODE_CACAO_DECIMALS,
  );
  if (!baseUnits || baseUnits === "0") {
    return { baseUnits: null, error: "Enter a valid positive CACAO amount." };
  }

  return { baseUnits, error: null };
}

export function parseOperatorFeeBps(value: string): {
  bps: string | null;
  error: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { bps: null, error: null };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      bps: null,
      error: "Operator fee must be a whole number of basis points.",
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { bps: null, error: "Operator fee must be a valid number." };
  }

  if (parsed < MIN_OPERATOR_FEE_BPS || parsed > MAX_OPERATOR_FEE_BPS) {
    return {
      bps: null,
      error: `Operator fee must be between ${MIN_OPERATOR_FEE_BPS} and ${MAX_OPERATOR_FEE_BPS} bps (1%–99%).`,
    };
  }

  return { bps: trimmed, error: null };
}

function resolveTxAmountBaseUnits(
  action: PooledNodeActionKind,
  amountBaseUnits: string,
  usesPositionMemo: boolean,
): string {
  switch (action) {
    case "provider.bond":
    case "provider.unbond":
      return usesPositionMemo ? MIN_DUST_BASE_UNITS : amountBaseUnits;
    case "operator.add-provider":
    case "operator.update-fee":
      return amountBaseUnits;
    case "operator.remove-provider":
      return MIN_DUST_BASE_UNITS;
  }
}

function hasInsufficientBalance(
  balanceBaseUnits: string | null,
  txAmountBaseUnits: string,
): boolean {
  if (!balanceBaseUnits) {
    return false;
  }

  return BigInt(txAmountBaseUnits) > BigInt(balanceBaseUnits);
}

export function getPooledNodePrimaryAction(params: {
  action: PooledNodeActionTab;
  isViewOnly?: boolean;
  supportReason?: string;
  isSubmitting?: boolean;
  amountInput: string;
  balanceBaseUnits: string | null;
  node: PooledNode | null;
  operatorFeeBps?: string;
  providerAddress?: string;
  connectedAddress?: string;
  selectedRemoveProvider?: PooledNodeProvider | null;
  bondPosition?: BondablePosition | null;
  bondedAllocation?: ProviderBondAllocation | null;
}): PooledNodePrimaryAction {
  const idleLabels: Record<PooledNodeActionTab, string> = {
    "provider.bond": "Submit Bond",
    "provider.unbond": "Submit Unbond",
    "operator.add-provider": "Add Provider",
    "operator.update-fee": "Update Fee",
    "operator.remove-provider": "Remove Provider",
  };

  if (params.isViewOnly) {
    return {
      disabled: true,
      label: "View Only",
      note: "View-only impersonation cannot submit bond transactions.",
      amountBaseUnits: null,
      memo: null,
      txAmountBaseUnits: null,
    };
  }

  if (params.supportReason) {
    return {
      disabled: true,
      label: "Action Unavailable",
      note: params.supportReason,
      amountBaseUnits: null,
      memo: null,
      txAmountBaseUnits: null,
    };
  }

  if (params.isSubmitting) {
    return {
      disabled: true,
      label: `${idleLabels[params.action].replace(/^Submit /, "Submitting ")}…`,
      amountBaseUnits: null,
      memo: null,
      txAmountBaseUnits: null,
    };
  }

  if (!params.node) {
    return {
      disabled: true,
      label: idleLabels[params.action],
      amountBaseUnits: null,
      memo: null,
      txAmountBaseUnits: null,
    };
  }

  const nodeAddress = params.node.nodeAddress;

  switch (params.action) {
    case "provider.bond": {
      if (!params.bondPosition) {
        return {
          disabled: true,
          label: "Select Bond Position",
          note: "Choose an LP pool or CACAO pool position from your wallet.",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const parsed = parseBondUnitsInput(params.amountInput);
      if (parsed.error) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: parsed.error,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!parsed.units) {
        return {
          disabled: true,
          label: "Enter Bond Units",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const positionError = validateBondUnitsAgainstPosition(
        parsed.units,
        params.bondPosition,
      );
      if (positionError) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: positionError,
          amountBaseUnits: parsed.units,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const memo = buildPooledNodeMemo({
        action: "provider.bond",
        amountBaseUnits: parsed.units,
        bondAsset: params.bondPosition.asset,
        bondUnits: parsed.units,
        nodeAddress,
      });
      const txAmountBaseUnits = resolveTxAmountBaseUnits(
        "provider.bond",
        parsed.units,
        true,
      );

      if (hasInsufficientBalance(params.balanceBaseUnits, txAmountBaseUnits)) {
        return {
          disabled: true,
          label: "Insufficient CACAO",
          note: `Bond transactions require ${MIN_DUST_CACAO} CACAO for the deposit memo. You bond LP or CACAO pool units, not CACAO itself.`,
          amountBaseUnits: parsed.units,
          memo,
          txAmountBaseUnits,
        };
      }

      return {
        disabled: false,
        label: idleLabels[params.action],
        amountBaseUnits: parsed.units,
        memo,
        txAmountBaseUnits,
      };
    }

    case "provider.unbond": {
      const parsed = parseBondUnitsInput(params.amountInput);
      if (parsed.error) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: parsed.error,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!params.bondedAllocation) {
        return {
          disabled: true,
          label: "Select Bonded Position",
          note: "Choose which bonded LP or CACAO pool allocation to unbond from this node.",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!parsed.units) {
        return {
          disabled: true,
          label: "Enter Unbond Units",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      if (BigInt(parsed.units) > BigInt(params.bondedAllocation.units)) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: "Unbond amount exceeds your bonded allocation for this asset on the node.",
          amountBaseUnits: parsed.units,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const memo = buildPooledNodeMemo({
        action: "provider.unbond",
        amountBaseUnits: parsed.units,
        bondAsset: params.bondedAllocation.asset,
        bondUnits: parsed.units,
        nodeAddress,
      });
      const txAmountBaseUnits = resolveTxAmountBaseUnits(
        "provider.unbond",
        parsed.units,
        true,
      );

      if (hasInsufficientBalance(params.balanceBaseUnits, txAmountBaseUnits)) {
        return {
          disabled: true,
          label: "Insufficient CACAO",
          note: `Unbond transactions require ${MIN_DUST_CACAO} CACAO for the deposit memo.`,
          amountBaseUnits: parsed.units,
          memo,
          txAmountBaseUnits,
        };
      }

      return {
        disabled: false,
        label: idleLabels[params.action],
        amountBaseUnits: parsed.units,
        memo,
        txAmountBaseUnits,
      };
    }

    case "operator.add-provider": {
      const providerAddress = params.providerAddress?.trim() ?? "";
      if (!providerAddress) {
        return {
          disabled: true,
          label: "Enter Provider Address",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!isValidMayaAddress(providerAddress)) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: "Bond provider address must be a valid MAYAChain address.",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      if (params.node.providerCount >= MAX_BOND_PROVIDERS) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: `This node already has the maximum of ${MAX_BOND_PROVIDERS} bond providers.`,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const fee = parseOperatorFeeBps(params.operatorFeeBps ?? "");
      if (fee.error) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: fee.error,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!fee.bps) {
        return {
          disabled: true,
          label: "Enter Operator Fee",
          note: `Fee must be ${MIN_OPERATOR_FEE_BPS}–${MAX_OPERATOR_FEE_BPS} bps.`,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const parsed = parseCacaoAmountInput(params.amountInput);
      if (parsed.error) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: parsed.error,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!parsed.baseUnits) {
        return {
          disabled: true,
          label: "Enter Bond Amount",
          note: `Minimum transaction amount is ${MIN_OPERATOR_ADD_TX_CACAO} CACAO.`,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      if (BigInt(parsed.baseUnits) < BigInt(MIN_OPERATOR_ADD_TX_BASE_UNITS)) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: `Adding a provider requires at least ${MIN_OPERATOR_ADD_TX_CACAO} CACAO in the transaction.`,
          amountBaseUnits: parsed.baseUnits,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const memo = buildPooledNodeMemo({
        action: "operator.add-provider",
        amountBaseUnits: parsed.baseUnits,
        nodeAddress,
        operatorFeeBps: fee.bps,
        providerAddress,
      });
      const txAmountBaseUnits = resolveTxAmountBaseUnits(
        "operator.add-provider",
        parsed.baseUnits,
        false,
      );

      if (hasInsufficientBalance(params.balanceBaseUnits, txAmountBaseUnits)) {
        return {
          disabled: true,
          label: "Insufficient CACAO",
          note: "The bond amount exceeds your available MayaChain CACAO balance.",
          amountBaseUnits: parsed.baseUnits,
          memo,
          txAmountBaseUnits,
        };
      }

      return {
        disabled: false,
        label: idleLabels[params.action],
        amountBaseUnits: parsed.baseUnits,
        memo,
        txAmountBaseUnits,
      };
    }

    case "operator.update-fee": {
      const fee = parseOperatorFeeBps(params.operatorFeeBps ?? "");
      if (fee.error) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: fee.error,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!fee.bps) {
        return {
          disabled: true,
          label: "Enter Operator Fee",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const parsed = parseCacaoAmountInput(
        params.amountInput || MIN_DUST_CACAO,
      );
      if (parsed.error || !parsed.baseUnits) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note:
            parsed.error ??
            `Fee updates require at least ${MIN_DUST_CACAO} CACAO.`,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const memo = buildPooledNodeMemo({
        action: "operator.update-fee",
        amountBaseUnits: parsed.baseUnits,
        nodeAddress,
        operatorFeeBps: fee.bps,
      });
      const txAmountBaseUnits = resolveTxAmountBaseUnits(
        "operator.update-fee",
        parsed.baseUnits,
        false,
      );

      if (hasInsufficientBalance(params.balanceBaseUnits, txAmountBaseUnits)) {
        return {
          disabled: true,
          label: "Insufficient CACAO",
          note: `Fee updates require at least ${MIN_DUST_CACAO} CACAO for the deposit memo.`,
          amountBaseUnits: parsed.baseUnits,
          memo,
          txAmountBaseUnits,
        };
      }

      return {
        disabled: false,
        label: idleLabels[params.action],
        amountBaseUnits: parsed.baseUnits,
        memo,
        txAmountBaseUnits,
      };
    }

    case "operator.remove-provider": {
      const provider = params.selectedRemoveProvider;
      if (!provider) {
        return {
          disabled: true,
          label: "Select Provider",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const normalizedStatus = params.node.status.trim().toLowerCase();
      if (normalizedStatus !== "standby") {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: "Provider removal is only allowed while the node is churned out (standby).",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const providerPosition = getConnectedProviderPosition(
        params.node,
        provider.bondAddress,
      );
      const requiredBond = providerPosition.poolSumBaseUnits;

      const parsed = parseCacaoAmountInput(params.amountInput);
      if (parsed.error) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: parsed.error,
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }
      if (!parsed.baseUnits) {
        return {
          disabled: true,
          label: "Enter Refund Amount",
          note: requiredBond
            ? `Refund the provider's full bond (${formatCompactBaseUnits(requiredBond)} CACAO) to remove them.`
            : "Enter the provider bond amount to refund.",
          amountBaseUnits: null,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      if (requiredBond && parsed.baseUnits !== requiredBond) {
        return {
          disabled: true,
          label: idleLabels[params.action],
          note: `Removal requires refunding the provider's full bond of ${formatCompactBaseUnits(requiredBond)} CACAO.`,
          amountBaseUnits: parsed.baseUnits,
          memo: null,
          txAmountBaseUnits: null,
        };
      }

      const memo = buildPooledNodeMemo({
        action: "operator.remove-provider",
        amountBaseUnits: parsed.baseUnits,
        nodeAddress,
        providerAddress: provider.bondAddress,
      });
      const txAmountBaseUnits = resolveTxAmountBaseUnits(
        "operator.remove-provider",
        parsed.baseUnits,
        false,
      );

      if (hasInsufficientBalance(params.balanceBaseUnits, txAmountBaseUnits)) {
        return {
          disabled: true,
          label: "Insufficient CACAO",
          note: `Provider removal requires at least ${MIN_DUST_CACAO} CACAO for the deposit memo.`,
          amountBaseUnits: parsed.baseUnits,
          memo,
          txAmountBaseUnits,
        };
      }

      return {
        disabled: false,
        label: idleLabels[params.action],
        amountBaseUnits: parsed.baseUnits,
        memo,
        txAmountBaseUnits,
      };
    }
  }
}

function formatCompactBaseUnits(value: string): string {
  return formatBaseUnits(value, POOLED_NODE_CACAO_DECIMALS) || "0";
}
