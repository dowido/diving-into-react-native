/**
 * F1TrackMapSvg.tsx
 *
 * Production-grade SVG circuit map implementing the Artello F1 spec.
 *
 * Platform strategy:
 *   - Web:    raw <svg> JSX (no bundle issues, full CSS support)
 *   - Native: react-native-svg (already installed)
 *
 * Features:
 *   - Circuit outline from OpenF1 /v1/location, down-sampled to 500 pts
 *   - Per-driver nodes: team-colour halo glow + filled circle + border ring
 *   - Acronym label above each dot (always shown when ≤ 8 drivers, else only highlighted)
 *   - Highlighted driver: dashed pulsing ring + larger radius
 *   - Live polling every `pollIntervalMs` ms; replay via `replayTimestamp`
 *   - Coordinate normalisation via shared utility (bounding-box + Y-flip)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  CanvasBounds,
  RawPoint,
  computeCanvasBounds,
  downsample,
  toPolylineString,
  toScreenXY,
} from '@/utils/coordinate-normaliser';
import { fetchWithRetry } from '@/constants/ui-utils';
import { ThemedText } from './themed-text';
import { Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationPoint {
  date:          string;
  driver_number: number;
  x: number;
  y: number;
}

export interface DriverInfo {
  name_acronym: string;
  team_colour:  string; // hex with or without '#'
}

export interface F1TrackMapSvgProps {
  sessionKey:             number | null;
  drivers:                Map<number, DriverInfo>;
  highlightDriverNumber?: number | null;
  isLive?:                boolean;
  replayTimestamp?:       string | null;
  canvasHeight?:          number;
  pollIntervalMs?:        number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveColor(hex: string): string {
  if (!hex) return '#94a3b8';
  return hex.startsWith('#') ? hex : `#${hex}`;
}

// ─── Web SVG renderer ────────────────────────────────────────────────────────

interface RendererProps {
  canvasW:         number;
  canvasH:         number;
  trackPoints:     { x: number; y: number }[];
  driverPositions: Map<number, { x: number; y: number }>;
  drivers:         Map<number, DriverInfo>;
  highlightDriver?: number | null;
  flashPhase:      boolean; // toggles dashed ring for highlight animation
}

function WebSvgRenderer({
  canvasW, canvasH, trackPoints, driverPositions, drivers,
  highlightDriver, flashPhase,
}: RendererProps) {
  const polyPoints = toPolylineString(trackPoints);
  const showAllLabels = driverPositions.size <= 8;

  return (
    <svg
      width={canvasW}
      height={canvasH}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      style={{ display: 'block', borderRadius: 12 }}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect x={0} y={0} width={canvasW} height={canvasH} fill="#0b0b0c" rx={12} />

      {/* Track: outer glow */}
      {trackPoints.length > 0 && (
        <polyline
          points={polyPoints}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={20}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Track: main line */}
      {trackPoints.length > 0 && (
        <polyline
          points={polyPoints}
          fill="none"
          stroke="#252530"
          strokeWidth={5.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Track: inner highlight */}
      {trackPoints.length > 0 && (
        <polyline
          points={polyPoints}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Driver indicators — render non-highlighted first, highlight on top */}
      {Array.from(driverPositions.entries())
        .sort(([a], [b]) => (a === highlightDriver ? 1 : b === highlightDriver ? -1 : 0))
        .map(([num, pos]) => {
          const info    = drivers.get(num);
          const color   = resolveColor(info?.team_colour ?? '94a3b8');
          const acronym = info?.name_acronym ?? `${num}`;
          const isHL    = highlightDriver === num;
          const r       = isHL ? 10 : 6;
          const showLabel = showAllLabels || isHL;

          return (
            <g key={num}>
              {/* Soft outer glow */}
              <circle cx={pos.x} cy={pos.y} r={r + 9} fill={color} opacity={0.08} />
              {/* Mid glow */}
              <circle cx={pos.x} cy={pos.y} r={r + 5} fill={color} opacity={0.14} />
              {/* Black border ring */}
              <circle cx={pos.x} cy={pos.y} r={r + 1.5} fill="#0b0b0c" />
              {/* Team-colour fill */}
              <circle cx={pos.x} cy={pos.y} r={r} fill={color} />

              {/* Highlighted driver: dashed pulsing ring */}
              {isHL && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r + 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray={flashPhase ? '4 3' : '2 5'}
                  opacity={flashPhase ? 1 : 0.5}
                />
              )}

              {/* Acronym label */}
              {showLabel && (
                <text
                  x={pos.x}
                  y={pos.y - r - 5}
                  textAnchor="middle"
                  fontSize={isHL ? 9.5 : 7.5}
                  fontWeight="bold"
                  fontFamily="'SF Mono', 'Fira Code', monospace"
                  fill={color}
                  stroke="#0b0b0c"
                  strokeWidth={3}
                  paintOrder="stroke"
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

// ─── Native SVG renderer (react-native-svg) ───────────────────────────────────

let NativeSvgRenderer: React.ComponentType<RendererProps> | null = null;

if (Platform.OS !== 'web') {
  const RNSvg = require('react-native-svg');
  const { default: Svg, Rect, Polyline, Circle, Text: SvgText, G } = RNSvg;

  NativeSvgRenderer = ({
    canvasW, canvasH, trackPoints, driverPositions, drivers,
    highlightDriver, flashPhase,
  }: RendererProps) => {
    const polyPoints = toPolylineString(trackPoints);
    const showAllLabels = driverPositions.size <= 8;

    const entries = Array.from(driverPositions.entries())
      .sort(([a], [b]) => (a === highlightDriver ? 1 : b === highlightDriver ? -1 : 0));

    return (
      <Svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`}>
        <Rect x={0} y={0} width={canvasW} height={canvasH} fill="#0b0b0c" rx={12} />

        {trackPoints.length > 0 && (
          <G>
            <Polyline points={polyPoints} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={polyPoints} fill="none" stroke="#252530" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={polyPoints} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        )}

        {entries.map(([num, pos]) => {
          const info    = drivers.get(num);
          const color   = resolveColor(info?.team_colour ?? '94a3b8');
          const acronym = info?.name_acronym ?? `${num}`;
          const isHL    = highlightDriver === num;
          const r       = isHL ? 10 : 6;
          const showLabel = showAllLabels || isHL;

          return (
            <G key={num}>
              <Circle cx={pos.x} cy={pos.y} r={r + 9} fill={color} opacity={0.08} />
              <Circle cx={pos.x} cy={pos.y} r={r + 5} fill={color} opacity={0.14} />
              <Circle cx={pos.x} cy={pos.y} r={r + 1.5} fill="#0b0b0c" />
              <Circle cx={pos.x} cy={pos.y} r={r} fill={color} />
              {isHL && (
                <Circle
                  cx={pos.x} cy={pos.y} r={r + 4}
                  fill="none" stroke={color} strokeWidth={1.5}
                  strokeDasharray={flashPhase ? '4,3' : '2,5'}
                  opacity={flashPhase ? 1 : 0.5}
                />
              )}
              {showLabel && (
                <SvgText
                  x={pos.x} y={pos.y - r - 5}
                  textAnchor="middle" fontSize={isHL ? 9.5 : 7.5}
                  fontWeight="bold" fill={color}
                >
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

export function F1TrackMapSvg({
  sessionKey,
  drivers,
  highlightDriverNumber,
  isLive = false,
  replayTimestamp,
  canvasHeight = 240,
  pollIntervalMs = 5000,
}: F1TrackMapSvgProps) {
  const { width: screenWidth } = useWindowDimensions();
  const canvasW = Math.min(screenWidth - 32, 640);

  const [trackPoints, setTrackPoints] = useState<{ x: number; y: number }[]>([]);
  const [driverPositions, setDriverPositions] = useState<Map<number, { x: number; y: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [driverCount, setDriverCount] = useState(0);

  // Highlight pulse animation (toggles every 700 ms)
  const [flashPhase, setFlashPhase] = useState(false);

  const boundsRef  = useRef<CanvasBounds | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef   = useRef<AbortController | null>(null);

  // ── Flash timer for highlighted driver ring ────────────────────────────────
  useEffect(() => {
    if (highlightDriverNumber === null || highlightDriverNumber === undefined) return;
    flashRef.current = setInterval(() => setFlashPhase(p => !p), 700);
    return () => { if (flashRef.current) clearInterval(flashRef.current); };
  }, [highlightDriverNumber]);

  // ── Fetch track outline (once per session) ────────────────────────────────
  useEffect(() => {
    if (!sessionKey) {
      setTrackPoints([]);
      setDriverPositions(new Map());
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);

    (async () => {
      try {
        const res = await fetchWithRetry(
          `https://api.openf1.org/v1/location?session_key=${sessionKey}`,
          4, 2000, ac.signal
        );
        if (ac.signal.aborted || !res.ok) return;
        const data: LocationPoint[] = await res.json();
        if (ac.signal.aborted) return;

        // Use the first driver's trace as circuit outline
        const firstDriver = data[0]?.driver_number;
        const outlineRaw = data.filter(p => p.driver_number === firstDriver);
        const sampled: RawPoint[] = downsample(outlineRaw, 500);

        const b = computeCanvasBounds(sampled, canvasW, canvasHeight, 20);
        if (!b) return;

        boundsRef.current = b;
        setTrackPoints(sampled.map(p => toScreenXY(b, p.x, p.y)));
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.warn('[F1TrackMapSvg] track:', e);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => { ac.abort(); };
  }, [sessionKey, canvasW, canvasHeight]);

  // ── Fetch driver positions ────────────────────────────────────────────────
  const fetchPositions = useCallback(async (signal?: AbortSignal) => {
    const b = boundsRef.current;
    if (!b || !sessionKey) return;

    try {
      let url: string;
      if (replayTimestamp) {
        const ts  = new Date(replayTimestamp).getTime();
        const from = new Date(ts - 1500).toISOString();
        const to   = new Date(ts + 1500).toISOString();
        url = `https://api.openf1.org/v1/location?session_key=${sessionKey}&date>=${from}&date<=${to}`;
      } else {
        const since = new Date(Date.now() - 8000).toISOString();
        url = `https://api.openf1.org/v1/location?session_key=${sessionKey}&date>=${since}`;
      }

      const res = await fetchWithRetry(url, 3, 1500, signal);
      if (signal?.aborted || !res.ok) return;
      const data: LocationPoint[] = await res.json();
      if (signal?.aborted) return;

      // Keep latest point per driver
      const latest = new Map<number, LocationPoint>();
      for (const pt of data) {
        const ex = latest.get(pt.driver_number);
        if (!ex || pt.date > ex.date) latest.set(pt.driver_number, pt);
      }

      const positions = new Map<number, { x: number; y: number }>();
      latest.forEach((pt, num) => positions.set(num, toScreenXY(b, pt.x, pt.y)));
      setDriverPositions(positions);
      setDriverCount(positions.size);
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('[F1TrackMapSvg] positions:', e);
    }
  }, [sessionKey, replayTimestamp]);

  // ── Poll once track is loaded ─────────────────────────────────────────────
  useEffect(() => {
    if (trackPoints.length === 0) return;

    const ac = new AbortController();
    fetchPositions(ac.signal);

    if (isLive && !replayTimestamp) {
      pollRef.current = setInterval(() => fetchPositions(ac.signal), pollIntervalMs);
    }

    return () => {
      ac.abort();
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [trackPoints, isLive, replayTimestamp, pollIntervalMs, fetchPositions]);

  // ── Render ────────────────────────────────────────────────────────────────

  const Renderer = Platform.OS === 'web' ? WebSvgRenderer : NativeSvgRenderer;

  return (
    <View style={[styles.container, { height: canvasHeight }]}>
      {loading || !sessionKey ? (
        <View style={styles.placeholder}>
          {sessionKey ? (
            <>
              <ActivityIndicator size="small" color="#00e5ff" />
              <ThemedText type="code" style={styles.placeholderText} themeColor="textSecondary">
                Loading circuit…
              </ThemedText>
            </>
          ) : (
            <ThemedText type="code" style={styles.placeholderText} themeColor="textSecondary">
              Select a session
            </ThemedText>
          )}
        </View>
      ) : trackPoints.length === 0 ? (
        <View style={styles.placeholder}>
          <ThemedText type="code" style={styles.placeholderText} themeColor="textSecondary">
            No track data for this session
          </ThemedText>
        </View>
      ) : Renderer ? (
        <>
          <Renderer
            canvasW={canvasW}
            canvasH={canvasHeight}
            trackPoints={trackPoints}
            driverPositions={driverPositions}
            drivers={drivers}
            highlightDriver={highlightDriverNumber}
            flashPhase={flashPhase}
          />
          {driverCount > 0 && (
            <View style={styles.footer}>
              {isLive && !replayTimestamp && (
                <View style={styles.liveDot} />
              )}
              <ThemedText type="code" style={styles.footerText} themeColor="textSecondary">
                {driverCount} driver{driverCount !== 1 ? 's' : ''} tracked
              </ThemedText>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0b0b0c',
    position: 'relative',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  placeholderText: {
    fontSize: 10,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#22c55e',
  },
  footerText: {
    fontSize: 8,
    letterSpacing: 0.3,
  },
});
