const BASE = 'https://api.aladhan.com/v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type PrayerName = (typeof PRAYER_NAMES)[number];

export type PrayerTimings = Record<PrayerName, string>;

export type HijriDate = {
  day:     string;
  month:   { en: string; number: number };
  year:    string;
};

export type PrayerTimesResult = {
  timings: PrayerTimings;
  date: {
    readable: string;   // e.g. "27 Feb 2026"
    hijri:    HijriDate;
  };
  meta: {
    latitude:  number;
    longitude: number;
    timezone:  string;
    method:    { id: number; name: string };
  };
};

// ─── API helpers ─────────────────────────────────────────────────────────────

async function parseResponse(res: Response): Promise<PrayerTimesResult> {
  if (!res.ok) throw new Error(`Network error ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(String(json.data ?? 'Aladhan API error'));
  return json.data as PrayerTimesResult;
}

/** Fetch today's prayer times using GPS coordinates. */
export async function fetchByCoords(
  lat: number,
  lon: number,
  method = 2,
): Promise<PrayerTimesResult> {
  const ts  = Math.floor(Date.now() / 1000);
  const url = `${BASE}/timings/${ts}?latitude=${lat}&longitude=${lon}&method=${method}`;
  return parseResponse(await fetch(url));
}

/** Fetch today's prayer times by city name. */
export async function fetchByCity(
  city:    string,
  country: string,
  method = 2,
): Promise<PrayerTimesResult> {
  const url = `${BASE}/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
  return parseResponse(await fetch(url));
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Strip any "(EDT)"-style timezone suffix from API time strings. */
export function cleanTime(raw: string): string {
  return raw.split(' ')[0];
}

/** "HH:MM" → minutes since midnight. */
export function toMinutes(raw: string): number {
  const [h, m] = cleanTime(raw).split(':').map(Number);
  return h * 60 + m;
}

/** "HH:MM" → "h:MM AM/PM". */
export function formatTime(raw: string): string {
  const [h, m] = cleanTime(raw).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Returns the name of the next upcoming prayer.
 * Falls back to Fajr after Isha (next day).
 */
export function getNextPrayer(timings: PrayerTimings, now = new Date()): PrayerName {
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const name of PRAYER_NAMES) {
    if (toMinutes(timings[name]) > cur) return name;
  }
  return 'Fajr';
}

/** True if a prayer's time has already passed today (and it isn't the next one). */
export function isPastPrayer(
  name:       PrayerName,
  timings:    PrayerTimings,
  nextPrayer: PrayerName,
  now = new Date(),
): boolean {
  if (name === nextPrayer) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return toMinutes(timings[name]) <= cur;
}
