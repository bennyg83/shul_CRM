import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { can, type Permission } from '@shulcrm/shared';
import { SIGNED_OUT_EVENT, getSession } from '@/features/core/service';

export const SESSION_KEY = ['session'] as const;

/** The signed-in user (or none), and what they may do. */
export function useAuth() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: getSession,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // A 401 anywhere means the session ended: check again (which shows the sign-in page).
  useEffect(() => {
    const onSignedOut = () => void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [queryClient]);

  const user = query.data?.user ?? null;
  return {
    ...query,
    user,
    needsSetup: query.data?.needsSetup ?? false,
    setupNeedsCode: query.data?.setupNeedsCode ?? false,
    can: (permission: Permission) => can(user?.role, permission),
  };
}

/** Just the permission check, for hiding buttons. */
export function useCan() {
  return useAuth().can;
}
