/**
 * weather-panel.tsx
 *
 * Compact weather card fetching OpenF1 /v1/weather.
 * Shows: track temp, air temp, humidity, wind speed + cardinal direction, rainfall.
 * Auto-refreshes every 60 s during live sessions.
 */

import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { cardShadow, fetchWithRetry } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeatherFrame {
  date:              string;
  air_temperature:   number;   // °C
  track_temperature: number;   // °C
  humidity:          number;   // % relative
  pressure:          number;   // mbar
  rainfall:          number;   // 0 = dry, 1 = rain
  wind_direction:    number;   // degrees 0–359
  wind_speed:        number;   // m/s
}

export interface WeatherPanelProps {
  sessionKey: number | null;
  isLive?:    boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CARDINAL = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function windCardinal(deg: number): string {
  return CARDINAL[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function windArrow(deg: number): string {
  // Map cardinal to arrow character
  const arrows: Record<string, string> = {
    N: '↑', NE: '↗', E: '→', SE: '↘',
    S: '↓', SW: '↙', W: '←', NW: '↖',
  };
  return arrows[windCardinal(deg)] ?? '→';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCell({
  label, value, unit, color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.metricCell}>
      <ThemedText type="code" style={styles.metricLabel} themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.metricValueRow}>
        <ThemedText
          type="smallBold"
          style={[styles.metricValue, color ? { color } : undefined]}
          themeColor={color ? undefined : 'text'}
        >
          {value}
        </ThemedText>
        {unit && (
          <ThemedText type="code" style={styles.metricUnit} themeColor="textSecondary">
            {unit}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WeatherPanel({ sessionKey, isLive = false }: WeatherPanelProps) {
  const theme = useTheme();
  const [weather, setWeather] = useState<WeatherFrame | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rain pulse animation
  const rainOpacity = useRef(new Animated.Value(1)).current;
  const rainAnim    = useRef<Animated.CompositeAnimation | null>(null);

  const fetchWeather = useCallback(async () => {
    if (!sessionKey) return;
    try {
      const res = await fetchWithRetry(
        `https://api.openf1.org/v1/weather?session_key=${sessionKey}`
      );
      if (!res.ok) return;
      const data: WeatherFrame[] = await res.json();
      if (data && data.length > 0) {
        // Latest frame
        const latest = data[data.length - 1];
        setWeather(latest);
      }
    } catch (e) {
      console.warn('[WeatherPanel]', e);
    } finally {
      setLoading(false);
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey) { setLoading(false); return; }
    setLoading(true);
    fetchWeather();

    if (isLive) {
      pollRef.current = setInterval(fetchWeather, 60_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionKey, isLive, fetchWeather]);

  // Rain pulse animation
  useEffect(() => {
    rainAnim.current?.stop();
    if (weather?.rainfall && weather.rainfall > 0) {
      rainAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(rainOpacity, { toValue: 0.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(rainOpacity, { toValue: 1.0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      );
      rainAnim.current.start();
    } else {
      rainOpacity.setValue(1);
    }
    return () => { rainAnim.current?.stop(); };
  }, [weather?.rainfall]);

  if (!sessionKey) return null;

  if (loading) {
    return (
      <ThemedView style={[styles.card, { borderColor: theme.backgroundElement }]}>
        <View style={[styles.accentBar, { backgroundColor: '#3b82f6' }]} />
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <ThemedText type="code" themeColor="textSecondary" style={styles.loadingText}>
            Fetching weather…
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!weather) return null;

  const isRaining = weather.rainfall > 0;
  const accentColor = isRaining ? '#3b82f6' : '#22c55e';

  return (
    <ThemedView style={[styles.card, { borderColor: theme.backgroundElement }]}>
      {/* Top accent bar — blue if raining, green if dry */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      <View style={styles.header}>
        <SymbolView
          name={{ ios: 'cloud.sun.fill', android: 'wb_sunny', web: 'wb_sunny' }}
          size={13}
          tintColor={accentColor}
        />
        <ThemedText type="smallBold" style={styles.headerTitle} themeColor="text">
          TRACK CONDITIONS
        </ThemedText>

        {/* Rainfall indicator */}
        <Animated.View
          style={[
            styles.rainfallBadge,
            {
              backgroundColor: isRaining ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.1)',
              borderColor: isRaining ? '#3b82f6' : '#22c55e',
              opacity: isRaining ? rainOpacity : 1,
            },
          ]}
        >
          <ThemedText
            type="code"
            style={[styles.rainfallText, { color: isRaining ? '#3b82f6' : '#22c55e' }]}
          >
            {isRaining ? '🌧 WET' : '☀ DRY'}
          </ThemedText>
        </Animated.View>
      </View>

      <View style={styles.metricsRow}>
        <MetricCell
          label="TRACK"
          value={`${weather.track_temperature.toFixed(0)}°`}
          unit="C"
          color="#ff6b00"
        />
        <View style={styles.divider} />
        <MetricCell
          label="AIR"
          value={`${weather.air_temperature.toFixed(0)}°`}
          unit="C"
          color="#00e5ff"
        />
        <View style={styles.divider} />
        <MetricCell
          label="HUMIDITY"
          value={`${Math.round(weather.humidity)}`}
          unit="%"
        />
        <View style={styles.divider} />
        <MetricCell
          label="PRESSURE"
          value={`${Math.round(weather.pressure)}`}
          unit="mb"
        />
      </View>

      {/* Wind row */}
      <View style={[styles.windRow, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="code" style={styles.windArrow} themeColor="text">
          {windArrow(weather.wind_direction)}
        </ThemedText>
        <ThemedText type="code" style={styles.windLabel} themeColor="textSecondary">
          {windCardinal(weather.wind_direction)}
        </ThemedText>
        <ThemedText type="smallBold" style={[styles.windSpeed, { color: theme.text }]}>
          {weather.wind_speed.toFixed(1)}
        </ThemedText>
        <ThemedText type="code" style={styles.windUnit} themeColor="textSecondary">
          m/s
        </ThemedText>
        <View style={styles.windSpacer} />
        <ThemedText type="code" style={styles.windDeg} themeColor="textSecondary">
          {Math.round(weather.wind_direction)}°
        </ThemedText>
      </View>
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
    paddingBottom: Spacing.two,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
  },
  headerTitle: {
    fontSize: 10.5,
    letterSpacing: 1,
    flex: 1,
  },
  rainfallBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  rainfallText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    fontSize: 7.5,
    letterSpacing: 0.8,
    fontWeight: 'bold',
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    lineHeight: 22,
  },
  metricUnit: {
    fontSize: 8,
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  windRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.three,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  windArrow: {
    fontSize: 16,
  },
  windLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    width: 24,
  },
  windSpeed: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  windUnit: {
    fontSize: 8.5,
    letterSpacing: 0.5,
  },
  windSpacer: {
    flex: 1,
  },
  windDeg: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
});
