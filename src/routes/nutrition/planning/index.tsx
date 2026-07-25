import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, Button, Card } from '@astryxdesign/core'
import {
  clearMealPlan,
  getMealTemplates,
  getWeekMealPlan,
  logMealFromPlan,
  setMealPlan,
} from '~/lib/api'
import { addDays, MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from '~/lib/nutrition'

export const Route = createFileRoute('/nutrition/planning/')({
  head: () => ({ meta: [{ title: 'Meal Planning - FitTrack' }] }),
  component: MealPlanningPage,
})

function MealPlanningPage() {
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined)

  const { data: weekPlan } = useSuspenseQuery({
    queryKey: ['week-meal-plan', weekStart],
    queryFn: () => getWeekMealPlan({ data: { start_date: weekStart } }),
  })

  const { data: templates } = useSuspenseQuery({
    queryKey: ['meal-templates'],
    queryFn: () => getMealTemplates(),
  })

  const shiftWeek = (direction: -1 | 1) => {
    setWeekStart(addDays(weekPlan.start_date, direction * 7))
  }

  const handleAssign = async (date: string, mealType: MealType, templateId: string) => {
    if (!templateId) {
      await clearMealPlan({ data: { date, meal_type: mealType } })
    } else {
      await setMealPlan({ data: { date, meal_type: mealType, template_id: parseInt(templateId, 10) } })
    }
    await queryClient.invalidateQueries({ queryKey: ['week-meal-plan'] })
  }

  const handleLogMeal = async (date: string, mealType: MealType) => {
    await logMealFromPlan({ data: { date, meal_type: mealType } })
    await queryClient.invalidateQueries({ queryKey: ['food-log'] })
    alert(`Logged ${MEAL_TYPE_LABELS[mealType].toLowerCase()} to your food diary.`)
  }

  const dailyTargetCalories = weekPlan.targets.calories

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Weekly Meal Plan</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/nutrition" className="btn btn-secondary btn-sm">Back</Link>
          <Link to="/nutrition/templates" className="btn btn-secondary btn-sm">Templates</Link>
        </div>
      </div>

      <Card padding={4} style={{ marginBottom: '16px' }}>
        <div className="section-header" style={{ marginBottom: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {weekPlan.start_date} — {weekPlan.end_date}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
              Week total: {Math.round(weekPlan.week_totals.calories)} kcal · P {Math.round(weekPlan.week_totals.protein_g)}g · C {Math.round(weekPlan.week_totals.carbs_g)}g · F {Math.round(weekPlan.week_totals.fat_g)}g
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => shiftWeek(-1)}>← Prev</Button>
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(undefined)}>This Week</Button>
            <Button variant="secondary" size="sm" onClick={() => shiftWeek(1)}>Next →</Button>
          </div>
        </div>
      </Card>

      {templates.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>Create a meal template before planning your week.</p>
            <Link to="/nutrition/templates" className="btn btn-primary" style={{ marginTop: '12px' }}>Create Template</Link>
          </div>
        </div>
      ) : (
        <div className="meal-plan-grid">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                {MEAL_TYPES.map((mealType) => (
                  <th key={mealType}>{MEAL_TYPE_LABELS[mealType]}</th>
                ))}
                <th>Daily Total</th>
              </tr>
            </thead>
            <tbody>
              {weekPlan.days.map((day) => {
                const dayCaloriePct = dailyTargetCalories > 0
                  ? Math.min(100, (day.day_totals.calories / dailyTargetCalories) * 100)
                  : 0

                return (
                  <tr key={day.date}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{day.day_label}</div>
                    </td>
                    {day.slots.map((slot) => (
                      <td key={`${slot.date}-${slot.meal_type}`} className="meal-plan-cell">
                        <select
                          className="input"
                          value={slot.template_id?.toString() ?? ''}
                          onChange={(e) => handleAssign(slot.date, slot.meal_type, e.target.value)}
                        >
                          <option value="">— None —</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>{template.name}</option>
                          ))}
                        </select>
                        {slot.template_id ? (
                          <>
                            <div className="meal-plan-macros">
                              {Math.round(slot.macros.calories)} kcal
                              <br />
                              P {Math.round(slot.macros.protein_g)} · C {Math.round(slot.macros.carbs_g)} · F {Math.round(slot.macros.fat_g)}
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => handleLogMeal(slot.date, slot.meal_type)}>
                              Log
                            </Button>
                          </>
                        ) : null}
                      </td>
                    ))}
                    <td>
                      <div style={{ fontWeight: 700 }}>{Math.round(day.day_totals.calories)} kcal</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        P {Math.round(day.day_totals.protein_g)} · C {Math.round(day.day_totals.carbs_g)} · F {Math.round(day.day_totals.fat_g)}
                      </div>
                      <div className="progress-bar" style={{ marginTop: '6px' }}>
                        <div
                          className={`progress-bar-fill ${dayCaloriePct > 100 ? 'over' : 'calories'}`}
                          style={{ width: `${dayCaloriePct}%` }}
                        />
                      </div>
                      <Badge variant={dayCaloriePct > 100 ? 'negative' : 'positive'} style={{ marginTop: '6px' }}>
                        {Math.round(dayCaloriePct)}% of target
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
