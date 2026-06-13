import { createFileRoute } from '@tanstack/react-router'
import { KeystoreSetupFlow } from '#/components/vault/KeystoreSetupFlow'
import { buildPageSeoHead } from '#/lib/seo'

export const Route = createFileRoute('/vault-setup')({
  head: () =>
    buildPageSeoHead({
      title: 'Import Wallet',
      description:
        'Import an xchain keystore or seedphrase as a local encrypted wallet for MayaZero.',
    }),
  component: VaultSetupPage,
})

function VaultSetupPage() {
  return (
    <main className="page-wrap px-4 py-12 md:py-20 min-h-screen flex flex-col justify-center">
      <KeystoreSetupFlow />
    </main>
  )
}
