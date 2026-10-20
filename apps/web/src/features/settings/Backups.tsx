import {
  Alert,
  Button,
  Card,
  CardContent,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import BackupIcon from '@mui/icons-material/Backup';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  backupDownloadUrl,
  createBackup,
  deleteBackup,
  listBackups,
} from '@/features/core/service';

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Whole-database snapshots: automatic daily ones, plus "back up now" and download. */
export function Backups() {
  const queryClient = useQueryClient();
  const { data, error } = useQuery({ queryKey: ['backups'], queryFn: listBackups });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['backups'] });
  const create = useMutation({
    mutationFn: createBackup,
    onSuccess: (b) => {
      refresh();
      // Hand the new snapshot straight to the browser.
      window.location.href = backupDownloadUrl(b.name);
    },
  });
  const remove = useMutation({ mutationFn: deleteBackup, onSuccess: refresh });

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Backups
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A backup is one file holding everything: records, settings, lists and the logo. One is
          made automatically each day (the last 14 are kept). Keep a copy somewhere other than this
          computer. To restore, stop the app, replace <code>data/crm.sqlite</code> with the backup
          file, and start it again.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            startIcon={<BackupIcon />}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            Back up now and download
          </Button>
        </Stack>
        {(error ?? create.error ?? remove.error) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {((error ?? create.error ?? remove.error) as Error).message}
          </Alert>
        )}
        {data && data.length === 0 && (
          <Typography color="text.secondary">No backups yet.</Typography>
        )}
        {data && data.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Made</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((b) => (
                <TableRow key={b.name}>
                  <TableCell>{new Date(b.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    {b.name.includes('-auto')
                      ? 'Automatic'
                      : b.name.includes('-reset')
                        ? 'Before a demo reset'
                        : 'Manual'}
                  </TableCell>
                  <TableCell align="right">{size(b.size)}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      aria-label={`Download ${b.name}`}
                      href={backupDownloadUrl(b.name)}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Delete ${b.name}`}
                      onClick={() => remove.mutate(b.name)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
