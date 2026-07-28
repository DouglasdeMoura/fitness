import { Badge, Button, Card, EmptyState, FormLayout, Heading, HStack, Selector, Table, Text, TextArea, TextInput, VStack, proportional } from '@astryxdesign/core';
import type { TableColumn } from '@astryxdesign/core';
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import { TemplateIcon } from "~/components/icons/FitTrackIcons";
import { NutritionSkeleton } from "~/components/loading/PageSkeletons";
import { useLogMealTemplate } from "~/components/nutrition/useLogMealTemplate";
import { ScrollableTable } from "~/components/ScrollableTable";
import { deleteMealTemplate, getMealTemplates, saveMealTemplate } from '~/lib/api';
import type { MealTemplateSummary } from '~/lib/api';
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
import { MEAL_TYPE_LABELS, todayString } from '~/lib/nutrition';
import type { MealType } from '~/lib/nutrition';
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
        <Text type="supporting" hasTabularNumbers>
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
            label={`Log ${template.name}`}
            variant="primary"
            size="sm"
            clickAction={() => logTemplate(template)}
            isDisabled={template.item_count === 0}
          >
            Log this
          </Button>
          <Button
            label={`Edit ${template.name}`}
            href={`/nutrition/templates/${template.id}`}
            variant="secondary"
            size="sm"
          >
            Edit
          </Button>
          <Button
            label={`Delete ${template.name}`}
            variant="destructive"
            size="sm"
            clickAction={() => removeTemplate(template.id)}
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
        title="Failed to load meal templates"
        query={failedQuery}
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
    if (pendingDeleteId == null) {return;}
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
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Meal Templates</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Back"
            href="/nutrition"
            variant="secondary"
            size="sm"
          />
          <Button
            label="Weekly Planner"
            href="/nutrition/planning"
            variant="secondary"
            size="sm"
          />
          <Button
            label={showCreate ? "Cancel" : "New Template"}
            variant="primary"
            clickAction={() => (showCreate ? cancelCreate() : openCreate())}
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
                    value={field.state.value}
                    onChange={field.handleChange}
                    placeholder="e.g. High-protein breakfast"
                  />
                )}
              </form.Field>
              <form.Field name="defaultMealType">
                {(field) => (
                  <Selector
                    label="Default meal"
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value as MealType)}
                    options={MEAL_TYPE_OPTIONS}
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
            <form.Subscribe
              selector={(state) => ({ isSubmitting: state.isSubmitting })}
            >
              {({ isSubmitting }) => (
                <Button
                  label={isSubmitting ? "Creating..." : "Create & Edit Foods"}
                  variant="primary"
                  clickAction={handleCreate}
                />
              )}
            </form.Subscribe>
          </VStack>
        </Card>
      ) : null}

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TemplateIcon />}
            title="No meal templates"
            description="Create a reusable meal to start building your weekly plan."
            actions={
              <Button
                label="Create a template"
                variant="primary"
                clickAction={openCreate}
              />
            }
            headingLevel={2}
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
        title={deleteNamedEntityTitle(pendingTemplate?.name ?? "template")}
        subtitle={deleteCannotBeUndoneSubtitle()}
        onConfirm={confirmDelete}
        isConfirming={isDeleting}
      />
    </VStack>
  );
}
