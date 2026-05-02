import { describe, expect, it } from 'vitest'
import {
  buildCacaoPoolWithdrawMemo,
  buildTrendPath,
  getCacaoPoolWithdrawMaturityState,
  getCacaoPoolWithdrawPreviewBaseUnits,
  getLatestCacaoPoolDepositHeight,
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
        activeTab: 'deposit',
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
        activeTab: 'deposit',
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
        activeTab: 'deposit',
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
        activeTab: 'deposit',
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

  it('gates withdraw actions independently from deposit inputs', () => {
    expect(
      getCacaoPoolPrimaryAction({
        activeTab: 'withdraw',
        hasSession: true,
        hasMayaAddress: true,
        hasPosition: false,
        amountBaseUnits: '1',
        balanceBaseUnits: '500',
        isSubmitting: false,
        withdrawBasisPoints: 2500,
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'No Active Position',
        disabled: true,
      }),
    )

    expect(
      getCacaoPoolPrimaryAction({
        activeTab: 'withdraw',
        hasSession: true,
        hasMayaAddress: true,
        hasPosition: true,
        amountBaseUnits: null,
        balanceBaseUnits: '500',
        isSubmitting: false,
        withdrawBasisPoints: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'Set Withdrawal Share',
        disabled: true,
      }),
    )

    expect(
      getCacaoPoolPrimaryAction({
        activeTab: 'withdraw',
        hasSession: true,
        hasMayaAddress: true,
        hasPosition: true,
        amountBaseUnits: '1',
        balanceBaseUnits: '0',
        isSubmitting: false,
        withdrawBasisPoints: 2500,
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'Insufficient CACAO',
        disabled: true,
      }),
    )

    expect(
      getCacaoPoolPrimaryAction({
        activeTab: 'withdraw',
        hasSession: true,
        hasMayaAddress: true,
        hasPosition: true,
        amountBaseUnits: '1',
        balanceBaseUnits: '500',
        isSubmitting: false,
        withdrawBasisPoints: 2500,
        withdrawMaturityNote: '123 more blocks are required.',
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'Position Maturing',
        disabled: true,
      }),
    )

    expect(
      getCacaoPoolPrimaryAction({
        activeTab: 'withdraw',
        hasSession: true,
        hasMayaAddress: true,
        hasPosition: true,
        amountBaseUnits: '1',
        balanceBaseUnits: '500',
        isSubmitting: false,
        withdrawBasisPoints: 2500,
      }),
    ).toEqual(
      expect.objectContaining({
        label: 'Send MsgWithdraw',
        disabled: false,
      }),
    )
  })

  it('formats withdraw memos and preview amounts from basis points', () => {
    expect(buildCacaoPoolWithdrawMemo(2500)).toBe('POOL-:2500')
    expect(
      getCacaoPoolWithdrawPreviewBaseUnits({
        analyticsCurrentValueCacao: 12.5,
        fallbackBaseUnits: '100000000000',
        withdrawBasisPoints: 2500,
      }),
    ).toBe('31250000000')
    expect(
      getCacaoPoolWithdrawPreviewBaseUnits({
        analyticsCurrentValueCacao: null,
        fallbackBaseUnits: '80000000000',
        withdrawBasisPoints: 5000,
      }),
    ).toBe('40000000000')
  })

  it('derives deposit heights and maturity blocks for withdraws', () => {
    expect(
      getLatestCacaoPoolDepositHeight({
        position: null,
        history: [],
        fetchedAt: 'now',
        activity: [
          {
            id: 'a',
            type: 'deposit',
            timestamp: 1,
            height: '100',
            status: 'success',
            memo: 'POOL+',
            txHash: 'tx1',
            inboundAmount: '1',
            outboundAmount: null,
            units: '1',
            basisPoints: null,
          },
          {
            id: 'b',
            type: 'deposit',
            timestamp: 2,
            height: '250',
            status: 'success',
            memo: 'POOL+',
            txHash: 'tx2',
            inboundAmount: '1',
            outboundAmount: null,
            units: '1',
            basisPoints: null,
          },
        ],
      }),
    ).toBe(250)

    expect(
      getCacaoPoolWithdrawMaturityState({
        currentBlockHeight: 302_651,
        hasPosition: true,
        latestDepositHeight: 250,
        requiredBlocks: 302_400,
      }),
    ).toEqual(
      expect.objectContaining({
        ready: true,
        remainingBlocks: 0,
      }),
    )

    expect(
      getCacaoPoolWithdrawMaturityState({
        currentBlockHeight: 302_649,
        hasPosition: true,
        latestDepositHeight: 250,
        requiredBlocks: 302_400,
      }),
    ).toEqual(
      expect.objectContaining({
        ready: false,
        remainingBlocks: 2,
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
