import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Chain } from "@vultisig/sdk";
import type { WalletSession } from "#/wallet";
import {
  WalletManagerMenuContent,
  downloadWalletExportFile,
  shouldShowWalletManagerDebugControls,
} from "./WalletManager";

function collectText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join("");
  }
  if (typeof node === "object" && "props" in node) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return collectText(element.props.children);
  }
  return "";
}

function findElementsByType<TProps>(
  node: ReactNode,
  type: string,
): Array<ReactElement<TProps>> {
  if (node == null || typeof node === "boolean") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => findElementsByType<TProps>(child, type));
  }
  if (typeof node === "object" && "type" in node && "props" in node) {
    const element = node as ReactElement<TProps & { children?: ReactNode }>;
    const matches: Array<ReactElement<TProps>> = [];

    if (element.type === type) {
      matches.push(element as ReactElement<TProps>);
    }

    return [...matches, ...findElementsByType<TProps>(element.props.children, type)];
  }
  return [];
}

function findButtonByText(node: ReactNode, pattern: RegExp) {
  return findElementsByType<{ children?: ReactNode; onClick?: () => void }>(
    node,
    "button",
  ).find((button) => pattern.test(collectText(button.props.children)));
}

function createSdkSession(overrides: Partial<WalletSession> = {}): WalletSession {
  return {
    id: "sdk-vault",
    source: "sdk",
    kind: "vault",
    label: "Primary Vault",
    status: "ready",
    capabilities: [
      "accounts.connect",
      "addresses.list",
      "balances.list",
      "vault.export",
      "vault.lock",
      "vault.unlock",
    ],
    chains: [Chain.Ethereum, Chain.MayaChain],
    accounts: [{ chain: Chain.Ethereum, address: "0xabc" }],
    addresses: {
      [Chain.Ethereum]: "0xabc",
      [Chain.MayaChain]: "maya1abc",
    },
    vaultMeta: {
      id: "sdk-vault",
      name: "Primary Vault",
      type: "fast",
      isEncrypted: true,
    },
    ...overrides,
  };
}

function createExtensionSession(
  overrides: Partial<WalletSession> = {},
): WalletSession {
  return {
    id: "extension:vultisig",
    source: "extension",
    kind: "extension",
    label: "Vultisig Extension",
    status: "ready",
    capabilities: ["accounts.connect", "addresses.list", "balances.list"],
    chains: [Chain.Ethereum],
    accounts: [{ chain: Chain.Ethereum, address: "0xdef" }],
    addresses: {
      [Chain.Ethereum]: "0xdef",
    },
    ...overrides,
  };
}

function createMenuProps(
  overrides: Partial<Parameters<typeof WalletManagerMenuContent>[0]> = {},
) {
  const activeSession =
    "activeSession" in overrides ? overrides.activeSession ?? null : createSdkSession();
  const sessions = overrides.sessions ?? (activeSession ? [activeSession] : []);

  return {
    activeSession,
    sessions,
    activeSessionId: overrides.activeSessionId ?? activeSession?.id ?? null,
    availableChains:
      overrides.availableChains ?? [Chain.Ethereum, Chain.MayaChain],
    actionChain: overrides.actionChain ?? Chain.Ethereum,
    canConnect: overrides.canConnect ?? true,
    canFetchData: overrides.canFetchData ?? true,
    canExport: overrides.canExport ?? true,
    showDebugControls: overrides.showDebugControls ?? false,
    unlockSessionId: overrides.unlockSessionId ?? null,
    unlockPassword: overrides.unlockPassword ?? "",
    isUnlocking: overrides.isUnlocking ?? false,
    unlockError: overrides.unlockError ?? "",
    onUnlockPasswordChange: overrides.onUnlockPasswordChange ?? vi.fn(),
    onUnlockSubmit: overrides.onUnlockSubmit ?? vi.fn(),
    onUnlockClose: overrides.onUnlockClose ?? vi.fn(),
    isExportModalOpen: overrides.isExportModalOpen ?? false,
    exportPassword: overrides.exportPassword ?? "",
    isExporting: overrides.isExporting ?? false,
    exportError: overrides.exportError ?? "",
    onExportPasswordChange: overrides.onExportPasswordChange ?? vi.fn(),
    onExportSubmit: overrides.onExportSubmit ?? vi.fn(),
    onExportOpen: overrides.onExportOpen ?? vi.fn(),
    onExportClose: overrides.onExportClose ?? vi.fn(),
    onCreateVault: overrides.onCreateVault ?? vi.fn(),
    onSessionClick: overrides.onSessionClick ?? vi.fn(),
    onSelectChain: overrides.onSelectChain ?? vi.fn(),
    onConnect: overrides.onConnect ?? vi.fn(),
    onRefreshData: overrides.onRefreshData ?? vi.fn(),
    onToggleVaultLock: overrides.onToggleVaultLock ?? vi.fn(),
    onInitialize: overrides.onInitialize ?? vi.fn(),
    onRefreshSessions: overrides.onRefreshSessions ?? vi.fn(),
  };
}

describe("WalletManagerMenuContent", () => {
  it("renders the user-facing create and export actions for sdk vaults", () => {
    const tree = WalletManagerMenuContent(createMenuProps());
    const text = collectText(tree);

    expect(text).toContain("Active Vault");
    expect(text).toContain("Create Vault");
    expect(text).toContain("Export Vault");
    expect(text).toContain("Switch Wallet Session");
    expect(text).toContain("Refresh Data");
  });

  it("wires the create vault button to the supplied callback", () => {
    const onCreateVault = vi.fn();
    const tree = WalletManagerMenuContent(createMenuProps({ onCreateVault }));
    const button = findButtonByText(tree, /create vault/i);

    expect(button).toBeTruthy();

    button?.props.onClick?.();

    expect(onCreateVault).toHaveBeenCalledTimes(1);
  });

  it("shows the export placeholder instead of a button for extension sessions", () => {
    const extensionSession = createExtensionSession();
    const tree = WalletManagerMenuContent(
      createMenuProps({
        activeSession: extensionSession,
        sessions: [extensionSession],
        canExport: false,
        availableChains: [Chain.Ethereum],
        actionChain: Chain.Ethereum,
      }),
    );
    const text = collectText(tree);

    expect(text).toContain("Vultisig Extension");
    expect(text).toContain("Export is available for the active SDK vault.");
    expect(findButtonByText(tree, /export vault/i)).toBeUndefined();
  });

  it("surfaces the export modal state and forwards submit handlers", () => {
    const onExportSubmit = vi.fn((e: { preventDefault?: () => void }) => {
      e.preventDefault?.();
    });
    const tree = WalletManagerMenuContent(
      createMenuProps({
        isExportModalOpen: true,
        exportPassword: "BackupPassword123!",
        exportError: "Backup failed",
        onExportSubmit,
      }),
    );
    const forms = findElementsByType<{ onSubmit?: (e: unknown) => void }>(
      tree,
      "form",
    );
    const exportForm = forms[0];
    const text = collectText(tree);

    expect(text).toContain("Export Vault Backup");
    expect(text).toContain("Backup failed");

    exportForm?.props.onSubmit?.({ preventDefault: vi.fn() });

    expect(onExportSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps the locked-session unlock flow visible and clickable", () => {
    const lockedSession = createSdkSession({
      id: "locked-vault",
      label: "Locked Vault",
      status: "locked",
    });
    const onSessionClick = vi.fn();
    const tree = WalletManagerMenuContent(
      createMenuProps({
        sessions: [createSdkSession(), lockedSession],
        unlockSessionId: lockedSession.id,
        unlockPassword: "secret",
        onSessionClick,
      }),
    );
    const lockedButton = findButtonByText(tree, /locked vault/i);
    const text = collectText(tree);

    expect(text).toContain("Unlock Vault");
    expect(text).toContain("Unlock & Switch Session");

    lockedButton?.props.onClick?.();

    expect(onSessionClick).toHaveBeenCalledWith("locked-vault", "locked");
  });

  it("renders the empty-state create action when no active session exists", () => {
    const tree = WalletManagerMenuContent(
      createMenuProps({
        activeSession: null,
        sessions: [],
        activeSessionId: null,
        canConnect: false,
        canFetchData: false,
        canExport: false,
      }),
    );
    const text = collectText(tree);

    expect(text).toContain("No active vault");
    expect(text).toContain("No active session detected.");
    expect(text).toContain("Create New Vault");
  });

  it("shows and wires debug controls only when requested", () => {
    const onInitialize = vi.fn();
    const onRefreshSessions = vi.fn();
    const tree = WalletManagerMenuContent(
      createMenuProps({
        showDebugControls: true,
        onInitialize,
        onRefreshSessions,
      }),
    );
    const initializeButton = findButtonByText(tree, /^initialize$/i);
    const refreshButton = findButtonByText(tree, /^refresh$/i);
    const text = collectText(tree);

    expect(text).toContain("Debug");

    initializeButton?.props.onClick?.();
    refreshButton?.props.onClick?.();

    expect(onInitialize).toHaveBeenCalledTimes(1);
    expect(onRefreshSessions).toHaveBeenCalledTimes(1);
  });
});

describe("WalletManager helpers", () => {
  it("downloads exported vault data through the provided DOM dependencies", () => {
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const click = vi.fn();
    const anchor = {
      href: "",
      download: "",
      click,
    } as unknown as HTMLAnchorElement;
    const createElement = vi.fn(() => anchor);
    const createObjectURL = vi.fn(() => "blob:wallet-export");
    const revokeObjectURL = vi.fn();

    downloadWalletExportFile(
      { filename: "backup.vult", data: "vault-backup-data" },
      {
        documentLike: {
          createElement,
          body: {
            appendChild,
            removeChild,
          },
        },
        urlLike: {
          createObjectURL,
          revokeObjectURL,
        },
      },
    );

    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("blob:wallet-export");
    expect(anchor.download).toBe("backup.vult");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:wallet-export");
  });

  it("hides debug controls by default and enables them for dev mode or ?dev=true", () => {
    expect(shouldShowWalletManagerDebugControls(false, "")).toBe(false);
    expect(shouldShowWalletManagerDebugControls(true, "")).toBe(true);
    expect(shouldShowWalletManagerDebugControls(false, "?dev=true")).toBe(true);
  });
});
