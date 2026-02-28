import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  heatmap: Record<string, number>; // "YYYY-MM-DD" → prayer count 0–5
  today:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Map prayer count (0–5) to a green-scale background color (based on palette.green = #1B4332). */
function countColor(count: number, emptyColor: string, future: boolean): string {
  if (future)      return 'transparent';
  if (count === 0) return emptyColor;
  if (count === 1) return 'rgba(27,67,50,0.22)';
  if (count === 2) return 'rgba(27,67,50,0.40)';
  if (count === 3) return 'rgba(27,67,50,0.58)';
  if (count === 4) return 'rgba(27,67,50,0.76)';
  return 'rgba(27,67,50,1.00)'; // palette.green fully opaque
}

interface CalCell {
  date: string | null;
  day:  number | null;
}

/** Build a Mon-aligned calendar grid for the given year/month. */
function buildMonthGrid(year: number, month: number): CalCell[][] {
  const firstDay  = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startPad  = (firstDay.getDay() + 6) % 7; // 0 = Monday

  const cells: CalCell[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= totalDays; d++) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day:  d,
    });
  }

  const weeks: CalCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    while (week.length < 7) week.push({ date: null, day: null });
    weeks.push(week);
  }
  return weeks;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarHeatmap({ heatmap, today }: Props) {
  const { colors, palette } = useTheme();

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const fadeAnim = useRef(new Animated.Value(1)).current;

  function goMonth(delta: number) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      let m = month + delta;
      let y = year;
      if (m > 11) { m = 0;  y++; }
      if (m < 0)  { m = 11; y--; }
      setMonth(m);
      setYear(y);
      Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const weeks     = buildMonthGrid(year, month);
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long' });

  // Count prayers in this month for summary line
  const monthTotal = weeks.flat().reduce((sum, cell) => {
    if (!cell.date || cell.date > today) return sum;
    return sum + (heatmap[cell.date] ?? 0);
  }, 0);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goMonth(-1)} style={styles.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.monthTitle, { color: colors.text }]}>
            {monthName} {year}
          </Text>
          <Text style={[styles.monthSub, { color: colors.textMuted }]}>
            {monthTotal} prayers
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => !isCurrentMonth && goMonth(1)}
          style={[styles.navBtn, isCurrentMonth && { opacity: 0.25 }]}
          activeOpacity={isCurrentMonth ? 1 : 0.7}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Day-of-week labels ── */}
      <View style={styles.row}>
        {DAY_LABELS.map((d, i) => (
          <Text key={i} style={[styles.dayLabel, { color: colors.textMuted }]}>{d}</Text>
        ))}
      </View>

      {/* ── Month grid (fade on switch) ── */}
      <Animated.View style={{ opacity: fadeAnim }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.row}>
            {week.map((cell, ci) => {
              if (!cell.date) {
                return <View key={ci} style={styles.cell} />;
              }
              const count    = heatmap[cell.date] ?? 0;
              const isToday  = cell.date === today;
              const isFuture = cell.date > today;

              return (
                <View
                  key={ci}
                  style={[
                    styles.cell,
                    { backgroundColor: countColor(count, colors.cardAlt, isFuture) },
                    isToday  && { borderWidth: 1.5, borderColor: palette.gold },
                    isFuture && { borderWidth: 0.5, borderColor: colors.border, opacity: 0.25 },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </Animated.View>

      {/* ── Legend ── */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.tabInactive }]}>0</Text>
        {[0, 1, 2, 3, 4, 5].map(n => (
          <View
            key={n}
            style={[styles.legendDot, { backgroundColor: countColor(n, colors.cardAlt, false) }]}
          />
        ))}
        <Text style={[styles.legendText, { color: colors.tabInactive }]}>5</Text>
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth:  1,
    marginBottom: 16,
    overflow:     'hidden',
  },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 12,
    paddingVertical:   14,
  },
  headerCenter: { alignItems: 'center' },
  monthTitle:   { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  monthSub:     { fontSize: 10, letterSpacing: 0.3, marginTop: 1 },
  navBtn:       { padding: 6 },

  // Grid
  row: {
    flexDirection:     'row',
    paddingHorizontal: 10,
    marginBottom:      3,
  },
  cell: {
    flex:         1,
    aspectRatio:  1,
    borderRadius: 5,
    margin:       2,
  },
  dayLabel: {
    flex:          1,
    textAlign:     'center',
    fontSize:      10,
    letterSpacing: 0.2,
    marginBottom:  4,
  },

  // Legend
  legend: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
    paddingVertical: 12,
  },
  legendDot:  { width: 11, height: 11, borderRadius: 3 },
  legendText: { fontSize: 10, letterSpacing: 0.2 },
});
