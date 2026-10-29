import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '@shulcrm/shared';

// ---------------------------------------------------------------------------
// Who is making the current request, available anywhere in the request's work
// (the repo stamps createdBy with it; the audit log records it) without
// passing it through every function.
// ---------------------------------------------------------------------------

interface RequestContext {
  user?: User;
  /** When set, tenant reads/writes use this org instead of the signed-in user's (host provisioning). */
  orgOverride?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithUser<T>(user: User | undefined, work: () => T): T {
  const prev = storage.getStore();
  return storage.run({ user, orgOverride: prev?.orgOverride }, work);
}

/** Run work as a specific organization (host creates a shul, startup seeds each org, …). */
export function runWithOrg<T>(orgId: string, work: () => T): T {
  const prev = storage.getStore();
  return storage.run({ user: prev?.user, orgOverride: orgId }, work);
}

export const currentUser = (): User | undefined => storage.getStore()?.user;
export const currentOrgOverride = (): string | undefined => storage.getStore()?.orgOverride;
