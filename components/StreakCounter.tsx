import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  streak: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StreakCounter({ streak }: Props) {
  const { colors, palette } = useTheme();

  const flameAnim  = useRef(new Animated.Value(1)).current;
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const prevStreak = useRef(streak);

  // Continuous flame pulse
  useEffect(() => {
    if (streak === 0) {
      flameAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flameAnim, { toValue: 1.18, duration: 650, useNativeDriver: true }),
        Animated.timing(flameAnim, { toValue: 0.90, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [streak === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bounce number when streak increases
  useEffect(() => {
    if (streak > prevStreak.current) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.25, useNativeDriver: true, tension: 300, friction: 8 }),
        Animated.spring(scaleAnim, { toValue: 1.0,  useNativeDriver: true, tension: 200, friction: 10 }),
      ]).start();
    }
    prevStreak.current = streak;
  }, [streak]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = streak > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Gold top accent bar */}
      <View style={[styles.topAccent, { backgroundColor: active ? '#FF6B35' : colors.border }]} />

      <View style={styles.body}>
        {/* Flame */}
        <Animated.View style={{ transform: [{ scale: flameAnim }] }}>
          <MaterialCommunityIcons
            name="fire"
            size={32}
            color={active ? '#FF6B35' : colors.tabInactive}
          />
        </Animated.View>

        {/* Text group */}
        <View style={styles.textGroup}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Current Streak</Text>
          <Animated.Text
            style={[
              styles.number,
              { color: active ? colors.text : colors.textMuted },
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            {streak}
            <Text style={[styles.unit, { color: colors.textMuted }]}>
              {' '}{streak === 1 ? 'day' : 'days'}
            </Text>
          </Animated.Text>
        </View>

        {/* Week badge */}
        {streak >= 7 && (
          <View style={[styles.badge, { backgroundColor: palette.goldDim, borderColor: palette.gold }]}>
            <Text style={[styles.badgeText, { color: palette.gold }]}>
              {Math.floor(streak / 7)}w+
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth:  1,
    marginBottom: 16,
    overflow:     'hidden',
  },
  topAccent: { width: '100%', height: 3 },
  body: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            14,
    paddingHorizontal: 18,
    paddingVertical:   14,
  },
  textGroup: { flex: 1 },
  label:  { fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  number: { fontSize: 28, fontWeight: '200', fontFamily: 'SpaceMono', letterSpacing: 1 },
  unit:   { fontSize: 16, fontWeight: '200' },
  badge: {
    borderRadius:      10,
    borderWidth:       1,
    paddingHorizontal: 10,
    paddingVertical:    4,
  },
  badgeText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});
