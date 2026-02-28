import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';

import { useTheme } from '@/context/ThemeContext';
import { HadithData, fetchDailyHadith, fetchRandomHadith } from '@/services/hadith';

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  const { colors } = useTheme();
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.9,  duration: 750, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ]),
    ).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bars = [92, 100, 96, 88, 100, 82, 94, 60];
  return (
    <View style={[skelStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Animated.View style={[skelStyles.narratorBar, { backgroundColor: colors.cardAlt, opacity: shimmer, width: '55%' }]} />
      <View style={skelStyles.gap} />
      {bars.map((w, i) => (
        <Animated.View
          key={i}
          style={[skelStyles.textBar, { backgroundColor: colors.cardAlt, opacity: shimmer, width: `${w}%` }]}
        />
      ))}
      <View style={skelStyles.gap} />
      <Animated.View style={[skelStyles.refBar, { backgroundColor: colors.cardAlt, opacity: shimmer, width: '45%' }]} />
    </View>
  );
}

const skelStyles = StyleSheet.create({
  card:        { borderRadius: 20, borderWidth: 1, padding: 28, marginBottom: 24 },
  narratorBar: { height: 11, borderRadius: 6, marginBottom: 20 },
  textBar:     { height: 10, borderRadius: 5, marginBottom: 9 },
  refBar:      { height: 10, borderRadius: 5, marginTop: 16 },
  gap:         { height: 8 },
});

// ─── Islamic corner bracket decoration ───────────────────────────────────────

function CornerBrackets({ size, color }: { size: number; color: string }) {
  const l = size * 0.42;  // leg length
  const w = 1.2;           // stroke width
  const h = size;
  // Four L-shapes at corners
  const corners = [
    // top-left
    `M ${l} ${w / 2} L ${w / 2} ${w / 2} L ${w / 2} ${l}`,
    // top-right
    `M ${h - l} ${w / 2} L ${h - w / 2} ${w / 2} L ${h - w / 2} ${l}`,
    // bottom-left
    `M ${w / 2} ${h - l} L ${w / 2} ${h - w / 2} L ${l} ${h - w / 2}`,
    // bottom-right
    `M ${h - l} ${h - w / 2} L ${h - w / 2} ${h - w / 2} L ${h - w / 2} ${h - l}`,
  ];
  return (
    <Svg width={h} height={h} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <G stroke={color} strokeWidth={w} fill="none" opacity={0.55}>
        {corners.map((d, i) => <Path key={i} d={d} />)}
      </G>
    </Svg>
  );
}

// ─── Diamond divider ──────────────────────────────────────────────────────────

function Divider({ color, borderColor }: { color: string; borderColor: string }) {
  return (
    <View style={divStyles.row}>
      <View style={[divStyles.line, { backgroundColor: borderColor }]} />
      <View style={[divStyles.diamond, { backgroundColor: color }]} />
      <View style={[divStyles.line, { backgroundColor: borderColor }]} />
    </View>
  );
}

const divStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  line:    { flex: 1, height: 1 },
  diamond: { width: 6, height: 6, transform: [{ rotate: '45deg' }], marginHorizontal: 12 },
});

// ─── Hadith card ──────────────────────────────────────────────────────────────

interface CardProps {
  hadith: HadithData;
  fadeAnim:  Animated.Value;
  slideAnim: Animated.Value;
}

function HadithCard({ hadith, fadeAnim, slideAnim }: CardProps) {
  const { colors, palette } = useTheme();

  return (
    <Animated.View
      style={[
        cardStyles.outer,
        {
          backgroundColor: colors.card,
          borderColor:     `rgba(200,169,110,0.35)`,
          opacity:   fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Corner bracket ornaments */}
      <CornerBrackets size={120} color={palette.gold} />

      <View style={cardStyles.inner}>
        {/* Top divider */}
        <Divider color={palette.gold} borderColor={colors.border} />

        {/* Narrator */}
        {hadith.narrator !== '' && (
          <Text style={[cardStyles.narrator, { color: colors.textMuted }]}>
            {hadith.narrator}
          </Text>
        )}

        {/* Opening quote mark */}
        <Text style={[cardStyles.quoteChar, { color: palette.gold }]}>"</Text>

        {/* Hadith text */}
        <Text style={[cardStyles.text, { color: colors.text }]}>
          {hadith.text}
        </Text>

        {/* Bottom divider */}
        <Divider color={palette.gold} borderColor={colors.border} />

        {/* Reference */}
        <View style={cardStyles.refRow}>
          <View style={[cardStyles.refDot, { backgroundColor: palette.gold }]} />
          <Text style={[cardStyles.ref, { color: colors.textMuted }]}>
            {hadith.collection} · #{hadith.number}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  outer: {
    borderRadius:  20,
    borderWidth:   1,
    overflow:      'hidden',
    marginBottom:  24,
    position:      'relative',
  },
  inner: {
    padding:         28,
    paddingTop:      8,
    paddingBottom:   22,
  },
  narrator: {
    fontSize:      12,
    letterSpacing: 0.4,
    fontStyle:     'italic',
    marginBottom:  8,
    lineHeight:    18,
  },
  quoteChar: {
    fontSize:    52,
    lineHeight:  44,
    fontWeight:  '200',
    marginBottom: 4,
  },
  text: {
    fontSize:    16,
    lineHeight:  28,
    fontWeight:  '300',
    letterSpacing: 0.15,
  },
  refRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  refDot: {
    width:        4,
    height:       4,
    borderRadius: 2,
  },
  ref: {
    fontSize:      11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

type Status = 'loading' | 'success' | 'error';

export default function HadithScreen() {
  const { colors, palette, isDark } = useTheme();

  const [status,  setStatus]  = useState<Status>('loading');
  const [hadith,  setHadith]  = useState<HadithData | null>(null);
  const [shuffling, setShuffling] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const spinAnim  = useRef(new Animated.Value(0)).current;

  // ── Load on mount ────────────────────────────────────────────────────────

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setStatus('loading');
    fadeAnim.setValue(0);
    slideAnim.setValue(16);
    try {
      const data = await fetchDailyHadith();
      setHadith(data);
      setStatus('success');
      animateIn();
    } catch {
      setStatus('error');
    }
  }

  // ── Shuffle ──────────────────────────────────────────────────────────────

  async function handleShuffle() {
    if (shuffling) return;
    setShuffling(true);

    // Spin icon 360°
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue:         1,
      duration:        500,
      useNativeDriver: true,
    }).start();

    // Fade out current hadith
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start();

    try {
      const data = await fetchRandomHadith();
      setHadith(data);
      setStatus('success');
      slideAnim.setValue(16);
      animateIn();
    } catch {
      setStatus('error');
    } finally {
      setShuffling(false);
    }
  }

  // ── Share ────────────────────────────────────────────────────────────────

  async function handleShare() {
    if (!hadith) return;
    const msg =
      (hadith.narrator ? `${hadith.narrator}\n\n` : '') +
      `"${hadith.text}"\n\n— ${hadith.collection}, Hadith #${hadith.number}`;
    await Share.share({ message: msg });
  }

  // ── Fade in animation ────────────────────────────────────────────────────

  function animateIn() {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }

  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>

      {/* ── Custom header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Hadith of the Day</Text>
          <Text style={[styles.headerSub,   { color: colors.textMuted }]}>Sahih al-Bukhari</Text>
        </View>

        {/* Placeholder to balance back button */}
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Arabic label ── */}
        <Text style={[styles.arabicLabel, { color: palette.gold }]}>حديث اليوم</Text>

        {/* ── Content area ── */}
        {status === 'loading' && <Skeleton />}

        {status === 'success' && hadith && (
          <HadithCard
            hadith={hadith}
            fadeAnim={fadeAnim}
            slideAnim={slideAnim}
          />
        )}

        {status === 'error' && (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.errorIcon]}>☁</Text>
            <Text style={[styles.errorTitle, { color: colors.text }]}>
              Could not load hadith
            </Text>
            <Text style={[styles.errorSub, { color: colors.textMuted }]}>
              Check your connection and try again.
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: palette.gold }]}
              onPress={load}
              activeOpacity={0.7}
            >
              <Text style={[styles.retryText, { color: palette.gold }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Action buttons ── */}
        {status !== 'loading' && (
          <View style={styles.actions}>
            {/* Shuffle */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleShuffle}
              disabled={shuffling}
              activeOpacity={0.75}
            >
              <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                <Ionicons name="shuffle" size={18} color={palette.gold} />
              </Animated.View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>
                {shuffling ? 'Loading…' : 'Shuffle'}
              </Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleShare}
              disabled={!hadith}
              activeOpacity={0.75}
            >
              <Ionicons
                name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'}
                size={18}
                color={palette.gold}
              />
              <Text style={[styles.actionLabel, { color: colors.text }]}>Share</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Attribution ── */}
        <Text style={[styles.attribution, { color: colors.tabInactive }]}>
          Hadith data from fawazahmed0/hadith-api
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:      { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '600', letterSpacing: 0.2 },
  headerSub:    { fontSize: 11, letterSpacing: 0.4, marginTop: 1 },

  // Arabic label
  arabicLabel: {
    textAlign:     'center',
    fontSize:      20,
    letterSpacing: 1,
    marginBottom:  20,
    marginTop:     6,
  },

  // Error state
  errorCard: {
    borderRadius:    20,
    borderWidth:     1,
    alignItems:      'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
    marginBottom:    24,
  },
  errorIcon:  { fontSize: 36, marginBottom: 14 },
  errorTitle: { fontSize: 17, fontWeight: '500', letterSpacing: 0.2, marginBottom: 8 },
  errorSub:   { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  retryBtn: {
    borderWidth:       1,
    borderRadius:      50,
    paddingHorizontal: 28,
    paddingVertical:   10,
  },
  retryText: { fontSize: 14, fontWeight: '500', letterSpacing: 0.3 },

  // Action buttons
  actions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    borderRadius:    14,
    borderWidth:     1,
    paddingVertical: 14,
  },
  actionLabel: { fontSize: 14, fontWeight: '500', letterSpacing: 0.2 },

  attribution: { fontSize: 10, textAlign: 'center', letterSpacing: 0.3 },
});
