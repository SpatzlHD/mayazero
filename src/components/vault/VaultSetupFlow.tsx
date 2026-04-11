import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ShieldCheck, Zap, Lock, Mail, Users, ArrowRight, Loader2, CheckCircle2, WalletCards } from 'lucide-react'
import {
  createFastVaultJourneySteps,
  createFastVaultVerifyJourneySteps,
  createSecureVaultJourneySteps,
  trackTransactionJourney,
  useMayaWalletActions,
  useMayaWalletState,
} from '#/wallet'

export function VaultSetupFlow() {
  const navigate = useNavigate()
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()

  const [step, setStep] = useState(1)
  const [vaultType, setVaultType] = useState<'fast' | 'secure' | null>(null)

  // Form State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [devices, setDevices] = useState(3)
  
  // Verification State
  const [vaultId, setVaultId] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const activeVaultJourney = state.journeys.find((journey) =>
    journey.status === 'pending' || journey.status === 'attention'
      ? journey.kind === 'vault.secure.create' || journey.kind === 'vault.fast.create'
      : false,
  )
  const qrPayload = activeVaultJourney?.qrPayload
  const deviceJoin = activeVaultJourney?.deviceJoin

  async function handleFastSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !password) {
      setError('Please fill in all fields')
      return
    }
    setError('')
    setIsProcessing(true)
    try {
      const res = await trackTransactionJourney(wallet, {
        kind: 'vault.fast.create',
        title: `Create Fast Vault: ${name}`,
        source: 'fast-vault',
        routePath: '/vault-setup',
        analytics: {
          action: 'fast_create',
          route: '/vault-setup',
          subject: 'vault',
        },
        steps: createFastVaultJourneySteps(),
        run: async (journey) => {
          journey.activateStep('creating', 'Creating the fast vault and provisioning verification.')
          const result = await wallet.createFastVault({ name, email, password, journeyId: journey.journeyId })
          journey.completeStep('creating', 'Fast vault created.')
          journey.completeStep('verification-sent', `Verification code sent to ${email}.`)
          journey.attentionStep('awaiting-code', 'Enter the verification code from your email to finish setup.')
          return result
        },
      })
      setVaultId(res.vaultId)
      setStep(3) // Go to verification
    } catch (err: any) {
      setError(err?.message || 'Failed to create vault')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleFastVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!vaultId || !verificationCode) return
    setError('')
    setIsProcessing(true)
    try {
      await trackTransactionJourney(wallet, {
        kind: 'vault.fast.verify',
        title: `Verify Fast Vault: ${name || 'Vault'}`,
        source: 'fast-vault',
        routePath: '/vault-setup',
        analytics: {
          action: 'fast_verify',
          route: '/vault-setup',
          subject: 'vault',
        },
        steps: createFastVaultVerifyJourneySteps(),
        run: async (journey) => {
          journey.activateStep('verifying', 'Verifying your email code.')
          const result = await wallet.verifyFastVault(vaultId, verificationCode, {
            journeyId: journey.journeyId,
          })
          journey.completeStep('verifying', 'Verification succeeded.')
          journey.completeStep('refreshing-session', 'Wallet session refreshed.')
          journey.completeStep('vault-ready', 'Fast vault is ready.')
          journey.complete(result)
          return result
        },
      })
      setStep(4) // Success
    } catch (err: any) {
      setError(err?.message || 'Failed to verify code')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleSecureSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || devices < 2) {
      setError('Please provide a name and at least 2 devices')
      return
    }
    setError('')
    setIsProcessing(true)
    try {
      setStep(3) // Immediately show the QR code screen while waiting
      const res = await trackTransactionJourney(wallet, {
        kind: 'vault.secure.create',
        title: `Create Secure Vault: ${name}`,
        source: 'secure-vault',
        routePath: '/vault-setup',
        analytics: {
          action: 'secure_create',
          route: '/vault-setup',
          subject: 'vault',
        },
        steps: createSecureVaultJourneySteps(),
        run: async (journey) => {
          journey.activateStep('creating-session', 'Creating multi-device vault session.')
          const result = await wallet.createSecureVault({ 
            name, 
            devices, 
            password: password || undefined,
            journeyId: journey.journeyId,
          })
          journey.completeStep('creating-session', 'Secure vault session created.')
          journey.completeStep('scan-qr', 'QR pairing completed.')
          journey.completeStep('devices-joined', 'Required devices joined.')
          journey.completeStep('keygen', 'MPC key generation completed.')
          journey.completeStep('vault-ready', 'Secure vault is ready.')
          journey.complete(result)
          return result
        },
      })
      setVaultId(res.vaultId)
      setStep(4) // Success, after threshold is reached
    } catch (err: any) {
      setError(err?.message || 'Failed to create secure vault')
      setStep(2) // Go back on error
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto w-full rise-in">
      <div className="mb-8 text-center">
        <h2 className="terminal-title">Create Vault</h2>
        <p className="text-[var(--sea-ink-soft)] font-medium mt-2">
          Secure, multi-chain MPC wallet creation
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold text-center">
          {error}
        </div>
      )}

      {/* STEP 1: SELECT TYPE */}
      {step === 1 && (
        <div className="space-y-4">
          <button 
            type="button"
            onClick={() => { setVaultType('fast'); setStep(2); setError('') }}
            className={`w-full glass-panel-strong p-6 rounded-3xl flex items-center gap-5 transition-all text-left hover:-translate-y-1 ${vaultType === 'fast' ? 'border-[var(--maya-teal)] shadow-[0_0_20px_rgba(26,154,141,0.2)]' : 'hover:border-[var(--sea-ink-soft)]'}`}
          >
            <div className="w-12 h-12 rounded-full bg-[rgba(26,154,141,0.1)] flex items-center justify-center text-[var(--maya-teal)] shrink-0">
              <Zap size={24} />
            </div>
            <div>
              <div className="font-bold text-lg text-[var(--sea-ink)] mb-1">Fast Vault</div>
              <p className="text-sm text-[var(--sea-ink-soft)] font-medium">Server-assisted 2-of-2 MPC. Perfect for quick setup and everyday use.</p>
            </div>
            <ArrowRight size={20} className="ml-auto text-[var(--sea-ink-soft)]" />
          </button>

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
              <div className="flex items-center gap-3 mb-1">
                <div className="font-bold text-lg text-[var(--sea-ink)]">Secure Vault</div>
                <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--cacao-neon)]">
                  Coming Soon
                </span>
              </div>
              <p className="text-sm text-[var(--sea-ink-soft)] font-medium">Multi-device N-of-M MPC. Maximum security for high-value assets.</p>
            </div>
            <ArrowRight size={20} className="ml-auto text-[var(--sea-ink-soft)]" />
          </button>
        </div>
      )}

      {/* STEP 2: SETUP DETAILS */}
      {step === 2 && vaultType === 'fast' && (
        <form onSubmit={handleFastSubmit} className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Zap size={20} className="text-[var(--maya-teal)]" />
            <h3 className="text-xl font-bold text-[var(--sea-ink)]">Fast Vault Setup</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">Vault Name</label>
              <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center focus-within:border-[var(--maya-teal)] transition-colors">
                <input 
                  type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder="My Wallet" className="super-input" disabled={isProcessing}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">Email <span className="opacity-60 lowercase font-normal">(for verifying code)</span></label>
              <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center gap-2 focus-within:border-[var(--maya-teal)] transition-colors">
                <Mail size={16} className="text-[var(--sea-ink-soft)] shrink-0" />
                <input 
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="user@example.com" className="super-input" disabled={isProcessing}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">Encryption Password</label>
              <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center gap-2 focus-within:border-[var(--maya-teal)] transition-colors">
                <Lock size={16} className="text-[var(--sea-ink-soft)] shrink-0" />
                <input 
                  type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Strong password" className="super-input" disabled={isProcessing}
                />
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 pt-2">
            <button type="button" disabled={isProcessing} onClick={() => setStep(1)} className="secondary-btn px-6 py-3 shrink-0">Back</button>
            <button type="submit" disabled={isProcessing} className="cacao-btn flex-1 py-3 flex justify-center items-center gap-2">
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Create Vault'}
            </button>
          </div>
        </form>
      )}

      {step === 2 && vaultType === 'secure' && (
        <form onSubmit={handleSecureSubmit} className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck size={20} className="text-[var(--cacao-neon)]" />
            <h3 className="text-xl font-bold text-[var(--sea-ink)]">Secure Vault Setup</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">Vault Name</label>
              <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center focus-within:border-[var(--cacao-neon)] transition-colors">
                <input 
                  type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder="Team Wallet" className="super-input" disabled={isProcessing}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">Total Devices</label>
              <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center gap-2 focus-within:border-[var(--cacao-neon)] transition-colors">
                <Users size={16} className="text-[var(--sea-ink-soft)] shrink-0" />
                <input 
                  type="number" min={2} max={10} required value={devices.toString()} onChange={e => setDevices(parseInt(e.target.value) || 2)}
                  className="super-input" disabled={isProcessing}
                />
              </div>
              <p className="text-xs text-[var(--sea-ink-soft)] mt-1 ml-1 opacity-70">
                Minimum 2 devices required.
              </p>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">Encryption Password <span className="opacity-60 lowercase font-normal">(optional)</span></label>
              <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center gap-2 focus-within:border-[var(--cacao-neon)] transition-colors">
                <Lock size={16} className="text-[var(--sea-ink-soft)] shrink-0" />
                <input 
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Optional password" className="super-input" disabled={isProcessing}
                />
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 pt-2">
            <button type="button" disabled={isProcessing} onClick={() => setStep(1)} className="secondary-btn px-6 py-3 shrink-0">Back</button>
            <button type="submit" disabled={isProcessing} className="cacao-btn flex-1 py-3 flex justify-center items-center gap-2">
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Generate Session'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: VERIFICATION / PAIRING */}
      {step === 3 && vaultType === 'fast' && (
        <form onSubmit={handleFastVerify} className="glass-panel p-6 sm:p-8 rounded-3xl text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-[rgba(26,154,141,0.1)] rounded-full flex items-center justify-center mb-4 text-[var(--maya-teal)]">
            <Mail size={32} />
          </div>
          <h3 className="text-xl font-bold text-[var(--sea-ink)]">Check Your Email</h3>
          <p className="text-[var(--sea-ink-soft)] text-sm">We've sent a verification code to <span className="font-bold text-[var(--sea-ink)]">{email}</span></p>
          
          <div className="max-w-[240px] mx-auto mt-6">
             <div className="bg-[var(--surface-strong)] border border-[var(--maya-teal)] rounded-xl p-4 flex items-center font-mono text-xl tracking-widest text-center shadow-[0_0_15px_rgba(26,154,141,0.1)]">
               <input 
                 type="text" required value={verificationCode} onChange={e => setVerificationCode(e.target.value)}
                 placeholder="0000" className="super-input text-center" disabled={isProcessing}
                 maxLength={8}
               />
             </div>
          </div>

          <div className="pt-4">
             <button type="submit" disabled={isProcessing || !verificationCode} className="cacao-btn w-full py-4 flex justify-center items-center gap-2">
               {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Verify & Complete'}
             </button>
          </div>
        </form>
      )}

      {step === 3 && vaultType === 'secure' && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl text-center space-y-6 flex flex-col items-center">
           <div className="flex items-center gap-3 mb-2 w-full">
            <ShieldCheck size={20} className="text-[var(--cacao-neon)]" />
            <h3 className="text-xl font-bold text-[var(--sea-ink)]">Multi-Device Pairing</h3>
           </div>
           
           {!qrPayload ? (
             <div className="py-12 flex flex-col items-center">
                <Loader2 size={36} className="text-[var(--sea-ink-soft)] animate-spin mb-4" />
                <p className="text-[var(--sea-ink-soft)] font-medium">Generating secure session parameters...</p>
             </div>
           ) : (
             <>
               <p className="text-[var(--sea-ink-soft)] text-sm mb-4">
                 Continue in the global transaction tracker. It now owns QR pairing, device joins, and signing feedback for secure vault setup.
               </p>

               <div className="mt-6 w-full max-w-sm">
                 <div className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 text-left">
                   Devices Joined
                 </div>
                 <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-full h-3 w-full overflow-hidden flex">
                    {Array.from({ length: Math.max(devices, deviceJoin?.required || devices) }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`h-full flex-1 border-r border-[#ffffff20] last:border-r-0 transition-colors duration-500 ${(deviceJoin?.joined || 1) > i ? 'bg-[var(--cacao-neon)]' : 'bg-transparent'}`} 
                      />
                    ))}
                 </div>
                 <div className="flex justify-between mt-2 text-xs font-bold font-mono">
                    <span className="text-[var(--cacao-neon)]">{(deviceJoin?.joined || 1)} Joined</span>
                    <span className="text-[var(--sea-ink-soft)]">Target: {deviceJoin?.required || devices}</span>
                 </div>
               </div>

               {(deviceJoin?.joined || 1) >= (deviceJoin?.required || devices) && (
                 <div className="w-full mt-4 p-4 rounded-xl bg-[rgba(26,154,141,0.1)] border border-[var(--maya-teal)] text-[var(--maya-teal)] text-sm font-bold flex items-center justify-center gap-2 animate-pulse">
                   <Loader2 size={16} className="animate-spin" /> Performing Key Generation (MPC)...
                 </div>
               )}
             </>
           )}
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 4 && (
        <div className="glass-panel p-8 sm:p-12 rounded-3xl text-center space-y-6 rise-in">
           <div className="mx-auto w-20 h-20 bg-[rgba(26,154,141,0.1)] rounded-full flex items-center justify-center mb-6 text-[var(--maya-teal)] relative">
             <div className="absolute inset-0 rounded-full animate-ping bg-[rgba(26,154,141,0.2)]" />
             <CheckCircle2 size={40} />
           </div>
           
           <h2 className="text-3xl font-black text-[var(--sea-ink)] tracking-tight">Vault Created</h2>
           <p className="text-[var(--sea-ink-soft)] font-medium max-w-sm mx-auto">
             Your vault is now secure and ready to use. You can access it anytime from the Vault Manager.
           </p>

           <div className="pt-8">
             <button onClick={() => navigate({ to: '/' })} className="cacao-btn w-full max-w-xs py-4 flex justify-center items-center gap-2 mx-auto">
               <WalletCards size={18} /> Go to Portfolio
             </button>
           </div>
        </div>
      )}
    </div>
  )
}
