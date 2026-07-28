import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { parseBlogPostFile, slugFromFilename, sortPostsByDate } from "./blog";
import type { BlogContentReader, BlogPost, BlogPostSummary } from "./blog";

/** Resolves `content/blog` relative to the project root. */
export function resolveBlogContentDir(cwd = process.cwd()): string {
  return join(cwd, "content", "blog");
}

function createDefaultBlogReader(cwd = process.cwd()): BlogContentReader {
  const contentDir = resolveBlogContentDir(cwd);

  return {
    listFilenames: () =>
      readdirSync(contentDir).filter((name) => name.endsWith(".md")),
    readFile: (filename) => readFileSync(join(contentDir, filename), "utf-8"),
  };
}

/** Loads and parses every markdown post from the content directory. */
export function loadBlogPosts(
  reader: BlogContentReader = createDefaultBlogReader()
): BlogPostSummary[] {
  const summaries = reader.listFilenames().map((filename) => {
    const slug = slugFromFilename(filename);
    const post = parseBlogPostFile(slug, reader.readFile(filename));
    return {
      date: post.date,
      description: post.description,
      readingTime: post.readingTime,
      slug: post.slug,
      tags: post.tags,
      title: post.title,
    };
  });

  return sortPostsByDate(summaries);
}

/** Returns a single post by slug, or null when the slug is unknown. */
export function loadBlogPostBySlug(
  slug: string,
  reader: BlogContentReader = createDefaultBlogReader()
): BlogPost | null {
  const filename = `${slug}.md`;
  if (!reader.listFilenames().includes(filename)) {
    return null;
  }

  return parseBlogPostFile(slug, reader.readFile(filename));
}

export const listBlogPosts = createServerFn({ method: "GET" }).handler(
  async () => loadBlogPosts()
);

export const getBlogPostBySlug = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(async (ctx) => loadBlogPostBySlug(ctx.data.slug));
