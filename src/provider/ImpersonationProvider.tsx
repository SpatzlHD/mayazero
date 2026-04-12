import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from "react";
import { useSettings, type SettingsState } from "#/provider/SettingsProvider";
import { type WalletSession } from "#/wallet/types";
import { useActiveWalletSession } from "#/wallet/react";
import {
  createImpersonationSession,
  hasAnyImpersonationAddresses,
  normalizeImpersonationAddresses,
  type EffectiveWalletSession,
  type ImpersonationAddressMap,
  type ImpersonationValidationErrors,
  validateImpersonationAddresses,
} from "#/lib/impersonation";

type ImpersonationContextValue = {
  isEnabled: boolean;
  isActive: boolean;
  isViewOnly: boolean;
  addresses: ImpersonationAddressMap;
  validationErrors: ImpersonationValidationErrors;
  session: EffectiveWalletSession | null;
};

const ImpersonationContext = createContext<ImpersonationContextValue | undefined>(
  undefined,
);

export function ImpersonationProvider({ children }: PropsWithChildren) {
  const settings = useSettings();
  const activeSession = useActiveWalletSession();

  const value = useMemo(() => {
    const addresses = normalizeImpersonationAddresses(
      settings.impersonationAddresses,
    );
    const validationErrors = validateImpersonationAddresses(addresses);
    const hasAnyAddresses = Object.keys(addresses).length > 0;
    const isActive =
      settings.impersonationEnabled &&
      hasAnyAddresses &&
      Object.keys(validationErrors).length === 0;
    const session = resolveEffectiveWalletSession(activeSession, settings);

    return {
      isEnabled: settings.impersonationEnabled,
      isActive,
      isViewOnly: isActive,
      addresses,
      validationErrors,
      session,
    };
  }, [
    activeSession,
    settings,
  ]);

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonationState() {
  const context = useContext(ImpersonationContext);
  if (!context) {
    throw new Error(
      "useImpersonationState must be used within an ImpersonationProvider",
    );
  }
  return context;
}

export function useEffectiveWalletSession(): EffectiveWalletSession | null {
  return useImpersonationState().session;
}

export function useIsViewOnlyImpersonation(): boolean {
  return useImpersonationState().isViewOnly;
}

export function resolveEffectiveWalletSession(
  activeSession: WalletSession | null,
  settings: Pick<
    SettingsState,
    "impersonationEnabled" | "impersonationAddresses"
  >,
): EffectiveWalletSession | null {
  const addresses = normalizeImpersonationAddresses(
    settings.impersonationAddresses,
  );
  const hasErrors = Object.keys(validateImpersonationAddresses(addresses)).length > 0;
  if (settings.impersonationEnabled && !hasErrors && hasAnyImpersonationAddresses(addresses)) {
    return createImpersonationSession(addresses);
  }

  if (!activeSession) {
    return null;
  }

  return {
    ...activeSession,
    isViewOnly: false,
  };
}
