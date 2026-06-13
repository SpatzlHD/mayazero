import { createInitializedTestManager, resetWalletTestMocks } from './test-mocks'
import {
  createFakeExtensionWindow,
  createFakeKeystoreRecord,
} from './test-utils'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MayaWalletProvider, useActiveWalletSession, useMayaWalletState } from './react'

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
    resetWalletTestMocks()
    const keystore = createFakeKeystoreRecord({
      id: 'react-keystore',
      label: 'React Keystore',
    })
    const { manager } = await createInitializedTestManager({
      extensionWindow: createFakeExtensionWindow(),
      keystores: [keystore],
    })
    await manager.selectSession(keystore.id)

    const html = renderToString(
      <MayaWalletProvider manager={manager}>
        <Probe />
      </MayaWalletProvider>,
    )

    expect(html).toContain('>2<')
    expect(html).toContain('React Keystore')
  })
})
