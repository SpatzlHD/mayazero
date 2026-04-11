import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Chain } from '@vultisig/sdk'
import { trackAnalyticsEvent } from '#/analytics'
import { MayaWalletManager } from './manager'
import {
  createExecutionJourneySteps,
  createSecureVaultJourneySteps,
  trackTransactionJourney,
  waitForJourneyTransactionSettlement,
} from './journeys'
import {
  createFakeExtensionWindow,
  createFakeSdkClient,
  createFakeVault,
  createMemoryStorage,
} from './test-utils'

vi.mock('#/analytics', async () => {
  const actual = await vi.importActual<typeof import('#/analytics')>('#/analytics')
  return {
    ...actual,
    trackAnalyticsEvent: vi.fn(),
  }
})

describe('wallet journeys', () => {
  beforeEach(() => {
    vi.mocked(trackAnalyticsEvent).mockClear()
  })

  it('creates, patches, completes, and dismisses journeys', () => {
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: createMemoryStorage(),
    })

    const journeyId = manager.createJourney({
      kind: 'send',
      title: 'Send ETH',
      source: 'extension',
      chain: Chain.Ethereum,
      routePath: '/chains/eth',
      steps: createExecutionJourneySteps({
        source: 'extension',
        finalLabel: 'Transfer Complete',
      }),
    })

    manager.patchJourney(journeyId, {
      primaryTxHash: '0xhash',
      status: 'pending',
    })
    manager.completeJourney(journeyId, {
      result: { txHash: '0xhash' },
      status: 'success',
    })

    const completed = manager.getState().journeys.find((journey) => journey.id === journeyId)
    expect(completed).toMatchObject({
      primaryTxHash: '0xhash',
      status: 'success',
    })

    manager.dismissJourney(journeyId)
    expect(manager.getState().journeys.find((journey) => journey.id === journeyId)).toBeUndefined()
  })

  it('links sdk signing progress into a linked journey', async () => {
    const vault = createFakeVault({
      id: 'journey-vault',
      name: 'Journey Vault',
      chains: [Chain.Ethereum],
    })
    const { sdk } = createFakeSdkClient({
      vaults: [vault],
      activeVaultId: vault.id,
    })
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()
    await manager.selectSession(vault.id)

    const journeyId = manager.createJourney({
      kind: 'send',
      title: 'Linked signing',
      sessionId: vault.id,
      source: 'sdk',
      chain: Chain.Ethereum,
      steps: createExecutionJourneySteps({
        source: 'sdk',
        finalLabel: 'Transfer Complete',
      }),
    })

    await manager.execute('tx.sign', {
      sessionId: vault.id,
      journey: {
        id: journeyId,
        stepKey: 'signing',
      },
      input: {
        chain: Chain.Ethereum,
        payload: { toAddress: '0xabc' } as never,
      },
    })

    const journey = manager.getState().journeys.find((item) => item.id === journeyId)
    expect(journey?.operationIds?.length).toBeGreaterThan(0)
    expect(journey?.steps.find((step) => step.key === 'signing')).toMatchObject({
      message: 'Signing payload',
      progress: 50,
      status: 'success',
    })
  })

  it('bridges secure vault QR and device join telemetry into journeys', async () => {
    const vault = createFakeVault({
      id: 'secure-vault',
      name: 'Secure Vault',
      chains: [Chain.Ethereum],
    })
    const { sdk } = createFakeSdkClient({
      vaults: [vault],
      activeVaultId: vault.id,
    })
    const manager = new MayaWalletManager({
      sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: createMemoryStorage(),
    })

    await manager.initialize()

    const journeyId = manager.createJourney({
      kind: 'vault.secure.create',
      title: 'Create secure vault',
      source: 'secure-vault',
      routePath: '/vault-setup',
      steps: createSecureVaultJourneySteps(),
    })

    await manager.createSecureVault({
      name: 'Team Vault',
      devices: 2,
      threshold: 2,
      journeyId,
    })

    const journey = manager.getState().journeys.find((item) => item.id === journeyId)
    expect(journey?.qrPayload).toBe('vultisig://qr-payload')
    expect(journey?.deviceJoin).toMatchObject({
      joined: 2,
      required: 2,
    })
    expect(journey?.steps.find((step) => step.key === 'scan-qr')?.status).toBe('attention')
    expect(journey?.steps.find((step) => step.key === 'devices-joined')?.status).toBe('success')
  })

  it('marks journeys as submitted without hash when confirmation cannot continue', async () => {
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: createMemoryStorage(),
    })

    const journeyId = manager.createJourney({
      kind: 'send',
      title: 'No hash send',
      source: 'extension',
      chain: Chain.Ethereum,
      steps: createExecutionJourneySteps({
        source: 'extension',
        finalLabel: 'Transfer Complete',
      }),
    })

    const outcome = await waitForJourneyTransactionSettlement(manager, {
      chain: Chain.Ethereum,
      journeyId,
      stepKey: 'confirming',
      txHash: null,
    })

    const journey = manager.getState().journeys.find((item) => item.id === journeyId)
    expect(outcome).toBe('submitted_no_hash')
    expect(journey?.status).toBe('submitted_no_hash')
    expect(journey?.steps.find((step) => step.key === 'confirming')?.message).toContain(
      'automatic tracking is unavailable',
    )
  })

  it('bumps the balance refresh tick when a balance-relevant journey completes', () => {
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: createMemoryStorage(),
    })

    const journeyId = manager.createJourney({
      kind: 'swap',
      title: 'Swap CACAO to ETH',
      source: 'sdk',
      chain: Chain.MayaChain,
      steps: createExecutionJourneySteps({
        source: 'sdk',
        finalLabel: 'Swap Complete',
      }),
    })

    expect(manager.getState().balanceRefreshTick).toBe(0)
    manager.completeJourney(journeyId, {
      status: 'success',
      result: { txHash: '0xswap' },
    })

    expect(manager.getState().balanceRefreshTick).toBe(1)
  })

  it('bridges journey lifecycle analytics across final statuses', async () => {
    const statuses = [
      'success',
      'error',
      'unconfirmed',
      'submitted_no_hash',
    ] as const

    for (const status of statuses) {
      const manager = new MayaWalletManager({
        sdk: createFakeSdkClient().sdk,
        extensionWindow: createFakeExtensionWindow(),
        prefsStorage: createMemoryStorage(),
      })

      vi.mocked(trackAnalyticsEvent).mockClear()

      await trackTransactionJourney(manager, {
        kind: 'swap',
        title: 'Track swap analytics',
        source: 'sdk',
        chain: Chain.Ethereum,
        routePath: '/swap',
        analytics: {
          action: 'submit',
          route: '/swap',
          subject: 'swap',
          has_referral: true,
        },
        steps: createExecutionJourneySteps({
          source: 'sdk',
          finalLabel: 'Swap Complete',
        }),
        run: async (journey) => {
          journey.setPrimaryTxHash('0xsecret')
          journey.complete({ txHash: '0xsecret', mayaname: 'friend' }, status)
          return { txHash: '0xsecret', mayaname: 'friend' }
        },
      })

      expect(vi.mocked(trackAnalyticsEvent).mock.calls).toEqual([
        [
          {
            type: 'journey_started',
            action: 'submit',
            route: '/swap',
            subject: 'swap',
            source: 'sdk',
            chain: Chain.Ethereum,
            has_referral: true,
          },
        ],
        [
          {
            type: 'journey_finished',
            action: 'submit',
            route: '/swap',
            status,
            subject: 'swap',
            source: 'sdk',
            chain: Chain.Ethereum,
            has_referral: true,
          },
        ],
      ])
      expect(JSON.stringify(vi.mocked(trackAnalyticsEvent).mock.calls)).not.toContain('0xsecret')
      expect(JSON.stringify(vi.mocked(trackAnalyticsEvent).mock.calls)).not.toContain('friend')
    }
  })

  it('maps aborted journeys to cancelled analytics outcomes', async () => {
    const manager = new MayaWalletManager({
      sdk: createFakeSdkClient().sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: createMemoryStorage(),
    })

    await expect(
      trackTransactionJourney(manager, {
        kind: 'send',
        title: 'Aborted send',
        source: 'extension',
        chain: Chain.Ethereum,
        routePath: '/chains/ethereum',
        analytics: {
          action: 'send',
          route: '/chains/:chainKey',
          subject: 'asset_send',
        },
        steps: createExecutionJourneySteps({
          source: 'extension',
          finalLabel: 'Transfer Complete',
        }),
        run: async () => {
          throw new DOMException('Aborted', 'AbortError')
        },
      }),
    ).rejects.toBeInstanceOf(DOMException)

    expect(vi.mocked(trackAnalyticsEvent).mock.calls.at(-1)).toEqual([
      {
        type: 'journey_finished',
        action: 'send',
        route: '/chains/:chainKey',
        status: 'cancelled',
        subject: 'asset_send',
        source: 'extension',
        chain: Chain.Ethereum,
      },
    ])
  })
})
