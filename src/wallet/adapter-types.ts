import type {
  WalletCommandName,
  WalletCommandResult,
  WalletExecuteOptions,
  WalletOperation,
  WalletSession,
} from './types'

export type ManagerOperationController = {
  operation: WalletOperation
  update: (patch: Partial<WalletOperation>) => void
}

export type WalletSessionAdapter = {
  id: string
  source: WalletSession['source']
  kind: WalletSession['kind']
  label: string
  capabilities: WalletCommandName[]
  refreshSession: () => Promise<WalletSession | null>
  execute: <K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
    context: {
      activeChain: WalletSession['chains'][number] | null
      operation?: ManagerOperationController
    },
  ) => Promise<WalletCommandResult<K>>
  dispose?: () => void
}

export type { ExtensionProviderLike, ExtensionWindowLike } from './extension-adapter'
