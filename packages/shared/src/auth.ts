// ---------------------------------------------------------------------------
// Users, roles and permissions. One map, used by the API (which enforces it)
// and the web app (which hides what a user can't do).
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { orgSlugSchema } from './organizations.ts';

export const ROLES = ['host', 'owner', 'admin', 'staff', 'viewer', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  host: 'Host (platform)',
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'Viewer',
  member: 'Member (portal only)',
};

export const ROLE_HELP: Record<Role, string> = {
  host: 'Create new shuls on this server. No access to a shul\'s records.',
  owner: 'Everything, including users, backups and resetting the data.',
  admin: 'Everything except managing owners and resetting the data.',
  staff: 'Add and change records, send email. No settings or users.',
  viewer: 'See everything, change nothing.',
  member: 'Their own family only, through the member portal.',
};

export const PERMISSIONS = [
  'records.read',
  'records.write',
  'email.send',
  'settings.write',
  'data.import',
  'backups',
  'users.manage',
  'audit.read',
  'data.reset',
  'portal',
  'organizations.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF_TOOLS: Permission[] = ['records.read', 'records.write', 'email.send'];
const ADMIN_TOOLS: Permission[] = [...STAFF_TOOLS, 'settings.write', 'data.import', 'backups', 'users.manage', 'audit.read'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  host: ['organizations.manage'],
  owner: [...ADMIN_TOOLS, 'data.reset'],
  admin: ADMIN_TOOLS,
  staff: STAFF_TOOLS,
  viewer: ['records.read'],
  member: ['portal'],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return role !== undefined && ROLE_PERMISSIONS[role].includes(permission);
}

/** Who may give or change which role: only an owner can make (or change) an owner. */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (target === 'host') return actor === 'host';
  if (!can(actor, 'users.manage')) return false;
  return target !== 'owner' || actor === 'owner';
}

export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: string;
  /** Which shul this account belongs to (logical multi-tenant). */
  orgId: string;
  email: string;
  name: string;
  role: Role;
  /** For a portal (member) user: their member record. */
  memberId?: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Session {
  user: User | null;
  /** No users exist yet: the first person to set up becomes the owner. */
  needsSetup: boolean;
  /** Setup from another computer needs the code shown in the server's log. */
  setupNeedsCode: boolean;
}

/** At least 10 characters; long passphrases are encouraged over symbols. */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That is too long')
  .refine((p) => !/^(.)\1+$/.test(p), 'Use more than one character');

export const loginSchema = z.object({
  email: z.string().trim().email('Enter your email address'),
  password: z.string().min(1, 'Enter your password'),
  /** Which shul, when the same email exists in more than one. */
  orgSlug: orgSlugSchema.optional(),
});

export const setupSchema = z.object({
  name: z.string().trim().min(1, 'Your name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  password: passwordSchema,
  code: z.string().optional(),
});

export const inviteSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(ROLES),
  memberId: z.string().optional(),
});

export const acceptInviteSchema = z.object({ password: passwordSchema });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});

export interface AuditEntry {
  id: string;
  at: string;
  userId?: string;
  userName?: string;
  action: string;
  entity?: string;
  entityId?: string;
  summary?: string;
  /** Field -> [before, after] for updates; the record for creates/deletes. */
  changes?: Record<string, unknown>;
}
