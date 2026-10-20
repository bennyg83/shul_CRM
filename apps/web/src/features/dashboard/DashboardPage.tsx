import { Box, Button, Card, CardContent, Grid, Skeleton, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, listUpcomingDates } from '@/features/core/service';
import { qk } from '@/features/core/queryKeys';
import { useSettings } from '@/features/settings/useSettings';

/** Short local date for the dashboard list (e.g. "Oct 28"), no UTC drift. */
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function DashboardPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const { t, moneyTotals } = settings;
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });
  const { data: upcoming, isLoading: upcomingLoading } = useQuery({
    queryKey: qk.upcoming(30),
    queryFn: () => listUpcomingDates(30),
  });

  const kpis = [
    { label: t('families'), value: stats ? String(stats.families) : '—', hint: `${stats?.activeFamilies ?? 0} active` },
    { label: t('members'), value: stats ? String(stats.members) : '—', hint: `${stats?.activeMembers ?? 0} active` },
    ...(settings.features.pledges
      ? [{ label: `Open ${t('pledges')}`, value: stats ? moneyTotals(stats.openPledgeBalance) : '—', hint: 'Remaining balance' }]
      : []),
    { label: `${t('donations')} (YTD)`, value: stats ? moneyTotals(stats.donatedYtd) : '—', hint: 'Year to date' },
  ];

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5">Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            {`Welcome to the ${settings.org.name} CRM.`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => navigate('/families')}>
            {`New ${t('family')}`}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/members')}>
            {`New ${t('member')}`}
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={12 / kpis.length} key={kpi.label}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {kpi.label}
                </Typography>
                {isLoading ? (
                  <Skeleton variant="text" width={100} />
                ) : (
                  <Typography variant="h4" sx={{ color: 'primary.main' }}>
                    {kpi.value}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {kpi.hint}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="h6">Upcoming dates</Typography>
            <Button size="small" onClick={() => navigate('/dates')}>
              View all
            </Button>
          </Stack>
          {upcomingLoading ? (
            <Skeleton variant="text" width="60%" />
          ) : upcoming && upcoming.length > 0 ? (
            <Stack spacing={1}>
              {upcoming.slice(0, 5).map((d) => (
                <Stack key={`${d.id}-${d.nextOccurrence}`} direction="row" alignItems="baseline" spacing={2}>
                  <Typography variant="body2" sx={{ width: 90, flexShrink: 0 }}>
                    {shortDate(d.nextOccurrence)}
                  </Typography>
                  <Typography variant="body2">{d.memberName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {d.familyName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                    {settings.dateType(d.type).label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No dates in the next 30 days.
            </Typography>
          )}
        </CardContent>
      </Card>

      {isError && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="body2" color="error">
              Could not load dashboard stats. Check the Settings page to reset demo data.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <StarBorderIcon color="secondary" />
            <Typography variant="h6">Getting started</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
            Core data is seeded and live. Manage families and their members from the sidebar, then
            record pledges, donations, and important dates. Use Settings to reset the demo data at
            any time.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
