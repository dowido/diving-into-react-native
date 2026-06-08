import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircuitMap } from '@/components/circuit-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  headshot_url?: string;
}

interface CarDataFrame {
  date: string;
  speed: number;
  rpm: number;
  n_gear: number;
  throttle: number;
  brake: number;
  drs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTyreColor(comp: string) {
  switch (comp?.toUpperCase()) {
    case 'SOFT': return '#ef4444';
    case 'MEDIUM': return '#eab308';
    case 'HARD': return '#e2e8f0';
    case 'INTERMEDIATE': return '#22c55e';
    case 'WET': return '#3b82f6';
    default: return '#94a3b8';
  }
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ShiftLights({ rpmPercent }: { rpmPercent: number }) {
  const total = 15;
  const active = Math.floor((rpmPercent / 100) * total);
  const isShift = rpmPercent >= 93;
  const blink = isShift && Math.floor(Date.now() / 150) % 2 === 0;

  return (
    <View style={slStyles.row}>
      {Array.from({ length: total }).map((_, i) => {
        let color = '#1e293b';
        if (i < active) {
          if (i < 5) color = '#22c55e';
          else if (i < 10) color = '#eab308';
          else color = '#ef4444';
        }
        const finalColor = blink ? '#3b82f6' : color;
        return (
          <View
            key={i}
            style={[
              slStyles.led,
              {
                backgroundColor: finalColor,
                ...Platform.select({
                  web: { boxShadow: i < active ? `0 0 6px ${finalColor}` : 'none' },
                  default: {
                    shadowColor: finalColor,
                    shadowOpacity: i < active ? 0.8 : 0,
                    shadowRadius: i < active ? 4 : 0,
                  },
                }),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const slStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    backgroundColor: '#020205',
    paddingVertical: 6,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  led: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.6)',
    ...Platform.select({ web: { transition: 'all 0.1s ease' } }),
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ReplayScreen() {
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

  // ── Telemetry data ────────────────────────────────────────────────────────
  const [dataLoading, setDataLoading] = useState(false);
  const [telemetryData, setTelemetryData] = useState<CarDataFrame[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Playback state ────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Current displayed telemetry ───────────────────────────────────────────
  const [telemetry, setTelemetry] = useState({
    speed: 0, rpm: 0, gear: 0, throttle: 0, brake: 0, drs: 0,
  });

  const animSpeed = useRef(new Animated.Value(0)).current;
  const animRPM = useRef(new Animated.Value(0)).current;

  // ── Mobile modals ─────────────────────────────────────────────────────────
  const [sessionPickerVisible, setSessionPickerVisible] = useState(false);
  const [driverPickerVisible, setDriverPickerVisible] = useState(false);

  // ── Fetch sessions on first focus ────────────────────────────────────────
  // useFocusEffect prevents loading sessions on app startup (before tab is visited).
  useFocusEffect(
    useCallback(() => {
      if (sessions.length > 0) return; // already loaded
      let cancelled = false;
      (async () => {
        try {
          setSessionsLoading(true);
          // Fetch past sessions for last 2 years — SEQUENTIAL to avoid burst
          const r2026 = await fetchWithRetry('https://api.openf1.org/v1/sessions?year=2026');
          const data2026: Session[] = r2026.ok ? await r2026.json() : [];

          const r2025 = await fetchWithRetry('https://api.openf1.org/v1/sessions?year=2025');
          const data2025: Session[] = r2025.ok ? await r2025.json() : [];

          if (cancelled) return;
          const allSessions = [...data2026, ...data2025];
          const now = new Date();

          // Only include sessions that have ended
          const past = allSessions
            .filter((s) => s.date_end && new Date(s.date_end) < now)
            .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());

          setSessions(past);
          if (past.length > 0) {
            setSelectedSession(past[0]);
          }
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
        setTelemetryData([]);
        setCurrentFrame(0);
        setIsPlaying(false);

        const res = await fetchWithRetry(
          `https://api.openf1.org/v1/drivers?session_key=${selectedSession.session_key}`
        );
        if (!res.ok) throw new Error('Drivers fetch failed');
        const data: Driver[] = await res.json();
        if (cancelled) return;

        const sorted = [...data].sort((a, b) =>
          a.name_acronym.localeCompare(b.name_acronym)
        );
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

  // ── Load telemetry when driver or session changes ─────────────────────────
  const loadTelemetry = useCallback(async () => {
    if (!selectedSession || !selectedDriver) return;

    stopPlayback();
    setDataLoading(true);
    setLoadError(null);
    setCurrentFrame(0);
    setTelemetryData([]);
    setTelemetry({ speed: 0, rpm: 0, gear: 0, throttle: 0, brake: 0, drs: 0 });

    try {
      const url =
        `https://api.openf1.org/v1/car_data` +
        `?session_key=${selectedSession.session_key}` +
        `&driver_number=${selectedDriver.driver_number}`;

      const res = await fetchWithRetry(url);
      if (!res.ok) throw new Error('Car data fetch failed');
      const data: CarDataFrame[] = await res.json();

      if (data.length === 0) {
        setLoadError('No telemetry data available for this session / driver.');
      } else {
        setTelemetryData(data);
        // Prime display with first frame
        const f = data[0];
        setTelemetry({
          speed: f.speed ?? 0,
          rpm: f.rpm ?? 0,
          gear: f.n_gear ?? 0,
          throttle: f.throttle ?? 0,
          brake: f.brake ?? 0,
          drs: f.drs ?? 0,
        });
      }
    } catch (err) {
      console.warn('Telemetry load error:', err);
      setLoadError('Failed to load telemetry data. Please try again.');
    } finally {
      setDataLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, selectedDriver]);

  useEffect(() => {
    if (selectedDriver && selectedSession) {
      loadTelemetry();
    }
  }, [selectedDriver, selectedSession, loadTelemetry]);

  // ── Playback engine ───────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (telemetryData.length === 0) return;
    setIsPlaying(true);

    playbackRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        const next = prev + 1;
        if (next >= telemetryData.length) {
          stopPlayback();
          return telemetryData.length - 1;
        }
        const f = telemetryData[next];
        setTelemetry({
          speed: f.speed ?? 0,
          rpm: f.rpm ?? 0,
          gear: f.n_gear ?? 0,
          throttle: f.throttle ?? 0,
          brake: f.brake ?? 0,
          drs: f.drs ?? 0,
        });
        Animated.spring(animSpeed, { toValue: f.speed ?? 0, useNativeDriver: false }).start();
        Animated.spring(animRPM, { toValue: f.rpm ?? 0, useNativeDriver: false }).start();
        return next;
      });
    }, Math.round(250 / playbackSpeed));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetryData, playbackSpeed, stopPlayback]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      if (currentFrame >= telemetryData.length - 1) {
        setCurrentFrame(0);
      }
      startPlayback();
    }
  }, [isPlaying, currentFrame, telemetryData.length, startPlayback, stopPlayback]);

  // Restart interval when speed changes while playing
  useEffect(() => {
    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackSpeed]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // ── Derived values ────────────────────────────────────────────────────────
  const maxRpm = 13500;
  const rpmPercent = Math.min(100, Math.max(0, (telemetry.rpm / maxRpm) * 100));
  const teamColor = selectedDriver?.team_colour ? `#${selectedDriver.team_colour}` : theme.neonTeal;

  const totalFrames = telemetryData.length;
  const progressPercent = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0;

  // Estimate replay duration in seconds at 1x (250ms per frame)
  const totalDurationSecs = (totalFrames * 0.25) / playbackSpeed;
  const elapsedSecs = (currentFrame * 0.25) / playbackSpeed;

  // ── Render ────────────────────────────────────────────────────────────────
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
          name={{ ios: 'film', android: 'movie', web: 'movie' }}
          size={14}
          tintColor={theme.cosmicIndigo}
        />
        <ThemedText type="smallBold" style={styles.pickerTitle} themeColor="text">
          SESSION
        </ThemedText>
      </View>

      {sessionsLoading ? (
        <ActivityIndicator size="small" color={theme.cosmicIndigo} style={{ marginTop: 8 }} />
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
            <ThemedText type="code" themeColor="textSecondary">
              Select a session…
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
        <ActivityIndicator size="small" color={teamColor} style={{ marginTop: 8 }} />
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
                <View
                  style={[styles.driverColorDot, { backgroundColor: teamColor }]}
                />
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

  const renderTelemetryCard = () => {
    if (dataLoading) {
      return (
        <ThemedView
          type="backgroundElement"
          style={[styles.loadingCard]}
        >
          <ActivityIndicator size="large" color={teamColor} />
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingLabel}>
            Loading telemetry…
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingSubLabel}>
            {selectedDriver?.name_acronym} · {selectedSession?.session_name}
          </ThemedText>
        </ThemedView>
      );
    }

    if (loadError) {
      return (
        <ThemedView
          type="backgroundElement"
          style={styles.loadingCard}
        >
          <SymbolView
            name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
            size={32}
            tintColor={theme.solarAmber}
          />
          <ThemedText type="code" themeColor="textSecondary" style={[styles.loadingLabel, { textAlign: 'center' }]}>
            {loadError}
          </ThemedText>
          <Pressable
            onPress={loadTelemetry}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: theme.cosmicIndigo },
              pressed && { opacity: 0.8 },
            ]}
          >
            <ThemedText type="smallBold" style={{ color: '#fff', fontSize: 11 }}>
              RETRY
            </ThemedText>
          </Pressable>
        </ThemedView>
      );
    }

    if (telemetryData.length === 0 || !selectedDriver) {
      return (
        <ThemedView type="backgroundElement" style={styles.loadingCard}>
          <SymbolView
            name={{ ios: 'waveform.path', android: 'ssid_chart', web: 'ssid_chart' }}
            size={36}
            tintColor={theme.backgroundElement}
          />
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingLabel}>
            Select a session and driver to begin replay
          </ThemedText>
        </ThemedView>
      );
    }

    return (
      <ThemedView
        style={[
          styles.telemetryCard,
          { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
        ]}
      >
        {/* Team color stripe */}
        <View style={[styles.stripe, { backgroundColor: teamColor }]} />

        {/* Header */}
        <View style={styles.telemetryHeader}>
          <View style={[styles.statusDot, { backgroundColor: isPlaying ? '#22c55e' : theme.textSecondary }]} />
          <ThemedText type="smallBold" style={styles.telemetryTitle} themeColor="text">
            TELEMETRY REPLAY · {selectedDriver.name_acronym}
          </ThemedText>

          {/* DRS Badge */}
          {telemetry.drs >= 8 ? (
            <View style={styles.drsBadgeActive}>
              <ThemedText type="code" style={styles.drsText}>DRS ▶</ThemedText>
            </View>
          ) : (
            <View style={styles.drsBadgeInactive}>
              <ThemedText type="code" style={styles.drsTextInactive}>DRS</ThemedText>
            </View>
          )}
        </View>

        {/* Shift Lights */}
        <ShiftLights rpmPercent={rpmPercent} />

        {/* Main Gauges */}
        <View style={styles.gaugesRow}>
          {/* Speed */}
          <View style={styles.gaugeItem}>
            <View style={[styles.dialCircle, { borderColor: teamColor }]}>
              <ThemedText style={[styles.dialValue, { color: teamColor }]}>
                {telemetry.speed}
              </ThemedText>
              <ThemedText type="code" style={styles.dialUnit} themeColor="textSecondary">KM/H</ThemedText>
            </View>
          </View>

          {/* Gear */}
          <View style={styles.gearBox}>
            <ThemedText type="code" style={styles.gearLabel} themeColor="textSecondary">GEAR</ThemedText>
            <ThemedText style={[styles.gearValue, { color: theme.text }]}>
              {telemetry.gear === 0 ? 'N' : telemetry.gear}
            </ThemedText>
          </View>

          {/* RPM */}
          <View style={styles.gaugeItem}>
            <View style={[styles.dialCircle, { borderColor: '#ef4444' }]}>
              <ThemedText style={[styles.dialValue, { color: '#ef4444' }]}>
                {Math.round(telemetry.rpm / 100) * 100}
              </ThemedText>
              <ThemedText type="code" style={styles.dialUnit} themeColor="textSecondary">RPM</ThemedText>
            </View>
          </View>
        </View>

        {/* Pedals */}
        <View
          style={[
            styles.pedalsRow,
            {
              backgroundColor: theme.background,
              borderColor: 'rgba(255,255,255,0.03)',
            },
          ]}
        >
          {/* Throttle */}
          <View style={styles.pedalCol}>
            <View style={styles.pedalTopRow}>
              <ThemedText type="code" style={styles.pedalLabel} themeColor="textSecondary">
                THROTTLE
              </ThemedText>
              <ThemedText type="code" style={[styles.pedalPct, { color: '#22c55e' }]}>
                {telemetry.throttle}%
              </ThemedText>
            </View>
            <View style={[styles.pedalTrack, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[
                  styles.pedalFill,
                  {
                    backgroundColor: '#22c55e',
                    height: `${telemetry.throttle}%` as any,
                    top: `${100 - telemetry.throttle}%` as any,
                    ...Platform.select({
                      web: { boxShadow: '0 0 8px #22c55e' },
                      default: { shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 5 },
                    }),
                  },
                ]}
              />
            </View>
          </View>

          {/* Brake */}
          <View style={styles.pedalCol}>
            <View style={styles.pedalTopRow}>
              <ThemedText type="code" style={styles.pedalLabel} themeColor="textSecondary">
                BRAKE
              </ThemedText>
              <ThemedText type="code" style={[styles.pedalPct, { color: '#ef4444' }]}>
                {telemetry.brake}%
              </ThemedText>
            </View>
            <View style={[styles.pedalTrack, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[
                  styles.pedalFill,
                  {
                    backgroundColor: '#ef4444',
                    height: `${telemetry.brake}%` as any,
                    top: `${100 - telemetry.brake}%` as any,
                    ...Platform.select({
                      web: { boxShadow: '0 0 8px #ef4444' },
                      default: { shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 5 },
                    }),
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* ── Playback Controls ── */}
        <View style={[styles.playbackSection, { borderTopColor: theme.backgroundElement }]}>
          {/* Progress Bar */}
          <View style={styles.progressArea}>
            <ThemedText type="code" style={styles.progressTime} themeColor="textSecondary">
              {formatDuration(elapsedSecs)}
            </ThemedText>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: teamColor,
                    width: `${progressPercent}%` as any,
                    ...Platform.select({
                      web: { boxShadow: `0 0 6px ${teamColor}` },
                      default: {},
                    }),
                  },
                ]}
              />
              <View
                style={[
                  styles.progressThumb,
                  {
                    backgroundColor: teamColor,
                    left: `${progressPercent}%` as any,
                    ...Platform.select({
                      web: { boxShadow: `0 0 8px ${teamColor}` },
                      default: {},
                    }),
                  },
                ]}
              />
            </View>
            <ThemedText type="code" style={styles.progressTime} themeColor="textSecondary">
              {formatDuration(totalDurationSecs)}
            </ThemedText>
          </View>

          {/* Buttons row */}
          <View style={styles.controlsRow}>
            {/* Rewind */}
            <Pressable
              onPress={() => {
                stopPlayback();
                setCurrentFrame(0);
                const f = telemetryData[0];
                if (f) setTelemetry({ speed: f.speed ?? 0, rpm: f.rpm ?? 0, gear: f.n_gear ?? 0, throttle: f.throttle ?? 0, brake: f.brake ?? 0, drs: f.drs ?? 0 });
              }}
              style={({ pressed }) => [
                styles.controlBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.6 },
              ]}
            >
              <SymbolView
                name={{ ios: 'backward.end.fill', android: 'skip_previous', web: 'skip_previous' }}
                size={16}
                tintColor={theme.text}
              />
            </Pressable>

            {/* Play / Pause */}
            <Pressable
              onPress={togglePlayback}
              style={({ pressed }) => [
                styles.playBtn,
                { backgroundColor: teamColor },
                pressed && { opacity: 0.8 },
              ]}
            >
              <SymbolView
                name={
                  isPlaying
                    ? { ios: 'pause.fill', android: 'pause', web: 'pause' }
                    : { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }
                }
                size={20}
                tintColor="#000000"
              />
            </Pressable>

            {/* Forward to end */}
            <Pressable
              onPress={() => {
                stopPlayback();
                const last = telemetryData.length - 1;
                setCurrentFrame(last);
                const f = telemetryData[last];
                if (f) setTelemetry({ speed: f.speed ?? 0, rpm: f.rpm ?? 0, gear: f.n_gear ?? 0, throttle: f.throttle ?? 0, brake: f.brake ?? 0, drs: f.drs ?? 0 });
              }}
              style={({ pressed }) => [
                styles.controlBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.6 },
              ]}
            >
              <SymbolView
                name={{ ios: 'forward.end.fill', android: 'skip_next', web: 'skip_next' }}
                size={16}
                tintColor={theme.text}
              />
            </Pressable>

            {/* Speed selector */}
            <View style={styles.speedRow}>
              {[0.5, 1, 2, 5].map((speed) => (
                <Pressable
                  key={speed}
                  onPress={() => setPlaybackSpeed(speed)}
                  style={({ pressed }) => [
                    styles.speedBtn,
                    {
                      backgroundColor:
                        playbackSpeed === speed ? teamColor : theme.backgroundElement,
                      borderColor:
                        playbackSpeed === speed ? teamColor : 'transparent',
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText
                    type="code"
                    style={[
                      styles.speedLabel,
                      { color: playbackSpeed === speed ? '#000' : theme.textSecondary },
                    ]}
                  >
                    {speed}×
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Frame counter */}
          <ThemedText type="code" style={styles.frameCounter} themeColor="textSecondary">
            FRAME {currentFrame + 1} / {totalFrames} · {selectedSession?.circuit_short_name}
          </ThemedText>
        </View>
      </ThemedView>
    );
  };

  // ── Session picker modal ──────────────────────────────────────────────────
  const renderSessionPicker = () => (
    <Modal
      animationType="slide"
      transparent
      visible={sessionPickerVisible}
      onRequestClose={() => setSessionPickerVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: theme.backgroundElement }]} />
          <View style={styles.modalHeaderRow}>
            <ThemedText type="smallBold" themeColor="text">SELECT SESSION</ThemedText>
            <Pressable
              onPress={() => setSessionPickerVisible(false)}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.7 },
              ]}
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
                  onPress={() => {
                    setSelectedSession(sess);
                    setSessionPickerVisible(false);
                  }}
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

  // ── Driver picker modal ───────────────────────────────────────────────────
  const renderDriverPicker = () => (
    <Modal
      animationType="slide"
      transparent
      visible={driverPickerVisible}
      onRequestClose={() => setDriverPickerVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: theme.backgroundElement }]} />
          <View style={styles.modalHeaderRow}>
            <ThemedText type="smallBold" themeColor="text">SELECT DRIVER</ThemedText>
            <Pressable
              onPress={() => setDriverPickerVisible(false)}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.7 },
              ]}
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
                  onPress={() => {
                    setSelectedDriver(driver);
                    setDriverPickerVisible(false);
                  }}
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
                      <ThemedText type="smallBold" style={{ color: drvColor }}>
                        {driver.name_acronym}
                      </ThemedText>
                      <ThemedText type="code" themeColor="text" numberOfLines={1}>
                        {driver.full_name}
                      </ThemedText>
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

  // ── Web inline pickers ────────────────────────────────────────────────────
  const renderWebSessionList = () => (
    <ThemedView
      style={[
        styles.webListCard,
        { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
      ]}
    >
      <View style={[styles.cardAccentBar, { backgroundColor: theme.cosmicIndigo }]} />
      <View style={styles.pickerHeader}>
        <SymbolView
          name={{ ios: 'film', android: 'movie', web: 'movie' }}
          size={14}
          tintColor={theme.cosmicIndigo}
        />
        <ThemedText type="smallBold" style={styles.pickerTitle} themeColor="text">
          SESSIONS
        </ThemedText>
        <ThemedText type="code" style={styles.pickerCount} themeColor="textSecondary">
          {sessions.length}
        </ThemedText>
      </View>

      {sessionsLoading ? (
        <View style={styles.listLoading}>
          <ActivityIndicator size="small" color={theme.cosmicIndigo} />
        </View>
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
                  <ThemedText
                    type="smallBold"
                    style={isSelected ? { color: theme.cosmicIndigo } : undefined}
                    themeColor={isSelected ? undefined : 'text'}
                    numberOfLines={1}
                  >
                    {sess.location.toUpperCase()} — {sess.session_name}
                  </ThemedText>
                  <ThemedText type="code" style={styles.webListItemSub} themeColor="textSecondary">
                    {sess.circuit_short_name} · {sess.year}
                  </ThemedText>
                </View>
                {isSelected && (
                  <View style={[styles.selectedDot, { backgroundColor: theme.cosmicIndigo }]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </ThemedView>
  );

  const renderWebDriverList = () => (
    <ThemedView
      style={[
        styles.webListCard,
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
          DRIVERS
        </ThemedText>
        <ThemedText type="code" style={styles.pickerCount} themeColor="textSecondary">
          {drivers.length}
        </ThemedText>
      </View>

      {driversLoading ? (
        <View style={styles.listLoading}>
          <ActivityIndicator size="small" color={teamColor} />
        </View>
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
                    <ThemedText type="smallBold" style={{ color: drvColor, fontSize: 11 }}>
                      {driver.name_acronym}
                    </ThemedText>
                    <ThemedText type="code" themeColor="text" numberOfLines={1} style={{ fontSize: 11 }}>
                      {driver.full_name}
                    </ThemedText>
                  </View>
                  <ThemedText type="code" style={styles.webListItemSub} themeColor="textSecondary">
                    {driver.team_name}
                  </ThemedText>
                </View>
                {isSelected && (
                  <View style={[styles.selectedDot, { backgroundColor: drvColor }]} />
                )}
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
            TELEMETRY REPLAY
          </ThemedText>
          <ThemedText style={styles.heroSubtitle} themeColor="textSecondary">
            Select a session &amp; driver · replay car data frame-by-frame
          </ThemedText>
        </ThemedView>

        {/* ── MOBILE layout ── */}
        {Platform.OS !== 'web' && (
          <>
            {renderSessionSelector()}
            {renderDriverSelector()}
            <CircuitMap
              sessionKey={selectedSession?.session_key ?? null}
              drivers={new Map(drivers.map((d) => [d.driver_number, { name_acronym: d.name_acronym, team_colour: d.team_colour }]))}
              replayTimestamp={telemetryData[currentFrame]?.date ?? null}
              highlightDriverNumber={selectedDriver?.driver_number ?? null}
            />
            {renderTelemetryCard()}
            {renderSessionPicker()}
            {renderDriverPicker()}
          </>
        )}

        {/* ── WEB layout ── */}
        {Platform.OS === 'web' && (
          <View style={styles.webLayout}>
            {/* Left column: session + driver pickers */}
            <View style={styles.webLeftCol}>
              {renderWebSessionList()}
              {renderWebDriverList()}
              <CircuitMap
                sessionKey={selectedSession?.session_key ?? null}
                drivers={new Map(drivers.map((d) => [d.driver_number, { name_acronym: d.name_acronym, team_colour: d.team_colour }]))}
                replayTimestamp={telemetryData[currentFrame]?.date ?? null}
                highlightDriverNumber={selectedDriver?.driver_number ?? null}
              />
            </View>

            {/* Right column: telemetry */}
            <View style={styles.webRightCol}>
              {renderTelemetryCard()}
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

  // Picker cards (mobile)
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
  pickerCount: {
    fontSize: 10,
  },
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
  driverColorDot: {
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

  // Web list cards
  webListCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.15, radius: 10, offsetY: 4, elevation: 2 }),
  },
  webList: {
    maxHeight: 260,
  },
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

  // Telemetry card
  telemetryCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    gap: Spacing.three,
    padding: Spacing.three,
    position: 'relative',
    ...cardShadow({ opacity: 0.25, radius: 12, offsetY: 6, elevation: 4 }),
  },
  stripe: {
    height: 3,
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  telemetryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  telemetryTitle: {
    letterSpacing: 1,
    fontSize: 10.5,
    flex: 1,
  },
  drsBadgeActive: {
    backgroundColor: '#22c55e',
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#15803d',
  },
  drsBadgeInactive: {
    backgroundColor: '#334155',
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  drsText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#000',
  },
  drsTextInactive: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#94a3b8',
  },

  // Gauges
  gaugesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  gaugeItem: {
    flex: 1.1,
    alignItems: 'center',
  },
  dialCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dialValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  dialUnit: {
    fontSize: 8,
    marginTop: -2,
    letterSpacing: 0.5,
  },
  gearBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020205',
    borderColor: 'rgba(255,255,255,0.05)',
  },
  gearLabel: {
    fontSize: 7.5,
    letterSpacing: 0.5,
    marginBottom: -6,
  },
  gearValue: {
    fontSize: 34,
    fontWeight: 'bold',
  },

  // Pedals
  pedalsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  pedalCol: {
    flex: 1,
    gap: Spacing.one,
  },
  pedalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pedalLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  pedalPct: {
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  pedalTrack: {
    height: 50,
    borderRadius: Spacing.one,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)',
  },
  pedalFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: Spacing.one,
  },

  // Playback controls
  playbackSection: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
  progressArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  progressTime: {
    fontSize: 9,
    letterSpacing: 0.5,
    minWidth: 32,
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  progressThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: 'absolute',
    top: -4,
    marginLeft: -7,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  controlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow({ opacity: 0.4, radius: 10, offsetY: 4, elevation: 4 }),
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: Spacing.two,
  },
  speedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  speedLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  frameCounter: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 0.5,
  },

  // Loading / empty card
  loadingCard: {
    minHeight: 260,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  loadingLabel: {
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
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

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    borderWidth: 1,
    maxHeight: '75%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  closeBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  closeBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  pickerList: {
    maxHeight: 420,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  pickerItemSub: {
    fontSize: 10,
    marginTop: 2,
  },
});
