import { createFileRoute } from '@tanstack/react-router'
import { Settings, Save } from 'lucide-react'
import { useSettings } from '#/provider/SettingsProvider'
import { useState } from 'react'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

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
  })

  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    settings.updateSettings(formConfig)
    setSaved(true)
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
            <h3 className="kicker mb-4 text-[var(--sea-ink-soft)] mt-8">Fees & Integrations</h3>
            <div className="space-y-4">
              <label className={`flex items-center gap-3 p-4 bg-[var(--chip-bg)] border rounded-xl transition-colors ${formConfig.useVultisigSwap ? 'opacity-50 cursor-not-allowed border-[var(--line)]' : 'cursor-pointer border-[var(--line)] hover:border-[var(--cacao-neon)]'}`}>
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-[var(--cacao-neon)] bg-[var(--surface)] border-[var(--line)] cursor-pointer disabled:cursor-not-allowed"
                  checked={formConfig.useZeroPercentFee}
                  disabled={formConfig.useVultisigSwap}
                  onChange={e => setFormConfig(p => ({...p, useZeroPercentFee: e.target.checked}))}
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[var(--sea-ink)]">Use 0% Swap Fee</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">
                    Disable 0.1% transaction support fee (Not available when using Vultisig Route)
                  </span>
                </div>
              </label>

              {!formConfig.useZeroPercentFee && !formConfig.useVultisigSwap && (
                <div className="flex flex-col p-4 bg-[var(--chip-bg)] border border-[var(--line)] rounded-xl gap-2">
                  <div className="flex justify-between">
                    <label className="text-xs font-bold text-[var(--sea-ink)]">Custom Support Fee (%)</label>
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
                      // Automatically disable zero fee if vultisig is active
                      ...(checked ? { useZeroPercentFee: false } : {}) 
                    }))
                  }}
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[var(--sea-ink)]">Use Vultisig Swap Function</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">Prefer Vultisig SDK routing. This uses the fee attached to the Vultisig route.</span>
                </div>
              </label>
            </div>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--line)]">
          <button 
            className="w-full sm:w-auto cacao-btn py-3 px-8 text-lg tracking-tight flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] transition-transform ml-auto"
            onClick={handleSave}
          >
            <Save size={18} />
            Save Configuration
          </button>
        </div>
      </article>
    </main>
  )
}
