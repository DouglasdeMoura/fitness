"use client";

import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { useNavigate } from "@tanstack/react-router";

import { signOut, useSession } from "~/lib/auth-client";

/** Account menu with sign-out (issue #44). */
export function UserMenu() {
  const navigate = useNavigate();
  const session = useSession();
  const accountLabel = session.data?.user.name ?? "Account";

  return (
    <DropdownMenu
      button={{ label: accountLabel, size: "lg", variant: "ghost" }}
      hasChevron
      items={[
        {
          label: "Sign out",
          onClick: async () => {
            await signOut();
            await navigate({ to: "/sign-in" });
          },
        },
      ]}
    />
  );
}
