import { describe, expect, it } from "vitest";

import {
  copyCompletedBody,
  dataExportedBody,
  entryDeletedBody,
  foodLoggedBody,
  mutationFailedBody,
  profileSavedBody,
  setDeletedBody,
  setSavedBody,
  setSavedWithRecordsBody,
  TOAST_DURATION_MS,
  templateLoggedBody,
  weightLoggedBody,
} from "~/lib/toasts";

describe("toast copy (issue #24)", () => {
  it("uses the exact confirmation bodies from the design sweep", () => {
    expect(profileSavedBody()).toBe("Profile saved");
    expect(foodLoggedBody()).toBe("Food logged");
    expect(copyCompletedBody(3)).toBe("Copied 3 entries");
    expect(copyCompletedBody(1)).toBe("Copied 1 entry");
    expect(templateLoggedBody(165)).toBe("Logged 165 kcal");
    expect(entryDeletedBody()).toBe("Entry deleted");
    expect(setSavedBody()).toBe("Set saved");
    expect(setSavedWithRecordsBody("Rep PR — beat 8 reps")).toBe(
      "Set saved · Rep PR — beat 8 reps"
    );
    expect(setDeletedBody()).toBe("Set deleted");
    expect(dataExportedBody()).toBe("Data exported");
  });

  it("includes the logged weight in kilograms", () => {
    expect(weightLoggedBody(75.5)).toBe("Weight logged — 75.5kg");
    expect(weightLoggedBody(80)).toBe("Weight logged — 80kg");
  });

  it('builds persistent error bodies as "{action} failed"', () => {
    expect(mutationFailedBody("Save profile")).toBe("Save profile failed");
    expect(mutationFailedBody("Log food")).toBe("Log food failed");
    expect(mutationFailedBody("Export data")).toBe("Export data failed");
  });

  it("keeps undo deletes visible for 8s and set saves for 3s", () => {
    expect(TOAST_DURATION_MS.undo).toBe(8000);
    expect(TOAST_DURATION_MS.setSaved).toBe(3000);
    expect(TOAST_DURATION_MS.info).toBe(5000);
  });
});
