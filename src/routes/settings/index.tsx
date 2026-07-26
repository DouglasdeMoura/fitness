import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import {
  Button,
  Card,
  DateInput,
  FormLayout,
  Heading,
  HStack,
  List,
  ListItem,
  NumberInput,
  Selector,
  Text,
  TextInput,
  VStack,
} from '@astryxdesign/core'
import { useToast } from '@astryxdesign/core/Toast'
import { getUser, updateUser, logBodyweight, exportData } from '~/lib/api'
import { runOrQueue } from '~/lib/offline'
import type { ActivityLevel, GoalType, Sex } from '~/lib/nutrition'
import {
  GOAL_OPTIONS,
  SCIENCE_REFERENCES,
  SEX_OPTIONS,
  activityOptions,
  buildProfileUpdate,
  exportDownloadFilename,
  parseWeightKg,
  todayISODate,
  toISODate,
} from '~/lib/settings'
import {
  dataExportedBody,
  mutationFailedBody,
  profileSavedBody,
  weightLoggedBody,
} from '~/lib/toasts'
import { SettingsSkeleton } from '~/components/loading/PageSkeletons'
import { InstallPrompt } from '~/components/InstallPrompt'

export const Route = createFileRoute('/settings/')({
  head: () => ({ meta: [{ title: 'Settings - FitTrack' }] }),
  loader: async () => {
    const user = await getUser()
    return { user }
  },
  pendingComponent: SettingsSkeleton,
  component: SettingsPage,
})

async function exportFitTrackData(): Promise<void> {
  const exportPayload = await exportData()
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exportDownloadFilename()
  anchor.click()
  URL.revokeObjectURL(url)
}

function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsPageContent />
    </Suspense>
  )
}

function SettingsPageContent() {
  const toast = useToast()
  const loaderData = Route.useLoaderData()
  const { data: user } = useSuspenseQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
    initialData: loaderData.user,
  })

  const [name, setName] = useState(user.name)
  const [heightCm, setHeightCm] = useState<number | null>(user.height_cm ?? null)
  const [sex, setSex] = useState<Sex>(user.sex)
  const [activity, setActivity] = useState<ActivityLevel>(
    user.activity_level as ActivityLevel,
  )
  const [goal, setGoal] = useState<GoalType>(user.goal_type as GoalType)
  const [birthDate, setBirthDate] = useState(user.birth_date || '')
  const [weight, setWeight] = useState<number | null>(null)

  const handleSaveProfile = async () => {
    try {
      await updateUser({
        data: buildProfileUpdate({
          name,
          heightCm,
          sex,
          activity,
          goal,
          birthDate,
        }),
      })
      toast({ body: profileSavedBody() })
    } catch {
      toast({ body: mutationFailedBody('Save profile'), type: 'error' })
    }
  }

  const handleLogWeight = async () => {
    const w = parseWeightKg(weight)
    if (w == null) return
    try {
      await runOrQueue('logBodyweight', { weight_kg: w }, () =>
        logBodyweight({ data: { weight_kg: w } }),
      )
      toast({ body: weightLoggedBody(w) })
      setWeight(null)
    } catch {
      toast({ body: mutationFailedBody('Log weight'), type: 'error' })
    }
  }

  const handleExportData = async () => {
    try {
      await exportFitTrackData()
      toast({ body: dataExportedBody() })
    } catch {
      toast({ body: mutationFailedBody('Export data'), type: 'error' })
    }
  }

  return (
    <VStack as="main" gap={4}>
      <Heading level={1}>Settings</Heading>

      <Card>
        <VStack gap={4}>
          <Heading level={2}>Profile</Heading>
          {/*
            TextInput / NumberInput / Selector / DateInput each render their own
            Field shell (label + description + status). Do not wrap them in Field.
          */}
          <FormLayout>
            <TextInput label="Name" value={name} onChange={setName} />
            <NumberInput
              label="Height (cm)"
              value={heightCm}
              onChange={setHeightCm}
              min={1}
              max={300}
              step={1}
              isIntegerOnly
              hasClear
            />
            <Selector
              label="Sex (for BMR calculation)"
              value={sex}
              onChange={(value) => setSex(value as Sex)}
              options={SEX_OPTIONS}
            />
            <DateInput
              label="Birth Date"
              value={toISODate(birthDate) ?? undefined}
              onChange={(value) => setBirthDate(value ?? '')}
              hasClear
              max={todayISODate()}
            />
            <Selector
              label="Activity Level"
              value={activity}
              onChange={(value) => setActivity(value as ActivityLevel)}
              options={activityOptions()}
            />
            <Selector
              label="Primary Goal"
              value={goal}
              onChange={(value) => setGoal(value as GoalType)}
              options={GOAL_OPTIONS}
            />
          </FormLayout>
          <Button
            label="Save Profile"
            variant="primary"
            clickAction={handleSaveProfile}
          />
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={2}>Log Today&apos;s Weight</Heading>
          <HStack gap={2} vAlign="end" wrap="wrap">
            <NumberInput
              label="Weight in kg"
              value={weight}
              onChange={setWeight}
              min={1}
              max={500}
              step={0.1}
              placeholder="Weight in kg"
              units="kg"
              hasClear
              onEnter={handleLogWeight}
            />
            <Button label="Log" variant="primary" clickAction={handleLogWeight} />
          </HStack>
          <Text type="supporting">
            Daily weigh-ins help track trends. Weight fluctuates daily; focus on
            weekly averages.
          </Text>
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={2}>Export Data</Heading>
          <Text type="supporting">
            Download all your data (food logs, workouts, body logs) as a JSON
            file for backup.
          </Text>
          <Button
            label="Export as JSON"
            variant="secondary"
            clickAction={handleExportData}
          />
        </VStack>
      </Card>

      <InstallPrompt />

      <Card>
        <VStack gap={3}>
          <Heading level={2}>About</Heading>
          <Text type="supporting">
            FitTrack uses evidence-based formulas for nutrition and training:
          </Text>
          <List
            density="compact"
            listStyle="disc"
            header={<Text type="label">Science references</Text>}
          >
            {SCIENCE_REFERENCES.map((ref) => (
              <ListItem
                key={ref.topic}
                label={ref.topic}
                description={ref.citation}
              />
            ))}
          </List>
        </VStack>
      </Card>
    </VStack>
  )
}
