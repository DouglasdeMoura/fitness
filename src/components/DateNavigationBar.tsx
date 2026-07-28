import { Button, DateInput, HStack } from "@astryxdesign/core";
import { IconButton } from "@astryxdesign/core/IconButton";

import { asDateValue } from "~/lib/input-values";
import { addDays, todayString } from "~/lib/nutrition";

interface DateNavigationBarProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

/**
 * Prev/next day controls with a DateInput popover and quick jump to today.
 * @example <DateNavigationBar selectedDate="2026-07-25" onDateChange={setDate} />
 */
export function DateNavigationBar({
  selectedDate,
  onDateChange,
}: DateNavigationBarProps) {
  const today = todayString();
  const isToday = selectedDate === today;

  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <IconButton
        label="Previous day"
        tooltip="Previous day"
        icon={<span aria-hidden>←</span>}
        variant="secondary"
        size="sm"
        onClick={() => onDateChange(addDays(selectedDate, -1))}
      />
      <DateInput
        label="Date"
        isLabelHidden
        value={asDateValue(selectedDate)}
        max={asDateValue(today)}
        size="sm"
        onChange={(value) => {
          if (value) {onDateChange(value);}
        }}
      />
      <IconButton
        label="Next day"
        tooltip="Next day"
        icon={<span aria-hidden>→</span>}
        variant="secondary"
        size="sm"
        isDisabled={isToday}
        onClick={() => onDateChange(addDays(selectedDate, 1))}
      />
      <Button
        label="Today"
        size="sm"
        isDisabled={isToday}
        onClick={() => onDateChange(today)}
      />
    </HStack>
  );
}
