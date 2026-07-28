import { Text, VStack } from "@astryxdesign/core";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { useEffect, useState } from "react";
import type { OfflineState } from "~/lib/offline";
import {
  getOfflineState,
  getQueuedMutations,
  startOfflineSupport,
  subscribeToOfflineState,
  syncOutbox,
} from "~/lib/offline";
import type { QueuedMutationKind } from "~/lib/sync";

// Every queued mutation kind needs a label — the offline banner names what is
// waiting to sync, and a missing entry renders `undefined` to the user. The
// bottom four arrived with the copy-yesterday and meal-template features and
// were never labelled; only `npm run typecheck` caught it, which was not a
// dev-loop gate at the time.
const KIND_LABELS: Record<QueuedMutationKind, string> = {
  addFood: "Custom food",
  addFoodLogEntry: "Food log entry",
  addWorkoutSet: "Workout set",
  copyDayFromDate: "Copied day",
  copyMealFromDate: "Copied meal",
  createWorkoutSession: "Workout session",
  deleteFoodLogEntries: "Deleted food entries",
  deleteFoodLogEntry: "Deleted food entry",
  logBodyweight: "Bodyweight",
  logMealTemplate: "Logged meal template",
};

const OFFLINE_BANNER_TITLE =
  "You're offline — changes will sync when reconnected";

/**
 * Subscribes to connectivity and outbox size, and boots offline support on
 * first mount. Returns null until mounted so the server-rendered markup (which
 * cannot know the device's connectivity) matches the first client render.
 */
export function useOfflineState(): OfflineState | null {
  const [state, setState] = useState<OfflineState | null>(null);

  useEffect(() => {
    startOfflineSupport();
    setState(getOfflineState());
    return subscribeToOfflineState(setState);
  }, []);

  return state;
}

export function OfflineStatus() {
  const state = useOfflineState();
  const [pendingKinds, setPendingKinds] = useState<QueuedMutationKind[]>([]);

  const pending = state?.pending ?? 0;

  useEffect(() => {
    if (pending === 0) {
      setPendingKinds([]);
      return;
    }
    let active = true;
    getQueuedMutations().then((queued) => {
      if (active) {
        setPendingKinds(queued.map((entry) => entry.kind));
      }
    });
    return () => {
      active = false;
    };
  }, [pending]);

  if (!state) {
    return null;
  }

  const offline = state.online === false;
  if (!offline && pending === 0 && !state.lastError) {
    return null;
  }

  const changes = `${pending} change${pending === 1 ? "" : "s"}`;
  let status: "warning" | "error" | "info" = "info";
  let title: string;
  let description: string;

  if (offline) {
    status = "warning";
    title = OFFLINE_BANNER_TITLE;
    description =
      pending > 0
        ? `${changes} saved on this device. They'll sync automatically when you reconnect.`
        : "Your cached food database and recent logs are still available. Anything you log is saved on this device.";
  } else if (state.lastError) {
    status = "error";
    title = "Some changes could not be saved";
    description = state.lastError;
  } else {
    title = `${changes} waiting to sync`;
    description = "Syncing your offline changes now.";
  }

  const showSyncButton = offline === false && pending > 0;

  const counts = pendingKinds.reduce<
    Partial<Record<QueuedMutationKind, number>>
  >((acc, kind) => {
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Banner
      container="section"
      description={description}
      endContent={
        showSyncButton ? (
          <Button
            clickAction={async () => {
              await syncOutbox();
            }}
            isLoading={state.syncing}
            label={state.syncing ? "Syncing" : "Sync now"}
            size="sm"
            variant="secondary"
          />
        ) : null
      }
      status={status}
      title={title}
    >
      {pendingKinds.length > 0 ? (
        <VStack gap={1}>
          {Object.entries(counts).map(([kind, count]) => (
            <Text key={kind} type="supporting">
              {KIND_LABELS[kind as QueuedMutationKind]} &times; {count}
            </Text>
          ))}
        </VStack>
      ) : null}
    </Banner>
  );
}
