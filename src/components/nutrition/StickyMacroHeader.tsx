import {
  Button,
  Card,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  Text,
  VStack,
} from "@astryxdesign/core";

import type { DailyTargets } from "~/lib/api";
import { macroProgress,calorieRemainingLabel } from "~/lib/dashboard";
import { formatDisplayInteger } from "~/lib/format-number";
import type { NutritionTotals } from "~/lib/nutrition";

/**
 * Sticky macro summary header for the nutrition page.
 * Shows daily calorie/macro progress with hero numbers and a
 * log-food button that triggers the food-search popover (PRD 06 Batch 2).
 *
 * Uses safe-area padding for notched phones (PRD 12, issue #48).
 */
export function StickyMacroHeader({
  totals,
  targets,
  onLogFood,
}: {
  totals: NutritionTotals;
  targets: DailyTargets;
  onLogFood?: () => void;
}) {
  const calorieState = macroProgress(
    totals.calories,
    targets.calories,
    "accent"
  );

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
          <Heading level={2}>Daily Summary</Heading>
          {onLogFood ? (
            <Button
              label="Log food"
              variant="primary"
              size="lg"
              clickAction={onLogFood}
            >
              Log food
            </Button>
          ) : undefined}
        </HStack>
        <HStack gap={2} vAlign="end">
          <Text size="4xl" weight="bold" hasTabularNumbers data-size="hero">
            {formatDisplayInteger(totals.calories)}
          </Text>
          <Text type="supporting">/ {targets.calories} kcal</Text>
        </HStack>
        <ProgressBar
          label="Calories consumed today"
          value={calorieState.value}
          max={calorieState.max}
          variant={calorieState.variant}
          isLabelHidden
        />
        <Text type="supporting">
          {calorieRemainingLabel(totals.calories, targets.calories)}
        </Text>
        <MetadataList>
          <MetadataListItem label="Protein">
            <Text hasTabularNumbers>
              {formatDisplayInteger(totals.protein_g)} / {targets.protein_g} g
            </Text>
          </MetadataListItem>
          <MetadataListItem label="Carbs">
            <Text hasTabularNumbers>
              {formatDisplayInteger(totals.carbs_g)} / {targets.carbs_g} g
            </Text>
          </MetadataListItem>
          <MetadataListItem label="Fat">
            <Text hasTabularNumbers>
              {formatDisplayInteger(totals.fat_g)} / {targets.fat_g} g
            </Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </Card>
  );
}
