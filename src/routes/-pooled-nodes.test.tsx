/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Chain } from '@vultisig/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PooledNode } from '#/lib/pooled-nodes'
import type { PooledNodesDetailResponse } from '#/lib/cacaotracker-types'
import { ImpersonationProvider } from '#/provider/ImpersonationProvider'
import { SettingsProvider } from '#/provider/SettingsProvider'
import { MayaWalletManager, MayaWalletProvider, type PooledNodeActionResult } from '#/wallet'
import { createFakeSdkClient, createFakeVault, createMemoryStorage } from '#/wallet/test-utils'
import { PooledNodesPage } from './pooled-nodes'

vi.mock('#/generated/hypertune.react', () => ({
  useHypertune: () => ({
    beta: () => true,
  }),
}))

afterEach(() => {
  cleanup()
})

function makeNode(overrides: Partial<PooledNode> = {}): PooledNode {
  return {
    activeBlockHeight: 10,
    bond: '25000000000',
    bondAddress: 'maya1operator',
    forcedToLeave: false,
    isOperator: true,
    isProvider: true,
    leaveHeight: 0,
    nodeAddress: 'maya1node',
    operatorFeeBps: '2500',
    preflightCode: 0,
    preflightReason: 'OK',
    preflightStatus: 'Ready',
    providerCount: 2,
    providers: [
      {
        bondAddress: 'maya1operator',
        bonded: true,
        isConnectedProvider: true,
        isOperator: true,
        pools: {},
        reward: '0',
      },
      {
        bondAddress: 'maya1provider',
        bonded: true,
        isConnectedProvider: false,
        isOperator: false,
        pools: { 'BTC.BTC': '100' },
        reward: '0',
      },
    ],
    related: true,
    requestedToLeave: false,
    reward: '5000000000',
    slashPoints: 5,
    status: 'Active',
    statusSince: 1,
    version: '1.128.2',
    ...overrides,
  }
}

async function createManager(options?: { mayaAddress?: string; withVault?: boolean }) {
  const vault =
    options?.withVault === false
      ? undefined
      : createFakeVault({
          id: 'vault-pooled-route',
          name: 'Vault Route',
          chains: [Chain.MayaChain],
          addresses: async () => ({
            [Chain.MayaChain]: options?.mayaAddress ?? 'maya1operator',
          }),
        })

  const manager = new MayaWalletManager({
    sdk: createFakeSdkClient({
      vaults: vault ? [vault] : [],
      activeVaultId: vault?.id ?? null,
    }).sdk,
    prefsStorage: createMemoryStorage(),
  })

  await manager.initialize()
  if (vault) {
    await manager.selectSession(vault.id)
  }
  return manager
}

function renderPage(
  manager: MayaWalletManager,
  options?: {
    loadNodes?: (input: { connectedAddress: string; mayanodeUrl: string }) => Promise<PooledNode[]>
    loadAnalytics?: (address: string) => Promise<PooledNodesDetailResponse>
    submitAction?: typeof import('#/wallet').submitPooledNodeAction
  },
) {
  return render(
    <SettingsProvider>
      <MayaWalletProvider manager={manager}>
        <ImpersonationProvider>
          <PooledNodesPage
            loadNodes={options?.loadNodes}
            loadAnalytics={options?.loadAnalytics ?? (async () => ({ providerBond: null }))}
            onMissingSession={() => {}}
            submitAction={options?.submitAction}
          />
        </ImpersonationProvider>
      </MayaWalletProvider>
    </SettingsProvider>,
  )
}

describe('pooled nodes route', () => {
  it('renders the disconnected state when no wallet session exists', async () => {
    const manager = await createManager({ withVault: false })
    const loadNodes = vi.fn()
    renderPage(manager, { loadNodes })

    expect(await screen.findByText('Connect Vault')).toBeTruthy()
    expect(
      screen.getByText('Connect a vault session to review related pooled MAYANodes.'),
    ).toBeTruthy()
    expect(loadNodes).not.toHaveBeenCalled()
  })

  it('renders the empty related-node state', async () => {
    const manager = await createManager()
    renderPage(manager, { loadNodes: async () => [] })
    expect(await screen.findByText('No Related Pooled Nodes Found')).toBeTruthy()
  })

  it('shows operator controls when the connected user is an operator', async () => {
    const manager = await createManager()
    renderPage(manager, { loadNodes: async () => [makeNode()] })
    expect(await screen.findByText('Operator Controls')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Update Fee' })).toBeTruthy()
  })

  it('shows provider actions without operator controls for provider-only matches', async () => {
    const manager = await createManager({ mayaAddress: 'maya1provider' })
    renderPage(manager, {
      loadNodes: async () => [
        makeNode({
          isOperator: false,
          isProvider: true,
          providers: [
            {
              bondAddress: 'maya1operator',
              bonded: true,
              isConnectedProvider: false,
              isOperator: true,
              pools: {},
              reward: '0',
            },
            {
              bondAddress: 'maya1provider',
              bonded: true,
              isConnectedProvider: true,
              isOperator: false,
              pools: { 'BTC.BTC': '100' },
              reward: '0',
            },
          ],
        }),
      ],
    })

    expect(await screen.findByText('Provider Actions')).toBeTruthy()
    expect(screen.queryByText('Operator Controls')).toBeNull()
  })

  it('renders warnings without blocking a valid provider bond submission and completes a journey', async () => {
    const manager = await createManager()
    const submitAction = vi.fn(async (_manager, input) => ({
      action: input.action,
      memo: `BOND:${input.nodeAddress}`,
      rawResult: {},
      route: 'sdk',
      txAmountBaseUnits: input.amountBaseUnits,
      txHash: 'maya-route-hash',
    } satisfies PooledNodeActionResult))

    renderPage(manager, {
      loadNodes: async () => [
        makeNode({
          status: 'Whitelisted',
          preflightStatus: 'Whitelisted',
          preflightReason: 'Not ready',
          requestedToLeave: true,
        }),
      ],
      submitAction,
    })

    expect(
      await screen.findByText(/Protocol docs describe bond changes primarily/i),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Bond amount'), {
      target: { value: '10000000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Bond' }))

    await waitFor(() => expect(submitAction).toHaveBeenCalled())
    await waitFor(() =>
      expect(manager.getState().journeys[0]).toMatchObject({
        kind: 'pooled-node',
        status: 'success',
      }),
    )
  })
})
