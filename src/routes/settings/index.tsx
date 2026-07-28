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
} from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { DataLoadErrorView } from "~/components/data-load-error-banner";
import { InstallPrompt } from "~/components/install-prompt";
import { SettingsSkeleton } from "~/components/loading/page-skeletons";
import { PushNotifications } from "~/components/push-notifications";
import { ReminderPreferences } from "~/components/reminder-preferences";
import {
  exportData,
  getBodyLogs,
  getPushStatus,
  getReminderPreferences,
  getUser,
  importData,
  logBodyweight,
  updateUser,
} from "~/lib/api";
import { getStoredTheme, persistTheme } from "~/lib/app-chrome";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import type { ActivityLevel } from "~/lib/nutrition";
import { runOrQueue } from "~/lib/offline";
import type { GoalCardOption, WeightChartPoint } from "~/lib/settings";
import {
  activityOptions,
  buildProfileUpdate,
  buildWeightChartPoints,
  exportDownloadFilename,
  GOAL_CARD_OPTIONS,
  parseImportFile,
  parseWeightKg,
  profileFormDefaults,
  profileSaveButtonLabel,
  SCIENCE_REFERENCES,
  SEX_OPTIONS,
  todayISODate,
  toISODate,
  weightChartPolyline,
} from "~/lib/settings";
import {
  dataExportedBody,
  dataImportedBody,
  mutationFailedBody,
  profileSavedBody,
  weightLoggedBody,
} from "~/lib/toasts";

const WEIGHT_CHART_WIDTH = 320;
const WEIGHT_CHART_HEIGHT = 80;
const WEIGHT_CHART_PADDING = 8;

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings - FitTrack" }] }),
  loader: async () => {
    const [user, bodyLogs, pushStatus, reminderPreferences] = await Promise.all(
      [
        getUser(),
        getBodyLogs({ data: { limit: 30 } }),
        getPushStatus(),
        getReminderPreferences(),
      ]
    );
    return { bodyLogs, pushStatus, reminderPreferences, user };
  },
  pendingComponent: SettingsSkeleton,
});

async function exportFitTrackData(): Promise<void> {
  const exportPayload = await exportData();
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportDownloadFilename();
  anchor.click();
  URL.revokeObjectURL(url);
}

function SettingsPage() {
  return <SettingsPageContent />;
}

function SettingsPageContent() {
  const toast = useToast();
  const loaderData = Route.useLoaderData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userQuery = useDataLoadQuery({
    initialData: loaderData.user,
    queryFn: () => getUser(),
    queryKey: ["user"],
  });

  const bodyLogsQuery = useDataLoadQuery({
    initialData: loaderData.bodyLogs,
    queryFn: () => getBodyLogs({ data: { limit: 30 } }),
    queryKey: ["bodyLogs", 30],
  });

  const [weight, setWeight] = useState<number | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return getStoredTheme() === "dark";
  });

  const form = useForm({
    defaultValues: profileFormDefaults(userQuery.data ?? loaderData.user),
    onSubmit: async ({ value }) => {
      try {
        await updateUser({ data: buildProfileUpdate(value) });
        toast({ body: profileSavedBody() });
      } catch {
        toast({ body: mutationFailedBody("Save profile"), type: "error" });
        throw new Error("Save profile failed");
      }
    },
  });

  if (isDataLoadPending(userQuery)) {
    return <SettingsSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([userQuery, bodyLogsQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Settings"
        query={failedQuery}
        title="Failed to load settings"
      />
    );
  }

  const _user = userQuery.data!;
  const bodyLogs = bodyLogsQuery.data ?? [];
  const chartPoints: WeightChartPoint[] = buildWeightChartPoints(
    bodyLogs,
    WEIGHT_CHART_WIDTH,
    WEIGHT_CHART_HEIGHT,
    WEIGHT_CHART_PADDING
  );

  const handleSaveProfile = () => form.handleSubmit();

  const handleLogWeight = async () => {
    const w = parseWeightKg(weight);
    if (w === null) {
      return;
    }
    try {
      await runOrQueue("logBodyweight", { weight_kg: w }, () =>
        logBodyweight({ data: { weight_kg: w } })
      );
      toast({ body: weightLoggedBody(w) });
      setWeight(null);
      bodyLogsQuery.refetch();
    } catch {
      toast({ body: mutationFailedBody("Log weight"), type: "error" });
    }
  };

  const handleExportData = async () => {
    try {
      await exportFitTrackData();
      toast({ body: dataExportedBody() });
    } catch {
      toast({ body: mutationFailedBody("Export data"), type: "error" });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const result = parseImportFile(text);
      if ("error" in result) {
        toast({ body: mutationFailedBody(result.error), type: "error" });
        return;
      }

      await importData({
        data: result.data as Parameters<typeof importData>[0]["data"],
      });
      toast({ body: dataImportedBody() });
      // Reload to reflect imported data across all queries
      window.location.reload();
    } catch {
      toast({ body: mutationFailedBody("Import data"), type: "error" });
    } finally {
      // Reset the input so the same file can be re-imported
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleGoalChange =
    (goalOpt: GoalCardOption) => (isSelected: boolean) => {
      if (isSelected) {
        form.setFieldValue("goal", goalOpt.value);
      }
    };

  const handleActivityChange = (value: string) => {
    form.setFieldValue("activity", value as ActivityLevel);
  };

  const handleDarkModeToggle = (checked: boolean) => {
    setIsDark(checked);
    persistTheme(checked ? "dark" : "light");
  };

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
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="heightCm">
              {(field) => (
                <NumberInput
                  hasClear
                  isIntegerOnly
                  label="Height (cm)"
                  max={300}
                  min={1}
                  onChange={field.handleChange}
                  step={1}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="sex">
              {(field) => (
                <Selector
                  label="Sex (for BMR calculation)"
                  onChange={(value) =>
                    field.handleChange(value as typeof field.state.value)
                  }
                  options={SEX_OPTIONS}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="birthDate">
              {(field) => (
                <DateInput
                  hasClear
                  label="Birth Date"
                  max={todayISODate()}
                  onChange={(value) => field.handleChange(value ?? "")}
                  value={toISODate(field.state.value) ?? undefined}
                />
              )}
            </form.Field>
          </FormLayout>
          <form.Subscribe
            selector={(state) => ({
              isSubmitSuccessful: state.isSubmitSuccessful,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ isSubmitting, isSubmitSuccessful }) => (
              <Button
                clickAction={handleSaveProfile}
                label={profileSaveButtonLabel({
                  isSubmitSuccessful,
                  isSubmitting,
                })}
                variant="primary"
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
                <Text as="span" type="label">
                  Primary Goal
                </Text>
                <Grid columns={2} gap={3}>
                  {GOAL_CARD_OPTIONS.map((opt) => (
                    <SelectableCard
                      isSelected={field.state.value === opt.value}
                      key={opt.value}
                      label={opt.description}
                      onChange={handleGoalChange(opt)}
                    >
                      <VStack gap={1}>
                        <Text weight="semibold">{opt.label}</Text>
                        <Text size="sm" type="supporting">
                          {opt.description}
                        </Text>
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
                <Text as="span" type="label">
                  Activity Level
                </Text>
                <SegmentedControl
                  label="Activity Level"
                  layout="fill"
                  onChange={handleActivityChange}
                  value={field.state.value}
                >
                  {activityOptions().map((opt) => (
                    <SegmentedControlItem
                      key={opt.value}
                      label={opt.label}
                      value={opt.value}
                    />
                  ))}
                </SegmentedControl>
              </VStack>
            )}
          </form.Field>

          <Divider />

          <Switch
            description="Switch between light and dark appearance."
            label="Dark Mode"
            onChange={handleDarkModeToggle}
            value={isDark}
          />
        </VStack>
      </Card>

      {/* Body Metrics Section */}
      <Card>
        <VStack gap={4}>
          <Heading level={3}>Body Metrics</Heading>
          <HStack gap={3} vAlign="end" wrap="wrap">
            <NumberInput
              hasClear
              label="Weight in kg"
              max={500}
              min={1}
              onChange={setWeight}
              onEnter={handleLogWeight}
              placeholder="Weight in kg"
              step={0.1}
              units="kg"
              value={weight}
            />
            <Button
              clickAction={handleLogWeight}
              label="Log"
              variant="primary"
            />
          </HStack>
          <Text type="supporting">
            Daily weigh-ins help track trends. Weight fluctuates daily; focus on
            weekly averages.
          </Text>

          {chartPoints.length >= 2 ? (
            <VStack gap={2}>
              <Text as="span" type="label">
                Recent Weight History
              </Text>
              <svg
                aria-label="Weight history sparkline chart"
                height={WEIGHT_CHART_HEIGHT}
                viewBox={`0 0 ${WEIGHT_CHART_WIDTH} ${WEIGHT_CHART_HEIGHT}`}
                width="100%"
              >
                <polyline
                  fill="none"
                  points={weightChartPolyline(chartPoints)}
                  stroke="var(--color-accent)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
                {/* Last data point dot */}
                {chartPoints.length > 0 && (
                  <circle
                    cx={chartPoints.at(-1).x}
                    cy={chartPoints.at(-1).y}
                    fill="var(--color-accent)"
                    r="3"
                  />
                )}
              </svg>
            </VStack>
          ) : bodyLogs.length > 0 ? (
            <Text type="supporting">
              Log at least two weigh-ins to see your trend chart.
            </Text>
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
              clickAction={handleExportData}
              label="Export as JSON"
              variant="secondary"
            />
            <Button
              clickAction={handleImportClick}
              label="Import Data"
              variant="secondary"
            />
            <input
              accept=".json,application/json"
              hidden
              onChange={handleImportFile}
              ref={fileInputRef}
              type="file"
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

      <ReminderPreferences
        initialPreferences={loaderData.reminderPreferences}
      />

      <Card>
        <VStack gap={3}>
          <Heading level={3}>About</Heading>
          <Text type="supporting">
            FitTrack uses evidence-based formulas for nutrition and training:
          </Text>
          <List
            density="compact"
            header={<Text type="label">Science references</Text>}
            listStyle="disc"
          >
            {SCIENCE_REFERENCES.map((ref) => (
              <ListItem
                description={ref.citation}
                key={ref.topic}
                label={ref.topic}
              />
            ))}
          </List>
        </VStack>
      </Card>
    </VStack>
  );
}
