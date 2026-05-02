import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectMayaSeedphraseImportMismatch,
  formatMayaSeedphraseImportMismatch,
} from './maya-seedphrase-compat'

const createBech32WithPublicKey = vi.fn()
const getPublicKeySecp256k1 = vi.fn()
const getKeyForCoin = vi.fn()
const createWithMnemonic = vi.fn()
const initWasm = vi.fn(async () => ({
  CoinType: {
    thorchain: 'thorchain',
    cosmos: 'cosmos',
  },
  HDWallet: {
    createWithMnemonic,
  },
  AnyAddress: {
    createBech32WithPublicKey,
  },
}))

vi.mock('@trustwallet/wallet-core', () => ({
  initWasm,
}))

describe('maya seedphrase compatibility', () => {
  beforeEach(() => {
    createBech32WithPublicKey.mockReset()
    getPublicKeySecp256k1.mockReset()
    getKeyForCoin.mockReset()
    createWithMnemonic.mockReset()
    initWasm.mockClear()

    getPublicKeySecp256k1
      .mockReturnValueOnce({ delete: vi.fn(), key: 'thor-pub' })
      .mockReturnValueOnce({ delete: vi.fn(), key: 'cosmos-pub' })
    getKeyForCoin.mockReturnValue({
      getPublicKeySecp256k1,
    })
    createWithMnemonic.mockReturnValue({
      getKeyForCoin,
      delete: vi.fn(),
    })
    createBech32WithPublicKey
      .mockReturnValueOnce({
        description: () => 'maya1official',
      })
      .mockReturnValueOnce({
        description: () => 'maya1cosmos',
      })
  })

  it('flags funded Maya balances on the alternate Cosmos path', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [{ amount: '42' }] }),
      } as Response)

    await expect(
      detectMayaSeedphraseImportMismatch('abandon abandon about', {
        mayanodeUrl: 'https://mayanode.test/',
        fetchImpl,
      }),
    ).resolves.toEqual({
      supportedAddress: 'maya1official',
      alternateAddress: 'maya1cosmos',
      supportedPath: "m/44'/931'/0'/0/0",
      alternatePath: "m/44'/118'/0'/0/0",
    })

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://mayanode.test/cosmos/bank/v1beta1/balances/maya1official?pagination.limit=200',
      expect.any(Object),
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://mayanode.test/cosmos/bank/v1beta1/balances/maya1cosmos?pagination.limit=200',
      expect.any(Object),
    )
  })

  it('returns null when the supported Maya path is already funded', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [{ amount: '1' }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [{ amount: '42' }] }),
      } as Response)

    await expect(
      detectMayaSeedphraseImportMismatch('abandon abandon about', {
        fetchImpl,
      }),
    ).resolves.toBeNull()
  })

  it('formats a user-facing mismatch message with both paths and addresses', () => {
    expect(
      formatMayaSeedphraseImportMismatch({
        supportedAddress: 'maya1official',
        alternateAddress: 'maya1cosmos',
        supportedPath: "m/44'/931'/0'/0/0",
        alternatePath: "m/44'/118'/0'/0/0",
      }),
    ).toContain("m/44'/118'/0'/0/0")
    expect(
      formatMayaSeedphraseImportMismatch({
        supportedAddress: 'maya1official',
        alternateAddress: 'maya1cosmos',
        supportedPath: "m/44'/931'/0'/0/0",
        alternatePath: "m/44'/118'/0'/0/0",
      }),
    ).toContain('maya1official')
  })
})
