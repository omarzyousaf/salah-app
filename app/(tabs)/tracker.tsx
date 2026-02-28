import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CalendarHeatmap from '@/components/CalendarHeatmap';
import PrayerCheckbox from '@/components/PrayerCheckbox';
import StreakCounter from '@/components/StreakCounter';
import { useTheme } from '@/context/ThemeContext';
import { useDeviceId } from '@/hooks/useDeviceId';
import { supabase } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
type Prayer = (typeof PRAYERS)[number];

const CACHE_KEY = 'salah_tracker_v2';

// ─── Types ────────────────────────────────────────────────────────────────────

type DayLog = Record<Prayer, boolean>;

const EMPTY_LOG: DayLog = {
  Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false,
};

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

/** Build list of selectable dates: today + past 30 days, newest first to oldest. */
function buildDatePicker(): { dateStr: string; label: string; sub: string }[] {
  const items: { dateStr: string; label: string; sub: string }[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let i = 0; i <= 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = localDateStr(d);
    const label =
      i === 0 ? 'Today' :
      i === 1 ? 'Yest.' :
      d.toLocaleDateString('en-US', { weekday: 'short' });
    const sub = i <= 1
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : String(d.getDate());
    items.push({ dateStr, label, sub });
  }
  return items;
}

// ─── Streak calculation ───────────────────────────────────────────────────────

function calcStreak(logs: Record<string, DayLog>): number {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  // If today is incomplete, start counting from yesterday
  const todayStr = localDateStr(d);
  const todayLog = logs[todayStr];
  const todayDone = todayLog
    ? PRAYERS.every(p => todayLog[p])
    : false;

  if (!todayDone) d.setDate(d.getDate() - 1);

  for (let i = 0; i < 365; i++) {
    const dateStr = localDateStr(d);
    const log = logs[dateStr];
    if (log && PRAYERS.every(p => log[p])) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TrackerScreen() {
  const { colors, palette } = useTheme();
  const deviceId = useDeviceId();

  const [logs,     setLogs]     = useState<Record<string, DayLog>>({});
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState<Set<Prayer>>(new Set());
  const [selDate,  setSelDate]  = useState(localDateStr());

  const dateItems  = useMemo(() => buildDatePicker(), []);
  const dateScroll = useRef<ScrollView>(null);

  // ── Load: cache → Supabase ──────────────────────────────────────────────────

  useEffect(() => {
    if (!deviceId) return;

    // 1. Restore from AsyncStorage cache immediately
    AsyncStorage.getItem(CACHE_KEY).then(raw => {
      if (raw) {
        try {
          setLogs(JSON.parse(raw) as Record<string, DayLog>);
          setLoading(false);
        } catch { /* ignore corrupt cache */ }
      }
    });

    // 2. Always refresh from Supabase in background
    refreshFromSupabase(deviceId);
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshFromSupabase(did: string) {
    const { data } = await supabase
      .from('prayer_logs')
      .select('date, fajr, dhuhr, asr, maghrib, isha')
      .eq('device_id', did)
      .gte('date', daysAgoStr(90));

    if (data) {
      const fresh: Record<string, DayLog> = {};
      data.forEach((row: any) => {
        fresh[row.date as string] = {
          Fajr:    Boolean(row.fajr),
          Dhuhr:   Boolean(row.dhuhr),
          Asr:     Boolean(row.asr),
          Maghrib: Boolean(row.maghrib),
          Isha:    Boolean(row.isha),
        };
      });
      setLogs(fresh);
      setLoading(false);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    } else {
      setLoading(false);
    }
  }

  // ── Scroll date picker to "Today" on mount ─────────────────────────────────

  useEffect(() => {
    setTimeout(() => dateScroll.current?.scrollTo({ x: 0, animated: false }), 100);
  }, []);

  // ── Toggle prayer ──────────────────────────────────────────────────────────

  const togglePrayer = useCallback(
    async (name: Prayer) => {
      if (!deviceId || toggling.has(name)) return;

      const prev    = logs[selDate] ?? EMPTY_LOG;
      const newLog  = { ...prev, [name]: !prev[name] };

      // Optimistic update
      setLogs(l => ({ ...l, [selDate]: newLog }));
      setToggling(t => new Set(t).add(name));

      const { error } = await supabase
        .from('prayer_logs')
        .upsert(
          {
            device_id: deviceId,
            date:      selDate,
            fajr:      newLog.Fajr,
            dhuhr:     newLog.Dhuhr,
            asr:       newLog.Asr,
            maghrib:   newLog.Maghrib,
            isha:      newLog.Isha,
          },
          { onConflict: 'device_id,date' },
        );

      if (error) {
        // Revert on failure
        setLogs(l => ({ ...l, [selDate]: prev }));
      } else {
        // Persist cache
        setLogs(current => {
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(current));
          return current;
        });
      }

      setToggling(t => {
        const next = new Set(t);
        next.delete(name);
        return next;
      });
    },
    [deviceId, logs, selDate, toggling],
  );

  // ── Derived values ─────────────────────────────────────────────────────────

  const today       = localDateStr();
  const selLog      = logs[selDate] ?? EMPTY_LOG;
  const selCount    = PRAYERS.filter(p => selLog[p]).length;
  const streak      = useMemo(() => calcStreak(logs), [logs]);

  // Heatmap: date → prayer count (0–5)
  const heatmap = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    Object.entries(logs).forEach(([date, log]) => {
      out[date] = PRAYERS.filter(p => log[p]).length;
    });
    return out;
  }, [logs]);

  // Friendly label for selected date
  const selLabel = useMemo(() => {
    if (selDate === today) return 'Today';
    if (selDate === daysAgoStr(1)) return 'Yesterday';
    return new Date(selDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }, [selDate, today]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading && !deviceId) {
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Title ── */}
        <Text style={[styles.title, { color: colors.text }]}>Prayer Tracker</Text>

        {/* ── Streak counter ── */}
        <StreakCounter streak={streak} />

        {/* ── Date picker ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SELECT DATE</Text>
          <ScrollView
            ref={dateScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.datePicker}
          >
            {dateItems.map(({ dateStr, label, sub }) => {
              const isSel = dateStr === selDate;
              return (
                <TouchableOpacity
                  key={dateStr}
                  onPress={() => setSelDate(dateStr)}
                  style={[
                    styles.datePill,
                    { borderColor: isSel ? palette.gold : colors.border },
                    isSel && { backgroundColor: palette.gold },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillTop, { color: isSel ? palette.onGold : colors.textMuted }]}>
                    {label}
                  </Text>
                  <Text style={[styles.pillBot, { color: isSel ? palette.onGold : colors.tabInactive }]}>
                    {sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Prayer checkboxes ── */}
        <View style={[styles.prayerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Card header */}
          <View style={styles.prayerHeader}>
            <View>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>{selLabel}</Text>
              <Text style={[styles.prayerCount, { color: colors.textMuted }]}>
                {selCount} / 5 prayers
              </Text>
            </View>
            {/* Mini progress dots */}
            <View style={styles.dots}>
              {PRAYERS.map(p => (
                <View
                  key={p}
                  style={[
                    styles.dot,
                    { backgroundColor: selLog[p] ? palette.gold : colors.cardAlt },
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.cardAlt }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: palette.gold, width: `${selCount * 20}%` as any },
              ]}
            />
          </View>

          {/* Prayer rows */}
          {PRAYERS.map((name, idx) => (
            <PrayerCheckbox
              key={name}
              name={name}
              checked={selLog[name]}
              onToggle={() => togglePrayer(name)}
              loading={toggling.has(name)}
              isLast={idx === PRAYERS.length - 1}
            />
          ))}
        </View>

        {/* ── Calendar heatmap ── */}
        <CalendarHeatmap heatmap={heatmap} today={today} />

        {/* ── Tip ── */}
        <Text style={[styles.tip, { color: colors.tabInactive }]}>
          Tap a prayer to log it · Green = all 5 completed
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },

  loadingText: { marginTop: 14, fontSize: 13, letterSpacing: 0.3 },
  title:       { fontSize: 26, fontWeight: '200', letterSpacing: 1.5, marginBottom: 20 },

  // Section card (date picker)
  section: {
    borderRadius: 16,
    borderWidth:  1,
    marginBottom: 16,
    paddingTop:   14,
    paddingBottom: 14,
    overflow:     'hidden',
  },
  sectionTitle: {
    fontSize:          10,
    letterSpacing:     1.2,
    fontWeight:        '600',
    paddingHorizontal: 16,
    marginBottom:      10,
  },

  // Date picker
  datePicker: { paddingHorizontal: 12, gap: 8 },
  datePill: {
    width:          58,
    alignItems:     'center',
    borderRadius:   12,
    borderWidth:    1,
    paddingVertical: 8,
  },
  pillTop: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  pillBot: { fontSize: 14, fontWeight: '300', fontFamily: 'SpaceMono', marginTop: 2 },

  // Prayer card
  prayerCard: {
    borderRadius: 16,
    borderWidth:  1,
    marginBottom: 16,
    overflow:     'hidden',
  },
  prayerHeader: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingTop:        16,
    paddingBottom:     10,
  },
  sectionHeading: { fontSize: 15, fontWeight: '600', letterSpacing: 0.2 },
  prayerCount:    { fontSize: 11, letterSpacing: 0.3, marginTop: 2 },

  // Progress dots
  dots: { flexDirection: 'row', gap: 5 },
  dot:  { width: 8, height: 8, borderRadius: 4 },

  // Progress bar
  progressTrack: {
    height:            2,
    marginHorizontal:  16,
    marginBottom:      4,
    borderRadius:      1,
    overflow:          'hidden',
  },
  progressFill: {
    height:       2,
    borderRadius: 1,
  },

  tip: { fontSize: 11, textAlign: 'center', letterSpacing: 0.3, marginTop: 4 },
});
