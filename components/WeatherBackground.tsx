/**
 * WeatherBackground
 *
 * Full-screen animated sky that combines:
 *   1. Time-of-day base gradient   — 8 prayer-relative periods, renders immediately
 *   2. Weather condition overlays  — loads after Open-Meteo responds
 *
 * Designed to look like Apple Weather: the gradient IS the background;
 * all other UI layers render on top of it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, RadialGradient } from 'react-native-svg';

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

// ─── Sky gradients (full opacity — these ARE the background) ─────────────────

type GradStop = { off: number; color: string };

const SKY: Record<Period, GradStop[]> = {
  predawn: [
    { off: 0,    color: '#010408' },
    { off: 0.28, color: '#060D24' },
    { off: 0.55, color: '#0C1838' },
    { off: 0.78, color: '#12203F' },
    { off: 1,    color: '#1A2B4A' },
  ],
  sunrise: [
    { off: 0,    color: '#080C22' },
    { off: 0.20, color: '#3E1248' },
    { off: 0.46, color: '#B83328' },
    { off: 0.72, color: '#E86020' },
    { off: 1,    color: '#F5A050' },
  ],
  morning: [
    { off: 0,    color: '#0D5EB0' },
    { off: 0.40, color: '#2090D0' },
    { off: 0.75, color: '#55B8E8' },
    { off: 1,    color: '#90D4F0' },
  ],
  midday: [
    { off: 0,    color: '#0660BE' },
    { off: 0.45, color: '#1488D8' },
    { off: 0.80, color: '#40B0EE' },
    { off: 1,    color: '#70CCF8' },
  ],
  afternoon: [
    { off: 0,    color: '#0A58A8' },
    { off: 0.45, color: '#2080C0' },
    { off: 0.80, color: '#58AAD4' },
    { off: 1,    color: '#85C4E0' },
  ],
  sunset: [
    { off: 0,    color: '#150830' },
    { off: 0.20, color: '#7A1545' },
    { off: 0.45, color: '#CC3018' },
    { off: 0.70, color: '#EC6820' },
    { off: 1,    color: '#F5A545' },
  ],
  evening: [
    { off: 0,    color: '#040310' },
    { off: 0.30, color: '#100828' },
    { off: 0.58, color: '#1C0E42' },
    { off: 0.82, color: '#20144E' },
    { off: 1,    color: '#2A1C5A' },
  ],
  night: [
    { off: 0,    color: '#010206' },
    { off: 0.30, color: '#03060F' },
    { off: 0.60, color: '#050B1C' },
    { off: 0.85, color: '#080F24' },
    { off: 1,    color: '#0D1530' },
  ],
};

// ─── Weather overlay (semi-transparent tint on top of base gradient) ──────────

type Overlay = { color: string; op: number };

function getOverlay(cond: WeatherCondition | null): Overlay {
  if (!cond) return { color: '#000', op: 0 };
  switch (cond) {
    case 'clear':        return { color: '#000000', op: 0    };
    case 'cloudy':       return { color: '#505870', op: 0.34 };
    case 'fog':          return { color: '#C8D8E8', op: 0.28 };
    case 'rain':         return { color: '#142840', op: 0.44 };
    case 'snow':         return { color: '#A8C0DC', op: 0.22 };
    case 'thunderstorm': return { color: '#080F1E', op: 0.58 };
  }
}

// ─── Deterministic pseudo-random (no Math.random in render) ──────────────────

function pr(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ─── Particle config builders ─────────────────────────────────────────────────

const N_STARS  = 48;
const N_RAIN   = 30;
const N_SNOW   = 24;
const N_CLOUDS = 6;
const N_FOG    = 3;

function buildStars(W: number, H: number) {
  return Array.from({ length: N_STARS }, (_, i) => ({
    x:        pr(i * 5 + 0) * W,
    y:        pr(i * 5 + 1) * H * 0.78,
    r:        0.7 + pr(i * 5 + 2) * 2.2,
    duration: 1600 + pr(i * 5 + 3) * 2400,
    init:     pr(i * 5 + 4),
  }));
}

function buildRain(W: number, H: number) {
  return Array.from({ length: N_RAIN }, (_, i) => ({
    x:        pr(i * 7 + 0) * W,
    w:        0.9 + pr(i * 7 + 1) * 0.8,
    h:        14  + pr(i * 7 + 2) * 14,
    duration: 480  + pr(i * 7 + 3) * 420,
    delay:    pr(i * 7 + 4),
    opacity:  0.32 + pr(i * 7 + 5) * 0.36,
    tiltX:    (pr(i * 7 + 6) - 0.5) * 14,
  }));
}

function buildSnow(W: number, H: number) {
  return Array.from({ length: N_SNOW }, (_, i) => ({
    x:        pr(i * 11 + 0) * W,
    r:        2.5 + pr(i * 11 + 1) * 3.5,
    duration: 3500 + pr(i * 11 + 2) * 3000,
    delay:    pr(i * 11 + 3),
    opacity:  0.55 + pr(i * 11 + 4) * 0.35,
    driftX:   (pr(i * 11 + 5) - 0.5) * 65,
  }));
}

function buildClouds(W: number, H: number) {
  return Array.from({ length: N_CLOUDS }, (_, i) => ({
    y:        pr(i * 13 + 0) * H * 0.52,
    w:        190 + pr(i * 13 + 1) * 170,
    h:        65  + pr(i * 13 + 2) * 75,
    duration: 11000 + pr(i * 13 + 3) * 19000,
    startX:   pr(i * 13 + 4) * W,
    opacity:  0.16 + pr(i * 13 + 5) * 0.16,
  }));
}

function buildFog(W: number, H: number) {
  return Array.from({ length: N_FOG }, (_, i) => ({
    y:  H * 0.08 + pr(i * 17 + 0) * H * 0.65,
    w:  W * 0.70 + pr(i * 17 + 1) * W * 0.55,
    h:  90  + pr(i * 17 + 2) * 85,
    x:  pr(i * 17 + 3) * W * 0.35,
    dur: 4000 + pr(i * 17 + 4) * 3200,
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

  const nowMin      = now.getHours() * 60 + now.getMinutes();
  const period      = getPeriod(timings, nowMin);
  const isNight     = period === 'predawn' || period === 'evening' || period === 'night';
  const isSunEvent  = period === 'sunrise' || period === 'sunset';
  const gradStops   = SKY[period];
  const overlay     = getOverlay(condition);
  const showClouds  = !!condition && condition !== 'clear' && condition !== 'snow';

  // Horizon glow: warm for sunrise/sunset, cool blue for day, subtle indigo for night
  const horizonGlowColor = isSunEvent
    ? 'rgba(255,140,60,0.22)'
    : isNight
      ? 'rgba(40,55,120,0.30)'
      : 'rgba(80,160,220,0.18)';
  const horizonH = H * 0.38;

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

  // ── Stars — predawn / evening / night ─────────────────────────────────────

  useEffect(() => {
    if (!isNight) {
      starAnims.forEach(a => a.stopAnimation());
      return;
    }
    const loops = starAnims.map((anim, i) => {
      anim.setValue(stars[i].init);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1,    duration: stars[i].duration * 0.5, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration: stars[i].duration * 0.5, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach(l => l.stop());
  }, [isNight]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Clouds — all non-clear, non-snow conditions ───────────────────────────

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
        Animated.timing(flashAnim, { toValue: 0.42, duration: 70,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 80,  useNativeDriver: true }),
        Animated.delay(110),
        Animated.timing(flashAnim, { toValue: 0.28, duration: 55,  useNativeDriver: true }),
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
          {/* Horizon glow — transparent→color→transparent, bottom third */}
          <LinearGradient id="horizonGlow" x1={0} y1={0} x2={0} y2={1}>
            <Stop offset="0%"   stopColor={horizonGlowColor} stopOpacity={0} />
            <Stop offset="40%"  stopColor={horizonGlowColor} stopOpacity={1} />
            <Stop offset="100%" stopColor={horizonGlowColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#wxBase)" />

        {/* Horizon atmosphere glow */}
        <Rect x={0} y={H - horizonH} width={W} height={horizonH} fill="url(#horizonGlow)" />

        {/* Weather condition overlay tint */}
        {overlay.op > 0 && (
          <Rect x={0} y={0} width={W} height={H} fill={overlay.color} fillOpacity={overlay.op} />
        )}
      </Svg>

      {/* ── Stars — predawn / evening / night ── */}
      {isNight && stars.map((s, i) => (
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
      {condition === 'clear' && !isNight && (
        <>
          <View style={[styles.orb, {
            width: W * 0.75, height: W * 0.75,
            borderRadius: W * 0.375,
            top: -W * 0.18, left: W * 0.12,
            backgroundColor: 'rgba(255,210,100,0.10)',
          }]} />
          <View style={[styles.orb, {
            width: W * 0.55, height: W * 0.55,
            borderRadius: W * 0.275,
            top: W * 0.25, right: -W * 0.12,
            backgroundColor: 'rgba(255,170,50,0.07)',
          }]} />
        </>
      )}

      {/* ── Drifting clouds — cloudy / fog / rain / thunderstorm ── */}
      {showClouds && clouds.map((c, i) => (
        <Animated.View
          key={`cloud-${i}`}
          style={{
            position:        'absolute',
            top:             c.y,
            width:           c.w,
            height:          c.h,
            borderRadius:    c.h / 2,
            backgroundColor: 'rgba(200,215,235,1)',
            opacity:         c.opacity,
            transform: [{
              translateX: cloudAnims[i].interpolate({
                inputRange:  [0, 1],
                outputRange: [-c.w, W + c.w],
              }),
            }],
          }}
        />
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
            backgroundColor: 'rgba(180,210,255,0.88)',
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
            backgroundColor: 'rgba(255,255,255,0.94)',
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

      {/* ── Fog pulsing haze ── */}
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
              outputRange: [0.04, 0.11],
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
