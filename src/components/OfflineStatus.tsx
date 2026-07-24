import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import {
  getOfflineState,
  getQueuedMutations,
  startOfflineSupport,
  subscribeToOfflineState,
  syncOutbox,
  type OfflineState,
} from '~/lib/offline'
import type { QueuedMutationKind } from '~/lib/sync'

const KIND_LABELS: Record<QueuedMutationKind, string> = {
  addFoodLogEntry: 'Food log entry',
  deleteFoodLogEntry: 'Deleted food entry',
  logBodyweight: 'Bodyweight',
  addFood: 'Custom food',
  createWorkoutSession: 'Workout session',
  addWorkoutSet: 'Workout set',
}

/**
 * Subscribes to connectivity and outbox size, and boots offline support on
 * first mount. Returns null until mounted so the server-rendered markup (which
 * cannot know the device's connectivity) matches the first client render.
 */
export function useOfflineState(): OfflineState | null {
  const [state, setState] = useState<OfflineState | null>(null)

  useEffect(() => {
    startOfflineSupport()
    setState(getOfflineState())
    return subscribeToOfflineState(setState)
  }, [])

  return state
}

export function OfflineStatus() {
  const state = useOfflineState()
  const [pendingKinds, setPendingKinds] = useState<QueuedMutationKind[]>([])

  const pending = state?.pending ?? 0

  useEffect(() => {
    if (pending === 0) {
      setPendingKinds([])
      return
    }
    let active = true
    void getQueuedMutations().then((queued) => {
      if (active) setPendingKinds(queued.map((entry) => entry.kind))
    })
    return () => {
      active = false
    }
  }, [pending])

  if (!state) return null

  const offline = state.online === false
  if (!offline && pending === 0 && !state.lastError) return null

  const status = offline ? 'warning' : state.lastError ? 'error' : 'info'
  const changes = `${pending} change${pending === 1 ? '' : 's'}`

  const title = offline
    ? "You're offline"
    : state.lastError
      ? 'Some changes could not be saved'
      : `${changes} waiting to sync`

  const description = offline
    ? pending > 0
      ? `${changes} saved on this device. They'll sync automatically when you reconnect.`
      : 'Your cached food database and recent logs are still available. Anything you log is saved on this device.'
    : state.lastError || 'Syncing your offline changes now.'

  const showSyncButton = offline === false && pending > 0

  return (
    <div style={{ marginBottom: '16px' }}>
      <Banner
        status={status}
        title={title}
        description={description}
        endContent={
          showSyncButton ? (
            <Button
              label={state.syncing ? 'Syncing' : 'Sync now'}
              variant="secondary"
              size="sm"
              isLoading={state.syncing}
              clickAction={async () => {
                await syncOutbox()
              }}
            />
          ) : undefined
        }
      >
        {pendingKinds.length > 0 ? <PendingList kinds={pendingKinds} /> : undefined}
      </Banner>
    </div>
  )
}

function PendingList({ kinds }: { kinds: QueuedMutationKind[] }) {
  const counts = kinds.reduce<Partial<Record<QueuedMutationKind, number>>>((acc, kind) => {
    acc[kind] = (acc[kind] ?? 0) + 1
    return acc
  }, {})

  return (
    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8125rem', lineHeight: 1.8 }}>
      {Object.entries(counts).map(([kind, count]) => (
        <li key={kind}>
          {KIND_LABELS[kind as QueuedMutationKind]} &times; {count}
        </li>
      ))}
    </ul>
  )
}
