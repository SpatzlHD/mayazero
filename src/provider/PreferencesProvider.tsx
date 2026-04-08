import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface PreferencesState {
  isPowerUser: boolean
  togglePowerUser: () => void
}

const PreferencesContext = createContext<PreferencesState | undefined>(undefined)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [isPowerUser, setIsPowerUser] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('maya-preferences-poweruser')
      return stored === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('maya-preferences-poweruser', String(isPowerUser))
    } catch {
      // Ignored
    }
  }, [isPowerUser])

  const togglePowerUser = () => setIsPowerUser((prev) => !prev)

  return (
    <PreferencesContext.Provider value={{ isPowerUser, togglePowerUser }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}
