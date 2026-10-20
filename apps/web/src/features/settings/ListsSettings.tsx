import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keyFromLabel, lookupsSchema, type LookupKind, type Lookups } from '@shulcrm/shared';
import { getLookupUsage, saveLookup } from '@/features/core/service';
import { qk } from '@/features/core/queryKeys';
import { useSettings } from './useSettings';

const LISTS: Array<{ kind: LookupKind; label: string; help: string }> = [
  {
    kind: 'dateTypes',
    label: 'Date types',
    help: 'Kinds of important dates, their calendar color, and how they repeat.',
  },
  { kind: 'funds', label: 'Funds', help: 'What pledges and donations are for.' },
  { kind: 'paymentMethods', label: 'Payment methods', help: 'How a donation was paid.' },
  {
    kind: 'currencies',
    label: 'Currencies',
    help: 'The key is the currency code stored on each record.',
  },
  { kind: 'memberRoles', label: 'Member roles', help: 'A member’s place in the family.' },
  { kind: 'noteTypes', label: 'Note types', help: 'Categories for notes.' },
];

type AnyItem = Lookups[LookupKind][number];

/** A new item for a list, with the extra fields its kind needs. */
function blankItem(kind: LookupKind, label: string, taken: string[], locale: string): AnyItem {
  const key =
    kind === 'currencies' ? label.trim().toUpperCase().slice(0, 6) : keyFromLabel(label, taken);
  const base = { key, label: label.trim(), active: true };
  if (kind === 'dateTypes')
    return { ...base, color: '#607d8b', recurBy: 'gregorian', rules: 'anniversary' };
  if (kind === 'currencies') return { ...base, label: key, symbol: key, locale };
  return base;
}

function ListEditor({ kind }: { kind: LookupKind }) {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const saved = settings.lookups[kind] as AnyItem[];
  const [items, setItems] = useState<AnyItem[]>(saved);
  const [newLabel, setNewLabel] = useState('');
  useEffect(() => setItems(saved), [saved]);

  const { data: usage } = useQuery({
    queryKey: ['lookup-usage', kind],
    queryFn: () => getLookupUsage(kind),
  });
  const save = useMutation({
    mutationFn: () => saveLookup(kind, items as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settings });
      void queryClient.invalidateQueries({ queryKey: ['lookup-usage', kind] });
    },
  });

  const dirty = JSON.stringify(items) !== JSON.stringify(saved);
  const check = lookupsSchema.shape[kind].safeParse(items);
  const problem = check.success ? null : check.error.issues[0]?.message;
  const update = (i: number, patch: Partial<AnyItem>) =>
    setItems((list) =>
      list.map((item, j) => (j === i ? ({ ...item, ...patch } as AnyItem) : item)),
    );

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    setItems((list) => [
      ...list,
      blankItem(
        kind,
        label,
        list.map((i) => i.key),
        settings.org.locale,
      ),
    ]);
    setNewLabel('');
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Label</TableCell>
              <TableCell>Key</TableCell>
              {kind === 'dateTypes' && (
                <>
                  <TableCell>Color</TableCell>
                  <TableCell>Repeats on</TableCell>
                  <TableCell>Hebrew rules</TableCell>
                </>
              )}
              {kind === 'currencies' && (
                <>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Number format</TableCell>
                </>
              )}
              <TableCell>Used by</TableCell>
              <TableCell>Offered</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, i) => {
              const used = usage?.[item.key] ?? 0;
              const isDefaultCurrency =
                kind === 'currencies' && item.key === settings.org.defaultCurrency;
              return (
                <TableRow key={item.key}>
                  <TableCell sx={{ minWidth: 180 }}>
                    <TextField
                      size="small"
                      fullWidth
                      value={item.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      inputProps={{ 'aria-label': `Label for ${item.key}` }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {item.key}
                    </Typography>
                  </TableCell>
                  {kind === 'dateTypes' && 'color' in item && (
                    <>
                      <TableCell>
                        <input
                          type="color"
                          value={item.color}
                          aria-label={`Color for ${item.label}`}
                          onChange={(e) => update(i, { color: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={item.recurBy}
                          onChange={(e) =>
                            update(i, { recurBy: e.target.value as 'hebrew' | 'gregorian' })
                          }
                        >
                          <MenuItem value="hebrew">Hebrew date</MenuItem>
                          <MenuItem value="gregorian">English date</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={item.rules}
                          onChange={(e) =>
                            update(i, { rules: e.target.value as 'yahrzeit' | 'anniversary' })
                          }
                        >
                          <MenuItem value="yahrzeit">Yahrzeit</MenuItem>
                          <MenuItem value="anniversary">Birthday / simcha</MenuItem>
                        </Select>
                      </TableCell>
                    </>
                  )}
                  {kind === 'currencies' && 'symbol' in item && (
                    <>
                      <TableCell sx={{ width: 90 }}>
                        <TextField
                          size="small"
                          value={item.symbol}
                          onChange={(e) => update(i, { symbol: e.target.value })}
                          inputProps={{ 'aria-label': `Symbol for ${item.key}` }}
                        />
                      </TableCell>
                      <TableCell sx={{ width: 120 }}>
                        <TextField
                          size="small"
                          value={item.locale}
                          onChange={(e) => update(i, { locale: e.target.value })}
                          inputProps={{ 'aria-label': `Number format for ${item.key}` }}
                        />
                      </TableCell>
                    </>
                  )}
                  <TableCell>{used > 0 ? `${used} record${used === 1 ? '' : 's'}` : '—'}</TableCell>
                  <TableCell>
                    <Tooltip
                      title={
                        item.active
                          ? 'Offered for new records'
                          : 'Retired: kept on old records, not offered'
                      }
                    >
                      <Switch
                        checked={item.active}
                        onChange={(e) => update(i, { active: e.target.checked })}
                        inputProps={{ 'aria-label': `Offer ${item.label}` }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip
                      title={
                        used > 0
                          ? 'In use: retire it instead'
                          : isDefaultCurrency
                            ? 'This is the default currency'
                            : 'Delete'
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Delete ${item.label}`}
                          disabled={used > 0 || isDefaultCurrency}
                          onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          label={kind === 'currencies' ? 'New currency code' : 'New item'}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={!newLabel.trim()}
          onClick={add}
        >
          Add
        </Button>
      </Stack>

      {problem && dirty && <Alert severity="warning">{problem}</Alert>}
      {save.isError && <Alert severity="error">{(save.error as Error).message}</Alert>}
      {save.isSuccess && !dirty && <Alert severity="success">Saved.</Alert>}
      <Stack direction="row" spacing={1}>
        <Button
          disabled={!dirty || Boolean(problem) || save.isPending}
          onClick={() => save.mutate()}
        >
          Save list
        </Button>
        <Button variant="text" disabled={!dirty} onClick={() => setItems(saved)}>
          Discard changes
        </Button>
      </Stack>
    </Stack>
  );
}

export function ListsSettings() {
  const [kind, setKind] = useState<LookupKind>('dateTypes');
  const list = LISTS.find((l) => l.kind === kind) ?? LISTS[0];
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Lists
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The choices offered in dropdowns. Records store the key, so a label can change freely. An
          item in use can be retired (no longer offered) but not deleted.
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          onChange={(_, v: LookupKind | null) => v && setKind(v)}
          sx={{ mb: 2, flexWrap: 'wrap' }}
        >
          {LISTS.map((l) => (
            <ToggleButton key={l.kind} value={l.kind}>
              {l.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Chip size="small" label={list.label} />
          <Typography variant="body2" color="text.secondary">
            {list.help}
          </Typography>
        </Stack>
        <ListEditor key={kind} kind={kind} />
      </CardContent>
    </Card>
  );
}
