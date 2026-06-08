import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { StrategyChart } from '@/components/strategy-chart';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';
import { apiCache, TTL } from '@/utils/api-cache';

interface Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_key: number;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
  gmt_offset?: string;
}

interface GroupedMeeting {
  meeting_key: number;
  circuit_short_name: string;
  country_name: string;
  location: string;
  gmt_offset?: string;
  sessions: Session[];
}

interface ResultEntry {
  position: number | null;
  driver_number: number;
  number_of_laps: number;
  points: number;
  dnf: boolean;
  dns: boolean;
  gap_to_leader: number | string | null;
  duration: number | null;
  driver?: {
    full_name: string;
    name_acronym: string;
    team_name: string;
    team_colour: string;
  };
}

export default function ExploreSessionsScreen() {
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
  const [meetings, setMeetings] = useState<GroupedMeeting[]>([]);
  const [selectedMeetingKey, setSelectedMeetingKey] = useState<number | null>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [sessionResults, setSessionResults] = useState<ResultEntry[]>([]);

  // Timezone toggle state
  const [useLocalTime, setUseLocalTime] = useState(true);

  // Mobile modal state
  const [modalVisible, setModalVisible] = useState(false);

  // useFocusEffect: Explore tab only loads sessions when first visited,
  // avoiding simultaneous startup requests from all three tabs.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const fetchSessions = async () => {
        try {
          setLoading(true);
          const data = await apiCache.fetch<Session[]>(
            'sessions-2026',
            async () => {
              const res = await fetchWithRetry('https://api.openf1.org/v1/sessions?year=2026');
              if (!res.ok) throw new Error('Failed to fetch sessions');
              return res.json();
            },
            TTL.raceCalendar
          );

          if (cancelled) return;

          if (data && data.length > 0) {
            const meetingsMap = new Map<number, GroupedMeeting>();
            data.forEach((s) => {
              const existing = meetingsMap.get(s.meeting_key);
              if (existing) {
                existing.sessions.push(s);
              } else {
                meetingsMap.set(s.meeting_key, {
                  meeting_key: s.meeting_key,
                  circuit_short_name: s.circuit_short_name,
                  country_name: s.country_name,
                  location: s.location,
                  gmt_offset: s.gmt_offset,
                  sessions: [s],
                });
              }
            });

            // Sort sessions within each meeting chronologically
            meetingsMap.forEach((m) => {
              m.sessions.sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
            });

            const allMeetings = Array.from(meetingsMap.values());
            const now = new Date();

            // Split into upcoming (race weekend hasn't ended yet) and past
            const upcoming = allMeetings
              .filter((m) => {
                const lastSession = m.sessions[m.sessions.length - 1];
                const endDate = lastSession.date_end ? new Date(lastSession.date_end) : new Date(lastSession.date_start);
                return endDate >= now;
              })
              .sort((a, b) => new Date(a.sessions[0].date_start).getTime() - new Date(b.sessions[0].date_start).getTime());

            const past = allMeetings
              .filter((m) => {
                const lastSession = m.sessions[m.sessions.length - 1];
                const endDate = lastSession.date_end ? new Date(lastSession.date_end) : new Date(lastSession.date_start);
                return endDate < now;
              })
              .sort((a, b) => new Date(b.sessions[0].date_start).getTime() - new Date(a.sessions[0].date_start).getTime());

            // Upcoming races first, past races after
            const sortedMeetings = [...upcoming, ...past];

            setMeetings(sortedMeetings);

            // Pre-select the next upcoming race (or most recent past)
            const defaultMeeting = upcoming.length > 0 ? upcoming[0] : past.length > 0 ? past[0] : null;
            if (defaultMeeting) {
              setSelectedMeetingKey(defaultMeeting.meeting_key);
              if (defaultMeeting.sessions.length > 0) {
                setSelectedSessionKey(defaultMeeting.sessions[0].session_key);
              }
            }
          }
          if (!cancelled) setLoading(false);
        } catch (err) {
          console.warn('Error fetching sessions:', err);
          if (!cancelled) setLoading(false);
        }
      };

      // Only fetch if we haven't loaded yet
      if (meetings.length === 0) {
        fetchSessions();
      }

      return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meetings.length])
  );

  useEffect(() => {
    if (!selectedSessionKey) return;

    let active = true;
    const fetchResults = async () => {
      try {
        setResultsLoading(true);

        const results = await apiCache.fetch(
          `session-results-${selectedSessionKey}`,
          async () => {
            const resultsRes = await fetchWithRetry(
              `https://api.openf1.org/v1/session_result?session_key=${selectedSessionKey}`
            );
            if (resultsRes.status === 404) return [];
            if (!resultsRes.ok) throw new Error('Results fetch failed');
            return resultsRes.json();
          },
          TTL.sessionMeta
        );

        if (!active) return;

        const drivers = await apiCache.fetch(
          `session-drivers-${selectedSessionKey}`,
          async () => {
            const driversRes = await fetchWithRetry(
              `https://api.openf1.org/v1/drivers?session_key=${selectedSessionKey}`
            );
            if (!driversRes.ok) throw new Error('Drivers fetch failed');
            return driversRes.json();
          },
          TTL.driverRoster
        );

        if (!active) return;

        const driversMap = new Map<number, any>();
        drivers.forEach((d: any) => driversMap.set(d.driver_number, d));

        if (results && results.length > 0) {
          const enrichedResults = results.map((entry: any) => ({
            ...entry,
            driver: driversMap.get(entry.driver_number),
          }));

          enrichedResults.sort((a: any, b: any) => {
            if (a.position === null) return 1;
            if (b.position === null) return -1;
            return a.position - b.position;
          });

          setSessionResults(enrichedResults);
        } else {
          setSessionResults([]);
        }
        setResultsLoading(false);
      } catch (err) {
        console.warn('Error fetching results:', err);
        if (active) {
          setSessionResults([]);
          setResultsLoading(false);
        }
      }
    };

    fetchResults();

    return () => {
      active = false;
    };
  }, [selectedSessionKey]);

  const selectedMeeting = meetings.find((m) => m.meeting_key === selectedMeetingKey);
  const selectedSession = selectedMeeting?.sessions.find((s) => s.session_key === selectedSessionKey);

  // Helper to determine if a meeting is upcoming
  const isMeetingUpcoming = (meeting: GroupedMeeting) => {
    const lastSession = meeting.sessions[meeting.sessions.length - 1];
    const endDate = lastSession.date_end ? new Date(lastSession.date_end) : new Date(lastSession.date_start);
    return endDate >= new Date();
  };

  // Helper to determine if a meeting is the very next race
  const isNextRace = meetings.length > 0 && isMeetingUpcoming(meetings[0]) ? meetings[0].meeting_key : null;

  // Round number (index in the full sorted list + 1)
  const getMeetingRound = (meeting_key: number) => {
    // Sort all meetings chronologically to get round number
    const allChronological = [...meetings].sort((a, b) =>
      new Date(a.sessions[0].date_start).getTime() - new Date(b.sessions[0].date_start).getTime()
    );
    const idx = allChronological.findIndex((m) => m.meeting_key === meeting_key);
    return idx >= 0 ? idx + 1 : null;
  };

  const formatLapTime = (time: number | null) => {
    if (!time) return '--:--';
    const mins = Math.floor(time / 60);
    const secs = (time % 60).toFixed(3);
    if (mins > 0) {
      return `${mins}:${secs.padStart(6, '0')}`;
    }
    return secs;
  };

  const formatTime = (dateStr: string, gmtOffsetStr?: string) => {
    const date = new Date(dateStr);
    if (useLocalTime) {
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      const offset = gmtOffsetStr || '00:00:00';
      const parts = offset.split(':');
      const offsetMs = (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + (parseInt(parts[2]) || 0)) * 1000;
      const trackDate = new Date(date.getTime() + offsetMs);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[trackDate.getUTCMonth()];
      const day = trackDate.getUTCDate();
      const hours = trackDate.getUTCHours().toString().padStart(2, '0');
      const minutes = trackDate.getUTCMinutes().toString().padStart(2, '0');
      return `${month} ${day}, ${hours}:${minutes}`;
    }
  };

  const renderResultsContent = () => {
    if (resultsLoading) {
      return (
        <View style={styles.resultsLoading}>
          <ActivityIndicator size="small" color={theme.cosmicIndigo} />
          <ThemedText type="code" themeColor="textSecondary">Retrieving standings...</ThemedText>
        </View>
      );
    }

    if (sessionResults.length === 0) {
      return (
        <View style={styles.emptyResults}>
          <ThemedText type="code" style={styles.emptyText} themeColor="textSecondary">
            No results available for this session.
          </ThemedText>
        </View>
      );
    }

    return (
      <ScrollView style={styles.resultsTableWrapper} nestedScrollEnabled>
        <View style={styles.table}>
          {/* Header */}
          <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundElement }]}>
            <ThemedText type="code" style={styles.colPos} themeColor="textSecondary">POS</ThemedText>
            <ThemedText type="code" style={styles.colDriver} themeColor="textSecondary">DRIVER</ThemedText>
            <ThemedText type="code" style={styles.colLaps} themeColor="textSecondary">LAPS</ThemedText>
            <ThemedText type="code" style={styles.colTime} themeColor="textSecondary">GAP/TIME</ThemedText>
            {selectedSession?.session_type === 'Race' && (
              <ThemedText type="code" style={styles.colPts} themeColor="textSecondary">PTS</ThemedText>
            )}
          </View>

          {/* Rows */}
          {sessionResults.map((entry) => {
            const borderCol = entry.driver?.team_colour ? `#${entry.driver.team_colour}` : theme.neonTeal;
            
            return (
              <View 
                key={entry.driver_number} 
                style={[styles.tableRow, { borderBottomColor: 'rgba(128,128,128,0.06)' }]}
              >
                {/* Left team color line */}
                <View style={[styles.teamLine, { backgroundColor: borderCol }]} />

                <ThemedText type="code" style={[styles.colPos, { fontWeight: 'bold' }]}>
                  {entry.dnf ? 'DNF' : (entry.position ?? '-')}
                </ThemedText>

                <View style={styles.driverColContainer}>
                  <ThemedText type="smallBold" style={styles.driverAcronym}>
                    {entry.driver?.name_acronym || entry.driver_number}
                  </ThemedText>
                  <ThemedText type="code" style={styles.driverLastName} themeColor="textSecondary" numberOfLines={1}>
                    {entry.driver ? entry.driver.full_name.split(' ').slice(-1)[0] : `CAR ${entry.driver_number}`}
                  </ThemedText>
                </View>

                <ThemedText type="code" style={styles.colLaps} themeColor="textSecondary">
                  {entry.number_of_laps}
                </ThemedText>

                <ThemedText type="code" style={styles.colTime} themeColor="text">
                  {entry.dnf ? 'DNF' : (entry.dns ? 'DNS' : (entry.gap_to_leader === 0 || entry.gap_to_leader === '0' ? 'LEADER' : (entry.gap_to_leader ? `+${entry.gap_to_leader}s` : formatLapTime(entry.duration))))}
                </ThemedText>

                {selectedSession?.session_type === 'Race' && (
                  <ThemedText type="code" style={[styles.colPts, entry.points > 0 && { color: theme.solarAmber, fontWeight: 'bold' }]} themeColor="text">
                    {entry.points}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </View>

        {selectedSession && sessionResults.length > 0 && (
          <View style={{ marginTop: Spacing.four, paddingBottom: Spacing.three }}>
            <StrategyChart
              sessionKey={selectedSessionKey}
              drivers={(() => {
                const map = new Map<number, { name_acronym: string; team_colour: string }>();
                sessionResults.forEach((entry) => {
                  map.set(entry.driver_number, {
                    name_acronym: entry.driver?.name_acronym || `${entry.driver_number}`,
                    team_colour: entry.driver?.team_colour || '94a3b8',
                  });
                });
                return map;
              })()}
              totalLaps={Math.max(0, ...sessionResults.map(r => r.number_of_laps))}
            />
          </View>
        )}
      </ScrollView>
    );
  };

  // Compute whether any upcoming meetings exist for section divider
  const hasUpcoming = meetings.some(isMeetingUpcoming);
  const hasPast = meetings.some((m) => !isMeetingUpcoming(m));
  let renderedUpcomingDivider = false;
  let renderedPastDivider = false;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        
        {/* HEADER SECTION WITH TOGGLER */}
        <ThemedView style={styles.titleContainer}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitles}>
              {/* Red accent bar */}
              <View style={styles.accentBar} />
              <ThemedText type="subtitle" style={styles.titleText}>RACE CALENDAR 2026</ThemedText>
              <ThemedText style={styles.subtitleText} themeColor="textSecondary">
                {meetings.filter(isMeetingUpcoming).length} races remaining · tap a session to view results
              </ThemedText>
            </View>

            {/* TIMEZONE TOGGLER BUTTON */}
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
        </ThemedView>

        {/* CONTENT LAYOUT */}
        <View style={styles.contentLayout}>
          
          {/* LEFT PANEL: SELECT MEETINGS & SESSIONS */}
          <View style={styles.meetingsCol}>
            {meetings.map((meeting) => {
              const isSelectedMeeting = meeting.meeting_key === selectedMeetingKey;
              const upcoming = isMeetingUpcoming(meeting);
              const isNext = meeting.meeting_key === isNextRace;
              const round = getMeetingRound(meeting.meeting_key);

              // Section dividers
              let upcomingDivider = null;
              let pastDivider = null;
              if (upcoming && !renderedUpcomingDivider) {
                renderedUpcomingDivider = true;
                upcomingDivider = (
                  <View key="divider-upcoming" style={styles.sectionDivider}>
                    <View style={[styles.dividerLine, { backgroundColor: theme.neonTeal }]} />
                    <ThemedText type="code" style={[styles.dividerLabel, { color: theme.neonTeal }]}>UPCOMING</ThemedText>
                    <View style={[styles.dividerLine, { backgroundColor: theme.neonTeal }]} />
                  </View>
                );
              } else if (!upcoming && !renderedPastDivider && hasPast && hasUpcoming) {
                renderedPastDivider = true;
                pastDivider = (
                  <View key="divider-past" style={styles.sectionDivider}>
                    <View style={[styles.dividerLine, { backgroundColor: theme.backgroundElement }]} />
                    <ThemedText type="code" style={[styles.dividerLabel, { color: theme.textSecondary }]}>COMPLETED</ThemedText>
                    <View style={[styles.dividerLine, { backgroundColor: theme.backgroundElement }]} />
                  </View>
                );
              }

              return (
                <React.Fragment key={meeting.meeting_key}>
                  {upcomingDivider}
                  {pastDivider}
                  <ThemedView
                    style={[
                      styles.gpCard,
                      {
                        backgroundColor: isNext ? 'rgba(255,24,1,0.06)' : (upcoming ? 'rgba(0,229,255,0.04)' : theme.cardBackground),
                        borderColor: isNext ? theme.cosmicIndigo : (isSelectedMeeting ? theme.neonTeal : theme.backgroundElement),
                        borderWidth: isNext || isSelectedMeeting ? 1.5 : 1,
                        opacity: upcoming ? 1 : 0.75,
                      },
                    ]}>

                    {/* NEXT RACE top accent bar */}
                    {isNext && <View style={[styles.nextRaceAccent, { backgroundColor: theme.cosmicIndigo }]} />}

                    {/* GP Header */}
                    <Pressable 
                      onPress={() => {
                        setSelectedMeetingKey(meeting.meeting_key);
                        if (meeting.sessions.length > 0) {
                          setSelectedSessionKey(meeting.sessions[0].session_key);
                        }
                      }}
                      style={styles.gpCardHeader}
                    >
                      <View style={styles.gpMeta}>
                        <View style={styles.gpTitleRow}>
                          {round !== null && (
                            <View style={[styles.roundBadge, { backgroundColor: isNext ? theme.cosmicIndigo : theme.backgroundElement }]}>
                              <ThemedText type="code" style={[styles.roundText, { color: isNext ? '#fff' : theme.textSecondary }]}>
                                R{round}
                              </ThemedText>
                            </View>
                          )}
                          <ThemedText type="smallBold" style={[styles.gpMeetingTitle, isNext && { color: theme.cosmicIndigo }]}>
                            {meeting.location.toUpperCase()} GP
                          </ThemedText>
                          {isNext && (
                            <View style={[styles.nextBadge, { backgroundColor: theme.cosmicIndigo }]}>
                              <ThemedText type="code" style={styles.nextBadgeText}>NEXT</ThemedText>
                            </View>
                          )}
                          {!upcoming && (
                            <View style={[styles.doneBadge, { backgroundColor: theme.backgroundElement }]}>
                              <ThemedText type="code" style={[styles.doneBadgeText, { color: theme.textSecondary }]}>DONE</ThemedText>
                            </View>
                          )}
                        </View>
                        <ThemedText type="code" style={styles.gpCircuitName} themeColor="textSecondary">
                          {meeting.circuit_short_name} · {meeting.country_name}
                        </ThemedText>
                        {/* Weekend start date */}
                        <ThemedText type="code" style={styles.gpDateText} themeColor="textSecondary">
                          {formatTime(meeting.sessions[0].date_start, meeting.gmt_offset)}
                        </ThemedText>
                      </View>
                      <SymbolView
                        name={isSelectedMeeting ? { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' } : { ios: 'chevron.forward', android: 'navigate_next', web: 'navigate_next' }}
                        size={14}
                        tintColor={isSelectedMeeting ? theme.neonTeal : theme.textSecondary}
                      />
                    </Pressable>

                    {/* Sessions details lists */}
                    {isSelectedMeeting && (
                      <View style={[styles.sessionsList, { borderTopColor: theme.backgroundElement }]}>
                        {meeting.sessions.map((sess) => {
                          const isSelectedSess = sess.session_key === selectedSessionKey;
                          const sessDate = new Date(sess.date_start);
                          const isPastSess = sessDate < new Date();
                          return (
                            <Pressable
                              key={sess.session_key}
                              onPress={() => {
                                setSelectedSessionKey(sess.session_key);
                                if (Platform.OS !== 'web') {
                                  setModalVisible(true);
                                }
                              }}
                              style={({ pressed }) => [
                                styles.sessionItem,
                                isSelectedSess && [styles.sessionItemActive, { backgroundColor: theme.backgroundSelected }],
                                pressed && { opacity: 0.8 },
                              ]}
                            >
                              <View style={styles.sessionStatusCol}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={[styles.sessStatusDot, { backgroundColor: isPastSess ? theme.textSecondary : theme.neonTeal }]} />
                                  <ThemedText type="code" style={[styles.sessionName, isSelectedSess && { color: theme.neonTeal }]} themeColor="text">
                                    {sess.session_name}
                                  </ThemedText>
                                </View>
                                <ThemedText type="code" style={styles.sessionTime} themeColor="textSecondary">
                                  {formatTime(sess.date_start, meeting.gmt_offset)}
                                </ThemedText>
                              </View>
                              <SymbolView
                                name={{ ios: 'chevron.forward', android: 'navigate_next', web: 'navigate_next' }}
                                size={12}
                                tintColor={isSelectedSess ? theme.neonTeal : theme.backgroundElement}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                  </ThemedView>
                </React.Fragment>
              );
            })}
          </View>

          {/* RIGHT PANEL: SESSION RESULTS (ONLY ON WEB) */}
          {Platform.OS === 'web' && (
            <View style={styles.resultsCol}>
              {selectedSession ? (
                <ThemedView
                  style={[
                    styles.resultsCard,
                    { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement },
                  ]}
                >
                  {/* Header info */}
                  <View style={[styles.resultsHeader, { borderBottomColor: theme.backgroundElement }]}>
                    <SymbolView
                      name={{ ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' }}
                      size={16}
                      tintColor={theme.solarAmber}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText type="subtitle" style={styles.resultsTitle}>
                        {selectedSession.session_name.toUpperCase()} RESULTS
                      </ThemedText>
                      <ThemedText type="code" style={styles.resultsSubtitle} themeColor="textSecondary">
                        {selectedMeeting?.location} GP • {selectedSession.year}
                      </ThemedText>
                    </View>
                  </View>
                  {renderResultsContent()}
                </ThemedView>
              ) : (
                <View style={styles.noSelection}>
                  <ThemedText type="code" themeColor="textSecondary">Select GP session to view results.</ThemedText>
                </View>
              )}
            </View>
          )}

        </View>

        {/* MOBILE SLIDE-UP BOTTOM SHEET FOR EXPLORER RESULTS */}
        {Platform.OS !== 'web' && selectedSession && (
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
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" themeColor="text">
                      {selectedSession.session_name.toUpperCase()} STANDINGS
                    </ThemedText>
                    <ThemedText type="code" style={styles.resultsSubtitleMobile} themeColor="textSecondary">
                      {selectedMeeting?.location} GP
                    </ThemedText>
                  </View>
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

                {renderResultsContent()}
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === 'web' && <WebBadge />}
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
  titleContainer: {
    paddingVertical: Spacing.four,
    alignItems: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headerTitles: {
    gap: Spacing.two,
    flex: 1,
    minWidth: 280,
  },
  accentBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ff1801',
    marginBottom: 2,
  },
  titleText: {
    fontWeight: 'bold',
    letterSpacing: 2,
    fontSize: 20,
  },
  subtitleText: {
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.3,
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
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  contentLayout: {
    flexDirection: 'row',
    gap: Spacing.four,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  meetingsCol: {
    flex: 1,
    minWidth: 320,
    gap: Spacing.two,
  },
  resultsCol: {
    flex: 1.2,
    minWidth: 320,
  },
  gpCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.2, radius: 12, offsetY: 6, elevation: 3 }),
  },
  nextRaceAccent: {
    height: 3,
    width: '100%',
  },
  gpCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  gpMeta: {
    gap: 4,
    flex: 1,
  },
  gpTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  roundBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  roundText: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  nextBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nextBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  doneBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  doneBadgeText: {
    fontSize: 8,
    letterSpacing: 0.5,
  },
  gpMeetingTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  gpCircuitName: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
  gpDateText: {
    fontSize: 9,
    letterSpacing: 0.2,
    marginTop: 1,
  },
  sessStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sessionsList: {
    borderTopWidth: 1,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  sessionItemActive: {
    borderWidth: 0,
  },
  sessionStatusCol: {
    gap: 2,
  },
  sessionName: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  sessionTime: {
    fontSize: 9.5,
  },
  resultsCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    ...cardShadow({ opacity: 0.2, radius: 10, offsetY: 4, elevation: 3 }),
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
  },
  resultsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  resultsSubtitle: {
    fontSize: 10,
    marginTop: 2,
  },
  resultsSubtitleMobile: {
    fontSize: 8.5,
  },
  resultsLoading: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyResults: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 11,
  },
  noSelection: {
    flex: 1,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Spacing.three,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  resultsTableWrapper: {
    maxHeight: 450,
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
    width: 35,
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
  driverAcronym: {
    fontSize: 11,
    fontWeight: 'bold',
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
  colTime: {
    flex: 2.2,
    fontSize: 10,
    textAlign: 'right',
  },
  colPts: {
    width: 35,
    fontSize: 10,
    textAlign: 'right',
  },
  // Modal spec styles
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
});
