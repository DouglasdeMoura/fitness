import {
  Banner,
  Button,
  Card,
  Center,
  Divider,
  FormLayout,
  Heading,
  Link,
  Text,
  VStack,
} from "@astryxdesign/core";
import type { ReactNode } from "react";

interface AuthPageShellProps {
  alternateHref: string;
  alternatePrompt: string;
  alternateLabel: string;
  authError: string | null;
  children: ReactNode;
  heading: string;
  subheading: string;
  socialAction?: () => void;
  socialLabel?: string;
}

/** Centered login-card layout from the Astryx login-card kit (issue #43). */
export function AuthPageShell({
  alternateHref,
  alternateLabel,
  alternatePrompt,
  authError,
  children,
  heading,
  socialAction,
  socialLabel,
  subheading,
}: AuthPageShellProps) {
  return (
    <Center axis="both" minHeight="100dvh" width="100%">
      <VStack gap={4} hAlign="center" maxWidth={400} padding={6} width="100%">
        <VStack gap={2} hAlign="center">
          <Heading level={1}>FitTrack</Heading>
          <Text color="secondary" size="sm" type="body">
            Science-backed nutrition and training
          </Text>
        </VStack>

        <Card padding={8} width="100%">
          <VStack gap={4} hAlign="stretch">
            <VStack gap={1} hAlign="center">
              <Heading level={2}>{heading}</Heading>
              <Text color="secondary" size="sm" type="body">
                {subheading}
              </Text>
            </VStack>

            {authError ? <Banner status="error" title={authError} /> : null}

            {children}

            {socialLabel && socialAction ? (
              <>
                <Divider label="Or continue with" />
                <Button
                  clickAction={socialAction}
                  label={socialLabel}
                  size="lg"
                  variant="secondary"
                />
              </>
            ) : null}

            <VStack hAlign="center">
              <Text color="secondary" type="supporting">
                {alternatePrompt}{" "}
                <Link href={alternateHref} type="supporting">
                  {alternateLabel}
                </Link>
              </Text>
            </VStack>
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}

interface AuthFormFieldsProps {
  children: ReactNode;
}

export function AuthFormFields({ children }: AuthFormFieldsProps) {
  return (
    <VStack as="form" gap={4} hAlign="stretch">
      <FormLayout>{children}</FormLayout>
    </VStack>
  );
}
