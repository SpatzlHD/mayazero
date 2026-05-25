import { describe, expect, it } from 'vitest'
import { Chain } from '@vultisig/sdk'
import {
  canSwitchChainInExtension,
  getSupportedSessionChains,
  getExtensionProviderKey,
  resolveChainFromExtensionChainId,
  supportedWalletChains,
} from './chains'

describe('wallet chain registry', () => {
  it('maps extension-enabled chains to provider keys', () => {
    expect(getExtensionProviderKey(Chain.Ethereum)).toBe('ethereum')
    expect(getExtensionProviderKey(Chain.Arbitrum)).toBe('ethereum')
    expect(getExtensionProviderKey(Chain.MayaChain)).toBe('mayachain')
    expect(getExtensionProviderKey(Chain.Zcash)).toBe('zcash')
    expect(getExtensionProviderKey(Chain.Cardano)).toBe('cardano')
  })

  it('includes Cardano as a supported chain with a direct extension provider', () => {
    expect(supportedWalletChains).toContain(Chain.Cardano)
    expect(getExtensionProviderKey(Chain.Cardano)).toBe('cardano')
  })

  it('resolves extension chain ids back to wallet chains', () => {
    expect(resolveChainFromExtensionChainId('ethereum', '0x1')).toBe(Chain.Ethereum)
    expect(resolveChainFromExtensionChainId('ethereum', '0xa4b1')).toBe(Chain.Arbitrum)
    expect(resolveChainFromExtensionChainId('zcash', 'Zcash_zcash')).toBe(Chain.Zcash)
    expect(resolveChainFromExtensionChainId('cardano', 'Cardano_cardano')).toBe(
      Chain.Cardano,
    )
    expect(resolveChainFromExtensionChainId('cosmos', 'unknown')).toBeNull()
  })

  it('only allows extension chain switching where the provider supports it', () => {
    expect(canSwitchChainInExtension(Chain.Ethereum)).toBe(true)
    expect(canSwitchChainInExtension(Chain.Arbitrum)).toBe(true)
    expect(canSwitchChainInExtension(Chain.MayaChain)).toBe(false)
    expect(canSwitchChainInExtension(Chain.Zcash)).toBe(false)
    expect(canSwitchChainInExtension(Chain.Cardano)).toBe(false)
  })

  it('filters session chains down to the app-supported subset', () => {
    expect(
      getSupportedSessionChains([
        Chain.Bitcoin,
        Chain.Ethereum,
        Chain.THORChain,
        Chain.Solana,
      ]),
    ).toEqual([Chain.Bitcoin, Chain.Ethereum, Chain.THORChain])
  })
})
