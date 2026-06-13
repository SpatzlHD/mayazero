import { WalletChain as Chain } from '#/wallet/chain-types'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MayaSupportedChain } from '#/lib/maya-asset-catalog'
import type { ChainAssetRow } from './-portfolio-data'
import {
  ChainDetailContent,
  getChainAssetSendValidationError,
} from './chains.$chainKey'

const chain: MayaSupportedChain = {
  key: 'ethereum',
  ticker: 'ETH',
  name: 'Ethereum',
  iconId: 'eth',
  family: 'evm',
  walletChain: Chain.Ethereum,
  assets: [],
}

function makeRow(overrides: Partial<ChainAssetRow> = {}): ChainAssetRow {
  return {
    id: 'eth.eth',
    symbol: 'ETH',
    label: 'Ether',
    iconRaw: 'eth',
    chainLabel: 'Ethereum',
    balance: '1',
    usd: '$3,000',
    address: '0xsource',
    status: 'ready',
    assetId: 'ETH.ETH',
    balanceBaseUnits: '1000000000000000000',
    decimals: 18,
    isNative: true,
    walletChain: Chain.Ethereum,
    ...overrides,
  }
}

function renderContent(options?: {
  initialAmount?: string
  initialRecipient?: string
  initialSelectedAsset?: ChainAssetRow | null
  initialSendResult?: {
    recipient: string
    route: 'extension' | 'keystore'
    sourceAddress: string
    txHash: string | null
    rawResult: unknown
    memo?: string
  } | null
  isPowerUser?: boolean
  rows?: ChainAssetRow[]
}) {
  return renderToString(
    <ChainDetailContent
      activeSessionConnected
      chain={chain}
      chainAddress="0xchain"
      initialAmount={options?.initialAmount}
      initialRecipient={options?.initialRecipient}
      initialSelectedAsset={options?.initialSelectedAsset}
      initialSendResult={options?.initialSendResult}
      isAddressCopied={false}
      isBalanceLoading={false}
      isPowerUser={options?.isPowerUser ?? false}
      onCopyChainAddress={async () => {}}
      onInitializeWallet={async () => {}}
      onResolveAssetSendSupport={(asset) => ({
        supported: asset.status === 'ready',
        sourceAddress: asset.address ?? undefined,
      })}
      onSubmitSend={async ({ recipient }) => ({
        rawResult: { ok: true },
        recipient,
        route: 'keystore',
        sourceAddress: '0xsource',
        txHash: '0xsent',
      })}
      rows={options?.rows ?? [makeRow()]}
      totalUsdValue={3000}
    />,
  )
}

describe('chain detail content', () => {
  it('renders send actions and disables unsupported rows', () => {
    const html = renderContent({
      rows: [
        makeRow(),
        makeRow({
          id: 'missing',
          status: 'missing-address',
          balance: 'Connect',
          usd: 'n/a',
          balanceBaseUnits: null,
        }),
        makeRow({
          id: 'unsupported',
          status: 'unsupported',
          balance: 'Unavailable',
          usd: 'n/a',
          balanceBaseUnits: null,
          walletChain: undefined,
        }),
      ],
    })

    expect(html).toContain('Actions')
    expect(html.match(/>Send<\/button>/g)?.length).toBe(3)
    expect(html.match(/disabled=""[^>]*>.*?Send<\/button>/g)?.length).toBe(2)
  })

  it('renders the send modal for a selected asset', () => {
    const html = renderContent({
      initialSelectedAsset: makeRow(),
    })

    expect(html).toContain('role="dialog"')
    expect(html).toContain('Send ETH')
  })

  it('renders the power-user memo section when enabled', () => {
    const standardHtml = renderContent({
      initialSelectedAsset: makeRow(),
    })
    const powerHtml = renderContent({
      initialSelectedAsset: makeRow(),
      isPowerUser: true,
    })

    expect(standardHtml).not.toContain('Optional memo')
    expect(powerHtml).toContain('Optional memo')
    expect(powerHtml).toContain('Base-unit preview')
  })

  it('keeps the send modal focused on the form instead of an inline success card', () => {
    const html = renderContent({
      initialSelectedAsset: makeRow(),
    })

    expect(html).not.toContain('Transfer Submitted')
    expect(html).toContain('Recipient Address')
  })
})

describe('chain asset send validation', () => {
  it('rejects excessive decimals', () => {
    expect(
      getChainAssetSendValidationError({
        amount: '1.1234567',
        amountBaseUnits: null,
        asset: {
          balanceBaseUnits: '5000000',
          decimals: 6,
          symbol: 'USDC',
        },
        recipient: '0xreceiver',
      }),
    ).toBe('Amount must use at most 6 decimal places.')
  })

  it('rejects amounts above the available balance', () => {
    expect(
      getChainAssetSendValidationError({
        amount: '6',
        amountBaseUnits: '6000000',
        asset: {
          balanceBaseUnits: '5000000',
          decimals: 6,
          symbol: 'USDC',
        },
        recipient: '0xreceiver',
      }),
    ).toBe('Amount exceeds available USDC balance.')
  })
})
