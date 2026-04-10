import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { MayaWalletProvider } from "#/wallet";
import { PreferencesProvider } from "#/provider/PreferencesProvider";
import { SettingsProvider } from "#/provider/SettingsProvider";
import Footer from "#/components/Footer";
import Header from "#/components/Header";
import { ReferralCaptureBanner } from "#/components/ReferralCaptureBanner";
import { Analytics } from "@vercel/analytics/react";
import { buildRootSeoHead } from "#/lib/seo";
import { Toaster } from "sonner";
import { GlobalPasswordDialog } from "#/components/GlobalPasswordDialog";
import { TransactionJourneyHost } from "#/components/TransactionJourneyHost";

import "../styles.css";

export const Route = createRootRoute({
  head: () => buildRootSeoHead(),
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <Analytics />
      <PreferencesProvider>
        <SettingsProvider>
          <MayaWalletProvider>
            <div className="app-shell">
              <Header />
              <ReferralCaptureBanner />
              <Outlet />
              <Footer />
            </div>
            <GlobalPasswordDialog />
            <TransactionJourneyHost />
            <Toaster 
              position="bottom-right"
              toastOptions={{
                className: "glass-panel flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border",
                style: {
                  background: "var(--surface-strong)",
                  borderColor: "var(--line)",
                  color: "var(--sea-ink)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 0 var(--inset-glint) inset",
                  backdropFilter: "blur(32px)",
                  WebkitBackdropFilter: "blur(32px)",
                },
                classNames: {
                  error: "text-red-500",
                  success: "text-[var(--maya-teal)]",
                  warning: "text-[var(--cacao-neon)]",
                  info: "text-blue-500",
                }
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
          </MayaWalletProvider>
        </SettingsProvider>
      </PreferencesProvider>
    </>
  );
}
