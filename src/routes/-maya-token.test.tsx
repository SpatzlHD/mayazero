/* @vitest-environment happy-dom */

import { cleanup, render, screen } from '@testing-library/react'
import { Chain } from '@vultisig/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import type { MayaTokenRewardsResponse } from '#/lib/cacaotracker-types'
import type { MayaTokenPoolSnapshot } from '#/lib/maya-token'
import { ImpersonationProvider } from '#/provider/ImpersonationProvider'
import { SettingsProvider } from '#/provider/SettingsProvider'
import {
  MayaWalletManager,
  MayaWalletProvider,
  type AddressBalanceResponse,
} from '#/wallet'
import {
  createFakeSdkClient,
  createFakeVault,
  createMemoryStorage,
} from '#/wallet/test-utils'
import {
  MayaTokenPage,
  formatRewardAmount,
  formatRewardDistributionDate,
  resolveMayaTokenBalance,
  sortMayaTokenRewards,
} from './maya-token'

afterEach(() => {
  cleanup()
})

async function createManager(options?: { mayaAddress?: string; withVault?: boolean }) {
  const vault =
    options?.withVault === false
      ? undefined
      : createFakeVault({
          id: 'vault-maya-token-route',
          name: 'Vault Route',
          chains: [Chain.MayaChain],
          addresses: async () => ({
            [Chain.MayaChain]: options?.mayaAddress ?? 'maya1vaultaddress',
          }),
        })

  const manager = new MayaWalletManager({
    sdk: createFakeSdkClient({
      activeVaultId: vault?.id ?? null,
      vaults: vault ? [vault] : [],
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
    loadBalances?: (input: {
      address: string
      assetHints?: Array<{ id: string; symbol?: string; name?: string; decimals?: number }>
      chain: Chain
      includeZeroBalances?: boolean
    }) => Promise<AddressBalanceResponse>
    loadPoolSnapshot?: (input: { midgardUrl: string }) => Promise<MayaTokenPoolSnapshot | null>
    loadRewards?: (address: string) => Promise<MayaTokenRewardsResponse>
  },
) {
  return render(
    <SettingsProvider>
      <MayaWalletProvider manager={manager}>
        <ImpersonationProvider>
          <MayaTokenPage
            loadBalances={options?.loadBalances}
            loadPoolSnapshot={options?.loadPoolSnapshot}
            loadRewards={options?.loadRewards}
            onMissingSession={() => {}}
          />
        </ImpersonationProvider>
      </MayaWalletProvider>
    </SettingsProvider>,
  )
}

function makeRewards(overrides: Partial<MayaTokenRewardsResponse> = {}): MayaTokenRewardsResponse {
  return {
    address: 'maya1vaultaddress',
    total_cacao: '300000000000',
    distribution_count: 2,
    rewards: [
      {
        amount: '100000000000',
        block_height: 100,
        block_time: '2026-04-17T00:00:00Z',
      },
      {
        amount: '200000000000',
        block_height: 101,
        block_time: '2026-04-18T00:00:00Z',
      },
    ],
    ...overrides,
  }
}

describe('maya token route', () => {
  it('renders the disconnected state when no wallet session exists', async () => {
    const manager = await createManager({ withVault: false })
    renderPage(manager)

    expect(await screen.findByText('Connect Vault')).toBeTruthy()
    expect(
      screen.getByText('Connect a vault session to inspect MAYA holdings and token rewards.'),
    ).toBeTruthy()
  })

  it('renders MAYA holdings and reward history for a connected wallet', async () => {
    const manager = await createManager()
    renderPage(manager, {
      loadBalances: async () => ({
        address: 'maya1vaultaddress',
        balances: [
          {
            amount: '1250000',
            chain: Chain.MayaChain,
            decimals: 4,
            formattedAmount: '125',
            id: 'maya',
            isNative: false,
            name: 'Maya',
            source: 'cosmos-bank',
            symbol: 'MAYA',
          },
        ],
        chain: Chain.MayaChain,
        fetchedAt: new Date().toISOString(),
      }),
      loadPoolSnapshot: async () => ({
        asset: 'MAYA.MAYA',
        priceInCacao: 2.5,
        priceInUsd: 1.25,
        status: 'available',
        volume24hCacao: 42,
      }),
      loadRewards: async () => makeRewards(),
    })

    expect(await screen.findByText('125')).toBeTruthy()
    expect(screen.getByText('$156.25')).toBeTruthy()
    expect(screen.getByText('312.5 CACAO')).toBeTruthy()
    expect(screen.getByText('30 CACAO')).toBeTruthy()
    expect(screen.getAllByText('Apr 18, 2026').length).toBeGreaterThanOrEqual(1)
  })

  it('shows zero holdings while still rendering token rewards', async () => {
    const manager = await createManager()
    renderPage(manager, {
      loadBalances: async () => ({
        address: 'maya1vaultaddress',
        balances: [],
        chain: Chain.MayaChain,
        fetchedAt: new Date().toISOString(),
      }),
      loadPoolSnapshot: async () => ({
        asset: 'MAYA.MAYA',
        priceInCacao: 1,
        priceInUsd: 1,
        status: 'available',
        volume24hCacao: 10,
      }),
      loadRewards: async () => makeRewards(),
    })

    expect(await screen.findByText('MAYA Position')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('$0.00')).toBeTruthy()
    expect(screen.getByText('0 CACAO')).toBeTruthy()
    expect(screen.getByText('30 CACAO')).toBeTruthy()
  })

  it('shows n/a valuations when the pool price is unavailable', async () => {
    const manager = await createManager()
    renderPage(manager, {
      loadBalances: async () => ({
        address: 'maya1vaultaddress',
        balances: [
          {
            amount: '50000',
            chain: Chain.MayaChain,
            decimals: 4,
            formattedAmount: '5',
            id: 'maya',
            isNative: false,
            name: 'Maya',
            source: 'cosmos-bank',
            symbol: 'MAYA',
          },
        ],
        chain: Chain.MayaChain,
        fetchedAt: new Date().toISOString(),
      }),
      loadPoolSnapshot: async () => null,
      loadRewards: async () => makeRewards({ distribution_count: 0, rewards: [], total_cacao: '0' }),
    })

    expect((await screen.findAllByText('n/a')).length).toBeGreaterThanOrEqual(4)
  })

  it('keeps helper formatting deterministic', () => {
    expect(resolveMayaTokenBalance(null)).toMatchObject({
      amount: '0',
      decimals: 4,
      formattedAmount: '0',
      symbol: 'MAYA',
    })
    expect(formatRewardAmount('25000000000')).toBe('2.5 CACAO')
    expect(formatRewardDistributionDate('2026-04-18T00:00:00Z')).toBe('Apr 18, 2026')
    expect(
      sortMayaTokenRewards([
        {
          amount: '1',
          block_height: 1,
          block_time: '2026-04-17T00:00:00Z',
        },
        {
          amount: '2',
          block_height: 2,
          block_time: '2026-04-18T00:00:00Z',
        },
      ])[0],
    ).toMatchObject({ block_height: 2 })
  })
})
