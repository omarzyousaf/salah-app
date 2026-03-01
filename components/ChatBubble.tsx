/**
 * ChatBubble — single message bubble for the Noor AI chat.
 *
 * User messages:  right-aligned, gold pill, dark text
 * Noor messages:  left-aligned, card background, Arabic ن avatar
 *
 * Markdown support: **bold**, *italic*, - bullet lists, blank-line spacing.
 * Fade-in animation (220ms) on mount.
 *
 * AI bubbles include:
 *  • Blinking cursor while isStreaming
 *  • Copy-to-clipboard + Share buttons that fade in once streaming ends
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const cursorAnim = useRef(new Animated.Value(1)).current;
  const isUser     = message.role === 'user';

  const [copied, setCopied] = useState(false);

  // ── Bubble fade-in on mount ──────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue:         1,
      duration:        220,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cursor blink while streaming ─────────────────────────────────────────────
  useEffect(() => {
    if (!isStreaming) {
      cursorAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0,   duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Copy / Share ─────────────────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await Clipboard.setStringAsync(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function handleShare() {
    try {
      await Share.share({ message: message.content });
    } catch {}
  }

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

        {/* ── Blinking cursor while streaming ── */}
        {isStreaming && !isUser && (
          <Animated.View style={[styles.cursor, { opacity: cursorAnim }]} />
        )}

        {/* ── Copy & Share (AI bubbles only, hidden while streaming) ── */}
        {!isStreaming && !isUser && (
          <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={handleCopy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
              accessibilityLabel={copied ? 'Copied' : 'Copy message'}
            >
              <MaterialCommunityIcons
                name={copied ? 'check' : 'content-copy'}
                size={14}
                color={copied ? '#6BC17A' : 'rgba(140,140,140,0.65)'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShare}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
              accessibilityLabel="Share message"
            >
              <MaterialCommunityIcons
                name="share-variant"
                size={14}
                color="rgba(140,140,140,0.65)"
              />
            </TouchableOpacity>
          </View>
        )}
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

  // Blinking streaming cursor
  cursor: {
    width:           2,
    height:          14,
    borderRadius:    1,
    backgroundColor: 'rgba(200,169,110,0.8)',
    marginTop:       4,
    marginLeft:      2,
  },

  // Copy / Share action row
  actionRow: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    gap:            12,
    marginTop:      8,
    paddingTop:     6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
