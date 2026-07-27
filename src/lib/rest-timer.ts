/**
 * Rest-interval timing derived from logged RPE (PRD 10 Batch 2 / issue #60).
 *
 * Suggested durations follow de Salles BF et al. "Rest interval between sets in
 * strength training." Sports Med. 2009;39(9):765-777 and Schoenfeld BJ et al.
 * "Longer interset rest periods enhance muscle strength and hypertrophy in
 * resistance-trained men." J Strength Cond Res. 2016;30(7):1805-12.
 */

const MS_PER_MINUTE = 60_000

/** RPE 6-7: submaximal — shorter rest sufficient. */
export const REST_MS_SUBMAXIMAL = 2 * MS_PER_MINUTE

/** RPE 8: approaching failure. */
export const REST_MS_APPROACHING_FAILURE = 2.5 * MS_PER_MINUTE

/** RPE 9-10: longer rest preserves subsequent volume. */
export const REST_MS_NEAR_MAX = 3 * MS_PER_MINUTE

const DEFAULT_RPE = 7

export type RestTimerUrlState = {
  restEnd?: number
  restDur?: number
}

export type RestTimerSnapshot = {
  endAtMs: number | null
  durationMs: number | null
  lastRpe: number | null
}

type RestTimerListener = () => void

let snapshot: RestTimerSnapshot = {
  endAtMs: null,
  durationMs: null,
  lastRpe: null,
}

const listeners = new Set<RestTimerListener>()


const SESSION_KEY = 'fittrack-rest-timer'

function readPersistedSnapshot(): RestTimerSnapshot | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as RestTimerSnapshot
    if (
      typeof parsed === 'object' &&
      (parsed.endAtMs === null || typeof parsed.endAtMs === 'number') &&
      (parsed.durationMs === null || typeof parsed.durationMs === 'number') &&
      (parsed.lastRpe === null || typeof parsed.lastRpe === 'number')
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

function persistSnapshot(): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  if (snapshot.endAtMs === null && snapshot.lastRpe === null) {
    sessionStorage.removeItem(SESSION_KEY)
    return
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot))
}

function restorePersistedSnapshot(): void {
  const persisted = readPersistedSnapshot()
  if (!persisted) {
    return
  }
  snapshot = persisted
}

function emit(): void {
  persistSnapshot()
  for (const listener of listeners) {
    listener()
  }
}


/** Suggest rest duration from logged RPE (de Salles 2009; Schoenfeld 2016). */
export function suggestRestDurationMs(rpe: number): number {
  if (rpe <= 7) {
    return REST_MS_SUBMAXIMAL
  }
  if (rpe === 8) {
    return REST_MS_APPROACHING_FAILURE
  }
  return REST_MS_NEAR_MAX
}

/** Target end timestamp from wall clock — never decrement a counter on an interval. */
export function computeEndAtMs(nowMs: number, durationMs: number): number {
  return nowMs + durationMs
}

/** Remaining rest derived from the target end timestamp and current clock. */
export function remainingRestMs(endAtMs: number, nowMs: number): number {
  return Math.max(0, endAtMs - nowMs)
}

export function isRestComplete(endAtMs: number, nowMs: number): boolean {
  return nowMs >= endAtMs
}

/** Progress fill percentage for a determinate rest bar (0–100). */
export function restProgressPercent(
  endAtMs: number,
  durationMs: number,
  nowMs: number,
): number {
  if (durationMs <= 0) {
    return 0
  }
  const remaining = remainingRestMs(endAtMs, nowMs)
  const elapsed = durationMs - remaining
  return Math.min(100, Math.max(0, (elapsed / durationMs) * 100))
}

/** Gym-friendly countdown label (ceil seconds so 0:01 shows until the second elapses). */
export function formatRestCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function parseRestTimerSearch(search: Record<string, unknown>): RestTimerUrlState {
  return {
    restEnd: parseSearchInt(search.restEnd),
    restDur: parseSearchInt(search.restDur),
  }
}

function parseSearchInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function getRestTimerSnapshot(): RestTimerSnapshot {
  return snapshot
}

export function subscribeRestTimer(listener: RestTimerListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Hydrate in-memory timer state from URL search params (survives refresh). */
export function hydrateRestTimerFromUrl(url: RestTimerUrlState, nowMs: number): void {
  if (url.restEnd == null || url.restDur == null) {
    return
  }
  if (url.restEnd <= nowMs) {
    return
  }
  snapshot = {
    endAtMs: url.restEnd,
    durationMs: url.restDur,
    lastRpe: snapshot.lastRpe,
  }
  emit()
}

export function startRestTimer(rpe: number, nowMs: number): void {
  const durationMs = suggestRestDurationMs(rpe)
  snapshot = {
    endAtMs: computeEndAtMs(nowMs, durationMs),
    durationMs,
    lastRpe: rpe,
  }
  emit()
}

export function stopRestTimer(): void {
  if (snapshot.endAtMs == null) {
    return
  }
  snapshot = { ...snapshot, endAtMs: null }
  emit()
}

export function resetRestTimer(nowMs: number): void {
  const rpe = snapshot.lastRpe ?? DEFAULT_RPE
  const durationMs = snapshot.durationMs ?? suggestRestDurationMs(rpe)
  snapshot = {
    endAtMs: computeEndAtMs(nowMs, durationMs),
    durationMs,
    lastRpe: rpe,
  }
  emit()
}

export function manualStartRestTimer(nowMs: number): void {
  const rpe = snapshot.lastRpe ?? DEFAULT_RPE
  startRestTimer(rpe, nowMs)
}

export function clearRestTimer(): void {
  snapshot = {
    endAtMs: null,
    durationMs: null,
    lastRpe: null,
  }
  emit()
}

/** Test-only reset for Vitest isolation. */
export function restoreRestTimerFromSession(): void {
  const persisted = readPersistedSnapshot()
  if (!persisted) {
    return
  }
  snapshot = persisted
  emit()
}

export function resetRestTimerModule(): void {
  snapshot = {
    endAtMs: null,
    durationMs: null,
    lastRpe: null,
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY)
  }
  emit()
}

export function restTimerSearchFromState(nowMs: number): RestTimerUrlState {
  if (snapshot.endAtMs == null || snapshot.durationMs == null) {
    return {}
  }
  if (snapshot.endAtMs <= nowMs) {
    return {}
  }
  return {
    restEnd: snapshot.endAtMs,
    restDur: snapshot.durationMs,
  }
}

export function isRestTimerActive(nowMs: number): boolean {
  return snapshot.endAtMs != null && snapshot.endAtMs > nowMs
}

/** Optional completion cue — failures are ignored (issue #60). */
export function playRestCompleteCue(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.frequency.value = 880
    gain.gain.value = 0.08
    oscillator.start()
    oscillator.stop(context.currentTime + 0.18)
  } catch {
    // Optional audio — do not block completion feedback.
  }
}

export function shouldMountRestTimer(
  pathname: string,
  snapshot: RestTimerSnapshot,
): boolean {
  if (pathname === '/workout' || pathname.startsWith('/workout/')) {
    return true
  }
  return snapshot.endAtMs !== null || snapshot.lastRpe !== null
}
