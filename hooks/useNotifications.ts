/**
 * hooks/useNotifications.ts
 *
 * Initializes local prayer notifications on app mount:
 *  1. Creates the Android notification channel
 *  2. Requests permission (prompts user on first launch only)
 *  3. If permission granted: loads today's cached prayer timings and
 *     reschedules notifications using the user's saved preferences
 *
 * Returns the current permission status so callers can surface UI hints.
 */

import { useEffect, useState } from 'react';

import {
  type PermissionStatus,
  getCachedTimings,
  getNotifPrefs,
  requestNotificationPermission,
  schedulePrayerNotifications,
  setupAndroidChannel,
} from '@/lib/notifications';

export function useNotifications() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Android: ensure channel exists before any notifications fire
      await setupAndroidChannel();

      // Request permission (no-op if already decided)
      const status = await requestNotificationPermission();
      if (cancelled) return;
      setPermissionStatus(status);

      if (status !== 'granted') return;

      // Reschedule using today's cached prayer times (handles app restarts)
      const cached = await getCachedTimings();
      if (!cached || cancelled) return;

      const prefs = await getNotifPrefs();
      if (cancelled) return;

      await schedulePrayerNotifications(cached.timings, cached.hijriDate, prefs);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { permissionStatus };
}
