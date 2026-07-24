import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getBodyLogs, getWorkoutSessions } from '~/lib/api'

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
