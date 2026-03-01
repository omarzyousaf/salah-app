/**
 * AudioPlayer — floating bottom bar for Quran ayah recitation.
 *
 * Features:
 *  • Play/pause, previous ayah, next ayah, stop
 *  • Scrubbable progress bar with elapsed / remaining time labels
 *  • Scrub thumb appears on touch; seeks on release via player.seekTo()
 *  • Reciter selector: Mishary Alafasy, Abdul Basit, Abu Bakr al-Shatri
 *  • Auto-advances to next ayah on finish
 *  • Background audio: continues when app is backgrounded
 *  • Loading indicator while buffering
 *  • Spring-animated button press feedback
 *  • Imperative ref: playAyah(idx) — called by parent when user taps an AyahCard
 *
 * Audio source: cdn.islamic.network/quran/audio/128/{reciter}/{globalAyahNumber}.mp3
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
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
  { id: 'ar.alafasy',            label: 'Mishary Alafasy',    short: 'Alafasy'   },
  { id: 'ar.abdulbasitmurattal', label: 'Abdul Basit',        short: 'A. Basit'  },
  { id: 'ar.shaatree',           label: 'Abu Bakr al-Shatri', short: 'Al-Shatri' },
] as const;

type ReciterId = typeof RECITERS[number]['id'];

// ─── Imperative ref interface ─────────────────────────────────────────────────

export interface AudioPlayerRef {
  /** Jump to and begin playing the ayah at the given 0-based list index. */
  playAyah: (idx: number) => void;
}

// ─── Animated control button ──────────────────────────────────────────────────

function CtrlBtn({
  icon,
  size = 22,
  color,
  disabled = false,
  onPress,
}: {
  icon:      string;
  size?:     number;
  color:     string;
  disabled?: boolean;
  onPress:   () => void;
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

const AudioPlayer = forwardRef<AudioPlayerRef, Props>(function AudioPlayer(
  { ayahs, onAyahChange },
  ref,
) {
  const { colors, palette } = useTheme();
  const insets = useSafeAreaInsets();

  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [reciter,     setReciter]     = useState<ReciterId>('ar.alafasy');
  const [reciterOpen, setReciterOpen] = useState(false);
  const [hasStarted,  setHasStarted]  = useState(false);
  const [trackWidth,  setTrackWidth]  = useState(0);

  // Scrubbing state
  const [isScrubbing,  setIsScrubbing]  = useState(false);
  const [scrubFraction, setScrubFraction] = useState(0);

  // Refs for use inside stable callbacks / PanResponder
  const currentIdxRef  = useRef(0);
  const reciterRef     = useRef<ReciterId>('ar.alafasy');
  const ayahsRef       = useRef(ayahs);
  ayahsRef.current     = ayahs;
  const trackWidthRef  = useRef(0);
  const startFracRef   = useRef(0); // fraction at touch-start (for delta scrubbing)

  // expo-audio player — null source until user starts playback
  const player = useAudioPlayer(null, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);

  // Keep a ref to the latest status for use inside PanResponder callbacks
  const statusRef      = useRef(status);
  statusRef.current    = status;

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

  // ── Configure background audio on mount ────────────────────────────────────

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode:      true,
      shouldPlayInBackground: true,
      interruptionMode:       'doNotMix',
    }).catch(() => {});
  }, []);

  // ── Core: load + play an ayah by index ─────────────────────────────────────

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

  // ── Expose playAyah to parent via ref ──────────────────────────────────────

  useImperativeHandle(ref, () => ({
    playAyah: (idx: number) => loadAndPlay(idx),
  }), [loadAndPlay]);

  // ── Auto-advance when an ayah finishes ─────────────────────────────────────

  useEffect(() => {
    if (!status.didJustFinish) return;
    const nextIdx = currentIdxRef.current + 1;
    if (nextIdx < ayahsRef.current.length) {
      loadAndPlay(nextIdx);
    } else {
      setHasStarted(false);
      setCurrentIdx(0);
      currentIdxRef.current = 0;
      onAyahChange(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  // ── Controls ───────────────────────────────────────────────────────────────

  function handlePlayPause() {
    if (!hasStarted) { loadAndPlay(currentIdx); return; }
    status.playing ? player.pause() : player.play();
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
    if (hasStarted) loadAndPlay(currentIdxRef.current, id);
  }

  // ── Scrubbable progress bar (PanResponder) ─────────────────────────────────
  //
  // Strategy: capture the fraction at touch-start, then add gestureState.dx / trackWidth
  // as the user drags. This uses the reliable dx delta rather than locationX, which can
  // drift during fast moves.  Seek is committed on release.

  const panResponder = useRef(
    PanResponder.create({
      // Only intercept when audio is loaded (duration > 0)
      onStartShouldSetPanResponder: () => statusRef.current.duration > 0,
      onMoveShouldSetPanResponder:  () => statusRef.current.duration > 0,

      onPanResponderGrant: (evt) => {
        const tw   = trackWidthRef.current;
        const rawX = evt.nativeEvent.locationX;
        const frac = tw > 0 ? Math.max(0, Math.min(1, rawX / tw)) : 0;
        startFracRef.current = frac;
        setIsScrubbing(true);
        setScrubFraction(frac);
      },

      onPanResponderMove: (_evt, gestureState) => {
        const tw   = trackWidthRef.current;
        if (!tw) return;
        const frac = Math.max(0, Math.min(1, startFracRef.current + gestureState.dx / tw));
        setScrubFraction(frac);
      },

      onPanResponderRelease: (_evt, gestureState) => {
        const tw   = trackWidthRef.current;
        const frac = Math.max(0, Math.min(1, startFracRef.current + (tw > 0 ? gestureState.dx / tw : 0)));
        const dur  = statusRef.current.duration;
        if (dur > 0) {
          player.seekTo(frac * dur).catch(() => {});
        }
        setIsScrubbing(false);
      },

      onPanResponderTerminate: () => {
        setIsScrubbing(false);
      },
    })
  ).current;

  // ── Derived display values ─────────────────────────────────────────────────

  const progress     = status.duration > 0 ? status.currentTime / status.duration : 0;
  const displayFrac  = isScrubbing ? scrubFraction : progress;
  const elapsed      = isScrubbing && status.duration > 0
    ? scrubFraction * status.duration
    : status.currentTime;
  const remaining    = Math.max(0, status.duration - (isScrubbing && status.duration > 0
    ? scrubFraction * status.duration
    : status.currentTime));

  const fillPx       = Math.max(0, displayFrac * trackWidth);
  const thumbLeft    = Math.max(0, Math.min(fillPx - THUMB_R, trackWidth - THUMB_SIZE));

  function fmt(secs: number) {
    const s = Math.floor(Math.max(0, secs));
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
        <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {RECITERS.map(r => (
            <TouchableOpacity
              key={r.id}
              style={[styles.dropdownItem, r.id === reciter && { backgroundColor: 'rgba(200,169,110,0.10)' }]}
              onPress={() => selectReciter(r.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.dropdownText, { color: r.id === reciter ? palette.gold : colors.text }]}>
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

        {/* ── Scrubbable progress section ── */}
        <View style={styles.progressSection}>

          {/* Elapsed time */}
          <Text style={[styles.timeLabel, { color: dimColor }]}>
            {hasStarted ? fmt(elapsed) : '0:00'}
          </Text>

          {/* Track + thumb touch area */}
          <View
            style={styles.progressTouchArea}
            onLayout={e => {
              const w = e.nativeEvent.layout.width;
              setTrackWidth(w);
              trackWidthRef.current = w;
            }}
            {...panResponder.panHandlers}
          >
            {/* Track rail */}
            <View style={[styles.progressRail, { backgroundColor: colors.cardAlt }]}>
              {/* Filled portion */}
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: palette.gold, width: fillPx },
                ]}
              />
            </View>

            {/* Scrub thumb — visible only while dragging */}
            {isScrubbing && (
              <View
                style={[
                  styles.scrubThumb,
                  { backgroundColor: palette.gold, left: thumbLeft },
                ]}
              />
            )}
          </View>

          {/* Remaining time */}
          <Text style={[styles.timeLabel, { color: dimColor }]}>
            {hasStarted ? `-${fmt(remaining)}` : '0:00'}
          </Text>
        </View>

        {/* ── Controls + metadata row ── */}
        <View style={styles.body}>

          {/* Playback controls */}
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

          {/* Right metadata */}
          <View style={styles.meta}>
            {/* Reciter selector pill */}
            <TouchableOpacity
              style={[styles.reciterBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
              onPress={() => setReciterOpen(v => !v)}
              activeOpacity={0.75}
            >
              <Text style={[styles.reciterLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {RECITERS.find(r => r.id === reciter)?.short ?? ''}
              </Text>
              <MaterialCommunityIcons
                name={reciterOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={colors.tabInactive}
              />
            </TouchableOpacity>

            {/* Ayah position counter */}
            <Text style={[styles.positionText, { color: dimColor }]}>
              {hasStarted ? `${currentIdx + 1} / ${ayahs.length}` : `— / ${ayahs.length}`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

export default AudioPlayer;

// ─── Constants ────────────────────────────────────────────────────────────────

const THUMB_SIZE = 14;
const THUMB_R    = THUMB_SIZE / 2;

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

  // Reciter dropdown
  dropdown: {
    borderRadius:     14,
    borderWidth:      1,
    marginHorizontal: 16,
    marginBottom:     8,
    overflow:         'hidden',
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

  // ── Progress section (time label | scrubbable track | time label) ──────────
  progressSection: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingHorizontal: 12,
    paddingTop:    10,
    paddingBottom: 2,
    gap:           8,
  },
  timeLabel: {
    fontSize:      10,
    letterSpacing: 0.2,
    fontFamily:    'SpaceMono',
    minWidth:      34,
    textAlign:     'center',
  },

  // Touch area is taller than the visual rail to give a comfortable drag target
  progressTouchArea: {
    flex:           1,
    height:         24,
    justifyContent: 'center',
  },
  progressRail: {
    height:       3,
    borderRadius: 3,
  },
  progressFill: {
    height:       '100%',
    borderRadius: 3,
  },

  // Thumb circle — appears only while scrubbing
  scrubThumb: {
    position:     'absolute',
    width:        THUMB_SIZE,
    height:       THUMB_SIZE,
    borderRadius: THUMB_R,
    // Vertically center relative to the 24px touch area:
    // (24 - 14) / 2 = 5
    top:          5,
  },

  // Body row
  body: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingTop:        6,
    paddingBottom:     4,
    gap:               12,
  },

  // Playback controls
  controls: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  playBtnWrap: {
    width:          42,
    height:         42,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Right metadata
  meta: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'flex-end',
    gap:             8,
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

  // Ayah position counter
  positionText: {
    fontSize:      11,
    letterSpacing: 0.3,
    fontFamily:    'SpaceMono',
  },
});
