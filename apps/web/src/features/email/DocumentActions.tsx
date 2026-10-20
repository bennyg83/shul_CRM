import { useState } from 'react';
import { Button, IconButton, MenuItem, Select, Stack, Tooltip } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import MailIcon from '@mui/icons-material/MailOutline';
import type { Donation } from '@shulcrm/shared';
import { SendEmailDialog } from './SendEmailDialog';
import { openPrint } from '@/features/print/openPrint';

/** Print / email buttons for one donation's receipt. */
export function ReceiptActions({ donation }: { donation: Donation }) {
  const [emailing, setEmailing] = useState(false);
  return (
    <>
      <Tooltip title="Print receipt">
        <IconButton
          size="small"
          aria-label="Print receipt"
          onClick={() => openPrint(`/print/receipt/${donation.id}`)}
        >
          <PrintIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Email receipt">
        <IconButton size="small" aria-label="Email receipt" onClick={() => setEmailing(true)}>
          <MailIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <SendEmailDialog
        open={emailing}
        onClose={() => setEmailing(false)}
        title="Email receipt"
        template="receipt"
        recipients={[{ familyId: donation.familyId, donationId: donation.id }]}
      />
    </>
  );
}

const thisYear = new Date().getFullYear();

/** Year picker plus print / email buttons for a family's year-end statement. */
export function StatementActions({ familyId }: { familyId: string }) {
  const [year, setYear] = useState(thisYear);
  const [emailing, setEmailing] = useState(false);
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Select
        size="small"
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        inputProps={{ 'aria-label': 'Statement year' }}
      >
        {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => (
          <MenuItem key={y} value={y}>
            {y}
          </MenuItem>
        ))}
      </Select>
      <Button
        variant="outlined"
        size="small"
        startIcon={<PrintIcon />}
        onClick={() => openPrint(`/print/statement/${familyId}?year=${year}`)}
      >
        Statement
      </Button>
      <Button
        variant="outlined"
        size="small"
        startIcon={<MailIcon />}
        onClick={() => setEmailing(true)}
      >
        Email statement
      </Button>
      <SendEmailDialog
        open={emailing}
        onClose={() => setEmailing(false)}
        title={`Email the ${year} statement`}
        template="statement"
        recipients={[{ familyId, year }]}
      />
    </Stack>
  );
}
