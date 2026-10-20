import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditEntry } from '@shulcrm/shared';
import { getAuditLog, undoChange } from '@/features/core/service';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { invalidateRelated } from '@/features/core/queryKeys';
import { useSettings } from './useSettings';

const PAGE = 50;

/** Only three actions reach this list; the API filters the rest out. */

const FIXED_ENTITY_WORD: Record<string, string> = {
  importantDates: 'important date',
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

/** "the phone number", "the phone number and the email" — for the confirmation. */
const andList = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? 'details')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** Mirrors the audit history's rendering: [before, after] per field for an edit, else the record. */
function Changes({ changes }: { changes: Record<string, unknown> }) {
  const values = Object.values(changes);
  const asDiff = values.length > 0 && values.every(isPair);
  return (
    <Stack spacing={0.5}>
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

export function MemberChanges() {
  const queryClient = useQueryClient();
  const { t } = useSettings();
  const [extra, setExtra] = useState<AuditEntry[]>([]);
  const [pendingUndo, setPendingUndo] = useState<AuditEntry | null>(null);

  const first = useQuery({
    queryKey: ['audit', 'portal'],
    queryFn: () => getAuditLog({ source: 'portal', limit: PAGE }),
  });
  const entries = useMemo(() => [...(first.data ?? []), ...extra], [first.data, extra]);

  const loadMore = useMutation({
    mutationFn: (before: string) => getAuditLog({ source: 'portal', before, limit: PAGE }),
    onSuccess: (page) => setExtra((rows) => [...rows, ...page]),
  });

  const undo = useMutation({
    mutationFn: (entry: AuditEntry) => undoChange(entry.id),
    onSuccess: (_result, entry) => {
      // The pages showing the record have to refetch, and so does this list: putting a
      // change back is itself recorded, and the pages we have loaded are now out of date.
      invalidateRelated(
        queryClient,
        entry.entity === 'families' ? entry.entityId : undefined,
        entry.entity === 'members' ? entry.entityId : undefined,
      );
      setExtra([]);
      loadMore.reset();
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  const lastPage = loadMore.data ?? first.data;
  const hasMore = lastPage !== undefined && lastPage.length === PAGE;
  const oldest = entries[entries.length - 1];

  const entityWord = (name?: string) => {
    if (!name) return 'record';
    if (name === 'families') return t('family').toLowerCase();
    if (name === 'members') return t('member').toLowerCase();
    return FIXED_ENTITY_WORD[name] ?? name;
  };

  const whatHappened = (e: AuditEntry) => {
    const word = entityWord(e.entity);
    const a = /^[aeiou]/.test(word) ? 'an' : 'a';
    if (e.action === 'portal.create') return `Added ${a} ${word}`;
    if (e.action === 'portal.delete') return `Removed ${a} ${word}`;
    const fields = Object.keys(e.changes ?? {}).map((k) => fieldName(k).toLowerCase());
    return fields.length > 0 ? `Changed the ${andList(fields)}` : `Changed their ${word} details`;
  };

  /** Says what putting this one back will do, in the same words as the row. */
  const undoMessage = (e: AuditEntry) => {
    const word = entityWord(e.entity);
    if (e.action === 'portal.create') {
      return `The ${word} they added will be removed again. If it has since been deleted, nothing changes.`;
    }
    if (e.action === 'portal.delete') {
      return `The ${word} they removed will be put back. If it is already back, nothing changes.`;
    }
    const fields = Object.keys(e.changes ?? {}).map((k) => fieldName(k).toLowerCase());
    return `Their change to ${andList(fields.map((f) => `the ${f}`))} will be reverted. If the ${word} has since been deleted, nothing changes.`;
  };

  const problem = (first.error ?? loadMore.error ?? undo.error) as Error | undefined;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t('member')} changes
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          What families have changed about themselves in the portal, newest first. These changes are
          already saved — this list is here so you can spot a mistake and put it back, not to
          approve anything.
        </Typography>

        {problem && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {problem.message}
          </Alert>
        )}

        {first.data && entries.length === 0 && (
          <Typography color="text.secondary">No families have changed anything yet.</Typography>
        )}

        {entries.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Who</TableCell>
                  <TableCell>What changed</TableCell>
                  <TableCell>Details</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(e.at).toLocaleString()}
                    </TableCell>
                    <TableCell>{e.userName ?? '—'}</TableCell>
                    <TableCell>
                      {whatHappened(e)}
                      {e.summary && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {e.summary}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{e.changes ? <Changes changes={e.changes} /> : '—'}</TableCell>
                    <TableCell align="right">
                      <Button
                        variant="text"
                        size="small"
                        disabled={undo.isPending}
                        aria-label={`Put back: ${whatHappened(e).toLowerCase()}${
                          e.userName ? ` by ${e.userName}` : ''
                        }`}
                        onClick={() => setPendingUndo(e)}
                      >
                        Put this back
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
      <ConfirmDialog
        open={pendingUndo !== null}
        title="Put this change back"
        message={pendingUndo ? undoMessage(pendingUndo) : undefined}
        confirmLabel="Put it back"
        onConfirm={() => {
          if (pendingUndo) undo.mutate(pendingUndo);
          setPendingUndo(null);
        }}
        onClose={() => setPendingUndo(null)}
      />
    </Card>
  );
}
