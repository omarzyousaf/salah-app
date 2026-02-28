/**
 * ChatBubble — single message bubble for the Noor AI chat.
 *
 * User messages:  right-aligned, gold pill, dark text
 * Noor messages:  left-aligned, card background, Arabic ن avatar
 *
 * Markdown support: **bold**, *italic*, - bullet lists, blank-line spacing.
 * Fade-in animation (220ms) on mount.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import type { ChatMessage } from '@/services/anthropic';

// ─── Inline markdown parser ───────────────────────────────────────────────────

function parseInline(text: string, color: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let key  = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <Text key={key++} style={{ color }}>
          {text.slice(last, m.index)}
        </Text>,
      );
    }
    if (m[1] !== undefined) {
      // **bold**
      nodes.push(
        <Text key={key++} style={{ color, fontWeight: '600' }}>
          {m[1]}
        </Text>,
      );
    } else if (m[2] !== undefined) {
      // *italic*
      nodes.push(
        <Text key={key++} style={{ color, fontStyle: 'italic' }}>
          {m[2]}
        </Text>,
      );
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    nodes.push(
      <Text key={key++} style={{ color }}>
        {text.slice(last)}
      </Text>,
    );
  }

  return nodes.length ? nodes : [<Text key={0} style={{ color }}>{text}</Text>];
}

// ─── Bubble content (bullet lists + inline markdown) ─────────────────────────

function BubbleContent({
  text,
  textColor,
  mutedColor,
}: {
  text:       string;
  textColor:  string;
  mutedColor: string;
}) {
  const lines = text.split('\n');

  // Trim leading/trailing empty lines
  let start = 0;
  let end   = lines.length - 1;
  while (start <= end && lines[start].trim() === '') start++;
  while (end >= start && lines[end].trim() === '')   end--;
  const trimmed = lines.slice(start, end + 1);

  return (
    <View>
      {trimmed.map((line, i) => {
        if (line.trim() === '') {
          return <View key={i} style={styles.emptyLine} />;
        }

        const isBullet = /^[-•*]\s/.test(line.trim());
        const content  = isBullet ? line.trim().slice(2) : line;

        if (isBullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color: mutedColor }]}>{'•'}</Text>
              <Text style={[styles.bodyText, { color: textColor, flex: 1 }]}>
                {parseInline(content, textColor)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={i} style={[styles.bodyText, { color: textColor }]}>
            {parseInline(content, textColor)}
          </Text>
        );
      })}
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  message:      ChatMessage;
  isStreaming?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatBubble({ message, isStreaming = false }: Props) {
  const { colors, palette } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isUser   = message.role === 'user';

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue:         1,
      duration:        220,
      useNativeDriver: true,
    }).start();
  }, []);

  const textColor  = isUser ? palette.onGold : colors.text;
  const mutedColor = isUser ? 'rgba(28,26,23,0.55)' : colors.textMuted;

  return (
    <Animated.View
      style={[
        styles.row,
        isUser ? styles.rowRight : styles.rowLeft,
        { opacity: fadeAnim },
      ]}
    >
      {/* ── Noor avatar (AI only) ── */}
      {!isUser && (
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: 'rgba(200,169,110,0.12)',
              borderColor:     'rgba(200,169,110,0.30)',
            },
          ]}
        >
          <Text style={styles.avatarText}>ن</Text>
        </View>
      )}

      {/* ── Bubble ── */}
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: palette.gold }
            : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        ]}
      >
        <BubbleContent text={message.content} textColor={textColor} mutedColor={mutedColor} />

        {/* Blinking cursor while streaming */}
        {isStreaming && !isUser && <View style={styles.cursor} />}
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'flex-end',
    marginBottom:      10,
    paddingHorizontal: 16,
  },
  rowLeft:  { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  // Noor avatar
  avatar: {
    width:          32,
    height:         32,
    borderRadius:   10,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    8,
    flexShrink:     0,
  },
  avatarText: { fontSize: 16, fontFamily: 'serif' },

  // Bubble
  bubble: {
    maxWidth:          '78%',
    borderRadius:      18,
    paddingHorizontal: 14,
    paddingVertical:   10,
  },

  // Text
  bodyText: {
    fontSize:      14.5,
    lineHeight:    22,
    letterSpacing: 0.1,
  },

  // Bullet list
  bulletRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           6,
    marginBottom:  3,
  },
  bulletDot: {
    fontSize:   14.5,
    lineHeight: 22,
  },

  // Blank line spacer inside bubble
  emptyLine: { height: 8 },

  // Streaming cursor
  cursor: {
    width:        2,
    height:       14,
    borderRadius: 1,
    backgroundColor: 'rgba(200,169,110,0.7)',
    marginTop:    4,
    marginLeft:   2,
  },
});
