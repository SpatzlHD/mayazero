import { vi } from 'vitest'
import {
  createKeystoreId,
  deleteStoredKeystore,
  getStoredKeystore,
  importMnemonicKeystoreWallet,
  importXChainKeystoreWallet,
  listStoredKeystores,
  unlockStoredKeystoreMnemonic,
  type StoredKeystoreRecord,
} from './keystore-store'
import {
  broadcastLocalTx,
  deriveKeystoreAddresses,
  prepareLocalSendTx,
  queryLocalTxStatus,
  signLocalPayload,
} from './local-signer'
import {
  connectWalletConnect,
  getWalletConnectSnapshot,
  setWalletConnectSnapshot,
} from './walletconnect-client'
import { MayaWalletManager, type MayaWalletManagerOptions } from './manager'
import type { ExtensionWindowLike } from './adapters'
import {
  createFakeExtensionWindow,
  createMemoryStorage,
  defaultKeystoreAddresses,
} from './test-fixtures'

export const keystoreStoreMocks = {
  listStoredKeystores: vi.mocked(listStoredKeystores),
  getStoredKeystore: vi.mocked(getStoredKeystore),
  deleteStoredKeystore: vi.mocked(deleteStoredKeystore),
  importXChainKeystoreWallet: vi.mocked(importXChainKeystoreWallet),
  importMnemonicKeystoreWallet: vi.mocked(importMnemonicKeystoreWallet),
  unlockStoredKeystoreMnemonic: vi.mocked(unlockStoredKeystoreMnemonic),
  createKeystoreId: vi.mocked(createKeystoreId),
}

export const localSignerMocks = {
  deriveKeystoreAddresses: vi.mocked(deriveKeystoreAddresses),
  prepareLocalSendTx: vi.mocked(prepareLocalSendTx),
  signLocalPayload: vi.mocked(signLocalPayload),
  broadcastLocalTx: vi.mocked(broadcastLocalTx),
  queryLocalTxStatus: vi.mocked(queryLocalTxStatus),
}

export const walletConnectMocks = {
  getWalletConnectSnapshot: vi.mocked(getWalletConnectSnapshot),
  setWalletConnectSnapshot: vi.mocked(setWalletConnectSnapshot),
  connectWalletConnect: vi.mocked(connectWalletConnect),
}

export function resetWalletTestMocks(): void {
  keystoreStoreMocks.listStoredKeystores.mockReset()
  keystoreStoreMocks.listStoredKeystores.mockResolvedValue([])
  keystoreStoreMocks.getStoredKeystore.mockReset()
  keystoreStoreMocks.getStoredKeystore.mockResolvedValue(undefined)
  keystoreStoreMocks.deleteStoredKeystore.mockReset()
  keystoreStoreMocks.deleteStoredKeystore.mockResolvedValue(undefined)
  keystoreStoreMocks.importXChainKeystoreWallet.mockReset()
  keystoreStoreMocks.importMnemonicKeystoreWallet.mockReset()
  keystoreStoreMocks.unlockStoredKeystoreMnemonic.mockReset()
  keystoreStoreMocks.unlockStoredKeystoreMnemonic.mockResolvedValue(
    'test mnemonic words '.repeat(2).trim(),
  )

  localSignerMocks.deriveKeystoreAddresses.mockReset()
  localSignerMocks.deriveKeystoreAddresses.mockResolvedValue({
    ...defaultKeystoreAddresses,
  })
  localSignerMocks.prepareLocalSendTx.mockReset()
  localSignerMocks.prepareLocalSendTx.mockImplementation(async () => ({
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
  }))
  localSignerMocks.signLocalPayload.mockReset()
  localSignerMocks.signLocalPayload.mockResolvedValue({
    signature: 'keystore-signature',
    format: 'ECDSA',
  })
  localSignerMocks.broadcastLocalTx.mockReset()
  localSignerMocks.broadcastLocalTx.mockResolvedValue('keystore-broadcast-hash')
  localSignerMocks.queryLocalTxStatus.mockReset()
  localSignerMocks.queryLocalTxStatus.mockResolvedValue({ status: 'success' })

  walletConnectMocks.getWalletConnectSnapshot.mockReset()
  walletConnectMocks.connectWalletConnect.mockReset()
  walletConnectMocks.getWalletConnectSnapshot.mockImplementation(() => null)
  walletConnectMocks.setWalletConnectSnapshot.mockImplementation((next) => {
    walletConnectMocks.getWalletConnectSnapshot.mockImplementation(() => next)
  })
  walletConnectMocks.connectWalletConnect.mockImplementation(async () => {
    const snapshot = {
      topic: 'wc-topic-1',
      peerName: 'Test Wallet',
      accounts: ['0x00000000000000000000000000000000000000e1', 'maya1wc'],
      caipAccounts: [
        'eip155:1:0x00000000000000000000000000000000000000e1',
        'eip155:42161:0x00000000000000000000000000000000000000e1',
        'cosmos:mayachain-mainnet-v1:maya1wc',
      ],
      chains: ['eip155:1', 'eip155:42161', 'cosmos:mayachain-mainnet-v1'],
    }
    walletConnectMocks.setWalletConnectSnapshot(snapshot)
    return snapshot
  })
}

export type CreateTestManagerOptions = {
  extensionWindow?: ExtensionWindowLike
  prefsStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  keystores?: StoredKeystoreRecord[]
  storageKey?: string
}

export function createTestManager(
  options: CreateTestManagerOptions = {},
): MayaWalletManager {
  const keystores = options.keystores ?? []
  keystoreStoreMocks.listStoredKeystores.mockResolvedValue(keystores)
  keystoreStoreMocks.getStoredKeystore.mockImplementation(async (id: string) =>
    keystores.find((record) => record.id === id),
  )

  const managerOptions: MayaWalletManagerOptions = {
    extensionWindow: options.extensionWindow ?? createFakeExtensionWindow(),
    prefsStorage: options.prefsStorage ?? createMemoryStorage(),
    storageKey: options.storageKey,
  }

  return new MayaWalletManager(managerOptions)
}

export async function initializeKeystoreSession(
  manager: MayaWalletManager,
  record: StoredKeystoreRecord,
  password = 'vault-password',
): Promise<void> {
  await manager.selectSession(record.id)
  await manager.execute('keystore.unlock', {
    sessionId: record.id,
    input: { password },
  })
}

export async function createInitializedTestManager(
  options: CreateTestManagerOptions & {
    unlockKeystores?: boolean
    initialize?: boolean
  } = {},
): Promise<{ manager: MayaWalletManager }> {
  const manager = createTestManager(options)
  if (options.initialize !== false) {
    await manager.initialize()
  }

  if (options.unlockKeystores && options.keystores) {
    for (const record of options.keystores) {
      await initializeKeystoreSession(manager, record)
    }
  }

  return { manager }
}
