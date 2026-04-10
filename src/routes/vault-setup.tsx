import { createFileRoute } from '@tanstack/react-router'
import { VaultSetupFlow } from '#/components/vault/VaultSetupFlow'
import { buildPageSeoHead } from '#/lib/seo'

export const Route = createFileRoute('/vault-setup')({
  head: () =>
    buildPageSeoHead({
      title: 'Vault Setup',
      description:
        'Connect or prepare a vault session for MayaZero portfolio, swap, and liquidity actions.',
    }),
  component: VaultSetupPage,
})

function VaultSetupPage() {
  return (
    <main className="page-wrap px-4 py-12 md:py-20 min-h-screen flex flex-col justify-center">
      <VaultSetupFlow />
    </main>
  )
}
