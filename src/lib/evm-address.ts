import { type Address, getAddress } from 'viem'

export function normalizeEvmAddress(value: string): Address {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Missing EVM address.')
  }

  const prefixed = trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? `0x${trimmed.slice(2)}`
    : `0x${trimmed}`

  return getAddress(prefixed.toLowerCase())
}

export function tryNormalizeEvmAddress(
  value: string | null | undefined,
): Address | undefined {
  if (!value?.trim()) {
    return undefined
  }

  try {
    return normalizeEvmAddress(value)
  } catch {
    return undefined
  }
}
