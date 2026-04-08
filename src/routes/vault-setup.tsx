import { createFileRoute } from '@tanstack/react-router'
import { VaultSetupFlow } from '#/components/vault/VaultSetupFlow'

export const Route = createFileRoute('/vault-setup')({
  component: VaultSetupPage,
})

function VaultSetupPage() {
  return (
    <main className="page-wrap px-4 py-12 md:py-20 min-h-screen flex flex-col justify-center">
      <VaultSetupFlow />
    </main>
  )
}
