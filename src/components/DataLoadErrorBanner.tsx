import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading, VStack } from '@astryxdesign/core'
import type { DataLoadQueryResult } from '~/lib/data-load-query'

type DataLoadErrorBannerProps = {
  title: string
  description?: string
  onRetry: () => void
  isRetrying?: boolean
}

/** Persistent load failure with a Retry action (PRD 05 §5, issue #29). */
export function DataLoadErrorBanner({
  title,
  description,
  onRetry,
  isRetrying = false,
}: DataLoadErrorBannerProps) {
  return (
    <Banner
      status="error"
      title={title}
      description={description}
      endContent={
        <Button
          label="Retry"
          variant="secondary"
          size="sm"
          isLoading={isRetrying}
          clickAction={() => onRetry()}
        />
      }
    />
  )
}

type DataLoadErrorViewProps = {
  heading: string
  title: string
  query: DataLoadQueryResult<unknown>
}

/** Full-page error state: heading + banner with Retry wired to the failed query. */
export function DataLoadErrorView({ heading, title, query }: DataLoadErrorViewProps) {
  return (
    <VStack as="main" gap={6}>
      <Heading level={1}>{heading}</Heading>
      <DataLoadErrorBanner
        title={title}
        onRetry={() => query.refetch()}
        isRetrying={query.isFetching}
      />
    </VStack>
  )
}
