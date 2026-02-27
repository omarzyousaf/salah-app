import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import {
  PRAYER_NAMES,
  PrayerName,
  PrayerTimesResult,
  fetchByCity,
  fetchByCoords,
  formatTime,
  getNextPrayer,
  isPastPrayer,
} from '@/services/prayerTimes';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATION_KEY = 'salah_location';
const METHOD       = 2; // ISNA

type SavedLocation =
  | { type: 'gps';  lat: number; lon: number; label: string }
  | { type: 'city'; city: string; country: string; label: string };

const PRAYER_CONFIG: Record<PrayerName, { icon: string; label: string }> = {
  Fajr:    { icon: 'weather-night',         label: 'Fajr'    },
  Sunrise: { icon: 'weather-sunset-up',      label: 'Sunrise' },
  Dhuhr:   { icon: 'weather-sunny',          label: 'Dhuhr'   },
  Asr:     { icon: 'weather-partly-cloudy',  label: 'Asr'     },
  Maghrib: { icon: 'weather-sunset-down',    label: 'Maghrib' },
  Isha:    { icon: 'moon-and-stars',         label: 'Isha'    },
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

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: isNext ? palette.gold : colors.border },
        isNext && { borderWidth: 1.5 },
        isPast && { opacity: 0.45 },
      ]}
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ScreenStatus = 'init' | 'loading' | 'error' | 'no_location' | 'success';

export default function PrayerTimesScreen() {
  const { colors, palette, isDark } = useTheme();

  // Screen state
  const [status,    setStatus]    = useState<ScreenStatus>('init');
  const [errorMsg,  setErrorMsg]  = useState('');
  const [prayerData, setPrayerData] = useState<PrayerTimesResult | null>(null);
  const [location,  setLocation]  = useState<SavedLocation | null>(null);

  // Search form
  const [cityInput,    setCityInput]    = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [searching,    setSearching]    = useState(false);

  // Live "now" — updates every minute so the NEXT badge moves automatically
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Load saved location on mount ─────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(LOCATION_KEY).then((raw) => {
      if (raw) {
        const saved = JSON.parse(raw) as SavedLocation;
        setLocation(saved);
        fetchAndSet(saved);
      } else {
        setStatus('no_location');
      }
    });
  }, []);

  // ── Fetch + store ─────────────────────────────────────────────────────────

  async function fetchAndSet(loc: SavedLocation) {
    setStatus('loading');
    setErrorMsg('');
    try {
      const data =
        loc.type === 'gps'
          ? await fetchByCoords(loc.lat, loc.lon, METHOD)
          : await fetchByCity(loc.city, loc.country, METHOD);
      setPrayerData(data);
      setStatus('success');
      // Persist location
      await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
      setLocation(loc);
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message ?? 'Unknown error');
    }
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

  if (status === 'init' || status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={palette.gold} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Fetching prayer times…
        </Text>
      </View>
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
          <Text style={[styles.errorBanner, { color: '#E57373' }]}>{errorMsg}</Text>
        )}

        <TouchableOpacity
          style={[styles.gpsBtn, { backgroundColor: palette.gold }]}
          onPress={handleGPS}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#111" />
          <Text style={styles.gpsBtnText}>Use GPS</Text>
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
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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

          {/* ── Error banner (when data exists but a re-fetch failed) ── */}
          {status === 'error' && (
            <Text style={[styles.errorBanner, { color: '#E57373' }]}>{errorMsg}</Text>
          )}

          {/* ── Change location ── */}
          <View style={[styles.searchSection, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.gpsBtn, { backgroundColor: palette.gold }]}
              onPress={handleGPS}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#111" />
              <Text style={styles.gpsBtnText}>Use GPS</Text>
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
            >
              <Text style={[styles.searchBtnText, { color: palette.gold }]}>
                {searching ? 'Searching…' : 'Search City'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Method note ── */}
          <Text style={[styles.methodNote, { color: colors.tabInactive }]}>
            ISNA calculation method (method 2)
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
  gpsBtnText: { fontSize: 14, fontWeight: '600', color: '#111', letterSpacing: 0.3 },

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

  errorBanner: { fontSize: 12, textAlign: 'center', marginBottom: 16 },
  methodNote:  { fontSize: 10, textAlign: 'center', letterSpacing: 0.5, marginTop: 4 },
});
