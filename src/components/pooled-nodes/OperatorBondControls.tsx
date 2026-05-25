import { useEffect, useState } from 'react'
import { formatBaseUnits } from '#/lib/cacao-pool'
import {
  getConnectedProviderPosition,
  type PooledNode,
  type PooledNodeProvider,
} from '#/lib/pooled-nodes'
import {
  getPooledNodePrimaryAction,
  MAX_BOND_PROVIDERS,
  MIN_OPERATOR_FEE_BPS,
  MAX_OPERATOR_FEE_BPS,
  MIN_OPERATOR_ADD_TX_CACAO,
  MIN_DUST_CACAO,
} from '#/lib/pooled-nodes-actions'
import {
  ActionShell,
  FieldLabel,
  GradientSubmitButton,
  MemoCallout,
  PanelHeader,
  PrimaryPanel,
  SegmentedTabs,
} from './shared'

type OperatorTab = 'add-provider' | 'update-fee' | 'remove-provider'

export function OperatorBondControls(props: {
  node: PooledNode
  balanceBaseUnits: string | null
  supportReason?: string
  isViewOnly: boolean
  isSubmitting: boolean
  formattedBalance: string
  onSubmitAddProvider: (input: {
    amountBaseUnits: string
    operatorFeeBps: string
    providerAddress: string
  }) => void
  onSubmitUpdateFee: (input: {
    amountBaseUnits: string
    operatorFeeBps: string
  }) => void
  onSubmitRemoveProvider: (input: {
    amountBaseUnits: string
    providerAddress: string
  }) => void
}) {
  const [activeTab, setActiveTab] = useState<OperatorTab>('add-provider')
  const [providerAddress, setProviderAddress] = useState('')
  const [addFeeBps, setAddFeeBps] = useState('2500')
  const [addBondAmount, setAddBondAmount] = useState('')
  const [updateFeeBps, setUpdateFeeBps] = useState(String(props.node.operatorFeeBps || '2500'))
  const [updateFeeAmount, setUpdateFeeAmount] = useState(MIN_DUST_CACAO)
  const [removeProviderAddress, setRemoveProviderAddress] = useState('')
  const [removeAmount, setRemoveAmount] = useState('')

  const removableProviders =
    props.node.providers.filter(
      (provider) => provider.bondAddress !== props.node.bondAddress && !provider.isOperator,
    ) ?? []

  const selectedRemoveProvider: PooledNodeProvider | null =
    removableProviders.find((provider) => provider.bondAddress === removeProviderAddress) ??
    null

  useEffect(() => {
    if (!removableProviders.length) {
      setRemoveProviderAddress('')
      setRemoveAmount('')
      return
    }

    setRemoveProviderAddress((current) =>
      removableProviders.some((provider) => provider.bondAddress === current)
        ? current
        : (removableProviders[0]?.bondAddress ?? ''),
    )
  }, [removableProviders, props.node.nodeAddress])

  useEffect(() => {
    if (!selectedRemoveProvider) {
      setRemoveAmount('')
      return
    }

    const position = getConnectedProviderPosition(props.node, selectedRemoveProvider.bondAddress)
    if (position.poolSumBaseUnits) {
      setRemoveAmount(formatBaseUnits(position.poolSumBaseUnits, 10) || '')
    }
  }, [props.node, selectedRemoveProvider])

  const addAction = getPooledNodePrimaryAction({
    action: 'operator.add-provider',
    amountInput: addBondAmount,
    balanceBaseUnits: props.balanceBaseUnits,
    connectedAddress: props.node.bondAddress,
    isSubmitting: props.isSubmitting,
    isViewOnly: props.isViewOnly,
    node: props.node,
    operatorFeeBps: addFeeBps,
    providerAddress,
    supportReason: props.supportReason,
  })

  const updateAction = getPooledNodePrimaryAction({
    action: 'operator.update-fee',
    amountInput: updateFeeAmount,
    balanceBaseUnits: props.balanceBaseUnits,
    isSubmitting: props.isSubmitting,
    isViewOnly: props.isViewOnly,
    node: props.node,
    operatorFeeBps: updateFeeBps,
    supportReason: props.supportReason,
  })

  const removeAction = getPooledNodePrimaryAction({
    action: 'operator.remove-provider',
    amountInput: removeAmount,
    balanceBaseUnits: props.balanceBaseUnits,
    isSubmitting: props.isSubmitting,
    isViewOnly: props.isViewOnly,
    node: props.node,
    selectedRemoveProvider,
    supportReason: props.supportReason,
  })

  const tabs: Array<{ id: OperatorTab; label: string }> = [
    { id: 'add-provider', label: 'Add Provider' },
    { id: 'update-fee', label: 'Update Fee' },
    { id: 'remove-provider', label: 'Remove Provider' },
  ]

  return (
    <PrimaryPanel className="border-0 bg-transparent p-0 shadow-none">
      <PanelHeader
        kicker="Operator Controls"
        title="Manage Providers"
        description={`You are the operator on this node. Manage up to ${MAX_BOND_PROVIDERS} bond providers.`}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <span className="text-xs font-medium text-[var(--sea-ink-soft)]">
          Available CACAO:{' '}
          <span className="font-bold text-[var(--sea-ink)]">
            {props.formattedBalance}
          </span>
        </span>
      </div>

      {activeTab === 'add-provider' ? (
        <ActionShell className="mt-2">
          <FieldLabel htmlFor="provider-address">Provider address</FieldLabel>
          <input
            id="provider-address"
            aria-label="Provider address"
            className="super-input mt-2 rounded-2xl"
            value={providerAddress}
            onChange={(event) => setProviderAddress(event.target.value)}
          />
          <FieldLabel htmlFor="add-fee-bps">Operator fee (basis points)</FieldLabel>
          <input
            id="add-fee-bps"
            aria-label="Operator fee basis points"
            className="super-input mt-2 rounded-2xl"
            value={addFeeBps}
            onChange={(event) => setAddFeeBps(event.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
            Fee must be {MIN_OPERATOR_FEE_BPS}–{MAX_OPERATOR_FEE_BPS} bps (1%–99%).
          </p>
          <FieldLabel htmlFor="operator-bond-amount">Operator bond amount (CACAO)</FieldLabel>
          <input
            id="operator-bond-amount"
            aria-label="Operator bond amount"
            className="super-input mt-2 rounded-2xl"
            value={addBondAmount}
            onChange={(event) => setAddBondAmount(event.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
            Minimum transaction: {MIN_OPERATOR_ADD_TX_CACAO} CACAO.
          </p>
          {addAction.note ? (
            <p className="mt-2 text-xs font-medium text-amber-500">{addAction.note}</p>
          ) : null}
          <MemoCallout
            memo={addAction.memo}
            txAmountCacao={
              addAction.txAmountBaseUnits
                ? formatBaseUnits(addAction.txAmountBaseUnits, 10) || null
                : null
            }
          />
          <GradientSubmitButton
            disabled={addAction.disabled}
            isLoading={props.isSubmitting}
            onClick={() => {
              if (addAction.amountBaseUnits && addFeeBps.trim() && providerAddress.trim()) {
                props.onSubmitAddProvider({
                  amountBaseUnits: addAction.amountBaseUnits,
                  operatorFeeBps: addFeeBps.trim(),
                  providerAddress: providerAddress.trim(),
                })
              }
            }}
          >
            {addAction.label}
          </GradientSubmitButton>
        </ActionShell>
      ) : null}

      {activeTab === 'update-fee' ? (
        <ActionShell className="mt-2">
          <FieldLabel htmlFor="update-fee-bps">Fee update (basis points)</FieldLabel>
          <input
            id="update-fee-bps"
            aria-label="Fee update basis points"
            className="super-input mt-2 rounded-2xl"
            value={updateFeeBps}
            onChange={(event) => setUpdateFeeBps(event.target.value)}
          />
          <FieldLabel htmlFor="update-fee-amount">Transaction amount (CACAO)</FieldLabel>
          <input
            id="update-fee-amount"
            aria-label="Fee update transaction amount"
            className="super-input mt-2 rounded-2xl"
            value={updateFeeAmount}
            onChange={(event) => setUpdateFeeAmount(event.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
            Fee updates require at least {MIN_DUST_CACAO} CACAO for the deposit memo.
          </p>
          {updateAction.note ? (
            <p className="mt-2 text-xs font-medium text-amber-500">{updateAction.note}</p>
          ) : null}
          <MemoCallout
            memo={updateAction.memo}
            txAmountCacao={
              updateAction.txAmountBaseUnits
                ? formatBaseUnits(updateAction.txAmountBaseUnits, 10) || null
                : null
            }
          />
          <GradientSubmitButton
            disabled={updateAction.disabled}
            isLoading={props.isSubmitting}
            onClick={() => {
              if (updateAction.amountBaseUnits) {
                props.onSubmitUpdateFee({
                  amountBaseUnits: updateAction.amountBaseUnits,
                  operatorFeeBps: updateFeeBps.trim(),
                })
              }
            }}
          >
            {updateAction.label}
          </GradientSubmitButton>
        </ActionShell>
      ) : null}

      {activeTab === 'remove-provider' ? (
        <ActionShell className="mt-2">
          <FieldLabel htmlFor="remove-provider">Provider to remove</FieldLabel>
          <select
            id="remove-provider"
            aria-label="Provider to remove"
            className="super-input mt-2 rounded-2xl"
            value={removeProviderAddress}
            onChange={(event) => setRemoveProviderAddress(event.target.value)}
          >
            <option value="">Select provider</option>
            {removableProviders.map((provider) => (
              <option key={provider.bondAddress} value={provider.bondAddress}>
                {provider.bondAddress}
              </option>
            ))}
          </select>
          <FieldLabel htmlFor="remove-amount">Refund amount (CACAO)</FieldLabel>
          <input
            id="remove-amount"
            aria-label="Remove provider amount"
            className="super-input mt-2 rounded-2xl"
            value={removeAmount}
            onChange={(event) => setRemoveAmount(event.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
            Only allowed while the node is standby. Refund must equal the provider&apos;s full bond.
          </p>
          {removeAction.note ? (
            <p className="mt-2 text-xs font-medium text-amber-500">{removeAction.note}</p>
          ) : null}
          <MemoCallout
            memo={removeAction.memo}
            txAmountCacao={
              removeAction.txAmountBaseUnits
                ? formatBaseUnits(removeAction.txAmountBaseUnits, 10) || null
                : null
            }
          />
          <GradientSubmitButton
            disabled={removeAction.disabled}
            isLoading={props.isSubmitting}
            onClick={() => {
              if (removeAction.amountBaseUnits && selectedRemoveProvider) {
                props.onSubmitRemoveProvider({
                  amountBaseUnits: removeAction.amountBaseUnits,
                  providerAddress: selectedRemoveProvider.bondAddress,
                })
              }
            }}
          >
            {removeAction.label}
          </GradientSubmitButton>
        </ActionShell>
      ) : null}
    </PrimaryPanel>
  )
}
