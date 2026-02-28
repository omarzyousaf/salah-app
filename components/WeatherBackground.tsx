import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/context/ThemeContext';
import { PrayerTimings, toMinutes } from '@/services/prayerTimes';
import { WeatherCondition, fetchWeather } from '@/services/weather';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  lat:     number;
  lon:     number;
  timings: PrayerTimings;
  now:     Date;
}

// ─── Seeded pseudo-random (deterministic, no Math.random in render) ───────────

function pr(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ─── Particle config builders ─────────────────────────────────────────────────

const N_STARS  = 22;
const N_RAIN   = 16;
const N_SNOW   = 14;
const N_CLOUDS = 3;

function buildStars(W: number, H: number) {
  return Array.from({ length: N_STARS }, (_, i) => ({
    x:        pr(i * 5 + 0) * W,
    y:        pr(i * 5 + 1) * H * 0.82,
    r:        1.0 + pr(i * 5 + 2) * 2.2,
    duration: 1400 + pr(i * 5 + 3) * 2200,
    init:     pr(i * 5 + 4),
  }));
}

function buildRain(W: number, H: number) {
  return Array.from({ length: N_RAIN }, (_, i) => ({
    x:        pr(i * 7 + 0) * W,
    w:        0.8 + pr(i * 7 + 1) * 0.8,
    h:        10  + pr(i * 7 + 2) * 12,
    duration: 600  + pr(i * 7 + 3) * 500,
    delay:    pr(i * 7 + 4),     // fraction of duration used as initial offset
    opacity:  0.25 + pr(i * 7 + 5) * 0.30,
    tiltX:    (pr(i * 7 + 6) - 0.5) * 10,  // slight diagonal tilt
  }));
}

function buildSnow(W: number, H: number) {
  return Array.from({ length: N_SNOW }, (_, i) => ({
    x:        pr(i * 11 + 0) * W,
    r:        2.0 + pr(i * 11 + 1) * 3.0,
    duration: 3000 + pr(i * 11 + 2) * 2500,
    delay:    pr(i * 11 + 3),
    opacity:  0.50 + pr(i * 11 + 4) * 0.40,
    driftX:   (pr(i * 11 + 5) - 0.5) * 50,
  }));
}

function buildClouds(W: number, H: number) {
  return Array.from({ length: N_CLOUDS }, (_, i) => ({
    y:        pr(i * 13 + 0) * H * 0.55,
    w:        160 + pr(i * 13 + 1) * 140,
    h:        50  + pr(i * 13 + 2) * 60,
    duration: 14000 + pr(i * 13 + 3) * 16000,
    startX:   pr(i * 13 + 4) * W,
    opacity:  0.07 + pr(i * 13 + 5) * 0.07,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeatherBackground({ lat, lon, timings, now }: Props) {
  const { isDark } = useTheme();
  const { width: W, height: H } = useWindowDimensions();

  const [condition, setCondition] = useState<WeatherCondition | null>(null);

  useEffect(() => {
    fetchWeather(lat, lon)
      .then(d => setCondition(d.condition))
      .catch(() => {}); // fail silently — no background effect until weather loads
  }, [lat, lon]);

  // ── Day / night ────────────────────────────────────────────────────────────

  const srMin     = toMinutes(timings.Sunrise);
  const ssMin     = toMinutes(timings.Maghrib);
  const nowMin    = now.getHours() * 60 + now.getMinutes();
  const isDaytime = nowMin >= srMin && nowMin < ssMin;

  // ── Particle configs (deterministic, stable while screen size unchanged) ──

  const stars  = useMemo(() => buildStars(W, H),  [W, H]);
  const rain   = useMemo(() => buildRain(W, H),   [W, H]);
  const snow   = useMemo(() => buildSnow(W, H),   [W, H]);
  const clouds = useMemo(() => buildClouds(W, H), [W, H]);

  // ── Gradient colors per condition + time of day ────────────────────────────

  const { topColor, botColor, topOp, botOp } = useMemo(() => {
    if (!condition) {
      return { topColor: '#000000', botColor: '#000000', topOp: 0, botOp: 0 };
    }
    if (condition === 'rain' || condition === 'thunderstorm') {
      return { topColor: '#1E3A58', botColor: '#0E2030', topOp: 0.60, botOp: 0.50 };
    }
    if (condition === 'snow') {
      return { topColor: '#C0D4E8', botColor: '#8AA8C0', topOp: 0.28, botOp: 0.20 };
    }
    if (condition === 'cloudy' || condition === 'fog') {
      return isDark
        ? { topColor: '#3A4458', botColor: '#242C3A', topOp: 0.45, botOp: 0.35 }
        : { topColor: '#9AA8B8', botColor: '#7A8898', topOp: 0.22, botOp: 0.16 };
    }
    // clear
    return isDaytime
      ? { topColor: '#F5C060', botColor: '#E07030', topOp: 0.26, botOp: 0.16 }
      : { topColor: '#0A1040', botColor: '#1A0850', topOp: 0.72, botOp: 0.62 };
  }, [condition, isDaytime, isDark]);

  // ── Animated values (stable refs, never recreated) ────────────────────────

  const starAnims  = useRef(Array.from({ length: N_STARS },  () => new Animated.Value(0))).current;
  const rainAnims  = useRef(Array.from({ length: N_RAIN },   () => new Animated.Value(0))).current;
  const snowAnims  = useRef(Array.from({ length: N_SNOW },   () => new Animated.Value(0))).current;
  const cloudAnims = useRef(Array.from({ length: N_CLOUDS }, () => new Animated.Value(0))).current;
  const flashAnim  = useRef(new Animated.Value(0)).current;

  // ── Star animations ────────────────────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'clear' || isDaytime) return;

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
  }, [condition, isDaytime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rain / thunderstorm animations ────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'rain' && condition !== 'thunderstorm') return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const loops:  Animated.CompositeAnimation[]   = [];

    rainAnims.forEach((anim, i) => {
      anim.setValue(0);
      const delay = Math.round(rain[i].delay * rain[i].duration);
      const t = setTimeout(() => {
        const loop = Animated.loop(
          Animated.timing(anim, { toValue: 1, duration: rain[i].duration, useNativeDriver: true }),
        );
        loop.start();
        loops.push(loop);
      }, delay);
      timers.push(t);
    });

    return () => {
      timers.forEach(t => clearTimeout(t));
      loops.forEach(l => l.stop());
      rainAnims.forEach(a => a.stopAnimation());
    };
  }, [condition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Snow animations ────────────────────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'snow') return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const loops:  Animated.CompositeAnimation[]   = [];

    snowAnims.forEach((anim, i) => {
      anim.setValue(0);
      const delay = Math.round(snow[i].delay * snow[i].duration);
      const t = setTimeout(() => {
        const loop = Animated.loop(
          Animated.timing(anim, { toValue: 1, duration: snow[i].duration, useNativeDriver: true }),
        );
        loop.start();
        loops.push(loop);
      }, delay);
      timers.push(t);
    });

    return () => {
      timers.forEach(t => clearTimeout(t));
      loops.forEach(l => l.stop());
      snowAnims.forEach(a => a.stopAnimation());
    };
  }, [condition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cloud animations ───────────────────────────────────────────────────────

  useEffect(() => {
    if (condition !== 'cloudy' && condition !== 'fog') return;

    const loops = cloudAnims.map((anim, i) => {
      anim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(anim, { toValue: 1, duration: clouds[i].duration, useNativeDriver: true }),
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
        Animated.timing(flashAnim, { toValue: 0.35, duration: 80,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 80,  useNativeDriver: true }),
        Animated.delay(120),
        Animated.timing(flashAnim, { toValue: 0.25, duration: 60,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 250, useNativeDriver: true }),
      ]).start(() => {
        // Schedule next flash after a random pause (3–9 s)
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

  if (!condition) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {/* ── Sky gradient ── */}
      <Svg style={StyleSheet.absoluteFill} width={W} height={H}>
        <Defs>
          <LinearGradient id="wxSkyG" x1={0} y1={0} x2={0} y2={H} gradientUnits="userSpaceOnUse">
            <Stop offset="0%"   stopColor={topColor} stopOpacity={topOp} />
            <Stop offset="100%" stopColor={botColor} stopOpacity={botOp} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#wxSkyG)" />
      </Svg>

      {/* ── Stars (clear night) ── */}
      {condition === 'clear' && !isDaytime && stars.map((s, i) => (
        <Animated.View
          key={`star-${i}`}
          style={{
            position:     'absolute',
            left:         s.x - s.r,
            top:          s.y - s.r,
            width:        s.r * 2,
            height:       s.r * 2,
            borderRadius: s.r,
            backgroundColor: '#FFFFFF',
            opacity: starAnims[i],
          }}
        />
      ))}

      {/* ── Warm glow orbs (clear day) ── */}
      {condition === 'clear' && isDaytime && (
        <>
          <View style={[styles.orb, {
            width: W * 0.7, height: W * 0.7,
            borderRadius: W * 0.35,
            top: -W * 0.15, left: W * 0.15,
            backgroundColor: 'rgba(255,200,80,0.10)',
          }]} />
          <View style={[styles.orb, {
            width: W * 0.5, height: W * 0.5,
            borderRadius: W * 0.25,
            top: W * 0.2, right: -W * 0.1,
            backgroundColor: 'rgba(255,160,40,0.06)',
          }]} />
        </>
      )}

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
            backgroundColor: 'rgba(190,215,255,0.78)',
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

      {/* ── Snow flakes ── */}
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

      {/* ── Cloud shapes (cloudy / fog) ── */}
      {(condition === 'cloudy' || condition === 'fog') && clouds.map((c, i) => (
        <Animated.View
          key={`cloud-${i}`}
          style={{
            position:        'absolute',
            top:             c.y,
            width:           c.w,
            height:          c.h,
            borderRadius:    c.h / 2,
            backgroundColor: 'rgba(190,205,220,1)',
            opacity:         c.opacity,
            transform: [{
              translateX: cloudAnims[i].interpolate({
                inputRange:  [0, 1],
                outputRange: [c.startX - c.w, c.startX + W],
              }),
            }],
          }}
        />
      ))}

      {/* ── Lightning flash (thunderstorm) ── */}
      {condition === 'thunderstorm' && (
        <Animated.View
          style={[StyleSheet.absoluteFill, {
            backgroundColor: 'rgba(220,235,255,1)',
            opacity: flashAnim,
          }]}
        />
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
  },
});
