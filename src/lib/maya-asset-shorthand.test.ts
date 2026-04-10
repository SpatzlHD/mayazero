import { describe, expect, it } from 'vitest'
import {
  abbreviateMayaAssetDenominator,
  expandMayaAssetDenominator,
  getMayaAssetTicker,
  matchesMayaAssetDenominator,
  shortenMayaAssetDenominator,
} from './maya-asset-shorthand'

describe('maya asset shorthand', () => {
  it('expands mayanode short codes', () => {
    expect(expandMayaAssetDenominator('c')).toBe('MAYA.CACAO')
    expect(expandMayaAssetDenominator('ee')).toBe('ETH.ETH')
    expect(expandMayaAssetDenominator('ec')).toBe(
      'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
    )
  })

  it('shortens canonical assets using the latest mayanode mapping', () => {
    expect(shortenMayaAssetDenominator('MAYA.CACAO')).toBe('c')
    expect(shortenMayaAssetDenominator('ETH.ETH')).toBe('e')
    expect(
      shortenMayaAssetDenominator('ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    ).toBe('et')
  })

  it('falls back to abbreviated chain.symbol notation for unknown token aliases', () => {
    expect(
      shortenMayaAssetDenominator('ETH.LEO-0x2AF5D2AD76741191D15Dfe7bF6aC92d4Bd912Ca3'),
    ).toBe('ETH.LEO')
  })

  it('matches canonical, abbreviated, and shorthand forms', () => {
    expect(matchesMayaAssetDenominator('c', 'MAYA.CACAO')).toBe(true)
    expect(matchesMayaAssetDenominator('et', 'ETH.USDT-0xdac17f958d2ee523a2206206994597c13d831ec7')).toBe(true)
    expect(matchesMayaAssetDenominator('ETH.USDT', 'ETH.USDT-0xdac17f958d2ee523a2206206994597c13d831ec7')).toBe(true)
  })

  it('extracts a usable ticker from any supported form', () => {
    expect(getMayaAssetTicker('c')).toBe('CACAO')
    expect(getMayaAssetTicker('ec')).toBe('USDC')
    expect(getMayaAssetTicker(abbreviateMayaAssetDenominator('ETH.USDT-0xdac17f958d2ee523a2206206994597c13d831ec7'))).toBe('USDT')
  })
})
