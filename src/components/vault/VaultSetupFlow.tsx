import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Upload,
  WalletCards,
  Zap,
} from "lucide-react";
import {
  createFastVaultImportJourneySteps,
  createFastVaultJourneySteps,
  createFastVaultVerifyJourneySteps,
  trackTransactionJourney,
  useMayaWalletActions,
  useMayaWalletState,
} from "#/wallet";
import {
  decryptXChainKeystoreMnemonic,
  normalizeMnemonic,
} from "#/wallet/import-utils";

type SetupMode = "fast" | "seed" | "keystore";

type StatusStep = {
  key: string;
  label: string;
  status: string;
  message?: string;
};

function SetupFields(props: {
  name: string;
  email: string;
  password: string;
  isProcessing: boolean;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Vault Name">
        <input
          type="text"
          required
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder="My Wallet"
          className="super-input"
          disabled={props.isProcessing}
        />
      </Field>
      <Field label="Email">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-[var(--sea-ink-soft)] shrink-0" />
          <input
            type="email"
            required
            value={props.email}
            onChange={(event) => props.onEmailChange(event.target.value)}
            placeholder="user@example.com"
            className="super-input"
            disabled={props.isProcessing}
          />
        </div>
      </Field>
      <p className="text-xs leading-relaxed text-[var(--sea-ink-soft)] -mt-1">
        This email is only used by Vultisig to send your verification code.
        MayaZero does not store your email address and does not have access to
        it.{" "}
        <a
          href="https://docs.vultisig.com/help-and-legal"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-[var(--maya-teal)] underline underline-offset-2 hover:text-[var(--sea-ink)] transition-colors"
        >
          Help & legal
        </a>
      </p>
      <Field label="Vault Password">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-[var(--sea-ink-soft)] shrink-0" />
          <input
            type="password"
            required
            value={props.password}
            onChange={(event) => props.onPasswordChange(event.target.value)}
            placeholder="Strong password"
            className="super-input"
            disabled={props.isProcessing}
          />
        </div>
      </Field>
    </div>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">
        {props.label}
      </label>
      <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 focus-within:border-[var(--maya-teal)] transition-colors">
        {props.children}
      </div>
    </div>
  );
}

function StatusPanel(props: {
  message: string;
  steps: StatusStep[];
  isProcessing: boolean;
}) {
  if (!props.message && !props.steps.length && !props.isProcessing) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-center gap-2 text-[var(--sea-ink)]">
        {props.isProcessing ? (
          <Loader2 size={16} className="animate-spin text-[var(--maya-teal)]" />
        ) : (
          <ShieldCheck size={16} className="text-[var(--maya-teal)]" />
        )}
        <span className="text-sm font-bold">Vault Status</span>
      </div>
      {props.message && (
        <p className="text-sm text-[var(--sea-ink-soft)]">{props.message}</p>
      )}
      {props.steps.length > 0 && (
        <div className="space-y-2">
          {props.steps.map((step) => (
            <div
              key={step.key}
              className="rounded-xl bg-[var(--surface-strong)] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-[var(--sea-ink)]">
                  {step.label}
                </span>
                <span className="text-[10px] uppercase font-black tracking-[0.16em] text-[var(--sea-ink-soft)]">
                  {step.status}
                </span>
              </div>
              {step.message && (
                <p className="text-xs text-[var(--sea-ink-soft)] mt-1">
                  {step.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VaultSetupFlow() {
  const navigate = useNavigate();
  const wallet = useMayaWalletActions();
  const state = useMayaWalletState();

  const [mode, setMode] = useState<SetupMode | null>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [keystoreFile, setKeystoreFile] = useState<File | null>(null);
  const [keystorePassword, setKeystorePassword] = useState("");
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const activeJourney = state.journeys.find(
    (journey) =>
      (journey.status === "pending" || journey.status === "attention") &&
      (journey.kind === "vault.fast.create" ||
        journey.kind === "vault.fast.import" ||
        journey.kind === "vault.fast.verify"),
  );
  const activeOperation = state.operations.find(
    (operation) =>
      operation.status === "pending" &&
      (operation.name === "vault.create.fast" ||
        operation.name === "vault.create.fast.import" ||
        operation.name === "vault.verify.fast"),
  );
  const progressMessage =
    activeOperation?.progress?.message ??
    activeJourney?.steps.find((item) => item.status === "active")?.message ??
    activeJourney?.steps.find((item) => item.status === "attention")?.message ??
    "";
  const visibleSteps =
    activeJourney?.steps.filter((item) => item.status !== "pending") ?? [];

  async function submitFastVault(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setError("");
    setIsProcessing(true);
    try {
      const result = await trackTransactionJourney(wallet, {
        kind: "vault.fast.create",
        title: `Create Fast Vault: ${name}`,
        source: "fast-vault",
        routePath: "/vault-setup",
        analytics: {
          action: "fast_create",
          route: "/vault-setup",
          subject: "vault",
        },
        steps: createFastVaultJourneySteps(),
        run: async (journey) => {
          const next = await wallet.createFastVault({
            name,
            email,
            password,
            journeyId: journey.journeyId,
          });
          journey.completeStep("creating", "Fast vault created.");
          journey.completeStep(
            "verification-sent",
            `Verification code sent to ${email}.`,
          );
          journey.attentionStep(
            "awaiting-code",
            "Enter the verification code from your email to finish setup.",
          );
          return next;
        },
      });
      setVaultId(result.vaultId);
      setStep(3);
    } catch (err: any) {
      setError(err?.message || "Failed to create vault");
    } finally {
      setIsProcessing(false);
    }
  }

  async function submitSeedImport(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeMnemonic(mnemonic);
    if (!name || !email || !password || !normalized) {
      setError("Please fill in all fields");
      return;
    }

    setError("");
    setIsProcessing(true);
    try {
      const result = await trackTransactionJourney(wallet, {
        kind: "vault.fast.import",
        title: `Import Fast Vault: ${name}`,
        source: "fast-vault",
        routePath: "/vault-setup",
        analytics: {
          action: "fast_create",
          route: "/vault-setup",
          subject: "vault",
        },
        steps: createFastVaultImportJourneySteps(),
        run: async (journey) => {
          journey.completeStep(
            "decrypting-keystore",
            "Manual seedphrase entry selected.",
          );
          const next = await wallet.createFastVaultFromSeedphrase({
            mnemonic: normalized,
            name,
            email,
            password,
            journeyId: journey.journeyId,
          });
          journey.completeStep(
            "verification-sent",
            `Verification code sent to ${email}.`,
          );
          journey.attentionStep(
            "awaiting-code",
            "Enter the verification code from your email to finish setup.",
          );
          return next;
        },
      });
      setMnemonic("");
      setVaultId(result.vaultId);
      setStep(3);
    } catch (err: any) {
      setError(err?.message || "Failed to import seedphrase");
    } finally {
      setIsProcessing(false);
    }
  }

  async function submitKeystoreImport(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password || !keystorePassword || !keystoreFile) {
      setError("Please fill in all fields");
      return;
    }

    setError("");
    setIsProcessing(true);
    try {
      const result = await trackTransactionJourney(wallet, {
        kind: "vault.fast.import",
        title: `Import Fast Vault: ${name}`,
        source: "fast-vault",
        routePath: "/vault-setup",
        analytics: {
          action: "fast_create",
          route: "/vault-setup",
          subject: "vault",
        },
        steps: createFastVaultImportJourneySteps(),
        run: async (journey) => {
          journey.updateStep("decrypting-keystore", {
            status: "active",
            message: "Decrypting uploaded keystore locally.",
          });
          const rawKeystore = await keystoreFile.text();
          const decryptedMnemonic = await decryptXChainKeystoreMnemonic(
            rawKeystore,
            keystorePassword,
          );
          journey.completeStep(
            "decrypting-keystore",
            "Keystore decrypted locally.",
          );
          const next = await wallet.createFastVaultFromSeedphrase({
            mnemonic: decryptedMnemonic,
            name,
            email,
            password,
            journeyId: journey.journeyId,
          });
          journey.completeStep(
            "verification-sent",
            `Verification code sent to ${email}.`,
          );
          journey.attentionStep(
            "awaiting-code",
            "Enter the verification code from your email to finish setup.",
          );
          return next;
        },
      });
      setKeystoreFile(null);
      setKeystorePassword("");
      setVaultId(result.vaultId);
      setStep(3);
    } catch (err: any) {
      setError(err?.message || "Failed to import keystore");
    } finally {
      setIsProcessing(false);
    }
  }

  async function submitVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!vaultId || !verificationCode) {
      return;
    }

    setError("");
    setIsProcessing(true);
    try {
      await trackTransactionJourney(wallet, {
        kind: "vault.fast.verify",
        title: `Verify Fast Vault: ${name || "Vault"}`,
        source: "fast-vault",
        routePath: "/vault-setup",
        analytics: {
          action: "fast_verify",
          route: "/vault-setup",
          subject: "vault",
        },
        steps: createFastVaultVerifyJourneySteps(),
        run: async (journey) => {
          const result = await wallet.verifyFastVault(
            vaultId,
            verificationCode,
            {
              journeyId: journey.journeyId,
            },
          );
          journey.completeStep("verifying", "Verification succeeded.");
          journey.completeStep(
            "refreshing-session",
            "Wallet session refreshed.",
          );
          journey.completeStep("vault-ready", "Fast vault is ready.");
          journey.complete(result);
          return result;
        },
      });
      setVerificationCode("");
      setStep(4);
    } catch (err: any) {
      setError(err?.message || "Failed to verify code");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto w-full rise-in">
      <div className="mb-8 text-center">
        <h2 className="terminal-title">Create or Import Vault</h2>
        <p className="text-[var(--sea-ink-soft)] font-medium mt-2">
          Fast Vultisig vault setup with seedphrase and xchain keystore import.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold text-center">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <ModeCard
            title="New Fast Vault"
            body="Create a brand new Fast Vault."
            icon={<Zap size={24} />}
            onClick={() => {
              setMode("fast");
              setStep(2);
              setError("");
            }}
          />
          <ModeCard
            title="Import Seedphrase"
            body="Paste an existing mnemonic and import it as a Fast Vault."
            icon={<KeyRound size={24} />}
            onClick={() => {
              setMode("seed");
              setStep(2);
              setError("");
            }}
          />
          <ModeCard
            title="Import Keystore"
            body="Upload an xchain keystore, decrypt it locally, and create a Fast Vault."
            icon={<Upload size={24} />}
            onClick={() => {
              setMode("keystore");
              setStep(2);
              setError("");
            }}
          />
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full glass-panel-strong p-6 rounded-3xl flex items-center gap-5 text-left opacity-60 cursor-not-allowed border-transparent"
          >
            <div className="w-12 h-12 rounded-full bg-[rgba(232,122,78,0.1)] flex items-center justify-center text-[var(--cacao-neon)] shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="flex-1">
              <div className="font-bold text-lg text-[var(--sea-ink)] mb-1">
                Secure Vault
              </div>
              <p className="text-sm text-[var(--sea-ink-soft)] font-medium">
                Due to a bug in the Vultisig SDK this will be available shortly!
              </p>
            </div>
          </button>
        </div>
      )}

      {step === 2 && mode === "fast" && (
        <SetupForm
          title="Fast Vault Setup"
          icon={<Zap size={20} className="text-[var(--maya-teal)]" />}
          onSubmit={submitFastVault}
          isProcessing={isProcessing}
          onBack={() => setStep(1)}
          submitLabel="Create Vault"
        >
          <SetupFields
            name={name}
            email={email}
            password={password}
            isProcessing={isProcessing}
            onNameChange={setName}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
          />
          <StatusPanel
            message={progressMessage}
            steps={visibleSteps}
            isProcessing={isProcessing}
          />
        </SetupForm>
      )}

      {step === 2 && mode === "seed" && (
        <SetupForm
          title="Import from Seedphrase"
          icon={<KeyRound size={20} className="text-[var(--maya-teal)]" />}
          onSubmit={submitSeedImport}
          isProcessing={isProcessing}
          onBack={() => setStep(1)}
          submitLabel="Import Vault"
        >
          <SetupFields
            name={name}
            email={email}
            password={password}
            isProcessing={isProcessing}
            onNameChange={setName}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
          />
          <Field label="Seedphrase">
            <textarea
              required
              value={mnemonic}
              onChange={(event) => setMnemonic(event.target.value)}
              placeholder="Enter your 12 or 24 word seedphrase"
              className="super-input min-h-28 resize-none"
              disabled={isProcessing}
            />
          </Field>
          <StatusPanel
            message={progressMessage}
            steps={visibleSteps}
            isProcessing={isProcessing}
          />
        </SetupForm>
      )}

      {step === 2 && mode === "keystore" && (
        <SetupForm
          title="Import from Keystore"
          icon={<Upload size={20} className="text-[var(--maya-teal)]" />}
          onSubmit={submitKeystoreImport}
          isProcessing={isProcessing}
          onBack={() => setStep(1)}
          submitLabel="Decrypt & Import"
        >
          <SetupFields
            name={name}
            email={email}
            password={password}
            isProcessing={isProcessing}
            onNameChange={setName}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
          />
          <Field label="XChain Keystore File">
            <label className="flex items-center gap-3 cursor-pointer">
              <Upload
                size={16}
                className="text-[var(--sea-ink-soft)] shrink-0"
              />
              <span className="text-sm font-medium text-[var(--sea-ink)] truncate">
                {keystoreFile?.name || "Choose keystore JSON file"}
              </span>
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                disabled={isProcessing}
                onChange={(event) =>
                  setKeystoreFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
          </Field>
          <Field label="Keystore Password">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-[var(--sea-ink-soft)] shrink-0" />
              <input
                type="password"
                required
                value={keystorePassword}
                onChange={(event) => setKeystorePassword(event.target.value)}
                placeholder="Password used for the keystore file"
                className="super-input"
                disabled={isProcessing}
              />
            </div>
          </Field>
          <p className="text-xs text-[var(--sea-ink-soft)] -mt-2">
            The keystore password decrypts the file. The vault password encrypts
            the new Fast Vault.
          </p>
          <StatusPanel
            message={progressMessage}
            steps={visibleSteps}
            isProcessing={isProcessing}
          />
        </SetupForm>
      )}

      {step === 3 && (
        <form
          onSubmit={submitVerification}
          className="glass-panel p-6 sm:p-8 rounded-3xl text-center space-y-6"
        >
          <div className="mx-auto w-16 h-16 bg-[rgba(26,154,141,0.1)] rounded-full flex items-center justify-center text-[var(--maya-teal)]">
            <Mail size={32} />
          </div>
          <h3 className="text-xl font-bold text-[var(--sea-ink)]">
            Check Your Email
          </h3>
          <p className="text-[var(--sea-ink-soft)] text-sm">
            We&apos;ve sent a verification code to{" "}
            <span className="font-bold text-[var(--sea-ink)]">{email}</span>
          </p>
          <p className="text-xs leading-relaxed text-[var(--sea-ink-soft)]">
            That address is handled by Vultisig for verification only. MayaZero
            does not store it and cannot access it.{" "}
            <a
              href="https://docs.vultisig.com/help-and-legal"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--maya-teal)] underline underline-offset-2 hover:text-[var(--sea-ink)] transition-colors"
            >
              Read the Vultisig help and legal details
            </a>
            .
          </p>
          <StatusPanel
            message={progressMessage}
            steps={visibleSteps}
            isProcessing={isProcessing}
          />
          <Field label="Verification Code">
            <input
              type="text"
              required
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder="0000"
              className="super-input text-center font-mono tracking-widest"
              disabled={isProcessing}
              maxLength={8}
            />
          </Field>
          <button
            type="submit"
            disabled={isProcessing || !verificationCode || !vaultId}
            className="cacao-btn w-full py-4 flex justify-center items-center gap-2"
          >
            {isProcessing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              "Verify & Complete"
            )}
          </button>
        </form>
      )}

      {step === 4 && (
        <div className="glass-panel p-8 sm:p-12 rounded-3xl text-center space-y-6 rise-in">
          <div className="mx-auto w-20 h-20 bg-[rgba(26,154,141,0.1)] rounded-full flex items-center justify-center text-[var(--maya-teal)] relative">
            <div className="absolute inset-0 rounded-full animate-ping bg-[rgba(26,154,141,0.2)]" />
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-black text-[var(--sea-ink)] tracking-tight">
            Vault Ready
          </h2>
          <p className="text-[var(--sea-ink-soft)] font-medium max-w-sm mx-auto">
            Your Fast Vault is verified and ready to use across MayaZero.
          </p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="cacao-btn w-full max-w-xs py-4 flex justify-center items-center gap-2 mx-auto"
          >
            <WalletCards size={18} /> Go to Portfolio
          </button>
        </div>
      )}
    </div>
  );
}

function ModeCard(props: {
  title: string;
  body: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full glass-panel-strong p-6 rounded-3xl flex items-center gap-5 transition-all text-left hover:-translate-y-1 hover:border-[var(--sea-ink-soft)]"
    >
      <div className="w-12 h-12 rounded-full bg-[rgba(26,154,141,0.1)] flex items-center justify-center text-[var(--maya-teal)] shrink-0">
        {props.icon}
      </div>
      <div>
        <div className="font-bold text-lg text-[var(--sea-ink)] mb-1">
          {props.title}
        </div>
        <p className="text-sm text-[var(--sea-ink-soft)] font-medium">
          {props.body}
        </p>
      </div>
      <ArrowRight size={20} className="ml-auto text-[var(--sea-ink-soft)]" />
    </button>
  );
}

function SetupForm(props: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  isProcessing: boolean;
  submitLabel: string;
  onSubmit: (event: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form
      onSubmit={props.onSubmit}
      className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6"
    >
      <div className="flex items-center gap-3 mb-2">
        {props.icon}
        <h3 className="text-xl font-bold text-[var(--sea-ink)]">
          {props.title}
        </h3>
      </div>
      {props.children}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          disabled={props.isProcessing}
          onClick={props.onBack}
          className="secondary-btn px-6 py-3 shrink-0"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={props.isProcessing}
          className="cacao-btn flex-1 py-3 flex justify-center items-center gap-2"
        >
          {props.isProcessing ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            props.submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
