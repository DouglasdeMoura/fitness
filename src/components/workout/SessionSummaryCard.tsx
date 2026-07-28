import {
  Badge,
  Button,
  Card,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  Text,
  VStack,
} from "@astryxdesign/core";

import type { WorkoutSessionSummary } from "~/lib/api";
import { formatDisplayInteger } from "~/lib/format-number";

interface SessionSummaryCardProps {
  summary: WorkoutSessionSummary;
  onDone: () => void;
}

export function SessionSummaryCard({
  summary,
  onDone,
}: SessionSummaryCardProps) {
  const durationLabel =
    summary.durationMinutes == null
      ? "—"
      : `${formatDisplayInteger(summary.durationMinutes)} min`;

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={2}>Session Summary</Heading>
          <Text type="supporting">{summary.name}</Text>
        </VStack>

        <Text size="2xl" weight="bold" aria-label="Session volume comparison">
          {summary.comparisonSentence}
        </Text>

        <MetadataList>
          <MetadataListItem label="Total volume">
            <Text hasTabularNumbers>
              {formatDisplayInteger(summary.totalVolume)} kg
            </Text>
          </MetadataListItem>
          <MetadataListItem label="Sets logged">
            <Text hasTabularNumbers>
              {formatDisplayInteger(summary.setCount)}
            </Text>
          </MetadataListItem>
          <MetadataListItem label="Exercises">
            <Text hasTabularNumbers>
              {formatDisplayInteger(summary.exerciseCount)}
            </Text>
          </MetadataListItem>
          <MetadataListItem label="Duration">
            <Text hasTabularNumbers>{durationLabel}</Text>
          </MetadataListItem>
          <MetadataListItem label="Personal records">
            <HStack gap={2} vAlign="center">
              <Text hasTabularNumbers>
                {formatDisplayInteger(summary.personalRecordCount)}
              </Text>
              {summary.personalRecordCount > 0 ? (
                <Badge label="PR" variant="success" />
              ) : null}
            </HStack>
          </MetadataListItem>
        </MetadataList>

        <Button label="Done" variant="primary" size="lg" clickAction={onDone} />
      </VStack>
    </Card>
  );
}
