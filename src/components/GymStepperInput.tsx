import { HStack, NumberInput } from "@astryxdesign/core";
import { IconButton } from "@astryxdesign/core/IconButton";

import { adjustByStep } from "~/lib/gym-input";

interface GymStepperInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  inputMode: "decimal" | "numeric";
  min?: number;
  max?: number | null;
  units?: string | null;
  isIntegerOnly?: boolean;
}

/**
 * Large tap targets with +/- steppers for mid-set logging (issue #53).
 * @example <GymStepperInput label="Weight" value={80} onChange={setWeight} step={2.5} inputMode="decimal" units="kg" />
 */
export function GymStepperInput({
  label,
  value,
  onChange,
  step,
  inputMode,
  min = 0,
  max = null,
  units = null,
  isIntegerOnly = false,
}: GymStepperInputProps) {
  const decrease = () => {
    onChange(adjustByStep(value, step, -1, min));
  };

  const increase = () => {
    const next = adjustByStep(value, step, 1, min);
    if (max != null && next > max) {
      onChange(max);
      return;
    }
    onChange(next);
  };

  return (
    <HStack gap={2} vAlign="center">
      <IconButton
        label={`Decrease ${label}`}
        tooltip={`Decrease ${label}`}
        icon={<span aria-hidden>−</span>}
        size="lg"
        onClick={decrease}
      />
      <NumberInput
        label={label}
        isLabelHidden
        value={value}
        onChange={(next) => onChange(next ?? min)}
        step={step}
        min={min}
        max={max}
        units={units}
        isIntegerOnly={isIntegerOnly}
        size="lg"
        {...({ inputMode } as { inputMode: "decimal" | "numeric" })}
      />
      <IconButton
        label={`Increase ${label}`}
        tooltip={`Increase ${label}`}
        icon={<span aria-hidden>+</span>}
        size="lg"
        onClick={increase}
      />
    </HStack>
  );
}
