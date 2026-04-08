import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MayaWalletManager } from './manager'
import { MayaWalletProvider, useActiveWalletSession, useMayaWalletState } from './react'
import {
  createFakeExtensionWindow,
  createFakeSdkClient,
  createFakeVault,
  createMemoryStorage,
} from './test-utils'

function Probe() {
  const state = useMayaWalletState()
  const activeSession = useActiveWalletSession()

  return (
    <div>
      <span data-testid="session-count">{state.sessions.length}</span>
      <span data-testid="active-session">{activeSession?.label ?? 'none'}</span>
    </div>
  )
}

describe('MayaWalletProvider', () => {
  it('exposes manager state through hooks in a React tree', async () => {
    const vault = createFakeVault({
      id: 'react-vault',
      name: 'React Vault',
    })
    const fakeSdk = createFakeSdkClient({
      vaults: [vault],
      activeVaultId: vault.id,
    })
    const manager = new MayaWalletManager({
      sdk: fakeSdk.sdk,
      extensionWindow: createFakeExtensionWindow(),
      prefsStorage: createMemoryStorage(),
    })
    await manager.initialize()

    const html = renderToString(
      <MayaWalletProvider manager={manager}>
        <Probe />
      </MayaWalletProvider>,
    )

    expect(html).toContain('>2<')
    expect(html).toContain('React Vault')
    expect(fakeSdk.getInitializeCount()).toBe(1)
  })
})
