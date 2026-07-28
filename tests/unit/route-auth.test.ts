import { describe, expect, it } from "vitest";

import { isProtectedAppPath } from "~/lib/route-auth";

describe(isProtectedAppPath, () => {
  it("matches primary app routes and nested pages", () => {
    expect(isProtectedAppPath("/dashboard")).toBe(true);
    expect(isProtectedAppPath("/nutrition/templates/4")).toBe(true);
    expect(isProtectedAppPath("/workout/programs/2")).toBe(true);
    expect(isProtectedAppPath("/settings")).toBe(true);
    expect(isProtectedAppPath("/review")).toBe(true);
  });

  it("does not treat public routes as protected", () => {
    expect(isProtectedAppPath("/")).toBe(false);
    expect(isProtectedAppPath("/sign-in")).toBe(false);
    expect(isProtectedAppPath("/sign-up")).toBe(false);
  });
});
