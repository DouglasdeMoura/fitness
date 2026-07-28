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
import { calorieRemainingLabel, macroProgress } from "~/lib/dashboard";
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
        <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
          <Heading level={2}>Daily Summary</Heading>
          {onLogFood ? (
            <Button
              clickAction={onLogFood}
              label="Log food"
              size="lg"
              variant="primary"
            >
              Log food
            </Button>
          ) : null}
        </HStack>
        <HStack gap={2} vAlign="end">
          <Text data-size="hero" hasTabularNumbers size="4xl" weight="bold">
            {formatDisplayInteger(totals.calories)}
          </Text>
          <Text type="supporting">/ {targets.calories} kcal</Text>
        </HStack>
        <ProgressBar
          isLabelHidden
          label="Calories consumed today"
          max={calorieState.max}
          value={calorieState.value}
          variant={calorieState.variant}
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
