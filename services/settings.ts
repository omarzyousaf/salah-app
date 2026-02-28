/**
 * services/settings.ts
 *
 * Read/write persistent user settings via AsyncStorage.
 * All keys are prefixed with "salah_" for easy bulk-clear.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEY_METHOD  = 'salah_prayer_method';
const KEY_RECITER = 'salah_default_reciter';

// ─── Options ──────────────────────────────────────────────────────────────────

export const PRAYER_METHODS = [
  { id: 2, label: 'ISNA',     sub: 'Islamic Society of North America' },
  { id: 3, label: 'MWL',      sub: 'Muslim World League' },
  { id: 5, label: 'Egyptian', sub: 'Egyptian General Authority of Survey' },
  { id: 1, label: 'Karachi',  sub: 'University of Islamic Sciences, Karachi' },
  { id: 4, label: 'Makkah',   sub: 'Umm Al-Qura University, Makkah' },
] as const;

export const QURAN_RECITERS = [
  { id: 'ar.alafasy',            label: 'Mishary Alafasy',    short: 'Alafasy'  },
  { id: 'ar.abdulbasitmurattal', label: 'Abdul Basit',        short: 'A. Basit' },
  { id: 'ar.shaatree',           label: 'Abu Bakr al-Shatri', short: 'Al-Shatri'},
] as const;

export type PrayerMethodId = typeof PRAYER_METHODS[number]['id'];
export type ReciterId      = typeof QURAN_RECITERS[number]['id'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppSettings {
  prayerMethod: PrayerMethodId;
  reciter:      ReciterId;
}

const DEFAULTS: AppSettings = {
  prayerMethod: 2,
  reciter:      'ar.alafasy',
};

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const [rawMethod, rawReciter] = await Promise.all([
    AsyncStorage.getItem(KEY_METHOD).catch(() => null),
    AsyncStorage.getItem(KEY_RECITER).catch(() => null),
  ]);

  const validMethodIds  = PRAYER_METHODS.map(m => m.id as number);
  const validReciterIds = QURAN_RECITERS.map(r => r.id as string);

  const methodNum    = rawMethod ? Number(rawMethod) : NaN;
  const prayerMethod = validMethodIds.includes(methodNum)
    ? (methodNum as PrayerMethodId)
    : DEFAULTS.prayerMethod;

  const reciter = rawReciter && validReciterIds.includes(rawReciter)
    ? (rawReciter as ReciterId)
    : DEFAULTS.reciter;

  return { prayerMethod, reciter };
}

// ─── Setters ──────────────────────────────────────────────────────────────────

export async function setPrayerMethod(id: PrayerMethodId): Promise<void> {
  await AsyncStorage.setItem(KEY_METHOD, String(id));
}

export async function setDefaultReciter(id: ReciterId): Promise<void> {
  await AsyncStorage.setItem(KEY_RECITER, id);
}

// ─── Clear all data ───────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const keys      = await AsyncStorage.getAllKeys();
  const salahKeys = keys.filter(k => k.startsWith('salah_'));
  if (salahKeys.length > 0) {
    await AsyncStorage.multiRemove(salahKeys);
  }
}
