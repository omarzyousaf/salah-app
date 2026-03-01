/**
 * SunArc — hero sun/moon arc for the Prayer Times screen.
 *
 * - Tall dome (≥ 280 px on most phones); arc fraction 0 = Fajr, 1 = Maghrib
 * - SOLID white line from Fajr to current orb position (past portion)
 * - DASHED white line from current position to Maghrib (future portion)
 * - Tight glowing orb (sun: #FFD700, moon: #E8E8F0) with subtle pulse
 * - Fajr / Maghrib endpoint labels — fontWeight 300, opacity 0.6
 * - Star dots during night, inside the arc viewport
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { PrayerTimings, formatTime, toMinutes } from '@/services/prayerTimes';

// ─── Animated SVG primitives ──────────────────────────────────────────────────

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

/** Deterministic pseudo-random — stable across renders. */
function pr(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function buildArcStars(W: number, arcH: number) {
  return Array.from({ length: 22 }, (_, i) => ({
    x: pr(i * 7 + 0) * W,
    y: pr(i * 7 + 1) * arcH * 0.88,
    r: 0.5 + pr(i * 7 + 2) * 1.4,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SunArc({ timings, now }: Props) {
  const { width: screenWidth } = useWindowDimensions();

  // ── Geometry ────────────────────────────────────────────────────────────────
  const PAD = 20;            // horizontal inset for arc endpoints
  const W   = screenWidth;
  const Rx  = (W - PAD * 2) / 2;
  const Ry  = Rx * 1.2;    // tall dome → ~280-300 px on standard phones
  const cx  = W / 2;
  const cy  = Ry + 28;     // breathing room above dome
  const H   = cy + 56;     // total SVG height; room for endpoint labels below

  // ── Fraction math — 0 = Fajr endpoint, 1 = Maghrib endpoint ────────────────
  const fajrMin    = toMinutes(timings.Fajr);
  const sunriseMin = toMinutes(timings.Sunrise);
  const maghribMin = toMinutes(timings.Maghrib);
  const span       = maghribMin - fajrMin;

  const nowMin  = now.getHours() * 60 + now.getMinutes();
  const nowFrac = (nowMin - fajrMin) / span;

  const isDaytime  = nowMin >= sunriseMin && nowMin < maghribMin;
  const isAboveArc = nowFrac >= 0 && nowFrac <= 1;
  const isNight    = !isDaytime;

  const clamped = Math.max(-0.06, Math.min(1.06, nowFrac));

  // ── Arc point formula: f=0 → left (Fajr), f=1 → right (Maghrib) ────────────
  function pt(f: number): { x: number; y: number } {
    return {
      x: cx - Rx * Math.cos(f * Math.PI),
      y: cy - Ry * Math.sin(f * Math.PI),
    };
  }

  // ── Intro animation — orb sweeps from Fajr to current position ──────────────
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

  // ── Glow pulse ───────────────────────────────────────────────────────────────
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ]),
    ).start();
  }, [glowAnim]);

  // Tight, realistic glow — not a huge bloom
  const glowR1  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 22] });
  const glowOp1 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.30, 0.0] });
  const glowR2  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 32] });
  const glowOp2 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.0] });

  // ── Derived geometry ─────────────────────────────────────────────────────────
  const orbPos   = pt(dispFrac);
  const arcStars = buildArcStars(W, cy);

  // Safe fraction for SVG arc drawing — avoid degenerate zero-length arcs
  const safeF    = Math.max(0.005, Math.min(0.995, dispFrac));
  const ptOrbSvg = pt(safeF);
  const ptFajr   = { x: cx - Rx, y: cy };
  const ptMag    = { x: cx + Rx, y: cy };

  // Past portion (solid): Fajr → current orb
  const solidPath = [
    `M ${ptFajr.x.toFixed(2)} ${ptFajr.y.toFixed(2)}`,
    `A ${Rx.toFixed(2)} ${Ry.toFixed(2)} 0 0 1`,
    `${ptOrbSvg.x.toFixed(2)} ${ptOrbSvg.y.toFixed(2)}`,
  ].join(' ');

  // Future portion (dashed): current orb → Maghrib
  const dashedPath = [
    `M ${ptOrbSvg.x.toFixed(2)} ${ptOrbSvg.y.toFixed(2)}`,
    `A ${Rx.toFixed(2)} ${Ry.toFixed(2)} 0 0 1`,
    `${ptMag.x.toFixed(2)} ${ptMag.y.toFixed(2)}`,
  ].join(' ');

  // ── Colors ───────────────────────────────────────────────────────────────────
  const SUN_COLOR  = '#FFD700';
  const MOON_COLOR = '#E8E8F0';
  const orbColor   = isDaytime ? SUN_COLOR : MOON_COLOR;

  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H}>

        {/* ── Star dots (night only) ── */}
        {isNight && arcStars.map((s, i) => (
          <Circle
            key={`as-${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="rgba(255,255,255,0.55)"
          />
        ))}

        {/* ── Past arc (solid) — Fajr to orb ── */}
        <Path
          d={solidPath}
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />

        {/* ── Future arc (dashed) — orb to Maghrib ── */}
        <Path
          d={dashedPath}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="8 6"
        />

        {/* ── Glow rings (pulse animation) ── */}
        <AnimatedCircle
          cx={orbPos.x} cy={orbPos.y}
          r={glowR2}
          fill={orbColor}
          opacity={glowOp2}
        />
        <AnimatedCircle
          cx={orbPos.x} cy={orbPos.y}
          r={glowR1}
          fill={orbColor}
          opacity={glowOp1}
        />

        {/* ── Orb ── */}
        {isDaytime ? (
          <>
            {/* Sun: warm halo + bright core */}
            <Circle cx={orbPos.x} cy={orbPos.y} r={14} fill={SUN_COLOR} opacity={0.35} />
            <Circle cx={orbPos.x} cy={orbPos.y} r={9}  fill={SUN_COLOR} opacity={1.0}  />
          </>
        ) : (
          /* Crescent moon: filled circle minus smaller offset circle */
          <G>
            <Circle cx={orbPos.x}       cy={orbPos.y}        r={8}  fill={MOON_COLOR}         opacity={0.92} />
            <Circle cx={orbPos.x + 4.5} cy={orbPos.y - 2.5}  r={6}  fill="rgba(2,4,18,0.92)"  opacity={1}    />
          </G>
        )}
      </Svg>

      {/* ── Endpoint labels (Fajr left, Maghrib right) ── */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.labels,
          { top: cy + 12, paddingHorizontal: PAD - 4 },
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
    fontSize:      13,
    fontWeight:    '300',
    letterSpacing: 0.3,
    color:         'rgba(255,255,255,0.60)',
    marginBottom:  2,
  },
  epTime: {
    fontSize:      11,
    fontWeight:    '300',
    color:         'rgba(255,255,255,0.38)',
  },
});
