import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Dark, Light, Palette, type ThemeColors } from '@/constants/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'salah_theme_pref';

interface ThemeContextValue {
  isDark:      boolean;
  colors:      ThemeColors;
  palette:     typeof Palette;
  mode:        ThemeMode;
  toggleTheme: () => void;
  setMode:     (m: ThemeMode) => void;
  /** Root-level opacity Animated.Value — apply to top-level view in _layout for cross-fade. */
  transitionOpacity: Animated.Value;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Animated opacity for smooth theme cross-fade
  const transitionOpacity = useRef(new Animated.Value(1)).current;

  // Restore persisted preference on mount
  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY).then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setModeState(val);
      }
    });
  }, []);

  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
  const colors = isDark ? Dark : Light;

  const setMode = useCallback(
    (m: ThemeMode) => {
      // Fade out → switch → fade in
      Animated.timing(transitionOpacity, {
        toValue:         0,
        duration:        110,
        useNativeDriver: true,
      }).start(() => {
        setModeState(m);
        SecureStore.setItemAsync(THEME_KEY, m);
        Animated.timing(transitionOpacity, {
          toValue:         1,
          duration:        170,
          useNativeDriver: true,
        }).start();
      });
    },
    [transitionOpacity],
  );

  const toggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  return (
    <ThemeContext.Provider
      value={{ isDark, colors, palette: Palette, mode, toggleTheme, setMode, transitionOpacity }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
