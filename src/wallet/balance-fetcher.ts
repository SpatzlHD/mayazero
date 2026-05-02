import { Chain } from '@vultisig/sdk'
import { getChainDefinition } from './chains'
import { normalizeEvmAddress } from '#/lib/evm-address'
import type { WalletChain } from './types'

type FetchLike = typeof fetch

export type AddressBalanceAssetHint = {
  id: string
  symbol?: string
  name?: string
  decimals?: number
}

export type AddressBalanceAsset = {
  chain: WalletChain
  id: string
  symbol: string
  name: string
  amount: string
  formattedAmount: string
  decimals: number
  isNative: boolean
  source:
    | 'evm-native'
    | 'erc20'
    | 'cosmos-bank'
    | 'cosmos-wasm'
    | 'utxo'
}

export type AddressBalanceRequest = {
  chain: WalletChain
  address: string
  assetHints?: AddressBalanceAssetHint[]
  includeZeroBalances?: boolean
}

export type AddressBalanceResponse = {
  chain: WalletChain
  address: string
  balances: AddressBalanceAsset[]
  fetchedAt: string
  warnings?: AddressBalanceWarning[]
}

export type AddressBalanceWarning = {
  assetId?: string
  message: string
}

export type CrossChainBalanceServiceOptions = {
  fetch?: FetchLike
  evmRpcUrls?: Partial<Record<WalletChain, string>>
  cosmosRestUrls?: Partial<Record<WalletChain, string>>
  utxoBaseUrls?: Partial<Record<WalletChain, string>>
  dashRpcUrl?: string
}

const VULTISIG_ROOT_API_URL = 'https://api.vultisig.com'

const defaultEvmRpcUrls: Partial<Record<WalletChain, string>> = {
  [Chain.Ethereum]: `${VULTISIG_ROOT_API_URL}/eth/`,
  [Chain.Arbitrum]: `${VULTISIG_ROOT_API_URL}/arb/`,
}

const defaultCosmosRestUrls: Partial<Record<WalletChain, string>> = {
  [Chain.THORChain]: 'https://thornode.thorchain.network',
  [Chain.MayaChain]: 'https://mayanode.mayachain.info',
  [Chain.Kujira]: 'https://kujira-rest.publicnode.com',
}

const defaultUtxoBaseUrls: Partial<Record<WalletChain, string>> = {
  [Chain.Bitcoin]: `${VULTISIG_ROOT_API_URL}/blockchair/bitcoin`,
  [Chain.Zcash]: `${VULTISIG_ROOT_API_URL}/blockchair/zcash`,
}

const defaultDashRpcUrl = `${VULTISIG_ROOT_API_URL}/dash/`

const nativeAssetMetadata: Partial<
  Record<WalletChain, { id: string; symbol: string; name: string; decimals: number }>
> = {
  [Chain.Bitcoin]: {
    id: 'native',
    symbol: 'BTC',
    name: 'Bitcoin',
    decimals: 8,
  },
  [Chain.Dash]: {
    id: 'native',
    symbol: 'DASH',
    name: 'Dash',
    decimals: 8,
  },
  [Chain.Zcash]: {
    id: 'native',
    symbol: 'ZEC',
    name: 'Zcash',
    decimals: 8,
  },
  [Chain.Ethereum]: {
    id: 'native',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
  },
  [Chain.Arbitrum]: {
    id: 'native',
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
  },
  [Chain.THORChain]: {
    id: 'rune',
    symbol: 'RUNE',
    name: 'Rune',
    decimals: 8,
  },
  [Chain.MayaChain]: {
    id: 'cacao',
    symbol: 'CACAO',
    name: 'Cacao',
    decimals: 10,
  },
  [Chain.Kujira]: {
    id: 'ukuji',
    symbol: 'KUJI',
    name: 'Kujira',
    decimals: 6,
  },
}

const cosmosKnownAssetMetadata: Partial<
  Record<WalletChain, Record<string, { symbol: string; name: string; decimals: number }>>
> = {
  [Chain.THORChain]: {
    rune: { symbol: 'RUNE', name: 'Rune', decimals: 8 },
    tcy: { symbol: 'TCY', name: 'TCY', decimals: 8 },
    'x/ruji': { symbol: 'RUJI', name: 'RUJI', decimals: 8 },
    'x/staking-tcy': { symbol: 'sTCY', name: 'Staked TCY', decimals: 8 },
  },
  [Chain.MayaChain]: {
    cacao: { symbol: 'CACAO', name: 'Cacao', decimals: 10 },
    maya: { symbol: 'MAYA', name: 'Maya', decimals: 4 },
    aztec: { symbol: 'AZTEC', name: 'Aztec', decimals: 4 },
  },
  [Chain.Kujira]: {
    ukuji: { symbol: 'KUJI', name: 'Kujira', decimals: 6 },
    'ibc/FE98AAD68F02F03565E9FA39A5E627946699B2B07115889ED812D8BA639576A9': {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    'factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk': {
      symbol: 'USK',
      name: 'USK',
      decimals: 6,
    },
    'factory/kujira13x2l25mpkhwnwcwdzzd34cr8fyht9jlj7xu9g4uffe36g3fmln8qkvm3qn/unami': {
      symbol: 'NAMI',
      name: 'Nami',
      decimals: 6,
    },
    'factory/kujira1643jxg8wasy5cfcn7xm8rd742yeazcksqlg4d7/umnta': {
      symbol: 'MNTA',
      name: 'Manta DAO',
      decimals: 6,
    },
    'factory/kujira13x2l25mpkhwnwcwdzzd34cr8fyht9jlj7xu9g4uffe36g3fmln8qkvm3qn/uauto': {
      symbol: 'AUTO',
      name: 'AUTO',
      decimals: 6,
    },
  },
}

type JsonRpcResponse<Result> = {
  result?: Result
  error?: { code: number; message: string }
}

type CosmosBankBalancesResponse = {
  balances?: Array<{ denom: string; amount: string }>
}

type CosmosWasmBalanceResponse = {
  data?: {
    balance?: string
  }
}

type BlockchairAddressResponse = {
  data?: Record<
    string,
    {
      address?: { balance?: number }
      utxo?: Array<{ value: number }>
    }
  >
}

type DashRpcResponse = {
  result?: Array<{ satoshis: number }> | null
  error?: { code: number; message: string } | null
}

type BalanceFetchResult = {
  balances: AddressBalanceAsset[]
  warnings: AddressBalanceWarning[]
}

function defaultFetchMissing(): never {
  throw new Error(
    'No fetch implementation is available. Pass one to CrossChainBalanceService.',
  )
}

function formatBaseUnits(amount: bigint, decimals: number): string {
  if (decimals <= 0) {
    return amount.toString()
  }

  const divisor = 10n ** BigInt(decimals)
  const whole = amount / divisor
  const fraction = amount % divisor
  if (fraction === 0n) {
    return whole.toString()
  }

  return `${whole}.${fraction
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '')}`
}

function hexToBigInt(value: string): bigint {
  if (!value || value === '0x') {
    return 0n
  }

  return BigInt(value)
}

function encodeCosmosWasmBalanceQuery(address: string): string {
  const query = JSON.stringify({ balance: { address } })
  if (typeof btoa === 'function') {
    return btoa(query)
  }

  return Buffer.from(query, 'utf8').toString('base64')
}

function uniqueHints(
  hints: AddressBalanceAssetHint[] | undefined,
): AddressBalanceAssetHint[] {
  const seen = new Set<string>()
  const result: AddressBalanceAssetHint[] = []

  for (const hint of hints ?? []) {
    const key = hint.id.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(hint)
  }

  return result
}

function mergeMetadata(
  chain: WalletChain,
  assetId: string,
  hint?: AddressBalanceAssetHint,
): { symbol: string; name: string; decimals: number } {
  const native = nativeAssetMetadata[chain]
  if (native && assetId === native.id) {
    return {
      symbol: hint?.symbol ?? native.symbol,
      name: hint?.name ?? native.name,
      decimals: hint?.decimals ?? native.decimals,
    }
  }

  const cosmosKnown = cosmosKnownAssetMetadata[chain]?.[assetId]
  if (cosmosKnown) {
    return {
      symbol: hint?.symbol ?? cosmosKnown.symbol,
      name: hint?.name ?? cosmosKnown.name,
      decimals: hint?.decimals ?? cosmosKnown.decimals,
    }
  }

  return {
    symbol: hint?.symbol ?? assetId,
    name: hint?.name ?? assetId,
    decimals: hint?.decimals ?? 0,
  }
}

function normalizeAsset(
  chain: WalletChain,
  assetId: string,
  amount: bigint,
  isNative: boolean,
  source: AddressBalanceAsset['source'],
  hint?: AddressBalanceAssetHint,
): AddressBalanceAsset {
  const metadata = mergeMetadata(chain, assetId, hint)

  return {
    chain,
    id: assetId,
    symbol: metadata.symbol,
    name: metadata.name,
    amount: amount.toString(),
    formattedAmount: formatBaseUnits(amount, metadata.decimals),
    decimals: metadata.decimals,
    isNative,
    source,
  }
}

export class CrossChainBalanceService {
  private readonly fetchImpl: FetchLike
  private readonly evmRpcUrls: Partial<Record<WalletChain, string>>
  private readonly cosmosRestUrls: Partial<Record<WalletChain, string>>
  private readonly utxoBaseUrls: Partial<Record<WalletChain, string>>
  private readonly dashRpcUrl: string

  constructor(options: CrossChainBalanceServiceOptions = {}) {
    this.fetchImpl =
      options.fetch ??
      (typeof fetch === 'function' ? fetch.bind(globalThis) : defaultFetchMissing)
    this.evmRpcUrls = {
      ...defaultEvmRpcUrls,
      ...options.evmRpcUrls,
    }
    this.cosmosRestUrls = {
      ...defaultCosmosRestUrls,
      ...options.cosmosRestUrls,
    }
    this.utxoBaseUrls = {
      ...defaultUtxoBaseUrls,
      ...options.utxoBaseUrls,
    }
    this.dashRpcUrl = options.dashRpcUrl ?? defaultDashRpcUrl
  }

  async fetchBalances(
    input: AddressBalanceRequest,
  ): Promise<AddressBalanceResponse> {
    const definition = getChainDefinition(input.chain)
    const includeZeroBalances = input.includeZeroBalances ?? false
    let result: BalanceFetchResult

    switch (definition.family) {
      case 'evm':
        result = await this.fetchEvmBalances(input)
        break
      case 'cosmos':
        result = await this.fetchCosmosBalances(input)
        break
      case 'utxo':
        result = await this.fetchUtxoBalances(input)
        break
      default:
        throw new Error(`Balance fetching is not implemented for ${input.chain}`)
    }

    return {
      chain: input.chain,
      address: input.address,
      balances: includeZeroBalances
        ? result.balances
        : result.balances.filter((asset) => asset.amount !== '0'),
      fetchedAt: new Date().toISOString(),
      ...(result.warnings.length ? { warnings: result.warnings } : {}),
    }
  }

  async fetchManyBalances(
    inputs: AddressBalanceRequest[],
  ): Promise<AddressBalanceResponse[]> {
    return Promise.all(inputs.map((input) => this.fetchBalances(input)))
  }

  private async fetchEvmBalances(
    input: AddressBalanceRequest,
  ): Promise<BalanceFetchResult> {
    const rpcUrl = this.evmRpcUrls[input.chain]
    if (!rpcUrl) {
      throw new Error(`No EVM RPC URL configured for ${input.chain}`)
    }

    const hints = uniqueHints(input.assetHints)
    const nativeMetadata = nativeAssetMetadata[input.chain]
    if (!nativeMetadata) {
      throw new Error(`Missing native asset metadata for ${input.chain}`)
    }
    const normalizedAccount = normalizeEvmAddress(input.address)
    const { tokenHints, warnings } = normalizeEvmTokenHints(hints)

    const nativeAmountHex = await this.postJsonRpc<string>(rpcUrl, {
      method: 'eth_getBalance',
      params: [normalizedAccount, 'latest'],
    })
    const balances: AddressBalanceAsset[] = [
      normalizeAsset(
        input.chain,
        nativeMetadata.id,
        hexToBigInt(nativeAmountHex),
        true,
        'evm-native',
      ),
    ]

    const tokenResults = await Promise.allSettled(
      tokenHints.map(async (hint) => {
        const amountHex = await this.postJsonRpc<string>(rpcUrl, {
          method: 'eth_call',
          params: [
            {
              to: hint.id,
              data: this.makeErc20BalanceOfCall(normalizedAccount),
            },
            'latest',
          ],
        })

        return normalizeAsset(
          input.chain,
          hint.id,
          hexToBigInt(amountHex),
          false,
          'erc20',
          hint,
        )
      }),
    )

    const tokenBalances: AddressBalanceAsset[] = []
    tokenResults.forEach((result, index) => {
      const hint = tokenHints[index]
      if (!hint) {
        return
      }

      if (result.status === 'fulfilled') {
        tokenBalances.push(result.value)
        return
      }

      warnings.push({
        assetId: hint.id,
        message: `Unable to refresh ${hint.symbol ?? hint.id} balance. ${toErrorMessage(result.reason)}`,
      })
    })

    return {
      balances: [...balances, ...tokenBalances],
      warnings,
    }
  }

  private async fetchCosmosBalances(
    input: AddressBalanceRequest,
  ): Promise<BalanceFetchResult> {
    const restUrl = this.cosmosRestUrls[input.chain]
    if (!restUrl) {
      throw new Error(`No Cosmos REST URL configured for ${input.chain}`)
    }

    const hints = uniqueHints(input.assetHints)
    const hintMap = new Map(hints.map((hint) => [hint.id, hint]))
    const response = await this.getJson<CosmosBankBalancesResponse>(
      `${restUrl}/cosmos/bank/v1beta1/balances/${encodeURIComponent(input.address)}?pagination.limit=200`,
    )

    const nativeMetadata = nativeAssetMetadata[input.chain]
    if (!nativeMetadata) {
      throw new Error(`Missing native asset metadata for ${input.chain}`)
    }

    const balances = (response.balances ?? []).map((balance) =>
      normalizeAsset(
        input.chain,
        balance.denom,
        BigInt(balance.amount),
        balance.denom === nativeMetadata.id,
        'cosmos-bank',
        hintMap.get(balance.denom),
      ),
    )

    const knownBankIds = new Set((response.balances ?? []).map((balance) => balance.denom))
    const wasmHints = hints.filter(
      (hint) => !knownBankIds.has(hint.id) && isCosmosWasmAddress(hint.id),
    )

    const wasmBalances = await Promise.all(
      wasmHints.map(async (hint) => {
        const encodedQuery = encodeCosmosWasmBalanceQuery(input.address)
        const response = await this.getJson<CosmosWasmBalanceResponse>(
          `${restUrl}/cosmwasm/wasm/v1/contract/${hint.id}/smart/${encodedQuery}`,
        )

        return normalizeAsset(
          input.chain,
          hint.id,
          BigInt(response.data?.balance ?? '0'),
          false,
          'cosmos-wasm',
          hint,
        )
      }),
    )

    return {
      balances: [...balances, ...wasmBalances],
      warnings: [],
    }
  }

  private async fetchUtxoBalances(
    input: AddressBalanceRequest,
  ): Promise<BalanceFetchResult> {
    if (input.chain === Chain.Dash) {
      const response = await this.postJson<DashRpcResponse>(this.dashRpcUrl, {
        jsonrpc: '1.0',
        id: 'mayazero',
        method: 'getaddressutxos',
        params: [{ addresses: [input.address] }],
      })
      if (response.error) {
        throw new Error(`Dash RPC error: ${response.error.message}`)
      }

      const amount = (response.result ?? []).reduce(
        (total, utxo) => total + BigInt(utxo.satoshis),
        0n,
      )

      return {
        balances: [
          normalizeAsset(input.chain, 'native', amount, true, 'utxo'),
        ],
        warnings: [],
      }
    }

    const baseUrl = this.utxoBaseUrls[input.chain]
    if (!baseUrl) {
      throw new Error(`No UTXO base URL configured for ${input.chain}`)
    }

    const response = await this.getJson<BlockchairAddressResponse>(
      `${baseUrl}/dashboards/address/${encodeURIComponent(input.address)}`,
    )
    const addressData = response.data?.[input.address]
    const amount = (addressData?.utxo ?? []).reduce(
      (total, utxo) => total + BigInt(utxo.value),
      0n,
    )

    return {
      balances: [
        normalizeAsset(input.chain, 'native', amount, true, 'utxo'),
      ],
      warnings: [],
    }
  }

  private makeErc20BalanceOfCall(accountAddress: string): string {
    const normalizedAddress = normalizeEvmAddress(accountAddress)
      .slice(2)
      .toLowerCase()
      .padStart(64, '0')
    return `0x70a08231${normalizedAddress}`
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`)
    }

    return (await response.json()) as T
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`)
    }

    return (await response.json()) as T
  }

  private async postJsonRpc<T>(
    url: string,
    payload: { method: string; params: unknown[] },
  ): Promise<T> {
    const response = await this.postJson<JsonRpcResponse<T>>(url, {
      jsonrpc: '2.0',
      id: `${Date.now()}`,
      method: payload.method,
      params: payload.params,
    })
    if (response.error) {
      throw new Error(
        `RPC ${payload.method} failed (${response.error.code}): ${response.error.message}`,
      )
    }
    if (response.result === undefined) {
      throw new Error(`RPC ${payload.method} returned no result`)
    }

    return response.result
  }
}

export const defaultCrossChainBalanceService = new CrossChainBalanceService()

export function fetchAddressBalances(
  input: AddressBalanceRequest,
  options?: CrossChainBalanceServiceOptions,
): Promise<AddressBalanceResponse> {
  return new CrossChainBalanceService(options).fetchBalances(input)
}

export function fetchManyAddressBalances(
  inputs: AddressBalanceRequest[],
  options?: CrossChainBalanceServiceOptions,
): Promise<AddressBalanceResponse[]> {
  return new CrossChainBalanceService(options).fetchManyBalances(inputs)
}

function isCosmosWasmAddress(value: string): boolean {
  if (value.startsWith('ibc/') || value.startsWith('factory/')) {
    return false
  }

  return /^[a-z]+1[a-z0-9]{20,80}$/i.test(value)
}

function normalizeEvmTokenHints(
  hints: AddressBalanceAssetHint[],
): {
  tokenHints: AddressBalanceAssetHint[]
  warnings: AddressBalanceWarning[]
} {
  const seen = new Set<string>()
  const tokenHints: AddressBalanceAssetHint[] = []
  const warnings: AddressBalanceWarning[] = []

  for (const hint of hints) {
    if (!hint.id.startsWith('0x') && !hint.id.startsWith('0X')) {
      continue
    }

    try {
      const normalizedId = normalizeEvmAddress(hint.id)
      const key = normalizedId.toLowerCase()
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      tokenHints.push({
        ...hint,
        id: normalizedId,
      })
    } catch {
      warnings.push({
        assetId: hint.id,
        message: `Skipping invalid token address for ${hint.symbol ?? hint.id}.`,
      })
    }
  }

  return { tokenHints, warnings }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Unknown RPC error.'
}
