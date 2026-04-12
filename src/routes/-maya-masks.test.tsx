import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  MayaMasksPageContent,
  getMayaMasksViewState,
} from './maya-masks'

function renderContent(
  overrides: Partial<Parameters<typeof MayaMasksPageContent>[0]> = {},
) {
  return renderToString(
    <MayaMasksPageContent
      viewState="ready"
      sessionLabel="Vault"
      isViewOnly={false}
      ethAddress="0x000000000000000000000000000000000000dEaD"
      contractAddress="0xe00d8f3dCA2ac474F4D7F177570f77de0774e754"
      masks={[
        {
          tokenId: '1',
          name: 'Mask One',
          imageUrl: 'https://images.test/mask-1.png',
          description: 'Genesis mask',
        },
        {
          tokenId: '2',
          name: 'Mask Two',
          imageUrl: null,
          description: null,
        },
      ]}
      errorMessage={null}
      isRefreshing={false}
      onConnectWallet={() => {}}
      onRefresh={() => {}}
      {...overrides}
    />,
  )
}

describe('maya masks view state', () => {
  it('distinguishes disconnected, connect-eth, loading, empty, ready, and error', () => {
    expect(
      getMayaMasksViewState({
        hasSession: false,
        hasEthAddress: false,
        isLoading: false,
        errorMessage: null,
        maskCount: 0,
      }),
    ).toBe('disconnected')

    expect(
      getMayaMasksViewState({
        hasSession: true,
        hasEthAddress: false,
        isLoading: false,
        errorMessage: null,
        maskCount: 0,
      }),
    ).toBe('connect-eth')

    expect(
      getMayaMasksViewState({
        hasSession: true,
        hasEthAddress: true,
        isLoading: true,
        errorMessage: null,
        maskCount: 0,
      }),
    ).toBe('loading')

    expect(
      getMayaMasksViewState({
        hasSession: true,
        hasEthAddress: true,
        isLoading: false,
        errorMessage: null,
        maskCount: 0,
      }),
    ).toBe('empty')

    expect(
      getMayaMasksViewState({
        hasSession: true,
        hasEthAddress: true,
        isLoading: false,
        errorMessage: null,
        maskCount: 2,
      }),
    ).toBe('ready')

    expect(
      getMayaMasksViewState({
        hasSession: true,
        hasEthAddress: true,
        isLoading: false,
        errorMessage: 'boom',
        maskCount: 0,
      }),
    ).toBe('error')
  })
})

describe('maya masks page content', () => {
  it('renders the disconnected and connect-eth gates', () => {
    expect(renderContent({ viewState: 'disconnected' })).toContain(
      'Connect a wallet session',
    )
    expect(renderContent({ viewState: 'connect-eth' })).toContain(
      'Sync an Ethereum address',
    )
  })

  it('renders the loading and empty states', () => {
    expect(renderContent({ viewState: 'loading' })).toContain(
      'Loading Maya Masks',
    )

    const emptyHtml = renderContent({
      viewState: 'empty',
      masks: [],
    })
    expect(emptyHtml).toContain('No Maya Masks found')
    expect(emptyHtml).toContain('Masks Held')
  })

  it('renders ready state stats and NFT cards', () => {
    const html = renderContent()

    expect(html).toContain('0x000000000000000000000000000000000000dEaD')
    expect(html).toContain('Mask One')
    expect(html).toContain('Mask Two')
    expect(html).toContain('Token #')
    expect(html).toContain('Refresh Holdings')
  })

  it('renders the error state with a retryable message', () => {
    const html = renderContent({
      viewState: 'error',
      masks: [],
      errorMessage: 'Alchemy request failed with status 503.',
    })

    expect(html).toContain('Maya Masks could not be loaded')
    expect(html).toContain('Alchemy request failed with status 503.')
    expect(html).toContain('Refresh Holdings')
  })
})
