import { useMayaWalletActions, useMayaWalletState } from '#/wallet'

export function LegacyVaultMigrationBanner() {
  const wallet = useMayaWalletActions()
  const state = useMayaWalletState()

  if (!state.legacyVaultDetected) {
    return null
  }

  return (
    <div className="mx-auto mb-4 max-w-5xl rounded-2xl border border-[var(--line)] bg-[rgba(255,193,7,0.08)] px-4 py-3 text-sm text-[var(--sea-ink)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Local Vultisig vaults are no longer supported. Import your xchain keystore,
          connect via WalletConnect, or use the Vultisig extension.
        </p>
        <button
          type="button"
          className="secondary-btn shrink-0"
          onClick={() => wallet.dismissLegacyVaultMigration()}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
