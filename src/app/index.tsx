import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F1DriverCard } from '@/components/f1-driver-card';
import { F1Telemetry } from '@/components/f1-telemetry';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
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
  position: number | null;
  driver_number: number;
  driver: Driver;
  gap_to_leader: number | string | null;
  interval: number | string | null;
  number_of_laps: number;
  dnf: boolean;
  dns: boolean;
  compound?: string;
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

  const fetchData = async (isPoll = false) => {
    try {
      if (!isPoll) setLoading(true);

      // 1. Fetch latest session metadata
      const sessionRes = await fetch('https://api.openf1.org/v1/sessions?session_key=latest');
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

      // 2. Fetch all drivers for this session
      const driversRes = await fetch(`https://api.openf1.org/v1/drivers?session_key=${sKey}`);
      if (!driversRes.ok) throw new Error('Drivers fetch failed');
      const driversData: Driver[] = await driversRes.json();
      const driversMap = new Map<number, Driver>();
      driversData.forEach((d) => driversMap.set(d.driver_number, d));

      // 3. Fetch stints (tyres compound info) for all drivers
      const stintsRes = await fetch(`https://api.openf1.org/v1/stints?session_key=${sKey}`);
      if (!stintsRes.ok) throw new Error('Stints fetch failed');
      const stintsData = await stintsRes.json();
      const latestStints = new Map<number, string>();
      if (stintsData && stintsData.length > 0) {
        const sortedStints = [...stintsData].sort((a, b) => a.lap_start - b.lap_start);
        sortedStints.forEach((st) => {
          if (st.compound) {
            latestStints.set(st.driver_number, st.compound);
          }
        });
      }

      // 4. Fetch session results (standings)
      const resultsRes = await fetch(`https://api.openf1.org/v1/session_result?session_key=${sKey}`);
      if (!resultsRes.ok) throw new Error('Results fetch failed');
      const resultsData = await resultsRes.json();

      // 5. Fetch positions (real-time overlay)
      const positionsRes = await fetch(`https://api.openf1.org/v1/position?session_key=${sKey}`);
      if (!positionsRes.ok) throw new Error('Positions fetch failed');
      const positionsData = await positionsRes.json();

      // 6. Fetch latest intervals
      const intervalsRes = await fetch(`https://api.openf1.org/v1/intervals?session_key=${sKey}`);
      if (!intervalsRes.ok) throw new Error('Intervals fetch failed');
      const intervalsData = await intervalsRes.json();

      // 7. Fetch race control feed
      const rcRes = await fetch(`https://api.openf1.org/v1/race_control?session_key=${sKey}`);
      if (!rcRes.ok) throw new Error('Race control fetch failed');
      const rcData = await rcRes.json();

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
            position: res.position,
            driver_number: res.driver_number,
            driver: drv,
            gap_to_leader: res.gap_to_leader !== null && res.gap_to_leader !== undefined 
              ? (typeof res.gap_to_leader === 'number' ? `+${res.gap_to_leader.toFixed(3)}s` : res.gap_to_leader)
              : (res.position === 1 ? 'LEADER' : '--'),
            interval: res.position === 1 ? 'LEADER' : '--',
            number_of_laps: res.number_of_laps || 0,
            dnf: !!res.dnf,
            dns: !!res.dns,
            compound: latestStints.get(res.driver_number),
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

  useEffect(() => {
    fetchData();

    const interval = setInterval(() => {
      fetchData(true);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

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
      <View style={styles.sectionHeader}>
        <SymbolView
          name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}
          size={14}
          tintColor={theme.solarAmber}
        />
        <ThemedText type="smallBold" style={styles.sectionTitle} themeColor="text">
          RACE CONTROL NEWSFEED
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
        
        {/* HERO TITLE SECTION */}
        {session && (
          <ThemedView style={styles.heroSection}>
            <View style={styles.headerRow}>
              <View style={styles.gpDetails}>
                <ThemedText type="subtitle" style={styles.gpTitle} themeColor="text">
                  {session.meeting_key === 1286 ? 'MONACO GRAND PRIX' : `${session.location.toUpperCase()} GP`}
                </ThemedText>
                <ThemedText style={styles.gpSubtitle} themeColor="textSecondary">
                  {session.circuit_short_name} • {session.session_type} • {session.year}
                </ThemedText>
                <ThemedText type="code" style={styles.sessionTimesHeader} themeColor="textSecondary">
                  Start: {formatTime(session.date_start)} | End: {formatTime(session.date_end)}
                </ThemedText>
              </View>

              {/* TIMEZONE TOGGLER BUTTON */}
              <Pressable
                onPress={() => setUseLocalTime(!useLocalTime)}
                style={({ pressed }) => [
                  styles.timeToggleBtn,
                  { backgroundColor: theme.backgroundElement },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <SymbolView
                  name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }}
                  size={12}
                  tintColor={theme.cosmicIndigo}
                />
                <ThemedText type="code" style={styles.timeToggleText}>
                  {useLocalTime ? 'MY LOCATION' : 'TRACK LOCAL'}
                </ThemedText>
              </Pressable>
            </View>

            {/* LIVE TRACK FLAG BANNER (ANIMATED PULSE) */}
            <Animated.View style={[styles.flagBanner, { opacity: flagOpacity, backgroundColor: getFlagColor(trackFlag) }]}>
              <SymbolView
                name={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
                size={14}
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
              <View style={styles.sectionHeader}>
                <SymbolView
                  name={{ ios: 'list.number', android: 'format_list_numbered', web: 'format_list_numbered' }}
                  size={14}
                  tintColor={theme.solarAmber}
                />
                <ThemedText type="smallBold" style={styles.sectionTitle} themeColor="text">
                  SESSION TIMING STANDINGS
                </ThemedText>
              </View>

              <View style={styles.table}>
                {/* Header */}
                <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundElement }]}>
                  <ThemedText type="code" style={styles.colPos} themeColor="textSecondary">POS</ThemedText>
                  <ThemedText type="code" style={styles.colDriver} themeColor="textSecondary">DRIVER</ThemedText>
                  <ThemedText type="code" style={styles.colLaps} themeColor="textSecondary">LAPS</ThemedText>
                  <ThemedText type="code" style={styles.colGap} themeColor="textSecondary">GAP</ThemedText>
                </View>

                {/* Rows */}
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
                      {/* Left color bar */}
                      <View style={[styles.teamLine, { backgroundColor: borderCol }]} />
                      
                      {/* Position */}
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

                      {/* Driver Details with Avatar & Tyre Badge */}
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

                        {/* Tyre Compound Badge */}
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

                      {/* Laps */}
                      <ThemedText type="code" style={styles.colLaps} themeColor="textSecondary">
                        {entry.number_of_laps}
                      </ThemedText>

                      {/* Gap */}
                      <ThemedText type="code" style={styles.colGap} themeColor="text">
                        {entry.gap_to_leader}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </ThemedView>
          </View>

          {/* TELEMETRY & FEED DETAILS SIDEBAR (ONLY ON WEB) */}
          {Platform.OS === 'web' && selectedEntry && (
            <View style={styles.sidebarContainer}>
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

          {/* ON MOBILE, RENDER THE RACE CONTROL FEED BELOW THE STANDINGS */}
          {Platform.OS !== 'web' && (
            <View style={styles.leaderboardContainer}>
              {renderRaceControlFeed()}
            </View>
          )}

        </View>

        {/* MOBILE SLIDE-UP BOTTOM SHEET FOR TELEMETRY */}
        {Platform.OS !== 'web' && selectedEntry && (
          <Modal
            animationType="slide"
            transparent={true}
            visible={modalVisible}
            onRequestClose={() => setModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
                {/* Visual drag handle indicator */}
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
  gpDetails: {
    alignItems: 'flex-start',
    gap: 2,
  },
  gpTitle: {
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  gpSubtitle: {
    fontSize: 13,
  },
  sessionTimesHeader: {
    fontSize: 10,
  },
  timeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  timeToggleText: {
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  flagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  flagText: {
    color: '#000000',
    letterSpacing: 0.5,
    fontSize: 11,
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
    padding: Spacing.three,
    gap: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  feedCard: {
    maxHeight: 280,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 10.5,
    letterSpacing: 1,
  },
  table: {
    alignSelf: 'stretch',
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
    width: 45,
    fontSize: 10,
    textAlign: 'center',
  },
  colGap: {
    flex: 1.2,
    fontSize: 10,
    textAlign: 'right',
  },
  feedScroll: {
    maxHeight: 200,
  },
  emptyFeedText: {
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: Spacing.three,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
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
});
