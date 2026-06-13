import { encryptToKeyStore, type Keystore } from '@xchainjs/xchain-crypto'
import { decryptXChainKeystoreMnemonic, normalizeMnemonic } from './import-utils'
import type { WalletChain } from './chain-types'

const DB_NAME = 'maya-zero-keystores'
const DB_VERSION = 1
const STORE_NAME = 'wallets'

export type StoredKeystoreRecord = {
  id: string
  label: string
  keystore: Keystore
  addresses: Partial<Record<WalletChain, string>>
  createdAt: number
}

type KeystoreDb = {
  getAll: () => Promise<StoredKeystoreRecord[]>
  get: (id: string) => Promise<StoredKeystoreRecord | undefined>
  put: (record: StoredKeystoreRecord) => Promise<void>
  delete: (id: string) => Promise<void>
}

function openKeystoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Failed to open keystore database'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function createKeystoreDb(): KeystoreDb {
  return {
    async getAll() {
      const db = await openKeystoreDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.getAll()
        request.onerror = () => reject(request.error ?? new Error('Failed to read keystores'))
        request.onsuccess = () => resolve((request.result as StoredKeystoreRecord[]) ?? [])
        tx.oncomplete = () => db.close()
      })
    },
    async get(id) {
      const db = await openKeystoreDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(id)
        request.onerror = () => reject(request.error ?? new Error('Failed to read keystore'))
        request.onsuccess = () => resolve(request.result as StoredKeystoreRecord | undefined)
        tx.oncomplete = () => db.close()
      })
    },
    async put(record) {
      const db = await openKeystoreDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.put(record)
        request.onerror = () => reject(request.error ?? new Error('Failed to save keystore'))
        request.onsuccess = () => resolve()
        tx.oncomplete = () => db.close()
      })
    },
    async delete(id) {
      const db = await openKeystoreDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.delete(id)
        request.onerror = () => reject(request.error ?? new Error('Failed to delete keystore'))
        request.onsuccess = () => resolve()
        tx.oncomplete = () => db.close()
      })
    },
  }
}

let keystoreDb: KeystoreDb | null = null

function getKeystoreDb(): KeystoreDb {
  if (!keystoreDb) {
    keystoreDb = createKeystoreDb()
  }
  return keystoreDb
}

export function createKeystoreId(): string {
  return `keystore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function listStoredKeystores(): Promise<StoredKeystoreRecord[]> {
  return getKeystoreDb().getAll()
}

export async function getStoredKeystore(id: string): Promise<StoredKeystoreRecord | undefined> {
  return getKeystoreDb().get(id)
}

export async function deleteStoredKeystore(id: string): Promise<void> {
  await getKeystoreDb().delete(id)
}

export async function importXChainKeystoreWallet(input: {
  label: string
  rawKeystore: string
  keystorePassword: string
  vaultPassword: string
  addresses: Partial<Record<WalletChain, string>>
}): Promise<StoredKeystoreRecord> {
  const mnemonic = normalizeMnemonic(
    await decryptXChainKeystoreMnemonic(input.rawKeystore, input.keystorePassword),
  )

  try {
    const encrypted = await encryptToKeyStore(mnemonic, input.vaultPassword)
    const record: StoredKeystoreRecord = {
      id: createKeystoreId(),
      label: input.label.trim() || 'Imported Keystore',
      keystore: encrypted,
      addresses: input.addresses,
      createdAt: Date.now(),
    }
    await getKeystoreDb().put(record)
    return record
  } finally {
    mnemonic.replace(/./g, '\0')
  }
}

export async function importMnemonicKeystoreWallet(input: {
  label: string
  mnemonic: string
  vaultPassword: string
  addresses: Partial<Record<WalletChain, string>>
}): Promise<StoredKeystoreRecord> {
  const mnemonic = normalizeMnemonic(input.mnemonic)
  try {
    const encrypted = await encryptToKeyStore(mnemonic, input.vaultPassword)
    const record: StoredKeystoreRecord = {
      id: createKeystoreId(),
      label: input.label.trim() || 'Imported Wallet',
      keystore: encrypted,
      addresses: input.addresses,
      createdAt: Date.now(),
    }
    await getKeystoreDb().put(record)
    return record
  } finally {
    mnemonic.replace(/./g, '\0')
  }
}

export async function unlockStoredKeystoreMnemonic(
  record: StoredKeystoreRecord,
  vaultPassword: string,
): Promise<string> {
  return decryptXChainKeystoreMnemonic(JSON.stringify(record.keystore), vaultPassword)
}
