// ─── Types ────────────────────────────────────────────────────────────────────

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunderstorm';

export interface WeatherData {
  condition: WeatherCondition;
  temp:      number;
}

// ─── 30-minute in-memory cache ────────────────────────────────────────────────

interface CacheEntry {
  data:      WeatherData;
  lat:       number;
  lon:       number;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_MS = 30 * 60 * 1000;

// ─── WMO weather code → condition ────────────────────────────────────────────

function wmoToCondition(code: number): WeatherCondition {
  if (code === 0 || code === 1)                  return 'clear';
  if (code <= 3)                                  return 'cloudy';
  if (code === 45 || code === 48)                 return 'fog';
  if ((code >= 51 && code <= 67) ||
      (code >= 80 && code <= 82))                return 'rain';
  if ((code >= 71 && code <= 77) ||
      (code >= 85 && code <= 86))                return 'snow';
  if (code >= 95)                                 return 'thunderstorm';
  return 'cloudy';
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const now = Date.now();

  if (
    cache &&
    Math.abs(cache.lat - lat) < 0.01 &&
    Math.abs(cache.lon - lon) < 0.01 &&
    now - cache.fetchedAt < CACHE_MS
  ) {
    return cache.data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=weather_code,temperature_2m&forecast_days=1`;

  const res  = await fetch(url);
  const json = await res.json() as {
    current?: { weather_code: number; temperature_2m: number };
  };

  const code = json.current?.weather_code ?? 0;
  const temp = json.current?.temperature_2m ?? 20;

  const data: WeatherData = { condition: wmoToCondition(code), temp };
  cache = { data, lat, lon, fetchedAt: now };
  return data;
}
