import { createFileRoute } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useRef, useState } from 'react'
import { DataLoadErrorView } from '~/components/DataLoadErrorBanner'
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from '~/lib/data-load-query'
import {
  Button,
  Card,
  DateInput,
  Divider,
  FormLayout,
  Grid,
  Heading,
  HStack,
  List,
  ListItem,
  NumberInput,
  SegmentedControl,
  SegmentedControlItem,
  SelectableCard,
  Selector,
  Switch,
  Text,
  TextInput,
  VStack,
} from '@astryxdesign/core'
import { useToast } from '@astryxdesign/core/Toast'
import {
  getUser,
  updateUser,
  logBodyweight,
  exportData,
  importData,
  getBodyLogs,
  getPushStatus,
  getReminderPreferences,
} from '~/lib/api'
import { runOrQueue } from '~/lib/offline'
import {
  GOAL_CARD_OPTIONS,
  SCIENCE_REFERENCES,
  SEX_OPTIONS,
  activityOptions,
  buildProfileUpdate,
  buildWeightChartPoints,
  exportDownloadFilename,
  parseImportFile,
  parseWeightKg,
  profileFormDefaults,
  profileSaveButtonLabel,
  todayISODate,
  toISODate,
  weightChartPolyline,
  type GoalCardOption,
  type WeightChartPoint,
} from '~/lib/settings'
import {
  dataExportedBody,
  dataImportedBody,
  mutationFailedBody,
  profileSavedBody,
  weightLoggedBody,
} from '~/lib/toasts'
import { SettingsSkeleton } from '~/components/loading/PageSkeletons'
import { InstallPrompt } from '~/components/InstallPrompt'
import { PushNotifications } from '~/components/PushNotifications'
import { ReminderPreferences } from '~/components/ReminderPreferences'
import { getStoredTheme, persistTheme } from '~/lib/app-chrome'
import type { GoalType, ActivityLevel } from '~/lib/nutrition'

const WEIGHT_CHART_WIDTH = 320
const WEIGHT_CHART_HEIGHT = 80
const WEIGHT_CHART_PADDING = 8

export const Route = createFileRoute('/settings/')({
  head: () => ({ meta: [{ title: 'Settings - FitTrack' }] }),
  loader: async () => {
    const [user, bodyLogs, pushStatus, reminderPreferences] = await Promise.all([
      getUser(),
      getBodyLogs({ data: { limit: 30 } }),
      getPushStatus(),
      getReminderPreferences(),
    ])
    return { user, bodyLogs, pushStatus, reminderPreferences }
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
  return <SettingsPageContent />
}

function SettingsPageContent() {
  const toast = useToast()
  const loaderData = Route.useLoaderData()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const userQuery = useDataLoadQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
    initialData: loaderData.user,
  })

  const bodyLogsQuery = useDataLoadQuery({
    queryKey: ['bodyLogs', 30],
    queryFn: () => getBodyLogs({ data: { limit: 30 } }),
    initialData: loaderData.bodyLogs,
  })

  const [weight, setWeight] = useState<number | null>(null)
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return getStoredTheme() === 'dark'
  })

  const form = useForm({
    defaultValues: profileFormDefaults(userQuery.data ?? loaderData.user),
    onSubmit: async ({ value }) => {
      try {
        await updateUser({ data: buildProfileUpdate(value) })
        toast({ body: profileSavedBody() })
      } catch {
        toast({ body: mutationFailedBody('Save profile'), type: 'error' })
        throw new Error('Save profile failed')
      }
    },
  })

  if (isDataLoadPending(userQuery)) {
    return <SettingsSkeleton />
  }

  const failedQuery = pickFailedDataLoadQuery([userQuery, bodyLogsQuery])
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Settings"
        title="Failed to load settings"
        query={failedQuery}
      />
    )
  }

  const user = userQuery.data!
  const bodyLogs = bodyLogsQuery.data ?? []
  const chartPoints: WeightChartPoint[] = buildWeightChartPoints(
    bodyLogs,
    WEIGHT_CHART_WIDTH,
    WEIGHT_CHART_HEIGHT,
    WEIGHT_CHART_PADDING,
  )

  const handleSaveProfile = () => form.handleSubmit()

  const handleLogWeight = async () => {
    const w = parseWeightKg(weight)
    if (w == null) return
    try {
      await runOrQueue('logBodyweight', { weight_kg: w }, () =>
        logBodyweight({ data: { weight_kg: w } }),
      )
      toast({ body: weightLoggedBody(w) })
      setWeight(null)
      bodyLogsQuery.refetch()
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

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const result = parseImportFile(text)
      if ('error' in result) {
        toast({ body: mutationFailedBody(result.error), type: 'error' })
        return
      }

      await importData({ data: result.data as Parameters<typeof importData>[0]['data'] })
      toast({ body: dataImportedBody() })
      // Reload to reflect imported data across all queries
      window.location.reload()
    } catch {
      toast({ body: mutationFailedBody('Import data'), type: 'error' })
    } finally {
      // Reset the input so the same file can be re-imported
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleGoalChange = (goalOpt: GoalCardOption) => (isSelected: boolean) => {
    if (isSelected) {
      form.setFieldValue('goal', goalOpt.value)
    }
  }

  const handleActivityChange = (value: string) => {
    form.setFieldValue('activity', value as ActivityLevel)
  }

  const handleDarkModeToggle = (checked: boolean) => {
    setIsDark(checked)
    persistTheme(checked ? 'dark' : 'light')
  }

  return (
    <VStack as="main" gap={6}>
      <Heading level={1}>Settings</Heading>

      {/* Profile Section */}
      <Card>
        <VStack gap={4}>
          <Heading level={3}>Profile</Heading>
          <FormLayout>
            <form.Field name="name">
              {(field) => (
                <TextInput
                  label="Name"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name="heightCm">
              {(field) => (
                <NumberInput
                  label="Height (cm)"
                  value={field.state.value}
                  onChange={field.handleChange}
                  min={1}
                  max={300}
                  step={1}
                  isIntegerOnly
                  hasClear
                />
              )}
            </form.Field>
            <form.Field name="sex">
              {(field) => (
                <Selector
                  label="Sex (for BMR calculation)"
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value as typeof field.state.value)}
                  options={SEX_OPTIONS}
                />
              )}
            </form.Field>
            <form.Field name="birthDate">
              {(field) => (
                <DateInput
                  label="Birth Date"
                  value={toISODate(field.state.value) ?? undefined}
                  onChange={(value) => field.handleChange(value ?? '')}
                  hasClear
                  max={todayISODate()}
                />
              )}
            </form.Field>
          </FormLayout>
          <form.Subscribe
            selector={(state) => ({
              isSubmitting: state.isSubmitting,
              isSubmitSuccessful: state.isSubmitSuccessful,
            })}
          >
            {({ isSubmitting, isSubmitSuccessful }) => (
              <Button
                label={profileSaveButtonLabel({ isSubmitting, isSubmitSuccessful })}
                variant="primary"
                clickAction={handleSaveProfile}
              />
            )}
          </form.Subscribe>
        </VStack>
      </Card>

      {/* Goals Section */}
      <Card>
        <VStack gap={4}>
          <Heading level={3}>Goals</Heading>

          <form.Field name="goal">
            {(field) => (
              <VStack gap={3}>
                <Text type="label" as="span">Primary Goal</Text>
                <Grid columns={2} gap={3}>
                  {GOAL_CARD_OPTIONS.map((opt) => (
                    <SelectableCard
                      key={opt.value}
                      label={opt.description}
                      isSelected={field.state.value === opt.value}
                      onChange={handleGoalChange(opt)}
                    >
                      <VStack gap={1}>
                        <Text weight="semibold">{opt.label}</Text>
                        <Text type="supporting" size="sm">{opt.description}</Text>
                      </VStack>
                    </SelectableCard>
                  ))}
                </Grid>
              </VStack>
            )}
          </form.Field>

          <Divider />

          <form.Field name="activity">
            {(field) => (
              <VStack gap={2}>
                <Text type="label" as="span">Activity Level</Text>
                <SegmentedControl
                  label="Activity Level"
                  value={field.state.value}
                  onChange={handleActivityChange}
                  layout="fill"
                >
                  {activityOptions().map((opt) => (
                    <SegmentedControlItem
                      key={opt.value}
                      value={opt.value}
                      label={opt.label}
                    />
                  ))}
                </SegmentedControl>
              </VStack>
            )}
          </form.Field>

          <Divider />

          <Switch
            label="Dark Mode"
            value={isDark}
            onChange={handleDarkModeToggle}
            description="Switch between light and dark appearance."
          />
        </VStack>
      </Card>

      {/* Body Metrics Section */}
      <Card>
        <VStack gap={4}>
          <Heading level={3}>Body Metrics</Heading>
          <HStack gap={3} vAlign="end" wrap="wrap">
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

          {chartPoints.length >= 2 ? (
            <VStack gap={2}>
              <Text type="label" as="span">Recent Weight History</Text>
              <svg
                viewBox={`0 0 ${WEIGHT_CHART_WIDTH} ${WEIGHT_CHART_HEIGHT}`}
                width="100%"
                height={WEIGHT_CHART_HEIGHT}
                role="img"
                aria-label="Weight history sparkline chart"
              >
                <polyline
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={weightChartPolyline(chartPoints)}
                />
                {/* Last data point dot */}
                {chartPoints.length > 0 && (
                  <circle
                    cx={chartPoints[chartPoints.length - 1].x}
                    cy={chartPoints[chartPoints.length - 1].y}
                    r="3"
                    fill="var(--color-accent)"
                  />
                )}
              </svg>
            </VStack>
          ) : bodyLogs.length > 0 ? (
            <Text type="supporting">Log at least two weigh-ins to see your trend chart.</Text>
          ) : null}
        </VStack>
      </Card>

      {/* Data Management Section */}
      <Card>
        <VStack gap={4}>
          <Heading level={3}>Data Management</Heading>
          <Text type="supporting">
            Export or import all your FitTrack data (food logs, workouts, body
            logs) as a JSON file.
          </Text>
          <HStack gap={3} wrap="wrap">
            <Button
              label="Export as JSON"
              variant="secondary"
              clickAction={handleExportData}
            />
            <Button
              label="Import Data"
              variant="secondary"
              clickAction={handleImportClick}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleImportFile}
            />
          </HStack>
        </VStack>
      </Card>

      <InstallPrompt />

      <PushNotifications
        initialConfigured={loaderData.pushStatus.configured}
        initialPublicKey={loaderData.pushStatus.publicKey}
        initialSubscribed={loaderData.pushStatus.subscribed}
      />

      <ReminderPreferences initialPreferences={loaderData.reminderPreferences} />

      <Card>
        <VStack gap={3}>
          <Heading level={3}>About</Heading>
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
