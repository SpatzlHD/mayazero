import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import {
  isAnalyticsOptOutEnabled,
  syncAnalyticsOptOutPreference,
} from '#/analytics/runtime'
import {
  DEFAULT_SUPPORT_REFERRER_BPS,
  clearStoredReferralSupport,
  resetSupportReferrerPreferences,
  setInterfaceSupportPreferences,
  setStoredReferralSupport,
  setSupportReferrerPreferences,
} from '#/lib/swap-affiliates'
import {
  normalizeImpersonationAddresses,
  validateImpersonationAddresses,
  type ImpersonationAddressMap,
} from '#/lib/impersonation'

export interface SettingsState {
  mayanodeUrl: string
  midgardUrl: string
  tendermintUrl: string
  useZeroPercentFee: boolean
  useVultisigSwap: boolean
  analyticsDisabled: boolean
  supportFeePercent: number
  referralMayaName: string
  supportReferrerEnabled: boolean
  supportReferrerBps: string
  supportReferrerForMayaName: string
  interfaceSupportSwapEnabled: boolean
  interfaceSupportSwapBps: string
  interfaceSupportBannerDismissed: boolean
  impersonationEnabled: boolean
  impersonationAddresses: ImpersonationAddressMap
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
  clearImpersonationSettings: () => void
}

export type SettingsPersistedState = Omit<
  SettingsState,
  | 'updateSettings'
  | 'setReferralMayaName'
  | 'clearReferralMayaName'
  | 'updateSupportReferrerSettings'
  | 'resetSupportReferrerSettings'
  | 'updateInterfaceSupportSettings'
  | 'clearImpersonationSettings'
>

const defaultSettings = {
  mayanodeUrl: 'https://mayanode.mayachain.info',
  midgardUrl: 'https://midgard.mayachain.info',
  tendermintUrl: 'https://tendermint.mayachain.info',
  useZeroPercentFee: true,
  useVultisigSwap: false,
  analyticsDisabled: false,
  supportFeePercent: 0.1, // 0.1% support fee
  referralMayaName: '',
  supportReferrerEnabled: false,
  supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
  supportReferrerForMayaName: '',
  interfaceSupportSwapEnabled: false,
  interfaceSupportSwapBps: DEFAULT_SUPPORT_REFERRER_BPS,
  interfaceSupportBannerDismissed: false,
  impersonationEnabled: false,
  impersonationAddresses: {},
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
    syncAnalyticsOptOutPreference(
      typeof localStorage !== 'undefined' ? localStorage : undefined,
      settings.analyticsDisabled,
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

  const clearImpersonationSettings = () => {
    setSettings((prev: SettingsPersistedState) => ({
      ...prev,
      impersonationEnabled: false,
      impersonationAddresses: {},
    }))
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
        clearImpersonationSettings,
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
  const analyticsDisabled = isAnalyticsOptOutEnabled(storage)

  try {
    const stored = storage?.getItem('maya-settings')
    if (stored) {
      return {
        ...sanitizeStoredSettings({
          ...defaultSettings,
          analyticsDisabled,
          ...JSON.parse(stored),
        } as SettingsPersistedState),
      }
    }
  } catch {
    // Ignored
  }

  return {
    ...sanitizeStoredSettings({
      ...defaultSettings,
      analyticsDisabled,
    }),
  }
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

function sanitizeStoredSettings(
  settings: SettingsPersistedState,
): SettingsPersistedState {
  const impersonationAddresses = normalizeImpersonationAddresses(
    settings.impersonationAddresses,
  )
  const impersonationErrors = validateImpersonationAddresses(
    impersonationAddresses,
  )

  return {
    ...settings,
    impersonationAddresses,
    impersonationEnabled:
      settings.impersonationEnabled &&
      Object.keys(impersonationErrors).length === 0 &&
      Object.keys(impersonationAddresses).length > 0,
  }
}
