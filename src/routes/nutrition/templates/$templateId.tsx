import type { TableColumn } from "@astryxdesign/core";
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
import { useStore } from "@tanstack/react-store";
import { useMemo, useState } from "react";

import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import { TemplateIcon } from "~/components/icons/FitTrackIcons";
import { NutritionSkeleton } from "~/components/loading/PageSkeletons";
import { useLogMealTemplate } from "~/components/nutrition/useLogMealTemplate";
import {
  deleteMealTemplate,
  getMealTemplate,
  saveMealTemplate,
  searchFoods,
} from "~/lib/api";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import type { Food } from "~/lib/db";
import {
  deleteCannotBeUndoneSubtitle,
  deleteNamedEntityTitle,
} from "~/lib/delete-confirmation";
import { formatDisplayInteger } from "~/lib/format-number";
import type { MealType } from "~/lib/nutrition";
import {
  calculateFoodMacros,
  MEAL_TYPE_LABELS,
  sumNutritionTotals,
  todayString,
} from "~/lib/nutrition";
import { searchCachedFoods } from "~/lib/offline";
import type { EditableItem, TemplateFormValues } from "~/lib/template-form";
import {
  buildTemplateSavePayload,
  EMPTY_TEMPLATE_FORM,
  editableItemFromFood,
  templateFormDefaults,
  validateTemplateItems,
} from "~/lib/template-form";

export const Route = createFileRoute("/nutrition/templates/$templateId")({
  component: MealTemplateDetailPage,
  head: () => ({ meta: [{ title: "Edit Meal Template - FitTrack" }] }),
});

type UpdateTemplateItem = (
  tempId: string,
  patch: Partial<EditableItem>
) => void;
type RemoveTemplateItem = (tempId: string) => void;

const MEAL_TYPE_OPTIONS = Object.entries(MEAL_TYPE_LABELS).map(
  ([value, label]) => ({
    label,
    value,
  })
);

function mealTemplateItemColumns(
  updateItem: UpdateTemplateItem,
  removeItem: RemoveTemplateItem
): TableColumn<EditableItem>[] {
  return [
    {
      header: "Food",
      key: "food_name",
      renderCell: (item) => (
        <VStack gap={1}>
          <Text weight="bold">{item.food_name}</Text>
          <Badge label={item.serving_unit} variant="neutral" />
        </VStack>
      ),
      width: proportional(2),
    },
    {
      header: "Servings",
      key: "servings",
      renderCell: (item) => (
        <NumberInput
          isLabelHidden
          label={`Servings for ${item.food_name}`}
          min={0.25}
          onChange={(value) =>
            updateItem(item.tempId, { servings: value ?? 1 })
          }
          step={0.25}
          value={item.servings}
        />
      ),
      width: proportional(1),
    },
    {
      header: "Macros",
      key: "macros",
      renderCell: (item) => {
        const macros = calculateFoodMacros(item, item.servings);
        return (
          <Text hasTabularNumbers type="supporting">
            {formatDisplayInteger(macros.calories)} kcal · P{" "}
            {formatDisplayInteger(macros.protein_g)} · C{" "}
            {formatDisplayInteger(macros.carbs_g)} · F{" "}
            {formatDisplayInteger(macros.fat_g)}
          </Text>
        );
      },
      width: proportional(2),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (item) => (
        <Button
          clickAction={() => removeItem(item.tempId)}
          label={`Remove ${item.food_name}`}
          size="sm"
          variant="destructive"
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
  const templateQuery = useDataLoadQuery({
    queryFn: () => getMealTemplate({ data: { id } }),
    queryKey: ["meal-template", id],
  });

  const form = useForm({
    defaultValues: (templateQuery.data
      ? templateFormDefaults(templateQuery.data)
      : EMPTY_TEMPLATE_FORM) as TemplateFormValues,
    onSubmit: async ({ value }) => {
      await saveMealTemplate({ data: buildTemplateSavePayload(value, id) });
      await queryClient.invalidateQueries({ queryKey: ["meal-template", id] });
      await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
    },
  });

  const items = useStore(form.store, (state) => state.values.items);
  const templateName = useStore(form.store, (state) => state.values.name);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isSubmitSuccessful = useStore(
    form.store,
    (state) => state.isSubmitSuccessful
  );

  const previewTotals = useMemo(
    () =>
      sumNutritionTotals(
        items.map((item) => calculateFoodMacros(item, item.servings))
      ),
    [items]
  );

  if (isDataLoadPending(templateQuery)) {
    return <NutritionSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([templateQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Meal Template"
        query={failedQuery}
        title="Failed to load meal template"
      />
    );
  }

  const template = templateQuery.data;

  if (!template) {
    return (
      <VStack gap={4}>
        <Card>
          <VStack gap={3}>
            <EmptyState
              description={`No meal template exists for id ${templateId}.`}
              headingLevel={1}
              icon={<TemplateIcon />}
              title="Meal template not found"
            />
            <Button
              href="/nutrition/templates"
              label="Back to templates"
              variant="secondary"
            />
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
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
        <Heading level={1}>{templateName || "Edit Meal Template"}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            href="/nutrition/templates"
            label="Back to templates"
            size="sm"
            variant="secondary"
          />
          <Button
            clickAction={() => setShowDeleteDialog(true)}
            label={`Delete ${templateName || "template"}`}
            size="sm"
            variant="destructive"
          >
            Delete
          </Button>
          <Button
            clickAction={() =>
              logTemplate({
                expectedKcal: previewTotals.calories,
                mealType: template.default_meal_type,
                templateId: id,
              })
            }
            isDisabled={items.length === 0}
            label={`Log ${templateName || "template"}`}
            size="sm"
            variant="primary"
          >
            Log this
          </Button>
          <Button
            clickAction={form.handleSubmit}
            label={saveLabel}
            variant="secondary"
          />
        </HStack>
      </HStack>

      <Grid columns={{ max: 2, minWidth: 320, repeat: "fit" }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Heading level={2}>Template Settings</Heading>
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
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={2}>Macro Preview</Heading>
            <Text hasTabularNumbers size="2xl" weight="bold">
              {formatDisplayInteger(previewTotals.calories)} kcal
            </Text>
            <MetadataList>
              <MetadataListItem label="Protein">
                {formatDisplayInteger(previewTotals.protein_g)}g
              </MetadataListItem>
              <MetadataListItem label="Carbs">
                {formatDisplayInteger(previewTotals.carbs_g)}g
              </MetadataListItem>
              <MetadataListItem label="Fat">
                {formatDisplayInteger(previewTotals.fat_g)}g
              </MetadataListItem>
            </MetadataList>
            <Text type="supporting">
              Totals sum per-serving food label values (Atwater factors).
              Reference: USDA NLEA labeling.
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
            const index = itemsField.state.value.findIndex(
              (item) => item.tempId === tempId
            );
            if (index === -1) {
              return;
            }
            itemsField.replaceValue(index, {
              ...itemsField.state.value[index],
              ...patch,
            });
          };
          const removeItem: RemoveTemplateItem = (tempId) => {
            const index = itemsField.state.value.findIndex(
              (item) => item.tempId === tempId
            );
            if (index !== -1) {
              itemsField.removeValue(index);
            }
          };
          const addFood = (food: Food) => {
            itemsField.pushValue(
              editableItemFromFood(food, itemsField.state.value.length + 1)
            );
          };
          return (
            <AddFoodsCard
              items={itemsField.state.value}
              onAdd={addFood}
              onRemove={removeItem}
              onUpdate={updateItem}
            />
          );
        }}
      </form.Field>

      <DeleteConfirmationDialog
        isConfirming={isDeleting}
        isOpen={showDeleteDialog}
        onConfirm={handleConfirmDelete}
        onOpenChange={setShowDeleteDialog}
        subtitle={deleteCannotBeUndoneSubtitle()}
        title={deleteNamedEntityTitle(templateName || template.name)}
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
    if (!query.trim()) {
      return;
    }
    const cached = await searchCachedFoods(query);
    if (cached.length > 0) {
      setResults(cached);
      return;
    }
    setResults(await searchFoods({ data: { limit: 10, query } }));
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
            onChange={setQuery}
            onEnter={handleSearch}
            placeholder="Search foods..."
            value={query}
          />
          <Button
            clickAction={handleSearch}
            label="Search"
            variant="secondary"
          />
        </HStack>
        {results.length > 0 ? (
          <VStack gap={2}>
            {results.map((food) => (
              <Button
                clickAction={() => handleAdd(food)}
                key={food.id}
                label={`Add ${food.name} — ${formatDisplayInteger(food.calories_per_serving)} kcal per ${food.serving_size}${food.serving_unit}`}
                variant="secondary"
              />
            ))}
          </VStack>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            description="Search above to build this reusable meal."
            headingLevel={3}
            icon={<TemplateIcon />}
            isCompact
            title="No foods added yet"
          />
        ) : (
          <Table
            aria-label="Meal template foods"
            columns={mealTemplateItemColumns(onUpdate, onRemove)}
            data={items}
            density="compact"
            hasHover
            idKey="tempId"
          />
        )}
      </VStack>
    </Card>
  );
}
