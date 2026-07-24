import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getFoodLog, addFoodLogEntry, deleteFoodLogEntry, searchFoods, getDailyTargets, addFood, type Food } from '~/lib/api'

export const Route = createFileRoute('/nutrition/')({
  head: () => ({ meta: [{ title: 'Nutrition - FitTrack' }] }),
  component: NutritionPage,
})

function NutritionPage() {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate] = useState(today)

  const { data: logData } = useSuspenseQuery({
    queryKey: ['food-log', selectedDate],
    queryFn: () => getFoodLog({ data: { date: selectedDate } }),
  })

  const { data: targets } = useSuspenseQuery({
    queryKey: ['targets'],
    queryFn: () => getDailyTargets(),
  })

  const entries = logData.entries || []
  const totals = logData.totals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

  const caloriePct = targets.calories > 0 ? Math.min(100, (totals.calories / targets.calories) * 100) : 0

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Nutrition</h1>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Daily Summary</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>
            {Math.round(totals.calories)} / {targets.calories} kcal
          </div>
          <div className="progress-bar" style={{ marginBottom: '16px' }}>
            <div className={`progress-bar-fill ${caloriePct > 100 ? 'over' : 'calories'}`} style={{ width: `${caloriePct}%` }} />
          </div>
          <div className="stat-row">
            <span className="stat-label">Protein</span>
            <span className="stat-value">{Math.round(totals.protein_g)} / {targets.protein_g}g</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Carbs</span>
            <span className="stat-value">{Math.round(totals.carbs_g)} / {targets.carbs_g}g</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Fat</span>
            <span className="stat-value">{Math.round(totals.fat_g)} / {targets.fat_g}g</span>
          </div>
        </div>

        <AddFoodCard selectedDate={selectedDate} targets={targets} />
      </div>

      <div className="card">
        <div className="card-title">Today's Food Log</div>
        {entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍽️</div>
            <p>No food logged yet today. Add your first meal above.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Meal</th>
                <th>Food</th>
                <th>Calories</th>
                <th>P/C/F</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                      {entry.meal_type}
                    </span>
                  </td>
                  <td>{entry.custom_name || `Food #${entry.food_id}`}</td>
                  <td>{Math.round(entry.calories)}</td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {Math.round(entry.protein_g)}/{Math.round(entry.carbs_g)}/{Math.round(entry.fat_g)}g
                  </td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteFoodLogEntry({ data: { id: entry.id } })}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AddFoodCard({ selectedDate }: { selectedDate: string; targets: any }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [servings, setServings] = useState(1)
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('snack')

  const currentMeal = (() => {
    const hour = new Date().getHours()
    if (hour < 11) return 'breakfast'
    if (hour < 15) return 'lunch'
    if (hour < 21) return 'dinner'
    return 'snack'
  })()

  const handleSearch = async () => {
    if (query.length < 2) return
    const res = await searchFoods({ data: { query } })
    setResults(res)
  }

  const handleAdd = async () => {
    if (!selectedFood) return
    await addFoodLogEntry({
      data: {
        food_id: selectedFood.id,
        custom_name: selectedFood.name,
        date: selectedDate,
        meal_type: mealType || currentMeal,
        servings,
        calories: selectedFood.calories_per_serving * servings,
        protein_g: selectedFood.protein_g * servings,
        carbs_g: selectedFood.carbs_g * servings,
        fat_g: selectedFood.fat_g * servings,
      },
    })
    setSelectedFood(null)
    setServings(1)
    setQuery('')
    setResults([])
    window.location.reload()
  }

  return (
    <div className="card">
      <div className="card-title">Add Food</div>
      {selectedFood ? (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <strong>{selectedFood.name}</strong>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {selectedFood.calories_per_serving} kcal per {selectedFood.serving_size}{selectedFood.serving_unit} |
              P: {selectedFood.protein_g}g C: {selectedFood.carbs_g}g F: {selectedFood.fat_g}g
            </p>
          </div>
          <div className="form-group">
            <label className="label">Servings</label>
            <input
              type="number"
              className="input"
              value={servings}
              step="0.5"
              min="0.5"
              onChange={(e) => setServings(parseFloat(e.target.value) || 1)}
            />
          </div>
          <div className="form-group">
            <label className="label">Meal</label>
            <select className="input" value={mealType} onChange={(e) => setMealType(e.target.value as any)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleAdd}>Add to Log</button>
            <button className="btn btn-secondary" onClick={() => setSelectedFood(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="form-group">
            <label className="label">Search foods</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input"
                placeholder="e.g. chicken breast, rice..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn btn-primary" onClick={handleSearch}>Search</button>
            </div>
          </div>
          {results.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {results.map((food) => (
                <div
                  key={food.id}
                  style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                  onClick={() => setSelectedFood(food)}
                >
                  <strong>{food.name}</strong>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                    {food.calories_per_serving} kcal | P:{food.protein_g}g
                  </span>
                </div>
              ))}
            </div>
          )}
          {query.length >= 2 && results.length === 0 && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              No results. Try a different search term or create a custom food below.
            </p>
          )}
          <CustomFoodForm onCreated={(food) => setSelectedFood(food)} />
        </div>
      )}
    </div>
  )
}

function CustomFoodForm({ onCreated }: { onCreated: (food: Food) => void }) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [serving, setServing] = useState('100')
  const [unit, setUnit] = useState('g')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  if (!show) {
    return (
      <button
        className="btn btn-secondary btn-sm"
        style={{ marginTop: '8px' }}
        onClick={() => setShow(true)}
      >
        + Create Custom Food
      </button>
    )
  }

  const handleCreate = async () => {
    if (!name || !calories) return
    const food = await addFood({
      data: {
        name,
        brand: brand || null,
        serving_size: parseFloat(serving) || 100,
        serving_unit: unit,
        calories_per_serving: parseFloat(calories) || 0,
        protein_g: parseFloat(protein) || 0,
        carbs_g: parseFloat(carbs) || 0,
        fat_g: parseFloat(fat) || 0,
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
      },
    })
    setShow(false)
    setName('')
    setCalories('')
    setProtein('')
    setCarbs('')
    setFat('')
    onCreated(food)
  }

  return (
    <div style={{ marginTop: '16px', padding: '12px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
      <strong style={{ fontSize: '0.875rem' }}>New Custom Food</strong>
      <div className="grid-2" style={{ marginTop: '12px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Food name" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Brand (optional)</label>
          <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: '8px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Serving Size</label>
          <input className="input" type="number" value={serving} onChange={(e) => setServing(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Unit</label>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="piece">piece</option>
            <option value="cup">cup</option>
          </select>
        </div>
      </div>
      <div className="form-group" style={{ marginTop: '8px' }}>
        <label className="label">Calories per serving</label>
        <input className="input" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} />
      </div>
      <div className="grid-3" style={{ marginTop: '8px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Protein (g)</label>
          <input className="input" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Carbs (g)</label>
          <input className="input" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="label">Fat (g)</label>
          <input className="input" type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button className="btn btn-primary btn-sm" onClick={handleCreate}>Save Food</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShow(false)}>Cancel</button>
      </div>
    </div>
  )
}
