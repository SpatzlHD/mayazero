import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatBaseUnits } from '#/lib/cacao-pool'
import {
  buildBondablePositions,
  findBondablePosition,
  formatBondWeightLabel,
  formatBondablePositionOptionLabel,
  formatBondedAllocationOptionLabel,
  formatEffectiveBondUnits,
  formatLiquidityUnitsLabel,
} from '#/lib/pooled-nodes-bond'
import {
  getPooledNodePrimaryAction,
  MIN_DUST_CACAO,
} from '#/lib/pooled-nodes-actions'
import type { CacaoPoolPosition } from '#/lib/cacao-pool'
import type { LiquidityPosition } from '#/lib/liquidity'
import {
  getConnectedProviderPosition,
  getProviderBondAllocations,
  type PooledNode,
  type ProviderBondAllocation,
} from '#/lib/pooled-nodes'
import {
  ActionShell,
  FieldLabel,
  FormInput,
  FormSelect,
  GradientSubmitButton,
  MemoCallout,
  PanelHeader,
  PrimaryPanel,
  SegmentedTabs,
  UnitFractionButtons,
} from './shared'

type ProviderActionTab = 'bond' | 'unbond'

function ActionBlock(props: {
  title: string
  children: ReactNode
  primaryAction: ReturnType<typeof getPooledNodePrimaryAction>
  isSubmitting: boolean
  onSubmit: () => void
}) {
  return (
    <ActionShell className="mt-4">
      <h3 className="font-bold text-[var(--sea-ink)]">{props.title}</h3>
      {props.children}
      {props.primaryAction.note ? (
        <p className="mt-2 text-xs font-medium text-amber-500">{props.primaryAction.note}</p>
      ) : null}
      <MemoCallout
        memo={props.primaryAction.memo}
        txAmountCacao={
          props.primaryAction.txAmountBaseUnits
            ? formatBaseUnits(props.primaryAction.txAmountBaseUnits, 10) || null
            : null
        }
      />
      <GradientSubmitButton
        disabled={props.primaryAction.disabled}
        isLoading={props.isSubmitting}
        onClick={props.onSubmit}
      >
        {props.primaryAction.label}
      </GradientSubmitButton>
    </ActionShell>
  )
}

export function ProviderBondActions(props: {
  node: PooledNode
  connectedAddress: string
  balanceBaseUnits: string | null
  supportReason?: string
  isViewOnly: boolean
  isSubmitting: boolean
  liquidityPositions: LiquidityPosition[]
  cacaoPoolPosition: CacaoPoolPosition | null
  onSubmitBond: (input: {
    amountBaseUnits: string
    bondAsset: string
    bondUnits: string
  }) => void
  onSubmitUnbond: (input: {
    amountBaseUnits: string
    bondAsset: string
    bondUnits: string
  }) => void
  formattedBalance: string
}) {
  const [selectedBondPositionId, setSelectedBondPositionId] = useState('')
  const [bondUnits, setBondUnits] = useState('')
  const [selectedBondedAsset, setSelectedBondedAsset] = useState('')
  const [unbondUnits, setUnbondUnits] = useState('')
  const [activeTab, setActiveTab] = useState<ProviderActionTab>('bond')

  const connectedPosition = getConnectedProviderPosition(
    props.node,
    props.connectedAddress,
  )
  const bondedAllocations = useMemo(
    () =>
      connectedPosition.provider
        ? getProviderBondAllocations(connectedPosition.provider)
        : [],
    [connectedPosition.provider],
  )

  const walletBondablePositions = useMemo(
    () =>
      buildBondablePositions({
        liquidityPositions: props.liquidityPositions,
        cacaoPoolPosition: props.cacaoPoolPosition,
      }),
    [props.cacaoPoolPosition, props.liquidityPositions],
  )

  const bondablePositions = useMemo(
    () =>
      buildBondablePositions({
        liquidityPositions: props.liquidityPositions,
        cacaoPoolPosition: props.cacaoPoolPosition,
        bondedAllocations,
      }),
    [bondedAllocations, props.cacaoPoolPosition, props.liquidityPositions],
  )

  const selectedBondPosition = findBondablePosition(
    bondablePositions,
    selectedBondPositionId,
  )
  const selectedBondedAllocation =
    bondedAllocations.find((entry) => entry.asset === selectedBondedAsset) ?? null

  useEffect(() => {
    setSelectedBondPositionId((current) =>
      bondablePositions.some((position) => position.id === current)
        ? current
        : (bondablePositions[0]?.id ?? ''),
    )
  }, [bondablePositions, props.node.nodeAddress])

  useEffect(() => {
    setSelectedBondedAsset((current) =>
      bondedAllocations.some((entry) => entry.asset === current)
        ? current
        : (bondedAllocations[0]?.asset ?? ''),
    )
  }, [bondedAllocations, props.node.nodeAddress])

  const roleBanner = props.node.isOperator
    ? 'You are the operator on this node. Bond LP pool units or CACAO pool units — not raw CACAO.'
    : 'You are a bond provider on this node. Bond LP pool units or CACAO pool units from your wallet.'

  const bondAction = getPooledNodePrimaryAction({
    action: 'provider.bond',
    amountInput: bondUnits,
    balanceBaseUnits: props.balanceBaseUnits,
    bondPosition: selectedBondPosition,
    connectedAddress: props.connectedAddress,
    isSubmitting: props.isSubmitting,
    isViewOnly: props.isViewOnly,
    node: props.node,
    supportReason: props.supportReason,
  })

  const unbondAction = getPooledNodePrimaryAction({
    action: 'provider.unbond',
    amountInput: unbondUnits,
    balanceBaseUnits: props.balanceBaseUnits,
    bondedAllocation: selectedBondedAllocation,
    connectedAddress: props.connectedAddress,
    isSubmitting: props.isSubmitting,
    isViewOnly: props.isViewOnly,
    node: props.node,
    supportReason: props.supportReason,
  })

  return (
    <PrimaryPanel className="border-0 bg-transparent p-0 shadow-none">
      <PanelHeader
        kicker="Provider Actions"
        title="Bond Management"
        description={`${roleBanner} Each bond/unbond deposit memo costs ${MIN_DUST_CACAO} CACAO.`}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          tabs={[
            { id: 'bond', label: 'Bond' },
            { id: 'unbond', label: 'Unbond' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
        <button
          type="button"
          className="text-xs font-medium text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--maya-teal)]"
          onClick={() => {
            if (activeTab === 'bond') {
              setBondUnits(selectedBondPosition?.availableUnits ?? '')
            } else if (selectedBondedAllocation) {
              setUnbondUnits(selectedBondedAllocation.units)
            }
          }}
        >
          Available memo CACAO:{' '}
          <span className="font-bold text-[var(--sea-ink)]">
            {props.formattedBalance}
          </span>
        </button>
      </div>

      {activeTab === 'bond' ? (
        <ActionBlock
          title="Provider Bond"
          primaryAction={bondAction}
          isSubmitting={props.isSubmitting}
          onSubmit={() => {
            if (bondAction.amountBaseUnits && selectedBondPosition) {
              props.onSubmitBond({
                amountBaseUnits: bondAction.amountBaseUnits,
                bondAsset: selectedBondPosition.asset,
                bondUnits: bondAction.amountBaseUnits,
              })
            }
          }}
        >
          <FieldLabel htmlFor="bond-source">Bond source</FieldLabel>
          <FormSelect
            id="bond-source"
            aria-label="Bond source"
            value={selectedBondPositionId}
            onChange={setSelectedBondPositionId}
            placeholder="Select position"
            options={bondablePositions.map((position) => ({
              value: position.id,
              label: formatBondablePositionOptionLabel(position),
            }))}
          />
          {selectedBondPosition ? (
            <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
              {formatBondWeightLabel(selectedBondPosition.source)} •{' '}
              {formatBondablePositionOptionLabel(selectedBondPosition)}
            </p>
          ) : walletBondablePositions.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
              Your wallet holdings on this node are already fully bonded. Unbond first to
              free units for a new bond.
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
              No bondable LP or CACAO pool positions were found for this wallet.
            </p>
          )}
          <FieldLabel htmlFor="bond-units">Units to bond</FieldLabel>
          <FormInput
            id="bond-units"
            aria-label="Units to bond"
            className="font-mono"
            value={bondUnits}
            onChange={setBondUnits}
            placeholder="1000000000"
          />
          <UnitFractionButtons
            className="mt-2"
            totalUnits={selectedBondPosition?.availableUnits}
            disabled={props.isViewOnly || props.isSubmitting}
            onSelect={setBondUnits}
          />
          {selectedBondPosition && bondUnits.trim() ? (
            <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
              Effective bond contribution:{' '}
              {formatLiquidityUnitsLabel(
                formatEffectiveBondUnits(bondUnits, selectedBondPosition.source),
              )}{' '}
              weighted units
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
            Memo format: BOND:ASSET:UNITS:NODE. Bond when the node is standby, active, or not
            churning.
          </p>
        </ActionBlock>
      ) : null}

      {activeTab === 'unbond' ? (
        <ActionBlock
          title="Provider Unbond"
          primaryAction={unbondAction}
          isSubmitting={props.isSubmitting}
          onSubmit={() => {
            if (unbondAction.amountBaseUnits && selectedBondedAllocation) {
              props.onSubmitUnbond({
                amountBaseUnits: unbondAction.amountBaseUnits,
                bondAsset: selectedBondedAllocation.asset,
                bondUnits: unbondAction.amountBaseUnits,
              })
            }
          }}
        >
          <FieldLabel htmlFor="bonded-allocation">Bonded allocation</FieldLabel>
          <FormSelect
            id="bonded-allocation"
            aria-label="Bonded allocation"
            value={selectedBondedAsset}
            onChange={setSelectedBondedAsset}
            placeholder="Select bonded position"
            options={bondedAllocations.map((allocation) => ({
              value: allocation.asset,
              label: formatBondedAllocationOptionLabel(allocation),
            }))}
          />
          {selectedBondedAllocation ? (
            <BondedAllocationHint allocation={selectedBondedAllocation} />
          ) : (
            <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
              No bonded allocations are reported for your address on this node yet.
            </p>
          )}
          <FieldLabel htmlFor="unbond-units">Units to unbond</FieldLabel>
          <FormInput
            id="unbond-units"
            aria-label="Units to unbond"
            className="font-mono"
            value={unbondUnits}
            onChange={setUnbondUnits}
            placeholder="1000000000"
          />
          <UnitFractionButtons
            className="mt-2"
            totalUnits={selectedBondedAllocation?.units}
            disabled={props.isViewOnly || props.isSubmitting}
            onSelect={setUnbondUnits}
          />
          <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
            Memo format: UNBOND:ASSET:UNITS:NODE. Confirm churn status with your operator before
            unbonding.
          </p>
        </ActionBlock>
      ) : null}
    </PrimaryPanel>
  )
}

function BondedAllocationHint(props: { allocation: ProviderBondAllocation }) {
  return (
    <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
      Bonded {formatLiquidityUnitsLabel(props.allocation.units)} units
      {props.allocation.source === 'cacao-pool'
        ? ` • effective bond ${formatLiquidityUnitsLabel(props.allocation.effectiveUnits)} weighted units (50% weight)`
        : props.allocation.source === 'lp'
          ? ' • full LP bond weight'
          : null}
    </p>
  )
}
