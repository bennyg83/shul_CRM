import { useQuery } from '@tanstack/react-query';
import { ApiError, getPublicBranding } from '@/features/core/service';

export const BRANDING_KEY = ['public-branding'] as const;

/** The shul's name, color and logo. A public endpoint, so it also works before anyone signs in. */
export function useBranding(orgSlug?: string) {
  return useQuery({
    queryKey: [...BRANDING_KEY, orgSlug ?? 'default'],
    queryFn: () => getPublicBranding(orgSlug),
    staleTime: Infinity,
    retry: false,
  });
}

/** An ApiError carries the server's own wording, which is friendlier than a generic message. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
