import { Badge, Button, Card, EmptyState, FormLayout, Heading, HStack, NumberInput, Selector, Table, Text, TextArea, TextInput, VStack, proportional } from '@astryxdesign/core';
import type { TableColumn } from '@astryxdesign/core';
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import { TemplateIcon } from "~/components/icons/FitTrackIcons";
import { WorkoutSkeleton } from "~/components/loading/PageSkeletons";
import { ScrollableTable } from "~/components/ScrollableTable";
import { deleteProgram, getPrograms, saveProgram, setActiveProgram } from '~/lib/api';
import type { ProgramSummary } from '~/lib/api';
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
import {
  buildCreateProgramPayload,
  CREATE_PROGRAM_FORM_DEFAULTS,
  validateCreateProgramName,
} from "~/lib/program-form";

export const Route = createFileRoute("/workout/programs/")({
  component: ProgramsPage,
  head: () => ({ meta: [{ title: "Training Programs - FitTrack" }] }),
});

const PERIODIZATION_LABELS: Record<PeriodizationType, string> = {
  dup: "Daily undulating (DUP)",
  linear: "Linear progression",
};

const PERIODIZATION_OPTIONS = Object.entries(PERIODIZATION_LABELS).map(
  ([value, label]) => ({
    label,
    value,
  })
);

type ProgramAction = (id: number) => Promise<void>;

function programColumns(
  activateProgram: ProgramAction,
  removeProgram: ProgramAction
): TableColumn<ProgramSummary>[] {
  return [
    {
      header: "Program",
      key: "name",
      renderCell: (program) => (
        <VStack gap={1}>
          <Text weight="bold">{program.name}</Text>
          {program.description ? (
            <Text type="supporting">{program.description}</Text>
          ) : null}
        </VStack>
      ),
      width: proportional(2),
    },
    {
      header: "Status",
      key: "periodization_type",
      renderCell: (program) => (
        <HStack gap={1} wrap="wrap">
          {program.is_active ? (
            <Badge label="Active" variant="success" />
          ) : null}
          <Badge
            label={PERIODIZATION_LABELS[program.periodization_type]}
            variant="info"
          />
        </HStack>
      ),
      width: proportional(1),
    },
    {
      header: "Schedule",
      key: "day_count",
      renderCell: (program) => (
        <VStack gap={1}>
          <Text hasTabularNumbers>
            {program.day_count} training day{program.day_count === 1 ? "" : "s"}
          </Text>
          <Text type="supporting" hasTabularNumbers>
            {program.frequency_per_week}x/week
          </Text>
        </VStack>
      ),
      width: proportional(1),
    },
    {
      header: "Progression",
      key: "progression_increment_pct",
      renderCell: (program) => (
        <Text type="supporting" hasTabularNumbers>
          {program.periodization_type === "linear"
            ? `+${program.progression_increment_pct}% load`
            : "Rotating rep zones"}
        </Text>
      ),
      width: proportional(1),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (program) => (
        <HStack gap={2} wrap="wrap">
          {!program.is_active ? (
            <Button
              label={`Set ${program.name} active`}
              variant="secondary"
              size="sm"
              clickAction={() => activateProgram(program.id)}
            >
              Set Active
            </Button>
          ) : null}
          <Button
            label={`Edit ${program.name}`}
            href={`/workout/programs/${program.id}`}
            variant="secondary"
            size="sm"
          >
            Edit
          </Button>
          <Button
            label={`Delete ${program.name}`}
            variant="destructive"
            size="sm"
            clickAction={() => removeProgram(program.id)}
          >
            Delete
          </Button>
        </HStack>
      ),
    },
  ];
}

function ProgramsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const programsQuery = useDataLoadQuery({
    queryFn: () => getPrograms(),
    queryKey: ["programs"],
  });

  const [showCreate, setShowCreate] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm({
    defaultValues: CREATE_PROGRAM_FORM_DEFAULTS,
    onSubmit: async ({ value, formApi }) => {
      const program = await saveProgram({
        data: buildCreateProgramPayload(value, {
          activateIfFirst: (programsQuery.data?.length ?? 0) === 0,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
      setShowCreate(false);
      formApi.reset();
      if (program?.id) {
        await navigate({
          params: { programId: String(program.id) },
          to: "/workout/programs/$programId",
        });
      }
    },
  });

  if (isDataLoadPending(programsQuery)) {
    return <WorkoutSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([programsQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Training Programs"
        title="Failed to load programs"
        query={failedQuery}
      />
    );
  }

  const programs = programsQuery.data!;

  const openCreate = () => {
    form.reset();
    setShowCreate(true);
  };

  const cancelCreate = () => {
    form.reset();
    setShowCreate(false);
  };

  const handleCreate = () => form.handleSubmit();

  const handleSetActive: ProgramAction = async (id) => {
    await setActiveProgram({ data: { id } });
    await queryClient.invalidateQueries({ queryKey: ["programs"] });
  };

  const requestDelete: ProgramAction = async (id) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (pendingDeleteId == null) {return;}
    setIsDeleting(true);
    try {
      await deleteProgram({ data: { id: pendingDeleteId } });
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const pendingProgram = programs.find(
    (program) => program.id === pendingDeleteId
  );

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Training Programs</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Back to Workout"
            href="/workout"
            variant="secondary"
            size="sm"
          />
          <Button
            label={showCreate ? "Cancel" : "New Program"}
            variant="primary"
            size="sm"
            clickAction={() => (showCreate ? cancelCreate() : openCreate())}
          />
        </HStack>
      </HStack>

      <Card>
        <Text type="supporting">
          Build reusable multi-day programs with target sets, reps, and RPE.
          Linear programs progress load when autoregulation criteria are met;
          DUP rotates rep zones across training days within the week (Rhea et
          al. 2002; Prestes et al. 2009).
        </Text>
      </Card>

      {showCreate ? (
        <Card>
          <VStack gap={4}>
            <Heading level={2}>Create Program</Heading>
            <FormLayout>
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) => validateCreateProgramName(value),
                }}
              >
                {(field) => (
                  <TextInput
                    label="Name"
                    value={field.state.value}
                    onChange={field.handleChange}
                    placeholder="e.g. Upper/Lower Split"
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
                    onChange={(value) =>
                      field.handleChange(value as PeriodizationType)
                    }
                    options={PERIODIZATION_OPTIONS}
                  />
                )}
              </form.Field>
              <form.Field name="description">
                {(field) => (
                  <TextArea
                    label="Description"
                    value={field.state.value}
                    onChange={field.handleChange}
                    placeholder="Optional program notes"
                  />
                )}
              </form.Field>
            </FormLayout>
            <form.Subscribe
              selector={(state) => ({ isSubmitting: state.isSubmitting })}
            >
              {({ isSubmitting }) => (
                <Button
                  label={isSubmitting ? "Creating..." : "Create Program"}
                  variant="primary"
                  clickAction={handleCreate}
                />
              )}
            </form.Subscribe>
          </VStack>
        </Card>
      ) : null}

      {programs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TemplateIcon />}
            title="No training programs"
            description="Create your first training program to structure your workouts."
            actions={
              <Button
                label="Create a program"
                variant="primary"
                clickAction={openCreate}
              />
            }
            headingLevel={2}
          />
        </Card>
      ) : (
        <ScrollableTable scrollLabel="programs-list">
          <Table
            aria-label="Training programs"
            columns={programColumns(handleSetActive, requestDelete)}
            data={programs}
            idKey="id"
            density="compact"
            hasHover
          />
        </ScrollableTable>
      )}
      <DeleteConfirmationDialog
        isOpen={pendingDeleteId != null}
        onOpenChange={(open) => {
          if (!open) {setPendingDeleteId(null);}
        }}
        title={deleteNamedEntityTitle(pendingProgram?.name ?? "program")}
        subtitle={deleteCannotBeUndoneSubtitle()}
        onConfirm={confirmDelete}
        isConfirming={isDeleting}
      />
    </VStack>
  );
}
