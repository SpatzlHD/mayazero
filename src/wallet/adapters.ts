import { Chain, Vultisig } from "@vultisig/sdk";
import {
  canSwitchChainInExtension,
  getChainDefinition,
  getChainsForExtensionProvider,
  getExtensionProviderKey,
  resolveChainFromExtensionChainId,
  supportedWalletChains,
  type ExtensionProviderKey,
} from "./chains";
import { WalletCapabilityError } from "./errors";
import type {
  WalletAccount,
  WalletChain,
  WalletCommandMap,
  WalletCommandName,
  WalletCommandResult,
  WalletExecuteOptions,
  WalletOperation,
  WalletSession,
} from "./types";

type EventHandler = (...args: unknown[]) => void;

export type ExtensionProviderLike = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: EventHandler) => void;
  removeListener?: (event: string, handler: EventHandler) => void;
};

export type ExtensionNamespaceLike = Partial<
  Record<ExtensionProviderKey | "chain", ExtensionProviderLike | undefined>
> & {
  ethereum?: ExtensionProviderLike;
  thorchain?: ExtensionProviderLike;
  mayachain?: ExtensionProviderLike;
  solana?: ExtensionProviderLike;
  getVault?: () => Promise<unknown>;
};

export type ExtensionWindowLike = {
  ethereum?: ExtensionProviderLike;
  thorchain?: ExtensionProviderLike;
  solana?: ExtensionProviderLike;
  bitcoin?: ExtensionProviderLike;
  bitcoincash?: ExtensionProviderLike;
  dash?: ExtensionProviderLike;
  dogecoin?: ExtensionProviderLike;
  litecoin?: ExtensionProviderLike;
  zcash?: ExtensionProviderLike;
  cosmos?: ExtensionProviderLike;
  maya?: ExtensionProviderLike;
  mayachain?: ExtensionProviderLike;
  chain?: ExtensionProviderLike;
  vultisig?: ExtensionNamespaceLike;
};

export type SdkVaultLike = {
  id: string;
  name: string;
  type: "fast" | "secure";
  isEncrypted: boolean;
  chains: WalletChain[];
  localPartyId?: string;
  createdAt?: number;
  isUnlocked: () => boolean;
  loadPreferences: () => Promise<void>;
  address: (chain: WalletChain) => Promise<string>;
  addresses: (chains?: WalletChain[]) => Promise<Record<string, string>>;
  balance: (chain: WalletChain, tokenId?: string) => Promise<unknown>;
  balances: (
    chains?: WalletChain[],
    includeTokens?: boolean,
  ) => Promise<Record<string, unknown>>;
  balancesWithPrices?: (
    chains?: WalletChain[],
    includeTokens?: boolean,
    fiatCurrency?: string,
  ) => Promise<Record<string, unknown>>;
  portfolio: (fiatCurrency?: string) => Promise<unknown>;
  send: (params: {
    chain: WalletChain;
    to: string;
    amount: string;
    symbol?: string;
    memo?: string;
    dryRun?: boolean;
  }) => Promise<unknown>;
  getTxStatus: (params: {
    chain: WalletChain;
    txHash: string;
  }) => Promise<unknown>;
  signMessage: (
    message: string,
    chain?: WalletChain,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
  prepareSendTx: (params: {
    coin: WalletCommandMap["tx.prepare.send"]["input"]["coin"];
    receiver: string;
    amount: bigint;
    memo?: string;
    feeSettings?: Record<string, unknown>;
  }) => Promise<unknown>;
  prepareSignAminoTx?: (params: {
    chain: WalletCommandMap["tx.prepare.amino"]["input"]["chain"];
    coin: WalletCommandMap["tx.prepare.amino"]["input"]["coin"];
    msgs: WalletCommandMap["tx.prepare.amino"]["input"]["msgs"];
    fee: WalletCommandMap["tx.prepare.amino"]["input"]["fee"];
    memo?: string;
  }) => Promise<unknown>;
  extractMessageHashes?: (payload: unknown) => Promise<string[]>;
  sign: (
    payload: unknown,
    options?: {
      signal?: AbortSignal;
      onQRCodeReady?: (qrPayload: string) => void;
      onDeviceJoined?: (
        deviceId: string,
        totalJoined: number,
        required: number,
      ) => void;
      onProgress?: (step: {
        step: string;
        progress: number;
        message: string;
        mode?: string;
      }) => void;
    },
  ) => Promise<unknown>;
  signBytes: (
    options: {
      chain: WalletChain;
      data: Uint8Array | string;
    },
    signingOptions?: {
      signal?: AbortSignal;
      onQRCodeReady?: (qrPayload: string) => void;
      onDeviceJoined?: (
        deviceId: string,
        totalJoined: number,
        required: number,
      ) => void;
      onProgress?: (step: {
        step: string;
        progress: number;
        message: string;
        mode?: string;
      }) => void;
    },
  ) => Promise<unknown>;
  broadcastTx: (params: {
    chain: WalletChain;
    keysignPayload: unknown;
    signature: unknown;
  }) => Promise<string>;
  broadcastRawTx: (params: {
    chain: WalletChain;
    rawTx: string;
  }) => Promise<string>;
  getSwapQuote: (
    params: WalletCommandMap["swap.quote"]["input"],
  ) => Promise<unknown>;
  prepareSwapTx: (
    params: WalletCommandMap["swap.prepare"]["input"],
  ) => Promise<unknown>;
  discoverTokens: (chain: WalletChain) => Promise<unknown>;
  validateTransaction: (payload: unknown) => Promise<unknown>;
  simulateTransaction: (payload: unknown) => Promise<unknown>;
  export: (password?: string) => Promise<{ filename: string; data: string }>;
  lock: () => void;
  unlock: (password: string) => Promise<void>;
  rename: (name: string) => Promise<void>;
  delete: () => Promise<void>;
};

export type SdkClientLike = {
  initialize: () => Promise<void>;
  dispose: () => void;
  listVaults: () => Promise<SdkVaultLike[]>;
  setActiveVault: (vault: SdkVaultLike | null) => Promise<void>;
  getActiveVault: () => Promise<SdkVaultLike | null>;
  validateSeedphrase: (mnemonic: string) => Promise<{
    valid: boolean;
    wordCount: number;
    invalidWords?: string[];
    error?: string;
  }>;
  discoverChainsFromSeedphrase: (
    mnemonic: string,
    chains?: Chain[],
    onProgress?: (progress: {
      phase: string;
      chain?: Chain;
      chainsProcessed: number;
      chainsTotal: number;
      chainsWithBalance: Chain[];
      message: string;
    }) => void,
  ) => Promise<{
    results: Array<{
      chain: Chain;
      address: string;
      balance: string;
      decimals: number;
      symbol: string;
      hasBalance: boolean;
    }>;
    usePhantomSolanaPath: boolean;
  }>;
  createFastVault: (options: {
    name: string;
    email: string;
    password: string;
    onProgress?: (step: {
      step: string;
      progress: number;
      message: string;
    }) => void;
    signal?: AbortSignal;
  }) => Promise<string>;
  createFastVaultFromSeedphrase: (options: {
    mnemonic: string;
    name: string;
    email: string;
    password: string;
    chains?: Chain[];
    discoverChains?: boolean;
    chainsToScan?: Chain[];
    signal?: AbortSignal;
    onProgress?: (step: {
      step: string;
      progress: number;
      message: string;
    }) => void;
    onChainDiscovery?: (progress: {
      phase: string;
      chain?: Chain;
      chainsProcessed: number;
      chainsTotal: number;
      chainsWithBalance: Chain[];
      message: string;
    }) => void;
    usePhantomSolanaPath?: boolean;
  }) => Promise<string>;
  verifyVault: (vaultId: string, code: string) => Promise<SdkVaultLike>;
  createSecureVault: (options: {
    name: string;
    password?: string;
    devices: number;
    threshold?: number;
    signal?: AbortSignal;
    onProgress?: (step: {
      step: string;
      progress: number;
      message: string;
    }) => void;
    onQRCodeReady?: (qrPayload: string) => void;
    onDeviceJoined?: (
      deviceId: string,
      totalJoined: number,
      required: number,
    ) => void;
  }) => Promise<{ vault: SdkVaultLike; vaultId: string; sessionId: string }>;
  joinSecureVault: (
    qrPayload: string,
    options: {
      mnemonic?: string;
      password?: string;
      devices?: number;
      usePhantomSolanaPath?: boolean;
      signal?: AbortSignal;
      onProgress?: (step: {
        step: string;
        progress: number;
        message: string;
      }) => void;
      onDeviceJoined?: (
        deviceId: string,
        totalJoined: number,
        required: number,
      ) => void;
    },
  ) => Promise<{ vault: SdkVaultLike; vaultId: string }>;
  importVault: (
    vultContent: string,
    password?: string,
  ) => Promise<SdkVaultLike>;
};

export type ManagerOperationController = {
  operation: WalletOperation;
  update: (patch: Partial<WalletOperation>) => void;
};

export type WalletSessionAdapter = {
  readonly id: string;
  readonly capabilities: WalletCommandName[];
  refreshSession: () => Promise<WalletSession | null>;
  execute: <K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
    context: {
      activeChain: WalletChain | null;
      operation?: ManagerOperationController;
    },
  ) => Promise<WalletCommandResult<K>>;
  dispose?: () => void;
};

const sdkCapabilities: WalletCommandName[] = [
  "accounts.connect",
  "accounts.list",
  "address.get",
  "addresses.list",
  "balance.get",
  "balances.list",
  "chain.get",
  "chain.switch",
  "tx.send",
  "tx.query",
  "tx.status",
  "message.sign",
  "portfolio.get",
  "tx.prepare.send",
  "tx.prepare.amino",
  "tx.sign",
  "tx.sign.bytes",
  "tx.broadcast",
  "tx.broadcast.raw",
  "swap.quote",
  "swap.prepare",
  "tokens.discover",
  "security.validate",
  "security.simulate",
  "vault.export",
  "vault.lock",
  "vault.unlock",
  "vault.rename",
];

const extensionCapabilities: WalletCommandName[] = [
  "accounts.connect",
  "accounts.list",
  "address.get",
  "addresses.list",
  "balance.get",
  "balances.list",
  "chain.get",
  "chain.switch",
  "tx.send",
  "tx.query",
  "tx.status",
  "message.sign",
  "provider.request",
];

function toWalletAccounts(
  addresses: Partial<Record<WalletChain, string>>,
): WalletAccount[] {
  return Object.entries(addresses).flatMap(([chain, address]) =>
    address ? [{ chain: chain as WalletChain, address }] : [],
  );
}

function getChainAwareAddress(
  addresses: Partial<Record<WalletChain, string>>,
  chain: WalletChain,
): string | null {
  return addresses[chain] ?? null;
}

function assertCapability(
  adapter: WalletSessionAdapter,
  command: WalletCommandName,
): void {
  if (!adapter.capabilities.includes(command)) {
    throw new WalletCapabilityError(command, adapter.id);
  }
}

export class SdkVaultAdapter implements WalletSessionAdapter {
  readonly id: string;
  readonly capabilities = sdkCapabilities;

  constructor(readonly vault: SdkVaultLike) {
    this.id = vault.id;
  }

  async refreshSession(): Promise<WalletSession> {
    await this.vault.loadPreferences();
    const addresses = (await this.vault.addresses(
      this.getSessionChains(),
    )) as Partial<Record<WalletChain, string>>;

    return {
      id: this.id,
      source: "sdk",
      kind: "vault",
      label: this.vault.name,
      status:
        this.vault.isEncrypted && !this.vault.isUnlocked() ? "locked" : "ready",
      capabilities: this.capabilities,
      chains: this.getSessionChains(),
      addresses,
      accounts: toWalletAccounts(addresses),
      vaultMeta: {
        id: this.vault.id,
        name: this.vault.name,
        type: this.vault.type,
        isEncrypted: this.vault.isEncrypted,
        localPartyId: this.vault.localPartyId,
        createdAt: this.vault.createdAt,
      },
    };
  }

  async execute<K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
    context: {
      activeChain: WalletChain | null;
      operation?: ManagerOperationController;
    },
  ): Promise<WalletCommandResult<K>> {
    assertCapability(this, command);

    switch (command) {
      case "accounts.connect":
      case "accounts.list": {
        const input =
          options.input as WalletCommandMap["accounts.connect"]["input"];
        const chain = input.chain;
        const addresses = (await this.vault.addresses(
          chain ? [chain] : this.getSessionChains(),
        )) as Partial<Record<WalletChain, string>>;

        return {
          accounts: toWalletAccounts(addresses),
        } as WalletCommandResult<K>;
      }
      case "address.get": {
        const input = options.input as WalletCommandMap["address.get"]["input"];
        const address = await this.vault.address(input.chain);
        return {
          chain: input.chain,
          address,
        } as WalletCommandResult<K>;
      }
      case "addresses.list": {
        const input =
          options.input as WalletCommandMap["addresses.list"]["input"];
        const addresses = (await this.vault.addresses(input.chains)) as Partial<
          Record<WalletChain, string>
        >;
        return { addresses } as WalletCommandResult<K>;
      }
      case "balance.get": {
        const input = options.input as WalletCommandMap["balance.get"]["input"];
        const balance = await this.vault.balance(input.chain, input.tokenId);
        return {
          chain: input.chain,
          balance:
            balance as WalletCommandMap["balance.get"]["output"]["balance"],
        } as WalletCommandResult<K>;
      }
      case "balances.list": {
        const input =
          options.input as WalletCommandMap["balances.list"]["input"];
        const balances =
          input.withPrices && this.vault.balancesWithPrices
            ? await this.vault.balancesWithPrices(
                input.chains,
                input.includeTokens,
                input.fiatCurrency,
              )
            : await this.vault.balances(input.chains, input.includeTokens);
        return {
          balances:
            balances as WalletCommandMap["balances.list"]["output"]["balances"],
        } as WalletCommandResult<K>;
      }
      case "chain.get": {
        return {
          chain: context.activeChain ?? this.getSessionChains()[0] ?? null,
        } as WalletCommandResult<K>;
      }
      case "chain.switch": {
        const input =
          options.input as WalletCommandMap["chain.switch"]["input"];
        return { chain: input.chain } as WalletCommandResult<K>;
      }
      case "tx.send": {
        const input = options.input as WalletCommandMap["tx.send"]["input"];
        if ("transaction" in input) {
          throw new WalletCapabilityError(
            command,
            this.id,
            "SDK tx.send expects simple send params in v1",
          );
        }

        const result = await this.vault.send(input);
        return { result } as WalletCommandResult<K>;
      }
      case "tx.query":
      case "tx.status": {
        const input = options.input as WalletCommandMap["tx.status"]["input"];
        const status = await this.vault.getTxStatus({
          chain: input.chain,
          txHash: input.txHash,
        });
        if (command === "tx.query") {
          return { transaction: status } as WalletCommandResult<K>;
        }

        return { status } as WalletCommandResult<K>;
      }
      case "message.sign": {
        const input =
          options.input as WalletCommandMap["message.sign"]["input"];
        if ("address" in input) {
          const signature = await this.vault.signMessage(
            input.message,
            input.chain,
            { signal: options.signal },
          );
          return { signature } as WalletCommandResult<K>;
        }

        const signature = await this.vault.signMessage(
          input.message,
          input.chain,
          { signal: options.signal },
        );
        return { signature } as WalletCommandResult<K>;
      }
      case "portfolio.get": {
        const input =
          options.input as WalletCommandMap["portfolio.get"]["input"];
        const portfolio = await this.vault.portfolio(input.fiatCurrency);
        return {
          portfolio:
            portfolio as WalletCommandMap["portfolio.get"]["output"]["portfolio"],
        } as WalletCommandResult<K>;
      }
      case "tx.prepare.send": {
        const input =
          options.input as WalletCommandMap["tx.prepare.send"]["input"];
        const payload = await this.vault.prepareSendTx(input);

        return {
          payload:
            payload as WalletCommandMap["tx.prepare.send"]["output"]["payload"],
        } as WalletCommandResult<K>;
      }
      case "tx.prepare.amino": {
        const input =
          options.input as WalletCommandMap["tx.prepare.amino"]["input"];
        if (!this.vault.prepareSignAminoTx) {
          throw new WalletCapabilityError(
            command,
            this.id,
            "SDK vault does not support custom Cosmos amino transaction preparation",
          );
        }

        const payload = await this.vault.prepareSignAminoTx(input);
        return {
          payload:
            payload as WalletCommandMap["tx.prepare.amino"]["output"]["payload"],
        } as WalletCommandResult<K>;
      }
      case "tx.sign": {
        const input = options.input as WalletCommandMap["tx.sign"]["input"];
        const chain =
          input.chain ??
          context.activeChain ??
          this.getSessionChains()[0] ??
          null;
        if (!chain) {
          throw new WalletCapabilityError(
            command,
            this.id,
            "Unable to resolve chain for SDK signing",
          );
        }

        const messageHashes = input.messageHashes
          ? input.messageHashes
          : this.vault.extractMessageHashes
            ? await this.vault.extractMessageHashes(input.payload)
            : undefined;

        const signature = await this.vault.sign(
          {
            transaction: input.payload,
            chain,
            ...(messageHashes ? { messageHashes } : {}),
          },
          {
            signal: options.signal,
            onQRCodeReady: (qrPayload) => {
              context.operation?.update({ qrPayload });
            },
            onDeviceJoined: (deviceId, joined, required) => {
              context.operation?.update({
                deviceJoin: { deviceId, joined, required },
              });
            },
            onProgress: (step) => {
              context.operation?.update({
                progress: {
                  step: step.step,
                  value: step.progress,
                  message: step.message,
                  mode: step.mode,
                },
              });
            },
          },
        );
        return {
          signature:
            signature as WalletCommandMap["tx.sign"]["output"]["signature"],
        } as WalletCommandResult<K>;
      }
      case "tx.sign.bytes": {
        const input =
          options.input as WalletCommandMap["tx.sign.bytes"]["input"];
        const signature = await this.vault.signBytes(
          {
            chain: input.chain,
            data: input.data,
          },
          {
            signal: options.signal,
            onQRCodeReady: (qrPayload) => {
              context.operation?.update({ qrPayload });
            },
            onDeviceJoined: (deviceId, joined, required) => {
              context.operation?.update({
                deviceJoin: { deviceId, joined, required },
              });
            },
            onProgress: (step) => {
              context.operation?.update({
                progress: {
                  step: step.step,
                  value: step.progress,
                  message: step.message,
                  mode: step.mode,
                },
              });
            },
          },
        );
        return {
          signature:
            signature as WalletCommandMap["tx.sign.bytes"]["output"]["signature"],
        } as WalletCommandResult<K>;
      }
      case "tx.broadcast": {
        const input =
          options.input as WalletCommandMap["tx.broadcast"]["input"];
        const txHash = await this.vault.broadcastTx({
          chain: input.chain,
          keysignPayload: input.payload,
          signature: input.signature,
        });
        return { txHash } as WalletCommandResult<K>;
      }
      case "tx.broadcast.raw": {
        const input =
          options.input as WalletCommandMap["tx.broadcast.raw"]["input"];
        const txHash = await this.vault.broadcastRawTx({
          chain: input.chain,
          rawTx: input.rawTx,
        });
        return { txHash } as WalletCommandResult<K>;
      }
      case "swap.quote": {
        const input = options.input as WalletCommandMap["swap.quote"]["input"];
        const quote = await this.vault.getSwapQuote(input);
        return {
          quote: quote as WalletCommandMap["swap.quote"]["output"]["quote"],
        } as WalletCommandResult<K>;
      }
      case "swap.prepare": {
        const input =
          options.input as WalletCommandMap["swap.prepare"]["input"];
        const payload = await this.vault.prepareSwapTx(input);
        return {
          payload:
            payload as WalletCommandMap["swap.prepare"]["output"]["payload"],
        } as WalletCommandResult<K>;
      }
      case "tokens.discover": {
        const input =
          options.input as WalletCommandMap["tokens.discover"]["input"];
        const tokens = await this.vault.discoverTokens(input.chain);
        return {
          tokens:
            tokens as WalletCommandMap["tokens.discover"]["output"]["tokens"],
        } as WalletCommandResult<K>;
      }
      case "security.validate": {
        const input =
          options.input as WalletCommandMap["security.validate"]["input"];
        const validation = await this.vault.validateTransaction(input.payload);
        return {
          validation:
            validation as WalletCommandMap["security.validate"]["output"]["validation"],
        } as WalletCommandResult<K>;
      }
      case "security.simulate": {
        const input =
          options.input as WalletCommandMap["security.simulate"]["input"];
        const simulation = await this.vault.simulateTransaction(input.payload);
        return {
          simulation:
            simulation as WalletCommandMap["security.simulate"]["output"]["simulation"],
        } as WalletCommandResult<K>;
      }
      case "vault.export": {
        const input =
          options.input as WalletCommandMap["vault.export"]["input"];
        const exported = await this.vault.export(input.password);
        return exported as WalletCommandResult<K>;
      }
      case "vault.lock": {
        this.vault.lock();
        return { locked: true } as WalletCommandResult<K>;
      }
      case "vault.unlock": {
        const input =
          options.input as WalletCommandMap["vault.unlock"]["input"];
        await this.vault.unlock(input.password);
        return { unlocked: true } as WalletCommandResult<K>;
      }
      case "vault.rename": {
        const input =
          options.input as WalletCommandMap["vault.rename"]["input"];
        await this.vault.rename(input.name);
        return { name: input.name } as WalletCommandResult<K>;
      }
      case "provider.request": {
        throw new WalletCapabilityError(command, this.id);
      }
    }
  }

  private getSessionChains(): WalletChain[] {
    return [...supportedWalletChains];
  }
}

type ResolvedExtensionProviders = Partial<
  Record<ExtensionProviderKey, ExtensionProviderLike>
>;

function getExtensionProvider(
  extensionWindow: ExtensionWindowLike | undefined,
  providerKey: ExtensionProviderKey,
): ExtensionProviderLike | undefined {
  if (!extensionWindow) {
    return undefined;
  }

  const namespaceProvider =
    extensionWindow.vultisig?.[providerKey] ??
    (providerKey === "mayachain"
      ? extensionWindow.vultisig?.maya
      : undefined) ??
    (providerKey === "maya" ? extensionWindow.vultisig?.mayachain : undefined);
  if (namespaceProvider) {
    return namespaceProvider;
  }

  return (
    extensionWindow[providerKey] ??
    (providerKey === "mayachain" ? extensionWindow.maya : undefined) ??
    (providerKey === "maya" ? extensionWindow.mayachain : undefined)
  );
}

function resolveExtensionProviders(
  extensionWindow: ExtensionWindowLike | undefined,
): ResolvedExtensionProviders {
  return {
    ethereum:
      getExtensionProvider(extensionWindow, "ethereum") ??
      extensionWindow?.ethereum,
    cosmos: getExtensionProvider(extensionWindow, "cosmos"),
    thorchain:
      getExtensionProvider(extensionWindow, "thorchain") ??
      extensionWindow?.thorchain,
    maya: getExtensionProvider(extensionWindow, "maya"),
    mayachain: getExtensionProvider(extensionWindow, "mayachain"),
    solana:
      getExtensionProvider(extensionWindow, "solana") ??
      extensionWindow?.solana,
    bitcoin: getExtensionProvider(extensionWindow, "bitcoin"),
    bitcoincash: getExtensionProvider(extensionWindow, "bitcoincash"),
    dash: getExtensionProvider(extensionWindow, "dash"),
    dogecoin: getExtensionProvider(extensionWindow, "dogecoin"),
    litecoin: getExtensionProvider(extensionWindow, "litecoin"),
    zcash: getExtensionProvider(extensionWindow, "zcash"),
  };
}

async function requestAccountsForChain(
  providers: ResolvedExtensionProviders,
  chain: WalletChain,
): Promise<string[]> {
  const providerKey = getExtensionProviderKey(chain);
  if (!providerKey) {
    return [];
  }

  const provider = providers[providerKey];
  if (!provider) {
    return [];
  }

  if (providerKey === "ethereum") {
    return (await provider.request({ method: "eth_accounts" })) as string[];
  }

  const chainDefinition = getChainDefinition(chain);
  if (providerKey === "cosmos") {
    const chainId = (await provider.request({ method: "chain_id" })) as string;
    if (
      chainDefinition.extensionChainId &&
      chainId !== chainDefinition.extensionChainId &&
      canSwitchChainInExtension(chain)
    ) {
      return [];
    }
  }

  return (await provider.request({ method: "get_accounts" })) as string[];
}

function directExtensionChainForProvider(
  providerKey: ExtensionProviderKey,
): WalletChain | null {
  const directChains = getChainsForExtensionProvider(providerKey);
  return directChains.length === 1 ? (directChains[0] ?? null) : null;
}

function normalizeExtensionProviderKeyAlias(
  providerKey: ExtensionProviderKey,
): ExtensionProviderKey {
  return providerKey === "maya" ? "mayachain" : providerKey;
}

export class ExtensionWalletAdapter implements WalletSessionAdapter {
  readonly id = "extension:vultisig";
  readonly capabilities = extensionCapabilities;
  private providers: ResolvedExtensionProviders = {};
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly extensionWindow: ExtensionWindowLike | undefined,
    private readonly onInvalidate?: () => void,
  ) {}

  async refreshSession(): Promise<WalletSession | null> {
    this.providers = resolveExtensionProviders(this.extensionWindow);
    this.setupEventListeners();

    const providerEntries = Object.entries(this.providers).filter(
      ([, provider]) => provider,
    ) as Array<[ExtensionProviderKey, ExtensionProviderLike]>;

    if (!providerEntries.length) {
      return null;
    }

    const chains = providerEntries.flatMap(([providerKey]) =>
      getChainsForExtensionProvider(providerKey),
    );
    const uniqueChains = [...new Set(chains)] as WalletChain[];
    const addresses: Partial<Record<WalletChain, string>> = {};

    for (const chain of uniqueChains) {
      const accounts = await requestAccountsForChain(
        this.providers,
        chain,
      ).catch(() => []);
      const [address] = accounts;
      if (address) {
        addresses[chain] = address;
      }
    }

    return {
      id: this.id,
      source: "extension",
      kind: "extension",
      label: "Vultisig Extension",
      status: "ready",
      capabilities: this.capabilities,
      chains: uniqueChains,
      addresses,
      accounts: toWalletAccounts(addresses),
    };
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  async execute<K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
    context: {
      activeChain: WalletChain | null;
      operation?: ManagerOperationController;
    },
  ): Promise<WalletCommandResult<K>> {
    assertCapability(this, command);

    switch (command) {
      case "accounts.connect": {
        const input =
          options.input as WalletCommandMap["accounts.connect"]["input"];
        const chain = input.chain ?? null;

        if (chain) {
          const provider = this.getProviderForChain(chain);
          const method =
            getExtensionProviderKey(chain) === "ethereum"
              ? "eth_requestAccounts"
              : "request_accounts";
          const accounts = (await provider.request({ method })) as string[];
          return {
            accounts: accounts.map((address) => ({ chain, address })),
          } as WalletCommandResult<K>;
        }

        const providerKeys = [
          ...new Set(
            Object.entries(this.providers)
              .filter(([, provider]) => Boolean(provider))
              .map(([providerKey]) =>
                normalizeExtensionProviderKeyAlias(
                  providerKey as ExtensionProviderKey,
                ),
              ),
          ),
        ];
        const connectedAccounts: WalletAccount[] = [];

        for (const providerKey of providerKeys) {
          const provider = this.providers[providerKey];
          if (!provider) {
            continue;
          }

          const method =
            providerKey === "ethereum"
              ? "eth_requestAccounts"
              : "request_accounts";
          const addresses = (await provider.request({ method })) as string[];
          const chains = getChainsForExtensionProvider(providerKey);
          for (const resolvedChain of chains) {
            for (const address of addresses) {
              connectedAccounts.push({ chain: resolvedChain, address });
            }
          }
        }

        return {
          accounts: connectedAccounts,
        } as WalletCommandResult<K>;
      }
      case "accounts.list": {
        const input =
          options.input as WalletCommandMap["accounts.list"]["input"];
        const chain = input.chain ?? context.activeChain;
        if (chain) {
          const accounts = await requestAccountsForChain(this.providers, chain);
          return {
            accounts: accounts.map((address) => ({ chain, address })),
          } as WalletCommandResult<K>;
        }

        const session = await this.refreshSession();
        return {
          accounts: session?.accounts ?? [],
        } as WalletCommandResult<K>;
      }
      case "address.get": {
        const input = options.input as WalletCommandMap["address.get"]["input"];
        const accounts = await requestAccountsForChain(
          this.providers,
          input.chain,
        );
        const [address] = accounts;
        if (!address) {
          throw new Error(`No extension account connected for ${input.chain}`);
        }

        return {
          chain: input.chain,
          address,
        } as WalletCommandResult<K>;
      }
      case "addresses.list": {
        const input =
          options.input as WalletCommandMap["addresses.list"]["input"];
        const session = await this.refreshSession();
        const addresses = session?.addresses ?? {};
        if (!input.chains?.length) {
          return { addresses } as WalletCommandResult<K>;
        }

        const filtered = input.chains.reduce<
          Partial<Record<WalletChain, string>>
        >(
          (
            result: Partial<Record<WalletChain, string>>,
            chain: WalletChain,
          ) => {
            const address = getChainAwareAddress(addresses, chain);
            if (address) {
              result[chain] = address;
            }
            return result;
          },
          {},
        );
        return { addresses: filtered } as WalletCommandResult<K>;
      }
      case "balance.get": {
        const input = options.input as WalletCommandMap["balance.get"]["input"];
        if (getExtensionProviderKey(input.chain) !== "ethereum") {
          throw new WalletCapabilityError(
            command,
            this.id,
            "Extension balance lookup is only implemented for Ethereum-compatible chains",
          );
        }

        const provider = this.getProviderForChain(input.chain);
        const address =
          input.tokenId ??
          (await requestAccountsForChain(this.providers, input.chain))[0];
        if (!address) {
          throw new Error("No connected extension address for balance lookup");
        }

        const amount = (await provider.request({
          method: "eth_getBalance",
          params: [address, "latest"],
        })) as string;
        return {
          chain: input.chain,
          balance: {
            amount,
            formattedAmount: amount,
            decimals: 18,
            symbol: "ETH",
            chainId: input.chain,
          },
        } as WalletCommandResult<K>;
      }
      case "balances.list": {
        const input =
          options.input as WalletCommandMap["balances.list"]["input"];
        const chain = input.chains?.[0] ?? context.activeChain;
        if (!chain) {
          return { balances: {} } as WalletCommandResult<K>;
        }

        const balance = await this.execute(
          "balance.get",
          {
            input: { chain },
            sessionId: options.sessionId,
            signal: options.signal,
            track: false,
          } as WalletExecuteOptions<"balance.get">,
          context,
        );
        return {
          balances: { [chain]: balance.balance },
        } as WalletCommandResult<K>;
      }
      case "chain.get": {
        const preferredChain = context.activeChain;
        if (preferredChain) {
          const providerKey = getExtensionProviderKey(preferredChain);
          if (providerKey === "ethereum") {
            const provider = this.getProviderForChain(preferredChain);
            const chainId = (await provider.request({
              method: "eth_chainId",
            })) as string;
            return {
              chain:
                resolveChainFromExtensionChainId("ethereum", chainId) ??
                preferredChain,
            } as WalletCommandResult<K>;
          }

          if (providerKey === "cosmos") {
            const provider = this.getProviderForChain(preferredChain);
            const chainId = (await provider.request({
              method: "chain_id",
            })) as string;
            return {
              chain:
                resolveChainFromExtensionChainId("cosmos", chainId) ??
                preferredChain,
            } as WalletCommandResult<K>;
          }

          return { chain: preferredChain } as WalletCommandResult<K>;
        }

        return { chain: null } as WalletCommandResult<K>;
      }
      case "chain.switch": {
        const input =
          options.input as WalletCommandMap["chain.switch"]["input"];
        const providerKey = getExtensionProviderKey(input.chain);
        if (!providerKey) {
          throw new WalletCapabilityError(command, this.id);
        }

        const provider = this.getProviderForChain(input.chain);
        const chainId = getChainDefinition(input.chain).extensionChainId;
        if (!chainId || !canSwitchChainInExtension(input.chain)) {
          return { chain: input.chain } as WalletCommandResult<K>;
        }

        await provider.request({
          method:
            providerKey === "ethereum"
              ? "wallet_switchEthereumChain"
              : "wallet_switch_chain",
          params: [{ chainId }],
        });
        return { chain: input.chain } as WalletCommandResult<K>;
      }
      case "tx.send": {
        const input = options.input as WalletCommandMap["tx.send"]["input"];
        if (!("transaction" in input)) {
          throw new WalletCapabilityError(
            command,
            this.id,
            "Extension tx.send expects provider transaction payloads",
          );
        }

        const provider = this.getProviderForChain(input.chain);
        const providerKey = getExtensionProviderKey(input.chain);
        const method =
          providerKey === "ethereum"
            ? "eth_sendTransaction"
            : input.mode === "deposit"
              ? "deposit_transaction"
              : "send_transaction";
        const params = [input.transaction];
        const result = await provider.request({ method, params });
        return { result } as WalletCommandResult<K>;
      }
      case "tx.query":
      case "tx.status": {
        const input = options.input as WalletCommandMap["tx.status"]["input"];
        const provider = this.getProviderForChain(input.chain);
        const method =
          getExtensionProviderKey(input.chain) === "ethereum"
            ? "eth_getTransactionByHash"
            : "get_transaction_by_hash";
        const result = await provider.request({
          method,
          params: [input.txHash],
        });
        if (command === "tx.query") {
          return { transaction: result } as WalletCommandResult<K>;
        }

        return { status: result } as WalletCommandResult<K>;
      }
      case "message.sign": {
        const input =
          options.input as WalletCommandMap["message.sign"]["input"];
        const chain = input.chain ?? context.activeChain ?? Chain.Ethereum;
        if (
          getExtensionProviderKey(chain) !== "ethereum" ||
          !("address" in input)
        ) {
          throw new WalletCapabilityError(
            command,
            this.id,
            "Extension message signing currently uses Ethereum personal_sign",
          );
        }

        const provider = this.getProviderForChain(chain);
        const signature = (await provider.request({
          method: "personal_sign",
          params: [input.message, input.address],
        })) as string;
        return { signature } as WalletCommandResult<K>;
      }
      case "provider.request": {
        const input =
          options.input as WalletCommandMap["provider.request"]["input"];
        const chain = input.chain ?? context.activeChain ?? Chain.Ethereum;
        const provider = this.getProviderForChain(chain);
        const result = await provider.request({
          method: input.method,
          params: input.params,
        });
        return { result } as WalletCommandResult<K>;
      }
      case "portfolio.get":
      case "tx.prepare.send":
      case "tx.prepare.amino":
      case "tx.sign":
      case "tx.sign.bytes":
      case "tx.broadcast":
      case "tx.broadcast.raw":
      case "swap.quote":
      case "swap.prepare":
      case "tokens.discover":
      case "security.validate":
      case "security.simulate":
      case "vault.export":
      case "vault.lock":
      case "vault.unlock":
      case "vault.rename": {
        throw new WalletCapabilityError(command, this.id);
      }
    }
  }

  private setupEventListeners(): void {
    this.dispose();
    if (!this.onInvalidate) {
      return;
    }

    const handlers = [
      "accountsChanged",
      "chainChanged",
      "CONNECT",
      "DISCONNECT",
      "connect",
      "disconnect",
    ];
    for (const provider of Object.values(this.providers)) {
      if (!provider?.on) {
        continue;
      }

      for (const event of handlers) {
        const handler = () => {
          this.onInvalidate?.();
        };
        provider.on(event, handler);
        this.unsubscribers.push(() =>
          provider.removeListener?.(event, handler),
        );
      }
    }
  }

  private getProviderForChain(chain: WalletChain): ExtensionProviderLike {
    const providerKey = getExtensionProviderKey(chain);
    if (!providerKey) {
      throw new WalletCapabilityError(
        "provider.request",
        this.id,
        `No extension provider configured for ${chain}`,
      );
    }

    const provider = this.providers[providerKey];
    if (!provider) {
      throw new WalletCapabilityError(
        "provider.request",
        this.id,
        `Extension provider ${providerKey} is unavailable`,
      );
    }

    if (providerKey === "cosmos") {
      return provider;
    }

    const directChain = directExtensionChainForProvider(providerKey);
    if (
      directChain &&
      directChain !== chain &&
      canSwitchChainInExtension(chain)
    ) {
      throw new WalletCapabilityError(
        "provider.request",
        this.id,
        `Provider ${providerKey} does not match ${chain}`,
      );
    }

    return provider;
  }
}

export function createDefaultSdkClient(
  options?: ConstructorParameters<typeof Vultisig>[0],
): SdkClientLike {
  return new Vultisig(options) as unknown as SdkClientLike;
}
