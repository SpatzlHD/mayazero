import { describe, expect, it } from 'vitest'
import { formatBaseUnits, getSwapPrimaryAction } from './swap'

describe('swap route helpers', () => {
  it('keeps prepare enabled only for Vultisig-preparable quotes', () => {
    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canSubmitSwap: true,
      }),
    ).toEqual({
      kind: 'submit',
      label: 'Submit Swap',
      disabled: false,
    })

    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canSubmitSwap: false,
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
        canSubmitSwap: true,
        isSubmitting: true,
        submitStatus: 'approving',
      }),
    ).toEqual({
      kind: 'submit',
      label: 'Approving Token',
      disabled: true,
    })

    expect(formatBaseUnits('1234500000000000000', 18)).toBe('1.2345')
    expect(formatBaseUnits('450000000', 8)).toBe('4.5')
    expect(formatBaseUnits(undefined, 18)).toBe('')
  })

  it('keeps impersonation in quote-only mode even with a prepared quote', () => {
    expect(
      getSwapPrimaryAction({
        hasActiveSession: true,
        hasQuote: true,
        canSubmitSwap: true,
        isViewOnly: true,
      }),
    ).toEqual({
      kind: 'quote-only',
      label: 'View Only',
      disabled: true,
    })
  })
})
