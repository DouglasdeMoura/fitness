import { describe, expect, it } from "vitest";

import type { BlogPost } from "~/lib/blog";
import { loadBlogPostBySlug, loadBlogPosts } from "~/lib/blog-api";
import { createDefaultBlogReader } from "~/lib/blog-api.server";
import {
  REQUIRED_BLOG_SLUGS,
  findRequiredBlogPosts,
  hasCrossArticleLink,
  hasInAppFeatureLink,
  hasScientificCitation,
  hasTagBasedRelatedArticles,
  isPublishedArticleContent,
  validateBlogPostContent,
} from "~/lib/blog-content";

const SAMPLE_POST: BlogPost = {
  content: `
Research shows protein helps hypertrophy (Morton et al., 2018).

See [nutrition](/nutrition) and [macros](/blog/macros-101).
`,
  date: "2026-07-28",
  description: "Test description",
  readingTime: 5,
  slug: "protein-for-hypertrophy",
  tags: ["nutrition", "protein"],
  title: "Test title",
};

describe("blog content helpers (issue #47)", () => {
  it("detects author/year citations", () => {
    expect(hasScientificCitation("Morton et al. (2018) found gains.")).toBe(
      true
    );
    expect(hasScientificCitation("(Frankenfield et al., 2005)")).toBe(true);
    expect(hasScientificCitation("No references here.")).toBe(false);
  });

  it("detects in-app feature links", () => {
    expect(hasInAppFeatureLink("Open [nutrition](/nutrition) to log.")).toBe(
      true
    );
    expect(hasInAppFeatureLink("Visit /workout to train.")).toBe(true);
    expect(hasInAppFeatureLink("External only.")).toBe(false);
  });

  it("detects cross-article links", () => {
    expect(hasCrossArticleLink("[Guide](/blog/macros-101)")).toBe(true);
    expect(hasCrossArticleLink("No internal blog links.")).toBe(false);
  });

  it("rejects placeholder infrastructure copy", () => {
    expect(isPublishedArticleContent(SAMPLE_POST.content)).toBe(true);
    expect(
      isPublishedArticleContent("This is a placeholder article for the blog.")
    ).toBe(false);
  });

  it("validates a complete post with no issues", () => {
    expect(validateBlogPostContent(SAMPLE_POST)).toEqual([]);
  });

  it("reports missing citations and links", () => {
    const issues = validateBlogPostContent({
      ...SAMPLE_POST,
      content: "Draft without references.",
      readingTime: 0,
      tags: [],
    });
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "readingTime must be >= 1, got 0",
        "at least one tag is required",
        "scientific claims require an author/year citation",
        "post must link to a related in-app feature route",
        "post must cross-link at least one related article",
      ])
    );
  });
});

describe("published blog articles (issue #47)", () => {
  const posts = loadBlogPosts(createDefaultBlogReader());

  it("loads all five required slugs from content/blog", () => {
    expect(findRequiredBlogPosts(posts).map((post) => post.slug)).toEqual([
      ...REQUIRED_BLOG_SLUGS,
    ]);
  });

  it.each(REQUIRED_BLOG_SLUGS)(
    "validates frontmatter, citations, and links for %s",
    (slug) => {
      const post = loadBlogPostBySlug(slug, createDefaultBlogReader());
      expect(post, `missing content/blog/${slug}.md`).not.toBeNull();
      expect(validateBlogPostContent(post!)).toEqual([]);
    }
  );

  it("connects related articles through shared tags", () => {
    for (const slug of REQUIRED_BLOG_SLUGS) {
      expect(hasTagBasedRelatedArticles(posts, slug)).toBe(true);
    }
  });

  it("sorts newest article first for the featured post slot", () => {
    expect(posts[0]?.slug).toBe("protein-for-hypertrophy");
  });
});
