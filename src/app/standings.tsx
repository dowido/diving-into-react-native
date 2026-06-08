import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

interface Race {
  round: string;
  raceName: string;
  date: string;
  Circuit: {
    Location: { locality: string; country: string };
  };
}

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

// ─── Constants ───────────────────────────────────────────────────────────────

const SEASON = '2025';

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

const NATIONALITY_FLAG: Record<string, string> = {
  British: '🇬🇧', Dutch: '🇳🇱', Australian: '🇦🇺', German: '🇩🇪',
  Monegasque: '🇲🇨', Italian: '🇮🇹', Thai: '🇹🇭', Spanish: '🇪🇸',
  French: '🇫🇷', Canadian: '🇨🇦', Japanese: '🇯🇵', 'New Zealander': '🇳🇿',
  Brazilian: '🇧🇷', Argentine: '🇦🇷', Austrian: '🇦🇹', American: '🇺🇸',
  Swiss: '🇨🇭',
};

function teamColour(id: string) { return TEAM_COLOURS[id] ?? '#94a3b8'; }
function natFlag(nat: string) { return NATIONALITY_FLAG[nat] ?? '🏁'; }

// Short GP label from full race name
function shortGP(raceName: string) {
  return raceName
    .replace(' Grand Prix', ' GP')
    .replace('Emilia Romagna GP', 'Imola GP')
    .replace('São Paulo GP', 'Brazil GP');
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type StandingsTab = 'drivers' | 'constructors';

export default function StandingsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const roundScrollRef = useRef<ScrollView>(null);

  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = Platform.select({
    android: { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: insets.bottom },
    ios: { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: insets.bottom },
    web: { paddingTop: Spacing.five, paddingBottom: Spacing.four },
  });

  const [activeTab, setActiveTab] = useState<StandingsTab>('drivers');

  // All completed races for the season (round list)
  const [races, setRaces] = useState<Race[]>([]);
  const [racesLoading, setRacesLoading] = useState(true);

  // Currently selected round (null = latest)
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  // Standings data for the selected round
  const [driverStandings, setDriverStandings] = useState<DriverStanding[]>([]);
  const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState<string | null>(null);

  // Cache: round -> { drivers, constructors }
  const cache = useRef<Record<string, { drivers: DriverStanding[]; constructors: ConstructorStanding[] }>>({});

  // ── Fetch completed races (calendar) on first focus ───────────────────────
  useFocusEffect(
    useCallback(() => {
      if (races.length > 0) return;
      let cancelled = false;

      (async () => {
        try {
          setRacesLoading(true);
          const res = await fetchWithRetry(`https://api.jolpi.ca/ergast/f1/${SEASON}.json`);
          if (!res.ok) throw new Error('Race list failed');
          const json = await res.json();
          if (cancelled) return;

          const allRaces: Race[] = json?.MRData?.RaceTable?.Races ?? [];
          const now = new Date();
          // Only keep completed races
          const completed = allRaces.filter(r => new Date(r.date) < now);
          setRaces(completed);

          // Default: latest completed round
          if (completed.length > 0 && !selectedRound) {
            setSelectedRound(completed[completed.length - 1].round);
          }
        } catch {
          // silently fail — standings will show error
        } finally {
          if (!cancelled) setRacesLoading(false);
        }
      })();

      return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [races.length])
  );

  // ── Fetch standings when selectedRound changes ────────────────────────────
  useEffect(() => {
    if (!selectedRound) return;

    // Return cached data immediately
    if (cache.current[selectedRound]) {
      const cached = cache.current[selectedRound];
      setDriverStandings(cached.drivers);
      setConstructorStandings(cached.constructors);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setStandingsLoading(true);
        setStandingsError(null);

        const [drRes, conRes] = await Promise.all([
          fetchWithRetry(`https://api.jolpi.ca/ergast/f1/${SEASON}/${selectedRound}/driverstandings.json`),
          fetchWithRetry(`https://api.jolpi.ca/ergast/f1/${SEASON}/${selectedRound}/constructorstandings.json`),
        ]);

        if (!drRes.ok || !conRes.ok) throw new Error('Fetch failed');

        const [drJson, conJson] = await Promise.all([drRes.json(), conRes.json()]);
        if (cancelled) return;

        const drivers: DriverStanding[] =
          drJson?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
        const constructors: ConstructorStanding[] =
          conJson?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];

        cache.current[selectedRound] = { drivers, constructors };
        setDriverStandings(drivers);
        setConstructorStandings(constructors);
      } catch {
        if (!cancelled) setStandingsError('Could not load standings for this round.');
      } finally {
        if (!cancelled) setStandingsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedRound]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeList = activeTab === 'drivers' ? driverStandings : constructorStandings;
  const leaderPts = activeList.length > 0 ? parseInt(activeList[0].points, 10) : 1;

  const selectedRace = races.find(r => r.round === selectedRound);
  const isLatest = selectedRound === races[races.length - 1]?.round;

  // ── Round navigation helpers ──────────────────────────────────────────────
  const goToPrevRound = () => {
    if (!selectedRound || races.length === 0) return;
    const idx = races.findIndex(r => r.round === selectedRound);
    if (idx > 0) setSelectedRound(races[idx - 1].round);
  };

  const goToNextRound = () => {
    if (!selectedRound || races.length === 0) return;
    const idx = races.findIndex(r => r.round === selectedRound);
    if (idx < races.length - 1) setSelectedRound(races[idx + 1].round);
  };

  const isFirstRound = selectedRound === races[0]?.round;
  const isLastRound = selectedRound === races[races.length - 1]?.round;

  // ── Render: round pill strip ──────────────────────────────────────────────
  const renderRoundStrip = () => (
    <View style={styles.roundStripWrapper}>
      {/* Prev button */}
      <Pressable
        onPress={goToPrevRound}
        disabled={isFirstRound}
        style={({ pressed }) => [
          styles.arrowBtn,
          { backgroundColor: theme.backgroundElement, opacity: isFirstRound ? 0.3 : pressed ? 0.6 : 1 },
        ]}
      >
        <SymbolView
          name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          size={14}
          tintColor={theme.text}
        />
      </Pressable>

      {/* Scrollable pill strip */}
      <ScrollView
        ref={roundScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.roundScroll}
        contentContainerStyle={styles.roundScrollContent}
      >
        {races.map((race) => {
          const isSelected = race.round === selectedRound;
          const colour = isSelected ? theme.cosmicIndigo : theme.backgroundElement;
          return (
            <Pressable
              key={race.round}
              onPress={() => setSelectedRound(race.round)}
              style={({ pressed }) => [
                styles.roundPill,
                {
                  backgroundColor: isSelected ? theme.cosmicIndigo : theme.backgroundElement,
                  borderColor: isSelected ? theme.cosmicIndigo : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText
                type="code"
                style={[styles.roundPillNum, { color: isSelected ? '#fff' : theme.textSecondary }]}
              >
                R{race.round}
              </ThemedText>
              <ThemedText
                type="code"
                style={[styles.roundPillName, { color: isSelected ? '#fff' : theme.textSecondary }]}
                numberOfLines={1}
              >
                {shortGP(race.raceName)}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Next button */}
      <Pressable
        onPress={goToNextRound}
        disabled={isLastRound}
        style={({ pressed }) => [
          styles.arrowBtn,
          { backgroundColor: theme.backgroundElement, opacity: isLastRound ? 0.3 : pressed ? 0.6 : 1 },
        ]}
      >
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          tintColor={theme.text}
        />
      </Pressable>
    </View>
  );

  // ── Render: driver row ────────────────────────────────────────────────────
  const renderDriverRow = (entry: DriverStanding, idx: number) => {
    const pos = parseInt(entry.position, 10);
    const pts = parseInt(entry.points, 10);
    const barWidth = leaderPts > 0 ? Math.max(4, (pts / leaderPts) * 100) : 4;
    const constructorId = entry.Constructors[0]?.constructorId ?? '';
    const colour = teamColour(constructorId);
    const flag = natFlag(entry.Driver.nationality);
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
        ]}
      >
        {pos === 1 && <View style={[styles.leaderAccent, { backgroundColor: colour }]} />}

        <View style={styles.rowMain}>
          {/* Pos badge */}
          <View style={[styles.posBadge, { backgroundColor: isTop3 ? colour : theme.backgroundElement }]}>
            {pos === 1
              ? <ThemedText style={styles.posTrophy}>🏆</ThemedText>
              : <ThemedText type="code" style={[styles.posText, { color: isTop3 ? '#000' : theme.textSecondary }]}>{entry.position}</ThemedText>
            }
          </View>

          {/* Driver info */}
          <View style={styles.driverInfo}>
            <View style={styles.driverNameRow}>
              <View style={[styles.teamDot, { backgroundColor: colour }]} />
              <ThemedText type="smallBold" style={styles.driverCode} themeColor="text">
                {entry.Driver.code}
              </ThemedText>
              <ThemedText type="code" style={styles.driverFlag}>{flag}</ThemedText>
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
            <ThemedText type="code" style={styles.ptsLabel} themeColor="textSecondary">PTS</ThemedText>
            {entry.wins !== '0' && (
              <View style={[styles.winsBadge, { backgroundColor: `${colour}22`, borderColor: colour }]}>
                <ThemedText type="code" style={[styles.winsText, { color: colour }]}>{entry.wins}W</ThemedText>
              </View>
            )}
            {gap !== null && (
              <ThemedText type="code" style={styles.gapText} themeColor="textSecondary">-{gap}</ThemedText>
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
                  default: { shadowColor: colour, shadowOpacity: isTop3 ? 0.5 : 0, shadowRadius: 4 },
                }),
              },
            ]}
          />
        </View>
      </ThemedView>
    );
  };

  // ── Render: constructor row ───────────────────────────────────────────────
  const renderConstructorRow = (entry: ConstructorStanding, idx: number) => {
    const pos = parseInt(entry.position, 10);
    const pts = parseInt(entry.points, 10);
    const barWidth = leaderPts > 0 ? Math.max(4, (pts / leaderPts) * 100) : 4;
    const colour = teamColour(entry.Constructor.constructorId);
    const flag = natFlag(entry.Constructor.nationality);
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
        ]}
      >
        {pos === 1 && <View style={[styles.leaderAccent, { backgroundColor: colour }]} />}

        <View style={styles.rowMain}>
          <View style={[styles.posBadge, { backgroundColor: isTop3 ? colour : theme.backgroundElement }]}>
            {pos === 1
              ? <ThemedText style={styles.posTrophy}>🏆</ThemedText>
              : <ThemedText type="code" style={[styles.posText, { color: isTop3 ? '#000' : theme.textSecondary }]}>{entry.position}</ThemedText>
            }
          </View>

          <View style={styles.driverInfo}>
            <View style={styles.driverNameRow}>
              <View style={[styles.teamDot, { backgroundColor: colour }]} />
              <ThemedText type="smallBold" style={styles.driverCode} themeColor="text">
                {entry.Constructor.name}
              </ThemedText>
              <ThemedText type="code" style={styles.driverFlag}>{flag}</ThemedText>
            </View>
            <ThemedText type="code" style={styles.teamName} themeColor="textSecondary">
              {entry.Constructor.nationality}
            </ThemedText>
          </View>

          <View style={styles.statsCol}>
            <ThemedText type="smallBold" style={[styles.pointsText, { color: isTop3 ? colour : theme.text }]}>
              {entry.points}
            </ThemedText>
            <ThemedText type="code" style={styles.ptsLabel} themeColor="textSecondary">PTS</ThemedText>
            {entry.wins !== '0' && (
              <View style={[styles.winsBadge, { backgroundColor: `${colour}22`, borderColor: colour }]}>
                <ThemedText type="code" style={[styles.winsText, { color: colour }]}>{entry.wins}W</ThemedText>
              </View>
            )}
            {gap !== null && (
              <ThemedText type="code" style={styles.gapText} themeColor="textSecondary">-{gap}</ThemedText>
            )}
          </View>
        </View>

        <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: colour,
                width: `${barWidth}%` as any,
                ...Platform.select({
                  web: { boxShadow: isTop3 ? `0 0 8px ${colour}` : 'none' },
                  default: { shadowColor: colour, shadowOpacity: isTop3 ? 0.5 : 0, shadowRadius: 4 },
                }),
              },
            ]}
          />
        </View>
      </ThemedView>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

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
          <View style={styles.headerRow}>
            <View style={styles.headerTitles}>
              <ThemedText type="subtitle" style={styles.titleText}>
                CHAMPIONSHIP STANDINGS
              </ThemedText>
              <ThemedText style={styles.subtitleText} themeColor="textSecondary">
                {SEASON} Season
                {selectedRace
                  ? ` · R${selectedRace.round} — ${shortGP(selectedRace.raceName)}`
                  : ''}
                {isLatest && <ThemedText style={{ color: theme.neonTeal }}> · CURRENT</ThemedText>}
              </ThemedText>
            </View>

            {/* Latest shortcut */}
            {!isLatest && races.length > 0 && (
              <Pressable
                onPress={() => setSelectedRound(races[races.length - 1].round)}
                style={({ pressed }) => [
                  styles.latestBtn,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.neonTeal },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText type="code" style={[styles.latestBtnText, { color: theme.neonTeal }]}>
                  LATEST
                </ThemedText>
              </Pressable>
            )}
          </View>
        </ThemedView>

        {/* ── ROUND SELECTOR ── */}
        {racesLoading ? (
          <View style={styles.roundLoadingRow}>
            <ActivityIndicator size="small" color={theme.cosmicIndigo} />
            <ThemedText type="code" themeColor="textSecondary">Loading race calendar…</ThemedText>
          </View>
        ) : races.length > 0 ? (
          renderRoundStrip()
        ) : null}

        {/* ── DRIVER / CONSTRUCTOR TAB SWITCHER ── */}
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
              style={[styles.tabLabel, { color: activeTab === 'drivers' ? theme.cosmicIndigo : theme.textSecondary }]}
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
              style={[styles.tabLabel, { color: activeTab === 'constructors' ? theme.cosmicIndigo : theme.textSecondary }]}
            >
              CONSTRUCTORS
            </ThemedText>
          </Pressable>
        </View>

        {/* ── STANDINGS LIST ── */}
        {standingsLoading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={theme.cosmicIndigo} />
            <ThemedText type="code" themeColor="textSecondary">
              Loading standings…
            </ThemedText>
          </View>
        ) : standingsError ? (
          <View style={styles.errorWrapper}>
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
              size={32}
              tintColor={theme.solarAmber}
            />
            <ThemedText type="code" themeColor="textSecondary" style={styles.errorText}>
              {standingsError}
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
  scrollView: { flex: 1 },
  contentContainer: { flexDirection: 'row', justifyContent: 'center' },
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  headerTitles: { flex: 1, gap: Spacing.one, minWidth: 200 },
  titleText: { fontWeight: 'bold', letterSpacing: 2, fontSize: 20 },
  subtitleText: { fontSize: 12, lineHeight: 18, letterSpacing: 0.3 },

  // Latest button
  latestBtn: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    flexShrink: 0,
  },
  latestBtnText: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  // ── Round strip
  roundLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  roundStripWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roundScroll: { flex: 1 },
  roundScrollContent: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingVertical: 2,
  },
  roundPill: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    alignItems: 'center',
    minWidth: 72,
  },
  roundPillNum: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    lineHeight: 12,
  },
  roundPillName: {
    fontSize: 9,
    letterSpacing: 0.2,
    lineHeight: 12,
    textAlign: 'center',
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
  tabLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 0.8 },

  // ── Loading / Error
  loadingWrapper: { paddingVertical: Spacing.six, alignItems: 'center', gap: Spacing.three },
  errorWrapper: { paddingVertical: Spacing.six, alignItems: 'center', gap: Spacing.three },
  errorText: { textAlign: 'center', lineHeight: 20 },

  // ── Standing rows
  listContainer: { gap: Spacing.two, paddingBottom: Spacing.four },
  standingRow: {
    borderRadius: 12,
    overflow: 'hidden',
    ...cardShadow({ opacity: 0.15, radius: 10, offsetY: 4, elevation: 2 }),
  },
  leaderAccent: { height: 3, width: '100%' },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  posBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  posText: { fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 },
  posTrophy: { fontSize: 18 },
  driverInfo: { flex: 1, gap: 2, minWidth: 0 },
  driverNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  driverCode: { fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  driverFlag: { fontSize: 14 },
  driverFullName: { fontSize: 10, letterSpacing: 0.3 },
  teamName: { fontSize: 10, letterSpacing: 0.2 },
  statsCol: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  pointsText: { fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5, lineHeight: 22 },
  ptsLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: 'bold', marginTop: -2 },
  winsBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 },
  winsText: { fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5 },
  gapText: { fontSize: 9, letterSpacing: 0.3, marginTop: 1 },
  barTrack: { height: 3, width: '100%', borderRadius: 0 },
  barFill: { height: 3, borderRadius: 0 },
});
