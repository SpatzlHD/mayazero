import {
  connectWalletConnect,
  disconnectWalletConnect,
  getWalletConnectSnapshot,
  walletConnectRequest,
} from './walletconnect-client'
import {
  walletChainToWalletConnectId,
  walletConnectNamespaceForChain,
  resolveWalletConnectAddressesFromCaip10,
} from './walletconnect-config'
import { prepareLocalSendTx, queryLocalTxStatus } from './local-signer'
import { fetchAddressBalances } from './balance-fetcher'
import { WalletCapabilityError } from './errors'
import { WalletChain } from './chain-types'
import { supportedWalletChains } from './chains'
import type {
  WalletAccount,
  WalletChain as WalletChainType,
  WalletCommandMap,
  WalletCommandName,
  WalletCommandResult,
  WalletExecuteOptions,
  WalletSession,
} from './types'
import type { ManagerOperationController, WalletSessionAdapter } from './adapter-types'

const walletConnectCapabilities: WalletCommandName[] = [
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
  'tx.prepare.send',
  'tx.sign',
  'tx.broadcast',
  'provider.request',
]

function toWalletAccounts(
  addresses: Partial<Record<WalletChainType, string>>,
): WalletAccount[] {
  return Object.entries(addresses).flatMap(([chain, address]) =>
    address ? [{ chain: chain as WalletChainType, address }] : [],
  )
}

function assertCapability(
  adapter: WalletSessionAdapter,
  command: WalletCommandName,
): void {
  if (!adapter.capabilities.includes(command)) {
    throw new WalletCapabilityError(command, adapter.id)
  }
}

function resolveWalletConnectAddresses(
  snapshot: NonNullable<ReturnType<typeof getWalletConnectSnapshot>>,
): Partial<Record<WalletChainType, string>> {
  if (snapshot.caipAccounts?.length > 0) {
    return resolveWalletConnectAddressesFromCaip10(snapshot.caipAccounts)
  }

  // Fallback for older snapshots/tests that only provide bare addresses.
  const addresses: Partial<Record<WalletChainType, string>> = {}
  for (const account of snapshot.accounts) {
    if (account.startsWith('0x')) {
      for (const chainId of snapshot.chains) {
        if (!chainId.startsWith('eip155:')) continue
        const walletChain = resolveWalletConnectAddressesFromCaip10([
          `${chainId}:${account}`,
        ])
        Object.assign(addresses, walletChain)
      }
      continue
    }

    for (const chainId of snapshot.chains) {
      if (!chainId.startsWith('cosmos:')) continue
      Object.assign(
        addresses,
        resolveWalletConnectAddressesFromCaip10([`${chainId}:${account}`]),
      )
    }
  }

  return addresses
}

export class WalletConnectAdapter implements WalletSessionAdapter {
  readonly id = 'walletconnect:session'
  readonly source = 'walletconnect' as const
  readonly kind = 'walletconnect' as const
  readonly capabilities = walletConnectCapabilities
  readonly label: string

  constructor(private readonly onSessionChange?: () => void) {
    this.label = getWalletConnectSnapshot()?.peerName ?? 'WalletConnect'
  }

  async refreshSession(): Promise<WalletSession | null> {
    const snapshot = getWalletConnectSnapshot()
    if (!snapshot) {
      return null
    }

    const addresses = resolveWalletConnectAddresses(snapshot)
    const chains = Object.keys(addresses) as WalletChainType[]

    return {
      id: this.id,
      source: this.source,
      kind: this.kind,
      label: snapshot.peerName,
      status: chains.length > 0 ? 'ready' : 'unavailable',
      capabilities: this.capabilities,
      chains: chains.length > 0 ? chains : [...supportedWalletChains],
      addresses,
      accounts: toWalletAccounts(addresses),
      walletConnectMeta: {
        topic: snapshot.topic,
        peerName: snapshot.peerName,
      },
    }
  }

  async execute<K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
    context: {
      activeChain: WalletChainType | null
      operation?: ManagerOperationController
    },
  ): Promise<WalletCommandResult<K>> {
    assertCapability(this, command)
    const snapshot = getWalletConnectSnapshot()
    if (!snapshot) {
      throw new WalletCapabilityError(command, this.id, 'WalletConnect session is not active.')
    }

    const session = await this.refreshSession()
    const addresses = session?.addresses ?? {}

    switch (command) {
      case 'accounts.connect': {
        const next = await connectWalletConnect()
        this.onSessionChange?.()
        return {
          accounts: toWalletAccounts(resolveWalletConnectAddresses(next)),
        } as WalletCommandResult<K>
      }
      case 'accounts.list':
        return {
          accounts: toWalletAccounts(addresses),
        } as WalletCommandResult<K>
      case 'address.get': {
        const input = options.input as WalletCommandMap['address.get']['input']
        const address = addresses[input.chain]
        if (!address) {
          throw new WalletCapabilityError(command, this.id)
        }
        return { chain: input.chain, address } as WalletCommandResult<K>
      }
      case 'addresses.list':
        return { addresses } as WalletCommandResult<K>
      case 'balance.get': {
        const input = options.input as WalletCommandMap['balance.get']['input']
        const address = addresses[input.chain]
        if (!address) {
          throw new WalletCapabilityError(command, this.id)
        }
        const response = await fetchAddressBalances({
          chain: input.chain,
          address,
        })
        const balanceAsset = response.balances[0]
        return {
          chain: input.chain,
          balance: {
            amount: balanceAsset?.amount ?? '0',
            formattedAmount: balanceAsset?.formattedAmount ?? '0',
            decimals: balanceAsset?.decimals ?? 0,
            symbol: balanceAsset?.symbol ?? '',
            chainId: input.chain,
          },
        } as WalletCommandResult<K>
      }
      case 'balances.list': {
        const input =
          options.input as WalletCommandMap['balances.list']['input']
        const chains = input.chains ?? (Object.keys(addresses) as WalletChainType[])
        const balances: Record<string, WalletCommandMap['balance.get']['output']['balance']> =
          {}
        await Promise.all(
          chains.map(async (chain) => {
            const address = addresses[chain]
            if (!address) return
            const response = await fetchAddressBalances({ chain, address })
            for (const asset of response.balances) {
              balances[`${chain}:${asset.id}`] = {
                amount: asset.amount,
                formattedAmount: asset.formattedAmount,
                decimals: asset.decimals,
                symbol: asset.symbol,
                chainId: chain,
              }
            }
          }),
        )
        return { balances } as WalletCommandResult<K>
      }
      case 'chain.get':
        return {
          chain: context.activeChain ?? (Object.keys(addresses)[0] as WalletChainType | undefined) ?? null,
        } as WalletCommandResult<K>
      case 'chain.switch': {
        const input =
          options.input as WalletCommandMap['chain.switch']['input']
        return { chain: input.chain } as WalletCommandResult<K>
      }
      case 'tx.prepare.send': {
        const input =
          options.input as WalletCommandMap['tx.prepare.send']['input']
        const payload = await prepareLocalSendTx(input)
        return { payload } as WalletCommandResult<K>
      }
      case 'tx.sign': {
        const input = options.input as WalletCommandMap['tx.sign']['input']
        const chain =
          input.chain ??
          context.activeChain ??
          (Object.keys(addresses)[0] as WalletChainType | undefined)
        if (!chain) {
          throw new WalletCapabilityError(command, this.id)
        }
        const wcChainId = walletChainToWalletConnectId(chain)
        const namespace = walletConnectNamespaceForChain(chain)
        if (!wcChainId || !namespace) {
          throw new WalletCapabilityError(command, this.id, `${chain} is not supported via WalletConnect`)
        }

        if (namespace === 'eip155') {
          const signature = await walletConnectRequest(wcChainId, 'personal_sign', [
            input.payload,
            addresses[chain],
          ])
          return {
            signature: {
              signature: String(signature),
              format: 'ECDSA',
            },
          } as WalletCommandResult<K>
        }

        const signature = await walletConnectRequest(wcChainId, 'cosmos_signDirect', {
          signerAddress: addresses[chain],
          signDoc: input.payload,
        })
        return {
          signature: {
            signature: JSON.stringify(signature),
            format: 'COSMOS',
          },
        } as WalletCommandResult<K>
      }
      case 'tx.broadcast': {
        const input =
          options.input as WalletCommandMap['tx.broadcast']['input']
        const wcChainId = walletChainToWalletConnectId(input.chain)
        if (!wcChainId) {
          throw new WalletCapabilityError(command, this.id)
        }
        if (input.chain === WalletChain.Ethereum || input.chain === WalletChain.Arbitrum) {
          const txHash = await walletConnectRequest(wcChainId, 'eth_sendTransaction', [
            input.payload,
          ])
          return { txHash: String(txHash) } as WalletCommandResult<K>
        }
        if (input.chain === WalletChain.Bitcoin) {
          const txHash = await walletConnectRequest(wcChainId, 'signPsbt', {
            ...(typeof input.payload === 'object' && input.payload !== null
              ? input.payload
              : { psbt: input.payload }),
            broadcast: true,
          })
          if (typeof txHash === 'object' && txHash !== null && 'txid' in txHash) {
            return { txHash: String((txHash as { txid: string }).txid) } as WalletCommandResult<K>
          }
          return { txHash: String(txHash) } as WalletCommandResult<K>
        }
        throw new WalletCapabilityError(
          command,
          this.id,
          'Cosmos broadcast via WalletConnect is not implemented yet.',
        )
      }
      case 'tx.send': {
        const input = options.input as WalletCommandMap['tx.send']['input']
        if (!('transaction' in input)) {
          throw new WalletCapabilityError(command, this.id)
        }
        const wcChainId = walletChainToWalletConnectId(input.chain)
        if (!wcChainId) {
          throw new WalletCapabilityError(command, this.id)
        }
        const result = await walletConnectRequest(
          wcChainId,
          'eth_sendTransaction',
          [input.transaction],
        )
        return { result } as WalletCommandResult<K>
      }
      case 'tx.query':
      case 'tx.status': {
        const input = options.input as WalletCommandMap['tx.status']['input']
        const status = await queryLocalTxStatus(input.chain, input.txHash)
        if (command === 'tx.query') {
          return { transaction: status } as WalletCommandResult<K>
        }
        return { status } as WalletCommandResult<K>
      }
      case 'message.sign': {
        const input =
          options.input as WalletCommandMap['message.sign']['input']
        const chain =
          ('chain' in input ? input.chain : undefined) ??
          context.activeChain ??
          (Object.keys(addresses)[0] as WalletChainType | undefined)
        if (!chain) {
          throw new WalletCapabilityError(command, this.id)
        }
        const wcChainId = walletChainToWalletConnectId(chain)
        if (!wcChainId) {
          throw new WalletCapabilityError(command, this.id)
        }
        const signature = await walletConnectRequest(wcChainId, 'personal_sign', [
          input.message,
          addresses[chain],
        ])
        return { signature: String(signature) } as WalletCommandResult<K>
      }
      case 'provider.request': {
        const input =
          options.input as WalletCommandMap['provider.request']['input']
        const chain = input.chain ?? context.activeChain
        const wcChainId = chain ? walletChainToWalletConnectId(chain) : null
        if (!wcChainId) {
          throw new WalletCapabilityError(command, this.id)
        }
        const result = await walletConnectRequest(wcChainId, input.method, input.params ?? [])
        return { result } as WalletCommandResult<K>
      }
      default:
        throw new WalletCapabilityError(command, this.id)
    }
  }
}

export async function disconnectWalletConnectSession(
  onSessionChange?: () => void,
): Promise<void> {
  await disconnectWalletConnect()
  onSessionChange?.()
}
