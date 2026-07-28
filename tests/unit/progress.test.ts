import { describe, expect, it } from "vitest";

import type { MuscleVolume } from "~/lib/api";
import type { BodyLog } from "~/lib/db";
import {
  areaChartPath,
  capitalizeMuscleGroup,
  movingAverage,
  volumeProgress,
  volumeStatusBadge,
  volumeVariant,
  weightChangeTone,
  weightChartGeometry,
  weightChartPoints,
  weightTrend,
  workoutsPerWeek,
} from "~/lib/progress";

/** Minimal BodyLog factory; only the fields the helpers read are populated. */
function bodyLog(id: number, date: string, weightKg: number | null): BodyLog {
  return {
    body_fat_pct: null,
    created_at: date,
    date,
    id,
    muscle_mass_kg: null,
    notes: null,
    user_id: 1,
    waist_cm: null,
    weight_kg: weightKg,
  };
}

/** MuscleVolume factory. */
function muscleVolume(overrides: Partial<MuscleVolume>): MuscleVolume {
  return {
    max_recommended: 16,
    min_recommended: 8,
    muscle_group: "chest",
    status: "optimal",
    total_sets: 10,
    total_volume: 1000,
    ...overrides,
  };
}

describe(weightTrend, () => {
  it("returns null when no logs carry a weight", () => {
    expect(weightTrend([bodyLog(1, "2024-01-01", null)])).toBeNull();
    expect(weightTrend([])).toBeNull();
  });

  it("orders oldest -> newest so change = newest - oldest", () => {
    // getBodyLogs returns newest-first; the helper must not inherit that order.
    const logs = [
      bodyLog(3, "2024-03-01", 82),
      bodyLog(2, "2024-02-01", 81),
      bodyLog(1, "2024-01-01", 80),
    ];
    const trend = weightTrend(logs)!;
    expect(trend.first).toBe(80); // oldest
    expect(trend.last).toBe(82); // newest
    expect(trend.change).toBe(2); // gained 2 kg
  });

  it("ignores logs without a weight when computing min/max", () => {
    const logs = [
      bodyLog(1, "2024-01-01", 90),
      bodyLog(2, "2024-01-02", null),
      bodyLog(3, "2024-01-03", 85),
    ];
    const trend = weightTrend(logs)!;
    expect(trend.min).toBe(85);
    expect(trend.max).toBe(90);
    expect(trend.change).toBe(-5); // lost 5 kg
  });

  it("handles a single weighted log without dividing by zero", () => {
    const trend = weightTrend([bodyLog(1, "2024-01-01", 75)])!;
    expect(trend.first).toBe(75);
    expect(trend.last).toBe(75);
    expect(trend.change).toBe(0);
  });
});

describe(weightChangeTone, () => {
  it("reads weight loss as favourable (success) and gain as unfavourable (error)", () => {
    // Preserves the prior custom-CSS framing; see TODO in progress.ts for
    // making this goal-aware.
    expect(weightChangeTone(-1.5)).toBe("success");
    expect(weightChangeTone(1.5)).toBe("error");
  });

  it("returns null for a flat or non-finite trend so no badge renders", () => {
    expect(weightChangeTone(0)).toBeNull();
    expect(weightChangeTone(Number.NaN)).toBeNull();
  });
});

describe(workoutsPerWeek, () => {
  it("normalises a 90-day session count to a weekly average", () => {
    // 13 sessions over 90 days -> 13 / (90/7) = 13 / 12.857 ~= 1.011
    expect(workoutsPerWeek(13, 90)).toBeCloseTo(1.011, 2);
  });

  it("returns zero for a non-positive window instead of dividing by zero", () => {
    expect(workoutsPerWeek(5, 0)).toBe(0);
    expect(workoutsPerWeek(5, -7)).toBe(0);
  });
});

describe("volumeVariant / volumeStatusBadge", () => {
  // Schoenfeld et al. 2017 buckets: optimal = target zone, under = caution,
  // high = over-reaching risk.
  it("maps each status to its semantic tone", () => {
    expect(volumeVariant("optimal")).toBe("success");
    expect(volumeVariant("under")).toBe("warning");
    expect(volumeVariant("high")).toBe("error");
  });

  it("pairs each tone with a human-readable label", () => {
    expect(volumeStatusBadge("optimal")).toStrictEqual({
      label: "Optimal",
      variant: "success",
    });
    expect(volumeStatusBadge("under")).toStrictEqual({
      label: "Under",
      variant: "warning",
    });
    expect(volumeStatusBadge("high")).toStrictEqual({
      label: "High",
      variant: "error",
    });
  });
});

describe(volumeProgress, () => {
  it("drives the bar from sets vs. the recommended weekly max", () => {
    const bar = volumeProgress(
      muscleVolume({ max_recommended: 16, total_sets: 8 })
    );
    expect(bar.value).toBe(8);
    expect(bar.max).toBe(16);
    expect(bar.percent).toBe(50);
  });

  it("clamps the fill and percent at the recommended max on an over-training week", () => {
    const bar = volumeProgress(
      muscleVolume({ max_recommended: 16, status: "high", total_sets: 40 })
    );
    // Fill never overflows the track, but the tone flips to error.
    expect(bar.value).toBe(16);
    expect(bar.percent).toBe(100);
    expect(bar.variant).toBe("error");
  });

  it("switches the tone to warning while under the minimum", () => {
    const bar = volumeProgress(
      muscleVolume({ status: "under", total_sets: 2 })
    );
    expect(bar.variant).toBe("warning");
  });

  it("guards against a zero recommended max so the bar never divides by zero", () => {
    const bar = volumeProgress(
      muscleVolume({ max_recommended: 0, total_sets: 5 })
    );
    expect(bar.max).toBe(1);
    expect(bar.percent).toBe(100);
  });
});

describe(weightChartGeometry, () => {
  it("widens the plot with the number of samples for readable dense histories", () => {
    expect(weightChartGeometry(10).width).toBe(100); // floors at 100
    expect(weightChartGeometry(20).width).toBe(160); // 20 * 8
  });

  it("exposes a fixed plot height plus gutters for the viewBox", () => {
    const geom = weightChartGeometry(5);
    expect(geom.height).toBe(200);
    expect(geom.viewBoxHeight).toBeGreaterThan(geom.height);
  });
});

describe(weightChartPoints, () => {
  it("spreads points across the full plot width", () => {
    const geom = weightChartGeometry(3);
    const points = weightChartPoints([70, 75, 80], 70, 80, geom);
    expect(points[0].x).toBe(0);
    expect(points.at(-1).x).toBeCloseTo(geom.width, 5);
  });

  it("plots heavier weights higher (smaller y) — axis is inverted", () => {
    const geom = weightChartGeometry(2);
    const [lighter, heavier] = weightChartPoints([70, 80], 70, 80, geom);
    expect(heavier.y).toBeLessThan(lighter.y);
  });

  it("does not divide by zero for a flat series", () => {
    const geom = weightChartGeometry(3);
    const points = weightChartPoints([75, 75, 75], 75, 75, geom);
    // All points share the same y; no NaN/Infinity.
    expect(points.every((p) => Number.isFinite(p.y))).toBeTruthy();
  });

  it("does not divide by zero for a single sample", () => {
    const geom = weightChartGeometry(1);
    const [point] = weightChartPoints([75], 70, 80, geom);
    expect(Number.isFinite(point.x)).toBeTruthy();
    expect(Number.isFinite(point.y)).toBeTruthy();
  });
});

describe(capitalizeMuscleGroup, () => {
  it("title-cases snake_case muscle groups", () => {
    expect(capitalizeMuscleGroup("full_body")).toBe("Full Body");
    expect(capitalizeMuscleGroup("chest")).toBe("Chest");
  });
});

describe(movingAverage, () => {
  it("returns null for first (window-1) entries where SMA is incomplete", () => {
    const result = movingAverage([80, 81, 82, 83, 84, 85, 86], 7);
    // First 6 entries lack a full 7-day window
    expect(result.slice(0, 6)).toStrictEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    // 7th entry has full window: avg of all 7 = 83
    expect(result[6]).toBe(83);
  });

  it("computes a rolling SMA as the window advances", () => {
    // Weight: 80, 81, 79, 82, 80, 81, 83
    const result = movingAverage([80, 81, 79, 82, 80, 81, 83], 3);
    // Window 3: index 2 = (80+81+79)/3 = 80.0
    expect(result[2]).toBe(80);
    // Window rolls: index 3 = (81+79+82)/3 ≈ 80.7
    expect(result[3]).toBe(80.7);
    // Index 4 = (79+82+80)/3 ≈ 80.3
    expect(result[4]).toBe(80.3);
    // Index 5 = (82+80+81)/3 = 81.0
    expect(result[5]).toBe(81);
    // Index 6 = (80+81+83)/3 ≈ 81.3
    expect(result[6]).toBe(81.3);
  });

  it("rounds SMA values to one decimal place for display", () => {
    const result = movingAverage([1, 2, 3], 3);
    expect(result[2]).toBe(2); // (1+2+3)/3 = 2.0 → "2"
  });

  it("returns all nulls when window exceeds data length", () => {
    const result = movingAverage([80, 81], 7);
    expect(result).toStrictEqual([null, null]);
  });

  it("handles a window of zero gracefully", () => {
    const result = movingAverage([80, 81, 82], 0);
    expect(result).toStrictEqual([null, null, null]);
  });

  it("SMA smooths daily fluctuations so trend is visible", () => {
    // Noisy weight data with an overall downward trend
    const weights = [85, 87, 84, 88, 83, 86, 82, 85, 81, 84, 80];
    const result = movingAverage(weights, 7);
    // The raw data jumps up/down; SMA should show a smoother descent
    // First 6 are null; remaining should be monotonically decreasing-ish
    const smaValues = result.filter((v): v is number => v !== null);
    expect(smaValues).toHaveLength(5);
    // Overall trend should be downward (smoothing the noise)
    expect(smaValues[0]).toBeGreaterThan(smaValues.at(-1));
  });
});

describe(areaChartPath, () => {
  const geom = { height: 200, topPadding: 10, viewBoxHeight: 240, width: 100 };

  it("returns an SVG polygon path closing back to the chart bottom", () => {
    const points = [
      { x: 0, y: 150 },
      { x: 50, y: 100 },
      { x: 100, y: 120 },
    ];
    const path = areaChartPath(points, geom);

    // Must start with "M" for moveto
    expect(path.startsWith("M ")).toBeTruthy();
    // Must contain the line segments
    expect(path).toContain("0,150");
    expect(path).toContain("50,100");
    expect(path).toContain("100,120");
    // Must close to bottom-right and bottom-left
    expect(path).toContain("100,240"); // bottom-right corner
    expect(path).toContain("0,240"); // bottom-left corner
    // Must end with Z to close the path
    expect(path.endsWith(" Z")).toBeTruthy();
  });

  it("returns empty string for zero points", () => {
    expect(areaChartPath([], geom)).toBe("");
  });

  it("handles a single point correctly", () => {
    const points = [{ x: 50, y: 100 }];
    const path = areaChartPath(points, geom);
    expect(path.startsWith("M ")).toBeTruthy();
    expect(path.endsWith(" Z")).toBeTruthy();
    expect(path).toContain("50,240"); // bottom-right == bottom-left for single point
  });
});
