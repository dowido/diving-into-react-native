import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

interface GravitySimulatorProps {
  planetName: string;
  gravityRatio: number; // Ratio compared to Earth (1.0)
  funFact: string;
}

export function GravitySimulator({ planetName, gravityRatio, funFact }: GravitySimulatorProps) {
  const theme = useTheme();
  const [weightInput, setWeightInput] = useState('150');
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');

  const earthWeight = parseFloat(weightInput) || 0;
  const planetWeight = earthWeight * gravityRatio;

  // Visual bar width percentage (cap at 250% for display purposes)
  const barPercentage = Math.min((gravityRatio / 2.5) * 100, 100);

  // Dynamic colors based on gravity level
  const getGravityColor = () => {
    if (gravityRatio < 0.4) return theme.neonTeal; // Low gravity
    if (gravityRatio <= 1.1) return theme.cosmicIndigo; // Normal/Earth-like
    return theme.solarAmber; // Heavy gravity
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" style={styles.title} themeColor="text">
        GRAVITY SIMULATOR
      </ThemedText>

      {/* INPUT CONTROLS */}
      <View style={styles.controlsRow}>
        <View style={styles.inputContainer}>
          <ThemedText type="code" style={styles.inputLabel} themeColor="textSecondary">
            EARTH WEIGHT
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: theme.backgroundSelected,
                backgroundColor: theme.cardBackground,
              },
            ]}
            keyboardType="numeric"
            value={weightInput}
            onChangeText={(text) => setWeightInput(text.replace(/[^0-9.]/g, ''))}
            placeholder="150"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {/* UNIT TOGGLE */}
        <View style={styles.toggleContainer}>
          <ThemedText type="code" style={styles.inputLabel} themeColor="textSecondary">
            UNIT
          </ThemedText>
          <View style={[styles.toggleBorder, { borderColor: theme.backgroundSelected, backgroundColor: theme.cardBackground }]}>
            <Pressable
              onPress={() => setUnit('lbs')}
              style={[
                styles.toggleButton,
                unit === 'lbs' && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="code" style={styles.toggleText} themeColor={unit === 'lbs' ? 'text' : 'textSecondary'}>
                LBS
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setUnit('kg')}
              style={[
                styles.toggleButton,
                unit === 'kg' && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="code" style={styles.toggleText} themeColor={unit === 'kg' ? 'text' : 'textSecondary'}>
                KG
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* RESULTS DISPLAY */}
      <View style={[styles.resultCard, { backgroundColor: theme.cardBackground }]}>
        <ThemedText type="code" style={styles.resultPrefix} themeColor="textSecondary">
          ESTIMATED WEIGHT ON {planetName.toUpperCase()}
        </ThemedText>
        <ThemedText type="subtitle" style={[styles.resultText, { color: getGravityColor() }]}>
          {planetWeight.toFixed(1)} <ThemedText type="smallBold" themeColor="text">{unit}</ThemedText>
        </ThemedText>

        <ThemedText type="small" style={styles.factText} themeColor="textSecondary">
          {funFact}
        </ThemedText>
      </View>

      {/* GRAVITY BAR COMPARISON */}
      <View style={styles.chartContainer}>
        <View style={styles.chartHeader}>
          <ThemedText type="code" style={styles.chartLabel} themeColor="textSecondary">
            GRAVITY SCALE (VS EARTH)
          </ThemedText>
          <ThemedText type="code" style={styles.chartRatio} themeColor="text">
            {(gravityRatio * 100).toFixed(0)}%
          </ThemedText>
        </View>

        {/* Earth Bar */}
        <View style={styles.barRow}>
          <View style={styles.barLabelContainer}>
            <ThemedText type="code" style={styles.barLabel} themeColor="textSecondary">Earth</ThemedText>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: '40%', backgroundColor: theme.textSecondary }]} />
          </View>
        </View>

        {/* Planet Bar */}
        <View style={styles.barRow}>
          <View style={styles.barLabelContainer}>
            <ThemedText type="code" style={styles.barLabel} themeColor="text">{planetName}</ThemedText>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.max(barPercentage * 0.4, 3)}%`,
                  backgroundColor: getGravityColor(),
                },
              ]}
            />
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  title: {
    fontSize: 12,
    letterSpacing: 1.5,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  inputContainer: {
    flex: 2,
    gap: Spacing.one,
  },
  inputLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  input: {
    height: 38,
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleContainer: {
    flex: 1,
    gap: Spacing.one,
  },
  toggleBorder: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 38,
    overflow: 'hidden',
    padding: 2,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.one,
  },
  toggleText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  resultCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    gap: Spacing.one,
  },
  resultPrefix: {
    fontSize: 9,
    letterSpacing: 1,
    textAlign: 'center',
  },
  resultText: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  factText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.one,
    lineHeight: 16,
  },
  chartContainer: {
    gap: Spacing.two,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  chartRatio: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  barLabelContainer: {
    width: 60,
  },
  barLabel: {
    fontSize: 11,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
});
