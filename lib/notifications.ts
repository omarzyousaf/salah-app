/**
 * lib/notifications.ts
 *
 * Local notification scheduling for prayer times.
 *
 *  • requestNotificationPermission() — asks for permission once; returns current status after
 *  • setupAndroidChannel()           — creates the "Prayer Times" notification channel
 *  • schedulePrayerNotifications()   — cancels all + schedules today's enabled prayers
 *  • cancelAllPrayerNotifications()  — removes every scheduled notification
 *  • getNotifPrefs() / saveNotifPrefs() — per-prayer toggle preferences (AsyncStorage)
 *  • saveCachedTimings() / getCachedTimings() — persist today's timings for reschedule on restart
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import type { HijriDate, PrayerTimings } from '@/services/prayerTimes';
import { cleanTime } from '@/services/prayerTimes';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEY_NOTIF_PREFS    = 'salah_notif_prefs';
const KEY_CACHED_TIMINGS = 'salah_cached_timings';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-prayer notification preferences. */
export interface NotifPrefs {
  /** Master on/off — when false, no notifications are scheduled at all. */
  enabled: boolean;
  /** Individual prayer toggles (only relevant when enabled = true). */
  prayers: {
    Fajr:    boolean;
    Dhuhr:   boolean;
    Asr:     boolean;
    Maghrib: boolean;
    Isha:    boolean;
  };
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/** The 5 prayers that receive notifications (Sunrise is excluded). */
export const PRAYER_NOTIF_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type PrayerNotifName = typeof PRAYER_NOTIF_NAMES[number];

const DEFAULT_PREFS: NotifPrefs = {
  enabled: false, // opt-in; user must explicitly enable
  prayers: {
    Fajr:    true,
    Dhuhr:   true,
    Asr:     true,
    Maghrib: true,
    Isha:    true,
  },
};

// ─── Notification handler (module-level, set once) ────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// ─── Permissions ──────────────────────────────────────────────────────────────

/** Returns the current permission status without prompting the user. */
export async function getNotificationPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PermissionStatus;
}

/**
 * Requests notification permissions if not yet granted.
 * On subsequent calls (after the user has decided) this just returns the
 * stored status — it does NOT re-prompt on iOS after denial.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return 'granted';

  const { status } = await Notifications.requestPermissionsAsync();
  return status as PermissionStatus;
}

// ─── Android notification channel ─────────────────────────────────────────────

/** Creates the "Prayer Times" channel on Android (no-op on iOS). */
export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('prayer-times', {
    name:        'Prayer Times',
    importance:  Notifications.AndroidImportance.HIGH,
    sound:       'default',
    description: 'Reminders 5 minutes before each prayer time',
  });
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export async function getNotifPrefs(): Promise<NotifPrefs> {
  const raw = await AsyncStorage.getItem(KEY_NOTIF_PREFS).catch(() => null);
  if (!raw) return { ...DEFAULT_PREFS, prayers: { ...DEFAULT_PREFS.prayers } };
  try {
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULT_PREFS.enabled,
      prayers: { ...DEFAULT_PREFS.prayers, ...(parsed.prayers ?? {}) },
    };
  } catch {
    return { ...DEFAULT_PREFS, prayers: { ...DEFAULT_PREFS.prayers } };
  }
}

export async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY_NOTIF_PREFS, JSON.stringify(prefs));
}

// ─── Cached timings ───────────────────────────────────────────────────────────

interface CachedTimings {
  timings:   PrayerTimings;
  hijriDate: HijriDate;
  /** ISO date string "YYYY-MM-DD" — used to invalidate yesterday's cache. */
  date: string;
}

/** Persist today's prayer timings so notifications can be rescheduled on restart. */
export async function saveCachedTimings(
  timings:   PrayerTimings,
  hijriDate: HijriDate,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const data: CachedTimings = { timings, hijriDate, date: today };
  await AsyncStorage.setItem(KEY_CACHED_TIMINGS, JSON.stringify(data));
}

/** Returns today's cached timings, or null if stale / missing. */
export async function getCachedTimings(): Promise<CachedTimings | null> {
  const raw = await AsyncStorage.getItem(KEY_CACHED_TIMINGS).catch(() => null);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as CachedTimings;
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return null; // yesterday's cache — discard
    return data;
  } catch {
    return null;
  }
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Build an absolute Date for today at `timeStr` minus `offsetMinutes`.
 * Returns null if the resulting time is already in the past.
 *
 * Note: JavaScript Date handles negative minutes correctly via rollover,
 * e.g. setHours(5, -3) → 04:57.
 */
function buildTriggerDate(timeStr: string, offsetMinutes: number): Date | null {
  const cleaned = cleanTime(timeStr);
  const [h, m]  = cleaned.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;

  const trigger = new Date();
  trigger.setHours(h, m - offsetMinutes, 0, 0);

  if (trigger.getTime() <= Date.now()) return null; // already past
  return trigger;
}

/** Remove every pending prayer notification. */
export async function cancelAllPrayerNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Schedule local notifications for today's enabled prayers.
 * Cancels all existing notifications first, then schedules:
 *  • 5 min before each enabled prayer
 *  • During Ramadan: 30 min before Fajr as a Suhoor reminder (if Fajr is enabled)
 */
export async function schedulePrayerNotifications(
  timings:   PrayerTimings,
  hijriDate: HijriDate,
  prefs:     NotifPrefs,
): Promise<void> {
  await cancelAllPrayerNotifications();
  if (!prefs.enabled) return;

  const isRamadan = hijriDate.month.number === 9;

  for (const name of PRAYER_NOTIF_NAMES) {
    if (!prefs.prayers[name]) continue;

    const triggerDate = buildTriggerDate(timings[name], 5);
    if (!triggerDate) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Prayer Time',
        body:  `${name} is in 5 minutes`,
        sound: true,
        data:  { prayer: name },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
  }

  // Ramadan only: Suhoor reminder 30 min before Fajr
  if (isRamadan && prefs.prayers.Fajr) {
    const suhoorTrigger = buildTriggerDate(timings.Fajr, 30);
    if (suhoorTrigger) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Suhoor Reminder',
          body:  'Fajr is in 30 minutes — time to finish your suhoor',
          sound: true,
          data:  { prayer: 'Suhoor' },
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: suhoorTrigger,
        },
      });
    }
  }
}
