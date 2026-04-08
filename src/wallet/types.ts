import type {
  Balance,
  Chain,
  DiscoveredToken,
  FiatCurrency,
  KeysignPayload,
  MessageSignature,
  Portfolio,
  Signature,
  SwapPrepareResult,
  SwapQuoteResult,
  TransactionSimulationResult,
  TransactionValidationResult,
  TxStatusResult,
} from '@vultisig/sdk'

export type WalletChain = Chain

export type WalletSource = 'sdk' | 'extension'
export type WalletSessionKind = 'vault' | 'extension'
export type WalletSessionStatus = 'ready' | 'locked' | 'unavailable'
export type WalletOperationStatus = 'pending' | 'success' | 'error' | 'cancelled'
export type WalletCommandName =
  | 'accounts.connect'
  | 'accounts.list'
  | 'address.get'
  | 'addresses.list'
  | 'balance.get'
  | 'balances.list'
  | 'chain.get'
  | 'chain.switch'
  | 'tx.send'
  | 'tx.query'
  | 'tx.status'
  | 'message.sign'
  | 'portfolio.get'
  | 'tx.prepare.send'
  | 'tx.sign'
  | 'tx.broadcast'
  | 'swap.quote'
  | 'swap.prepare'
  | 'tokens.discover'
  | 'security.validate'
  | 'security.simulate'
  | 'vault.export'
  | 'vault.lock'
  | 'vault.unlock'
  | 'vault.rename'
  | 'provider.request'

export type WalletManagerOperationName =
  | 'manager.initialize'
  | 'manager.refresh'
  | 'vault.create.fast'
  | 'vault.verify.fast'
  | 'vault.create.secure'
  | 'vault.join.secure'
  | 'vault.import'
  | 'vault.delete'

export type WalletOperationName = WalletCommandName | WalletManagerOperationName

export type WalletAccount = {
  chain: WalletChain
  address: string
}

export type WalletSession = {
  id: string
  source: WalletSource
  kind: WalletSessionKind
  label: string
  status: WalletSessionStatus
  capabilities: WalletCommandName[]
  chains: WalletChain[]
  accounts: WalletAccount[]
  addresses: Partial<Record<WalletChain, string>>
  vaultMeta?: {
    id: string
    name: string
    type: 'fast' | 'secure'
    isEncrypted: boolean
    localPartyId?: string
    createdAt?: number
  }
}

export type SerializedWalletError = {
  name: string
  message: string
  code?: string | number
  stack?: string
}

export type WalletOperation = {
  id: string
  name: WalletOperationName
  sessionId: string | null
  status: WalletOperationStatus
  startedAt: number
  endedAt?: number
  input?: unknown
  result?: unknown
  error?: SerializedWalletError
  progress?: {
    step?: string
    message?: string
    value?: number
    mode?: string
  }
  qrPayload?: string | null
  deviceJoin?: {
    joined: number
    required: number
    deviceId?: string
  }
}

export type WalletCommandMap = {
  'accounts.connect': {
    input: { chain?: WalletChain }
    output: { accounts: WalletAccount[] }
  }
  'accounts.list': {
    input: { chain?: WalletChain }
    output: { accounts: WalletAccount[] }
  }
  'address.get': {
    input: { chain: WalletChain }
    output: { chain: WalletChain; address: string }
  }
  'addresses.list': {
    input: { chains?: WalletChain[] }
    output: { addresses: Partial<Record<WalletChain, string>> }
  }
  'balance.get': {
    input: { chain: WalletChain; tokenId?: string }
    output: { chain: WalletChain; balance: Balance }
  }
  'balances.list': {
    input: {
      chains?: WalletChain[]
      includeTokens?: boolean
      withPrices?: boolean
      fiatCurrency?: FiatCurrency
    }
    output: { balances: Record<string, Balance> }
  }
  'chain.get': {
    input: Record<string, never>
    output: { chain: WalletChain | null }
  }
  'chain.switch': {
    input: { chain: WalletChain }
    output: { chain: WalletChain }
  }
  'tx.send': {
    input:
      | {
          chain: WalletChain
          to: string
          amount: string
          symbol?: string
          memo?: string
          dryRun?: boolean
        }
      | {
          chain: WalletChain
          transaction: Record<string, unknown>
          mode?: 'send' | 'deposit'
        }
    output: { result: unknown }
  }
  'tx.query': {
    input: { chain: WalletChain; txHash: string }
    output: { transaction: unknown }
  }
  'tx.status': {
    input: { chain: WalletChain; txHash: string }
    output: { status: TxStatusResult | unknown }
  }
  'message.sign': {
    input:
      | { chain?: WalletChain; message: string }
      | { chain: WalletChain; message: string; address: string }
    output: { signature: MessageSignature | string }
  }
  'portfolio.get': {
    input: { fiatCurrency?: FiatCurrency }
    output: { portfolio: Portfolio }
  }
  'tx.prepare.send': {
    input: {
      coin: {
        chain: WalletChain
        address: string
        decimals: number
        ticker: string
        logo?: string
        isNativeToken?: boolean
        hexPublicKey?: string
        contractAddress?: string
      }
      receiver: string
      amount: bigint
      memo?: string
      feeSettings?: Record<string, unknown>
    }
    output: { payload: KeysignPayload }
  }
  'tx.sign': {
    input: { payload: KeysignPayload }
    output: { signature: Signature }
  }
  'tx.broadcast': {
    input: { chain: WalletChain; payload: KeysignPayload; signature: Signature }
    output: { txHash: string }
  }
  'swap.quote': {
    input: {
      fromCoin: {
        chain: WalletChain
        ticker: string
        decimals: number
        address: string
        logo?: string
        id?: string
      }
      toCoin: {
        chain: WalletChain
        ticker: string
        decimals: number
        address: string
        logo?: string
        id?: string
      }
      amount: number
      slippageBps?: number
      referral?: string
      fiatCurrency?: FiatCurrency
    }
    output: { quote: SwapQuoteResult }
  }
  'swap.prepare': {
    input: {
      fromCoin: {
        chain: WalletChain
        ticker: string
        decimals: number
        address: string
        logo?: string
        id?: string
      }
      toCoin: {
        chain: WalletChain
        ticker: string
        decimals: number
        address: string
        logo?: string
        id?: string
      }
      amount: number
      swapQuote: SwapQuoteResult
      autoApprove?: boolean
    }
    output: { payload: SwapPrepareResult }
  }
  'tokens.discover': {
    input: { chain: WalletChain }
    output: { tokens: DiscoveredToken[] }
  }
  'security.validate': {
    input: { payload: KeysignPayload }
    output: { validation: TransactionValidationResult | null }
  }
  'security.simulate': {
    input: { payload: KeysignPayload }
    output: { simulation: TransactionSimulationResult | null }
  }
  'vault.export': {
    input: { password?: string }
    output: { filename: string; data: string }
  }
  'vault.lock': {
    input: Record<string, never>
    output: { locked: true }
  }
  'vault.unlock': {
    input: { password: string }
    output: { unlocked: true }
  }
  'vault.rename': {
    input: { name: string }
    output: { name: string }
  }
  'provider.request': {
    input: { chain?: WalletChain; method: string; params?: unknown[] }
    output: { result: unknown }
  }
}

export type WalletExecuteOptions<K extends WalletCommandName> = {
  input: WalletCommandMap[K]['input']
  sessionId?: string
  signal?: AbortSignal
  track?: boolean
}

export type WalletCommandResult<K extends WalletCommandName> =
  WalletCommandMap[K]['output']

export type WalletPreferences = {
  selectedSessionId: string | null
  preferredVaultId: string | null
  activeChain: WalletChain | null
}

export type MayaWalletState = {
  initialized: boolean
  initializing: boolean
  sessions: WalletSession[]
  activeSessionId: string | null
  activeChain: WalletChain | null
  operations: WalletOperation[]
  balancesBySession: Partial<Record<string, Record<string, Balance>>>
  txStatusBySession: Partial<Record<string, Record<string, unknown>>>
  lastError?: SerializedWalletError
}
