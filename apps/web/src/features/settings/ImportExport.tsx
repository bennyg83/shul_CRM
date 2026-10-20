import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IMPORT_ENTITIES,
  IMPORT_SPECS,
  guessMapping,
  type ImportEntity,
  type ImportPreview,
  type ImportRequest,
  type ImportResult,
} from '@shulcrm/shared';
import { commitImport, exportUrl, parseImportFile, previewImport } from '@/features/core/service';
import { invalidateRelated, qk } from '@/features/core/queryKeys';
import { useSettings } from './useSettings';

const STATUS_CHIP = {
  ok: { label: 'Ready', color: 'success' },
  duplicate: { label: 'Duplicate', color: 'warning' },
  error: { label: 'Problem', color: 'error' },
} as const;

/** The shul's word for each importable kind of record. */
function useEntityLabel() {
  const { t } = useSettings();
  /** The plural label, or with a count the right form ("1 family", "3 families"). */
  return (entity: ImportEntity, count?: number) => {
    const [one, many] = {
      families: [t('family'), t('families')],
      members: [t('member'), t('members')],
      pledges: [t('pledge'), t('pledges')],
      donations: [t('donation'), t('donations')],
      importantDates: ['Important date', 'Important dates'],
    }[entity];
    if (count === undefined) return many;
    return `${count} ${(count === 1 ? one : many).toLowerCase()}`;
  };
}

function ExportCard() {
  const label = useEntityLabel();
  const { features } = useSettings();
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Export
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Download every record of one kind. The columns match the import, so an exported file can
          be edited and imported again.
        </Typography>
        <Stack spacing={1}>
          {IMPORT_ENTITIES.filter((e) => features.pledges || e !== 'pledges').map((entity) => (
            <Stack key={entity} direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ width: 160 }}>{label(entity)}</Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                href={exportUrl(entity, 'csv')}
              >
                CSV
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                href={exportUrl(entity, 'xlsx')}
              >
                Excel
              </Button>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ImportWizard() {
  const queryClient = useQueryClient();
  const label = useEntityLabel();
  const { features } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>('families');
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(
    null,
  );
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [createMissingFamilies, setCreateMissingFamilies] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const spec = IMPORT_SPECS[entity];

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping({});
  };

  const parse = useMutation({
    mutationFn: parseImportFile,
    onSuccess: (table, f) => {
      setFile({ name: f.name, ...table });
      setMapping(guessMapping(spec, table.headers));
      setPreview(null);
      setResult(null);
    },
  });

  const request = (): ImportRequest => ({
    rows: file?.rows ?? [],
    mapping,
    createMissingFamilies,
    skipDuplicates,
  });
  const check = useMutation({
    mutationFn: () => previewImport(entity, request()),
    onSuccess: setPreview,
  });
  const commit = useMutation({
    mutationFn: () => commitImport(entity, request()),
    onSuccess: (r) => {
      setResult(r);
      invalidateRelated(queryClient);
      void queryClient.invalidateQueries({ queryKey: qk.settings });
    },
  });

  const missingRequired = spec.fields.filter((f) => f.required && mapping[f.key] === undefined);
  const step = result ? 3 : preview ? 2 : file ? 1 : 0;
  const error = (parse.error ?? check.error ?? commit.error) as Error | null;
  const willImport = preview
    ? preview.counts.ok + (skipDuplicates ? 0 : preview.counts.duplicate)
    : 0;
  const usesFamilies = entity === 'members' || entity === 'pledges' || entity === 'donations';
  const sample = useMemo(() => file?.rows.slice(0, 3) ?? [], [file]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Import
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Bring records in from a CSV or Excel file (the first sheet, with a header row). Nothing is
          saved until you confirm the preview. Import {label('families').toLowerCase()} first, then{' '}
          {label('members').toLowerCase()}, then the rest.
        </Typography>

        <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
          {['Choose a file', 'Match the columns', 'Check the preview', 'Done'].map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Stack spacing={2}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={entity}
            onChange={(_, v: ImportEntity | null) => {
              if (!v) return;
              setEntity(v);
              setPreview(null);
              setResult(null);
              if (file) setMapping(guessMapping(IMPORT_SPECS[v], file.headers));
            }}
            sx={{ flexWrap: 'wrap' }}
          >
            {IMPORT_ENTITIES.filter((e) => features.pledges || e !== 'pledges').map((e) => (
              <ToggleButton key={e} value={e}>
                {label(e)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <input
            ref={input}
            type="file"
            hidden
            aria-label="File to import"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) parse.mutate(f);
            }}
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              disabled={parse.isPending}
              onClick={() => input.current?.click()}
            >
              {file ? 'Choose another file…' : 'Choose a file…'}
            </Button>
            {file && (
              <Typography variant="body2" color="text.secondary">
                {file.name}: {file.rows.length} row{file.rows.length === 1 ? '' : 's'},{' '}
                {file.headers.length} columns
              </Typography>
            )}
          </Stack>

          {error && <Alert severity="error">{error.message}</Alert>}

          {file && !result && (
            <>
              <Typography variant="subtitle2">Which column holds each field?</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Field</TableCell>
                      <TableCell>Column in the file</TableCell>
                      <TableCell>First values</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {spec.fields.map((f) => {
                      const col = mapping[f.key];
                      return (
                        <TableRow key={f.key}>
                          <TableCell>
                            {f.label}
                            {f.required && (
                              <Typography component="span" color="error">
                                {' '}
                                *
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ minWidth: 200 }}>
                            <Select
                              size="small"
                              fullWidth
                              value={col === undefined ? '' : String(col)}
                              displayEmpty
                              inputProps={{ 'aria-label': `Column for ${f.label}` }}
                              onChange={(e) => {
                                setPreview(null);
                                setMapping((m) => {
                                  const next = { ...m };
                                  if (e.target.value === '') delete next[f.key];
                                  else next[f.key] = Number(e.target.value);
                                  return next;
                                });
                              }}
                            >
                              <MenuItem value="">— Not in the file —</MenuItem>
                              {file.headers.map((h, i) => (
                                <MenuItem key={i} value={String(i)}>
                                  {h || `Column ${i + 1}`}
                                </MenuItem>
                              ))}
                            </Select>
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', maxWidth: 280 }}>
                            <Typography variant="body2" noWrap>
                              {col === undefined
                                ? ''
                                : sample
                                    .map((r) => r[col] ?? '')
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>

              <Stack>
                {usesFamilies && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={createMissingFamilies}
                        onChange={(e) => setCreateMissingFamilies(e.target.checked)}
                      />
                    }
                    label={`Create a ${label('families').toLowerCase().replace(/s$/, '')} that isn't found by name`}
                  />
                )}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                    />
                  }
                  label={`Skip rows that look like existing records (${spec.duplicateRule.toLowerCase()})`}
                />
              </Stack>

              {missingRequired.length > 0 && (
                <Alert severity="info">
                  Choose a column for: {missingRequired.map((f) => f.label).join(', ')}
                </Alert>
              )}
              <Stack direction="row" spacing={1}>
                <Button
                  disabled={missingRequired.length > 0 || check.isPending}
                  onClick={() => check.mutate()}
                >
                  Preview
                </Button>
                <Button variant="text" onClick={reset}>
                  Start over
                </Button>
              </Stack>
            </>
          )}

          {preview && !result && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip color="success" label={`${preview.counts.ok} ready`} />
                <Chip
                  color="warning"
                  label={`${preview.counts.duplicate} duplicate${preview.counts.duplicate === 1 ? '' : 's'}`}
                />
                <Chip color="error" label={`${preview.counts.error} with problems`} />
              </Stack>
              {preview.newFamilies.length > 0 && (
                <Alert severity="info">
                  New {label('families').toLowerCase()} will be created:{' '}
                  {preview.newFamilies.slice(0, 10).join(', ')}
                  {preview.newFamilies.length > 10
                    ? `, and ${preview.newFamilies.length - 10} more`
                    : ''}
                </Alert>
              )}
              {preview.newListItems.length > 0 && (
                <Alert severity="info">
                  These will be added to the lists (Settings → Lists):{' '}
                  {preview.newListItems.map((i) => i.key).join(', ')}
                </Alert>
              )}
              <Box
                sx={{
                  maxHeight: 360,
                  overflow: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Record</TableCell>
                      <TableCell>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.results.map((r) => (
                      <TableRow key={r.row}>
                        {/* +2: the header is row 1 of the file. */}
                        <TableCell>{r.row + 2}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={STATUS_CHIP[r.status].color}
                            label={STATUS_CHIP[r.status].label}
                          />
                        </TableCell>
                        <TableCell>{r.summary}</TableCell>
                        <TableCell
                          sx={{ color: r.status === 'error' ? 'error.main' : 'text.secondary' }}
                        >
                          {r.messages.join('; ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  disabled={willImport === 0 || commit.isPending}
                  onClick={() => commit.mutate()}
                >
                  {`Import ${willImport} row${willImport === 1 ? '' : 's'}`}
                </Button>
                {preview.counts.error > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Rows with problems are left out; fix them in the file and import again.
                  </Typography>
                )}
              </Stack>
            </>
          )}

          {result && (
            <>
              <Alert severity="success">
                Imported {label(entity, result.created)}
                {result.newFamilies > 0 && `, created ${label('families', result.newFamilies)}`}
                {result.newListItems > 0 &&
                  `, added ${result.newListItems} list item${result.newListItems === 1 ? '' : 's'}`}
                .
                {result.skipped > 0 &&
                  ` Skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}.`}
                {result.failed > 0 &&
                  ` Left out ${result.failed} row${result.failed === 1 ? '' : 's'} with problems.`}
              </Alert>
              <Box>
                <Button variant="outlined" onClick={reset}>
                  Import another file
                </Button>
              </Box>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ImportExport() {
  return (
    <Stack spacing={2}>
      <ImportWizard />
      <ExportCard />
    </Stack>
  );
}
