import { useSyncExternalStore } from 'react';
import { cycleThemeMode, getThemeSnapshot, setThemeMode, subscribeTheme } from '../theme/themeMode';

export default function useThemeMode() {
  const { mode, resolved } = useSyncExternalStore(subscribeTheme, getThemeSnapshot);
  return { mode, resolved, setMode: setThemeMode, cycle: cycleThemeMode };
}
