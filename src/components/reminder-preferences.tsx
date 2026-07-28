"use client";

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
} from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useState } from "react";

import { updateNotificationPreferences } from "~/lib/api";
import { asTimeValue } from "~/lib/input-values";
import type {
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from "~/lib/push";
import { REMINDERS_CARD_TITLE, WEEKDAY_OPTIONS } from "~/lib/push";
import { mutationFailedBody } from "~/lib/toasts";

interface ReminderPreferencesProps {
  initialPreferences: NotificationPreferences;
}

export function ReminderPreferences({
  initialPreferences,
}: ReminderPreferencesProps) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);

  const persist = async (update: NotificationPreferencesUpdate) => {
    setSaving(true);
    try {
      const next = await updateNotificationPreferences({ data: update });
      setPrefs(next);
    } catch {
      toast({
        body: mutationFailedBody("Save reminder preferences"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const workoutDayValues = prefs.workout_days.map(String);

  return (
    <Card>
      <VStack gap={4}>
        <Heading level={2}>{REMINDERS_CARD_TITLE}</Heading>
        <Text type="supporting">
          Choose which reminders you want and when they may arrive. All types
          start off until you opt in.
        </Text>

        <Switch
          changeAction={(checked) => persist({ rest_timer: checked })}
          description="Alert when a rest period finishes during a workout."
          isLoading={saving}
          label="Rest timer complete"
          value={prefs.rest_timer}
        />

        <Switch
          changeAction={(checked) => persist({ meal_reminders: checked })}
          description="Nudge you to log meals at chosen times."
          isLoading={saving}
          label="Meal reminders"
          value={prefs.meal_reminders}
        />
        {prefs.meal_reminders ? (
          <VStack gap={3}>
            {prefs.meal_times.map((time, index) => (
              <VStack gap={2} key={`${time}-${index}`}>
                <TimeInput
                  isDisabled={saving}
                  label={`Meal time ${index + 1}`}
                  onChange={(value) => {
                    if (!value) {
                      return;
                    }
                    const meal_times = [...prefs.meal_times];
                    meal_times[index] = value;
                    persist({ meal_times });
                  }}
                  value={asTimeValue(time)}
                />
                {prefs.meal_times.length > 1 ? (
                  <Button
                    clickAction={() => {
                      const meal_times = prefs.meal_times.filter(
                        (_, i) => i !== index
                      );
                      persist({ meal_times });
                    }}
                    isLoading={saving}
                    label={`Remove meal time ${index + 1}`}
                    variant="secondary"
                  />
                ) : null}
              </VStack>
            ))}
            <Button
              clickAction={() => {
                persist({ meal_times: [...prefs.meal_times, "18:00"] });
              }}
              isLoading={saving}
              label="Add meal time"
              variant="secondary"
            />
          </VStack>
        ) : null}

        <Switch
          changeAction={(checked) => persist({ workout_reminders: checked })}
          description="Remind you to train on selected days."
          isLoading={saving}
          label="Workout reminders"
          value={prefs.workout_reminders}
        />
        {prefs.workout_reminders ? (
          <VStack gap={3}>
            <CheckboxList
              isDisabled={saving}
              label="Workout days"
              onChange={(values) => {
                persist({
                  workout_days: values.map((value) => Number(value)),
                });
              }}
              value={workoutDayValues}
            >
              {WEEKDAY_OPTIONS.map((day) => (
                <CheckboxListItem
                  key={day.value}
                  label={day.label}
                  value={day.value}
                />
              ))}
            </CheckboxList>
            <TimeInput
              isDisabled={saving}
              label="Workout reminder time"
              onChange={(value) => {
                if (!value) {
                  return;
                }
                persist({ workout_time: value });
              }}
              value={asTimeValue(prefs.workout_time)}
            />
          </VStack>
        ) : null}

        <Switch
          changeAction={(checked) => persist({ weekly_review: checked })}
          description="Notify when your weekly review is ready."
          isLoading={saving}
          label="Weekly review"
          value={prefs.weekly_review}
        />
        {prefs.weekly_review ? (
          <VStack gap={3}>
            <Selector
              isDisabled={saving}
              label="Weekly review day"
              onChange={(value) => {
                persist({ weekly_review_day: Number(value) });
              }}
              options={[...WEEKDAY_OPTIONS]}
              value={String(prefs.weekly_review_day ?? 0)}
            />
            <TimeInput
              isDisabled={saving}
              label="Weekly review time"
              onChange={(value) => {
                if (!value) {
                  return;
                }
                persist({ weekly_review_time: value });
              }}
              value={asTimeValue(prefs.weekly_review_time)}
            />
          </VStack>
        ) : null}

        <Heading level={3}>Quiet hours</Heading>
        <Text type="supporting">
          No reminders are sent during this window, including times that cross
          midnight.
        </Text>
        <TimeInput
          hasClear
          isDisabled={saving}
          label="Quiet hours start"
          onChange={(value) => {
            persist({ quiet_start: value ?? null });
          }}
          value={asTimeValue(prefs.quiet_start)}
        />
        <TimeInput
          hasClear
          isDisabled={saving}
          label="Quiet hours end"
          onChange={(value) => {
            persist({ quiet_end: value ?? null });
          }}
          value={asTimeValue(prefs.quiet_end)}
        />
      </VStack>
    </Card>
  );
}
