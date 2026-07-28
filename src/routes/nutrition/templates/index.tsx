import type { TableColumn } from "@astryxdesign/core";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormLayout,
  Heading,
  HStack,
  proportional,
  Selector,
  Table,
  Text,
  TextArea,
  TextInput,
  VStack,
} from "@astryxdesign/core";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/data-load-error-banner";
import { DeleteConfirmationDialog } from "~/components/delete-confirmation-dialog";
import { TemplateIcon } from "~/components/icons/fit-track-icons";
import { NutritionSkeleton } from "~/components/loading/page-skeletons";
import { useLogMealTemplate } from "~/components/nutrition/use-log-meal-template";
import { ScrollableTable } from "~/components/scrollable-table";
import type { MealTemplateSummary } from "~/lib/api";
import {
  deleteMealTemplate,
  getMealTemplates,
  saveMealTemplate,
} from "~/lib/api";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import {
  deleteCannotBeUndoneSubtitle,
  deleteNamedEntityTitle,
} from "~/lib/delete-confirmation";
import { formatDisplayInteger } from "~/lib/format-number";
import type { MealType } from "~/lib/nutrition";
import { MEAL_TYPE_LABELS, todayString } from "~/lib/nutrition";
import {
  buildCreateTemplatePayload,
  CREATE_TEMPLATE_FORM_DEFAULTS,
  validateCreateTemplateName,
} from "~/lib/template-form";

export const Route = createFileRoute("/nutrition/templates/")({
  component: MealTemplatesPage,
  head: () => ({ meta: [{ title: "Meal Templates - FitTrack" }] }),
});

const MEAL_TYPE_OPTIONS = Object.entries(MEAL_TYPE_LABELS).map(
  ([value, label]) => ({
    label,
    value,
  })
);

type DeleteMealTemplate = (id: number) => Promise<void>;

type LogMealTemplate = (template: MealTemplateSummary) => Promise<void>;

function mealTemplateColumns(
  removeTemplate: DeleteMealTemplate,
  logTemplate: LogMealTemplate
): TableColumn<MealTemplateSummary>[] {
  return [
    {
      header: "Template",
      key: "name",
      renderCell: (template) => (
        <VStack gap={1}>
          <Text weight="bold">{template.name}</Text>
          {template.description ? (
            <Text type="supporting">{template.description}</Text>
          ) : null}
        </VStack>
      ),
      width: proportional(2),
    },
    {
      header: "Default meal",
      key: "default_meal_type",
      renderCell: (template) => (
        <Badge
          label={MEAL_TYPE_LABELS[template.default_meal_type]}
          variant="neutral"
        />
      ),
      width: proportional(1),
    },
    {
      header: "Foods",
      key: "item_count",
      renderCell: (template) => (
        <Badge
          label={`${template.item_count} food${template.item_count === 1 ? "" : "s"}`}
          variant="info"
        />
      ),
      width: proportional(1),
    },
    {
      header: "Macros per serving",
      key: "totals",
      renderCell: (template) => (
        <Text hasTabularNumbers type="supporting">
          {formatDisplayInteger(template.totals.calories)} kcal · P{" "}
          {formatDisplayInteger(template.totals.protein_g)}g · C{" "}
          {formatDisplayInteger(template.totals.carbs_g)}g · F{" "}
          {formatDisplayInteger(template.totals.fat_g)}g
        </Text>
      ),
      width: proportional(2),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (template) => (
        <HStack gap={2} wrap="wrap">
          <Button
            clickAction={() => logTemplate(template)}
            isDisabled={template.item_count === 0}
            label={`Log ${template.name}`}
            size="sm"
            variant="primary"
          >
            Log this
          </Button>
          <Button
            href={`/nutrition/templates/${template.id}`}
            label={`Edit ${template.name}`}
            size="sm"
            variant="secondary"
          >
            Edit
          </Button>
          <Button
            clickAction={() => removeTemplate(template.id)}
            label={`Delete ${template.name}`}
            size="sm"
            variant="destructive"
          >
            Delete
          </Button>
        </HStack>
      ),
    },
  ];
}

function MealTemplatesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logDate = todayString();
  const logTemplate = useLogMealTemplate(logDate);
  const templatesQuery = useDataLoadQuery({
    queryFn: () => getMealTemplates(),
    queryKey: ["meal-templates"],
  });

  const [showCreate, setShowCreate] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm({
    defaultValues: CREATE_TEMPLATE_FORM_DEFAULTS,
    onSubmit: async ({ value, formApi }) => {
      const template = await saveMealTemplate({
        data: buildCreateTemplatePayload(value),
      });
      await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      setShowCreate(false);
      formApi.reset();
      if (template?.id) {
        await navigate({
          params: { templateId: String(template.id) },
          to: "/nutrition/templates/$templateId",
        });
      }
    },
  });

  if (isDataLoadPending(templatesQuery)) {
    return <NutritionSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([templatesQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Meal Templates"
        query={failedQuery}
        title="Failed to load meal templates"
      />
    );
  }

  const templates = templatesQuery.data!;

  const openCreate = () => {
    form.reset();
    setShowCreate(true);
  };

  const cancelCreate = () => {
    form.reset();
    setShowCreate(false);
  };

  const handleCreate = () => form.handleSubmit();

  const requestDelete: DeleteMealTemplate = async (id) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (pendingDeleteId === null) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteMealTemplate({ data: { id: pendingDeleteId } });
      await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const pendingTemplate = templates.find(
    (template) => template.id === pendingDeleteId
  );

  return (
    <VStack gap={4}>
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
        <Heading level={1}>Meal Templates</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            href="/nutrition"
            label="Back"
            size="sm"
            variant="secondary"
          />
          <Button
            href="/nutrition/planning"
            label="Weekly Planner"
            size="sm"
            variant="secondary"
          />
          <Button
            clickAction={() => (showCreate ? cancelCreate() : openCreate())}
            label={showCreate ? "Cancel" : "New Template"}
            variant="primary"
          />
        </HStack>
      </HStack>

      <Text type="supporting">
        Build reusable meal combos and preview their macros before adding them
        to your weekly plan.
      </Text>

      {showCreate ? (
        <Card>
          <VStack gap={4}>
            <Heading level={2}>Create Meal Template</Heading>
            <FormLayout>
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) => validateCreateTemplateName(value),
                }}
              >
                {(field) => (
                  <TextInput
                    label="Name"
                    onChange={field.handleChange}
                    placeholder="e.g. High-protein breakfast"
                    value={field.state.value}
                  />
                )}
              </form.Field>
              <form.Field name="defaultMealType">
                {(field) => (
                  <Selector
                    label="Default meal"
                    onChange={(value) => field.handleChange(value as MealType)}
                    options={MEAL_TYPE_OPTIONS}
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
            <form.Subscribe
              selector={(state) => ({ isSubmitting: state.isSubmitting })}
            >
              {({ isSubmitting }) => (
                <Button
                  clickAction={handleCreate}
                  label={isSubmitting ? "Creating..." : "Create & Edit Foods"}
                  variant="primary"
                />
              )}
            </form.Subscribe>
          </VStack>
        </Card>
      ) : null}

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            actions={
              <Button
                clickAction={openCreate}
                label="Create a template"
                variant="primary"
              />
            }
            description="Create a reusable meal to start building your weekly plan."
            headingLevel={2}
            icon={<TemplateIcon />}
            title="No meal templates"
          />
        </Card>
      ) : (
        <ScrollableTable scrollLabel="templates-list">
          <Table
            aria-label="Meal templates"
            columns={mealTemplateColumns(requestDelete, (template) =>
              logTemplate({
                expectedKcal: template.totals.calories,
                mealType: template.default_meal_type,
                templateId: template.id,
              })
            )}
            data={templates}
            density="compact"
            hasHover
            idKey="id"
          />
        </ScrollableTable>
      )}
      <DeleteConfirmationDialog
        isConfirming={isDeleting}
        isOpen={pendingDeleteId !== null}
        onConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
          }
        }}
        subtitle={deleteCannotBeUndoneSubtitle()}
        title={deleteNamedEntityTitle(pendingTemplate?.name ?? "template")}
      />
    </VStack>
  );
}
