import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  name:     string;
  checked:  boolean;
  onToggle: () => void;
  loading:  boolean;
  isLast:   boolean;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
  Fajr:    'weather-night',
  Dhuhr:   'weather-sunny',
  Asr:     'weather-partly-cloudy',
  Maghrib: 'weather-sunset-down',
  Isha:    'moon-waning-crescent',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrayerCheckbox({ name, checked, onToggle, loading, isLast }: Props) {
  const { colors, palette } = useTheme();

  // Checkmark scale: springs in when checked, out when unchecked
  const checkAnim = useRef(new Animated.Value(checked ? 1 : 0)).current;
  // Accent bar opacity
  const accentAnim = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkAnim, {
        toValue:         checked ? 1 : 0,
        useNativeDriver: true,
        tension:         220,
        friction:        11,
      }),
      Animated.timing(accentAnim, {
        toValue:         checked ? 1 : 0,
        duration:        180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checked]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePress() {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggle();
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={[
        styles.row,
        checked && { backgroundColor: 'rgba(200,169,110,0.06)' },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      {/* Gold left accent */}
      <Animated.View
        style={[styles.accent, { backgroundColor: palette.gold, opacity: accentAnim }]}
      />

      {/* Prayer icon */}
      <MaterialCommunityIcons
        name={(ICONS[name] ?? 'circle') as any}
        size={20}
        color={checked ? palette.gold : colors.tabInactive}
        style={styles.icon}
      />

      {/* Prayer name */}
      <Text style={[styles.name, { color: checked ? palette.gold : colors.text }]}>
        {name}
      </Text>

      {/* Custom animated checkbox */}
      <View
        style={[
          styles.box,
          {
            borderColor:     checked ? palette.gold : colors.border,
            backgroundColor: checked ? palette.gold : 'transparent',
          },
        ]}
      >
        {loading ? (
          <Animated.View style={{ opacity: 0.6 }}>
            <Ionicons name="ellipsis-horizontal" size={12} color={checked ? '#111' : colors.tabInactive} />
          </Animated.View>
        ) : (
          <Animated.View
            style={{
              transform: [{ scale: checkAnim }],
              opacity:   checkAnim,
            }}
          >
            <Ionicons name="checkmark" size={15} color="#111" />
          </Animated.View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   16,
    position:          'relative',
  },
  accent: {
    position: 'absolute',
    left:     0,
    top:      0,
    bottom:   0,
    width:    3,
  },
  icon: { marginRight: 14 },
  name: { flex: 1, fontSize: 15, letterSpacing: 0.3, fontWeight: '400' },
  box: {
    width:          26,
    height:         26,
    borderRadius:   13,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
