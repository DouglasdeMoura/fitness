import { afterEach, describe, expect, it } from "vitest";

import {
  computeEndAtMs,
  formatRestCountdown,
  getRestTimerSnapshot,
  hydrateRestTimerFromUrl,
  REST_MS_APPROACHING_FAILURE,
  REST_MS_NEAR_MAX,
  REST_MS_SUBMAXIMAL,
  remainingRestMs,
  resetRestTimerModule,
  restProgressPercent,
  restTimerSearchFromState,
  startRestTimer,
  stopRestTimer,
  suggestRestDurationMs,
} from "~/lib/rest-timer";

afterEach(() => {
  resetRestTimerModule();
});

describe("suggestRestDurationMs (issue #60)", () => {
  it("maps RPE bands to de Salles 2009 / Schoenfeld 2016 rest intervals", () => {
    expect(suggestRestDurationMs(6)).toBe(REST_MS_SUBMAXIMAL);
    expect(suggestRestDurationMs(7)).toBe(REST_MS_SUBMAXIMAL);
    expect(suggestRestDurationMs(8)).toBe(REST_MS_APPROACHING_FAILURE);
    expect(suggestRestDurationMs(9)).toBe(REST_MS_NEAR_MAX);
    expect(suggestRestDurationMs(10)).toBe(REST_MS_NEAR_MAX);
  });
});

describe("remainingRestMs from target end timestamp (issue #60)", () => {
  it("keeps correct remaining time after a simulated phone sleep", () => {
    const nowMs = 1_000_000;
    startRestTimer(8, nowMs);
    const snapshot = getRestTimerSnapshot();
    expect(snapshot.durationMs).toBe(REST_MS_APPROACHING_FAILURE);
    const endAtMs = snapshot.endAtMs!;

    const afterSleepMs = nowMs + 90_000;
    expect(remainingRestMs(endAtMs, afterSleepMs)).toBe(
      REST_MS_APPROACHING_FAILURE - 90_000
    );

    const afterCompleteMs = endAtMs + 5000;
    expect(remainingRestMs(endAtMs, afterCompleteMs)).toBe(0);
  });

  it("does not drift when only the wall clock advances", () => {
    const nowMs = 5_000_000;
    const durationMs = REST_MS_SUBMAXIMAL;
    const endAtMs = computeEndAtMs(nowMs, durationMs);

    expect(remainingRestMs(endAtMs, nowMs + 30_000)).toBe(durationMs - 30_000);
    expect(restProgressPercent(endAtMs, durationMs, nowMs + 60_000)).toBe(50);
    expect(formatRestCountdown(remainingRestMs(endAtMs, nowMs + 61_000))).toBe(
      "0:59"
    );
  });
});

describe("rest timer store + URL sync (issue #60)", () => {
  it("hydrates active timers from URL search params", () => {
    const nowMs = 2_000_000;
    const restEnd = nowMs + REST_MS_NEAR_MAX;
    hydrateRestTimerFromUrl({ restDur: REST_MS_NEAR_MAX, restEnd }, nowMs);
    expect(getRestTimerSnapshot().endAtMs).toBe(restEnd);
    expect(restTimerSearchFromState(nowMs)).toStrictEqual({
      restDur: REST_MS_NEAR_MAX,
      restEnd,
    });
  });

  it("stop clears the running end timestamp but keeps last RPE context", () => {
    startRestTimer(9, 3_000_000);
    stopRestTimer();
    const snapshot = getRestTimerSnapshot();
    expect(snapshot.endAtMs).toBeNull();
    expect(snapshot.lastRpe).toBe(9);
    expect(snapshot.durationMs).toBe(REST_MS_NEAR_MAX);
  });
});
