/**
 * app/more/settings.tsx — App Settings Screen
 *
 * Sections:
 *  • APPEARANCE   — theme mode (Light / Dark / System)
 *  • PRAYER TIMES — calculation method selector
 *  • QURAN        — default reciter selector
 *  • LOCATION     — current saved city, navigate to Prayer Times to change
 *  • ABOUT        — version + credits
 *  • DATA         — clear all local data
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import type { ThemeMode } from '@/context/ThemeContext';
import {
  type PrayerMethodId,
  type ReciterId,
  PRAYER_METHODS,
  QURAN_RECITERS,
  clearAllData,
  getSettings,
  setDefaultReciter,
  setPrayerMethod,
} from '@/services/settings';

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{title}</Text>
  );
}

// ─── Settings row ─────────────────────────────────────────────────────────────

function SettingRow({
  icon,
  label,
  value,
  onPress,
  right,
  destructive = false,
}: {
  icon:        string;
  label:       string;
  value?:      string;
  onPress?:    () => void;
  right?:      React.ReactNode;
  destructive?: boolean;
}) {
  const { colors, palette } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !right}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.cardAlt }]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={18}
          color={destructive ? colors.danger : palette.gold}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: destructive ? colors.danger : colors.text }]}>
          {label}
        </Text>
        {value !== undefined && (
          <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      {right ?? (
        onPress && (
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.tabInactive} />
        )
      )}
    </TouchableOpacity>
  );
}

// ─── Picker modal (bottom sheet) ──────────────────────────────────────────────

interface PickerItem {
  id:    string | number;
  label: string;
  sub?:  string;
}

function PickerModal({
  visible,
  title,
  items,
  selected,
  onSelect,
  onClose,
}: {
  visible:  boolean;
  title:    string;
  items:    PickerItem[];
  selected: string | number;
  onSelect: (id: string | number) => void;
  onClose:  () => void;
}) {
  const { colors, palette } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
        {items.map((item, i) => {
          const isSelected = item.id === selected;
          return (
            <TouchableOpacity
              key={String(item.id)}
              style={[
                styles.sheetItem,
                { borderTopColor: colors.border },
                i > 0 && styles.sheetItemBorder,
                isSelected && { backgroundColor: `rgba(200,169,110,0.07)` },
              ]}
              onPress={() => { onSelect(item.id); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={styles.sheetItemBody}>
                <Text style={[styles.sheetItemLabel, { color: isSelected ? palette.gold : colors.text }]}>
                  {item.label}
                </Text>
                {item.sub && (
                  <Text style={[styles.sheetItemSub, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.sub}
                  </Text>
                )}
              </View>
              {isSelected && (
                <MaterialCommunityIcons name="check" size={18} color={palette.gold} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { colors, palette, isDark, mode, setMode } = useTheme();

  const [prayerMethod,    setPrayerMethodState]   = useState<PrayerMethodId>(2);
  const [reciter,         setReciterState]         = useState<ReciterId>('ar.alafasy');
  const [currentLocation, setCurrentLocation]     = useState<string | null>(null);
  const [methodPickerOpen, setMethodPickerOpen]   = useState(false);
  const [reciterPickerOpen, setReciterPickerOpen] = useState(false);

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    getSettings().then(s => {
      setPrayerMethodState(s.prayerMethod);
      setReciterState(s.reciter);
    });

    AsyncStorage.getItem('salah_location').then(raw => {
      if (raw) {
        try {
          const loc = JSON.parse(raw) as { label: string };
          setCurrentLocation(loc.label ?? null);
        } catch {}
      }
    });
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleSelectMethod(id: string | number) {
    const m = Number(id) as PrayerMethodId;
    setPrayerMethodState(m);
    setPrayerMethod(m);
  }

  function handleSelectReciter(id: string | number) {
    const r = String(id) as ReciterId;
    setReciterState(r);
    setDefaultReciter(r);
  }

  const handleClearData = useCallback(() => {
    Alert.alert(
      'Clear All Data',
      'This will remove all prayer logs, location, Quran progress, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Clear Data',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            setPrayerMethodState(2);
            setReciterState('ar.alafasy');
            setCurrentLocation(null);
            Alert.alert('Done', 'All local data has been cleared.');
          },
        },
      ],
    );
  }, []);

  // ── Derived display values ────────────────────────────────────────────────

  const methodLabel   = PRAYER_METHODS.find(m => m.id === prayerMethod)?.label ?? '—';
  const reciterLabel  = QURAN_RECITERS.find(r => r.id === reciter)?.label  ?? '—';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── APPEARANCE ── */}
        <SectionLabel title="APPEARANCE" />

        {/* Dark mode quick toggle */}
        <SettingRow
          icon="theme-light-dark"
          label="Dark Mode"
          right={
            <Switch
              value={isDark}
              onValueChange={v => setMode(v ? 'dark' : 'light')}
              trackColor={{ false: colors.cardAlt, true: `rgba(200,169,110,0.40)` }}
              thumbColor={isDark ? palette.gold : colors.tabInactive}
            />
          }
        />

        {/* Theme mode — segmented (Light / Dark / System) */}
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.cardAlt }]}>
            <MaterialCommunityIcons name="palette-outline" size={18} color={palette.gold} />
          </View>
          <Text style={[styles.rowLabel, { color: colors.text, flex: 1 }]}>Theme</Text>
          <View style={styles.segmented}>
            {(['light', 'dark', 'system'] as ThemeMode[]).map(m => (
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
                    { color: mode === m ? palette.onGold : colors.textMuted },
                  ]}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── PRAYER TIMES ── */}
        <SectionLabel title="PRAYER TIMES" />

        <SettingRow
          icon="clock-outline"
          label="Calculation Method"
          value={methodLabel}
          onPress={() => setMethodPickerOpen(true)}
        />

        {/* ── QURAN ── */}
        <SectionLabel title="QURAN" />

        <SettingRow
          icon="microphone-outline"
          label="Default Reciter"
          value={reciterLabel}
          onPress={() => setReciterPickerOpen(true)}
        />

        {/* ── LOCATION ── */}
        <SectionLabel title="LOCATION" />

        <SettingRow
          icon="map-marker-outline"
          label="Current Location"
          value={currentLocation ?? 'Not set'}
        />

        <View
          style={[
            styles.hint,
            { backgroundColor: colors.cardAlt, borderColor: colors.border },
          ]}
        >
          <MaterialCommunityIcons name="information-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            Change location from the Prayer Times tab using GPS or city search.
          </Text>
        </View>

        {/* ── ABOUT ── */}
        <SectionLabel title="ABOUT" />

        <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.aboutDivider}>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            <View style={[styles.divDiamond, { backgroundColor: palette.gold }]} />
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
          </View>
          <Text style={[styles.appName, { color: palette.gold }]}>Salah</Text>
          <Text style={[styles.appSub, { color: colors.textMuted }]}>
            Prayer Times · Qibla · Quran · Tracker
          </Text>
          <Text style={[styles.appVer, { color: colors.tabInactive }]}>Version 1.0.0</Text>
          <View style={styles.aboutDivider}>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            <View style={[styles.divDiamond, { backgroundColor: palette.gold }]} />
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
          </View>
        </View>

        <Text style={[styles.credits, { color: colors.tabInactive }]}>
          Prayer times — Aladhan API{'\n'}
          Quran text &amp; audio — Islamic Network API{'\n'}
          Hadith — HadithAPI
        </Text>

        {/* ── DATA ── */}
        <SectionLabel title="DATA" />

        <SettingRow
          icon="delete-outline"
          label="Clear Local Data"
          onPress={handleClearData}
          destructive
        />

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Pickers ── */}
      <PickerModal
        visible={methodPickerOpen}
        title="Calculation Method"
        items={PRAYER_METHODS as unknown as PickerItem[]}
        selected={prayerMethod}
        onSelect={handleSelectMethod}
        onClose={() => setMethodPickerOpen(false)}
      />
      <PickerModal
        visible={reciterPickerOpen}
        title="Default Reciter"
        items={QURAN_RECITERS as unknown as PickerItem[]}
        selected={reciter}
        onSelect={handleSelectReciter}
        onClose={() => setReciterPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap:               12,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: 0.3 },

  scroll: { padding: 20, paddingBottom: 40 },

  sectionLabel: {
    fontSize:      10,
    letterSpacing: 1.2,
    fontWeight:    '600',
    marginBottom:  8,
    marginTop:     20,
    marginLeft:    2,
  },

  // Setting row
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
  rowBody:  { flex: 1 },
  rowLabel: { fontSize: 15, letterSpacing: 0.2 },
  rowValue: { fontSize: 12, marginTop: 2, letterSpacing: 0.2 },

  // Segmented control (for theme)
  segmented: { flexDirection: 'row', gap: 4 },
  seg: {
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:       8,
    borderWidth:        1,
  },
  segText: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },

  // Hint
  hint: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               7,
    borderRadius:      10,
    borderWidth:       1,
    paddingHorizontal: 12,
    paddingVertical:    9,
    marginBottom:       8,
  },
  hintText: { flex: 1, fontSize: 11, lineHeight: 16, letterSpacing: 0.2 },

  // About card
  aboutCard: {
    borderRadius:      16,
    borderWidth:       1,
    alignItems:        'center',
    paddingVertical:   24,
    paddingHorizontal: 20,
    marginBottom:      8,
  },
  aboutDivider: { flexDirection: 'row', alignItems: 'center', width: '50%', marginVertical: 10 },
  divLine:      { flex: 1, height: 1 },
  divDiamond:   { width: 6, height: 6, transform: [{ rotate: '45deg' }], marginHorizontal: 8 },
  appName:      { fontSize: 28, fontWeight: '200', letterSpacing: 3 },
  appSub:       { fontSize: 12, letterSpacing: 0.4, marginTop: 4 },
  appVer:       { fontSize: 11, letterSpacing: 0.5, marginTop: 8 },
  credits:      { fontSize: 10, textAlign: 'center', letterSpacing: 0.3, lineHeight: 17, marginBottom: 8 },

  // Bottom sheet modal
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  sheet: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    borderTopLeftRadius:  22,
    borderTopRightRadius: 22,
    borderWidth:    1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop:     12,
    paddingBottom:  Platform.OS === 'ios' ? 36 : 20,
  },
  sheetHandle: {
    width:        40,
    height:        4,
    borderRadius:  2,
    alignSelf:    'center',
    marginBottom:  14,
  },
  sheetTitle: {
    fontSize:      17,
    fontWeight:    '600',
    letterSpacing:  0.3,
    marginBottom:  10,
  },
  sheetItem: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  sheetItemBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  sheetItemBody:   { flex: 1 },
  sheetItemLabel:  { fontSize: 15, letterSpacing: 0.2 },
  sheetItemSub:    { fontSize: 11, marginTop: 2, letterSpacing: 0.2 },
});
