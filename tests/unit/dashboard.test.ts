import { describe, it, expect } from "vitest";

import {
  macroProgress,
  calorieRemainingLabel,
  isFirstTimeUser,
} from "~/lib/dashboard";

describe(macroProgress, () => {
  it("clamps the fill to the target so the bar never overflows", () => {
    const state = macroProgress(2500, 2000, "accent");
    expect(state.value).toBe(2000);
    expect(state.max).toBe(2000);
  });

  it("keeps the assigned tone while intake is at or below target", () => {
    expect(macroProgress(0, 150, "success").variant).toBe("success");
    expect(macroProgress(75, 150, "warning").variant).toBe("warning");
    expect(macroProgress(150, 150, "accent").variant).toBe("accent");
  });

  it("switches to the error tone the moment intake exceeds the target", () => {
    expect(macroProgress(151, 150, "success").variant).toBe("error");
    expect(macroProgress(151, 150, "success").value).toBe(150);
  });

  it("renders an empty bar without erroring when the target is zero", () => {
    const state = macroProgress(120, 0, "accent");
    expect(state.value).toBe(0);
    // max stays positive so ProgressBar does not divide by zero
    expect(state.max).toBe(1);
    // no target means "over target" is meaningless; tone is preserved
    expect(state.variant).toBe("accent");
  });
});

describe(calorieRemainingLabel, () => {
  it("reports remaining calories when under target", () => {
    expect(calorieRemainingLabel(1500, 2000)).toBe("500 kcal remaining");
  });

  it("reports zero remaining at exactly the target", () => {
    expect(calorieRemainingLabel(2000, 2000)).toBe("0 kcal remaining");
  });

  it('switches to "over target" wording once the target is exceeded', () => {
    expect(calorieRemainingLabel(2200, 2000)).toBe("200 kcal over target");
  });

  it("rounds fractional calories to whole numbers for display", () => {
    expect(calorieRemainingLabel(1499.6, 2000)).toBe("500 kcal remaining");
    expect(calorieRemainingLabel(2000.4, 2000)).toBe("0 kcal over target");
  });
});

describe(isFirstTimeUser, () => {
  it("returns true when there is zero activity across all dimensions", () => {
    expect(
      isFirstTimeUser({
        consumed: { calories: 0 },
        recentBodyweight: [],
        workoutDaysThisMonth: 0,
      })
    ).toBeTruthy();
  });

  it("returns false when any food has been logged today", () => {
    expect(
      isFirstTimeUser({
        consumed: { calories: 500 },
        recentBodyweight: [],
        workoutDaysThisMonth: 0,
      })
    ).toBeFalsy();
  });

  it("returns false when workouts exist in the past 30 days", () => {
    expect(
      isFirstTimeUser({
        consumed: { calories: 0 },
        recentBodyweight: [],
        workoutDaysThisMonth: 3,
      })
    ).toBeFalsy();
  });

  it("returns false when body weight has been logged", () => {
    expect(
      isFirstTimeUser({
        consumed: { calories: 0 },
        recentBodyweight: [{ id: 1 }],
        workoutDaysThisMonth: 0,
      })
    ).toBeFalsy();
  });
});
