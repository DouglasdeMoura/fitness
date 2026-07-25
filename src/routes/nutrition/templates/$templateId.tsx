import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Badge, Button, Card } from '@astryxdesign/core'
import { getMealTemplate, saveMealTemplate, searchFoods, type MealTemplateItemInput } from '~/lib/api'
import { searchCachedFoods } from '~/lib/offline'
import type { Food } from '~/lib/db'
import { calculateFoodMacros, MEAL_TYPE_LABELS, sumNutritionTotals, type MealType } from '~/lib/nutrition'

export const Route = createFileRoute('/nutrition/templates/$templateId')({
  head: () => ({ meta: [{ title: 'Edit Meal Template - FitTrack' }] }),
  component: MealTemplateDetailPage,
})

type EditableItem = MealTemplateItemInput & {
  tempId: string
  food_name: string
  serving_unit: string
  calories_per_serving: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

function makeTempId() {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`
}

function MealTemplateDetailPage() {
  const { templateId } = Route.useParams()
  const queryClient = useQueryClient()
  const id = parseInt(templateId, 10)

  const { data: template } = useSuspenseQuery({
    queryKey: ['meal-template', id],
    queryFn: () => getMealTemplate({ data: { id } }),
  })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultMealType, setDefaultMealType] = useState<MealType>('lunch')
  const [items, setItems] = useState<EditableItem[]>([])
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])

  useEffect(() => {
    if (!template) return
    setName(template.name)
    setDescription(template.description || '')
    setDefaultMealType(template.default_meal_type)
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
    )
  }, [template])

  if (!template) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>Meal template not found.</p>
          <Link to="/nutrition/templates" className="btn btn-secondary" style={{ marginTop: '12px' }}>Back to templates</Link>
        </div>
      </div>
    )
  }

  const previewTotals = sumNutritionTotals(items.map((item) => calculateFoodMacros(item, item.servings)))

  const handleSearch = async () => {
    if (!query.trim()) return
    const cached = await searchCachedFoods(query)
    if (cached.length > 0) {
      setResults(cached)
      return
    }
    const foods = await searchFoods({ data: { query, limit: 10 } })
    setResults(foods)
  }

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
    ])
    setQuery('')
    setResults([])
  }

  const updateItem = (tempId: string, patch: Partial<EditableItem>) => {
    setItems((current) => current.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)))
  }

  const removeItem = (tempId: string) => {
    setItems((current) => current.filter((item) => item.tempId !== tempId))
  }

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
    })
    await queryClient.invalidateQueries({ queryKey: ['meal-template', id] })
    await queryClient.invalidateQueries({ queryKey: ['meal-templates'] })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">{name || 'Edit Meal Template'}</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/nutrition/templates" className="btn btn-secondary btn-sm">Back</Link>
          <Button variant="primary" onClick={handleSave}>{saved ? 'Saved!' : 'Save Template'}</Button>
        </div>
      </div>

      <div className="grid-2">
        <Card padding={4}>
          <div className="card-title">Template Settings</div>
          <div className="form-grid">
            <label>
              Name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Default meal
              <select className="input" value={defaultMealType} onChange={(e) => setDefaultMealType(e.target.value as MealType)}>
                {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Description
              <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        </Card>

        <Card padding={4}>
          <div className="card-title">Macro Preview</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>
            {Math.round(previewTotals.calories)} kcal
          </div>
          <div className="stat-row">
            <span className="stat-label">Protein</span>
            <span className="stat-value">{Math.round(previewTotals.protein_g)}g</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Carbs</span>
            <span className="stat-value">{Math.round(previewTotals.carbs_g)}g</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Fat</span>
            <span className="stat-value">{Math.round(previewTotals.fat_g)}g</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '12px', marginBottom: 0 }}>
            Totals sum per-serving food label values (Atwater factors). Reference: USDA NLEA labeling.
          </p>
        </Card>
      </div>

      <Card padding={4} style={{ marginTop: '16px' }}>
        <div className="card-title">Add Foods</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            className="input"
            placeholder="Search foods..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="secondary" onClick={handleSearch}>Search</Button>
        </div>
        {results.length > 0 ? (
          <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
            {results.map((food) => (
              <button
                key={food.id}
                type="button"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', width: '100%' }}
                onClick={() => addFood(food)}
              >
                <span>{food.name}</span>
                <span style={{ fontSize: '0.8125rem', opacity: 0.8 }}>
                  {Math.round(food.calories_per_serving)} kcal / {food.serving_size}{food.serving_unit}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {items.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No foods added yet. Search above to build your recipe.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Food</th>
                <th>Servings</th>
                <th>Macros</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const macros = calculateFoodMacros(item, item.servings)
                return (
                  <tr key={item.tempId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.food_name}</div>
                      <Badge variant="neutral">{item.serving_unit}</Badge>
                    </td>
                    <td>
                      <input
                        className="input"
                        style={{ width: '80px' }}
                        type="number"
                        min={0.25}
                        step={0.25}
                        value={item.servings}
                        onChange={(e) => updateItem(item.tempId, { servings: parseFloat(e.target.value) || 1 })}
                      />
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {Math.round(macros.calories)} kcal · P {Math.round(macros.protein_g)} · C {Math.round(macros.carbs_g)} · F {Math.round(macros.fat_g)}
                    </td>
                    <td>
                      <Button variant="secondary" size="sm" onClick={() => removeItem(item.tempId)}>Remove</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
