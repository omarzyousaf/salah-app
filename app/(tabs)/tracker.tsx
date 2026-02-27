import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export default function TrackerScreen() {
  const { colors, palette } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: palette.gold }]}>Prayer Tracker</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>Streaks · Calendar · History</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title:     { fontSize: 26, fontWeight: '300', letterSpacing: 1.5 },
  sub:       { fontSize: 13, letterSpacing: 0.5 },
});
