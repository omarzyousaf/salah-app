/**
 * Prayer Times — home screen.
 *
 * Layout (top→bottom):
 *   WeatherBackground (full-screen behind everything)
 *   SafeAreaView (insets only, no background)
 *   └─ ScrollView
 *        ├─ Hijri date (centered, prominent)
 *        ├─ City name
 *        ├─ SunArc (hero — full width)
 *        ├─ CountdownBlock (big HH MM SS digits)
 *        ├─ RamadanBanner (Ramadan only)
 *        ├─ Prayer cards (glass style)
 *        └─ Change-location section
 */

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

import SunArc from '@/components/SunArc';
import WeatherBackground from '@/components/WeatherBackground';
import { saveCachedTimings } from '@/lib/notifications';
import {
  PRAYER_NAMES,
  PrayerName,
  PrayerTimesResult,
  PrayerTimings,
  fetchByCity,
  fetchByCoords,
  formatTime,
  getNextPrayer,
  getSecondsUntilPrayer,
  isPastPrayer,
} from '@/services/prayerTimes';
import {
  type PrayerMethodId,
  PRAYER_METHODS,
  getSettings,
} from '@/services/settings';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATION_KEY = 'salah_location';

// Glass card surfaces that work on any weather gradient
const GLASS_CARD   = 'rgba(255,255,255,0.09)';
const GLASS_BORDER = 'rgba(255,255,255,0.14)';
const GLASS_INPUT  = 'rgba(0,0,0,0.35)';
const TEXT_PRIMARY = 'rgba(255,255,255,0.95)';
const TEXT_MUTED   = 'rgba(255,255,255,0.60)';
const TEXT_DIM     = 'rgba(255,255,255,0.38)';
const GOLD         = '#C8A96E';
const GOLD_DIM     = 'rgba(200,169,110,0.18)';
const GOLD_BORDER  = 'rgba(200,169,110,0.45)';

type SavedLocation =
  | { type: 'gps';  lat: number; lon: number; label: string }
  | { type: 'city'; city: string; country: string; label: string };

const PRAYER_ICON: Record<PrayerName, string> = {
  Fajr:    'weather-night',
  Sunrise: 'weather-sunset-up',
  Dhuhr:   'weather-sunny',
  Asr:     'weather-partly-cloudy',
  Maghrib: 'weather-sunset-down',
  Isha:    'moon-waning-crescent',
};

// ─── Prayer card (glass style) ────────────────────────────────────────────────

interface PrayerCardProps {
  name:   PrayerName;
  time:   string;
  isNext: boolean;
  isPast: boolean;
}

function PrayerCard({ name, time, isNext, isPast }: PrayerCardProps) {
  const textColor = isNext ? GOLD : TEXT_PRIMARY;
  const a11y = `${name}, ${formatTime(time)}${isNext ? ', next prayer' : isPast ? ', passed' : ''}`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isNext ? GOLD_DIM  : GLASS_CARD,
          borderColor:     isNext ? GOLD_BORDER : GLASS_BORDER,
        },
        isNext && { borderWidth: 1.5 },
        isPast && { opacity: 0.38 },
      ]}
      accessible
      accessibilityLabel={a11y}
    >
      {isNext && <View style={styles.cardAccent} />}

      <MaterialCommunityIcons
        name={PRAYER_ICON[name] as any}
        size={21}
        color={isNext ? GOLD : TEXT_MUTED}
        style={styles.cardIcon}
      />

      <View style={styles.cardBody}>
        <Text style={[styles.cardName, { color: textColor }]}>{name}</Text>
        {isNext && <Text style={styles.cardNext}>NEXT ›</Text>}
      </View>

      <Text style={[styles.cardTime, { color: textColor }]}>{formatTime(time)}</Text>
    </View>
  );
}

// ─── Countdown block ──────────────────────────────────────────────────────────

interface CountdownBlockProps {
  nextPrayer: PrayerName;
  timings:    PrayerTimings;
  now:        Date;
}

function CountdownBlock({ nextPrayer, timings, now }: CountdownBlockProps) {
  const seconds = getSecondsUntilPrayer(nextPrayer, timings, now);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  // Pulsing dot
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <View style={cd.container}>
      {/* "FAJR IN" label */}
      <View style={cd.labelRow}>
        <Animated.View style={[cd.dot, { opacity: pulse }]} />
        <Text style={cd.label}>{nextPrayer} in</Text>
      </View>

      {/* HH  MM  SS */}
      <View style={cd.digitRow}>
        <View style={cd.unit}>
          <Text style={cd.digit}>{pad(h)}</Text>
          <Text style={cd.unitLabel}>H</Text>
        </View>
        <Text style={cd.colon}>:</Text>
        <View style={cd.unit}>
          <Text style={cd.digit}>{pad(m)}</Text>
          <Text style={cd.unitLabel}>M</Text>
        </View>
        <Text style={cd.colon}>:</Text>
        <View style={cd.unit}>
          <Text style={cd.digit}>{pad(s)}</Text>
          <Text style={cd.unitLabel}>S</Text>
        </View>
      </View>
    </View>
  );
}

const cd = StyleSheet.create({
  container: {
    alignItems:    'center',
    paddingTop:    8,
    paddingBottom: 24,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
    marginBottom:  10,
  },
  dot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: GOLD,
  },
  label: {
    fontSize:      11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color:         TEXT_MUTED,
  },
  digitRow: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    gap:           2,
  },
  unit: {
    alignItems: 'center',
    width:      68,
  },
  digit: {
    fontSize:      54,
    fontFamily:    'SpaceMono',
    fontWeight:    '300',
    color:         TEXT_PRIMARY,
    letterSpacing: -1,
    lineHeight:    58,
  },
  unitLabel: {
    fontSize:      9,
    letterSpacing: 2,
    color:         TEXT_DIM,
    marginTop:     2,
  },
  colon: {
    fontSize:      44,
    fontFamily:    'SpaceMono',
    color:         TEXT_DIM,
    marginBottom:  12,
    lineHeight:    58,
  },
});

// ─── Ramadan banner ───────────────────────────────────────────────────────────

function RamadanBanner({ timings, now }: { timings: PrayerTimings; now: Date }) {
  const curMin  = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = timings.Fajr.split(':').map(Number);
  const fajrMin = fh * 60 + fm;
  const isSuhoor = curMin < fajrMin;

  const label = isSuhoor
    ? `Suhoor ends · ${formatTime(timings.Fajr)}`
    : `Iftar · ${formatTime(timings.Maghrib)}`;

  return (
    <View style={rb.banner}>
      <Text style={rb.moon}>🌙</Text>
      <View>
        <Text style={rb.title}>Ramadan Mubarak</Text>
        <Text style={rb.sub}>{label}</Text>
      </View>
    </View>
  );
}

const rb = StyleSheet.create({
  banner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    borderRadius:      14,
    borderWidth:       1,
    borderColor:       GOLD_BORDER,
    backgroundColor:   GOLD_DIM,
    paddingVertical:   12,
    paddingHorizontal: 16,
    marginBottom:      16,
    marginHorizontal:  20,
  },
  moon:  { fontSize: 22 },
  title: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, color: GOLD },
  sub:   { fontSize: 12, marginTop: 2, letterSpacing: 0.2, color: TEXT_MUTED },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

type ScreenStatus = 'init' | 'loading' | 'error' | 'no_location' | 'success';

export default function PrayerTimesScreen() {
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

  // Live clock — drives countdown timer and arc position
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
      await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
      setLocation(loc);
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
        Alert.alert('Location permission needed', 'Enable location access in Settings to use GPS.');
        setStatus(location ? 'success' : 'no_location');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lon } = pos.coords;

      let label = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (geo) {
          const city    = geo.city ?? geo.district ?? geo.subregion ?? '';
          const country = geo.country ?? '';
          label = [city, country].filter(Boolean).join(', ');
        }
      } catch { /* label stays as coords */ }

      await fetchAndSet({ type: 'gps', lat, lon, label });
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message ?? 'Could not get location');
    }
  }

  // ── City search ───────────────────────────────────────────────────────────

  async function handleCitySearch() {
    const city    = cityInput.trim();
    const country = countryInput.trim();
    if (!city) { Alert.alert('Enter a city name'); return; }
    setSearching(true);
    const label = country ? `${city}, ${country}` : city;
    await fetchAndSet({ type: 'city', city, country, label });
    setSearching(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const nextPrayer = prayerData ? getNextPrayer(prayerData.timings, now) : null;

  const hijriLabel = prayerData
    ? `${prayerData.date.hijri.day} ${prayerData.date.hijri.month.en} ${prayerData.date.hijri.year}`
    : '';

  // ── First-run / no-location screen ───────────────────────────────────────

  if (status === 'no_location' || (status === 'error' && !prayerData)) {
    return (
      <KeyboardAvoidingView
        style={styles.setupScreen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.welcomeIcon}>🕌</Text>
        <Text style={styles.welcomeTitle}>Set Your Location</Text>
        <Text style={styles.welcomeSub}>
          Allow GPS or enter your city to get accurate prayer times.
        </Text>

        {status === 'error' && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}

        <TouchableOpacity
          style={styles.gpsBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleGPS(); }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Use GPS to detect my location"
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#1C1A17" />
          <Text style={styles.gpsBtnText}>Use GPS</Text>
        </TouchableOpacity>

        <Text style={styles.orDivider}>— or —</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.inputCity]}
            placeholder="City"
            placeholderTextColor="rgba(255,255,255,0.40)"
            value={cityInput}
            onChangeText={setCityInput}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, styles.inputCountry]}
            placeholder="Country"
            placeholderTextColor="rgba(255,255,255,0.40)"
            value={countryInput}
            onChangeText={setCountryInput}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={handleCitySearch}
          />
        </View>

        <TouchableOpacity
          style={styles.searchBtn}
          onPress={handleCitySearch}
          disabled={searching}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Search city"
        >
          <Text style={styles.searchBtnText}>
            {searching ? 'Searching…' : 'Search City'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  // ── Loading (first fetch, no data yet) ───────────────────────────────────

  if ((status === 'init' || status === 'loading') && !prayerData) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingLabel}>Loading prayer times…</Text>
      </View>
    );
  }

  // ── Main success view ─────────────────────────────────────────────────────

  const timings = prayerData!.timings;

  return (
    // Root is black so any tiny gap before WeatherBackground renders is safe
    <View style={styles.root}>

      {/* Full-screen animated weather sky */}
      <WeatherBackground
        lat={prayerData!.meta.latitude}
        lon={prayerData!.meta.longitude}
        timings={timings}
        now={now}
      />

      {/* SafeAreaView — only provides insets, no background color */}
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={GOLD}
                colors={[GOLD]}
              />
            }
          >

            {/* ── Date + city header ── */}
            <View style={styles.header}>
              <Text style={styles.hijri}>{hijriLabel}</Text>
              <View style={styles.cityRow}>
                <MaterialCommunityIcons name="map-marker" size={13} color={GOLD} />
                <Text style={styles.cityLabel} numberOfLines={1}>
                  {location?.label ?? '—'}
                </Text>
              </View>
            </View>

            {/* ── Hero sun arc — full screen width ── */}
            <View style={styles.arcWrap}>
              <SunArc timings={timings} now={now} />
            </View>

            {/* ── Countdown ── */}
            {nextPrayer && (
              <CountdownBlock nextPrayer={nextPrayer} timings={timings} now={now} />
            )}

            {/* ── Ramadan banner ── */}
            {prayerData?.date.hijri.month.number === 9 && (
              <RamadanBanner timings={timings} now={now} />
            )}

            {/* ── Prayer time cards ── */}
            <View style={styles.cards}>
              {PRAYER_NAMES.map(name => (
                <PrayerCard
                  key={name}
                  name={name}
                  time={timings[name]}
                  isNext={name === nextPrayer}
                  isPast={isPastPrayer(name, timings, nextPrayer!, now)}
                />
              ))}
            </View>

            {/* ── Re-fetch error (data exists but refresh failed) ── */}
            {status === 'error' && (
              <Text style={styles.errorText}>{errorMsg}</Text>
            )}

            {/* ── Change location ── */}
            <View style={styles.locationSection}>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.gpsBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleGPS();
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Use GPS to detect my location"
              >
                <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#1C1A17" />
                <Text style={styles.gpsBtnText}>Use GPS</Text>
              </TouchableOpacity>

              <Text style={styles.orDivider}>— or search —</Text>

              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, styles.inputCity]}
                  placeholder="City"
                  placeholderTextColor="rgba(255,255,255,0.40)"
                  value={cityInput}
                  onChangeText={setCityInput}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.input, styles.inputCountry]}
                  placeholder="Country"
                  placeholderTextColor="rgba(255,255,255,0.40)"
                  value={countryInput}
                  onChangeText={setCountryInput}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={handleCitySearch}
                />
              </View>

              <TouchableOpacity
                style={styles.searchBtn}
                onPress={handleCitySearch}
                disabled={searching}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Search city"
              >
                <Text style={styles.searchBtnText}>
                  {searching ? 'Searching…' : 'Search City'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Calculation method note ── */}
            <Text style={styles.methodNote}>
              {PRAYER_METHODS.find(m => m.id === method)?.label ?? 'ISNA'} · change in Settings
            </Text>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Root layers
  root:          { flex: 1, backgroundColor: '#000' },
  safe:          { flex: 1, backgroundColor: 'transparent' },
  flex:          { flex: 1 },
  scroll:        { paddingBottom: 48 },

  // Loading / setup screens
  loadingScreen: {
    flex: 1,
    backgroundColor: '#060A18',
    alignItems:      'center',
    justifyContent:  'center',
  },
  loadingLabel: { fontSize: 13, color: TEXT_MUTED, letterSpacing: 0.3 },

  setupScreen: {
    flex:            1,
    backgroundColor: '#060A18',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         28,
  },
  welcomeIcon:  { fontSize: 48, marginBottom: 14 },
  welcomeTitle: { fontSize: 22, fontWeight: '300', letterSpacing: 1, marginBottom: 8, color: TEXT_PRIMARY },
  welcomeSub: {
    fontSize:    13,
    textAlign:   'center',
    lineHeight:  20,
    marginBottom: 28,
    color:       TEXT_MUTED,
  },

  // Date + city header (centered)
  header: {
    alignItems:   'center',
    paddingTop:   12,
    paddingBottom: 4,
    paddingHorizontal: 20,
  },
  hijri: {
    fontSize:      22,
    fontWeight:    '300',
    letterSpacing: 1,
    color:         TEXT_PRIMARY,
    marginBottom:  6,
    textAlign:     'center',
  },
  cityRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  cityLabel: {
    fontSize:      13,
    letterSpacing: 0.2,
    color:         TEXT_MUTED,
    flexShrink:    1,
  },

  // Arc container — negative horizontal margin to break content padding
  arcWrap: {
    marginTop: 8,
  },

  // Prayer cards
  cards: { gap: 8, paddingHorizontal: 20, marginBottom: 20 },
  card: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      14,
    borderWidth:       1,
    overflow:          'hidden',
    paddingVertical:   13,
    paddingHorizontal: 15,
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: GOLD },
  cardIcon:   { marginRight: 13 },
  cardBody:   { flex: 1 },
  cardName:   { fontSize: 15, fontWeight: '500', letterSpacing: 0.3 },
  cardNext:   { fontSize: 9, letterSpacing: 0.8, fontWeight: '600', color: GOLD, marginTop: 2 },
  cardTime:   { fontSize: 16, fontWeight: '300', fontFamily: 'SpaceMono', letterSpacing: 0.5 },

  // GPS button
  gpsBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingVertical:   11,
    paddingHorizontal: 22,
    borderRadius:      50,
    backgroundColor:   GOLD,
    marginBottom:      16,
  },
  gpsBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3, color: '#1C1A17' },

  orDivider: { fontSize: 11, letterSpacing: 0.5, marginBottom: 14, color: TEXT_DIM },

  // City search
  searchRow:    { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 10 },
  input: {
    height:            44,
    borderRadius:      10,
    borderWidth:       1,
    paddingHorizontal: 12,
    fontSize:          14,
    backgroundColor:   GLASS_INPUT,
    borderColor:       GLASS_BORDER,
    color:             TEXT_PRIMARY,
  },
  inputCity:    { flex: 3 },
  inputCountry: { flex: 2 },
  searchBtn: {
    width:          '100%',
    height:         44,
    borderRadius:   10,
    borderWidth:    1,
    borderColor:    GOLD_BORDER,
    alignItems:     'center',
    justifyContent: 'center',
  },
  searchBtnText: { fontSize: 14, fontWeight: '500', letterSpacing: 0.3, color: GOLD },

  // Change-location section
  locationSection: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  divider: {
    width:         '100%',
    height:        1,
    backgroundColor: GLASS_BORDER,
    marginBottom:  24,
    marginTop:     4,
  },

  // Errors + meta
  errorText:  { fontSize: 12, textAlign: 'center', color: '#E07070', marginBottom: 12 },
  methodNote: {
    fontSize:      10,
    textAlign:     'center',
    letterSpacing: 0.5,
    color:         TEXT_DIM,
    marginTop:     4,
    paddingBottom: 4,
  },
});
