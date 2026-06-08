/**
 * CircuitMap — renders an F1 circuit track outline with live driver position dots.
 *
 * Data source: OpenF1 /v1/location  { date, driver_number, x, y }
 *
 * Rendering strategy:
 *   - Web: uses a native <svg> element via dangerouslySetInnerHTML pattern
 *     (avoids react-native-svg web bundle issues)
 *   - Native: uses react-native-svg
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationPoint {
  date: string;
  driver_number: number;
  x: number;
  y: number;
}

interface DriverInfo {
  name_acronym: string;
  team_colour: string;
}

export interface CircuitMapProps {
  sessionKey: number | null;
  /** Map from driver_number → driver info, used to color the dots */
  drivers: Map<number, DriverInfo>;
  /** If provided, show positions at (or near) this ISO timestamp instead of live */
  replayTimestamp?: string | null;
  /** If true, poll for live positions */
  isLive?: boolean;
  /** Highlight a specific driver with a larger dot */
  highlightDriverNumber?: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAP_WIDTH = 340;
const MAP_HEIGHT = 200;
const MAP_PADDING = 14;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Bounds {
  minX: number; maxX: number; minY: number; maxY: number;
  scale: number; offX: number; offY: number;
}

function computeBounds(pts: { x: number; y: number }[]): Bounds | null {
  if (pts.length === 0) return null;
  let minX = pts[0].x, maxX = pts[0].x;
  let minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const usableW = MAP_WIDTH - MAP_PADDING * 2;
  const usableH = MAP_HEIGHT - MAP_PADDING * 2;
  const scale = Math.min(usableW / rangeX, usableH / rangeY);
  const drawW = rangeX * scale;
  const drawH = rangeY * scale;
  const offX = MAP_PADDING + (usableW - drawW) / 2;
  const offY = MAP_PADDING + (usableH - drawH) / 2;
  return { minX, maxX, minY, maxY, scale, offX, offY };
}

function toMapXY(b: Bounds, rawX: number, rawY: number) {
  return {
    x: b.offX + (rawX - b.minX) * b.scale,
    y: b.offY + (b.maxY - rawY) * b.scale, // Flip Y
  };
}

/** Build sampled path points list from location data */
function buildPath(pts: LocationPoint[], maxPts = 500) {
  const step = Math.max(1, Math.floor(pts.length / maxPts));
  return pts.filter((_, i) => i % step === 0).map(p => ({ x: p.x, y: p.y }));
}

/** Convert to SVG polyline points string */
function toSvgPoints(pts: { x: number; y: number }[]) {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

// ─── Web SVG renderer (uses raw DOM svg, no react-native-svg) ─────────────────

function WebCircuitSvg({
  trackPoints,
  driverPositions,
  drivers,
  highlightDriverNumber,
  bgColor,
  trackColor,
}: {
  trackPoints: { x: number; y: number }[];
  driverPositions: Map<number, { x: number; y: number }>;
  drivers: Map<number, DriverInfo>;
  highlightDriverNumber?: number | null;
  bgColor: string;
  trackColor: string;
}) {
  const polylinePoints = toSvgPoints(trackPoints);

  return (
    <svg
      width="100%"
      height={MAP_HEIGHT}
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      style={{ display: 'block', borderRadius: 8 }}
    >
      {/* Background */}
      <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill={bgColor} rx={8} />

      {/* Track shadow */}
      {trackPoints.length > 0 && (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* Track line */}
      {trackPoints.length > 0 && (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={trackColor}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Driver dots */}
      {Array.from(driverPositions.entries()).map(([driverNum, pos]) => {
        const info = drivers.get(driverNum);
        const hex = info?.team_colour ?? '00e5ff';
        const color = hex.startsWith('#') ? hex : `#${hex}`;
        const acronym = info?.name_acronym ?? `${driverNum}`;
        const isHL = highlightDriverNumber === driverNum;
        const r = isHL ? 8 : 5;
        return (
          <g key={driverNum}>
            <circle cx={pos.x} cy={pos.y} r={r + 5} fill={color} opacity={0.18} />
            <circle cx={pos.x} cy={pos.y} r={r} fill={color} stroke="#000" strokeWidth={1.5} />
            {(isHL || driverPositions.size <= 6) && (
              <text
                x={pos.x}
                y={pos.y - r - 3}
                textAnchor="middle"
                fontSize={7}
                fontWeight="bold"
                fill={color}
              >
                {acronym}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Native SVG renderer (uses react-native-svg) ─────────────────────────────

let NativeCircuitSvg: React.ComponentType<Parameters<typeof WebCircuitSvg>[0]>;

if (Platform.OS !== 'web') {
  // Lazy-require react-native-svg so it doesn't crash on web
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNSvg = require('react-native-svg');
  const Svg = RNSvg.default ?? RNSvg.Svg;
  const { Polyline, Rect, Circle, Text: SvgText, G } = RNSvg;

  NativeCircuitSvg = ({
    trackPoints,
    driverPositions,
    drivers,
    highlightDriverNumber,
    bgColor,
    trackColor,
  }) => {
    const polylinePoints = toSvgPoints(trackPoints);
    return (
      <Svg width="100%" height={MAP_HEIGHT} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
        <Rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill={bgColor} rx={8} />
        {trackPoints.length > 0 && (
          <>
            <Polyline points={polylinePoints} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={polylinePoints} fill="none" stroke={trackColor} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {Array.from(driverPositions.entries()).map(([driverNum, pos]) => {
          const info = drivers.get(driverNum);
          const hex = info?.team_colour ?? '00e5ff';
          const color = hex.startsWith('#') ? hex : `#${hex}`;
          const acronym = info?.name_acronym ?? `${driverNum}`;
          const isHL = highlightDriverNumber === driverNum;
          const r = isHL ? 8 : 5;
          return (
            <G key={driverNum}>
              <Circle cx={pos.x} cy={pos.y} r={r + 5} fill={color} opacity={0.18} />
              <Circle cx={pos.x} cy={pos.y} r={r} fill={color} stroke="#000" strokeWidth={1.5} />
              {(isHL || driverPositions.size <= 6) && (
                <SvgText x={pos.x} y={pos.y - r - 3} textAnchor="middle" fontSize={7} fontWeight="bold" fill={color}>
                  {acronym}
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>
    );
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CircuitMap({
  sessionKey,
  drivers,
  replayTimestamp,
  isLive = false,
  highlightDriverNumber,
}: CircuitMapProps) {
  const theme = useTheme();

  const [trackLoading, setTrackLoading] = useState(false);
  const [trackNormalized, setTrackNormalized] = useState<{ x: number; y: number }[]>([]);
  const [driverPositions, setDriverPositions] = useState<Map<number, { x: number; y: number }>>(new Map());

  // Keep raw data + bounds for driver dot mapping
  const boundsRef = useRef<Bounds | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch track outline ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionKey) {
      setTrackNormalized([]);
      setDriverPositions(new Map());
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setTrackLoading(true);
    setTrackNormalized([]);

    (async () => {
      try {
        const res = await fetchWithRetry(
          `https://api.openf1.org/v1/location?session_key=${sessionKey}`,
          4,
          2000,
          ac.signal
        );
        if (ac.signal.aborted) return;
        if (!res.ok) { setTrackLoading(false); return; }

        const data: LocationPoint[] = await res.json();
        if (ac.signal.aborted) return;

        const sampled = buildPath(data, 500);
        const bounds = computeBounds(sampled);
        boundsRef.current = bounds;

        if (bounds) {
          const normalized = sampled.map(p => toMapXY(bounds, p.x, p.y));
          setTrackNormalized(normalized);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') console.warn('CircuitMap track error:', err);
      } finally {
        if (!ac.signal.aborted) setTrackLoading(false);
      }
    })();

    return () => ac.abort();
  }, [sessionKey]);

  // ── Fetch driver positions ─────────────────────────────────────────────────
  const fetchDriverPositions = useCallback(async (signal?: AbortSignal) => {
    if (!sessionKey || !boundsRef.current) return;
    const bounds = boundsRef.current;

    try {
      let url: string;
      if (replayTimestamp) {
        const ts = new Date(replayTimestamp).getTime();
        const before = new Date(ts - 1000).toISOString();
        const after  = new Date(ts + 1000).toISOString();
        url = `https://api.openf1.org/v1/location?session_key=${sessionKey}&date>=${before}&date<=${after}`;
      } else {
        const start = new Date(Date.now() - 8000).toISOString();
        url = `https://api.openf1.org/v1/location?session_key=${sessionKey}&date>=${start}`;
      }

      const res = await fetchWithRetry(url, 3, 1500, signal);
      if (signal?.aborted) return;
      if (!res.ok) return;

      const data: LocationPoint[] = await res.json();
      if (signal?.aborted) return;

      // Pick the latest point per driver
      const latest = new Map<number, LocationPoint>();
      for (const pt of data) {
        const existing = latest.get(pt.driver_number);
        if (!existing || pt.date > existing.date) latest.set(pt.driver_number, pt);
      }

      const newPos = new Map<number, { x: number; y: number }>();
      latest.forEach((pt, num) => {
        newPos.set(num, toMapXY(bounds, pt.x, pt.y));
      });
      setDriverPositions(newPos);
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.warn('CircuitMap driver pos error:', err);
    }
  }, [sessionKey, replayTimestamp]);

  // Poll/fetch positions once track is loaded
  useEffect(() => {
    if (trackNormalized.length === 0) return;

    const ac = new AbortController();
    fetchDriverPositions(ac.signal);

    if (isLive && !replayTimestamp) {
      pollRef.current = setInterval(() => fetchDriverPositions(ac.signal), 6000);
    }

    return () => {
      ac.abort();
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [trackNormalized, replayTimestamp, isLive, fetchDriverPositions]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const SvgRenderer = Platform.OS === 'web' ? WebCircuitSvg : NativeCircuitSvg;

  return (
    <ThemedView
      style={[
        styles.card,
        { borderColor: theme.backgroundElement },
      ]}
    >
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: theme.neonTeal }]} />

      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: isLive ? '#22c55e' : theme.textSecondary }]} />
        <ThemedText type="smallBold" style={styles.headerTitle}>
          CIRCUIT MAP
        </ThemedText>
        {isLive && !replayTimestamp && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <ThemedText type="code" style={styles.liveText}>LIVE</ThemedText>
          </View>
        )}
        {replayTimestamp && (
          <View style={[styles.liveBadge, { backgroundColor: 'rgba(255,148,0,0.15)' }]}>
            <ThemedText type="code" style={[styles.liveText, { color: '#ff9400' }]}>REPLAY</ThemedText>
          </View>
        )}
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {trackLoading || !sessionKey ? (
          <View style={styles.mapLoading}>
            {sessionKey ? (
              <>
                <ActivityIndicator size="small" color={theme.neonTeal} />
                <ThemedText type="code" style={styles.mapLoadingText} themeColor="textSecondary">
                  Loading track data…
                </ThemedText>
              </>
            ) : (
              <ThemedText type="code" style={styles.mapLoadingText} themeColor="textSecondary">
                Select a session to view the circuit map
              </ThemedText>
            )}
          </View>
        ) : trackNormalized.length === 0 ? (
          <View style={styles.mapLoading}>
            <ThemedText type="code" style={styles.mapLoadingText} themeColor="textSecondary">
              No track data available for this session
            </ThemedText>
          </View>
        ) : (
          <SvgRenderer
            trackPoints={trackNormalized}
            driverPositions={driverPositions}
            drivers={drivers}
            highlightDriverNumber={highlightDriverNumber}
            bgColor={theme.background}
            trackColor={theme.backgroundElement}
          />
        )}
      </View>

      {driverPositions.size > 0 && (
        <ThemedText type="code" style={styles.footer} themeColor="textSecondary">
          {driverPositions.size} driver{driverPositions.size !== 1 ? 's' : ''} tracked
        </ThemedText>
      )}
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    ...Platform.select({
      web: { boxShadow: '0px 4px 20px rgba(0,0,0,0.2)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 3,
      },
    }),
  },
  accentBar: {
    height: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerTitle: {
    letterSpacing: 1,
    fontSize: 10.5,
    flex: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#22c55e',
  },
  liveText: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#22c55e',
    letterSpacing: 0.5,
  },
  mapContainer: {
    marginHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    minHeight: MAP_HEIGHT,
  },
  mapLoading: {
    height: MAP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  mapLoadingText: {
    fontSize: 10,
    textAlign: 'center',
  },
  footer: {
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
    letterSpacing: 0.5,
  },
});
