import {
  canSwitchChainInExtension,
  getChainDefinition,
  getChainsForExtensionProvider,
  getExtensionProviderKey,
  resolveChainFromExtensionChainId,
  type ExtensionProviderKey,
} from './chains'
import { WalletChain } from './chain-types'
import { WalletCapabilityError } from './errors'
import type {
  WalletAccount,
  WalletCommandMap,
  WalletCommandName,
  WalletCommandResult,
  WalletExecuteOptions,
  WalletSession,
} from './types'
import type {
  ManagerOperationController,
  WalletSessionAdapter,
} from './adapter-types'

type EventHandler = (...args: unknown[]) => void

export type ExtensionProviderLike = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: EventHandler) => void
  removeListener?: (event: string, handler: EventHandler) => void
}

export type ExtensionNamespaceLike = Partial<
  Record<ExtensionProviderKey | 'chain', ExtensionProviderLike | undefined>
> & {
  ethereum?: ExtensionProviderLike
  thorchain?: ExtensionProviderLike
  mayachain?: ExtensionProviderLike
  solana?: ExtensionProviderLike
  getVault?: () => Promise<unknown>
}

export type ExtensionWindowLike = {
  ethereum?: ExtensionProviderLike
  thorchain?: ExtensionProviderLike
  solana?: ExtensionProviderLike
  bitcoin?: ExtensionProviderLike
  bitcoincash?: ExtensionProviderLike
  dash?: ExtensionProviderLike
  dogecoin?: ExtensionProviderLike
  litecoin?: ExtensionProviderLike
  zcash?: ExtensionProviderLike
  cardano?: ExtensionProviderLike
  cosmos?: ExtensionProviderLike
  maya?: ExtensionProviderLike
  mayachain?: ExtensionProviderLike
  chain?: ExtensionProviderLike
  vultisig?: ExtensionNamespaceLike
}

const extensionCapabilities: WalletCommandName[] = [
  'accounts.connect',
  'accounts.list',
  'address.get',
  'addresses.list',
  'balance.get',
  'balances.list',
  'chain.get',
  'chain.switch',
  'tx.send',
  'tx.query',
  'tx.status',
  'message.sign',
  'provider.request',
]

function toWalletAccounts(
  addresses: Partial<Record<WalletChain, string>>,
): WalletAccount[] {
  return Object.entries(addresses).flatMap(([chain, address]) =>
    address ? [{ chain: chain as WalletChain, address }] : [],
  )
}

function getChainAwareAddress(
  addresses: Partial<Record<WalletChain, string>>,
  chain: WalletChain,
): string | null {
  return addresses[chain] ?? null
}

function assertCapability(
  adapter: WalletSessionAdapter,
  command: WalletCommandName,
): void {
  if (!adapter.capabilities.includes(command)) {
    throw new WalletCapabilityError(command, adapter.id)
  }
}

type ResolvedExtensionProviders = Partial<
  Record<ExtensionProviderKey, ExtensionProviderLike>
>

function getExtensionProvider(
  extensionWindow: ExtensionWindowLike | undefined,
  providerKey: ExtensionProviderKey,
): ExtensionProviderLike | undefined {
  if (!extensionWindow) {
    return undefined
  }

  const namespaceProvider =
    extensionWindow.vultisig?.[providerKey] ??
    (providerKey === 'mayachain'
      ? extensionWindow.vultisig?.maya
      : undefined) ??
    (providerKey === 'maya' ? extensionWindow.vultisig?.mayachain : undefined)
  if (namespaceProvider) {
    return namespaceProvider
  }

  return (
    extensionWindow[providerKey] ??
    (providerKey === 'mayachain' ? extensionWindow.maya : undefined) ??
    (providerKey === 'maya' ? extensionWindow.mayachain : undefined)
  )
}

function resolveExtensionProviders(
  extensionWindow: ExtensionWindowLike | undefined,
): ResolvedExtensionProviders {
  return {
    ethereum:
      getExtensionProvider(extensionWindow, 'ethereum') ??
      extensionWindow?.ethereum,
    cosmos: getExtensionProvider(extensionWindow, 'cosmos'),
    thorchain:
      getExtensionProvider(extensionWindow, 'thorchain') ??
      extensionWindow?.thorchain,
    maya: getExtensionProvider(extensionWindow, 'maya'),
    mayachain: getExtensionProvider(extensionWindow, 'mayachain'),
    solana:
      getExtensionProvider(extensionWindow, 'solana') ??
      extensionWindow?.solana,
    bitcoin: getExtensionProvider(extensionWindow, 'bitcoin'),
    bitcoincash: getExtensionProvider(extensionWindow, 'bitcoincash'),
    dash: getExtensionProvider(extensionWindow, 'dash'),
    dogecoin: getExtensionProvider(extensionWindow, 'dogecoin'),
    litecoin: getExtensionProvider(extensionWindow, 'litecoin'),
    zcash: getExtensionProvider(extensionWindow, 'zcash'),
    cardano: getExtensionProvider(extensionWindow, 'cardano'),
  }
}

async function requestAccountsForChain(
  providers: ResolvedExtensionProviders,
  chain: WalletChain,
): Promise<string[]> {
  const providerKey = getExtensionProviderKey(chain)
  if (!providerKey) {
    return []
  }

  const provider = providers[providerKey]
  if (!provider) {
    return []
  }

  if (providerKey === 'ethereum') {
    return (await provider.request({ method: 'eth_accounts' })) as string[]
  }

  const chainDefinition = getChainDefinition(chain)
  if (providerKey === 'cosmos') {
    const chainId = (await provider.request({ method: 'chain_id' })) as string
    if (
      chainDefinition.extensionChainId &&
      chainId !== chainDefinition.extensionChainId &&
      canSwitchChainInExtension(chain)
    ) {
      return []
    }
  }

  return (await provider.request({ method: 'get_accounts' })) as string[]
}

function directExtensionChainForProvider(
  providerKey: ExtensionProviderKey,
): WalletChain | null {
  const directChains = getChainsForExtensionProvider(providerKey)
  return directChains.length === 1 ? (directChains[0] ?? null) : null
}

function normalizeExtensionProviderKeyAlias(
  providerKey: ExtensionProviderKey,
): ExtensionProviderKey {
  return providerKey === 'maya' ? 'mayachain' : providerKey
}

export class ExtensionWalletAdapter implements WalletSessionAdapter {
  readonly id = 'extension:vultisig'
  readonly source = 'extension' as const
  readonly kind = 'extension' as const
  readonly label = 'Vultisig Extension'
  readonly capabilities = extensionCapabilities
  private providers: ResolvedExtensionProviders = {}
  private unsubscribers: Array<() => void> = []

  constructor(
    private readonly extensionWindow: ExtensionWindowLike | undefined,
    private readonly onInvalidate?: () => void,
  ) {}

  async refreshSession(): Promise<WalletSession | null> {
    this.providers = resolveExtensionProviders(this.extensionWindow)
    this.setupEventListeners()

    const providerEntries = Object.entries(this.providers).filter(
      ([, provider]) => provider,
    ) as Array<[ExtensionProviderKey, ExtensionProviderLike]>

    if (!providerEntries.length) {
      return null
    }

    const chains = providerEntries.flatMap(([providerKey]) =>
      getChainsForExtensionProvider(providerKey),
    )
    const uniqueChains = [...new Set(chains)] as WalletChain[]
    const addresses: Partial<Record<WalletChain, string>> = {}

    for (const chain of uniqueChains) {
      const accounts = await requestAccountsForChain(
        this.providers,
        chain,
      ).catch(() => [])
      const [address] = accounts
      if (address) {
        addresses[chain] = address
      }
    }

    return {
      id: this.id,
      source: 'extension',
      kind: 'extension',
      label: 'Vultisig Extension',
      status: 'ready',
      capabilities: this.capabilities,
      chains: uniqueChains,
      addresses,
      accounts: toWalletAccounts(addresses),
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe()
    }
    this.unsubscribers = []
  }

  async execute<K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
    context: {
      activeChain: WalletChain | null
      operation?: ManagerOperationController
    },
  ): Promise<WalletCommandResult<K>> {
    assertCapability(this, command)

    switch (command) {
      case 'accounts.connect': {
        const input =
          options.input as WalletCommandMap['accounts.connect']['input']
        const chain = input.chain ?? null

        if (chain) {
          const provider = this.getProviderForChain(chain)
          const method =
            getExtensionProviderKey(chain) === 'ethereum'
              ? 'eth_requestAccounts'
              : 'request_accounts'
          const accounts = (await provider.request({ method })) as string[]
          return {
            accounts: accounts.map((address) => ({ chain, address })),
          } as WalletCommandResult<K>
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
        ]
        const connectedAccounts: WalletAccount[] = []

        for (const providerKey of providerKeys) {
          const provider = this.providers[providerKey]
          if (!provider) {
            continue
          }

          const method =
            providerKey === 'ethereum'
              ? 'eth_requestAccounts'
              : 'request_accounts'
          const addresses = (await provider.request({ method })) as string[]
          const chains = getChainsForExtensionProvider(providerKey)
          for (const resolvedChain of chains) {
            for (const address of addresses) {
              connectedAccounts.push({ chain: resolvedChain, address })
            }
          }
        }

        return {
          accounts: connectedAccounts,
        } as WalletCommandResult<K>
      }
      case 'accounts.list': {
        const input =
          options.input as WalletCommandMap['accounts.list']['input']
        const chain = input.chain ?? context.activeChain
        if (chain) {
          const accounts = await requestAccountsForChain(this.providers, chain)
          return {
            accounts: accounts.map((address) => ({ chain, address })),
          } as WalletCommandResult<K>
        }

        const session = await this.refreshSession()
        return {
          accounts: session?.accounts ?? [],
        } as WalletCommandResult<K>
      }
      case 'address.get': {
        const input = options.input as WalletCommandMap['address.get']['input']
        const accounts = await requestAccountsForChain(
          this.providers,
          input.chain,
        )
        const [address] = accounts
        if (!address) {
          throw new Error(`No extension account connected for ${input.chain}`)
        }

        return {
          chain: input.chain,
          address,
        } as WalletCommandResult<K>
      }
      case 'addresses.list': {
        const input =
          options.input as WalletCommandMap['addresses.list']['input']
        const session = await this.refreshSession()
        const addresses = session?.addresses ?? {}
        if (!input.chains?.length) {
          return { addresses } as WalletCommandResult<K>
        }

        const filtered = input.chains.reduce<
          Partial<Record<WalletChain, string>>
        >(
          (
            result: Partial<Record<WalletChain, string>>,
            chain: WalletChain,
          ) => {
            const address = getChainAwareAddress(addresses, chain)
            if (address) {
              result[chain] = address
            }
            return result
          },
          {},
        )
        return { addresses: filtered } as WalletCommandResult<K>
      }
      case 'balance.get': {
        const input = options.input as WalletCommandMap['balance.get']['input']
        if (getExtensionProviderKey(input.chain) !== 'ethereum') {
          throw new WalletCapabilityError(
            command,
            this.id,
            'Extension balance lookup is only implemented for Ethereum-compatible chains',
          )
        }

        const provider = this.getProviderForChain(input.chain)
        const address =
          input.tokenId ??
          (await requestAccountsForChain(this.providers, input.chain))[0]
        if (!address) {
          throw new Error('No connected extension address for balance lookup')
        }

        const amount = (await provider.request({
          method: 'eth_getBalance',
          params: [address, 'latest'],
        })) as string
        return {
          chain: input.chain,
          balance: {
            amount,
            formattedAmount: amount,
            decimals: 18,
            symbol: 'ETH',
            chainId: input.chain,
          },
        } as WalletCommandResult<K>
      }
      case 'balances.list': {
        const input =
          options.input as WalletCommandMap['balances.list']['input']
        const chain = input.chains?.[0] ?? context.activeChain
        if (!chain) {
          return { balances: {} } as WalletCommandResult<K>
        }

        const balance = await this.execute(
          'balance.get',
          {
            input: { chain },
            sessionId: options.sessionId,
            signal: options.signal,
            track: false,
          } as WalletExecuteOptions<'balance.get'>,
          context,
        )
        return {
          balances: { [chain]: balance.balance },
        } as WalletCommandResult<K>
      }
      case 'chain.get': {
        const preferredChain = context.activeChain
        if (preferredChain) {
          const providerKey = getExtensionProviderKey(preferredChain)
          if (providerKey === 'ethereum') {
            const provider = this.getProviderForChain(preferredChain)
            const chainId = (await provider.request({
              method: 'eth_chainId',
            })) as string
            return {
              chain:
                resolveChainFromExtensionChainId('ethereum', chainId) ??
                preferredChain,
            } as WalletCommandResult<K>
          }

          if (providerKey === 'cosmos') {
            const provider = this.getProviderForChain(preferredChain)
            const chainId = (await provider.request({
              method: 'chain_id',
            })) as string
            return {
              chain:
                resolveChainFromExtensionChainId('cosmos', chainId) ??
                preferredChain,
            } as WalletCommandResult<K>
          }

          return { chain: preferredChain } as WalletCommandResult<K>
        }

        return { chain: null } as WalletCommandResult<K>
      }
      case 'chain.switch': {
        const input =
          options.input as WalletCommandMap['chain.switch']['input']
        const providerKey = getExtensionProviderKey(input.chain)
        if (!providerKey) {
          throw new WalletCapabilityError(command, this.id)
        }

        const provider = this.getProviderForChain(input.chain)
        const chainId = getChainDefinition(input.chain).extensionChainId
        if (!chainId || !canSwitchChainInExtension(input.chain)) {
          return { chain: input.chain } as WalletCommandResult<K>
        }

        await provider.request({
          method:
            providerKey === 'ethereum'
              ? 'wallet_switchEthereumChain'
              : 'wallet_switch_chain',
          params: [{ chainId }],
        })
        return { chain: input.chain } as WalletCommandResult<K>
      }
      case 'tx.send': {
        const input = options.input as WalletCommandMap['tx.send']['input']
        if (!('transaction' in input)) {
          throw new WalletCapabilityError(
            command,
            this.id,
            'Extension tx.send expects provider transaction payloads',
          )
        }

        const provider = this.getProviderForChain(input.chain)
        const providerKey = getExtensionProviderKey(input.chain)
        const method =
          providerKey === 'ethereum'
            ? 'eth_sendTransaction'
            : input.mode === 'deposit'
              ? 'deposit_transaction'
              : 'send_transaction'
        const params = [input.transaction]
        const result = await provider.request({ method, params })
        return { result } as WalletCommandResult<K>
      }
      case 'tx.query':
      case 'tx.status': {
        const input = options.input as WalletCommandMap['tx.status']['input']
        const provider = this.getProviderForChain(input.chain)
        const providerKey = getExtensionProviderKey(input.chain)
        const result =
          providerKey === 'ethereum'
            ? await getExtensionEvmTransactionStatus(provider, input.txHash)
            : await provider.request({
                method: 'get_transaction_by_hash',
                params: [input.txHash],
              })
        if (command === 'tx.query') {
          return { transaction: result } as WalletCommandResult<K>
        }

        return { status: result } as WalletCommandResult<K>
      }
      case 'message.sign': {
        const input =
          options.input as WalletCommandMap['message.sign']['input']
        const chain = input.chain ?? context.activeChain ?? WalletChain.Ethereum
        if (
          getExtensionProviderKey(chain) !== 'ethereum' ||
          !('address' in input)
        ) {
          throw new WalletCapabilityError(
            command,
            this.id,
            'Extension message signing currently uses Ethereum personal_sign',
          )
        }

        const provider = this.getProviderForChain(chain)
        const signature = (await provider.request({
          method: 'personal_sign',
          params: [input.message, input.address],
        })) as string
        return { signature } as WalletCommandResult<K>
      }
      case 'provider.request': {
        const input =
          options.input as WalletCommandMap['provider.request']['input']
        const chain = input.chain ?? context.activeChain ?? WalletChain.Ethereum
        const provider = this.getProviderForChain(chain)
        const result = await provider.request({
          method: input.method,
          params: input.params,
        })
        return { result } as WalletCommandResult<K>
      }
      case 'portfolio.get':
      case 'tx.prepare.send':
      case 'tx.prepare.amino':
      case 'tx.sign':
      case 'tx.sign.bytes':
      case 'tx.broadcast':
      case 'tx.broadcast.raw':
      case 'swap.quote':
      case 'swap.prepare':
      case 'tokens.discover':
      case 'security.validate':
      case 'security.simulate':
      case 'keystore.lock':
      case 'keystore.unlock':
      case 'keystore.delete':
      default: {
        throw new WalletCapabilityError(command, this.id)
      }
    }
  }

  private setupEventListeners(): void {
    this.dispose()
    if (!this.onInvalidate) {
      return
    }

    const handlers = [
      'accountsChanged',
      'chainChanged',
      'CONNECT',
      'DISCONNECT',
      'connect',
      'disconnect',
    ]
    for (const provider of Object.values(this.providers)) {
      if (!provider?.on) {
        continue
      }

      for (const event of handlers) {
        const handler = () => {
          this.onInvalidate?.()
        }
        provider.on(event, handler)
        this.unsubscribers.push(() =>
          provider.removeListener?.(event, handler),
        )
      }
    }
  }

  private getProviderForChain(chain: WalletChain): ExtensionProviderLike {
    const providerKey = getExtensionProviderKey(chain)
    if (!providerKey) {
      throw new WalletCapabilityError(
        'provider.request',
        this.id,
        `No extension provider configured for ${chain}`,
      )
    }

    const provider = this.providers[providerKey]
    if (!provider) {
      throw new WalletCapabilityError(
        'provider.request',
        this.id,
        `Extension provider ${providerKey} is unavailable`,
      )
    }

    if (providerKey === 'cosmos') {
      return provider
    }

    const directChain = directExtensionChainForProvider(providerKey)
    if (
      directChain &&
      directChain !== chain &&
      canSwitchChainInExtension(chain)
    ) {
      throw new WalletCapabilityError(
        'provider.request',
        this.id,
        `Provider ${providerKey} does not match ${chain}`,
      )
    }

    return provider
  }
}

async function getExtensionEvmTransactionStatus(
  provider: ExtensionProviderLike,
  txHash: string,
): Promise<unknown> {
  const [transaction, receipt] = await Promise.all([
    provider.request({
      method: 'eth_getTransactionByHash',
      params: [txHash],
    }),
    provider
      .request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      })
      .catch(() => null),
  ])

  if (
    transaction &&
    typeof transaction === 'object' &&
    receipt &&
    typeof receipt === 'object'
  ) {
    return { ...transaction, receipt }
  }

  if (receipt && typeof receipt === 'object') {
    return { receipt }
  }

  return transaction
}
