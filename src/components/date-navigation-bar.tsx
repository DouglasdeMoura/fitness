import { Button, DateInput, HStack } from "@astryxdesign/core";
import { IconButton } from "@astryxdesign/core/IconButton";

import { asDateValue } from "~/lib/input-values";
import { addDays, todayString } from "~/lib/nutrition";

interface DateNavigationBarProps {
  onDateChange: (date: string) => void;
  selectedDate: string;
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
    <HStack data-visual-mask="" gap={2} vAlign="center" wrap="wrap">
      <IconButton
        icon={<span aria-hidden>←</span>}
        label="Previous day"
        onClick={() => onDateChange(addDays(selectedDate, -1))}
        size="sm"
        tooltip="Previous day"
        variant="secondary"
      />
      <DateInput
        isLabelHidden
        label="Date"
        max={asDateValue(today)}
        onChange={(value) => {
          if (value) {
            onDateChange(value);
          }
        }}
        size="sm"
        value={asDateValue(selectedDate)}
      />
      <IconButton
        icon={<span aria-hidden>→</span>}
        isDisabled={isToday}
        label="Next day"
        onClick={() => onDateChange(addDays(selectedDate, 1))}
        size="sm"
        tooltip="Next day"
        variant="secondary"
      />
      <Button
        isDisabled={isToday}
        label="Today"
        onClick={() => onDateChange(today)}
        size="sm"
      />
    </HStack>
  );
}
