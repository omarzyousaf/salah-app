/**
 * AyahCard — displays one Quran ayah: Arabic, transliteration, English.
 * Highlights with a gold tint when isPlaying = true (smooth animated transition).
 *
 * ARABIC FONT: For best Arabic rendering, add the Amiri or Scheherazade New font:
 *   1. Download Amiri-Regular.ttf from https://fonts.google.com/specimen/Amiri
 *   2. Place it in assets/fonts/Amiri-Regular.ttf
 *   3. In app/_layout.tsx, add to useFonts: { Amiri: require('../assets/fonts/Amiri-Regular.ttf') }
 *   4. Change fontFamily below from 'GeezaPro'/'serif' to 'Amiri'
 */

import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  numberInSurah:   number;
  arabic:          string;
  transliteration: string;
  english:         string;
  isPlaying?:      boolean;
  isLast?:         boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AyahCard({
  numberInSurah,
  arabic,
  transliteration,
  english,
  isPlaying = false,
  isLast,
}: Props) {
  const { colors, palette } = useTheme();

  // Smooth highlight animation (not native driver — animating backgroundColor)
  const highlightAnim = useRef(new Animated.Value(isPlaying ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(highlightAnim, {
      toValue:         isPlaying ? 1 : 0,
      duration:        300,
      useNativeDriver: false,
    }).start();
  }, [isPlaying]);

  const animatedBg = highlightAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(200,169,110,0.00)', 'rgba(200,169,110,0.07)'],
  });

  const animatedBorder = highlightAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(200,169,110,0.00)', 'rgba(200,169,110,0.55)'],
  });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor:  animatedBg,
          borderBottomColor: !isLast ? colors.border : 'transparent',
          borderLeftColor:   animatedBorder,
        },
        !isLast && styles.borderBottom,
        styles.borderLeft,
      ]}
    >
      {/* ── Ayah number badge + extending hairline ── */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: isPlaying ? 'rgba(200,169,110,0.18)' : 'rgba(200,169,110,0.10)',
              borderColor:     isPlaying ? 'rgba(200,169,110,0.55)' : 'rgba(200,169,110,0.28)',
            },
          ]}
        >
          <Text style={[styles.badgeNum, { color: palette.gold }]}>
            {numberInSurah}
          </Text>
        </View>
        <View style={[styles.badgeLine, { backgroundColor: colors.border }]} />
      </View>

      {/* ── Arabic text ── */}
      <Text
        style={[styles.arabic, { color: colors.text }]}
        {...(Platform.OS === 'android' ? { textAlign: 'right' } : {})}
      >
        {arabic}
      </Text>

      {/* ── Thin separator ── */}
      <View style={[styles.sep, { backgroundColor: colors.border }]} />

      {/* ── Transliteration ── */}
      <Text style={[styles.transliteration, { color: colors.textMuted }]}>
        {transliteration}
      </Text>

      {/* ── English translation ── */}
      <Text style={[styles.english, { color: colors.text }]}>
        {english}
      </Text>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 20,
    paddingTop:        22,
    paddingBottom:     20,
    borderLeftWidth:   3,
  },
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  borderLeft: {
    // borderLeftColor set dynamically via animated interpolation
  },

  // Badge row
  badgeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  18,
  },
  badge: {
    width:          36,
    height:         36,
    borderRadius:   10,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  badgeNum: {
    fontSize:      13,
    fontWeight:    '600',
    letterSpacing: 0.2,
  },
  badgeLine: {
    flex:       1,
    height:     StyleSheet.hairlineWidth,
    marginLeft: 10,
    opacity:    0.7,
  },

  // Arabic — large, right-aligned, RTL
  arabic: {
    fontFamily:       'Amiri',
    fontSize:         26,
    lineHeight:       48,
    textAlign:        'right',
    writingDirection: 'rtl',
    marginBottom:     18,
    letterSpacing:    0.5,
  },

  // Thin ornamental separator between Arabic and transliteration
  sep: {
    height:       StyleSheet.hairlineWidth,
    marginBottom: 14,
    opacity:      0.5,
  },

  // Transliteration — italic, compact
  transliteration: {
    fontSize:      13,
    lineHeight:    22,
    fontStyle:     'italic',
    letterSpacing: 0.15,
    marginBottom:  10,
  },

  // English translation
  english: {
    fontSize:      14,
    lineHeight:    23,
    fontWeight:    '300',
    letterSpacing: 0.1,
  },
});
