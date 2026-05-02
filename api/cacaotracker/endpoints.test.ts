import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as getCacaoPool } from './cacao-pool/[address]'
import { GET as getLiquidityPool } from './liquidity/[address]/pool/[pool]'
import { GET as getLiquiditySummary } from './liquidity/[address]/summary'
import { GET as getMayaTokenRewards } from './maya-token/[address]'
import { clearCacaotrackerResponseCache } from './_shared'
import { GET as getPooledNodes } from './pooled-nodes/[address]'
import { GET as getProtocolDashboard } from './protocol/dashboard'
import { POST as postTxTrackerSession } from './tx-tracker/session'
import { GET as getWalletActivity } from './wallet/[address]/activity'
import { GET as getWalletSummary } from './wallet/[address]/summary'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  })
}

afterEach(() => {
  clearCacaotrackerResponseCache()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('cacaotracker proxy endpoints', () => {
  it('returns wallet summary data from the aggregated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/rewards/maya1abc/sync-status')) {
          return jsonResponse({ address: 'maya1abc', synced: true })
        }
        return jsonResponse({
          overview: {
            total: { fees: 1, rewards: 2, total: 3 },
            last24h: { fees: 0, rewards: 1, total: 1 },
            last7d: { fees: 1, rewards: 2, total: 3 },
            last30d: { fees: 2, rewards: 3, total: 5 },
          },
          byPool: [],
          daily: [],
          forecasts: [],
        })
      }),
    )

    const response = await getWalletSummary(
      new Request('https://mayazero.app/api/cacaotracker/wallet/maya1abc/summary'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      rewards: {
        overview: {
          total: { total: 3 },
        },
      },
      syncStatus: {
        address: 'maya1abc',
        synced: true,
      },
    })
  })

  it('returns wallet activity data from the aggregated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          actions: [
            {
              txHash: 'tx1',
              type: 'swap',
              status: 'success',
              date: 1,
              height: 1,
              pools: ['BTC.BTC'],
              inAsset: 'BTC.BTC',
              inAmount: 1,
              outAsset: 'MAYA.CACAO',
              outAmount: 2,
              outAssets: null,
              inAmountUSD: 100,
              outAmountUSD: 120,
              fees: {
                liquidityFee: 1,
                liquidityFeeUSD: 1,
                networkFees: [],
                affiliateFee: null,
                affiliateFeeUSD: null,
                totalFeeUSD: 1,
              },
              slippage: 0.1,
              streamingSwap: null,
              liquidityUnits: null,
              impermanentLossProtection: null,
              withdrawBasisPoints: null,
              interface: null,
              mayaname: null,
              fromAddress: 'maya1from',
              toAddress: 'maya1to',
            },
          ],
          meta: {
            nextPageToken: null,
            hasMore: false,
          },
        }),
      ),
    )

    const response = await getWalletActivity(
      new Request('https://mayazero.app/api/cacaotracker/wallet/maya1abc/activity'),
    )

    await expect(response.json()).resolves.toMatchObject({
      actions: [expect.objectContaining({ txHash: 'tx1' })],
    })
  })

  it('mints websocket tracker sessions through the aggregated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      return jsonResponse({
        wsUrl: 'wss://ws.test/session-1',
        expiresAt: '2026-04-25T12:00:00.000Z',
        heartbeatSeconds: 30,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await postTxTrackerSession(
      new Request('https://mayazero.app/api/cacaotracker/tx-tracker/session', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      wsUrl: 'wss://ws.test/session-1',
      expiresAt: '2026-04-25T12:00:00.000Z',
      heartbeatSeconds: 30,
    })
  })

  it('surfaces upstream tracker session errors from the proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'Upstream denied session creation.' }, { status: 401 }),
      ),
    )

    const response = await postTxTrackerSession(
      new Request('https://mayazero.app/api/cacaotracker/tx-tracker/session', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Upstream denied session creation.',
    })
  })

  it('returns liquidity summary data from the aggregated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/by-pool')) {
          return jsonResponse([
            {
              pool: 'BTC.BTC',
              liquidity_fees_usd: 1,
              block_rewards_usd: 2,
              total_usd: 3,
              percentage: 100,
            },
          ])
        }
        return jsonResponse({
          total_hodl_value_usd: 100,
          total_current_value_usd: 95,
          total_il_amount_usd: 5,
          total_ilp_eligible_usd: 2,
          position_count: 1,
        })
      }),
    )

    const response = await getLiquiditySummary(
      new Request('https://mayazero.app/api/cacaotracker/liquidity/maya1abc/summary'),
    )

    await expect(response.json()).resolves.toMatchObject({
      ilSummary: {
        total_il_amount_usd: 5,
      },
      rewardsByPool: [expect.objectContaining({ pool: 'BTC.BTC' })],
    })
  })

  it('returns per-pool liquidity analytics from the aggregated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/metrics/history')) {
          return jsonResponse([
            {
              timestamp: '2026-04-18T00:00:00Z',
              pool: 'BTC.BTC',
              luvi: 1.1,
            },
          ])
        }
        if (url.includes('/pool-analytics/BTC.BTC/tvl')) {
          return jsonResponse([
            { timestamp: '2026-04-18T00:00:00Z', tvlUSD: 10_000 },
          ])
        }
        if (url.includes('/pool-analytics/BTC.BTC/volume')) {
          return jsonResponse([
            {
              timestamp: '2026-04-18T00:00:00Z',
              volume_usd: 500,
              swap_count: 3,
            },
          ])
        }
        if (url.includes('/pool-analytics/compare')) {
          return jsonResponse([
            {
              pool: 'BTC.BTC',
              luviStart: 1,
              luviEnd: 1.1,
              luviChangePercent: 10,
              volumeUSD: 500,
              feesUSD: 5,
              rank: 1,
            },
          ])
        }
        if (url.includes('/il/maya1abc/BTC.BTC/history')) {
          return jsonResponse({
            history: [{ timestamp: '2026-04-18T00:00:00Z', ilAmountUSD: 2 }],
          })
        }
        if (url.includes('/il/maya1abc/BTC.BTC')) {
          return jsonResponse({
            pool: 'BTC.BTC',
            impermanentLoss: {
              percentage: -1,
              amountUSD: 2,
              isLoss: true,
            },
            protection: {
              coveragePercent: 50,
              eligibleAmountUSD: 1,
              daysInPool: 20,
              daysToFullProtection: 80,
              assetOutperformsCacao: true,
              gracePeriodComplete: false,
            },
            breakdown: {
              hodlValueUSD: 100,
              currentValueUSD: 98,
              cacaoPrice: 1,
              assetPrice: 2,
              depositCacao: 10,
              depositAsset: 1,
              currentCacao: 9,
              currentAsset: 1.1,
            },
            position: {
              liquidityUnits: '100',
              poolShare: 0.01,
              dateFirstAdded: 1,
            },
          })
        }
        return jsonResponse({
          pool: 'BTC.BTC',
          luvi: 1.1,
          luviUSD: 2.2,
          luviChange24h: 1,
          luviChange7d: 2,
          luviChange30d: 3,
          tvlUSD: 10_000,
          volume24hUSD: 500,
          apr: 0.1,
          feesEarned24hUSD: 20,
          ilProtectionPaid24hUSD: 1,
          netEarnings24hUSD: 19,
        })
      }),
    )

    const response = await getLiquidityPool(
      new Request('https://mayazero.app/api/cacaotracker/liquidity/maya1abc/pool/BTC.BTC'),
    )

    await expect(response.json()).resolves.toMatchObject({
      analytics: { pool: 'BTC.BTC', luvi: 1.1 },
      metricsHistory: [expect.objectContaining({ pool: 'BTC.BTC' })],
      comparison: { rank: 1 },
      ilAnalysis: { pool: 'BTC.BTC' },
    })
  })

  it('returns cacao pool analytics from the aggregated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/cacao/apy/')) {
          return jsonResponse({
            apy_cacao: 12,
            apy_usd: 10,
            details: {
              net_pnl_cacao: 5,
              current_value_cacao: 105,
              current_value_usd: 210,
              price_used: 2,
              roi_absolute_usd: 4.5,
            },
          })
        }
        if (url.includes('/cacao/history/')) {
          return jsonResponse({
            history: [{ date: '2026-04-18', total_rewards_usd: 10 }],
            current: null,
          })
        }
        if (url.includes('/maya/token-rewards/')) {
          return jsonResponse({
            address: 'maya1abc',
            total_cacao: '250000000000',
            distribution_count: 1,
            rewards: [
              {
                amount: '250000000000',
                block_height: 123,
                block_time: '2026-04-18T00:00:00Z',
              },
            ],
          })
        }
        return jsonResponse({
          global: {
            total_members: 10,
          },
        })
      }),
    )

    const response = await getCacaoPool(
      new Request('https://mayazero.app/api/cacaotracker/cacao-pool/maya1abc'),
    )

    await expect(response.json()).resolves.toMatchObject({
      apy: { apy_cacao: 12 },
      history: [expect.objectContaining({ date: '2026-04-18' })],
      stats: { total_members: 10 },
      tokenRewards: {
        address: 'maya1abc',
        total_cacao: '250000000000',
        distribution_count: 1,
      },
    })
  })

  it('returns maya token rewards from the dedicated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          address: 'maya1abc',
          total_cacao: '300000000000',
          distribution_count: 2,
          rewards: [
            {
              amount: '100000000000',
              block_height: 100,
              block_time: '2026-04-17T00:00:00Z',
            },
            {
              amount: '200000000000',
              block_height: 101,
              block_time: '2026-04-18T00:00:00Z',
            },
          ],
        }),
      ),
    )

    const response = await getMayaTokenRewards(
      new Request('https://mayazero.app/api/cacaotracker/maya-token/maya1abc'),
    )

    await expect(response.json()).resolves.toEqual({
      address: 'maya1abc',
      total_cacao: '300000000000',
      distribution_count: 2,
      rewards: [
        {
          amount: '100000000000',
          block_height: 100,
          block_time: '2026-04-17T00:00:00Z',
        },
        {
          amount: '200000000000',
          block_height: 101,
          block_time: '2026-04-18T00:00:00Z',
        },
      ],
    })
  })

  it('propagates upstream maya token reward failures', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'upstream failure' }, { status: 502 }),
      ),
    )

    const response = await getMayaTokenRewards(
      new Request('https://mayazero.app/api/cacaotracker/maya-token/maya1abc'),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'upstream failure',
    })
  })

  it('returns pooled node provider bond data from the aggregated proxy', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ totalBondedCacao: 123, providerCount: 2 }),
      ),
    )

    const response = await getPooledNodes(
      new Request('https://mayazero.app/api/cacaotracker/pooled-nodes/maya1abc'),
    )

    await expect(response.json()).resolves.toEqual({
      providerBond: { totalBondedCacao: 123, providerCount: 2 },
    })
  })

  it('returns protocol dashboard data without a wallet address', async () => {
    vi.stubEnv('CACAOTRACKER_API_KEY', 'secret')
    vi.stubEnv('CACAOTRACKER_API_BASE_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          stats: {
            total_tvl_usd: 100_000,
            total_pooled_cacao: '1',
            total_bonded_cacao: '2',
            cacao_price_usd: 1,
            volume_24h_usd: 5000,
            swap_count_24h: 15,
            daily_active_users: 10,
            monthly_active_users: 100,
            total_unique_swappers: 1000,
            active_node_count: 5,
            standby_node_count: 3,
            protocol_reserve_cacao: '3',
            block_height: 1,
          },
          tvlBreakdown: {
            btc: 1,
            eth: 2,
            rune: 0,
            usdc: 3,
            usdt: 4,
            dash: 0,
            other: 5,
            total: 15,
          },
          pendulum: {
            bonded_ratio: 0.6,
            target_bond_ratio: 0.67,
            deviation_from_target: -0.07,
            node_reward_share: 0.55,
            lp_reward_share: 0.45,
            network_security_state: 'balanced',
            cacao_price_usd: 1,
          },
        }),
      ),
    )

    const response = await getProtocolDashboard(
      new Request('https://mayazero.app/api/cacaotracker/protocol/dashboard'),
    )

    await expect(response.json()).resolves.toMatchObject({
      stats: { total_tvl_usd: 100_000 },
      pendulum: { network_security_state: 'balanced' },
    })
  })
})
