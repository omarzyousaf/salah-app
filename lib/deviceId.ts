import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'salah_device_id';

/** UUID v4 — compatible with the UUIDs the Streamlit app stores in device_id */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the device's persistent UUID.
 * On first call it generates a new UUID and saves it to SecureStore.
 * On subsequent calls it returns the saved value — survives app restarts.
 */
export async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}
