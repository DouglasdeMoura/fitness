import {
  Button,
  Center,
  Heading,
  Link,
  Text,
  VStack,
} from "@astryxdesign/core";

/** Public marketing hero for unauthenticated visitors (PRD 08 / issue #44). */
export function LandingPage() {
  return (
    <Center axis="both" minHeight="100dvh" width="100%">
      <VStack align="center" gap={6} maxWidth={480} padding={6}>
        <VStack align="center" gap={3}>
          <Heading level={1}>
            Train smarter. Eat better. Backed by science.
          </Heading>
          <Text color="secondary" type="supporting">
            The only fitness tracker where every number has a citation.
          </Text>
        </VStack>
        <VStack align="stretch" gap={3} width="100%">
          <Button
            href="/sign-up"
            label="Get started free"
            size="lg"
            variant="primary"
            width="100%"
          />
          <Button
            href="/sign-in"
            label="Sign in"
            size="lg"
            variant="secondary"
            width="100%"
          />
        </VStack>
        <Text color="secondary" type="supporting">
          Already curious about the formulas?{" "}
          <Link href="/sign-up" type="supporting">
            Create an account
          </Link>{" "}
          to explore FitTrack.
        </Text>
      </VStack>
    </Center>
  );
}
