import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

interface DriverCardProps {
  driver: {
    driver_number: number;
    full_name: string;
    name_acronym: string;
    team_name: string;
    team_colour: string;
    headshot_url: string;
  };
  sessionKey: number;
  useLocalTime?: boolean;
}

interface LapData {
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
}

interface StintData {
  compound: string;
  lap_start: number;
  tyre_age_at_start: number;
}

interface RadioMessage {
  date: string;
  recording_url: string;
}

export function F1DriverCard({ driver, sessionKey, useLocalTime = true }: DriverCardProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [laps, setLaps] = useState<LapData[]>([]);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [bestS1, setBestS1] = useState<number | null>(null);
  const [bestS2, setBestS2] = useState<number | null>(null);
  const [bestS3, setBestS3] = useState<number | null>(null);

  // Stint / Tyre data states
  const [compound, setCompound] = useState<string | null>(null);
  const [tyreAge, setTyreAge] = useState<number | null>(null);

  // Team Radio state
  const [radioMsgs, setRadioMsgs] = useState<RadioMessage[]>([]);

  // Tab state: 'laps' | 'radio'
  const [activeTab, setActiveTab] = useState<'laps' | 'radio'>('laps');

  const teamColor = driver.team_colour ? `#${driver.team_colour}` : theme.neonTeal;

  useEffect(() => {
    let active = true;
    setLoading(true);

    const fetchDriverData = async () => {
      try {
        // Fetch laps
        const lapsPromise = fetch(
          `https://api.openf1.org/v1/laps?session_key=${sessionKey}&driver_number=${driver.driver_number}`
        ).then(r => r.json());

        // Fetch stints
        const stintsPromise = fetch(
          `https://api.openf1.org/v1/stints?session_key=${sessionKey}&driver_number=${driver.driver_number}`
        ).then(r => r.json());

        // Fetch radio
        const radioPromise = fetch(
          `https://api.openf1.org/v1/team_radio?session_key=${sessionKey}&driver_number=${driver.driver_number}`
        ).then(r => r.json());

        const [lapsData, stintsData, radioData] = await Promise.all([lapsPromise, stintsPromise, radioPromise]);

        if (!active) return;

        // Process Stints
        if (stintsData && stintsData.length > 0) {
          const sortedStints = [...stintsData].sort((a, b) => b.lap_start - a.lap_start);
          const currentStint = sortedStints[0];
          setCompound(currentStint.compound);
          
          if (lapsData && lapsData.length > 0) {
            const sortedLaps = [...lapsData].sort((a, b) => b.lap_number - a.lap_number);
            const latestLapNumber = sortedLaps[0].lap_number;
            const age = currentStint.tyre_age_at_start + (latestLapNumber - currentStint.lap_start);
            setTyreAge(Math.max(1, age));
          } else {
            setTyreAge(currentStint.tyre_age_at_start);
          }
        } else {
          setCompound(null);
          setTyreAge(null);
        }

        // Process Radio Messages
        if (radioData && radioData.length > 0) {
          const sortedRadio = [...radioData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setRadioMsgs(sortedRadio);
        } else {
          setRadioMsgs([]);
        }

        // Process Laps
        if (lapsData && lapsData.length > 0) {
          const sortedLaps = [...lapsData].sort((a, b) => a.lap_number - b.lap_number);
          setLaps(sortedLaps);

          const validLaps = sortedLaps.filter(l => l.lap_duration && l.lap_duration > 0 && !l.is_pit_out_lap);
          if (validLaps.length > 0) {
            const pb = Math.min(...validLaps.map(l => l.lap_duration as number));
            setPersonalBest(pb);
          }

          const s1Times = sortedLaps.map(l => l.duration_sector_1).filter(t => t && t > 0) as number[];
          if (s1Times.length > 0) setBestS1(Math.min(...s1Times));

          const s2Times = sortedLaps.map(l => l.duration_sector_2).filter(t => t && t > 0) as number[];
          if (s2Times.length > 0) setBestS2(Math.min(...s2Times));

          const s3Times = sortedLaps.map(l => l.duration_sector_3).filter(t => t && t > 0) as number[];
          if (s3Times.length > 0) setBestS3(Math.min(...s3Times));
        } else {
          setLaps([]);
          setPersonalBest(null);
          setBestS1(null);
          setBestS2(null);
          setBestS3(null);
        }
        setLoading(false);
      } catch (err) {
        console.warn('Error fetching driver details:', err);
        if (active) setLoading(false);
      }
    };

    fetchDriverData();

    return () => {
      active = false;
    };
  }, [driver.driver_number, sessionKey]);

  const formatLapTime = (time: number | null) => {
    if (!time) return '--:--';
    const mins = Math.floor(time / 60);
    const secs = (time % 60).toFixed(3);
    if (mins > 0) {
      return `${mins}:${secs.padStart(6, '0')}`;
    }
    return secs;
  };

  const formatRadioTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (useLocalTime) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      // Approximate track offset conversion
      return date.getUTCHours().toString().padStart(2, '0') + ':' + date.getUTCMinutes().toString().padStart(2, '0');
    }
  };

  const getTyreBadgeColors = (comp: string) => {
    switch (comp.toUpperCase()) {
      case 'SOFT':
        return { color: '#ef4444', label: 'S' };
      case 'MEDIUM':
        return { color: '#eab308', label: 'M' };
      case 'HARD':
        return { color: '#ffffff', label: 'H' };
      case 'INTERMEDIATE':
        return { color: '#22c55e', label: 'I' };
      case 'WET':
        return { color: '#3b82f6', label: 'W' };
      default:
        return { color: '#94a3b8', label: '?' };
    }
  };

  const playRadioAudio = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      console.warn('Error launching radio player:', err);
    }
  };

  const recentLaps = laps.slice(-5).reverse();

  return (
    <ThemedView
      style={[
        styles.card,
        {
          backgroundColor: theme.cardBackground,
          borderColor: theme.backgroundElement,
        },
      ]}>
      {/* Red accent racing stripe */}
      <View style={[styles.stripe, { backgroundColor: theme.cosmicIndigo }]} />

      {/* DRIVER INFO ROW */}
      <View style={styles.profileRow}>
        {driver.headshot_url ? (
          <Image
            source={{ uri: driver.headshot_url }}
            style={[styles.headshot, { borderColor: teamColor }]}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: theme.backgroundElement, borderColor: teamColor }]}>
            <ThemedText type="subtitle" themeColor="textSecondary">
              {driver.name_acronym}
            </ThemedText>
          </View>
        )}

        <View style={styles.driverMeta}>
          <View style={styles.nameContainer}>
            <View style={[styles.numberBadge, { backgroundColor: teamColor }]}>
              <ThemedText type="code" style={styles.driverNumText}>
                {driver.driver_number}
              </ThemedText>
            </View>
            <ThemedText type="subtitle" style={styles.fullName} themeColor="text">
              {driver.full_name}
            </ThemedText>

            {/* TYRE BADGE */}
            {compound && (
              <View style={styles.badgeWrapper}>
                <View 
                  style={[
                    styles.tyreBadge, 
                    { 
                      borderColor: getTyreBadgeColors(compound).color,
                    }
                  ]}
                >
                  <ThemedText 
                    type="code" 
                    style={[
                      styles.tyreText, 
                      { color: getTyreBadgeColors(compound).color }
                    ]}
                  >
                    {getTyreBadgeColors(compound).label}
                  </ThemedText>
                </View>
                {tyreAge !== null && (
                  <ThemedText type="code" style={styles.tyreAgeText} themeColor="textSecondary">
                    L{tyreAge}
                  </ThemedText>
                )}
              </View>
            )}
          </View>
          <ThemedText type="default" style={styles.teamName} themeColor="textSecondary">
            {driver.team_name}
          </ThemedText>
        </View>
      </View>

      {/* SECTOR BEST STATS */}
      <View style={[styles.sectorsContainer, { backgroundColor: theme.background }]}>
        <View style={styles.sectorCol}>
          <ThemedText type="code" style={styles.sectorLabel} themeColor="textSecondary">BEST S1</ThemedText>
          <ThemedText type="code" style={styles.sectorValue} themeColor="text">
            {bestS1 ? `${bestS1.toFixed(3)}s` : '--'}
          </ThemedText>
        </View>
        <View style={styles.sectorCol}>
          <ThemedText type="code" style={styles.sectorLabel} themeColor="textSecondary">BEST S2</ThemedText>
          <ThemedText type="code" style={styles.sectorValue} themeColor="text">
            {bestS2 ? `${bestS2.toFixed(3)}s` : '--'}
          </ThemedText>
        </View>
        <View style={styles.sectorCol}>
          <ThemedText type="code" style={styles.sectorLabel} themeColor="textSecondary">BEST S3</ThemedText>
          <ThemedText type="code" style={styles.sectorValue} themeColor="text">
            {bestS3 ? `${bestS3.toFixed(3)}s` : '--'}
          </ThemedText>
        </View>
        <View style={styles.sectorCol}>
          <ThemedText type="code" style={styles.sectorLabel} themeColor="textSecondary">PB LAP</ThemedText>
          <ThemedText type="code" style={[styles.sectorValue, { color: theme.solarAmber }]}>
            {formatLapTime(personalBest)}
          </ThemedText>
        </View>
      </View>

      {/* HIGH TECH TAB BAR SELECTOR */}
      <View style={[styles.tabBar, { borderBottomColor: theme.backgroundElement }]}>
        <Pressable
          onPress={() => setActiveTab('laps')}
          style={[
            styles.tabItem,
            activeTab === 'laps' && [styles.tabItemActive, { borderBottomColor: theme.cosmicIndigo }]
          ]}
        >
          <ThemedText 
            type="smallBold" 
            themeColor={activeTab === 'laps' ? 'text' : 'textSecondary'}
          >
            LAP TIMES
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('radio')}
          style={[
            styles.tabItem,
            activeTab === 'radio' && [styles.tabItemActive, { borderBottomColor: theme.cosmicIndigo }]
          ]}
        >
          <View style={styles.radioTabContainer}>
            <ThemedText 
              type="smallBold" 
              themeColor={activeTab === 'radio' ? 'text' : 'textSecondary'}
            >
              TEAM RADIO
            </ThemedText>
            {radioMsgs.length > 0 && (
              <View style={[styles.radioBadge, { backgroundColor: theme.cosmicIndigo }]}>
                <ThemedText type="code" style={styles.radioBadgeText}>{radioMsgs.length}</ThemedText>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {/* CONTENT LOG */}
      {loading ? (
        <View style={styles.lapsLoading}>
          <ActivityIndicator size="small" color={teamColor} />
        </View>
      ) : activeTab === 'laps' ? (
        /* LAP LIST LOG */
        <View style={styles.lapsHistory}>
          {recentLaps.length === 0 ? (
            <View style={styles.emptyLaps}>
              <ThemedText type="code" style={styles.emptyText} themeColor="textSecondary">
                No laps logged in this session yet.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.lapsTable}>
              <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundElement }]}>
                <ThemedText type="code" style={styles.colLap} themeColor="textSecondary">LAP</ThemedText>
                <ThemedText type="code" style={styles.colTime} themeColor="textSecondary">LAP TIME</ThemedText>
                <ThemedText type="code" style={styles.colSector} themeColor="textSecondary">S1</ThemedText>
                <ThemedText type="code" style={styles.colSector} themeColor="textSecondary">S2</ThemedText>
                <ThemedText type="code" style={styles.colSector} themeColor="textSecondary">S3</ThemedText>
              </View>

              {recentLaps.map((lap) => {
                const isPb = lap.lap_duration === personalBest && personalBest !== null;
                return (
                  <View 
                    key={lap.lap_number} 
                    style={[styles.tableRow, { borderBottomColor: 'rgba(128,128,128,0.06)' }]}
                  >
                    <ThemedText type="code" style={styles.colLap} themeColor="text">
                      {lap.lap_number}
                    </ThemedText>
                    <ThemedText 
                      type="code" 
                      style={[
                        styles.colTime, 
                        isPb && { color: theme.solarAmber, fontWeight: 'bold' },
                        lap.is_pit_out_lap && { color: theme.textSecondary }
                      ]}
                    >
                      {lap.is_pit_out_lap ? 'PIT IN/OUT' : formatLapTime(lap.lap_duration)}
                    </ThemedText>
                    <ThemedText type="code" style={styles.colSector} themeColor="textSecondary">
                      {lap.duration_sector_1 ? lap.duration_sector_1.toFixed(1) : '-'}
                    </ThemedText>
                    <ThemedText type="code" style={styles.colSector} themeColor="textSecondary">
                      {lap.duration_sector_2 ? lap.duration_sector_2.toFixed(1) : '-'}
                    </ThemedText>
                    <ThemedText type="code" style={styles.colSector} themeColor="textSecondary">
                      {lap.duration_sector_3 ? lap.duration_sector_3.toFixed(1) : '-'}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        /* TEAM RADIO LIST LOG */
        <View style={styles.radioHistory}>
          {radioMsgs.length === 0 ? (
            <View style={styles.emptyLaps}>
              <ThemedText type="code" style={styles.emptyText} themeColor="textSecondary">
                No radio transmissions recorded.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.radioList}>
              {radioMsgs.map((msg, i) => (
                <View 
                  key={i} 
                  style={[styles.radioRow, { borderBottomColor: 'rgba(128,128,128,0.06)' }]}
                >
                  <View style={styles.radioMeta}>
                    <SymbolView
                      name={{ ios: 'waveform', android: 'volume_up', web: 'volume_up' }}
                      size={14}
                      tintColor={teamColor}
                    />
                    <ThemedText type="code" style={styles.radioTime} themeColor="text">
                      TEAM RADIO [{formatRadioTime(msg.date)}]
                    </ThemedText>
                  </View>
                  
                  <Pressable
                    onPress={() => playRadioAudio(msg.recording_url)}
                    style={({ pressed }) => [
                      styles.playBtn,
                      { backgroundColor: theme.cosmicIndigo },
                      pressed && { opacity: 0.7 }
                    ]}
                  >
                    <SymbolView
                      name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                      size={10}
                      tintColor="#ffffff"
                    />
                    <ThemedText type="code" style={styles.playBtnText}>PLAY</ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  stripe: {
    height: 3,
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  profileRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
    marginTop: 4,
  },
  headshot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMeta: {
    flex: 1,
    gap: 2,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  numberBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.one,
  },
  driverNumText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
  },
  fullName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  badgeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  tyreBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  tyreText: {
    fontSize: 9,
    fontWeight: 'bold',
    lineHeight: 11,
    textAlign: 'center',
  },
  tyreAgeText: {
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  teamName: {
    fontSize: 12,
  },
  sectorsContainer: {
    flexDirection: 'row',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  sectorCol: {
    alignItems: 'center',
    gap: 2,
  },
  sectorLabel: {
    fontSize: 8,
    letterSpacing: 0.5,
  },
  sectorValue: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    gap: Spacing.three,
  },
  tabItem: {
    paddingBottom: Spacing.two,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    // borderBottomColor set dynamically
  },
  radioTabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  radioBadge: {
    paddingHorizontal: 6,
    borderRadius: 8,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioBadgeText: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  lapsHistory: {
    gap: Spacing.two,
  },
  radioHistory: {
    gap: Spacing.two,
  },
  lapsLoading: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLaps: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 11,
  },
  lapsTable: {
    gap: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  colLap: {
    width: 40,
    fontSize: 10,
  },
  colTime: {
    flex: 2,
    fontSize: 10,
  },
  colSector: {
    flex: 1,
    textAlign: 'right',
    fontSize: 10,
  },
  radioList: {
    gap: 0,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  radioMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  radioTime: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: Spacing.two,
  },
  playBtnText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
