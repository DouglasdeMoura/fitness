import { z } from "zod";

/** Parsed YAML frontmatter for a blog post (PRD 08 Part 2). */
export const blogFrontmatterSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  readingTime: z.coerce.number().int().positive(),
  tags: z.array(z.string().min(1)).min(1),
  title: z.string().min(1),
});

export type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;
