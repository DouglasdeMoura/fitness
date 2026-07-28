import { HStack, NumberInput } from "@astryxdesign/core";
import { IconButton } from "@astryxdesign/core/IconButton";

import { adjustByStep } from "~/lib/gym-input";

interface GymStepperInputProps {
  inputMode: "decimal" | "numeric";
  isIntegerOnly?: boolean;
  label: string;
  max?: number | null;
  min?: number;
  onChange: (value: number) => void;
  step: number;
  units?: string | null;
  value: number;
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
    if (max !== null && next > max) {
      onChange(max);
      return;
    }
    onChange(next);
  };

  return (
    <HStack gap={2} vAlign="center">
      <IconButton
        icon={<span aria-hidden>−</span>}
        label={`Decrease ${label}`}
        onClick={decrease}
        size="lg"
        tooltip={`Decrease ${label}`}
      />
      <NumberInput
        isIntegerOnly={isIntegerOnly}
        isLabelHidden
        label={label}
        max={max}
        min={min}
        onChange={(next) => onChange(next ?? min)}
        size="lg"
        step={step}
        units={units}
        value={value}
        {...({ inputMode } as { inputMode: "decimal" | "numeric" })}
      />
      <IconButton
        icon={<span aria-hidden>+</span>}
        label={`Increase ${label}`}
        onClick={increase}
        size="lg"
        tooltip={`Increase ${label}`}
      />
    </HStack>
  );
}
