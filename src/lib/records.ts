// Pure personal-record detection for workout sets (issue #61 / PRD 10 Batch 3).
// References:
// - Epley B. "Weight training." Encyclopedia of Sports Medicine. 1985. (estimated 1RM)
// - Schoenfeld BJ et al. J Sports Sci. 2017. (session volume as hypertrophy driver)

import { formatDisplayInteger } from "./format-number";
import { estimate1RM } from "./workout";

export interface ExerciseSetSnapshot {
  id?: number;
  reps: number;
  session_id: number;
  weight_kg: number;
}

export type RecordKind = "estimated_1rm" | "rep" | "volume";

export interface BrokenRecord {
  kind: RecordKind;
  previousBest: number;
}

/** Single-set volume (weight × reps). */
export function setVolume(set: ExerciseSetSnapshot): number {
  return set.weight_kg * set.reps;
}

/** Sum of set volumes within one session. */
export function sessionSetVolume(sets: ExerciseSetSnapshot[]): number {
  return sets.reduce((sum, set) => sum + setVolume(set), 0);
}

function maxEstimated1Rm(history: ExerciseSetSnapshot[]): number {
  return Math.max(
    ...history.map((set) => estimate1RM(set.weight_kg, set.reps))
  );
}

function maxRepsAtWeightOrHeavier(
  history: ExerciseSetSnapshot[],
  minWeight: number
): number {
  const eligible = history.filter((set) => set.weight_kg >= minWeight);
  if (eligible.length === 0) {
    return 0;
  }
  return Math.max(...eligible.map((set) => set.reps));
}

function maxSessionVolume(history: ExerciseSetSnapshot[]): number {
  const volumes = new Map<number, number>();
  for (const set of history) {
    volumes.set(
      set.session_id,
      (volumes.get(set.session_id) ?? 0) + setVolume(set)
    );
  }
  if (volumes.size === 0) {
    return 0;
  }
  return Math.max(...volumes.values());
}

/**
 * Detect record types a new set breaks against prior history.
 * `priorSets` must exclude the set being evaluated. Ties are not PRs.
 *
 * @example
 * detectPersonalRecords(
 *   [{ session_id: 1, weight_kg: 100, reps: 8 }],
 *   { session_id: 2, weight_kg: 100, reps: 10 },
 *   [],
 * )
 */
export function detectPersonalRecords(
  priorSets: ExerciseSetSnapshot[],
  newSet: ExerciseSetSnapshot,
  currentSessionPriorSets: ExerciseSetSnapshot[]
): BrokenRecord[] {
  if (priorSets.length === 0) {
    return [];
  }

  const records: BrokenRecord[] = [];

  const previous1Rm = maxEstimated1Rm(priorSets);
  const next1Rm = estimate1RM(newSet.weight_kg, newSet.reps);
  if (next1Rm > previous1Rm) {
    records.push({ kind: "estimated_1rm", previousBest: previous1Rm });
  }

  const previousReps = maxRepsAtWeightOrHeavier(priorSets, newSet.weight_kg);
  if (previousReps > 0 && newSet.reps > previousReps) {
    records.push({ kind: "rep", previousBest: previousReps });
  }

  const priorOtherSessions = priorSets.filter(
    (set) => set.session_id !== newSet.session_id
  );
  const previousSessionVolume = maxSessionVolume(priorOtherSessions);
  const volumeBeforeNewSet = sessionSetVolume(currentSessionPriorSets);
  const volumeAfterNewSet = volumeBeforeNewSet + setVolume(newSet);
  if (
    priorOtherSessions.length > 0 &&
    volumeAfterNewSet > previousSessionVolume &&
    volumeBeforeNewSet <= previousSessionVolume
  ) {
    records.push({ kind: "volume", previousBest: previousSessionVolume });
  }

  return records;
}

/**
 * Map each set id to the record kinds it broke when logged (chronological order).
 * Used to badge PR sets in session history.
 */
export function recordKindsBySetId(
  chronologicalSets: ExerciseSetSnapshot[]
): Map<number, RecordKind[]> {
  const result = new Map<number, RecordKind[]>();

  for (let index = 0; index < chronologicalSets.length; index++) {
    const set = chronologicalSets[index];
    if (!set || set.id === undefined) {
      continue;
    }
    const prior = chronologicalSets.slice(0, index);
    const currentSessionPrior = prior.filter(
      (row) => row.session_id === set.session_id
    );
    const broken = detectPersonalRecords(prior, set, currentSessionPrior);
    if (broken.length > 0) {
      result.set(
        set.id,
        broken.map((record) => record.kind)
      );
    }
  }

  return result;
}

export function formatRecordKindLabel(kind: RecordKind): string {
  switch (kind) {
    case "estimated_1rm": {
      return "Estimated 1RM PR";
    }
    case "rep": {
      return "Rep PR";
    }
    case "volume": {
      return "Volume PR";
    }
    default: {
      return kind;
    }
  }
}

export function formatPreviousBest(kind: RecordKind, value: number): string {
  switch (kind) {
    case "estimated_1rm": {
      return `${formatDisplayInteger(value)} kg`;
    }
    case "rep": {
      return `${formatDisplayInteger(value)} reps`;
    }
    case "volume": {
      return `${formatDisplayInteger(value)} kg`;
    }
    default: {
      return `${formatDisplayInteger(value)}`;
    }
  }
}

/** User-visible toast fragment for one broken record. */
export function personalRecordToastFragment(record: BrokenRecord): string {
  return `${formatRecordKindLabel(record.kind)} — beat ${formatPreviousBest(record.kind, record.previousBest)}`;
}

/** Join multiple PR fragments for a single toast body. */
export function personalRecordsToastBody(records: BrokenRecord[]): string {
  return records.map(personalRecordToastFragment).join(" · ");
}
