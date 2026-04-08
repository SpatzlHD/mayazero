import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface SettingsState {
  mayanodeUrl: string
  midgardUrl: string
  tendermintUrl: string
  useZeroPercentFee: boolean
  useVultisigSwap: boolean
  supportFeePercent: number
  updateSettings: (newSettings: Partial<Omit<SettingsState, 'updateSettings'>>) => void
}

const defaultSettings = {
  mayanodeUrl: 'https://mayanode.mayachain.info',
  midgardUrl: 'https://midgard.mayachain.info',
  tendermintUrl: 'https://tendermint.mayachain.info',
  useZeroPercentFee: true,
  useVultisigSwap: false,
  supportFeePercent: 0.1, // 0.1% support fee
}

const SettingsContext = createContext<SettingsState | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('maya-settings')
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) }
      }
    } catch {
      // Ignored
    }
    return defaultSettings
  })

  useEffect(() => {
    try {
      localStorage.setItem('maya-settings', JSON.stringify(settings))
    } catch {
      // Ignored
    }
  }, [settings])

  const updateSettings = (newSettings: Partial<Omit<SettingsState, 'updateSettings'>>) => {
    setSettings((prev: any) => ({ ...prev, ...newSettings }))
  }

  return (
    <SettingsContext.Provider value={{ ...settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
