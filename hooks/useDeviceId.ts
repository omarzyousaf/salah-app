import { useEffect, useState } from 'react';
import { getDeviceId } from '@/lib/deviceId';

/**
 * Returns the persistent device UUID (null while SecureStore is loading).
 * Use this wherever you need to associate data with this device — e.g.
 * querying prayer_logs where device_id = useDeviceId().
 */
export function useDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  return deviceId;
}
