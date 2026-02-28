import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AyahCard from '@/components/AyahCard';
import { useTheme } from '@/context/ThemeContext';
import { fetchSurahDetail, type SurahDetail } from '@/services/quran';

// ─── Constants ────────────────────────────────────────────────────────────────

// Estimated average height per ayah (Arabic 48px line-height × ~3 lines +
// transliteration + English + padding). Used by getItemLayout for O(1)
// scroll-to-index. Actual heights vary; this is a reasonable midpoint.
const ESTIMATED_ITEM_HEIGHT = 260;

const LAST_READ_KEY = 'salah_last_read_v1';

// ─── Types ────────────────────────────────────────────────────────────────────

type AyahItem = {
  numberInSurah:   number;
  arabic:          string;
  transliteration: string;
  english:         string;
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonScreen() {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.82, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.40, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  function Bone({ style }: { style: object }) {
    return (
      <Animated.View
        style={[{ backgroundColor: colors.cardAlt, borderRadius: 6 }, style, { opacity: anim }]}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View
          key={i}
          style={[
            skStyles.card,
            { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <Bone style={skStyles.badge} />
          <Bone style={skStyles.arabic} />
          <Bone style={skStyles.line1} />
          <Bone style={skStyles.line2} />
        </View>
      ))}
    </View>
  );
}

const skStyles = StyleSheet.create({
  card:   { paddingHorizontal: 20, paddingVertical: 22 },
  badge:  { width: 36, height: 36, borderRadius: 10, marginBottom: 18 },
  arabic: { height: 70, borderRadius: 8, marginBottom: 16 },
  line1:  { height: 13, borderRadius: 6, marginBottom: 8, width: '80%' },
  line2:  { height: 13, borderRadius: 6, width: '60%' },
});

// ─── Surah info header (inside FlatList) ──────────────────────────────────────

function SurahInfoHeader({ detail }: { detail: SurahDetail }) {
  const { colors, palette } = useTheme();
  return (
    <View style={[infoStyles.wrap, { borderBottomColor: colors.border }]}>
      {/* Gold diamond divider */}
      <View style={infoStyles.divider}>
        <View style={[infoStyles.divLine,    { backgroundColor: colors.border }]} />
        <View style={[infoStyles.divDiamond, { backgroundColor: palette.gold }]} />
        <View style={[infoStyles.divLine,    { backgroundColor: colors.border }]} />
      </View>

      {/* Meaning */}
      <Text style={[infoStyles.meaning, { color: colors.textMuted }]}>
        {detail.englishNameTranslation}
      </Text>

      {/* Revelation type + ayah count chips */}
      <View style={infoStyles.chips}>
        <View
          style={[
            infoStyles.chip,
            {
              backgroundColor:
                detail.revelationType === 'Meccan'
                  ? 'rgba(200,169,110,0.12)'
                  : 'rgba(27,67,50,0.22)',
            },
          ]}
        >
          <Text
            style={[
              infoStyles.chipText,
              {
                color:
                  detail.revelationType === 'Meccan'
                    ? palette.gold
                    : '#2D6A4F',
              },
            ]}
          >
            {detail.revelationType}
          </Text>
        </View>
        <View style={[infoStyles.chip, { backgroundColor: colors.cardAlt }]}>
          <Text style={[infoStyles.chipText, { color: colors.textMuted }]}>
            {detail.numberOfAyahs} verses
          </Text>
        </View>
      </View>

      {/* Divider again */}
      <View style={infoStyles.divider}>
        <View style={[infoStyles.divLine,    { backgroundColor: colors.border }]} />
        <View style={[infoStyles.divDiamond, { backgroundColor: palette.gold }]} />
        <View style={[infoStyles.divLine,    { backgroundColor: colors.border }]} />
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingVertical:   20,
    alignItems:        'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  divider:    { flexDirection: 'row', alignItems: 'center', width: '50%', marginVertical: 10 },
  divLine:    { flex: 1, height: 1 },
  divDiamond: { width: 6, height: 6, transform: [{ rotate: '45deg' }], marginHorizontal: 8 },
  meaning:    { fontSize: 13, letterSpacing: 0.3, fontStyle: 'italic', marginBottom: 10 },
  chips:      { flexDirection: 'row', gap: 8, marginBottom: 4 },
  chip:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  chipText:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
});

// ─── Jump to Ayah modal ────────────────────────────────────────────────────────

function JumpModal({
  visible,
  totalAyahs,
  jumpText,
  onChangeText,
  onJump,
  onClose,
}: {
  visible:      boolean;
  totalAyahs:   number;
  jumpText:     string;
  onChangeText: (t: string) => void;
  onJump:       () => void;
  onClose:      () => void;
}) {
  const { colors, palette } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={jumpStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={jumpStyles.backdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            jumpStyles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[jumpStyles.title, { color: colors.text }]}>Jump to Ayah</Text>
          <TextInput
            style={[
              jumpStyles.input,
              {
                color:           colors.text,
                borderColor:     colors.border,
                backgroundColor: colors.cardAlt,
              },
            ]}
            keyboardType="number-pad"
            placeholder={`1 – ${totalAyahs}`}
            placeholderTextColor={colors.tabInactive}
            value={jumpText}
            onChangeText={onChangeText}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={onJump}
          />
          <TouchableOpacity
            style={[jumpStyles.btn, { backgroundColor: palette.gold }]}
            onPress={onJump}
            activeOpacity={0.8}
          >
            <Text style={jumpStyles.btnText}>Go</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const jumpStyles = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    borderTopWidth:       1,
    paddingHorizontal:    24,
    paddingTop:           24,
    paddingBottom:        40,
    gap:                  14,
  },
  title: { fontSize: 17, fontWeight: '500', letterSpacing: 0.3 },
  input: {
    height:            52,
    borderRadius:      12,
    borderWidth:       1,
    paddingHorizontal: 16,
    fontSize:          22,
    letterSpacing:     0.5,
  },
  btn: {
    height:         52,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  btnText: { color: '#111', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SurahDetailScreen() {
  const { surah: surahParam } = useLocalSearchParams<{ surah: string }>();
  const surahNum = parseInt(surahParam ?? '1', 10);
  const { colors, palette } = useTheme();

  const [detail,      setDetail]      = useState<SurahDetail | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [jumpVisible, setJumpVisible] = useState(false);
  const [jumpText,    setJumpText]    = useState('');

  const listRef         = useRef<FlatList<AyahItem>>(null);
  const hasRestoredRef  = useRef(false);

  // ── Build merged ayah list ────────────────────────────────────────────────

  const ayahs = useMemo<AyahItem[]>(() => {
    if (!detail) return [];
    return detail.ayahs.arabic.map((a, i) => ({
      numberInSurah:   a.numberInSurah,
      arabic:          a.text,
      transliteration: detail.ayahs.transliteration[i]?.text ?? '',
      english:         detail.ayahs.english[i]?.text ?? '',
    }));
  }, [detail]);

  // ── Fetch on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    fetchSurahDetail(surahNum)
      .then(setDetail)
      .catch(() => setError('Could not load surah — check your connection.'))
      .finally(() => setLoading(false));
  }, [surahNum]);

  // ── Restore last-read position once data arrives ──────────────────────────

  useEffect(() => {
    if (ayahs.length === 0 || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    AsyncStorage.getItem(LAST_READ_KEY)
      .then(v => {
        if (!v) return;
        const lr = JSON.parse(v) as { surah: number; ayah: number };
        if (lr.surah !== surahNum || lr.ayah <= 1) return;

        const idx = lr.ayah - 1;
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
        }, 150);
      })
      .catch(() => {});
  }, [ayahs.length, surahNum]);

  // ── Save last-read position as user scrolls ───────────────────────────────
  // Must be a stable ref — FlatList warns if these props change after mount

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });

  const onViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: AyahItem }> }) => {
      if (!viewableItems.length) return;
      AsyncStorage.setItem(
        LAST_READ_KEY,
        JSON.stringify({ surah: surahNum, ayah: viewableItems[0].item.numberInSurah }),
      ).catch(() => {});
    },
  );

  // ── Jump to ayah ──────────────────────────────────────────────────────────

  function handleJump() {
    const n = parseInt(jumpText, 10);
    if (!detail || !n || n < 1 || n > detail.numberOfAyahs) return;
    listRef.current?.scrollToIndex({ index: n - 1, animated: true });
    setJumpVisible(false);
    setJumpText('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>

      {/* ── Fixed top bar ── */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.topBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={[styles.topArabic, { color: palette.gold }]}>
            {detail?.name ?? ''}
          </Text>
          <Text style={[styles.topEng, { color: colors.textMuted }]}>
            {detail?.englishName ?? (loading ? 'Loading…' : '')}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setJumpVisible(true)}
          style={styles.topBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          disabled={!detail}
        >
          <MaterialCommunityIcons
            name="format-list-numbered"
            size={20}
            color={detail ? colors.text : colors.tabInactive}
          />
        </TouchableOpacity>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <SkeletonScreen />
      ) : error ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={44} color={colors.textMuted} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
        </View>
      ) : (
        <FlatList<AyahItem>
          ref={listRef}
          data={ayahs}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}

          // ── Performance ──────────────────────────────────────────────────
          // getItemLayout enables O(1) index-based scrolling (jump to ayah,
          // restore position). Uses an estimated average height — actual heights
          // vary by verse length, but this is a good-enough midpoint for all
          // 114 surahs. Short surahs are unaffected; long ones scroll near target.
          getItemLayout={(_data, index) => ({
            length: ESTIMATED_ITEM_HEIGHT,
            offset: ESTIMATED_ITEM_HEIGHT * index,
            index,
          })}
          initialNumToRender={6}
          maxToRenderPerBatch={5}
          windowSize={8}
          removeClippedSubviews={Platform.OS === 'android'}

          // ── Scroll-to-index failure fallback ─────────────────────────────
          onScrollToIndexFailed={info => {
            const offset = info.averageItemLength * info.index;
            listRef.current?.scrollToOffset({ offset, animated: false });
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 300);
          }}

          // ── Save last-read position ───────────────────────────────────────
          onViewableItemsChanged={onViewableItemsChangedRef.current}
          viewabilityConfig={viewabilityConfig.current}

          ListHeaderComponent={detail ? <SurahInfoHeader detail={detail} /> : null}

          renderItem={({ item, index }) => (
            <AyahCard
              numberInSurah={item.numberInSurah}
              arabic={item.arabic}
              transliteration={item.transliteration}
              english={item.english}
              isLast={index === ayahs.length - 1}
            />
          )}
        />
      )}

      {/* ── Jump to Ayah modal ── */}
      {detail && (
        <JumpModal
          visible={jumpVisible}
          totalAyahs={detail.numberOfAyahs}
          jumpText={jumpText}
          onChangeText={setJumpText}
          onJump={handleJump}
          onClose={() => { setJumpVisible(false); setJumpText(''); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  errorText: { marginTop: 14, fontSize: 13, textAlign: 'center', letterSpacing: 0.2 },

  // Top bar
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBtn: {
    width:          40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  topCenter: {
    flex:       1,
    alignItems: 'center',
  },
  topArabic: {
    fontSize:   18,
    letterSpacing: 0.5,
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'GeezaPro' : 'serif',
    // Replace with 'Amiri' once font is loaded
  },
  topEng: {
    fontSize:      11,
    letterSpacing: 0.8,
    fontWeight:    '300',
    marginTop:     2,
  },

  // List
  listContent: { paddingBottom: 60 },
});
