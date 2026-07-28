import { describe, expect, it } from "vitest";

import {
  assembleConsistencyMetrics,
  buildLast7Days,
  currentStreak,
  logAdherence,
  longestStreak,
  workoutAdherence,
} from "~/lib/consistency";

describe(logAdherence, () => {
  it("returns 0 for empty history", () => {
    expect(logAdherence([], 7, "2020-01-07")).toBe(0);
    expect(logAdherence([], 28, "2020-01-28")).toBe(0);
  });

  it("returns 100 for a single logged day in a 1-day window", () => {
    expect(logAdherence(["2020-01-01"], 1, "2020-01-01")).toBe(100);
  });

  it("counts gaps in a rolling window", () => {
    const dates = ["2020-01-01", "2020-01-03", "2020-01-07"];
    expect(logAdherence(dates, 7, "2020-01-07")).toBe(43);
  });

  it("handles timezone-boundary dates via local noon math", () => {
    const dates = ["2019-12-31", "2020-01-01"];
    expect(logAdherence(dates, 2, "2020-01-01")).toBe(100);
    expect(
      buildLast7Days(dates, "2020-01-01").map((day) => day.date)
    ).toContain("2019-12-31");
  });
});

describe(workoutAdherence, () => {
  it("allows one rest day per week without lowering adherence below 100%", () => {
    const sessions = [
      "2020-01-01",
      "2020-01-02",
      "2020-01-03",
      "2020-01-04",
      "2020-01-05",
      "2020-01-06",
    ];

    expect(workoutAdherence(sessions, 7, 1, "2020-01-07")).toBe(100);
  });

  it("penalizes more than one missed training day in a week", () => {
    const sessions = ["2020-01-01", "2020-01-02", "2020-01-04", "2020-01-05"];
    expect(workoutAdherence(sessions, 7, 1, "2020-01-07")).toBe(67);
  });
});

describe(currentStreak, () => {
  it("returns 0 when there is no history and no grace applies to today", () => {
    expect(currentStreak([], 0, "2020-01-07")).toBe(0);
  });

  it("counts a single logged day", () => {
    expect(currentStreak(["2020-01-07"], 0, "2020-01-07")).toBe(1);
  });

  it("tolerates one grace day in a food-log streak", () => {
    const dates = ["2020-01-05", "2020-01-07"];
    expect(currentStreak(dates, 1, "2020-01-07")).toBe(3);
  });

  it("breaks when a day is missed without grace", () => {
    expect(currentStreak(["2020-01-01", "2020-01-07"], 0, "2020-01-07")).toBe(
      1
    );
  });

  it("does not break a workout streak for one rest day per week", () => {
    const sessions = [
      "2020-01-01",
      "2020-01-02",
      "2020-01-04",
      "2020-01-05",
      "2020-01-06",
      "2020-01-07",
    ];

    expect(
      currentStreak(sessions, 1, "2020-01-07", { gracePeriodDays: 7 })
    ).toBe(7);
  });
});

describe(longestStreak, () => {
  it("returns 0 for empty history", () => {
    expect(longestStreak([])).toBe(0);
  });

  it("returns 1 for a single day", () => {
    expect(longestStreak(["2020-01-01"])).toBe(1);
  });

  it("finds the longest consecutive run across gaps", () => {
    const dates = [
      "2020-01-01",
      "2020-01-02",
      "2020-01-05",
      "2020-01-06",
      "2020-01-07",
    ];
    expect(longestStreak(dates)).toBe(3);
  });
});

describe(assembleConsistencyMetrics, () => {
  it("builds dashboard metrics deterministically from asOf", () => {
    const metrics = assembleConsistencyMetrics(["2020-01-01"], "2020-01-01");
    expect(metrics.adherence7).toBe(14);
    expect(metrics.adherence28).toBe(4);
    expect(metrics.currentStreak).toBe(1);
    expect(metrics.longestStreak).toBe(1);
    expect(metrics.last7Days).toHaveLength(7);
  });
});
