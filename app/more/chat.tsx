/**
 * app/more/chat.tsx — Noor AI Chat Screen
 *
 * Features:
 *  • Streaming word-by-word AI responses via Supabase Edge Function
 *  • Typing indicator (3 bouncing dots) while waiting for first chunk
 *  • Starter suggestion chips before first message
 *  • Daily message counter (warning at 15, soft-block at 20)
 *  • Inline markdown: **bold**, *italic*, - bullet lists
 *  • Error handling: rate limit, network failure
 *  • 500-character input limit with counter
 *  • Keyboard-aware layout (iOS padding, Android resize)
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatBubble from '@/components/ChatBubble';
import { useTheme } from '@/context/ThemeContext';
import {
  type ChatMessage,
  type CountInfo,
  DAILY_LIMIT,
  WARN_AT,
  getCountInfo,
  streamMessage,
} from '@/services/anthropic';

const MAX_CHARS = 500;

const STARTERS = [
  'How can I improve my focus in salah?',
  'What does Islam say about anxiety?',
  'Tell me about Laylat al-Qadr',
  'How do I make tawbah sincerely?',
];

// ─── Typing indicator — 3 bouncing dots ──────────────────────────────────────

function TypingIndicator() {
  const { colors, palette } = useTheme();

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function makeBounce(dot: Animated.Value, delay: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 260, useNativeDriver: true }),
          Animated.timing(dot, { toValue:  0, duration: 260, useNativeDriver: true }),
          Animated.delay(Math.max(0, 580 - delay)),
        ]),
      );
    }

    const a1 = makeBounce(dot1, 0);
    const a2 = makeBounce(dot2, 140);
    const a3 = makeBounce(dot3, 280);

    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.typingRow}>
      <View
        style={[
          styles.typingAvatar,
          { backgroundColor: 'rgba(200,169,110,0.12)', borderColor: 'rgba(200,169,110,0.30)' },
        ]}
      >
        <Text style={styles.typingAvatarText}>ن</Text>
      </View>
      <View
        style={[
          styles.typingBubble,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.typingDot,
              { backgroundColor: palette.gold, transform: [{ translateY: dot }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors, palette }  = useTheme();
  const insets               = useSafeAreaInsets();
  const bottomPad            = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 8);

  const [messages,      setMessages]      = useState<ChatMessage[]>([]);
  const [input,         setInput]         = useState('');
  const [isLoading,     setIsLoading]     = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [countInfo,     setCountInfo]     = useState<CountInfo | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  const scrollRef    = useRef<ScrollView>(null);
  const streamBuffer = useRef('');
  const abortRef     = useRef<AbortController | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against double-commit if abort and onComplete race
  const doneRef      = useRef(false);

  // Load count info on mount
  useEffect(() => {
    getCountInfo().then(setCountInfo);
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  // Scroll when messages are added
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollToBottom(true), 80);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    };
  }, []);

  // ── Commit a finished (or partial) AI message ─────────────────────────────

  function commitMessage(text: string) {
    if (doneRef.current) return;
    doneRef.current = true;

    if (!text.trim()) {
      // Nothing to show (e.g. aborted before any content arrived)
      setIsLoading(false);
      setStreamingText('');
      return;
    }

    const aiMsg: ChatMessage = { role: 'assistant', content: text };
    setMessages(prev => [...prev, aiMsg]);
    setStreamingText('');
    setIsLoading(false);
    getCountInfo().then(setCountInfo);
    setTimeout(() => scrollToBottom(true), 80);
  }

  // ── Stop current generation ────────────────────────────────────────────────

  function handleStop() {
    if (typeTimerRef.current) {
      // Simulated typing is in progress — cancel it and commit whatever is visible
      clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
      // streamingText is the current partial revealed text
      commitMessage(streamingText);
    } else {
      // Real streaming fetch — abort the request; onComplete will commit partial
      abortRef.current?.abort();
    }
  }

  // ── Send a message ─────────────────────────────────────────────────────────

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;

    setError(null);
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content };
    const next: ChatMessage[]  = [...messages, userMsg];
    setMessages(next);
    setIsLoading(true);
    streamBuffer.current = '';
    setStreamingText('');
    doneRef.current = false;

    // Cancel any lingering previous request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setTimeout(() => scrollToBottom(true), 80);

    await streamMessage({
      messages: next,
      signal:   ctrl.signal,

      onDelta(chunk) {
        streamBuffer.current += chunk;
        setStreamingText(streamBuffer.current);
        scrollToBottom(false);
      },

      onComplete(fullText) {
        const finalText = fullText || streamBuffer.current;

        // Real streaming occurred — commit immediately
        if (streamBuffer.current.length > 0) {
          commitMessage(finalText);
          return;
        }

        // Non-streaming fallback: reveal words one by one (simulated typing)
        // Split on whitespace boundaries, keeping the spaces so text looks natural
        const tokens = finalText.split(/(\s+)/);
        let idx      = 0;
        let revealed = '';

        if (typeTimerRef.current) clearInterval(typeTimerRef.current);

        typeTimerRef.current = setInterval(() => {
          // Signal fired between ticks — commit partial and stop
          if (ctrl.signal.aborted) {
            clearInterval(typeTimerRef.current!);
            typeTimerRef.current = null;
            commitMessage(revealed);
            return;
          }

          revealed += tokens[idx] ?? '';
          idx++;
          setStreamingText(revealed);
          scrollToBottom(false);

          if (idx >= tokens.length) {
            clearInterval(typeTimerRef.current!);
            typeTimerRef.current = null;
            commitMessage(finalText);
          }
        }, 22);
      },

      onError(msg) {
        setError(msg);
        setIsLoading(false);
        setStreamingText('');
        getCountInfo().then(setCountInfo);
      },
    });
  }

  const isLimitReached = countInfo?.isLimitReached ?? false;
  const remaining      = countInfo?.remaining ?? DAILY_LIMIT;
  const showWarn       = (countInfo?.shouldWarn ?? false) && !isLimitReached;
  const showCount      = remaining <= 5 || showWarn || isLimitReached;
  const canSend        = input.trim().length > 0 && !isLoading && !isLimitReached;

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

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Noor</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Islamic AI Companion</Text>
        </View>

        {/* Spacer so title stays centered */}
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Message list ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Disclaimer */}
          <View
            style={[
              styles.disclaimer,
              { backgroundColor: colors.cardAlt, borderColor: colors.border },
            ]}
          >
            <MaterialCommunityIcons
              name="information-outline"
              size={13}
              color={colors.textMuted}
              style={{ marginTop: 1 }}
            />
            <Text style={[styles.disclaimerText, { color: colors.textMuted }]}>
              Noor is an AI — not a scholar. For religious rulings, consult a qualified imam.
            </Text>
          </View>

          {/* Starter chips — visible before first message */}
          {messages.length === 0 && !isLoading && (
            <View style={styles.starterWrap}>
              <Text style={[styles.starterLabel, { color: colors.textMuted }]}>
                Ask me anything…
              </Text>
              <View style={styles.chips}>
                {STARTERS.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    onPress={() => handleSend(s)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}

          {/* Live streaming response */}
          {streamingText !== '' && (
            <ChatBubble
              message={{ role: 'assistant', content: streamingText }}
              isStreaming
            />
          )}

          {/* Typing indicator — shown while waiting for first streaming chunk */}
          {isLoading && streamingText === '' && <TypingIndicator />}

          {/* Error banner */}
          {error !== null && (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: colors.dangerBg,
                  borderColor:     colors.dangerBorder,
                },
              ]}
            >
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Input bar ── */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.bg,
              borderTopColor:  colors.border,
              paddingBottom:   bottomPad,
            },
          ]}
        >
          {/* Daily count badge */}
          {showCount && (
            <Text
              style={[
                styles.countText,
                { color: showWarn || isLimitReached ? palette.gold : colors.textMuted },
              ]}
            >
              {isLimitReached
                ? "Today's limit reached (20 / 20)"
                : `${remaining} message${remaining === 1 ? '' : 's'} left today`}
            </Text>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor:     colors.border,
                  color:           colors.text,
                },
              ]}
              placeholder="Ask Noor something…"
              placeholderTextColor={colors.tabInactive}
              value={input}
              onChangeText={t => setInput(t.slice(0, MAX_CHARS))}
              multiline
              maxLength={MAX_CHARS}
              returnKeyType="default"
              editable={!isLimitReached}
            />

            {isLoading ? (
              /* ── Stop button — cancels current generation ── */
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.cardAlt }]}
                onPress={handleStop}
                activeOpacity={0.75}
                accessibilityLabel="Stop generating"
                accessibilityRole="button"
              >
                <View style={[styles.stopIcon, { backgroundColor: colors.text }]} />
              </TouchableOpacity>
            ) : (
              /* ── Send button ── */
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  { backgroundColor: canSend ? palette.gold : colors.cardAlt },
                ]}
                onPress={() => handleSend()}
                disabled={!canSend}
                activeOpacity={0.75}
                accessibilityLabel="Send message"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name="send"
                  size={18}
                  color={canSend ? palette.onGold : colors.tabInactive}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Character counter — shown above 80% */}
          {input.length > MAX_CHARS * 0.8 && (
            <Text
              style={[
                styles.charCount,
                { color: input.length >= MAX_CHARS ? colors.danger : colors.tabInactive },
              ]}
            >
              {input.length} / {MAX_CHARS}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap:               12,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '600', letterSpacing: 0.3 },
  headerSub:    { fontSize: 11, letterSpacing: 0.3, marginTop: 1 },

  // Message list
  scrollContent: { paddingTop: 14, paddingBottom: 16 },

  // Disclaimer
  disclaimer: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               6,
    marginHorizontal:  16,
    marginBottom:      16,
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderRadius:      10,
    borderWidth:       1,
  },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16, letterSpacing: 0.2 },

  // Starter chips
  starterWrap:  { paddingHorizontal: 16, marginBottom: 20, marginTop: 4 },
  starterLabel: { fontSize: 13, letterSpacing: 0.3, marginBottom: 12, textAlign: 'center' },
  chips:        { gap: 8 },
  chip: {
    borderRadius:      12,
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   10,
  },
  chipText: { fontSize: 13.5, lineHeight: 20 },

  // Typing indicator
  typingRow: {
    flexDirection:     'row',
    alignItems:        'flex-end',
    marginBottom:      10,
    paddingHorizontal: 16,
  },
  typingAvatar: {
    width:          32,
    height:         32,
    borderRadius:   10,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    8,
    flexShrink:     0,
  },
  typingAvatarText: { fontSize: 16, fontFamily: 'serif' },
  typingBubble: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    borderRadius:      18,
    borderWidth:       1,
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  typingDot: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },

  // Error banner
  errorBanner: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               6,
    marginHorizontal:  16,
    marginTop:         8,
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderRadius:      10,
    borderWidth:       1,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },

  // Input bar
  inputBar: {
    borderTopWidth:    StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop:        8,
  },
  countText: {
    fontSize:      11,
    letterSpacing: 0.2,
    textAlign:     'center',
    marginBottom:  6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    gap:           8,
  },
  input: {
    flex:              1,
    borderRadius:      14,
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   10,
    fontSize:          15,
    maxHeight:         120,
    lineHeight:        22,
  },
  sendBtn: {
    width:          42,
    height:         42,
    borderRadius:   14,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  stopIcon: {
    width:        14,
    height:       14,
    borderRadius: 3,
  },
  charCount: { fontSize: 10, textAlign: 'right', marginTop: 4, letterSpacing: 0.2 },
});
