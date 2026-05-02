/* @vitest-environment happy-dom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const walletActions = {
  openJourneyDialog: vi.fn(),
  closeJourneyDialog: vi.fn(),
  dismissJourney: vi.fn(),
}

let walletState: any = {
  journeys: [],
  journeyDialog: {
    isOpen: true,
    activeJourneyId: 'journey-1',
  },
}

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('react-qr-code', () => ({
  default: () => <div>QR</div>,
}))

vi.mock('#/wallet', () => ({
  getJourneySourceLabel: () => 'SDK vault',
  getJourneyStatusTone: (status: string) =>
    status === 'success'
      ? 'success'
      : status === 'error'
        ? 'error'
        : status === 'attention' || status === 'unconfirmed'
          ? 'warning'
          : 'neutral',
  getStepTone: (status: string) =>
    status === 'success'
      ? 'success'
      : status === 'error'
        ? 'error'
        : status === 'active'
          ? 'active'
          : status === 'attention' || status === 'unconfirmed'
            ? 'warning'
            : 'idle',
  useMayaWalletActions: () => walletActions,
  useMayaWalletState: () => walletState,
}))

import { TransactionJourneyHost } from './TransactionJourneyHost'

describe('TransactionJourneyHost', () => {
  beforeEach(() => {
    walletActions.openJourneyDialog.mockClear()
    walletActions.closeJourneyDialog.mockClear()
    walletActions.dismissJourney.mockClear()
    walletState = {
      journeys: [
        {
          id: 'journey-1',
          kind: 'swap',
          title: 'Swap CACAO to MAYA',
          source: 'sdk',
          chain: 'MayaChain',
          status: 'pending',
          updatedAt: 1,
          requiresAttention: false,
          openOnUpdate: false,
          steps: [
            {
              key: 'preparing',
              label: 'Preparing',
              status: 'success',
              message: 'Quote locked and execution started.',
            },
            {
              key: 'confirming',
              label: 'Confirming On-Chain',
              status: 'success',
              message: 'Confirmed on-chain.',
            },
            {
              key: 'complete',
              label: 'Swap Complete',
              status: 'active',
              message: 'Inbound transaction confirmed. Connecting live protocol tracker.',
            },
          ],
          primaryTxHash: '0xswap',
          swapTracking: {
            trackingSource: 'cacaotracker-ws',
            transportStatus: 'live',
            historyHref: '/',
            context: {
              fromAsset: 'MAYA.CACAO',
              fromTicker: 'CACAO',
              toAsset: 'MAYA.MAYA',
              toTicker: 'MAYA',
              amount: '33',
              executionMode: 'deposit',
              memo: '=:MAYA.MAYA:maya1to',
              inboundAddress: 'maya1inbound',
              router: 'maya1router',
            },
            trackerState: {
              txHash: '0xswap',
              updatedAt: '2026-04-25T12:54:24.278Z',
              observedAt: '2026-04-25T12:54:24.277Z',
              source: 'mixed',
              status: 'streaming',
              stage: 'streaming',
              isFinal: false,
              swapType: 'streaming',
              summary: 'Streaming swap in progress: MAYA.CACAO -> MAYA.MAYA',
              affiliate: {
                raw: 'm0',
                interface: {
                  name: 'MayaZero',
                  code: 'm0',
                  icon: null,
                },
              },
              from: {
                asset: 'MAYA.CACAO',
                amount: '330000000000',
                amountBase: '330000000000',
                address: 'maya1from',
                display: {
                  assetName: 'MAYA.CACAO',
                  symbol: 'CACAO',
                  icon: '/images/icons/cacao.svg',
                  amount: {
                    exact: '33',
                    compact: '33',
                    decimals: 10,
                  },
                },
              },
              to: {
                asset: 'MAYA.MAYA',
                amountExpected: null,
                amountReceived: '5287',
                address: 'maya1to',
                outboundTxHashes: [],
                display: {
                  assetName: 'MAYA.MAYA',
                  symbol: 'MAYA',
                  icon: '/images/icons/maya.svg',
                  amountExpected: {
                    exact: null,
                    compact: null,
                    decimals: 4,
                  },
                  amountReceived: {
                    exact: '0.5287',
                    compact: '0.5287',
                    decimals: 4,
                  },
                },
              },
              streaming: {
                interval: 3,
                quantity: 3,
                count: 2,
                progressPercent: 66.666,
                depositedAmount: '330000000000',
                swappedInAmount: '220000000000',
                swappedOutAmount: '5287',
                failedSwaps: [],
                failedReasons: [],
                lastHeight: 16276797,
              },
              chain: {
                height: 16276799,
                inboundSeen: true,
                lastEventType: 'streaming_swap',
              },
              rawRefs: {
                streamingSwapHash: '0xswap',
              },
            },
          },
        },
      ],
      journeyDialog: {
        isOpen: true,
        activeJourneyId: 'journey-1',
      },
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('renders websocket-backed protocol summaries and streaming progress', () => {
    render(<TransactionJourneyHost />)

    expect(
      screen.getAllByText(
        'Streaming swap in progress: MAYA.CACAO -> MAYA.MAYA',
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Protocol Tracker')).toBeTruthy()
    expect(screen.getByText('Streaming Progress')).toBeTruthy()
    expect(
      screen.getByText((value) => value === '67%' || value === '66%'),
    ).toBeTruthy()
    expect(screen.getByText('MayaZero (m0)')).toBeTruthy()
    expect(screen.getAllByText('Live Updates').length).toBeGreaterThan(0)
    expect(screen.getByText('maya1inbound')).toBeTruthy()
    expect(screen.getByText('Open Portfolio')).toBeTruthy()
  })

  it('renders fallback tracker notes when live updates are unavailable', () => {
    walletState = {
      ...walletState,
      journeys: [
        {
          ...walletState.journeys[0],
          swapTracking: {
            ...walletState.journeys[0].swapTracking,
            trackingSource: 'fallback',
            transportStatus: 'fallback',
            fallbackReason:
              'Live tracker disconnected before a final protocol update arrived.',
          },
        },
      ],
    }

    render(<TransactionJourneyHost />)

    expect(screen.getAllByText('Fallback').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        'Live tracker disconnected before a final protocol update arrived.',
      ).length,
    ).toBeGreaterThan(0)
  })
})
