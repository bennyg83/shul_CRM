import { useState } from 'react';
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL } from '@shulcrm/shared';
import { getAuthMemberships, logout, switchOrganization } from '@/features/core/service';
import { SESSION_KEY, useAuth } from '@/features/auth/useAuth';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { initials } from '@/app/initials';

export function UserMenu() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [changing, setChanging] = useState(false);
  const { data: membershipInfo } = useQuery({
    queryKey: ['auth', 'memberships'],
    queryFn: getAuthMemberships,
    enabled: Boolean(user),
  });
  const switchable =
    membershipInfo && membershipInfo.organizations.length > 1 ? membershipInfo : undefined;

  if (!user) return null;

  const pickOrg = async (orgSlug: string) => {
    setAnchor(null);
    await switchOrganization(orgSlug);
    await queryClient.invalidateQueries();
  };

  const signOut = async () => {
    setAnchor(null);
    // Even a failed logout should send the app back to the sign-in page, so ignore the error.
    try {
      await logout();
    } finally {
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    }
  };

  return (
    <>
      <Tooltip title="Your account">
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label={`Your account: ${user.name}`}
          aria-haspopup="true"
          size="small"
        >
          <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'primary.main' }}>
            {initials(user.name)}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1, maxWidth: 260 }}>
          <Typography variant="subtitle2" noWrap>
            {user.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {user.email}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {ROLE_LABEL[user.role]}
          </Typography>
        </Box>
        {switchable ? (
          <>
            <Divider />
            <Typography variant="caption" sx={{ px: 2, pt: 1, display: 'block', color: 'text.secondary' }}>
              Switch community
            </Typography>
            {switchable.organizations.map((org) => (
              <MenuItem
                key={org.slug}
                disabled={org.slug === switchable.currentSlug}
                onClick={() => void pickOrg(org.slug)}
              >
                {org.name}
                {org.slug === switchable.currentSlug ? ' (current)' : ''}
              </MenuItem>
            ))}
          </>
        ) : null}
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setChanging(true);
          }}
        >
          Change password…
        </MenuItem>
        <MenuItem onClick={() => void signOut()}>Sign out</MenuItem>
      </Menu>
      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
    </>
  );
}
