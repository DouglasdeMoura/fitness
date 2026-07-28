import {
  Button,
  ClickableCard,
  Grid,
  Heading,
  HStack,
  Link,
  Text,
  VStack,
} from "@astryxdesign/core";
import { Blockquote } from "@astryxdesign/core/Blockquote";
import { Section } from "@astryxdesign/core/Section";

import { LandingShell } from "~/components/landing/landing-top-nav";
import {
  LANDING_BLOG_LINKS,
  LANDING_FEATURE_CARDS,
  LANDING_FINAL_CTA,
  LANDING_HERO_HEADLINE,
  LANDING_HERO_SUBHEADLINE,
  LANDING_PRIMARY_CTA,
  LANDING_SCIENCE_BLOCKQUOTE,
  LANDING_SCIENCE_EXPLAINER,
  LANDING_SECONDARY_CTA,
} from "~/lib/landing-content";

/** Public marketing landing page for unauthenticated visitors (issue #45). */
export function LandingPage() {
  return (
    <LandingShell>
      <VStack gap={0} width="100%">
        <Section padding={6} paddingBlock={10} variant="muted">
          <VStack align="center" gap={6} maxWidth={720} width="100%">
            <VStack align="center" gap={3}>
              <Heading
                justify="center"
                level={1}
                textWrap="balance"
                type="display-1"
              >
                {LANDING_HERO_HEADLINE}
              </Heading>
              <Text color="secondary" justify="center" type="supporting">
                {LANDING_HERO_SUBHEADLINE}
              </Text>
            </VStack>
            <HStack align="center" gap={3} justify="center" width="100%">
              <Button
                href={LANDING_PRIMARY_CTA.href}
                label={LANDING_PRIMARY_CTA.label}
                size="lg"
                variant="primary"
              />
              <Button
                href={LANDING_SECONDARY_CTA.href}
                label={LANDING_SECONDARY_CTA.label}
                size="lg"
                variant="secondary"
              />
            </HStack>
          </VStack>
        </Section>

        <Section padding={6}>
          <VStack gap={6} maxWidth={960} width="100%">
            <Heading justify="center" level={2} type="display-3">
              Built on peer-reviewed research
            </Heading>
            <Grid columns={{ max: 2, minWidth: 280 }} gap={4} width="100%">
              {LANDING_FEATURE_CARDS.map((feature) => (
                <ClickableCard
                  href={feature.href}
                  key={feature.id}
                  label={feature.title}
                  variant="muted"
                >
                  <VStack gap={2}>
                    <Text type="body">{feature.emoji}</Text>
                    <Heading level={3}>{feature.title}</Heading>
                    <Text color="secondary" type="supporting">
                      {feature.description}
                    </Text>
                  </VStack>
                </ClickableCard>
              ))}
            </Grid>
          </VStack>
        </Section>

        <Section padding={6} variant="muted">
          <VStack gap={6} maxWidth={720} width="100%">
            <Heading level={2} type="display-3">
              The science behind every number
            </Heading>
            <Text type="body">{LANDING_SCIENCE_EXPLAINER}</Text>
            <Blockquote cite={LANDING_SCIENCE_BLOCKQUOTE.cite}>
              {LANDING_SCIENCE_BLOCKQUOTE.quote}
            </Blockquote>
            <VStack gap={2}>
              <Text color="secondary" type="supporting">
                Read the research:
              </Text>
              {LANDING_BLOG_LINKS.map((article) => (
                <Link href={article.href} isStandalone key={article.href}>
                  {article.label}
                </Link>
              ))}
            </VStack>
          </VStack>
        </Section>

        <Section padding={6} paddingBlock={10}>
          <VStack align="center" gap={4} maxWidth={480} width="100%">
            <Heading
              justify="center"
              level={2}
              textWrap="balance"
              type="display-2"
            >
              {LANDING_FINAL_CTA.headline}
            </Heading>
            <Button
              href={LANDING_FINAL_CTA.href}
              label={LANDING_FINAL_CTA.buttonLabel}
              size="lg"
              variant="primary"
              width="100%"
            />
          </VStack>
        </Section>
      </VStack>
    </LandingShell>
  );
}
