import { createFileRoute } from '@tanstack/react-router'
import { Chain } from '@vultisig/sdk'
import { Settings, Save } from 'lucide-react'
import { useSettings } from '#/provider/SettingsProvider'
import { useEffect, useState } from 'react'
import { buildPageSeoHead } from '#/lib/seo'
import { isDevModeEnabled } from '#/lib/dev-mode'
import {
  normalizeImpersonationAddresses,
  validateImpersonationAddresses,
  type ImpersonationAddressMap,
  type ImpersonationValidationErrors,
} from '#/lib/impersonation'
import {
  type MayaNameValidationResult,
  validateMayaName,
} from '#/lib/mayaname'
import { supportedWalletChains } from '#/wallet/chains'

export const Route = createFileRoute('/settings')({
  head: () =>
    buildPageSeoHead({
      title: 'Settings',
      description:
        'Configure MayaZero node endpoints, referral preferences, analytics, and developer tooling.',
    }),
  component: SettingsPage,
})

export type ReferralValidationState =
  | { status: 'idle'; message?: string }
  | { status: 'validating'; message?: string }
  | { status: 'valid'; message: string }
  | { status: 'invalid'; message: string }
  | { status: 'unreachable'; message: string }

const chainLabels: Partial<Record<Chain, string>> = {
  [Chain.MayaChain]: 'MayaChain',
  [Chain.THORChain]: 'THORChain',
  [Chain.Bitcoin]: 'Bitcoin',
  [Chain.Dash]: 'Dash',
  [Chain.Zcash]: 'Zcash',
  [Chain.Ethereum]: 'Ethereum',
  [Chain.Arbitrum]: 'Arbitrum',
  [Chain.Kujira]: 'Kujira',
}

const chainPlaceholders: Partial<Record<Chain, string>> = {
  [Chain.MayaChain]: 'maya1...',
  [Chain.THORChain]: 'thor1...',
  [Chain.Bitcoin]: 'bc1...',
  [Chain.Dash]: 'X...',
  [Chain.Zcash]: 'zs...',
  [Chain.Ethereum]: '0x...',
  [Chain.Arbitrum]: '0x...',
  [Chain.Kujira]: 'kujira1...',
}

function SettingsPage() {
  const settings = useSettings()
  const isDevMode = isDevModeEnabled(
    import.meta.env.DEV,
    typeof window !== 'undefined' ? window.location.search : '',
  )
  
  // Local state for the form so we can save it explicitly
  const [formConfig, setFormConfig] = useState({
    mayanodeUrl: settings.mayanodeUrl,
    midgardUrl: settings.midgardUrl,
    tendermintUrl: settings.tendermintUrl,
    useVultisigSwap: settings.useVultisigSwap,
    analyticsDisabled: settings.analyticsDisabled,
    referralMayaName: settings.referralMayaName,
    impersonationEnabled: settings.impersonationEnabled,
    impersonationAddresses: settings.impersonationAddresses,
  })

  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [referralValidation, setReferralValidation] = useState<ReferralValidationState>({
    status: formConfig.referralMayaName.trim() ? 'validating' : 'idle',
  })
  const [impersonationValidation, setImpersonationValidation] =
    useState<ImpersonationValidationErrors>(() =>
      validateImpersonationAddresses(formConfig.impersonationAddresses),
    )

  useEffect(() => {
    let cancelled = false
    const trimmedReferral = formConfig.referralMayaName.trim()

    if (!trimmedReferral) {
      setReferralValidation({
        status: 'idle',
        message: 'No referral MAYAName stored.',
      })
      return
    }

    setReferralValidation({
      status: 'validating',
      message: 'Validating against the configured Mayanode.',
    })

    const timer = window.setTimeout(async () => {
      const result = await validateSettingsReferralMayaName(
        trimmedReferral,
        formConfig.mayanodeUrl,
      )
      if (cancelled) {
        return
      }
      setReferralValidation(result)
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [formConfig.mayanodeUrl, formConfig.referralMayaName])

  useEffect(() => {
    setImpersonationValidation(
      validateImpersonationAddresses(formConfig.impersonationAddresses),
    )
  }, [formConfig.impersonationAddresses])

  const handleSave = async () => {
    setIsSaving(true)
    const trimmedReferral = formConfig.referralMayaName.trim()
    const normalizedImpersonationAddresses = normalizeImpersonationAddresses(
      formConfig.impersonationAddresses,
    )
    const nextImpersonationValidation = validateImpersonationAddresses(
      normalizedImpersonationAddresses,
    )

    setImpersonationValidation(nextImpersonationValidation)
    if (Object.keys(nextImpersonationValidation).length > 0) {
      setIsSaving(false)
      return
    }

    if (trimmedReferral) {
      setReferralValidation({
        status: 'validating',
        message: 'Validating against the configured Mayanode.',
      })

      const result = await validateSettingsReferralMayaName(
        trimmedReferral,
        formConfig.mayanodeUrl,
      )

      if (result.status !== 'valid') {
        setReferralValidation(result)
        setIsSaving(false)
        return
      }

      setReferralValidation(result)
    } else {
      setReferralValidation({
        status: 'idle',
        message: 'No referral MAYAName stored.',
      })
    }

    settings.updateSettings({
      ...formConfig,
      referralMayaName: trimmedReferral,
      impersonationAddresses: normalizedImpersonationAddresses,
      impersonationEnabled:
        formConfig.impersonationEnabled &&
        Object.keys(normalizedImpersonationAddresses).length > 0,
    })
    setSaved(true)
    setIsSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <main className="page-wrap flex flex-col items-center justify-center min-h-[85vh] px-4">
      <div className="text-center mb-6 rise-in">
        <h1 className="terminal-title mb-2">Settings</h1>
        <p className="text-[var(--sea-ink-soft)] max-w-md mx-auto">
          Configure custom node endpoints and application behaviors.
        </p>
      </div>

      <article className="glass-panel-strong w-full max-w-2xl p-6 rise-in" style={{ animationDelay: '100ms' }}>
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-2 text-[var(--sea-ink)]">
            <Settings size={20} />
            <span className="font-bold text-lg">Application Configuration</span>
          </div>
          {saved && <span className="text-[var(--maya-teal)] font-bold text-sm">Settings Saved!</span>}
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="kicker mb-4 text-[var(--sea-ink-soft)]">Node Endpoints</h3>
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">Mayanode URL</label>
                <input 
                  type="text" 
                  className="bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none focus:border-[var(--cacao-neon)] transition-colors" 
                  value={formConfig.mayanodeUrl} 
                  onChange={e => setFormConfig(p => ({...p, mayanodeUrl: e.target.value}))} 
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">Midgard URL</label>
                <input 
                  type="text" 
                  className="bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none focus:border-[var(--cacao-neon)] transition-colors" 
                  value={formConfig.midgardUrl} 
                  onChange={e => setFormConfig(p => ({...p, midgardUrl: e.target.value}))} 
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">Tendermint URL</label>
                <input 
                  type="text" 
                  className="bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none focus:border-[var(--cacao-neon)] transition-colors" 
                  value={formConfig.tendermintUrl} 
                  onChange={e => setFormConfig(p => ({...p, tendermintUrl: e.target.value}))} 
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="kicker mb-4 text-[var(--sea-ink-soft)] mt-8">Referrals & Integrations</h3>
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5 p-4 bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl">
                <label className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">Referral MAYAName</label>
                <input
                  type="text"
                  className="bg-[var(--bg-base)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none focus:border-[var(--cacao-neon)] transition-colors"
                  value={formConfig.referralMayaName}
                  onChange={e => setFormConfig(p => ({ ...p, referralMayaName: e.target.value }))}
                  placeholder="friendname"
                />
                <span
                  className={`text-xs ${
                    referralValidation.status === 'invalid'
                      ? 'text-rose-500'
                      : referralValidation.status === 'unreachable'
                        ? 'text-amber-500'
                        : referralValidation.status === 'valid'
                          ? 'text-[var(--maya-teal)]'
                          : 'text-[var(--sea-ink-soft)]'
                  }`}
                >
                  {referralValidation.status === 'validating'
                    ? 'Validating referral MAYAName...'
                    : referralValidation.message}
                </span>
                <span className="text-[10px] text-[var(--sea-ink-soft)] leading-tight">
                  This MAYAName is captured from referral links and can be used on the swap page when a user explicitly enables referrer support.
                </span>
              </div>

              <div className="flex flex-col gap-3 p-4 bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">
                    Referral Capture
                  </span>
                  <p className="text-[10px] text-[var(--sea-ink-soft)] leading-tight mt-1">
                    MayaZero stores the MAYAName captured from referral links so users can optionally support that referrer on the swap page. The built-in `m0` MAYAName remains tracking-only.
                  </p>
                </div>
              </div>

              {/* Temporarily hidden while Vultisig functionality targets THORChain natively
              <label className="flex items-center gap-3 cursor-pointer p-4 bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl hover:border-[var(--cacao-neon)] transition-colors">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-[var(--cacao-neon)] bg-[var(--surface)] border-[var(--line)] cursor-pointer"
                  checked={formConfig.useVultisigSwap}
                  onChange={e => {
                    const checked = e.target.checked
                    setFormConfig(p => ({
                      ...p, 
                      useVultisigSwap: checked,
                    }))
                  }}
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[var(--sea-ink)]">Use Vultisig Swap Function</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">Prefer Vultisig SDK routing. This uses the fee attached to the Vultisig route.</span>
                </div>
              </label>
              */}
            </div>
          </section>

          <section>
            <h3 className="kicker mb-4 text-[var(--sea-ink-soft)] mt-8">Analytics</h3>
            <div className="flex flex-col gap-3 p-4 bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl">
              <label className="flex items-center gap-3 p-4 bg-[var(--bg-base)] border rounded-xl transition-colors cursor-pointer border-[var(--line)] hover:border-[var(--cacao-neon)]">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-[var(--cacao-neon)] bg-[var(--surface)] border-[var(--line)] cursor-pointer"
                  checked={!formConfig.analyticsDisabled}
                  onChange={(event) =>
                    setFormConfig((current) => ({
                      ...current,
                      analyticsDisabled: !event.target.checked,
                    }))
                  }
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[var(--sea-ink)]">Allow minimal analytics</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">
                    Turn this off to opt out of Vercel Analytics and OpenPanel pageviews and custom journey events on this browser.
                  </span>
                </div>
              </label>
              <span className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">
                Privacy-Preserving Telemetry
              </span>
              <p className="text-sm text-[var(--sea-ink)] leading-relaxed">
                MayaZero only emits minimal analytics on approved production hosts. Query strings and URL hashes are stripped before pageviews are sent.
              </p>
              <p className="text-sm text-[var(--sea-ink)] leading-relaxed">
                Wallet addresses, transaction hashes, vault identifiers, MAYANames, memos, and other sensitive payloads are never sent to Vercel Analytics or OpenPanel.
              </p>
              <p className="text-sm text-[var(--sea-ink)] leading-relaxed">
                Browser privacy signals like Do Not Track and Global Privacy Control disable analytics automatically, and MayaZero does not create its own analytics identifier in local storage or cookies.
              </p>
            </div>
          </section>

          {isDevMode ? (
            <section>
              <h3 className="kicker mb-4 text-[var(--sea-ink-soft)] mt-8">
                Developer Impersonation
              </h3>
              <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] p-4">
                <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-base)] p-4 transition-colors hover:border-[var(--cacao-neon)] cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-[var(--cacao-neon)] bg-[var(--surface)] border-[var(--line)] cursor-pointer"
                    checked={formConfig.impersonationEnabled}
                    onChange={(event) =>
                      setFormConfig((current) => ({
                        ...current,
                        impersonationEnabled: event.target.checked,
                      }))
                    }
                  />
                  <div className="flex flex-col">
                    <span className="font-bold text-[var(--sea-ink)]">
                      Enable view-only impersonation
                    </span>
                    <span className="text-xs text-[var(--sea-ink-soft)]">
                      Overrides read paths with the address map below while keeping all actions disabled.
                    </span>
                  </div>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  {supportedWalletChains.map((chain) => (
                    <div
                      key={chain}
                      className="flex flex-col gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-base)] p-4"
                    >
                      <label className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">
                        {chainLabels[chain]}
                      </label>
                      <input
                        type="text"
                        className={`rounded-xl border px-4 py-2.5 text-base text-[var(--sea-ink)] outline-none transition-colors ${
                          impersonationValidation[chain]
                            ? 'border-rose-500 bg-rose-500/5'
                            : 'border-[var(--line)] bg-[var(--surface)] focus:border-[var(--cacao-neon)]'
                        }`}
                        value={formConfig.impersonationAddresses[chain] ?? ''}
                        placeholder={chainPlaceholders[chain]}
                        onChange={(event) =>
                          setFormConfig((current) => ({
                            ...current,
                            impersonationAddresses: {
                              ...current.impersonationAddresses,
                              [chain]: event.target.value,
                            } as ImpersonationAddressMap,
                          }))
                        }
                      />
                      <span
                        className={`text-xs ${
                          impersonationValidation[chain]
                            ? 'text-rose-500'
                            : 'text-[var(--sea-ink-soft)]'
                        }`}
                      >
                        {impersonationValidation[chain] ??
                          'Leave blank to keep this chain in the normal missing-address state.'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-base)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-[var(--sea-ink-soft)]">
                    Invalid addresses prevent impersonation from being saved. Empty maps automatically disable the mode.
                  </div>
                  <button
                    type="button"
                    className="secondary-btn px-5 py-3"
                    onClick={() => {
                      settings.clearImpersonationSettings()
                      setFormConfig((current) => ({
                        ...current,
                        impersonationEnabled: false,
                        impersonationAddresses: {},
                      }))
                      setImpersonationValidation({})
                    }}
                  >
                    Clear impersonation
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--line)]">
          <button 
            className="w-full sm:w-auto cacao-btn py-3 px-8 text-lg tracking-tight flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] transition-transform ml-auto"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </article>
    </main>
  )
}

export async function validateSettingsReferralMayaName(
  referralMayaName: string,
  mayanodeUrl: string,
  fetchImpl?: typeof fetch,
): Promise<ReferralValidationState & { trimmedReferral: string }> {
  const trimmedReferral = referralMayaName.trim()
  if (!trimmedReferral) {
    return {
      status: 'idle',
      message: 'No referral MAYAName stored.',
      trimmedReferral,
    }
  }

  return toReferralValidationState(
    await validateMayaName(trimmedReferral, mayanodeUrl, fetchImpl),
  )
}

export function toReferralValidationState(
  result: MayaNameValidationResult,
): ReferralValidationState & { trimmedReferral: string } {
  if (result.status === 'valid') {
    return {
      status: 'valid',
      message: `Validated MAYAName "${result.name}".`,
      trimmedReferral: result.name,
    }
  }

  if (result.status === 'invalid') {
    return {
      status: 'invalid',
      message: `Invalid MAYAName: ${result.name}.`,
      trimmedReferral: result.name,
    }
  }

  return {
    status: 'unreachable',
    message: 'Validation is temporarily unavailable.',
    trimmedReferral: result.name,
  }
}
