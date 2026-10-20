import { Box, Card, CardContent, Typography } from '@mui/material';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';


interface Props {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: Props) {
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {title}
      </Typography>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <HourglassBottomIcon sx={{ color: 'primary.main' }} />
            <Box>
              <Typography variant="h6">Coming in a later stage</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {description ?? 'This area will be built once the core data model is in place.'}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
