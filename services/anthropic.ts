/**
 * services/anthropic.ts
 *
 * Client for the Noor AI chat, routed through the Supabase Edge Function
 * so ANTHROPIC_API_KEY is never exposed in the client bundle.
 *
 * Features:
 *  • Persistent device_id from SecureStore via lib/deviceId
 *  • Local daily message count: warn UI at 15, soft-block at 20
 *  • Streaming SSE parsing — forwards content_block_delta events in real time
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDeviceId } from '@/lib/deviceId';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const CHAT_ENDPOINT     = `${SUPABASE_URL}/functions/v1/chat`;

const KEY_MSG_COUNT = 'salah_chat_daily'; // { date: string; count: number }

export const DAILY_LIMIT = 20;
export const WARN_AT     = 15;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role:    'user' | 'assistant';
  content: string;
}

export interface CountInfo {
  count:          number;
  remaining:      number;
  isLimitReached: boolean;
  shouldWarn:     boolean;
}

// ─── Daily message count ─────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC
}

export async function getCountInfo(): Promise<CountInfo> {
  try {
    const raw = await AsyncStorage.getItem(KEY_MSG_COUNT);
    if (raw) {
      const { date, count } = JSON.parse(raw) as { date: string; count: number };
      if (date === todayKey()) {
        const remaining = Math.max(0, DAILY_LIMIT - count);
        return {
          count,
          remaining,
          isLimitReached: count >= DAILY_LIMIT,
          shouldWarn:     count >= WARN_AT,
        };
      }
    }
  } catch {}
  return { count: 0, remaining: DAILY_LIMIT, isLimitReached: false, shouldWarn: false };
}

async function bumpCount(): Promise<void> {
  const today = todayKey();
  try {
    const raw   = await AsyncStorage.getItem(KEY_MSG_COUNT);
    const prev  = raw ? (JSON.parse(raw) as { date: string; count: number }) : null;
    const count = prev?.date === today ? prev.count + 1 : 1;
    await AsyncStorage.setItem(KEY_MSG_COUNT, JSON.stringify({ date: today, count }));
  } catch {}
}

// ─── Streaming chat ───────────────────────────────────────────────────────────

export async function streamMessage(params: {
  messages:   ChatMessage[];
  onDelta:    (chunk: string) => void;
  onComplete: (fullText: string) => void;
  onError:    (msg: string) => void;
}): Promise<void> {
  const { messages, onDelta, onComplete, onError } = params;

  // Local gate (server also enforces)
  const info = await getCountInfo();
  if (info.isLimitReached) {
    onError("You've reached today's limit of 20 messages. Come back tomorrow 🌙");
    return;
  }

  const device_id = await getDeviceId();
  await bumpCount();

  // ── Fetch ────────────────────────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(CHAT_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages, device_id }),
    });
  } catch {
    onError('No internet connection. Please check your network and try again.');
    return;
  }

  if (!res.ok) {
    let msg = 'Something went wrong. Please try again.';
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {}
    if (res.status === 429) msg = "You've reached today's message limit.";
    onError(msg);
    return;
  }

  // ── SSE stream parsing ───────────────────────────────────────────────────────
  const reader = res.body?.getReader();
  if (!reader) {
    onError('Streaming is not supported on this device.');
    return;
  }

  const decoder  = new TextDecoder();
  let   buffer   = '';
  let   fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines; keep any trailing incomplete line in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const evt = JSON.parse(data) as {
            type:   string;
            delta?: { type: string; text: string };
          };
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const chunk = evt.delta.text;
            fullText   += chunk;
            onDelta(chunk);
          }
        } catch {
          // Malformed JSON chunk — skip
        }
      }
    }
  } catch {
    onError('Connection interrupted. Please try again.');
    return;
  } finally {
    reader.releaseLock();
  }

  onComplete(fullText);
}
