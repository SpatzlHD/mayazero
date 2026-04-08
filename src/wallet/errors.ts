import type { SerializedWalletError, WalletCommandName } from './types'

export class WalletCapabilityError extends Error {
  readonly code = 'WALLET_CAPABILITY_UNSUPPORTED'

  constructor(
    readonly command: WalletCommandName,
    readonly sessionId: string,
    readonly reason?: string,
  ) {
    super(reason ? `${command} is not supported: ${reason}` : `${command} is not supported by session ${sessionId}`)
    this.name = 'WalletCapabilityError'
  }
}

export class WalletSessionNotFoundError extends Error {
  readonly code = 'WALLET_SESSION_NOT_FOUND'

  constructor(sessionId: string) {
    super(`Wallet session ${sessionId} was not found`)
    this.name = 'WalletSessionNotFoundError'
  }
}

export function serializeWalletError(error: unknown): SerializedWalletError {
  if (error instanceof Error) {
    const maybeCode = error as Error & { code?: string | number }
    return {
      name: error.name,
      message: error.message,
      code: maybeCode.code,
      stack: error.stack,
    }
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unknown wallet error',
  }
}
