/**
 * Pit Wall Hub — The Engine Room
 *
 * A high-density live session command center with two sub-views
 * toggled via an M3 Segmented Control:
 *
 *   A  Real-Time Track Map  — Live driver positions on circuit outline
 *   B  Timing Tower         — Full 20-driver matrix with S1/S2/S3 + tyre + pit log
 *
 * Data sources: OpenF1 API (/sessions, /drivers, /position, /laps, /pit, /race_control)
 * No car_data / engine telemetry is fetched — it is not available reliably during live events.
 */

import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircuitMap } from '@/components/circuit-map';
import { TimingTower, TimingDriver, PitStop } from '@/components/timing-tower';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import {
  BottomTabInset,
  M3Shape,
  MaxContentWidth,
  Spacing,
} from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';
import { apiCache, TTL } from '@/utils/api-cache';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubView = 'map' | 'timing';

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
}

interface Driver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
  headshot_url?: string;
}

interface RaceControlMsg {
  date: string;
  message: string;
  flag?: string;
  category?: string;
}

interface PositionEntry {
  driver_number: number;
  position: number;
  date: string;
}

interface LapData {
  driver_number: number;
  lap_number: number;
  duration_sector_1?: number | null;
  duration_sector_2?: number | null;
  duration_sector_3?: number | null;
  compound?: string;
  tyre_age_at_start?: number;
  lap_duration?: number;
  is_pit_out_lap?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLiveSession(s: Session | null): boolean {
  if (!s) return false;
  const now = new Date();
  const start = new Date(s.date_start);
  const end = s.date_end ? new Date(s.date_end) : null;
  return now >= start && (!end || now <= end);
}

function getFlagColor(flag?: string): string {
  if (!flag) return '#94a3b8';
  switch (flag.toUpperCase()) {
    case 'GREEN':  return '#22c55e';
    case 'YELLOW': return '#eab308';
    case 'RED':    return '#ef4444';
    case 'SC':     return '#f97316';
    case 'VSC':    return '#fb923c';
    case 'CHEQUERED': return '#ffffff';
    default: return '#94a3b8';
  }
}

// ─── Segmented Control ────────────────────────────────────────────────────────

function SegmentedControl({
  segments,
  active,
  onChange,
}: {
  segments: { key: SubView; label: string }[];
  active: SubView;
  onChange: (v: SubView) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[segStyles.container, { backgroundColor: theme.surfaceVariant, borderColor: theme.outline }]}>
      {segments.map((seg) => {
        const isActive = seg.key === active;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            style={({ pressed }) => [
              segStyles.segment,
              isActive && [segStyles.segmentActive, { backgroundColor: theme.background }],
              pressed && !isActive && { opacity: 0.7 },
            ]}
          >
            <ThemedText
              style={[
                segStyles.label,
                { color: isActive ? theme.primary : theme.textSecondary },
              ]}
            >
              {seg.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: M3Shape.md,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: M3Shape.sm,
  },
  segmentActive: {
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.25)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PitWallScreen() {
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

  // ── Sub-view state ─────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<SubView>('map');

  // ── Session data ───────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // ── Driver roster ──────────────────────────────────────────────────────────
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const driversMapRef = useRef<Map<number, Driver>>(new Map());

  // ── Race control messages ──────────────────────────────────────────────────
  const [raceControl, setRaceControl] = useState<RaceControlMsg[]>([]);

  // ── Position / lap / pit data ──────────────────────────────────────────────
  const [positionData, setPositionData] = useState<PositionEntry[]>([]);
  const [lapData, setLapData] = useState<LapData[]>([]);
  const [pitData, setPitData] = useState<PitStop[]>([]);
  const [timingDrivers, setTimingDrivers] = useState<TimingDriver[]>([]);

  // ── Polling refs ───────────────────────────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch current session ──────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          setSessionLoading(true);
          const cacheKey = 'pitwall_session';
          const cached = apiCache.get<Session>(cacheKey);
          if (cached) {
            setSession(cached);
            setSessionLoading(false);
            return;
          }

          const currentYear = new Date().getFullYear();
          const res = await fetchWithRetry(
            `https://api.openf1.org/v1/sessions?year=${currentYear}&session_type=Race`,
            3
          );
          if (!res.ok || cancelled) return;
          const all: Session[] = await res.json();
          if (cancelled) return;

          // Find the most recent session (latest date_start that has passed or is ongoing)
          const now = new Date();
          const past = all
            .filter(s => new Date(s.date_start) <= now)
            .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());

          const latest = past[0] ?? null;
          if (latest) {
            apiCache.set(cacheKey, latest, TTL.sessionMeta);
          }
          setSession(latest ?? null);
        } catch (err) {
          console.warn('Session fetch error:', err);
        } finally {
          if (!cancelled) setSessionLoading(false);
        }
      })();

      return () => { cancelled = true; };
    }, [])
  );

  // ── Fetch drivers when session changes ────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchWithRetry(
          `https://api.openf1.org/v1/drivers?session_key=${session.session_key}`,
          3
        );
        if (!res.ok || cancelled) return;
        const data: Driver[] = await res.json();
        if (cancelled) return;

        const sorted = [...data].sort((a, b) => a.name_acronym.localeCompare(b.name_acronym));
        setDrivers(sorted);

        const map = new Map<number, Driver>();
        sorted.forEach(d => map.set(d.driver_number, d));
        driversMapRef.current = map;
      } catch (err) {
        console.warn('Drivers fetch error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [session]);

  // ── Fetch race control ────────────────────────────────────────────────────
  const fetchRaceControl = useCallback(async () => {
    if (!session) return;
    try {
      const url = `https://api.openf1.org/v1/race_control?session_key=${session.session_key}`;
      const res = await fetchWithRetry(url, 2);
      if (!res.ok) return;
      const data: RaceControlMsg[] = await res.json();
      setRaceControl(data.slice(-5).reverse());
    } catch {}
  }, [session]);

  // ── Build timing tower data ────────────────────────────────────────────────
  const fetchTimingData = useCallback(async () => {
    if (!session) return;
    try {
      const sk = session.session_key;
      const isLive = isLiveSession(session);

      // For live sessions, only fetch the latest position entries (last 30s)
      const posUrl = isLive
        ? `https://api.openf1.org/v1/position?session_key=${sk}&date>${new Date(Date.now() - 30000).toISOString()}`
        : `https://api.openf1.org/v1/position?session_key=${sk}`;

      // For live sessions, only fetch recent laps (last 5 minutes) to avoid massive responses
      const lapUrl = isLive
        ? `https://api.openf1.org/v1/laps?session_key=${sk}&date_start>${new Date(Date.now() - 300000).toISOString()}`
        : `https://api.openf1.org/v1/laps?session_key=${sk}`;

      const [posRes, lapRes, pitRes] = await Promise.allSettled([
        fetchWithRetry(posUrl, 2),
        fetchWithRetry(lapUrl, 2),
        fetchWithRetry(`https://api.openf1.org/v1/pit?session_key=${sk}`, 2),
      ]);

      // Process positions
      let positions: PositionEntry[] = [];
      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const raw: PositionEntry[] = await posRes.value.json();
        // Latest position per driver
        const latest = new Map<number, PositionEntry>();
        for (const p of raw) {
          const existing = latest.get(p.driver_number);
          if (!existing || p.date > existing.date) latest.set(p.driver_number, p);
        }
        positions = Array.from(latest.values()).sort((a, b) => a.position - b.position);
        setPositionData(positions);
      }

      // Process laps
      let laps: LapData[] = [];
      if (lapRes.status === 'fulfilled' && lapRes.value.ok) {
        laps = await lapRes.value.json();
        setLapData(prev => {
          // For live sessions merge new laps on top of existing ones
          if (!isLive) return laps;
          const merged = new Map<string, LapData>();
          for (const l of prev) merged.set(`${l.driver_number}_${l.lap_number}`, l);
          for (const l of laps) merged.set(`${l.driver_number}_${l.lap_number}`, l);
          return Array.from(merged.values());
        });
        laps = laps; // keep local var for timing build
      }

      // Process pits
      let pits: PitStop[] = [];
      if (pitRes.status === 'fulfilled' && pitRes.value.ok) {
        pits = await pitRes.value.json();
        setPitData(pits);
      }

      // Build TimingDriver array using the full lapData state merged
      const allLaps = isLive
        ? (() => {
            const merged = new Map<string, LapData>();
            for (const l of lapData) merged.set(`${l.driver_number}_${l.lap_number}`, l);
            for (const l of laps) merged.set(`${l.driver_number}_${l.lap_number}`, l);
            return Array.from(merged.values());
          })()
        : laps;

      const latestLap = new Map<number, LapData>();
      for (const lap of allLaps) {
        const existing = latestLap.get(lap.driver_number);
        if (!existing || lap.lap_number > existing.lap_number) latestLap.set(lap.driver_number, lap);
      }

      const driverPits = new Map<number, PitStop[]>();
      for (const pit of pits) {
        const arr = driverPits.get(pit.driver_number) ?? [];
        arr.push(pit);
        driverPits.set(pit.driver_number, arr);
      }

      // If we have no position data yet, use drivers list as fallback
      const orderSource = positions.length > 0 ? positions : drivers.map((d, i) => ({
        driver_number: d.driver_number,
        position: i + 1,
        date: '',
      }));

      const timing: TimingDriver[] = orderSource.map((pos, i) => {
        const driver = driversMapRef.current.get(pos.driver_number);
        const lap = latestLap.get(pos.driver_number);
        const pitHistory = driverPits.get(pos.driver_number) ?? [];

        return {
          position: pos.position,
          driver_number: pos.driver_number,
          acronym: driver?.name_acronym ?? `#${pos.driver_number}`,
          teamColour: driver?.team_colour ?? '94a3b8',
          teamName: driver?.team_name ?? 'Unknown',
          gap: i === 0 ? 'LEADER' : '—',
          interval: '—',
          compound: lap?.compound ?? 'UNKNOWN',
          tyreAge: lap?.tyre_age_at_start != null ? lap.tyre_age_at_start : 0,
          lastLapTime: lap?.lap_duration ?? undefined,
          sectorTimes: lap ? {
            duration_sector_1: lap.duration_sector_1,
            duration_sector_2: lap.duration_sector_2,
            duration_sector_3: lap.duration_sector_3,
          } : undefined,
          pits: pitHistory,
        };
      });

      setTimingDrivers(timing);
    } catch (err) {
      console.warn('Timing data error:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, drivers, lapData]);

  // ── Poll on focus ─────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!session) return;

      fetchRaceControl();
      fetchTimingData();

      const interval = isLiveSession(session) ? 10000 : 0;
      if (interval > 0) {
        pollRef.current = setInterval(() => {
          fetchRaceControl();
          fetchTimingData();
        }, interval);
      }

      return () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, fetchRaceControl, fetchTimingData])
  );

  // ── Build drivers map for circuit map ─────────────────────────────────────
  const driversMapForMap = React.useMemo(() => {
    const m = new Map<number, { name_acronym: string; team_colour: string }>();
    drivers.forEach(d => m.set(d.driver_number, { name_acronym: d.name_acronym, team_colour: d.team_colour }));
    return m;
  }, [drivers]);

  // ── Session best sector times (from all lap data) ─────────────────────────
  const sessionBests = React.useMemo(() => {
    let s1 = Infinity, s2 = Infinity, s3 = Infinity;
    for (const lap of lapData) {
      if (lap.duration_sector_1 && lap.duration_sector_1 > 0) s1 = Math.min(s1, lap.duration_sector_1);
      if (lap.duration_sector_2 && lap.duration_sector_2 > 0) s2 = Math.min(s2, lap.duration_sector_2);
      if (lap.duration_sector_3 && lap.duration_sector_3 > 0) s3 = Math.min(s3, lap.duration_sector_3);
    }
    return {
      s1: s1 === Infinity ? undefined : s1,
      s2: s2 === Infinity ? undefined : s2,
      s3: s3 === Infinity ? undefined : s3,
    };
  }, [lapData]);

  // ── Render sub-views ──────────────────────────────────────────────────────

  const renderMapView = () => (
    <View style={styles.subViewContainer}>
      <CircuitMap
        sessionKey={session?.session_key ?? null}
        drivers={driversMapForMap}
        isLive={isLiveSession(session)}
      />

      {/* Race control feed */}
      {raceControl.length > 0 && (
        <ThemedView style={[styles.raceControlCard, { borderColor: theme.outline }]}>
          <View style={styles.cardTitleRow}>
            <View style={styles.rcDot} />
            <ThemedText style={styles.cardTitle}>RACE CONTROL</ThemedText>
          </View>
          {raceControl.map((msg, i) => (
            <View key={i} style={styles.rcRow}>
              <View style={[styles.rcFlag, { backgroundColor: getFlagColor(msg.flag) }]} />
              <ThemedText style={styles.rcTime} themeColor="textSecondary">
                {new Date(msg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </ThemedText>
              <ThemedText style={styles.rcMsg} themeColor="text" numberOfLines={2}>{msg.message}</ThemedText>
            </View>
          ))}
        </ThemedView>
      )}
    </View>
  );

  const renderTimingView = () => (
    <View style={styles.subViewContainer}>
      <TimingTower
        drivers={timingDrivers}
        sessionBests={sessionBests}
        isLive={isLiveSession(session)}
      />
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  const live = isLiveSession(session);

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      showsVerticalScrollIndicator={false}
    >
      <ThemedView style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.headerBlock}>
          <View style={styles.headerTitleRow}>
            <View style={styles.accentBar} />
            <View style={styles.headerTextBlock}>
              <ThemedText style={styles.screenTitle}>PIT WALL HUB</ThemedText>
              {session ? (
                <ThemedText style={styles.sessionLabel} themeColor="textSecondary">
                  {session.location.toUpperCase()} · {session.session_name.toUpperCase()} · {session.year}
                </ThemedText>
              ) : sessionLoading ? (
                <ThemedText style={styles.sessionLabel} themeColor="textSecondary">Loading session…</ThemedText>
              ) : (
                <ThemedText style={styles.sessionLabel} themeColor="textSecondary">No session available</ThemedText>
              )}
            </View>

            {live && (
              <View style={styles.liveBadge}>
                <View style={styles.livePulse} />
                <ThemedText style={styles.liveText}>LIVE</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* ── Segmented control ── */}
        <SegmentedControl
          segments={[
            { key: 'map',    label: 'MAP' },
            { key: 'timing', label: 'TIMING' },
          ]}
          active={activeView}
          onChange={setActiveView}
        />

        {/* ── Sub-view content ── */}
        {sessionLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText style={styles.loadingText} themeColor="textSecondary">Connecting to session…</ThemedText>
          </View>
        ) : !session ? (
          <View style={styles.loadingCenter}>
            <SymbolView name={{ ios: 'antenna.radiowaves.left.and.right', android: 'wifi_off', web: 'wifi_off' }} size={40} tintColor={theme.outline} />
            <ThemedText style={styles.loadingText} themeColor="textSecondary">No active session found</ThemedText>
          </View>
        ) : (
          <>
            {activeView === 'map'    && renderMapView()}
            {activeView === 'timing' && renderTimingView()}
          </>
        )}

        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  contentContainer: {
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

  // Header
  headerBlock: { paddingTop: Spacing.four },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  accentBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
    backgroundColor: '#E10600',
  },
  headerTextBlock: { flex: 1, gap: 2 },
  screenTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sessionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    lineHeight: 16,
  },

  // Live badge
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E1060018',
    borderRadius: M3Shape.sm,
    borderWidth: 1,
    borderColor: '#E1060050',
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
  },
  livePulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E10600',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#E10600',
  },

  // Sub-view container
  subViewContainer: { gap: Spacing.three },

  // Race control
  raceControlCard: {
    borderRadius: M3Shape.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    ...cardShadow({ opacity: 0.15, radius: 8, offsetY: 2, elevation: 2 }),
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  rcDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E10600',
  },
  cardTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#E10600',
  },
  rcRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rcFlag: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
    minHeight: 14,
    flexShrink: 0,
  },
  rcTime: {
    fontSize: 9,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 0.3,
    flexShrink: 0,
    marginTop: 1,
  },
  rcMsg: {
    fontSize: 10,
    lineHeight: 15,
    flex: 1,
  },

  // Loading
  loadingCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    gap: Spacing.three,
  },
  loadingText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
