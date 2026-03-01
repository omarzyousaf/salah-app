/**
 * components/OfflineBanner.tsx
 *
 * A subtle fixed banner that slides in just below the status bar when the
 * device loses internet connectivity.  It has no impact on layout (absolute
 * positioning) so it doesn't shift screen content.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const BANNER_H = 32;

export default function OfflineBanner() {
  const { colors } = useTheme();
  const { isOnline } = useNetworkStatus();
  const insets     = useSafeAreaInsets();
  const slideAnim  = useRef(new Animated.Value(-BANNER_H)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue:         isOnline ? -BANNER_H : 0,
      useNativeDriver: true,
      damping:         20,
      stiffness:       200,
    }).start();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: colors.dangerBg,
          borderBottomColor: colors.dangerBorder,
          top:             insets.top,
          transform:       [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={isOnline ? undefined : "You're offline — showing cached data"}
    >
      <MaterialCommunityIcons name="wifi-off" size={13} color={colors.danger} />
      <Text style={[styles.text, { color: colors.danger }]}>
        You're offline — showing cached data
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position:          'absolute',
    left:              0,
    right:             0,
    zIndex:            999,
    height:            BANNER_H,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize:      11,
    fontWeight:    '500',
    letterSpacing: 0.3,
  },
});
