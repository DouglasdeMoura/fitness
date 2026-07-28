import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRecord } from "../../src/db/user-body-queries";
import { requireAuth, UnauthorizedError } from "../../src/lib/require-auth";

const { getRequest } = vi.hoisted(() => ({
  getRequest: vi.fn(),
}));
const { ensureSessionUserRecord } = vi.hoisted(() => ({
  ensureSessionUserRecord: vi.fn(),
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

vi.mock("~/db/user-body-queries", () => ({
  ensureSessionUserRecord,
}));

vi.mock("../../src/lib/auth", () => ({
  auth,
}));

const sessionUser = {
  email: "runner@example.com",
  id: "auth-user-1",
  name: "Runner",
};

const legacyUser = {
  activityLevel: "moderate",
  authUserId: "auth-user-1",
  birthDate: null,
  createdAt: "2026-01-01",
  email: "runner@example.com",
  goalType: "build_muscle",
  heightCm: 178,
  id: 7,
  name: "Runner",
  sex: "male",
  updatedAt: "2026-01-01",
} satisfies UserRecord;

describe(requireAuth, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequest.mockReturnValue(new Request("http://localhost/api"));
  });

  it("throws UnauthorizedError when Better Auth has no session", async () => {
    auth.api.getSession.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns the linked legacy profile for the authenticated user", async () => {
    auth.api.getSession.mockResolvedValue({
      session: { id: "session-1", userId: sessionUser.id },
      user: sessionUser,
    } as never);
    ensureSessionUserRecord.mockResolvedValue(legacyUser);

    const result = await requireAuth();

    expect(ensureSessionUserRecord).toHaveBeenCalledWith({}, sessionUser);
    expect(result.userId).toBe(7);
    expect(result.authUserId).toBe("auth-user-1");
    expect(result.user).toBe(legacyUser);
  });
});
