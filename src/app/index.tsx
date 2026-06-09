/**
 * Live Timing — Adaptive Home / Landing Hub
 *
 * M3 Expressive design implementing three sections:
 *
 * A  State-Aware Hero Card (XL, 28dp corners)
 *    - LIVE: red pulsating pip + GP name + "Enter Pit Wall" CTA
 *    - No-Race: monospace countdown clock + weather matrix backdrop
 *
 * B  Collapsible Top 5 Grid
 *    - Position · Team accent strip · Driver · Compound badge · Gap
 *    - Strictly shows P1–P5; "View full 20-car grid" expands inline
 *
 * C  Battle Tracker Carousel
 *    - Horizontal M3 12dp card deck
 *    - Head-to-head gaps for intra-team & cross-team rivalries
 *    - Tap → navigate to Pit Wall telemetry with drivers pre-selected
 */

import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import {
  BottomTabInset,
  M3Motion,
  M3Shape,
  MaxContentWidth,
  Spacing,
} from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';
import { apiCache, TTL } from '@/utils/api-cache';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string | null;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
  meeting_key: number;
  gmt_offset?: string;
}

interface Driver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
  headshot_url?: string;
}

interface LeaderboardEntry {
  position: number | null;
  driver_number: number;
  driver?: Driver;
  gap_to_leader: number | string | null;
  interval: number | string | null;
  compound?: string;
  stint_age?: number;
  number_of_laps?: number;
  dnf?: boolean;
}

interface RaceControlMessage {
  date: string;
  message: string;
  flag: string | null;
  lap_number: number | null;
}

interface BattlePair {
  driverA: string;
  driverB: string;
  teamA: string;
  teamB: string;
  colorA: string;
  colorB: string;
  gap: string;
  label: string;
  numA: number;
  numB: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// 2025 static rivalry pairs (update per-weekend)
const BATTLE_PAIRS: BattlePair[] = [
  { driverA: 'NOR', driverB: 'PIA', teamA: 'McLaren', teamB: 'McLaren',
    colorA: '#FF8000', colorB: '#FF8000', gap: '+16 PTS', label: 'PAPAYA DUEL', numA: 4, numB: 81 },
  { driverA: 'LEC', driverB: 'HAM', teamA: 'Ferrari', teamB: 'Ferrari',
    colorA: '#E8002D', colorB: '#E8002D', gap: '+26 PTS', label: 'SCUDERIA DELTA', numA: 16, numB: 44 },
  { driverA: 'RUS', driverB: 'ANT', teamA: 'Mercedes', teamB: 'Mercedes',
    colorA: '#27F4D2', colorB: '#27F4D2', gap: '+2 PTS', label: 'SILVER ARROWS', numA: 63, numB: 12 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLiveSession(s: Session | null): boolean {
  if (!s) return false;
  const now = new Date();
  const start = new Date(s.date_start);
  const end = s.date_end ? new Date(s.date_end) : null;
  return now >= start && (!end || now <= end);
}

function nextSessionCountdown(s: Session | null): string {
  if (!s) return '--:--:--';
  const diff = new Date(s.date_start).getTime() - Date.now();
  if (diff <= 0) return '00:00:00';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function compoundColor(compound?: string): string {
  switch (compound?.toUpperCase()) {
    case 'SOFT':   return '#ef4444';
    case 'MEDIUM': return '#eab308';
    case 'HARD':   return '#e2e8f0';
    case 'INTERMEDIATE': return '#22c55e';
    case 'WET':    return '#3b82f6';
    default:       return '#94a3b8';
  }
}

function compoundAbbrev(compound?: string): string {
  switch (compound?.toUpperCase()) {
    case 'SOFT':   return 'S';
    case 'MEDIUM': return 'M';
    case 'HARD':   return 'H';
    case 'INTERMEDIATE': return 'I';
    case 'WET':    return 'W';
    default:       return '?';
  }
}

function teamColorHex(colour?: string): string {
  if (!colour) return '#94a3b8';
  return colour.startsWith('#') ? colour : `#${colour}`;
}

function formatGap(gap: number | string | null, position: number | null): string {
  if (position === 1) return 'LEADER';
  if (gap == null) return '—';
  if (typeof gap === 'string') return gap.startsWith('+') ? gap : `+${gap}`;
  if (gap <= 0) return 'LEADER';
  return `+${gap.toFixed(3)}s`;
}

// ─── Live Pip (pulsating red dot) ─────────────────────────────────────────────

function LivePip() {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 700, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(1.0, { duration: 700, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
      false
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: 1,
  }));

  return (
    <Animated.View style={[pipStyles.pip, style]} />
  );
}

const pipStyles = StyleSheet.create({
  pip: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#E10600',
  },
});

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({
  session,
  isLive,
  countdown,
  raceControl,
}: {
  session: Session | null;
  isLive: boolean;
  countdown: string;
  raceControl: RaceControlMessage[];
}) {
  const theme = useTheme();

  const lastFlag = raceControl[0]?.flag ?? null;

  return (
    <View style={[heroStyles.card, { backgroundColor: theme.surfaceVariant, borderColor: theme.outline }]}>
      {/* Top accent line */}
      <View style={heroStyles.accentLine} />

      <View style={heroStyles.inner}>
        {isLive ? (
          /* ── Live state ── */
          <>
            <View style={heroStyles.liveRow}>
              <LivePip />
              <ThemedText style={heroStyles.liveLabel}>LIVE</ThemedText>
              {lastFlag && (
                <View style={[heroStyles.flagPill, { backgroundColor: getFlagBg(lastFlag) }]}>
                  <ThemedText style={[heroStyles.flagText, { color: getFlagText(lastFlag) }]}>
                    {lastFlag} FLAG
                  </ThemedText>
                </View>
              )}
            </View>

            {session && (
              <ThemedText style={heroStyles.eventName}>
                {session.location.toUpperCase()} {session.year} — {session.session_name.toUpperCase()}
              </ThemedText>
            )}

            <Pressable
              onPress={() => router.push('/pitwall')}
              style={({ pressed }) => [
                heroStyles.ctaButton,
                { backgroundColor: '#E10600' },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              <SymbolView
                name={{ ios: 'chart.line.uptrend.xyaxis', android: 'monitor', web: 'monitor' }}
                size={16}
                tintColor="#fff"
              />
              <ThemedText style={heroStyles.ctaText}>ENTER PIT WALL HUB</ThemedText>
            </Pressable>
          </>
        ) : (
          /* ── No-race state ── */
          <>
            <ThemedText style={heroStyles.nextLabel} themeColor="textSecondary">NEXT SESSION</ThemedText>

            {session && (
              <ThemedText style={heroStyles.nextEvent}>
                {session.location.toUpperCase()} GP · {session.session_name}
              </ThemedText>
            )}

            {/* Monospace countdown — Display Medium scale */}
            <View style={heroStyles.countdownBlock}>
              <ThemedText style={heroStyles.countdown}>{countdown}</ThemedText>
              <ThemedText style={heroStyles.countdownSub} themeColor="textSecondary">
                {session ? `until ${session.session_name}` : 'UNTIL LIGHTS OUT'}
              </ThemedText>
            </View>

            {/* Weather matrix (ambient) */}
            <View style={heroStyles.weatherMatrix}>
              {['FP1', 'FP2', 'FP3', 'QUALI', 'RACE'].map((s) => (
                <View key={s} style={[heroStyles.weatherCell, { backgroundColor: theme.background }]}>
                  <ThemedText style={heroStyles.weatherLabel} themeColor="textSecondary">{s}</ThemedText>
                  <ThemedText style={heroStyles.weatherIcon}>☁️</ThemedText>
                  <ThemedText style={heroStyles.weatherTemp} themeColor="textSecondary">—°C</ThemedText>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function getFlagBg(flag: string | null): string {
  switch (flag?.toUpperCase()) {
    case 'GREEN':  return '#22c55e20';
    case 'YELLOW': return '#eab30820';
    case 'RED':    return '#ef444420';
    case 'SC': case 'VSC': return '#f9731620';
    default: return '#ffffff10';
  }
}

function getFlagText(flag: string | null): string {
  switch (flag?.toUpperCase()) {
    case 'GREEN':  return '#22c55e';
    case 'YELLOW': return '#eab308';
    case 'RED':    return '#ef4444';
    case 'SC': case 'VSC': return '#f97316';
    default: return '#94a3b8';
  }
}

const heroStyles = StyleSheet.create({
  card: {
    borderRadius: M3Shape.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.35)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 8,
      },
    }),
  },
  accentLine: {
    height: 3,
    backgroundColor: '#E10600',
  },
  inner: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  // Live state
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#E10600',
  },
  flagPill: {
    borderRadius: M3Shape.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 'auto' as any,
  },
  flagText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  eventName: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1,
    lineHeight: 22,
  },
  ctaButton: {
    borderRadius: M3Shape.md,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  // No-race state
  nextLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  nextEvent: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 22,
  },
  countdownBlock: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.two,
  },
  countdown: {
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'] as any,
    color: '#E10600',
    lineHeight: 54,
    textAlign: 'center',
  },
  countdownSub: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
  },
  weatherMatrix: {
    flexDirection: 'row',
    gap: Spacing.one,
    flexWrap: 'wrap',
  },
  weatherCell: {
    flex: 1,
    minWidth: 48,
    borderRadius: M3Shape.sm,
    padding: Spacing.two,
    alignItems: 'center',
    gap: 2,
  },
  weatherLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
  weatherIcon: { fontSize: 14 },
  weatherTemp: { fontSize: 8, fontWeight: '600' },
});

// ─── Leaderboard Row ──────────────────────────────────────────────────────────

function LeaderboardRow({ entry, idx }: { entry: LeaderboardEntry; idx: number }) {
  const theme = useTheme();
  const pos = entry.position ?? idx + 1;
  const color = teamColorHex(entry.driver?.team_colour);
  const isTop3 = pos <= 3;

  return (
    <View style={[
      lbStyles.row,
      {
        backgroundColor: isTop3 ? color + '12' : theme.surfaceVariant,
        borderColor: isTop3 ? color + '60' : theme.outline,
      },
    ]}>
      {/* Team color accent strip */}
      <View style={[lbStyles.teamStrip, { backgroundColor: color }]} />

      {/* Position */}
      <View style={[lbStyles.posBadge, { backgroundColor: isTop3 ? color : theme.background }]}>
        <ThemedText style={[lbStyles.posText, { color: isTop3 ? '#000' : theme.textSecondary }]}>
          {pos}
        </ThemedText>
      </View>

      {/* Driver */}
      <View style={lbStyles.driverBlock}>
        <ThemedText style={[lbStyles.acronym, { color: isTop3 ? color : theme.text }]}>
          {entry.driver?.name_acronym ?? `#${entry.driver_number}`}
        </ThemedText>
        <ThemedText style={lbStyles.teamName} themeColor="textSecondary" numberOfLines={1}>
          {entry.driver?.team_name ?? '—'}
        </ThemedText>
      </View>

      {/* Compound badge */}
      <View style={[lbStyles.compBadge, {
        backgroundColor: compoundColor(entry.compound) + '25',
        borderColor: compoundColor(entry.compound),
      }]}>
        <ThemedText style={[lbStyles.compText, { color: compoundColor(entry.compound) }]}>
          {compoundAbbrev(entry.compound)}
        </ThemedText>
      </View>

      {/* Gap */}
      <ThemedText style={lbStyles.gap} themeColor="textSecondary">
        {entry.dnf ? 'DNF' : formatGap(entry.gap_to_leader, entry.position)}
      </ThemedText>
    </View>
  );
}

const lbStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: M3Shape.md,
    borderWidth: 1,
    overflow: 'hidden',
    height: 48,
    gap: Spacing.two,
  },
  teamStrip: {
    width: 3,
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  posBadge: {
    width: 28,
    height: 28,
    borderRadius: M3Shape.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.one,
    flexShrink: 0,
  },
  posText: {
    fontSize: 12,
    fontWeight: '800',
  },
  driverBlock: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  acronym: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  teamName: {
    fontSize: 9,
    letterSpacing: 0.2,
    lineHeight: 12,
  },
  compBadge: {
    borderRadius: M3Shape.xs,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexShrink: 0,
  },
  compText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  gap: {
    fontSize: 10,
    fontWeight: '600',
    width: 64,
    textAlign: 'right',
    paddingRight: Spacing.two,
    fontVariant: ['tabular-nums'] as any,
  },
});

// ─── Battle Card ──────────────────────────────────────────────────────────────

function BattleCard({ pair }: { pair: BattlePair }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push('/pitwall')}
      style={({ pressed }) => [
        battleStyles.card,
        {
          backgroundColor: theme.surfaceVariant,
          borderColor: theme.outline,
        },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 },
      ]}
    >
      {/* Label */}
      <ThemedText style={battleStyles.label} themeColor="textSecondary">{pair.label}</ThemedText>

      {/* Driver acronyms */}
      <View style={battleStyles.driverRow}>
        <ThemedText style={[battleStyles.acronym, { color: pair.colorA }]}>{pair.driverA}</ThemedText>
        <ThemedText style={battleStyles.vs} themeColor="textSecondary">vs</ThemedText>
        <ThemedText style={[battleStyles.acronym, { color: pair.colorB }]}>{pair.driverB}</ThemedText>
      </View>

      {/* Gap */}
      <View style={battleStyles.gapRow}>
        <ThemedText style={battleStyles.gap}>{pair.gap}</ThemedText>
        <ThemedText style={battleStyles.tapHint} themeColor="textSecondary">TAP FOR TELEMETRY →</ThemedText>
      </View>
    </Pressable>
  );
}

const battleStyles = StyleSheet.create({
  card: {
    borderRadius: M3Shape.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    width: 180,
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.2)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  label: {
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  acronym: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  vs: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  gapRow: {
    gap: 3,
  },
  gap: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E10600',
    letterSpacing: 0.5,
  },
  tapHint: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LiveTimingScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();

  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top + Spacing.three,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    ios: {
      paddingTop: insets.top + Spacing.three,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: 72,
      paddingBottom: Spacing.four,
    },
  });

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [raceControl, setRaceControl] = useState<RaceControlMessage[]>([]);
  const [showFull, setShowFull] = useState(false);
  const [countdown, setCountdown] = useState('--:--:--');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Countdown ticker ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || isLive) return;

    const tick = () => setCountdown(nextSessionCountdown(session));
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [session, isLive]);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      // Resolve active/upcoming session
      const sessionRes = await fetchWithRetry(
        `https://api.openf1.org/v1/sessions?year=${currentYear}`,
        3
      );
      if (!sessionRes.ok) throw new Error('Sessions fetch failed');
      const sessions: Session[] = await sessionRes.json();

      const now = new Date();
      // Active session: started and not yet ended
      const active = sessions.find(s => {
        const start = new Date(s.date_start);
        const end = s.date_end ? new Date(s.date_end) : null;
        return now >= start && (!end || now <= end);
      });
      // Next upcoming session
      const upcoming = sessions
        .filter(s => new Date(s.date_start) > now)
        .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())[0] ?? null;

      // Most recent past session
      const recent = sessions
        .filter(s => s.date_end && new Date(s.date_end) < now)
        .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())[0] ?? null;

      // Most recent past Race session for previous results post-mortem
      const recentRace = sessions
        .filter(s => s.session_type === 'Race' && s.date_end && new Date(s.date_end) < now)
        .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())[0] ?? null;

      const current = active ?? upcoming ?? recent;
      setSession(current);
      const live = !!active;
      setIsLive(live);

      if (!current) { setLoading(false); return; }

      // Fetch leaderboard from active session if live, or recentRace if not live
      const sk = live ? current.session_key : (recentRace?.session_key ?? current.session_key);

      const [posRes, driverRes, rcRes, resultsRes] = await Promise.allSettled([
        live ? fetchWithRetry(`https://api.openf1.org/v1/position?session_key=${sk}`, 2) : Promise.resolve(null),
        fetchWithRetry(`https://api.openf1.org/v1/drivers?session_key=${sk}`, 2),
        fetchWithRetry(`https://api.openf1.org/v1/race_control?session_key=${sk}`, 2),
        !live ? fetchWithRetry(`https://api.openf1.org/v1/session_result?session_key=${sk}`, 2) : Promise.resolve(null),
      ]);

      let positions: { driver_number: number; position: number | null; gap_to_leader: number | string | null; dnf?: boolean }[] = [];

      if (live) {
        if (posRes.status === 'fulfilled' && posRes.value && posRes.value.ok) {
          const raw = await posRes.value.json();
          // Latest per driver
          const latest = new Map<number, { driver_number: number; position: number; date: string }>();
          for (const p of raw) {
            const ex = latest.get(p.driver_number);
            if (!ex || p.date > ex.date) latest.set(p.driver_number, p);
          }
          positions = Array.from(latest.values())
            .sort((a, b) => a.position - b.position)
            .map(p => ({
              driver_number: p.driver_number,
              position: p.position,
              gap_to_leader: null,
            }));
        }
      } else {
        if (resultsRes.status === 'fulfilled' && resultsRes.value && resultsRes.value.ok) {
          const raw = await resultsRes.value.json();
          positions = raw
            .map((r: any) => ({
              driver_number: r.driver_number,
              position: r.position,
              gap_to_leader: r.gap_to_leader,
              dnf: r.dnf,
            }))
            .sort((a: any, b: any) => {
              if (a.position === null || a.position === undefined) return 1;
              if (b.position === null || b.position === undefined) return -1;
              return a.position - b.position;
            });
        }
      }

      let driversMap = new Map<number, Driver>();
      if (driverRes.status === 'fulfilled' && driverRes.value && driverRes.value.ok) {
        const raw: Driver[] = await driverRes.value.json();
        raw.forEach(d => driversMap.set(d.driver_number, d));
      }

      const board: LeaderboardEntry[] = positions.map((p, i) => ({
        position: p.position,
        driver_number: p.driver_number,
        driver: driversMap.get(p.driver_number),
        gap_to_leader: p.gap_to_leader,
        interval: null,
        compound: undefined,
        dnf: p.dnf,
      }));
      setLeaderboard(board);

      // Race control
      if (rcRes.status === 'fulfilled' && rcRes.value && rcRes.value.ok) {
        const rcData: RaceControlMessage[] = await rcRes.value.json();
        setRaceControl(rcData.slice(-5).reverse());
      }
    } catch (err) {
      console.warn('Home fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Focus polling ──────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      fetchData();
      pollRef.current = setInterval(fetchData, 30000);
      return () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };
    }, [fetchData])
  );

  // ── Toggle expand ──────────────────────────────────────────────────────────
  const toggleShowFull = useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.easeInEaseOut();
    }
    setShowFull(p => !p);
  }, []);

  const visibleLeaderboard = leaderboard.slice(0, showFull ? 20 : 5);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, contentPlatformStyle]}
      showsVerticalScrollIndicator={false}
    >
      <ThemedView style={styles.container}>

        {/* ── A: STATE-AWARE HERO ── */}
        {loading ? (
          <View style={styles.heroSkeleton}>
            <ActivityIndicator size="large" color="#E10600" />
          </View>
        ) : (
          <HeroCard
            session={session}
            isLive={isLive}
            countdown={countdown}
            raceControl={raceControl}
          />
        )}

        {/* ── B: TOP 5 GRID ── */}
        <ThemedView style={[styles.section, { backgroundColor: theme.surfaceVariant, borderColor: theme.outline }]}>
          {/* Section header */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionPip} />
            <ThemedText style={styles.sectionTitle}>
              {isLive ? 'LIVE TIMING' : 'LAST RESULTS'} · TOP {leaderboard.length > 0 ? Math.min(leaderboard.length, 5) : 5}
            </ThemedText>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveBadgeDot} />
                <ThemedText style={styles.liveBadgeText}>LIVE</ThemedText>
              </View>
            )}
            {leaderboard.length > 0 && (
              <ThemedText style={styles.totalCars} themeColor="textSecondary">
                {leaderboard.length} CARS
              </ThemedText>
            )}
          </View>

          {/* Leaderboard */}
          {loading ? (
            <View style={styles.lbSkeleton}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : leaderboard.length === 0 ? (
            <View style={styles.lbEmpty}>
              <ThemedText style={styles.lbEmptyText} themeColor="textSecondary">No timing data available</ThemedText>
            </View>
          ) : (
            <View style={styles.lbList}>
              {visibleLeaderboard.map((entry, idx) => (
                <LeaderboardRow key={entry.driver_number} entry={entry} idx={idx} />
              ))}
            </View>
          )}

          {/* Expand toggle */}
          {leaderboard.length > 5 && (
            <Pressable
              onPress={toggleShowFull}
              style={({ pressed }) => [
                styles.expandToggle,
                { borderColor: theme.outline },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText style={styles.expandToggleText} themeColor="textSecondary">
                {showFull
                  ? '▲ COLLAPSE TO TOP 5'
                  : `▼ VIEW FULL ${leaderboard.length}-CAR GRID`}
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {/* ── C: BATTLE TRACKER CAROUSEL ── */}
        <View style={styles.section2}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionPip} />
            <ThemedText style={styles.sectionTitle}>BATTLE TRACKER</ThemedText>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            decelerationRate="fast"
            snapToInterval={196}
          >
            {BATTLE_PAIRS.map((pair) => (
              <BattleCard key={pair.label} pair={pair} />
            ))}
          </ScrollView>
        </View>

        {/* ── Race Control Terminal (brief) ── */}
        {raceControl.length > 0 && (
          <ThemedView style={[styles.section, { backgroundColor: theme.surfaceVariant, borderColor: theme.outline }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionPip, { backgroundColor: '#eab308' }]} />
              <ThemedText style={styles.sectionTitle}>RACE CONTROL</ThemedText>
            </View>
            {raceControl.slice(0, 3).map((msg, i) => (
              <View key={i} style={styles.rcRow}>
                <View style={[styles.rcStrip, { backgroundColor: getFlagText(msg.flag) }]} />
                <ThemedText style={styles.rcMsg} numberOfLines={2}>{msg.message}</ThemedText>
              </View>
            ))}
          </ThemedView>
        )}

        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    alignItems: 'stretch',
  },

  // Hero skeleton
  heroSkeleton: {
    height: 220,
    borderRadius: M3Shape.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },

  // Section wrapper (Top 5)
  section: {
    borderRadius: M3Shape.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(0,0,0,0.2)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 4,
      },
    }),
  },

  // Section without background card (Battle carousel)
  section2: {
    gap: Spacing.two,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  sectionPip: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#E10600',
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    flex: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E1060015',
    borderRadius: M3Shape.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E10600',
  },
  liveBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#E10600',
  },
  totalCars: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Leaderboard
  lbSkeleton: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  lbEmpty: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
  lbEmptyText: {
    fontSize: 12,
  },
  lbList: {
    gap: Spacing.one,
  },

  // Expand toggle
  expandToggle: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  expandToggleText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Carousel
  carouselContent: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: 2,
    paddingBottom: Spacing.one,
  },

  // Race Control
  rcRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  rcStrip: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 14,
    borderRadius: 2,
    flexShrink: 0,
  },
  rcMsg: {
    fontSize: 10,
    lineHeight: 15,
    flex: 1,
  },
});
