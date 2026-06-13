import { vi } from 'vitest'
import type { StoredKeystoreRecord } from './keystore-store'

const keystoreStoreMocks = vi.hoisted(() => ({
  listStoredKeystores: vi.fn(async () => [] as StoredKeystoreRecord[]),
  getStoredKeystore: vi.fn(async () => undefined as StoredKeystoreRecord | undefined),
  deleteStoredKeystore: vi.fn(async () => {}),
  importXChainKeystoreWallet: vi.fn(
    async (input: { label: string; addresses: Record<string, string> }) =>
      ({
        id: `keystore-${Date.now()}`,
        label: input.label,
        keystore: { crypto: {}, id: 'mock', version: 1, activeAccounts: [] },
        addresses: input.addresses,
        createdAt: Date.now(),
      }) satisfies StoredKeystoreRecord,
  ),
  importMnemonicKeystoreWallet: vi.fn(
    async (input: { label: string; addresses: Record<string, string> }) =>
      ({
        id: `keystore-${Date.now()}`,
        label: input.label,
        keystore: { crypto: {}, id: 'mock', version: 1, activeAccounts: [] },
        addresses: input.addresses,
        createdAt: Date.now(),
      }) satisfies StoredKeystoreRecord,
  ),
  unlockStoredKeystoreMnemonic: vi.fn(async () => 'test mnemonic words '.repeat(2).trim()),
  createKeystoreId: vi.fn(() => `keystore-${Date.now()}`),
}))

const localSignerMocks = vi.hoisted(() => ({
  deriveKeystoreAddresses: vi.fn(async () => ({
    Ethereum: '0x00000000000000000000000000000000000000e1',
    MayaChain: 'mayachain-address',
    Bitcoin: 'bc1qabc',
    THORChain: 'thor1address',
  })),
  prepareLocalSendTx: vi.fn(async () => ({
    toAddress: '',
    toAmount: '0',
    memo: '',
    blockchainSpecific: {
      case: 'mayaSpecific',
      value: {
        accountNumber: 7n,
        sequence: 11n,
        isDeposit: false,
      },
    },
  })),
  prepareLocalAminoTx: vi.fn(async () => ({ chain: 'MayaChain', msgs: [] })),
  signLocalPayload: vi.fn(async () => ({
    signature: 'keystore-signature',
    format: 'ECDSA',
  })),
  signLocalMessage: vi.fn(async () => ({
    signature: 'signed:message',
    format: 'ECDSA',
  })),
  extractLocalMessageHashes: vi.fn(async () => ['0xhash']),
  broadcastLocalTx: vi.fn(async () => 'keystore-broadcast-hash'),
  queryLocalTxStatus: vi.fn(async () => ({ status: 'success' })),
}))

const walletConnectMocks = vi.hoisted(() => {
  let snapshot: {
    topic: string
    peerName: string
    accounts: string[]
    caipAccounts: string[]
    chains: string[]
  } | null = null

  return {
    getWalletConnectSnapshot: vi.fn(() => snapshot),
    setWalletConnectSnapshot: vi.fn((next: typeof snapshot) => {
      snapshot = next
    }),
    connectWalletConnect: vi.fn(async () => {
      snapshot = {
        topic: 'wc-topic-1',
        peerName: 'Test Wallet',
        accounts: [
          '0x00000000000000000000000000000000000000e1',
          'maya1wc',
          'bc1qtest',
        ],
        caipAccounts: [
          'eip155:1:0x00000000000000000000000000000000000000e1',
          'eip155:42161:0x00000000000000000000000000000000000000e1',
          'cosmos:mayachain-mainnet-v1:maya1wc',
          'bip122:000000000019d6689c085ae165831e93:bc1qtest',
        ],
        chains: [
          'eip155:1',
          'eip155:42161',
          'cosmos:mayachain-mainnet-v1',
          'bip122:000000000019d6689c085ae165831e93',
        ],
      }
      return snapshot
    }),
    disconnectWalletConnect: vi.fn(async () => {
      snapshot = null
    }),
    walletConnectRequest: vi.fn(async () => null),
    getWalletConnectProvider: vi.fn(async () => ({
      session: snapshot,
      connect: vi.fn(),
      disconnect: vi.fn(),
      request: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    })),
    isWalletConnectConfigured: vi.fn(() => true),
    subscribeWalletConnectUi: vi.fn(() => () => {}),
    getWalletConnectUiState: vi.fn(() => ({
      isOpen: false,
      uri: null,
      status: 'idle',
      error: null,
    })),
    closeWalletConnectUi: vi.fn(),
    resetWalletConnectClientForTests: vi.fn(() => {
      snapshot = null
    }),
  }
})

vi.mock('./keystore-store', async () => {
  const actual = await vi.importActual<typeof import('./keystore-store')>('./keystore-store')
  return {
    ...actual,
    listStoredKeystores: keystoreStoreMocks.listStoredKeystores,
    getStoredKeystore: keystoreStoreMocks.getStoredKeystore,
    deleteStoredKeystore: keystoreStoreMocks.deleteStoredKeystore,
    importXChainKeystoreWallet: keystoreStoreMocks.importXChainKeystoreWallet,
    importMnemonicKeystoreWallet: keystoreStoreMocks.importMnemonicKeystoreWallet,
    unlockStoredKeystoreMnemonic: keystoreStoreMocks.unlockStoredKeystoreMnemonic,
    createKeystoreId: keystoreStoreMocks.createKeystoreId,
  }
})

vi.mock('./local-signer', async () => {
  const actual = await vi.importActual<typeof import('./local-signer')>('./local-signer')
  return {
    ...actual,
    deriveKeystoreAddresses: localSignerMocks.deriveKeystoreAddresses,
    prepareLocalSendTx: localSignerMocks.prepareLocalSendTx,
    prepareLocalAminoTx: localSignerMocks.prepareLocalAminoTx,
    signLocalPayload: localSignerMocks.signLocalPayload,
    signLocalMessage: localSignerMocks.signLocalMessage,
    extractLocalMessageHashes: localSignerMocks.extractLocalMessageHashes,
    broadcastLocalTx: localSignerMocks.broadcastLocalTx,
    queryLocalTxStatus: localSignerMocks.queryLocalTxStatus,
  }
})

vi.mock('./walletconnect-client', async () => {
  const actual = await vi.importActual<typeof import('./walletconnect-client')>(
    './walletconnect-client',
  )
  return {
    ...actual,
    getWalletConnectSnapshot: walletConnectMocks.getWalletConnectSnapshot,
    setWalletConnectSnapshot: walletConnectMocks.setWalletConnectSnapshot,
    connectWalletConnect: walletConnectMocks.connectWalletConnect,
    disconnectWalletConnect: walletConnectMocks.disconnectWalletConnect,
    walletConnectRequest: walletConnectMocks.walletConnectRequest,
    getWalletConnectProvider: walletConnectMocks.getWalletConnectProvider,
    isWalletConnectConfigured: walletConnectMocks.isWalletConnectConfigured,
    subscribeWalletConnectUi: walletConnectMocks.subscribeWalletConnectUi,
    getWalletConnectUiState: walletConnectMocks.getWalletConnectUiState,
    closeWalletConnectUi: walletConnectMocks.closeWalletConnectUi,
    resetWalletConnectClientForTests: walletConnectMocks.resetWalletConnectClientForTests,
  }
})
