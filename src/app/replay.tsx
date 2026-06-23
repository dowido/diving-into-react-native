/**
 * Lap Times Screen
 *
 * Browse any past (or recent) session and view a driver's full lap-by-lap breakdown:
 *   - Lap time
 *   - Sector 1 / 2 / 3 times (colour-coded: purple = session best, green = personal best)
 *   - Tyre compound + age at start of stint
 *   - Pit stop laps highlighted
 *
 * Data sources: OpenF1 API (/sessions, /drivers, /laps, /pit)
 * No car_data / engine telemetry is fetched — only /laps which is reliably available.
 */

import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, M3Shape, MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
  gmt_offset?: string;
}

interface Driver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

interface LapData {
  lap_number: number;
  lap_duration?: number | null;
  duration_sector_1?: number | null;
  duration_sector_2?: number | null;
  duration_sector_3?: number | null;
  compound?: string | null;
  tyre_age_at_start?: number | null;
  is_pit_out_lap?: boolean;
  date_start?: string;
}

interface PitStop {
  lap_number: number;
  pit_duration?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3);
  return `${m}:${s.padStart(6, '0')}`;
}

function formatSector(s: number | null | undefined): string {
  if (s == null || s <= 0) return '—';
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = (abs % 60).toFixed(3);
  return m > 0 ? `${m}:${sec.padStart(6, '0')}` : sec;
}

function tyreColor(compound: string | null | undefined): string {
  switch (compound?.toUpperCase()) {
    case 'SOFT':         return '#ef4444';
    case 'MEDIUM':       return '#eab308';
    case 'HARD':         return '#e2e8f0';
    case 'INTERMEDIATE': return '#22c55e';
    case 'WET':          return '#3b82f6';
    default:             return '#64748b';
  }
}

function tyreAbbrev(compound: string | null | undefined): string {
  switch (compound?.toUpperCase()) {
    case 'SOFT':         return 'S';
    case 'MEDIUM':       return 'M';
    case 'HARD':         return 'H';
    case 'INTERMEDIATE': return 'I';
    case 'WET':          return 'W';
    default:             return '?';
  }
}

type SectorFlag = 'purple' | 'green' | 'yellow' | 'none';

function getSectorFlag(
  time: number | null | undefined,
  sessionBest: number | undefined,
  personalBest: number | undefined,
): SectorFlag {
  if (time == null || time <= 0) return 'none';
  if (sessionBest != null && Math.abs(time - sessionBest) < 0.001) return 'purple';
  if (personalBest != null && Math.abs(time - personalBest) < 0.001) return 'green';
  return 'yellow';
}

function sectorBg(flag: SectorFlag): string {
  switch (flag) {
    case 'purple': return 'rgba(168,85,247,0.18)';
    case 'green':  return 'rgba(34,197,94,0.18)';
    case 'yellow': return 'rgba(234,179,8,0.18)';
    default:       return 'rgba(255,255,255,0.04)';
  }
}

function sectorFg(flag: SectorFlag, fallback: string): string {
  switch (flag) {
    case 'purple': return '#a855f7';
    case 'green':  return '#22c55e';
    case 'yellow': return '#eab308';
    default:       return fallback;
  }
}

// ─── Session best & personal best computation ────────────────────────────────

function computeBests(laps: LapData[]) {
  let s1 = Infinity, s2 = Infinity, s3 = Infinity, lap = Infinity;
  for (const l of laps) {
    if (l.duration_sector_1 && l.duration_sector_1 > 0) s1 = Math.min(s1, l.duration_sector_1);
    if (l.duration_sector_2 && l.duration_sector_2 > 0) s2 = Math.min(s2, l.duration_sector_2);
    if (l.duration_sector_3 && l.duration_sector_3 > 0) s3 = Math.min(s3, l.duration_sector_3);
    if (l.lap_duration && l.lap_duration > 0) lap = Math.min(lap, l.lap_duration);
  }
  return {
    s1: s1 === Infinity ? undefined : s1,
    s2: s2 === Infinity ? undefined : s2,
    s3: s3 === Infinity ? undefined : s3,
    lap: lap === Infinity ? undefined : lap,
  };
}

// ─── Lap Row ──────────────────────────────────────────────────────────────────

function LapRow({
  lap,
  sessionBests,
  personalBests,
  isPit,
  teamColor,
}: {
  lap: LapData;
  sessionBests: ReturnType<typeof computeBests>;
  personalBests: ReturnType<typeof computeBests>;
  isPit: boolean;
  teamColor: string;
}) {
  const theme = useTheme();

  const lapFlag: SectorFlag =
    lap.lap_duration && lap.lap_duration > 0
      ? getSectorFlag(lap.lap_duration, sessionBests.lap, personalBests.lap)
      : 'none';
  const s1Flag = getSectorFlag(lap.duration_sector_1, sessionBests.s1, personalBests.s1);
  const s2Flag = getSectorFlag(lap.duration_sector_2, sessionBests.s2, personalBests.s2);
  const s3Flag = getSectorFlag(lap.duration_sector_3, sessionBests.s3, personalBests.s3);

  const rowBg = lap.is_pit_out_lap
    ? 'rgba(234,179,8,0.06)'
    : isPit
    ? 'rgba(99,102,241,0.08)'
    : 'transparent';

  return (
    <View style={[lapRowStyles.row, { backgroundColor: rowBg, borderBottomColor: theme.outline }]}>
      {/* Lap number */}
      <View style={[lapRowStyles.lapNumBox, { backgroundColor: theme.surfaceVariant }]}>
        <ThemedText style={lapRowStyles.lapNum}>
          {lap.lap_number}
        </ThemedText>
        {isPit && (
          <View style={[lapRowStyles.pitDot, { backgroundColor: '#6366f1' }]} />
        )}
      </View>

      {/* Tyre */}
      <View style={[
        lapRowStyles.tyreBadge,
        { backgroundColor: tyreColor(lap.compound) + '28', borderColor: tyreColor(lap.compound) },
      ]}>
        <ThemedText style={[lapRowStyles.tyreText, { color: tyreColor(lap.compound) }]}>
          {tyreAbbrev(lap.compound)}
        </ThemedText>
        {(lap.tyre_age_at_start ?? 0) > 0 && (
          <ThemedText style={[lapRowStyles.tyreAge, { color: tyreColor(lap.compound) }]}>
            {lap.tyre_age_at_start}
          </ThemedText>
        )}
      </View>

      {/* Lap time */}
      <View style={[lapRowStyles.timeCell, { backgroundColor: sectorBg(lapFlag) }]}>
        <ThemedText style={[lapRowStyles.timeText, { color: sectorFg(lapFlag, theme.text) }]}>
          {formatLapTime(lap.lap_duration)}
        </ThemedText>
      </View>

      {/* S1 */}
      <View style={[lapRowStyles.sectorCell, { backgroundColor: sectorBg(s1Flag) }]}>
        <ThemedText style={[lapRowStyles.sectorText, { color: sectorFg(s1Flag, theme.textSecondary) }]}>
          {formatSector(lap.duration_sector_1)}
        </ThemedText>
      </View>

      {/* S2 */}
      <View style={[lapRowStyles.sectorCell, { backgroundColor: sectorBg(s2Flag) }]}>
        <ThemedText style={[lapRowStyles.sectorText, { color: sectorFg(s2Flag, theme.textSecondary) }]}>
          {formatSector(lap.duration_sector_2)}
        </ThemedText>
      </View>

      {/* S3 */}
      <View style={[lapRowStyles.sectorCell, { backgroundColor: sectorBg(s3Flag) }]}>
        <ThemedText style={[lapRowStyles.sectorText, { color: sectorFg(s3Flag, theme.textSecondary) }]}>
          {formatSector(lap.duration_sector_3)}
        </ThemedText>
      </View>
    </View>
  );
}

const lapRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    gap: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lapNumBox: {
    width: 28,
    height: 22,
    borderRadius: M3Shape.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  lapNum: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    fontVariant: ['tabular-nums'] as any,
  },
  pitDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tyreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: M3Shape.xs,
    borderWidth: 1.5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    flexShrink: 0,
    minWidth: 26,
    justifyContent: 'center',
  },
  tyreText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  tyreAge: {
    fontSize: 7.5,
    fontWeight: '600',
    opacity: 0.8,
  },
  timeCell: {
    flex: 1.3,
    borderRadius: M3Shape.xs,
    paddingHorizontal: 4,
    paddingVertical: 3,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 0.2,
  },
  sectorCell: {
    flex: 1,
    borderRadius: M3Shape.xs,
    paddingHorizontal: 3,
    paddingVertical: 3,
    alignItems: 'center',
  },
  sectorText: {
    fontSize: 8.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 0.2,
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function LapTimesScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();

  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    ios: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.five,
      paddingBottom: Spacing.four,
    },
  });

  // ── Session / driver selection ────────────────────────────────────────────
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const [driversLoading, setDriversLoading] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  // ── Lap data ──────────────────────────────────────────────────────────────
  const [lapsLoading, setLapsLoading] = useState(false);
  const [laps, setLaps] = useState<LapData[]>([]);
  const [pits, setPits] = useState<PitStop[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Mobile modals ─────────────────────────────────────────────────────────
  const [sessionPickerVisible, setSessionPickerVisible] = useState(false);
  const [driverPickerVisible, setDriverPickerVisible] = useState(false);

  // ── Fetch sessions on first focus ────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (sessions.length > 0) return;
      let cancelled = false;
      (async () => {
        try {
          setSessionsLoading(true);
          const r2026 = await fetchWithRetry('https://api.openf1.org/v1/sessions?year=2026');
          const data2026: Session[] = r2026.ok ? await r2026.json() : [];

          const r2025 = await fetchWithRetry('https://api.openf1.org/v1/sessions?year=2025');
          const data2025: Session[] = r2025.ok ? await r2025.json() : [];

          if (cancelled) return;
          const allSessions = [...data2026, ...data2025];
          const now = new Date();
          const past = allSessions
            .filter((s) => s.date_end && new Date(s.date_end) < now)
            .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());

          setSessions(past);
          if (past.length > 0) setSelectedSession(past[0]);
        } catch (err) {
          console.warn('Session fetch error:', err);
        } finally {
          if (!cancelled) setSessionsLoading(false);
        }
      })();
      return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessions.length])
  );

  // ── Fetch drivers when session changes ────────────────────────────────────
  useEffect(() => {
    if (!selectedSession) return;
    let cancelled = false;
    (async () => {
      try {
        setDriversLoading(true);
        setDrivers([]);
        setSelectedDriver(null);
        setLaps([]);
        setPits([]);

        const res = await fetchWithRetry(
          `https://api.openf1.org/v1/drivers?session_key=${selectedSession.session_key}`
        );
        if (!res.ok) throw new Error('Drivers fetch failed');
        const data: Driver[] = await res.json();
        if (cancelled) return;

        const sorted = [...data].sort((a, b) => a.name_acronym.localeCompare(b.name_acronym));
        setDrivers(sorted);
        if (sorted.length > 0) setSelectedDriver(sorted[0]);
      } catch (err) {
        console.warn('Drivers fetch error:', err);
      } finally {
        if (!cancelled) setDriversLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSession]);

  // ── Load laps when driver / session changes ───────────────────────────────
  const loadLaps = useCallback(async () => {
    if (!selectedSession || !selectedDriver) return;
    setLapsLoading(true);
    setLoadError(null);
    setLaps([]);
    setPits([]);

    try {
      const sk = selectedSession.session_key;
      const dn = selectedDriver.driver_number;

      const [lapRes, pitRes] = await Promise.allSettled([
        fetchWithRetry(`https://api.openf1.org/v1/laps?session_key=${sk}&driver_number=${dn}`),
        fetchWithRetry(`https://api.openf1.org/v1/pit?session_key=${sk}&driver_number=${dn}`),
      ]);

      let lapData: LapData[] = [];
      if (lapRes.status === 'fulfilled' && lapRes.value.ok) {
        lapData = await lapRes.value.json();
        lapData.sort((a, b) => a.lap_number - b.lap_number);
      }

      let pitData: PitStop[] = [];
      if (pitRes.status === 'fulfilled' && pitRes.value.ok) {
        pitData = await pitRes.value.json();
      }

      if (lapData.length === 0) {
        setLoadError('No lap data available for this session / driver.');
      } else {
        setLaps(lapData);
        setPits(pitData);
      }
    } catch (err) {
      console.warn('Laps load error:', err);
      setLoadError('Failed to load lap data. Please try again.');
    } finally {
      setLapsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, selectedDriver]);

  useEffect(() => {
    if (selectedDriver && selectedSession) {
      loadLaps();
    }
  }, [selectedDriver, selectedSession, loadLaps]);

  // ── Derived values ────────────────────────────────────────────────────────
  const teamColor = selectedDriver?.team_colour
    ? `#${selectedDriver.team_colour}`
    : theme.neonTeal;

  const sessionBests = computeBests(laps);
  const personalBests = computeBests(laps); // same driver — all laps are personal

  const pitLapNumbers = new Set(pits.map(p => p.lap_number));

  // Fastest lap number
  const fastestLap = laps.reduce<LapData | null>((best, lap) => {
    if (!lap.lap_duration || lap.lap_duration <= 0) return best;
    if (!best || !best.lap_duration || lap.lap_duration < best.lap_duration) return lap;
    return best;
  }, null);

  // Stats
  const validLaps = laps.filter(l => l.lap_duration && l.lap_duration > 0);
  const avgLap = validLaps.length > 0
    ? validLaps.reduce((sum, l) => sum + (l.lap_duration ?? 0), 0) / validLaps.length
    : null;

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderSessionSelector = () => (
    <ThemedView
      style={[
        styles.pickerCard,
        { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
      ]}
    >
      <View style={[styles.cardAccentBar, { backgroundColor: theme.cosmicIndigo }]} />
      <View style={styles.pickerHeader}>
        <SymbolView
          name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
          size={14}
          tintColor={theme.cosmicIndigo}
        />
        <ThemedText type="smallBold" style={styles.pickerTitle} themeColor="text">
          SESSION
        </ThemedText>
      </View>

      {sessionsLoading ? (
        <ActivityIndicator size="small" color={theme.cosmicIndigo} style={{ marginTop: 8, marginBottom: 12 }} />
      ) : (
        <Pressable
          onPress={() => setSessionPickerVisible(true)}
          style={({ pressed }) => [
            styles.selectorBtn,
            { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundElement },
            pressed && { opacity: 0.7 },
          ]}
        >
          {selectedSession ? (
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold" themeColor="text" numberOfLines={1}>
                {selectedSession.location.toUpperCase()} GP — {selectedSession.session_name}
              </ThemedText>
              <ThemedText type="code" style={styles.selectorSub} themeColor="textSecondary">
                {selectedSession.circuit_short_name} · {selectedSession.year}
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="code" themeColor="textSecondary">Select a session…</ThemedText>
          )}
          <SymbolView
            name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
            size={13}
            tintColor={theme.textSecondary}
          />
        </Pressable>
      )}
    </ThemedView>
  );

  const renderDriverSelector = () => (
    <ThemedView
      style={[
        styles.pickerCard,
        { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
      ]}
    >
      <View style={[styles.cardAccentBar, { backgroundColor: teamColor }]} />
      <View style={styles.pickerHeader}>
        <SymbolView
          name={{ ios: 'person.fill', android: 'person', web: 'person' }}
          size={14}
          tintColor={teamColor}
        />
        <ThemedText type="smallBold" style={styles.pickerTitle} themeColor="text">
          DRIVER
        </ThemedText>
      </View>

      {driversLoading ? (
        <ActivityIndicator size="small" color={teamColor} style={{ marginTop: 8, marginBottom: 12 }} />
      ) : (
        <Pressable
          onPress={() => drivers.length > 0 && setDriverPickerVisible(true)}
          style={({ pressed }) => [
            styles.selectorBtn,
            { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundElement },
            pressed && { opacity: 0.7 },
            drivers.length === 0 && { opacity: 0.5 },
          ]}
        >
          {selectedDriver ? (
            <View style={{ flex: 1 }}>
              <View style={styles.driverRow}>
                <View style={[styles.driverDot, { backgroundColor: teamColor }]} />
                <ThemedText type="smallBold" themeColor="text">
                  {selectedDriver.name_acronym}
                </ThemedText>
                <ThemedText type="code" themeColor="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                  {selectedDriver.full_name}
                </ThemedText>
              </View>
              <ThemedText type="code" style={styles.selectorSub} themeColor="textSecondary">
                {selectedDriver.team_name}
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="code" themeColor="textSecondary">
              {selectedSession ? 'Select a driver…' : 'Choose a session first'}
            </ThemedText>
          )}
          <SymbolView
            name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
            size={13}
            tintColor={theme.textSecondary}
          />
        </Pressable>
      )}
    </ThemedView>
  );

  const renderStatsBar = () => {
    if (laps.length === 0) return null;
    return (
      <View style={[styles.statsBar, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
        <View style={styles.statItem}>
          <ThemedText style={styles.statLabel} themeColor="textSecondary">LAPS</ThemedText>
          <ThemedText style={[styles.statValue, { color: teamColor }]}>{laps.length}</ThemedText>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.backgroundElement }]} />
        <View style={styles.statItem}>
          <ThemedText style={styles.statLabel} themeColor="textSecondary">FASTEST</ThemedText>
          <ThemedText style={[styles.statValue, { color: '#a855f7' }]}>
            {formatLapTime(fastestLap?.lap_duration)}
          </ThemedText>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.backgroundElement }]} />
        <View style={styles.statItem}>
          <ThemedText style={styles.statLabel} themeColor="textSecondary">AVERAGE</ThemedText>
          <ThemedText style={[styles.statValue, { color: theme.text }]}>
            {formatLapTime(avgLap)}
          </ThemedText>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.backgroundElement }]} />
        <View style={styles.statItem}>
          <ThemedText style={styles.statLabel} themeColor="textSecondary">PITS</ThemedText>
          <ThemedText style={[styles.statValue, { color: '#6366f1' }]}>{pits.length}</ThemedText>
        </View>
      </View>
    );
  };

  const renderLapTable = () => {
    if (lapsLoading) {
      return (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={teamColor} />
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingLabel}>
            Loading laps…
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingSubLabel}>
            {selectedDriver?.name_acronym} · {selectedSession?.session_name}
          </ThemedText>
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={styles.loadingCard}>
          <SymbolView
            name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
            size={32}
            tintColor={theme.solarAmber}
          />
          <ThemedText type="code" themeColor="textSecondary" style={[styles.loadingLabel, { textAlign: 'center' }]}>
            {loadError}
          </ThemedText>
          <Pressable
            onPress={loadLaps}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: theme.cosmicIndigo },
              pressed && { opacity: 0.8 },
            ]}
          >
            <ThemedText type="smallBold" style={{ color: '#fff', fontSize: 11 }}>RETRY</ThemedText>
          </Pressable>
        </View>
      );
    }

    if (laps.length === 0 || !selectedDriver) {
      return (
        <View style={styles.loadingCard}>
          <SymbolView
            name={{ ios: 'stopwatch', android: 'timer', web: 'timer' }}
            size={36}
            tintColor={theme.backgroundElement}
          />
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingLabel}>
            Select a session and driver to view lap times
          </ThemedText>
        </View>
      );
    }

    return (
      <ThemedView
        style={[
          styles.tableCard,
          { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
        ]}
      >
        <View style={[styles.tableStripe, { backgroundColor: teamColor }]} />

        {/* Table header */}
        <View style={[styles.tableHeaderRow, { borderBottomColor: theme.backgroundElement }]}>
          <ThemedText style={[styles.tableHeaderCell, { width: 28 }]} themeColor="textSecondary">LAP</ThemedText>
          <ThemedText style={[styles.tableHeaderCell, { width: 30 }]} themeColor="textSecondary">TYR</ThemedText>
          <ThemedText style={[styles.tableHeaderCell, { flex: 1.3 }]} themeColor="textSecondary">TIME</ThemedText>
          <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]} themeColor="textSecondary">S1</ThemedText>
          <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]} themeColor="textSecondary">S2</ThemedText>
          <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]} themeColor="textSecondary">S3</ThemedText>
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          {[
            { color: '#a855f7', label: 'Session best' },
            { color: '#22c55e', label: 'Personal best' },
            { color: '#eab308', label: 'Other' },
            { color: '#6366f1', label: 'Pit lap' },
          ].map(({ color, label }) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <ThemedText style={styles.legendLabel} themeColor="textSecondary">{label}</ThemedText>
            </View>
          ))}
        </View>

        {/* Lap rows */}
        {laps.map((lap) => (
          <LapRow
            key={lap.lap_number}
            lap={lap}
            sessionBests={sessionBests}
            personalBests={personalBests}
            isPit={pitLapNumbers.has(lap.lap_number)}
            teamColor={teamColor}
          />
        ))}
      </ThemedView>
    );
  };

  // ── Pickers ───────────────────────────────────────────────────────────────

  const renderSessionPicker = () => (
    <Modal
      animationType="slide"
      transparent
      visible={sessionPickerVisible}
      onRequestClose={() => setSessionPickerVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
          <View style={[styles.modalHandle, { backgroundColor: theme.backgroundElement }]} />
          <View style={styles.modalHeaderRow}>
            <ThemedText type="smallBold" themeColor="text">SELECT SESSION</ThemedText>
            <Pressable
              onPress={() => setSessionPickerVisible(false)}
              style={({ pressed }) => [styles.closeBtn, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}
            >
              <ThemedText type="code" style={styles.closeBtnText} themeColor="text">CLOSE</ThemedText>
            </Pressable>
          </View>
          <ScrollView style={styles.pickerList} nestedScrollEnabled>
            {sessions.map((sess) => {
              const isSelected = sess.session_key === selectedSession?.session_key;
              return (
                <Pressable
                  key={sess.session_key}
                  onPress={() => { setSelectedSession(sess); setSessionPickerVisible(false); }}
                  style={({ pressed }) => [
                    styles.pickerItem,
                    { borderBottomColor: theme.backgroundElement },
                    isSelected && { backgroundColor: theme.backgroundSelected },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" themeColor={isSelected ? 'cosmicIndigo' : 'text'} numberOfLines={1}>
                      {sess.location.toUpperCase()} GP — {sess.session_name}
                    </ThemedText>
                    <ThemedText type="code" style={styles.pickerItemSub} themeColor="textSecondary">
                      {sess.circuit_short_name} · {sess.year}
                    </ThemedText>
                  </View>
                  {isSelected && (
                    <SymbolView
                      name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                      size={16}
                      tintColor={theme.cosmicIndigo}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderDriverPicker = () => (
    <Modal
      animationType="slide"
      transparent
      visible={driverPickerVisible}
      onRequestClose={() => setDriverPickerVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
          <View style={[styles.modalHandle, { backgroundColor: theme.backgroundElement }]} />
          <View style={styles.modalHeaderRow}>
            <ThemedText type="smallBold" themeColor="text">SELECT DRIVER</ThemedText>
            <Pressable
              onPress={() => setDriverPickerVisible(false)}
              style={({ pressed }) => [styles.closeBtn, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}
            >
              <ThemedText type="code" style={styles.closeBtnText} themeColor="text">CLOSE</ThemedText>
            </Pressable>
          </View>
          <ScrollView style={styles.pickerList} nestedScrollEnabled>
            {drivers.map((driver) => {
              const isSelected = driver.driver_number === selectedDriver?.driver_number;
              const drvColor = driver.team_colour ? `#${driver.team_colour}` : theme.neonTeal;
              return (
                <Pressable
                  key={driver.driver_number}
                  onPress={() => { setSelectedDriver(driver); setDriverPickerVisible(false); }}
                  style={({ pressed }) => [
                    styles.pickerItem,
                    { borderBottomColor: theme.backgroundElement },
                    isSelected && { backgroundColor: theme.backgroundSelected },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={[styles.driverColorBar, { backgroundColor: drvColor }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.driverRow}>
                      <ThemedText type="smallBold" style={{ color: drvColor }}>{driver.name_acronym}</ThemedText>
                      <ThemedText type="code" themeColor="text" numberOfLines={1}>{driver.full_name}</ThemedText>
                    </View>
                    <ThemedText type="code" style={styles.pickerItemSub} themeColor="textSecondary">
                      {driver.team_name}
                    </ThemedText>
                  </View>
                  {isSelected && (
                    <SymbolView
                      name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                      size={16}
                      tintColor={drvColor}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Web inline lists
  const renderWebSessionList = () => (
    <ThemedView style={[styles.webListCard, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
      <View style={[styles.cardAccentBar, { backgroundColor: theme.cosmicIndigo }]} />
      <View style={styles.pickerHeader}>
        <SymbolView name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} size={14} tintColor={theme.cosmicIndigo} />
        <ThemedText type="smallBold" style={styles.pickerTitle} themeColor="text">SESSIONS</ThemedText>
        <ThemedText type="code" style={styles.pickerCount} themeColor="textSecondary">{sessions.length}</ThemedText>
      </View>
      {sessionsLoading ? (
        <View style={styles.listLoading}><ActivityIndicator size="small" color={theme.cosmicIndigo} /></View>
      ) : (
        <ScrollView style={styles.webList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {sessions.map((sess) => {
            const isSelected = sess.session_key === selectedSession?.session_key;
            return (
              <Pressable
                key={sess.session_key}
                onPress={() => setSelectedSession(sess)}
                style={({ pressed }) => [
                  styles.webListItem,
                  { borderBottomColor: theme.backgroundElement },
                  isSelected && { backgroundColor: theme.backgroundSelected },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold" style={isSelected ? { color: theme.cosmicIndigo } : undefined} themeColor={isSelected ? undefined : 'text'} numberOfLines={1}>
                    {sess.location.toUpperCase()} — {sess.session_name}
                  </ThemedText>
                  <ThemedText type="code" style={styles.webListItemSub} themeColor="textSecondary">
                    {sess.circuit_short_name} · {sess.year}
                  </ThemedText>
                </View>
                {isSelected && <View style={[styles.selectedDot, { backgroundColor: theme.cosmicIndigo }]} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </ThemedView>
  );

  const renderWebDriverList = () => (
    <ThemedView style={[styles.webListCard, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
      <View style={[styles.cardAccentBar, { backgroundColor: teamColor }]} />
      <View style={styles.pickerHeader}>
        <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={14} tintColor={teamColor} />
        <ThemedText type="smallBold" style={styles.pickerTitle} themeColor="text">DRIVERS</ThemedText>
        <ThemedText type="code" style={styles.pickerCount} themeColor="textSecondary">{drivers.length}</ThemedText>
      </View>
      {driversLoading ? (
        <View style={styles.listLoading}><ActivityIndicator size="small" color={teamColor} /></View>
      ) : (
        <ScrollView style={styles.webList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {drivers.map((driver) => {
            const isSelected = driver.driver_number === selectedDriver?.driver_number;
            const drvColor = driver.team_colour ? `#${driver.team_colour}` : theme.neonTeal;
            return (
              <Pressable
                key={driver.driver_number}
                onPress={() => setSelectedDriver(driver)}
                style={({ pressed }) => [
                  styles.webListItem,
                  { borderBottomColor: theme.backgroundElement },
                  isSelected && { backgroundColor: theme.backgroundSelected },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={[styles.driverColorBar, { backgroundColor: drvColor }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.driverRow}>
                    <ThemedText type="smallBold" style={{ color: drvColor, fontSize: 11 }}>{driver.name_acronym}</ThemedText>
                    <ThemedText type="code" themeColor="text" numberOfLines={1} style={{ fontSize: 11 }}>{driver.full_name}</ThemedText>
                  </View>
                  <ThemedText type="code" style={styles.webListItemSub} themeColor="textSecondary">{driver.team_name}</ThemedText>
                </View>
                {isSelected && <View style={[styles.selectedDot, { backgroundColor: drvColor }]} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </ThemedView>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
    >
      <ThemedView style={styles.container}>

        {/* ── Hero header ── */}
        <ThemedView style={styles.heroSection}>
          <View style={styles.accentBar} />
          <ThemedText type="subtitle" style={styles.heroTitle} themeColor="text">
            LAP TIMES
          </ThemedText>
          <ThemedText style={styles.heroSubtitle} themeColor="textSecondary">
            Sector times, lap times &amp; tyre data — session by session
          </ThemedText>
        </ThemedView>

        {/* ── MOBILE layout ── */}
        {Platform.OS !== 'web' && (
          <>
            {renderSessionSelector()}
            {renderDriverSelector()}
            {renderStatsBar()}
            {renderLapTable()}
            {renderSessionPicker()}
            {renderDriverPicker()}
          </>
        )}

        {/* ── WEB layout ── */}
        {Platform.OS === 'web' && (
          <View style={styles.webLayout}>
            <View style={styles.webLeftCol}>
              {renderWebSessionList()}
              {renderWebDriverList()}
              {renderStatsBar()}
            </View>
            <View style={styles.webRightCol}>
              {renderLapTable()}
            </View>
          </View>
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
    gap: Spacing.four,
    alignItems: 'stretch',
  },

  // Hero
  heroSection: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    gap: 4,
  },
  accentBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ff1801',
    marginBottom: Spacing.one,
  },
  heroTitle: {
    fontWeight: 'bold',
    letterSpacing: 1.5,
    fontSize: 22,
  },
  heroSubtitle: {
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // Web layout
  webLayout: {
    flexDirection: 'row',
    gap: Spacing.four,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  webLeftCol: {
    flex: 1,
    minWidth: 240,
    maxWidth: 280,
    gap: Spacing.three,
  },
  webRightCol: {
    flex: 2,
    minWidth: 320,
  },

  // Picker cards
  pickerCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingTop: 0,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.15, radius: 10, offsetY: 4, elevation: 2 }),
  },
  cardAccentBar: {
    height: 3,
    width: '100%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  pickerTitle: {
    letterSpacing: 1,
    fontSize: 10,
    flex: 1,
  },
  pickerCount: { fontSize: 10 },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  selectorSub: {
    fontSize: 10,
    marginTop: 1,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  driverDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  driverColorBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginRight: Spacing.two,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    borderRadius: M3Shape.sm,
    borderWidth: 1,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.1, radius: 6, offsetY: 2, elevation: 1 }),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    gap: 2,
  },
  statLabel: {
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    opacity: 0.8,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 0.2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },

  // Table card
  tableCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.2, radius: 12, offsetY: 4, elevation: 3 }),
  },
  tableStripe: {
    height: 3,
    width: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    gap: 3,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 7.5,
    letterSpacing: 0.2,
  },

  // Web list cards
  webListCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.15, radius: 10, offsetY: 4, elevation: 2 }),
  },
  webList: { maxHeight: 260 },
  webListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    gap: Spacing.one,
  },
  webListItemSub: {
    fontSize: 10,
    marginTop: 1,
  },
  selectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: Spacing.two,
  },
  listLoading: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading / empty
  loadingCard: {
    minHeight: 220,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  loadingLabel: {
    fontSize: 12,
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  loadingSubLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    borderWidth: 1,
    maxHeight: '75%',
    paddingTop: Spacing.two,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.two,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  closeBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: Spacing.one,
  },
  closeBtnText: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  pickerList: { maxHeight: 500 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  pickerItemSub: {
    fontSize: 10,
    marginTop: 2,
  },
});
