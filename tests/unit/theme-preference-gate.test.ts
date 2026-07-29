import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FitTrackDatabase } from "../../src/db";
import { users } from "../../src/db/schema";
import { updateThemePreferenceRecord } from "../../src/db/user-body-queries";
import type { ThemePreference } from "../../src/lib/app-chrome";
import { parseServerInput } from "../../src/lib/schemas/common";
import { updateThemePreferenceInputSchema } from "../../src/lib/schemas/user";
import {
  getStoredThemePreference,
  updateStoredThemePreference,
} from "../../src/lib/theme-preference-persistence";
import type { DataIsolationFixture } from "./data-isolation-fixture";
import { seedDataIsolationFixture } from "./data-isolation-fixture";
import {
  findCreateServerFnExports,
  findServerFnAuthViolations,
} from "./server-fn-auth-scan";

class TestUnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "TestUnauthorizedError";
  }
}

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/require-auth", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/require-auth")>();
  return {
    ...actual,
    requireAuth: requireAuthMock,
  };
});

const API_SOURCE_PATH = "src/lib/api.ts";

/** Mirrors the getThemePreference handler body in src/lib/api.ts. */
async function callGetThemePreference(
  database: FitTrackDatabase
): Promise<ThemePreference> {
  const { user } = await requireAuthMock();
  return getStoredThemePreference(database, user.id);
}

/** Mirrors the updateThemePreference handler body in src/lib/api.ts. */
async function callUpdateThemePreference(
  database: FitTrackDatabase,
  themePreference: ThemePreference
): Promise<ThemePreference> {
  const { user } = await requireAuthMock();
  return updateStoredThemePreference(database, user.id, themePreference);
}

function mockAuthAs(fixture: DataIsolationFixture, asOwner: boolean): void {
  const user = asOwner ? fixture.owner : fixture.other;
  requireAuthMock.mockResolvedValue({
    authUserId: user.authUserId ?? `auth-${user.id}`,
    session: { id: `session-${user.id}`, userId: user.authUserId } as never,
    user,
    userId: user.id,
  });
}

let fixture: DataIsolationFixture;

beforeEach(() => {
  fixture = seedDataIsolationFixture();
});

afterEach(() => {
  fixture.close();
  vi.clearAllMocks();
});

describe("theme preference gate (issue #103)", () => {
  const projectRoot = join(import.meta.dirname, "../..");
  const apiSource = readFileSync(join(projectRoot, API_SOURCE_PATH), "utf-8");

  it("scopes getThemePreference and updateThemePreference with requireAuth()", () => {
    const violations = findServerFnAuthViolations(apiSource, API_SOURCE_PATH);
    const gatedNames = new Set(
      findCreateServerFnExports(apiSource, API_SOURCE_PATH).map(
        (serverFn) => serverFn.name
      )
    );

    expect(gatedNames.has("getThemePreference")).toBe(true);
    expect(gatedNames.has("updateThemePreference")).toBe(true);
    expect(
      violations.filter((violation) =>
        ["getThemePreference", "updateThemePreference"].includes(violation.name)
      )
    ).toEqual([]);
  });

  it("returns system for a user whose preference has never been written", async () => {
    expect(await getStoredThemePreference(fixture.db, fixture.owner.id)).toBe(
      "system"
    );
    mockAuthAs(fixture, true);
    expect(await callGetThemePreference(fixture.db)).toBe("system");
  });

  it("round-trips light, dark, and system through the authenticated handlers", async () => {
    const preferences: ThemePreference[] = ["light", "dark", "system"];

    for (const preference of preferences) {
      mockAuthAs(fixture, true);
      expect(await callUpdateThemePreference(fixture.db, preference)).toBe(
        preference
      );
      mockAuthAs(fixture, true);
      expect(await callGetThemePreference(fixture.db)).toBe(preference);
    }
  });

  it("accepts light, dark, and system in the validator", () => {
    for (const preference of ["light", "dark", "system"] as const) {
      expect(
        parseServerInput(updateThemePreferenceInputSchema, {
          theme_preference: preference,
        })
      ).toEqual({ theme_preference: preference });
    }
  });

  it("rejects out-of-range values before the database CHECK constraint", async () => {
    expect(() =>
      parseServerInput(updateThemePreferenceInputSchema, {
        theme_preference: "sepia",
      })
    ).toThrow(/sepia/i);

    await expect(
      updateThemePreferenceRecord(
        fixture.db,
        fixture.owner.id,
        "sepia" as never
      )
    ).rejects.toThrow(/CHECK constraint failed/i);
  });

  it("rejects unauthenticated reads without falling back to another user's preference", async () => {
    await updateStoredThemePreference(fixture.db, fixture.owner.id, "dark");
    requireAuthMock.mockRejectedValue(new TestUnauthorizedError());

    await expect(callGetThemePreference(fixture.db)).rejects.toBeInstanceOf(
      TestUnauthorizedError
    );
    expect(await getStoredThemePreference(fixture.db, fixture.other.id)).toBe(
      "system"
    );
  });

  it("rejects unauthenticated writes without mutating any user's row", async () => {
    const beforeOwner = fixture.db
      .select({ themePreference: users.themePreference })
      .from(users)
      .where(eq(users.id, fixture.owner.id))
      .get();
    const beforeOther = fixture.db
      .select({ themePreference: users.themePreference })
      .from(users)
      .where(eq(users.id, fixture.other.id))
      .get();

    requireAuthMock.mockRejectedValue(new TestUnauthorizedError());
    await expect(
      callUpdateThemePreference(fixture.db, "dark")
    ).rejects.toBeInstanceOf(TestUnauthorizedError);

    const afterOwner = fixture.db
      .select({ themePreference: users.themePreference })
      .from(users)
      .where(eq(users.id, fixture.owner.id))
      .get();
    const afterOther = fixture.db
      .select({ themePreference: users.themePreference })
      .from(users)
      .where(eq(users.id, fixture.other.id))
      .get();

    expect(afterOwner).toEqual(beforeOwner);
    expect(afterOther).toEqual(beforeOther);
  });

  it("keeps user B's read isolated after user A writes a different preference", async () => {
    await updateStoredThemePreference(fixture.db, fixture.other.id, "light");
    await updateStoredThemePreference(fixture.db, fixture.owner.id, "dark");

    mockAuthAs(fixture, false);
    expect(await callGetThemePreference(fixture.db)).toBe("light");

    const otherRow = fixture.db
      .select({ themePreference: users.themePreference })
      .from(users)
      .where(eq(users.id, fixture.other.id))
      .get();
    expect(otherRow?.themePreference).toBe("light");
  });

  it("leaves user B's stored preference unchanged when user A writes", async () => {
    await updateStoredThemePreference(fixture.db, fixture.other.id, "light");
    await updateStoredThemePreference(fixture.db, fixture.owner.id, "dark");

    const otherRow = fixture.db
      .select({ themePreference: users.themePreference })
      .from(users)
      .where(eq(users.id, fixture.other.id))
      .get();

    expect(otherRow?.themePreference).toBe("light");
    expect(await getStoredThemePreference(fixture.db, fixture.other.id)).toBe(
      "light"
    );
  });
});
