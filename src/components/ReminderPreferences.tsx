'use client'

import { useState } from 'react'
import {
  Button,
  Card,
  CheckboxList,
  CheckboxListItem,
  Heading,
  Selector,
  Switch,
  Text,
  TimeInput,
  VStack,
} from '@astryxdesign/core'
import { useToast } from '@astryxdesign/core/Toast'
import { asTimeValue } from '~/lib/input-values'
import { updateNotificationPreferences } from '~/lib/api'
import {
  REMINDERS_CARD_TITLE,
  WEEKDAY_OPTIONS,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from '~/lib/push'
import { mutationFailedBody } from '~/lib/toasts'

type ReminderPreferencesProps = {
  initialPreferences: NotificationPreferences
}

export function ReminderPreferences({ initialPreferences }: ReminderPreferencesProps) {
  const toast = useToast()
  const [prefs, setPrefs] = useState(initialPreferences)
  const [saving, setSaving] = useState(false)

  const persist = async (update: NotificationPreferencesUpdate) => {
    setSaving(true)
    try {
      const next = await updateNotificationPreferences({ data: update })
      setPrefs(next)
    } catch {
      toast({ body: mutationFailedBody('Save reminder preferences'), type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const workoutDayValues = prefs.workout_days.map(String)

  return (
    <Card>
      <VStack gap={4}>
        <Heading level={2}>{REMINDERS_CARD_TITLE}</Heading>
        <Text type="supporting">
          Choose which reminders you want and when they may arrive. All types start
          off until you opt in.
        </Text>

        <Switch
          label="Rest timer complete"
          description="Alert when a rest period finishes during a workout."
          value={prefs.rest_timer}
          isLoading={saving}
          changeAction={(checked) => persist({ rest_timer: checked })}
        />

        <Switch
          label="Meal reminders"
          description="Nudge you to log meals at chosen times."
          value={prefs.meal_reminders}
          isLoading={saving}
          changeAction={(checked) => persist({ meal_reminders: checked })}
        />
        {prefs.meal_reminders ? (
          <VStack gap={3}>
            {prefs.meal_times.map((time, index) => (
              <VStack key={`${time}-${index}`} gap={2}>
                <TimeInput
                  label={`Meal time ${index + 1}`}
                  value={asTimeValue(time)}
                  isDisabled={saving}
                  onChange={(value) => {
                    if (!value) {
                      return
                    }
                    const meal_times = [...prefs.meal_times]
                    meal_times[index] = value
                    void persist({ meal_times })
                  }}
                />
                {prefs.meal_times.length > 1 ? (
                  <Button
                    label={`Remove meal time ${index + 1}`}
                    variant="secondary"
                    isLoading={saving}
                    clickAction={() => {
                      const meal_times = prefs.meal_times.filter((_, i) => i !== index)
                      void persist({ meal_times })
                    }}
                  />
                ) : null}
              </VStack>
            ))}
            <Button
              label="Add meal time"
              variant="secondary"
              isLoading={saving}
              clickAction={() => {
                void persist({ meal_times: [...prefs.meal_times, '18:00'] })
              }}
            />
          </VStack>
        ) : null}

        <Switch
          label="Workout reminders"
          description="Remind you to train on selected days."
          value={prefs.workout_reminders}
          isLoading={saving}
          changeAction={(checked) => persist({ workout_reminders: checked })}
        />
        {prefs.workout_reminders ? (
          <VStack gap={3}>
            <CheckboxList
              label="Workout days"
              value={workoutDayValues}
              isDisabled={saving}
              onChange={(values) => {
                void persist({ workout_days: values.map((value) => Number(value)) })
              }}
            >
              {WEEKDAY_OPTIONS.map((day) => (
                <CheckboxListItem key={day.value} value={day.value} label={day.label} />
              ))}
            </CheckboxList>
            <TimeInput
              label="Workout reminder time"
              value={asTimeValue(prefs.workout_time)}
              isDisabled={saving}
              onChange={(value) => {
                if (!value) {
                  return
                }
                void persist({ workout_time: value })
              }}
            />
          </VStack>
        ) : null}

        <Switch
          label="Weekly review"
          description="Notify when your weekly review is ready."
          value={prefs.weekly_review}
          isLoading={saving}
          changeAction={(checked) => persist({ weekly_review: checked })}
        />
        {prefs.weekly_review ? (
          <VStack gap={3}>
            <Selector
              label="Weekly review day"
              value={String(prefs.weekly_review_day ?? 0)}
              isDisabled={saving}
              options={[...WEEKDAY_OPTIONS]}
              onChange={(value) => {
                void persist({ weekly_review_day: Number(value) })
              }}
            />
            <TimeInput
              label="Weekly review time"
              value={asTimeValue(prefs.weekly_review_time)}
              isDisabled={saving}
              onChange={(value) => {
                if (!value) {
                  return
                }
                void persist({ weekly_review_time: value })
              }}
            />
          </VStack>
        ) : null}

        <Heading level={3}>Quiet hours</Heading>
        <Text type="supporting">
          No reminders are sent during this window, including times that cross
          midnight.
        </Text>
        <TimeInput
          label="Quiet hours start"
          value={asTimeValue(prefs.quiet_start)}
          isDisabled={saving}
          hasClear
          onChange={(value) => {
            void persist({ quiet_start: value ?? null })
          }}
        />
        <TimeInput
          label="Quiet hours end"
          value={asTimeValue(prefs.quiet_end)}
          isDisabled={saving}
          hasClear
          onChange={(value) => {
            void persist({ quiet_end: value ?? null })
          }}
        />
      </VStack>
    </Card>
  )
}
