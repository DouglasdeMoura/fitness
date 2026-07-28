import type { BlogPost, BlogPostSummary } from "./blog";
import { findRelatedPosts } from "./blog";

/** Slugs required for the initial science-backed blog batch (issue #47). */
export const REQUIRED_BLOG_SLUGS = [
  "protein-for-hypertrophy",
  "mifflin-st-jeor-bmr",
  "progressive-overload-guide",
  "training-volume",
  "macros-101",
] as const;

export type RequiredBlogSlug = (typeof REQUIRED_BLOG_SLUGS)[number];

const PLACEHOLDER_MARKERS = [
  "placeholder article",
  "Full content will arrive",
  "follow-up issue",
] as const;

const CITATION_PATTERN =
  /\([A-Z][A-Za-z]+(?:\s+et al\.?)?,?\s*\d{4}\)|[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?\s+et al\.\s*\(\d{4}\)/u;

const IN_APP_ROUTE_PATTERN =
  /\/(nutrition|workout|settings|dashboard|progress)/u;

const CROSS_ARTICLE_LINK_PATTERN = /\/blog\/[a-z0-9-]+/u;

/** True when the markdown body includes an author/year citation. */
export function hasScientificCitation(content: string): boolean {
  return CITATION_PATTERN.test(content);
}

/** True when the post links to a FitTrack app route. */
export function hasInAppFeatureLink(content: string): boolean {
  return IN_APP_ROUTE_PATTERN.test(content);
}

/** True when the post links to another blog article. */
export function hasCrossArticleLink(content: string): boolean {
  return CROSS_ARTICLE_LINK_PATTERN.test(content);
}

/** True when placeholder copy from the infrastructure issue is absent. */
export function isPublishedArticleContent(content: string): boolean {
  const normalized = content.toLowerCase();
  return !PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

export interface BlogContentIssue {
  field: string;
  message: string;
}

/**
 * Validates one loaded blog post against issue #47 acceptance criteria.
 * Returns an empty array when the post is publish-ready.
 */
export function validateBlogPostContent(post: BlogPost): BlogContentIssue[] {
  const issues: BlogContentIssue[] = [];

  if (!post.title.trim()) {
    issues.push({ field: "title", message: "title is required" });
  }
  if (!post.description.trim()) {
    issues.push({ field: "description", message: "description is required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(post.date)) {
    issues.push({ field: "date", message: `invalid ISO date "${post.date}"` });
  }
  if (post.readingTime < 1) {
    issues.push({
      field: "readingTime",
      message: `readingTime must be >= 1, got ${post.readingTime}`,
    });
  }
  if (post.tags.length === 0) {
    issues.push({ field: "tags", message: "at least one tag is required" });
  }
  if (!isPublishedArticleContent(post.content)) {
    issues.push({
      field: "content",
      message: "placeholder copy must be replaced with published content",
    });
  }
  if (!hasScientificCitation(post.content)) {
    issues.push({
      field: "content",
      message: "scientific claims require an author/year citation",
    });
  }
  if (!hasInAppFeatureLink(post.content)) {
    issues.push({
      field: "content",
      message: "post must link to a related in-app feature route",
    });
  }
  if (!hasCrossArticleLink(post.content)) {
    issues.push({
      field: "content",
      message: "post must cross-link at least one related article",
    });
  }

  return issues;
}

/** Returns summaries for every required slug present in `posts`. */
export function findRequiredBlogPosts(
  posts: readonly BlogPostSummary[]
): BlogPostSummary[] {
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  return REQUIRED_BLOG_SLUGS.flatMap((slug) => {
    const post = bySlug.get(slug);
    return post ? [post] : [];
  });
}

/**
 * Ensures tag overlap yields related articles for every required post.
 * The current slug is excluded by `findRelatedPosts`.
 */
export function hasTagBasedRelatedArticles(
  posts: readonly BlogPostSummary[],
  slug: string
): boolean {
  return findRelatedPosts(posts, slug).length > 0;
}
