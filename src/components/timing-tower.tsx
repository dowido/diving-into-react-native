/**
 * TimingTower — Advanced Timing Matrix
 *
 * Full 20-driver timing tower with:
 *   - Position, Driver acronym, team color accent strip
 *   - S1 / S2 / S3 sector time cells color-coded:
 *       🟪 Purple  — Overall fastest sector (session best)
 *       🟩 Green   — Driver personal best sector
 *       🟨 Yellow  — All other times
 *   - Stint compound badge (SOFT/MED/HARD/INTER/WET)
 *   - Tyre age (laps)
 *   - Gap to leader / interval
 *   - Expandable pit log per driver
 *
 * Data sources:
 *   - /position    → current race order
 *   - /laps        → sector times (S1/S2/S3) + compound
 *   - /pit         → pit stop history
 *   - /drivers     → team colours
 */

import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
import { M3Shape, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectorTime {
  duration_sector_1?: number | null;
  duration_sector_2?: number | null;
  duration_sector_3?: number | null;
}

export interface PitStop {
  driver_number: number;
  lap_number: number;
  pit_duration: number;
  compound?: string;
}

export interface TimingDriver {
  position: number;
  driver_number: number;
  acronym: string;
  teamColour: string;
  teamName: string;
  gap: string;           // e.g. "+2.431s" or "LEADER"
  interval: string;      // e.g. "+0.844s"
  compound: string;      // "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET"
  tyreAge: number;       // laps on current stint
  lastLapTime?: number;  // in seconds
  sectorTimes?: SectorTime;
  pits?: PitStop[];
}

interface TimingTowerProps {
  drivers: TimingDriver[];
  /** Map of driver_number → best S1/S2/S3 times across the whole session */
  sessionBests?: { s1?: number; s2?: number; s3?: number };
  /** Highlight a specific driver */
  focusDriverNumber?: number | null;
  /** Whether this is a live session */
  isLive?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSector(s: number | null | undefined): string {
  if (s == null || s <= 0) return '—';
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = (abs % 60).toFixed(3);
  return m > 0 ? `${m}:${sec.padStart(6, '0')}` : sec;
}

function formatGap(s: number): string {
  if (s <= 0) return 'LEADER';
  return `+${s.toFixed(3)}s`;
}

function tyreColor(compound: string): string {
  switch (compound?.toUpperCase()) {
    case 'SOFT':         return '#ef4444';
    case 'MEDIUM':       return '#eab308';
    case 'HARD':         return '#e2e8f0';
    case 'INTERMEDIATE': return '#22c55e';
    case 'WET':          return '#3b82f6';
    default:             return '#94a3b8';
  }
}

function tyreAbbrev(compound: string): string {
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
  driverPersonalBest: number | undefined,
): SectorFlag {
  if (time == null || time <= 0) return 'none';
  if (sessionBest != null && Math.abs(time - sessionBest) < 0.001) return 'purple';
  if (driverPersonalBest != null && Math.abs(time - driverPersonalBest) < 0.001) return 'green';
  return 'yellow';
}

function sectorBgColor(flag: SectorFlag): string {
  switch (flag) {
    case 'purple': return '#a855f722';
    case 'green':  return '#22c55e22';
    case 'yellow': return '#eab30822';
    default:       return 'transparent';
  }
}

function sectorTextColor(flag: SectorFlag, fallback: string): string {
  switch (flag) {
    case 'purple': return '#a855f7';
    case 'green':  return '#22c55e';
    case 'yellow': return '#eab308';
    default:       return fallback;
  }
}

// ─── Pit Log Row ─────────────────────────────────────────────────────────────

function PitLogRow({ pits }: { pits: PitStop[] }) {
  const theme = useTheme();
  if (pits.length === 0) {
    return (
      <View style={pitStyles.empty}>
        <ThemedText style={pitStyles.emptyText} themeColor="textSecondary">No pit stops this session</ThemedText>
      </View>
    );
  }
  return (
    <View style={pitStyles.container}>
      {pits.map((p, i) => (
        <View key={i} style={pitStyles.row}>
          <View style={[pitStyles.lapBadge, { backgroundColor: theme.surfaceVariant }]}>
            <ThemedText style={pitStyles.lapNum}>L{p.lap_number}</ThemedText>
          </View>
          {p.compound && (
            <View style={[pitStyles.tyreBadge, { backgroundColor: tyreColor(p.compound) + '30', borderColor: tyreColor(p.compound) }]}>
              <ThemedText style={[pitStyles.tyreText, { color: tyreColor(p.compound) }]}>
                {tyreAbbrev(p.compound)}
              </ThemedText>
            </View>
          )}
          <ThemedText style={pitStyles.duration} themeColor="textSecondary">
            {p.pit_duration > 0 ? `${p.pit_duration.toFixed(1)}s stationary` : 'Duration unknown'}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const pitStyles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  lapBadge: { borderRadius: M3Shape.xs, paddingHorizontal: 6, paddingVertical: 2 },
  lapNum: { fontSize: 9, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  tyreBadge: { borderRadius: M3Shape.xs, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  tyreText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  duration: { fontSize: 9, letterSpacing: 0.2 },
  empty: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  emptyText: { fontSize: 9, letterSpacing: 0.3 },
});

// ─── Driver Row ───────────────────────────────────────────────────────────────

function DriverRow({
  driver,
  sessionBests,
  personalBests,
  isFocused,
}: {
  driver: TimingDriver;
  sessionBests?: { s1?: number; s2?: number; s3?: number };
  personalBests?: { s1?: number; s2?: number; s3?: number };
  isFocused: boolean;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const teamColor = driver.teamColour?.startsWith('#')
    ? driver.teamColour
    : `#${driver.teamColour}`;

  const isTop3 = driver.position <= 3;

  // Sector flags
  const s1 = driver.sectorTimes?.duration_sector_1;
  const s2 = driver.sectorTimes?.duration_sector_2;
  const s3 = driver.sectorTimes?.duration_sector_3;

  const s1Flag = getSectorFlag(s1, sessionBests?.s1, personalBests?.s1);
  const s2Flag = getSectorFlag(s2, sessionBests?.s2, personalBests?.s2);
  const s3Flag = getSectorFlag(s3, sessionBests?.s3, personalBests?.s3);

  const hasPits = (driver.pits?.length ?? 0) > 0;

  return (
    <Pressable
      onPress={() => setExpanded((p) => !p)}
      style={({ pressed }) => [
        styles.driverCard,
        {
          backgroundColor: isFocused
            ? teamColor + '18'
            : isTop3
            ? teamColor + '0E'
            : theme.surfaceVariant,
          borderColor: isFocused ? teamColor : isTop3 ? teamColor + '80' : theme.outline,
          borderWidth: isFocused ? 1.5 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Team color accent line */}
      <View style={[styles.accentLine, { backgroundColor: teamColor }]} />

      {/* Main data row */}
      <View style={styles.mainRow}>
        {/* Position */}
        <View style={[styles.posBox, { backgroundColor: isTop3 ? teamColor : theme.background }]}>
          <ThemedText style={[styles.posText, { color: isTop3 ? '#000' : theme.textSecondary }]}>
            {driver.position}
          </ThemedText>
        </View>

        {/* Driver */}
        <ThemedText style={[styles.acronym, { color: isFocused ? teamColor : theme.text }]}>
          {driver.acronym}
        </ThemedText>

        {/* Sectors */}
        <View style={styles.sectorsBlock}>
          {([
            [s1, s1Flag],
            [s2, s2Flag],
            [s3, s3Flag],
          ] as [number | null | undefined, SectorFlag][]).map(([val, flag], idx) => (
            <View
              key={idx}
              style={[
                styles.sectorCell,
                { backgroundColor: sectorBgColor(flag) },
              ]}
            >
              <ThemedText style={[styles.sectorText, { color: sectorTextColor(flag, theme.textSecondary) }]}>
                {formatSector(val)}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Gap */}
        <ThemedText style={[styles.gapText, { color: theme.textSecondary }]} numberOfLines={1}>
          {driver.gap}
        </ThemedText>

        {/* Tyre */}
        <View style={[styles.tyreBadge, { backgroundColor: tyreColor(driver.compound) + '25', borderColor: tyreColor(driver.compound) }]}>
          <ThemedText style={[styles.tyreText, { color: tyreColor(driver.compound) }]}>
            {tyreAbbrev(driver.compound)}
            {driver.tyreAge > 0 && (
              <ThemedText style={styles.tyreAge}> {driver.tyreAge}</ThemedText>
            )}
          </ThemedText>
        </View>

        {/* Expand indicator */}
        <ThemedText style={styles.expandChevron} themeColor="textSecondary">
          {expanded ? '▲' : '▼'}
        </ThemedText>
      </View>

      {/* Pit log expansion */}
      {expanded && (
        <PitLogRow pits={driver.pits ?? []} />
      )}
    </Pressable>
  );
}

// ─── Column Header ────────────────────────────────────────────────────────────

function TowerHeader() {
  const theme = useTheme();
  return (
    <View style={[styles.headerRow, { borderBottomColor: theme.outline }]}>
      <ThemedText style={[styles.headerCell, { width: 28 }]} themeColor="textSecondary">P</ThemedText>
      <ThemedText style={[styles.headerCell, { width: 40 }]} themeColor="textSecondary">DRV</ThemedText>
      <View style={styles.sectorsBlock}>
        {['S1', 'S2', 'S3'].map(s => (
          <ThemedText key={s} style={[styles.headerCell, styles.sectorHeader]} themeColor="textSecondary">{s}</ThemedText>
        ))}
      </View>
      <ThemedText style={[styles.headerCell, { flex: 1 }]} themeColor="textSecondary">GAP</ThemedText>
      <ThemedText style={[styles.headerCell, { width: 34 }]} themeColor="textSecondary">TYR</ThemedText>
      <View style={{ width: 14 }} />
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TimingTower({
  drivers,
  sessionBests,
  focusDriverNumber,
  isLive = false,
}: TimingTowerProps) {
  const theme = useTheme();

  if (drivers.length === 0) {
    return (
      <View style={styles.emptyState}>
        <ThemedText style={styles.emptyText} themeColor="textSecondary">
          No timing data available
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live indicator */}
      {isLive && (
        <View style={styles.liveBar}>
          <View style={styles.liveDot} />
          <ThemedText style={styles.liveLabel}>LIVE TIMING</ThemedText>
          <ThemedText style={styles.liveDriverCount} themeColor="textSecondary">
            {drivers.length} CARS
          </ThemedText>
        </View>
      )}

      <TowerHeader />

      <View style={styles.driverList}>
        {drivers.map((d) => (
          <DriverRow
            key={d.driver_number}
            driver={d}
            sessionBests={sessionBests}
            isFocused={focusDriverNumber === d.driver_number}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    backgroundColor: '#E1060012',
    borderRadius: M3Shape.sm,
    borderWidth: 1,
    borderColor: '#E1060030',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E10600',
  },
  liveLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#E10600',
    flex: 1,
  },
  liveDriverCount: {
    fontSize: 9,
    letterSpacing: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  headerCell: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  sectorHeader: {
    width: 52,
    textAlign: 'center',
  },
  driverList: {
    gap: Spacing.one,
  },
  driverCard: {
    borderRadius: M3Shape.sm,
    overflow: 'hidden',
  },
  accentLine: {
    height: 2,
    width: '100%',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  posBox: {
    width: 24,
    height: 24,
    borderRadius: M3Shape.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  posText: {
    fontSize: 11,
    fontWeight: '800',
  },
  acronym: {
    fontSize: 12,
    fontWeight: '800',
    width: 36,
    letterSpacing: 0.5,
  },
  sectorsBlock: {
    flexDirection: 'row',
    gap: 2,
    flex: 1,
  },
  sectorCell: {
    flex: 1,
    borderRadius: M3Shape.xs,
    paddingHorizontal: 3,
    paddingVertical: 3,
    alignItems: 'center',
  },
  sectorText: {
    fontSize: 8,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 0.3,
  },
  gapText: {
    fontSize: 9,
    fontWeight: '600',
    width: 58,
    textAlign: 'right',
    fontVariant: ['tabular-nums'] as any,
  },
  tyreBadge: {
    borderRadius: M3Shape.xs,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
    minWidth: 28,
    alignItems: 'center',
  },
  tyreText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  tyreAge: {
    fontSize: 7,
    fontWeight: '500',
    opacity: 0.8,
  },
  expandChevron: {
    fontSize: 8,
    width: 12,
    textAlign: 'center',
  },
  emptyState: {
    padding: Spacing.six,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
