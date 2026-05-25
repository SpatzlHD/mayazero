import { describe, expect, it } from 'vitest'
import { Chain } from '@vultisig/sdk'
import { formatBaseUnits, getSwapPrimaryAction } from './swap'
import type { ProtocolAsset } from '#/components/ProtocolPrimitives'
import { buildSwapBalanceAssetHints } from './swap'

describe('swap route helpers', () => {
  it('keeps prepare enabled only for Vultisig-preparable quotes', () => {
    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canSubmitSwap: true,
      }),
    ).toEqual({
      kind: 'submit',
      label: 'Submit Swap',
      disabled: false,
    })

    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canSubmitSwap: false,
      }),
    ).toEqual({
      kind: 'quote-only',
      label: 'Maya Quote Only',
      disabled: true,
    })
  })

  it('surfaces the prepared state and formats quote outputs for display', () => {
    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canSubmitSwap: true,
        isSubmitting: true,
        submitStatus: 'approving',
      }),
    ).toEqual({
      kind: 'submit',
      label: 'Approving Token',
      disabled: true,
    })

    expect(formatBaseUnits('1234500000000000000', 18)).toBe('1.2345')
    expect(formatBaseUnits('450000000', 8)).toBe('4.5')
    expect(formatBaseUnits(undefined, 18)).toBe('')
  })

  it('keeps impersonation in quote-only mode even with a prepared quote', () => {
    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canSubmitSwap: true,
        isViewOnly: true,
      }),
    ).toEqual({
      kind: 'quote-only',
      label: 'View Only',
      disabled: true,
    })
  })

  it('builds token balance hints from the current swap asset catalog', () => {
    const assets: ProtocolAsset[] = [
      {
        id: 'eth',
        label: 'ETH',
        chain: Chain.Ethereum,
        ticker: 'ETH',
        decimals: 18,
        mayaAsset: 'ETH.ETH',
        blurb: 'Ethereum native asset',
      },
      {
        id: 'usdt',
        label: 'USDT',
        chain: Chain.Ethereum,
        ticker: 'USDT',
        decimals: 6,
        mayaAsset: 'ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7',
        tokenId: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        blurb: 'Ethereum stablecoin',
      },
      {
        id: 'cacao',
        label: 'CACAO',
        chain: Chain.MayaChain,
        ticker: 'CACAO',
        decimals: 10,
        mayaAsset: 'MAYA.CACAO',
        blurb: 'Maya native asset',
      },
    ]

    expect(buildSwapBalanceAssetHints(assets, Chain.Ethereum)).toEqual([
      {
        id: 'eth',
        symbol: 'ETH',
        name: 'ETH',
        decimals: 18,
      },
      {
        id: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        name: 'USDT',
        decimals: 6,
      },
    ])
  })
})
