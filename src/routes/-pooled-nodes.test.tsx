/* @vitest-environment happy-dom */

import { createInitializedTestManager, resetWalletTestMocks } from '#/wallet/test-mocks'
import { createEmptyExtensionWindow, createFakeKeystoreRecord } from '#/wallet/test-utils'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WalletChain as Chain } from '#/wallet/chain-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PooledNode } from '#/lib/pooled-nodes'
import type { WalletActivityResponse } from '#/lib/cacaotracker-types'
import { ImpersonationProvider } from '#/provider/ImpersonationProvider'
import { SettingsProvider } from '#/provider/SettingsProvider'
import { MayaWalletManager, MayaWalletProvider, type PooledNodeActionResult } from '#/wallet'
import { PooledNodesPage } from './pooled-nodes'

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
  resetWalletTestMocks()
  const keystore =
    options?.withVault === false
      ? undefined
      : createFakeKeystoreRecord({
          id: 'keystore-pooled-route',
          label: 'Keystore Route',
          addresses: {
            [Chain.MayaChain]: options?.mayaAddress ?? 'maya1operator',
          },
        })

  const { manager } = await createInitializedTestManager({
    extensionWindow: createEmptyExtensionWindow(),
    keystores: keystore ? [keystore] : [],
    unlockKeystores: Boolean(keystore),
  })

  if (keystore) {
    await manager.selectSession(keystore.id)
  }
  return manager
}

function renderPage(
  manager: MayaWalletManager,
  options?: {
    loadNodes?: (input: { connectedAddress: string; mayanodeUrl: string }) => Promise<PooledNode[]>
    loadAnalytics?: (address: string) => Promise<import('#/lib/cacaotracker-types').PooledNodesDetailResponse>
    loadBalances?: (input: {
      chain: Chain
      address: string
      includeZeroBalances?: boolean
    }) => Promise<import('#/wallet').AddressBalanceResponse>
    loadActivity?: (address: string) => Promise<WalletActivityResponse>
    loadLiquidityPositions?: (address: string) => Promise<import('#/lib/liquidity').LiquidityPosition[]>
    loadCacaoPoolPosition?: (address: string) => Promise<import('#/lib/cacao-pool').CacaoPoolPosition | null>
    submitAction?: typeof import('#/wallet').submitPooledNodeAction
    preferredNodeAddress?: string
    onNodeChange?: (nodeAddress: string) => void
  },
) {
  return render(
    <SettingsProvider>
      <MayaWalletProvider manager={manager}>
        <ImpersonationProvider>
          <PooledNodesPage
            loadNodes={options?.loadNodes}
            preferredNodeAddress={options?.preferredNodeAddress}
            onNodeChange={options?.onNodeChange}
            loadAnalytics={
              options?.loadAnalytics ??
              (async () => ({
                providerBond: {
                  totalBondedCacao: 123,
                  totalRewardCacao: 45,
                  nodeCount: 1,
                },
              }))
            }
            loadBalances={
              options?.loadBalances ??
              (async () => ({
                chain: Chain.MayaChain,
                address: 'maya1operator',
                balances: [
                  {
                    id: 'cacao',
                    symbol: 'CACAO',
                    amount: '50000000000',
                    formattedAmount: '5',
                    decimals: 10,
                    isNative: true,
                  },
                ],
              }))
            }
            loadActivity={options?.loadActivity ?? (async () => ({ actions: [], meta: { hasMore: false, nextPageToken: null } }))}
            loadLiquidityPositions={
              options?.loadLiquidityPositions ??
              (async () => [
                {
                  pool: 'BTC.BTC',
                  units: '10000000000',
                  assetAdded: '0',
                  assetDepositValue: '0',
                  assetRedeemValue: '0',
                  assetWithdrawn: '0',
                  cacaoAdded: '0',
                  cacaoDepositValue: '0',
                  cacaoRedeemValue: '0',
                  cacaoWithdrawn: '0',
                  firstAddedAt: null,
                  lastAddedAt: null,
                  matchingAddresses: ['maya1operator'],
                  pendingAsset: '0',
                  pendingCacao: '0',
                  state: 'active',
                  withdrawCounter: null,
                  assetAddress: null,
                  cacaoAddress: null,
                },
              ])
            }
            loadCacaoPoolPosition={options?.loadCacaoPoolPosition ?? (async () => null)}
            onMissingSession={() => {}}
            submitAction={options?.submitAction}
          />
        </ImpersonationProvider>
      </MayaWalletProvider>
    </SettingsProvider>,
  )
}

async function openActionsTab() {
  fireEvent.click(await screen.findByRole('button', { name: 'Actions' }))
}

async function openActivityTab() {
  fireEvent.click(await screen.findByRole('button', { name: 'Activity' }))
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

  it('shows page shell while nodes are loading', async () => {
    const manager = await createManager()
    renderPage(manager, {
      loadNodes: () =>
        new Promise((resolve) => {
          window.setTimeout(() => resolve([makeNode()]), 50)
        }),
    })

    expect(await screen.findByText('Pooled Nodes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh pooled nodes' })).toBeTruthy()
    expect(await screen.findByText('Bond Exposure')).toBeTruthy()
  })

  it('renders workspace tabs for loaded nodes', async () => {
    const manager = await createManager()
    renderPage(manager, { loadNodes: async () => [makeNode()] })

    expect(await screen.findByRole('button', { name: 'Overview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actions' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Activity' })).toBeTruthy()
  })

  it('shows operator controls when the connected user is an operator', async () => {
    const manager = await createManager()
    renderPage(manager, { loadNodes: async () => [makeNode()] })
    expect(await screen.findByText('Bond Exposure')).toBeTruthy()
    await openActionsTab()
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

    await openActionsTab()
    expect(await screen.findByText('Provider Actions')).toBeTruthy()
    expect(screen.queryByText('Operator Controls')).toBeNull()
  })

  it('switches provider bond and unbond tabs', async () => {
    const manager = await createManager()
    renderPage(manager, { loadNodes: async () => [makeNode()] })

    await openActionsTab()
    expect(await screen.findByLabelText('Units to bond')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unbond' }))
    expect(await screen.findByLabelText('Units to unbond')).toBeTruthy()
  })

  it('prefers the preferred node address when provided', async () => {
    const manager = await createManager()
    const onNodeChange = vi.fn()
    renderPage(manager, {
      loadNodes: async () => [
        makeNode({ nodeAddress: 'maya1node-a' }),
        makeNode({ nodeAddress: 'maya1node-b', status: 'Standby' }),
      ],
      preferredNodeAddress: 'maya1node-b',
      onNodeChange,
    })

    const select = (await screen.findByLabelText('Selected node')) as HTMLSelectElement
    expect(select.value).toBe('maya1node-b')
    expect(onNodeChange).not.toHaveBeenCalled()
  })

  it('renders warnings without blocking a valid provider bond submission and completes a journey', async () => {
    const manager = await createManager()
    const submitAction = vi.fn(async (_manager, input) => ({
      action: input.action,
      memo: `BOND:${input.nodeAddress}`,
      rawResult: {},
      route: 'keystore',
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

    await openActionsTab()
    fireEvent.change(screen.getByLabelText('Units to bond'), {
      target: { value: '10000000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Bond' }))

    await waitFor(() => expect(submitAction).toHaveBeenCalled())
    expect(submitAction.mock.calls[0]?.[1]).toMatchObject({
      action: 'provider.bond',
      amountBaseUnits: '10000000000',
      bondAsset: 'BTC.BTC',
      bondUnits: '10000000000',
    })
    await waitFor(() =>
      expect(manager.getState().journeys[0]).toMatchObject({
        kind: 'pooled-node',
        status: 'success',
      }),
    )
  })

  it('renders bond activity filtered to the selected node by default', async () => {
    const manager = await createManager()
    renderPage(manager, {
      loadNodes: async () => [makeNode()],
      loadActivity: async () => ({
        actions: [
          {
            txHash: 'bond-tx-selected',
            type: 'bond',
            status: 'success',
            date: Date.now(),
            height: 100,
            pools: ['BOND:maya1node'],
            inAsset: 'MAYA.CACAO',
            inAmount: 1.5,
            outAsset: null,
            outAmount: null,
            outAssets: null,
            inAmountUSD: 0,
            outAmountUSD: null,
            fees: {
              liquidityFee: 0,
              liquidityFeeUSD: 0,
              networkFees: [],
              affiliateFee: null,
              affiliateFeeUSD: null,
              totalFeeUSD: 0,
            },
            slippage: null,
            streamingSwap: null,
            liquidityUnits: null,
            impermanentLossProtection: null,
            withdrawBasisPoints: null,
            interface: null,
            mayaname: null,
            fromAddress: 'maya1operator',
            toAddress: 'maya1node',
          },
          {
            txHash: 'bond-tx-other',
            type: 'bond',
            status: 'success',
            date: Date.now(),
            height: 101,
            pools: ['BOND:maya1other'],
            inAsset: 'MAYA.CACAO',
            inAmount: 2,
            outAsset: null,
            outAmount: null,
            outAssets: null,
            inAmountUSD: 0,
            outAmountUSD: null,
            fees: {
              liquidityFee: 0,
              liquidityFeeUSD: 0,
              networkFees: [],
              affiliateFee: null,
              affiliateFeeUSD: null,
              totalFeeUSD: 0,
            },
            slippage: null,
            streamingSwap: null,
            liquidityUnits: null,
            impermanentLossProtection: null,
            withdrawBasisPoints: null,
            interface: null,
            mayaname: null,
            fromAddress: 'maya1operator',
            toAddress: 'maya1other',
          },
        ],
        meta: { hasMore: false, nextPageToken: null },
      }),
    })

    await openActivityTab()
    expect(await screen.findByText('Recent Bond Activity')).toBeTruthy()
    expect(screen.getByTitle('bond-tx-selected')).toBeTruthy()
    expect(screen.queryByTitle('bond-tx-other')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'All nodes' }))
    expect(await screen.findByTitle('bond-tx-other')).toBeTruthy()
  })
})
