import { createFileRoute, useSuspenseQuery } from '@tanstack/react-router'
import { getDashboardStats } from '~/lib/api'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Dashboard - FitTrack' }] }),
  loader: async () => {
    return getDashboardStats()
  },
  component: DashboardPage,
})

function DashboardPage() {
  const initialData = Route.useLoaderData()
  const { data: stats } = useSuspenseQuery({
    queryKey: ['dashboard'],
    queryFn: () => getDashboardStats(),
    initialData,
  })

  const remaining = stats.remaining
  const caloriePct = stats.targets.calories > 0
    ? Math.min(100, (stats.consumed.calories / stats.targets.calories) * 100)
    : 0
  const proteinPct = stats.targets.protein_g > 0
    ? Math.min(100, (stats.consumed.protein_g / stats.targets.protein_g) * 100)
    : 0
  const carbsPct = stats.targets.carbs_g > 0
    ? Math.min(100, (stats.consumed.carbs_g / stats.targets.carbs_g) * 100)
    : 0
  const fatPct = stats.targets.fat_g > 0
    ? Math.min(100, (stats.consumed.fat_g / stats.targets.fat_g) * 100)
    : 0

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>{today}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Today's Calories</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '4px' }}>
            {Math.round(stats.consumed.calories)}
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
              {' '}/ {stats.targets.calories} kcal
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-bar-fill ${caloriePct > 100 ? 'over' : 'calories'}`}
              style={{ width: `${caloriePct}%` }}
            />
          </div>
          <p style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {remaining.calories > 0
              ? `${Math.round(remaining.calories)} kcal remaining`
              : `${Math.abs(Math.round(remaining.calories))} kcal over target`}
          </p>
        </div>

        <div className="card">
          <div className="card-title">Macros</div>
          <MacroBar label="Protein" consumed={Math.round(stats.consumed.protein_g)} target={stats.targets.protein_g} pct={proteinPct} unit="g" colorClass="protein" />
          <MacroBar label="Carbs" consumed={Math.round(stats.consumed.carbs_g)} target={stats.targets.carbs_g} pct={carbsPct} unit="g" colorClass="carbs" />
          <MacroBar label="Fat" consumed={Math.round(stats.consumed.fat_g)} target={stats.targets.fat_g} pct={fatPct} unit="g" colorClass="fat" />
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-title">Current Weight</div>
          <div className="stat-value" style={{ fontSize: '1.75rem' }}>
            {stats.targets.weightKg ? `${stats.targets.weightKg} kg` : '—'}
          </div>
        </div>
        <div className="card">
          <div className="card-title">TDEE</div>
          <div className="stat-value" style={{ fontSize: '1.75rem' }}>
            {stats.targets.tdee ? `${stats.targets.tdee} kcal` : '—'}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            BMR: {stats.targets.bmr} kcal
          </p>
        </div>
        <div className="card">
          <div className="card-title">Workouts (30d)</div>
          <div className="stat-value" style={{ fontSize: '1.75rem' }}>
            {stats.workoutDaysThisMonth}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            sessions logged
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Quick Actions</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a href="/nutrition" className="btn btn-primary">Log Food</a>
          <a href="/workout" className="btn btn-secondary">Start Workout</a>
          <a href="/progress" className="btn btn-secondary">View Progress</a>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Your Goal</div>
        <div className="stat-row">
          <span className="stat-label">Goal Type</span>
          <span className="badge badge-neutral">{stats.user.goal_type.replace('_', ' ')}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Activity Level</span>
          <span style={{ textTransform: 'capitalize' }}>{stats.user.activity_level.replace('_', ' ')}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Daily Calorie Target</span>
          <span className="stat-value">{stats.targets.calories} kcal</span>
        </div>
      </div>
    </div>
  )
}

function MacroBar({
  label,
  consumed,
  target,
  pct,
  unit,
  colorClass,
}: {
  label: string
  consumed: number
  target: number
  pct: number
  unit: string
  colorClass: string
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span className="stat-label">{label}</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
          {consumed} / {target} {unit}
        </span>
      </div>
      <div className="progress-bar">
        <div
          className={`progress-bar-fill ${pct > 100 ? 'over' : colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
