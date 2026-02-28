/**
 * DuaCard — displays a single dua with Arabic, transliteration, translation, and copy.
 *
 * ARABIC FONT: For best Arabic rendering, add the Amiri or Scheherazade New font:
 *   1. Download Amiri-Regular.ttf from https://fonts.google.com/specimen/Amiri
 *   2. Place it in assets/fonts/Amiri-Regular.ttf
 *   3. In app/_layout.tsx, add to useFonts: { Amiri: require('../assets/fonts/Amiri-Regular.ttf') }
 *   4. Change fontFamily below from 'System' to 'Amiri'
 *
 * Until then, the system Arabic font (Geeza Pro on iOS, Noto Naskh on Android) is used,
 * which renders correctly but lacks calligraphic elegance.
 */

import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Dua {
  id:             string;
  arabic:         string;
  transliteration: string;
  english:        string;
  reference:      string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  dua:     Dua;
  isLast?: boolean;
}

export default function DuaCard({ dua, isLast }: Props) {
  const { colors, palette } = useTheme();
  const [copied, setCopied] = useState(false);

  // Brief scale pop on copy
  const scaleAnim = useRef(new Animated.Value(1)).current;

  async function handleCopy() {
    const text = `${dua.arabic}\n\n${dua.transliteration}\n\n${dua.english}\n\n— ${dua.reference}`;
    await Clipboard.setStringAsync(text);
    setCopied(true);

    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }),
    ]).start();

    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <View
      style={[
        styles.card,
        { borderBottomColor: colors.border },
        !isLast && styles.cardBorder,
      ]}
    >
      {/* ── Arabic text ── */}
      <Text
        style={[styles.arabic, { color: colors.text }]}
        // Explicit writingDirection ensures correct RTL rendering on all platforms
        {...(Platform.OS === 'android' ? { textAlign: 'right' } : {})}
      >
        {dua.arabic}
      </Text>

      {/* ── Transliteration ── */}
      <Text style={[styles.transliteration, { color: colors.textMuted }]}>
        {dua.transliteration}
      </Text>

      {/* ── English translation ── */}
      <Text style={[styles.english, { color: colors.text }]}>
        {dua.english}
      </Text>

      {/* ── Footer: reference + copy ── */}
      <View style={styles.footer}>
        <Text style={[styles.reference, { color: colors.tabInactive }]} numberOfLines={1}>
          {dua.reference}
        </Text>

        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            onPress={handleCopy}
            style={[
              styles.copyBtn,
              {
                backgroundColor: copied
                  ? `rgba(200,169,110,0.15)`
                  : colors.cardAlt,
                borderColor: copied ? palette.gold : colors.border,
              },
            ]}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.copyText, { color: copied ? palette.gold : colors.textMuted }]}>
              {copied ? '✓ Copied' : 'Copy'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 18,
    paddingVertical:   20,
  },
  cardBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Arabic — right-aligned, large, elegant
  arabic: {
    fontFamily:    Platform.OS === 'ios' ? 'GeezaPro' : 'serif',
    // ↑ Replace with 'Amiri' once the font is loaded (see file header comment)
    fontSize:      22,
    lineHeight:    38,
    textAlign:     'right',
    writingDirection: 'rtl',
    marginBottom:  14,
    letterSpacing: 0.5,
  },

  // Transliteration — italic, compact
  transliteration: {
    fontSize:      13,
    lineHeight:    22,
    fontStyle:     'italic',
    letterSpacing: 0.15,
    marginBottom:  10,
  },

  // English — readable body text
  english: {
    fontSize:      14,
    lineHeight:    22,
    fontWeight:    '300',
    letterSpacing: 0.1,
    marginBottom:  14,
  },

  // Footer row
  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            12,
  },
  reference: {
    flex:          1,
    fontSize:      10,
    letterSpacing: 0.3,
    fontStyle:     'italic',
  },
  copyBtn: {
    borderRadius:      8,
    borderWidth:       1,
    paddingHorizontal: 12,
    paddingVertical:    5,
  },
  copyText: {
    fontSize:      11,
    fontWeight:    '500',
    letterSpacing: 0.3,
  },
});
