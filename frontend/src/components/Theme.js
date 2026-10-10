import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', preference: 'system', setPreference: () => {} });
const KEY = 'soms.theme';

function readPref() {
  try {
    return window.localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPref] = useState(readPref);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const fn = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      preference,
      setPreference: (p) => {
        setPref(p);
        try {
          window.localStorage.setItem(KEY, p);
        } catch {
          /* ignore */
        }
      },
    }),
    [theme, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Resolved chart colours from CSS tokens (SVG attributes cannot use var()). */
export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      series: [v('--color-chart-1'), v('--color-chart-2'), v('--color-chart-3'), v('--color-chart-4'), v('--color-chart-5'), v('--color-chart-6')],
      grid: v('--color-chart-grid'),
      text: v('--color-text-secondary'),
      surface: v('--color-surface'),
      border: v('--color-border'),
    };
    // theme is the dependency that changes the tokens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}
