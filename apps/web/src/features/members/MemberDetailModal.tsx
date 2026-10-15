import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
  Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImportantDate, Note } from '@pilzno/shared';
import { formatHebrew } from '@/features/core/hebrewDate';
import {
  deleteImportantDate,
  deleteMember,
  deleteNote,
  getMemberDetail,
} from '@/features/core/service';
import { invalidateRelated, qk } from '@/features/core/queryKeys';
import { ImportantDateFormDialog, MemberFormDialog, NoteFormDialog } from '@/features/core/forms';
import { Field } from '@/features/core/Field';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const DATE_LABELS: Record<ImportantDate['type'], string> = {
  birthday: 'Birthday',
  yahrzeit: 'Yahrzeit (Memorial)',
  bar_mitzvah: 'Bar Mitzvah',
  bat_mitzvah: 'Bat Mitzvah',
  anniversary: 'Anniversary',
  "seuda_hoda'a": 'Seuda Hoda\'a (Thanksgiving Meal)',
} as const;

interface Props {
  memberId: string;
  open: boolean;
  onClose: () => void;
}

export function MemberDetailModal({ memberId, open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);

  const { data: detail, isLoading, isError, error } = useQuery({
    queryKey: qk.memberDetail(memberId),
    queryFn: () => getMemberDetail(memberId),
    enabled: open,
  });

  const [memberDialog, setMemberDialog] = useState(false);
  const [dateDialog, setDateDialog] = useState<{ open: boolean; initial?: ImportantDate }>({ open: false });
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; initial?: Note }>({ open: false });
  const [pendingDelete, setPendingDelete] = useState<{ fn: () => Promise<unknown>; label: string } | null>(null);

  const member = detail?.member;

  const onSaved = () => {
    invalidateRelated(queryClient, member?.familyId, memberId);
  };

  const confirmDelete = (fn: () => Promise<unknown>, label: string) => {
    setPendingDelete({ fn, label });
  };

  const deleteMemberMutation = useMutation({
    mutationFn: () => deleteMember(memberId),
    onSettled: () => {
      invalidateRelated(queryClient, member?.familyId, memberId);
      onClose();
    },
  });

  const dates = detail?.importantDates ?? [];
  const notes = detail?.notes ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {member ? `${member.firstName} ${member.lastName}` : 'Member'}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        )}

        {isError && (
          <Alert severity="error" sx={{ my: 2 }}>
            {(error as Error).message}
          </Alert>
        )}

        {detail && (
          <>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Details" />
              <Tab label={`Dates (${dates.length})`} />
              <Tab label={`Notes (${notes.length})`} />
            </Tabs>

            {tab === 0 && (
              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                      <Field label="First name" value={member!.firstName} />
                      <Field label="Last name" value={member!.lastName} />
                      <Field label="Gender" value={member!.gender} />
                      <Field label="Role" value={member!.role} />
                    </Stack>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                      <Field label="Hebrew name" value={member!.hebrewName} />
                      <Field label="Father (בן)" value={member!.fatherHebrewName} />
                      <Field label="Mother (בת)" value={member!.motherHebrewName} />
                    </Stack>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                      <Field label="Birth date" value={member!.birthDate} />
                      <Field label="Death date" value={member!.deathDate} />
                      <Field label="Status" value={member!.status} />
                    </Stack>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                      <Field label="Email" value={member!.email} />
                      <Field label="Phone" value={member!.phone} />
                      <Field label="WhatsApp" value={member!.whatsapp} />
                      <Field label="Occupation" value={member!.occupation} />
                    </Stack>
                    <Field label="Family" value={detail.family?.name} />
                  </Stack>
                </Paper>
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setMemberDialog(true)}>
                    Edit member
                  </Button>
                </Stack>
              </Stack>
            )}

            {tab === 1 && (
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setDateDialog({ open: true })}
                  >
                    Add date
                  </Button>
                </Stack>
                {dates.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    No important dates yet.
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Type</TableCell>
                          <TableCell>Date</TableCell>
                          <TableCell>Hebrew</TableCell>
                          <TableCell>Repeats</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dates.map((d) => (
                          <TableRow key={d.id} hover>
                            <TableCell>{DATE_LABELS[d.type]}</TableCell>
                            <TableCell>{d.date}</TableCell>
                            <TableCell>{d.hebrewDay && d.hebrewMonth && d.hebrewYear ? formatHebrew(d.hebrewDay, d.hebrewMonth, d.hebrewYear) : '—'}</TableCell>
                            <TableCell>{d.recurring ? 'Yes' : '—'}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                aria-label="Edit date"
                                onClick={() => setDateDialog({ open: true, initial: d })}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="Delete date"
                                onClick={() => confirmDelete(() => deleteImportantDate(d.id), 'date')}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>
            )}

            {tab === 2 && (
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNoteDialog({ open: true })}>
                    Add note
                  </Button>
                </Stack>
                {notes.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    No notes yet.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {notes.map((n) => (
                      <Paper key={n.id} variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
                            {n.type ?? 'note'}
                            {n.priority ? ` · ${n.priority} priority` : ''}
                          </Typography>
                          <Stack direction="row">
                            <IconButton size="small" aria-label="Edit note" onClick={() => setNoteDialog({ open: true, initial: n })}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              aria-label="Delete note"
                              onClick={() => confirmDelete(() => deleteNote(n.id), 'note')}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Stack>
                        {n.subject && <Typography variant="body2" color="text.secondary">{n.subject}</Typography>}
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {n.body}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Stack>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {member && (
          <Button color="error" onClick={() => deleteMemberMutation.mutate()}>
            Delete member
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      <MemberFormDialog
        open={memberDialog}
        onClose={() => setMemberDialog(false)}
        onSaved={onSaved}
        initial={member}
        fixedFamilyId={member?.familyId}
      />
      <ImportantDateFormDialog
        open={dateDialog.open}
        onClose={() => setDateDialog({ open: false })}
        onSaved={onSaved}
        initial={dateDialog.initial}
        fixedMemberId={memberId}
      />
      <NoteFormDialog
        open={noteDialog.open}
        onClose={() => setNoteDialog({ open: false })}
        onSaved={onSaved}
        initial={noteDialog.initial}
        fixedMemberId={memberId}
        fixedFamilyId={member?.familyId}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.label ?? ''}`}
        message="This cannot be undone."
        onConfirm={() => {
          const action = pendingDelete;
          setPendingDelete(null);
          if (action) void action.fn().then(onSaved);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </Dialog>
  );
}
