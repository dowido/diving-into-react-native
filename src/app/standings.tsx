import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DriverStanding {
  position: string;
  points: string;
  wins: string;
  Driver: {
    driverId: string;
    code: string;
    givenName: string;
    familyName: string;
    nationality: string;
    permanentNumber: string;
  };
  Constructors: Array<{
    constructorId: string;
    name: string;
    nationality: string;
  }>;
}

interface ConstructorStanding {
  position: string;
  points: string;
  wins: string;
  Constructor: {
    constructorId: string;
    name: string;
    nationality: string;
  };
}

// ─── Team colour map ─────────────────────────────────────────────────────────

const TEAM_COLOURS: Record<string, string> = {
  mclaren: '#FF8000',
  red_bull: '#3671C6',
  mercedes: '#27F4D2',
  ferrari: '#E8002D',
  williams: '#64C4FF',
  aston_martin: '#229971',
  rb: '#6692FF',
  haas: '#B6BABD',
  sauber: '#52E252',
  alpine: '#FF87BC',
};

function teamColour(constructorId: string) {
  return TEAM_COLOURS[constructorId] ?? '#94a3b8';
}

// ─── Nationality flag emoji map ───────────────────────────────────────────────

const NATIONALITY_FLAG: Record<string, string> = {
  British: '🇬🇧',
  Dutch: '🇳🇱',
  Australian: '🇦🇺',
  German: '🇩🇪',
  Monegasque: '🇲🇨',
  Italian: '🇮🇹',
  Thai: '🇹🇭',
  Spanish: '🇪🇸',
  French: '🇫🇷',
  Canadian: '🇨🇦',
  Japanese: '🇯🇵',
  'New Zealander': '🇳🇿',
  Brazilian: '🇧🇷',
  Argentine: '🇦🇷',
  Austrian: '🇦🇹',
  American: '🇺🇸',
  Swiss: '🇨🇭',
};

function nationalityFlag(nat: string) {
  return NATIONALITY_FLAG[nat] ?? '🏁';
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type Tab = 'drivers' | 'constructors';

export default function StandingsScreen() {
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

  const [activeTab, setActiveTab] = useState<Tab>('drivers');

  // Driver standings
  const [driverStandings, setDriverStandings] = useState<DriverStanding[]>([]);
  const [driverLoading, setDriverLoading] = useState(true);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [driverSeason, setDriverSeason] = useState<string>('2025');
  const [driverRound, setDriverRound] = useState<string>('');

  // Constructor standings
  const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([]);
  const [constructorLoading, setConstructorLoading] = useState(true);
  const [constructorError, setConstructorError] = useState<string | null>(null);
  const [constructorSeason, setConstructorSeason] = useState<string>('2025');
  const [constructorRound, setConstructorRound] = useState<string>('');

  // Load on first focus
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadAll = async () => {
        // --- Driver standings ---
        try {
          setDriverLoading(true);
          setDriverError(null);
          const res = await fetchWithRetry(
            'https://api.jolpi.ca/ergast/f1/2025/driverstandings.json'
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (cancelled) return;
          const list = json?.MRData?.StandingsTable?.StandingsLists?.[0];
          if (list) {
            setDriverStandings(list.DriverStandings ?? []);
            setDriverSeason(list.season ?? '2025');
            setDriverRound(list.round ?? '');
          }
        } catch (err) {
          if (!cancelled) setDriverError('Failed to load driver standings.');
        } finally {
          if (!cancelled) setDriverLoading(false);
        }

        // --- Constructor standings ---
        try {
          setConstructorLoading(true);
          setConstructorError(null);
          const res = await fetchWithRetry(
            'https://api.jolpi.ca/ergast/f1/2025/constructorstandings.json'
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (cancelled) return;
          const list = json?.MRData?.StandingsTable?.StandingsLists?.[0];
          if (list) {
            setConstructorStandings(list.ConstructorStandings ?? []);
            setConstructorSeason(list.season ?? '2025');
            setConstructorRound(list.round ?? '');
          }
        } catch (err) {
          if (!cancelled) setConstructorError('Failed to load constructor standings.');
        } finally {
          if (!cancelled) setConstructorLoading(false);
        }
      };

      // Only fetch if not already loaded
      if (driverStandings.length === 0 || constructorStandings.length === 0) {
        loadAll();
      }

      return () => {
        cancelled = true;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [driverStandings.length, constructorStandings.length])
  );

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const getLeaderPoints = () => {
    if (activeTab === 'drivers' && driverStandings.length > 0) {
      return parseInt(driverStandings[0].points, 10);
    }
    if (activeTab === 'constructors' && constructorStandings.length > 0) {
      return parseInt(constructorStandings[0].points, 10);
    }
    return 1;
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderDriverRow = (entry: DriverStanding, idx: number) => {
    const pos = parseInt(entry.position, 10);
    const pts = parseInt(entry.points, 10);
    const leaderPts = getLeaderPoints();
    const barWidth = leaderPts > 0 ? Math.max(4, (pts / leaderPts) * 100) : 4;
    const constructorId = entry.Constructors[0]?.constructorId ?? '';
    const colour = teamColour(constructorId);
    const flag = nationalityFlag(entry.Driver.nationality);
    const isTop3 = pos <= 3;
    const gap = pos === 1 ? null : leaderPts - pts;

    return (
      <ThemedView
        key={entry.Driver.driverId}
        style={[
          styles.standingRow,
          {
            backgroundColor: isTop3 ? `${colour}14` : theme.cardBackground,
            borderColor: isTop3 ? colour : theme.backgroundElement,
            borderWidth: isTop3 ? 1.5 : 1,
          },
          idx === 0 && styles.standingRowFirst,
        ]}
      >
        {/* Top accent for leader */}
        {pos === 1 && (
          <View style={[styles.leaderAccent, { backgroundColor: colour }]} />
        )}

        <View style={styles.rowMain}>
          {/* Position badge */}
          <View
            style={[
              styles.posBadge,
              {
                backgroundColor: isTop3 ? colour : theme.backgroundElement,
              },
            ]}
          >
            {pos === 1 && (
              <ThemedText style={[styles.posTrophy]}>🏆</ThemedText>
            )}
            {pos !== 1 && (
              <ThemedText
                type="code"
                style={[
                  styles.posText,
                  { color: isTop3 ? '#000' : theme.textSecondary },
                ]}
              >
                {entry.position}
              </ThemedText>
            )}
          </View>

          {/* Driver info */}
          <View style={styles.driverInfo}>
            <View style={styles.driverNameRow}>
              <View
                style={[styles.teamDot, { backgroundColor: colour }]}
              />
              <ThemedText type="smallBold" style={styles.driverCode} themeColor="text">
                {entry.Driver.code}
              </ThemedText>
              <ThemedText type="code" style={styles.driverFlag}>
                {flag}
              </ThemedText>
            </View>
            <ThemedText type="code" style={styles.driverFullName} themeColor="textSecondary" numberOfLines={1}>
              {entry.Driver.givenName} {entry.Driver.familyName}
            </ThemedText>
            <ThemedText type="code" style={styles.teamName} themeColor="textSecondary" numberOfLines={1}>
              {entry.Constructors[0]?.name ?? '—'}
            </ThemedText>
          </View>

          {/* Stats */}
          <View style={styles.statsCol}>
            <ThemedText type="smallBold" style={[styles.pointsText, { color: isTop3 ? colour : theme.text }]}>
              {entry.points}
            </ThemedText>
            <ThemedText type="code" style={styles.ptsLabel} themeColor="textSecondary">
              PTS
            </ThemedText>
            {entry.wins !== '0' && (
              <View style={[styles.winsBadge, { backgroundColor: `${colour}22`, borderColor: colour }]}>
                <ThemedText type="code" style={[styles.winsText, { color: colour }]}>
                  {entry.wins}W
                </ThemedText>
              </View>
            )}
            {gap !== null && (
              <ThemedText type="code" style={styles.gapText} themeColor="textSecondary">
                -{gap}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Points bar */}
        <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: colour,
                width: `${barWidth}%` as any,
                ...Platform.select({
                  web: { boxShadow: isTop3 ? `0 0 8px ${colour}` : 'none' },
                  default: {
                    shadowColor: colour,
                    shadowOpacity: isTop3 ? 0.5 : 0,
                    shadowRadius: 4,
                  },
                }),
              },
            ]}
          />
        </View>
      </ThemedView>
    );
  };

  const renderConstructorRow = (entry: ConstructorStanding, idx: number) => {
    const pos = parseInt(entry.position, 10);
    const pts = parseInt(entry.points, 10);
    const leaderPts = getLeaderPoints();
    const barWidth = leaderPts > 0 ? Math.max(4, (pts / leaderPts) * 100) : 4;
    const colour = teamColour(entry.Constructor.constructorId);
    const flag = nationalityFlag(entry.Constructor.nationality);
    const isTop3 = pos <= 3;
    const gap = pos === 1 ? null : leaderPts - pts;

    return (
      <ThemedView
        key={entry.Constructor.constructorId}
        style={[
          styles.standingRow,
          {
            backgroundColor: isTop3 ? `${colour}14` : theme.cardBackground,
            borderColor: isTop3 ? colour : theme.backgroundElement,
            borderWidth: isTop3 ? 1.5 : 1,
          },
          idx === 0 && styles.standingRowFirst,
        ]}
      >
        {pos === 1 && (
          <View style={[styles.leaderAccent, { backgroundColor: colour }]} />
        )}

        <View style={styles.rowMain}>
          {/* Position badge */}
          <View
            style={[
              styles.posBadge,
              { backgroundColor: isTop3 ? colour : theme.backgroundElement },
            ]}
          >
            {pos === 1 && (
              <ThemedText style={[styles.posTrophy]}>🏆</ThemedText>
            )}
            {pos !== 1 && (
              <ThemedText
                type="code"
                style={[
                  styles.posText,
                  { color: isTop3 ? '#000' : theme.textSecondary },
                ]}
              >
                {entry.position}
              </ThemedText>
            )}
          </View>

          {/* Constructor info */}
          <View style={styles.driverInfo}>
            <View style={styles.driverNameRow}>
              <View style={[styles.teamDot, { backgroundColor: colour }]} />
              <ThemedText type="smallBold" style={styles.driverCode} themeColor="text">
                {entry.Constructor.name}
              </ThemedText>
              <ThemedText type="code" style={styles.driverFlag}>
                {flag}
              </ThemedText>
            </View>
            <ThemedText type="code" style={styles.teamName} themeColor="textSecondary">
              {entry.Constructor.nationality}
            </ThemedText>
          </View>

          {/* Stats */}
          <View style={styles.statsCol}>
            <ThemedText type="smallBold" style={[styles.pointsText, { color: isTop3 ? colour : theme.text }]}>
              {entry.points}
            </ThemedText>
            <ThemedText type="code" style={styles.ptsLabel} themeColor="textSecondary">
              PTS
            </ThemedText>
            {entry.wins !== '0' && (
              <View style={[styles.winsBadge, { backgroundColor: `${colour}22`, borderColor: colour }]}>
                <ThemedText type="code" style={[styles.winsText, { color: colour }]}>
                  {entry.wins}W
                </ThemedText>
              </View>
            )}
            {gap !== null && (
              <ThemedText type="code" style={styles.gapText} themeColor="textSecondary">
                -{gap}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Points bar */}
        <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: colour,
                width: `${barWidth}%` as any,
                ...Platform.select({
                  web: { boxShadow: isTop3 ? `0 0 8px ${colour}` : 'none' },
                  default: {
                    shadowColor: colour,
                    shadowOpacity: isTop3 ? 0.5 : 0,
                    shadowRadius: 4,
                  },
                }),
              },
            ]}
          />
        </View>
      </ThemedView>
    );
  };

  const isLoading = activeTab === 'drivers' ? driverLoading : constructorLoading;
  const hasError = activeTab === 'drivers' ? driverError : constructorError;
  const season = activeTab === 'drivers' ? driverSeason : constructorSeason;
  const round = activeTab === 'drivers' ? driverRound : constructorRound;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
    >
      <ThemedView style={styles.container}>

        {/* ── HEADER ── */}
        <ThemedView style={styles.titleContainer}>
          <View style={styles.accentBar} />
          <ThemedText type="subtitle" style={styles.titleText}>
            CHAMPIONSHIP STANDINGS
          </ThemedText>
          <ThemedText style={styles.subtitleText} themeColor="textSecondary">
            {season} Season · After Round {round}
          </ThemedText>
        </ThemedView>

        {/* ── TAB SWITCHER ── */}
        <View style={[styles.tabSwitcher, { backgroundColor: theme.backgroundElement }]}>
          <Pressable
            onPress={() => setActiveTab('drivers')}
            style={({ pressed }) => [
              styles.tabBtn,
              activeTab === 'drivers' && [styles.tabBtnActive, { backgroundColor: theme.cardBackground }],
              pressed && { opacity: 0.8 },
            ]}
          >
            <SymbolView
              name={{ ios: 'person.fill', android: 'person', web: 'person' }}
              size={13}
              tintColor={activeTab === 'drivers' ? theme.cosmicIndigo : theme.textSecondary}
            />
            <ThemedText
              type="code"
              style={[
                styles.tabLabel,
                { color: activeTab === 'drivers' ? theme.cosmicIndigo : theme.textSecondary },
              ]}
            >
              DRIVERS
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('constructors')}
            style={({ pressed }) => [
              styles.tabBtn,
              activeTab === 'constructors' && [styles.tabBtnActive, { backgroundColor: theme.cardBackground }],
              pressed && { opacity: 0.8 },
            ]}
          >
            <SymbolView
              name={{ ios: 'car.2.fill', android: 'directions_car', web: 'directions_car' }}
              size={13}
              tintColor={activeTab === 'constructors' ? theme.cosmicIndigo : theme.textSecondary}
            />
            <ThemedText
              type="code"
              style={[
                styles.tabLabel,
                { color: activeTab === 'constructors' ? theme.cosmicIndigo : theme.textSecondary },
              ]}
            >
              CONSTRUCTORS
            </ThemedText>
          </Pressable>
        </View>

        {/* ── CONTENT ── */}
        {isLoading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={theme.cosmicIndigo} />
            <ThemedText type="code" themeColor="textSecondary">
              Loading {activeTab === 'drivers' ? 'driver' : 'constructor'} standings…
            </ThemedText>
          </View>
        ) : hasError ? (
          <View style={styles.errorWrapper}>
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
              size={32}
              tintColor={theme.solarAmber}
            />
            <ThemedText type="code" themeColor="textSecondary" style={styles.errorText}>
              {hasError}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {activeTab === 'drivers'
              ? driverStandings.map((entry, idx) => renderDriverRow(entry, idx))
              : constructorStandings.map((entry, idx) => renderConstructorRow(entry, idx))}
          </View>
        )}

        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    gap: Spacing.three,
    alignItems: 'stretch',
  },

  // ── Header
  titleContainer: {
    paddingVertical: Spacing.four,
    gap: Spacing.two,
    alignItems: 'stretch',
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

  // ── Tab switcher
  tabSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
  },
  tabBtnActive: {
    ...cardShadow({ opacity: 0.15, radius: 8, offsetY: 2, elevation: 2 }),
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },

  // ── Loading / Error
  loadingWrapper: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.three,
  },
  errorWrapper: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.three,
  },
  errorText: {
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── List
  listContainer: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },

  // ── Standing row card
  standingRow: {
    borderRadius: 12,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.15, radius: 10, offsetY: 4, elevation: 2 }),
  },
  standingRowFirst: {
    // Extra visual weight for first place is already applied per-row
  },
  leaderAccent: {
    height: 3,
    width: '100%',
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },

  // Position badge
  posBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  posText: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  posTrophy: {
    fontSize: 18,
  },

  // Driver / Team info block
  driverInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  driverCode: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  driverFlag: {
    fontSize: 14,
  },
  driverFullName: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
  teamName: {
    fontSize: 10,
    letterSpacing: 0.2,
  },

  // Stats column
  statsCol: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  pointsText: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    lineHeight: 22,
  },
  ptsLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: 'bold',
    marginTop: -2,
  },
  winsBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  winsText: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  gapText: {
    fontSize: 9,
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // Points bar
  barTrack: {
    height: 3,
    width: '100%',
    borderRadius: 0,
  },
  barFill: {
    height: 3,
    borderRadius: 0,
  },
});
