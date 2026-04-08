import { describe, expect, it } from 'vitest'
import { formatBaseUnits, getSwapPrimaryAction } from './swap'

describe('swap route helpers', () => {
  it('keeps prepare enabled only for Vultisig-preparable quotes', () => {
    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canPrepareSwap: true,
        hasPreparedSwap: false,
      }),
    ).toEqual({
      kind: 'prepare',
      label: 'Confirm Swap',
      disabled: false,
    })

    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canPrepareSwap: false,
        hasPreparedSwap: false,
      }),
    ).toEqual({
      kind: 'quote-only',
      label: 'Maya Quote Only',
      disabled: true,
    })
  })

  it('surfaces the prepared state and formats quote outputs for display', () => {
    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canPrepareSwap: true,
        hasPreparedSwap: true,
      }),
    ).toEqual({
      kind: 'prepare',
      label: 'Transaction Ready',
      disabled: false,
    })

    expect(formatBaseUnits('1234500000000000000', 18)).toBe('1.2345')
    expect(formatBaseUnits('450000000', 8)).toBe('4.5')
    expect(formatBaseUnits(undefined, 18)).toBe('')
  })
})
