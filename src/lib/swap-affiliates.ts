export const DEFAULT_SUPPORT_REFERRER_BPS = "10";
export const MAX_SUPPORT_REFERRER_BPS = 500;
export const INTERFACE_AFFILIATE_MAYANAME = "m0";

export type AffiliateDraftLike = {
  value: string;
  bps: string;
};

export type SupportReferrerState = {
  referralMayaName: string;
  supportReferrerEnabled: boolean;
  supportReferrerBps: string;
  supportReferrerForMayaName: string;
};

export function normalizeSupportReferrerBps(
  value: string | number | undefined,
): string {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SUPPORT_REFERRER_BPS;
  }

  return String(Math.min(MAX_SUPPORT_REFERRER_BPS, Math.round(parsed)));
}

export function createInterfaceAffiliateDraft(): AffiliateDraftLike {
  return {
    value: INTERFACE_AFFILIATE_MAYANAME,
    bps: "0",
  };
}

export function setStoredReferralSupport<T extends SupportReferrerState>(
  settings: T,
  name: string,
): T {
  const nextReferralMayaName = name.trim();
  const currentReferralMayaName = settings.referralMayaName.trim();

  if (!nextReferralMayaName) {
    return clearStoredReferralSupport(settings);
  }

  if (nextReferralMayaName === currentReferralMayaName) {
    return {
      ...settings,
      referralMayaName: nextReferralMayaName,
    };
  }

  return {
    ...settings,
    referralMayaName: nextReferralMayaName,
    supportReferrerEnabled: false,
    supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
    supportReferrerForMayaName: nextReferralMayaName,
  };
}

export function clearStoredReferralSupport<T extends SupportReferrerState>(
  settings: T,
): T {
  return {
    ...settings,
    referralMayaName: "",
    supportReferrerEnabled: false,
    supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
    supportReferrerForMayaName: "",
  };
}

export function setSupportReferrerPreferences<T extends SupportReferrerState>(
  settings: T,
  next: Partial<
    Pick<
      SupportReferrerState,
      "supportReferrerEnabled" | "supportReferrerBps" | "supportReferrerForMayaName"
    >
  >,
): T {
  return {
    ...settings,
    supportReferrerEnabled:
      next.supportReferrerEnabled ?? settings.supportReferrerEnabled,
    supportReferrerBps:
      next.supportReferrerBps === undefined
        ? settings.supportReferrerBps
        : normalizeSupportReferrerBps(next.supportReferrerBps),
    supportReferrerForMayaName:
      next.supportReferrerForMayaName?.trim() ??
      settings.supportReferrerForMayaName,
  };
}

export function resetSupportReferrerPreferences<T extends SupportReferrerState>(
  settings: T,
  referralMayaName?: string,
): T {
  const nextReferralMayaName =
    referralMayaName?.trim() ?? settings.referralMayaName.trim();

  return {
    ...settings,
    supportReferrerEnabled: false,
    supportReferrerBps: DEFAULT_SUPPORT_REFERRER_BPS,
    supportReferrerForMayaName: nextReferralMayaName,
  };
}

export function isSupportReferrerEnabledForCurrentReferral(
  settings: SupportReferrerState,
): boolean {
  const currentReferralMayaName = settings.referralMayaName.trim();
  return Boolean(
    currentReferralMayaName &&
      settings.supportReferrerEnabled &&
      settings.supportReferrerForMayaName.trim() === currentReferralMayaName,
  );
}

export function hasManualAffiliateOverride(
  drafts: AffiliateDraftLike[],
): boolean {
  return drafts.some(
    (draft) => draft.value.trim().length > 0 || draft.bps.trim().length > 0,
  );
}

export function createSupportReferrerAffiliateDrafts(
  settings: SupportReferrerState,
): AffiliateDraftLike[] {
  if (!isSupportReferrerEnabledForCurrentReferral(settings)) {
    return [];
  }

  return [
    {
      value: settings.referralMayaName.trim(),
      bps: normalizeSupportReferrerBps(settings.supportReferrerBps),
    },
  ];
}

export function resolveSwapAffiliateDrafts(
  settings: SupportReferrerState,
  manualDrafts: AffiliateDraftLike[],
): AffiliateDraftLike[] {
  if (hasManualAffiliateOverride(manualDrafts)) {
    return manualDrafts;
  }

  return createSupportReferrerAffiliateDrafts(settings);
}
