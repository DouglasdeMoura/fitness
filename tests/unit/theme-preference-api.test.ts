import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_PREFERENCE_VALUES, users } from "~/db/schema";
import type { ThemePreference } from "~/lib/app-chrome";
import { UnauthorizedError, requireAuth } from "~/lib/require-auth";
import { parseServerInput } from "~/lib/schemas/common";
import {
  updateThemePreferenceInputSchema,
  userProfileUpdateSchema,
} from "~/lib/schemas/user";
import {
  getStoredThemePreference,
  updateStoredThemePreference,
} from "~/lib/theme-preference-persistence";

import { createDrizzleTestDb } from "./drizzle-test-db";
import type { DrizzleTestDb } from "./drizzle-test-db";

const { getRequest } = vi.hoisted(() => ({
  getRequest: vi.fn(),
}));
const { auth } = vi.hoisted(() => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest,
}));

vi.mock("~/db", () => ({
  db: {},
}));

vi.mock("../../src/lib/auth", () => ({
  auth,
}));

let fixture: DrizzleTestDb;

beforeEach(() => {
  fixture = createDrizzleTestDb();
});

afterEach(() => {
  fixture.close();
  vi.clearAllMocks();
});

describe("theme preference persistence (issue #102)", () => {
  it("returns system for a new user", async () => {
    expect(await getStoredThemePreference(fixture.db, fixture.userId)).toBe(
      "system"
    );
  });

  it("persists light, dark, and system and survives a subsequent read", async () => {
    const preferences: ThemePreference[] = ["light", "dark", "system"];

    for (const preference of preferences) {
      expect(
        await updateStoredThemePreference(
          fixture.db,
          fixture.userId,
          preference
        )
      ).toBe(preference);
      expect(await getStoredThemePreference(fixture.db, fixture.userId)).toBe(
        preference
      );
    }
  });

  it("updates only the requested user's preference", async () => {
    const otherUserId = fixture.db
      .insert(users)
      .values({})
      .returning()
      .get().id;

    await updateStoredThemePreference(fixture.db, fixture.userId, "dark");
    await updateStoredThemePreference(fixture.db, otherUserId, "light");

    expect(await getStoredThemePreference(fixture.db, fixture.userId)).toBe(
      "dark"
    );
    expect(await getStoredThemePreference(fixture.db, otherUserId)).toBe(
      "light"
    );
  });
});

describe("theme preference validators (issue #102)", () => {
  it("imports allowed values from the shared Batch 1 const", () => {
    expect(THEME_PREFERENCE_VALUES).toEqual(["light", "dark", "system"]);
    expect(
      updateThemePreferenceInputSchema.shape.theme_preference.options
    ).toEqual([...THEME_PREFERENCE_VALUES]);
  });

  it("rejects values outside light, dark, and system", () => {
    expect(() =>
      parseServerInput(updateThemePreferenceInputSchema, {
        theme_preference: "sepia",
      })
    ).toThrow(/sepia/i);
    expect(() =>
      parseServerInput(updateThemePreferenceInputSchema, {
        theme_preference: "sepia",
      })
    ).toThrow(/light|dark|system/i);
  });

  it("keeps theme_preference off the profile save payload", () => {
    expect(userProfileUpdateSchema.shape).not.toHaveProperty(
      "theme_preference"
    );
    expect(userProfileUpdateSchema.shape).not.toHaveProperty("themePreference");
  });
});

describe("theme preference auth scoping (issue #102)", () => {
  it("throws UnauthorizedError when Better Auth has no session", async () => {
    auth.api.getSession.mockResolvedValue(null);
    getRequest.mockReturnValue(new Request("http://localhost/api"));

    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
