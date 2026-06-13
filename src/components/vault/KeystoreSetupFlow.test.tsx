/* @vitest-environment happy-dom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeystoreSetupFlow } from './KeystoreSetupFlow'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('#/wallet', () => ({
  useMayaWalletActions: () => ({
    createJourney: vi.fn(() => 'journey-1'),
    importKeystoreFromFile: vi.fn(async () => ({ keystoreId: 'keystore-1' })),
    importKeystoreFromMnemonic: vi.fn(async () => ({ keystoreId: 'keystore-1' })),
    completeJourney: vi.fn(),
  }),
}))

vi.mock('#/wallet/maya-seedphrase-compat', () => ({
  MAYA_COSMOS_HD_PATH: "m/44'/931'/0'/0/0",
  MAYA_VULTISIG_HD_PATH: "m/44'/931'/0'/0/0",
  detectMayaSeedphraseImportMismatch: vi.fn(async () => null),
  formatMayaSeedphraseImportMismatch: vi.fn(() => 'Seedphrase mismatch'),
}))

afterEach(() => {
  cleanup()
})

describe('KeystoreSetupFlow', () => {
  it('renders the import wallet entry screen', () => {
    render(<KeystoreSetupFlow />)

    expect(screen.getByRole('heading', { name: 'Import Wallet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Import Keystore/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Import Seedphrase/i })).toBeTruthy()
    expect(
      screen.getByText(/Import an xchain keystore or seedphrase as a local hot wallet/i),
    ).toBeTruthy()
  })
})
