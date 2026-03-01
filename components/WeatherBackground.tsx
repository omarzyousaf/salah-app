/**
 * WeatherBackground
 *
 * Full-screen animated sky that combines:
 *   1. Time-of-day base gradient   — 8 prayer-relative periods, renders immediately
 *   2. Weather condition overlays  — loads after Open-Meteo responds
 *
 * Sky gradients are derived from the user's actual prayer times (Fajr, Sunrise,
 * Dhuhr, Asr, Maghrib, Isha), not hardcoded wall-clock hours.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useState } from 'react';

import { PrayerTimings, toMinutes } from '@/services/prayerTimes';
import { WeatherCondition, fetchWeather } from '@/services/weather';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  lat:     number;
  lon:     number;
  timings: PrayerTimings;
  now:     Date;
}

// ─── Time period ──────────────────────────────────────────────────────────────

type Period =
  | 'predawn'
  | 'sunrise'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'sunset'
  | 'evening'
  | 'night';

function getPeriod(timings: PrayerTimings, nowMin: number): Period {
  const fajr    = toMinutes(timings.Fajr);
  const sunrise = toMinutes(timings.Sunrise);
  const dhuhr   = toMinutes(timings.Dhuhr);
  const asr     = toMinutes(timings.Asr);
  const maghrib = toMinutes(timings.Maghrib);
  const isha    = toMinutes(timings.Isha);

  if (nowMin < fajr)           return 'predawn';
  if (nowMin < sunrise + 35)   return 'sunrise';
  if (nowMin < dhuhr   - 60)   return 'morning';
  if (nowMin < asr     - 30)   return 'midday';
  if (nowMin < maghrib - 60)   return 'afternoon';
  if (nowMin < maghrib + 50)   return 'sunset';
  if (nowMin < isha)           return 'evening';
  return 'night';
}

// ─── Sky gradients ────────────────────────────────────────────────────────────

type GradStop = { off: number; color: string };

const SKY: Record<Period, GradStop[]> = {
  // Pre-Fajr / deep night
  predawn: [
    { off: 0,    color: '#0a0e1a' },
    { off: 0.35, color: '#111b2e' },
    { off: 0.70, color: '#1a2540' },
    { off: 1,    color: '#1e2d4a' },
  ],
  // Fajr → Sunrise: indigo fading to warm horizon glow
  sunrise: [
    { off: 0,    color: '#1a2540' },
    { off: 0.40, color: '#2d4a6e' },
    { off: 0.72, color: '#8a5a6e' },
    { off: 1,    color: '#d4956b' },
  ],
  // Sunrise → Dhuhr: clear morning blue
  morning: [
    { off: 0,    color: '#4a8bc2' },
    { off: 0.38, color: '#6bb3d9' },
    { off: 0.72, color: '#87ceeb' },
    { off: 1,    color: '#a8e0f0' },
  ],
  // Dhuhr → Asr: vivid midday blue with lavender hint
  midday: [
    { off: 0,    color: '#3d7cb8' },
    { off: 0.50, color: '#5a9fd4' },
    { off: 1,    color: '#c8a2c8' },
  ],
  // Asr → Maghrib: late-afternoon warm blend
  afternoon: [
    { off: 0,    color: '#3d5a80' },
    { off: 0.32, color: '#7b6b8a' },
    { off: 0.65, color: '#c4849b' },
    { off: 1,    color: '#e8a87c' },
  ],
  // Around Maghrib: dramatic sunset
  sunset: [
    { off: 0,    color: '#2a2d5e' },
    { off: 0.25, color: '#6b4c7a' },
    { off: 0.55, color: '#c76b7e' },
    { off: 1,    color: '#e89b6c' },
  ],
  // Maghrib → Isha: deepening twilight
  evening: [
    { off: 0,    color: '#141832' },
    { off: 0.48, color: '#252850' },
    { off: 1,    color: '#3d2d5e' },
  ],
  // After Isha: deep night sky
  night: [
    { off: 0,    color: '#080c18' },
    { off: 0.30, color: '#0f1628' },
    { off: 0.65, color: '#182038' },
    { off: 1,    color: '#1e2d4a' },
  ],
};

// ─── Weather overlay tint ─────────────────────────────────────────────────────

type Overlay = { color: string; op: number };

function getOverlay(cond: WeatherCondition | null): Overlay {
  if (!cond) return { color: '#000', op: 0 };
  switch (cond) {
    case 'clear':        return { color: '#000000', op: 0    };
    case 'cloudy':       return { color: '#505870', op: 0.30 };
    case 'fog':          return { color: '#C8D8E8', op: 0.25 };
    case 'rain':         return { color: '#142840', op: 0.40 };
    case 'snow':         return { color: '#A8C0DC', op: 0.20 };
    case 'thunderstorm': return { color: '#080F1E', op: 0.55 };
  }
}

// ─── Deterministic pseudo-random ──────────────────────────────────────────────

function pr(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ─── Organic cloud SVG path shapes (200×80 viewBox) ──────────────────────────

const CLOUD_SHAPES = [
  // Puffy cumulus
  'M 0 72 C 5 52 15 42 30 50 C 28 22 55 14 80 30 C 82 6 115 2 135 22 C 148 6 172 10 182 32 C 194 36 200 52 200 70 L 200 72 Z',
  // Wispy stratus
  'M 0 68 C 8 46 24 40 48 52 C 50 16 82 12 108 34 C 118 8 150 6 170 28 C 182 18 196 32 200 58 L 200 68 Z',
  // Layered alto
  'M 0 75 C 10 58 22 50 40 56 C 38 22 68 16 95 36 C 98 8 130 6 154 26 C 165 10 186 14 200 40 L 200 75 Z',
  // Thin cirrus-like
  'M 0 65 C 12 48 30 44 55 54 C 58 20 90 16 118 38 C 128 12 158 8 178 32 C 188 22 198 36 200 62 L 200 65 Z',
];

// ─── Particle config builders ─────────────────────────────────────────────────

const N_STARS  = 28;
const N_RAIN   = 30;
const N_SNOW   = 22;
const N_CLOUDS = 5;
const N_FOG    = 3;

function buildStars(W: number, H: number) {
  return Array.from({ length: N_STARS }, (_, i) => ({
    x:        pr(i * 5 + 0) * W,
    y:        pr(i * 5 + 1) * H * 0.72,   // upper 72% of screen
    r:        0.5 + pr(i * 5 + 2) * 1.5,  // 0.5–2 px radius
    duration: 2000 + pr(i * 5 + 3) * 3000,
    init:     pr(i * 5 + 4),
  }));
}

function buildRain(W: number, H: number) {
  return Array.from({ length: N_RAIN }, (_, i) => ({
    x:        pr(i * 7 + 0) * W,
    w:        0.8 + pr(i * 7 + 1) * 0.7,
    h:        12 + pr(i * 7 + 2) * 12,
    duration: 500 + pr(i * 7 + 3) * 400,
    delay:    pr(i * 7 + 4),
    opacity:  0.25 + pr(i * 7 + 5) * 0.30,
    tiltX:    (pr(i * 7 + 6) - 0.5) * 12,
  }));
}

function buildSnow(W: number, H: number) {
  return Array.from({ length: N_SNOW }, (_, i) => ({
    x:        pr(i * 11 + 0) * W,
    r:        2 + pr(i * 11 + 1) * 3,
    duration: 4000 + pr(i * 11 + 2) * 3500,
    delay:    pr(i * 11 + 3),
    opacity:  0.50 + pr(i * 11 + 4) * 0.35,
    driftX:   (pr(i * 11 + 5) - 0.5) * 55,
  }));
}

function buildClouds(W: number, H: number) {
  return Array.from({ length: N_CLOUDS }, (_, i) => ({
    y:        pr(i * 13 + 0) * H * 0.42,  // upper 42% of screen
    w:        220 + pr(i * 13 + 1) * 160, // 220–380 px wide
    h:        70  + pr(i * 13 + 2) * 55,  // 70–125 px tall
    duration: 18000 + pr(i * 13 + 3) * 28000, // very slow: 18–46 s
    startX:   pr(i * 13 + 4) * W,
    opacity:  0.14 + pr(i * 13 + 5) * 0.12, // subtle: 0.14–0.26
    shape:    i % CLOUD_SHAPES.length,
  }));
}

function buildFog(W: number, H: number) {
  return Array.from({ length: N_FOG }, (_, i) => ({
    y:   H * 0.10 + pr(i * 17 + 0) * H * 0.60,
    w:   W * 0.70 + pr(i * 17 + 1) * W * 0.55,
    h:   85  + pr(i * 17 + 2) * 80,
    x:   pr(i * 17 + 3) * W * 0.30,
    dur: 4500 + pr(i * 17 + 4) * 3000,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeatherBackground({ lat, lon, timings, now }: Props) {
  const { width: W, height: H } = useWindowDimensions();

  const [condition, setCondition] = useState<WeatherCondition | null>(null);

  useEffect(() => {
    fetchWeather(lat, lon)
      .then(d => setCondition(d.condition))
      .catch(() => {});
  }, [lat, lon]);

  // ── Period & overlay ───────────────────────────────────────────────────────

  const nowMin     = now.getHours() * 60 + now.getMinutes();
  const period     = getPeriod(timings, nowMin);
  // Stars only during deep night periods — not evening
  const showStars  = period === 'predawn' || period === 'night';
  const isSunEvent = period === 'sunrise' || period === 'sunset';
  const gradStops  = SKY[period];
  const overlay    = getOverlay(condition);
  const showClouds = !!condition && condition !== 'clear' && condition !== 'snow';

  // Horizon atmosphere glow (bottom 35%)
  const horizonColor = isSunEvent
    ? 'rgba(240,130,60,0.20)'
    : showStars
      ? 'rgba(30,50,110,0.28)'
      : 'rgba(80,150,210,0.14)';
  const horizonH = H * 0.36;

  // ── Stable particle configs ────────────────────────────────────────────────

  const stars  = useMemo(() => buildStars(W, H),  [W, H]);
  const rain   = useMemo(() => buildRain(W, H),   [W, H]);
  const snow   = useMemo(() => buildSnow(W, H),   [W, H]);
  const clouds = useMemo(() => buildClouds(W, H), [W, H]);
  const fog    = useMemo(() => buildFog(W, H),    [W, H]);

  // ── Stable animated value arrays ──────────────────────────────────────────

  const starAnims  = useRef(Array.from({ length: N_STARS },  () => new Animated.Value(0))).current;
  const rainAnims  = useRef(Array.from({ length: N_RAIN },   () => new Animated.Value(0))).current;
  const snowAnims  = useRef(Array.from({ length: N_SNOW },   () => new Animated.Value(0))).current;
  const cloudAnims = useRef(Array.from({ length: N_CLOUDS }, () => new Animated.Value(0))).current;
  const flashAnim  = useRef(new Animated.Value(0)).current;
  const fogAnims   = useRef(Array.from({ length: N_FOG },    () => new Animated.Value(0))).current;

  // ── Stars — predawn + night only ──────────────────────────────────────────

  useEffect(() => {
    if (!showStars) {
      starAnims.forEach(a => a.stopAnimation());
      return;
    }
    const loops = starAnims.map((anim, i) => {
      anim.setValue(stars[i].init);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1,    duration: stars[i].duration * 0.5, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.12, duration: stars[i].duration * 0.5, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach(l => l.stop());
  }, [showStars]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rain / thunderstorm ────────────────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'rain' && condition !== 'thunderstorm') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loops:  Animated.CompositeAnimation[]   = [];

    rainAnims.forEach((anim, i) => {
      anim.setValue(0);
      const t = setTimeout(() => {
        const loop = Animated.loop(
          Animated.timing(anim, { toValue: 1, duration: rain[i].duration, useNativeDriver: true }),
        );
        loop.start();
        loops.push(loop);
      }, Math.round(rain[i].delay * rain[i].duration));
      timers.push(t);
    });

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach(l => l.stop());
      rainAnims.forEach(a => a.stopAnimation());
    };
  }, [condition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Snow ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'snow') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loops:  Animated.CompositeAnimation[]   = [];

    snowAnims.forEach((anim, i) => {
      anim.setValue(0);
      const t = setTimeout(() => {
        const loop = Animated.loop(
          Animated.timing(anim, { toValue: 1, duration: snow[i].duration, useNativeDriver: true }),
        );
        loop.start();
        loops.push(loop);
      }, Math.round(snow[i].delay * snow[i].duration));
      timers.push(t);
    });

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach(l => l.stop());
      snowAnims.forEach(a => a.stopAnimation());
    };
  }, [condition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clouds — non-clear, non-snow ──────────────────────────────────────────

  useEffect(() => {
    if (!showClouds) return;
    const loops = cloudAnims.map((anim, i) => {
      anim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(anim, { toValue: 1, duration: clouds[i].duration, useNativeDriver: true }),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach(l => l.stop());
  }, [showClouds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fog pulsing haze ──────────────────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'fog') return;
    const loops = fogAnims.map((anim, i) => {
      anim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1,   duration: fog[i].dur, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: fog[i].dur, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach(l => l.stop());
  }, [condition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lightning flash ────────────────────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'thunderstorm') return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function doFlash() {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.40, duration: 70,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 80,  useNativeDriver: true }),
        Animated.delay(110),
        Animated.timing(flashAnim, { toValue: 0.25, duration: 55,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 220, useNativeDriver: true }),
      ]).start(() => {
        timer = setTimeout(doFlash, 3000 + Math.random() * 6000);
      });
    }

    timer = setTimeout(doFlash, 2000 + Math.random() * 3000);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      flashAnim.stopAnimation();
      flashAnim.setValue(0);
    };
  }, [condition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {/* ── Base sky gradient — always visible ── */}
      <Svg style={StyleSheet.absoluteFill} width={W} height={H}>
        <Defs>
          <LinearGradient id="wxBase" x1={0} y1={0} x2={0} y2={H} gradientUnits="userSpaceOnUse">
            {gradStops.map((s, i) => (
              <Stop
                key={i}
                offset={`${Math.round(s.off * 100)}%`}
                stopColor={s.color}
                stopOpacity={1}
              />
            ))}
          </LinearGradient>
          {/* Horizon atmosphere glow — transparent → color → transparent */}
          <LinearGradient id="horizonGlow" x1={0} y1={0} x2={0} y2={1}>
            <Stop offset="0%"   stopColor={horizonColor} stopOpacity={0} />
            <Stop offset="40%"  stopColor={horizonColor} stopOpacity={1} />
            <Stop offset="100%" stopColor={horizonColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#wxBase)" />
        {/* Subtle horizon atmosphere band */}
        <Rect x={0} y={H - horizonH} width={W} height={horizonH} fill="url(#horizonGlow)" />
        {/* Weather condition overlay tint */}
        {overlay.op > 0 && (
          <Rect x={0} y={0} width={W} height={H} fill={overlay.color} fillOpacity={overlay.op} />
        )}
      </Svg>

      {/* ── Stars — predawn / night only ── */}
      {showStars && stars.map((s, i) => (
        <Animated.View
          key={`star-${i}`}
          style={{
            position:        'absolute',
            left:            s.x - s.r,
            top:             s.y - s.r,
            width:           s.r * 2,
            height:          s.r * 2,
            borderRadius:    s.r,
            backgroundColor: '#FFFFFF',
            opacity:         starAnims[i],
          }}
        />
      ))}

      {/* ── Clear-day warm glow orbs ── */}
      {condition === 'clear' && !showStars && (
        <>
          <View style={[styles.orb, {
            width: W * 0.70, height: W * 0.70,
            borderRadius: W * 0.35,
            top: -W * 0.16, left: W * 0.15,
            backgroundColor: 'rgba(255,210,100,0.08)',
          }]} />
          <View style={[styles.orb, {
            width: W * 0.50, height: W * 0.50,
            borderRadius: W * 0.25,
            top: W * 0.22, right: -W * 0.10,
            backgroundColor: 'rgba(255,170,50,0.05)',
          }]} />
        </>
      )}

      {/* ── Drifting clouds — organic SVG shapes ── */}
      {showClouds && clouds.map((c, i) => (
        <Animated.View
          key={`cloud-${i}`}
          style={{
            position: 'absolute',
            top:      c.y,
            width:    c.w,
            height:   c.h,
            transform: [{
              translateX: cloudAnims[i].interpolate({
                inputRange:  [0, 1],
                outputRange: [-c.w, W + c.w],
              }),
            }],
          }}
        >
          <Svg width={c.w} height={c.h} viewBox="0 0 200 80">
            <Path
              d={CLOUD_SHAPES[c.shape]}
              fill={`rgba(210,220,235,${c.opacity})`}
            />
          </Svg>
        </Animated.View>
      ))}

      {/* ── Rain drops ── */}
      {(condition === 'rain' || condition === 'thunderstorm') && rain.map((d, i) => (
        <Animated.View
          key={`rain-${i}`}
          style={{
            position:        'absolute',
            left:            d.x,
            top:             0,
            width:           d.w,
            height:          d.h,
            backgroundColor: 'rgba(180,210,255,0.85)',
            borderRadius:    1,
            opacity:         d.opacity,
            transform: [
              {
                translateY: rainAnims[i].interpolate({
                  inputRange:  [0, 1],
                  outputRange: [-d.h, H + d.h],
                }),
              },
              { translateX: d.tiltX },
            ],
          }}
        />
      ))}

      {/* ── Snowflakes ── */}
      {condition === 'snow' && snow.map((f, i) => (
        <Animated.View
          key={`snow-${i}`}
          style={{
            position:        'absolute',
            left:            f.x,
            top:             0,
            width:           f.r * 2,
            height:          f.r * 2,
            borderRadius:    f.r,
            backgroundColor: 'rgba(255,255,255,0.92)',
            opacity:         f.opacity,
            transform: [
              {
                translateY: snowAnims[i].interpolate({
                  inputRange:  [0, 1],
                  outputRange: [-f.r * 2, H + f.r * 2],
                }),
              },
              { translateX: f.driftX },
            ],
          }}
        />
      ))}

      {/* ── Fog pulsing hazes ── */}
      {condition === 'fog' && fog.map((layer, i) => (
        <Animated.View
          key={`fog-${i}`}
          style={{
            position:        'absolute',
            left:            layer.x,
            top:             layer.y,
            width:           layer.w,
            height:          layer.h,
            borderRadius:    layer.h / 2,
            backgroundColor: 'rgba(215,228,242,0.9)',
            opacity:         fogAnims[i].interpolate({
              inputRange:  [0, 1],
              outputRange: [0.04, 0.12],
            }),
          }}
        />
      ))}

      {/* ── Lightning flash ── */}
      {condition === 'thunderstorm' && (
        <Animated.View
          style={[StyleSheet.absoluteFill, {
            backgroundColor: 'rgba(220,235,255,1)',
            opacity:         flashAnim,
          }]}
        />
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  orb: { position: 'absolute' },
});
