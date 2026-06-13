import { useEffect, useState } from 'react'
import QRCode from 'react-qr-code'
import { Loader2, X } from 'lucide-react'
import {
  closeWalletConnectUi,
  getWalletConnectUiState,
  subscribeWalletConnectUi,
} from '#/wallet/walletconnect-client'

export function WalletConnectModalHost() {
  const [state, setState] = useState(getWalletConnectUiState())

  useEffect(() => subscribeWalletConnectUi(setState), [])

  if (!state.isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[var(--bg-base)]/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md glass-panel-strong rounded-3xl border border-[var(--line)] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--sea-ink)]">
              Connect Wallet
            </h2>
            <p className="text-sm text-[var(--sea-ink-soft)] mt-1">
              Scan the QR code with a WalletConnect-compatible wallet.
            </p>
          </div>
          <button
            type="button"
            onClick={closeWalletConnectUi}
            className="p-2 rounded-full hover:bg-[var(--surface)] text-[var(--sea-ink-soft)]"
            aria-label="Close WalletConnect modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          {state.uri ? (
            <div className="rounded-2xl bg-white p-4">
              <QRCode value={state.uri} size={220} />
            </div>
          ) : (
            <div className="flex h-[252px] w-[252px] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
              <Loader2 size={28} className="animate-spin text-[var(--maya-teal)]" />
            </div>
          )}

          {state.uri ? (
            <button
              type="button"
              className="secondary-btn w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.uri ?? '')
                } catch {
                  // Clipboard may be unavailable.
                }
              }}
            >
              Copy connection link
            </button>
          ) : null}

          <p className="text-xs text-center text-[var(--sea-ink-soft)] leading-relaxed">
            WalletConnect only exposes chains your wallet approves during pairing.
            MetaMask gives Ethereum/Arbitrum. For Maya, THOR, and Bitcoin use a
            multi-chain wallet such as Ctrl (XDEFI), Keplr, Leap, or Vultisig
            mobile — and approve all requested chains when prompted.
          </p>
          <p className="text-xs text-center text-[var(--sea-ink-soft)] leading-relaxed">
            Cardano, Dash, and Zcash are not available via WalletConnect here.
            Use the Vultisig extension or import a keystore for full chain
            coverage.
          </p>
        </div>
      </div>
    </div>
  )
}
