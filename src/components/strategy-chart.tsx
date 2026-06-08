/**
 * strategy-chart.tsx
 *
 * Visual stint timeline showing each driver's tyre strategy over a race.
 * Data from OpenF1 /v1/stints + /v1/pit for a completed or live session.
 *
 * Layout:
 *   X-axis: laps 1 → totalLaps
 *   Y-axis: one row per driver, sorted by final position
 *   Stint blocks: coloured by compound, width = laps on that compound
 *   Pit markers: vertical line at pit lap, pit_duration label below
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { tyreSpec } from '@/constants/pit-wall-theme';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StintData {
  driver_number: number;
  stint_number:  number;
  lap_start:     number;
  lap_end:       number | null;
  compound:      string;
  tyre_age_at_start: number;
}

interface PitData {
  driver_number: number;
  lap_number:    number;
  pit_duration:  number | null;  // stationary seconds
  date:          string;
}

interface DriverInfo {
  name_acronym: string;
  team_colour:  string;
}

export interface StrategyChartProps {
  sessionKey: number | null;
  /** Map from driver_number → info used to label rows */
  drivers:    Map<number, DriverInfo>;
  /** Total lap count (from session_result or race_control) */
  totalLaps?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHART_HEIGHT_PER_ROW = 28;  // px per driver row
const PIT_MARKER_WIDTH     = 2;   // px width of pit stop line
const MIN_STINT_WIDTH      = 4;   // px minimum rendered stint width

// ─── Main Component ───────────────────────────────────────────────────────────

export function StrategyChart({ sessionKey, drivers, totalLaps }: StrategyChartProps) {
  const theme = useTheme();

  const [stints, setStints]     = useState<StintData[]>([]);
  const [pits, setPits]         = useState<PitData[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch stints + pits ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!sessionKey) { setLoading(false); return; }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    try {
      const [stintsRes, pitsRes] = await Promise.all([
        fetchWithRetry(`https://api.openf1.org/v1/stints?session_key=${sessionKey}`, 3, 1500, ac.signal),
        fetchWithRetry(`https://api.openf1.org/v1/pit?session_key=${sessionKey}`,    3, 1500, ac.signal),
      ]);

      if (ac.signal.aborted) return;

      if (stintsRes.ok) {
        const raw = await stintsRes.json();
        setStints(Array.isArray(raw) ? raw : []);
      }
      if (pitsRes.ok) {
        const raw = await pitsRes.json();
        setPits(Array.isArray(raw) ? raw : []);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Could not load strategy data.');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [sessionKey]);

  useEffect(() => {
    load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  // ── Derived data ─────────────────────────────────────────────────────────

  // Calculate total laps from stint data if not provided
  const calculatedTotalLaps = totalLaps ??
    Math.max(0, ...stints.map(s => s.lap_end ?? s.lap_start));

  const raceLaps = Math.max(calculatedTotalLaps, 1);

  // Group stints by driver
  const driverStints = new Map<number, StintData[]>();
  for (const s of stints) {
    if (!driverStints.has(s.driver_number)) driverStints.set(s.driver_number, []);
    driverStints.get(s.driver_number)!.push(s);
  }

  // Group pits by driver
  const driverPits = new Map<number, PitData[]>();
  for (const p of pits) {
    if (!driverPits.has(p.driver_number)) driverPits.set(p.driver_number, []);
    driverPits.get(p.driver_number)!.push(p);
  }

  // Sorted driver numbers (those with stints, sorted by driver_number as proxy for position)
  const driverNums = Array.from(driverStints.keys()).sort((a, b) => a - b);

  if (!sessionKey) return null;

  if (loading) {
    return (
      <ThemedView style={[styles.card, { borderColor: theme.backgroundElement }]}>
        <View style={[styles.accentBar, { backgroundColor: '#ff1801' }]} />
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.cosmicIndigo} />
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingText}>
            Loading strategy data…
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || driverNums.length === 0) {
    return (
      <ThemedView style={[styles.card, { borderColor: theme.backgroundElement }]}>
        <View style={[styles.accentBar, { backgroundColor: '#ff1801' }]} />
        <ThemedText type="code" themeColor="textSecondary" style={styles.noData}>
          {error ?? 'No strategy data available for this session.'}
        </ThemedText>
      </ThemedView>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <ThemedView style={[styles.card, { borderColor: theme.backgroundElement }]}>
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: '#ff1801' }]} />

      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.headerTitle} themeColor="text">
          TYRE STRATEGY
        </ThemedText>
        <ThemedText type="code" style={styles.headerSub} themeColor="textSecondary">
          {raceLaps} laps · {driverNums.length} cars
        </ThemedText>

        {/* Compound legend */}
        <View style={styles.legend}>
          {(['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'] as const).map(c => {
            const spec = tyreSpec(c);
            return (
              <View key={c} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: spec.color }]} />
                <ThemedText type="code" style={styles.legendLabel} themeColor="textSecondary">
                  {spec.label}
                </ThemedText>
              </View>
            );
          })}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartBody}>
          {/* Lap tick marks at top */}
          <View style={[styles.lapAxis, { width: 320 }]}>
            {[1, Math.floor(raceLaps / 4), Math.floor(raceLaps / 2),
              Math.floor((3 * raceLaps) / 4), raceLaps].map(lap => (
              <View
                key={lap}
                style={[styles.lapTick, { left: `${((lap - 1) / raceLaps) * 100}%` as any }]}
              >
                <ThemedText type="code" style={styles.lapTickLabel} themeColor="textSecondary">
                  {lap}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Driver rows */}
          {driverNums.map(num => {
            const driverInfo  = drivers.get(num);
            const acronym     = driverInfo?.name_acronym ?? `${num}`;
            const teamHex     = driverInfo?.team_colour ?? '94a3b8';
            const teamColor   = teamHex.startsWith('#') ? teamHex : `#${teamHex}`;
            const rowStints   = driverStints.get(num) ?? [];
            const rowPits     = driverPits.get(num) ?? [];

            return (
              <View key={num} style={styles.driverRow}>
                {/* Driver label */}
                <View style={[styles.driverLabel, { borderRightColor: teamColor }]}>
                  <ThemedText type="code" style={[styles.driverAcronym, { color: teamColor }]}>
                    {acronym}
                  </ThemedText>
                </View>

                {/* Stint + pit timeline */}
                <View style={[styles.timeline, { backgroundColor: theme.backgroundElement }]}>
                  {rowStints.map(s => {
                    const lapStart = s.lap_start;
                    const lapEnd   = s.lap_end ?? raceLaps;
                    const leftPct  = ((lapStart - 1) / raceLaps) * 100;
                    const widthPct = Math.max(MIN_STINT_WIDTH / 320 * 100, ((lapEnd - lapStart + 1) / raceLaps) * 100);
                    const spec     = tyreSpec(s.compound);

                    return (
                      <View
                        key={`${num}-${s.stint_number}`}
                        style={[
                          styles.stintBlock,
                          {
                            left:             `${leftPct}%` as any,
                            width:            `${widthPct}%` as any,
                            backgroundColor:  spec.color,
                            opacity:          0.85,
                          },
                        ]}
                      >
                        {widthPct > 6 && (
                          <ThemedText style={styles.stintLabel}>
                            {spec.label}
                          </ThemedText>
                        )}
                      </View>
                    );
                  })}

                  {/* Pit stop markers */}
                  {rowPits.map(p => {
                    const leftPct = ((p.lap_number - 1) / raceLaps) * 100;
                    return (
                      <View
                        key={`pit-${num}-${p.lap_number}`}
                        style={[styles.pitLine, { left: `${leftPct}%` as any }]}
                      >
                        {p.pit_duration !== null && (
                          <ThemedText style={styles.pitDuration}>
                            {p.pit_duration.toFixed(1)}s
                          </ThemedText>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
    ...cardShadow({ opacity: 0.15, radius: 10, offsetY: 4, elevation: 2 }),
  },
  accentBar: {
    height: 3,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  loadingText: {
    fontSize: 10,
  },
  noData: {
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  header: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  headerTitle: {
    fontSize: 10.5,
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // Chart
  chartBody: {
    paddingHorizontal: Spacing.three,
    width: 380,
    gap: 2,
  },
  lapAxis: {
    height: 16,
    position: 'relative',
    marginLeft: 36,
    marginBottom: 2,
  },
  lapTick: {
    position: 'absolute',
    top: 0,
  },
  lapTickLabel: {
    fontSize: 7.5,
    letterSpacing: 0.2,
  },

  // Driver rows
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CHART_HEIGHT_PER_ROW,
    gap: Spacing.one,
  },
  driverLabel: {
    width: 32,
    alignItems: 'flex-end',
    paddingRight: 6,
    borderRightWidth: 2,
    height: '100%',
    justifyContent: 'center',
  },
  driverAcronym: {
    fontSize: 8.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  timeline: {
    flex: 1,
    height: 18,
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  stintBlock: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: MIN_STINT_WIDTH,
  },
  stintLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: 0.3,
  },

  // Pit markers
  pitLine: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: PIT_MARKER_WIDTH,
    backgroundColor: '#ffffff',
    opacity: 0.9,
    zIndex: 2,
  },
  pitDuration: {
    position: 'absolute',
    bottom: -14,
    left: -10,
    fontSize: 6.5,
    color: '#94a3b8',
    fontWeight: 'bold',
    width: 28,
    textAlign: 'center',
  },
});
