import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormLayout,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
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
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useStore } from "@tanstack/react-store";
import { useMemo, useState } from "react";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import { useLogMealTemplate } from "~/components/nutrition/useLogMealTemplate";
import { deleteMealTemplate, getMealTemplate, saveMealTemplate, searchFoods } from "~/lib/api";
import {
  deleteCannotBeUndoneSubtitle,
  deleteNamedEntityTitle,
} from "~/lib/delete-confirmation";
import type { Food } from "~/lib/db";
import {
  calculateFoodMacros,
  MEAL_TYPE_LABELS,
  sumNutritionTotals,
  todayString,
  type MealType,
} from "~/lib/nutrition";
import { searchCachedFoods } from "~/lib/offline";
import {
  buildTemplateSavePayload,
  editableItemFromFood,
  EMPTY_TEMPLATE_FORM,
  templateFormDefaults,
  validateTemplateItems,
  type EditableItem,
  type TemplateFormValues,
} from "~/lib/template-form";

export const Route = createFileRoute("/nutrition/templates/$templateId")({
  head: () => ({ meta: [{ title: "Edit Meal Template - FitTrack" }] }),
  component: MealTemplateDetailPage,
});

type UpdateTemplateItem = (tempId: string, patch: Partial<EditableItem>) => void;
type RemoveTemplateItem = (tempId: string) => void;

const MEAL_TYPE_OPTIONS = Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function mealTemplateItemColumns(
  updateItem: UpdateTemplateItem,
  removeItem: RemoveTemplateItem,
): TableColumn<EditableItem>[] {
  return [
    {
      key: "food_name",
      header: "Food",
      width: proportional(2),
      renderCell: (item) => (
        <VStack gap={1}>
          <Text weight="bold">{item.food_name}</Text>
          <Badge label={item.serving_unit} variant="neutral" />
        </VStack>
      ),
    },
    {
      key: "servings",
      header: "Servings",
      width: proportional(1),
      renderCell: (item) => (
        <NumberInput
          label={`Servings for ${item.food_name}`}
          isLabelHidden
          value={item.servings}
          onChange={(value) => updateItem(item.tempId, { servings: value ?? 1 })}
          min={0.25}
          step={0.25}
        />
      ),
    },
    {
      key: "macros",
      header: "Macros",
      width: proportional(2),
      renderCell: (item) => {
        const macros = calculateFoodMacros(item, item.servings);
        return (
          <Text type="supporting" hasTabularNumbers>
            {Math.round(macros.calories)} kcal · P {Math.round(macros.protein_g)} · C{" "}
            {Math.round(macros.carbs_g)} · F {Math.round(macros.fat_g)}
          </Text>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      renderCell: (item) => (
        <Button
          label={`Remove ${item.food_name}`}
          variant="destructive"
          size="sm"
          clickAction={() => removeItem(item.tempId)}
        >
          Remove
        </Button>
      ),
    },
  ];
}

function MealTemplateDetailPage() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number.parseInt(templateId, 10);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const logTemplate = useLogMealTemplate(todayString());
  const { data: template } = useSuspenseQuery({
    queryKey: ["meal-template", id],
    queryFn: () => getMealTemplate({ data: { id } }),
  });

  const form = useForm({
    defaultValues: (template ? templateFormDefaults(template) : EMPTY_TEMPLATE_FORM) as TemplateFormValues,
    onSubmit: async ({ value }) => {
      await saveMealTemplate({ data: buildTemplateSavePayload(value, id) });
      await queryClient.invalidateQueries({ queryKey: ["meal-template", id] });
      await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
    },
  });

  const items = useStore(form.store, (state) => state.values.items);
  const templateName = useStore(form.store, (state) => state.values.name);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isSubmitSuccessful = useStore(form.store, (state) => state.isSubmitSuccessful);

  const previewTotals = useMemo(
    () => sumNutritionTotals(items.map((item) => calculateFoodMacros(item, item.servings))),
    [items],
  );

  if (!template) {
    return (
      <VStack gap={4}>
        <Card>
          <VStack gap={3}>
            <EmptyState
              title="Meal template not found"
              description={`No meal template exists for id ${templateId}.`}
              headingLevel={1}
            />
            <Button label="Back to templates" href="/nutrition/templates" variant="secondary" />
          </VStack>
        </Card>
      </VStack>
    );
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMealTemplate({ data: { id } });
      await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      navigate({ to: "/nutrition/templates" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const saveLabel = isSubmitting
    ? "Saving..."
    : isSubmitSuccessful
      ? "Saved!"
      : "Save Template";

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>{templateName || "Edit Meal Template"}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Back to templates"
            href="/nutrition/templates"
            variant="secondary"
            size="sm"
          />
          <Button
            label={`Delete ${templateName || "template"}`}
            variant="destructive"
            size="sm"
            clickAction={() => setShowDeleteDialog(true)}
          >
            Delete
          </Button>
          <Button
            label={`Log ${templateName || "template"}`}
            variant="primary"
            size="sm"
            clickAction={() =>
              logTemplate({
                templateId: id,
                mealType: template.default_meal_type,
                expectedKcal: previewTotals.calories,
              })
            }
            isDisabled={items.length === 0}
          >
            Log this
          </Button>
          <Button label={saveLabel} variant="secondary" clickAction={form.handleSubmit} />
        </HStack>
      </HStack>

      <Grid columns={{ minWidth: 320, max: 2, repeat: "fit" }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Heading level={2}>Template Settings</Heading>
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
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={2}>Macro Preview</Heading>
            <Text size="2xl" weight="bold" hasTabularNumbers>
              {Math.round(previewTotals.calories)} kcal
            </Text>
            <MetadataList>
              <MetadataListItem label="Protein">
                {Math.round(previewTotals.protein_g)}g
              </MetadataListItem>
              <MetadataListItem label="Carbs">
                {Math.round(previewTotals.carbs_g)}g
              </MetadataListItem>
              <MetadataListItem label="Fat">{Math.round(previewTotals.fat_g)}g</MetadataListItem>
            </MetadataList>
            <Text type="supporting">
              Totals sum per-serving food label values (Atwater factors). Reference: USDA NLEA
              labeling.
            </Text>
          </VStack>
        </Card>
      </Grid>

      <form.Field
        name="items"
        validators={{ onChange: ({ value }) => validateTemplateItems(value) }}
      >
        {(itemsField) => {
          const updateItem: UpdateTemplateItem = (tempId, patch) => {
            const index = itemsField.state.value.findIndex((item) => item.tempId === tempId);
            if (index === -1) return;
            itemsField.replaceValue(index, { ...itemsField.state.value[index], ...patch });
          };
          const removeItem: RemoveTemplateItem = (tempId) => {
            const index = itemsField.state.value.findIndex((item) => item.tempId === tempId);
            if (index !== -1) itemsField.removeValue(index);
          };
          const addFood = (food: Food) => {
            itemsField.pushValue(
              editableItemFromFood(food, itemsField.state.value.length + 1),
            );
          };
          return (
            <AddFoodsCard
              items={itemsField.state.value}
              onAdd={addFood}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          );
        }}
      </form.Field>

      <DeleteConfirmationDialog
        isOpen={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={deleteNamedEntityTitle(templateName || template.name)}
        subtitle={deleteCannotBeUndoneSubtitle()}
        onConfirm={handleConfirmDelete}
        isConfirming={isDeleting}
      />
    </VStack>
  );
}

function AddFoodsCard({
  items,
  onAdd,
  onUpdate,
  onRemove,
}: {
  items: EditableItem[];
  onAdd: (food: Food) => void;
  onUpdate: UpdateTemplateItem;
  onRemove: RemoveTemplateItem;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    const cached = await searchCachedFoods(query);
    if (cached.length > 0) {
      setResults(cached);
      return;
    }
    setResults(await searchFoods({ data: { query, limit: 10 } }));
  };

  const handleAdd = (food: Food) => {
    onAdd(food);
    setQuery("");
    setResults([]);
  };

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>Add Foods</Heading>
        <HStack gap={2} vAlign="end" wrap="wrap">
          <TextInput
            label="Search foods"
            value={query}
            onChange={setQuery}
            placeholder="Search foods..."
            onEnter={handleSearch}
          />
          <Button label="Search" variant="secondary" clickAction={handleSearch} />
        </HStack>
        {results.length > 0 ? (
          <VStack gap={2}>
            {results.map((food) => (
              <Button
                key={food.id}
                label={`Add ${food.name} — ${Math.round(food.calories_per_serving)} kcal per ${food.serving_size}${food.serving_unit}`}
                variant="secondary"
                clickAction={() => handleAdd(food)}
              />
            ))}
          </VStack>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            title="No foods added yet"
            description="Search above to build this reusable meal."
            headingLevel={3}
            isCompact
          />
        ) : (
          <Table
            aria-label="Meal template foods"
            columns={mealTemplateItemColumns(onUpdate, onRemove)}
            data={items}
            idKey="tempId"
            density="compact"
            hasHover
          />
        )}
      </VStack>
    </Card>
  );
}
