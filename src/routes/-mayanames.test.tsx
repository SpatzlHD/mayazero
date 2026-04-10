import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ManagedMayaNameRecord } from '#/lib/mayaname'
import {
  MayaNamesPageContent,
  createDefaultRegisterDraft,
  getMayaNamesViewState,
  loadMayaNameWorkspace,
} from './mayanames'

function makeManagedRecord(): ManagedMayaNameRecord {
  return {
    name: 'alpha',
    owner: 'maya1owner',
    registrationBlock: '77',
    expireBlockHeight: '12345',
    preferredAsset: 'MAYA.CACAO',
    affiliateCollectorCacao: '1000000000',
    affiliateBps: '25',
    aliases: [{ chain: 'MAYA', address: 'maya1owner' }],
    mayaAliasAddress: 'maya1owner',
    subaffiliates: [{ name: 'suba', shareBps: '2000' }],
  }
}

function renderContent(overrides: Partial<Parameters<typeof MayaNamesPageContent>[0]> = {}) {
  return renderToString(
    <MayaNamesPageContent
      viewState="ready"
      activeSessionLabel="Vault"
      mayaAddress="maya1owner"
      ownedNames={['alpha', 'beta']}
      selectedName="alpha"
      managedRecord={makeManagedRecord()}
      workspaceError={null}
      pricingError={null}
      isWorkspaceLoading={false}
      isPricingLoading={false}
      isRefreshing={false}
      isSubmitting={false}
      submitError={null}
      registerDraft={createDefaultRegisterDraft('maya1owner')}
      aliasDraft={{ chain: '', address: '' }}
      profileDraft={{ preferredAsset: 'MAYA.CACAO', affiliateBps: '25', subaffiliates: [] }}
      renewDraft={{ years: '1' }}
      registerAmountBaseUnits="500000000000"
      renewAmountBaseUnits="10512000000"
      registerMemoPreview="~:alpha:MAYA:maya1owner:maya1owner"
      aliasMemoPreview="~:alpha:BTC:bc1alias::::::"
      profileMemoPreview="~:alpha::::MAYA.CACAO::25::"
      renewMemoPreview="~:alpha:MAYA:maya1owner"
      preferredAssets={['MAYA.CACAO', 'ETH.USDC-0X123']}
      referralHref="https://mayazero.app/swap?ref=alpha"
      onConnectWallet={() => {}}
      onConnectMayaChain={() => {}}
      onRefresh={() => {}}
      onSelectName={() => {}}
      onRegisterDraftChange={() => {}}
      onRegisterSubaffiliateChange={() => {}}
      onAddRegisterSubaffiliate={() => {}}
      onRemoveRegisterSubaffiliate={() => {}}
      onAliasDraftChange={() => {}}
      onProfileDraftChange={() => {}}
      onProfileSubaffiliateChange={() => {}}
      onAddProfileSubaffiliate={() => {}}
      onRemoveProfileSubaffiliate={() => {}}
      onRenewDraftChange={() => {}}
      onRegisterSubmit={() => {}}
      onAliasSubmit={() => {}}
      onProfileSubmit={() => {}}
      onRenewSubmit={() => {}}
      onCopyReferralLink={() => {}}
      {...overrides}
    />,
  )
}

describe('mayanames route helpers', () => {
  it('distinguishes disconnected, connect-maya, empty, and ready states', () => {
    expect(
      getMayaNamesViewState({
        hasSession: false,
        hasMayaAddress: false,
        isWorkspaceLoading: false,
        ownedCount: 0,
      }),
    ).toBe('disconnected')

    expect(
      getMayaNamesViewState({
        hasSession: true,
        hasMayaAddress: false,
        isWorkspaceLoading: false,
        ownedCount: 0,
      }),
    ).toBe('connect-maya')

    expect(
      getMayaNamesViewState({
        hasSession: true,
        hasMayaAddress: true,
        isWorkspaceLoading: false,
        ownedCount: 0,
      }),
    ).toBe('empty')

    expect(
      getMayaNamesViewState({
        hasSession: true,
        hasMayaAddress: true,
        isWorkspaceLoading: false,
        ownedCount: 1,
      }),
    ).toBe('ready')
  })

  it('creates register defaults with a MAYA alias and one-year term', () => {
    expect(createDefaultRegisterDraft('maya1owner')).toEqual(
      expect.objectContaining({
        owner: 'maya1owner',
        aliasChain: 'MAYA',
        aliasAddress: 'maya1owner',
        years: '1',
        affiliateBps: '0',
      }),
    )
  })

  it('reloads owned names and the preferred selection after successful actions', async () => {
    const loadOwnedNames = vi.fn(async () => ['beta', 'alpha'])
    const loadManagedName = vi.fn(async (name: string) => ({
      ...makeManagedRecord(),
      name,
    }))

    await expect(
      loadMayaNameWorkspace({
        ownerAddress: 'maya1owner',
        preferredSelection: 'alpha',
        loadOwnedNames,
        loadManagedName: loadManagedName as typeof import('#/lib/mayaname').fetchManagedMayaName,
        midgardUrl: 'https://midgard.test',
        mayanodeUrl: 'https://mayanode.test',
      }),
    ).resolves.toMatchObject({
      ownedNames: ['beta', 'alpha'],
      selectedName: 'alpha',
      managedRecord: expect.objectContaining({ name: 'alpha' }),
    })
  })
})

describe('mayanames page content', () => {
  it('renders wallet and address gates', () => {
    expect(renderContent({ viewState: 'disconnected' })).toContain('Connect a wallet session')
    expect(renderContent({ viewState: 'connect-maya' })).toContain('Sync a MayaChain address')
  })

  it('renders owned names, renewal preview, and referral hub note', () => {
    const html = renderContent()
    expect(html).toContain('alpha')
    expect(html).toContain('beta')
    expect(html).toContain('Renewal Cost')
    expect(html).toContain('https://mayazero.app/swap?ref=alpha')
    expect(html).toContain('does not update the app-wide swap referral stored in Settings')
  })

  it('renders the empty owned-name state and register form defaults', () => {
    const html = renderContent({
      viewState: 'empty',
      ownedNames: [],
      selectedName: '',
      managedRecord: null,
      registerDraft: createDefaultRegisterDraft('maya1owner'),
    })

    expect(html).toContain('Register your first MAYAName')
    expect(html).toContain('>MAYA<')
    expect(html).toContain('value="1"')
  })
})
