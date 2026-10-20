import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '@shulcrm/shared';

// ---------------------------------------------------------------------------
// Who is making the current request, available anywhere in the request's work
// (the repo stamps createdBy with it; the audit log records it) without
// passing it through every function.
// ---------------------------------------------------------------------------

interface RequestContext {
  user?: User;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithUser<T>(user: User | undefined, work: () => T): T {
  return storage.run({ user }, work);
}

export const currentUser = (): User | undefined => storage.getStore()?.user;
