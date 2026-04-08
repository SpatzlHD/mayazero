import {
  createDefaultSdkClient,
  ExtensionWalletAdapter,
  SdkVaultAdapter,
  type ExtensionWindowLike,
  type ManagerOperationController,
  type SdkClientLike,
  type WalletSessionAdapter,
} from './adapters'
import { canSwitchChainInExtension, getExtensionProviderKey } from './chains'
import { serializeWalletError, WalletSessionNotFoundError } from './errors'
import type {
  MayaWalletState,
  WalletChain,
  WalletCommandName,
  WalletCommandResult,
  WalletExecuteOptions,
  WalletManagerOperationName,
  WalletOperation,
  WalletOperationName,
  WalletPreferences,
  WalletSession,
} from './types'

type WalletPrefsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type MayaWalletManagerOptions = {
  sdk?: SdkClientLike
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
  balancesBySession: {},
  txStatusBySession: {},
}

const defaultPrefs: WalletPreferences = {
  selectedSessionId: null,
  preferredVaultId: null,
  activeChain: null,
}

export class MayaWalletManager {
  private readonly sdk: SdkClientLike
  private readonly extensionWindow: ExtensionWindowLike | undefined
  private readonly prefsStorage?: WalletPrefsStorage
  private readonly storageKey: string
  private readonly listeners = new Set<() => void>()
  private readonly adapters = new Map<string, WalletSessionAdapter>()
  private readonly prefs: WalletPreferences
  private initializePromise?: Promise<void>
  private readonly ownsSdk: boolean
  private state: MayaWalletState

  constructor(options: MayaWalletManagerOptions = {}) {
    this.sdk = options.sdk ?? createDefaultSdkClient()
    this.ownsSdk = !options.sdk
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
          await this.sdk.initialize()
          await this.refreshSessions()
          this.patchState({
            initialized: true,
            initializing: false,
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
    if (this.ownsSdk) {
      this.sdk.dispose()
    }
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

      const vaults = await this.sdk.listVaults()
      for (const vault of vaults) {
        const adapter = new SdkVaultAdapter(vault)
        freshAdapters.set(adapter.id, adapter)
        freshSessions.push(await adapter.refreshSession())
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

      if (activeSession?.source === 'sdk') {
        const vault = vaults.find((candidate) => candidate.id === activeSession.id)
        await this.sdk.setActiveVault(vault ?? null)
      } else {
        await this.sdk.setActiveVault(null)
      }

      return freshSessions
    })
  }

  async selectSession(sessionId: string): Promise<void> {
    const session = this.state.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) {
      throw new WalletSessionNotFoundError(sessionId)
    }

    this.prefs.selectedSessionId = sessionId
    if (session.source === 'sdk') {
      this.prefs.preferredVaultId = sessionId
      const vault = (await this.sdk.listVaults()).find(
        (candidate) => candidate.id === sessionId,
      )
      await this.sdk.setActiveVault(vault ?? null)
    } else {
      await this.sdk.setActiveVault(null)
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

    if (session.source !== 'extension') {
      return true
    }

    const chain = options?.chain ?? this.state.activeChain ?? session.chains[0] ?? null
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

  async execute<K extends WalletCommandName>(
    command: K,
    options: WalletExecuteOptions<K>,
  ): Promise<WalletCommandResult<K>> {
    const session = this.resolveSession(options.sessionId)
    const adapter = this.adapters.get(session.id)
    if (!adapter) {
      throw new WalletSessionNotFoundError(session.id)
    }

    const operation = options.track === false ? undefined : this.beginOperation(command, session.id, options.input)

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

  async createFastVault(options: {
    name: string
    email: string
    password: string
    signal?: AbortSignal
  }): Promise<{ vaultId: string }> {
    return this.runManagerOperation('vault.create.fast', null, async (operation) => {
      const vaultId = await this.sdk.createFastVault({
        ...options,
        onProgress: (step) => {
          operation?.update({
            progress: {
              step: step.step,
              message: step.message,
              value: step.progress,
            },
          })
        },
      })

      return { vaultId }
    })
  }

  async verifyFastVault(vaultId: string, code: string): Promise<{ vaultId: string }> {
    return this.runManagerOperation('vault.verify.fast', null, async () => {
      const vault = await this.sdk.verifyVault(vaultId, code)
      await this.refreshSessions()
      await this.selectSession(vault.id)
      return { vaultId: vault.id }
    })
  }

  async createSecureVault(options: {
    name: string
    password?: string
    devices: number
    threshold?: number
    signal?: AbortSignal
  }): Promise<{ vaultId: string; sessionId: string }> {
    return this.runManagerOperation('vault.create.secure', null, async (operation) => {
      const result = await this.sdk.createSecureVault({
        ...options,
        onProgress: (step) => {
          operation?.update({
            progress: {
              step: step.step,
              message: step.message,
              value: step.progress,
            },
          })
        },
        onQRCodeReady: (qrPayload) => {
          operation?.update({ qrPayload })
        },
        onDeviceJoined: (deviceId, joined, required) => {
          operation?.update({
            deviceJoin: { deviceId, joined, required },
          })
        },
      })
      await this.refreshSessions()
      await this.selectSession(result.vault.id)
      return { vaultId: result.vaultId, sessionId: result.sessionId }
    })
  }

  async joinSecureVault(
    qrPayload: string,
    options: {
      mnemonic?: string
      password?: string
      devices?: number
      usePhantomSolanaPath?: boolean
      signal?: AbortSignal
    },
  ): Promise<{ vaultId: string }> {
    return this.runManagerOperation('vault.join.secure', null, async (operation) => {
      const result = await this.sdk.joinSecureVault(qrPayload, {
        ...options,
        onProgress: (step) => {
          operation?.update({
            progress: {
              step: step.step,
              message: step.message,
              value: step.progress,
            },
          })
        },
        onDeviceJoined: (deviceId, joined, required) => {
          operation?.update({
            deviceJoin: { deviceId, joined, required },
          })
        },
      })
      await this.refreshSessions()
      await this.selectSession(result.vault.id)
      return { vaultId: result.vaultId }
    })
  }

  async importVault(
    vultContent: string,
    password?: string,
  ): Promise<{ vaultId: string }> {
    return this.runManagerOperation('vault.import', null, async () => {
      const vault = await this.sdk.importVault(vultContent, password)
      await this.refreshSessions()
      await this.selectSession(vault.id)
      return { vaultId: vault.id }
    })
  }

  async deleteVault(vaultId: string): Promise<void> {
    await this.runManagerOperation('vault.delete', vaultId, async () => {
      const vault = (await this.sdk.listVaults()).find(
        (candidate) => candidate.id === vaultId,
      )
      if (!vault) {
        throw new WalletSessionNotFoundError(vaultId)
      }

      await vault.delete()
      if (this.prefs.preferredVaultId === vaultId) {
        this.prefs.preferredVaultId = null
      }
      if (this.prefs.selectedSessionId === vaultId) {
        this.prefs.selectedSessionId = null
      }
      await this.refreshSessions()
    })
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
  ): ManagerOperationController {
    const operation: WalletOperation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      sessionId,
      status: 'pending',
      startedAt: Date.now(),
      input,
    }

    this.patchState({
      operations: [operation, ...this.state.operations].slice(0, 20),
    })

    return {
      operation,
      update: (patch) => {
        this.patchState({
          operations: this.state.operations.map((candidate) =>
            candidate.id === operation.id
              ? { ...candidate, ...patch }
              : candidate,
          ),
        })
      },
    }
  }

  private async runManagerOperation<T>(
    name: WalletManagerOperationName,
    sessionId: string | null,
    handler: (operation?: ManagerOperationController) => Promise<T>,
  ): Promise<T> {
    const operation = this.beginOperation(name, sessionId)
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
      this.prefs.preferredVaultId,
      (await this.sdk.getActiveVault())?.id ?? null,
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

    if (command === 'vault.rename') {
      const output = result as WalletCommandResult<'vault.rename'>
      this.patchState({
        sessions: this.state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                label: output.name,
                vaultMeta: session.vaultMeta
                  ? { ...session.vaultMeta, name: output.name }
                  : session.vaultMeta,
              }
            : session,
        ),
      })
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
      return {
        ...defaultPrefs,
        ...(JSON.parse(raw) as Partial<WalletPreferences>),
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
