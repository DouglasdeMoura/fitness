import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormLayout,
  Heading,
  HStack,
  Selector,
  Table,
  Text,
  TextArea,
  TextInput,
  VStack,
  proportional,
  type TableColumn,
} from "@astryxdesign/core";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  deleteMealTemplate,
  getMealTemplates,
  saveMealTemplate,
  type MealTemplateSummary,
} from "~/lib/api";
import { MEAL_TYPE_LABELS, type MealType } from "~/lib/nutrition";

export const Route = createFileRoute("/nutrition/templates/")({
  head: () => ({ meta: [{ title: "Meal Templates - FitTrack" }] }),
  component: MealTemplatesPage,
});

const MEAL_TYPE_OPTIONS = Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

type DeleteMealTemplate = (id: number) => Promise<void>;

function mealTemplateColumns(
  removeTemplate: DeleteMealTemplate,
): TableColumn<MealTemplateSummary>[] {
  return [
    {
      key: "name",
      header: "Template",
      width: proportional(2),
      renderCell: (template) => (
        <VStack gap={1}>
          <Text weight="bold">{template.name}</Text>
          {template.description ? <Text type="supporting">{template.description}</Text> : null}
        </VStack>
      ),
    },
    {
      key: "default_meal_type",
      header: "Default meal",
      width: proportional(1),
      renderCell: (template) => (
        <Badge label={MEAL_TYPE_LABELS[template.default_meal_type]} variant="neutral" />
      ),
    },
    {
      key: "item_count",
      header: "Foods",
      width: proportional(1),
      renderCell: (template) => (
        <Badge
          label={`${template.item_count} food${template.item_count === 1 ? "" : "s"}`}
          variant="info"
        />
      ),
    },
    {
      key: "totals",
      header: "Macros per serving",
      width: proportional(2),
      renderCell: (template) => (
        <Text type="supporting" hasTabularNumbers>
          {Math.round(template.totals.calories)} kcal · P {Math.round(template.totals.protein_g)}g ·
          C {Math.round(template.totals.carbs_g)}g · F {Math.round(template.totals.fat_g)}g
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      renderCell: (template) => (
        <HStack gap={2} wrap="wrap">
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
  const { data: templates } = useSuspenseQuery({
    queryKey: ["meal-templates"],
    queryFn: () => getMealTemplates(),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultMealType, setDefaultMealType] = useState<MealType>("lunch");

  const handleCreate = async () => {
    if (!name.trim()) return;
    const template = await saveMealTemplate({
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        default_meal_type: defaultMealType,
        items: [],
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
    setShowCreate(false);
    setName("");
    setDescription("");
    if (template?.id) {
      await navigate({
        to: "/nutrition/templates/$templateId",
        params: { templateId: String(template.id) },
      });
    }
  };

  const handleDelete: DeleteMealTemplate = async (id) => {
    if (!window.confirm("Delete this meal template?")) return;
    await deleteMealTemplate({ data: { id } });
    await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
  };

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Meal Templates</Heading>
        <HStack gap={2} wrap="wrap">
          <Button label="Back" href="/nutrition" variant="secondary" size="sm" />
          <Button label="Weekly Planner" href="/nutrition/planning" variant="secondary" size="sm" />
          <Button
            label={showCreate ? "Cancel" : "New Template"}
            variant="primary"
            clickAction={() => setShowCreate((value) => !value)}
          />
        </HStack>
      </HStack>

      <Text type="supporting">
        Build reusable meal combos and preview their macros before adding them to your weekly plan.
      </Text>

      {showCreate ? (
        <Card>
          <VStack gap={4}>
            <Heading level={2}>Create Meal Template</Heading>
            <FormLayout>
              <TextInput
                label="Name"
                value={name}
                onChange={setName}
                placeholder="e.g. High-protein breakfast"
              />
              <Selector
                label="Default meal"
                value={defaultMealType}
                onChange={(value) => setDefaultMealType(value as MealType)}
                options={MEAL_TYPE_OPTIONS}
              />
              <TextArea label="Description" value={description} onChange={setDescription} />
            </FormLayout>
            <Button label="Create & Edit Foods" variant="primary" clickAction={handleCreate} />
          </VStack>
        </Card>
      ) : null}

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            title="No meal templates yet"
            description="Create a reusable meal to start building your weekly plan."
            headingLevel={2}
          />
        </Card>
      ) : (
        <Table
          aria-label="Meal templates"
          columns={mealTemplateColumns(handleDelete)}
          data={templates}
          idKey="id"
          density="compact"
          hasHover
        />
      )}
    </VStack>
  );
}
