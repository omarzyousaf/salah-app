import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Surah = {
  number:                 number;
  name:                   string;   // Arabic
  englishName:            string;   // transliteration
  englishNameTranslation: string;   // English meaning
  numberOfAyahs:          number;
  revelationType:         'Meccan' | 'Medinan';
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SURAHS_URL  = 'https://api.alquran.cloud/v1/surah';
const AUDIO_BASE  = 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy';

function audioUrl(num: number) {
  return `${AUDIO_BASE}/${num}.mp3`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SurahCard({
  surah,
  isPlaying,
  isBuffering,
  onPress,
}: {
  surah:      Surah;
  isPlaying:  boolean;
  isBuffering: boolean;
  onPress:    () => void;
}) {
  const { colors, palette } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.surahCard,
        { backgroundColor: colors.card, borderColor: isPlaying ? palette.gold : colors.border },
        isPlaying && { borderWidth: 1.5 },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Gold accent when playing */}
      {isPlaying && (
        <View style={[styles.playingAccent, { backgroundColor: palette.gold }]} />
      )}

      {/* Number badge */}
      <View style={[styles.badge, { backgroundColor: isPlaying ? palette.gold : colors.cardAlt }]}>
        <Text style={[styles.badgeNum, { color: isPlaying ? '#111' : colors.textMuted }]}>
          {surah.number}
        </Text>
      </View>

      {/* Names */}
      <View style={styles.nameBlock}>
        <Text style={[styles.engName, { color: isPlaying ? palette.gold : colors.text }]}>
          {surah.englishName}
        </Text>
        <Text style={[styles.engMeaning, { color: colors.textMuted }]} numberOfLines={1}>
          {surah.englishNameTranslation}
        </Text>
        <View style={styles.meta}>
          <View
            style={[
              styles.revBadge,
              { backgroundColor: surah.revelationType === 'Meccan' ? 'rgba(200,169,110,0.15)' : 'rgba(27,67,50,0.25)' },
            ]}
          >
            <Text
              style={[
                styles.revText,
                { color: surah.revelationType === 'Meccan' ? palette.gold : '#2D6A4F' },
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

      {/* Arabic name */}
      <Text style={[styles.arabicName, { color: isPlaying ? palette.gold : colors.textMuted }]}>
        {surah.name}
      </Text>

      {/* Play icon */}
      <View style={styles.playBtn}>
        {isBuffering ? (
          <ActivityIndicator size="small" color={palette.gold} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause-circle' : 'play-circle-outline'}
            size={28}
            color={isPlaying ? palette.gold : colors.tabInactive}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Mini Player Bar ──────────────────────────────────────────────────────────

function PlayerBar({
  surah,
  isPlaying,
  isBuffering,
  position,
  duration,
  onToggle,
  onClose,
}: {
  surah:      Surah;
  isPlaying:  boolean;
  isBuffering: boolean;
  position:   number;
  duration:   number;
  onToggle:   () => void;
  onClose:    () => void;
}) {
  const { colors, palette } = useTheme();
  const progress = duration > 0 ? position / duration : 0;

  function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <View style={[styles.player, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.cardAlt }]}>
        <View style={[styles.progressFill, { backgroundColor: palette.gold, width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.playerBody}>
        {/* Surah info */}
        <View style={styles.playerInfo}>
          <Text style={[styles.playerArabic, { color: palette.gold }]}>{surah.name}</Text>
          <Text style={[styles.playerEng, { color: colors.textMuted }]} numberOfLines={1}>
            {surah.englishName} · {fmt(position)} / {fmt(duration)}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.playerControls}>
          <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
            {isBuffering ? (
              <ActivityIndicator size="small" color={palette.gold} />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause-circle' : 'play-circle'}
                size={38}
                color={palette.gold}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function QuranScreen() {
  const { colors, palette } = useTheme();

  const [surahs,      setSurahs]      = useState<Surah[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState('');

  // Audio
  const soundRef       = useRef<Audio.Sound | null>(null);
  const [playingNum,   setPlayingNum]   = useState<number | null>(null);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isBuffering,  setIsBuffering]  = useState(false);
  const [position,     setPosition]     = useState(0);
  const [duration,     setDuration]     = useState(0);

  // ── Init: configure audio + fetch surahs ───────────────────────────────────

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS:  true,
      allowsRecordingIOS:    false,
      staysActiveInBackground: true,
    }).catch(() => {});

    fetch(SURAHS_URL)
      .then((r) => r.json())
      .then((json) => {
        if (json.code === 200 && Array.isArray(json.data)) {
          setSurahs(json.data as Surah[]);
        } else {
          setError('Could not load Surah list.');
        }
      })
      .catch(() => setError('Network error — check your connection.'))
      .finally(() => setLoading(false));

    // Cleanup: unload sound on unmount
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  // ── Status callback ────────────────────────────────────────────────────────

  function onPlaybackStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setPosition(status.positionMillis);
    setDuration(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying);
    setIsBuffering(status.isBuffering);
    if (status.didJustFinish) {
      setPlayingNum(null);
      setIsPlaying(false);
      setPosition(0);
    }
  }

  // ── Play / pause / close ──────────────────────────────────────────────────

  async function handlePress(surah: Surah) {
    const num = surah.number;

    // Same surah: toggle pause/play
    if (playingNum === num && soundRef.current) {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
      return;
    }

    // Different surah: stop existing, load new
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    setPlayingNum(num);
    setIsBuffering(true);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl(num) },
        { shouldPlay: true },
        onPlaybackStatus,
      );
      soundRef.current = sound;
    } catch {
      setPlayingNum(null);
      setIsBuffering(false);
    }
  }

  async function handleTogglePlayer() {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  }

  async function handleClose() {
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlayingNum(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const filtered = q
    ? surahs.filter(
        (s) =>
          s.englishName.toLowerCase().includes(q) ||
          s.englishNameTranslation.toLowerCase().includes(q) ||
          String(s.number).startsWith(q),
      )
    : surahs;

  const playingSurah = surahs.find((s) => s.number === playingNum) ?? null;

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={palette.gold} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading Quran…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
      </View>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>

      {/* ── Search bar ── */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search surahs…"
          placeholderTextColor={colors.tabInactive}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={colors.tabInactive} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>القرآن الكريم</Text>
        <Text style={[styles.headerSub, { color: colors.textMuted }]}>
          {filtered.length === surahs.length
            ? '114 Surahs'
            : `${filtered.length} of 114`}
        </Text>
      </View>

      {/* ── Surah list ── */}
      <FlatList
        data={filtered}
        keyExtractor={(s) => String(s.number)}
        contentContainerStyle={[
          styles.listContent,
          playingSurah && { paddingBottom: 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <SurahCard
            surah={item}
            isPlaying={item.number === playingNum}
            isBuffering={item.number === playingNum && isBuffering}
            onPress={() => handlePress(item)}
          />
        )}
      />

      {/* ── Mini player ── */}
      {playingSurah && (
        <PlayerBar
          surah={playingSurah}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          position={position}
          duration={duration}
          onToggle={handleTogglePlayer}
          onClose={handleClose}
        />
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },

  loadingText: { marginTop: 14, fontSize: 13, letterSpacing: 0.3 },
  errorText:   { marginTop: 16, fontSize: 13, textAlign: 'center' },

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
  header:      { paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { fontSize: 26, letterSpacing: 1, marginBottom: 2 },
  headerSub:   { fontSize: 11, letterSpacing: 0.5 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },

  // Surah card
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
  },
  playingAccent: {
    position:     'absolute',
    left:         0, top: 0, bottom: 0,
    width:        3,
  },
  badge: {
    width:         38,
    height:        38,
    borderRadius:  10,
    alignItems:    'center',
    justifyContent: 'center',
    marginRight:   12,
    flexShrink:    0,
  },
  badgeNum:   { fontSize: 13, fontFamily: 'SpaceMono' },
  nameBlock:  { flex: 1, marginRight: 8 },
  engName:    { fontSize: 15, fontWeight: '500', letterSpacing: 0.2, marginBottom: 1 },
  engMeaning: { fontSize: 11, letterSpacing: 0.2, marginBottom: 4 },

  meta:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  revBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  revText:    { fontSize: 9, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  ayahCount:  { fontSize: 10, letterSpacing: 0.2 },

  arabicName: { fontSize: 18, marginRight: 10, textAlign: 'right' },
  playBtn:    { width: 32, alignItems: 'center' },

  // Player bar
  player: {
    position:   'absolute',
    bottom:     0,
    left:       0,
    right:      0,
    borderTopWidth: 1,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  progressTrack: { height: 2, width: '100%' },
  progressFill:  { height: '100%' },
  playerBody: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    gap:               12,
  },
  playerInfo:     { flex: 1 },
  playerArabic:   { fontSize: 18, letterSpacing: 0.5, marginBottom: 2 },
  playerEng:      { fontSize: 11, letterSpacing: 0.2 },
  playerControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeBtn:       { padding: 4 },
});
