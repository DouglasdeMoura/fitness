import { Button, HStack } from "@astryxdesign/core";
import { AppShell } from "@astryxdesign/core/AppShell";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import type { ReactNode } from "react";

import { DashboardIcon } from "~/components/icons/fit-track-icons";

/** Simplified marketing nav without authenticated app links (issue #45). */
export function LandingTopNav() {
  return (
    <TopNav
      endContent={
        <HStack align="center" gap={2}>
          <Button
            href="/sign-in"
            label="Sign in"
            size="lg"
            variant="secondary"
          />
          <Button
            href="/sign-up"
            label="Get started"
            size="lg"
            variant="primary"
          />
        </HStack>
      }
      heading={
        <TopNavHeading
          heading="FitTrack"
          headingHref="/"
          logo={<NavIcon icon={<DashboardIcon />} />}
        />
      }
      label="FitTrack marketing navigation"
      startContent={<TopNavItem href="/blog" label="Blog" />}
    />
  );
}

/** App shell wrapper for the public landing page outside the authenticated chrome. */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <AppShell
      contentPadding={0}
      height="auto"
      mobileNav={false}
      topNav={<LandingTopNav />}
      variant="wash"
    >
      {children}
    </AppShell>
  );
}
