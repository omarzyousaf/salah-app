/**
 * AyahCard — displays one Quran ayah: Arabic, transliteration, English.
 * Highlights with a gold tint when isPlaying = true (smooth animated transition).
 * Tappable: press any card to start playback from that ayah.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  numberInSurah:   number;
  arabic:          string;
  transliteration: string;
  english:         string;
  isPlaying?:      boolean;
  isLast?:         boolean;
  /** Called when user taps the card to start/switch playback */
  onPress?:        () => void;
  /** Show a one-time "tap to play" hint — parent hides after first use */
  showHint?:       boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AyahCard({
  numberInSurah,
  arabic,
  transliteration,
  english,
  isPlaying  = false,
  isLast,
  onPress,
  showHint   = false,
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
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedBg = highlightAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(200,169,110,0.00)', 'rgba(200,169,110,0.07)'],
  });

  const animatedBorder = highlightAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(200,169,110,0.00)', 'rgba(200,169,110,0.55)'],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor:   animatedBg,
            borderBottomColor: !isLast ? colors.border : 'transparent',
            borderLeftColor:   animatedBorder,
          },
          !isLast && styles.borderBottom,
          styles.borderLeft,
        ]}
      >
        {/* ── Ayah number badge + extending hairline + play indicator ── */}
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
          {/* Subtle play / now-playing icon */}
          {onPress && (
            <MaterialCommunityIcons
              name={isPlaying ? 'volume-high' : 'play-circle-outline'}
              size={15}
              color={isPlaying ? palette.gold : 'rgba(200,169,110,0.38)'}
              style={styles.playIcon}
            />
          )}
        </View>

        {/* ── One-time tap hint (first card only) ── */}
        {showHint && (
          <Text style={[styles.tapHint, { color: palette.gold }]}>
            tap any verse to play ›
          </Text>
        )}

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
    </TouchableOpacity>
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
  playIcon: {
    marginLeft: 8,
  },

  // One-time hint
  tapHint: {
    fontSize:      10,
    fontWeight:    '400',
    letterSpacing: 0.8,
    opacity:       0.55,
    marginTop:     -10,
    marginBottom:  12,
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

  // Thin ornamental separator
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
