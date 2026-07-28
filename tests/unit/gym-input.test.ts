import { describe, expect, it } from "vitest";

import {
  adjustByStep,
  adjustReps,
  adjustWeightKg,
  REPS_STEP,
  snapToStep,
  WEIGHT_STEP_KG,
} from "~/lib/gym-input";

describe("gym stepper math (issue #53)", () => {
  it("snaps weight values to 2.5 kg plates", () => {
    expect(snapToStep(21.3, WEIGHT_STEP_KG)).toBe(22.5);
    expect(snapToStep(22.5, WEIGHT_STEP_KG)).toBe(22.5);
  });

  it("increments weight by 2.5 kg per step", () => {
    expect(adjustWeightKg(20, 1)).toBe(22.5);
    expect(adjustWeightKg(22.5, -1)).toBe(20);
  });

  it("increments reps by 1", () => {
    expect(adjustReps(8, 1)).toBe(9);
    expect(adjustReps(8, -1)).toBe(7);
  });

  it("does not drop below zero", () => {
    expect(adjustByStep(0, REPS_STEP, -1, 0)).toBe(0);
    expect(adjustWeightKg(0, -1)).toBe(0);
  });
});
