import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { WalletChain as Chain } from "#/wallet/chain-types";
import type { WalletSession } from "#/wallet";
import {
  WalletManagerMenuContent,
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

function createKeystoreSession(
  overrides: Partial<WalletSession> = {},
): WalletSession {
  return {
    id: "keystore:primary",
    source: "keystore",
    kind: "keystore",
    label: "Primary Wallet",
    status: "ready",
    capabilities: [
      "accounts.connect",
      "addresses.list",
      "balances.list",
      "keystore.lock",
      "keystore.unlock",
    ],
    chains: [Chain.Ethereum, Chain.MayaChain],
    accounts: [{ chain: Chain.Ethereum, address: "0xabc" }],
    addresses: {
      [Chain.Ethereum]: "0xabc",
      [Chain.MayaChain]: "maya1abc",
    },
    keystoreMeta: {
      id: "keystore:primary",
      label: "Primary Wallet",
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
    "activeSession" in overrides ? overrides.activeSession ?? null : createKeystoreSession();
  const sessions = overrides.sessions ?? (activeSession ? [activeSession] : []);

  return {
    activeSession,
    sessions,
    activeSessionId: overrides.activeSessionId ?? activeSession?.id ?? null,
    availableChains:
      overrides.availableChains ?? [Chain.Ethereum, Chain.MayaChain],
    actionChain: overrides.actionChain ?? Chain.Ethereum,
    canConnect: overrides.canConnect ?? false,
    canFetchData: overrides.canFetchData ?? true,
    showDebugControls: overrides.showDebugControls ?? false,
    unlockSessionId: overrides.unlockSessionId ?? null,
    unlockPassword: overrides.unlockPassword ?? "",
    isUnlocking: overrides.isUnlocking ?? false,
    unlockError: overrides.unlockError ?? "",
    onUnlockPasswordChange: overrides.onUnlockPasswordChange ?? vi.fn(),
    onUnlockSubmit: overrides.onUnlockSubmit ?? vi.fn(),
    onUnlockClose: overrides.onUnlockClose ?? vi.fn(),
    onImportKeystore: overrides.onImportKeystore ?? vi.fn(),
    onConnectWallet: overrides.onConnectWallet ?? vi.fn(),
    onSessionClick: overrides.onSessionClick ?? vi.fn(),
    onSelectChain: overrides.onSelectChain ?? vi.fn(),
    onConnect: overrides.onConnect ?? vi.fn(),
    onRefreshData: overrides.onRefreshData ?? vi.fn(),
    onToggleKeystoreLock: overrides.onToggleKeystoreLock ?? vi.fn(),
    onInitialize: overrides.onInitialize ?? vi.fn(),
    onRefreshSessions: overrides.onRefreshSessions ?? vi.fn(),
  };
}

describe("WalletManagerMenuContent", () => {
  it("renders import and connect actions for keystore sessions", () => {
    const tree = WalletManagerMenuContent(createMenuProps());
    const text = collectText(tree);

    expect(text).toContain("Wallet Manager");
    expect(text).toContain("Active Wallet");
    expect(text).toContain("Import Keystore");
    expect(text).toContain("Connect Wallet");
    expect(text).toContain("Local keystore");
    expect(text).toContain("Switch Wallet Session");
    expect(text).toContain("Refresh Data");
  });

  it("wires the import keystore button to the supplied callback", () => {
    const onImportKeystore = vi.fn();
    const tree = WalletManagerMenuContent(createMenuProps({ onImportKeystore }));
    const button = findButtonByText(tree, /import keystore/i);

    expect(button).toBeTruthy();

    button?.props.onClick?.();

    expect(onImportKeystore).toHaveBeenCalledTimes(1);
  });

  it("shows a connect button for extension sessions and wires it to the callback", () => {
    const extensionSession = createExtensionSession();
    const onConnect = vi.fn();
    const tree = WalletManagerMenuContent(
      createMenuProps({
        activeSession: extensionSession,
        sessions: [extensionSession],
        canConnect: true,
        availableChains: [Chain.Ethereum],
        actionChain: Chain.Ethereum,
        onConnect,
      }),
    );
    const connectButton = findButtonByText(tree, /connect extension/i);
    const text = collectText(tree);

    expect(text).toContain("Vultisig extension");
    expect(text).toContain("Connect Extension");

    connectButton?.props.onClick?.();

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("keeps the locked-session unlock flow visible and clickable", () => {
    const lockedSession = createKeystoreSession({
      id: "locked-wallet",
      label: "Locked Wallet",
      status: "locked",
    });
    const onSessionClick = vi.fn();
    const tree = WalletManagerMenuContent(
      createMenuProps({
        sessions: [createKeystoreSession(), lockedSession],
        unlockSessionId: lockedSession.id,
        unlockPassword: "secret",
        onSessionClick,
      }),
    );
    const lockedButton = findButtonByText(tree, /locked wallet/i);
    const text = collectText(tree);

    expect(text).toContain("Unlock Wallet");
    expect(text).toContain("Unlock & Switch Session");

    lockedButton?.props.onClick?.();

    expect(onSessionClick).toHaveBeenCalledWith("locked-wallet", "locked");
  });

  it("renders the empty-state import action when no active session exists", () => {
    const tree = WalletManagerMenuContent(
      createMenuProps({
        activeSession: null,
        sessions: [],
        activeSessionId: null,
        canConnect: false,
        canFetchData: false,
      }),
    );
    const text = collectText(tree);

    expect(text).toContain("No active wallet");
    expect(text).toContain("No active session detected.");
    expect(text).toContain("Import Keystore");
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
  it("hides debug controls by default and enables them for dev mode or ?dev=true", () => {
    expect(shouldShowWalletManagerDebugControls(false, "")).toBe(false);
    expect(shouldShowWalletManagerDebugControls(true, "")).toBe(true);
    expect(shouldShowWalletManagerDebugControls(false, "?dev=true")).toBe(true);
  });
});
