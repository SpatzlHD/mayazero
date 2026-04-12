import { encryptToKeyStore } from '@xchainjs/xchain-crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  decryptXChainKeystoreMnemonic,
  normalizeMnemonic,
  parseXChainKeystore,
} from './import-utils'

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('wallet import utils', () => {
  it('normalizes mnemonic whitespace and newlines', () => {
    expect(normalizeMnemonic('  abandon   abandon\nabout  ')).toBe(
      'abandon abandon about',
    )
  })

  it('parses a valid xchain keystore', async () => {
    const keystore = await encryptToKeyStore(phrase, 'secret')

    expect(parseXChainKeystore(JSON.stringify(keystore))).toMatchObject({
      id: keystore.id,
      meta: 'xchain-keystore',
    })
  })

  it('decrypts a valid xchain keystore', async () => {
    const keystore = await encryptToKeyStore(phrase, 'secret')

    await expect(
      decryptXChainKeystoreMnemonic(JSON.stringify(keystore), 'secret'),
    ).resolves.toBe(phrase)
  })

  it('rejects malformed keystore json', async () => {
    await expect(
      decryptXChainKeystoreMnemonic('{not-json', 'secret'),
    ).rejects.toThrow('Keystore file is not valid JSON.')
  })

  it('rejects keystore objects with the wrong shape', async () => {
    await expect(
      decryptXChainKeystoreMnemonic(JSON.stringify({ foo: 'bar' }), 'secret'),
    ).rejects.toThrow('Keystore file is not a valid xchain keystore.')
  })

  it('rejects an incorrect keystore password', async () => {
    const keystore = await encryptToKeyStore(phrase, 'secret')

    await expect(
      decryptXChainKeystoreMnemonic(JSON.stringify(keystore), 'wrong'),
    ).rejects.toThrow('Keystore password is incorrect.')
  })

  it('surfaces invalid decrypted mnemonics from validator callbacks', async () => {
    const keystore = await encryptToKeyStore(phrase, 'secret')
    const validateMnemonic = vi.fn(async () => ({
      valid: false,
      error: 'Seedphrase is invalid.',
    }))

    await expect(
      decryptXChainKeystoreMnemonic(JSON.stringify(keystore), 'secret', {
        validateMnemonic,
      }),
    ).rejects.toThrow('Seedphrase is invalid.')
    expect(validateMnemonic).toHaveBeenCalledWith(phrase)
  })
})
