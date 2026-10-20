import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Donation, ImportantDate, Member, Note, Pledge } from '@shulcrm/shared';
import { formatHebrew } from '@shulcrm/shared';
import {
  deleteDonation,
  deleteFamily,
  deleteImportantDate,
  deleteMember,
  deleteNote,
  deletePledge,
  getFamilyDetail,
} from '@/features/core/service';
import { invalidateRelated, qk } from '@/features/core/queryKeys';
import {
  DonationFormDialog,
  FamilyFormDialog,
  ImportantDateFormDialog,
  MemberFormDialog,
  NoteFormDialog,
  PledgeFormDialog,
} from '@/features/core/forms';
import { Field } from '@/features/core/Field';
import { MemberDetailModal } from '@/features/members/MemberDetailModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { effectiveRecurBy } from '@shulcrm/shared';
import { useSettings } from '@/features/settings/useSettings';

interface Props {
  familyId: string;
  open: boolean;
  onClose: () => void;
}

const PLEDGE_TYPE: Record<NonNullable<Pledge['type']>, string> = {
  annual: 'Annual',
  one_time: 'One-time',
};



export function FamilyDetailModal({ familyId, open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const settings = useSettings();
  const { t, money, label } = settings;

  const { data: detail, isLoading, isError, error } = useQuery({
    queryKey: qk.familyDetail(familyId),
    queryFn: () => getFamilyDetail(familyId),
    enabled: open,
  });

  // Nested member modal target
  const [memberModalId, setMemberModalId] = useState<string | null>(null);

  // Form dialog state
  const [familyDialog, setFamilyDialog] = useState(false);
  const [memberDialog, setMemberDialog] = useState<{ open: boolean; initial?: Member }>({ open: false });
  const [pledgeDialog, setPledgeDialog] = useState<{ open: boolean; initial?: Pledge }>({ open: false });
  const [donationDialog, setDonationDialog] = useState<{ open: boolean; initial?: Donation }>({ open: false });
  const [dateDialog, setDateDialog] = useState<{ open: boolean; initial?: ImportantDate }>({ open: false });
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; initial?: Note }>({ open: false });
  const [pendingDelete, setPendingDelete] = useState<{ fn: () => Promise<unknown>; label: string } | null>(null);

  const family = detail?.family;

  const onSaved = () => invalidateRelated(queryClient, familyId);
  const confirmDelete = (fn: () => Promise<unknown>, label: string) => {
    setPendingDelete({ fn, label });
  };

  const deleteFamilyMutation = useMutation({
    mutationFn: () => deleteFamily(familyId),
    onSettled: () => {
      invalidateRelated(queryClient, familyId);
      onClose();
    },
  });

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of detail?.members ?? []) map.set(m.id, `${m.firstName} ${m.lastName}`);
    return map;
  }, [detail?.members]);

  const members = detail?.members ?? [];
  const pledges = detail?.pledges ?? [];
  const donations = detail?.donations ?? [];
  const dates = detail?.importantDates ?? [];
  const notes = detail?.notes ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{family ? family.name : t('family')}</DialogTitle>
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
              <Tab label="Overview" />
              <Tab label={`${t('members')} (${members.length})`} />
              {/* Hidden, not removed, when pledges are off: the tabs are addressed by index. */}
              <Tab label={`${t('pledges')} (${pledges.length})`} sx={settings.features.pledges ? undefined : { display: 'none' }} />
              <Tab label={`${t('donations')} (${donations.length})`} />
              <Tab label={`Dates (${dates.length})`} />
              <Tab label={`Notes (${notes.length})`} />
            </Tabs>

            {/* ------------------------------ Overview ------------------------------ */}
            {tab === 0 && (
              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                      <Field label="Family name" value={family!.name} />
                      <Field label="Family name (Hebrew)" value={family!.hebrewName} />
                      <Field label="Status" value={family!.status} />
                      <Field label="Phone" value={family!.phone} />
                      <Field label="WhatsApp" value={family!.whatsapp} />
                      <Field label="Email" value={family!.email} />
                    </Stack>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                      <Field label="Address" value={family!.address} />
                      <Field label="City" value={family!.city} />
                      <Field label="ZIP" value={family!.zip} />
                      <Field label="Country" value={family!.country} />
                    </Stack>
                    {family!.notes && (
                      <Stack>
                        <Typography variant="body2" color="text.secondary">
                          Notes
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {family!.notes}
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                </Paper>
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setFamilyDialog(true)}>
                    Edit family
                  </Button>
                </Stack>
              </Stack>
            )}

            {/* ------------------------------ Members ------------------------------ */}
            {tab === 1 && (
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setMemberDialog({ open: true })}>
                    {`Add ${t('member').toLowerCase()}`}
                  </Button>
                </Stack>
                {members.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    No members yet.
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>First name</TableCell>
                          <TableCell>Last name</TableCell>
                          <TableCell>Hebrew name</TableCell>
                          <TableCell>Role</TableCell>
                          <TableCell>Gender</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {members.map((m) => (
                          <TableRow key={m.id} hover sx={{ cursor: 'pointer' }} onClick={() => setMemberModalId(m.id)}>
                            <TableCell>{m.firstName}</TableCell>
                            <TableCell>{m.lastName}</TableCell>
                            <TableCell>{m.hebrewName ?? '—'}</TableCell>
                            <TableCell>{m.role ?? '—'}</TableCell>
                            <TableCell>{m.gender}</TableCell>
                            <TableCell>{m.status}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                aria-label="Edit member"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMemberDialog({ open: true, initial: m });
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="Delete member"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  confirmDelete(() => deleteMember(m.id), 'member');
                                }}
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

            {/* ------------------------------ Pledges ------------------------------ */}
            {tab === 2 && (
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPledgeDialog({ open: true })}>
                    {`Add ${t('pledge').toLowerCase()}`}
                  </Button>
                </Stack>
                {pledges.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    No pledges yet.
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Fund</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Year</TableCell>
                          <TableCell>Due</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pledges.map((p) => (
                          <TableRow key={p.id} hover>
                            <TableCell>{label('funds', p.fund)}</TableCell>
                            <TableCell>{p.type ? PLEDGE_TYPE[p.type] : '—'}</TableCell>
                            <TableCell>{p.year}</TableCell>
                            <TableCell>{p.dueDate ?? '—'}</TableCell>
                            <TableCell>{money(p.amount, p.currency)}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                aria-label="Edit pledge"
                                onClick={() => setPledgeDialog({ open: true, initial: p })}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="Delete pledge"
                                onClick={() => confirmDelete(() => deletePledge(p.id), 'pledge')}
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

            {/* ------------------------------ Donations ------------------------------ */}
            {tab === 3 && (
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setDonationDialog({ open: true })}
                  >
                    {`Add ${t('donation').toLowerCase()}`}
                  </Button>
                </Stack>
                {donations.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    No donations yet.
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Fund</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell>Note</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {donations.map((d) => (
                          <TableRow key={d.id} hover>
                            <TableCell>{d.date}</TableCell>
                            <TableCell>{label('funds', d.fund)}</TableCell>
                            <TableCell>{money(d.amount, d.currency)}</TableCell>
                            <TableCell>{label('paymentMethods', d.method)}</TableCell>
                            <TableCell>{d.note ?? '—'}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                aria-label="Edit donation"
                                onClick={() => setDonationDialog({ open: true, initial: d })}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="Delete donation"
                                onClick={() => confirmDelete(() => deleteDonation(d.id), 'donation')}
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

            {/* ------------------------------ Dates ------------------------------ */}
            {tab === 4 && (
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDateDialog({ open: true })}>
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
                          <TableCell>Member</TableCell>
                          <TableCell>Date</TableCell>
                          <TableCell>Hebrew</TableCell>
                          <TableCell>Repeats</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dates.map((d) => (
                          <TableRow key={d.id} hover>
                            <TableCell>{settings.dateType(d.type).label}</TableCell>
                            <TableCell>{memberNames.get(d.memberId) ?? d.memberId}</TableCell>
                            <TableCell>{d.date}</TableCell>
                            <TableCell>{d.hebrewDay && d.hebrewMonth && d.hebrewYear ? formatHebrew(d.hebrewDay, d.hebrewMonth, d.hebrewYear) : '—'}</TableCell>
                            <TableCell>{d.recurring ? (effectiveRecurBy(d, settings.recurrence) === 'hebrew' ? 'Hebrew date' : 'English date') : '—'}</TableCell>
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

            {/* ------------------------------ Notes ------------------------------ */}
            {tab === 5 && (
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
                            <IconButton
                              size="small"
                              aria-label="Edit note"
                              onClick={() => setNoteDialog({ open: true, initial: n })}
                            >
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
        {family && (
          <Button color="error" onClick={() => deleteFamilyMutation.mutate()}>
            Delete family
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Form dialogs */}
      <FamilyFormDialog open={familyDialog} onClose={() => setFamilyDialog(false)} onSaved={onSaved} initial={family} />
      <MemberFormDialog
        open={memberDialog.open}
        onClose={() => setMemberDialog({ open: false })}
        onSaved={onSaved}
        initial={memberDialog.initial}
        fixedFamilyId={familyId}
      />
      <PledgeFormDialog
        open={pledgeDialog.open}
        onClose={() => setPledgeDialog({ open: false })}
        onSaved={onSaved}
        initial={pledgeDialog.initial}
        fixedFamilyId={familyId}
      />
      <DonationFormDialog
        open={donationDialog.open}
        onClose={() => setDonationDialog({ open: false })}
        onSaved={onSaved}
        initial={donationDialog.initial}
        fixedFamilyId={familyId}
        pledges={pledges}
      />
      <ImportantDateFormDialog
        open={dateDialog.open}
        onClose={() => setDateDialog({ open: false })}
        onSaved={onSaved}
        initial={dateDialog.initial}
        members={members}
      />
      <NoteFormDialog
        open={noteDialog.open}
        onClose={() => setNoteDialog({ open: false })}
        onSaved={onSaved}
        initial={noteDialog.initial}
        fixedFamilyId={familyId}
        members={members}
      />

      {/* Nested member detail modal */}
      {memberModalId && (
        <MemberDetailModal memberId={memberModalId} open={Boolean(memberModalId)} onClose={() => setMemberModalId(null)} />
      )}

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
