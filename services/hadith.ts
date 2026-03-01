import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HadithData {
  number:     number;
  narrator:   string;
  text:       string;
  collection: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_KEY   = 'salah_hadith_daily_v1';
const BUKHARI_MAX = 7000; // safe upper bound; actual collection ~7563

const BASE =
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-bukhari';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function randomNum(): number {
  return Math.floor(Math.random() * BUKHARI_MAX) + 1;
}

// ─── Core fetch (with 1 retry on failure) ─────────────────────────────────────

async function fetchByNumber(num: number): Promise<HadithData> {
  const url = `${BASE}/${num}.min.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json() as {
    hadiths?: Array<{ hadithnumber?: number; text?: string }>;
    hadith?:  Array<{ hadithnumber?: number; text?: string }>;
  };

  const entry = json.hadiths?.[0] ?? json.hadith?.[0];
  if (!entry) throw new Error('Empty hadith response');

  const fullText = entry.text?.trim() ?? '';
  if (!fullText) throw new Error('No text in response');

  // "Narrated X: rest of hadith" — extract narrator from prefix
  const narratorMatch = fullText.match(/^Narrated ([^:]+):/);
  const narrator = narratorMatch ? narratorMatch[1].trim() : '';
  const text     = narratorMatch ? fullText.slice(narratorMatch[0].length).trim() : fullText;

  return {
    number:     entry.hadithnumber ?? num,
    narrator,
    text,
    collection: 'Sahih al-Bukhari',
  };
}

async function fetchWithRetry(num: number, retries = 2): Promise<HadithData> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchByNumber(i === 0 ? num : randomNum());
    } catch {
      if (i === retries) throw new Error('Could not load hadith after retries');
    }
  }
  // Unreachable but TypeScript needs this
  throw new Error('Could not load hadith');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the cached daily hadith if available, otherwise fetches a new one. */
export async function fetchDailyHadith(): Promise<HadithData> {
  const today = todayStr();

  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { date: string; hadith: HadithData };
      if (cached.date === today) return cached.hadith;
    }
  } catch { /* ignore cache read errors */ }

  const hadith = await fetchWithRetry(randomNum());
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, hadith })); } catch {}
  return hadith;
}

/** Fetches a new random hadith and updates the daily cache. */
export async function fetchRandomHadith(): Promise<HadithData> {
  const hadith = await fetchWithRetry(randomNum());
  try {
    const today = todayStr();
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, hadith }));
  } catch {}
  return hadith;
}
