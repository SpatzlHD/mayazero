import {
  decryptFromKeystore,
  type Keystore as XChainKeystore,
} from '@xchainjs/xchain-crypto'

type MnemonicValidationResult = {
  valid: boolean
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeMnemonic(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

export function parseXChainKeystore(input: string): XChainKeystore {
  let parsed: unknown

  try {
    parsed = JSON.parse(input)
  } catch {
    throw new Error('Keystore file is not valid JSON.')
  }

  if (!isValidXChainKeystore(parsed)) {
    throw new Error('Keystore file is not a valid xchain keystore.')
  }

  return parsed
}

export async function decryptXChainKeystoreMnemonic(
  input: string,
  password: string,
  options?: {
    validateMnemonic?: (mnemonic: string) => Promise<MnemonicValidationResult>
  },
): Promise<string> {
  const keystore = parseXChainKeystore(input)

  let mnemonic: string
  try {
    mnemonic = await decryptFromKeystore(keystore, password)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('invalid password')) {
      throw new Error('Keystore password is incorrect.')
    }
    throw new Error('Failed to decrypt keystore file.')
  }

  const normalizedMnemonic = normalizeMnemonic(mnemonic)

  if (options?.validateMnemonic) {
    const validation = await options.validateMnemonic(normalizedMnemonic)
    if (!validation.valid) {
      throw new Error(validation.error || 'Decrypted seedphrase is invalid.')
    }
  }

  return normalizedMnemonic
}

function isValidXChainKeystore(value: unknown): value is XChainKeystore {
  if (!isRecord(value)) {
    return false
  }

  const crypto = value.crypto
  const cipherparams = isRecord(crypto) ? crypto.cipherparams : undefined
  const kdfparams = isRecord(crypto) ? crypto.kdfparams : undefined

  return (
    typeof value.id === 'string' &&
    typeof value.version === 'number' &&
    typeof value.meta === 'string' &&
    isRecord(crypto) &&
    typeof crypto.cipher === 'string' &&
    typeof crypto.ciphertext === 'string' &&
    typeof crypto.kdf === 'string' &&
    typeof crypto.mac === 'string' &&
    isRecord(cipherparams) &&
    typeof cipherparams.iv === 'string' &&
    isRecord(kdfparams) &&
    typeof kdfparams.prf === 'string' &&
    typeof kdfparams.dklen === 'number' &&
    typeof kdfparams.salt === 'string' &&
    typeof kdfparams.c === 'number'
  )
}
