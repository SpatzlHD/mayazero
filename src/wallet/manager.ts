import {
  ExtensionWalletAdapter,
  type ExtensionWindowLike,
} from './extension-adapter'
import { LocalKeystoreAdapter } from './keystore-adapter'
import {
  WalletConnectAdapter,
  disconnectWalletConnectSession,
} from './walletconnect-adapter'
import {
  listStoredKeystores,
  deleteStoredKeystore,
  importXChainKeystoreWallet,
  importMnemonicKeystoreWallet,
  getStoredKeystore,
} from './keystore-store'
import { deriveKeystoreAddresses } from './local-signer'
import {
  connectWalletConnect as connectWalletConnectSession,
  getWalletConnectSnapshot,
} from './walletconnect-client'
import { walletConnectNamespaceForChain, walletChainToWalletConnectId } from './walletconnect-config'
import type {
  ManagerOperationController,
  WalletSessionAdapter,
} from './adapter-types'
import { toChainCountBucket, trackAnalyticsEvent } from '#/analytics'
import {
  canSwitchChainInExtension,
  getExtensionProviderKey,
} from './chains'
import { decryptXChainKeystoreMnemonic, normalizeMnemonic } from './import-utils'
import { serializeWalletError, WalletSessionNotFoundError } from './errors'
import type {
  MayaWalletState,
  WalletChain,
  WalletCommandName,
  WalletCommandResult,
  WalletExecuteOptions,
  WalletJourney,
  WalletJourneyStep,
  WalletJourneyStatus,
  WalletManagerOperationName,
  WalletOperation,
  WalletOperationName,
  WalletPreferences,
  WalletSession,
} from './types'

type WalletPrefsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type MayaWalletManagerOptions = {
  extensionWindow?: ExtensionWindowLike
  prefsStorage?: WalletPrefsStorage
  storageKey?: string
}

const defaultState: MayaWalletState = {
  initialized: false,
  initializing: false,
  sessions: [],
  activeSessionId: null,
  activeChain: null,
  operations: [],
  journeys: [],
  journeyDialog: {
    isOpen: false,
    activeJourneyId: null,
  },
  balanceRefreshTick: 0,
  balancesBySession: {},
  txStatusBySession: {},
}

const defaultPrefs: WalletPreferences = {
  selectedSessionId: null,
  preferredKeystoreId: null,
  activeChain: null,
}

export class MayaWalletManager {
  private readonly extensionWindow: ExtensionWindowLike | undefined
  private readonly prefsStorage?: WalletPrefsStorage
  private readonly storageKey: string
  private readonly listeners = new Set<() => void>()
  private readonly adapters = new Map<string, WalletSessionAdapter>()
  private readonly keystoreAdapters = new Map<string, LocalKeystoreAdapter>()
  private readonly prefs: WalletPreferences
  private initializePromise?: Promise<void>
  private state: MayaWalletState

  constructor(options: MayaWalletManagerOptions = {}) {
    this.extensionWindow =
      options.extensionWindow ??
      (typeof window !== 'undefined'
        ? (window as unknown as ExtensionWindowLike)
        : undefined)
    this.prefsStorage =
      options.prefsStorage ??
      (typeof window !== 'undefined' ? window.localStorage : undefined)
    this.storageKey = options.storageKey ?? 'maya-wallet-manager'
    this.prefs = this.loadPrefs()
    this.state = {
      ...defaultState,
      activeSessionId: this.prefs.selectedSessionId,
      activeChain: this.prefs.activeChain,
    }
  }

  getState = (): MayaWalletState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async initialize(): Promise<void> {
    if (this.state.initialized) {
      return
    }

    if (!this.initializePromise) {
      this.initializePromise = this.runManagerOperation(
        'manager.initialize',
        null,
        async () => {
          this.patchState({ initializing: true })
          await this.refreshSessions()
          const legacyVaultDetected =
            !this.prefs.legacyVaultMigrationDismissed &&
            (await this.detectLegacyVultisigIndexedDb())
          this.patchState({
            initialized: true,
            initializing: false,
            legacyVaultDetected,
          })
        },
      ).finally(() => {
        this.initializePromise = undefined
      })
    }

    return this.initializePromise
  }

  dispose(): void {
    for (const adapter of this.adapters.values()) {
      adapter.dispose?.()
    }
    this.adapters.clear()
    this.keystoreAdapters.clear()
  }

  async refreshSessions(): Promise<WalletSession[]> {
    return this.runManagerOperation('manager.refresh', null, async () => {
      const freshAdapters = new Map<string, WalletSessionAdapter>()
      const freshSessions: WalletSession[] = []

      const extensionAdapter = new ExtensionWalletAdapter(
        this.extensionWindow,
        () => {
          void this.refreshSessions()
        },
      )
      const extensionSession = await extensionAdapter.refreshSession()
      if (extensionSession) {
        freshAdapters.set(extensionAdapter.id, extensionAdapter)
        freshSessions.push(extensionSession)
      }

      const storedKeystores = await listStoredKeystores()
      const storedKeystoreIds = new Set(storedKeystores.map((record) => record.id))
      for (const record of storedKeystores) {
        let adapter = this.keystoreAdapters.get(record.id)
        if (!adapter) {
          adapter = new LocalKeystoreAdapter(record)
          this.keystoreAdapters.set(record.id, adapter)
        }
        freshAdapters.set(adapter.id, adapter)
        freshSessions.push(await adapter.refreshSession())
      }

      for (const [keystoreId, adapter] of this.keystoreAdapters.entries()) {
        if (!storedKeystoreIds.has(keystoreId)) {
          adapter.lock()
          this.keystoreAdapters.delete(keystoreId)
        }
      }

      if (getWalletConnectSnapshot()) {
        let walletConnectAdapter = this.adapters.get('walletconnect:session')
        if (!(walletConnectAdapter instanceof WalletConnectAdapter)) {
          walletConnectAdapter = new WalletConnectAdapter(() => {
            void this.refreshSessions()
          })
        }
        freshAdapters.set(walletConnectAdapter.id, walletConnectAdapter)
        const walletConnectSession = await walletConnectAdapter.refreshSession()
        if (walletConnectSession) {
          freshSessions.push(walletConnectSession)
        }
      }

      for (const previousAdapter of this.adapters.values()) {
        if (!freshAdapters.has(previousAdapter.id)) {
          previousAdapter.dispose?.()
        }
      }

      this.adapters.clear()
      for (const [id, adapter] of freshAdapters) {
        this.adapters.set(id, adapter)
      }

      const activeSessionId = await this.resolveActiveSessionId(freshSessions)
      const activeSession = freshSessions.find(
        (session) => session.id === activeSessionId,
      )
      const activeChain = this.resolveActiveChain(activeSession)

      this.patchState({
        sessions: freshSessions,
        activeSessionId,
        activeChain,
      })
      this.persistPrefs()

      return freshSessions
    })
  }

  async selectSession(sessionId: string): Promise<void> {
    const session = this.state.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) {
      throw new WalletSessionNotFoundError(sessionId)
    }

    this.prefs.selectedSessionId = sessionId
    if (session.source === 'keystore') {
      this.prefs.preferredKeystoreId = sessionId
    }

    const activeChain = this.resolveActiveChain(session)
    this.patchState({
      activeSessionId: sessionId,
      activeChain,
    })
    this.persistPrefs()
  }

  async selectChain(chain: WalletChain): Promise<void> {
    this.prefs.activeChain = chain
    this.patchState({ activeChain: chain })
    this.persistPrefs()
  }

  createJourney(input: {
    kind: WalletJourney['kind']
    title: string
    sessionId?: string | null
    source?: WalletJourney['source']
    chain?: WalletJourney['chain']
    routePath?: string
    steps: WalletJourneyStep[]
    requiresAttention?: boolean
    openOnUpdate?: boolean
  }): string {
    const journey: WalletJourney = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: input.kind,
      title: input.title,
      sessionId: input.sessionId ?? this.state.activeSessionId,
      source: input.source,
      chain: input.chain,
      status: input.requiresAttention ? 'attention' : 'pending',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      routePath: input.routePath,
      steps: input.steps,
      requiresAttention: input.requiresAttention ?? false,
      openOnUpdate: input.openOnUpdate ?? false,
    }

    this.patchState({
      journeys: [journey, ...this.state.journeys].slice(0, 20),
    })

    return journey.id
  }

  patchJourney(
    journeyId: string,
    patch:
      | Partial<WalletJourney>
      | ((current: WalletJourney) => Partial<WalletJourney> | null),
  ): void {
    let didUpdate = false
    const journeys = this.state.journeys.map((journey) => {
      if (journey.id !== journeyId) {
        return journey
      }

      const resolvedPatch =
        typeof patch === 'function' ? patch(journey) : patch
      if (!resolvedPatch) {
        return journey
      }

      didUpdate = true
      const nextStatus = resolvedPatch.status ?? journey.status
      return {
        ...journey,
        ...resolvedPatch,
        endedAt:
          resolvedPatch.endedAt ??
          (nextStatus === 'success' ||
          nextStatus === 'error' ||
          nextStatus === 'cancelled' ||
          nextStatus === 'unconfirmed' ||
          nextStatus === 'submitted_no_hash'
            ? journey.endedAt ?? Date.now()
            : journey.endedAt),
        updatedAt: Date.now(),
      }
    })

    if (didUpdate) {
      this.patchState({ journeys })
    }
  }

  completeJourney(
    journeyId: string,
    input: {
      result?: unknown
      status?: Exclude<WalletJourneyStatus, 'pending' | 'attention'>
      requiresAttention?: boolean
      openOnUpdate?: boolean
    } = {},
  ): void {
    this.patchJourney(journeyId, {
      status: input.status ?? 'success',
      result: input.result,
      endedAt: Date.now(),
      requiresAttention: input.requiresAttention ?? false,
      openOnUpdate: input.openOnUpdate ?? true,
    })

    const journey = this.state.journeys.find((item) => item.id === journeyId)
    const nextStatus = input.status ?? 'success'
    if (
      journey &&
      this.isBalanceRelevantJourney(journey) &&
      nextStatus !== 'cancelled' &&
      nextStatus !== 'error'
    ) {
      this.patchState({
        balanceRefreshTick: this.state.balanceRefreshTick + 1,
      })
    }
  }

  dismissJourney(journeyId: string): void {
    this.patchState({
      journeys: this.state.journeys.filter((journey) => journey.id !== journeyId),
      journeyDialog:
        this.state.journeyDialog.activeJourneyId === journeyId
          ? { isOpen: false, activeJourneyId: null }
          : this.state.journeyDialog,
    })
  }

  openJourneyDialog(journeyId?: string | null): void {
    this.patchState({
      journeyDialog: {
        isOpen: true,
        activeJourneyId:
          journeyId ??
          this.state.journeyDialog.activeJourneyId ??
          this.state.journeys[0]?.id ??
          null,
      },
    })
  }

  closeJourneyDialog(): void {
    this.patchState({
      journeyDialog: {
        ...this.state.journeyDialog,
        isOpen: false,
      },
    })
  }

  canExecute(
    command: WalletCommandName,
    options?: {
      sessionId?: string
      chain?: WalletChain | null
    },
  ): boolean {
    const session = options?.sessionId
      ? this.state.sessions.find((candidate) => candidate.id === options.sessionId)
      : this.state.sessions.find(
          (candidate) => candidate.id === this.state.activeSessionId,
        )

    if (!session) {
      return false
    }

    const adapter = this.adapters.get(session.id)
    if (!adapter || !adapter.capabilities.includes(command)) {
      return false
    }

    if (session.source === 'extension') {
      const chain =
        options?.chain ?? this.state.activeChain ?? session.chains[0] ?? null
      if (!chain) {
        return command === 'accounts.list' || command === 'addresses.list'
      }

      const providerKey = getExtensionProviderKey(chain)
      if (!providerKey) {
        return false
      }

      switch (command) {
        case 'balance.get':
        case 'balances.list':
        case 'message.sign':
          return providerKey === 'ethereum'
        case 'chain.switch':
          return canSwitchChainInExtension(chain)
        default:
          return true
      }
    }

    if (session.source === 'walletconnect') {
      const chain =
        options?.chain ?? this.state.activeChain ?? session.chains[0] ?? null
      if (!chain) {
        return command === 'accounts.list' || command === 'addresses.list'
      }

      switch (command) {
        case 'balance.get':
        case 'balances.list':
        case 'message.sign':
          return walletConnectNamespaceForChain(chain) === 'eip155'
        case 'chain.switch':
          return (
            Boolean(walletChainToWalletConnectId(chain)) &&
            canSwitchChainInExtension(chain)
          )
        default:
          return true
      }
    }

    return true
  }

  async execute<K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
  ): Promise<WalletCommandResult<K>> {
    const session = this.resolveSession(options.sessionId)
    const adapter = this.adapters.get(session.id)
    if (!adapter) {
      throw new WalletSessionNotFoundError(session.id)
    }

    const operation =
      options.track === false
        ? undefined
        : this.beginOperation(command, session.id, options.input, options.journey)

    try {
      const result = await adapter.execute(command, options, {
        activeChain: this.state.activeChain,
        operation,
      })
      operation?.update({
        status: 'success',
        result,
        endedAt: Date.now(),
      })
      this.applyCommandSideEffects(command, session.id, options.input, result)
      if (command === 'accounts.connect') {
        trackAnalyticsEvent({
          type: 'wallet_connected',
          source: session.source,
          session_kind: session.kind,
          chain_count_bucket: toChainCountBucket(session.chains.length),
        })
      }
      return result
    } catch (error) {
      operation?.update({
        status: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'error',
        error: serializeWalletError(error),
        endedAt: Date.now(),
      })
      this.patchState({ lastError: serializeWalletError(error) })
      throw error
    }
  }

  async importKeystoreFromFile(options: {
    label: string
    rawKeystore: string
    keystorePassword: string
    vaultPassword: string
    journeyId?: string
  }): Promise<{ keystoreId: string }> {
    return this.runManagerOperation(
      'keystore.import',
      null,
      async () => {
        const mnemonic = await decryptXChainKeystoreMnemonic(
          options.rawKeystore,
          options.keystorePassword,
        )
        let addresses
        try {
          addresses = await deriveKeystoreAddresses(mnemonic)
        } finally {
          mnemonic.replace(/./g, '\0')
        }

        const record = await importXChainKeystoreWallet({
          label: options.label,
          rawKeystore: options.rawKeystore,
          keystorePassword: options.keystorePassword,
          vaultPassword: options.vaultPassword,
          addresses,
        })
        await this.refreshSessions()
        await this.selectSession(record.id)
        return { keystoreId: record.id }
      },
      options.journeyId
        ? {
            id: options.journeyId,
            stepKey: 'importing',
          }
        : undefined,
    )
  }

  async importKeystoreFromMnemonic(options: {
    label: string
    mnemonic: string
    vaultPassword: string
    journeyId?: string
  }): Promise<{ keystoreId: string }> {
    return this.runManagerOperation(
      'keystore.import',
      null,
      async () => {
        const normalizedMnemonic = normalizeMnemonic(options.mnemonic)
        const addresses = await deriveKeystoreAddresses(normalizedMnemonic)
        const record = await importMnemonicKeystoreWallet({
          label: options.label,
          mnemonic: normalizedMnemonic,
          vaultPassword: options.vaultPassword,
          addresses,
        })
        await this.refreshSessions()
        await this.selectSession(record.id)
        return { keystoreId: record.id }
      },
      options.journeyId
        ? {
            id: options.journeyId,
            stepKey: 'importing',
          }
        : undefined,
    )
  }

  async deleteKeystore(sessionId: string): Promise<void> {
    await this.runManagerOperation('keystore.delete', sessionId, async () => {
      const record = await getStoredKeystore(sessionId)
      if (!record) {
        throw new WalletSessionNotFoundError(sessionId)
      }

      const adapter = this.keystoreAdapters.get(sessionId)
      adapter?.lock()
      this.keystoreAdapters.delete(sessionId)

      await deleteStoredKeystore(sessionId)

      if (this.prefs.preferredKeystoreId === sessionId) {
        this.prefs.preferredKeystoreId = null
      }
      if (this.prefs.selectedSessionId === sessionId) {
        this.prefs.selectedSessionId = null
      }

      await this.refreshSessions()
    })
  }

  async connectWalletConnect(): Promise<void> {
    await connectWalletConnectSession()
    await this.refreshSessions()

    const walletConnectSession = this.state.sessions.find(
      (session) => session.id === 'walletconnect:session',
    )
    if (walletConnectSession) {
      await this.selectSession(walletConnectSession.id)
    }
  }

  async disconnectWalletConnect(): Promise<void> {
    await disconnectWalletConnectSession()
    await this.refreshSessions()
  }

  dismissLegacyVaultMigration(): void {
    this.prefs.legacyVaultMigrationDismissed = true
    this.patchState({ legacyVaultDetected: false })
    this.persistPrefs()
  }

  private patchState(patch: Partial<MayaWalletState>): void {
    this.state = {
      ...this.state,
      ...patch,
    }
    for (const listener of this.listeners) {
      listener()
    }
  }

  private beginOperation(
    name: WalletOperationName,
    sessionId: string | null,
    input?: unknown,
    journey?: { id: string; stepKey?: string },
  ): ManagerOperationController {
    const operation: WalletOperation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      sessionId,
      status: 'pending',
      startedAt: Date.now(),
      input,
      ...(journey
        ? { journeyId: journey.id, journeyStepKey: journey.stepKey }
        : {}),
    }

    this.patchState({
      operations: [operation, ...this.state.operations].slice(0, 20),
    })

    if (journey) {
      this.patchJourney(journey.id, (current) => ({
        operationIds: current.operationIds?.includes(operation.id)
          ? current.operationIds
          : [...(current.operationIds ?? []), operation.id],
      }))
    }

    return {
      operation,
      update: (patch) => {
        const nextOperation = {
          ...operation,
          ...patch,
        }
        this.patchState({
          operations: this.state.operations.map((candidate) =>
            candidate.id === operation.id ? nextOperation : candidate,
          ),
        })
        Object.assign(operation, nextOperation)
        this.applyJourneyOperationPatch(operation, patch)
      },
    }
  }

  private async runManagerOperation<T>(
    name: WalletManagerOperationName,
    sessionId: string | null,
    handler: (operation?: ManagerOperationController) => Promise<T>,
    journey?: { id: string; stepKey?: string },
  ): Promise<T> {
    const operation = this.beginOperation(name, sessionId, undefined, journey)
    try {
      const result = await handler(operation)
      operation.update({
        status: 'success',
        result,
        endedAt: Date.now(),
      })
      return result
    } catch (error) {
      operation.update({
        status: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'error',
        error: serializeWalletError(error),
        endedAt: Date.now(),
      })
      this.patchState({ lastError: serializeWalletError(error) })
      throw error
    }
  }

  private applyJourneyOperationPatch(
    operation: WalletOperation,
    patch: Partial<WalletOperation>,
  ): void {
    if (!operation.journeyId) {
      return
    }

    const stepKey =
      patch.journeyStepKey ??
      operation.journeyStepKey ??
      this.resolveDefaultJourneyStepKey(operation.name)
    const progressStatus =
      patch.progress || patch.qrPayload !== undefined || patch.deviceJoin
        ? stepKey
          ? this.resolveJourneyStepStatus(operation.status)
          : undefined
        : undefined
    const finalStatus =
      patch.status && patch.status !== 'pending'
        ? this.resolveJourneyOutcomeStatus(patch.status)
        : undefined
    const terminalJourneyStatus =
      finalStatus && finalStatus !== 'success' ? finalStatus : undefined

    this.patchJourney(operation.journeyId, (journey) => {
      const nextSteps = stepKey
        ? journey.steps.map((step) => {
            if (step.key !== stepKey) {
              return step
            }

            return {
              ...step,
              status:
                finalStatus && patch.status
                  ? this.resolveJourneyStepStatus(patch.status)
                  : progressStatus ?? step.status,
              message:
                patch.progress?.message ??
                patch.error?.message ??
                step.message,
              progress: patch.progress?.value ?? step.progress,
            }
          })
        : journey.steps

      return {
        steps: nextSteps,
        qrPayload:
          patch.qrPayload !== undefined ? patch.qrPayload : journey.qrPayload,
        deviceJoin: patch.deviceJoin ?? journey.deviceJoin,
        requiresAttention:
          patch.qrPayload !== undefined
            ? Boolean(patch.qrPayload)
            : patch.deviceJoin
              ? true
              : terminalJourneyStatus === 'error'
                ? true
                : journey.requiresAttention,
        openOnUpdate:
          patch.qrPayload !== undefined
            ? Boolean(patch.qrPayload)
            : patch.deviceJoin
              ? true
              : terminalJourneyStatus === 'error'
                ? true
                : journey.openOnUpdate,
        status:
          terminalJourneyStatus ??
          (patch.qrPayload !== undefined || patch.deviceJoin
            ? 'attention'
            : journey.status),
        error: patch.error ?? journey.error,
      }
    })
  }

  private resolveDefaultJourneyStepKey(
    operationName: WalletOperationName,
  ): string | undefined {
    switch (operationName) {
      case 'tx.sign':
      case 'tx.sign.bytes':
        return 'signing'
      case 'tx.broadcast':
      case 'tx.broadcast.raw':
      case 'tx.send':
        return 'broadcasting'
      default:
        return undefined
    }
  }

  private resolveJourneyStepStatus(
    status: WalletOperation['status'],
  ): WalletJourneyStep['status'] {
    switch (status) {
      case 'success':
        return 'success'
      case 'error':
        return 'error'
      case 'cancelled':
        return 'cancelled'
      default:
        return 'active'
    }
  }

  private resolveJourneyOutcomeStatus(
    status: WalletOperation['status'],
  ): WalletJourneyStatus {
    switch (status) {
      case 'success':
        return 'success'
      case 'error':
        return 'error'
      case 'cancelled':
        return 'cancelled'
      default:
        return 'pending'
    }
  }

  private isBalanceRelevantJourney(journey: WalletJourney): boolean {
    return (
      journey.kind === 'swap' ||
      journey.kind === 'liquidity' ||
      journey.kind === 'cacao-pool' ||
      journey.kind === 'pooled-node' ||
      journey.kind === 'mayaname' ||
      journey.kind === 'send'
    )
  }

  private resolveSession(sessionId?: string): WalletSession {
    const resolvedId = sessionId ?? this.state.activeSessionId
    if (!resolvedId) {
      throw new WalletSessionNotFoundError('active')
    }

    const session = this.state.sessions.find((candidate) => candidate.id === resolvedId)
    if (!session) {
      throw new WalletSessionNotFoundError(resolvedId)
    }

    return session
  }

  private async resolveActiveSessionId(
    sessions: WalletSession[],
  ): Promise<string | null> {
    const preferredCandidates = [
      this.prefs.selectedSessionId,
      this.prefs.preferredKeystoreId,
      sessions[0]?.id ?? null,
    ].filter(Boolean) as string[]

    return preferredCandidates.find((id) =>
      sessions.some((session) => session.id === id),
    ) ?? null
  }

  private resolveActiveChain(activeSession?: WalletSession): WalletChain | null {
    if (
      this.prefs.activeChain &&
      activeSession?.chains.includes(this.prefs.activeChain)
    ) {
      return this.prefs.activeChain
    }

    const fallback = activeSession?.chains[0] ?? null
    this.prefs.activeChain = fallback
    return fallback
  }

  private async detectLegacyVultisigIndexedDb(): Promise<boolean> {
    if (
      typeof indexedDB === 'undefined' ||
      typeof indexedDB.databases !== 'function'
    ) {
      return false
    }

    try {
      const databases = await indexedDB.databases()
      return databases.some((database) => database.name?.includes('vultisig'))
    } catch {
      return false
    }
  }

  private applyCommandSideEffects<K extends WalletCommandName>(
    command: K,
    sessionId: string,
    input: WalletExecuteOptions<K>['input'],
    result: WalletCommandResult<K>,
  ): void {
    if (command === 'chain.switch') {
      const output = result as WalletCommandResult<'chain.switch'>
      this.prefs.activeChain = output.chain
      this.patchState({ activeChain: output.chain })
      this.persistPrefs()
      return
    }

    if (command === 'address.get') {
      const output = result as WalletCommandResult<'address.get'>
      this.mergeSessionAddresses(sessionId, {
        [output.chain]: output.address,
      } as Partial<Record<WalletChain, string>>)
      return
    }

    if (command === 'addresses.list') {
      const output = result as WalletCommandResult<'addresses.list'>
      this.mergeSessionAddresses(sessionId, output.addresses)
      return
    }

    if (command === 'accounts.connect' || command === 'accounts.list') {
      const output = result as
        | WalletCommandResult<'accounts.connect'>
        | WalletCommandResult<'accounts.list'>
      const addresses = output.accounts.reduce<Partial<Record<WalletChain, string>>>(
        (
          accumulator: Partial<Record<WalletChain, string>>,
          account,
        ) => {
          accumulator[account.chain] = account.address
          return accumulator
        },
        {},
      )
      this.mergeSessionAddresses(sessionId, addresses)
      return
    }

    if (command === 'balance.get') {
      const output = result as WalletCommandResult<'balance.get'>
      this.patchState({
        balancesBySession: {
          ...this.state.balancesBySession,
          [sessionId]: {
            ...(this.state.balancesBySession[sessionId] ?? {}),
            [output.chain]: output.balance,
          },
        },
      })
      return
    }

    if (command === 'balances.list') {
      const output = result as WalletCommandResult<'balances.list'>
      this.patchState({
        balancesBySession: {
          ...this.state.balancesBySession,
          [sessionId]: {
            ...(this.state.balancesBySession[sessionId] ?? {}),
            ...output.balances,
          },
        },
      })
      return
    }

    if (command === 'tx.status' || command === 'tx.query') {
      const txInput = input as WalletExecuteOptions<'tx.status'>['input']
      const txHash = txInput.txHash
      const output =
        command === 'tx.status'
          ? (result as WalletCommandResult<'tx.status'>).status
          : (result as WalletCommandResult<'tx.query'>).transaction
      this.patchState({
        txStatusBySession: {
          ...this.state.txStatusBySession,
          [sessionId]: {
            ...(this.state.txStatusBySession[sessionId] ?? {}),
            [txHash]: output,
          },
        },
      })
      return
    }

    if (command === 'keystore.lock') {
      void this.refreshSessions()
    }
  }

  private mergeSessionAddresses(
    sessionId: string,
    addresses: Partial<Record<WalletChain, string>>,
  ): void {
    this.patchState({
      sessions: this.state.sessions.map((session) => {
        if (session.id !== sessionId) {
          return session
        }

        const mergedAddresses = {
          ...session.addresses,
          ...addresses,
        }
        return {
          ...session,
          addresses: mergedAddresses,
          accounts: Object.entries(mergedAddresses).flatMap(([chain, address]) =>
            address
              ? [{ chain: chain as WalletChain, address }]
              : [],
          ),
        }
      }),
    })
  }

  private loadPrefs(): WalletPreferences {
    const raw = this.prefsStorage?.getItem(this.storageKey)
    if (!raw) {
      return { ...defaultPrefs }
    }

    try {
      const parsed = JSON.parse(raw) as Partial<WalletPreferences> & {
        preferredVaultId?: string | null
      }
      return {
        ...defaultPrefs,
        ...parsed,
        preferredKeystoreId:
          parsed.preferredKeystoreId ?? parsed.preferredVaultId ?? null,
      }
    } catch {
      this.prefsStorage?.removeItem(this.storageKey)
      return { ...defaultPrefs }
    }
  }

  private persistPrefs(): void {
    this.prefsStorage?.setItem(this.storageKey, JSON.stringify(this.prefs))
  }
}
