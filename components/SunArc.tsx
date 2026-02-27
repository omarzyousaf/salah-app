import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useTheme } from '@/context/ThemeContext';
import { PrayerTimings, formatTime, toMinutes } from '@/services/prayerTimes';

// ─── Animated SVG circle ──────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  timings: PrayerTimings;
  now:     Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** h:MMam compact format for tight SVG labels */
function shortTime(raw: string): string {
  const [h, m] = raw.split(' ')[0].split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Ease-out cubic */
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SunArc({ timings, now }: Props) {
  const { colors, palette, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // ── Layout geometry ────────────────────────────────────────────────────────
  const W  = screenWidth - 40;          // full content width
  const Rx = (W - 32) / 2;             // horizontal radius (leaves 16px each side)
  const Ry = Rx * 0.48;               // vertical radius  → flat ellipse
  const cx = W / 2;
  const cy = Ry + 48;                  // horizon y (48 px of sky above arc top)
  const H  = cy + 70;                  // total component height

  // ── Fraction math ──────────────────────────────────────────────────────────
  const srMin  = toMinutes(timings.Sunrise);
  const ssMin  = toMinutes(timings.Maghrib); // use Maghrib as "sunset"
  const span   = ssMin - srMin;

  const frac = (min: number) => (min - srMin) / span;

  const nowMin  = now.getHours() * 60 + now.getMinutes();
  const nowFrac = frac(nowMin);
  const isDaytime = nowFrac >= 0 && nowFrac <= 1;

  const markers = [
    { key: 'Fajr',    f: frac(toMinutes(timings.Fajr)),    label: shortTime(timings.Fajr)    },
    { key: 'Sunrise', f: 0,                                  label: shortTime(timings.Sunrise)  },
    { key: 'Dhuhr',   f: frac(toMinutes(timings.Dhuhr)),   label: shortTime(timings.Dhuhr)   },
    { key: 'Asr',     f: frac(toMinutes(timings.Asr)),     label: shortTime(timings.Asr)     },
    { key: 'Maghrib', f: 1,                                  label: shortTime(timings.Maghrib) },
    { key: 'Isha',    f: frac(toMinutes(timings.Isha)),    label: shortTime(timings.Isha)    },
  ];

  // ── Arc point formula ──────────────────────────────────────────────────────
  // f=0 → left (sunrise), f=0.5 → top (noon), f=1 → right (sunset)
  // f<0 or f>1 → below horizon (underground)
  function pt(f: number): { x: number; y: number } {
    return {
      x: cx - Rx * Math.cos(f * Math.PI),
      y: cy - Ry * Math.sin(f * Math.PI),
    };
  }

  // ── Label placement ────────────────────────────────────────────────────────
  function labelProps(f: number) {
    const { x: mx, y: my } = pt(f);
    // Outward direction from arc centre
    const dx  = mx - cx;
    const dy  = my - cy;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    const ox  = dx / mag;
    const oy  = dy / mag;

    // For near-horizontal points (at the horizon) push labels downward
    const extraY = Math.abs(oy) < 0.25 ? 14 : 0;

    let lx = mx + ox * 17;
    let ly = my + oy * 17 + extraY;

    // Clamp x so text doesn't clip SVG edge
    lx = Math.max(4, Math.min(W - 4, lx));

    const anchor: 'start' | 'middle' | 'end' =
      lx < cx - 24 ? 'start' : lx > cx + 24 ? 'end' : 'middle';

    return { lx, ly, anchor };
  }

  // ── Intro animation ────────────────────────────────────────────────────────
  const clamped     = Math.max(-0.16, Math.min(1.16, nowFrac));
  const introRef    = useRef(false);
  const [dispFrac, setDispFrac] = useState(isDaytime ? -0.02 : clamped);

  useEffect(() => {
    if (!isDaytime) {
      setDispFrac(clamped);
      return;
    }
    // Slide sun from just-before-sunrise to current position
    const start    = Date.now();
    const duration = 1600;
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

  // After intro, keep sun synced with live `now` prop
  useEffect(() => {
    if (!introRef.current) return;
    setDispFrac(Math.max(-0.16, Math.min(1.16, nowFrac)));
  }, [nowFrac]);

  // ── Glow pulse animation ───────────────────────────────────────────────────
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1300, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1300, useNativeDriver: false }),
      ]),
    ).start();
  }, [glowAnim]);

  const glowR1  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [13, 21] });
  const glowOp1 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.0] });
  const glowR2  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 34] });
  const glowOp2 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.0] });

  // ── Derived geometry ───────────────────────────────────────────────────────
  const sunPos   = pt(dispFrac);
  const arcPath  = `M ${cx - Rx} ${cy} A ${Rx} ${Ry} 0 0 1 ${cx + Rx} ${cy}`;

  // ── Colors ─────────────────────────────────────────────────────────────────
  const NIGHT  = isDark ? '#1C2680' : '#3040A0';
  const DAWN   = '#D96B30';
  const DAY    = palette.gold;
  const BRIGHT = '#EDD07A';
  const groundFill = isDark ? 'rgba(200,150,60,0.04)' : 'rgba(100,70,20,0.04)';
  const moonFill   = isDark ? '#8899CC' : '#6677BB';

  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H}>
        <Defs>
          {/* Horizontal arc gradient: night → dawn → gold → bright → gold → dawn → night */}
          <LinearGradient
            id="arcGrad"
            x1={cx - Rx} y1={cy}
            x2={cx + Rx} y2={cy}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%"   stopColor={NIGHT}  stopOpacity={0.85} />
            <Stop offset="14%"  stopColor={DAWN}                      />
            <Stop offset="32%"  stopColor={DAY}                       />
            <Stop offset="50%"  stopColor={BRIGHT}                    />
            <Stop offset="68%"  stopColor={DAY}                       />
            <Stop offset="86%"  stopColor={DAWN}                      />
            <Stop offset="100%" stopColor={NIGHT}  stopOpacity={0.85} />
          </LinearGradient>

          {/* Vertical ground gradient */}
          <LinearGradient id="groundGrad" x1={0} y1={0} x2={0} y2={1}>
            <Stop offset="0%"   stopColor={groundFill} stopOpacity={1} />
            <Stop offset="100%" stopColor={groundFill} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* ── Ground fill below horizon ── */}
        <Path
          d={`M 0 ${cy} L ${W} ${cy} L ${W} ${H} L 0 ${H} Z`}
          fill={groundFill}
        />

        {/* ── Main arc (stroke, gradient) ── */}
        <Path
          d={arcPath}
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* ── Dashed night extensions below horizon ── */}
        {/* Pre-dawn: horizon-left → Fajr marker */}
        <Line
          x1={cx - Rx} y1={cy}
          x2={pt(markers[0].f).x} y2={pt(markers[0].f).y}
          stroke={NIGHT} strokeWidth={1.2} strokeDasharray="3 4"
          opacity={0.5}
        />
        {/* Post-sunset: horizon-right → Isha marker */}
        <Line
          x1={cx + Rx} y1={cy}
          x2={pt(markers[5].f).x} y2={pt(markers[5].f).y}
          stroke={NIGHT} strokeWidth={1.2} strokeDasharray="3 4"
          opacity={0.5}
        />

        {/* ── Horizon line ── */}
        <Line
          x1={0} y1={cy} x2={W} y2={cy}
          stroke={colors.border} strokeWidth={1} opacity={0.6}
        />

        {/* ── Prayer markers ── */}
        {markers.map(({ key, f, label }) => {
          const { x: mx, y: my }   = pt(f);
          const { lx, ly, anchor } = labelProps(f);
          const isPast = f <= nowFrac + 0.001;

          // Marker color
          const dotFill = key === 'Fajr' || key === 'Isha'
            ? (isDark ? '#4455AA' : '#6677CC')
            : isPast
              ? palette.gold
              : colors.textMuted;

          return (
            <G key={key}>
              {/* Connector tick from arc to marker (for below-horizon dots) */}

              {/* Diamond dot */}
              <Path
                d={`M ${mx},${my - 4.5} L ${mx + 3.5},${my} L ${mx},${my + 4.5} L ${mx - 3.5},${my} Z`}
                fill={dotFill}
                opacity={isPast ? 1 : 0.45}
              />

              {/* Prayer name */}
              <SvgText
                x={lx} y={ly}
                fill={isPast ? palette.gold : colors.textMuted}
                fontSize={8.5}
                fontWeight="600"
                textAnchor={anchor}
                opacity={0.95}
              >
                {key}
              </SvgText>

              {/* Time */}
              <SvgText
                x={lx} y={ly + 9}
                fill={isPast ? colors.text : colors.tabInactive}
                fontSize={7.5}
                textAnchor={anchor}
                opacity={0.85}
              >
                {label}
              </SvgText>
            </G>
          );
        })}

        {/* ── Outer glow (two rings) ── */}
        <AnimatedCircle
          cx={sunPos.x} cy={sunPos.y}
          r={glowR2} fill={isDaytime ? palette.gold : moonFill}
          opacity={glowOp2}
        />
        <AnimatedCircle
          cx={sunPos.x} cy={sunPos.y}
          r={glowR1} fill={isDaytime ? palette.gold : moonFill}
          opacity={glowOp1}
        />

        {/* ── Sun or Moon ── */}
        {isDaytime ? (
          <>
            {/* Sun halo */}
            <Circle cx={sunPos.x} cy={sunPos.y} r={11} fill={palette.gold} opacity={0.9} />
            {/* Bright core */}
            <Circle cx={sunPos.x} cy={sunPos.y} r={6.5} fill="#FFF8E0" opacity={1} />
          </>
        ) : (
          /* Crescent moon */
          <G>
            <Circle cx={sunPos.x}     cy={sunPos.y}     r={9}   fill={moonFill}  opacity={0.9} />
            <Circle cx={sunPos.x + 5} cy={sunPos.y - 3} r={7}   fill={colors.bg} opacity={1}   />
          </G>
        )}
      </Svg>

      {/* ── Horizon labels (React Native text for better font rendering) ── */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.horizonRow,
          { top: cy + 6 },
        ]}
        pointerEvents="none"
      >
        <Text style={[styles.horizonLabel, { color: isDark ? '#4455AA' : '#6677CC' }]}>
          {shortTime(timings.Fajr)}
        </Text>
        <Text style={[styles.horizonCenter, { color: colors.tabInactive }]}>
          ☀ {shortTime(timings.Sunrise)} – {shortTime(timings.Maghrib)}
        </Text>
        <Text style={[styles.horizonLabel, { color: isDark ? '#4455AA' : '#6677CC' }]}>
          {shortTime(timings.Isha)}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  horizonRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    height: 32,
  },
  horizonLabel: {
    fontSize:     9,
    letterSpacing: 0.2,
    fontFamily:   'SpaceMono',
  },
  horizonCenter: {
    fontSize:     9,
    letterSpacing: 0.3,
  },
});
