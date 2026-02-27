import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export default function QuranScreen() {
  const { colors, palette } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.arabic, { color: palette.gold }]}>القرآن الكريم</Text>
      <Text style={[styles.title, { color: colors.text }]}>Quran</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>114 Surahs · Audio & Translation</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  arabic:    { fontSize: 30, marginBottom: 4 },
  title:     { fontSize: 26, fontWeight: '300', letterSpacing: 1.5 },
  sub:       { fontSize: 13, letterSpacing: 0.5 },
});
