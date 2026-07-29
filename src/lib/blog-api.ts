import { createServerFn } from "@tanstack/react-start";

import { parseBlogPostFile, slugFromFilename, sortPostsByDate } from "./blog";
import type { BlogContentReader, BlogPost, BlogPostSummary } from "./blog";

/** Loads and parses every markdown post from the content directory. */
export function loadBlogPosts(reader: BlogContentReader): BlogPostSummary[] {
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
  reader: BlogContentReader
): BlogPost | null {
  const filename = `${slug}.md`;
  if (!reader.listFilenames().includes(filename)) {
    return null;
  }

  return parseBlogPostFile(slug, reader.readFile(filename));
}

export const listBlogPosts = createServerFn({ method: "GET" }).handler(
  async () => {
    const { createDefaultBlogReader } = await import("./blog-api.server");
    return loadBlogPosts(createDefaultBlogReader());
  }
);

export const getBlogPostBySlug = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(async (ctx) => {
    const { createDefaultBlogReader } = await import("./blog-api.server");
    return loadBlogPostBySlug(ctx.data.slug, createDefaultBlogReader());
  });
