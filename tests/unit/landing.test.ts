import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LANDING_FEATURE_CARDS,
  LANDING_FINAL_CTA,
  LANDING_HERO_HEADLINE,
  LANDING_PRIMARY_CTA,
  LANDING_SECONDARY_CTA,
} from "~/lib/landing-content";

describe("landing content (issue #45)", () => {
  it("defines four clickable feature highlights", () => {
    expect(LANDING_FEATURE_CARDS).toHaveLength(4);
    expect(LANDING_FEATURE_CARDS.map((card) => card.href)).toEqual([
      "/blog/macros-101",
      "/blog/progressive-overload-guide",
      "/sign-up",
      "/blog/mifflin-st-jeor-bmr",
    ]);
  });

  it("uses the PRD hero headline and CTA destinations", () => {
    expect(LANDING_HERO_HEADLINE).toBe(
      "Train smarter. Eat better. Backed by science."
    );
    expect(LANDING_PRIMARY_CTA).toEqual({
      href: "/sign-up",
      label: "Get Started Free",
    });
    expect(LANDING_SECONDARY_CTA).toEqual({
      href: "/blog",
      label: "See the science",
    });
    expect(LANDING_FINAL_CTA.buttonLabel).toBe("Create your free account");
    expect(LANDING_FINAL_CTA.href).toBe("/sign-up");
  });
});

describe("landing route wiring (issue #45)", () => {
  const indexSource = readFileSync(
    join(process.cwd(), "src/routes/index.tsx"),
    "utf-8"
  );
  const landingSource = readFileSync(
    join(process.cwd(), "src/components/landing/landing-page.tsx"),
    "utf-8"
  );
  const topNavSource = readFileSync(
    join(process.cwd(), "src/components/landing/landing-top-nav.tsx"),
    "utf-8"
  );

  it("redirects authenticated visitors before rendering the landing page", () => {
    expect(indexSource).toContain(
      "beforeLoad: redirectAuthenticatedToDashboard"
    );
    expect(indexSource).toContain("component: LandingPage");
  });

  it("renders hero, feature cards, science section, and final CTA", () => {
    expect(landingSource).toContain('type="display-1"');
    expect(landingSource).toContain("ClickableCard");
    expect(landingSource).toContain("Blockquote");
    expect(landingSource).toContain("LANDING_FINAL_CTA.headline");
    expect(landingSource).toContain("LANDING_PRIMARY_CTA.label");
    expect(landingSource).toContain("LANDING_SECONDARY_CTA.label");
  });

  it("uses token-backed Astryx layout primitives only", () => {
    expect(landingSource).not.toContain("style={{");
    expect(landingSource).not.toContain("<div");
    expect(landingSource).not.toContain("className=");
    expect(topNavSource).not.toContain("/dashboard");
    expect(topNavSource).not.toContain("/settings");
    expect(topNavSource).toContain('href="/blog"');
    expect(topNavSource).toContain('href="/sign-in"');
    expect(topNavSource).toContain('href="/sign-up"');
  });

  it("uses large buttons for 44px touch targets on mobile CTAs", () => {
    expect(landingSource).toContain('size="lg"');
    expect(topNavSource).toContain('size="lg"');
  });
});
