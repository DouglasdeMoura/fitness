import { describe, expect, it } from "vitest";

import { detectPersonalRecords, personalRecordToastFragment, recordKindsBySetId, sessionSetVolume } from '~/lib/records';
import type { ExerciseSetSnapshot } from '~/lib/records';
import { estimate1RM } from "~/lib/workout";

const bench = (
  sessionId: number,
  weight: number,
  reps: number,
  id?: number
): ExerciseSetSnapshot => ({
  id,
  reps,
  session_id: sessionId,
  weight_kg: weight,
});

describe("detectPersonalRecords (issue #61)", () => {
  it("returns no records for the first-ever set", () => {
    const records = detectPersonalRecords([], bench(1, 100, 8), []);
    expect(records).toStrictEqual([]);
  });

  it("detects estimated 1RM PR when Epley estimate improves", () => {
    const prior = [bench(1, 100, 8)];
    const records = detectPersonalRecords(prior, bench(2, 100, 10), []);
    expect(records).toContainEqual({
      kind: "estimated_1rm",
      previousBest: estimate1RM(100, 8),
    });
  });

  it("does not flag an exact 1RM tie as a PR", () => {
    const prior = [bench(1, 100, 8)];
    const tied = bench(2, 100, 8);
    const records = detectPersonalRecords(prior, tied, []);
    expect(
      records.find((record) => record.kind === "estimated_1rm")
    ).toBeUndefined();
  });

  it("detects rep PR at the same weight or heavier", () => {
    const prior = [bench(1, 100, 8), bench(1, 90, 12)];
    const records = detectPersonalRecords(prior, bench(2, 100, 10), []);
    expect(records).toContainEqual({ kind: "rep", previousBest: 8 });
  });

  it("does not flag an exact rep tie as a PR", () => {
    const prior = [bench(1, 100, 8)];
    const records = detectPersonalRecords(prior, bench(2, 100, 8), []);
    expect(records.find((record) => record.kind === "rep")).toBeUndefined();
  });

  it("detects volume PR when the session total beats prior sessions", () => {
    const prior = [bench(1, 100, 8), bench(1, 100, 8)];
    const priorVolume = sessionSetVolume(prior);
    const records = detectPersonalRecords(prior, bench(2, 100, 17), []);
    expect(records).toContainEqual({
      kind: "volume",
      previousBest: priorVolume,
    });
  });

  it("does not flag an exact session volume tie as a PR", () => {
    const prior = [bench(1, 100, 8)];
    const priorVolume = sessionSetVolume(prior);
    const records = detectPersonalRecords(prior, bench(2, 100, 8), []);
    expect(records.find((record) => record.kind === "volume")).toBeUndefined();
    expect(priorVolume).toBe(800);
  });

  it("includes earlier sets from the same session when evaluating a new set", () => {
    const prior = [bench(2, 100, 8, 1)];
    const records = detectPersonalRecords(prior, bench(2, 100, 10, 2), [
      prior[0],
    ]);
    expect(records.map((record) => record.kind)).toContain("rep");
  });
});

describe(recordKindsBySetId, () => {
  it("maps chronological sets to the record kinds each one broke", () => {
    const chronological = [
      bench(1, 100, 8, 1),
      bench(2, 100, 10, 2),
      bench(2, 100, 10, 3),
    ];
    const kinds = recordKindsBySetId(chronological);
    expect(kinds.get(1)).toBeUndefined();
    expect(kinds.get(2)).toStrictEqual(
      expect.arrayContaining(["estimated_1rm", "rep"])
    );
    expect(kinds.get(3)).toBeUndefined();
  });
});

describe(personalRecordToastFragment, () => {
  it("names the record type and the previous best", () => {
    expect(
      personalRecordToastFragment({ kind: "estimated_1rm", previousBest: 120 })
    ).toBe("Estimated 1RM PR — beat 120 kg");
  });
});
