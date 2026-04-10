import { useState, useEffect } from "react";
import { useMayaWalletActions, useMayaWalletState } from "#/wallet";
import { LockKeyhole, Loader2, X } from "lucide-react";

export function GlobalPasswordDialog() {
  const wallet = useMayaWalletActions();
  const state = useMayaWalletState();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const request = state.passwordRequest;

  useEffect(() => {
    if (!request) {
      setPassword("");
      setIsSubmitting(false);
    }
  }, [request]);

  if (!request) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setIsSubmitting(true);
    // Submit it after a tiny delay for better UX
    setTimeout(() => {
      wallet.submitPassword(password);
    }, 50);
  }

  function handleCancel() {
    wallet.cancelPasswordRequest();
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg-base)]/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm glass-panel-strong p-6 sm:p-8 rounded-3xl shadow-2xl border border-[var(--line)] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 text-[var(--sea-ink)]">
            <div className="w-10 h-10 rounded-full bg-[rgba(26,154,141,0.1)] flex items-center justify-center text-[var(--maya-teal)]">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Unlock Vault</h2>
              <p className="text-xs font-medium text-[var(--sea-ink-soft)]">{request.vaultName}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={handleCancel}
            className="p-2 rounded-full hover:bg-[var(--surface)] text-[var(--sea-ink-soft)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider mb-2 block">Encryption Password</label>
            <div className="bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl p-3 flex items-center focus-within:border-[var(--maya-teal)] transition-colors">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="super-input w-full"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="secondary-btn flex-1 py-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="cacao-btn flex-1 py-3 flex justify-center items-center gap-2"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
