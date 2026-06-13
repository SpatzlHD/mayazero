import { fetchAddressBalances } from './balance-fetcher'
import {
  broadcastLocalTx,
  extractLocalMessageHashes,
  prepareLocalAminoTx,
  prepareLocalSendTx,
  queryLocalTxStatus,
  signLocalMessage,
  signLocalPayload,
} from './local-signer'
import type { StoredKeystoreRecord } from './keystore-store'
import { unlockStoredKeystoreMnemonic } from './keystore-store'
import { supportedWalletChains } from './chains'
import { WalletCapabilityError } from './errors'
import type {
  WalletAccount,
  WalletChain,
  WalletCommandMap,
  WalletCommandName,
  WalletCommandResult,
  WalletExecuteOptions,
  WalletSession,
} from './types'
import type { ManagerOperationController, WalletSessionAdapter } from './adapter-types'

const DEFAULT_UNLOCK_TTL_MS = 15 * 60 * 1000

const keystoreCapabilities: WalletCommandName[] = [
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
  'tx.prepare.amino',
  'tx.sign',
  'tx.sign.bytes',
  'tx.broadcast',
  'tx.broadcast.raw',
  'keystore.lock',
  'keystore.unlock',
  'keystore.delete',
]

function toWalletAccounts(
  addresses: Partial<Record<WalletChain, string>>,
): WalletAccount[] {
  return Object.entries(addresses).flatMap(([chain, address]) =>
    address ? [{ chain: chain as WalletChain, address }] : [],
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

export class LocalKeystoreAdapter implements WalletSessionAdapter {
  readonly id: string
  readonly source = 'keystore' as const
  readonly kind = 'keystore' as const
  readonly capabilities = keystoreCapabilities
  readonly label: string

  private mnemonic: string | null = null
  private unlockExpiresAt = 0
  private readonly unlockTtlMs: number

  constructor(
    private readonly record: StoredKeystoreRecord,
    options?: { unlockTtlMs?: number },
  ) {
    this.id = record.id
    this.label = record.label
    this.unlockTtlMs = options?.unlockTtlMs ?? DEFAULT_UNLOCK_TTL_MS
  }

  get isUnlocked(): boolean {
    return Boolean(this.mnemonic) && Date.now() < this.unlockExpiresAt
  }

  lock(): void {
    if (this.mnemonic) {
      this.mnemonic = this.mnemonic.replace(/./g, '\0')
      this.mnemonic = null
    }
    this.unlockExpiresAt = 0
  }

  async unlock(password: string): Promise<void> {
    const mnemonic = await unlockStoredKeystoreMnemonic(this.record, password)
    this.lock()
    this.mnemonic = mnemonic
    this.unlockExpiresAt = Date.now() + this.unlockTtlMs
  }

  private requireMnemonic(): string {
    if (!this.isUnlocked || !this.mnemonic) {
      throw new WalletCapabilityError(
        'keystore.unlock',
        this.id,
        'Unlock the keystore wallet before signing.',
      )
    }
    return this.mnemonic
  }

  async refreshSession(): Promise<WalletSession | null> {
    return {
      id: this.id,
      source: this.source,
      kind: this.kind,
      label: this.label,
      status: this.isUnlocked ? 'ready' : 'locked',
      capabilities: this.capabilities,
      chains: [...supportedWalletChains],
      addresses: this.record.addresses,
      accounts: toWalletAccounts(this.record.addresses),
      keystoreMeta: {
        id: this.record.id,
        label: this.record.label,
        createdAt: this.record.createdAt,
      },
    }
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
      case 'accounts.connect':
      case 'accounts.list': {
        const input =
          options.input as WalletCommandMap['accounts.connect']['input']
        const chains = input.chain ? [input.chain] : supportedWalletChains
        const addresses = chains.reduce<Partial<Record<WalletChain, string>>>(
          (accumulator, chain) => {
            const address = this.record.addresses[chain]
            if (address) accumulator[chain] = address
            return accumulator
          },
          {},
        )
        return { accounts: toWalletAccounts(addresses) } as WalletCommandResult<K>
      }
      case 'address.get': {
        const input = options.input as WalletCommandMap['address.get']['input']
        const address = this.record.addresses[input.chain]
        if (!address) {
          throw new WalletCapabilityError(command, this.id, `No address for ${input.chain}`)
        }
        return { chain: input.chain, address } as WalletCommandResult<K>
      }
      case 'addresses.list':
        return {
          addresses: this.record.addresses,
        } as WalletCommandResult<K>
      case 'balance.get': {
        const input = options.input as WalletCommandMap['balance.get']['input']
        const address = this.record.addresses[input.chain]
        if (!address) {
          throw new WalletCapabilityError(command, this.id)
        }
        const response = await fetchAddressBalances({
          chain: input.chain,
          address,
        })
        const balanceAsset =
          response.balances.find((asset) =>
            input.tokenId ? asset.id === input.tokenId : asset.isNative,
          ) ?? response.balances[0]
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
        const chains = input.chains ?? supportedWalletChains
        const balances: Record<string, WalletCommandMap['balance.get']['output']['balance']> =
          {}

        await Promise.all(
          chains.map(async (chain) => {
            const address = this.record.addresses[chain]
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
          chain: context.activeChain ?? supportedWalletChains[0] ?? null,
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
      case 'tx.prepare.amino': {
        const input =
          options.input as WalletCommandMap['tx.prepare.amino']['input']
        const payload = await prepareLocalAminoTx(input)
        return { payload } as WalletCommandResult<K>
      }
      case 'tx.sign': {
        const input = options.input as WalletCommandMap['tx.sign']['input']
        const chain =
          input.chain ??
          context.activeChain ??
          supportedWalletChains[0] ??
          null
        if (!chain) {
          throw new WalletCapabilityError(command, this.id, 'Missing chain for signing')
        }
        const signature = await signLocalPayload(
          this.requireMnemonic(),
          chain,
          input.payload,
        )
        return { signature } as WalletCommandResult<K>
      }
      case 'tx.sign.bytes':
        throw new WalletCapabilityError(
          command,
          this.id,
          'Byte signing is not supported for keystore wallets yet.',
        )
      case 'tx.broadcast': {
        const input =
          options.input as WalletCommandMap['tx.broadcast']['input']
        const txHash = await broadcastLocalTx(
          input.chain,
          input.payload,
          input.signature,
        )
        return { txHash } as WalletCommandResult<K>
      }
      case 'tx.broadcast.raw': {
        const input =
          options.input as WalletCommandMap['tx.broadcast.raw']['input']
        const txHash = await broadcastLocalTx(
          input.chain,
          {},
          { signature: input.rawTx },
        )
        return { txHash } as WalletCommandResult<K>
      }
      case 'tx.send':
        throw new WalletCapabilityError(
          command,
          this.id,
          'Use prepare/sign/broadcast for keystore wallets.',
        )
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
          supportedWalletChains[0]
        if (!chain) {
          throw new WalletCapabilityError(command, this.id)
        }
        const signature = await signLocalMessage(
          this.requireMnemonic(),
          chain,
          input.message,
        )
        return { signature } as WalletCommandResult<K>
      }
      case 'keystore.lock':
        this.lock()
        return { locked: true } as WalletCommandResult<K>
      case 'keystore.unlock': {
        const input =
          options.input as WalletCommandMap['keystore.unlock']['input']
        await this.unlock(input.password)
        return { unlocked: true } as WalletCommandResult<K>
      }
      case 'keystore.delete':
        this.lock()
        return { deleted: true } as WalletCommandResult<K>
      default:
        throw new WalletCapabilityError(command, this.id)
    }
  }

  async extractMessageHashes(payload: unknown): Promise<string[]> {
    return extractLocalMessageHashes(payload as never)
  }
}
