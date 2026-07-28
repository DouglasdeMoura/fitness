import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectAllTags,
  filterPostsByTag,
  findRelatedPosts,
  formatBlogDate,
  parseBlogPostFile,
  parseFrontmatter,
  slugFromFilename,
  sortPostsByDate,
} from "~/lib/blog";
import type { BlogContentReader, BlogPostSummary } from "~/lib/blog";
import { loadBlogPostBySlug, loadBlogPosts } from "~/lib/blog-api";

const SAMPLE_FRONTMATTER = `title: "How Much Protein Do You Really Need?"
description: "A deep dive into Morton et al. 2018"
date: "2026-07-26"
tags: ["nutrition", "protein", "hypertrophy"]
readingTime: 5`;

const SAMPLE_MARKDOWN = `---
${SAMPLE_FRONTMATTER}
---

# Heading

Body copy.`;

function makeReader(files: Record<string, string>): BlogContentReader {
  return {
    listFilenames: () => Object.keys(files),
    readFile: (filename) => {
      const content = files[filename];
      if (content === undefined) {
        throw new Error(`Missing fixture file "${filename}"`);
      }
      return content;
    },
  };
}

const POST_A: BlogPostSummary = {
  date: "2026-07-26",
  description: "Protein dose-response",
  readingTime: 5,
  slug: "protein-for-hypertrophy",
  tags: ["nutrition", "protein"],
  title: "Protein for hypertrophy",
};

const POST_B: BlogPostSummary = {
  date: "2026-07-20",
  description: "BMR calculation",
  readingTime: 4,
  slug: "mifflin-st-jeor-bmr",
  tags: ["nutrition", "bmr"],
  title: "Mifflin-St Jeor BMR",
};

const POST_C: BlogPostSummary = {
  date: "2026-07-10",
  description: "Volume guidance",
  readingTime: 6,
  slug: "training-volume",
  tags: ["training"],
  title: "Training volume",
};

describe("blog frontmatter parsing (issue #46)", () => {
  it("parses PRD frontmatter fields", () => {
    expect(parseFrontmatter(SAMPLE_FRONTMATTER)).toEqual({
      date: "2026-07-26",
      description: "A deep dive into Morton et al. 2018",
      readingTime: 5,
      tags: ["nutrition", "protein", "hypertrophy"],
      title: "How Much Protein Do You Really Need?",
    });
  });

  it("extracts slug and markdown body from a post file", () => {
    const post = parseBlogPostFile("protein-for-hypertrophy", SAMPLE_MARKDOWN);
    expect(post.slug).toBe("protein-for-hypertrophy");
    expect(post.content).toContain("# Heading");
    expect(post.title).toBe("How Much Protein Do You Really Need?");
  });

  it("maps markdown filenames to slugs", () => {
    expect(slugFromFilename("macros-101.md")).toBe("macros-101");
  });
});

describe("blog listing helpers (issue #46)", () => {
  it("sorts posts newest first", () => {
    expect(sortPostsByDate([POST_B, POST_A, POST_C])).toEqual([
      POST_A,
      POST_B,
      POST_C,
    ]);
  });

  it("filters posts by tag", () => {
    const posts = [POST_A, POST_B, POST_C];
    expect(filterPostsByTag(posts, "nutrition")).toEqual([POST_A, POST_B]);
    expect(filterPostsByTag(posts)).toEqual(posts);
  });

  it("collects unique tags in alphabetical order", () => {
    expect(collectAllTags([POST_A, POST_B, POST_C])).toEqual([
      "bmr",
      "nutrition",
      "protein",
      "training",
    ]);
  });

  it("finds related posts by shared tags", () => {
    expect(findRelatedPosts([POST_A, POST_B, POST_C], POST_A.slug)).toEqual([
      POST_B,
    ]);
  });

  it("formats ISO dates for display", () => {
    expect(formatBlogDate("2026-07-26")).toBe("July 26, 2026");
  });
});

describe("blog filesystem loading (issue #46)", () => {
  it("loads posts from markdown files via the injected reader", () => {
    const reader = makeReader({
      "macros-101.md": `---
title: "Macros 101"
description: "Macro primer"
date: "2026-07-01"
tags: ["nutrition"]
readingTime: 3
---

Intro.`,
      "protein-for-hypertrophy.md": SAMPLE_MARKDOWN,
    });

    expect(loadBlogPosts(reader).map((post) => post.slug)).toEqual([
      "protein-for-hypertrophy",
      "macros-101",
    ]);
  });

  it("returns null for unknown slugs", () => {
    const reader = makeReader({
      "protein-for-hypertrophy.md": SAMPLE_MARKDOWN,
    });

    expect(loadBlogPostBySlug("missing-slug", reader)).toBeNull();
    expect(loadBlogPostBySlug("protein-for-hypertrophy", reader)?.content).toBe(
      "# Heading\n\nBody copy."
    );
  });

  it("loads the placeholder post from content/blog", () => {
    const posts = loadBlogPosts();
    expect(posts.some((post) => post.slug === "protein-for-hypertrophy")).toBe(
      true
    );
  });
});

describe("blog route wiring (issue #46)", () => {
  const blogIndexSource = readFileSync(
    join(process.cwd(), "src/routes/blog/index.tsx"),
    "utf-8"
  );
  const blogPostSource = readFileSync(
    join(process.cwd(), "src/routes/blog/$slug.tsx"),
    "utf-8"
  );

  it("lists posts with ClickableCards, featured post, and tag filters", () => {
    expect(blogIndexSource).toContain("useSuspenseQuery");
    expect(blogIndexSource).toContain("ClickableCard");
    expect(blogIndexSource).toContain("Featured");
    expect(blogIndexSource).toContain("filterPostsByTag");
    expect(blogIndexSource).toContain("<Token");
  });

  it("renders markdown and related articles on the post page", () => {
    expect(blogPostSource).toContain("@astryxdesign/core/Markdown");
    expect(blogPostSource).toContain("Related articles");
    expect(blogPostSource).toContain("Article not found");
    expect(blogPostSource).toContain("findRelatedPosts");
  });

  it("uses Astryx layout primitives only", () => {
    expect(blogIndexSource).not.toContain("style={{");
    expect(blogIndexSource).not.toContain("<div");
    expect(blogIndexSource).not.toContain("className=");
    expect(blogPostSource).not.toContain("style={{");
    expect(blogPostSource).not.toContain("<div");
    expect(blogPostSource).not.toContain("className=");
  });
});
