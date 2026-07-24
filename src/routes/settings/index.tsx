import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getUser, updateUser, logBodyweight, exportData } from '~/lib/api'
import { ACTIVITY_LABELS, type ActivityLevel, type GoalType } from '~/lib/nutrition'

export const Route = createFileRoute('/settings/')({
  head: () => ({ meta: [{ title: 'Settings - FitTrack' }] }),
  component: SettingsPage,
})

function SettingsPage() {
  const { data: user } = useSuspenseQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
  })

  const [name, setName] = useState(user.name)
  const [height, setHeight] = useState(user.height_cm?.toString() || '')
  const [sex, setSex] = useState(user.sex)
  const [activity, setActivity] = useState<ActivityLevel>(user.activity_level as ActivityLevel)
  const [goal, setGoal] = useState<GoalType>(user.goal_type as GoalType)
  const [birthDate, setBirthDate] = useState(user.birth_date || '')
  const [weight, setWeight] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSaveProfile = async () => {
    await updateUser({
      data: {
        name,
        height_cm: parseFloat(height) || null,
        sex: sex as any,
        activity_level: activity,
        goal_type: goal,
        birth_date: birthDate || null,
      },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLogWeight = async () => {
    const w = parseFloat(weight)
    if (!w) return
    await logBodyweight({ data: { weight_kg: w } })
    setWeight('')
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Settings</h1>
      </div>

      <div className="card">
        <div className="card-title">Profile</div>
        <div className="form-group">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">Height (cm)</label>
          <input className="input" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">Sex (for BMR calculation)</label>
          <select className="input" value={sex} onChange={(e) => setSex(e.target.value as any)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label className="label">Birth Date</label>
          <input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">Activity Level</label>
          <select className="input" value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
            {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Primary Goal</label>
          <select className="input" value={goal} onChange={(e) => setGoal(e.target.value as GoalType)}>
            <option value="build_muscle">Build Muscle (+10% surplus)</option>
            <option value="lose_fat">Lose Fat (-20% deficit)</option>
            <option value="maintain">Maintain Weight</option>
            <option value="recomp">Body Recomposition</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={handleSaveProfile}>
          {saved ? '✓ Saved' : 'Save Profile'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">Log Today's Weight</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="input"
            type="number"
            step="0.1"
            placeholder="Weight in kg"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleLogWeight}>Log</button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
          Daily weigh-ins help track trends. Weight fluctuates daily; focus on weekly averages.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Export Data</div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Download all your data (food logs, workouts, body logs) as a JSON file for backup.
        </p>
        <button
          className="btn btn-secondary"
          onClick={async () => {
            const data = await exportData()
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `fittrack-export-${new Date().toISOString().split('T')[0]}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          ⬇ Export as JSON
        </button>
      </div>

      <div className="card">
        <div className="card-title">About</div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          FitTrack uses evidence-based formulas for nutrition and training:
        </p>
        <ul style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: 1.8 }}>
          <li><strong>BMR:</strong> Mifflin-St Jeor equation (Frankenfield et al., 2005)</li>
          <li><strong>Protein:</strong> 1.6-2.4 g/kg (Morton et al., 2018; Helms et al., 2014)</li>
          <li><strong>1RM:</strong> Epley equation for estimation</li>
          <li><strong>RPE/RIR:</strong> Zourdos et al., 2016 for autoregulation</li>
          <li><strong>Volume:</strong> Schoenfeld et al., 2017 dose-response data</li>
        </ul>
      </div>
    </div>
  )
}
