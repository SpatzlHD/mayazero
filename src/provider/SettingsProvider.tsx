import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import {
  DEFAULT_SUPPORT_REFERRER_BPS,
  clearStoredReferralSupport,
  resetSupportReferrerPreferences,
  setInterfaceSupportPreferences,
  setStoredReferralSupport,
  setSupportReferrerPreferences,
} from '#/lib/swap-affiliates'

export interface SettingsState {
  mayanodeUrl: string
  midgardUrl: string
  tendermintUrl: string
  useZeroPercentFee: boolean
  useVultisigSwap: boolean
  supportFeePercent: number
  referralMayaName: string
  supportReferrerEnabled: boolean
  supportReferrerBps: string
  supportReferrerForMayaName: string
  interfaceSupportSwapEnabled: boolean
  interfaceSupportSwapBps: string
  interfaceSupportBannerDismissed: boolean
  updateSettings: (newSettings: Partial<SettingsPersistedState>) => void
  setReferralMayaName: (name: string) => void
  clearReferralMayaName: () => void
  updateSupportReferrerSettings: (
    newSettings: Partial<
      Pick<
        SettingsPersistedState,
        'supportReferrerEnabled' | 'supportReferrerBps' | 'supportReferrerForMayaName'
      >
    >,
  ) => void
  resetSupportReferrerSettings: (referralMayaName?: string) => void
  updateInterfaceSupportSettings: (
    newSettings: Partial<
      Pick<
        SettingsPersistedState,
        | 'interfaceSupportSwapEnabled'
        | 'interfaceSupportSwapBps'
        | 'interfaceSupportBannerDismissed'
      >
    >,
  ) => void
}

export type SettingsPersistedState = Omit<
  SettingsState,
  | 'updateSettings'
  | 'setReferralMayaName'
  | 'clearReferralMayaName'
  | 'updateSupportReferrerSettings'
  | 'resetSupportReferrerSettings'
  | 'updateInterfaceSupportSettings'
>

const defaultSettings = {
  mayanodeUrl: 'https://mayanode.mayachain.info',
  midgardUrl: 'https://midgard.mayachain.info',
  tendermintUrl: 'https://tendermint.mayachain.info',
  useZeroPercentFee: true,
  useVultisigSwap: false,
  supportFeePercent: 0.1, // 0.1% support fee
  referralMayaName: '',
  supportReferrerEnabled: false,
  supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
  supportReferrerForMayaName: '',
  interfaceSupportSwapEnabled: false,
  interfaceSupportSwapBps: DEFAULT_SUPPORT_REFERRER_BPS,
  interfaceSupportBannerDismissed: false,
}

const SettingsContext = createContext<SettingsState | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() =>
    loadStoredSettings(typeof localStorage !== 'undefined' ? localStorage : undefined),
  )

  useEffect(() => {
    persistSettings(
      typeof localStorage !== 'undefined' ? localStorage : undefined,
      settings,
    )
  }, [settings])

  const updateSettings = (newSettings: Partial<SettingsPersistedState>) => {
    setSettings((prev: SettingsPersistedState) => {
      const { referralMayaName, ...rest } = newSettings
      const nextSettings = { ...prev, ...rest }

      if (referralMayaName === undefined) {
        return nextSettings
      }

      return setStoredReferralSupport(nextSettings, referralMayaName)
    })
  }

  const setReferralMayaName = (name: string) => {
    setSettings((prev: SettingsPersistedState) =>
      setStoredReferralSupport(prev, name),
    )
  }

  const clearReferralMayaName = () => {
    setSettings((prev: SettingsPersistedState) =>
      clearStoredReferralSupport(prev),
    )
  }

  const updateSupportReferrerSettings = (
    newSettings: Partial<
      Pick<
        SettingsPersistedState,
        'supportReferrerEnabled' | 'supportReferrerBps' | 'supportReferrerForMayaName'
      >
    >,
  ) => {
    setSettings((prev: SettingsPersistedState) =>
      setSupportReferrerPreferences(prev, newSettings),
    )
  }

  const resetSupportReferrerSettings = (referralMayaName?: string) => {
    setSettings((prev: SettingsPersistedState) =>
      resetSupportReferrerPreferences(prev, referralMayaName),
    )
  }

  const updateInterfaceSupportSettings = (
    newSettings: Partial<
      Pick<
        SettingsPersistedState,
        | 'interfaceSupportSwapEnabled'
        | 'interfaceSupportSwapBps'
        | 'interfaceSupportBannerDismissed'
      >
    >,
  ) => {
    setSettings((prev: SettingsPersistedState) =>
      setInterfaceSupportPreferences(prev, newSettings),
    )
  }

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        updateSettings,
        setReferralMayaName,
        clearReferralMayaName,
        updateSupportReferrerSettings,
        resetSupportReferrerSettings,
        updateInterfaceSupportSettings,
      }}
    >
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

export function loadStoredSettings(
  storage?: Pick<Storage, 'getItem'>,
): SettingsPersistedState {
  try {
    const stored = storage?.getItem('maya-settings')
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) }
    }
  } catch {
    // Ignored
  }

  return defaultSettings
}

export function persistSettings(
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: SettingsPersistedState,
) {
  try {
    storage?.setItem('maya-settings', JSON.stringify(settings))
  } catch {
    // Ignored
  }
}

export function setStoredReferralMayaName(
  settings: SettingsPersistedState,
  name: string,
): SettingsPersistedState {
  return setStoredReferralSupport(settings, name)
}

export function clearStoredReferralMayaName(
  settings: SettingsPersistedState,
): SettingsPersistedState {
  return clearStoredReferralSupport(settings)
}
