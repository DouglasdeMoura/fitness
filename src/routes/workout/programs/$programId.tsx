import {
  Badge,
  Button,
  Card,
  CheckboxInput,
  EmptyState,
  FormLayout,
  Heading,
  HStack,
  NumberInput,
  Selector,
  TextArea,
  TextInput,
  VStack,
} from "@astryxdesign/core";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ProgramExerciseTable,
  type EditableProgramDay,
  type RemoveProgramExercise,
  type UpdateProgramExercise,
} from "~/components/workout/ProgramExerciseTable";
import { getExercises, getProgram, saveProgram, startWorkoutFromProgram } from "~/lib/api";
import type { PeriodizationType } from "~/lib/db";
import { getDupDayEmphasis } from "~/lib/workout";

export const Route = createFileRoute("/workout/programs/$programId")({
  head: () => ({ meta: [{ title: "Edit Program - FitTrack" }] }),
  component: ProgramDetailPage,
});

const PERIODIZATION_OPTIONS = [
  { value: "linear", label: "Linear progression" },
  { value: "dup", label: "Daily undulating (DUP)" },
];

function makeTempId() {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`;
}

function ProgramDetailPage() {
  const { programId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number.parseInt(programId, 10);
  const { data: program } = useSuspenseQuery({
    queryKey: ["program", id],
    queryFn: () => getProgram({ data: { id } }),
  });
  const { data: exercises } = useSuspenseQuery({
    queryKey: ["exercises"],
    queryFn: () => getExercises({ data: {} }),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState(3);
  const [periodizationType, setPeriodizationType] = useState<PeriodizationType>("linear");
  const [incrementPct, setIncrementPct] = useState(2.5);
  const [isActive, setIsActive] = useState(false);
  const [days, setDays] = useState<EditableProgramDay[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!program) return;
    setName(program.name);
    setDescription(program.description || "");
    setFrequency(program.frequency_per_week);
    setPeriodizationType(program.periodization_type);
    setIncrementPct(program.progression_increment_pct);
    setIsActive(Boolean(program.is_active));
    setDays(
      program.days.map((day) => ({
        tempId: `day-${day.id}`,
        day_name: day.day_name,
        sort_order: day.sort_order,
        exercises: day.exercises.map((exercise) => ({
          tempId: `ex-${exercise.id}`,
          exercise_id: exercise.exercise_id,
          target_sets: exercise.target_sets ?? 3,
          target_reps: exercise.target_reps ?? "8-12",
          target_rpe: exercise.target_rpe ?? 8,
          rest_seconds: exercise.rest_seconds ?? 90,
          sort_order: exercise.sort_order,
        })),
      })),
    );
  }, [program]);

  if (!program) {
    return (
      <VStack gap={4}>
        <Card>
          <VStack gap={3}>
            <EmptyState
              title="Program not found"
              description={`No training program exists for id ${programId}.`}
              headingLevel={1}
            />
            <Button label="Back to Programs" href="/workout/programs" variant="secondary" />
          </VStack>
        </Card>
      </VStack>
    );
  }

  const updateDay = (tempId: string, patch: Partial<EditableProgramDay>) => {
    setDays((current) =>
      current.map((day) => (day.tempId === tempId ? { ...day, ...patch } : day)),
    );
  };

  const updateExercise: UpdateProgramExercise = (dayTempId, exerciseTempId, patch) => {
    setDays((current) =>
      current.map((day) =>
        day.tempId === dayTempId
          ? {
              ...day,
              exercises: day.exercises.map((exercise) =>
                exercise.tempId === exerciseTempId ? { ...exercise, ...patch } : exercise,
              ),
            }
          : day,
      ),
    );
  };

  const addDay = () => {
    setDays((current) => [
      ...current,
      {
        tempId: makeTempId(),
        day_name: `Day ${String.fromCharCode(65 + current.length)}`,
        sort_order: current.length + 1,
        exercises: [],
      },
    ]);
  };

  const addExercise = (dayTempId: string) => {
    const firstExercise = exercises[0];
    if (!firstExercise) return;
    setDays((current) =>
      current.map((day) =>
        day.tempId === dayTempId
          ? {
              ...day,
              exercises: [
                ...day.exercises,
                {
                  tempId: makeTempId(),
                  exercise_id: firstExercise.id,
                  target_sets: 3,
                  target_reps: periodizationType === "dup" ? "5" : "8-12",
                  target_rpe: 8,
                  rest_seconds: 90,
                  sort_order: day.exercises.length + 1,
                },
              ],
            }
          : day,
      ),
    );
  };

  const removeDay = (tempId: string) => {
    setDays((current) =>
      current
        .filter((day) => day.tempId !== tempId)
        .map((day, index) => ({ ...day, sort_order: index + 1 })),
    );
  };

  const removeExercise: RemoveProgramExercise = (dayTempId, exerciseTempId) => {
    setDays((current) =>
      current.map((day) =>
        day.tempId === dayTempId
          ? {
              ...day,
              exercises: day.exercises
                .filter((exercise) => exercise.tempId !== exerciseTempId)
                .map((exercise, index) => ({ ...exercise, sort_order: index + 1 })),
            }
          : day,
      ),
    );
  };

  const handleSave = async () => {
    await saveProgram({
      data: {
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        frequency_per_week: frequency,
        periodization_type: periodizationType,
        progression_increment_pct: incrementPct,
        is_active: isActive,
        days: days.map((day, dayIndex) => ({
          day_name: day.day_name,
          sort_order: dayIndex + 1,
          exercises: day.exercises.map((exercise, exerciseIndex) => ({
            exercise_id: exercise.exercise_id,
            target_sets: exercise.target_sets,
            target_reps: exercise.target_reps,
            target_rpe: exercise.target_rpe,
            rest_seconds: exercise.rest_seconds,
            sort_order: exerciseIndex + 1,
          })),
        })),
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["program", id] });
    await queryClient.invalidateQueries({ queryKey: ["programs"] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleStartDay = async (programDayId: number) => {
    const result = await startWorkoutFromProgram({ data: { programId: id, programDayId } });
    navigate({ to: "/workout", search: { session: result.sessionId } });
  };

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>{name || "Edit Program"}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button label="Back to Programs" href="/workout/programs" variant="secondary" size="sm" />
          <Button
            label={saved ? "Saved!" : "Save Program"}
            variant="primary"
            clickAction={handleSave}
          />
        </HStack>
      </HStack>

      <Card>
        <VStack gap={3}>
          <Heading level={2}>Program Settings</Heading>
          <FormLayout>
            <TextInput label="Name" value={name} onChange={setName} />
            <NumberInput
              label="Frequency (days/week)"
              value={frequency}
              onChange={(value) => setFrequency(value ?? 3)}
              min={1}
              max={7}
              step={1}
              isIntegerOnly
            />
            <Selector
              label="Periodization"
              value={periodizationType}
              onChange={(value) => setPeriodizationType(value as PeriodizationType)}
              options={PERIODIZATION_OPTIONS}
            />
            {periodizationType === "linear" ? (
              <NumberInput
                label="Load increment (%)"
                value={incrementPct}
                onChange={(value) => setIncrementPct(value ?? 2.5)}
                min={1}
                max={10}
                step={0.5}
                units="%"
              />
            ) : null}
            <CheckboxInput label="Set as active program" value={isActive} onChange={setIsActive} />
            <TextArea label="Description" value={description} onChange={setDescription} />
          </FormLayout>
        </VStack>
      </Card>

      {days.length === 0 ? (
        <Card>
          <EmptyState
            title="No training days"
            description="Add a training day, then assign exercises and targets."
            headingLevel={2}
          />
        </Card>
      ) : (
        <VStack gap={3}>
          {days.map((day, dayIndex) => {
            const savedDay = program.days[dayIndex];
            return (
              <Card key={day.tempId}>
                <VStack gap={3}>
                  <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <TextInput
                        label={`Training day ${dayIndex + 1} name`}
                        value={day.day_name}
                        onChange={(value) => updateDay(day.tempId, { day_name: value })}
                      />
                      {periodizationType === "dup" && day.exercises[0]?.target_reps ? (
                        <Badge
                          label={getDupDayEmphasis(day.exercises[0].target_reps)}
                          variant="info"
                        />
                      ) : null}
                    </HStack>
                    <HStack gap={2} wrap="wrap">
                      {savedDay ? (
                        <Button
                          label={`Start ${day.day_name}`}
                          variant="primary"
                          size="sm"
                          clickAction={() => handleStartDay(savedDay.id)}
                        />
                      ) : null}
                      <Button
                        label={`Remove ${day.day_name}`}
                        variant="destructive"
                        size="sm"
                        clickAction={() => removeDay(day.tempId)}
                      >
                        Remove Day
                      </Button>
                    </HStack>
                  </HStack>

                  <ProgramExerciseTable
                    day={day}
                    exercises={exercises}
                    updateExercise={updateExercise}
                    removeExercise={removeExercise}
                  />

                  <Button
                    label={`Add exercise to ${day.day_name}`}
                    variant="secondary"
                    size="sm"
                    clickAction={() => addExercise(day.tempId)}
                  >
                    Add Exercise
                  </Button>
                </VStack>
              </Card>
            );
          })}
        </VStack>
      )}

      <Button label="Add Training Day" variant="secondary" clickAction={addDay} />
    </VStack>
  );
}
