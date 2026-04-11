import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  trackAnalyticsEvent,
  type AnalyticsEvent,
  type ReferralCaptureOutcome,
} from "#/analytics";
import {
  type MayaNameValidationResult,
  validateMayaName,
} from "#/lib/mayaname";
import { useSettings } from "#/provider/SettingsProvider";

type ReferralBannerProps = {
  pathname: string;
  search: string;
  hash?: string;
};

type PendingReferralDecision = {
  current: string;
  incoming: string;
};

export type ReferralCaptureAction =
  | { type: "store"; incoming: string }
  | { type: "pending"; current: string; incoming: string }
  | { type: "ignore"; reason: "invalid" | "unreachable" };

export function buildReferralCaptureAnalyticsEvent(input: {
  currentReferral: string;
  outcome: ReferralCaptureOutcome;
}): AnalyticsEvent {
  return {
    type: "referral_capture",
    outcome: input.outcome,
    had_existing_referral: Boolean(input.currentReferral.trim()),
  };
}

export function ReferralCaptureBanner() {
  const location = useLocation({
    select: (value) => ({
      pathname: value.pathname,
      search: value.searchStr,
      hash: value.hash,
    }),
  });

  return <ReferralCaptureBannerContent {...location} />;
}

export function ReferralCaptureBannerContent(props: ReferralBannerProps) {
  const { mayanodeUrl, referralMayaName, setReferralMayaName } = useSettings();
  const [pendingDecision, setPendingDecision] =
    useState<PendingReferralDecision | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [handledLocationKey, setHandledLocationKey] = useState<string | null>(null);
  const locationKey = `${props.pathname}${props.search}${props.hash ?? ""}`;

  const referralParam = useMemo(() => {
    return getIncomingReferralParam(props.search);
  }, [props.search]);

  useEffect(() => {
    let cancelled = false;

    async function processReferralParam() {
      if (!referralParam) {
        setPendingDecision(null);
        setIsValidating(false);
        return;
      }
      if (handledLocationKey === locationKey) {
        return;
      }

      setIsValidating(true);
      const result = await validateMayaName(
        referralParam,
        mayanodeUrl,
      );
      if (cancelled) {
        return;
      }

      setIsValidating(false);

      const action = buildReferralCaptureAction({
        currentReferral: referralMayaName,
        validation: result,
      });

      if (action.type === "ignore") {
        setHandledLocationKey(locationKey);
        trackAnalyticsEvent(
          buildReferralCaptureAnalyticsEvent({
            currentReferral: referralMayaName,
            outcome:
              action.reason === "invalid" ? "invalid" : "unreachable",
          }),
        );
        toast.error(
          action.reason === "invalid"
            ? `Invalid referral MAYAName: ${referralParam}`
            : `Could not validate referral MAYAName: ${referralParam}`,
        );
        stripReferralQueryParam(props.pathname, props.search, props.hash);
        return;
      }

      if (action.type === "store") {
        setHandledLocationKey(locationKey);
        setReferralMayaName(action.incoming);
        setPendingDecision(null);
        trackAnalyticsEvent(
          buildReferralCaptureAnalyticsEvent({
            currentReferral: referralMayaName,
            outcome: "stored",
          }),
        );
        stripReferralQueryParam(props.pathname, props.search, props.hash);
        return;
      }

      setPendingDecision({
        current: action.current,
        incoming: action.incoming,
      });
    }

    void processReferralParam();

    return () => {
      cancelled = true;
    };
    }, [
    handledLocationKey,
    locationKey,
    mayanodeUrl,
    props.hash,
    props.pathname,
    props.search,
    referralParam,
    referralMayaName,
    setReferralMayaName,
  ]);

  if (!pendingDecision && !isValidating) {
    return null;
  }

  return (
    <section className="mx-4 sm:mx-6 md:mx-auto max-w-[1400px] mb-6">
      <div className="glass-panel border border-[var(--line)] rounded-[1.25rem] px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--sea-ink)]">
            {isValidating
              ? "Validating referral MAYAName..."
              : "Use a new referral MAYAName?"}
          </p>
          {pendingDecision ? (
            <p className="text-xs text-[var(--sea-ink-soft)] mt-1">
              Replace <span className="font-mono">{pendingDecision.current}</span>{" "}
              with <span className="font-mono">{pendingDecision.incoming}</span>.
            </p>
          ) : (
            <p className="text-xs text-[var(--sea-ink-soft)] mt-1">
              Checking the incoming referral before storing it in this browser.
            </p>
          )}
        </div>

        {isValidating ? (
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--sea-ink-soft)]">
            <Loader2 size={16} className="animate-spin" />
            Validating
          </div>
        ) : pendingDecision ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--maya-teal)]/30 bg-[var(--maya-teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--sea-ink)] hover:border-[var(--maya-teal)]"
              onClick={() => {
                setHandledLocationKey(locationKey);
                setReferralMayaName(pendingDecision.incoming);
                setPendingDecision(null);
                trackAnalyticsEvent(
                  buildReferralCaptureAnalyticsEvent({
                    currentReferral: referralMayaName,
                    outcome: "replaced",
                  }),
                );
                stripReferralQueryParam(props.pathname, props.search, props.hash);
              }}
            >
              <Check size={16} />
              Use new referral
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
              onClick={() => {
                setHandledLocationKey(locationKey);
                setPendingDecision(null);
                trackAnalyticsEvent(
                  buildReferralCaptureAnalyticsEvent({
                    currentReferral: referralMayaName,
                    outcome: "kept_current",
                  }),
                );
                stripReferralQueryParam(props.pathname, props.search, props.hash);
              }}
            >
              <X size={16} />
              Keep current referral
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function stripReferralQueryParam(
  pathname: string,
  search: string,
  hash?: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = stripReferralQueryParamFromUrl(pathname, search, hash);
  if (!nextUrl) {
    return;
  }

  window.history.replaceState(window.history.state, "", nextUrl);
}

export function getIncomingReferralParam(search: string): string {
  return new URLSearchParams(search).get("ref")?.trim() ?? "";
}

export function buildReferralCaptureAction(input: {
  currentReferral: string;
  validation: MayaNameValidationResult;
}): ReferralCaptureAction {
  if (input.validation.status === "invalid") {
    return {
      type: "ignore",
      reason: "invalid",
    };
  }

  if (input.validation.status === "unreachable") {
    return {
      type: "ignore",
      reason: "unreachable",
    };
  }

  const currentReferral = input.currentReferral.trim();
  if (!currentReferral || currentReferral === input.validation.name) {
    return {
      type: "store",
      incoming: input.validation.name,
    };
  }

  return {
    type: "pending",
    current: currentReferral,
    incoming: input.validation.name,
  };
}

export function stripReferralQueryParamFromUrl(
  pathname: string,
  search: string,
  hash?: string,
): string {
  const nextParams = new URLSearchParams(search);
  if (!nextParams.has("ref")) {
    return "";
  }

  nextParams.delete("ref");
  const nextSearch = nextParams.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash ? `#${hash}` : ""}`;
}
