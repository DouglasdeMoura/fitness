import {
  Badge,
  ClickableCard,
  EmptyState,
  Grid,
  Heading,
  HStack,
  Text,
  VStack,
} from "@astryxdesign/core";
import { Section } from "@astryxdesign/core/Section";
import { Token } from "@astryxdesign/core/Token";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { LandingShell } from "~/components/landing/landing-top-nav";
import { collectAllTags, filterPostsByTag, formatBlogDate } from "~/lib/blog";
import type { BlogPostSummary } from "~/lib/blog";
import { listBlogPosts } from "~/lib/blog-api";

interface BlogSearch {
  tag?: string;
}

function parseBlogSearch(search: Record<string, unknown>): BlogSearch {
  return {
    tag:
      typeof search.tag === "string" && search.tag.length > 0
        ? search.tag
        : undefined,
  };
}

export const Route = createFileRoute("/blog/")({
  component: BlogIndexPage,
  head: () => ({ meta: [{ title: "Blog - FitTrack" }] }),
  loader: async () => listBlogPosts(),
  validateSearch: parseBlogSearch,
});

function BlogIndexPage() {
  return <BlogIndexContent />;
}

function BlogIndexContent() {
  const loaderPosts = Route.useLoaderData();
  const { tag } = Route.useSearch();
  const navigate = Route.useNavigate();
  const postsQuery = useSuspenseQuery({
    initialData: loaderPosts,
    queryFn: () => listBlogPosts(),
    queryKey: ["blog", "posts"],
  });

  const allPosts = postsQuery.data;
  const filteredPosts = filterPostsByTag(allPosts, tag);
  const tags = collectAllTags(allPosts);
  const [featuredPost, ...remainingPosts] = filteredPosts;

  const setTagFilter = (nextTag: string | undefined) => {
    void navigate({
      search: nextTag ? { tag: nextTag } : {},
      to: "/blog",
    });
  };

  return (
    <LandingShell>
      <VStack gap={0} width="100%">
        <Section padding={6} paddingBlock={8} variant="muted">
          <VStack gap={2} maxWidth={720} width="100%">
            <Heading level={1} type="display-2">
              Science-backed fitness
            </Heading>
            <Text color="secondary" type="supporting">
              Deep dives into the research behind FitTrack&apos;s calculations.
            </Text>
          </VStack>
        </Section>

        <Section padding={6}>
          <VStack gap={6} maxWidth={960} width="100%">
            {tags.length > 0 ? (
              <VStack gap={2} width="100%">
                <Text type="label">Filter by topic</Text>
                <HStack gap={2} width="100%" wrap="wrap">
                  <Token
                    color={tag ? "default" : "blue"}
                    label="All"
                    onClick={() => {
                      setTagFilter(undefined);
                    }}
                    size="lg"
                  />
                  {tags.map((entry) => (
                    <Token
                      color={tag === entry ? "blue" : "default"}
                      key={entry}
                      label={entry}
                      onClick={() => {
                        setTagFilter(entry);
                      }}
                      size="lg"
                    />
                  ))}
                </HStack>
              </VStack>
            ) : null}

            {filteredPosts.length === 0 ? (
              <EmptyState
                actions={
                  <Token
                    label="Show all articles"
                    onClick={() => {
                      setTagFilter(undefined);
                    }}
                    size="lg"
                  />
                }
                description="Try clearing the topic filter to see every article."
                title="No articles match this topic"
              />
            ) : (
              <VStack gap={6} width="100%">
                {featuredPost ? (
                  <VStack gap={3} width="100%">
                    <Text type="label">Featured</Text>
                    <BlogPostCard post={featuredPost} variant="muted" />
                  </VStack>
                ) : null}

                {remainingPosts.length > 0 ? (
                  <Grid
                    columns={{ max: 2, minWidth: 280 }}
                    gap={4}
                    width="100%"
                  >
                    {remainingPosts.map((post) => (
                      <BlogPostCard key={post.slug} post={post} />
                    ))}
                  </Grid>
                ) : null}
              </VStack>
            )}
          </VStack>
        </Section>
      </VStack>
    </LandingShell>
  );
}

function BlogPostCard({
  post,
  variant = "default",
}: {
  post: BlogPostSummary;
  variant?: "default" | "muted";
}) {
  return (
    <ClickableCard
      href={`/blog/${post.slug}`}
      label={post.title}
      variant={variant}
    >
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={2}>{post.title}</Heading>
          <Text color="secondary" type="supporting">
            {formatBlogDate(post.date)} · {post.readingTime} min read
          </Text>
        </VStack>
        <Text color="secondary" type="body">
          {post.description}
        </Text>
        <HStack gap={2} wrap="wrap">
          {post.tags.map((entry: string) => (
            <Badge key={entry} label={entry} variant="purple" />
          ))}
        </HStack>
      </VStack>
    </ClickableCard>
  );
}
