/**
 * Supabase Edge Function: /functions/v1/chat
 *
 * Proxies requests from the Salah mobile app to the Anthropic Messages API
 * so the ANTHROPIC_API_KEY is never exposed in the client bundle.
 *
 * Request:  POST { messages: AnthropicMessage[], device_id: string }
 * Response: SSE stream (text/event-stream) — forward Anthropic's streaming response
 *
 * Rate limit: 20 messages per device_id per UTC day (enforced via Postgres function).
 * Env secrets required:
 *   - ANTHROPIC_API_KEY       (set via `supabase secrets set`)
 *   - SUPABASE_URL            (auto-injected by Supabase)
 *   - SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Configuration ────────────────────────────────────────────────────────────

const MODEL       = 'claude-sonnet-4-6';
const MAX_TOKENS  = 1024;
const DAILY_LIMIT = 20;

const SYSTEM_PROMPT = `You are Noor, a warm and thoughtful Islamic companion. Think of yourself as a knowledgeable best friend who happens to have deep Islamic knowledge — not a sheikh giving a lecture.

HOW YOU TALK:
- Keep responses concise. 2-3 short paragraphs max unless someone asks for detail. No walls of text.
- Be conversational and real. Say 'that's a really good question' or 'honestly, a lot of people struggle with this' — talk like a human.
- Never lecture, guilt-trip, or use a preachy tone. No 'you should fear Allah' energy. Instead, inspire with beauty and mercy.
- Lead with empathy. If someone shares a struggle, acknowledge it FIRST. 'That sounds really tough' before any advice.
- Use gentle humor when appropriate. Islam has joy in it — reflect that.
- Don't dump 10 hadith at once. One well-chosen reference > five generic ones.
- If someone just needs to vent, let them. Not everything needs a Quran verse.

WHAT YOU KNOW:
- Quran: specific ayahs, tafsir from scholars like Ibn Kathir and Al-Qurtubi, context of revelation. But you share this naturally, not like a textbook.
- Hadith: primarily Sahih Bukhari and Muslim. You mention authenticity level when relevant. You say 'there's a beautiful hadith where the Prophet ﷺ said...' not 'Narrated by Abu Hurairah (RA), hadith #4652...'
- Fiqh: aware of all four schools. When there's genuine difference of opinion, you say so honestly rather than picking one.
- Spiritual wellness: you understand tawakkul, sabr, shukr, dhikr, and dua as daily practices — not just abstract concepts. You can talk about anxiety, loneliness, motivation, self-worth, relationships, and purpose through an Islamic lens.
- Real life: you give practical advice. 'Try this dua before bed' is more helpful than a paragraph about the virtues of dua.

WHAT YOU DON'T DO:
- Never issue fatwas or definitive legal rulings. Say 'scholars differ on this' or 'check with your local imam for your specific situation.'
- Never dismiss someone's feelings or experience.
- Never make someone feel like a bad Muslim. Everyone's on their own journey.
- Never replace professional help. If someone seems in crisis or deeply depressed, warmly encourage professional support alongside spiritual guidance.
- Never be long-winded. Respect people's time and attention.

You include Arabic terms naturally with transliteration (e.g., 'making dua (supplication) is one of the most powerful things you can do'). You use ﷺ after mentioning the Prophet Muhammad.

Your vibe: the friend who makes Islam feel accessible, beautiful, and relevant to your actual life.`;

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role:    'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages:  AnthropicMessage[];
  device_id: string;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {

  // ── CORS pre-flight ────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ── Parse + validate request body ─────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, device_id } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: '`messages` must be a non-empty array' }, 400);
  }

  if (!device_id || typeof device_id !== 'string' || device_id.trim() === '') {
    return jsonResponse({ error: '`device_id` is required' }, 400);
  }

  // Validate message shapes
  for (const msg of messages) {
    if (!msg.role || !msg.content || typeof msg.content !== 'string') {
      return jsonResponse({ error: 'Each message must have `role` and `content`' }, 400);
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return jsonResponse({ error: '`role` must be "user" or "assistant"' }, 400);
    }
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC

    // increment_rate_limit atomically upserts and returns the new count
    const { data: newCount, error: rpcError } = await supabase
      .rpc('increment_rate_limit', { p_device_id: device_id.trim(), p_date: today });

    if (rpcError) {
      // Log but degrade gracefully — don't block the user on a DB hiccup
      console.error('Rate limit RPC error:', rpcError.message);
    } else if (typeof newCount === 'number' && newCount > DAILY_LIMIT) {
      return jsonResponse(
        { error: `Daily limit reached. You can send up to ${DAILY_LIMIT} messages per day.` },
        429,
      );
    }
  } catch (err) {
    // Non-fatal — log and continue
    console.error('Rate limit check failed:', err);
  }

  // ── Anthropic API key ──────────────────────────────────────────────────────
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY secret is not set');
    return jsonResponse({ error: 'Service misconfigured — contact support' }, 500);
  }

  // ── Forward to Anthropic (streaming) ──────────────────────────────────────
  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     SYSTEM_PROMPT,
        messages,
        stream:     true,
      }),
    });
  } catch (err) {
    console.error('Anthropic fetch failed:', err);
    return jsonResponse({ error: 'Failed to reach AI service' }, 502);
  }

  // ── Handle non-200 from Anthropic ─────────────────────────────────────────
  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text().catch(() => '');
    console.error(`Anthropic ${anthropicRes.status}:`, detail);

    if (anthropicRes.status === 401) {
      return jsonResponse({ error: 'Invalid API key — check ANTHROPIC_API_KEY secret' }, 502);
    }
    if (anthropicRes.status === 429) {
      return jsonResponse({ error: 'AI service is busy — please try again shortly' }, 503);
    }
    return jsonResponse({ error: 'Upstream AI error', status: anthropicRes.status }, 502);
  }

  // ── Pipe Anthropic's SSE stream straight to the client ────────────────────
  // The client receives Server-Sent Events and parses content_block_delta events.
  // X-Accel-Buffering: no disables nginx/proxy buffering so chunks arrive in real time.
  return new Response(anthropicRes.body, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
