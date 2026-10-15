import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
} from '@mui/material';
import type { ImportantDate } from '@pilzno/shared';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const TYPE_COLORS: Record<ImportantDate['type'], string> = {
  birthday: '#4caf50', // green
  yahrzeit: '#9c27b0', // purple
  brit_mitzvah: '#2196f3', // blue
};

const TYPE_LABELS: Record<ImportantDate['type'], string> = {
  birthday: 'Birthday',
  yahrzeit: 'Yahrzeit',
  brit_mitzvah: 'Bar / Bat Mitzvah',
};

/** Parse ISO date to { month (0-11), day } for calendar indexing. */
function parseDate(iso: string): { month: number; day: number } {
  const [, m, d] = iso.split('-').map(Number);
  return { month: m - 1, day: d }; // month is 0-indexed
}

/** Get days in a given month/year. */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface Props {
  dates?: ImportantDate[];
}

export function CalendarPage({ dates = [] }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11
  
  const daysInMonth = getDaysInMonth(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  


  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Calendar
      </Typography>

      <Card>
        <CardContent>
          <Grid container alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6">
              {MONTHS[month]} {year}
            </Typography>
            <Box>
              <button onClick={prevMonth} style={btnStyle}>←</button>
              <button onClick={nextMonth} style={{ ...btnStyle, marginLeft: 4 }}>→</button>
            </Box>
          </Grid>

          {/* Days of week header */}
          <Grid container sx={{ mb: 1 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dow) => (
              <Grid item xs={12 / 7} key={dow}>
                <Typography variant="caption" align="center" color="text.secondary">
                  {dow}
                </Typography>
              </Grid>
            ))}
          </Grid>

          {/* Calendar grid */}
          <Grid container spacing={0.5}>
            {/* Empty cells for days before the 1st of month */}
            {Array.from({ length: new Date(year, month, 1).getDay() }).map((_, i) => (
              <Grid item xs={12 / 7} key={`empty-${i}`} />
            ))}

            {/* Days of the month */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              // Find all dates for this day
              const dayDates = dates.filter(d => {
                const parsed = parseDate(d.date);
                return parsed.month === month && parsed.day === day;
              });
              
              return (
                <Grid item xs={12 / 7} key={`day-${day}`}>
                  <Box
                    sx={{
                      height: '40px',
                      border: '1px solid #e0e0e0',
                      borderRadius: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      pt: 0.5,
                      backgroundColor: dayDates.length > 0 ? '#f5f5f5' : undefined,
                    }}
                  >
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      {day}
                    </Typography>
                    {/* Date type indicators (colored dots) */}
                    {dayDates.map((d, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: TYPE_COLORS[d.type],
                          marginBottom: 1,
                        }}
                        title={`${TYPE_LABELS[d.type]} — ${d.memberId}`}
                      />
                    ))}
                  </Box>
                </Grid>
              );
            })}
          </Grid>

          {/* Legend */}
          <Grid container spacing={2} sx={{ mt: 2 }}>
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <Grid item key={type}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: color,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {TYPE_LABELS[type as ImportantDate['type']]}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '16px',
  cursor: 'pointer',
  border: '1px solid #ccc',
  borderRadius: 2,
  backgroundColor: '#fff',
};
