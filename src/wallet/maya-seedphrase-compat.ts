export const MAYA_VULTISIG_HD_PATH = "m/44'/931'/0'/0/0"
export const MAYA_COSMOS_HD_PATH = "m/44'/118'/0'/0/0"
export const DEFAULT_MAYANODE_URL = 'https://mayanode.mayachain.info'

type WalletCoreModule = typeof import('@trustwallet/wallet-core')
type WalletCoreInstance = Awaited<ReturnType<WalletCoreModule['initWasm']>>

type CosmosBankResponse = {
  balances?: Array<{
    amount?: string
  }>
}

export type MayaSeedphraseImportMismatch = {
  supportedAddress: string
  alternateAddress: string
  supportedPath: string
  alternatePath: string
}

let walletCorePromise: Promise<WalletCoreInstance> | null = null

function normalizeUrl(value: string | undefined): string {
  const trimmed = value?.trim()
  return (trimmed || DEFAULT_MAYANODE_URL).replace(/\/+$/, '')
}

async function getWalletCore(): Promise<WalletCoreInstance> {
  if (!walletCorePromise) {
    walletCorePromise = import('@trustwallet/wallet-core').then(({ initWasm }) =>
      initWasm(),
    )
  }

  return walletCorePromise
}

async function deriveMayaAddresses(
  mnemonic: string,
): Promise<{ supportedAddress: string; alternateAddress: string }> {
  const walletCore = await getWalletCore()
  const wallet = walletCore.HDWallet.createWithMnemonic(mnemonic, '')

  try {
    const supportedCoinType = walletCore.CoinType.thorchain
    const alternateCoinType = walletCore.CoinType.cosmos
    const supportedPublicKey = wallet
      .getKeyForCoin(supportedCoinType)
      .getPublicKeySecp256k1(false)
    const alternatePublicKey = wallet
      .getKeyForCoin(alternateCoinType)
      .getPublicKeySecp256k1(false)

    try {
      return {
        supportedAddress: walletCore.AnyAddress.createBech32WithPublicKey(
          supportedPublicKey,
          supportedCoinType,
          'maya',
        ).description(),
        alternateAddress: walletCore.AnyAddress.createBech32WithPublicKey(
          alternatePublicKey,
          alternateCoinType,
          'maya',
        ).description(),
      }
    } finally {
      supportedPublicKey.delete?.()
      alternatePublicKey.delete?.()
    }
  } finally {
    wallet.delete?.()
  }
}

async function hasMayaChainBalance(
  address: string,
  input: {
    mayanodeUrl?: string
    fetchImpl?: typeof fetch
  },
): Promise<boolean> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${normalizeUrl(input.mayanodeUrl)}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}?pagination.limit=200`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to inspect MayaChain balances (${response.status}).`)
  }

  const payload = (await response.json()) as CosmosBankResponse
  return (payload.balances ?? []).some((balance) => {
    try {
      return BigInt(balance.amount ?? '0') > 0n
    } catch {
      return false
    }
  })
}

export async function detectMayaSeedphraseImportMismatch(
  mnemonic: string,
  input: {
    mayanodeUrl?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<MayaSeedphraseImportMismatch | null> {
  try {
    const { supportedAddress, alternateAddress } = await deriveMayaAddresses(
      mnemonic,
    )
    if (supportedAddress === alternateAddress) {
      return null
    }

    const [supportedHasBalance, alternateHasBalance] = await Promise.all([
      hasMayaChainBalance(supportedAddress, input),
      hasMayaChainBalance(alternateAddress, input),
    ])

    if (!supportedHasBalance && alternateHasBalance) {
      return {
        supportedAddress,
        alternateAddress,
        supportedPath: MAYA_VULTISIG_HD_PATH,
        alternatePath: MAYA_COSMOS_HD_PATH,
      }
    }
  } catch (error) {
    console.warn('Failed to run MayaChain seedphrase compatibility check.', error)
  }

  return null
}

export function formatMayaSeedphraseImportMismatch(
  mismatch: MayaSeedphraseImportMismatch,
): string {
  return `This seedphrase holds MayaChain funds on ${mismatch.alternatePath} (${mismatch.alternateAddress}), but MayaZero imports MayaChain with ${mismatch.supportedPath} (${mismatch.supportedAddress}). Importing now would create the wrong MayaChain account for this seedphrase.`
}
