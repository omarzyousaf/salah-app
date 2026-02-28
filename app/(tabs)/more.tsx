import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';

// ─── Row components ────────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{title}</Text>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  right,
}: {
  icon:    string;
  label:   string;
  onPress?: () => void;
  right?:  React.ReactNode;
}) {
  const { colors, palette } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.cardAlt }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={palette.gold} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {right ?? (
        onPress && <Ionicons name="chevron-forward" size={16} color={colors.tabInactive} />
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const { colors, palette, isDark, mode, toggleTheme, setMode } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text }]}>More</Text>

        {/* ── Explore ── */}
        <SectionLabel title="EXPLORE" />

        <MenuRow
          icon="book-open-page-variant-outline"
          label="Hadith of the Day"
          onPress={() => router.push('/more/hadith')}
        />

        {/* ── Appearance ── */}
        <SectionLabel title="APPEARANCE" />

        <MenuRow
          icon="theme-light-dark"
          label="Dark Mode"
          right={
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.cardAlt, true: `rgba(200,169,110,0.4)` }}
              thumbColor={isDark ? palette.gold : colors.tabInactive}
            />
          }
        />

        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.cardAlt }]}>
            <MaterialCommunityIcons name="palette-outline" size={18} color={palette.gold} />
          </View>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Theme</Text>
          <View style={styles.segmented}>
            {(['light', 'dark', 'system'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.seg,
                  { borderColor: colors.border },
                  mode === m && { backgroundColor: palette.gold, borderColor: palette.gold },
                ]}
                onPress={() => setMode(m)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.segText,
                    { color: mode === m ? '#111' : colors.textMuted },
                  ]}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── About ── */}
        <SectionLabel title="ABOUT" />

        <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.aboutDivider}>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            <View style={[styles.divDiamond, { backgroundColor: palette.gold }]} />
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
          </View>
          <Text style={[styles.appName, { color: palette.gold }]}>Salah</Text>
          <Text style={[styles.appSub,  { color: colors.textMuted }]}>
            Prayer Times · Qibla · Quran · Tracker
          </Text>
          <Text style={[styles.appVer,  { color: colors.tabInactive }]}>Version 1.0.0</Text>
          <View style={styles.aboutDivider}>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            <View style={[styles.divDiamond, { backgroundColor: palette.gold }]} />
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
          </View>
        </View>

        <Text style={[styles.footer, { color: colors.tabInactive }]}>
          Prayer times from Aladhan API · Quran audio from Islamic Network
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },

  title:        { fontSize: 26, fontWeight: '200', letterSpacing: 1.5, marginBottom: 24 },
  sectionLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '600', marginBottom: 8, marginLeft: 2 },

  row: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      14,
    borderWidth:       1,
    marginBottom:      8,
    paddingVertical:   12,
    paddingHorizontal: 14,
    gap:               12,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, letterSpacing: 0.2 },

  // Segmented control
  segmented:  { flexDirection: 'row', gap: 4 },
  seg: {
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:      8,
    borderWidth:       1,
  },
  segText: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },

  // About card
  aboutCard: {
    borderRadius:  16,
    borderWidth:   1,
    alignItems:    'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom:  16,
    marginTop:     8,
  },
  aboutDivider: { flexDirection: 'row', alignItems: 'center', width: '50%', marginVertical: 12 },
  divLine:      { flex: 1, height: 1 },
  divDiamond:   { width: 6, height: 6, transform: [{ rotate: '45deg' }], marginHorizontal: 8 },
  appName:      { fontSize: 28, fontWeight: '200', letterSpacing: 3 },
  appSub:       { fontSize: 12, letterSpacing: 0.4, marginTop: 4 },
  appVer:       { fontSize: 11, letterSpacing: 0.5, marginTop: 8 },

  footer: { fontSize: 10, textAlign: 'center', letterSpacing: 0.3, lineHeight: 16 },
});
