/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0a0a0f',
    background: '#f1f2f6',
    backgroundElement: '#e4e6eb',
    backgroundSelected: '#fce8e6',
    textSecondary: '#4b5563',
    cosmicIndigo: '#e10600', // Racing Red
    neonTeal: '#00b0ff',     // Sector Blue
    solarAmber: '#ff9100',   // Sector Yellow
    cardBackground: '#ffffff',
  },
  dark: {
    text: '#f8fafc',
    background: '#08090c',        // Asphalt Carbon
    backgroundElement: '#161722', // Deep border/card frame
    backgroundSelected: '#2c1214',// Racing Red tinted highlight
    textSecondary: '#94a3b8',
    cosmicIndigo: '#ff1801',      // Glowing Racing Red
    neonTeal: '#00e5ff',          // Sector Blue
    solarAmber: '#ffea00',        // Sector Yellow
    cardBackground: '#0f101a',    // High-tech dashboard card
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
