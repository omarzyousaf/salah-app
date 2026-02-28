import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = 'https://api.alquran.cloud/v1';

const CACHE_KEY_LIST = 'salah_quran_list_v1';
const cacheKeySurah  = (n: number) => `salah_quran_surah_${n}_v1`;

// ─── Exported types ───────────────────────────────────────────────────────────

export type Surah = {
  number:                 number;
  name:                   string;   // Arabic name (سورة الفاتحة)
  englishName:            string;   // Transliteration (Al-Fatiha)
  englishNameTranslation: string;   // English meaning (The Opening)
  numberOfAyahs:          number;
  revelationType:         'Meccan' | 'Medinan';
};

export type AyahEdition = {
  number:        number;  // global Quran ayah number (1-6236), used for audio URL
  numberInSurah: number;
  text:          string;
};

export type SurahDetail = {
  number:                 number;
  name:                   string;
  englishName:            string;
  englishNameTranslation: string;
  numberOfAyahs:          number;
  revelationType:         string;
  ayahs: {
    arabic:          AyahEdition[];
    transliteration: AyahEdition[];
    english:         AyahEdition[];
  };
};

// Merged per-ayah item used in the reader and audio player
export type AyahItem = {
  numberInSurah:   number;
  globalNumber:    number;  // Quran-wide (1-6236) — constructs audio URL
  arabic:          string;
  transliteration: string;
  english:         string;
};

// ─── Internal API shape ───────────────────────────────────────────────────────

type ApiAyah     = { number: number; numberInSurah: number; text: string };
type ApiResponse = { code: number; data: { ayahs: ApiAyah[] } & Record<string, unknown> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Merge three editions of a SurahDetail into a flat AyahItem array. */
export function buildAyahItems(detail: SurahDetail): AyahItem[] {
  return detail.ayahs.arabic.map((a, i) => ({
    numberInSurah:   a.numberInSurah,
    globalNumber:    a.number,
    arabic:          a.text,
    transliteration: detail.ayahs.transliteration[i]?.text ?? '',
    english:         detail.ayahs.english[i]?.text ?? '',
  }));
}

/** Audio CDN URL for a single ayah. */
export function ayahAudioUrl(globalNumber: number, reciter: string): string {
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${globalNumber}.mp3`;
}

// ─── Surah list ───────────────────────────────────────────────────────────────

export async function fetchSurahList(): Promise<Surah[]> {
  // Surah list never changes — serve cache forever once stored
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY_LIST);
    if (cached) return JSON.parse(cached) as Surah[];
  } catch {}

  const json = await fetch(`${BASE}/surah`).then(r => r.json()) as { code: number; data: Surah[] };
  if (json.code !== 200) throw new Error('Failed to load surah list');

  await AsyncStorage.setItem(CACHE_KEY_LIST, JSON.stringify(json.data)).catch(() => {});
  return json.data;
}

// ─── Surah detail — 3 editions fetched in parallel ───────────────────────────

export async function fetchSurahDetail(number: number): Promise<SurahDetail> {
  const key = cacheKeySurah(number);

  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return JSON.parse(cached) as SurahDetail;
  } catch {}

  const [arJson, trJson, enJson] = await Promise.all([
    fetch(`${BASE}/surah/${number}/quran-uthmani`).then(r => r.json())      as Promise<ApiResponse>,
    fetch(`${BASE}/surah/${number}/en.transliteration`).then(r => r.json()) as Promise<ApiResponse>,
    fetch(`${BASE}/surah/${number}/en.sahih`).then(r => r.json())           as Promise<ApiResponse>,
  ]);

  if (arJson.code !== 200) throw new Error('Failed to load surah');

  const meta = arJson.data as unknown as Omit<SurahDetail, 'ayahs'> & { ayahs: ApiAyah[] };

  const detail: SurahDetail = {
    number:                 meta.number,
    name:                   meta.name,
    englishName:            meta.englishName,
    englishNameTranslation: meta.englishNameTranslation,
    numberOfAyahs:          meta.numberOfAyahs,
    revelationType:         meta.revelationType,
    ayahs: {
      // Store global number (a.number) alongside numberInSurah for audio URLs
      arabic:          arJson.data.ayahs.map(a => ({ number: a.number, numberInSurah: a.numberInSurah, text: a.text })),
      transliteration: trJson.data.ayahs.map(a => ({ number: a.number, numberInSurah: a.numberInSurah, text: a.text })),
      english:         enJson.data.ayahs.map(a => ({ number: a.number, numberInSurah: a.numberInSurah, text: a.text })),
    },
  };

  await AsyncStorage.setItem(key, JSON.stringify(detail)).catch(() => {});
  return detail;
}
