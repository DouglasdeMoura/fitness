import { z } from "zod";

/** Parsed YAML frontmatter for a blog post (PRD 08 Part 2). */
export interface BlogFrontmatter {
  date: string;
  description: string;
  readingTime: number;
  tags: string[];
  title: string;
}

/** Blog index card data — frontmatter plus slug. */
export interface BlogPostSummary extends BlogFrontmatter {
  slug: string;
}

/** Full post body for `/blog/$slug` rendering. */
export interface BlogPost extends BlogPostSummary {
  content: string;
}

/** Injectable filesystem access for unit tests (AGENTS.md dependency injection). */
export interface BlogContentReader {
  listFilenames: () => string[];
  readFile: (filename: string) => string;
}

const frontmatterSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  readingTime: z.coerce.number().int().positive(),
  tags: z.array(z.string().min(1)).min(1),
  title: z.string().min(1),
});

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u;

/** Slug from `protein-for-hypertrophy.md` → `protein-for-hypertrophy`. */
export function slugFromFilename(filename: string): string {
  const match = filename.match(/^(.+)\.md$/u);
  if (!match) {
    throw new Error(
      `Expected markdown filename "*.md", received "${filename}"`
    );
  }
  return match[1]!;
}

/**
 * Parses blog frontmatter YAML into typed fields.
 * Supports quoted strings, numeric readingTime, and JSON tag arrays.
 */
export function parseFrontmatter(rawYaml: string): BlogFrontmatter {
  const fields: Record<string, unknown> = {};

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();

    if (key === "tags") {
      fields.tags = JSON.parse(rawValue) as unknown;
      continue;
    }

    if (key === "readingTime") {
      fields.readingTime = Number(rawValue);
      continue;
    }

    fields[key] = rawValue.replaceAll(/^["']|["']$/gu, "");
  }

  const parsed = frontmatterSchema.safeParse(fields);
  if (!parsed.success) {
    throw new Error(
      `Invalid blog frontmatter: ${parsed.error.message}; received ${JSON.stringify(fields)}`
    );
  }

  return parsed.data;
}

/** Splits a markdown file into frontmatter and body content. */
export function parseBlogPostFile(slug: string, raw: string): BlogPost {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    throw new Error(
      `Blog post "${slug}" must start with YAML frontmatter delimited by ---`
    );
  }

  const frontmatter = parseFrontmatter(match[1]!);
  const content = match[2]!.trim();

  return {
    slug,
    ...frontmatter,
    content,
  };
}

/** Newest posts first (ISO date descending). */
export function sortPostsByDate(
  posts: readonly BlogPostSummary[]
): BlogPostSummary[] {
  return [...posts].sort((left, right) => right.date.localeCompare(left.date));
}

/** Returns all posts when tag is undefined; otherwise matches the tag. */
export function filterPostsByTag(
  posts: readonly BlogPostSummary[],
  tag: string | undefined
): BlogPostSummary[] {
  if (!tag) {
    return [...posts];
  }
  return posts.filter((post) => post.tags.includes(tag));
}

/** Unique tags across all posts, sorted alphabetically. */
export function collectAllTags(posts: readonly BlogPostSummary[]): string[] {
  const tags = new Set<string>();
  for (const post of posts) {
    for (const tag of post.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
}

/**
 * Related articles share at least one tag with the current post.
 * Excludes the current slug and limits results for the post footer.
 */
export function findRelatedPosts(
  posts: readonly BlogPostSummary[],
  currentSlug: string,
  limit = 3
): BlogPostSummary[] {
  const current = posts.find((post) => post.slug === currentSlug);
  if (!current) {
    return [];
  }

  const currentTags = new Set(current.tags);

  return sortPostsByDate(
    posts.filter(
      (post) =>
        post.slug !== currentSlug &&
        post.tags.some((tag) => currentTags.has(tag))
    )
  ).slice(0, limit);
}

/** Human-readable date for blog cards and post headers. */
export function formatBlogDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
