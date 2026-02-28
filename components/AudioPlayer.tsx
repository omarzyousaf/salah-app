/**
 * AudioPlayer — floating bottom bar for Quran ayah recitation.
 *
 * Features:
 *  • Play/pause, previous ayah, next ayah, stop
 *  • Per-ayah progress bar (smooth, width-based)
 *  • Reciter selector: Mishary Alafasy, Abdul Basit, Abu Bakr al-Shatri
 *  • Auto-advances to next ayah on finish
 *  • Background audio: continues when app is backgrounded (home button)
 *  • Loading indicator while buffering
 *  • Spring-animated button press feedback
 *
 * Audio source: cdn.islamic.network/quran/audio/128/{reciter}/{globalAyahNumber}.mp3
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import { ayahAudioUrl, type AyahItem } from '@/services/quran';
import { getSettings } from '@/services/settings';

// ─── Reciter definitions ──────────────────────────────────────────────────────

const RECITERS = [
  { id: 'ar.alafasy',             label: 'Mishary Alafasy',     short: 'Alafasy'  },
  { id: 'ar.abdulbasitmurattal',  label: 'Abdul Basit',         short: 'A. Basit' },
  { id: 'ar.shaatree',            label: 'Abu Bakr al-Shatri',  short: 'Al-Shatri'},
] as const;

type ReciterId = typeof RECITERS[number]['id'];

// ─── Animated control button ──────────────────────────────────────────────────

function CtrlBtn({
  icon,
  size = 22,
  color,
  disabled = false,
  onPress,
}: {
  icon:       string;
  size?:      number;
  color:      string;
  disabled?:  boolean;
  onPress:    () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scaleAnim, { toValue: 0.82, useNativeDriver: true, tension: 280, friction: 18 }).start();
  }
  function pressOut() {
    Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 280, friction: 18 }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: disabled ? 0.35 : 1 }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={1}
      >
        <MaterialCommunityIcons name={icon as any} size={size} color={color} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  ayahs:        AyahItem[];
  onAyahChange: (idx: number | null) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AudioPlayer({ ayahs, onAyahChange }: Props) {
  const { colors, palette } = useTheme();
  const insets = useSafeAreaInsets();

  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [reciter,     setReciter]     = useState<ReciterId>('ar.alafasy');
  const [reciterOpen, setReciterOpen] = useState(false);

  // Load default reciter from settings on mount
  useEffect(() => {
    getSettings().then(s => {
      if (RECITERS.some(r => r.id === s.reciter)) {
        reciterRef.current = s.reciter as ReciterId;
        setReciter(s.reciter as ReciterId);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [hasStarted,  setHasStarted]  = useState(false);
  const [trackWidth,  setTrackWidth]  = useState(0);

  // Refs keep closure-safe latest values for async callbacks
  const currentIdxRef = useRef(0);
  const reciterRef    = useRef<ReciterId>('ar.alafasy');
  const ayahsRef      = useRef(ayahs);
  ayahsRef.current    = ayahs;

  // expo-audio player — null source until user starts playback
  // updateInterval 150ms gives smooth progress bar updates
  const player = useAudioPlayer(null, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);

  // ── Configure background audio on mount ────────────────────────────────────

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode:      true,   // plays over iOS silent switch
      shouldPlayInBackground: true,   // continues when app is backgrounded
      interruptionMode:       'doNotMix',
    }).catch(() => {});
  }, []);

  // ── Auto-advance when an ayah finishes ─────────────────────────────────────

  useEffect(() => {
    if (!status.didJustFinish) return;
    const nextIdx = currentIdxRef.current + 1;
    if (nextIdx < ayahsRef.current.length) {
      loadAndPlay(nextIdx);
    } else {
      // End of surah — reset
      setHasStarted(false);
      setCurrentIdx(0);
      currentIdxRef.current = 0;
      onAyahChange(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  // ── Core: load + play an ayah by index ────────────────────────────────────

  const loadAndPlay = useCallback((idx: number, rt?: ReciterId) => {
    const activeReciter = rt ?? reciterRef.current;
    const uri = ayahAudioUrl(ayahsRef.current[idx].globalNumber, activeReciter);

    currentIdxRef.current = idx;
    setCurrentIdx(idx);
    setHasStarted(true);
    onAyahChange(idx);

    player.replace({ uri });
    player.play();
  }, [player, onAyahChange]);

  // ── Controls ───────────────────────────────────────────────────────────────

  function handlePlayPause() {
    if (!hasStarted) {
      loadAndPlay(currentIdx);
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  function handlePrev() {
    loadAndPlay(Math.max(0, currentIdxRef.current - 1));
  }

  function handleNext() {
    loadAndPlay(Math.min(ayahs.length - 1, currentIdxRef.current + 1));
  }

  function handleStop() {
    player.pause();
    setHasStarted(false);
    setCurrentIdx(0);
    currentIdxRef.current = 0;
    onAyahChange(null);
  }

  function selectReciter(id: ReciterId) {
    reciterRef.current = id;
    setReciter(id);
    setReciterOpen(false);
    // Reload current ayah with new reciter if already playing
    if (hasStarted) {
      loadAndPlay(currentIdxRef.current, id);
    }
  }

  // ── Progress ───────────────────────────────────────────────────────────────

  const progress     = status.duration > 0 ? status.currentTime / status.duration : 0;
  const fillWidth    = trackWidth * progress;

  function fmt(secs: number) {
    const s = Math.floor(secs);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const isBuffering  = status.isBuffering && hasStarted;
  const ctrlColor    = colors.text;
  const dimColor     = colors.tabInactive;
  const bottomPad    = insets.bottom > 0 ? insets.bottom : 8;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.wrapper}>
      {/* ── Reciter dropdown (floats above bar) ── */}
      {reciterOpen && (
        <View
          style={[
            styles.dropdown,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {RECITERS.map(r => (
            <TouchableOpacity
              key={r.id}
              style={[
                styles.dropdownItem,
                r.id === reciter && { backgroundColor: 'rgba(200,169,110,0.10)' },
              ]}
              onPress={() => selectReciter(r.id)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.dropdownText,
                  { color: r.id === reciter ? palette.gold : colors.text },
                ]}
              >
                {r.label}
              </Text>
              {r.id === reciter && (
                <MaterialCommunityIcons name="check" size={15} color={palette.gold} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Player bar ── */}
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.card,
            borderColor:      colors.border,
            paddingBottom:    bottomPad,
            ...Platform.select({
              ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.10, shadowRadius: 10 },
              android: { elevation: 12 },
            }),
          },
        ]}
      >
        {/* Progress track */}
        <View
          style={[styles.progressTrack, { backgroundColor: colors.cardAlt }]}
          onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: palette.gold, width: fillWidth },
            ]}
          />
        </View>

        {/* Controls + metadata row */}
        <View style={styles.body}>
          {/* ── Playback controls ── */}
          <View style={styles.controls}>
            <CtrlBtn
              icon="skip-previous"
              size={26}
              color={hasStarted && currentIdx > 0 ? ctrlColor : dimColor}
              disabled={!hasStarted || currentIdx === 0}
              onPress={handlePrev}
            />

            {isBuffering ? (
              <ActivityIndicator
                size={Platform.OS === 'ios' ? 'small' : 28}
                color={palette.gold}
                style={styles.playBtnWrap}
              />
            ) : (
              <CtrlBtn
                icon={status.playing ? 'pause-circle' : 'play-circle'}
                size={42}
                color={palette.gold}
                onPress={handlePlayPause}
              />
            )}

            <CtrlBtn
              icon="skip-next"
              size={26}
              color={hasStarted && currentIdx < ayahs.length - 1 ? ctrlColor : dimColor}
              disabled={!hasStarted || currentIdx >= ayahs.length - 1}
              onPress={handleNext}
            />

            <CtrlBtn
              icon="stop"
              size={20}
              color={hasStarted ? ctrlColor : dimColor}
              disabled={!hasStarted}
              onPress={handleStop}
            />
          </View>

          {/* ── Right metadata ── */}
          <View style={styles.meta}>
            {/* Reciter selector */}
            <TouchableOpacity
              style={[
                styles.reciterBtn,
                { backgroundColor: colors.cardAlt, borderColor: colors.border },
              ]}
              onPress={() => setReciterOpen(v => !v)}
              activeOpacity={0.75}
            >
              <Text
                style={[styles.reciterLabel, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {RECITERS.find(r => r.id === reciter)?.short ?? ''}
              </Text>
              <MaterialCommunityIcons
                name={reciterOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={colors.tabInactive}
              />
            </TouchableOpacity>

            {/* Ayah position + time */}
            <View style={styles.position}>
              <Text style={[styles.positionText, { color: colors.tabInactive }]}>
                {hasStarted
                  ? `${currentIdx + 1} / ${ayahs.length}`
                  : `— / ${ayahs.length}`}
              </Text>
              {hasStarted && status.currentTime > 0 && (
                <Text style={[styles.timeText, { color: colors.tabInactive }]}>
                  {fmt(status.currentTime)}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Outer wrapper — clips nothing, allows dropdown to float above
  wrapper: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    zIndex:   100,
  },

  // Reciter dropdown positioned above bar
  dropdown: {
    borderRadius:  14,
    borderWidth:   1,
    marginHorizontal: 16,
    marginBottom:  8,
    overflow:      'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  dropdownItem: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 18,
    paddingVertical:   13,
  },
  dropdownText: { fontSize: 14, letterSpacing: 0.2 },

  // Player bar
  bar: {
    borderTopWidth: 1,
  },

  // Progress track
  progressTrack: {
    height: 3,
    width:  '100%',
  },
  progressFill: {
    height: '100%',
  },

  // Body row
  body: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingTop:        10,
    gap:               12,
  },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  playBtnWrap: {
    width:  42,
    height: 42,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Right metadata section
  meta: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'flex-end',
    gap:           8,
  },

  // Reciter selector pill
  reciterBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    paddingHorizontal: 8,
    paddingVertical:   5,
    borderRadius:      8,
    borderWidth:       1,
    maxWidth:          90,
  },
  reciterLabel: {
    fontSize:      11,
    letterSpacing: 0.2,
    flex:          1,
  },

  // Ayah position + time
  position: {
    alignItems: 'flex-end',
    gap:        2,
  },
  positionText: { fontSize: 11, letterSpacing: 0.3, fontFamily: 'SpaceMono' },
  timeText:     { fontSize: 10, letterSpacing: 0.2 },
});
