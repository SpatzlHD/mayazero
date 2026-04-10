const shorthandEntries = [
  ['a', 'ARB.ETH'],
  ['b', 'BTC.BTC'],
  ['c', 'MAYA.CACAO'],
  ['d', 'DASH.DASH'],
  ['e', 'ETH.ETH'],
  ['k', 'KUJI.KUJI'],
  ['r', 'THOR.RUNE'],
  ['x', 'XRD.XRD'],
  ['z', 'ZEC.ZEC'],
  ['ab', 'ARB.WBTC-0X2F2A2543B76A4166549F7AAB2E75BEF0AEFC5B0F'],
  ['ac', 'ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831'],
  ['ad', 'ARB.DAI-0XDA10009CBD5D07DD0CECC66161FC93D7C9000DA1'],
  ['ae', 'ARB.ETH'],
  ['ap', 'ARB.PEPE-0X25D887CE7A35172C62FEBFD67A1856F20FAEBB00'],
  ['at', 'ARB.USDT-0XFD086BC7CD5C481DCC9C85EBE478A1C0B69FCBB9'],
  ['aw', 'ARB.WSTETH-0X5979D7B546E38E414F7E9822514BE443A4800529'],
  ['bb', 'BTC.BTC'],
  ['dd', 'DASH.DASH'],
  ['ec', 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48'],
  ['ee', 'ETH.ETH'],
  ['ep', 'ETH.PEPE-0X6982508145454CE325DDBE47A25D4EC3D2311933'],
  ['et', 'ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7'],
  ['ew', 'ETH.WSTETH-0X7F39C581F595B53C5CB19BD0B3F8DA6C935E2CA0'],
  ['kk', 'KUJI.KUJI'],
  ['ku', 'KUJI.USK'],
  ['mc', 'MAYA.CACAO'],
  ['tr', 'THOR.RUNE'],
  ['xx', 'XRD.XRD'],
  ['zz', 'ZEC.ZEC'],
] as const

const shortToCanonical = new Map<string, string>(
  shorthandEntries.map(([shortCode, canonical]) => [shortCode, canonical]),
)

const canonicalToShort = new Map<string, string>()
for (const [shortCode, canonical] of shorthandEntries) {
  const normalizedCanonical = normalizeMayaAssetDenominator(canonical)
  const existing = canonicalToShort.get(normalizedCanonical)
  if (!existing || shortCode.length < existing.length) {
    canonicalToShort.set(normalizedCanonical, shortCode)
  }
}

export function expandMayaAssetDenominator(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return trimmed
  }

  return shortToCanonical.get(trimmed.toLowerCase()) ?? trimmed
}

export function abbreviateMayaAssetDenominator(value: string): string {
  const expanded = expandMayaAssetDenominator(value)
  const [chainTicker = '', assetPart = ''] = expanded.split('.', 2)
  if (!chainTicker || !assetPart) {
    return expanded
  }

  const [symbol = ''] = assetPart.split('-', 2)
  return symbol ? `${chainTicker}.${symbol}` : expanded
}

export function shortenMayaAssetDenominator(value: string): string {
  const expanded = expandMayaAssetDenominator(value)
  const normalized = normalizeMayaAssetDenominator(expanded)

  return canonicalToShort.get(normalized) ?? abbreviateMayaAssetDenominator(expanded)
}

export function matchesMayaAssetDenominator(left: string, right: string): boolean {
  const normalizedLeft = normalizeMayaAssetDenominator(expandMayaAssetDenominator(left))
  const normalizedRight = normalizeMayaAssetDenominator(expandMayaAssetDenominator(right))

  if (normalizedLeft === normalizedRight) {
    return true
  }

  return (
    normalizeMayaAssetDenominator(abbreviateMayaAssetDenominator(left)) ===
    normalizeMayaAssetDenominator(abbreviateMayaAssetDenominator(right))
  )
}

export function getMayaAssetTicker(value: string): string {
  const expanded = expandMayaAssetDenominator(value)
  const [, assetPart = ''] = expanded.split('.', 2)
  const [ticker = ''] = assetPart.split('-', 2)

  return ticker || expanded.toUpperCase()
}

export function getMayaAssetChainTicker(value: string): string {
  const expanded = expandMayaAssetDenominator(value)
  const [chainTicker = ''] = expanded.split('.', 2)
  return chainTicker.toUpperCase()
}

function normalizeMayaAssetDenominator(value: string): string {
  return value.trim().toUpperCase()
}
