import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GravitySimulator } from '@/components/gravity-simulator';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Planetary Database
const PLANETS = [
  {
    name: 'Mercury',
    symbol: 'sun.max.fill',
    gravityRatio: 0.38,
    distance: '57.9M km',
    dayLength: '59 Earth days',
    yearLength: '88 Earth days',
    moons: 0,
    funFact: 'Like a trampoline. You could leap almost 3 times higher on Mercury than on Earth!',
    info: 'The smallest planet in our solar system and nearest to the Sun, Mercury is only slightly larger than Earth\'s Moon. It has no atmosphere, leading to extreme temperature swings.',
    accentColor: '#94a3b8'
  },
  {
    name: 'Venus',
    symbol: 'sparkles',
    gravityRatio: 0.91,
    distance: '108.2M km',
    dayLength: '243 Earth days',
    yearLength: '225 Earth days',
    moons: 0,
    funFact: 'Slightly lighter than Earth, but the crushing CO2 atmosphere would feel like diving 1km deep in water!',
    info: 'Venus is our closest planetary neighbor. Its thick, toxic atmosphere traps heat in a runaway greenhouse effect, making it the hottest planet in our solar system.',
    accentColor: '#fbbf24'
  },
  {
    name: 'Mars',
    symbol: 'flame.fill',
    gravityRatio: 0.38,
    distance: '227.9M km',
    dayLength: '24.6 hours',
    yearLength: '687 Earth days',
    moons: 2,
    funFact: 'You\'d feel extremely light and active. A 150lb person weighs only 57lbs here!',
    info: 'Mars is a cold, dusty desert world with a thin atmosphere. There is strong scientific evidence that Mars was billions of years ago much wetter and warmer with a thicker atmosphere.',
    accentColor: '#f87171'
  },
  {
    name: 'Jupiter',
    symbol: 'hurricane',
    gravityRatio: 2.53,
    distance: '778.5M km',
    dayLength: '9.9 hours',
    yearLength: '12 Earth years',
    moons: 95,
    funFact: 'Extremely heavy! You would feel like you\'re carrying two adults on your back, making movement very difficult.',
    info: 'Jupiter is the largest planet in our solar system—more than twice as massive as all the other planets combined. Its iconic Great Red Spot is a giant storm bigger than Earth.',
    accentColor: '#fb923c'
  },
  {
    name: 'Saturn',
    symbol: 'circle.grid.cross.fill',
    gravityRatio: 1.06,
    distance: '1.4B km',
    dayLength: '10.7 hours',
    yearLength: '29 Earth years',
    moons: 146,
    funFact: 'Almost identical to Earth weight, but Saturn is so light and gas-heavy that it could float in a giant bathtub!',
    info: 'Adorned with thousands of beautiful, icy ringlets, Saturn is unique in our solar system. It is a massive gas giant made mostly of hydrogen and helium.',
    accentColor: '#fef08a'
  },
  {
    name: 'Uranus',
    symbol: 'wind',
    gravityRatio: 0.92,
    distance: '2.9B km',
    dayLength: '17.2 hours',
    yearLength: '84 Earth years',
    moons: 28,
    funFact: 'Slightly less gravity than Earth, but you\'d be floating in a freezing ice-giant atmosphere.',
    info: 'Uranus is the seventh planet from the Sun. It rotates on its side at an nearly 90-degree angle from the plane of its orbit, making it look like a rolling ball.',
    accentColor: '#2dd4bf'
  },
  {
    name: 'Neptune',
    symbol: 'drop.fill',
    gravityRatio: 1.12,
    distance: '4.5B km',
    dayLength: '16.1 hours',
    yearLength: '165 Earth years',
    moons: 16,
    funFact: 'Slightly heavier than Earth, and you\'d have to battle supersonic winds reaching up to 2,100 km/h!',
    info: 'Neptune is the eighth and most distant major planet orbiting our Sun. It is dark, cold, and whipped by supersonic winds, and was the first planet located through mathematical calculations.',
    accentColor: '#60a5fa'
  }
];

export default function TabTwoScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();

  // Insets configuration for screen scrolling
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    ios: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.five,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        
        {/* TITLE SECTION */}
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle" style={styles.titleText}>PLANET EXPLORER</ThemedText>
          <ThemedText style={styles.subtitleText} themeColor="textSecondary">
            Explore solar system telemetry, physical statistics, and simulate planetary gravity.
          </ThemedText>
        </ThemedView>

        {/* PLANETS LIST */}
        <View style={styles.listWrapper}>
          {PLANETS.map((planet) => (
            <ThemedView
              key={planet.name}
              style={[
                styles.planetCard,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.backgroundElement,
                },
              ]}>
              <Collapsible
                title={`${planet.name.toUpperCase()}  (Gravity: ${planet.gravityRatio}x)`}>
                <View style={styles.collapsibleInner}>
                  
                  {/* Overview Text */}
                  <ThemedText type="small" style={styles.description} themeColor="text">
                    {planet.info}
                  </ThemedText>

                  {/* Planet Quick Data Grid */}
                  <View style={styles.specGrid}>
                    <View style={[styles.specItem, { backgroundColor: theme.background }]}>
                      <ThemedText type="code" style={styles.specLabel} themeColor="textSecondary">DISTANCE</ThemedText>
                      <ThemedText type="code" style={styles.specValue} themeColor="text">{planet.distance}</ThemedText>
                    </View>
                    <View style={[styles.specItem, { backgroundColor: theme.background }]}>
                      <ThemedText type="code" style={styles.specLabel} themeColor="textSecondary">DAY LENGTH</ThemedText>
                      <ThemedText type="code" style={styles.specValue} themeColor="text">{planet.dayLength}</ThemedText>
                    </View>
                    <View style={[styles.specItem, { backgroundColor: theme.background }]}>
                      <ThemedText type="code" style={styles.specLabel} themeColor="textSecondary">YEAR LENGTH</ThemedText>
                      <ThemedText type="code" style={styles.specValue} themeColor="text">{planet.yearLength}</ThemedText>
                    </View>
                    <View style={[styles.specItem, { backgroundColor: theme.background }]}>
                      <ThemedText type="code" style={styles.specLabel} themeColor="textSecondary">MOONS</ThemedText>
                      <ThemedText type="code" style={styles.specValue} themeColor="text">{planet.moons}</ThemedText>
                    </View>
                  </View>

                  {/* Integrated Gravity Simulator */}
                  <GravitySimulator
                    planetName={planet.name}
                    gravityRatio={planet.gravityRatio}
                    funFact={planet.funFact}
                  />

                </View>
              </Collapsible>
            </ThemedView>
          ))}
        </View>

        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    alignItems: 'stretch',
  },
  titleContainer: {
    gap: Spacing.one,
    alignItems: 'center',
    paddingVertical: Spacing.four,
  },
  titleText: {
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  subtitleText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 550,
  },
  listWrapper: {
    gap: Spacing.three,
  },
  planetCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    overflow: 'hidden',
  },
  collapsibleInner: {
    gap: Spacing.three,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  specItem: {
    flex: 1,
    minWidth: 120,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    gap: 2,
  },
  specLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  specValue: {
    fontSize: 11,
    fontWeight: 'bold',
  },
});
