import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { MayaWalletProvider } from "#/wallet";
import { PreferencesProvider } from "#/provider/PreferencesProvider";
import { SettingsProvider } from "#/provider/SettingsProvider";
import { ImpersonationProvider } from "#/provider/ImpersonationProvider";
import Footer from "#/components/Footer";
import Header from "#/components/Header";
import { ReferralCaptureBanner } from "#/components/ReferralCaptureBanner";
import { AppAnalytics } from "#/analytics";
import { buildRootSeoHead } from "#/lib/seo";
import { Toaster } from "sonner";
import { LegacyVaultMigrationBanner } from "#/components/LegacyVaultMigrationBanner";
import { TransactionJourneyHost } from "#/components/TransactionJourneyHost";
import { WalletConnectProvider } from "#/wallet/walletconnect-provider";
import { BetaDisclaimer } from "#/components/BetaDisclaimer";

import "../styles.css";
import AppHypertuneProvider from "#/provider/Hypertune";

export const Route = createRootRoute({
  head: () => buildRootSeoHead(),
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <PreferencesProvider>
        <SettingsProvider>
          <AppAnalytics />
          <MayaWalletProvider>
            <WalletConnectProvider>
              <ImpersonationProvider>
                <AppHypertuneProvider>
                  <div className="app-shell">
                    <Header />
                    <ReferralCaptureBanner />
                    <LegacyVaultMigrationBanner />
                    <Outlet />
                    <Footer />
                  </div>
                  <BetaDisclaimer />
                  <TransactionJourneyHost />
                  <Toaster
                    position="bottom-right"
                    toastOptions={{
                      className:
                        "glass-panel flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border",
                      style: {
                        background: "var(--surface-strong)",
                        borderColor: "var(--line)",
                        color: "var(--sea-ink)",
                        boxShadow:
                          "0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 0 var(--inset-glint) inset",
                        backdropFilter: "blur(32px)",
                        WebkitBackdropFilter: "blur(32px)",
                      },
                      classNames: {
                        error: "text-red-500",
                        success: "text-[var(--maya-teal)]",
                        warning: "text-[var(--cacao-neon)]",
                        info: "text-blue-500",
                      },
                    }}
                  />
                  <TanStackDevtools
                    config={{
                      position: "bottom-right",
                    }}
                    plugins={[
                      {
                        name: "TanStack Router",
                        render: <TanStackRouterDevtoolsPanel />,
                      },
                    ]}
                  />
                </AppHypertuneProvider>
              </ImpersonationProvider>
            </WalletConnectProvider>
          </MayaWalletProvider>
        </SettingsProvider>
      </PreferencesProvider>
    </>
  );
}
