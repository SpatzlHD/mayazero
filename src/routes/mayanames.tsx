import { createFileRoute } from "@tanstack/react-router";
import { Chain } from "@vultisig/sdk";
import {
  Activity,
  AlertCircle,
  ChevronDown,
  Coins,
  Copy,
  Link2,
  RefreshCw,
  Tags,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AssetIcon,
  SelectionModal,
  shortenAddress,
} from "#/components/ProtocolPrimitives";

const PREFERRED_CHAINS = [
  "BTC",
  "ETH",
  "THOR",
  "MAYA",
  "DASH",
  "ADA",
  "ARB",
  "ZEC",
  "XRD",
];
import { formatBaseUnits } from "#/lib/cacao-pool";
import {
  fetchMayaAssetCatalog,
  type MayaAssetCatalog,
} from "#/lib/maya-asset-catalog";
import {
  MAYA_NAME_BLOCKS_PER_YEAR,
  MAYA_NAME_UPDATE_AMOUNT_BASE_UNITS,
  buildAliasUpdateMayaNameMemo,
  buildMayaNameReferralHref,
  buildReferralProfileMayaNameMemo,
  buildRegisterMayaNameMemo,
  buildRenewMayaNameMemo,
  calculateMayaNameExpiryBlock,
  calculateRegisterMayaNameAmountBaseUnits,
  calculateRenewMayaNameAmountBaseUnits,
  fetchManagedMayaName,
  fetchMayaNamePricing,
  fetchOwnedMayaNames,
  type ManagedMayaNameRecord,
  type MayaNamePricing,
  type MayaNameSubaffiliate,
} from "#/lib/mayaname";
import { VIEW_ONLY_IMPERSONATION_REASON } from "#/lib/impersonation";
import { buildPageSeoHead } from "#/lib/seo";
import {
  useEffectiveWalletSession,
  useIsViewOnlyImpersonation,
} from "#/provider/ImpersonationProvider";
import { useSettings } from "#/provider/SettingsProvider";
import {
  createExecutionJourneySteps,
  getMayaNameDepositSupport,
  submitMayaNameDeposit,
  trackTransactionJourney,
  useMayaWalletActions,
  waitForJourneyTransactionSettlement,
} from "#/wallet";

export const Route = createFileRoute("/mayanames")({
  head: () =>
    buildPageSeoHead({
      title: "MAYANames",
      description:
        "Register, renew, and manage Maya Protocol MAYANames while generating referral links for swap campaigns.",
    }),
  component: MayaNamesRoute,
});

type EditableSubaffiliateDraft = {
  id: string;
  name: string;
  shareBps: string;
  existing: boolean;
  removed: boolean;
};

type MayaNameRegisterDraft = {
  name: string;
  owner: string;
  aliasChain: string;
  aliasAddress: string;
  preferredAsset: string;
  affiliateBps: string;
  years: string;
  subaffiliates: EditableSubaffiliateDraft[];
};

type MayaNameProfileDraft = {
  preferredAsset: string;
  affiliateBps: string;
  subaffiliates: EditableSubaffiliateDraft[];
};

type MayaNameAliasDraft = {
  chain: string;
  address: string;
};

type MayaNameRenewDraft = {
  years: string;
};

type MayaNamesViewState =
  | "disconnected"
  | "connect-maya"
  | "loading"
  | "empty"
  | "ready";

type MayaNamesPageProps = {
  loadCatalog?: typeof fetchMayaAssetCatalog;
  loadPricing?: typeof fetchMayaNamePricing;
  loadOwnedNames?: typeof fetchOwnedMayaNames;
  loadManagedName?: typeof fetchManagedMayaName;
  submitDeposit?: typeof submitMayaNameDeposit;
  copyText?: (value: string) => Promise<void>;
};

type MayaNamesPageContentProps = {
  viewState: MayaNamesViewState;
  activeSessionLabel: string;
  isViewOnly: boolean;
  mayaAddress: string;
  ownedNames: string[];
  selectedName: string;
  managedRecord: ManagedMayaNameRecord | null;
  workspaceError: string | null;
  pricingError: string | null;
  isWorkspaceLoading: boolean;
  isPricingLoading: boolean;
  isRefreshing: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  registerDraft: MayaNameRegisterDraft;
  aliasDraft: MayaNameAliasDraft;
  profileDraft: MayaNameProfileDraft;
  renewDraft: MayaNameRenewDraft;
  registerAmountBaseUnits: string;
  renewAmountBaseUnits: string;
  registerMemoPreview: string;
  aliasMemoPreview: string;
  profileMemoPreview: string;
  renewMemoPreview: string;
  preferredAssets: string[];
  referralHref: string;
  supportReason?: string;
  onConnectWallet: () => void;
  onConnectMayaChain: () => void;
  onRefresh: () => void;
  onSelectName: (name: string) => void;
  onRegisterDraftChange: (patch: Partial<MayaNameRegisterDraft>) => void;
  onRegisterSubaffiliateChange: (
    id: string,
    patch: Partial<EditableSubaffiliateDraft>,
  ) => void;
  onAddRegisterSubaffiliate: () => void;
  onRemoveRegisterSubaffiliate: (id: string) => void;
  onAliasDraftChange: (patch: Partial<MayaNameAliasDraft>) => void;
  onProfileDraftChange: (patch: Partial<MayaNameProfileDraft>) => void;
  onProfileSubaffiliateChange: (
    id: string,
    patch: Partial<EditableSubaffiliateDraft>,
  ) => void;
  onAddProfileSubaffiliate: () => void;
  onRemoveProfileSubaffiliate: (id: string) => void;
  onRenewDraftChange: (patch: Partial<MayaNameRenewDraft>) => void;
  onRegisterSubmit: () => void;
  onAliasSubmit: () => void;
  onProfileSubmit: () => void;
  onRenewSubmit: () => void;
  onCopyReferralLink: () => void;
};

function MayaNamesRoute() {
  return <MayaNamesPage />;
}

export function MayaNamesPage({
  loadCatalog = fetchMayaAssetCatalog,
  loadPricing = fetchMayaNamePricing,
  loadOwnedNames = fetchOwnedMayaNames,
  loadManagedName = fetchManagedMayaName,
  submitDeposit = submitMayaNameDeposit,
  copyText = defaultCopyText,
}: MayaNamesPageProps) {
  const wallet = useMayaWalletActions();
  const settings = useSettings();
  const activeSession = useEffectiveWalletSession();
  const isViewOnly = useIsViewOnlyImpersonation();
  const mayaAddress = activeSession?.addresses[Chain.MayaChain] ?? "";

  const [catalog, setCatalog] = useState<MayaAssetCatalog | null>(null);
  const [pricing, setPricing] = useState<MayaNamePricing | null>(null);
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [ownedNames, setOwnedNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [managedRecord, setManagedRecord] =
    useState<ManagedMayaNameRecord | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [registerDraft, setRegisterDraft] = useState<MayaNameRegisterDraft>(
    () => createDefaultRegisterDraft(""),
  );
  const [aliasDraft, setAliasDraft] = useState<MayaNameAliasDraft>({
    chain: "",
    address: "",
  });
  const [profileDraft, setProfileDraft] = useState<MayaNameProfileDraft>(
    createProfileDraft(null),
  );
  const [renewDraft, setRenewDraft] =
    useState<MayaNameRenewDraft>(createRenewDraft());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);

  const support = isViewOnly
    ? {
        supported: false,
        reason: VIEW_ONLY_IMPERSONATION_REASON,
      }
    : getMayaNameDepositSupport(wallet, activeSession?.id);
  const isSubmitting = submittingAction !== null;

  useEffect(() => {
    setRegisterDraft((current) => ({
      ...current,
      owner: mayaAddress || current.owner,
      aliasChain: current.aliasChain || "MAYA",
      aliasAddress:
        current.aliasChain === "MAYA" || !current.aliasChain
          ? mayaAddress || current.aliasAddress
          : current.aliasAddress,
    }));
  }, [mayaAddress]);

  useEffect(() => {
    let cancelled = false;
    async function loadPageCatalog() {
      try {
        const nextCatalog = await loadCatalog({
          midgardUrl: settings.midgardUrl,
        });
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      } catch {
        if (!cancelled) {
          setCatalog(null);
        }
      }
    }
    void loadPageCatalog();
    return () => {
      cancelled = true;
    };
  }, [loadCatalog, settings.midgardUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadPagePricing() {
      setIsPricingLoading(true);
      setPricingError(null);
      try {
        const nextPricing = await loadPricing({
          mayanodeUrl: settings.mayanodeUrl,
        });
        if (!cancelled) {
          setPricing(nextPricing);
        }
      } catch (error) {
        if (!cancelled) {
          setPricing(null);
          setPricingError((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsPricingLoading(false);
        }
      }
    }
    void loadPagePricing();
    return () => {
      cancelled = true;
    };
  }, [loadPricing, settings.mayanodeUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadOwned() {
      if (!mayaAddress) {
        setOwnedNames([]);
        setSelectedName("");
        setManagedRecord(null);
        setWorkspaceError(null);
        return;
      }

      setIsWorkspaceLoading(true);
      setWorkspaceError(null);
      try {
        const nextOwnedNames = await loadOwnedNames(mayaAddress, {
          midgardUrl: settings.midgardUrl,
        });
        if (cancelled) {
          return;
        }

        setOwnedNames(nextOwnedNames);
        setSelectedName((current) =>
          resolveSelectedOwnedMayaName(nextOwnedNames, current),
        );
      } catch (error) {
        if (!cancelled) {
          setOwnedNames([]);
          setSelectedName("");
          setManagedRecord(null);
          setWorkspaceError((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceLoading(false);
        }
      }
    }
    void loadOwned();
    return () => {
      cancelled = true;
    };
  }, [loadOwnedNames, mayaAddress, settings.midgardUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadRecord() {
      if (!selectedName) {
        setManagedRecord(null);
        setProfileDraft(createProfileDraft(null));
        return;
      }

      setIsWorkspaceLoading(true);
      setWorkspaceError(null);
      try {
        const nextRecord = await loadManagedName(selectedName, {
          mayanodeUrl: settings.mayanodeUrl,
          midgardUrl: settings.midgardUrl,
        });
        if (cancelled) {
          return;
        }

        setManagedRecord(nextRecord);
        setProfileDraft(createProfileDraft(nextRecord));
        setRenewDraft(createRenewDraft());
      } catch (error) {
        if (!cancelled) {
          setManagedRecord(null);
          setWorkspaceError((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceLoading(false);
        }
      }
    }
    void loadRecord();
    return () => {
      cancelled = true;
    };
  }, [
    loadManagedName,
    selectedName,
    settings.mayanodeUrl,
    settings.midgardUrl,
  ]);

  const viewState = getMayaNamesViewState({
    hasSession: Boolean(activeSession),
    hasMayaAddress: Boolean(mayaAddress),
    isWorkspaceLoading,
    ownedCount: ownedNames.length,
  });

  const registerRequestedBlocks = useMemo(
    () => parseYearsToBlocks(registerDraft.years),
    [registerDraft.years],
  );
  const renewRequestedBlocks = useMemo(
    () => parseYearsToBlocks(renewDraft.years),
    [renewDraft.years],
  );

  const registerAmountBaseUnits = useMemo(() => {
    if (!pricing || registerRequestedBlocks == null) {
      return "";
    }
    return calculateRegisterMayaNameAmountBaseUnits(
      pricing,
      registerRequestedBlocks,
    );
  }, [pricing, registerRequestedBlocks]);

  const renewAmountBaseUnits = useMemo(() => {
    if (!pricing || renewRequestedBlocks == null) {
      return "";
    }
    return calculateRenewMayaNameAmountBaseUnits(pricing, renewRequestedBlocks);
  }, [pricing, renewRequestedBlocks]);

  const registerMemoPreview = useMemo(() => {
    if (!pricing || registerRequestedBlocks == null) {
      return "";
    }

    return buildRegisterMayaNameMemo({
      name: registerDraft.name,
      owner: registerDraft.owner,
      aliasChain: registerDraft.aliasChain,
      aliasAddress: registerDraft.aliasAddress,
      preferredAsset: registerDraft.preferredAsset,
      affiliateBps: registerDraft.affiliateBps,
      expiryBlockHeight: calculateMayaNameExpiryBlock(
        pricing,
        registerRequestedBlocks,
      ),
      subaffiliates: toActionSubaffiliates(registerDraft.subaffiliates),
    });
  }, [pricing, registerDraft, registerRequestedBlocks]);

  const aliasMemoPreview = useMemo(() => {
    if (!managedRecord) {
      return "";
    }
    return buildAliasUpdateMayaNameMemo({
      name: managedRecord.name,
      aliasChain: aliasDraft.chain,
      aliasAddress: aliasDraft.address,
    });
  }, [aliasDraft.address, aliasDraft.chain, managedRecord]);

  const profileMemoPreview = useMemo(() => {
    if (!managedRecord) {
      return "";
    }
    return buildReferralProfileMayaNameMemo({
      name: managedRecord.name,
      preferredAsset: profileDraft.preferredAsset,
      affiliateBps: profileDraft.affiliateBps,
      subaffiliates: toActionSubaffiliates(profileDraft.subaffiliates),
    });
  }, [managedRecord, profileDraft]);

  const renewMemoPreview = useMemo(() => {
    if (!managedRecord) {
      return "";
    }
    return buildRenewMayaNameMemo({
      name: managedRecord.name,
      mayaAddress: managedRecord.mayaAliasAddress || managedRecord.owner,
    });
  }, [managedRecord]);

  const preferredAssets = useMemo(
    () => catalog?.assets.map((asset) => asset.asset) ?? ["MAYA.CACAO"],
    [catalog],
  );

  const referralHref = useMemo(() => {
    if (!managedRecord) {
      return "";
    }
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://mayazero.local";
    return buildMayaNameReferralHref(origin, managedRecord.name);
  }, [managedRecord]);

  async function refreshWorkspace(preferredSelection?: string) {
    if (!mayaAddress) {
      setOwnedNames([]);
      setSelectedName("");
      setManagedRecord(null);
      return;
    }

    setIsRefreshing(true);
    setWorkspaceError(null);
    try {
      const workspace = await loadMayaNameWorkspace({
        ownerAddress: mayaAddress,
        preferredSelection,
        loadOwnedNames,
        loadManagedName,
        midgardUrl: settings.midgardUrl,
        mayanodeUrl: settings.mayanodeUrl,
      });
      setOwnedNames(workspace.ownedNames);
      setSelectedName(workspace.selectedName);
      setManagedRecord(workspace.managedRecord);
      setProfileDraft(createProfileDraft(workspace.managedRecord));
      setRenewDraft(createRenewDraft());
    } catch (error) {
      setWorkspaceError((error as Error).message);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function executeManagedDeposit(input: {
    actionKey: string;
    title: string;
    amountBaseUnits: string;
    memo: string;
    successMessage: string;
    preferredSelection?: string;
    analytics?: {
      action: "register" | "renew";
      route: "/mayanames";
      subject: "mayaname";
    };
  }) {
    if (!activeSession || !support.supported) {
      if (isViewOnly) {
        setSubmitError(VIEW_ONLY_IMPERSONATION_REASON);
      }
      return;
    }

    setSubmitError(null);
    setSubmittingAction(input.actionKey);
    try {
      await trackTransactionJourney(wallet, {
        kind: "mayaname",
        title: input.title,
        sessionId: activeSession.id,
        source: activeSession.source,
        chain: Chain.MayaChain,
        routePath: "/mayanames",
        ...(input.analytics ? { analytics: input.analytics } : {}),
        steps: createExecutionJourneySteps({
          source: activeSession.source,
          finalLabel: "MAYAName Updated",
        }),
        run: async (journey) => {
          journey.activateStep("preparing", "Preparing MAYAName deposit memo.");
          const result = await submitDeposit(wallet, {
            amountBaseUnits: input.amountBaseUnits,
            memo: input.memo,
            sessionId: activeSession.id,
            journeyId: journey.journeyId,
          });

          journey.completeStep("preparing", "MAYAName deposit prepared.");
          if (activeSession.source === "extension") {
            journey.completeStep(
              "provider",
              "Extension accepted the MAYAName request.",
            );
          } else {
            journey.completeStep("signing", "Vault signing complete.");
          }

          journey.setPrimaryTxHash(result.txHash);
          journey.completeStep(
            "broadcasting",
            result.txHash
              ? "MAYAName deposit broadcast submitted."
              : "MAYAName deposit submitted without a returned hash.",
          );
          journey.activateStep(
            "confirming",
            "Waiting for MayaChain confirmation.",
          );

          const settlement = await waitForJourneyTransactionSettlement(wallet, {
            chain: Chain.MayaChain,
            journeyId: journey.journeyId,
            primary: true,
            sessionId: activeSession.id,
            stepKey: "confirming",
            txHash: result.txHash,
          });

          journey.updateStep("complete", {
            status:
              settlement === "success"
                ? "success"
                : settlement === "error"
                  ? "error"
                  : settlement === "unconfirmed"
                    ? "unconfirmed"
                    : "attention",
            message:
              settlement === "success"
                ? "MAYAName action confirmed on-chain."
                : settlement === "error"
                  ? "MAYAName action failed on-chain."
                  : settlement === "unconfirmed"
                    ? "MAYAName action submitted, but confirmation timed out."
                    : "MAYAName action submitted, but automatic tracking is unavailable.",
          });
          journey.complete(result, settlement);
          return result;
        },
      });

      toast.success(input.successMessage);
      await refreshWorkspace(input.preferredSelection);
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleRegisterSubmit() {
    const trimmedName = registerDraft.name.trim();
    const trimmedOwner = registerDraft.owner.trim();
    const trimmedAliasChain = registerDraft.aliasChain.trim().toUpperCase();
    const trimmedAliasAddress = registerDraft.aliasAddress.trim();
    const trimmedAffiliateBps = registerDraft.affiliateBps.trim() || "0";

    if (!pricing || registerRequestedBlocks == null) {
      setSubmitError(
        "Pricing is still loading, so the registration amount cannot be calculated yet.",
      );
      return;
    }

    if (
      !trimmedName ||
      !trimmedOwner ||
      !trimmedAliasChain ||
      !trimmedAliasAddress
    ) {
      setSubmitError(
        "Name, owner, alias chain, and alias address are required to register a MAYAName.",
      );
      return;
    }

    await executeManagedDeposit({
      actionKey: "register",
      title: `Register ${trimmedName}`,
      amountBaseUnits: registerAmountBaseUnits,
      memo: buildRegisterMayaNameMemo({
        name: trimmedName,
        owner: trimmedOwner,
        aliasChain: trimmedAliasChain,
        aliasAddress: trimmedAliasAddress,
        preferredAsset: registerDraft.preferredAsset,
        affiliateBps: trimmedAffiliateBps,
        expiryBlockHeight: calculateMayaNameExpiryBlock(
          pricing,
          registerRequestedBlocks,
        ),
        subaffiliates: toActionSubaffiliates(registerDraft.subaffiliates),
      }),
      successMessage: `Submitted MAYAName registration for ${trimmedName}.`,
      preferredSelection: trimmedName,
      analytics: {
        action: "register",
        route: "/mayanames",
        subject: "mayaname",
      },
    });
  }

  async function handleAliasSubmit() {
    if (!managedRecord) {
      return;
    }

    const trimmedChain = aliasDraft.chain.trim().toUpperCase();
    const trimmedAddress = aliasDraft.address.trim();
    if (!trimmedChain || !trimmedAddress) {
      setSubmitError("Alias chain and alias address are required.");
      return;
    }

    await executeManagedDeposit({
      actionKey: "alias",
      title: `Update ${managedRecord.name} alias`,
      amountBaseUnits: MAYA_NAME_UPDATE_AMOUNT_BASE_UNITS,
      memo: buildAliasUpdateMayaNameMemo({
        name: managedRecord.name,
        aliasChain: trimmedChain,
        aliasAddress: trimmedAddress,
      }),
      successMessage: `Submitted alias update for ${managedRecord.name}.`,
      preferredSelection: managedRecord.name,
    });
  }

  async function handleProfileSubmit() {
    if (!managedRecord) {
      return;
    }

    await executeManagedDeposit({
      actionKey: "profile",
      title: `Update ${managedRecord.name} referral profile`,
      amountBaseUnits: MAYA_NAME_UPDATE_AMOUNT_BASE_UNITS,
      memo: buildReferralProfileMayaNameMemo({
        name: managedRecord.name,
        preferredAsset: profileDraft.preferredAsset,
        affiliateBps: profileDraft.affiliateBps,
        subaffiliates: toActionSubaffiliates(profileDraft.subaffiliates),
      }),
      successMessage: `Submitted referral profile update for ${managedRecord.name}.`,
      preferredSelection: managedRecord.name,
    });
  }

  async function handleRenewSubmit() {
    if (!managedRecord || renewRequestedBlocks == null || !pricing) {
      setSubmitError("Renewal pricing is unavailable right now.");
      return;
    }

    await executeManagedDeposit({
      actionKey: "renew",
      title: `Renew ${managedRecord.name}`,
      amountBaseUnits: renewAmountBaseUnits,
      memo: buildRenewMayaNameMemo({
        name: managedRecord.name,
        mayaAddress: managedRecord.mayaAliasAddress || managedRecord.owner,
      }),
      successMessage: `Submitted renewal for ${managedRecord.name}.`,
      preferredSelection: managedRecord.name,
      analytics: {
        action: "renew",
        route: "/mayanames",
        subject: "mayaname",
      },
    });
  }

  function handleCopyReferralLink() {
    if (!referralHref) {
      return;
    }

    void copyText(referralHref)
      .then(() => {
        toast.success("Referral link copied.");
      })
      .catch((error) => {
        toast.error((error as Error).message);
      });
  }

  return (
    <MayaNamesPageContent
      viewState={viewState}
      activeSessionLabel={activeSession?.label ?? "No session"}
      isViewOnly={isViewOnly}
      mayaAddress={mayaAddress}
      ownedNames={ownedNames}
      selectedName={selectedName}
      managedRecord={managedRecord}
      workspaceError={workspaceError}
      pricingError={pricingError}
      isWorkspaceLoading={isWorkspaceLoading}
      isPricingLoading={isPricingLoading}
      isRefreshing={isRefreshing}
      isSubmitting={isSubmitting}
      submitError={submitError}
      registerDraft={registerDraft}
      aliasDraft={aliasDraft}
      profileDraft={profileDraft}
      renewDraft={renewDraft}
      registerAmountBaseUnits={registerAmountBaseUnits}
      renewAmountBaseUnits={renewAmountBaseUnits}
      registerMemoPreview={registerMemoPreview}
      aliasMemoPreview={aliasMemoPreview}
      profileMemoPreview={profileMemoPreview}
      renewMemoPreview={renewMemoPreview}
      preferredAssets={preferredAssets}
      referralHref={referralHref}
      supportReason={support.reason}
      onConnectWallet={() => {
        if (!isViewOnly) {
          void wallet.initialize();
        }
      }}
      onConnectMayaChain={() => {
        if (!isViewOnly) {
          void wallet.execute("accounts.connect", {
            sessionId: activeSession?.id,
            input: { chain: Chain.MayaChain },
          });
        }
      }}
      onRefresh={() => {
        void refreshWorkspace(selectedName);
      }}
      onSelectName={setSelectedName}
      onRegisterDraftChange={(patch) =>
        setRegisterDraft((current) => ({ ...current, ...patch }))
      }
      onRegisterSubaffiliateChange={(id, patch) =>
        setRegisterDraft((current) => ({
          ...current,
          subaffiliates: updateSubaffiliateDraft(
            current.subaffiliates,
            id,
            patch,
          ),
        }))
      }
      onAddRegisterSubaffiliate={() =>
        setRegisterDraft((current) => ({
          ...current,
          subaffiliates: [
            ...current.subaffiliates,
            createEditableSubaffiliate(),
          ],
        }))
      }
      onRemoveRegisterSubaffiliate={(id) =>
        setRegisterDraft((current) => ({
          ...current,
          subaffiliates: removeSubaffiliateDraft(current.subaffiliates, id),
        }))
      }
      onAliasDraftChange={(patch) =>
        setAliasDraft((current) => ({ ...current, ...patch }))
      }
      onProfileDraftChange={(patch) =>
        setProfileDraft((current) => ({ ...current, ...patch }))
      }
      onProfileSubaffiliateChange={(id, patch) =>
        setProfileDraft((current) => ({
          ...current,
          subaffiliates: updateSubaffiliateDraft(
            current.subaffiliates,
            id,
            patch,
          ),
        }))
      }
      onAddProfileSubaffiliate={() =>
        setProfileDraft((current) => ({
          ...current,
          subaffiliates: [
            ...current.subaffiliates,
            createEditableSubaffiliate(),
          ],
        }))
      }
      onRemoveProfileSubaffiliate={(id) =>
        setProfileDraft((current) => ({
          ...current,
          subaffiliates: removeSubaffiliateDraft(current.subaffiliates, id),
        }))
      }
      onRenewDraftChange={(patch) =>
        setRenewDraft((current) => ({ ...current, ...patch }))
      }
      onRegisterSubmit={() => {
        void handleRegisterSubmit();
      }}
      onAliasSubmit={() => {
        void handleAliasSubmit();
      }}
      onProfileSubmit={() => {
        void handleProfileSubmit();
      }}
      onRenewSubmit={() => {
        void handleRenewSubmit();
      }}
      onCopyReferralLink={handleCopyReferralLink}
    />
  );
}

export function MayaNamesPageContent(props: MayaNamesPageContentProps) {
  return (
    <main className="page-wrap flex flex-col items-center min-h-[85vh] px-4 relative z-0 pb-16 pt-8">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[30rem] h-[30rem] bg-[var(--cacao-neon)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow" />
        <div
          className="absolute bottom-1/4 left-1/4 w-[30rem] h-[30rem] bg-[var(--maya-teal)]/10 rounded-full blur-[100px] mix-blend-screen opacity-50 animate-pulse-slow"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="text-center mb-10 rise-in relative w-full flex flex-col items-center max-w-6xl">
        <p className="island-kicker mb-2 flex justify-center items-center gap-2">
          <Tags size={14} /> On-chain name desk
        </p>
        <h1 className="terminal-title mb-3 text-4xl sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--sea-ink-soft)] font-black tracking-tight drop-shadow-sm">
          MAYANames
        </h1>
        <p className="text-[var(--sea-ink-soft)]/90 max-w-2xl mx-auto text-sm sm:text-base font-medium">
          Register, renew, and manage MAYANames owned by the connected MayaChain
          address. Referral links here are for campaign sharing only and do not
          change the swap referral stored in Settings.
        </p>

        <div className="absolute top-[0px] right-0 sm:right-4">
          <button
            type="button"
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink-soft)] hover:text-[var(--cacao-neon)] hover:border-[var(--cacao-neon)]/30 hover:bg-[var(--surface)] shadow-sm transition-all active:scale-95"
            onClick={props.onRefresh}
            title="Refresh MAYANames"
          >
            <RefreshCw
              size={18}
              className={props.isRefreshing ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>
      {props.viewState === "disconnected" ? (
        <StateGate
          title="Connect a wallet session"
          body="MAYAName management uses native MayaChain MsgDeposit transactions. Connect a wallet session before loading your owned names."
          actionLabel={props.isViewOnly ? "View Only" : "Connect Wallet"}
          disabled={props.isViewOnly}
          note={props.isViewOnly ? VIEW_ONLY_IMPERSONATION_REASON : undefined}
          onAction={props.onConnectWallet}
        />
      ) : props.viewState === "connect-maya" ? (
        <StateGate
          title="Sync a MayaChain address"
          body="The active wallet session is connected, but it does not have a MayaChain address yet. Add or sync MayaChain before managing MAYANames."
          actionLabel={props.isViewOnly ? "View Only" : "Connect MayaChain"}
          disabled={props.isViewOnly}
          note={props.isViewOnly ? VIEW_ONLY_IMPERSONATION_REASON : undefined}
          onAction={props.onConnectMayaChain}
        />
      ) : (
        <div className="w-full max-w-6xl mt-2 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
          <aside
            className="glass-panel-strong p-5 rounded-[2.5rem] relative overflow-hidden backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-[var(--line)] rise-in"
            style={{ animationDelay: "100ms" }}
          >
            <div className="flex items-center justify-between gap-3 mb-5 px-1">
              <div>
                <p className="text-[11px] font-bold text-[var(--sea-ink-soft)] uppercase tracking-widest">
                  Owned By
                </p>
                <p className="mt-1 font-bold text-[var(--sea-ink)] text-lg tracking-tight">
                  {props.mayaAddress
                    ? shortenAddress(props.mayaAddress)
                    : "No Maya address"}
                </p>
              </div>
              <AssetIcon
                assetId="maya"
                className="w-10 h-10 rounded-full border border-[var(--line)] shadow-sm"
              />
            </div>
            <div className="bg-[var(--chip-bg)]/80 rounded-[1.5rem] border border-[var(--line)] px-4 py-3 text-xs font-semibold text-[var(--sea-ink-soft)] mb-5 shadow-inner">
              Session:{" "}
              <span className="font-bold text-[var(--sea-ink)]">
                {props.activeSessionLabel}
              </span>
            </div>
            {props.isWorkspaceLoading ? (
              <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--bg-base)] px-4 py-8 text-sm text-[var(--sea-ink-soft)] flex items-center justify-center gap-2">
                <Activity size={14} className="animate-spin" /> Loading owned
                MAYANames...
              </div>
            ) : props.workspaceError ? (
              <ErrorNotice message={props.workspaceError} />
            ) : props.ownedNames.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-[var(--line)] bg-[var(--bg-base)] px-4 py-8 text-sm text-[var(--sea-ink-soft)]">
                No owned MAYANames were found for this MayaChain address yet.
              </div>
            ) : (
              <div className="space-y-2">
                {props.ownedNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={props.selectedName === name}
                    className={`w-full rounded-[1.25rem] border px-4 py-3 text-left transition-colors ${props.selectedName === name ? "border-[var(--maya-teal)] bg-[var(--maya-teal)]/10" : "border-[var(--line)] bg-[var(--bg-base)] hover:border-[var(--cacao-neon)]/40"}`}
                    onClick={() => props.onSelectName(name)}
                  >
                    <div className="font-semibold text-[var(--sea-ink)]">
                      {name}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
                      owned mayaname
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="space-y-8">
            <article
              className="glass-panel-strong p-6 sm:p-8 rounded-[2.5rem] relative overflow-hidden backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-[var(--line)] rise-in"
              style={{ animationDelay: "150ms" }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] flex items-center justify-center text-[var(--cacao-neon)] shadow-sm">
                  <Coins size={20} />
                </div>
                <div>
                  <p className="panel-label">Create</p>
                  <h2 className="text-xl font-bold text-[var(--sea-ink)]">
                    Register A MAYAName
                  </h2>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <InputField
                  label="Name"
                  value={props.registerDraft.name}
                  placeholder="Mayaname"
                  onChange={(value) =>
                    props.onRegisterDraftChange({ name: value })
                  }
                />
                <InputField
                  label="Owner"
                  value={props.registerDraft.owner}
                  placeholder="maya1..."
                  onChange={(value) =>
                    props.onRegisterDraftChange({ owner: value })
                  }
                />
                <ModalSelectField
                  label="Alias Chain"
                  value={props.registerDraft.aliasChain}
                  options={PREFERRED_CHAINS}
                  placeholder="MAYA"
                  onChange={(value) =>
                    props.onRegisterDraftChange({ aliasChain: value })
                  }
                  modalTitle="Select Alias Chain"
                />
                <InputField
                  label="Alias Address"
                  value={props.registerDraft.aliasAddress}
                  placeholder="maya1..."
                  onChange={(value) =>
                    props.onRegisterDraftChange({ aliasAddress: value })
                  }
                />
                <ModalSelectField
                  label="Preferred Asset"
                  value={props.registerDraft.preferredAsset}
                  options={props.preferredAssets}
                  placeholder="Optional"
                  onChange={(value) =>
                    props.onRegisterDraftChange({ preferredAsset: value })
                  }
                  modalTitle="Select Preferred Asset"
                />
                <InputField
                  label="Affiliate BPS"
                  value={props.registerDraft.affiliateBps}
                  placeholder="0"
                  onChange={(value) =>
                    props.onRegisterDraftChange({ affiliateBps: value })
                  }
                />
                <InputField
                  label="Years"
                  value={props.registerDraft.years}
                  placeholder="1"
                  onChange={(value) =>
                    props.onRegisterDraftChange({ years: value })
                  }
                />
                <InfoTile
                  label="Estimated Cost"
                  value={
                    props.registerAmountBaseUnits
                      ? `${formatBaseUnits(props.registerAmountBaseUnits, 10)} CACAO`
                      : "Waiting for pricing"
                  }
                  subValue={props.registerAmountBaseUnits || undefined}
                />
              </div>
              <SubaffiliateEditor
                className="mt-5"
                rows={props.registerDraft.subaffiliates}
                onAddRow={props.onAddRegisterSubaffiliate}
                onChangeRow={props.onRegisterSubaffiliateChange}
                onRemoveRow={props.onRemoveRegisterSubaffiliate}
              />
              <MemoPreview
                label="Register memo"
                memo={props.registerMemoPreview}
              />
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="w-full sm:w-auto px-8 py-3.5 relative overflow-hidden text-lg font-bold tracking-tight rounded-2xl bg-gradient-to-r from-[#FF9B70] to-[var(--cacao-neon)] text-[var(--bg-base)] shadow-[0_4px_20px_rgba(232,122,78,0.4)] hover:shadow-[0_6px_24px_rgba(232,122,78,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed group/btn"
                  disabled={props.isSubmitting || props.isViewOnly || Boolean(props.supportReason)}
                  onClick={props.onRegisterSubmit}
                >
                  <span className="flex items-center justify-center gap-2 relative z-10 text-white drop-shadow-sm">
                    {props.isSubmitting ? (
                      <Activity
                        size={18}
                        className="animate-spin text-white/90"
                      />
                    ) : (
                      <Coins
                        size={18}
                        className="group-hover/btn:rotate-12 transition-transform text-white/90"
                      />
                    )}
                    {props.isSubmitting ? "Submitting..." : "Register MAYAName"}
                  </span>
                </button>
                {props.isPricingLoading ? (
                  <span className="text-sm text-[var(--sea-ink-soft)]">
                    Loading pricing...
                  </span>
                ) : null}
                {props.pricingError ? (
                  <ErrorInline message={props.pricingError} />
                ) : null}
                {props.supportReason ? (
                  <ErrorInline message={props.supportReason} />
                ) : null}
              </div>
            </article>

            {props.viewState === "empty" ? (
              <article className="glass-panel p-6 sm:p-8 rounded-[2.5rem] border border-[var(--line)] bg-[var(--surface-strong)]/50 backdrop-blur-md shadow-inner text-center mx-1">
                <div className="inline-flex w-16 h-16 rounded-full bg-[var(--surface-strong)] items-center justify-center border border-[var(--line)] shadow-sm mb-4">
                  <Tags size={28} className="text-[var(--cacao-neon)]" />
                </div>
                <p className="font-bold text-[var(--sea-ink)] text-xl tracking-tight mb-2">
                  No Active Profile
                </p>
                <p className="text-sm font-medium text-[var(--sea-ink-soft)] max-w-sm mx-auto leading-relaxed">
                  Register your first MAYAName to unlock on-page renewals, alias
                  updates, and referral links.
                </p>
              </article>
            ) : props.managedRecord ? (
              <div className="space-y-8">
                <article className="glass-panel-strong p-6 rounded-[2rem]">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <p className="panel-label">Manage</p>
                      <h2 className="text-2xl font-bold text-[var(--sea-ink)]">
                        {props.managedRecord.name}
                      </h2>
                    </div>
                    <div className="text-right text-sm text-[var(--sea-ink-soft)]">
                      <div>Owner</div>
                      <div className="font-semibold text-[var(--sea-ink)]">
                        {shortenAddress(props.managedRecord.owner)}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <InfoTile
                      label="Expiry Block"
                      value={props.managedRecord.expireBlockHeight || "n/a"}
                    />
                    <InfoTile
                      label="Preferred Asset"
                      value={props.managedRecord.preferredAsset || "MAYA.CACAO"}
                    />
                    <InfoTile
                      label="Affiliate BPS"
                      value={props.managedRecord.affiliateBps || "0"}
                    />
                    <InfoTile
                      label="Collector CACAO"
                      value={`${formatBaseUnits(props.managedRecord.affiliateCollectorCacao || "0", 10)} CACAO`}
                    />
                  </div>
                </article>

                <article className="glass-panel-strong p-6 rounded-[2rem]">
                  <div className="flex items-center gap-3 mb-5">
                    <Link2 size={18} className="text-[var(--maya-teal)]" />
                    <div>
                      <p className="panel-label">Aliases</p>
                      <h3 className="text-xl font-bold text-[var(--sea-ink)]">
                        Update One Alias
                      </h3>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 mb-5">
                    {props.managedRecord.aliases.length ? (
                      props.managedRecord.aliases.map((alias) => (
                        <div
                          key={`${alias.chain}:${alias.address}`}
                          className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--bg-base)] px-4 py-3"
                        >
                          <div className="text-xs uppercase tracking-[0.2em] text-[var(--sea-ink-soft)]">
                            {alias.chain}
                          </div>
                          <div className="mt-1 font-semibold text-[var(--sea-ink)] break-all">
                            {alias.address}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-[var(--line)] bg-[var(--bg-base)] px-4 py-6 text-sm text-[var(--sea-ink-soft)] md:col-span-2">
                        No aliases are configured yet.
                      </div>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ModalSelectField
                      label="New Alias Chain"
                      value={props.aliasDraft.chain}
                      options={PREFERRED_CHAINS}
                      placeholder="BTC"
                      onChange={(value) =>
                        props.onAliasDraftChange({ chain: value })
                      }
                      modalTitle="Select Alias Chain"
                    />
                    <InputField
                      label="New Alias Address"
                      value={props.aliasDraft.address}
                      placeholder="bc1..."
                      onChange={(value) =>
                        props.onAliasDraftChange({ address: value })
                      }
                    />
                  </div>
                  <MemoPreview
                    label="Alias update memo"
                    memo={props.aliasMemoPreview}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="cacao-btn px-5 py-3"
                      disabled={props.isSubmitting || props.isViewOnly || Boolean(props.supportReason)}
                      onClick={props.onAliasSubmit}
                    >
                      {props.isSubmitting
                        ? "Submittingï¿½"
                        : "Submit Alias Update"}
                    </button>
                    <span className="text-sm text-[var(--sea-ink-soft)]">
                      Provisional deposit:{" "}
                      {formatBaseUnits(MAYA_NAME_UPDATE_AMOUNT_BASE_UNITS, 10)}{" "}
                      CACAO
                    </span>
                  </div>
                </article>

                <article className="glass-panel-strong p-6 rounded-[2rem]">
                  <div className="flex items-center gap-3 mb-5">
                    <UserRound size={18} className="text-[var(--cacao-neon)]" />
                    <div>
                      <p className="panel-label">Referral Profile</p>
                      <h3 className="text-xl font-bold text-[var(--sea-ink)]">
                        Preferred Asset, BPS, And Subaffiliates
                      </h3>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ModalSelectField
                      label="Preferred Asset"
                      value={props.profileDraft.preferredAsset}
                      options={props.preferredAssets}
                      placeholder="Optional"
                      onChange={(value) =>
                        props.onProfileDraftChange({ preferredAsset: value })
                      }
                      modalTitle="Select Preferred Asset"
                    />
                    <InputField
                      label="Affiliate BPS"
                      value={props.profileDraft.affiliateBps}
                      placeholder="0"
                      onChange={(value) =>
                        props.onProfileDraftChange({ affiliateBps: value })
                      }
                    />
                  </div>
                  <SubaffiliateEditor
                    className="mt-5"
                    rows={props.profileDraft.subaffiliates}
                    onAddRow={props.onAddProfileSubaffiliate}
                    onChangeRow={props.onProfileSubaffiliateChange}
                    onRemoveRow={props.onRemoveProfileSubaffiliate}
                  />
                  <MemoPreview
                    label="Referral profile memo"
                    memo={props.profileMemoPreview}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="cacao-btn px-5 py-3"
                      disabled={props.isSubmitting || props.isViewOnly || Boolean(props.supportReason)}
                      onClick={props.onProfileSubmit}
                    >
                      {props.isSubmitting
                        ? "Submittingï¿½"
                        : "Submit Referral Profile"}
                    </button>
                    <span className="text-sm text-[var(--sea-ink-soft)]">
                      Existing subaffiliate removals are encoded with 0 BPS.
                    </span>
                  </div>
                </article>

                <article className="glass-panel-strong p-6 rounded-[2rem]">
                  <div className="flex items-center gap-3 mb-5">
                    <Activity size={18} className="text-[var(--maya-teal)]" />
                    <div>
                      <p className="panel-label">Renew</p>
                      <h3 className="text-xl font-bold text-[var(--sea-ink)]">
                        Extend Expiry
                      </h3>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <InputField
                      label="Years"
                      value={props.renewDraft.years}
                      placeholder="1"
                      onChange={(value) =>
                        props.onRenewDraftChange({ years: value })
                      }
                    />
                    <InfoTile
                      label="Renewal Cost"
                      value={
                        props.renewAmountBaseUnits
                          ? `${formatBaseUnits(props.renewAmountBaseUnits, 10)} CACAO`
                          : "Waiting for pricing"
                      }
                      subValue={props.renewAmountBaseUnits || undefined}
                    />
                  </div>
                  <MemoPreview
                    label="Renewal memo"
                    memo={props.renewMemoPreview}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="cacao-btn px-5 py-3"
                      disabled={props.isSubmitting || props.isViewOnly || Boolean(props.supportReason)}
                      onClick={props.onRenewSubmit}
                    >
                      {props.isSubmitting ? "Submittingï¿½" : "Renew MAYAName"}
                    </button>
                    <span className="text-sm text-[var(--sea-ink-soft)]">
                      Renewal uses the current MAYA alias when available,
                      otherwise the owner address.
                    </span>
                  </div>
                </article>

                <article className="glass-panel-strong p-6 rounded-[2rem]">
                  <div className="flex items-center gap-3 mb-5">
                    <Copy size={18} className="text-[var(--cacao-neon)]" />
                    <div>
                      <p className="panel-label">Referral Hub</p>
                      <h3 className="text-xl font-bold text-[var(--sea-ink)]">
                        Recommended Swap Link
                      </h3>
                    </div>
                  </div>
                  <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--bg-base)] p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--sea-ink-soft)] mb-2">
                      Share this link
                    </div>
                    <div className="font-mono text-sm text-[var(--sea-ink)] break-all">
                      {props.referralHref}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
                    This is the recommended outbound referral URL and uses{" "}
                    <span className="font-semibold text-[var(--sea-ink)]">
                      /swap?ref=
                    </span>
                    . It does not update the app-wide swap referral stored in
                    Settings.
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      className="secondary-btn px-5 py-3 flex items-center gap-2"
                      onClick={props.onCopyReferralLink}
                    >
                      <Copy size={16} /> Copy referral link
                    </button>
                  </div>
                </article>
              </div>
            ) : null}

            {props.submitError ? (
              <ErrorNotice message={props.submitError} />
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}

function StateGate(props: {
  title: string;
  body: string;
  actionLabel: string;
  disabled?: boolean;
  note?: string;
  onAction: () => void;
}) {
  return (
    <article className="glass-panel-strong w-full max-w-2xl mx-auto p-10 rounded-[3rem] text-center backdrop-blur-2xl bg-[var(--surface-strong)]/80 shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-[var(--line)] relative overflow-hidden">
      <div className="w-16 h-16 mx-auto rounded-full bg-[var(--maya-teal)]/10 border border-[var(--maya-teal)]/30 flex items-center justify-center mb-6 shadow-sm">
        <Wallet size={28} className="text-[var(--maya-teal)]" />
      </div>
      <h2 className="text-3xl font-black tracking-tight text-[var(--sea-ink)]">
        {props.title}
      </h2>
      <p className="mt-4 text-base font-medium text-[var(--sea-ink-soft)] leading-relaxed max-w-sm mx-auto">
        {props.body}
      </p>
      <button
        type="button"
        className="w-full sm:w-auto mt-8 px-8 py-4 relative overflow-hidden text-lg font-bold tracking-tight rounded-2xl bg-gradient-to-r from-[var(--maya-teal)] to-emerald-400 text-[var(--bg-base)] shadow-[0_4px_20px_rgba(79,209,197,0.3)] hover:shadow-[0_6px_24px_rgba(79,209,197,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all group/btn disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        disabled={props.disabled}
        onClick={props.onAction}
      >
        <span className="flex items-center justify-center gap-2 relative z-10 text-white drop-shadow-sm">
          <Wallet
            size={18}
            className="group-hover/btn:rotate-12 transition-transform"
          />
          {props.actionLabel}
        </span>
      </button>
      {props.note ? (
        <p className="mt-4 text-sm text-amber-500">{props.note}</p>
      ) : null}
    </article>
  );
}

function InputField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bg-[var(--chip-bg)]/80 rounded-2xl p-3 sm:p-4 border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_20px_var(--halo-glow)] transition-all duration-300">
      <div className="mb-1">
        <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-widest">
          {props.label}
        </span>
      </div>
      <input
        type="text"
        className="super-input text-lg sm:text-xl bg-transparent w-full min-w-0 outline-none text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)]/30 font-semibold transition-colors"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function ModalSelectField(props: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  modalTitle: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const items = props.options.map((opt) => ({
    id: opt,
    label: opt,
    iconMain:
      opt === "THOR"
        ? "rune"
        : opt.split(".")[1]?.split("-")[0]?.toLowerCase() || opt.toLowerCase(),
  }));

  return (
    <>
      <div
        className="bg-[var(--chip-bg)]/80 rounded-2xl p-3 sm:p-4 border border-transparent focus-within:border-[var(--line)] hover:bg-[var(--surface)] cursor-pointer transition-all duration-300 group"
        onClick={() => setIsOpen(true)}
      >
        <div className="mb-1">
          <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-widest">
            {props.label}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={`text-lg sm:text-xl font-semibold ${props.value ? "text-[var(--sea-ink)]" : "text-[var(--sea-ink-soft)]/30"}`}
          >
            {props.value || props.placeholder || "Select..."}
          </span>
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--surface-strong)] border border-[var(--line)] group-hover:border-[var(--maya-teal)]/30 transition-colors shadow-sm text-[var(--sea-ink-soft)] group-hover:text-[var(--maya-teal)]">
            <ChevronDown size={14} />
          </div>
        </div>
      </div>
      <SelectionModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={props.modalTitle}
        items={items}
        onSelect={props.onChange}
      />
    </>
  );
}

function SubaffiliateEditor(props: {
  className?: string;
  rows: EditableSubaffiliateDraft[];
  onAddRow: () => void;
  onChangeRow: (id: string, patch: Partial<EditableSubaffiliateDraft>) => void;
  onRemoveRow: (id: string) => void;
}) {
  return (
    <section className={props.className}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="island-kicker mb-1 text-[10px]">Subaffiliates</p>
          <p className="text-sm font-medium text-[var(--sea-ink-soft)]">
            Add revenue-share rows or mark existing rows for removal.
          </p>
        </div>
        <button
          type="button"
          className="px-5 py-2.5 rounded-2xl font-bold tracking-tight text-sm bg-[var(--surface-strong)] border border-[var(--line)] hover:border-[var(--cacao-neon)]/50 text-[var(--sea-ink)] hover:text-[var(--cacao-neon)] shadow-sm transition-all active:scale-95"
          onClick={props.onAddRow}
        >
          Add Row
        </button>
      </div>
      <div className="space-y-3">
        {props.rows.length ? (
          props.rows.map((row) => (
            <div
              key={row.id}
              className="grid md:grid-cols-[minmax(0,1fr)_180px_auto] items-end rounded-[1.75rem] border border-[var(--line)] bg-[var(--bg-base)] p-3 gap-3 shadow-sm hover:border-[var(--sea-ink-soft)]/30 transition-colors"
            >
              <InputField
                label="MAYAName"
                value={row.name}
                placeholder="suba"
                onChange={(value) => props.onChangeRow(row.id, { name: value })}
              />
              <InputField
                label="BPS"
                value={row.shareBps}
                placeholder="2000"
                onChange={(value) =>
                  props.onChangeRow(row.id, { shareBps: value, removed: false })
                }
              />
              <button
                type="button"
                className="px-4 h-[72px] rounded-[1.25rem] font-bold text-sm bg-[var(--surface-strong)] hover:bg-rose-500/10 border border-[var(--line)] hover:border-rose-500/30 text-[var(--sea-ink-soft)] hover:text-rose-500 transition-all"
                onClick={() => props.onRemoveRow(row.id)}
              >
                {row.existing ? "Remove" : "Delete"}
              </button>
              {row.removed ? (
                <p className="md:col-span-3 text-xs font-semibold text-[var(--cacao-neon)] px-2 pb-1">
                  This existing subaffiliate will be sent with 0 BPS to remove
                  it.
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-[var(--line)] bg-[var(--bg-base)] px-4 py-8 text-sm text-[var(--sea-ink-soft)] font-medium text-center shadow-inner mx-1">
            No subaffiliates configured.
          </div>
        )}
      </div>
    </section>
  );
}

function MemoPreview(props: { label: string; memo: string }) {
  return (
    <div className="mt-6 bg-[var(--chip-bg)]/80 rounded-[1.5rem] border border border-transparent focus-within:border-[var(--line)] focus-within:bg-[var(--surface)] p-5 transition-all">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--sea-ink-soft)] mb-2">
        {props.label}
      </div>
      <div className="font-mono text-sm font-semibold text-[var(--sea-ink)] break-all selection:bg-[var(--cacao-neon)]/30">
        {props.memo || "Fill the form to generate the memo preview."}
      </div>
    </div>
  );
}

function InfoTile(props: { label: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-base)] p-4 flex flex-col justify-center">
      <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-widest truncate mb-1.5">
        {props.label}
      </div>
      <div className="font-bold text-[var(--sea-ink)] text-xl sm:text-2xl truncate">
        {props.value}
      </div>
      {props.subValue ? (
        <div className="mt-0.5 text-xs font-semibold text-[var(--sea-ink-soft)] truncate">
          {props.subValue}
        </div>
      ) : null}
    </div>
  );
}

function ErrorNotice(props: { message: string }) {
  return (
    <div className="rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-start gap-3">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{props.message}</span>
    </div>
  );
}

function ErrorInline(props: { message: string }) {
  return <span className="text-sm text-amber-500">{props.message}</span>;
}

export function getMayaNamesViewState(input: {
  hasSession: boolean;
  hasMayaAddress: boolean;
  isWorkspaceLoading: boolean;
  ownedCount: number;
}): MayaNamesViewState {
  if (!input.hasSession) return "disconnected";
  if (!input.hasMayaAddress) return "connect-maya";
  if (input.isWorkspaceLoading) return "loading";
  return input.ownedCount > 0 ? "ready" : "empty";
}

export function createDefaultRegisterDraft(
  mayaAddress: string,
): MayaNameRegisterDraft {
  return {
    name: "",
    owner: mayaAddress,
    aliasChain: "MAYA",
    aliasAddress: mayaAddress,
    preferredAsset: "",
    affiliateBps: "0",
    years: "1",
    subaffiliates: [],
  };
}

export function createProfileDraft(
  record: ManagedMayaNameRecord | null,
): MayaNameProfileDraft {
  return {
    preferredAsset: record?.preferredAsset ?? "",
    affiliateBps: record?.affiliateBps ?? "0",
    subaffiliates: (record?.subaffiliates ?? []).map((entry) =>
      createEditableSubaffiliate(entry),
    ),
  };
}

export function createRenewDraft(): MayaNameRenewDraft {
  return { years: "1" };
}

export function resolveSelectedOwnedMayaName(
  ownedNames: string[],
  preferredSelection?: string,
): string {
  const preferred = preferredSelection?.trim().toLowerCase();
  if (preferred) {
    const match = ownedNames.find((name) => name.toLowerCase() === preferred);
    if (match) return match;
  }
  return ownedNames[0] ?? "";
}

export async function loadMayaNameWorkspace(input: {
  ownerAddress: string;
  preferredSelection?: string;
  loadOwnedNames: typeof fetchOwnedMayaNames;
  loadManagedName: typeof fetchManagedMayaName;
  midgardUrl: string;
  mayanodeUrl: string;
}): Promise<{
  ownedNames: string[];
  selectedName: string;
  managedRecord: ManagedMayaNameRecord | null;
}> {
  const ownedNames = await input.loadOwnedNames(input.ownerAddress, {
    midgardUrl: input.midgardUrl,
  });
  const selectedName = resolveSelectedOwnedMayaName(
    ownedNames,
    input.preferredSelection,
  );
  const managedRecord = selectedName
    ? await input.loadManagedName(selectedName, {
        mayanodeUrl: input.mayanodeUrl,
        midgardUrl: input.midgardUrl,
      })
    : null;
  return { ownedNames, selectedName, managedRecord };
}

function parseYearsToBlocks(value: string): bigint | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return BigInt(Math.floor(numeric * MAYA_NAME_BLOCKS_PER_YEAR));
}

function toActionSubaffiliates(rows: EditableSubaffiliateDraft[]) {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      shareBps: row.removed ? "0" : row.shareBps.trim(),
    }))
    .filter((row) => row.name && row.shareBps);
}

function createEditableSubaffiliate(
  source?: MayaNameSubaffiliate,
): EditableSubaffiliateDraft {
  return {
    id: createSubaffiliateDraftId(source?.name),
    name: source?.name ?? "",
    shareBps: source?.shareBps ?? "",
    existing: Boolean(source),
    removed: false,
  };
}

function updateSubaffiliateDraft(
  rows: EditableSubaffiliateDraft[],
  id: string,
  patch: Partial<EditableSubaffiliateDraft>,
): EditableSubaffiliateDraft[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

function removeSubaffiliateDraft(
  rows: EditableSubaffiliateDraft[],
  id: string,
): EditableSubaffiliateDraft[] {
  return rows.flatMap((row) => {
    if (row.id !== id) return [row];
    if (!row.existing) return [];
    return [{ ...row, removed: true, shareBps: "0" }];
  });
}

function createSubaffiliateDraftId(seed?: string) {
  return `${seed ?? "sub"}-${Math.random().toString(36).slice(2, 8)}`;
}

async function defaultCopyText(value: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable in this environment.");
  }
  await navigator.clipboard.writeText(value);
}
