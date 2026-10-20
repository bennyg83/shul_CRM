import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LinkIcon from '@mui/icons-material/Link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROLES,
  ROLE_HELP,
  ROLE_LABEL,
  canAssignRole,
  type Role,
  type User,
  type UserStatus,
} from '@shulcrm/shared';
import {
  inviteUser,
  listMembers,
  listUsers,
  newUserLink,
  updateUser,
} from '@/features/core/service';
import { qk } from '@/features/core/queryKeys';
import { useAuth } from '@/features/auth/useAuth';
import { useSettings } from '@/features/settings/useSettings';

const USERS_KEY = ['users'] as const;

const STATUS_CHIP: Record<UserStatus, { label: string; color: 'warning' | 'success' | 'default' }> =
  {
    invited: { label: 'Invited', color: 'warning' },
    active: { label: 'Active', color: 'success' },
    disabled: { label: 'Disabled', color: 'default' },
  };

/** A one-time sign-in link, with the wording its purpose calls for. */
function LinkPanel({ link, purpose }: { link: string; purpose: 'invite' | 'reset' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(link).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        {purpose === 'invite'
          ? 'Send them this invite link so they can choose a password.'
          : 'Send them this password-reset link so they can choose a new password.'}
      </Typography>
      <TextField
        fullWidth
        multiline
        value={link}
        label={purpose === 'invite' ? 'Invite link' : 'Password-reset link'}
        inputProps={{ readOnly: true, 'aria-label': 'Sign-in link' }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Button size="small" onClick={copy}>
                Copy link
              </Button>
            </InputAdornment>
          ),
        }}
      />
      {copied && <Alert severity="success">Copied.</Alert>}
      <Alert severity="info">
        Email may not be set up yet, so nothing was sent. Copy the link and pass it on yourself — it
        is shown here once only.
      </Alert>
    </Stack>
  );
}

function InviteDialog({
  open,
  onClose,
  myRole,
}: {
  open: boolean;
  onClose: () => void;
  myRole: Role;
}) {
  const queryClient = useQueryClient();
  const { t } = useSettings();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [memberId, setMemberId] = useState('');

  const { data: members } = useQuery({
    queryKey: qk.members,
    queryFn: listMembers,
    enabled: open && role === 'member',
  });

  const invite = useMutation({
    mutationFn: () =>
      inviteUser({
        name: name.trim(),
        email: email.trim(),
        role,
        memberId: role === 'member' ? memberId : undefined,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const close = () => {
    onClose();
    // Clear the form (and the one-time link) only after closing, so nothing flashes on screen.
    setName('');
    setEmail('');
    setRole('staff');
    setMemberId('');
    invite.reset();
  };

  const ready = name.trim() !== '' && email.trim() !== '' && (role !== 'member' || memberId !== '');

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{invite.data ? 'Invitation ready' : 'Invite someone'}</DialogTitle>
      <DialogContent>
        {invite.data ? (
          <LinkPanel link={invite.data.link} purpose="invite" />
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              required
            />
            <TextField
              select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              fullWidth
              SelectProps={{ renderValue: (v) => ROLE_LABEL[v as Role] }}
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r} disabled={!canAssignRole(myRole, r)}>
                  <ListItemText primary={ROLE_LABEL[r]} secondary={ROLE_HELP[r]} />
                </MenuItem>
              ))}
            </TextField>
            {role === 'member' && (
              <TextField
                select
                label={t('member')}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                fullWidth
                required
                helperText={`A portal login belongs to one ${t('member').toLowerCase()}.`}
              >
                {(members ?? []).map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {`${m.firstName} ${m.lastName}`}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {invite.isError && <Alert severity="error">{(invite.error as Error).message}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close}>{invite.data ? 'Done' : 'Cancel'}</Button>
        {!invite.data && (
          <Button
            variant="contained"
            disabled={!ready || invite.isPending}
            onClick={() => invite.mutate()}
          >
            Send invitation
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const me = useAuth().user;
  const myRole: Role = me?.role ?? 'viewer';
  const [inviting, setInviting] = useState(false);
  const [madeLink, setMadeLink] = useState<{
    name: string;
    link: string;
    purpose: 'invite' | 'reset';
  } | null>(null);

  const { data, error } = useQuery({ queryKey: USERS_KEY, queryFn: listUsers });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: USERS_KEY });

  const save = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { role?: Role; status?: 'active' | 'disabled' };
    }) => updateUser(id, patch),
    onSuccess: refresh,
  });
  const makeLink = useMutation({
    mutationFn: (user: User) => newUserLink(user.id),
    onSuccess: (res) => {
      setMadeLink({ name: res.user.name, link: res.link, purpose: res.purpose });
      refresh();
    },
  });

  const problem = (error ?? save.error ?? makeLink.error) as Error | undefined;

  return (
    <Box>
      <Typography variant="h5">Users</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Who can sign in, and how much they can do. An owner can do everything, including managing
        users and resetting the data; an admin can do everything except manage owners; staff add and
        change records; a viewer only looks; a member sees their own family through the portal.
      </Typography>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button startIcon={<PersonAddIcon />} onClick={() => setInviting(true)}>
              Invite someone
            </Button>
          </Stack>

          {problem && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {problem.message}
            </Alert>
          )}

          {data && data.length === 0 && (
            <Typography color="text.secondary">Nobody has been invited yet.</Typography>
          )}

          {data && data.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last signed in</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((u) => {
                    const chip = STATUS_CHIP[u.status];
                    const isMe = u.id === me?.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>{u.name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            value={u.role}
                            disabled={!canAssignRole(myRole, u.role) || save.isPending}
                            onChange={(e) =>
                              save.mutate({ id: u.id, patch: { role: e.target.value as Role } })
                            }
                            inputProps={{ 'aria-label': `Role for ${u.name}` }}
                          >
                            {ROLES.map((r) => (
                              <MenuItem key={r} value={r} disabled={!canAssignRole(myRole, r)}>
                                {ROLE_LABEL[r]}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={chip.label} color={chip.color} />
                        </TableCell>
                        <TableCell>
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<LinkIcon />}
                              disabled={makeLink.isPending}
                              onClick={() => makeLink.mutate(u)}
                            >
                              New link
                            </Button>
                            {!isMe && (
                              <Button
                                size="small"
                                variant="text"
                                disabled={save.isPending}
                                onClick={() =>
                                  save.mutate({
                                    id: u.id,
                                    patch: {
                                      status: u.status === 'disabled' ? 'active' : 'disabled',
                                    },
                                  })
                                }
                              >
                                {u.status === 'disabled' ? 'Enable' : 'Disable'}
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} myRole={myRole} />

      <Dialog open={madeLink !== null} onClose={() => setMadeLink(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {madeLink?.purpose === 'invite' ? 'Invite link' : 'Password-reset link'} for{' '}
          {madeLink?.name}
        </DialogTitle>
        <DialogContent>
          {madeLink && <LinkPanel link={madeLink.link} purpose={madeLink.purpose} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setMadeLink(null)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
