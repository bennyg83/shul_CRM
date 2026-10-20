import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AuditEntry } from '@shulcrm/shared';
import { getAuditLog } from '@/features/core/service';
import { useSettings } from './useSettings';

const PAGE = 50;

const ACTION_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Changed',
  delete: 'Deleted',
  login: 'Signed in',
  'login.failed': 'Failed sign-in',
  logout: 'Signed out',
  setup: 'Set up the shul',
  'user.invited': 'Invited a user',
  'user.changed': 'Changed a user',
  'user.reinvited': 'Made a new invite link',
  'user.reset-link': 'Made a password-reset link',
  'password.set': 'Set a password',
  'password.changed': 'Changed a password',
  'settings.org': 'Changed the organisation profile',
  'settings.features': 'Changed which modules are on',
  'settings.terms': 'Changed the wording',
  'settings.list': 'Changed a list',
  'settings.logo': 'Changed the logo',
  'settings.email': 'Changed the email settings',
  'settings.templates': 'Changed the email templates',
  'email.sent': 'Sent email',
  rsvp: 'Saved an RSVP',
  'backup.made': 'Made a backup',
  'backup.deleted': 'Deleted a backup',
  import: 'Imported records',
  'data.reset': 'Reset the data',
  // A family changing its own details through the member portal.
  'portal.create': 'Added (member portal)',
  'portal.update': 'Changed (member portal)',
  'portal.delete': 'Deleted (member portal)',
  'sponsorship.claimed': 'Took on a sponsorship',
  'sponsorship.released': 'Gave back a sponsorship',
  undo: 'Put a change back',
};

/** Entities worth offering in the filter, whether or not this page has loaded one yet. */
const ENTITIES = [
  'families',
  'members',
  'pledges',
  'donations',
  'importantDates',
  'notes',
  'events',
  'sponsorships',
  'users',
] as const;

const FIXED_ENTITY_WORD: Record<string, string> = {
  importantDates: 'important date',
  notes: 'note',
  events: 'event',
  sponsorships: 'sponsorship',
  users: 'user',
  dateTypes: 'date type',
  funds: 'fund',
  paymentMethods: 'payment method',
  currencies: 'currency',
  memberRoles: 'member role',
  noteTypes: 'note type',
};

/** "firstName" -> "First name", so a changed field reads like English. */
const fieldName = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

const isPair = (value: unknown): value is [unknown, unknown] =>
  Array.isArray(value) && value.length === 2;

const show = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function Changes({ changes }: { changes: Record<string, unknown> }) {
  const values = Object.values(changes);
  // An update stores [before, after] per field; a create or delete stores the whole record.
  const asDiff = values.length > 0 && values.every(isPair);
  return (
    <Stack spacing={0.5} sx={{ py: 1, pl: 2 }}>
      {Object.entries(changes).map(([key, value]) => (
        <Typography key={key} variant="body2" color="text.secondary">
          {asDiff && isPair(value)
            ? `${fieldName(key)}: ${show(value[0])} → ${show(value[1])}`
            : `${fieldName(key)}: ${show(value)}`}
        </Typography>
      ))}
    </Stack>
  );
}

export function AuditLog() {
  const { t } = useSettings();
  const [entity, setEntity] = useState('');
  const [extra, setExtra] = useState<AuditEntry[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const first = useQuery({
    queryKey: ['audit', entity],
    queryFn: () => getAuditLog({ entity: entity || undefined, limit: PAGE }),
  });
  const entries = useMemo(() => [...(first.data ?? []), ...extra], [first.data, extra]);

  const loadMore = useMutation({
    mutationFn: (before: string) =>
      getAuditLog({ entity: entity || undefined, before, limit: PAGE }),
    onSuccess: (page) => setExtra((rows) => [...rows, ...page]),
  });

  const lastPage = loadMore.data ?? first.data;
  const hasMore = lastPage !== undefined && lastPage.length === PAGE;
  const oldest = entries[entries.length - 1];

  const entityWord = (name?: string) => {
    if (!name) return '';
    if (name === 'families') return t('family').toLowerCase();
    if (name === 'members') return t('member').toLowerCase();
    if (name === 'pledges') return t('pledge').toLowerCase();
    if (name === 'donations') return t('donation').toLowerCase();
    return FIXED_ENTITY_WORD[name] ?? name;
  };

  const problem = (first.error ?? loadMore.error) as Error | undefined;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          History
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Who changed what, newest first. Open a row to see the fields that changed.
        </Typography>

        <TextField
          select
          size="small"
          label="Show"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            // A new filter means a new first page: drop the pages loaded for the old one.
            setExtra([]);
            setOpen(null);
            loadMore.reset();
          }}
          sx={{ mb: 2, minWidth: 220 }}
        >
          <MenuItem value="">Everything</MenuItem>
          {ENTITIES.map((name) => (
            <MenuItem key={name} value={name}>
              {entityWord(name)}
            </MenuItem>
          ))}
        </TextField>

        {problem && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {problem.message}
          </Alert>
        )}

        {first.data && entries.length === 0 && (
          <Typography color="text.secondary">Nothing recorded yet.</Typography>
        )}

        {entries.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>When</TableCell>
                  <TableCell>Who</TableCell>
                  <TableCell>What happened</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e) => {
                  const expandable = e.changes !== undefined;
                  const expanded = open === e.id;
                  const what = [entityWord(e.entity), e.summary].filter(Boolean).join(' — ');
                  return [
                    <TableRow key={e.id}>
                      <TableCell sx={{ width: 40 }}>
                        {expandable && (
                          <IconButton
                            size="small"
                            aria-label={expanded ? 'Hide the changes' : 'Show the changes'}
                            onClick={() => setOpen(expanded ? null : e.id)}
                          >
                            {expanded ? (
                              <KeyboardArrowDownIcon fontSize="small" />
                            ) : (
                              <KeyboardArrowRightIcon fontSize="small" />
                            )}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(e.at).toLocaleString()}
                      </TableCell>
                      <TableCell>{e.userName ?? '—'}</TableCell>
                      <TableCell>{ACTION_LABEL[e.action] ?? e.action}</TableCell>
                      <TableCell>{what || '—'}</TableCell>
                    </TableRow>,
                    expandable && (
                      <TableRow key={`${e.id}-changes`}>
                        <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
                          <Collapse in={expanded} unmountOnExit>
                            <Changes changes={e.changes ?? {}} />
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          </Box>
        )}

        {hasMore && oldest && (
          <Stack direction="row" sx={{ mt: 2 }}>
            <Button
              variant="text"
              disabled={loadMore.isPending}
              onClick={() => loadMore.mutate(oldest.at)}
            >
              Show more
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
