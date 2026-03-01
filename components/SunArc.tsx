/**
 * SunArc — hero sun/moon arc for the Prayer Times screen.
 *
 * - Full screen width; arc fraction 0 = Fajr, 1 = Maghrib
 * - Thin elegant arc line with gradient
 * - Glowing orb (sun during day, crescent moon at night) with pulse animation
 * - Fajr / Maghrib endpoint labels only — no clutter on the arc
 * - Twinkling stars in the arc viewport during night
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { PrayerTimings, formatTime, toMinutes } from '@/services/prayerTimes';

// ─── Animated SVG circle ──────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  timings: PrayerTimings;
  now:     Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Deterministic pseudo-random — no Math.random in render. */
function pr(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function buildArcStars(W: number, arcH: number) {
  return Array.from({ length: 14 }, (_, i) => ({
    x: pr(i * 7 + 0) * W,
    y: pr(i * 7 + 1) * arcH * 0.92,
    r: 0.7 + pr(i * 7 + 2) * 1.8,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SunArc({ timings, now }: Props) {
  const { width: screenWidth } = useWindowDimensions();

  // ── Geometry ────────────────────────────────────────────────────────────────
  const PAD = 24;           // horizontal inset for the arc endpoints
  const W   = screenWidth;
  const Rx  = (W - PAD * 2) / 2;
  const Ry  = Rx * 0.62;   // taller arc = more visual presence
  const cx  = W / 2;
  const cy  = Ry + 18;     // small top breathing room
  const H   = cy + 48;     // total SVG height; extra for label row below

  // ── Fraction math — 0=Fajr, 1=Maghrib ──────────────────────────────────────
  const fajrMin    = toMinutes(timings.Fajr);
  const sunriseMin = toMinutes(timings.Sunrise);
  const maghribMin = toMinutes(timings.Maghrib);
  const span       = maghribMin - fajrMin;

  const nowMin  = now.getHours() * 60 + now.getMinutes();
  const nowFrac = (nowMin - fajrMin) / span;

  const isDaytime     = nowMin >= sunriseMin && nowMin < maghribMin;
  const isAboveArc    = nowFrac >= 0 && nowFrac <= 1;
  const isNight       = !isDaytime;

  const clamped = Math.max(-0.06, Math.min(1.06, nowFrac));

  // ── Arc point formula: f=0 → left (Fajr), f=1 → right (Maghrib) ────────────
  function pt(f: number): { x: number; y: number } {
    return {
      x: cx - Rx * Math.cos(f * Math.PI),
      y: cy - Ry * Math.sin(f * Math.PI),
    };
  }

  // ── Intro animation — orb slides from Fajr to current position ──────────────
  const introRef = useRef(false);
  const [dispFrac, setDispFrac] = useState(isAboveArc ? -0.02 : clamped);

  useEffect(() => {
    if (!isAboveArc) {
      setDispFrac(clamped);
      return;
    }
    const start    = Date.now();
    const duration = 1400;
    const from     = -0.02;
    const to       = clamped;

    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= duration) {
        setDispFrac(to);
        introRef.current = true;
        clearInterval(id);
        return;
      }
      setDispFrac(from + (to - from) * easeOut(elapsed / duration));
    }, 16);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep orb synced with live `now` after intro completes
  useEffect(() => {
    if (!introRef.current) return;
    setDispFrac(Math.max(-0.06, Math.min(1.06, nowFrac)));
  }, [nowFrac]);

  // ── Glow pulse ──────────────────────────────────────────────────────────────
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ]),
    ).start();
  }, [glowAnim]);

  const glowR1  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 26] });
  const glowOp1 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.0] });
  const glowR2  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [26, 42] });
  const glowOp2 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.0] });

  // ── Derived geometry ────────────────────────────────────────────────────────
  const orbPos   = pt(dispFrac);
  const arcPath  = `M ${cx - Rx} ${cy} A ${Rx} ${Ry} 0 0 1 ${cx + Rx} ${cy}`;
  const arcStars = buildArcStars(W, cy);

  // ── Colors ──────────────────────────────────────────────────────────────────
  const GOLD   = '#C8A96E';
  const GOLD_B = '#F0C87A';
  const DAWN   = '#E87838';
  const MOON   = '#B8C8E8';

  // Pre-compute gradient stops to avoid conditional JSX inside SVG children
  type ArcStop = { offset: string; color: string; opacity: number };
  const arcStops: ArcStop[] = isNight
    ? [
        { offset: '0%',   color: '#2A3870', opacity: 0.45 },
        { offset: '50%',  color: '#3C4E90', opacity: 0.55 },
        { offset: '100%', color: '#2A3870', opacity: 0.45 },
      ]
    : [
        { offset: '0%',   color: DAWN, opacity: 0.85 },
        { offset: '35%',  color: GOLD, opacity: 1.0  },
        { offset: '65%',  color: GOLD, opacity: 1.0  },
        { offset: '100%', color: DAWN, opacity: 0.85 },
      ];

  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H}>
        <Defs>
          {/* Arc line gradient: dawn→gold→gold→dawn (daytime) or dim blue (night) */}
          <LinearGradient
            id="arcLine"
            x1={cx - Rx} y1={cy}
            x2={cx + Rx} y2={cy}
            gradientUnits="userSpaceOnUse"
          >
            {arcStops.map((s, i) => (
              <Stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
            ))}
          </LinearGradient>
        </Defs>

        {/* ── Stars (night / predawn) ── */}
        {isNight && arcStars.map((s, i) => (
          <Circle
            key={`as-${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="rgba(255,255,255,0.65)"
          />
        ))}

        {/* ── Main arc line ── */}
        <Path
          d={arcPath}
          fill="none"
          stroke="url(#arcLine)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />

        {/* ── Outer glow rings ── */}
        <AnimatedCircle
          cx={orbPos.x} cy={orbPos.y}
          r={glowR2}
          fill={isDaytime ? GOLD : MOON}
          opacity={glowOp2}
        />
        <AnimatedCircle
          cx={orbPos.x} cy={orbPos.y}
          r={glowR1}
          fill={isDaytime ? GOLD : MOON}
          opacity={glowOp1}
        />

        {/* ── Orb: sun or crescent moon ── */}
        {isDaytime ? (
          <>
            {/* Sun halo */}
            <Circle cx={orbPos.x} cy={orbPos.y} r={13}  fill={GOLD}   opacity={0.92} />
            {/* Bright core */}
            <Circle cx={orbPos.x} cy={orbPos.y} r={7.5} fill={GOLD_B} opacity={1}    />
          </>
        ) : (
          /* Crescent moon (filled circle minus offset circle) */
          <G>
            <Circle cx={orbPos.x}       cy={orbPos.y}       r={11}  fill={MOON}             opacity={0.92} />
            <Circle cx={orbPos.x + 5.5} cy={orbPos.y - 3.5} r={8.5} fill="rgba(0,2,18,0.92)" opacity={1}  />
          </G>
        )}
      </Svg>

      {/* ── Endpoint labels (Fajr left, Maghrib right) ── */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.labels,
          { top: cy + 10, paddingHorizontal: PAD - 4 },
        ]}
        pointerEvents="none"
      >
        <View>
          <Text style={styles.epName}>Fajr</Text>
          <Text style={styles.epTime}>{formatTime(timings.Fajr)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.epName}>Maghrib</Text>
          <Text style={styles.epTime}>{formatTime(timings.Maghrib)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  labels: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },
  epName: {
    fontSize:      11,
    fontWeight:    '500',
    letterSpacing: 0.4,
    color:         'rgba(255,255,255,0.72)',
    marginBottom:  2,
  },
  epTime: {
    fontSize:   10,
    color:      'rgba(255,255,255,0.48)',
    fontFamily: 'SpaceMono',
  },
});
