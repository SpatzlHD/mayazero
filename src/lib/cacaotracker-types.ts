export type UnknownRecord = Record<string, unknown>;

export type RewardsWindow = {
  fees: number;
  rewards: number;
  total: number;
};

export type RewardsOverview = {
  total: RewardsWindow;
  last24h: RewardsWindow;
  last7d: RewardsWindow;
  last30d: RewardsWindow;
};

export type DailyReward = {
  date: string;
  liquidity_fees_usd: number;
  block_rewards_usd: number;
  total_rewards_usd: number;
};

export type RewardForecast = {
  pool: string;
  forecast_7d_usd: number;
  forecast_30d_usd: number;
  forecast_365d_usd: number;
  avg_daily_total_usd: number;
  confidence_score: number;
};

export type PoolReward = {
  pool: string;
  liquidity_fees_usd: number;
  block_rewards_usd: number;
  total_usd: number;
  percentage: number;
};

export type SyncStatus = {
  address: string;
  synced: boolean;
  syncedFrom?: string;
  syncedUntil?: string;
  lastSyncedAt?: string;
};

export type AddressRewardsResponse = {
  overview: RewardsOverview;
  byPool: PoolReward[];
  daily: DailyReward[];
  forecasts: RewardForecast[];
};

export type EnhancedActionNetworkFee = {
  asset: string;
  amount: number;
  amountUSD: number;
};

export type EnhancedAction = {
  txHash: string;
  type:
    | "swap"
    | "addLiquidity"
    | "withdraw"
    | "cacaoPoolDeposit"
    | "cacaoPoolWithdraw"
    | "donate"
    | "refund"
    | "switch"
    | "mayaname"
    | "send"
    | "bond"
    | "unbond"
    | "failed";
  status: "success" | "pending" | "refunded";
  date: number;
  height: number;
  pools: string[];
  inAsset: string;
  inAmount: number;
  outAsset: string | null;
  outAmount: number | null;
  outAssets: Array<{
    asset: string;
    amount: number;
    amountUSD: number;
  }> | null;
  inAmountUSD: number;
  outAmountUSD: number | null;
  fees: {
    liquidityFee: number;
    liquidityFeeUSD: number;
    networkFees: EnhancedActionNetworkFee[];
    affiliateFee: number | null;
    affiliateFeeUSD: number | null;
    totalFeeUSD: number;
  };
  slippage: number | null;
  streamingSwap: {
    interval: number;
    quantity: number;
    count: number;
  } | null;
  liquidityUnits: string | null;
  impermanentLossProtection: number | null;
  withdrawBasisPoints: number | null;
  interface: {
    name: string;
    code: string;
    icon: string | null;
  } | null;
  mayaname: {
    name: string;
    brand?: string;
    chain: string;
    address: string;
    expire: number;
    owner: string;
  } | null;
  fromAddress: string;
  toAddress: string;
};

export type EnhancedActionsResponse = {
  actions: EnhancedAction[];
  meta: {
    nextPageToken: string | null;
    hasMore: boolean;
  };
};

export type CacaotrackerTxTrackerSessionResponse = {
  wsUrl: string;
  expiresAt: string;
  heartbeatSeconds: number;
};

export type CacaotrackerTxTrackerDisplayAmount = {
  exact: string | null;
  compact: string | null;
  decimals: number;
};

export type CacaotrackerTxTrackerDisplayAsset = {
  assetName: string;
  symbol: string;
  icon: string | null;
};

export type CacaotrackerTxTrackerFromState = {
  asset: string;
  amount: string;
  amountBase: string;
  address: string;
  display: CacaotrackerTxTrackerDisplayAsset & {
    amount: CacaotrackerTxTrackerDisplayAmount;
  };
};

export type CacaotrackerTxTrackerToState = {
  asset: string;
  amountExpected: string | null;
  amountReceived: string | null;
  address: string;
  outboundTxHashes: string[];
  display: CacaotrackerTxTrackerDisplayAsset & {
    amountExpected: CacaotrackerTxTrackerDisplayAmount;
    amountReceived: CacaotrackerTxTrackerDisplayAmount;
  };
};

export type CacaotrackerTxTrackerStreamingState = {
  interval: number;
  quantity: number;
  count: number;
  progressPercent: number;
  depositedAmount: string;
  swappedInAmount: string;
  swappedOutAmount: string;
  failedSwaps: string[];
  failedReasons: string[];
  lastHeight: number | null;
};

export type CacaotrackerTxTrackerState = {
  txHash: string;
  updatedAt: string;
  observedAt: string;
  source: string;
  status: string;
  stage: string;
  isFinal: boolean;
  swapType: string | null;
  summary: string;
  affiliate: {
    raw: string | null;
    interface: {
      name: string;
      code: string;
      icon: string | null;
    } | null;
  } | null;
  from: CacaotrackerTxTrackerFromState;
  to: CacaotrackerTxTrackerToState;
  streaming: CacaotrackerTxTrackerStreamingState | null;
  chain: {
    height: number | null;
    inboundSeen: boolean;
    lastEventType: string | null;
  };
  rawRefs: Record<string, string | null> | null;
};

export type CacaotrackerTxTrackerReadyMessage = {
  type: "ready";
  connectionId?: string;
  heartbeatSeconds?: number;
};

export type CacaotrackerTxTrackerSubscribedMessage = {
  type: "subscribed";
  accepted: string[];
  rejected: string[];
};

export type CacaotrackerTxTrackerSnapshotMessage = {
  type: "snapshot";
  state: CacaotrackerTxTrackerState;
};

export type CacaotrackerTxTrackerUpdateMessage = {
  type: "tx_update";
  state: CacaotrackerTxTrackerState;
  changedFields?: string[];
};

export type CacaotrackerTxTrackerPongMessage = {
  type: "pong";
  connectionId?: string;
  ts?: string;
};

export type CacaotrackerTxTrackerUnknownMessage = {
  type: string;
  [key: string]: unknown;
};

export type CacaotrackerTxTrackerMessage =
  | CacaotrackerTxTrackerReadyMessage
  | CacaotrackerTxTrackerSubscribedMessage
  | CacaotrackerTxTrackerSnapshotMessage
  | CacaotrackerTxTrackerUpdateMessage
  | CacaotrackerTxTrackerPongMessage
  | CacaotrackerTxTrackerUnknownMessage;

export type ILSummaryAggregated = {
  total_hodl_value_usd: number;
  total_current_value_usd: number;
  total_il_amount_usd: number;
  total_ilp_eligible_usd: number;
  position_count: number;
};

export type ILAnalysis = {
  pool: string;
  impermanentLoss: {
    percentage: number;
    amountUSD: number;
    isLoss: boolean;
  };
  protection: {
    coveragePercent: number;
    eligibleAmountUSD: number;
    daysInPool: number;
    daysToFullProtection: number;
    assetOutperformsCacao: boolean;
    gracePeriodComplete: boolean;
  };
  breakdown: {
    hodlValueUSD: number;
    currentValueUSD: number;
    cacaoPrice: number;
    assetPrice: number;
    depositCacao: number;
    depositAsset: number;
    currentCacao: number;
    currentAsset: number;
  };
  position: {
    liquidityUnits: string;
    poolShare: number;
    dateFirstAdded: number;
  };
};

export type PositionILSnapshot = {
  timestamp?: string;
  date?: string;
  currentValueUSD?: number;
  hodlValueUSD?: number;
  ilAmountUSD?: number;
  eligibleAmountUSD?: number;
  coveragePercent?: number;
} & UnknownRecord;

export type ILHistoryResponse = {
  history: PositionILSnapshot[];
};

export type PoolAnalytics = {
  pool: string;
  luvi: number;
  luviUSD: number;
  luviChange24h: number;
  luviChange7d: number;
  luviChange30d: number;
  tvlUSD: number;
  volume24hUSD: number;
  apr: number;
  feesEarned24hUSD: number;
  ilProtectionPaid24hUSD: number;
  netEarnings24hUSD: number;
};

export type PoolMetrics = {
  timestamp: string;
  pool: string;
  cacao_depth?: string;
  asset_depth?: string;
  cacao_price_usd?: number;
  asset_price_usd?: number;
  liquidity_units?: string;
  synth_units?: string;
  pool_units?: string;
  swap_volume_cacao?: string;
  status?: string;
  luvi: number;
};

export type PoolTVLHistory = {
  timestamp: string;
  tvlUSD: number;
};

export type PoolVolumeHourly = {
  timestamp: string;
  volume_usd: number;
  swap_count: number;
};

export type PoolComparisonResult = {
  pool: string;
  luviStart: number;
  luviEnd: number;
  luviChangePercent: number;
  volumeUSD: number;
  feesUSD: number;
  rank: number;
};

export type ProtocolStats = {
  total_tvl_usd: number;
  total_pooled_cacao: string;
  total_bonded_cacao: string;
  cacao_price_usd: number;
  volume_24h_usd: number;
  swap_count_24h: number;
  daily_active_users: number;
  monthly_active_users: number;
  total_unique_swappers: number;
  active_node_count: number;
  standby_node_count: number;
  protocol_reserve_cacao: string;
  block_height: number;
};

export type TVLBreakdown = {
  btc: number;
  eth: number;
  rune: number;
  usdc: number;
  usdt: number;
  dash: number;
  other: number;
  total: number;
};

export type IncentivePendulum = {
  bonded_ratio: number;
  target_bond_ratio: number;
  deviation_from_target: number;
  node_reward_share: number;
  lp_reward_share: number;
  network_security_state: string;
  cacao_price_usd: number;
};

export type ProtocolDashboardResponse = {
  stats: ProtocolStats | null;
  growth?: UnknownRecord | null;
  tvlBreakdown: TVLBreakdown | null;
  pendulum: IncentivePendulum | null;
  volumeAggregates?: UnknownRecord | null;
};

export type CacaoPoolApyResponse = {
  apy_cacao: number;
  apy_usd: number;
  details: {
    net_pnl_cacao: number;
    current_value_cacao: number;
    current_value_usd: number;
    price_used: number;
    roi_absolute_usd: number;
  } | null;
};

export type CacaoPoolHistoryEntry = {
  date?: string;
  timestamp?: string;
  total_rewards_usd?: number;
  rewards_usd?: number;
  current_value_usd?: number;
  current_value_cacao?: number;
  members?: number;
} & UnknownRecord;

export type CacaoPoolStats = UnknownRecord & {
  total_members?: number;
  total_value_cacao?: number;
  total_value_usd?: number;
  total_earnings_cacao?: number;
  total_tvl_usd?: number;
  apy?: number;
};

export type MayaTokenRewardEntry = {
  block_height: number;
  block_time: string;
  amount: string;
};

export type MayaTokenRewardsResponse = {
  address: string;
  total_cacao: string;
  distribution_count: number;
  rewards: MayaTokenRewardEntry[];
};

export type BondProviderResponse = UnknownRecord | null;

export type WalletSummaryResponse = {
  rewards: AddressRewardsResponse;
  syncStatus: SyncStatus | null;
};

export type WalletActivityResponse = EnhancedActionsResponse;

export type LiquiditySummaryResponse = {
  ilSummary: ILSummaryAggregated;
  rewardsByPool: PoolReward[];
};

export type LiquidityPoolDetailResponse = {
  analytics: PoolAnalytics;
  metricsHistory: PoolMetrics[];
  tvlHistory: PoolTVLHistory[];
  volumeHistory: PoolVolumeHourly[];
  comparison: PoolComparisonResult | null;
  ilAnalysis: ILAnalysis | null;
  ilHistory: PositionILSnapshot[];
};

export type CacaoPoolDetailResponse = {
  apy: CacaoPoolApyResponse;
  history: CacaoPoolHistoryEntry[];
  stats: CacaoPoolStats;
  tokenRewards: MayaTokenRewardsResponse;
};

export type PooledNodesDetailResponse = {
  providerBond: BondProviderResponse;
};

export type CacaotrackerErrorResponse = {
  error: string;
};
