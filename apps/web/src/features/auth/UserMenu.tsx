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
import { useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL } from '@shulcrm/shared';
import { logout } from '@/features/core/service';
import { SESSION_KEY, useAuth } from '@/features/auth/useAuth';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { initials } from '@/app/initials';

export function UserMenu() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [changing, setChanging] = useState(false);

  if (!user) return null;

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
