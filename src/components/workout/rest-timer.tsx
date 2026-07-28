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
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  clearRestTimer,
  formatRestCountdown,
  getRestTimerSnapshot,
  isRestComplete,
  isRestTimerActive,
  manualStartRestTimer,
  playRestCompleteCue,
  remainingRestMs,
  resetRestTimer,
  restoreRestTimerFromSession,
  restProgressPercent,
  restTimerSearchFromState,
  stopRestTimer,
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

  const running = snapshot.endAtMs !== null;
  const nowMs = useNowTicker(running);
  const remaining =
    snapshot.endAtMs === null
      ? (snapshot.durationMs ?? 0)
      : remainingRestMs(snapshot.endAtMs, nowMs);
  const active = isRestTimerActive(nowMs);
  const hasContext = snapshot.lastRpe !== null || snapshot.durationMs !== null;

  const clearUrlParams = useCallback(() => {
    if (!pathname.startsWith("/workout")) {
      return;
    }
    navigate({
      search: (prev) => {
        const next = { ...prev };
        next.restEnd = undefined;
        next.restDur = undefined;
        return next;
      },
      to: "/workout",
    });
  }, [navigate, pathname]);

  useEffect(() => {
    if (!running || snapshot.endAtMs === null) {
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
      aria-label="Rest timer"
      data-fittrack-rest-timer-slot=""
      data-rest-active={active ? "" : undefined}
      minHeight="var(--app-rest-timer-reserved-height)"
      padding={2}
      variant="section"
    >
      {showControls ? (
        <VStack gap={2}>
          <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
            <VStack gap={0}>
              <Text type="label">Rest</Text>
              <Text hasTabularNumbers size="2xl" weight="bold">
                {active ? formatRestCountdown(remaining) : "Stopped"}
              </Text>
            </VStack>
            {active &&
            !reducedMotion &&
            snapshot.endAtMs !== null &&
            snapshot.durationMs !== null ? (
              <ProgressBar
                hasValueLabel={false}
                isLabelHidden
                label="Rest progress"
                max={100}
                value={restProgressPercent(
                  snapshot.endAtMs,
                  snapshot.durationMs,
                  nowMs
                )}
                variant="accent"
              />
            ) : null}
          </HStack>
          <HStack gap={2} wrap="wrap">
            <Button
              clickAction={() => {
                manualStartRestTimer(Date.now());
                syncRestTimerUrl(navigate, pathname);
              }}
              label="Start rest"
              size="lg"
              variant="primary"
            />
            <Button
              clickAction={() => stopRestTimer()}
              label="Stop rest"
              size="lg"
              variant="secondary"
            />
            <Button
              clickAction={() => {
                resetRestTimer(Date.now());
                syncRestTimerUrl(navigate, pathname);
              }}
              label="Reset rest"
              size="lg"
              variant="secondary"
            />
          </HStack>
        </VStack>
      ) : null}
    </Section>
  );
}
