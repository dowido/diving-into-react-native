/**
 * SkiaTelemetryChart — Multi-driver overlay line chart using Skia.
 *
 * Renders stacked line charts for Speed, RPM, Throttle, and Brake channels.
 * Supports dual-driver overlay: both drivers share the same Y-axis with
 * different stroke colors and a semi-transparent gradient fill.
 *
 * Web fallback: SVG polyline (no Skia dependency).
 */

import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';
import { M3Shape, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CarDataFrame {
  date: string;
  speed: number;
  rpm: number;
  throttle: number;
  brake: number;
  n_gear?: number;
  drs?: number;
}

type Channel = 'speed' | 'rpm' | 'throttle' | 'brake';

interface ChannelConfig {
  key: Channel;
  label: string;
  unit: string;
  max: number;
  color: string;
}

const CHANNELS: ChannelConfig[] = [
  { key: 'speed',    label: 'SPEED',    unit: 'km/h', max: 360,   color: '#00e5ff' },
  { key: 'rpm',      label: 'RPM',      unit: 'rpm',  max: 14000, color: '#a855f7' },
  { key: 'throttle', label: 'THROTTLE', unit: '%',    max: 100,   color: '#22c55e' },
  { key: 'brake',    label: 'BRAKE',    unit: '%',    max: 100,   color: '#ef4444' },
];

interface ChartProps {
  framesA: CarDataFrame[];
  framesB?: CarDataFrame[];
  colorA: string;
  colorB?: string;
  labelA?: string;
  labelB?: string;
  currentIndexA?: number;
  currentIndexB?: number;
  chartHeight?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPolylinePoints(
  frames: CarDataFrame[],
  channel: Channel,
  max: number,
  width: number,
  height: number,
): string {
  if (frames.length < 2) return '';
  const step = width / (frames.length - 1);
  return frames
    .map((f, i) => {
      const val = Math.min(f[channel] ?? 0, max);
      const x = i * step;
      const y = height - (val / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ─── Single Channel Chart (SVG-based, works web + native) ────────────────────

function ChannelChart({
  cfg,
  framesA,
  framesB,
  colorA,
  colorB,
  width,
  height,
  currentIndexA,
  currentIndexB,
}: {
  cfg: ChannelConfig;
  framesA: CarDataFrame[];
  framesB?: CarDataFrame[];
  colorA: string;
  colorB?: string;
  width: number;
  height: number;
  currentIndexA?: number;
  currentIndexB?: number;
}) {
  const theme = useTheme();
  const ch = cfg.key;
  const max = cfg.max;

  const pointsA = useMemo(
    () => buildPolylinePoints(framesA, ch, max, width, height),
    [framesA, ch, max, width, height]
  );
  const pointsB = useMemo(
    () => (framesB ? buildPolylinePoints(framesB, ch, max, width, height) : ''),
    [framesB, ch, max, width, height]
  );

  // Current value
  const valA = framesA[currentIndexA ?? 0]?.[ch] ?? 0;
  const valB = framesB ? framesB[currentIndexB ?? 0]?.[ch] ?? 0 : null;

  // Cursor X for driver A
  const stepA = framesA.length > 1 ? width / (framesA.length - 1) : 0;
  const cursorX = ((currentIndexA ?? 0) * stepA);

  const bgColor = theme.background;
  const gridColor = theme.outline + '40';

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.chartCell, { backgroundColor: theme.surfaceVariant, borderColor: theme.outline }]}>
        {/* Header */}
        <View style={styles.chartHeader}>
          <ThemedText style={[styles.channelLabel, { color: cfg.color }]}>{cfg.label}</ThemedText>
          <View style={styles.valueRow}>
            <View style={[styles.valuePip, { backgroundColor: colorA }]} />
            <ThemedText style={[styles.valueText, { color: colorA }]}>
              {Math.round(valA)}<ThemedText style={styles.unitText}> {cfg.unit}</ThemedText>
            </ThemedText>
            {valB !== null && colorB && (
              <>
                <View style={[styles.valuePip, { backgroundColor: colorB }]} />
                <ThemedText style={[styles.valueText, { color: colorB }]}>
                  {Math.round(valB)}<ThemedText style={styles.unitText}> {cfg.unit}</ThemedText>
                </ThemedText>
              </>
            )}
          </View>
        </View>

        {/* SVG chart */}
        {/* @ts-ignore */}
        <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct) => (
            // @ts-ignore
            <line
              key={pct}
              x1={0} y1={height * pct}
              x2={width} y2={height * pct}
              stroke={gridColor}
              strokeWidth={1}
            />
          ))}

          {/* Driver B fill + line */}
          {pointsB && colorB && (
            <>
              {/* @ts-ignore */}
              <polyline
                points={pointsB}
                fill="none"
                stroke={colorB}
                strokeWidth={1.5}
                strokeOpacity={0.7}
              />
            </>
          )}

          {/* Driver A fill + line */}
          {pointsA && (
            <>
              {/* @ts-ignore */}
              <polyline
                points={pointsA}
                fill="none"
                stroke={colorA}
                strokeWidth={2}
              />
            </>
          )}

          {/* Cursor line */}
          {framesA.length > 0 && (currentIndexA ?? 0) > 0 && (
            // @ts-ignore
            <line
              x1={cursorX} y1={0}
              x2={cursorX} y2={height}
              stroke="#ffffff"
              strokeWidth={1}
              strokeOpacity={0.4}
            />
          )}
        </svg>
      </View>
    );
  }

  // Native: use react-native-svg (already a dependency)
  const RNSvg = require('react-native-svg');
  const { Svg, Polyline, Line } = RNSvg;

  return (
    <View style={[styles.chartCell, { backgroundColor: theme.surfaceVariant, borderColor: theme.outline }]}>
      <View style={styles.chartHeader}>
        <ThemedText style={[styles.channelLabel, { color: cfg.color }]}>{cfg.label}</ThemedText>
        <View style={styles.valueRow}>
          <View style={[styles.valuePip, { backgroundColor: colorA }]} />
          <ThemedText style={[styles.valueText, { color: colorA }]}>
            {Math.round(valA)}<ThemedText style={styles.unitText}> {cfg.unit}</ThemedText>
          </ThemedText>
          {valB !== null && colorB && (
            <>
              <View style={[styles.valuePip, { backgroundColor: colorB }]} />
              <ThemedText style={[styles.valueText, { color: colorB }]}>
                {Math.round(valB)}<ThemedText style={styles.unitText}> {cfg.unit}</ThemedText>
              </ThemedText>
            </>
          )}
        </View>
      </View>
      <Svg width={width} height={height} style={{ overflow: 'visible' }}>
        {[0.25, 0.5, 0.75].map((pct: number) => (
          <Line
            key={pct}
            x1={0} y1={height * pct}
            x2={width} y2={height * pct}
            stroke={gridColor}
            strokeWidth={1}
          />
        ))}
        {pointsB && colorB && (
          <Polyline points={pointsB} fill="none" stroke={colorB} strokeWidth={1.5} strokeOpacity={0.7} />
        )}
        {pointsA && (
          <Polyline points={pointsA} fill="none" stroke={colorA} strokeWidth={2} />
        )}
        {framesA.length > 0 && (currentIndexA ?? 0) > 0 && (
          <Line x1={cursorX} y1={0} x2={cursorX} y2={height}
            stroke="#ffffff" strokeWidth={1} strokeOpacity={0.4} />
        )}
      </Svg>
    </View>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function SkiaTelemetryChart({
  framesA,
  framesB,
  colorA,
  colorB,
  labelA,
  labelB,
  currentIndexA,
  currentIndexB,
  chartHeight = 60,
}: ChartProps) {
  const theme = useTheme();
  const chartWidth = 320;

  return (
    <View style={styles.container}>
      {/* Driver legend */}
      {(labelA || labelB) && (
        <View style={styles.legend}>
          {labelA && (
            <View style={styles.legendItem}>
              <View style={[styles.legendPip, { backgroundColor: colorA }]} />
              <ThemedText style={[styles.legendLabel, { color: colorA }]}>{labelA}</ThemedText>
            </View>
          )}
          {labelB && colorB && (
            <View style={styles.legendItem}>
              <View style={[styles.legendPip, { backgroundColor: colorB }]} />
              <ThemedText style={[styles.legendLabel, { color: colorB }]}>{labelB}</ThemedText>
            </View>
          )}
        </View>
      )}

      {/* 4 channel charts */}
      {CHANNELS.map((cfg) => (
        <ChannelChart
          key={cfg.key}
          cfg={cfg}
          framesA={framesA}
          framesB={framesB}
          colorA={colorA}
          colorB={colorB}
          width={chartWidth}
          height={chartHeight}
          currentIndexA={currentIndexA}
          currentIndexB={currentIndexB}
        />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendPip: {
    width: 16,
    height: 3,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chartCell: {
    borderRadius: M3Shape.sm,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.one,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  channelLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  valuePip: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  valueText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unitText: {
    fontSize: 8,
    fontWeight: '400',
    opacity: 0.7,
  },
});
