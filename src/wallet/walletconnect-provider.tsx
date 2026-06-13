import { PropsWithChildren } from 'react'
import { WalletConnectModalHost } from '#/components/WalletConnectModalHost'

export function WalletConnectProvider({ children }: PropsWithChildren) {
  return (
    <>
      {children}
      <WalletConnectModalHost />
    </>
  )
}
