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
  return Array.from({ length: 20 }, (_, i) => ({
    x: pr(i * 7 + 0) * W,
    y: pr(i * 7 + 1) * arcH * 0.90,
    r: 0.6 + pr(i * 7 + 2) * 1.6,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SunArc({ timings, now }: Props) {
  const { width: screenWidth } = useWindowDimensions();

  // ── Geometry ────────────────────────────────────────────────────────────────
  const PAD = 16;           // horizontal inset for the arc endpoints
  const W   = screenWidth;
  const Rx  = (W - PAD * 2) / 2;
  const Ry  = Rx * 1.05;   // tall dome — 250-300 px on most phones
  const cx  = W / 2;
  const cy  = Ry + 24;     // breathing room at top
  const H   = cy + 52;     // total SVG height; extra for label row below

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

  const glowR1  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 36] });
  const glowOp1 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0.0] });
  const glowR2  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [36, 58] });
  const glowOp2 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.0] });
  const glowR3  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [58, 88] });
  const glowOp3 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.0] });

  // ── Derived geometry ────────────────────────────────────────────────────────
  const orbPos   = pt(dispFrac);
  const arcPath  = `M ${cx - Rx} ${cy} A ${Rx} ${Ry} 0 0 1 ${cx + Rx} ${cy}`;
  const arcStars = buildArcStars(W, cy);

  // ── Colors ──────────────────────────────────────────────────────────────────
  const GOLD   = '#C8A96E';
  const GOLD_B = '#F0C87A';
  const WHITE  = '#FFFFFF';

  // Arc line: soft white/silver at low opacity regardless of day/night
  // Pre-compute gradient stops to avoid conditional JSX inside SVG children
  type ArcStop = { offset: string; color: string; opacity: number };
  const arcStops: ArcStop[] = isNight
    ? [
        { offset: '0%',   color: '#8090C0', opacity: 0.18 },
        { offset: '50%',  color: '#A0B0D8', opacity: 0.28 },
        { offset: '100%', color: '#8090C0', opacity: 0.18 },
      ]
    : [
        { offset: '0%',   color: WHITE, opacity: 0.15 },
        { offset: '35%',  color: WHITE, opacity: 0.32 },
        { offset: '65%',  color: WHITE, opacity: 0.32 },
        { offset: '100%', color: WHITE, opacity: 0.15 },
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
          strokeWidth={1.2}
          strokeLinecap="round"
        />

        {/* ── Outer glow rings — white bloom for both day and night ── */}
        <AnimatedCircle
          cx={orbPos.x} cy={orbPos.y}
          r={glowR3}
          fill={WHITE}
          opacity={glowOp3}
        />
        <AnimatedCircle
          cx={orbPos.x} cy={orbPos.y}
          r={glowR2}
          fill={WHITE}
          opacity={glowOp2}
        />
        <AnimatedCircle
          cx={orbPos.x} cy={orbPos.y}
          r={glowR1}
          fill={WHITE}
          opacity={glowOp1}
        />

        {/* ── Orb: sun or crescent moon ── */}
        {isDaytime ? (
          <>
            {/* Sun halo */}
            <Circle cx={orbPos.x} cy={orbPos.y} r={18}  fill={GOLD}   opacity={0.80} />
            {/* Inner warm ring */}
            <Circle cx={orbPos.x} cy={orbPos.y} r={11}  fill={GOLD}   opacity={0.92} />
            {/* Bright core */}
            <Circle cx={orbPos.x} cy={orbPos.y} r={7}   fill={GOLD_B} opacity={1}    />
          </>
        ) : (
          /* Crescent moon (filled circle minus offset circle) */
          <G>
            <Circle cx={orbPos.x}       cy={orbPos.y}       r={13}  fill="#C8D8F0"          opacity={0.92} />
            <Circle cx={orbPos.x + 6.5} cy={orbPos.y - 4.0} r={10}  fill="rgba(0,2,18,0.92)" opacity={1}  />
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
