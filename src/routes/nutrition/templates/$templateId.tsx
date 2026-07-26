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
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getMealTemplate,
  saveMealTemplate,
  searchFoods,
  type MealTemplateItemInput,
} from "~/lib/api";
import type { Food } from "~/lib/db";
import {
  calculateFoodMacros,
  MEAL_TYPE_LABELS,
  sumNutritionTotals,
  type MealType,
} from "~/lib/nutrition";
import { searchCachedFoods } from "~/lib/offline";

export const Route = createFileRoute("/nutrition/templates/$templateId")({
  head: () => ({ meta: [{ title: "Edit Meal Template - FitTrack" }] }),
  component: MealTemplateDetailPage,
});

type EditableItem = MealTemplateItemInput & {
  tempId: string;
  food_name: string;
  serving_unit: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

type UpdateTemplateItem = (tempId: string, patch: Partial<EditableItem>) => void;
type RemoveTemplateItem = (tempId: string) => void;

const MEAL_TYPE_OPTIONS = Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function makeTempId() {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`;
}

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
  const queryClient = useQueryClient();
  const id = Number.parseInt(templateId, 10);
  const { data: template } = useSuspenseQuery({
    queryKey: ["meal-template", id],
    queryFn: () => getMealTemplate({ data: { id } }),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultMealType, setDefaultMealType] = useState<MealType>("lunch");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description || "");
    setDefaultMealType(template.default_meal_type);
    setItems(
      template.items.map((item, index) => ({
        tempId: `item-${item.id}`,
        food_id: item.food_id,
        servings: item.servings,
        sort_order: index + 1,
        food_name: item.food_name,
        serving_unit: item.serving_unit,
        calories_per_serving: item.calories_per_serving,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
      })),
    );
  }, [template]);

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

  const previewTotals = sumNutritionTotals(
    items.map((item) => calculateFoodMacros(item, item.servings)),
  );

  const handleSearch = async () => {
    if (!query.trim()) return;
    const cached = await searchCachedFoods(query);
    if (cached.length > 0) {
      setResults(cached);
      return;
    }
    setResults(await searchFoods({ data: { query, limit: 10 } }));
  };

  const addFood = (food: Food) => {
    setItems((current) => [
      ...current,
      {
        tempId: makeTempId(),
        food_id: food.id,
        servings: 1,
        sort_order: current.length + 1,
        food_name: food.name,
        serving_unit: food.serving_unit,
        calories_per_serving: food.calories_per_serving,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fat_g: food.fat_g,
        fiber_g: food.fiber_g,
      },
    ]);
    setQuery("");
    setResults([]);
  };

  const updateItem: UpdateTemplateItem = (tempId, patch) => {
    setItems((current) =>
      current.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)),
    );
  };

  const removeItem: RemoveTemplateItem = (tempId) => {
    setItems((current) => current.filter((item) => item.tempId !== tempId));
  };

  const handleSave = async () => {
    await saveMealTemplate({
      data: {
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        default_meal_type: defaultMealType,
        items: items.map((item, index) => ({
          food_id: item.food_id,
          servings: item.servings,
          sort_order: index + 1,
        })),
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["meal-template", id] });
    await queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>{name || "Edit Meal Template"}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Back to templates"
            href="/nutrition/templates"
            variant="secondary"
            size="sm"
          />
          <Button
            label={saved ? "Saved!" : "Save Template"}
            variant="primary"
            clickAction={handleSave}
          />
        </HStack>
      </HStack>

      <Grid columns={{ minWidth: 320, max: 2, repeat: "fit" }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Heading level={2}>Template Settings</Heading>
            <FormLayout>
              <TextInput label="Name" value={name} onChange={setName} />
              <Selector
                label="Default meal"
                value={defaultMealType}
                onChange={(value) => setDefaultMealType(value as MealType)}
                options={MEAL_TYPE_OPTIONS}
              />
              <TextArea label="Description" value={description} onChange={setDescription} />
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
                  clickAction={() => addFood(food)}
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
              columns={mealTemplateItemColumns(updateItem, removeItem)}
              data={items}
              idKey="tempId"
              density="compact"
              hasHover
            />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
