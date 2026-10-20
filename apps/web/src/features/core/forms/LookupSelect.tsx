import {
  FormControl,
  FormLabel,
  MenuItem,
  Select,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import type { LookupKind } from '@shulcrm/shared';
import { useSettings } from '@/features/settings/useSettings';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  /** Which of the shul's lists to offer (Settings → Lists). */
  kind: LookupKind;
  /** Offer an empty choice with this label (for optional fields). */
  emptyLabel?: string;
  error?: string;
  sx?: SxProps<Theme>;
}

/** A dropdown over one of the shul's lists: active items, plus the current value if it was retired. */
export function LookupSelect<T extends FieldValues>({
  control,
  name,
  label,
  kind,
  emptyLabel,
  error,
  sx,
}: Props<T>) {
  const settings = useSettings();
  return (
    <FormControl sx={sx} error={Boolean(error)}>
      <FormLabel>{label}</FormLabel>
      <Controller
        name={name}
        control={control}
        render={({ field }) => {
          const current = typeof field.value === 'string' ? field.value : undefined;
          const items =
            kind === 'dateTypes'
              ? settings.dateTypeOptions(current)
              : settings.options(kind, current);
          return (
            <Select {...field} value={field.value ?? ''}>
              {emptyLabel !== undefined && <MenuItem value="">{emptyLabel}</MenuItem>}
              {items.map((item) => (
                <MenuItem key={item.key} value={item.key}>
                  {item.label}
                  {!item.active && ' (retired)'}
                </MenuItem>
              ))}
            </Select>
          );
        }}
      />
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </FormControl>
  );
}
