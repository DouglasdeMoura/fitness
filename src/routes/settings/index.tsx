import { createFileRoute } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
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
import { getUser, updateUser, logBodyweight, exportData, getPushStatus, getReminderPreferences } from '~/lib/api'
import { runOrQueue } from '~/lib/offline'
import {
  GOAL_OPTIONS,
  SCIENCE_REFERENCES,
  SEX_OPTIONS,
  activityOptions,
  buildProfileUpdate,
  exportDownloadFilename,
  parseWeightKg,
  profileFormDefaults,
  profileSaveButtonLabel,
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
import { PushNotifications } from '~/components/PushNotifications'
import { ReminderPreferences } from '~/components/ReminderPreferences'

export const Route = createFileRoute('/settings/')({
  head: () => ({ meta: [{ title: 'Settings - FitTrack' }] }),
  loader: async () => {
    const [user, pushStatus, reminderPreferences] = await Promise.all([
      getUser(),
      getPushStatus(),
      getReminderPreferences(),
    ])
    return { user, pushStatus, reminderPreferences }
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
  const userQuery = useDataLoadQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
    initialData: loaderData.user,
  })

  const [weight, setWeight] = useState<number | null>(null)

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

  const failedQuery = pickFailedDataLoadQuery([userQuery])
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
    <VStack as="main" gap={6}>
      <Heading level={1}>Settings</Heading>

      <Card>
        <VStack gap={4}>
          <Heading level={2}>Profile</Heading>
          {/*
            TextInput / NumberInput / Selector / DateInput each render their own
            Field shell (label + description + status). Do not wrap them in Field.
          */}
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
            <form.Field name="activity">
              {(field) => (
                <Selector
                  label="Activity Level"
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value as typeof field.state.value)}
                  options={activityOptions()}
                />
              )}
            </form.Field>
            <form.Field name="goal">
              {(field) => (
                <Selector
                  label="Primary Goal"
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value as typeof field.state.value)}
                  options={GOAL_OPTIONS}
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

      <PushNotifications
        initialConfigured={loaderData.pushStatus.configured}
        initialPublicKey={loaderData.pushStatus.publicKey}
        initialSubscribed={loaderData.pushStatus.subscribed}
      />

      <ReminderPreferences initialPreferences={loaderData.reminderPreferences} />

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
