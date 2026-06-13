import { describe, expect, it } from 'vitest'
import { WalletChain } from './chain-types'
import {
  parseCaip10Account,
  resolveWalletConnectAddressesFromCaip10,
  walletChainToWalletConnectId,
  walletConnectChainToWalletChain,
} from './walletconnect-config'

describe('walletconnect-config', () => {
  it('parses eip155 CAIP-10 accounts', () => {
    expect(
      parseCaip10Account(
        'eip155:1:0x00000000000000000000000000000000000000e1',
      ),
    ).toEqual({
      namespace: 'eip155',
      chainId: 'eip155:1',
      address: '0x00000000000000000000000000000000000000e1',
      raw: 'eip155:1:0x00000000000000000000000000000000000000e1',
    })
  })

  it('parses cosmos CAIP-10 accounts', () => {
    expect(
      parseCaip10Account('cosmos:mayachain-mainnet-v1:maya1abc123'),
    ).toEqual({
      namespace: 'cosmos',
      chainId: 'cosmos:mayachain-mainnet-v1',
      address: 'maya1abc123',
      raw: 'cosmos:mayachain-mainnet-v1:maya1abc123',
    })
  })

  it('parses bip122 CAIP-10 accounts', () => {
    expect(
      parseCaip10Account(
        'bip122:000000000019d6689c085ae165831e93:bc1qtestaddress',
      ),
    ).toEqual({
      namespace: 'bip122',
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      address: 'bc1qtestaddress',
      raw: 'bip122:000000000019d6689c085ae165831e93:bc1qtestaddress',
    })
  })

  it('maps approved CAIP-10 accounts to wallet chains', () => {
    expect(
      resolveWalletConnectAddressesFromCaip10([
        'eip155:1:0xabc',
        'eip155:42161:0xabc',
        'cosmos:mayachain-mainnet-v1:maya1xyz',
        'cosmos:thorchain-1:thor1xyz',
        'bip122:000000000019d6689c085ae165831e93:bc1qxyz',
      ]),
    ).toEqual({
      [WalletChain.Ethereum]: '0xabc',
      [WalletChain.Arbitrum]: '0xabc',
      [WalletChain.MayaChain]: 'maya1xyz',
      [WalletChain.THORChain]: 'thor1xyz',
      [WalletChain.Bitcoin]: 'bc1qxyz',
    })
  })

  it('round-trips supported wallet chains to CAIP-2 ids', () => {
    for (const chain of [
      WalletChain.Ethereum,
      WalletChain.Arbitrum,
      WalletChain.MayaChain,
      WalletChain.THORChain,
      WalletChain.Bitcoin,
    ]) {
      const caip2 = walletChainToWalletConnectId(chain)
      expect(caip2).toBeTruthy()
      const namespace = caip2!.split(':')[0] as 'eip155' | 'cosmos' | 'bip122'
      expect(walletConnectChainToWalletChain(namespace, caip2!)).toBe(chain)
    }
  })
})
