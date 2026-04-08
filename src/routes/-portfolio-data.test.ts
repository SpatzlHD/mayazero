import { Chain } from '@vultisig/sdk'
import { describe, expect, it } from 'vitest'
import type { MayaSupportedChain } from '#/lib/maya-asset-catalog'
import type { WalletSession } from '#/wallet'
import {
  buildChainAssetRows,
  createChainBalanceRequest,
  formatUsd,
  getChainSessionStatus,
} from './-portfolio-data'

const ethereumChain: MayaSupportedChain = {
  key: 'ethereum',
  ticker: 'ETH',
  name: 'Ethereum',
  iconId: 'eth',
  family: 'evm',
  walletChain: Chain.Ethereum,
  assets: [
    {
      id: 'eth.eth',
      asset: 'ETH.ETH',
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      isNative: true,
      priceUsd: 3000,
      iconId: 'eth',
      chainKey: 'ethereum',
      chainTicker: 'ETH',
      chainName: 'Ethereum',
      walletChain: Chain.Ethereum,
    },
    {
      id: 'eth.usdc-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      asset: 'ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USDC',
      decimals: 6,
      tokenId: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      isNative: false,
      priceUsd: 1,
      iconId: 'usdc',
      chainKey: 'ethereum',
      chainTicker: 'ETH',
      chainName: 'Ethereum',
      walletChain: Chain.Ethereum,
    },
  ],
}

const mayachain: MayaSupportedChain = {
  key: 'mayachain',
  ticker: 'MAYA',
  name: 'MayaChain',
  iconId: 'cacao',
  family: 'cosmos',
  walletChain: Chain.MayaChain,
  assets: [
    {
      id: 'maya.cacao',
      asset: 'MAYA.CACAO',
      symbol: 'CACAO',
      name: 'Cacao',
      decimals: 10,
      isNative: true,
      priceUsd: 1.5,
      iconId: 'cacao',
      chainKey: 'mayachain',
      chainTicker: 'MAYA',
      chainName: 'MayaChain',
      walletChain: Chain.MayaChain,
    },
    {
      id: 'maya.maya',
      asset: 'MAYA.MAYA',
      symbol: 'MAYA',
      name: 'MAYA',
      decimals: 4,
      isNative: false,
      priceUsd: 0.5,
      iconId: 'maya',
      chainKey: 'mayachain',
      chainTicker: 'MAYA',
      chainName: 'MayaChain',
      walletChain: Chain.MayaChain,
    },
  ],
}

const session: WalletSession = {
  id: 'vault-1',
  source: 'sdk',
  kind: 'vault',
  label: 'Primary Vault',
  status: 'ready',
  capabilities: [],
  chains: [Chain.MayaChain, Chain.Ethereum],
  accounts: [],
  addresses: {
    [Chain.MayaChain]: 'maya1example',
    [Chain.Ethereum]: '0x000000000000000000000000000000000000abcd',
  },
}

describe('portfolio-data', () => {
  it('creates one chain request with evm token hints only', () => {
    const request = createChainBalanceRequest(session, ethereumChain)

    expect(request).toMatchObject({
      chain: Chain.Ethereum,
      address: '0x000000000000000000000000000000000000abcd',
      assetHints: [
        expect.objectContaining({
          id: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          symbol: 'USDC',
        }),
      ],
    })
    expect(createChainBalanceRequest(session, mayachain)?.assetHints).toBeUndefined()
  })

  it('builds chain rows from fetched balances and pool prices', () => {
    const { rows, totalUsdValue } = buildChainAssetRows({
      session,
      chain: ethereumChain,
      response: {
        chain: Chain.Ethereum,
        address: '0x000000000000000000000000000000000000abcd',
        fetchedAt: new Date().toISOString(),
        balances: [
          {
            chain: Chain.Ethereum,
            id: 'native',
            symbol: 'ETH',
            name: 'Ethereum',
            amount: '1000000000000000000',
            formattedAmount: '1',
            decimals: 18,
            isNative: true,
            source: 'evm-native',
          },
          {
            chain: Chain.Ethereum,
            id: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            symbol: 'USDC',
            name: 'USD Coin',
            amount: '5000000',
            formattedAmount: '5',
            decimals: 6,
            isNative: false,
            source: 'erc20',
          },
        ],
      },
    })

    expect(rows.find((row) => row.symbol === 'ETH')).toMatchObject({
      balance: '1',
      usd: '$3,000',
      status: 'ready',
    })
    expect(rows.find((row) => row.symbol === 'USDC')).toMatchObject({
      balance: '5',
      usd: '$5.00',
      status: 'ready',
    })
    expect(totalUsdValue).toBe(3005)
  })

  it('marks unsupported and missing-address chains explicitly', () => {
    const extensionSession: WalletSession = {
      ...session,
      source: 'extension',
      chains: [Chain.Ethereum],
      addresses: {
        [Chain.Ethereum]: '0x000000000000000000000000000000000000abcd',
      },
    }

    expect(getChainSessionStatus(extensionSession, mayachain)).toBe('unsupported')

    const missingAddressSession: WalletSession = {
      ...session,
      addresses: {
        [Chain.Ethereum]: '0x000000000000000000000000000000000000abcd',
      },
    }

    expect(getChainSessionStatus(missingAddressSession, mayachain)).toBe('missing-address')
  })

  it('formats usd values for chain totals', () => {
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(1250)).toBe('$1,250')
  })
})
