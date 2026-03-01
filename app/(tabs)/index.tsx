import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrayerTimesSkeleton } from '@/components/Skeleton';
import SunArc from '@/components/SunArc';
import WeatherBackground from '@/components/WeatherBackground';
import { useTheme } from '@/context/ThemeContext';
import { saveCachedTimings } from '@/lib/notifications';
import {
  PRAYER_NAMES,
  PrayerName,
  PrayerTimesResult,
  PrayerTimings,
  fetchByCity,
  fetchByCoords,
  formatTime,
  formatCountdown,
  getNextPrayer,
  getSecondsUntilPrayer,
  getPrayerPeriodProgress,
  isPastPrayer,
} from '@/services/prayerTimes';
import {
  type PrayerMethodId,
  PRAYER_METHODS,
  getSettings,
} from '@/services/settings';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATION_KEY = 'salah_location';

type SavedLocation =
  | { type: 'gps';  lat: number; lon: number; label: string }
  | { type: 'city'; city: string; country: string; label: string };

const PRAYER_CONFIG: Record<PrayerName, { icon: string; label: string }> = {
  Fajr:    { icon: 'weather-night',         label: 'Fajr'    },
  Sunrise: { icon: 'weather-sunset-up',      label: 'Sunrise' },
  Dhuhr:   { icon: 'weather-sunny',          label: 'Dhuhr'   },
  Asr:     { icon: 'weather-partly-cloudy',  label: 'Asr'     },
  Maghrib: { icon: 'weather-sunset-down',    label: 'Maghrib' },
  Isha:    { icon: 'moon-waning-crescent',    label: 'Isha'    },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PrayerCardProps {
  name:    PrayerName;
  time:    string;
  isNext:  boolean;
  isPast:  boolean;
}

function PrayerCard({ name, time, isNext, isPast }: PrayerCardProps) {
  const { colors, palette } = useTheme();
  const cfg = PRAYER_CONFIG[name];

  const iconColor = isNext ? palette.gold : isPast ? colors.tabInactive : colors.text;
  const nameColor = isNext ? palette.gold : isPast ? colors.textMuted    : colors.text;
  const timeColor = isNext ? palette.gold : isPast ? colors.textMuted    : colors.text;

  const a11yLabel = `${cfg.label}, ${formatTime(time)}${isNext ? ', next prayer' : isPast ? ', already passed' : ''}`;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: isNext ? palette.gold : colors.border },
        isNext && { borderWidth: 1.5 },
        isPast && { opacity: 0.45 },
      ]}
      accessible
      accessibilityLabel={a11yLabel}
    >
      {/* Gold left accent on next prayer */}
      {isNext && (
        <View style={[styles.cardAccent, { backgroundColor: palette.gold }]} />
      )}

      {/* Icon */}
      <MaterialCommunityIcons
        name={cfg.icon as any}
        size={22}
        color={iconColor}
        style={styles.cardIcon}
      />

      {/* Name + badge */}
      <View style={styles.cardBody}>
        <Text style={[styles.prayerName, { color: nameColor }]}>{cfg.label}</Text>
        {isNext && (
          <Text style={[styles.nextBadge, { color: palette.gold }]}>NEXT ›</Text>
        )}
      </View>

      {/* Time */}
      <Text style={[styles.prayerTime, { color: timeColor }]}>{formatTime(time)}</Text>
    </View>
  );
}

// ─── Countdown Block ──────────────────────────────────────────────────────────

interface CountdownBlockProps {
  nextPrayer: PrayerName;
  timings:    PrayerTimings;
  now:        Date;
}

function CountdownBlock({ nextPrayer, timings, now }: CountdownBlockProps) {
  const { colors, palette } = useTheme();

  // Pulsing dot animation
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  const seconds  = getSecondsUntilPrayer(nextPrayer, timings, now);
  const progress = getPrayerPeriodProgress(timings, nextPrayer, now);

  return (
    <View style={[countdownStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Label row */}
      <View style={countdownStyles.labelRow}>
        <Animated.View style={[countdownStyles.dot, { backgroundColor: palette.gold, opacity: pulse }]} />
        <Text style={[countdownStyles.label, { color: colors.textMuted }]}>
          Next · <Text style={{ color: palette.gold }}>{nextPrayer}</Text>
        </Text>
      </View>

      {/* Countdown digits */}
      <Text style={[countdownStyles.digits, { color: colors.text }]}>
        {formatCountdown(seconds)}
      </Text>

      {/* Progress bar */}
      <View style={[countdownStyles.barTrack, { backgroundColor: colors.cardAlt }]}>
        <View
          style={[
            countdownStyles.barFill,
            { backgroundColor: palette.gold, flex: progress },
          ]}
        />
        <View style={{ flex: 1 - progress }} />
      </View>
    </View>
  );
}

const countdownStyles = StyleSheet.create({
  container: {
    borderRadius:   16,
    borderWidth:    1,
    padding:        18,
    marginBottom:   20,
  },
  labelRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            7,
    marginBottom:   6,
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },
  label: {
    fontSize:     12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  digits: {
    fontSize:     38,
    fontFamily:   'SpaceMono',
    fontWeight:   '300',
    letterSpacing: 2,
    marginBottom:  12,
  },
  barTrack: {
    flexDirection:  'row',
    height:         3,
    borderRadius:   2,
    overflow:       'hidden',
  },
  barFill: {
    borderRadius: 2,
  },
});

// ─── Ramadan Banner ───────────────────────────────────────────────────────────

interface RamadanBannerProps {
  timings:  PrayerTimings;
  now:      Date;
}

function RamadanBanner({ timings, now }: RamadanBannerProps) {
  const { colors, palette } = useTheme();

  const curMinutes = now.getHours() * 60 + now.getMinutes();
  // Before Fajr → show Suhoor ends; otherwise show Iftar
  const fajrMins = (() => {
    const [h, m] = timings.Fajr.split(':').map(Number);
    return h * 60 + m;
  })();
  const isSuhoorTime = curMinutes < fajrMins;

  const label = isSuhoorTime
    ? `Suhoor ends · ${formatTime(timings.Fajr)}`
    : `Iftar · ${formatTime(timings.Maghrib)}`;

  return (
    <View style={[ramadanStyles.banner, { backgroundColor: palette.goldDim, borderColor: palette.gold }]}>
      <Text style={ramadanStyles.moon}>🌙</Text>
      <View>
        <Text style={[ramadanStyles.title, { color: palette.gold }]}>Ramadan Mubarak</Text>
        <Text style={[ramadanStyles.sub, { color: colors.text }]}>{label}</Text>
      </View>
    </View>
  );
}

const ramadanStyles = StyleSheet.create({
  banner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    borderRadius:   14,
    borderWidth:    1,
    paddingVertical:   12,
    paddingHorizontal: 16,
    marginBottom:   20,
  },
  moon:  { fontSize: 24 },
  title: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  sub:   { fontSize: 12, marginTop: 2, letterSpacing: 0.2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ScreenStatus = 'init' | 'loading' | 'error' | 'no_location' | 'success';

export default function PrayerTimesScreen() {
  const { colors, palette, isDark } = useTheme();

  // Screen state
  const [status,       setStatus]       = useState<ScreenStatus>('init');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [prayerData,   setPrayerData]   = useState<PrayerTimesResult | null>(null);
  const [location,     setLocation]     = useState<SavedLocation | null>(null);
  const [method,       setMethod]       = useState<PrayerMethodId>(2);

  // Search form
  const [cityInput,    setCityInput]    = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [searching,    setSearching]    = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);

  // Live "now" — updates every second for the countdown timer
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // ── Load saved location + settings on mount ──────────────────────────────

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(LOCATION_KEY),
      getSettings(),
    ]).then(([raw, s]) => {
      setMethod(s.prayerMethod);
      if (raw) {
        const saved = JSON.parse(raw) as SavedLocation;
        setLocation(saved);
        fetchAndSet(saved, s.prayerMethod);
      } else {
        setStatus('no_location');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch + store ─────────────────────────────────────────────────────────

  async function fetchAndSet(loc: SavedLocation, m?: PrayerMethodId) {
    setStatus('loading');
    setErrorMsg('');
    const activeMethod = m ?? method;
    try {
      const data =
        loc.type === 'gps'
          ? await fetchByCoords(loc.lat, loc.lon, activeMethod)
          : await fetchByCity(loc.city, loc.country, activeMethod);
      setPrayerData(data);
      setStatus('success');
      // Persist location
      await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
      setLocation(loc);
      // Cache timings so notifications can reschedule on app restart
      saveCachedTimings(data.timings, data.date.hijri).catch(() => {});
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message ?? 'Unknown error');
    }
  }

  async function handleRefresh() {
    if (!location) return;
    setRefreshing(true);
    await fetchAndSet(location);
    setRefreshing(false);
  }

  // ── GPS ───────────────────────────────────────────────────────────────────

  async function handleGPS() {
    setStatus('loading');
    setErrorMsg('');
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        Alert.alert(
          'Location permission needed',
          'Enable location access in Settings to use GPS.',
        );
        setStatus(location ? 'success' : 'no_location');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude: lat, longitude: lon } = pos.coords;

      // Reverse-geocode to get a readable city name
      let label = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (geo) {
          const city    = geo.city ?? geo.district ?? geo.subregion ?? '';
          const country = geo.country ?? '';
          label = [city, country].filter(Boolean).join(', ');
        }
      } catch { /* label stays as coords */ }

      const loc: SavedLocation = { type: 'gps', lat, lon, label };
      await fetchAndSet(loc);
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message ?? 'Could not get location');
    }
  }

  // ── City search ───────────────────────────────────────────────────────────

  async function handleCitySearch() {
    const city    = cityInput.trim();
    const country = countryInput.trim();
    if (!city) {
      Alert.alert('Enter a city name');
      return;
    }
    setSearching(true);
    const label = country ? `${city}, ${country}` : city;
    const loc: SavedLocation = { type: 'city', city, country, label };
    await fetchAndSet(loc);
    setSearching(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const nextPrayer = prayerData ? getNextPrayer(prayerData.timings, now) : null;

  const hijri = prayerData
    ? `${prayerData.date.hijri.day} ${prayerData.date.hijri.month.en} ${prayerData.date.hijri.year} AH`
    : '';

  // ── Render helpers ────────────────────────────────────────────────────────

  const inputBg      = isDark ? colors.cardAlt : colors.cardAlt;
  const placeholderC = colors.tabInactive;

  // ── Loading spinner ───────────────────────────────────────────────────────

  // Show skeleton cards when fetching for the first time (no existing data)
  if ((status === 'init' || status === 'loading') && !prayerData) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.header}>
          <View style={{ width: '45%', height: 16, borderRadius: 8, backgroundColor: colors.cardAlt, marginBottom: 6 }} />
          <View style={{ width: '30%', height: 11, borderRadius: 6, backgroundColor: colors.cardAlt }} />
        </View>
        <PrayerTimesSkeleton />
      </SafeAreaView>
    );
  }

  // ── No location / first-run ───────────────────────────────────────────────

  if (status === 'no_location' || (status === 'error' && !prayerData)) {
    return (
      <KeyboardAvoidingView
        style={[styles.center, { backgroundColor: colors.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={[styles.welcomeIcon]}>🕌</Text>
        <Text style={[styles.welcomeTitle, { color: colors.text }]}>Set Your Location</Text>
        <Text style={[styles.welcomeSub, { color: colors.textMuted }]}>
          Allow GPS or enter your city to get accurate prayer times.
        </Text>

        {status === 'error' && (
          <Text style={[styles.errorBanner, { color: colors.danger }]}>{errorMsg}</Text>
        )}

        <TouchableOpacity
          style={[styles.gpsBtn, { backgroundColor: palette.gold }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleGPS(); }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Use GPS to detect my location"
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color={palette.onGold} />
          <Text style={[styles.gpsBtnText, { color: palette.onGold }]}>Use GPS</Text>
        </TouchableOpacity>

        <Text style={[styles.orDivider, { color: colors.textMuted }]}>— or —</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.inputCity, { backgroundColor: inputBg, color: colors.text, borderColor: colors.border }]}
            placeholder="City"
            placeholderTextColor={placeholderC}
            value={cityInput}
            onChangeText={setCityInput}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, styles.inputCountry, { backgroundColor: inputBg, color: colors.text, borderColor: colors.border }]}
            placeholder="Country"
            placeholderTextColor={placeholderC}
            value={countryInput}
            onChangeText={setCountryInput}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={handleCitySearch}
          />
        </View>
        <TouchableOpacity
          style={[styles.searchBtn, { borderColor: palette.gold }]}
          onPress={handleCitySearch}
          disabled={searching}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Search city"
        >
          <Text style={[styles.searchBtnText, { color: palette.gold }]}>
            {searching ? 'Searching…' : 'Search City'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Weather-reactive background — rendered behind all content */}
      <WeatherBackground
        lat={prayerData!.meta.latitude}
        lon={prayerData!.meta.longitude}
        timings={prayerData!.timings}
        now={now}
      />

      <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={palette.gold}
              colors={[palette.gold]}
            />
          }
        >
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker" size={16} color={palette.gold} />
              <Text style={[styles.locationLabel, { color: colors.text }]} numberOfLines={1}>
                {location?.label ?? '—'}
              </Text>
            </View>
            <Text style={[styles.dateGreg, { color: colors.textMuted }]}>
              {prayerData?.date.readable}
            </Text>
            <Text style={[styles.dateHijri, { color: palette.gold }]}>{hijri}</Text>
          </View>

          {/* ── Ramadan banner ── */}
          {prayerData?.date.hijri.month.number === 9 && (
            <RamadanBanner timings={prayerData.timings} now={now} />
          )}

          {/* ── Countdown ── */}
          {nextPrayer && prayerData && (
            <CountdownBlock nextPrayer={nextPrayer} timings={prayerData.timings} now={now} />
          )}

          {/* ── Prayer cards ── */}
          <View style={styles.cards}>
            {PRAYER_NAMES.map((name) => (
              <PrayerCard
                key={name}
                name={name}
                time={prayerData!.timings[name]}
                isNext={name === nextPrayer}
                isPast={isPastPrayer(name, prayerData!.timings, nextPrayer!, now)}
              />
            ))}
          </View>

          {/* ── Sun Arc ── */}
          <View style={[styles.sunArcCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SunArc timings={prayerData!.timings} now={now} />
          </View>

          {/* ── Error banner (when data exists but a re-fetch failed) ── */}
          {status === 'error' && (
            <Text style={[styles.errorBanner, { color: colors.danger }]}>{errorMsg}</Text>
          )}

          {/* ── Change location ── */}
          <View style={[styles.searchSection, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.gpsBtn, { backgroundColor: palette.gold }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleGPS(); }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Use GPS to detect my location"
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={16} color={palette.onGold} />
              <Text style={[styles.gpsBtnText, { color: palette.onGold }]}>Use GPS</Text>
            </TouchableOpacity>

            <Text style={[styles.orDivider, { color: colors.textMuted }]}>— or search —</Text>

            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.inputCity, { backgroundColor: inputBg, color: colors.text, borderColor: colors.border }]}
                placeholder="City"
                placeholderTextColor={placeholderC}
                value={cityInput}
                onChangeText={setCityInput}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <TextInput
                style={[styles.input, styles.inputCountry, { backgroundColor: inputBg, color: colors.text, borderColor: colors.border }]}
                placeholder="Country"
                placeholderTextColor={placeholderC}
                value={countryInput}
                onChangeText={setCountryInput}
                autoCapitalize="words"
                returnKeyType="search"
                onSubmitEditing={handleCitySearch}
              />
            </View>
            <TouchableOpacity
              style={[styles.searchBtn, { borderColor: palette.gold }]}
              onPress={handleCitySearch}
              disabled={searching}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Search city"
            >
              <Text style={[styles.searchBtnText, { color: palette.gold }]}>
                {searching ? 'Searching…' : 'Search City'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Method note ── */}
          <Text style={[styles.methodNote, { color: colors.tabInactive }]}>
            {PRAYER_METHODS.find(m => m.id === method)?.label ?? 'ISNA'} calculation method · change in Settings
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1 },
  safe:   { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },

  // Header
  header:        { marginBottom: 20 },
  locationRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  locationLabel: { fontSize: 17, fontWeight: '500', letterSpacing: 0.2, flexShrink: 1 },
  dateGreg:      { fontSize: 13, letterSpacing: 0.3, marginBottom: 1 },
  dateHijri:     { fontSize: 12, letterSpacing: 0.4 },

  // Prayer cards
  cards: { gap: 8, marginBottom: 28 },
  card: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   14,
    borderWidth:    1,
    overflow:       'hidden',
    paddingVertical:   14,
    paddingHorizontal: 16,
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  cardIcon:   { marginRight: 14 },
  cardBody:   { flex: 1 },
  prayerName: { fontSize: 15, fontWeight: '500', letterSpacing: 0.3 },
  nextBadge:  { fontSize: 9, letterSpacing: 0.8, fontWeight: '600', marginTop: 2 },
  prayerTime: { fontSize: 17, fontWeight: '300', fontFamily: 'SpaceMono', letterSpacing: 0.5 },

  // Welcome / first-run
  welcomeIcon:  { fontSize: 48, marginBottom: 12 },
  welcomeTitle: { fontSize: 22, fontWeight: '300', letterSpacing: 1, marginBottom: 8 },
  welcomeSub:   { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  loadingText:  { marginTop: 14, fontSize: 13, letterSpacing: 0.3 },

  // GPS button
  gpsBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingVertical:   12,
    paddingHorizontal: 24,
    borderRadius:   50,
    marginBottom:   16,
  },
  gpsBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },

  orDivider: { fontSize: 11, letterSpacing: 0.5, marginBottom: 14 },

  // City search
  searchSection: { borderTopWidth: 1, paddingTop: 24, marginBottom: 12, alignItems: 'center' },
  searchRow:     { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 10 },
  input: {
    height:        44,
    borderRadius:  10,
    borderWidth:   1,
    paddingHorizontal: 12,
    fontSize:      14,
  },
  inputCity:    { flex: 3 },
  inputCountry: { flex: 2 },
  searchBtn: {
    width:             '100%',
    height:            44,
    borderRadius:      10,
    borderWidth:       1,
    alignItems:        'center',
    justifyContent:    'center',
  },
  searchBtnText: { fontSize: 14, fontWeight: '500', letterSpacing: 0.3 },

  // Sun arc
  sunArcCard: {
    borderRadius:  18,
    borderWidth:   1,
    overflow:      'hidden',
    marginBottom:  20,
    paddingVertical: 14,
    alignItems:    'center',
  },

  errorBanner: { fontSize: 12, textAlign: 'center', marginBottom: 16 },
  methodNote:  { fontSize: 10, textAlign: 'center', letterSpacing: 0.5, marginTop: 4 },
});
