import { createFileRoute } from '@tanstack/react-router'
import { Settings, Save } from 'lucide-react'
import { useSettings } from '#/provider/SettingsProvider'
import { useEffect, useState } from 'react'
import { buildPageSeoHead } from '#/lib/seo'
import {
  type MayaNameValidationResult,
  validateMayaName,
} from '#/lib/mayaname'

export const Route = createFileRoute('/settings')({
  head: () =>
    buildPageSeoHead({
      title: 'Settings',
      description:
        'Configure MayaZero node endpoints, routing preferences, and application fee behavior.',
    }),
  component: SettingsPage,
})

export type ReferralValidationState =
  | { status: 'idle'; message?: string }
  | { status: 'validating'; message?: string }
  | { status: 'valid'; message: string }
  | { status: 'invalid'; message: string }
  | { status: 'unreachable'; message: string }

function SettingsPage() {
  const settings = useSettings()
  
  // Local state for the form so we can save it explicitly
  const [formConfig, setFormConfig] = useState({
    mayanodeUrl: settings.mayanodeUrl,
    midgardUrl: settings.midgardUrl,
    tendermintUrl: settings.tendermintUrl,
    useZeroPercentFee: settings.useZeroPercentFee,
    useVultisigSwap: settings.useVultisigSwap,
    supportFeePercent: settings.supportFeePercent,
    referralMayaName: settings.referralMayaName,
  })

  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [referralValidation, setReferralValidation] = useState<ReferralValidationState>({
    status: formConfig.referralMayaName.trim() ? 'validating' : 'idle',
  })

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

  const handleSave = async () => {
    setIsSaving(true)
    const trimmedReferral = formConfig.referralMayaName.trim()

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
                    MayaZero Support Banner
                  </span>
                  <span className="text-[10px] leading-tight text-[var(--sea-ink-soft)]">
                    Reset the dedicated swap banner for MayaZero support if you dismissed it earlier. This does not affect automatic `m0` tracking.
                  </span>
                </div>
                <button
                  type="button"
                  className="w-full sm:w-auto secondary-btn px-5 py-3"
                  disabled={!settings.interfaceSupportBannerDismissed}
                  onClick={() =>
                    settings.updateInterfaceSupportSettings({
                      interfaceSupportBannerDismissed: false,
                    })
                  }
                >
                  {settings.interfaceSupportBannerDismissed
                    ? 'Show MayaZero support banner again'
                    : 'MayaZero support banner is visible'}
                </button>
              </div>

              <div className="flex flex-col gap-3 p-4 bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase font-bold text-[var(--sea-ink-soft)]">
                    Platform Fee Controls
                  </span>
                  <span className="text-[10px] leading-tight text-[var(--sea-ink-soft)]">
                    These settings are separate from opt-in referrer support on the swap page. Referred swaps stay at 0% by default until the user enables support manually.
                  </span>
                </div>

              <label className="flex items-center gap-3 p-4 bg-[var(--bg-base)] border rounded-xl transition-colors cursor-pointer border-[var(--line)] hover:border-[var(--cacao-neon)]">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-[var(--cacao-neon)] bg-[var(--surface)] border-[var(--line)] cursor-pointer disabled:cursor-not-allowed"
                  checked={formConfig.useZeroPercentFee}
                  // disabled={formConfig.useVultisigSwap}
                  onChange={e => setFormConfig(p => ({...p, useZeroPercentFee: e.target.checked}))}
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[var(--sea-ink)]">Use 0% Swap Fee</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">
                    Disable transaction support fee. {/* (Not available when using Vultisig Route) */}
                  </span>
                </div>
              </label>

              {(!formConfig.useZeroPercentFee /* && !formConfig.useVultisigSwap */) && (
                <div className="flex flex-col p-4 bg-[var(--bg-base)] border border-[var(--line)] rounded-xl gap-2">
                  <div className="flex justify-between">
                    <label className="text-xs font-bold text-[var(--sea-ink)]">Reserved Platform Fee (%)</label>
                    <span className="text-[var(--sea-ink-soft)] font-mono text-xs">{formConfig.supportFeePercent}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0" max="1" step="0.05"
                    className="w-full accent-[var(--maya-teal)] cursor-pointer"
                    value={formConfig.supportFeePercent}
                    onChange={e => setFormConfig(p => ({...p, supportFeePercent: parseFloat(e.target.value)}))}
                  />
                  <p className="text-[10px] text-[var(--sea-ink-soft)] leading-tight mt-1">
                    This fee voluntarily supports the creator of this interface. Minimum is 0.1% if 0% is not checked.
                  </p>
                </div>
              )}
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
                      ...(checked ? { useZeroPercentFee: false } : {}) 
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
