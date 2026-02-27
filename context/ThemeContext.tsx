import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Dark, Light, Palette, type ThemeColors } from '@/constants/theme';

const THEME_KEY = 'salah_theme_pref';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  isDark:      boolean;
  colors:      ThemeColors;
  palette:     typeof Palette;
  mode:        ThemeMode;
  toggleTheme: () => void;
  setMode:     (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Restore persisted preference on mount
  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY).then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setModeState(val);
      }
    });
  }, []);

  const isDark  = mode === 'system' ? system === 'dark' : mode === 'dark';
  const colors  = isDark ? Dark : Light;

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    SecureStore.setItemAsync(THEME_KEY, m);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  return (
    <ThemeContext.Provider value={{ isDark, colors, palette: Palette, mode, toggleTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
