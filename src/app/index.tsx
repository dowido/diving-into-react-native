import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircuitMap } from '@/components/circuit-map';
import { WeatherPanel } from '@/components/weather-panel';
import { F1DriverCard } from '@/components/f1-driver-card';
import { F1Telemetry } from '@/components/f1-telemetry';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';

interface Driver {
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  headshot_url: string;
  last_name: string;
}

interface LeaderboardEntry {
  position:       number | null;
  driver_number:  number;
  driver:         Driver;
  gap_to_leader:  number | string | null;
  interval:       number | string | null;
  number_of_laps: number;
  dnf:            boolean;
  dns:            boolean;
  compound?:      string;
  stint_age?:     number;   // laps on current tyre
}

interface RaceControlMessage {
  date: string;
  message: string;
  flag: string | null;
  lap_number: number | null;
}

export default function LiveTimingScreen() {
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

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'home' | 'console'>('home');
  const [session, setSession] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [raceControl, setRaceControl] = useState<RaceControlMessage[]>([]);
  const [trackFlag, setTrackFlag] = useState<string>('GREEN');
  const [selectedDriverNumber, setSelectedDriverNumber] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);

  // Timezone toggle state
  const [useLocalTime, setUseLocalTime] = useState(true);

  // Mobile Bottom Sheet Modal Visibility
  const [modalVisible, setModalVisible] = useState(false);

  // Home Screen States
  const [showFullStandings, setShowFullStandings] = useState(false);
  const [countdownText, setCountdownText] = useState('');

  // Animated flag opacity for warning flashers
  const flagOpacity = useRef(new Animated.Value(1)).current;

  // Pulse track status banner if safety car, yellow, or red flags are active
  useEffect(() => {
    if (trackFlag !== 'GREEN' && trackFlag !== 'CLEAR') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flagOpacity, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(flagOpacity, {
            toValue: 1.0,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      flagOpacity.stopAnimation();
      flagOpacity.setValue(1.0);
    }
  }, [trackFlag]);

  // Dynamic countdown timer for upcoming session
  useEffect(() => {
    if (!session || isLive) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const start = new Date(session.date_start).getTime();
      const diff = start - now;
      if (diff <= 0) {
        setCountdownText('SESSION COMPLETED');
        clearInterval(interval);
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdownText(
          `${days.toString().padStart(2, '0')}d : ${hours.toString().padStart(2, '0')}h : ${minutes
            .toString()
            .padStart(2, '0')}m : ${seconds.toString().padStart(2, '0')}s`
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session, isLive]);

  const fetchData = async (isPoll = false) => {
    try {
      if (!isPoll) setLoading(true);

      // 1. Fetch latest session metadata
      const sessionRes = await fetchWithRetry('https://api.openf1.org/v1/sessions?session_key=latest');
      if (!sessionRes.ok) throw new Error('Session fetch failed');
      const sessions = await sessionRes.json();
      if (!sessions || sessions.length === 0) {
        setLoading(false);
        return;
      }
      const activeSession = sessions[0];
      setSession(activeSession);

      const sKey = activeSession.session_key;

      // Check if session is currently active
      const now = new Date();
      const sStart = new Date(activeSession.date_start);
      const sEnd = activeSession.date_end ? new Date(activeSession.date_end) : null;
      const sessionIsActive = sEnd ? (now >= sStart && now <= sEnd) : (now >= sStart);
      setIsLive(sessionIsActive);

      // 2. Fetch all drivers (graceful — skip if 429/404)
      let driversData: Driver[] = [];
      try {
        const driversRes = await fetchWithRetry(`https://api.openf1.org/v1/drivers?session_key=${sKey}`);
        if (driversRes.ok) driversData = await driversRes.json();
      } catch { /* ignore */ }
      const driversMap = new Map<number, Driver>();
      driversData.forEach((d) => driversMap.set(d.driver_number, d));

      // 3. Fetch stints (tyres compound info + age) — graceful
      const latestStints   = new Map<number, string>();
      const latestStintAge = new Map<number, number>();  // laps on current tyre
      try {
        const stintsRes = await fetchWithRetry(`https://api.openf1.org/v1/stints?session_key=${sKey}`);
        if (stintsRes.ok) {
          const stintsData = await stintsRes.json();
          if (stintsData && stintsData.length > 0) {
            const sortedStints = [...stintsData].sort((a: any, b: any) => a.lap_start - b.lap_start);
            const latestStintMap = new Map<number, any>();
            sortedStints.forEach((st: any) => {
              if (st.compound) latestStints.set(st.driver_number, st.compound);
              latestStintMap.set(st.driver_number, st);
            });
            const maxLap = Math.max(...sortedStints.map((s: any) => s.lap_end ?? s.lap_start));
            latestStintMap.forEach((st, num) => {
              latestStintAge.set(num, maxLap - st.lap_start + 1);
            });
          }
        }
      } catch { /* ignore */ }

      // 4. Fetch session results (standings) — graceful
      let resultsData: any[] = [];
      try {
        const resultsRes = await fetchWithRetry(`https://api.openf1.org/v1/session_result?session_key=${sKey}`);
        if (resultsRes.ok) resultsData = await resultsRes.json();
      } catch { /* ignore */ }

      // 5. Fetch positions (real-time overlay) — graceful
      let positionsData: any[] = [];
      try {
        const positionsRes = await fetchWithRetry(`https://api.openf1.org/v1/position?session_key=${sKey}`);
        if (positionsRes.ok) positionsData = await positionsRes.json();
      } catch { /* ignore */ }

      // 6. Fetch latest intervals — graceful
      let intervalsData: any[] = [];
      try {
        const intervalsRes = await fetchWithRetry(`https://api.openf1.org/v1/intervals?session_key=${sKey}`);
        if (intervalsRes.ok) intervalsData = await intervalsRes.json();
      } catch { /* ignore */ }

      // 7. Fetch race control feed — graceful
      let rcData: any[] = [];
      try {
        const rcRes = await fetchWithRetry(`https://api.openf1.org/v1/race_control?session_key=${sKey}`);
        if (rcRes.ok) rcData = await rcRes.json();
      } catch { /* ignore */ }

      // Build recent messages
      const recentRc = [...rcData]
        .reverse()
        .slice(0, 10)
        .map((msg: any) => ({
          date: msg.date,
          message: msg.message,
          flag: msg.flag,
          lap_number: msg.lap_number,
        }));
      setRaceControl(recentRc);

      // Calculate track flag state from recent flags
      const flagMsgs = rcData.filter((msg: any) => msg.category === 'Flag');
      if (flagMsgs.length > 0) {
        const latestFlag = flagMsgs[flagMsgs.length - 1].flag;
        setTrackFlag(latestFlag || 'GREEN');
      } else {
        setTrackFlag('GREEN');
      }

      // Map current state:
      if (resultsData && resultsData.length > 0) {
        const mappedResults: LeaderboardEntry[] = resultsData.map((res: any) => {
          const drv = driversMap.get(res.driver_number) || {
            driver_number: res.driver_number,
            broadcast_name: `CAR ${res.driver_number}`,
            full_name: `Car Number ${res.driver_number}`,
            name_acronym: `${res.driver_number}`,
            team_name: 'Unknown Team',
            team_colour: '999999',
            headshot_url: '',
            last_name: `CAR ${res.driver_number}`,
          };

          return {
            position:       res.position,
            driver_number:  res.driver_number,
            driver:         drv,
            gap_to_leader:  res.gap_to_leader !== null && res.gap_to_leader !== undefined 
              ? (typeof res.gap_to_leader === 'number' ? `+${res.gap_to_leader.toFixed(3)}s` : res.gap_to_leader)
              : (res.position === 1 ? 'LEADER' : '--'),
            interval:       res.position === 1 ? 'LEADER' : '--',
            number_of_laps: res.number_of_laps || 0,
            dnf:            !!res.dnf,
            dns:            !!res.dns,
            compound:       latestStints.get(res.driver_number),
            stint_age:      latestStintAge.get(res.driver_number),
          };
        });
        
        mappedResults.sort((a, b) => {
          if (a.position === null) return 1;
          if (b.position === null) return -1;
          return a.position - b.position;
        });

        setLeaderboard(mappedResults);
        if (!selectedDriverNumber && mappedResults.length > 0) {
          setSelectedDriverNumber(mappedResults[0].driver_number);
        }
      } else {
        // Fallback for live sessions
        const latestPositions = new Map<number, { position: number; date: string }>();
        positionsData.forEach((pos: any) => {
          const current = latestPositions.get(pos.driver_number);
          if (!current || new Date(pos.date) > new Date(current.date)) {
            latestPositions.set(pos.driver_number, { position: pos.position, date: pos.date });
          }
        });

        const latestIntervals = new Map<number, { gap: number | string | null; interval: number | string | null; date: string }>();
        intervalsData.forEach((int: any) => {
          const current = latestIntervals.get(int.driver_number);
          if (!current || new Date(int.date) > new Date(current.date)) {
            latestIntervals.set(int.driver_number, {
              gap: int.gap_to_leader,
              interval: int.interval,
              date: int.date,
            });
          }
        });

        const liveLeaderboard: LeaderboardEntry[] = [];
        driversData.forEach((drv) => {
          const posState = latestPositions.get(drv.driver_number);
          const intState = latestIntervals.get(drv.driver_number);

          const totalLaps = rcData
            .filter((m: any) => m.driver_number === drv.driver_number && m.lap_number)
            .reduce((max: number, m: any) => Math.max(max, m.lap_number), 0);

          liveLeaderboard.push({
            position: posState ? posState.position : null,
            driver_number: drv.driver_number,
            driver: drv,
            gap_to_leader: posState?.position === 1 ? 'LEADER' : (intState?.gap !== null && intState?.gap !== undefined ? `+${intState.gap}s` : '--'),
            interval: posState?.position === 1 ? 'LEADER' : (intState?.interval !== null && intState?.interval !== undefined ? `+${intState.interval}s` : '--'),
            number_of_laps: totalLaps,
            dnf: false,
            dns: false,
            compound: latestStints.get(drv.driver_number),
          });
        });

        liveLeaderboard.sort((a, b) => {
          if (a.position === null) return 1;
          if (b.position === null) return -1;
          return a.position - b.position;
        });

        setLeaderboard(liveLeaderboard);
        if (!selectedDriverNumber && liveLeaderboard.length > 0) {
          setSelectedDriverNumber(liveLeaderboard[0].driver_number);
        }
      }

      if (!isPoll) setLoading(false);
    } catch (err) {
      console.warn('Dashboard Fetch Error:', err);
      if (!isPoll) setLoading(false);
    }
  };

  // useFocusEffect: only start the data fetch + poll when this tab is focused.
  // This prevents all 3 tabs firing simultaneously on app startup.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let interval: ReturnType<typeof setInterval>;

      const run = async () => {
        await fetchData();
        if (!active) return;
        // 30s poll — respectful of OpenF1 rate limits
        interval = setInterval(() => {
          if (active) fetchData(true);
        }, 30000);
      };

      run();

      return () => {
        active = false;
        clearInterval(interval);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const selectedEntry = leaderboard.find((d) => d.driver_number === selectedDriverNumber);

  // Status/Flag styling maps
  const getFlagColor = (flag: string) => {
    switch (flag.toUpperCase()) {
      case 'YELLOW':
      case 'DOUBLE YELLOW':
        return '#f59e0b';
      case 'RED':
        return '#ef4444';
      case 'SAFETY CAR':
      case 'VIRTUAL SAFETY CAR':
        return '#fb923c';
      case 'BLUE':
        return '#3b82f6';
      case 'GREEN':
      default:
        return '#22c55e';
    }
  };

  const getFlagLabel = (flag: string) => {
    if (flag === 'CLEAR') return 'GREEN FLAG - TRACK CLEAR';
    if (flag === 'DOUBLE YELLOW') return 'DOUBLE YELLOW - REDUCE SPEED';
    return `${flag.toUpperCase()} FLAG`;
  };

  const getTyreColor = (comp: string) => {
    switch (comp.toUpperCase()) {
      case 'SOFT':
        return '#ef4444';
      case 'MEDIUM':
        return '#eab308';
      case 'HARD':
        return '#ffffff';
      case 'INTERMEDIATE':
        return '#22c55e';
      case 'WET':
        return '#3b82f6';
      default:
        return '#94a3b8';
    }
  };

  const getTyreLabel = (comp: string) => {
    switch (comp.toUpperCase()) {
      case 'SOFT':
        return 'S';
      case 'MEDIUM':
        return 'M';
      case 'HARD':
        return 'H';
      case 'INTERMEDIATE':
        return 'I';
      case 'WET':
        return 'W';
      default:
        return '?';
    }
  };

  // Format date-time helper based on timezone offset toggler
  const formatTime = (dateStr: string, gmtOffsetStr?: string) => {
    const date = new Date(dateStr);
    if (useLocalTime) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } else {
      const offset = gmtOffsetStr || session?.gmt_offset || '00:00:00';
      const parts = offset.split(':');
      const offsetMs = (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + (parseInt(parts[2]) || 0)) * 1000;
      const trackDate = new Date(date.getTime() + offsetMs);
      const hours = trackDate.getUTCHours().toString().padStart(2, '0');
      const minutes = trackDate.getUTCMinutes().toString().padStart(2, '0');
      const seconds = trackDate.getUTCSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }
  };

  const renderRaceControlFeed = () => (
    <ThemedView 
      style={[
        styles.sectionCard, 
        styles.feedCard,
        { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }
      ]}
    >
      <View style={[styles.cardAccentBar, { backgroundColor: '#ffea00' }]} />
      <View style={styles.sectionHeader}>
        <SymbolView
          name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}
          size={15}
          tintColor={theme.solarAmber}
        />
        <ThemedText type="smallBold" style={styles.sectionTitle} themeColor="text">
          RACE CONTROL
        </ThemedText>
      </View>

      <ScrollView style={styles.feedScroll} nestedScrollEnabled>
        {raceControl.length === 0 ? (
          <ThemedText type="code" style={styles.emptyFeedText} themeColor="textSecondary">
            No race control status logged.
          </ThemedText>
        ) : (
          raceControl.map((msg, i) => (
            <View 
              key={i} 
              style={[
                styles.feedItem, 
                { borderBottomColor: 'rgba(128,128,128,0.06)' }
              ]}
            >
              <View style={styles.feedMeta}>
                <ThemedText type="code" style={styles.feedTimestamp} themeColor="textSecondary">
                  [{formatTime(msg.date)}]
                </ThemedText>
                {msg.lap_number && (
                  <View style={[styles.lapBadge, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="code" style={styles.lapBadgeText}>LAP {msg.lap_number}</ThemedText>
                  </View>
                )}
                {msg.flag && (
                  <View style={[styles.feedFlagBadge, { backgroundColor: getFlagColor(msg.flag) }]}>
                    <ThemedText type="code" style={styles.feedFlagText}>{msg.flag}</ThemedText>
                  </View>
                )}
              </View>
              <ThemedText type="code" style={styles.feedText} themeColor="text">
                {msg.message}
              </ThemedText>
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );

  if (loading) {
    return (
      <ThemedView type="backgroundElement" style={styles.loadingWrapper}>
        <ActivityIndicator size="large" color={theme.cosmicIndigo} />
        <ThemedText type="code" themeColor="textSecondary">
          Loading Grand Prix Dashboard...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>

        {viewMode === 'home' ? (
          <View style={styles.homeDashboard}>
            {/* Section 1: The Context Hero (Adaptable) */}
            <ThemedView
              style={[
                styles.heroCard,
                { backgroundColor: theme.cardBackground, borderColor: isLive ? theme.cosmicIndigo : theme.backgroundElement }
              ]}
            >
              <View style={styles.heroHeaderRow}>
                {isLive ? (
                  <View style={styles.liveIndicatorRow}>
                    <View style={styles.pulsingLiveDot} />
                    <ThemedText type="smallBold" style={{ color: theme.cosmicIndigo, letterSpacing: 1 }}>
                      LIVE: {session?.location?.toUpperCase()} GRAND PRIX
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText type="smallBold" themeColor="textSecondary" style={{ letterSpacing: 1 }}>
                    UPCOMING: {session?.location?.toUpperCase()} GP
                  </ThemedText>
                )}
              </View>

              <View style={styles.heroBody}>
                {isLive ? (
                  <View style={styles.heroLiveContent}>
                    <ThemedText style={styles.heroGPTitle} themeColor="text">
                      {session?.circuit_short_name} · {session?.session_type}
                    </ThemedText>
                    <Pressable
                      onPress={() => setViewMode('console')}
                      style={({ pressed }) => [
                        styles.heroLaunchBtn,
                        { backgroundColor: theme.cosmicIndigo },
                        pressed && { opacity: 0.9 }
                      ]}
                    >
                      <SymbolView
                        name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                        size={14}
                        tintColor="#ffffff"
                      />
                      <ThemedText style={styles.heroLaunchBtnText}>JOIN LIVE PIT WALL STREAM</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.heroOfflineContent}>
                    <ThemedText style={styles.countdownValue} themeColor="text">
                      {countdownText || "00d : 00h : 00m : 00s"}
                    </ThemedText>
                    <ThemedText style={styles.heroGPTitleOffline} themeColor="textSecondary">
                      FP1 Starts: {session ? formatTime(session.date_start) : '--:--:--'}
                    </ThemedText>

                    {/* Minimalist SVG track trace background */}
                    <View style={styles.minimalistTrace}>
                      <svg width="100%" height="40" viewBox="0 0 100 40" style={{ opacity: 0.2 }}>
                        <path
                          d="M 10 20 Q 25 5, 50 20 T 90 20"
                          fill="none"
                          stroke={theme.text}
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                      </svg>
                    </View>
                  </View>
                )}
              </View>
            </ThemedView>

            {/* Section 2: Top 5 / Collapsible Grid Standings */}
            {leaderboard.length > 0 && (
              <ThemedView
                style={[
                  styles.gridCard,
                  { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }
                ]}
              >
                <View style={styles.gridCardHeader}>
                  <SymbolView
                    name={{ ios: 'list.number', android: 'format_list_numbered', web: 'format_list_numbered' }}
                    size={16}
                    tintColor={theme.cosmicIndigo}
                  />
                  <ThemedText type="smallBold" themeColor="text" style={{ letterSpacing: 0.5 }}>
                    {showFullStandings ? "FULL GRID STANDINGS" : "TOP 5 STANDINGS"}
                  </ThemedText>
                  <ThemedText type="code" themeColor="textSecondary" style={{ fontSize: 9, marginLeft: 'auto' }}>
                    {leaderboard.length} CARS
                  </ThemedText>
                </View>

                <View style={styles.table}>
                  {/* Header */}
                  <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundElement }]}>
                    <ThemedText type="code" style={styles.colPos} themeColor="textSecondary">POS</ThemedText>
                    <ThemedText type="code" style={styles.colDriver} themeColor="textSecondary">DRIVER</ThemedText>
                    <ThemedText type="code" style={styles.colGap} themeColor="textSecondary">INTERVAL</ThemedText>
                  </View>

                  {/* Rows */}
                  {leaderboard.slice(0, showFullStandings ? leaderboard.length : 5).map((entry) => {
                    const borderCol = entry.driver.team_colour ? `#${entry.driver.team_colour}` : theme.neonTeal;
                    return (
                      <View key={entry.driver_number} style={[styles.tableRow, { borderBottomColor: 'rgba(128,128,128,0.06)' }]}>
                        <View style={[styles.teamLine, { backgroundColor: borderCol }]} />
                        <ThemedText type="code" style={[styles.colPos, { fontWeight: 'bold' }]}>
                          {entry.position ?? '-'}
                        </ThemedText>

                        <View style={styles.driverColContainer}>
                          <ThemedText type="smallBold" style={styles.driverAcronym} themeColor="text">
                            {entry.driver.name_acronym}
                          </ThemedText>
                          {entry.compound && (
                            <View style={[styles.miniTyreBadge, { borderColor: getTyreColor(entry.compound) }]}>
                              <ThemedText type="code" style={[styles.miniTyreText, { color: getTyreColor(entry.compound) }]}>
                                {getTyreLabel(entry.compound)}
                              </ThemedText>
                            </View>
                          )}
                          <ThemedText type="code" style={styles.driverLastName} themeColor="textSecondary" numberOfLines={1}>
                            {entry.driver.last_name}
                          </ThemedText>
                        </View>

                        <ThemedText type="code" style={styles.colGap} themeColor="text">
                          {entry.gap_to_leader}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => setShowFullStandings(!showFullStandings)}
                  style={({ pressed }) => [
                    styles.expandButton,
                    { backgroundColor: theme.backgroundElement },
                    pressed && { opacity: 0.8 }
                  ]}
                >
                  <ThemedText type="code" style={styles.expandButtonText} themeColor="text">
                    {showFullStandings ? "↑ COLLAPSE GRID" : "↓ VIEW FULL 20-DRIVER GRID"}
                  </ThemedText>
                </Pressable>
              </ThemedView>
            )}

            {/* Section 3: Head-to-Head Battle Cards */}
            <View style={styles.battleSection}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={{ letterSpacing: 0.8, marginBottom: Spacing.two }}>
                HEAD-TO-HEAD DUELS
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.battleCarousel}
              >
                {/* Battle 1: VER vs NOR */}
                <ThemedView style={[styles.battleCard, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
                  <View style={[styles.battleTeamAccent, { backgroundColor: '#FF8000' }]} />
                  <ThemedText type="code" style={styles.battleCategory}>STANDINGS DUEL</ThemedText>
                  <View style={styles.battleRowContent}>
                    <View style={styles.battleDriverCol}>
                      <ThemedText type="subtitle" style={{ color: '#3671C6', fontWeight: 'bold' }}>VER</ThemedText>
                      <ThemedText type="code" style={{ fontSize: 9 }} themeColor="textSecondary">Red Bull</ThemedText>
                    </View>
                    <ThemedText type="code" style={styles.battleVs}>VS</ThemedText>
                    <View style={styles.battleDriverCol}>
                      <ThemedText type="subtitle" style={{ color: '#FF8000', fontWeight: 'bold' }}>NOR</ThemedText>
                      <ThemedText type="code" style={{ fontSize: 9 }} themeColor="textSecondary">McLaren</ThemedText>
                    </View>
                  </View>
                  <ThemedText type="code" style={styles.battleDelta} themeColor="text">
                    GAP: +18 PTS (VER lead)
                  </ThemedText>
                </ThemedView>

                {/* Battle 2: HAM vs LEC */}
                <ThemedView style={[styles.battleCard, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
                  <View style={[styles.battleTeamAccent, { backgroundColor: '#E8002D' }]} />
                  <ThemedText type="code" style={styles.battleCategory}>SCUDERIA DELTA</ThemedText>
                  <View style={styles.battleRowContent}>
                    <View style={styles.battleDriverCol}>
                      <ThemedText type="subtitle" style={{ color: '#E8002D', fontWeight: 'bold' }}>HAM</ThemedText>
                      <ThemedText type="code" style={{ fontSize: 9 }} themeColor="textSecondary">Ferrari</ThemedText>
                    </View>
                    <ThemedText type="code" style={styles.battleVs}>VS</ThemedText>
                    <View style={styles.battleDriverCol}>
                      <ThemedText type="subtitle" style={{ color: '#ffffff', fontWeight: 'bold' }}>LEC</ThemedText>
                      <ThemedText type="code" style={{ fontSize: 9 }} themeColor="textSecondary">Ferrari</ThemedText>
                    </View>
                  </View>
                  <ThemedText type="code" style={styles.battleDelta} themeColor="text">
                    GAP: +6 PTS (HAM lead)
                  </ThemedText>
                </ThemedView>

                {/* Battle 3: ANT vs RUS */}
                <ThemedView style={[styles.battleCard, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
                  <View style={[styles.battleTeamAccent, { backgroundColor: '#27F4D2' }]} />
                  <ThemedText type="code" style={styles.battleCategory}>SILVER ARROWS DELTA</ThemedText>
                  <View style={styles.battleRowContent}>
                    <View style={styles.battleDriverCol}>
                      <ThemedText type="subtitle" style={{ color: '#27F4D2', fontWeight: 'bold' }}>ANT</ThemedText>
                      <ThemedText type="code" style={{ fontSize: 9 }} themeColor="textSecondary">Mercedes</ThemedText>
                    </View>
                    <ThemedText type="code" style={styles.battleVs}>VS</ThemedText>
                    <View style={styles.battleDriverCol}>
                      <ThemedText type="subtitle" style={{ color: '#a1a1aa', fontWeight: 'bold' }}>RUS</ThemedText>
                      <ThemedText type="code" style={{ fontSize: 9 }} themeColor="textSecondary">Mercedes</ThemedText>
                    </View>
                  </View>
                  <ThemedText type="code" style={styles.battleDelta} themeColor="text">
                    GAP: +6 PTS (ANT lead)
                  </ThemedText>
                </ThemedView>
              </ScrollView>
            </View>

            {/* Section 4: Live Race Control Terminal (Filtered to 3) */}
            <ThemedView
              style={[
                styles.filteredFeedCard,
                { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }
              ]}
            >
              <View style={styles.gridCardHeader}>
                <SymbolView
                  name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}
                  size={15}
                  tintColor={theme.solarAmber}
                />
                <ThemedText type="smallBold" themeColor="text" style={{ letterSpacing: 0.8 }}>
                  RACE CONTROL TERMINAL (LATEST)
                </ThemedText>
              </View>

              <View style={styles.filteredFeedList}>
                {raceControl.slice(0, 3).length === 0 ? (
                  <ThemedText type="code" style={{ textAlign: 'center', paddingVertical: Spacing.two }} themeColor="textSecondary">
                    No logs recorded.
                  </ThemedText>
                ) : (
                  raceControl.slice(0, 3).map((msg, i) => {
                    const dotCol = msg.flag ? getFlagColor(msg.flag) : '#4b5563';
                    return (
                      <View key={i} style={styles.filteredFeedItem}>
                        <View style={[styles.statusDot, { backgroundColor: dotCol }]} />
                        <ThemedText type="code" style={styles.filteredFeedTime} themeColor="textSecondary">
                          [{formatTime(msg.date)}]
                        </ThemedText>
                        <ThemedText type="code" style={styles.filteredFeedText} themeColor="text" numberOfLines={1}>
                          {msg.message}
                        </ThemedText>
                      </View>
                    );
                  })
                )}
              </View>
            </ThemedView>

            {/* Launch Console CTA */}
            <Pressable
              onPress={() => setViewMode('console')}
              style={({ pressed }) => [
                styles.consoleLaunchBtn,
                { backgroundColor: theme.cosmicIndigo },
                pressed && { opacity: 0.9 },
              ]}
            >
              <SymbolView
                name={{ ios: 'terminal.fill', android: 'terminal', web: 'terminal' }}
                size={20}
                tintColor="#ffffff"
              />
              <ThemedText type="subtitle" style={styles.consoleLaunchText}>
                LAUNCH PIT WALL CONSOLE
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Live timing console back button & header */}
            <View style={styles.consoleHeader}>
              <Pressable
                onPress={() => setViewMode('home')}
                style={({ pressed }) => [
                  styles.backBtn,
                  { backgroundColor: theme.backgroundElement },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <SymbolView
                  name={{ ios: 'chevron.left', android: 'chevron_left', web: 'arrow_back' }}
                  size={14}
                  tintColor={theme.text}
                />
                <ThemedText type="code" style={[styles.backBtnText, { color: theme.text }]}>
                  BACK
                </ThemedText>
              </Pressable>

              <ThemedText type="code" style={[styles.consoleModeLabel, { color: theme.neonTeal }]}>
                // PIT WALL MODE: LIVE TIMING CONSOLE
              </ThemedText>
            </View>

            {/* HERO TITLE SECTION */}
            {session && (
              <ThemedView style={styles.heroSection}>
                <View style={styles.headerRow}>
                  <View style={styles.gpDetails}>
                    <View style={styles.accentBar} />
                    <ThemedText type="subtitle" style={styles.gpTitle} themeColor="text">
                      {session.location.toUpperCase()} GRAND PRIX
                    </ThemedText>
                    <ThemedText style={styles.gpSubtitle} themeColor="textSecondary">
                      {session.circuit_short_name} · {session.session_type} · {session.year}
                    </ThemedText>
                    <ThemedText type="code" style={styles.sessionTimesHeader} themeColor="textSecondary">
                      Start: {formatTime(session.date_start)} — End: {formatTime(session.date_end)}
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={() => setUseLocalTime(!useLocalTime)}
                    style={({ pressed }) => [
                      styles.timeToggleBtn,
                      { backgroundColor: theme.backgroundElement, borderColor: useLocalTime ? theme.neonTeal : theme.cosmicIndigo },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <SymbolView
                      name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }}
                      size={13}
                      tintColor={useLocalTime ? theme.neonTeal : theme.cosmicIndigo}
                    />
                    <ThemedText type="code" style={[styles.timeToggleText, { color: useLocalTime ? theme.neonTeal : theme.cosmicIndigo }]}>
                      {useLocalTime ? '⊙ MY TIME' : '◎ TRACK TIME'}
                    </ThemedText>
                  </Pressable>
                </View>

                <Animated.View style={[styles.flagBanner, { opacity: flagOpacity, backgroundColor: getFlagColor(trackFlag) }]}>
                  <SymbolView
                    name={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
                    size={15}
                    tintColor="#000000"
                  />
                  <ThemedText type="smallBold" style={styles.flagText}>
                    {getFlagLabel(trackFlag)}
                  </ThemedText>
                  {isLive && (
                    <View style={styles.liveIndicator}>
                      <View style={styles.liveDot} />
                      <ThemedText type="code" style={styles.liveText}>LIVE</ThemedText>
                    </View>
                  )}
                </Animated.View>
              </ThemedView>
            )}

            {/* RESPONSIVE LAYOUT */}
            <View style={styles.mainLayout}>
              
              {/* LEADERBOARD STANDINGS */}
              <View style={styles.leaderboardContainer}>
                <ThemedView 
                  style={[
                    styles.sectionCard, 
                    { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }
                  ]}
                >
                  <View style={styles.cardAccentBar} />
                  <View style={styles.sectionHeader}>
                    <SymbolView
                      name={{ ios: 'list.number', android: 'format_list_numbered', web: 'format_list_numbered' }}
                      size={15}
                      tintColor={theme.cosmicIndigo}
                    />
                    <ThemedText type="smallBold" style={styles.sectionTitle} themeColor="text">
                      SESSION STANDINGS
                    </ThemedText>
                    {leaderboard.length > 0 && (
                      <View style={[styles.driverCountBadge, { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText type="code" style={[styles.driverCountText, { color: theme.textSecondary }]}>
                          {leaderboard.length} CARS
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  <View style={styles.table}>
                    <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundElement }]}>
                      <ThemedText type="code" style={styles.colPos} themeColor="textSecondary">POS</ThemedText>
                      <ThemedText type="code" style={styles.colDriver} themeColor="textSecondary">DRIVER</ThemedText>
                      <ThemedText type="code" style={styles.colLaps} themeColor="textSecondary">LAPS</ThemedText>
                      <ThemedText type="code" style={styles.colAge} themeColor="textSecondary">AGE</ThemedText>
                      <ThemedText type="code" style={styles.colGap} themeColor="textSecondary">GAP</ThemedText>
                    </View>

                    {leaderboard.map((entry) => {
                      const isSelected = entry.driver_number === selectedDriverNumber;
                      const borderCol = entry.driver.team_colour ? `#${entry.driver.team_colour}` : theme.neonTeal;

                      return (
                        <Pressable
                          key={entry.driver_number}
                          onPress={() => {
                            setSelectedDriverNumber(entry.driver_number);
                            if (Platform.OS !== 'web') {
                              setModalVisible(true);
                            }
                          }}
                          style={({ pressed }) => [
                            styles.tableRow,
                            { borderBottomColor: 'rgba(128,128,128,0.06)' },
                            isSelected && { backgroundColor: theme.backgroundSelected },
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <View style={[styles.teamLine, { backgroundColor: borderCol }]} />
                          
                          <ThemedText 
                            type="code" 
                            style={[
                              styles.colPos, 
                              { fontWeight: 'bold' },
                              entry.dnf && { color: theme.textSecondary }
                            ]}
                          >
                            {entry.dnf ? 'DNF' : (entry.position ?? '-')}
                          </ThemedText>

                          <View style={styles.driverColContainer}>
                            {entry.driver.headshot_url ? (
                              <Image
                                source={{ uri: entry.driver.headshot_url }}
                                style={styles.driverAvatarRow}
                                resizeMode="contain"
                              />
                            ) : (
                              <View style={[styles.driverAvatarFallbackRow, { backgroundColor: theme.backgroundElement }]} />
                            )}

                            <ThemedText type="smallBold" style={styles.driverAcronym} themeColor="text">
                              {entry.driver.name_acronym}
                            </ThemedText>

                            {entry.compound && (
                              <View 
                                style={[
                                  styles.miniTyreBadge, 
                                  { 
                                    borderColor: getTyreColor(entry.compound)
                                  }
                                ]}
                              >
                                <ThemedText 
                                  type="code" 
                                  style={[
                                    styles.miniTyreText, 
                                    { color: getTyreColor(entry.compound) }
                                  ]}
                                >
                                  {getTyreLabel(entry.compound)}
                                </ThemedText>
                              </View>
                            )}

                            <ThemedText type="code" style={styles.driverLastName} themeColor="textSecondary" numberOfLines={1}>
                              {entry.driver.last_name}
                            </ThemedText>
                          </View>

                          <ThemedText type="code" style={styles.colLaps} themeColor="textSecondary">
                            {entry.number_of_laps}
                          </ThemedText>

                          <ThemedText
                            type="code"
                            style={[styles.colAge, entry.stint_age && entry.stint_age > 20 ? { color: '#f59e0b' } : undefined]}
                            themeColor={entry.stint_age && entry.stint_age > 20 ? undefined : 'textSecondary'}
                          >
                            {entry.stint_age ?? '—'}
                          </ThemedText>

                          <ThemedText type="code" style={styles.colGap} themeColor="text">
                            {entry.gap_to_leader}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </ThemedView>
              </View>

              {Platform.OS === 'web' && selectedEntry && (
                <View style={styles.sidebarContainer}>
                  <WeatherPanel sessionKey={session?.session_key ?? null} isLive={isLive} />
                  <CircuitMap
                    sessionKey={session?.session_key ?? null}
                    drivers={new Map(leaderboard.map((e) => [e.driver_number, { name_acronym: e.driver.name_acronym, team_colour: e.driver.team_colour }]))}
                    isLive={isLive}
                    highlightDriverNumber={selectedDriverNumber}
                  />

                  <View style={styles.detailCardGroup}>
                    <F1Telemetry
                      driverNumber={selectedEntry.driver_number}
                      sessionKey={session?.session_key}
                      driverColor={selectedEntry.driver.team_colour}
                      session={session}
                    />
                    <F1DriverCard
                      driver={selectedEntry.driver}
                      sessionKey={session?.session_key}
                      useLocalTime={useLocalTime}
                    />
                  </View>

                  {renderRaceControlFeed()}
                </View>
              )}

              {Platform.OS !== 'web' && (
                <View style={styles.leaderboardContainer}>
                  <WeatherPanel sessionKey={session?.session_key ?? null} isLive={isLive} />
                  <CircuitMap
                    sessionKey={session?.session_key ?? null}
                    drivers={new Map(leaderboard.map((e) => [e.driver_number, { name_acronym: e.driver.name_acronym, team_colour: e.driver.team_colour }]))}
                    isLive={isLive}
                    highlightDriverNumber={selectedDriverNumber}
                  />
                  {renderRaceControlFeed()}
                </View>
              )}

            </View>

            {Platform.OS !== 'web' && selectedEntry && (
              <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={[styles.modalContent, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
                    <View style={[styles.modalHandle, { backgroundColor: theme.backgroundElement }]} />
                    
                    <View style={styles.modalHeaderRow}>
                      <ThemedText type="smallBold" themeColor="text">TELEMETRY & TIMINGS</ThemedText>
                      <Pressable 
                        onPress={() => setModalVisible(false)}
                        style={({ pressed }) => [
                          styles.modalCloseBtn, 
                          { backgroundColor: theme.backgroundElement },
                          pressed && { opacity: 0.7 }
                        ]}
                      >
                        <ThemedText type="code" style={styles.modalCloseBtnText} themeColor="text">CLOSE</ThemedText>
                      </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.modalScroll}>
                      <View style={styles.detailCardGroup}>
                        <F1Telemetry
                          driverNumber={selectedEntry.driver_number}
                          sessionKey={session?.session_key}
                          driverColor={selectedEntry.driver.team_colour}
                          session={session}
                        />
                        <F1DriverCard
                          driver={selectedEntry.driver}
                          sessionKey={session?.session_key}
                          useLocalTime={useLocalTime}
                        />
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            )}
          </>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
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
  loadingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  heroSection: {
    alignItems: 'stretch',
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  accentBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ff1801',
    marginBottom: Spacing.one,
  },
  gpDetails: {
    alignItems: 'flex-start',
    gap: 3,
  },
  gpTitle: {
    fontWeight: 'bold',
    letterSpacing: 1.5,
    fontSize: 22,
  },
  gpSubtitle: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  sessionTimesHeader: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  timeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  timeToggleText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  flagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  flagText: {
    color: '#000000',
    letterSpacing: 0.8,
    fontSize: 12,
    fontWeight: 'bold',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.one,
    marginLeft: Spacing.two,
    gap: Spacing.one,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  mainLayout: {
    flexDirection: 'row',
    gap: Spacing.four,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  leaderboardContainer: {
    flex: 1.2,
    minWidth: 320,
  },
  sidebarContainer: {
    flex: 1,
    minWidth: 320,
    gap: Spacing.four,
  },
  detailCardGroup: {
    gap: Spacing.four,
  },
  sectionCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    gap: Spacing.three,
    ...cardShadow({ opacity: 0.2, radius: 10, offsetY: 4, elevation: 3 }),
  },
  cardAccentBar: {
    height: 3,
    backgroundColor: '#ff1801',
  },
  feedCard: {
    maxHeight: 280,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1,
    flex: 1,
  },
  driverCountBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  driverCountText: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  table: {
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: Spacing.one,
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.two,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    alignItems: 'center',
    paddingRight: Spacing.two,
    position: 'relative',
  },
  teamLine: {
    width: 3,
    position: 'absolute',
    left: 0,
    top: Spacing.one,
    bottom: Spacing.one,
    borderRadius: 1.5,
  },
  colPos: {
    width: 40,
    fontSize: 10,
    textAlign: 'center',
  },
  colDriver: {
    flex: 2,
    fontSize: 10,
  },
  driverColContainer: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  driverAvatarRow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  driverAvatarFallbackRow: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  driverAcronym: {
    fontSize: 12,
  },
  miniTyreBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  miniTyreText: {
    fontSize: 7.5,
    fontWeight: 'bold',
    lineHeight: 9,
    textAlign: 'center',
  },
  driverLastName: {
    fontSize: 10.5,
    flex: 1,
  },
  colLaps: {
    width: 40,
    fontSize: 10,
    textAlign: 'center',
  },
  colAge: {
    width: 32,
    fontSize: 9.5,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  colGap: {
    flex: 1.2,
    fontSize: 10,
    textAlign: 'right',
  },
  feedScroll: {
    maxHeight: 200,
    paddingHorizontal: Spacing.three,
  },
  emptyFeedText: {
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  feedItem: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    gap: Spacing.one,
  },
  feedMeta: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  feedTimestamp: {
    fontSize: 9.5,
  },
  lapBadge: {
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  lapBadgeText: {
    fontSize: 8,
  },
  feedFlagBadge: {
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  feedFlagText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000000',
  },
  feedText: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  // Bottom Sheet Modal specific styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '82%',
    padding: Spacing.three,
    gap: Spacing.three,
    ...cardShadow({ opacity: 0.3, radius: 12, offsetY: -4, elevation: 10 }),
  },
  modalHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: Spacing.one,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.one,
  },
  modalCloseBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  modalCloseBtnText: {
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  modalScroll: {
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  homeDashboard: {
    gap: Spacing.four,
    paddingVertical: Spacing.three,
    alignSelf: 'stretch',
  },
  heroCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.three,
    gap: Spacing.two,
    ...cardShadow({ opacity: 0.2, radius: 10, offsetY: 4, elevation: 3 }),
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pulsingLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff1801',
  },
  heroBody: {
    marginTop: Spacing.one,
  },
  heroLiveContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  heroGPTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  heroLaunchBtnText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroOfflineContent: {
    gap: Spacing.one,
    position: 'relative',
  },
  countdownValue: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  heroGPTitleOffline: {
    fontSize: 12,
  },
  minimalistTrace: {
    position: 'absolute',
    right: 0,
    bottom: -10,
    width: 120,
    height: 40,
  },
  gridCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.three,
    ...cardShadow({ opacity: 0.2, radius: 10, offsetY: 4, elevation: 3 }),
  },
  gridCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  expandButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    marginTop: Spacing.two,
  },
  expandButtonText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  battleSection: {
    alignSelf: 'stretch',
  },
  battleCarousel: {
    gap: Spacing.three,
    paddingBottom: Spacing.one,
  },
  battleCard: {
    width: 175,
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.three,
    gap: Spacing.two,
    position: 'relative',
    ...cardShadow({ opacity: 0.15, radius: 8, offsetY: 3, elevation: 2 }),
  },
  battleTeamAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  battleCategory: {
    fontSize: 8.5,
    color: '#94a3b8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  battleRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  battleDriverCol: {
    alignItems: 'flex-start',
  },
  battleVs: {
    fontSize: 9.5,
    color: '#4b5563',
    fontWeight: 'bold',
  },
  battleDelta: {
    fontSize: 9.5,
    fontWeight: 'bold',
    marginTop: Spacing.one,
  },
  filteredFeedCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.three,
    gap: Spacing.two,
    ...cardShadow({ opacity: 0.2, radius: 10, offsetY: 4, elevation: 3 }),
  },
  filteredFeedList: {
    gap: Spacing.two,
  },
  filteredFeedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filteredFeedTime: {
    fontSize: 9,
  },
  filteredFeedText: {
    fontSize: 10.5,
    flex: 1,
  },
  consoleLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: 12,
    marginTop: Spacing.two,
    ...cardShadow({ opacity: 0.3, radius: 12, offsetY: 6, elevation: 5 }),
  },
  consoleLaunchText: {
    color: '#ffffff',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  consoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    alignSelf: 'stretch',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  backBtnText: {
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  consoleModeLabel: {
    fontSize: 9.5,
    letterSpacing: 0.5,
  },
});
