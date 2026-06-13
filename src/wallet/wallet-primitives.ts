import type { WalletChain } from './chain-types'

export type FiatCurrency = 'usd' | 'eur' | 'gbp' | 'chf' | 'jpy' | string

export type Balance = {
  amount: string
  formattedAmount: string
  decimals: number
  symbol: string
  chainId?: WalletChain
  value?: number
  fiatValue?: number
  fiatCurrency?: FiatCurrency
  tokenId?: string
  name?: string
}

export type Portfolio = {
  totalValue: number
  fiatCurrency: FiatCurrency
  balances: Balance[]
}

export type MessageSignature = {
  signature: string
  format?: string
  pubKey?: string
}

export type Signature = {
  signature: string
  format?: string
  recovery?: number
  pubKey?: string
  r?: string
  s?: string
  v?: number
}

export type KeysignCoin = {
  chain: WalletChain
  address: string
  decimals: number
  ticker: string
  logo?: string
  isNativeToken?: boolean
  hexPublicKey?: string
  contractAddress?: string
}

export type KeysignPayload = {
  coin?: KeysignCoin
  toAddress?: string
  toAmount?: string
  memo?: string
  blockchainSpecific?: {
    case?: string
    value?: Record<string, unknown>
  }
  [key: string]: unknown
}

export type TxStatusResult = {
  status?: string
  txHash?: string
  chain?: WalletChain
  receipt?: Record<string, unknown>
  [key: string]: unknown
}

export type DiscoveredToken = {
  chain: WalletChain
  address: string
  symbol: string
  name: string
  decimals: number
}

export type SwapQuoteResult = {
  provider?: string
  balance?: bigint
  maxSwapable?: bigint
  quote?: unknown
  estimatedOutput?: bigint
  [key: string]: unknown
}

export type SwapPrepareResult = {
  keysignPayload?: KeysignPayload
  quote?: SwapQuoteResult
  [key: string]: unknown
}

export type TransactionValidationResult = {
  isRisky?: boolean
  riskLevel?: string
  [key: string]: unknown
} | null

export type TransactionSimulationResult = {
  changes?: unknown[]
  [key: string]: unknown
} | null
