import { WalletChain } from './chain-types'
import { supportedWalletChains } from './chains'
import { MAYA_VULTISIG_HD_PATH } from './maya-seedphrase-compat'
import type {
  KeysignPayload,
  MessageSignature,
  Signature,
  TxStatusResult,
} from './wallet-primitives'
import type { WalletCommandMap } from './types'

type WalletCoreModule = typeof import('@trustwallet/wallet-core')
type WalletCoreInstance = Awaited<ReturnType<WalletCoreModule['initWasm']>>

const COSMOS_REST_URLS: Partial<Record<WalletChain, string>> = {
  [WalletChain.MayaChain]: 'https://mayanode.mayachain.info',
  [WalletChain.THORChain]: 'https://thornode.ninerealms.com',
}

const EVM_RPC_URLS: Partial<Record<WalletChain, string>> = {
  [WalletChain.Ethereum]: 'https://ethereum.publicnode.com',
  [WalletChain.Arbitrum]: 'https://arb1.arbitrum.io/rpc',
}

let walletCorePromise: Promise<WalletCoreInstance> | null = null

async function getWalletCore(): Promise<WalletCoreInstance> {
  if (!walletCorePromise) {
    walletCorePromise = import('@trustwallet/wallet-core').then(({ initWasm }) =>
      initWasm(),
    )
  }
  return walletCorePromise
}

function coinTypeForChain(
  walletCore: WalletCoreInstance,
  chain: WalletChain,
): number {
  switch (chain) {
    case WalletChain.MayaChain:
    case WalletChain.THORChain:
      return walletCore.CoinType.thorchain
    case WalletChain.Bitcoin:
      return walletCore.CoinType.bitcoin
    case WalletChain.Ethereum:
    case WalletChain.Arbitrum:
      return walletCore.CoinType.ethereum
    case WalletChain.Dash:
      return walletCore.CoinType.dash
    case WalletChain.Zcash:
      return walletCore.CoinType.zcash
    case WalletChain.Cardano:
      return walletCore.CoinType.cardano
    default:
      throw new Error(`Unsupported chain for local signing: ${chain}`)
  }
}

function hrpForCosmosChain(chain: WalletChain): string {
  return chain === WalletChain.MayaChain ? 'maya' : 'thor'
}

function chainIdForCosmos(chain: WalletChain): string {
  return chain === WalletChain.MayaChain ? 'mayachain-mainnet-v1' : 'thorchain-1'
}

function nativeDenom(chain: WalletChain): string {
  return chain === WalletChain.MayaChain ? 'cacao' : 'rune'
}

export async function deriveKeystoreAddresses(
  mnemonic: string,
): Promise<Partial<Record<WalletChain, string>>> {
  const walletCore = await getWalletCore()
  const wallet = walletCore.HDWallet.createWithMnemonic(mnemonic, '')
  const addresses: Partial<Record<WalletChain, string>> = {}

  try {
    for (const chain of supportedWalletChains) {
      try {
        addresses[chain] = await deriveAddressForChain(walletCore, wallet, chain)
      } catch {
        // Skip unsupported derivations.
      }
    }
  } finally {
    wallet.delete?.()
  }

  return addresses
}

async function deriveAddressForChain(
  walletCore: WalletCoreInstance,
  wallet: ReturnType<WalletCoreInstance['HDWallet']['createWithMnemonic']>,
  chain: WalletChain,
): Promise<string> {
  const coinType = coinTypeForChain(walletCore, chain)

  if (chain === WalletChain.MayaChain || chain === WalletChain.THORChain) {
    const privateKey = wallet.getKey(coinType, MAYA_VULTISIG_HD_PATH.replace(/^m\//, ''))
    const publicKey = privateKey.getPublicKeySecp256k1(true)
    try {
      return walletCore.AnyAddress.createBech32WithPublicKey(
        publicKey,
        coinType,
        hrpForCosmosChain(chain),
      ).description()
    } finally {
      publicKey.delete?.()
      privateKey.delete?.()
    }
  }

  const privateKey = wallet.getKeyForCoin(coinType)
  try {
    return walletCore.AnyAddress.createWithPublicKey(
      privateKey.getPublicKey(coinType),
      coinType,
    ).description()
  } finally {
    privateKey.delete?.()
  }
}

async function fetchCosmosAccount(
  chain: WalletChain,
  address: string,
): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const baseUrl = COSMOS_REST_URLS[chain]
  if (!baseUrl) {
    throw new Error(`No REST URL configured for ${chain}`)
  }

  const response = await fetch(
    `${baseUrl}/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch ${chain} account metadata (${response.status})`)
  }

  const payload = (await response.json()) as {
    account?: {
      account_number?: string
      sequence?: string
      '@type'?: string
      base_account?: {
        account_number?: string
        sequence?: string
      }
    }
  }

  const account = payload.account
  const accountNumber =
    account?.account_number ?? account?.base_account?.account_number ?? '0'
  const sequence = account?.sequence ?? account?.base_account?.sequence ?? '0'

  return {
    accountNumber: BigInt(accountNumber),
    sequence: BigInt(sequence),
  }
}

export async function prepareLocalSendTx(
  input: WalletCommandMap['tx.prepare.send']['input'],
): Promise<KeysignPayload> {
  const { coin, receiver, amount, memo } = input

  if (
    coin.chain === WalletChain.MayaChain ||
    coin.chain === WalletChain.THORChain
  ) {
    const account = await fetchCosmosAccount(coin.chain, coin.address)
    return {
      coin,
      toAddress: receiver,
      toAmount: amount.toString(),
      memo: memo ?? '',
      blockchainSpecific: {
        case: coin.chain === WalletChain.MayaChain ? 'mayaSpecific' : 'thorchainSpecific',
        value: {
          accountNumber: account.accountNumber,
          sequence: account.sequence,
          isDeposit: false,
        },
      },
    }
  }

  return {
    coin,
    toAddress: receiver,
    toAmount: amount.toString(),
    memo: memo ?? '',
  }
}

export async function prepareLocalAminoTx(
  input: WalletCommandMap['tx.prepare.amino']['input'],
): Promise<KeysignPayload> {
  const account = await fetchCosmosAccount(input.chain, input.coin.address)
  return {
    coin: input.coin,
    memo: input.memo ?? '',
    aminoMsgs: input.msgs,
    aminoFee: input.fee,
    blockchainSpecific: {
      case: input.chain === WalletChain.MayaChain ? 'mayaSpecific' : 'thorchainSpecific',
      value: {
        accountNumber: account.accountNumber,
        sequence: account.sequence,
      },
    },
  }
}

export async function signLocalPayload(
  mnemonic: string,
  chain: WalletChain,
  payload: KeysignPayload,
): Promise<Signature> {
  if (chain === WalletChain.MayaChain || chain === WalletChain.THORChain) {
    return signCosmosPayload(mnemonic, chain, payload)
  }

  if (chain === WalletChain.Ethereum || chain === WalletChain.Arbitrum) {
    return signEvmPayload(mnemonic, chain, payload)
  }

  throw new Error(`Local signing is not implemented for ${chain}`)
}

async function signCosmosPayload(
  mnemonic: string,
  chain: WalletChain,
  payload: KeysignPayload,
): Promise<Signature> {
  const walletCore = await getWalletCore()
  const wallet = walletCore.HDWallet.createWithMnemonic(mnemonic, '')
  const coinType = coinTypeForChain(walletCore, chain)

  const specific =
    payload.blockchainSpecific?.case === 'mayaSpecific' ||
    payload.blockchainSpecific?.case === 'thorchainSpecific'
      ? (payload.blockchainSpecific.value ?? {})
      : {}

  const accountNumber = BigInt(String(specific.accountNumber ?? 0))
  const sequence = BigInt(String(specific.sequence ?? 0))
  const isDeposit = Boolean(specific.isDeposit)
  const coin = payload.coin
  if (!coin) {
    throw new Error('Missing coin metadata in keysign payload')
  }

  const privateKey = wallet.getKey(coinType, MAYA_VULTISIG_HD_PATH.replace(/^m\//, ''))
  const publicKey = privateKey.getPublicKeySecp256k1(true)

  try {
    const sendCoins = walletCore.Cosmos.Amount.create()
    sendCoins.amount = payload.toAmount ?? '0'
    sendCoins.denom = nativeDenom(chain)

    const amountArray = walletCore.Cosmos.Amount.create()
    const sendMessage = walletCore.Cosmos.Message.create()
    sendMessage.sendCoinsMessage = walletCore.Cosmos.Message.Send.create()
    sendMessage.sendCoinsMessage.amount = [sendCoins]
    sendMessage.sendCoinsMessage.fromAddress = coin.address
    sendMessage.sendCoinsMessage.toAddress = payload.toAddress ?? coin.address

    const feeAmount = walletCore.Cosmos.Amount.create()
    feeAmount.amount = chain === WalletChain.MayaChain ? '2000000000' : '2000000'
    feeAmount.denom = nativeDenom(chain)

    const fee = walletCore.Cosmos.Fee.create()
    fee.amount = [feeAmount]
    fee.gas = 200000

    const input = walletCore.Cosmos.SigningInput.create()
    input.signingMode = walletCore.Cosmos.SigningMode.PROTO
    input.accountNumber = accountNumber
    input.chainId = chainIdForCosmos(chain)
    input.memo = payload.memo ?? ''
    input.sequence = sequence
    input.messages = [sendMessage]
    input.fee = fee
    input.publicKey = publicKey.data()
    input.privateKey = privateKey.data()

    if (isDeposit) {
      input.messages = [sendMessage]
    }

    const encoded = walletCore.Cosmos.SigningInput.encode(input).finish()
    const outputData = walletCore.AnySigner.sign(encoded, coinType)
    const output = walletCore.Cosmos.SigningOutput.decode(outputData)

    return {
      signature: walletCore.HexCoding.encode(output.signature),
      pubKey: walletCore.HexCoding.encode(output.publicKey),
      format: 'ECDSA',
    }
  } finally {
    publicKey.delete?.()
    privateKey.delete?.()
    wallet.delete?.()
  }
}

async function signEvmPayload(
  mnemonic: string,
  chain: WalletChain,
  payload: KeysignPayload,
): Promise<Signature> {
  const walletCore = await getWalletCore()
  const wallet = walletCore.HDWallet.createWithMnemonic(mnemonic, '')
  const coinType = coinTypeForChain(walletCore, chain)
  const privateKey = wallet.getKeyForCoin(coinType)

  try {
    const input = walletCore.Ethereum.SigningInput.create()
    input.chainId = walletCore.ByteArray.createWithData(
      chain === WalletChain.Arbitrum
        ? walletCore.HexCoding.decode('0xa4b1')
        : walletCore.HexCoding.decode('0x01'),
    )
    input.nonce = walletCore.ByteArray.createWithData(
      walletCore.HexCoding.decode('0x00'),
    )
    input.gasLimit = walletCore.ByteArray.createWithData(
      walletCore.HexCoding.decode('0x5208'),
    )
    input.toAddress = payload.toAddress ?? ''
    input.privateKey = privateKey.data()
    input.transaction = walletCore.Ethereum.Transaction.create()
    input.transaction.transfer = walletCore.Ethereum.Transaction.Transfer.create()
    input.transaction.transfer.amount = walletCore.ByteArray.createWithData(
      walletCore.HexCoding.decode('0x00'),
    )

    const encoded = walletCore.Ethereum.SigningInput.encode(input).finish()
    const outputData = walletCore.AnySigner.sign(encoded, coinType)
    const output = walletCore.Ethereum.SigningOutput.decode(outputData)

    return {
      signature: walletCore.HexCoding.encode(output.encoded),
      format: 'ECDSA',
    }
  } finally {
    privateKey.delete?.()
    wallet.delete?.()
  }
}

export async function broadcastLocalTx(
  chain: WalletChain,
  payload: KeysignPayload,
  signature: Signature,
): Promise<string> {
  if (chain === WalletChain.MayaChain || chain === WalletChain.THORChain) {
    return broadcastCosmosTx(chain, signature)
  }

  if (chain === WalletChain.Ethereum || chain === WalletChain.Arbitrum) {
    return broadcastEvmTx(chain, signature.signature)
  }

  throw new Error(`Local broadcast is not implemented for ${chain}`)
}

async function broadcastCosmosTx(
  chain: WalletChain,
  signature: Signature,
): Promise<string> {
  const baseUrl = COSMOS_REST_URLS[chain]
  if (!baseUrl) {
    throw new Error(`No REST URL configured for ${chain}`)
  }

  const txBytes = signature.signature.startsWith('0x')
    ? signature.signature.slice(2)
    : signature.signature

  const response = await fetch(`${baseUrl}/cosmos/tx/v1beta1/txs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_bytes: txBytes,
      mode: 'BROADCAST_MODE_SYNC',
    }),
  })

  const result = (await response.json()) as {
    tx_response?: { txhash?: string; code?: number; raw_log?: string }
  }

  if (!response.ok || (result.tx_response?.code ?? 0) !== 0) {
    throw new Error(
      result.tx_response?.raw_log ??
        `Failed to broadcast ${chain} transaction (${response.status})`,
    )
  }

  return result.tx_response?.txhash ?? ''
}

async function broadcastEvmTx(chain: WalletChain, rawTx: string): Promise<string> {
  const rpcUrl = EVM_RPC_URLS[chain]
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for ${chain}`)
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendRawTransaction',
      params: [rawTx.startsWith('0x') ? rawTx : `0x${rawTx}`],
    }),
  })

  const result = (await response.json()) as { result?: string; error?: { message?: string } }
  if (result.error?.message) {
    throw new Error(result.error.message)
  }

  return result.result ?? ''
}

export async function signLocalMessage(
  mnemonic: string,
  chain: WalletChain,
  message: string,
): Promise<MessageSignature> {
  const walletCore = await getWalletCore()
  const wallet = walletCore.HDWallet.createWithMnemonic(mnemonic, '')
  const coinType = coinTypeForChain(walletCore, chain)
  const privateKey =
    chain === WalletChain.MayaChain || chain === WalletChain.THORChain
      ? wallet.getKey(coinType, MAYA_VULTISIG_HD_PATH.replace(/^m\//, ''))
      : wallet.getKeyForCoin(coinType)

  try {
    const input = walletCore.Ethereum.MessageSigningInput.create()
    input.privateKey = privateKey.data()
    input.message = message
    const encoded = walletCore.Ethereum.MessageSigningInput.encode(input).finish()
    const outputData = walletCore.MessageSigner.sign(encoded, coinType)
    const output = walletCore.Ethereum.MessageSigningOutput.decode(outputData)
    return {
      signature: walletCore.HexCoding.encode(output.signature),
      format: 'ECDSA',
    }
  } finally {
    privateKey.delete?.()
    wallet.delete?.()
  }
}

export async function queryLocalTxStatus(
  chain: WalletChain,
  txHash: string,
): Promise<TxStatusResult> {
  if (chain === WalletChain.MayaChain || chain === WalletChain.THORChain) {
    const baseUrl = COSMOS_REST_URLS[chain]
    const response = await fetch(
      `${baseUrl}/cosmos/tx/v1beta1/txs/${encodeURIComponent(txHash)}`,
    )
    if (!response.ok) {
      return { status: 'pending', txHash, chain }
    }
    const payload = (await response.json()) as {
      tx_response?: { code?: number; txhash?: string }
    }
    const code = payload.tx_response?.code ?? 1
    return {
      status: code === 0 ? 'success' : 'failed',
      txHash: payload.tx_response?.txhash ?? txHash,
      chain,
    }
  }

  if (chain === WalletChain.Ethereum || chain === WalletChain.Arbitrum) {
    const rpcUrl = EVM_RPC_URLS[chain]
    if (!rpcUrl) {
      return { status: 'unknown', txHash, chain }
    }
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    })
    const result = (await response.json()) as { result?: { status?: string } | null }
    if (!result.result) {
      return { status: 'pending', txHash, chain }
    }
    return {
      status: result.result.status === '0x1' ? 'success' : 'failed',
      txHash,
      chain,
      receipt: result.result as Record<string, unknown>,
    }
  }

  return { status: 'unknown', txHash, chain }
}

export async function extractLocalMessageHashes(
  _payload: KeysignPayload,
): Promise<string[]> {
  return []
}
