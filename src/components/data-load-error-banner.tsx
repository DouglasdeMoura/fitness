import { Heading, VStack } from "@astryxdesign/core";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

import type { DataLoadQueryResult } from "~/lib/data-load-query";

interface DataLoadErrorBannerProps {
  description?: string;
  isRetrying?: boolean;
  onRetry: () => void;
  title: string;
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
      description={description}
      endContent={
        <Button
          clickAction={() => onRetry()}
          isLoading={isRetrying}
          label="Retry"
          size="sm"
          variant="secondary"
        />
      }
      status="error"
      title={title}
    />
  );
}

interface DataLoadErrorViewProps {
  heading: string;
  query: DataLoadQueryResult<unknown>;
  title: string;
}

/** Full-page error state: heading + banner with Retry wired to the failed query. */
export function DataLoadErrorView({
  heading,
  title,
  query,
}: DataLoadErrorViewProps) {
  return (
    <VStack as="main" gap={6}>
      <Heading level={1}>{heading}</Heading>
      <DataLoadErrorBanner
        isRetrying={query.isFetching}
        onRetry={() => query.refetch()}
        title={title}
      />
    </VStack>
  );
}
