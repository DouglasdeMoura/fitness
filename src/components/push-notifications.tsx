"use client";

import {
  Button,
  Card,
  Heading,
  List,
  ListItem,
  Text,
  VStack,
} from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useEffect, useState } from "react";

import {
  getPushStatus,
  sendTestPush,
  subscribePush,
  unsubscribePush,
} from "~/lib/api";
import type { PushUiMode } from "~/lib/push";
import {
  getPushUiMode,
  PUSH_CARD_TITLE,
  PUSH_DENIED_MESSAGE,
  PUSH_DISABLE_BUTTON,
  PUSH_ENABLE_BUTTON,
  PUSH_IOS_INSTALL_MESSAGE,
  PUSH_NOT_CONFIGURED_MESSAGE,
  PUSH_SUBSCRIBED_MESSAGE,
  PUSH_TEST_BUTTON,
  PUSH_TEST_FAILURE_MESSAGE,
  PUSH_TEST_SUCCESS_MESSAGE,
  PUSH_UNSUPPORTED_MESSAGE,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "~/lib/push";
import { IOS_INSTALL_STEPS, readIsStandalone } from "~/lib/pwa-install";

interface PushNotificationsProps {
  initialConfigured: boolean;
  initialPublicKey: string | null;
  initialSubscribed: boolean;
}

/**
 * Settings card for Web Push opt-in (issue #65).
 * Permission is requested only after the user taps Enable notifications.
 */
export function PushNotifications({
  initialConfigured,
  initialPublicKey,
  initialSubscribed,
}: PushNotificationsProps) {
  const toast = useToast();
  const [configured, setConfigured] = useState(initialConfigured);
  const [publicKey, setPublicKey] = useState(initialPublicKey);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [mode, setMode] = useState<PushUiMode | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const permission =
      typeof Notification === "undefined" ? "default" : Notification.permission;

    setMode(
      getPushUiMode({
        hasNotification: typeof Notification !== "undefined",
        hasPushManager: "PushManager" in window,
        hasServiceWorker: "serviceWorker" in navigator,
        isStandalone: readIsStandalone(window),
        isSubscribed: subscribed,
        maxTouchPoints: navigator.maxTouchPoints,
        permission,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        vapidConfigured: configured,
      })
    );
  }, [configured, subscribed]);

  const refreshStatus = async () => {
    const status = await getPushStatus();
    setConfigured(status.configured);
    setPublicKey(status.publicKey);
    setSubscribed(status.subscribed);
  };

  const handleEnable = async () => {
    if (!publicKey) {
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await refreshStatus();
        return;
      }
      const input = await subscribeBrowserPush(publicKey);
      const result = await subscribePush({ data: input });
      if (!result.ok) {
        toast({ body: PUSH_TEST_FAILURE_MESSAGE, type: "error" });
        return;
      }
      await refreshStatus();
    } catch {
      toast({ body: PUSH_TEST_FAILURE_MESSAGE, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeBrowserPush();
      if (endpoint) {
        await unsubscribePush({ data: { endpoint } });
      }
      await refreshStatus();
    } catch {
      toast({ body: PUSH_TEST_FAILURE_MESSAGE, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const result = await sendTestPush();
      if (result.ok) {
        toast({ body: PUSH_TEST_SUCCESS_MESSAGE });
        return;
      }
      toast({ body: PUSH_TEST_FAILURE_MESSAGE, type: "error" });
    } catch {
      toast({ body: PUSH_TEST_FAILURE_MESSAGE, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (mode === null) {
    return null;
  }

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>{PUSH_CARD_TITLE}</Heading>
        <PushNotificationsBody
          busy={busy}
          mode={mode}
          onDisable={handleDisable}
          onEnable={handleEnable}
          onTest={handleTest}
        />
      </VStack>
    </Card>
  );
}

function PushNotificationsBody({
  mode,
  busy,
  onEnable,
  onDisable,
  onTest,
}: {
  mode: PushUiMode;
  busy: boolean;
  onEnable: () => void | Promise<void>;
  onDisable: () => void | Promise<void>;
  onTest: () => void | Promise<void>;
}) {
  if (mode === "not-configured") {
    return <Text type="supporting">{PUSH_NOT_CONFIGURED_MESSAGE}</Text>;
  }

  if (mode === "unsupported") {
    return <Text type="supporting">{PUSH_UNSUPPORTED_MESSAGE}</Text>;
  }

  if (mode === "ios-install-required") {
    return (
      <VStack gap={2}>
        <Text type="supporting">{PUSH_IOS_INSTALL_MESSAGE}</Text>
        <List density="compact" listStyle="decimal">
          {IOS_INSTALL_STEPS.map((step) => (
            <ListItem key={step} label={step} />
          ))}
        </List>
      </VStack>
    );
  }

  if (mode === "denied") {
    return <Text type="supporting">{PUSH_DENIED_MESSAGE}</Text>;
  }

  if (mode === "subscribed") {
    return (
      <VStack gap={3}>
        <Text type="supporting">{PUSH_SUBSCRIBED_MESSAGE}</Text>
        <Button
          clickAction={onTest}
          isLoading={busy}
          label={PUSH_TEST_BUTTON}
          variant="primary"
        />
        <Button
          clickAction={onDisable}
          isLoading={busy}
          label={PUSH_DISABLE_BUTTON}
          variant="secondary"
        />
      </VStack>
    );
  }

  return (
    <VStack gap={3}>
      <Text type="supporting">
        Receive alerts when your rest timer finishes and other important
        updates.
      </Text>
      <Button
        clickAction={onEnable}
        isLoading={busy}
        label={PUSH_ENABLE_BUTTON}
        variant="primary"
      />
    </VStack>
  );
}
