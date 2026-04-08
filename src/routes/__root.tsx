import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { MayaWalletProvider } from '#/wallet'
import { PreferencesProvider } from '#/provider/PreferencesProvider'
import { SettingsProvider } from '#/provider/SettingsProvider'
import Footer from '#/components/Footer'
import Header from '#/components/Header'

import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <PreferencesProvider>
      <SettingsProvider>
        <MayaWalletProvider>
          <div className="app-shell">
            <Header />
            <Outlet />
            <Footer />
          </div>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'TanStack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        </MayaWalletProvider>
      </SettingsProvider>
    </PreferencesProvider>
  )
}
