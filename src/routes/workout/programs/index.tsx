import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormLayout,
  Heading,
  HStack,
  NumberInput,
  Selector,
  Table,
  Text,
  TextArea,
  TextInput,
  VStack,
  proportional,
  type TableColumn,
} from "@astryxdesign/core";
import { ScrollableTable } from "~/components/ScrollableTable";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  deleteProgram,
  getPrograms,
  saveProgram,
  setActiveProgram,
  type ProgramSummary,
} from "~/lib/api";
import type { PeriodizationType } from "~/lib/db";

export const Route = createFileRoute("/workout/programs/")({
  head: () => ({ meta: [{ title: "Training Programs - FitTrack" }] }),
  component: ProgramsPage,
});

const PERIODIZATION_LABELS: Record<PeriodizationType, string> = {
  linear: "Linear progression",
  dup: "Daily undulating (DUP)",
};

const PERIODIZATION_OPTIONS = Object.entries(PERIODIZATION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

type ProgramAction = (id: number) => Promise<void>;

function programColumns(
  activateProgram: ProgramAction,
  removeProgram: ProgramAction,
): TableColumn<ProgramSummary>[] {
  return [
    {
      key: "name",
      header: "Program",
      width: proportional(2),
      renderCell: (program) => (
        <VStack gap={1}>
          <Text weight="bold">{program.name}</Text>
          {program.description ? <Text type="supporting">{program.description}</Text> : null}
        </VStack>
      ),
    },
    {
      key: "periodization_type",
      header: "Status",
      width: proportional(1),
      renderCell: (program) => (
        <HStack gap={1} wrap="wrap">
          {program.is_active ? <Badge label="Active" variant="success" /> : null}
          <Badge label={PERIODIZATION_LABELS[program.periodization_type]} variant="info" />
        </HStack>
      ),
    },
    {
      key: "day_count",
      header: "Schedule",
      width: proportional(1),
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
    },
    {
      key: "progression_increment_pct",
      header: "Progression",
      width: proportional(1),
      renderCell: (program) => (
        <Text type="supporting" hasTabularNumbers>
          {program.periodization_type === "linear"
            ? `+${program.progression_increment_pct}% load`
            : "Rotating rep zones"}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
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
  const { data: programs } = useSuspenseQuery({
    queryKey: ["programs"],
    queryFn: () => getPrograms(),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState(3);
  const [periodizationType, setPeriodizationType] = useState<PeriodizationType>("linear");

  const handleCreate = async () => {
    if (!name.trim()) return;
    const program = await saveProgram({
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        frequency_per_week: frequency,
        periodization_type: periodizationType,
        is_active: programs.length === 0,
        days: [{ day_name: "Day A", sort_order: 1, exercises: [] }],
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["programs"] });
    setShowCreate(false);
    setName("");
    setDescription("");
    if (program?.id) {
      await navigate({
        to: "/workout/programs/$programId",
        params: { programId: String(program.id) },
      });
    }
  };

  const handleSetActive: ProgramAction = async (id) => {
    await setActiveProgram({ data: { id } });
    await queryClient.invalidateQueries({ queryKey: ["programs"] });
  };

  const handleDelete: ProgramAction = async (id) => {
    if (!window.confirm("Delete this training program?")) return;
    await deleteProgram({ data: { id } });
    await queryClient.invalidateQueries({ queryKey: ["programs"] });
  };

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Training Programs</Heading>
        <HStack gap={2} wrap="wrap">
          <Button label="Back to Workout" href="/workout" variant="secondary" size="sm" />
          <Button
            label={showCreate ? "Cancel" : "New Program"}
            variant="primary"
            size="sm"
            clickAction={() => setShowCreate((value) => !value)}
          />
        </HStack>
      </HStack>

      <Card>
        <Text type="supporting">
          Build reusable multi-day programs with target sets, reps, and RPE. Linear programs
          progress load when autoregulation criteria are met; DUP rotates rep zones across training
          days within the week (Rhea et al. 2002; Prestes et al. 2009).
        </Text>
      </Card>

      {showCreate ? (
        <Card>
          <VStack gap={4}>
            <Heading level={2}>Create Program</Heading>
            <FormLayout>
              <TextInput
                label="Name"
                value={name}
                onChange={setName}
                placeholder="e.g. Upper/Lower Split"
              />
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
              <TextArea
                label="Description"
                value={description}
                onChange={setDescription}
                placeholder="Optional program notes"
              />
            </FormLayout>
            <Button label="Create Program" variant="primary" clickAction={handleCreate} />
          </VStack>
        </Card>
      ) : null}

      {programs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<span aria-hidden>📋</span>}
            title="No training programs"
            description="Create your first training program to structure your workouts."
            actions={
              <Button
                label="Create a program"
                variant="primary"
                clickAction={() => setShowCreate(true)}
              />
            }
            headingLevel={2}
          />
        </Card>
      ) : (
        <ScrollableTable scrollLabel="programs-list">
          <Table
            aria-label="Training programs"
          columns={programColumns(handleSetActive, handleDelete)}
          data={programs}
          idKey="id"
          density="compact"
          hasHover
          />
        </ScrollableTable>
      )}
    </VStack>
  );
}
