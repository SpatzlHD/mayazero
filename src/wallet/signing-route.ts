import type { WalletSession } from './types'

export type SigningRoute = 'extension' | 'keystore' | 'walletconnect'

export function resolveSigningRoute(
  session: Pick<WalletSession, 'source'>,
): SigningRoute {
  return session.source
}

export function canPrepareSignBroadcast(session: Pick<WalletSession, 'source'>): boolean {
  return session.source === 'keystore' || session.source === 'walletconnect'
}
