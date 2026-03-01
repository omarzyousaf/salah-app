import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Amiri_400Regular } from '@expo-google-fonts/amiri';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import 'react-native-reanimated';

import OfflineBanner from '@/components/OfflineBanner';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Amiri:     Amiri_400Regular,
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}

function RootLayoutNav() {
  const { isDark, transitionOpacity } = useTheme();
  useNotifications();

  // Fade the app in after the splash screen hides (smooth launch transition)
  const mountFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(mountFade, {
      toValue:         1,
      duration:        480,
      easing:          Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      {/* mountFade: one-time fade-in on launch.  transitionOpacity: theme switch cross-fade. */}
      <Animated.View style={{ flex: 1, opacity: mountFade }}>
        <Animated.View style={{ flex: 1, opacity: transitionOpacity }}>
          {/* Global offline banner — overlays all screens */}
          <OfflineBanner />
          <Stack>
          <Stack.Screen name="(tabs)"          options={{ headerShown: false }} />
          <Stack.Screen name="more/hadith"     options={{ headerShown: false }} />
          <Stack.Screen name="more/duas"       options={{ headerShown: false }} />
          <Stack.Screen name="more/chat"       options={{ headerShown: false }} />
          <Stack.Screen name="more/settings"   options={{ headerShown: false }} />
          <Stack.Screen name="quran/[surah]"   options={{ headerShown: false }} />
          <Stack.Screen name="modal"           options={{ presentation: 'modal' }} />
        </Stack>
        </Animated.View>
      </Animated.View>
    </NavThemeProvider>
  );
}
