import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

const ITEMS = [
  { label: 'Hadith of the Day', icon: '📖' },
  { label: 'Duas',              icon: '🤲' },
  { label: 'AI Scholar',        icon: '✦'  },
  { label: 'Settings',          icon: '⚙️'  },
] as const;

export default function MoreScreen() {
  const { colors, palette } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.heading, { color: colors.text }]}>More</Text>
      {ITEMS.map((item) => (
        <TouchableOpacity
          key={item.label}
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  heading:   { fontSize: 30, fontWeight: '300', letterSpacing: 1, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  icon:  { fontSize: 20, marginRight: 14, width: 28, textAlign: 'center' },
  label: { flex: 1, fontSize: 16, letterSpacing: 0.2 },
});
