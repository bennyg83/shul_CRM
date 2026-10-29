import { APP_BASENAME } from '@/config/api';

/** Opens a printable page in a new tab (Print → Save as PDF there). */
export const openPrint = (path: string) => {
  const base = APP_BASENAME ?? '';
  window.open(`${base}${path}`, '_blank', 'noopener');
};
