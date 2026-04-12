import type {
  AddressBalanceAsset,
  AddressBalanceRequest,
  AddressBalanceResponse,
  WalletChain,
  WalletSession,
} from '#/wallet'
import type { MayaSupportedAsset, MayaSupportedChain } from '#/lib/maya-asset-catalog'

export type ChainAssetRow = {
  id: string
  symbol: string
  label: string
  iconRaw: string
  chainLabel: string
  balance: string
  usd: string
  address: string | null
  status: 'ready' | 'missing-address' | 'unsupported'
  assetId: string
  balanceBaseUnits: string | null
  decimals: number
  isNative: boolean
  tokenId?: string
  walletChain?: WalletChain
}

export function createChainBalanceRequest(
  session: WalletSession,
  chain: MayaSupportedChain,
): AddressBalanceRequest | null {
  if (!chain.walletChain || !session.chains.includes(chain.walletChain)) {
    return null
  }

  const address = session.addresses[chain.walletChain]
  if (!address) {
    return null
  }

  const assetHints = chain.assets
    .filter((asset) => asset.tokenId && chain.family === 'evm')
    .map((asset) => ({
      id: asset.tokenId!,
      symbol: asset.symbol,
      name: asset.name,
      decimals: asset.decimals,
    }))

  return {
    chain: chain.walletChain,
    address,
    assetHints: assetHints.length ? assetHints : undefined,
  }
}

export function buildChainAssetRows(params: {
  session: WalletSession | null
  chain: MayaSupportedChain
  response: AddressBalanceResponse | null
}): {
  rows: ChainAssetRow[]
  totalUsdValue: number
} {
  const status = getChainSessionStatus(params.session, params.chain)
  const address =
    params.chain.walletChain && params.session
      ? params.session.addresses[params.chain.walletChain] ?? null
      : null
  let totalUsdValue = 0

  const rows = params.chain.assets.map((asset) => {
    if (status !== 'ready') {
      return {
        id: asset.id,
        symbol: asset.symbol,
        label: asset.name,
        iconRaw: asset.iconId,
        chainLabel: params.chain.name,
        balance: status === 'missing-address' ? 'Connect' : 'Unavailable',
        usd: 'n/a',
        address,
        status,
        assetId: asset.asset,
        balanceBaseUnits: null,
        decimals: asset.decimals,
        isNative: asset.isNative,
        tokenId: asset.tokenId,
        walletChain: asset.walletChain,
      }
    }

    const matchedBalance = findMatchingBalance(asset, params.response?.balances ?? [])
    const formattedAmount = matchedBalance?.formattedAmount ?? '0'
    const numericAmount = Number(formattedAmount)
    const usdValue =
      Number.isFinite(numericAmount) && numericAmount > 0
        ? numericAmount * asset.priceUsd
        : 0
    totalUsdValue += usdValue

    return {
      id: asset.id,
      symbol: asset.symbol,
      label: asset.name,
      iconRaw: asset.iconId,
      chainLabel: params.chain.name,
      balance: formattedAmount,
      usd: formatUsd(usdValue),
      address,
      balanceBaseUnits: matchedBalance?.amount ?? '0',
      decimals: matchedBalance?.decimals ?? asset.decimals,
      isNative: asset.isNative,
      status: 'ready' as const,
      assetId: asset.asset,
      tokenId: asset.tokenId,
      walletChain: asset.walletChain,
    }
  })

  return { rows, totalUsdValue }
}

export function getChainSessionStatus(
  session: WalletSession | null,
  chain: MayaSupportedChain,
): ChainAssetRow['status'] {
  if (!session || !chain.walletChain || !session.chains.includes(chain.walletChain)) {
    return 'unsupported'
  }

  if (!session.addresses[chain.walletChain]) {
    return 'missing-address'
  }

  return 'ready'
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value)
}

export function shortenAddress(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value
}

function findMatchingBalance(
  asset: MayaSupportedAsset,
  balances: AddressBalanceAsset[],
): AddressBalanceAsset | undefined {
  if (asset.tokenId) {
    return balances.find(
      (balance) => balance.id.toLowerCase() === asset.tokenId?.toLowerCase(),
    )
  }

  if (asset.isNative) {
    return balances.find(
      (balance) =>
        balance.isNative || balance.symbol.toUpperCase() === asset.symbol.toUpperCase(),
    )
  }

  return balances.find(
    (balance) => balance.symbol.toUpperCase() === asset.symbol.toUpperCase(),
  )
}
