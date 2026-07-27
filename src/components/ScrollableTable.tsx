import { Section } from '@astryxdesign/core/Section'
import type { ReactNode } from 'react'

type ScrollableTableProps = {
  /** Stable id for e2e scroll assertions (issue #53). */
  scrollLabel: string
  children: ReactNode
}

/**
 * Keeps wide tables scrollable inside their own region at phone widths (issue #53).
 * Uses nested Section regions with data attributes for mobile overflow (issue #53).
 * @example <ScrollableTable scrollLabel="food-log"><Table ... /></ScrollableTable>
 */
export function ScrollableTable({ scrollLabel, children }: ScrollableTableProps) {
  return (
    <Section
      variant="transparent"
      padding={0}
      data-fittrack-table-scroll={scrollLabel}
      aria-label={`${scrollLabel} scroll region`}
    >
      <Section variant="transparent" padding={0} data-fittrack-table-scroll-inner="">
        {children}
      </Section>
    </Section>
  )
}
