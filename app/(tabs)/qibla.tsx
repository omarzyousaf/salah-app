import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Polygon,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useTheme } from '@/context/ThemeContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const KAABA = { lat: 21.4225, lon: 39.8262 } as const;

const SIZE = 300;
const CX   = SIZE / 2;  // 150
const CY   = SIZE / 2;  // 150
const R    = 126;       // main ring radius

// ─── Math ─────────────────────────────────────────────────────────────────────

/** Great-circle bearing (0–360°, CW from north) from user to Kaaba. */
function calcQiblaBearing(lat: number, lon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δλ = toRad(KAABA.lon - lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Haversine distance in km from user to Kaaba. */
function calcDistanceKm(lat: number, lon: number): number {
  const R_EARTH = 6371;
  const toRad   = (d: number) => (d * Math.PI) / 180;
  const dLat    = toRad(KAABA.lat - lat);
  const dLon    = toRad(KAABA.lon - lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(KAABA.lat)) * Math.sin(dLon / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Magnetometer x,y → compass heading (0 = N, CW). */
function rawToHeading(x: number, y: number): number {
  return ((Math.atan2(y, x) * -180) / Math.PI + 360) % 360;
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

/** Convert compass bearing + radius → SVG point (0° = up, CW). */
function b2p(bearing: number, radius: number): { x: number; y: number } {
  const rad = (bearing * Math.PI) / 180;
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
}

/** 8-pointed star polygon string for Islamic geometric decoration. */
function starPoints(cx: number, cy: number, rOut: number, rIn: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r     = i % 2 === 0 ? rOut : rIn;
    const angle = (i * Math.PI) / 8 - Math.PI / 2; // start at top
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// ─── Compass SVG ──────────────────────────────────────────────────────────────

function CompassSvg({ qiblaBearing, isDark }: { qiblaBearing: number; isDark: boolean }) {
  const { colors, palette } = useTheme();

  // Tick geometry — 72 ticks at 5° intervals
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const deg    = i * 5;
    const isCard = deg % 90 === 0;
    const isIcrd = !isCard && deg % 45 === 0; // intercardinal (NE/SE/SW/NW)
    const isMaj  = !isCard && !isIcrd && deg % 15 === 0;
    const len    = isCard ? 15 : isIcrd ? 10 : isMaj ? 6 : 3;
    const p1     = b2p(deg, R);
    const p2     = b2p(deg, R - len);
    const lp     = b2p(deg, R - 27);
    const label  = isCard ? ['N', 'E', 'S', 'W'][deg / 90] : null;
    return { deg, p1, p2, lp, label, isCard, isIcrd };
  });

  // Decorative diamond accents at 8 compass points
  const octants = Array.from({ length: 8 }, (_, i) => {
    const deg    = i * 45;
    const isCard = deg % 90 === 0;
    const { x, y } = b2p(deg, R + 7);
    return { deg, x, y, isCard };
  });

  // Gradient id (stable for this single SVG instance)
  const gradId = 'qiblaFace';

  const bgColor  = colors.card;
  const midColor = colors.cardAlt;

  // Islamic geometric decoration: two overlapping squares at 45° make an 8-point star
  const bgStarLg  = starPoints(CX, CY, 80, 34);   // large background star
  const bgStarSm  = starPoints(CX, CY, 40, 17);   // mid ring star
  const ctrStar   = starPoints(CX, CY, 12, 5);    // center ornament

  // Qibla needle geometry (drawn pointing UP = 0° = North, then rotated)
  const needleTipY  = CY - 108;
  const needleAncY  = CY - 80;
  const shaftBaseY  = CY + 36;
  const tailAncY    = CY + 22;

  return (
    <Svg width={SIZE} height={SIZE}>
      <Defs>
        <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <Stop offset="0%"   stopColor={bgColor}  stopOpacity="1" />
          <Stop offset="100%" stopColor={midColor} stopOpacity="1" />
        </RadialGradient>
      </Defs>

      {/* ── Outer decorative rings (static, frame) ── */}
      <Circle cx={CX} cy={CY} r={R + 16} fill="none" stroke={palette.gold}    strokeWidth={0.4} opacity={0.25} />
      <Circle cx={CX} cy={CY} r={R + 10} fill="none" stroke={palette.gold}    strokeWidth={0.7} opacity={0.18} />
      <Circle cx={CX} cy={CY} r={R +  4} fill="none" stroke={colors.border}   strokeWidth={1}   opacity={0.5}  />

      {/* ── Compass face with radial gradient ── */}
      <Circle cx={CX} cy={CY} r={R} fill={`url(#${gradId})`} stroke={colors.border} strokeWidth={1.5} />

      {/* ── Islamic geometric background patterns ── */}
      {/* Large 8-pointed star (two overlapping squares) */}
      <Polygon
        points={`${CX},${CY - 80} ${CX + 80},${CY} ${CX},${CY + 80} ${CX - 80},${CY}`}
        fill="none" stroke={palette.gold} strokeWidth={0.6} opacity={0.07}
      />
      <Polygon
        points={`${(CX + 56.57).toFixed(1)},${(CY - 56.57).toFixed(1)} ${(CX + 56.57).toFixed(1)},${(CY + 56.57).toFixed(1)} ${(CX - 56.57).toFixed(1)},${(CY + 56.57).toFixed(1)} ${(CX - 56.57).toFixed(1)},${(CY - 56.57).toFixed(1)}`}
        fill="none" stroke={palette.gold} strokeWidth={0.6} opacity={0.07}
      />
      {/* Connecting circles */}
      <Circle cx={CX} cy={CY} r={80} fill="none" stroke={palette.gold} strokeWidth={0.4} opacity={0.07} />
      <Circle cx={CX} cy={CY} r={40} fill="none" stroke={palette.gold} strokeWidth={0.4} opacity={0.07} />

      {/* Mid-ring 8-pointed star (smaller) */}
      <Polygon points={bgStarSm} fill="none" stroke={palette.gold} strokeWidth={0.5} opacity={0.06} />

      {/* Large 8-pointed star polygon */}
      <Polygon points={bgStarLg} fill="none" stroke={palette.gold} strokeWidth={0.5} opacity={0.05} />

      {/* Inner decorative ring */}
      <Circle cx={CX} cy={CY} r={R - 18} fill="none" stroke={colors.border} strokeWidth={0.6} opacity={0.4} />

      {/* ── Tick marks ── */}
      {ticks.map(({ deg, p1, p2, lp, label, isCard, isIcrd }) => (
        <G key={deg}>
          <Line
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={isCard ? colors.text : isIcrd ? colors.textMuted : colors.border}
            strokeWidth={isCard ? 1.5 : isIcrd ? 0.8 : 0.5}
            opacity={isCard ? 0.9 : isIcrd ? 0.45 : 0.28}
          />
          {label && (
            <SvgText
              x={lp.x}
              y={lp.y + 5}
              fill={label === 'N' ? palette.north : colors.text}
              fontSize={label === 'N' ? 15 : 11}
              fontWeight={label === 'N' ? '700' : '500'}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          )}
        </G>
      ))}

      {/* ── Decorative diamond accents at 8 points ── */}
      {octants.map(({ deg, x, y, isCard }) => (
        <Polygon
          key={`oct-${deg}`}
          points={`${x},${y - 5} ${x + 3.5},${y} ${x},${y + 5} ${x - 3.5},${y}`}
          fill={isCard ? palette.gold : colors.textMuted}
          opacity={isCard ? 0.75 : 0.25}
          transform={`rotate(${deg}, ${x}, ${y})`}
        />
      ))}

      {/* ── Qibla needle — rotated to qiblaBearing (drawn pointing up) ── */}
      <G rotation={qiblaBearing} origin={`${CX}, ${CY}`}>
        {/* Soft glow behind needle */}
        <Line
          x1={CX} y1={shaftBaseY} x2={CX} y2={needleTipY}
          stroke={palette.gold} strokeWidth={8} opacity={0.06}
          strokeLinecap="round"
        />
        {/* Main shaft */}
        <Line
          x1={CX} y1={shaftBaseY} x2={CX} y2={needleAncY}
          stroke={palette.gold} strokeWidth={2} opacity={0.45}
          strokeLinecap="round"
        />
        {/* Outer arrowhead (translucent, wider) */}
        <Polygon
          points={`${CX},${needleTipY - 2} ${CX - 15},${needleAncY + 4} ${CX + 15},${needleAncY + 4}`}
          fill={palette.gold} opacity={0.18}
        />
        {/* Inner arrowhead (solid) */}
        <Polygon
          points={`${CX},${needleTipY} ${CX - 9},${needleAncY} ${CX + 9},${needleAncY}`}
          fill={palette.gold}
        />
        {/* Tail fin */}
        <Polygon
          points={`${CX},${shaftBaseY + 6} ${CX - 6},${tailAncY} ${CX + 6},${tailAncY}`}
          fill={palette.gold} opacity={0.3}
        />
        {/* Tip glow dot */}
        <Circle cx={CX} cy={needleTipY} r={9} fill={palette.gold} opacity={0.12} />
        <Circle cx={CX} cy={needleTipY} r={5} fill={palette.gold} opacity={0.9} />
      </G>

      {/* ── Center ornament (Islamic 8-pointed star) ── */}
      <Polygon
        points={ctrStar}
        fill={colors.card}
        stroke={palette.gold}
        strokeWidth={0.8}
        opacity={0.65}
      />
      <Circle cx={CX} cy={CY} r={4.5} fill={palette.gold} opacity={0.75} />
      <Circle cx={CX} cy={CY} r={2}   fill={bgColor}       opacity={1}    />
    </Svg>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function QiblaScreen() {
  const { colors, palette, isDark } = useTheme();

  // Location
  const [coords,     setCoords]     = useState<{ lat: number; lon: number } | null>(null);
  const [locError,   setLocError]   = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(true);

  // Magnetometer
  const [magAvailable, setMagAvailable] = useState<boolean | null>(null);

  // Smooth compass rotation
  const animRotation = useRef(new Animated.Value(0)).current;
  const prevRotRef   = useRef(0);

  // ── Init: check magnetometer + get location ───────────────────────────────

  useEffect(() => {
    Magnetometer.isAvailableAsync().then(setMagAvailable);

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocError('Location permission denied.\nOpen Settings and grant location access.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      } catch (e: any) {
        setLocError(e?.message ?? 'Could not get location.');
      } finally {
        setLocLoading(false);
      }
    })();
  }, []);

  // ── Magnetometer subscription ─────────────────────────────────────────────

  useEffect(() => {
    if (!magAvailable) return;

    Magnetometer.setUpdateInterval(80);
    const sub = Magnetometer.addListener(({ x, y }) => {
      const heading = rawToHeading(x, y);

      // Shortest-path animation (avoids 350° wrap-around spins)
      const target = -heading;
      let delta    = target - prevRotRef.current;
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      const next = prevRotRef.current + delta;
      prevRotRef.current = next;

      Animated.timing(animRotation, {
        toValue:         next,
        duration:        150,
        useNativeDriver: true,
      }).start();
    });

    return () => sub.remove();
  }, [magAvailable]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const qiblaBearing = coords ? calcQiblaBearing(coords.lat, coords.lon) : null;
  const distanceKm   = coords ? calcDistanceKm(coords.lat, coords.lon)   : null;

  const spin = animRotation.interpolate({
    inputRange:  [-7200, 7200],
    outputRange: ['-7200deg', '7200deg'],
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  if (locLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={palette.gold} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Getting your location…
        </Text>
      </View>
    );
  }

  // ── Location error ────────────────────────────────────────────────────────

  if (locError || !coords) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={52} color={colors.textMuted} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Location Unavailable</Text>
        <Text style={[styles.errorSub, { color: colors.textMuted }]}>
          {locError ?? 'Unable to determine your location.'}
        </Text>
      </View>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title with decorative dividers ── */}
        <View style={styles.titleBlock}>
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <View style={[styles.diamond, { backgroundColor: palette.gold }]} />
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Qibla</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Direction to the Holy Kaaba
          </Text>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <View style={[styles.diamond, { backgroundColor: palette.gold }]} />
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
        </View>

        {/* ── Compass ── */}
        <View style={[styles.compassOuter, { borderColor: palette.goldDim }]}>
          <Animated.View
            style={magAvailable ? { transform: [{ rotate: spin }] } : undefined}
          >
            <CompassSvg qiblaBearing={qiblaBearing!} isDark={isDark} />
          </Animated.View>
        </View>

        {/* ── Info cards ── */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.infoTopAccent, { backgroundColor: palette.gold }]} />
            <MaterialCommunityIcons name="compass" size={20} color={palette.gold} style={styles.infoIcon} />
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {qiblaBearing!.toFixed(1)}°
            </Text>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Qibla Bearing</Text>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.infoTopAccent, { backgroundColor: palette.gold }]} />
            <MaterialCommunityIcons name="map-marker" size={20} color={palette.gold} style={styles.infoIcon} />
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {Math.round(distanceKm!).toLocaleString()}
            </Text>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>km to Mecca</Text>
          </View>
        </View>

        {/* ── Calibration notice (magnetometer active) ── */}
        {magAvailable && (
          <View style={[styles.notice, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="information-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              Move your phone in a figure‑8 to calibrate the compass
            </Text>
          </View>
        )}

        {/* ── No magnetometer ── */}
        {magAvailable === false && (
          <View style={[styles.notice, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.danger} />
            <Text style={[styles.noticeText, { color: colors.danger }]}>
              Compass sensor unavailable — the bearing above shows direction from North
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },

  loadingText: { marginTop: 14, fontSize: 13, letterSpacing: 0.3 },
  errorTitle:  { fontSize: 18, fontWeight: '300', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  errorSub:    { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Title block
  titleBlock: { alignItems: 'center', width: '100%', marginBottom: 28 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '60%', marginVertical: 10 },
  dividerLine: { flex: 1, height: 1 },
  diamond: {
    width: 7, height: 7,
    transform: [{ rotate: '45deg' }],
    marginHorizontal: 10,
  },
  title:    { fontSize: 30, fontWeight: '200', letterSpacing: 3 },
  subtitle: { fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 },

  // Compass
  compassOuter: {
    width:        SIZE + 20,
    height:       SIZE + 20,
    borderRadius: (SIZE + 20) / 2,
    borderWidth:  1,
    alignItems:   'center',
    justifyContent: 'center',
    marginBottom: 28,
  },

  // Info cards
  infoRow: {
    flexDirection: 'row',
    gap:           12,
    width:         '100%',
    marginBottom:  16,
  },
  infoCard: {
    flex:           1,
    alignItems:     'center',
    borderRadius:   14,
    borderWidth:    1,
    overflow:       'hidden',
    paddingBottom:  16,
    paddingTop:     0,
  },
  infoTopAccent: {
    width:         '100%',
    height:        3,
    marginBottom:  14,
  },
  infoIcon:  { marginBottom: 6 },
  infoValue: {
    fontSize:    22,
    fontWeight:  '300',
    fontFamily:  'SpaceMono',
    letterSpacing: 0.5,
    marginBottom:  2,
  },
  infoLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },

  // Notice
  notice: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingVertical:   10,
    paddingHorizontal: 14,
    borderRadius:      10,
    borderWidth:       1,
    width:             '100%',
  },
  noticeText: { fontSize: 12, flex: 1, lineHeight: 17 },
});
