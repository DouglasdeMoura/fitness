"use client";

import {
  Button,
  HStack,
  ProgressBar,
  Section,
  Text,
  VStack,
} from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useSyncExternalStore, useState } from "react";

import {
  clearRestTimer,
  restTimerSearchFromState,
  formatRestCountdown,
  getRestTimerSnapshot,
  isRestComplete,
  isRestTimerActive,
  manualStartRestTimer,
  playRestCompleteCue,
  remainingRestMs,
  resetRestTimer,
  restProgressPercent,
  stopRestTimer,
  restoreRestTimerFromSession,
  subscribeRestTimer,
} from "~/lib/rest-timer";
import { restCompleteBody, TOAST_DURATION_MS } from "~/lib/toasts";

const TICK_MS = 250;

function syncRestTimerUrl(
  navigate: ReturnType<typeof useNavigate>,
  pathname: string
): void {
  if (!pathname.startsWith("/workout")) {
    return;
  }
  const timerSearch = restTimerSearchFromState(Date.now());
  navigate({
    search: (prev) => ({ ...prev, ...timerSearch }),
    to: "/workout",
  });
}

function useNowTicker(active: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return nowMs;
}

function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", onStoreChange);
    return () => media.removeEventListener("change", onStoreChange);
  }, []);

  const getSnapshot = useCallback(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Fixed rest countdown for active workout sessions (PRD 10 Batch 2 / issue #60).
 * State lives in `rest-timer.ts` so route changes do not reset mid-rest.
 */
export function RestTimer() {
  useEffect(() => {
    restoreRestTimerFromSession();
  }, []);
  const snapshot = useSyncExternalStore(
    subscribeRestTimer,
    getRestTimerSnapshot,
    getRestTimerSnapshot
  );
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navigate = useNavigate();
  const toast = useToast();
  const reducedMotion = usePrefersReducedMotion();

  const running = snapshot.endAtMs != null;
  const nowMs = useNowTicker(running);
  const remaining =
    snapshot.endAtMs == null
      ? (snapshot.durationMs ?? 0)
      : remainingRestMs(snapshot.endAtMs, nowMs);
  const active = isRestTimerActive(nowMs);
  const hasContext = snapshot.lastRpe != null || snapshot.durationMs != null;

  const clearUrlParams = useCallback(() => {
    if (!pathname.startsWith("/workout")) {
      return;
    }
    navigate({
      search: (prev) => {
        const next = { ...prev };
        delete next.restEnd;
        delete next.restDur;
        return next;
      },
      to: "/workout",
    });
  }, [navigate, pathname]);

  useEffect(() => {
    if (!running || snapshot.endAtMs == null) {
      return;
    }
    if (!isRestComplete(snapshot.endAtMs, nowMs)) {
      return;
    }

    const overdueMs = nowMs - snapshot.endAtMs;
    if (overdueMs > 5000) {
      return;
    }

    toast({
      autoHideDuration: TOAST_DURATION_MS.restComplete,
      body: restCompleteBody(),
    });
    playRestCompleteCue();
    clearRestTimer();
    clearUrlParams();
  }, [clearUrlParams, nowMs, running, snapshot.endAtMs, toast]);

  const showControls = active || hasContext;

  return (
    <Section
      role="region"
      aria-label="Rest timer"
      data-fittrack-rest-timer-slot=""
      data-rest-active={active ? "" : undefined}
      variant="section"
      padding={2}
      minHeight="var(--app-rest-timer-reserved-height)"
    >
      {showControls ? (
        <VStack gap={2}>
          <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
            <VStack gap={0}>
              <Text type="label">Rest</Text>
              <Text size="2xl" weight="bold" hasTabularNumbers>
                {active ? formatRestCountdown(remaining) : "Stopped"}
              </Text>
            </VStack>
            {active &&
            !reducedMotion &&
            snapshot.endAtMs != null &&
            snapshot.durationMs != null ? (
              <ProgressBar
                label="Rest progress"
                value={restProgressPercent(
                  snapshot.endAtMs,
                  snapshot.durationMs,
                  nowMs
                )}
                max={100}
                hasValueLabel={false}
                isLabelHidden
                variant="accent"
              />
            ) : null}
          </HStack>
          <HStack gap={2} wrap="wrap">
            <Button
              label="Start rest"
              variant="primary"
              size="lg"
              clickAction={() => {
                manualStartRestTimer(Date.now());
                syncRestTimerUrl(navigate, pathname);
              }}
            />
            <Button
              label="Stop rest"
              variant="secondary"
              size="lg"
              clickAction={() => stopRestTimer()}
            />
            <Button
              label="Reset rest"
              variant="secondary"
              size="lg"
              clickAction={() => {
                resetRestTimer(Date.now());
                syncRestTimerUrl(navigate, pathname);
              }}
            />
          </HStack>
        </VStack>
      ) : null}
    </Section>
  );
}
