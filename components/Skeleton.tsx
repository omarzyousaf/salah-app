/**
 * components/Skeleton.tsx
 *
 * Reusable shimmer skeleton primitives used across screens.
 *
 *  SkeletonBox       — single animated placeholder rectangle
 *  PrayerTimesSkeleton — layout matching the Prayer Times card list
 *  QuranListSkeleton   — layout matching the Surah list rows
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Primitive ────────────────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width?:        number | `${number}%`;
  height?:       number;
  borderRadius?: number;
  style?:        object;
}

export function SkeletonBox({
  width        = '100%',
  height       = 16,
  borderRadius = 8,
  style,
}: SkeletonBoxProps) {
  const { colors } = useTheme();
  const shimmer    = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.85, duration: 750, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: colors.cardAlt, opacity: shimmer },
        style,
      ]}
    />
  );
}

// ─── Prayer Times skeleton ────────────────────────────────────────────────────

/** Matches the layout of the countdown block + 6 prayer cards. */
export function PrayerTimesSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={ptStyles.wrap}>
      {/* Countdown block */}
      <View style={[ptStyles.countdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SkeletonBox width="40%" height={11} style={{ marginBottom: 12 }} />
        <SkeletonBox width="60%" height={38} borderRadius={6} style={{ marginBottom: 14 }} />
        <SkeletonBox width="100%" height={3} borderRadius={2} />
      </View>

      {/* Prayer rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={[ptStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <SkeletonBox width={22} height={22} borderRadius={4} style={{ marginRight: 14 }} />
          <View style={{ flex: 1 }}>
            <SkeletonBox width="35%" height={13} style={{ marginBottom: 6 }} />
          </View>
          <SkeletonBox width={70} height={17} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

const ptStyles = StyleSheet.create({
  wrap: {
    padding:   20,
    paddingTop: 0,
  },
  countdown: {
    borderRadius: 16,
    borderWidth:  1,
    padding:      18,
    marginBottom: 20,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      14,
    borderWidth:       1,
    paddingVertical:   16,
    paddingHorizontal: 16,
    marginBottom:      8,
  },
});

// ─── Quran list skeleton ──────────────────────────────────────────────────────

/** Matches the layout of the SurahRow card. */
export function QuranListSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={qlStyles.wrap}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View
          key={i}
          style={[qlStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {/* Number badge */}
          <SkeletonBox width={38} height={38} borderRadius={10} style={{ marginRight: 12 }} />
          {/* Name + meta */}
          <View style={{ flex: 1, marginRight: 8 }}>
            <SkeletonBox width="55%" height={13} style={{ marginBottom: 7 }} />
            <SkeletonBox width="70%" height={10} style={{ marginBottom: 8 }} />
            <SkeletonBox width="30%" height={10} borderRadius={5} />
          </View>
          {/* Arabic */}
          <SkeletonBox width={50} height={18} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

const qlStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4 },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      14,
    borderWidth:       1,
    marginBottom:      8,
    paddingVertical:   14,
    paddingHorizontal: 14,
  },
});
