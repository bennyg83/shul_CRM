import { z } from 'zod';

/** URL-safe shul identifier (subdomain or login picker). */
export const orgSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Use at least 2 characters')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  slug: orgSlugSchema,
  owner: z
    .object({
      name: z.string().trim().min(1),
      email: z.string().trim().email(),
      password: z.string().min(10).max(200),
    })
    .optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

/** Shown when the same email exists in more than one shul. */
export interface LoginOrganization {
  slug: string;
  name: string;
}

export function slugifyOrganizationName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base.length >= 2 ? base : 'shul';
}
