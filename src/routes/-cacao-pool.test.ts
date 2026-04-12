import { describe, expect, it } from 'vitest'
import {
  buildTrendPath,
  getCacaoPoolPrimaryAction,
  getCacaoPoolViewState,
} from './cacao-pool'

describe('cacao pool route helpers', () => {
  it('distinguishes disconnected, empty, and populated position states', () => {
    expect(
      getCacaoPoolViewState({
        hasSession: false,
        hasMayaAddress: false,
        isLoading: false,
        hasError: false,
        hasPosition: false,
      }),
    ).toBe('disconnected')

    expect(
      getCacaoPoolViewState({
        hasSession: true,
        hasMayaAddress: true,
        isLoading: false,
        hasError: false,
        hasPosition: false,
      }),
    ).toBe('empty')

    expect(
      getCacaoPoolViewState({
        hasSession: true,
        hasMayaAddress: true,
        isLoading: false,
        hasError: false,
        hasPosition: true,
      }),
    ).toBe('position')
  })

  it('keeps deposit action gating deterministic', () => {
    expect(
      getCacaoPoolPrimaryAction({
        hasSession: false,
        hasMayaAddress: false,
        amountBaseUnits: null,
        balanceBaseUnits: null,
        isSubmitting: false,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: 'connect',
        label: 'Connect MayaChain',
      }),
    )

    expect(
      getCacaoPoolPrimaryAction({
        hasSession: true,
        hasMayaAddress: true,
        isViewOnly: true,
        amountBaseUnits: '100',
        balanceBaseUnits: '500',
        isSubmitting: false,
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'View Only',
        disabled: true,
      }),
    )

    expect(
      getCacaoPoolPrimaryAction({
        hasSession: true,
        hasMayaAddress: true,
        amountBaseUnits: '100',
        balanceBaseUnits: '50',
        isSubmitting: false,
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'Insufficient CACAO',
        disabled: true,
      }),
    )

    expect(
      getCacaoPoolPrimaryAction({
        hasSession: true,
        hasMayaAddress: true,
        amountBaseUnits: '100',
        balanceBaseUnits: '500',
        isSubmitting: false,
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'Send MsgDeposit',
        disabled: false,
      }),
    )
  })

  it('builds a stable chart path for one or many history points', () => {
    expect(
      buildTrendPath([
        {
          startTime: 1,
          endTime: 2,
          label: 'Apr 1',
          members: '1',
          units: '10000000000',
        },
      ]),
    ).toBe('M 0 20 L 100 20')

    expect(
      buildTrendPath([
        {
          startTime: 1,
          endTime: 2,
          label: 'Apr 1',
          members: '1',
          units: '10000000000',
        },
        {
          startTime: 2,
          endTime: 3,
          label: 'Apr 2',
          members: '2',
          units: '12000000000',
        },
      ]),
    ).toMatch(/^M 0\.00 \d+\.\d+ L 100\.00 \d+\.\d+$/)
  })
})
