import { describe, expect, it } from "vitest";

import type { UserRecord } from "~/db/user-body-queries";
import {
  activityOptions,
  buildProfileUpdate,
  buildWeightChartPoints,
  exportDownloadFilename,
  GOAL_CARD_OPTIONS,
  GOAL_OPTIONS,
  parseImportFile,
  parseWeightKg,
  profileFormDefaults,
  profileSaveButtonLabel,
  SCIENCE_REFERENCES,
  SEX_OPTIONS,
  saveProfileButtonLabel,
  todayISODate,
  toISODate,
  weightChartPolyline,
} from "~/lib/settings";

const userFixture = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  activityLevel: "moderate",
  birthDate: "1990-05-01",
  createdAt: "2025-01-01T00:00:00Z",
  email: null,
  goalType: "build_muscle",
  heightCm: 178,
  id: 1,
  name: "Alex",
  sex: "male",
  updatedAt: "2025-01-01T00:00:00Z",
  ...overrides,
});

describe(profileFormDefaults, () => {
  it("maps user query fields onto TanStack Form default values", () => {
    expect(profileFormDefaults(userFixture())).toStrictEqual({
      activity: "moderate",
      birthDate: "1990-05-01",
      goal: "build_muscle",
      heightCm: 178,
      name: "Alex",
      sex: "male",
    });
  });

  it("normalizes null height and birth date for the form", () => {
    expect(
      profileFormDefaults(userFixture({ birthDate: null, heightCm: null }))
    ).toStrictEqual({
      activity: "moderate",
      birthDate: "",
      goal: "build_muscle",
      heightCm: null,
      name: "Alex",
      sex: "male",
    });
  });
});

describe(buildProfileUpdate, () => {
  it("maps form fields onto the updateUser payload shape", () => {
    expect(
      buildProfileUpdate({
        activity: "moderate",
        birthDate: "1990-05-01",
        goal: "build_muscle",
        heightCm: 178,
        name: "Alex",
        sex: "male",
      })
    ).toStrictEqual({
      activityLevel: "moderate",
      birthDate: "1990-05-01",
      goalType: "build_muscle",
      heightCm: 178,
      name: "Alex",
      sex: "male",
    });
  });

  it("stores null birthDate when the field is cleared", () => {
    const payload = buildProfileUpdate({
      activity: "sedentary",
      birthDate: "",
      goal: "lose_fat",
      heightCm: null,
      name: "Alex",
      sex: "female",
    });
    expect(payload.birthDate).toBeNull();
    expect(payload.heightCm).toBeNull();
  });
});

describe(parseWeightKg, () => {
  it("accepts positive finite weights", () => {
    expect(parseWeightKg(72.5)).toBe(72.5);
    expect(parseWeightKg(1)).toBe(1);
  });

  it("rejects empty, zero, negative, and non-finite values", () => {
    expect(parseWeightKg(null)).toBeNull();
    expect(parseWeightKg()).toBeNull();
    expect(parseWeightKg(0)).toBeNull();
    expect(parseWeightKg(-3)).toBeNull();
    expect(parseWeightKg(Number.NaN)).toBeNull();
    expect(parseWeightKg(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe(exportDownloadFilename, () => {
  it("uses the ISO calendar date in the download name", () => {
    expect(exportDownloadFilename(new Date("2026-07-25T15:30:00.000Z"))).toBe(
      "fittrack-export-2026-07-25.json"
    );
  });
});

describe(todayISODate, () => {
  it("formats the local calendar date as zero-padded YYYY-MM-DD", () => {
    // Construct via local components so the test is timezone-independent.
    expect(todayISODate(new Date(2026, 6, 25))).toBe("2026-07-25");
  });

  it("pads single-digit months and days", () => {
    expect(todayISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("does not roll back a day like toISOString can west of Greenwich", () => {
    // Local midnight on Jan 5 anywhere is still Jan 5 locally; the helper
    // must read local components, not UTC.
    const local = new Date(2026, 0, 5, 0, 0, 0);
    expect(todayISODate(local)).toBe("2026-01-05");
  });
});

describe(toISODate, () => {
  it("accepts well-formed YYYY-MM-DD strings", () => {
    expect(toISODate("1990-05-01")).toBe("1990-05-01");
  });

  it("rejects empty, null, and malformed input", () => {
    expect(toISODate("")).toBeNull();
    expect(toISODate(null)).toBeNull();
    expect(toISODate()).toBeNull();
    expect(toISODate("1990-5-1")).toBeNull();
    expect(toISODate("not-a-date")).toBeNull();
    expect(toISODate("1990/05/01")).toBeNull();
  });
});

describe(saveProfileButtonLabel, () => {
  it("shows a confirmation label after a successful save", () => {
    expect(saveProfileButtonLabel(false)).toBe("Save Profile");
    expect(saveProfileButtonLabel(true)).toBe("Saved");
  });
});

describe(profileSaveButtonLabel, () => {
  it("reflects TanStack Form submit lifecycle on the button label", () => {
    expect(
      profileSaveButtonLabel({ isSubmitSuccessful: false, isSubmitting: false })
    ).toBe("Save Profile");
    expect(
      profileSaveButtonLabel({ isSubmitSuccessful: false, isSubmitting: true })
    ).toBe("Save Profile");
    expect(
      profileSaveButtonLabel({ isSubmitSuccessful: true, isSubmitting: false })
    ).toBe("Saved");
    expect(
      profileSaveButtonLabel({ isSubmitSuccessful: true, isSubmitting: true })
    ).toBe("Save Profile");
  });
});

describe("settings selector catalogues", () => {
  it("exposes surplus and deficit wording on goal options", () => {
    const labels = GOAL_OPTIONS.map((o) => o.label);
    expect(
      labels.some((l) => l.includes("Build Muscle") && l.includes("surplus"))
    ).toBeTruthy();
    expect(
      labels.some((l) => l.includes("Lose Fat") && l.includes("deficit"))
    ).toBeTruthy();
  });

  it("lists sedentary and moderately active activity levels", () => {
    const labels = activityOptions().map((o) => o.label);
    expect(labels.some((l) => l.includes("Sedentary"))).toBeTruthy();
    expect(labels.some((l) => l.includes("Moderately active"))).toBeTruthy();
  });

  it("includes male, female, and other sex options for BMR", () => {
    expect(SEX_OPTIONS.map((o) => o.value)).toStrictEqual([
      "male",
      "female",
      "other",
    ]);
  });
});

describe(SCIENCE_REFERENCES, () => {
  it("cites the core formulas surfaced in the About card", () => {
    const blob = SCIENCE_REFERENCES.map((r) => `${r.topic} ${r.citation}`).join(
      " "
    );
    expect(blob).toContain("Mifflin-St Jeor");
    expect(blob).toContain("Morton");
    expect(blob).toContain("Epley");
    expect(blob).toContain("Zourdos");
    expect(blob).toContain("Schoenfeld");
  });
});

describe(GOAL_CARD_OPTIONS, () => {
  it("has four goal options each with a description", () => {
    expect(GOAL_CARD_OPTIONS).toHaveLength(4);
    for (const opt of GOAL_CARD_OPTIONS) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.description).toBeTruthy();
    }
  });

  it("maps every value to a unique label", () => {
    const values = GOAL_CARD_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("describes surplus for build_muscle and deficit for lose_fat", () => {
    const muscle = GOAL_CARD_OPTIONS.find((o) => o.value === "build_muscle")!;
    const fat = GOAL_CARD_OPTIONS.find((o) => o.value === "lose_fat")!;
    expect(muscle.description).toContain("surplus");
    expect(fat.description).toContain("deficit");
  });
});

describe(buildWeightChartPoints, () => {
  // DB returns entries in descending order (newest first).
  const entries = [
    { date: "2025-01-03", weightKg: 79 },
    { date: "2025-01-02", weightKg: 79.5 },
    { date: "2025-01-01", weightKg: 80 },
  ];

  it("returns empty array for fewer than 2 valid entries", () => {
    expect(buildWeightChartPoints([], 300, 80, 8)).toStrictEqual([]);
    expect(
      buildWeightChartPoints([{ date: "2025-01-01", weightKg: 80 }], 300, 80, 8)
    ).toStrictEqual([]);
  });

  it("filters out null and non-positive weights", () => {
    const mixed = [
      { date: "2025-01-04", weightKg: 79 },
      { date: "2025-01-03", weightKg: 0 },
      { date: "2025-01-02", weightKg: null },
      { date: "2025-01-01", weightKg: 80 },
    ];
    const points = buildWeightChartPoints(mixed, 300, 80, 8);
    expect(points).toHaveLength(2);
  });

  it("returns chronologically ordered points with normalised coordinates", () => {
    const points = buildWeightChartPoints(entries, 300, 80, 8);
    expect(points).toHaveLength(3);
    // Oldest first
    expect(points[0].date).toBe("2025-01-01");
    expect(points[2].date).toBe("2025-01-03");
    // x increases monotonically
    expect(points[0].x).toBeLessThan(points[1].x);
    expect(points[1].x).toBeLessThan(points[2].x);
    // Heavier weight gets smaller y coordinate (appears higher on chart).
    expect(points[0].y).toBeLessThan(points[2].y); // 80kg above 79kg
    // All x within padded bounds
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(8);
      expect(p.x).toBeLessThanOrEqual(292);
      expect(p.y).toBeGreaterThanOrEqual(8);
      expect(p.y).toBeLessThanOrEqual(72);
    }
  });
});

describe(weightChartPolyline, () => {
  it("builds a space-separated SVG points string", () => {
    const points = [
      { date: "2025-01-01", weightKg: 80, x: 10, y: 50 },
      { date: "2025-01-02", weightKg: 79, x: 50, y: 30 },
    ];
    expect(weightChartPolyline(points)).toBe("10.0,50.0 50.0,30.0");
  });

  it("returns empty string for empty points", () => {
    expect(weightChartPolyline([])).toBe("");
  });
});

describe(parseImportFile, () => {
  it("validates a FitTrack export JSON", () => {
    const result = parseImportFile(
      JSON.stringify({ app: "FitTrack", version: "0.1.0" })
    );
    expect("data" in result).toBeTruthy();
  });

  it("rejects non-JSON text", () => {
    const result = parseImportFile("not json");
    expect("error" in result).toBeTruthy();
    if ("error" in result) {
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("rejects arrays", () => {
    const result = parseImportFile("[]");
    expect("error" in result).toBeTruthy();
    if ("error" in result) {
      expect(result.error).toContain("object");
    }
  });

  it("rejects non-FitTrack JSON", () => {
    const result = parseImportFile(JSON.stringify({ app: "OtherApp" }));
    expect("error" in result).toBeTruthy();
    if ("error" in result) {
      expect(result.error).toContain("FitTrack");
    }
  });
});
