import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert, Upload } from "lucide-react";
import { useMayaWalletActions } from "#/wallet";
import { createKeystoreImportJourneySteps } from "#/wallet/journeys";
import {
  MAYA_COSMOS_HD_PATH,
  MAYA_VULTISIG_HD_PATH,
  detectMayaSeedphraseImportMismatch,
  formatMayaSeedphraseImportMismatch,
} from "#/wallet/maya-seedphrase-compat";
import { decryptXChainKeystoreMnemonic } from "#/wallet/import-utils";

type ImportMode = "keystore" | "seed";

function Field(props: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider">
        {props.label}
      </span>
      {props.children}
      {props.hint ? (
        <span className="text-xs text-[var(--sea-ink-soft)]">{props.hint}</span>
      ) : null}
    </label>
  );
}

export function KeystoreSetupFlow() {
  const wallet = useMayaWalletActions();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ImportMode>("keystore");
  const [step, setStep] = useState<1 | 2>(1);
  const [label, setLabel] = useState("");
  const [keystoreFile, setKeystoreFile] = useState<File | null>(null);
  const [keystorePassword, setKeystorePassword] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const [seedphrase, setSeedphrase] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitImport(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const journeyId = wallet.createJourney({
      kind: "keystore.import",
      title: `Import Keystore: ${label || "Wallet"}`,
      source: "keystore-import",
      routePath: "/vault-setup",
      steps: createKeystoreImportJourneySteps(),
    });

    try {
      if (mode === "keystore") {
        if (!keystoreFile) {
          throw new Error("Choose an xchain keystore JSON file.");
        }
        const rawKeystore = await keystoreFile.text();
        await wallet.importKeystoreFromFile({
          label,
          rawKeystore,
          keystorePassword,
          vaultPassword,
          journeyId,
        });
      } else {
        const normalized = seedphrase.trim();
        const mismatch = await detectMayaSeedphraseImportMismatch(normalized);
        if (mismatch) {
          throw new Error(formatMayaSeedphraseImportMismatch(mismatch));
        }
        await wallet.importKeystoreFromMnemonic({
          label,
          mnemonic: normalized,
          vaultPassword,
          journeyId,
        });
      }

      wallet.completeJourney(journeyId, { status: "success" });
      navigate({ to: "/" });
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : "Failed to import keystore wallet.";
      setError(message);
      wallet.completeJourney(journeyId, { status: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl glass-panel-strong rounded-3xl border border-[var(--line)] p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">Import Wallet</h1>
        <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
          Import an xchain keystore or seedphrase as a local hot wallet. Your keys
          stay encrypted in this browser and unlock with a vault password.
        </p>
      </div>

      {step === 1 ? (
        <div className="grid gap-3">
          <button
            type="button"
            className="glass-panel p-4 rounded-2xl text-left hover:border-[var(--maya-teal)] transition-colors"
            onClick={() => {
              setMode("keystore");
              setStep(2);
            }}
          >
            <div className="font-semibold text-[var(--sea-ink)]">Import Keystore</div>
            <div className="text-sm text-[var(--sea-ink-soft)] mt-1">
              Upload an xchain keystore JSON and decrypt it locally.
            </div>
          </button>
          <button
            type="button"
            className="glass-panel p-4 rounded-2xl text-left hover:border-[var(--maya-teal)] transition-colors"
            onClick={() => {
              setMode("seed");
              setStep(2);
            }}
          >
            <div className="font-semibold text-[var(--sea-ink)]">Import Seedphrase</div>
            <div className="text-sm text-[var(--sea-ink-soft)] mt-1">
              Paste a mnemonic and store it as an encrypted local keystore.
            </div>
          </button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submitImport}>
          <Field label="Wallet Label">
            <input
              className="super-input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="My Maya Wallet"
              required
            />
          </Field>

          {mode === "keystore" ? (
            <>
              <Field label="XChain Keystore File">
                <label className="glass-panel rounded-xl p-4 flex items-center gap-3 cursor-pointer">
                  <Upload size={18} />
                  <span>{keystoreFile?.name || "Choose keystore JSON file"}</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) =>
                      setKeystoreFile(event.target.files?.[0] ?? null)
                    }
                    required
                  />
                </label>
              </Field>
              <Field label="Keystore Password">
                <input
                  type="password"
                  className="super-input"
                  value={keystorePassword}
                  onChange={(event) => setKeystorePassword(event.target.value)}
                  placeholder="Password used for the keystore file"
                  required
                />
              </Field>
            </>
          ) : (
            <Field label="Seedphrase">
              <textarea
                className="super-input min-h-28"
                value={seedphrase}
                onChange={(event) => setSeedphrase(event.target.value)}
                placeholder="Enter your seedphrase"
                required
              />
            </Field>
          )}

          <Field
            label="Vault Password"
            hint="Used to encrypt the wallet in this browser. This is separate from the keystore password."
          >
            <input
              type="password"
              className="super-input"
              value={vaultPassword}
              onChange={(event) => setVaultPassword(event.target.value)}
              placeholder="Choose a strong vault password"
              required
            />
          </Field>

          <div className="rounded-2xl border border-[var(--line)] bg-[rgba(255,193,7,0.08)] p-4 text-sm text-[var(--sea-ink-soft)] flex gap-3">
            <ShieldAlert size={18} className="shrink-0 text-[var(--cacao-neon)]" />
            <p>
              Local wallets are hot wallets. MayaChain imports use the MAYANode path{" "}
              <code>{MAYA_VULTISIG_HD_PATH}</code>. Generic Cosmos imports use{" "}
              <code>{MAYA_COSMOS_HD_PATH}</code>.
            </p>
          </div>

          {error ? (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="secondary-btn flex-1"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
            >
              Back
            </button>
            <button type="submit" className="primary-btn flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Importing...
                </>
              ) : (
                "Import Wallet"
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export async function previewKeystorePassword(
  rawKeystore: string,
  keystorePassword: string,
): Promise<string> {
  return decryptXChainKeystoreMnemonic(rawKeystore, keystorePassword);
}
