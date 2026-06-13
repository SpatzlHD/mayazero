import UniversalProvider from '@walletconnect/universal-provider'
import {
  WALLETCONNECT_PROJECT_ID,
  walletConnectMetadata,
  walletConnectNamespaces,
} from './walletconnect-config'

export type WalletConnectSessionSnapshot = {
  topic: string
  peerName: string
  /** Legacy bare addresses (deprecated, prefer caipAccounts). */
  accounts: string[]
  /** Full CAIP-10 account identifiers from the approved session. */
  caipAccounts: string[]
  chains: string[]
}

export type WalletConnectUiState = {
  isOpen: boolean
  uri: string | null
  status: 'idle' | 'connecting' | 'connected' | 'error'
  error: string | null
}

type WalletConnectUiListener = (state: WalletConnectUiState) => void

let providerPromise: Promise<UniversalProvider> | null = null
let activeSnapshot: WalletConnectSessionSnapshot | null = null
let uiState: WalletConnectUiState = {
  isOpen: false,
  uri: null,
  status: 'idle',
  error: null,
}
const uiListeners = new Set<WalletConnectUiListener>()
let displayUriHandler: ((uri: string) => void) | null = null

function patchUiState(patch: Partial<WalletConnectUiState>): void {
  uiState = { ...uiState, ...patch }
  for (const listener of uiListeners) {
    listener(uiState)
  }
}

export function subscribeWalletConnectUi(
  listener: WalletConnectUiListener,
): () => void {
  uiListeners.add(listener)
  listener(uiState)
  return () => uiListeners.delete(listener)
}

export function getWalletConnectUiState(): WalletConnectUiState {
  return uiState
}

export function getWalletConnectSnapshot(): WalletConnectSessionSnapshot | null {
  return activeSnapshot
}

export function setWalletConnectSnapshot(
  snapshot: WalletConnectSessionSnapshot | null,
): void {
  activeSnapshot = snapshot
}

export function isWalletConnectConfigured(): boolean {
  return Boolean(WALLETCONNECT_PROJECT_ID)
}

export function ensureWalletConnectConfigured(): void {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error(
      'WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID in your environment (get a free project id at https://cloud.reown.com).',
    )
  }
}

export function closeWalletConnectUi(): void {
  patchUiState({
    isOpen: false,
    uri: null,
    status: 'idle',
    error: null,
  })
}

function bindDisplayUriListener(provider: UniversalProvider): void {
  if (displayUriHandler) {
    provider.off?.('display_uri', displayUriHandler)
  }

  displayUriHandler = (uri: string) => {
    patchUiState({
      isOpen: true,
      uri,
      status: 'connecting',
      error: null,
    })
  }

  provider.on('display_uri', displayUriHandler)
}

export async function getWalletConnectProvider(): Promise<UniversalProvider> {
  ensureWalletConnectConfigured()

  if (!providerPromise) {
    providerPromise = UniversalProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: walletConnectMetadata,
    }).then((provider) => {
      bindDisplayUriListener(provider)
      return provider
    })
  }

  return providerPromise
}

export async function connectWalletConnect(): Promise<WalletConnectSessionSnapshot> {
  ensureWalletConnectConfigured()

  patchUiState({
    isOpen: true,
    uri: null,
    status: 'connecting',
    error: null,
  })

  try {
    const provider = await getWalletConnectProvider()
    const session = await provider.connect({
      optionalNamespaces: {
        eip155: walletConnectNamespaces.eip155,
        cosmos: walletConnectNamespaces.cosmos,
        bip122: walletConnectNamespaces.bip122,
      },
    })

    const caipAccounts = Object.values(session?.namespaces ?? {}).flatMap(
      (namespace) => namespace?.accounts ?? [],
    )
    const accounts = caipAccounts.map((account) => {
      const parts = account.split(':')
      return parts.slice(2).join(':')
    })
    const chains = Object.values(session?.namespaces ?? {}).flatMap(
      (namespace) => namespace?.chains ?? [],
    )

    const snapshot: WalletConnectSessionSnapshot = {
      topic: provider.session?.topic ?? `wc-${Date.now()}`,
      peerName: provider.session?.peer?.metadata?.name ?? 'WalletConnect',
      accounts: [...new Set(accounts)],
      caipAccounts: [...new Set(caipAccounts)],
      chains: [...new Set(chains)],
    }

    setWalletConnectSnapshot(snapshot)
    patchUiState({
      isOpen: false,
      uri: null,
      status: 'connected',
      error: null,
    })
    return snapshot
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'WalletConnect connection failed'
    patchUiState({
      isOpen: false,
      uri: null,
      status: 'error',
      error: message,
    })
    throw error instanceof Error ? error : new Error(message)
  }
}

export async function disconnectWalletConnect(): Promise<void> {
  const provider = providerPromise ? await providerPromise : null
  if (provider?.session) {
    await provider.disconnect()
  }
  providerPromise = null
  displayUriHandler = null
  setWalletConnectSnapshot(null)
  closeWalletConnectUi()
}

export async function walletConnectRequest(
  chainId: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  const provider = await getWalletConnectProvider()
  return provider.request({ method, params }, chainId)
}

export function resetWalletConnectClientForTests(): void {
  providerPromise = null
  activeSnapshot = null
  displayUriHandler = null
  uiState = {
    isOpen: false,
    uri: null,
    status: 'idle',
    error: null,
  }
}
