import { Section } from "@astryxdesign/core/Section";
import type { ReactNode } from "react";

interface ScrollableTableProps {
  children: ReactNode;
  /** Stable id for e2e scroll assertions (issue #53). */
  scrollLabel: string;
}

/**
 * Keeps wide tables scrollable inside their own region at phone widths (issue #53).
 * Uses nested Section regions with data attributes for mobile overflow (issue #53).
 * @example <ScrollableTable scrollLabel="food-log"><Table ... /></ScrollableTable>
 */
export function ScrollableTable({
  scrollLabel,
  children,
}: ScrollableTableProps) {
  return (
    <Section
      aria-label={`${scrollLabel} scroll region`}
      data-fittrack-table-scroll={scrollLabel}
      padding={0}
      variant="transparent"
    >
      <Section
        data-fittrack-table-scroll-inner=""
        padding={0}
        variant="transparent"
      >
        {children}
      </Section>
    </Section>
  );
}
