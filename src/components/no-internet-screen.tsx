import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Spacing, M3Shape } from '@/constants/theme';
import { checkConnectivity } from '@/constants/ui-utils';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export function NoInternetScreen() {
  const theme = useTheme();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    // Wait for at least 800ms for visual feedback
    const [success] = await Promise.all([
      checkConnectivity(),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
    setRetrying(false);
  };

  return (
    <ThemedView style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: '#0F0F11' }]}>
      {/* Red accent glow */}
      <View style={styles.glow} />

      <View style={styles.content}>
        {/* Wifi Icon */}
        <View style={[styles.iconContainer, { borderColor: theme.outline }]}>
          {Platform.OS === 'web' ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E10600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 1l22 22" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.5" />
              <path d="M5 12.5a10.94 10.94 0 0 1 5.83-2.84" />
              <path d="M12 18.5a4.25 4.25 0 0 1 2.82-1" />
              <path d="M9.18 17.5a4.25 4.25 0 0 1 .53-1.84" />
              <path d="M10.88 5.4a15.82 15.82 0 0 1 9.4 3" />
              <path d="M3.72 8.4A15.82 15.82 0 0 1 8.7 6.13" />
              <circle cx="12" cy="21" r="1" fill="#E10600" />
            </svg>
          ) : (
            <SymbolView
              name={{ ios: 'wifi.slash', android: 'wifi_off', web: 'wifi-off' }}
              size={48}
              tintColor="#E10600"
            />
          )}
        </View>

        {/* Text */}
        <ThemedText style={styles.title} type="subtitle">CONNECTION LOST</ThemedText>
        <ThemedText style={styles.message} themeColor="textSecondary">
          Artello F1 needs an active internet connection to stream live telemetry and race timing.
        </ThemedText>

        {/* Retry Button */}
        <Pressable
          onPress={handleRetry}
          disabled={retrying}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: '#E10600' },
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            retrying && { opacity: 0.7 },
          ]}
        >
          {retrying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              {Platform.OS !== 'web' && (
                <SymbolView
                  name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
                  size={16}
                  tintColor="#FFFFFF"
                />
              )}
              <ThemedText style={styles.buttonText}>RETRY CONNECTION</ThemedText>
            </>
          )}
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: Spacing.four,
  },
  glow: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#E10600',
    opacity: 0.04,
  },
  content: {
    maxWidth: 340,
    alignItems: 'center',
    gap: Spacing.four,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  button: {
    borderRadius: M3Shape.md,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
    height: 48,
    marginTop: Spacing.two,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
