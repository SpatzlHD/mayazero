import { useState, type ReactNode } from 'react'
import type { CacaoPoolPosition } from '#/lib/cacao-pool'
import type { LiquidityPosition } from '#/lib/liquidity'
import type { BondActivityItem } from '#/lib/pooled-nodes-activity'
import type { PooledNode } from '#/lib/pooled-nodes'
import { BondActivityPanel } from './BondActivityPanel'
import { NodeDetailPanel } from './NodeDetailPanel'
import { NodeListSelect, NodeListSidebar } from './NodeListSidebar'
import { OperatorBondControls } from './OperatorBondControls'
import { ProviderBondActions } from './ProviderBondActions'
import { ProviderRegistry } from './ProviderRegistry'
import { PrimaryPanel, RoleBadge, SegmentedTabs, WorkspaceShell } from './shared'

type WorkspaceTab = 'overview' | 'actions' | 'activity'

function getSelectedNodeRole(node: PooledNode | null): string | null {
  if (!node) return null
  if (node.isOperator) return 'Operator'
  if (node.isProvider) return 'Provider'
  return 'Related'
}

export function PooledNodeWorkspace(props: {
  nodes: PooledNode[]
  selectedNode: PooledNode | null
  selectedNodeAddress: string
  onSelectNode: (nodeAddress: string) => void
  connectedAddress: string
  balanceBaseUnits: string | null
  formattedBalance: string
  supportReason?: string
  isViewOnly: boolean
  isSubmitting: boolean
  liquidityPositions: LiquidityPosition[]
  cacaoPoolPosition: CacaoPoolPosition | null
  bondActivity: BondActivityItem[]
  activityError: string | null
  isActivityLoading: boolean
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
  onActionSuccess?: () => void
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview')
  const selectedNode = props.selectedNode
  const selectedRole = getSelectedNodeRole(selectedNode)
  const hasActions =
    selectedNode != null && (selectedNode.isProvider || selectedNode.isOperator)

  function wrapAction<T extends (...args: never[]) => void>(handler: T): T {
    return ((...args: Parameters<T>) => {
      handler(...args)
      props.onActionSuccess?.()
      setActiveTab('activity')
    }) as T
  }

  let actionsContent: ReactNode = null
  if (selectedNode && hasActions) {
    actionsContent = (
      <div className="grid gap-4 px-1 pb-1">
        {selectedNode.isProvider || selectedNode.isOperator ? (
          <ProviderBondActions
            node={selectedNode}
            connectedAddress={props.connectedAddress}
            balanceBaseUnits={props.balanceBaseUnits}
            supportReason={props.supportReason}
            isViewOnly={props.isViewOnly}
            isSubmitting={props.isSubmitting}
            liquidityPositions={props.liquidityPositions}
            cacaoPoolPosition={props.cacaoPoolPosition}
            formattedBalance={props.formattedBalance}
            onSubmitBond={wrapAction(props.onSubmitBond)}
            onSubmitUnbond={wrapAction(props.onSubmitUnbond)}
          />
        ) : null}
        {selectedNode.isOperator ? (
          <OperatorBondControls
            node={selectedNode}
            balanceBaseUnits={props.balanceBaseUnits}
            supportReason={props.supportReason}
            isViewOnly={props.isViewOnly}
            isSubmitting={props.isSubmitting}
            formattedBalance={props.formattedBalance}
            onSubmitAddProvider={wrapAction(props.onSubmitAddProvider)}
            onSubmitUpdateFee={wrapAction(props.onSubmitUpdateFee)}
            onSubmitRemoveProvider={wrapAction(props.onSubmitRemoveProvider)}
          />
        ) : null}
      </div>
    )
  } else if (selectedNode) {
    actionsContent = (
      <PrimaryPanel className="mx-1 mb-1 border-0 bg-transparent p-4 shadow-none">
        <h2 className="text-xl font-bold">Actions</h2>
        <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
          Your connected address is related to this node, but no operator or provider actions are
          available for your role.
        </p>
      </PrimaryPanel>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <NodeListSidebar
        nodes={props.nodes}
        selectedNodeAddress={props.selectedNodeAddress}
        onSelect={props.onSelectNode}
      />
      <WorkspaceShell delay={200}>
        <div className="space-y-4 px-3 py-4 sm:px-4 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <NodeListSelect
              nodes={props.nodes}
              selectedNodeAddress={props.selectedNodeAddress}
              onSelect={props.onSelectNode}
            />
            <div className="flex flex-wrap items-center gap-3">
              {selectedRole ? (
                <RoleBadge
                  label={selectedRole}
                  tone={selectedNode?.isOperator ? 'operator' : 'provider'}
                />
              ) : null}
              <SegmentedTabs
                tabs={[
                  { id: 'overview', label: 'Overview' },
                  { id: 'actions', label: 'Actions' },
                  { id: 'activity', label: 'Activity' },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
              />
            </div>
          </div>

          {activeTab === 'overview' && selectedNode ? (
            <div className="grid gap-4">
              <NodeDetailPanel node={selectedNode} connectedAddress={props.connectedAddress} />
              <ProviderRegistry node={selectedNode} connectedAddress={props.connectedAddress} />
            </div>
          ) : null}

          {activeTab === 'actions' ? actionsContent : null}

          {activeTab === 'activity' ? (
            <BondActivityPanel
              items={props.bondActivity}
              error={props.activityError}
              isLoading={props.isActivityLoading}
              nodeAddress={selectedNode?.nodeAddress ?? null}
              embedded
            />
          ) : null}
        </div>
      </WorkspaceShell>
    </div>
  )
}
