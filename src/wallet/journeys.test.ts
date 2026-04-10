import { describe, expect, it } from 'vitest'
import { Chain } from '@vultisig/sdk'
import { MayaWalletManager } from './manager'
import {
  createExecutionJourneySteps,
  createSecureVaultJourneySteps,
  waitForJourneyTransactionSettlement,
} from './journeys'
import {
  createFakeExtensionWindow,
  createFakeSdkClient,
  createFakeVault,
  createMemoryStorage,
} from './test-utils'

describe('wallet journeys', () => {
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
})
