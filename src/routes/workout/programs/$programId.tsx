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
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/data-load-error-banner";
import { DeleteConfirmationDialog } from "~/components/delete-confirmation-dialog";
import { WorkoutSkeleton } from "~/components/loading/page-skeletons";
import type {
  RemoveProgramExercise,
  UpdateProgramExercise,
} from "~/components/workout/program-exercise-table";
import { ProgramExerciseTable } from "~/components/workout/program-exercise-table";
import {
  deleteProgram,
  getExercises,
  getProgram,
  saveProgram,
  startWorkoutFromProgram,
} from "~/lib/api";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import type { PeriodizationType } from "~/lib/db";
import {
  deleteCannotBeUndoneSubtitle,
  deleteNamedEntityTitle,
} from "~/lib/delete-confirmation";
import type { EditableProgramDay, ProgramFormValues } from "~/lib/program-form";
import {
  buildProgramSavePayload,
  EMPTY_PROGRAM_FORM,
  editableExerciseFromExercise,
  newProgramDay,
  programFormDefaults,
  validateProgramDays,
} from "~/lib/program-form";
import { getDupDayEmphasis } from "~/lib/workout";

export const Route = createFileRoute("/workout/programs/$programId")({
  component: ProgramDetailPage,
  head: () => ({ meta: [{ title: "Edit Program - FitTrack" }] }),
});

const PERIODIZATION_OPTIONS = [
  { label: "Linear progression", value: "linear" },
  { label: "Daily undulating (DUP)", value: "dup" },
];

function ProgramDetailPage() {
  const { programId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number.parseInt(programId, 10);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const programQuery = useDataLoadQuery({
    queryFn: () => getProgram({ data: { id } }),
    queryKey: ["program", id],
  });
  const exercisesQuery = useDataLoadQuery({
    queryFn: () => getExercises({ data: {} }),
    queryKey: ["exercises"],
  });

  const form = useForm({
    defaultValues: (programQuery.data
      ? programFormDefaults(programQuery.data)
      : EMPTY_PROGRAM_FORM) as ProgramFormValues,
    onSubmit: async ({ value, formApi }) => {
      const saved = await saveProgram({
        data: buildProgramSavePayload(value, id),
      });
      await queryClient.invalidateQueries({ queryKey: ["program", id] });
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
      if (saved) {
        formApi.reset(programFormDefaults(saved));
      }
    },
  });

  const name = useStore(form.store, (state) => state.values.name);
  const periodizationType = useStore(
    form.store,
    (state) => state.values.periodizationType
  );
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isSubmitSuccessful = useStore(
    form.store,
    (state) => state.isSubmitSuccessful
  );

  if (isDataLoadPending(programQuery) || isDataLoadPending(exercisesQuery)) {
    return <WorkoutSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([programQuery, exercisesQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Training Program"
        query={failedQuery}
        title="Failed to load program"
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
              description={`No training program exists for id ${programId}.`}
              headingLevel={1}
              title="Program not found"
            />
            <Button
              href="/workout/programs"
              label="Back to Programs"
              variant="secondary"
            />
          </VStack>
        </Card>
      </VStack>
    );
  }

  const handleStartDay = async (programDayId: number) => {
    const result = await startWorkoutFromProgram({
      data: { programDayId, programId: id },
    });
    navigate({ search: { session: result.sessionId }, to: "/workout" });
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
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
        <Heading level={1}>{name || "Edit Program"}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            href="/workout/programs"
            label="Back to Programs"
            size="sm"
            variant="secondary"
          />
          <Button
            clickAction={() => setShowDeleteDialog(true)}
            label={`Delete ${name || "program"}`}
            size="sm"
            variant="destructive"
          >
            Delete
          </Button>
          <Button
            clickAction={form.handleSubmit}
            label={saveLabel}
            variant="primary"
          />
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
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="frequency">
              {(field) => (
                <NumberInput
                  isIntegerOnly
                  label="Frequency (days/week)"
                  max={7}
                  min={1}
                  onChange={(value) => field.handleChange(value ?? 3)}
                  step={1}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="periodizationType">
              {(field) => (
                <Selector
                  label="Periodization"
                  onChange={(value) =>
                    field.handleChange(value as PeriodizationType)
                  }
                  options={PERIODIZATION_OPTIONS}
                  value={field.state.value}
                />
              )}
            </form.Field>
            {periodizationType === "linear" ? (
              <form.Field name="incrementPct">
                {(field) => (
                  <NumberInput
                    label="Load increment (%)"
                    max={10}
                    min={1}
                    onChange={(value) => field.handleChange(value ?? 2.5)}
                    step={0.5}
                    units="%"
                    value={field.state.value}
                  />
                )}
              </form.Field>
            ) : null}
            <form.Field name="isActive">
              {(field) => (
                <CheckboxInput
                  label="Set as active program"
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <TextArea
                  label="Description"
                  onChange={field.handleChange}
                  value={field.state.value}
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
          const updateDay = (
            tempId: string,
            patch: Partial<EditableProgramDay>
          ) => {
            const index = days.findIndex((day) => day.tempId === tempId);
            if (index === -1) {
              return;
            }
            daysField.replaceValue(index, { ...days[index], ...patch });
          };
          const updateExercise: UpdateProgramExercise = (
            dayTempId,
            exerciseTempId,
            patch
          ) => {
            const dayIndex = days.findIndex((day) => day.tempId === dayTempId);
            if (dayIndex === -1) {
              return;
            }
            const day = days[dayIndex];
            const updatedExercises = day.exercises.map((exercise) =>
              exercise.tempId === exerciseTempId
                ? { ...exercise, ...patch }
                : exercise
            );
            daysField.replaceValue(dayIndex, {
              ...day,
              exercises: updatedExercises,
            });
          };
          const addDay = () => {
            daysField.pushValue(newProgramDay(days.length));
          };
          const addExercise = (dayTempId: string) => {
            const [firstExercise] = exercises;
            if (!firstExercise) {
              return;
            }
            const dayIndex = days.findIndex((day) => day.tempId === dayTempId);
            if (dayIndex === -1) {
              return;
            }
            const day = days[dayIndex];
            const nextExercise = editableExerciseFromExercise(
              firstExercise,
              periodizationType,
              day.exercises.length + 1
            );
            daysField.replaceValue(dayIndex, {
              ...day,
              exercises: [...day.exercises, nextExercise],
            });
          };
          const removeDay = (tempId: string) => {
            const index = days.findIndex((day) => day.tempId === tempId);
            if (index !== -1) {
              daysField.removeValue(index);
            }
          };
          const removeExercise: RemoveProgramExercise = (
            dayTempId,
            exerciseTempId
          ) => {
            const dayIndex = days.findIndex((day) => day.tempId === dayTempId);
            if (dayIndex === -1) {
              return;
            }
            const day = days[dayIndex];
            const remainingExercises = day.exercises.filter(
              (exercise) => exercise.tempId !== exerciseTempId
            );
            daysField.replaceValue(dayIndex, {
              ...day,
              exercises: remainingExercises,
            });
          };

          if (days.length === 0) {
            return (
              <Card>
                <EmptyState
                  description="Add a training day, then assign exercises and targets."
                  headingLevel={2}
                  title="No training days"
                />
              </Card>
            );
          }

          return (
            <VStack gap={3}>
              {days.map((day, dayIndex) => {
                const { persistedId } = day;
                return (
                  <Card key={day.tempId}>
                    <VStack gap={3}>
                      <HStack
                        gap={3}
                        hAlign="between"
                        vAlign="center"
                        wrap="wrap"
                      >
                        <HStack gap={2} vAlign="center" wrap="wrap">
                          <TextInput
                            label={`Training day ${dayIndex + 1} name`}
                            onChange={(value) =>
                              updateDay(day.tempId, { day_name: value })
                            }
                            value={day.day_name}
                          />
                          {periodizationType === "dup" &&
                          day.exercises[0]?.target_reps ? (
                            <Badge
                              label={getDupDayEmphasis(
                                day.exercises[0].target_reps
                              )}
                              variant="info"
                            />
                          ) : null}
                        </HStack>
                        <HStack gap={2} wrap="wrap">
                          {persistedId ? (
                            <Button
                              clickAction={() => handleStartDay(persistedId)}
                              label={`Start ${day.day_name}`}
                              size="sm"
                              variant="primary"
                            />
                          ) : null}
                          <Button
                            clickAction={() => removeDay(day.tempId)}
                            label={`Remove ${day.day_name}`}
                            size="sm"
                            variant="destructive"
                          >
                            Remove Day
                          </Button>
                        </HStack>
                      </HStack>

                      <ProgramExerciseTable
                        day={day}
                        exercises={exercises}
                        removeExercise={removeExercise}
                        updateExercise={updateExercise}
                      />

                      <Button
                        clickAction={() => addExercise(day.tempId)}
                        label={`Add exercise to ${day.day_name}`}
                        size="sm"
                        variant="secondary"
                      >
                        Add Exercise
                      </Button>
                    </VStack>
                  </Card>
                );
              })}
              <Button
                clickAction={addDay}
                label="Add Training Day"
                variant="secondary"
              />
            </VStack>
          );
        }}
      </form.Field>

      <DeleteConfirmationDialog
        isConfirming={isDeleting}
        isOpen={showDeleteDialog}
        onConfirm={handleConfirmDelete}
        onOpenChange={setShowDeleteDialog}
        subtitle={deleteCannotBeUndoneSubtitle()}
        title={deleteNamedEntityTitle(name || program.name)}
      />
    </VStack>
  );
}
