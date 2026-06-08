import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { cardShadow } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

interface TelemetryProps {
  driverNumber: number;
  sessionKey: number;
  driverColor: string;
  session: any;
}

export function F1Telemetry({ driverNumber, sessionKey, driverColor, session }: TelemetryProps) {
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [telemetry, setTelemetry] = useState({
    speed: 0,
    rpm: 0,
    gear: 0,
    throttle: 0,
    brake: 0,
    drs: 0,
  });

  const animatedSpeed = useRef(new Animated.Value(0)).current;
  const animatedRPM = useRef(new Animated.Value(0)).current;

  const telemetryBuffer = useRef<any[]>([]);
  const bufferIndex = useRef(0);

  const teamColor = driverColor ? `#${driverColor}` : theme.neonTeal;

  useEffect(() => {
    let active = true;
    setLoading(true);
    telemetryBuffer.current = [];
    bufferIndex.current = 0;

    const fetchTelemetry = async () => {
      try {
        let queryUrl = `https://api.openf1.org/v1/car_data?session_key=${sessionKey}&driver_number=${driverNumber}`;

        if (session && session.date_end) {
          const endTime = new Date(session.date_end);
          const startTime = new Date(endTime.getTime() - 20000);
          queryUrl += `&date>=${startTime.toISOString()}&date<=${endTime.toISOString()}`;
        } else {
          const now = new Date();
          const startTime = new Date(now.getTime() - 15000);
          queryUrl += `&date>=${startTime.toISOString()}`;
        }

        const res = await fetch(queryUrl);
        if (!res.ok) throw new Error('Telemetry fetch failed');
        const data = await res.json();

        if (!active) return;

        if (data && data.length > 0) {
          telemetryBuffer.current = data;
          bufferIndex.current = 0;
          setLoading(false);
        } else {
          setTelemetry({
            speed: 0,
            rpm: 0,
            gear: 0,
            throttle: 0,
            brake: 0,
            drs: 0,
          });
          setLoading(false);
        }
      } catch (err) {
        console.warn('Telemetry Error:', err);
        if (active) setLoading(false);
      }
    };

    fetchTelemetry();

    const replayInterval = setInterval(() => {
      if (!active) return;
      const buffer = telemetryBuffer.current;
      if (buffer.length > 0) {
        const index = bufferIndex.current;
        const currentData = buffer[index];

        if (currentData) {
          setTelemetry({
            speed: currentData.speed ?? 0,
            rpm: currentData.rpm ?? 0,
            gear: currentData.n_gear ?? 0,
            throttle: currentData.throttle ?? 0,
            brake: currentData.brake ?? 0,
            drs: currentData.drs ?? 0,
          });

          Animated.spring(animatedSpeed, {
            toValue: currentData.speed ?? 0,
            useNativeDriver: false,
          }).start();

          Animated.spring(animatedRPM, {
            toValue: currentData.rpm ?? 0,
            useNativeDriver: false,
          }).start();
        }

        bufferIndex.current = (index + 1) % buffer.length;
      }
    }, 250);

    let liveFetchInterval: any;
    if (session && !session.date_end) {
      liveFetchInterval = setInterval(() => {
        fetchTelemetry();
      }, 10000);
    }

    return () => {
      active = false;
      clearInterval(replayInterval);
      if (liveFetchInterval) clearInterval(liveFetchInterval);
    };
  }, [driverNumber, sessionKey, session]);

  const maxRpm = 13000;
  const rpmPercent = Math.min(100, Math.max(0, (telemetry.rpm / maxRpm) * 100));
  
  const renderShiftLights = () => {
    const totalLeds = 15;
    const activeLeds = Math.floor((rpmPercent / 100) * totalLeds);
    
    return Array.from({ length: totalLeds }).map((_, i) => {
      let activeColor = '#1e293b'; 
      const isActive = i < activeLeds;

      if (isActive) {
        if (i < 5) {
          activeColor = '#22c55e'; // Green
        } else if (i < 10) {
          activeColor = '#eab308'; // Yellow
        } else {
          activeColor = '#ef4444'; // Red
        }
      }

      const isBlinkingShift = rpmPercent >= 93;
      const finalColor = isBlinkingShift && (Math.floor(Date.now() / 150) % 2 === 0) 
        ? '#3b82f6' 
        : activeColor;

      return (
        <View 
          key={i} 
          style={[
            styles.led, 
            { 
              backgroundColor: finalColor,
              ...Platform.select({
                web: { boxShadow: isActive ? `0 0 6px ${finalColor}` : 'none' },
                default: {
                  shadowColor: finalColor,
                  shadowOpacity: isActive ? 0.8 : 0,
                  shadowRadius: isActive ? 5 : 0,
                },
              }),
            }
          ]} 
        />
      );
    });
  };

  if (loading) {
    return (
      <ThemedView type="backgroundElement" style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={teamColor} />
        <ThemedText type="code" style={styles.loadingText} themeColor="textSecondary">
          Connecting to Car Telemetry...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView 
      style={[
        styles.card, 
        { 
          backgroundColor: theme.cardBackground, 
          borderColor: theme.backgroundElement 
        }
      ]}
    >
      {/* Stripe accent */}
      <View style={[styles.stripe, { backgroundColor: teamColor }]} />

      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: teamColor }]} />
        <ThemedText type="smallBold" style={styles.headerTitle} themeColor="text">
          LIVE TELEMETRY • CAR #{driverNumber}
        </ThemedText>
        {telemetry.drs >= 8 ? (
          <View style={styles.drsBadgeActive}>
            <ThemedText type="code" style={styles.drsText}>DRS</ThemedText>
          </View>
        ) : (
          <View style={styles.drsBadgeInactive}>
            <ThemedText type="code" style={styles.drsTextInactive}>DRS</ThemedText>
          </View>
        )}
      </View>

      <View style={styles.dashboardContainer}>
        {/* SHIFT LIGHT BAR */}
        <View style={styles.shiftLightsRow}>
          {renderShiftLights()}
        </View>

        <View style={styles.telemetryGrid}>
          {/* SPEED WIDGET */}
          <View style={styles.speedWidget}>
            <View style={[styles.dialCircle, { borderColor: teamColor }]}>
              <ThemedText type="subtitle" style={[styles.dialValue, { color: teamColor }]}>
                {telemetry.speed}
              </ThemedText>
              <ThemedText type="code" style={styles.dialUnit} themeColor="textSecondary">KM/H</ThemedText>
            </View>
          </View>

          {/* GEAR WIDGET */}
          <View style={[styles.gearWidget, { borderColor: 'rgba(255,255,255,0.05)' }]}>
            <View style={styles.gearOuter}>
              <ThemedText type="code" style={styles.gearLabel} themeColor="textSecondary">GEAR</ThemedText>
              <ThemedText style={[styles.gearValue, { color: theme.text }]}>
                {telemetry.gear === 0 ? 'N' : telemetry.gear}
              </ThemedText>
            </View>
          </View>

          {/* RPM WIDGET */}
          <View style={styles.rpmWidget}>
            <View style={[styles.dialCircle, { borderColor: '#ef4444' }]}>
              <ThemedText type="subtitle" style={[styles.dialValue, { color: '#ef4444' }]}>
                {Math.round(telemetry.rpm / 100) * 100}
              </ThemedText>
              <ThemedText type="code" style={styles.dialUnit} themeColor="textSecondary">RPM</ThemedText>
            </View>
          </View>
        </View>

        {/* HIGH-TECH PEDALS DISPLAY */}
        <View style={[styles.pedalsContainer, { backgroundColor: theme.background }]}>
          {/* THROTTLE (ACCELERATOR) */}
          <View style={styles.pedalColumn}>
            <View style={styles.pedalHeader}>
              <ThemedText type="code" style={styles.pedalLabel} themeColor="textSecondary">THROTTLE</ThemedText>
              <ThemedText type="code" style={[styles.pedalPercent, { color: '#22c55e' }]}>{telemetry.throttle}%</ThemedText>
            </View>
            <View style={[styles.pedalTrack, { backgroundColor: theme.backgroundElement }]}>
              <View 
                style={[
                  styles.pedalFill, 
                  { 
                    backgroundColor: '#22c55e', 
                    height: `${telemetry.throttle}%`,
                    top: `${100 - telemetry.throttle}%`,
                    ...Platform.select({
                      web: { boxShadow: '0 0 8px #22c55e' },
                      default: { shadowColor: '#22c55e', shadowOpacity: 0.5, shadowRadius: 5 },
                    }),
                  }
                ]} 
              />
            </View>
          </View>

          {/* BRAKE */}
          <View style={styles.pedalColumn}>
            <View style={styles.pedalHeader}>
              <ThemedText type="code" style={styles.pedalLabel} themeColor="textSecondary">BRAKE</ThemedText>
              <ThemedText type="code" style={[styles.pedalPercent, { color: '#ef4444' }]}>{telemetry.brake}%</ThemedText>
            </View>
            <View style={[styles.pedalTrack, { backgroundColor: theme.backgroundElement }]}>
              <View 
                style={[
                  styles.pedalFill, 
                  { 
                    backgroundColor: '#ef4444', 
                    height: `${telemetry.brake}%`,
                    top: `${100 - telemetry.brake}%`,
                    ...Platform.select({
                      web: { boxShadow: '0 0 8px #ef4444' },
                      default: { shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 5 },
                    }),
                  }
                ]} 
              />
            </View>
          </View>
        </View>
      </View>
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
    ...cardShadow({ opacity: 0.2, radius: 10, offsetY: 4, elevation: 3 }),
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
  loadingContainer: {
    height: 180,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  loadingText: {
    fontSize: 11,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    letterSpacing: 1,
    fontSize: 10.5,
  },
  drsBadgeActive: {
    backgroundColor: '#22c55e',
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: '#15803d',
  },
  drsBadgeInactive: {
    backgroundColor: '#334155',
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  drsText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#000000',
  },
  drsTextInactive: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#94a3b8',
  },
  dashboardContainer: {
    gap: Spacing.three,
  },
  shiftLightsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    backgroundColor: '#020205',
    paddingVertical: 6,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  led: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.6)',
    ...Platform.select({
      web: {
        transition: 'all 0.1s ease',
      }
    })
  },
  telemetryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  speedWidget: {
    flex: 1.1,
    alignItems: 'center',
  },
  rpmWidget: {
    flex: 1.1,
    alignItems: 'center',
  },
  dialCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3.5,
    borderStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dialValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  dialUnit: {
    fontSize: 8,
    marginTop: -2,
    letterSpacing: 0.5,
  },
  gearWidget: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020205',
  },
  gearOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearLabel: {
    fontSize: 7.5,
    position: 'absolute',
    top: -14,
    letterSpacing: 0.5,
  },
  gearValue: {
    fontSize: 34,
    fontWeight: 'bold',
  },
  pedalsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  pedalColumn: {
    flex: 1,
    gap: Spacing.one,
  },
  pedalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pedalLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  pedalPercent: {
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  pedalTrack: {
    height: 50,
    borderRadius: Spacing.one,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)',
  },
  pedalFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: Spacing.one,
  },
});
