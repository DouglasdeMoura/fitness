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
import { useQueryClient } from "@tanstack/react-query";
import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import { WorkoutSkeleton } from "~/components/loading/PageSkeletons";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useStore } from "@tanstack/react-store";
import { useState } from "react";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import {
  ProgramExerciseTable,
  type RemoveProgramExercise,
  type UpdateProgramExercise,
} from "~/components/workout/ProgramExerciseTable";
import { deleteProgram, getExercises, getProgram, saveProgram, startWorkoutFromProgram } from "~/lib/api";
import {
  deleteCannotBeUndoneSubtitle,
  deleteNamedEntityTitle,
} from "~/lib/delete-confirmation";
import type { PeriodizationType } from "~/lib/db";
import {
  buildProgramSavePayload,
  editableExerciseFromExercise,
  EMPTY_PROGRAM_FORM,
  newProgramDay,
  programFormDefaults,
  validateProgramDays,
  type EditableProgramDay,
  type ProgramFormValues,
} from "~/lib/program-form";
import { getDupDayEmphasis } from "~/lib/workout";

export const Route = createFileRoute("/workout/programs/$programId")({
  head: () => ({ meta: [{ title: "Edit Program - FitTrack" }] }),
  component: ProgramDetailPage,
});

const PERIODIZATION_OPTIONS = [
  { value: "linear", label: "Linear progression" },
  { value: "dup", label: "Daily undulating (DUP)" },
];

function ProgramDetailPage() {
  const { programId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number.parseInt(programId, 10);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const programQuery = useDataLoadQuery({
    queryKey: ["program", id],
    queryFn: () => getProgram({ data: { id } }),
  });
  const exercisesQuery = useDataLoadQuery({
    queryKey: ["exercises"],
    queryFn: () => getExercises({ data: {} }),
  });

  const form = useForm({
    defaultValues: (programQuery.data
      ? programFormDefaults(programQuery.data)
      : EMPTY_PROGRAM_FORM) as ProgramFormValues,
    onSubmit: async ({ value, formApi }) => {
      const saved = await saveProgram({ data: buildProgramSavePayload(value, id) });
      await queryClient.invalidateQueries({ queryKey: ["program", id] });
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
      if (saved) formApi.reset(programFormDefaults(saved));
    },
  });

  const name = useStore(form.store, (state) => state.values.name);
  const periodizationType = useStore(
    form.store,
    (state) => state.values.periodizationType,
  );
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isSubmitSuccessful = useStore(
    form.store,
    (state) => state.isSubmitSuccessful,
  );

  if (isDataLoadPending(programQuery) || isDataLoadPending(exercisesQuery)) {
    return <WorkoutSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([programQuery, exercisesQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Training Program"
        title="Failed to load program"
        query={failedQuery}
      />
    );
  }

  const program = programQuery.data;
  const exercises = exercisesQuery.data!;

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

  const handleStartDay = async (programDayId: number) => {
    const result = await startWorkoutFromProgram({ data: { programId: id, programDayId } });
    navigate({ to: "/workout", search: { session: result.sessionId } });
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteProgram({ data: { id } });
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
      navigate({ to: "/workout/programs" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const saveLabel = isSubmitting
    ? "Saving..."
    : isSubmitSuccessful
      ? "Saved!"
      : "Save Program";

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>{name || "Edit Program"}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button label="Back to Programs" href="/workout/programs" variant="secondary" size="sm" />
          <Button
            label={`Delete ${name || "program"}`}
            variant="destructive"
            size="sm"
            clickAction={() => setShowDeleteDialog(true)}
          >
            Delete
          </Button>
          <Button label={saveLabel} variant="primary" clickAction={form.handleSubmit} />
        </HStack>
      </HStack>

      <Card>
        <VStack gap={3}>
          <Heading level={2}>Program Settings</Heading>
          <FormLayout>
            <form.Field name="name">
              {(field) => (
                <TextInput
                  label="Name"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name="frequency">
              {(field) => (
                <NumberInput
                  label="Frequency (days/week)"
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value ?? 3)}
                  min={1}
                  max={7}
                  step={1}
                  isIntegerOnly
                />
              )}
            </form.Field>
            <form.Field name="periodizationType">
              {(field) => (
                <Selector
                  label="Periodization"
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value as PeriodizationType)}
                  options={PERIODIZATION_OPTIONS}
                />
              )}
            </form.Field>
            {periodizationType === "linear" ? (
              <form.Field name="incrementPct">
                {(field) => (
                  <NumberInput
                    label="Load increment (%)"
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value ?? 2.5)}
                    min={1}
                    max={10}
                    step={0.5}
                    units="%"
                  />
                )}
              </form.Field>
            ) : null}
            <form.Field name="isActive">
              {(field) => (
                <CheckboxInput
                  label="Set as active program"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <TextArea
                  label="Description"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </FormLayout>
        </VStack>
      </Card>

      <form.Field
        name="days"
        validators={{ onChange: ({ value }) => validateProgramDays(value) }}
      >
        {(daysField) => {
          const days = daysField.state.value;
          const updateDay = (tempId: string, patch: Partial<EditableProgramDay>) => {
            const index = days.findIndex((day) => day.tempId === tempId);
            if (index === -1) return;
            daysField.replaceValue(index, { ...days[index], ...patch });
          };
          const updateExercise: UpdateProgramExercise = (
            dayTempId,
            exerciseTempId,
            patch,
          ) => {
            const dayIndex = days.findIndex((day) => day.tempId === dayTempId);
            if (dayIndex === -1) return;
            const day = days[dayIndex];
            const exercises = day.exercises.map((exercise) =>
              exercise.tempId === exerciseTempId ? { ...exercise, ...patch } : exercise,
            );
            daysField.replaceValue(dayIndex, { ...day, exercises });
          };
          const addDay = () => {
            daysField.pushValue(newProgramDay(days.length));
          };
          const addExercise = (dayTempId: string) => {
            const firstExercise = exercises[0];
            if (!firstExercise) return;
            const dayIndex = days.findIndex((day) => day.tempId === dayTempId);
            if (dayIndex === -1) return;
            const day = days[dayIndex];
            const nextExercise = editableExerciseFromExercise(
              firstExercise,
              periodizationType,
              day.exercises.length + 1,
            );
            daysField.replaceValue(dayIndex, {
              ...day,
              exercises: [...day.exercises, nextExercise],
            });
          };
          const removeDay = (tempId: string) => {
            const index = days.findIndex((day) => day.tempId === tempId);
            if (index !== -1) daysField.removeValue(index);
          };
          const removeExercise: RemoveProgramExercise = (dayTempId, exerciseTempId) => {
            const dayIndex = days.findIndex((day) => day.tempId === dayTempId);
            if (dayIndex === -1) return;
            const day = days[dayIndex];
            const exercises = day.exercises.filter(
              (exercise) => exercise.tempId !== exerciseTempId,
            );
            daysField.replaceValue(dayIndex, { ...day, exercises });
          };

          if (days.length === 0) {
            return (
              <Card>
                <EmptyState
                  title="No training days"
                  description="Add a training day, then assign exercises and targets."
                  headingLevel={2}
                />
              </Card>
            );
          }

          return (
            <VStack gap={3}>
              {days.map((day, dayIndex) => {
                const persistedId = day.persistedId;
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
                          {persistedId ? (
                            <Button
                              label={`Start ${day.day_name}`}
                              variant="primary"
                              size="sm"
                              clickAction={() => handleStartDay(persistedId)}
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
              <Button label="Add Training Day" variant="secondary" clickAction={addDay} />
            </VStack>
          );
        }}
      </form.Field>

      <DeleteConfirmationDialog
        isOpen={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={deleteNamedEntityTitle(name || program.name)}
        subtitle={deleteCannotBeUndoneSubtitle()}
        onConfirm={handleConfirmDelete}
        isConfirming={isDeleting}
      />
    </VStack>
  );
}
