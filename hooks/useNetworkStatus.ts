/**
 * hooks/useNetworkStatus.ts
 *
 * Monitors network connectivity using @react-native-community/netinfo.
 * Returns `isOnline: boolean` — true when the device has an active connection.
 * Updates reactively whenever the connection state changes.
 */

import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Subscribe to connection state changes
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });

    // Sync initial state
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected !== false);
    });

    return () => unsubscribe();
  }, []);

  return { isOnline };
}
