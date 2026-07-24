import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getBodyLogs, getWorkoutSessions, getWeeklyVolume, getWeeklyNutrition } from '~/lib/api'

export const Route = createFileRoute('/progress/')({
  head: () => ({ meta: [{ title: 'Progress - FitTrack' }] }),
  component: ProgressPage,
})

function ProgressPage() {
  const { data: bodyLogs } = useSuspenseQuery({
    queryKey: ['body-logs'],
    queryFn: () => getBodyLogs({ data: { limit: 90 } }),
  })

  const { data: sessions } = useSuspenseQuery({
    queryKey: ['workout-sessions-progress'],
    queryFn: () => getWorkoutSessions({ data: { limit: 90 } }),
  })

  const { data: weeklyVolume } = useSuspenseQuery({
    queryKey: ['weekly-volume'],
    queryFn: () => getWeeklyVolume(),
  })

  const { data: weeklyNutrition } = useSuspenseQuery({
    queryKey: ['weekly-nutrition'],
    queryFn: () => getWeeklyNutrition(),
  })

  const weightLogs = bodyLogs.filter((l) => l.weight_kg !== null).reverse()
  const firstWeight = weightLogs[0]?.weight_kg
  const lastWeight = weightLogs[weightLogs.length - 1]?.weight_kg
  const weightChange = firstWeight && lastWeight ? (lastWeight - firstWeight) : 0

  const maxWeight = Math.max(...weightLogs.map((l) => l.weight_kg || 0), 1)
  const minWeight = Math.min(...weightLogs.map((l) => l.weight_kg || 999), maxWeight)

  const workoutCount = sessions.length

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Progress</h1>
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-title">Weight Trend</div>
          <div className="stat-value" style={{ fontSize: '1.75rem' }}>
            {lastWeight ? `${lastWeight.toFixed(1)} kg` : '—'}
          </div>
          {weightChange !== 0 && (
            <span className={`badge ${weightChange < 0 ? 'badge-positive' : 'badge-negative'}`}>
              {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} kg
            </span>
          )}
        </div>
        <div className="card">
          <div className="card-title">Workouts (90d)</div>
          <div className="stat-value" style={{ fontSize: '1.75rem' }}>{workoutCount}</div>
        </div>
        <div className="card">
          <div className="card-title">Avg per Week</div>
          <div className="stat-value" style={{ fontSize: '1.75rem' }}>
            {(workoutCount / 12.8).toFixed(1)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Weight History</div>
        {weightLogs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚖️</div>
            <p>No weight logs yet. Log your weight in Settings to start tracking.</p>
          </div>
        ) : (
          <>
            <WeightChart logs={weightLogs} maxWeight={maxWeight} minWeight={minWeight} />
            <table style={{ marginTop: '16px' }}>
              <thead>
                <tr><th>Date</th><th>Weight</th><th>Body Fat</th></tr>
              </thead>
              <tbody>
                {bodyLogs.slice(0, 10).map((log) => (
                  <tr key={log.id}>
                    <td>{log.date}</td>
                    <td>{log.weight_kg ? `${log.weight_kg} kg` : '—'}</td>
                    <td>{log.body_fat_pct ? `${log.body_fat_pct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Weekly Volume by Muscle Group</div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Based on Schoenfeld et al. 2017: 10-20 sets per muscle group per week for hypertrophy
        </p>
        {weeklyVolume.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <p>No training data in the last 7 days. Log a workout to see volume analysis.</p>
          </div>
        ) : (
          <div>
            {weeklyVolume.map((mv) => (
              <div key={mv.muscle_group} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{mv.muscle_group}</span>
                  <span style={{ fontSize: '0.875rem' }}>
                    {mv.total_sets} sets
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      ({mv.min_recommended}-{mv.max_recommended} optimal)
                    </span>
                    <span
                      className="badge"
                      style={{
                        marginLeft: '8px',
                        background:
                          mv.status === 'optimal' ? 'rgba(76,175,80,0.12)' :
                          mv.status === 'under' ? 'rgba(255,152,0,0.12)' : 'rgba(244,67,54,0.12)',
                        color:
                          mv.status === 'optimal' ? '#2e7d32' :
                          mv.status === 'under' ? '#e65100' : '#c62828',
                      }}
                    >
                      {mv.status === 'optimal' ? 'Optimal' : mv.status === 'under' ? 'Under' : 'High'}
                    </span>
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, (mv.total_sets / mv.max_recommended) * 100)}%`,
                      background:
                        mv.status === 'optimal' ? '#4caf50' :
                        mv.status === 'under' ? '#ff9800' : '#f44336',
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Volume: {Math.round(mv.total_volume)} kg
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Weekly Nutrition Summary (7-day average)</div>
        {weeklyNutrition.daily.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍽️</div>
            <p>No food logged in the last 7 days.</p>
          </div>
        ) : (
          <div className="grid-2">
            <div className="stat-row">
              <span className="stat-label">Avg Calories</span>
              <span className="stat-value">{weeklyNutrition.avg.calories} kcal</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Protein</span>
              <span className="stat-value">{weeklyNutrition.avg.protein_g} g</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Carbs</span>
              <span className="stat-value">{weeklyNutrition.avg.carbs_g} g</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Fat</span>
              <span className="stat-value">{weeklyNutrition.avg.fat_g} g</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WeightChart({
  logs,
  maxWeight,
  minWeight,
}: {
  logs: Array<{ date: string; weight_kg: number | null }>
  maxWeight: number
  minWeight: number
}) {
  const range = maxWeight - minWeight || 1
  const chartHeight = 200
  const chartWidth = Math.max(logs.length * 8, 100)

  return (
    <div style={{ overflowX: 'auto', padding: '8px 0' }}>
      <svg width={chartWidth} height={chartHeight + 40} style={{ overflow: 'visible' }}>
        <polyline
          points={logs
            .map((log, i) => {
              const x = (i / Math.max(logs.length - 1, 1)) * chartWidth
              const y = chartHeight - ((log.weight_kg! - minWeight) / range) * chartHeight + 10
              return `${x},${y}`
            })
            .join(' ')}
          fill="none"
          stroke="#6741d9"
          strokeWidth="2"
        />
        {logs.map((log, i) => {
          const x = (i / Math.max(logs.length - 1, 1)) * chartWidth
          const y = chartHeight - ((log.weight_kg! - minWeight) / range) * chartHeight + 10
          return <circle key={i} cx={x} cy={y} r="3" fill="#6741d9" />
        })}
      </svg>
    </div>
  )
}
