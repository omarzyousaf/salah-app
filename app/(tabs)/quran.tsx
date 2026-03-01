import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuranListSkeleton } from '@/components/Skeleton';
import { useTheme } from '@/context/ThemeContext';
import { fetchSurahList, type Surah } from '@/services/quran';

// Approximate height of each SurahRow: paddingVertical*2 (24) + content (~56) + marginBottom (8)
const SURAH_ROW_H = 88;

// ─── Constants ────────────────────────────────────────────────────────────────

const LAST_READ_KEY = 'salah_last_read_v1';

type LastRead = { surah: number; ayah: number } | null;

// ─── Surah row ────────────────────────────────────────────────────────────────

function SurahRow({
  surah,
  isLastRead,
  onPress,
}: {
  surah:       Surah;
  isLastRead:  boolean;
  onPress:     () => void;
}) {
  const { colors, palette } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scaleAnim, {
      toValue:         0.97,
      useNativeDriver: true,
      tension:         300,
      friction:        20,
    }).start();
  }

  function onPressOut() {
    Animated.spring(scaleAnim, {
      toValue:         1,
      useNativeDriver: true,
      tension:         300,
      friction:        20,
    }).start();
  }

  const a11yLabel = `Surah ${surah.englishName}, ${surah.englishNameTranslation}, ${surah.numberOfAyahs} verses${isLastRead ? ', currently reading' : ''}`;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.surahCard,
          {
            backgroundColor: colors.card,
            borderColor:     isLastRead ? palette.gold : colors.border,
          },
          isLastRead && { borderWidth: 1.5 },
        ]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        {/* Gold left accent when it's the last-read surah */}
        {isLastRead && (
          <View style={[styles.readAccent, { backgroundColor: palette.gold }]} />
        )}

        {/* Number badge */}
        <View
          style={[
            styles.badge,
            {
              backgroundColor: isLastRead
                ? 'rgba(200,169,110,0.15)'
                : colors.cardAlt,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeNum,
              {
                color:      isLastRead ? palette.gold : colors.textMuted,
                fontFamily: 'SpaceMono',
              },
            ]}
          >
            {surah.number}
          </Text>
        </View>

        {/* English name + meaning + meta */}
        <View style={styles.nameBlock}>
          <Text
            style={[
              styles.engName,
              { color: isLastRead ? palette.gold : colors.text },
            ]}
          >
            {surah.englishName}
          </Text>
          <Text
            style={[styles.meaning, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {surah.englishNameTranslation}
          </Text>
          <View style={styles.meta}>
            <View
              style={[
                styles.revBadge,
                {
                  backgroundColor:
                    surah.revelationType === 'Meccan'
                      ? 'rgba(200,169,110,0.12)'
                      : 'rgba(27,67,50,0.22)',
                },
              ]}
            >
              <Text
                style={[
                  styles.revText,
                  {
                    color:
                      surah.revelationType === 'Meccan'
                        ? palette.gold
                        : palette.greenLight,
                  },
                ]}
              >
                {surah.revelationType}
              </Text>
            </View>
            <Text style={[styles.ayahCount, { color: colors.tabInactive }]}>
              {surah.numberOfAyahs} verses
            </Text>
          </View>
        </View>

        {/* Arabic name + continue-reading pill */}
        <View style={styles.rightBlock}>
          <Text
            style={[
              styles.arabicName,
              { color: isLastRead ? palette.gold : colors.text },
            ]}
          >
            {surah.name}
          </Text>
          {isLastRead && (
            <View
              style={[
                styles.continuePill,
                { backgroundColor: 'rgba(200,169,110,0.12)' },
              ]}
            >
              <Text style={[styles.continueText, { color: palette.gold }]}>
                reading
              </Text>
            </View>
          )}
        </View>

        <Ionicons
          name="chevron-forward"
          size={14}
          color={isLastRead ? palette.gold : colors.tabInactive}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function QuranScreen() {
  const { colors, palette } = useTheme();

  const [surahs,   setSurahs]   = useState<Surah[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [lastRead, setLastRead] = useState<LastRead>(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_READ_KEY)
      .then(v => { if (v) setLastRead(JSON.parse(v) as LastRead); })
      .catch(() => {});

    fetchSurahList()
      .then(setSurahs)
      .catch(() => setError('Network error — check your connection.'))
      .finally(() => setLoading(false));
  }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const filtered = q
    ? surahs.filter(s =>
        s.englishName.toLowerCase().includes(q) ||
        s.englishNameTranslation.toLowerCase().includes(q) ||
        String(s.number).startsWith(q),
      )
    : surahs;

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
          <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.cardAlt }} />
        </View>
        <View style={styles.header}>
          <View style={{ width: 140, height: 24, borderRadius: 8, backgroundColor: colors.cardAlt, marginBottom: 6 }} />
          <View style={{ width: 70, height: 11, borderRadius: 6, backgroundColor: colors.cardAlt }} />
        </View>
        <QuranListSkeleton />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.centerText, { color: colors.textMuted }]}>{error}</Text>
      </View>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>

      {/* ── Search bar ── */}
      <View
        style={[
          styles.searchBar,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name or number…"
          placeholderTextColor={colors.tabInactive}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color={colors.tabInactive} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={[styles.headerArabic, { color: colors.text }]}>
          القرآن الكريم
        </Text>
        <Text style={[styles.headerSub, { color: colors.textMuted }]}>
          {filtered.length === surahs.length
            ? '114 Surahs'
            : `${filtered.length} of 114`}
        </Text>
      </View>

      {/* ── Surah list ── */}
      <FlatList
        data={filtered}
        keyExtractor={s => String(s.number)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // ── Performance ──────────────────────────────────────────────────
        getItemLayout={(_data, index) => ({
          length: SURAH_ROW_H,
          offset: SURAH_ROW_H * index,
          index,
        })}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) => (
          <SurahRow
            surah={item}
            isLastRead={lastRead?.surah === item.number}
            onPress={() =>
              router.push({ pathname: '/quran/[surah]', params: { surah: item.number } })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  centerText: { marginTop: 14, fontSize: 13, letterSpacing: 0.3, textAlign: 'center' },

  // Search
  searchBar: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    marginHorizontal:  16,
    marginTop:         12,
    marginBottom:      8,
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      12,
    borderWidth:       1,
  },
  searchInput: { flex: 1, fontSize: 14, letterSpacing: 0.2 },

  // Header
  header:       { paddingHorizontal: 16, paddingBottom: 10 },
  headerArabic: { fontSize: 26, letterSpacing: 1, marginBottom: 2 },
  headerSub:    { fontSize: 11, letterSpacing: 0.5 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  // Surah row card
  surahCard: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      14,
    borderWidth:       1,
    marginBottom:      8,
    paddingVertical:   12,
    paddingHorizontal: 14,
    overflow:          'hidden',
    position:          'relative',
    gap:               0,
  },
  readAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
  },
  badge: {
    width:          38,
    height:         38,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    12,
    flexShrink:     0,
  },
  badgeNum: { fontSize: 13 },

  nameBlock:  { flex: 1, marginRight: 8 },
  engName:    { fontSize: 15, fontWeight: '500', letterSpacing: 0.2, marginBottom: 1 },
  meaning:    { fontSize: 11, letterSpacing: 0.2, marginBottom: 4 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  revBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  revText:    { fontSize: 9, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  ayahCount:  { fontSize: 10, letterSpacing: 0.2 },

  rightBlock:   { alignItems: 'flex-end', marginRight: 8, gap: 4 },
  arabicName:   { fontSize: 18 },
  continuePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  continueText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.4 },
});
