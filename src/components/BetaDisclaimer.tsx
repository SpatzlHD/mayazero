import { useEffect, useState } from "react";

export const BETA_DISCLAIMER_STORAGE_KEY = "maya-beta-disclaimer-accepted";
export const BETA_DISCLAIMER_COPY =
  "Maya Zero is currently in beta. Use it at your own risk. We are not responsible for any loss of funds.";

type DisclaimerStorage = Pick<Storage, "getItem" | "setItem">;

export function shouldShowBetaDisclaimer(
  storage?: Pick<Storage, "getItem">,
): boolean {
  return storage?.getItem(BETA_DISCLAIMER_STORAGE_KEY) !== "true";
}

export function persistBetaDisclaimerAcceptance(
  storage?: Pick<Storage, "setItem">,
): void {
  storage?.setItem(BETA_DISCLAIMER_STORAGE_KEY, "true");
}

type BetaDisclaimerDialogProps = {
  onAcknowledge: () => void;
};

export function BetaDisclaimerDialog({
  onAcknowledge,
}: BetaDisclaimerDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[var(--bg-base)]/82 px-4 py-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="beta-disclaimer-title"
      aria-describedby="beta-disclaimer-copy"
    >
      <div className="glass-panel-strong beta-disclaimer-panel w-full max-w-xl border border-[var(--line)] p-6 shadow-2xl sm:p-8">
        <p className="kicker m-0">Beta Notice</p>
        <h2
          id="beta-disclaimer-title"
          className="mt-3 text-2xl font-bold tracking-tight text-[var(--sea-ink)]"
        >
          Read before using Maya Zero
        </h2>
        <p
          id="beta-disclaimer-copy"
          className="mt-4 text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base"
        >
          {BETA_DISCLAIMER_COPY}
        </p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="cacao-btn mt-6 w-full px-5 py-3 text-sm sm:w-auto"
        >
          I Understand
        </button>
      </div>
    </div>
  );
}

export function BetaDisclaimer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storage: DisclaimerStorage = window.localStorage;
    setIsOpen(shouldShowBetaDisclaimer(storage));
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || !isOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isReady, isOpen]);

  function handleAcknowledge() {
    if (typeof window !== "undefined") {
      persistBetaDisclaimerAcceptance(window.localStorage);
    }
    setIsOpen(false);
  }

  if (!isReady || !isOpen) {
    return null;
  }

  return <BetaDisclaimerDialog onAcknowledge={handleAcknowledge} />;
}
