import {
  Button,
  Card,
  Heading,
  List,
  ListItem,
  Text,
  VStack,
} from "@astryxdesign/core";
import { useEffect, useState } from "react";
import type { InstallMode } from "~/lib/pwa-install";
import {
  getInstallMode,
  INSTALL_BUTTON_LABEL,
  INSTALL_CARD_TITLE,
  INSTALLED_MESSAGE,
  IOS_INSTALL_DESCRIPTION,
  IOS_INSTALL_STEPS,
  isIosDevice,
  readIsStandalone,
  UNAVAILABLE_MESSAGE,
} from "~/lib/pwa-install";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Settings card that offers "Add to home screen" when Chromium fires
 * beforeinstallprompt, or Share-sheet steps on iOS Safari (issue #48).
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const standalone = readIsStandalone(window);
    const ios = isIosDevice({
      maxTouchPoints: navigator.maxTouchPoints,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    });

    const refresh = (hasPrompt: boolean) => {
      setMode(
        getInstallMode({
          hasDeferredPrompt: hasPrompt,
          isStandalone: standalone,
          maxTouchPoints: navigator.maxTouchPoints,
          platform: navigator.platform,
          userAgent: navigator.userAgent,
        })
      );
    };

    refresh(false);

    if (standalone || ios) {
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const bip = event as BeforeInstallPromptEvent;
      setDeferred(bip);
      refresh(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  if (mode === null) {
    return null;
  }

  const handleInstall = async () => {
    if (!deferred) {
      return;
    }
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setMode(
        getInstallMode({
          hasDeferredPrompt: false,
          isStandalone: readIsStandalone(window),
          maxTouchPoints: navigator.maxTouchPoints,
          platform: navigator.platform,
          userAgent: navigator.userAgent,
        })
      );
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>{INSTALL_CARD_TITLE}</Heading>
        <InstallPromptBody
          installing={installing}
          mode={mode}
          onInstall={handleInstall}
        />
      </VStack>
    </Card>
  );
}

function InstallPromptBody({
  mode,
  installing,
  onInstall,
}: {
  mode: InstallMode;
  installing: boolean;
  onInstall: () => void | Promise<void>;
}) {
  if (mode === "installed") {
    return <Text type="supporting">{INSTALLED_MESSAGE}</Text>;
  }

  if (mode === "prompt") {
    return (
      <VStack gap={3}>
        <Text type="supporting">
          Install FitTrack on your home screen for faster access and an app-like
          experience.
        </Text>
        <Button
          clickAction={onInstall}
          isLoading={installing}
          label={INSTALL_BUTTON_LABEL}
          size="lg"
          variant="primary"
        />
      </VStack>
    );
  }

  if (mode === "ios-instructions") {
    return (
      <VStack gap={3}>
        <Text type="supporting">{IOS_INSTALL_DESCRIPTION}</Text>
        <List
          density="spacious"
          header={<Text type="label">Safari steps</Text>}
          listStyle="decimal"
        >
          {IOS_INSTALL_STEPS.map((step) => (
            <ListItem key={step} label={step} />
          ))}
        </List>
      </VStack>
    );
  }

  return <Text type="supporting">{UNAVAILABLE_MESSAGE}</Text>;
}
