import {
  createInitializedTestManager,
  createTestManager,
  initializeKeystoreSession,
  keystoreStoreMocks,
  localSignerMocks,
  resetWalletTestMocks,
} from './test-mocks'
import {
  createFakeExtensionWindow,
  createFakeKeystoreRecord,
  createValidRawKeystore,
} from './test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { trackAnalyticsEvent } from '#/analytics'
import {
  createExecutionJourneySteps,
  createKeystoreImportJourneySteps,
  resolveJourneyStatusFromTrackerState,
  trackSwapJourneyWithCacaotracker,
  trackTransactionJourney,
  waitForJourneyTransactionSettlement,
} from './journeys'

class FakeWebSocket {
  private listeners = new Map<string, Set<(event: unknown) => void>>()
  sent: string[] = []
  closed = false

  addEventListener(type: string, listener: (event: unknown) => void) {
    const current = this.listeners.get(type) ?? new Set()
    current.add(listener)
    this.listeners.set(type, current)
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.closed = true
  }

  emit(type: string, event: unknown = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}

vi.mock('#/analytics', async () => {
  const actual = await vi.importActual<typeof import('#/analytics')>('#/analytics')
  return {
    ...actual,
    trackAnalyticsEvent: vi.fn(),
  }
})

describe('wallet journeys', () => {
  beforeEach(() => {
    resetWalletTestMocks()
    vi.mocked(trackAnalyticsEvent).mockClear()
  })

  it('creates, patches, completes, and dismisses journeys', () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
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

  it('links keystore signing progress into a linked journey', async () => {
    const keystore = createFakeKeystoreRecord({
      id: 'journey-keystore',
      label: 'Journey Keystore',
      addresses: { [Chain.Ethereum]: '0x00000000000000000000000000000000000000e1' },
    })
    const { manager } = await createInitializedTestManager({
      extensionWindow: createFakeExtensionWindow(),
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

    const journeyId = manager.createJourney({
      kind: 'send',
      title: 'Linked signing',
      sessionId: keystore.id,
      source: 'keystore',
      chain: Chain.Ethereum,
      steps: createExecutionJourneySteps({
        source: 'keystore',
        finalLabel: 'Transfer Complete',
      }),
    })

    await manager.execute('tx.sign', {
      sessionId: keystore.id,
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
    expect(journey?.status).toBe('pending')
    expect(journey?.steps.find((step) => step.key === 'signing')?.status).toBe('success')
  })

  it('tracks keystore import journey steps through manager import', async () => {
    const imported = createFakeKeystoreRecord({
      id: 'imported-journey-keystore',
      label: 'Imported Journey Wallet',
    })
    keystoreStoreMocks.importXChainKeystoreWallet.mockResolvedValue(imported)
    keystoreStoreMocks.listStoredKeystores
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([imported])

    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
    })
    await manager.initialize()

    const journeyId = manager.createJourney({
      kind: 'keystore.import',
      title: 'Import Keystore',
      source: 'keystore-import',
      routePath: '/vault-setup',
      steps: createKeystoreImportJourneySteps(),
    })

    const rawKeystore = await createValidRawKeystore('keystore-pass')

    await manager.importKeystoreFromFile({
      label: 'Imported Journey Wallet',
      rawKeystore,
      keystorePassword: 'keystore-pass',
      vaultPassword: 'vault-pass',
      journeyId,
    })
    manager.completeJourney(journeyId, { status: 'success' })

    const journey = manager.getState().journeys.find((item) => item.id === journeyId)
    expect(journey?.status).toBe('success')
    expect(manager.getState().activeSessionId).toBe('imported-journey-keystore')
  })

  it('marks journeys as submitted without hash when confirmation cannot continue', async () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
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

  it('downgrades confirmation probe failures to unconfirmed instead of erroring the journey', async () => {
    localSignerMocks.queryLocalTxStatus.mockRejectedValue(new Error('Temporary provider outage'))
    const keystore = createFakeKeystoreRecord({
      id: 'probe-failure-keystore',
      label: 'Probe Failure Keystore',
      addresses: { [Chain.THORChain]: 'thor1address' },
    })
    const { manager } = await createInitializedTestManager({
      extensionWindow: createFakeExtensionWindow(),
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

    const journeyId = manager.createJourney({
      kind: 'liquidity',
      title: 'RUNE deposit',
      sessionId: keystore.id,
      source: 'keystore',
      chain: Chain.THORChain,
      steps: createExecutionJourneySteps({
        source: 'keystore',
        finalLabel: 'Liquidity Update Complete',
      }),
    })

    const outcome = await waitForJourneyTransactionSettlement(manager, {
      chain: Chain.THORChain,
      journeyId,
      sessionId: keystore.id,
      stepKey: 'confirming',
      txHash: 'thor-hash',
    })

    const journey = manager.getState().journeys.find((item) => item.id === journeyId)
    expect(outcome).toBe('unconfirmed')
    expect(journey?.status).toBe('unconfirmed')
    expect(journey?.steps.find((step) => step.key === 'confirming')).toMatchObject({
      status: 'unconfirmed',
      txHash: 'thor-hash',
    })
    expect(journey?.steps.find((step) => step.key === 'confirming')?.message).toContain(
      'automatic confirmation tracking failed',
    )
  })

  it('treats confirmed height-based status payloads as successful confirmations', async () => {
    localSignerMocks.queryLocalTxStatus.mockResolvedValue({
      height: '12345678',
      txHash: 'thor-hash',
    })
    const keystore = createFakeKeystoreRecord({
      id: 'height-success-keystore',
      label: 'Height Success Keystore',
      addresses: { [Chain.THORChain]: 'thor1address' },
    })
    const { manager } = await createInitializedTestManager({
      extensionWindow: createFakeExtensionWindow(),
      keystores: [keystore],
    })
    await initializeKeystoreSession(manager, keystore)

    const journeyId = manager.createJourney({
      kind: 'liquidity',
      title: 'RUNE deposit success',
      sessionId: keystore.id,
      source: 'keystore',
      chain: Chain.THORChain,
      steps: createExecutionJourneySteps({
        source: 'keystore',
        finalLabel: 'Liquidity Update Complete',
      }),
    })

    const outcome = await waitForJourneyTransactionSettlement(manager, {
      chain: Chain.THORChain,
      journeyId,
      sessionId: keystore.id,
      stepKey: 'confirming',
      txHash: 'thor-hash',
    })

    const journey = manager.getState().journeys.find((item) => item.id === journeyId)
    expect(outcome).toBe('success')
    expect(journey?.steps.find((step) => step.key === 'confirming')).toMatchObject({
      status: 'success',
      txHash: 'thor-hash',
      message: 'Confirmed on-chain.',
    })
  })

  it('bumps the balance refresh tick when a balance-relevant journey completes', () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
    })

    const journeyId = manager.createJourney({
      kind: 'swap',
      title: 'Swap CACAO to ETH',
      source: 'keystore',
      chain: Chain.MayaChain,
      steps: createExecutionJourneySteps({
        source: 'keystore',
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
      const manager = createTestManager({
        extensionWindow: createFakeExtensionWindow(),
      })

      vi.mocked(trackAnalyticsEvent).mockClear()

      await trackTransactionJourney(manager, {
        kind: 'swap',
        title: 'Track swap analytics',
        source: 'keystore',
        chain: Chain.Ethereum,
        routePath: '/swap',
        analytics: {
          action: 'submit',
          route: '/swap',
          subject: 'swap',
          has_referral: true,
          affiliate_mayaname: 'm0',
        },
        steps: createExecutionJourneySteps({
          source: 'keystore',
          finalLabel: 'Swap Complete',
        }),
        run: async (journey) => {
          journey.setPrimaryTxHash('0xsecret')
          journey.complete({ txHash: '0xsecret', mayaname: 'friend' }, status)
          return { txHash: '0xsecret', mayaname: 'friend' }
        },
      })

      const startedCall = vi.mocked(trackAnalyticsEvent).mock.calls[0]?.[0]
      const finishedCall = vi.mocked(trackAnalyticsEvent).mock.calls[1]?.[0]

      expect(startedCall?.type).toBe('journey_started')
      expect(finishedCall?.type).toBe('journey_finished')
      expect(startedCall?.journey_id).toEqual(finishedCall?.journey_id)
      expect(startedCall).toMatchObject({
        action: 'submit',
        route: '/swap',
        subject: 'swap',
        source: 'keystore',
        chain: Chain.Ethereum,
        has_referral: true,
        affiliate_mayaname: 'm0',
      })
      expect(finishedCall).toMatchObject({
        action: 'submit',
        route: '/swap',
        status,
        subject: 'swap',
        source: 'keystore',
        chain: Chain.Ethereum,
        has_referral: true,
        affiliate_mayaname: 'm0',
        tx_hash: '0xsecret',
      })
      expect(typeof finishedCall?.duration_ms).toBe('number')
      expect(JSON.stringify(vi.mocked(trackAnalyticsEvent).mock.calls)).not.toContain('friend')
    }
  })

  it('maps aborted journeys to cancelled analytics outcomes', async () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
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

    const cancelledCall = vi.mocked(trackAnalyticsEvent).mock.calls.at(-1)?.[0]
    expect(cancelledCall).toMatchObject({
      type: 'journey_finished',
      action: 'send',
      route: '/chains/:chainKey',
      status: 'cancelled',
      subject: 'asset_send',
      source: 'extension',
      chain: Chain.Ethereum,
    })
    expect(cancelledCall).not.toHaveProperty('tx_hash')
  })

  it('does not include tx_hash on finished asset_send journeys even when a hash is set', async () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
    })

    await trackTransactionJourney(manager, {
      kind: 'send',
      title: 'Tracked send',
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
      run: async (journey) => {
        journey.setPrimaryTxHash('0xsecret')
        journey.complete(undefined, 'success')
      },
    })

    const finishedCall = vi.mocked(trackAnalyticsEvent).mock.calls.at(-1)?.[0]
    expect(finishedCall).toMatchObject({
      type: 'journey_finished',
      subject: 'asset_send',
    })
    expect(finishedCall).not.toHaveProperty('tx_hash')
  })

  it('hydrates swap journeys from tracker snapshots and final updates', async () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
    })

    const journeyId = manager.createJourney({
      kind: 'swap',
      title: 'Tracker swap',
      source: 'keystore',
      chain: Chain.MayaChain,
      steps: createExecutionJourneySteps({
        source: 'keystore',
        finalLabel: 'Swap Complete',
      }),
    })

    const ws = new FakeWebSocket()
    const trackingPromise = trackSwapJourneyWithCacaotracker(manager, {
      journeyId,
      txHash: 'F0C9',
      createSession: async () => ({
        wsUrl: 'wss://tracker.test/session',
        expiresAt: '2026-04-25T12:00:00.000Z',
        heartbeatSeconds: 30,
      }),
      webSocketFactory: () => ws,
      timeoutMs: 5_000,
    })

    await Promise.resolve()
    ws.emit('open')
    expect(ws.sent).toEqual([
      JSON.stringify({ type: 'subscribe', txHashes: ['F0C9'] }),
    ])

    ws.emit('message', {
      data: JSON.stringify({
        type: 'subscribed',
        accepted: ['F0C9'],
        rejected: [],
      }),
    })
    ws.emit('message', {
      data: JSON.stringify({
        type: 'snapshot',
        state: {
          txHash: 'F0C9',
          updatedAt: '2026-04-25T12:54:24.278Z',
          observedAt: '2026-04-25T12:54:24.277Z',
          source: 'mayanode',
          status: 'streaming',
          stage: 'streaming',
          isFinal: false,
          swapType: 'streaming',
          summary: 'Streaming swap in progress: MAYA.CACAO -> MAYA.MAYA',
          affiliate: null,
          from: {
            asset: 'MAYA.CACAO',
            amount: '330000000000',
            amountBase: '330000000000',
            address: 'maya1from',
            display: {
              assetName: 'MAYA.CACAO',
              symbol: 'CACAO',
              icon: '/images/icons/cacao.svg',
              amount: {
                exact: '33',
                compact: '33',
                decimals: 10,
              },
            },
          },
          to: {
            asset: 'MAYA.MAYA',
            amountExpected: null,
            amountReceived: '5287',
            address: 'maya1to',
            outboundTxHashes: [],
            display: {
              assetName: 'MAYA.MAYA',
              symbol: 'MAYA',
              icon: '/images/icons/maya.svg',
              amountExpected: {
                exact: null,
                compact: null,
                decimals: 4,
              },
              amountReceived: {
                exact: '0.5287',
                compact: '0.5287',
                decimals: 4,
              },
            },
          },
          streaming: {
            interval: 3,
            quantity: 3,
            count: 2,
            progressPercent: 66.6,
            depositedAmount: '330000000000',
            swappedInAmount: '220000000000',
            swappedOutAmount: '5287',
            failedSwaps: [],
            failedReasons: [],
            lastHeight: 16276797,
          },
          chain: {
            height: 16276799,
            inboundSeen: true,
            lastEventType: 'streaming_swap',
          },
          rawRefs: {
            streamingSwapHash: 'F0C9',
          },
        },
      }),
    })

    expect(
      manager.getState().journeys.find((journey) => journey.id === journeyId)?.swapTracking,
    ).toMatchObject({
      trackingSource: 'cacaotracker-ws',
      transportStatus: 'live',
      trackerState: expect.objectContaining({
        status: 'streaming',
        summary: 'Streaming swap in progress: MAYA.CACAO -> MAYA.MAYA',
      }),
    })

    ws.emit('message', {
      data: JSON.stringify({
        type: 'tx_update',
        state: {
          txHash: 'F0C9',
          updatedAt: '2026-04-25T12:54:32.057Z',
          observedAt: '2026-04-25T12:54:24.277Z',
          source: 'mixed',
          status: 'completed',
          stage: 'final',
          isFinal: true,
          swapType: 'streaming',
          summary: 'Swap completed: MAYA.CACAO -> MAYA.MAYA',
          affiliate: null,
          from: {
            asset: 'MAYA.CACAO',
            amount: '330000000000',
            amountBase: '330000000000',
            address: 'maya1from',
            display: {
              assetName: 'MAYA.CACAO',
              symbol: 'CACAO',
              icon: '/images/icons/cacao.svg',
              amount: {
                exact: '33',
                compact: '33',
                decimals: 10,
              },
            },
          },
          to: {
            asset: 'MAYA.MAYA',
            amountExpected: null,
            amountReceived: '5287',
            address: 'maya1to',
            outboundTxHashes: [],
            display: {
              assetName: 'MAYA.MAYA',
              symbol: 'MAYA',
              icon: '/images/icons/maya.svg',
              amountExpected: {
                exact: null,
                compact: null,
                decimals: 4,
              },
              amountReceived: {
                exact: '0.5287',
                compact: '0.5287',
                decimals: 4,
              },
            },
          },
          streaming: null,
          chain: {
            height: 16276800,
            inboundSeen: true,
            lastEventType: 'streaming_swap',
          },
          rawRefs: {
            streamingSwapHash: 'F0C9',
          },
        },
        changedFields: ['status', 'stage', 'isFinal'],
      }),
    })

    await expect(trackingPromise).resolves.toMatchObject({
      outcome: 'final',
      trackerState: expect.objectContaining({
        status: 'completed',
        isFinal: true,
      }),
    })
    expect(
      manager.getState().journeys.find((journey) => journey.id === journeyId)?.swapTracking,
    ).toMatchObject({
      transportStatus: 'closed',
      trackerState: expect.objectContaining({
        status: 'completed',
      }),
    })
  })

  it('falls back when the tracker rejects the tx hash subscription', async () => {
    const manager = createTestManager({
      extensionWindow: createFakeExtensionWindow(),
    })

    const journeyId = manager.createJourney({
      kind: 'swap',
      title: 'Rejected tracker swap',
      source: 'keystore',
      chain: Chain.MayaChain,
      steps: createExecutionJourneySteps({
        source: 'keystore',
        finalLabel: 'Swap Complete',
      }),
    })

    const ws = new FakeWebSocket()
    const trackingPromise = trackSwapJourneyWithCacaotracker(manager, {
      journeyId,
      txHash: 'BADHASH',
      createSession: async () => ({
        wsUrl: 'wss://tracker.test/session',
        expiresAt: '2026-04-25T12:00:00.000Z',
        heartbeatSeconds: 30,
      }),
      webSocketFactory: () => ws,
      timeoutMs: 5_000,
    })

    await Promise.resolve()
    ws.emit('open')
    ws.emit('message', {
      data: JSON.stringify({
        type: 'subscribed',
        accepted: [],
        rejected: ['BADHASH'],
      }),
    })

    await expect(trackingPromise).resolves.toEqual({
      outcome: 'fallback',
    })
    expect(
      manager.getState().journeys.find((journey) => journey.id === journeyId)?.swapTracking,
    ).toMatchObject({
      trackingSource: 'fallback',
      transportStatus: 'fallback',
      rejectedTxHashes: ['BADHASH'],
    })
  })

  it('maps tracker refund-like states to unconfirmed journey outcomes', () => {
    expect(
      resolveJourneyStatusFromTrackerState({
        txHash: 'tx-refund',
        updatedAt: '2026-04-25T12:54:32.057Z',
        observedAt: '2026-04-25T12:54:24.277Z',
        source: 'mixed',
        status: 'refunded',
        stage: 'final',
        isFinal: true,
        swapType: 'streaming',
        summary: 'Swap refunded',
        affiliate: null,
        from: {
          asset: 'MAYA.CACAO',
          amount: '1',
          amountBase: '1',
          address: 'maya1from',
          display: {
            assetName: 'MAYA.CACAO',
            symbol: 'CACAO',
            icon: null,
            amount: {
              exact: '0.0000000001',
              compact: '0.0000000001',
              decimals: 10,
            },
          },
        },
        to: {
          asset: 'MAYA.MAYA',
          amountExpected: null,
          amountReceived: null,
          address: 'maya1to',
          outboundTxHashes: [],
          display: {
            assetName: 'MAYA.MAYA',
            symbol: 'MAYA',
            icon: null,
            amountExpected: {
              exact: null,
              compact: null,
              decimals: 4,
            },
            amountReceived: {
              exact: null,
              compact: null,
              decimals: 4,
            },
          },
        },
        streaming: null,
        chain: {
          height: 1,
          inboundSeen: true,
          lastEventType: 'refund',
        },
        rawRefs: null,
      }),
    ).toBe('unconfirmed')
  })
})
