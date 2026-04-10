import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { MayaWalletManager, type MayaWalletManagerOptions } from './manager'

const MayaWalletContext = createContext<MayaWalletManager | null>(null)

export function MayaWalletProvider({
  children,
  manager,
  managerOptions,
}: PropsWithChildren<{
  manager?: MayaWalletManager
  managerOptions?: MayaWalletManagerOptions
}>) {
  const [ownedManager] = useState(
    () => manager ?? new MayaWalletManager(managerOptions),
  )

  useEffect(() => {
    void ownedManager.initialize()
    return () => ownedManager.dispose()
  }, [ownedManager])

  return (
    <MayaWalletContext.Provider value={ownedManager}>
      {children}
    </MayaWalletContext.Provider>
  )
}

export function useMayaWalletManager(): MayaWalletManager {
  const manager = useContext(MayaWalletContext)
  if (!manager) {
    throw new Error('MayaWalletProvider is missing from the React tree')
  }

  return manager
}

export function useMayaWalletState() {
  const manager = useMayaWalletManager()
  return useSyncExternalStore(manager.subscribe, manager.getState, manager.getState)
}

export function useMayaWalletActions() {
  return useMayaWalletManager()
}

export function useActiveWalletSession() {
  const state = useMayaWalletState()
  return useMemo(
    () =>
      state.sessions.find((session) => session.id === state.activeSessionId) ?? null,
    [state.activeSessionId, state.sessions],
  )
}

export function useWalletBalanceRefreshTick() {
  const state = useMayaWalletState()
  return state.balanceRefreshTick
}
