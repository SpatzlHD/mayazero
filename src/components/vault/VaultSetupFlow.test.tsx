// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultSetupFlow } from './VaultSetupFlow'

const navigate = vi.fn()

const wallet = {
  createFastVault: vi.fn(async () => ({ vaultId: 'pending-fast-vault' })),
  createFastVaultFromSeedphrase: vi.fn(async () => ({
    vaultId: 'pending-imported-fast-vault',
  })),
  verifyFastVault: vi.fn(async () => ({ vaultId: 'verified-fast-vault' })),
}

let walletState = {
  journeys: [] as Array<{
    kind: string
    status: string
    steps: Array<{ key: string; label: string; status: string; message?: string }>
  }>,
  operations: [] as Array<{
    name: string
    status: string
    progress?: { message?: string }
  }>,
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('#/wallet/import-utils', () => ({
  normalizeMnemonic: (value: string) => value.replace(/\s+/g, ' ').trim(),
  decryptXChainKeystoreMnemonic: vi.fn(async () => 'decrypted seed phrase'),
}))

vi.mock('#/wallet', () => ({
  createFastVaultJourneySteps: () => [],
  createFastVaultImportJourneySteps: () => [
    { key: 'decrypting-keystore', label: 'Decrypting Keystore', status: 'pending' },
    { key: 'validating-seed', label: 'Validating Seedphrase', status: 'pending' },
    { key: 'discovering-chains', label: 'Discovering Chains', status: 'pending' },
    { key: 'creating', label: 'Creating Vault', status: 'pending' },
    { key: 'verification-sent', label: 'Verification Email Sent', status: 'pending' },
    { key: 'awaiting-code', label: 'Awaiting Code', status: 'pending' },
  ],
  createFastVaultVerifyJourneySteps: () => [],
  trackTransactionJourney: async (
    _wallet: unknown,
    input: {
      run: (controller: {
        journeyId: string
        activateStep: (stepKey: string, message?: string) => void
        updateStep: (stepKey: string, patch: Record<string, unknown>) => void
        completeStep: (stepKey: string, message?: string) => void
        attentionStep: (stepKey: string, message?: string) => void
        complete: (result?: unknown) => void
      }) => Promise<unknown>
    },
  ) =>
    input.run({
      journeyId: 'journey-1',
      activateStep: vi.fn(),
      updateStep: vi.fn(),
      completeStep: vi.fn(),
      attentionStep: vi.fn(),
      complete: vi.fn(),
    }),
  useMayaWalletActions: () => wallet,
  useMayaWalletState: () => walletState,
}))

describe('VaultSetupFlow', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    navigate.mockReset()
    wallet.createFastVault.mockClear()
    wallet.createFastVaultFromSeedphrase.mockClear()
    wallet.verifyFastVault.mockClear()
    walletState = {
      journeys: [],
      operations: [],
    }
  })

  it('shows the new fast and import mode choices', () => {
    render(<VaultSetupFlow />)

    expect(screen.getByText('New Fast Vault')).toBeTruthy()
    expect(screen.getByText('Import Seedphrase')).toBeTruthy()
    expect(screen.getByText('Import Keystore')).toBeTruthy()
    expect(screen.getByText('Secure Vault')).toBeTruthy()
  })

  it('submits a manual seedphrase import through the manager', async () => {
    render(<VaultSetupFlow />)

    fireEvent.click(screen.getByText('Import Seedphrase'))
    fireEvent.change(screen.getByPlaceholderText('My Wallet'), {
      target: { value: 'Imported Vault' },
    })
    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Strong password'), {
      target: { value: 'VaultPassword123!' },
    })
    fireEvent.change(screen.getByPlaceholderText('Enter your 12 or 24 word seedphrase'), {
      target: { value: 'abandon   abandon\nabout' },
    })

    fireEvent.submit(screen.getByText('Import Vault').closest('form')!)

    await waitFor(() => {
      expect(wallet.createFastVaultFromSeedphrase).toHaveBeenCalledWith(
        expect.objectContaining({
          mnemonic: 'abandon abandon about',
          name: 'Imported Vault',
          email: 'user@example.com',
          password: 'VaultPassword123!',
        }),
      )
    })
    expect(screen.getByText('Check Your Email')).toBeTruthy()
  })

  it('decrypts an uploaded keystore before creating the imported vault', async () => {
    const { decryptXChainKeystoreMnemonic } = await import('#/wallet/import-utils')
    const { container } = render(<VaultSetupFlow />)

    fireEvent.click(screen.getByText('Import Keystore'))
    fireEvent.change(screen.getByPlaceholderText('My Wallet'), {
      target: { value: 'Imported Vault' },
    })
    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Strong password'), {
      target: { value: 'VaultPassword123!' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password used for the keystore file'), {
      target: { value: 'KeystoreSecret!' },
    })

    const file = new File(['{"crypto":true}'], 'wallet.json', {
      type: 'application/json',
    })
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })

    fireEvent.submit(screen.getByText('Decrypt & Import').closest('form')!)

    await waitFor(() => {
      expect(decryptXChainKeystoreMnemonic).toHaveBeenCalledWith(
        '{"crypto":true}',
        'KeystoreSecret!',
      )
      expect(wallet.createFastVaultFromSeedphrase).toHaveBeenCalledWith(
        expect.objectContaining({
          mnemonic: 'decrypted seed phrase',
          password: 'VaultPassword123!',
        }),
      )
    })
  })

  it('shows keystore import errors without rendering the uploaded contents', async () => {
    const { decryptXChainKeystoreMnemonic } = await import('#/wallet/import-utils')
    vi.mocked(decryptXChainKeystoreMnemonic).mockRejectedValueOnce(
      new Error('Keystore password is incorrect.'),
    )
    const { container } = render(<VaultSetupFlow />)

    fireEvent.click(screen.getByText('Import Keystore'))
    fireEvent.change(screen.getByPlaceholderText('My Wallet'), {
      target: { value: 'Imported Vault' },
    })
    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Strong password'), {
      target: { value: 'VaultPassword123!' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password used for the keystore file'), {
      target: { value: 'KeystoreSecret!' },
    })

    const file = new File(['{"ciphertext":"secret"}'], 'wallet.json', {
      type: 'application/json',
    })
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })

    fireEvent.submit(screen.getByText('Decrypt & Import').closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Keystore password is incorrect.')).toBeTruthy()
    })
    expect(screen.queryByText('{"ciphertext":"secret"}')).toBeNull()
    expect(wallet.createFastVaultFromSeedphrase).not.toHaveBeenCalled()
  })

  it('renders progress details for active import journeys', () => {
    walletState = {
      operations: [
        {
          name: 'vault.create.fast.import',
          status: 'pending',
          progress: { message: 'Discovering Maya-relevant chains.' },
        },
      ],
      journeys: [
        {
          kind: 'vault.fast.import',
          status: 'attention',
          steps: [
            {
              key: 'discovering-chains',
              label: 'Discovering Chains',
              status: 'active',
              message: '2 of 8 chains processed.',
            },
          ],
        },
      ],
    }

    render(<VaultSetupFlow />)
    fireEvent.click(screen.getByText('Import Seedphrase'))

    expect(screen.getByText('Vault Status')).toBeTruthy()
    expect(screen.getByText('Discovering Maya-relevant chains.')).toBeTruthy()
    expect(screen.getByText('2 of 8 chains processed.')).toBeTruthy()
  })

  it('verifies the imported vault and moves to the success screen', async () => {
    render(<VaultSetupFlow />)

    fireEvent.click(screen.getByText('New Fast Vault'))
    fireEvent.change(screen.getByPlaceholderText('My Wallet'), {
      target: { value: 'Primary Vault' },
    })
    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Strong password'), {
      target: { value: 'VaultPassword123!' },
    })

    fireEvent.submit(screen.getByText('Create Vault').closest('form')!)

    await screen.findByText('Check Your Email')

    fireEvent.change(screen.getByPlaceholderText('0000'), {
      target: { value: '123456' },
    })
    fireEvent.submit(screen.getByText('Verify & Complete').closest('form')!)

    await waitFor(() => {
      expect(wallet.verifyFastVault).toHaveBeenCalledWith(
        'pending-fast-vault',
        '123456',
        expect.objectContaining({ journeyId: 'journey-1' }),
      )
    })
    expect(screen.getByText('Vault Ready')).toBeTruthy()
  })
})
