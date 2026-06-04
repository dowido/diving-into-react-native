import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

// List of current crew members on the International Space Station
const ISS_CREW = [
  'Sunita Williams',
  'Barry Wilmore',
  'Matthew Dominick',
  'Michael Barratt',
  'Jeanette Epps',
  'Alexander Grebenkin',
  'Tracy Dyson',
];

export function ISSTracker() {
  const theme = useTheme();

  // Telemetry state with realistic slight fluctuations
  const [lat, setLat] = useState(-51.6424);
  const [lng, setLng] = useState(120.4851);
  const [altitude, setAltitude] = useState(418.5);
  const [speed, setSpeed] = useState(27564);

  // Animation values for radar
  const [radarPulse] = useState(() => new Animated.Value(0));
  const [radarRotation] = useState(() => new Animated.Value(0));
  const [targetPulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // 1. Radar sweep rotation animation
    Animated.loop(
      Animated.timing(radarRotation, {
        toValue: 1,
        duration: 5000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })
    ).start();

    // 2. Neon ring pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(radarPulse, {
          toValue: 1,
          duration: 2500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(radarPulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    ).start();

    // 3. Target pulsing (ISS dot) animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(targetPulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(targetPulse, {
          toValue: 0.3,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    ).start();

    // 4. Update coordinates & telemetry periodically
    const timer = setInterval(() => {
      setLat((prev) => {
        const next = prev + (Math.random() - 0.4) * 0.005;
        // Keep in bounds
        return next > 90 || next < -90 ? -prev : next;
      });
      setLng((prev) => {
        const next = prev + (Math.random() - 0.3) * 0.01;
        return next > 180 ? -180 : next < -180 ? 180 : next;
      });
      setAltitude((prev) => prev + (Math.random() - 0.5) * 0.2);
      setSpeed((prev) => Math.round(prev + (Math.random() - 0.5) * 4));
    }, 1500);

    return () => clearInterval(timer);
  }, [radarPulse, radarRotation, targetPulse]);

  const spin = radarRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const pulseScale = radarPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 1],
  });

  const pulseOpacity = radarPulse.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [0.6, 0.4, 0],
  });

  return (
    <ThemedView style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
      <ThemedView style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: theme.neonTeal }]} />
        <ThemedText type="smallBold" style={styles.headerTitle} themeColor="text">
          ISS TELEMETRY & LIVE RADAR
        </ThemedText>
      </ThemedView>

      <View style={styles.mainLayout}>
        {/* RADAR VIEW */}
        <View style={[styles.radarContainer, { borderColor: theme.backgroundElement }]}>
          {/* Concentric rings */}
          <View style={[styles.radarRing, { width: 40, height: 40, borderRadius: 20, borderColor: theme.backgroundSelected }]} />
          <View style={[styles.radarRing, { width: 80, height: 80, borderRadius: 40, borderColor: theme.backgroundSelected }]} />
          <View style={[styles.radarRing, { width: 120, height: 120, borderRadius: 60, borderColor: theme.backgroundSelected }]} />

          {/* Crosshairs */}
          <View style={[styles.radarAxis, styles.axisH, { backgroundColor: theme.backgroundSelected }]} />
          <View style={[styles.radarAxis, styles.axisV, { backgroundColor: theme.backgroundSelected }]} />

          {/* Pulsing radar sweep */}
          <Animated.View
            style={[
              styles.radarPulseRing,
              {
                borderColor: theme.neonTeal,
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />

          {/* Rotating radar line */}
          <Animated.View
            style={[
              styles.radarSweepLine,
              {
                borderColor: theme.neonTeal,
                transform: [{ rotate: spin }],
              },
            ]}
          />

          {/* ISS Target Dot (placed at a offset simulating position) */}
          <Animated.View
            style={[
              styles.issTarget,
              {
                backgroundColor: theme.solarAmber,
                opacity: targetPulse,
                shadowColor: theme.solarAmber,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 6,
              },
            ]}
          />
        </View>

        {/* TELEMETRY TEXT */}
        <View style={styles.statsContainer}>
          <View style={styles.statRow}>
            <ThemedText type="code" style={styles.statLabel} themeColor="textSecondary">ALTITUDE</ThemedText>
            <ThemedText type="code" style={[styles.statValue, { color: theme.neonTeal }]}>
              {altitude.toFixed(1)} km
            </ThemedText>
          </View>

          <View style={styles.statRow}>
            <ThemedText type="code" style={styles.statLabel} themeColor="textSecondary">VELOCITY</ThemedText>
            <ThemedText type="code" style={[styles.statValue, { color: theme.neonTeal }]}>
              {speed.toLocaleString()} km/h
            </ThemedText>
          </View>

          <View style={styles.statRow}>
            <ThemedText type="code" style={styles.statLabel} themeColor="textSecondary">LATITUDE</ThemedText>
            <ThemedText type="code" style={styles.statValue} themeColor="text">
              {lat.toFixed(4)}° {lat >= 0 ? 'N' : 'S'}
            </ThemedText>
          </View>

          <View style={styles.statRow}>
            <ThemedText type="code" style={styles.statLabel} themeColor="textSecondary">LONGITUDE</ThemedText>
            <ThemedText type="code" style={styles.statValue} themeColor="text">
              {lng.toFixed(4)}° {lng >= 0 ? 'E' : 'W'}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* CREW MEMBERS SECTION */}
      <View style={styles.crewSection}>
        <ThemedText type="code" style={styles.crewTitle} themeColor="textSecondary">
          CURRENT CREW ({ISS_CREW.length})
        </ThemedText>
        <View style={styles.crewTagsContainer}>
          {ISS_CREW.map((name, index) => (
            <View key={index} style={[styles.crewTag, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="code" style={styles.crewTagText} themeColor="text">
                {name.split(' ').map((n, i) => i === 0 ? `${n[0]}.` : n).join(' ')}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    letterSpacing: 1,
    fontSize: 12,
  },
  mainLayout: {
    flexDirection: 'row',
    gap: Spacing.four,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  radarContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.3,
  },
  radarAxis: {
    position: 'absolute',
    opacity: 0.15,
  },
  axisH: {
    width: '100%',
    height: 1,
  },
  axisV: {
    width: 1,
    height: '100%',
  },
  radarPulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
  },
  radarSweepLine: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderLeftWidth: 1.5,
    opacity: 0.6,
  },
  issTarget: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 45,
    left: 85,
  },
  statsContainer: {
    flex: 1,
    minWidth: 180,
    gap: Spacing.two,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
    paddingBottom: Spacing.half,
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  crewSection: {
    gap: Spacing.one,
  },
  crewTitle: {
    fontSize: 10,
    letterSpacing: 1,
  },
  crewTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  crewTag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  crewTagText: {
    fontSize: 10,
  },
});
