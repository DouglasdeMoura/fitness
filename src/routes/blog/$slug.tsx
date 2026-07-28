import {
  Badge,
  Button,
  ClickableCard,
  EmptyState,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  Text,
  VStack,
} from "@astryxdesign/core";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Section } from "@astryxdesign/core/Section";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { LandingShell } from "~/components/landing/landing-top-nav";
import { findRelatedPosts, formatBlogDate } from "~/lib/blog";
import type { BlogPost, BlogPostSummary } from "~/lib/blog";
import { getBlogPostBySlug, listBlogPosts } from "~/lib/blog-api";

interface BlogPostLoaderData {
  allPosts: BlogPostSummary[];
  post: BlogPost | null;
}

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPostPage,
  head: () => ({ meta: [{ title: "FitTrack Blog" }] }),
  loader: async ({ params }): Promise<BlogPostLoaderData> => {
    const [post, allPosts] = await Promise.all([
      getBlogPostBySlug({ data: { slug: params.slug } }),
      listBlogPosts(),
    ]);

    return {
      allPosts,
      post,
    };
  },
});

function BlogPostPage() {
  return <BlogPostContent />;
}

function BlogPostContent() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const postQuery = useSuspenseQuery<BlogPost | null>({
    initialData: loaderData.post,
    queryFn: () => getBlogPostBySlug({ data: { slug } }),
    queryKey: ["blog", "post", slug],
  });
  const postsQuery = useSuspenseQuery<BlogPostSummary[]>({
    initialData: loaderData.allPosts,
    queryFn: () => listBlogPosts(),
    queryKey: ["blog", "posts"],
  });

  const post = postQuery.data;

  if (!post) {
    return (
      <LandingShell>
        <Section padding={6} paddingBlock={10}>
          <EmptyState
            actions={
              <Button href="/blog" label="Back to blog" variant="primary" />
            }
            description="The article may have moved or is not published yet."
            title="Article not found"
          />
        </Section>
      </LandingShell>
    );
  }

  const relatedPosts = findRelatedPosts(postsQuery.data, post.slug);

  return (
    <LandingShell>
      <VStack gap={0} width="100%">
        <Section padding={6} paddingBlock={8} variant="muted">
          <VStack gap={4} maxWidth={720} width="100%">
            <Heading level={1} type="display-2">
              {post.title}
            </Heading>
            <MetadataList>
              <MetadataListItem label="Published">
                {formatBlogDate(post.date)}
              </MetadataListItem>
              <MetadataListItem label="Reading time">
                {post.readingTime} min
              </MetadataListItem>
            </MetadataList>
            <HStack gap={2} wrap="wrap">
              {post.tags.map((entry: string) => (
                <Badge key={entry} label={entry} variant="purple" />
              ))}
            </HStack>
          </VStack>
        </Section>

        <Section padding={6}>
          <VStack gap={8} maxWidth={720} width="100%">
            <Markdown headingLevelStart={2}>{post.content}</Markdown>

            {relatedPosts.length > 0 ? (
              <VStack gap={4} width="100%">
                <Heading level={2} type="display-3">
                  Related articles
                </Heading>
                <Grid columns={{ max: 2, minWidth: 280 }} gap={4} width="100%">
                  {relatedPosts.map((related) => (
                    <RelatedPostCard key={related.slug} post={related} />
                  ))}
                </Grid>
              </VStack>
            ) : null}
          </VStack>
        </Section>
      </VStack>
    </LandingShell>
  );
}

function RelatedPostCard({ post }: { post: BlogPostSummary }) {
  return (
    <ClickableCard
      href={`/blog/${post.slug}`}
      label={post.title}
      variant="muted"
    >
      <VStack gap={2}>
        <Heading level={3}>{post.title}</Heading>
        <Text color="secondary" type="supporting">
          {formatBlogDate(post.date)}
        </Text>
        <Text color="secondary" type="body">
          {post.description}
        </Text>
      </VStack>
    </ClickableCard>
  );
}
