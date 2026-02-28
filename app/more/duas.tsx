/**
 * DuasScreen — collapsible category accordion for daily duas.
 *
 * ARABIC FONT: For best Arabic rendering, add the Amiri or Scheherazade New font:
 *   1. Download Amiri-Regular.ttf from https://fonts.google.com/specimen/Amiri
 *   2. Place it in assets/fonts/Amiri-Regular.ttf
 *   3. In app/_layout.tsx, add to useFonts: { Amiri: require('../assets/fonts/Amiri-Regular.ttf') }
 *   4. In DuaCard.tsx, change fontFamily from 'GeezaPro'/'serif' to 'Amiri'
 *
 * Until then, the system Arabic font (Geeza Pro on iOS, Noto Naskh on Android) is used,
 * which renders correctly but lacks calligraphic elegance.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DuaCard from '@/components/DuaCard';
import { useTheme } from '@/context/ThemeContext';
import duasData from '@/data/duas.json';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id:    string;
  title: string;
  icon:  string;
  duas:  {
    id:             string;
    arabic:         string;
    transliteration: string;
    english:        string;
    reference:      string;
  }[];
}

// ─── Category Row ──────────────────────────────────────────────────────────────

function CategoryAccordion({ category }: { category: Category }) {
  const { colors, palette } = useTheme();
  const [open, setOpen] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;

  function toggle() {
    LayoutAnimation.configureNext({
      duration: 280,
      create:  { type: 'easeInEaseOut', property: 'opacity' },
      update:  { type: 'spring',        springDamping: 0.85 },
      delete:  { type: 'easeInEaseOut', property: 'opacity' },
    });

    Animated.timing(chevronAnim, {
      toValue:         open ? 0 : 1,
      duration:        260,
      useNativeDriver: true,
    }).start();

    setOpen((prev) => !prev);
  }

  const chevronRotate = chevronAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View
      style={[
        styles.accordion,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {/* ── Header ── */}
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={toggle}
        activeOpacity={0.75}
      >
        {/* Icon pill */}
        <View style={[styles.iconWrap, { backgroundColor: colors.cardAlt }]}>
          <MaterialCommunityIcons
            name={category.icon as any}
            size={17}
            color={palette.gold}
          />
        </View>

        {/* Title + count */}
        <View style={styles.headerText}>
          <Text style={[styles.categoryTitle, { color: colors.text }]}>
            {category.title}
          </Text>
          <Text style={[styles.categoryCount, { color: colors.textMuted }]}>
            {category.duas.length} {category.duas.length === 1 ? 'dua' : 'duas'}
          </Text>
        </View>

        {/* Animated chevron */}
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <MaterialCommunityIcons
            name="chevron-down"
            size={20}
            color={colors.tabInactive}
          />
        </Animated.View>
      </TouchableOpacity>

      {/* ── Expanded content ── */}
      {open && (
        <View style={[styles.duaList, { borderTopColor: colors.border }]}>
          {category.duas.map((dua, index) => (
            <DuaCard
              key={dua.id}
              dua={dua}
              isLast={index === category.duas.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DuasScreen() {
  const { colors, palette } = useTheme();
  const categories: Category[] = (duasData as any).categories;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={['top']}
    >
      {/* ── Custom header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={colors.text}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerArabic, { color: palette.gold }]}>
            أدعية
          </Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Daily Duas
          </Text>
        </View>

        {/* Spacer to center the title */}
        <View style={styles.backBtn} />
      </View>

      {/* ── Categories ── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Ornamental top divider */}
        <View style={styles.divider}>
          <View style={[styles.divLine, { backgroundColor: colors.border }]} />
          <View style={[styles.divDiamond, { backgroundColor: palette.gold }]} />
          <View style={[styles.divLine, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Authentic supplications from the Quran and Sunnah
        </Text>

        <View style={styles.categoriesContainer}>
          {categories.map((cat) => (
            <CategoryAccordion key={cat.id} category={cat} />
          ))}
        </View>

        {/* Footer note */}
        <Text style={[styles.footer, { color: colors.tabInactive }]}>
          All duas sourced from authenticated hadith collections
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width:           40,
    alignItems:      'flex-start',
    justifyContent:  'center',
  },
  headerCenter: {
    flex:       1,
    alignItems: 'center',
  },
  headerArabic: {
    fontSize:      16,
    letterSpacing: 1,
    fontFamily:    Platform.OS === 'ios' ? 'GeezaPro' : 'serif',
    lineHeight:    22,
    // Replace with 'Amiri' once the font is loaded
  },
  headerTitle: {
    fontSize:      13,
    letterSpacing: 1.2,
    fontWeight:    '300',
    marginTop:     2,
  },

  // Ornamental divider (matches hadith.tsx / more.tsx pattern)
  divider: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  12,
    marginTop:     4,
  },
  divLine:    { flex: 1, height: 1 },
  divDiamond: {
    width:           6,
    height:          6,
    transform:       [{ rotate: '45deg' }],
    marginHorizontal: 8,
  },

  // Scroll / layout
  scroll: {
    padding:       16,
    paddingBottom: 48,
  },

  subtitle: {
    fontSize:     12,
    letterSpacing: 0.3,
    textAlign:    'center',
    marginBottom: 20,
    fontStyle:    'italic',
  },

  categoriesContainer: {
    gap: 10,
  },

  // Accordion card
  accordion: {
    borderRadius: 16,
    borderWidth:  1,
    overflow:     'hidden',
  },
  accordionHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   14,
    gap:               12,
  },
  iconWrap: {
    width:           34,
    height:          34,
    borderRadius:    9,
    alignItems:      'center',
    justifyContent:  'center',
  },
  headerText: {
    flex: 1,
  },
  categoryTitle: {
    fontSize:      15,
    fontWeight:    '400',
    letterSpacing: 0.2,
  },
  categoryCount: {
    fontSize:      11,
    letterSpacing: 0.2,
    marginTop:     2,
  },

  // Duas list inside accordion
  duaList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Footer
  footer: {
    fontSize:      10,
    textAlign:     'center',
    letterSpacing: 0.3,
    marginTop:     24,
    fontStyle:     'italic',
  },
});
