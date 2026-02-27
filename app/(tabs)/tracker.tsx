import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import { useDeviceId } from '@/hooks/useDeviceId';
import { supabase } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
type Prayer = (typeof PRAYERS)[number];

const PRAYER_ICONS: Record<Prayer, string> = {
  Fajr:    'weather-night',
  Dhuhr:   'weather-sunny',
  Asr:     'weather-partly-cloudy',
  Maghrib: 'weather-sunset-down',
  Isha:    'moon-waning-crescent',
};

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function localDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

/** 35 dates (Mon→Sun × 5 weeks), week-aligned, may include future days. */
function buildHeatmapDates(): { date: string; isFuture: boolean }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Mon-start: JS Sun=0 → map to 0=Mon
  const fromMon = (today.getDay() + 6) % 7;
  // Start of 5-weeks-ago Monday
  const start = new Date(today);
  start.setDate(today.getDate() - fromMon - 28);

  return Array.from({ length: 35 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: localDateStr(d), isFuture: d > today };
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TodayState  = Record<Prayer, boolean>;
type HeatmapData = Record<string, number>; // date → prayed count

const DEFAULT_TODAY: TodayState = {
  Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false,
};

// ─── Heat Cell ────────────────────────────────────────────────────────────────

function HeatCell({
  count,
  isToday,
  isFuture,
}: {
  count:    number;
  isToday:  boolean;
  isFuture: boolean;
}) {
  const { colors, palette } = useTheme();

  let bg: string;
  if (isFuture)    bg = 'transparent';
  else if (!count) bg = colors.cardAlt;
  else if (count <= 2) bg = 'rgba(200,169,110,0.28)';
  else if (count <= 4) bg = 'rgba(200,169,110,0.62)';
  else                 bg = palette.gold;

  return (
    <View
      style={[
        heatStyles.cell,
        { backgroundColor: bg },
        isToday  && { borderWidth: 1.5, borderColor: palette.gold },
        isFuture && { borderWidth: 0.5, borderColor: colors.border, opacity: 0.3 },
      ]}
    />
  );
}

const heatStyles = StyleSheet.create({
  cell: { flex: 1, aspectRatio: 1, borderRadius: 5, margin: 2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TrackerScreen() {
  const { colors, palette } = useTheme();
  const deviceId = useDeviceId();

  const [todayPrayed, setTodayPrayed] = useState<TodayState>(DEFAULT_TODAY);
  const [heatmap,     setHeatmap]     = useState<HeatmapData>({});
  const [loading,     setLoading]     = useState(true);
  const [toggling,    setToggling]    = useState<Set<Prayer>>(new Set());

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!deviceId) return;

    (async () => {
      setLoading(true);
      const today    = localDateStr();
      const startDay = daysAgoStr(36);

      // Run both queries in parallel
      const [todayRes, histRes] = await Promise.all([
        supabase
          .from('prayer_logs')
          .select('prayer_name, prayed')
          .eq('device_id', deviceId)
          .eq('date', today),
        supabase
          .from('prayer_logs')
          .select('date')
          .eq('device_id', deviceId)
          .gte('date', startDay)
          .eq('prayed', true),
      ]);

      // Build todayPrayed
      const tp: TodayState = { ...DEFAULT_TODAY };
      todayRes.data?.forEach(({ prayer_name, prayed }) => {
        if (PRAYERS.includes(prayer_name as Prayer) && prayed) {
          tp[prayer_name as Prayer] = true;
        }
      });
      setTodayPrayed(tp);

      // Build heatmap
      const hm: HeatmapData = {};
      histRes.data?.forEach(({ date }) => {
        hm[date] = (hm[date] ?? 0) + 1;
      });
      setHeatmap(hm);

      setLoading(false);
    })();
  }, [deviceId]);

  // ── Toggle prayer ──────────────────────────────────────────────────────────

  const togglePrayer = useCallback(
    async (name: Prayer) => {
      if (!deviceId || toggling.has(name)) return;

      const newVal = !todayPrayed[name];
      const today  = localDateStr();

      // Optimistic update
      setTodayPrayed(prev => ({ ...prev, [name]: newVal }));
      setHeatmap(prev => ({
        ...prev,
        [today]: Math.max(0, (prev[today] ?? 0) + (newVal ? 1 : -1)),
      }));
      setToggling(prev => new Set(prev).add(name));

      const { error } = await supabase
        .from('prayer_logs')
        .upsert(
          { device_id: deviceId, date: today, prayer_name: name, prayed: newVal },
          { onConflict: 'device_id,date,prayer_name' },
        );

      if (error) {
        // Revert
        setTodayPrayed(prev => ({ ...prev, [name]: !newVal }));
        setHeatmap(prev => ({
          ...prev,
          [today]: Math.max(0, (prev[today] ?? 0) + (newVal ? -1 : 1)),
        }));
      }

      setToggling(prev => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    },
    [deviceId, todayPrayed, toggling],
  );

  // ── Derived ────────────────────────────────────────────────────────────────

  const today      = localDateStr();
  const todayCount = Object.values(todayPrayed).filter(Boolean).length;

  // Streak: consecutive days with ≥1 prayer (starting today if prayed, else yesterday)
  let streak = 0;
  {
    let i = (heatmap[today] ?? 0) > 0 ? 0 : 1;
    while (i < 366) {
      if ((heatmap[daysAgoStr(i)] ?? 0) > 0) { streak++; i++; } else break;
    }
  }

  const heatDates = buildHeatmapDates();
  // 5 rows × 7 cols
  const weekRows  = Array.from({ length: 5 }, (_, w) => heatDates.slice(w * 7, w * 7 + 7));

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading || !deviceId) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={palette.gold} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading your prayers…
        </Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Title ── */}
        <Text style={[styles.screenTitle, { color: colors.text }]}>Prayer Tracker</Text>

        {/* ── Streak + Today stats ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statTopAccent, { backgroundColor: palette.gold }]} />
            <Text style={[styles.statNumber, { color: colors.text }]}>{streak}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              {streak === 1 ? 'day streak' : 'day streak'} 🔥
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statTopAccent, { backgroundColor: palette.gold }]} />
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {todayCount}
              <Text style={[styles.statDenom, { color: colors.textMuted }]}>/5</Text>
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>prayed today</Text>
          </View>
        </View>

        {/* ── Today's Prayers ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Section header */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today</Text>
            <Text style={[styles.sectionDate, { color: colors.textMuted }]}>{todayLabel}</Text>
          </View>

          {PRAYERS.map((name, idx) => {
            const prayed  = todayPrayed[name];
            const loading = toggling.has(name);

            return (
              <TouchableOpacity
                key={name}
                style={[
                  styles.prayerRow,
                  idx < PRAYERS.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                  prayed && { backgroundColor: `rgba(200,169,110,0.06)` },
                ]}
                onPress={() => togglePrayer(name)}
                activeOpacity={0.7}
              >
                {/* Gold left accent when prayed */}
                {prayed && (
                  <View style={[styles.prayerAccent, { backgroundColor: palette.gold }]} />
                )}

                <MaterialCommunityIcons
                  name={PRAYER_ICONS[name] as any}
                  size={20}
                  color={prayed ? palette.gold : colors.tabInactive}
                  style={styles.prayerIcon}
                />

                <Text
                  style={[
                    styles.prayerName,
                    { color: prayed ? palette.gold : colors.text },
                  ]}
                >
                  {name}
                </Text>

                {loading ? (
                  <ActivityIndicator size="small" color={palette.gold} />
                ) : (
                  <Ionicons
                    name={prayed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={prayed ? palette.gold : colors.tabInactive}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Calendar Heatmap ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Past 5 Weeks</Text>
            <View style={styles.legend}>
              {[0, 1, 3, 5].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.legendDot,
                    {
                      backgroundColor:
                        n === 0 ? colors.cardAlt
                        : n === 1 ? 'rgba(200,169,110,0.28)'
                        : n === 3 ? 'rgba(200,169,110,0.62)'
                        : palette.gold,
                    },
                  ]}
                />
              ))}
              <Text style={[styles.legendText, { color: colors.textMuted }]}>5</Text>
            </View>
          </View>

          {/* Day-of-week header */}
          <View style={styles.heatRow}>
            {DAY_LABELS.map((d, i) => (
              <Text
                key={i}
                style={[styles.dayLabel, { color: colors.textMuted }]}
              >
                {d}
              </Text>
            ))}
          </View>

          {/* Week rows */}
          {weekRows.map((week, wi) => (
            <View key={wi} style={styles.heatRow}>
              {week.map(({ date, isFuture }) => (
                <HeatCell
                  key={date}
                  count={heatmap[date] ?? 0}
                  isToday={date === today}
                  isFuture={isFuture}
                />
              ))}
            </View>
          ))}
        </View>

        {/* ── Tip ── */}
        <Text style={[styles.tip, { color: colors.tabInactive }]}>
          Tap a prayer to log it · Darker = more prayers
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },

  loadingText:  { marginTop: 14, fontSize: 13, letterSpacing: 0.3 },
  screenTitle:  { fontSize: 26, fontWeight: '200', letterSpacing: 1.5, marginBottom: 20 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex:        1,
    alignItems:  'center',
    borderRadius: 14,
    borderWidth:  1,
    overflow:    'hidden',
    paddingBottom: 14,
  },
  statTopAccent: { width: '100%', height: 3, marginBottom: 12 },
  statNumber:    { fontSize: 32, fontWeight: '200', fontFamily: 'SpaceMono', letterSpacing: 1 },
  statDenom:     { fontSize: 18 },
  statLabel:     { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },

  // Section card
  section: {
    borderRadius:  16,
    borderWidth:   1,
    marginBottom:  16,
    overflow:      'hidden',
  },
  sectionHeader: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  sectionDate:  { fontSize: 11, letterSpacing: 0.3 },

  // Prayer rows
  prayerRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    position:          'relative',
  },
  prayerAccent: {
    position:     'absolute',
    left:         0,
    top:          0,
    bottom:       0,
    width:        3,
  },
  prayerIcon: { marginRight: 14 },
  prayerName: { flex: 1, fontSize: 15, letterSpacing: 0.3 },

  // Heatmap
  heatRow: {
    flexDirection:     'row',
    paddingHorizontal: 10,
    marginBottom:      2,
  },
  dayLabel: {
    flex:       1,
    textAlign:  'center',
    fontSize:   10,
    letterSpacing: 0.2,
    marginBottom: 4,
  },

  // Legend
  legend:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 10, marginLeft: 2, letterSpacing: 0.3 },

  tip: { fontSize: 11, textAlign: 'center', letterSpacing: 0.3, marginTop: 4 },
});
