// Browser-side offline layer: a cached copy of the reference data and an
// outbox of mutations recorded while the network was unavailable.
//
// The service worker (public/sw.js) covers the app shell and static assets.
// This module owns the data half, because replaying typed mutations with
// idempotency keys is far safer than replaying raw POST bodies from a worker.

import { getOfflineBundle, syncQueuedMutations } from "./api";
import { barcodeLookupVariants, normalizeBarcode } from "./barcode";
import type {
  QueuedMutation,
  QueuedMutationKind,
  QueuedMutationPayloads,
} from "./sync";
import { MAX_SYNC_ATTEMPTS, makeClientId, readQueuedMutations } from "./sync";

export type OfflineBundle = Awaited<ReturnType<typeof getOfflineBundle>>;

export interface OfflineState {
  lastError: string | null;
  lastSyncedAt: string | null;
  online: boolean;
  pending: number;
  syncing: boolean;
}

const DB_NAME = "fittrack-offline";
const DB_VERSION = 1;
const OUTBOX_STORE = "outbox";
const KV_STORE = "kv";
const BUNDLE_KEY = "offline-bundle";
const SYNC_TAG = "fittrack-sync";

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

// --- IndexedDB plumbing ---

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const dbRequest = indexedDB.open(DB_NAME, DB_VERSION);
      dbRequest.onupgradeneeded = () => {
        const db = dbRequest.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          const outbox = db.createObjectStore(OUTBOX_STORE, {
            keyPath: "client_id",
          });
          outbox.createIndex("queued_at", "queued_at");
        }
        if (!db.objectStoreNames.contains(KV_STORE)) {
          db.createObjectStore(KV_STORE, { keyPath: "key" });
        }
      };
      dbRequest.onsuccess = () => resolve(dbRequest.result);
      dbRequest.onerror = () => reject(dbRequest.error);
    });
  }
  return dbPromise;
}

function request<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const result = run(transaction.objectStore(storeName));
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      })
  );
}

// --- Reference data cache ---

/** Fetch the latest bundle and store it for offline reads. */
export async function refreshOfflineBundle(): Promise<OfflineBundle | null> {
  if (!isBrowser()) {
    return null;
  }
  try {
    const bundle = await getOfflineBundle();
    await request(KV_STORE, "readwrite", (store) =>
      store.put({ key: BUNDLE_KEY, value: bundle })
    );
    return bundle;
  } catch {
    // Offline or the server is unreachable; the previous bundle stays valid.
    return null;
  }
}

export async function readOfflineBundle(): Promise<OfflineBundle | null> {
  if (!isBrowser()) {
    return null;
  }
  try {
    const row = await request<
      { key: string; value: OfflineBundle } | undefined
    >(KV_STORE, "readonly", (store) => store.get(BUNDLE_KEY));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Offline stand-in for the searchFoods server function. Mirrors its behaviour:
 * a case-insensitive substring match on name or brand, name-ordered (the
 * bundle already arrives sorted).
 */
export async function searchCachedFoods(
  query: string,
  limit = 20
): Promise<OfflineBundle["foods"]> {
  const bundle = await readOfflineBundle();
  if (!bundle) {
    return [];
  }
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }
  return bundle.foods
    .filter(
      (food) =>
        food.name.toLowerCase().includes(needle) ||
        (food.brand ?? "").toLowerCase().includes(needle)
    )
    .slice(0, limit);
}

/** Offline stand-in for getFoodByBarcode (issue #58). */
export async function getCachedFoodByBarcode(
  barcode: string
): Promise<OfflineBundle["foods"][number] | null> {
  const bundle = await readOfflineBundle();
  if (!bundle) {
    return null;
  }
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return null;
  }
  const variants = new Set(barcodeLookupVariants(normalized));
  return (
    bundle.foods.find(
      (food) => food.barcode !== null && variants.has(food.barcode)
    ) ?? null
  );
}

/** Offline stand-in for the getFoodLog server function. */
export async function getCachedFoodLog(
  date: string
): Promise<OfflineBundle["food_log"]> {
  const bundle = await readOfflineBundle();
  if (!bundle) {
    return [];
  }
  return bundle.food_log.filter((entry) => entry.date === date);
}

// --- Mutation outbox ---

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  if (!isBrowser()) {
    return [];
  }
  try {
    const all = await request<unknown[]>(OUTBOX_STORE, "readonly", (store) =>
      store.getAll()
    );
    // Oldest first: a workout session must be replayed before its sets.
    return readQueuedMutations(all).sort((a, b) =>
      a.queued_at.localeCompare(b.queued_at)
    );
  } catch {
    return [];
  }
}

export async function getQueueSize(): Promise<number> {
  if (!isBrowser()) {
    return 0;
  }
  try {
    return await request<number>(OUTBOX_STORE, "readonly", (store) =>
      store.count()
    );
  } catch {
    return 0;
  }
}

export async function queueMutation<K extends QueuedMutationKind>(
  kind: K,
  payload: QueuedMutationPayloads[K]
): Promise<QueuedMutation> {
  const entry = {
    attempts: 0,
    client_id: makeClientId(),
    kind,
    payload,
    queued_at: new Date().toISOString(),
  } as QueuedMutation;

  await request(OUTBOX_STORE, "readwrite", (store) => store.put(entry));
  void requestBackgroundSync();
  await publishState();
  return entry;
}

async function removeFromOutbox(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) {
    return;
  }
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE, "readwrite");
    const store = transaction.objectStore(OUTBOX_STORE);
    for (const id of clientIds) {
      store.delete(id);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function recordFailure(clientId: string, message: string): Promise<void> {
  const existing = await request<QueuedMutation | undefined>(
    OUTBOX_STORE,
    "readonly",
    (store) => store.get(clientId)
  );
  if (!existing) {
    return;
  }

  const attempts = existing.attempts + 1;
  if (attempts >= MAX_SYNC_ATTEMPTS) {
    // Stop retrying a mutation the server keeps rejecting so it cannot block
    // everything queued behind it.
    await removeFromOutbox([clientId]);
    return;
  }

  await request(OUTBOX_STORE, "readwrite", (store) =>
    store.put({ ...existing, attempts, last_error: message })
  );
}

// --- Sync ---

let syncing = false;
let lastSyncedAt: string | null = null;
let lastError: string | null = null;

/**
 * Replay everything in the outbox. Safe to call repeatedly: entries carry
 * idempotency keys, so a batch the server already accepted comes back marked
 * as a duplicate rather than being applied twice.
 */
export async function syncOutbox(): Promise<{
  applied: number;
  failed: number;
}> {
  if (!isBrowser() || syncing || !navigator.onLine) {
    return { applied: 0, failed: 0 };
  }

  const queued = await getQueuedMutations();
  if (queued.length === 0) {
    return { applied: 0, failed: 0 };
  }

  syncing = true;
  lastError = null;
  await publishState();

  try {
    const result = await syncQueuedMutations({ data: { mutations: queued } });

    const settled = result.outcomes
      .filter(
        (outcome) =>
          outcome.status === "applied" || outcome.status === "duplicate"
      )
      .map((outcome) => outcome.client_id);
    await removeFromOutbox(settled);

    for (const outcome of result.outcomes) {
      if (outcome.status === "failed") {
        await recordFailure(
          outcome.client_id,
          outcome.error ?? "unknown error"
        );
      }
    }

    lastSyncedAt = result.synced_at;
    if (result.failed > 0) {
      lastError = `${result.failed} change${result.failed === 1 ? "" : "s"} could not be saved`;
    }

    // Recent logs just changed server-side; pull a fresh copy for offline use.
    if (result.applied > 0) {
      await refreshOfflineBundle();
    }

    return { applied: result.applied, failed: result.failed };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Sync failed";
    return { applied: 0, failed: queued.length };
  } finally {
    syncing = false;
    await publishState();
  }
}

/**
 * Run a mutation now, or record it for later if the device is offline.
 *
 * Only connectivity failures are queued. An error the server returned on its
 * own terms (bad input, constraint violation) is rethrown, because replaying
 * it later would fail in exactly the same way.
 */
export async function runOrQueue<K extends QueuedMutationKind, T>(
  kind: K,
  payload: QueuedMutationPayloads[K],
  perform: () => Promise<T>
): Promise<{ queued: true } | { queued: false; result: T }> {
  if (isBrowser() && !navigator.onLine) {
    await queueMutation(kind, payload);
    return { queued: true };
  }

  try {
    return { queued: false, result: await perform() };
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    await queueMutation(kind, payload);
    return { queued: true };
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|network request failed/iu.test(
    message
  );
}

async function requestBackgroundSync(): Promise<void> {
  if (!(isBrowser() && "serviceWorker" in navigator)) {
    return;
  }
  try {
    // getRegistration settles immediately when no worker is installed, unlike
    // serviceWorker.ready, which simply never resolves.
    const registration = (await navigator.serviceWorker.getRegistration()) as
      | (ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        })
      | undefined;
    await registration?.sync?.register(SYNC_TAG);
  } catch {
    // Background Sync is not available everywhere (notably Safari and Firefox);
    // the online listener is the fallback path.
  }
}

// --- Observable state ---

type Listener = (state: OfflineState) => void;

const listeners = new Set<Listener>();

let state: OfflineState = {
  lastError: null,
  lastSyncedAt: null,
  online: true,
  pending: 0,
  syncing: false,
};

export function getOfflineState(): OfflineState {
  return state;
}

export function subscribeToOfflineState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function publishState(): Promise<void> {
  if (!isBrowser()) {
    return;
  }
  state = {
    lastError,
    lastSyncedAt,
    online: navigator.onLine,
    pending: await getQueueSize(),
    syncing,
  };
  listeners.forEach((listener) => listener(state));
}

// --- Bootstrap ---

let started = false;

/**
 * Register the service worker and start watching connectivity.
 * Idempotent, so it can be called from any component that mounts.
 */
export function startOfflineSupport(): void {
  if (!isBrowser() || started) {
    return;
  }
  started = true;

  void publishState();

  window.addEventListener("online", () => {
    void publishState().then(() => syncOutbox());
  });
  window.addEventListener("offline", () => {
    void publishState();
  });

  if ("serviceWorker" in navigator) {
    // Skipped in dev so the worker cannot serve stale HMR output.
    if (import.meta.env.PROD) {
      const register = () => {
        void navigator.serviceWorker.register("/sw.js").catch(() => {
          // A failed registration only costs offline support, not the app.
        });
      };
      // This runs from a mount effect, which usually happens after the load
      // event has already fired; listening unconditionally would never run.
      if (document.readyState === "complete") {
        register();
      } else {
        window.addEventListener("load", register, { once: true });
      }
    }

    navigator.serviceWorker.addEventListener(
      "message",
      (event: MessageEvent) => {
        if (event.data?.type === "fittrack:sync-requested") {
          void syncOutbox();
        }
      }
    );
  }

  // Warm the cache and drain anything left over from a previous visit.
  void refreshOfflineBundle();
  void syncOutbox();
}
