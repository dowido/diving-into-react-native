/**
 * Material Design 3 color tokens
 * Seed color: F1 Racing Red (#ff1801)
 * Generated for dark scheme (matches app dark mode)
 */

export const M3Dark = {
  // Primary — Racing Red tonal palette
  primary: '#ffb3ab',
  onPrimary: '#690005',
  primaryContainer: '#93000a',
  onPrimaryContainer: '#ffdad6',

  // Secondary — Neutral warm
  secondary: '#e7bdb8',
  onSecondary: '#442926',
  secondaryContainer: '#5d3f3b',
  onSecondaryContainer: '#ffdad6',

  // Tertiary — Amber accent (sector yellow)
  tertiary: '#f0bf6e',
  onTertiary: '#3e2d00',
  tertiaryContainer: '#594200',
  onTertiaryContainer: '#ffdea3',

  // Surface hierarchy
  background: '#201a19',
  onBackground: '#ede0de',
  surface: '#201a19',
  onSurface: '#ede0de',
  surfaceVariant: '#534341',
  onSurfaceVariant: '#d8c2bf',
  surfaceContainer: '#2b2220',
  surfaceContainerHigh: '#362e2c',
  surfaceContainerHighest: '#413937',
  surfaceContainerLow: '#201a19',
  surfaceDim: '#201a19',
  surfaceBright: '#493331',

  // Outline
  outline: '#a08c8a',
  outlineVariant: '#534341',

  // Error
  error: '#ffb4ab',
  onError: '#690005',

  // Inverse
  inverseSurface: '#ede0de',
  inverseOnSurface: '#201a19',
  inversePrimary: '#c00010',

  // Scrim
  scrim: '#000000',
  shadow: '#000000',
} as const;

export const M3Light = {
  primary: '#c00010',
  onPrimary: '#ffffff',
  primaryContainer: '#ffdad6',
  onPrimaryContainer: '#410001',

  secondary: '#775651',
  onSecondary: '#ffffff',
  secondaryContainer: '#ffdad6',
  onSecondaryContainer: '#2c1512',

  tertiary: '#775830',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ffdea3',
  onTertiaryContainer: '#2a1700',

  background: '#fff8f7',
  onBackground: '#231918',
  surface: '#fff8f7',
  onSurface: '#231918',
  surfaceVariant: '#f5dddb',
  onSurfaceVariant: '#534341',
  surfaceContainer: '#fcecea',
  surfaceContainerHigh: '#f6e6e4',
  surfaceContainerHighest: '#f1e0de',
  surfaceContainerLow: '#fff1f0',
  surfaceDim: '#e8d6d4',
  surfaceBright: '#fff8f7',

  outline: '#857370',
  outlineVariant: '#d8c2bf',

  error: '#ba1a1a',
  onError: '#ffffff',

  inverseSurface: '#382e2d',
  inverseOnSurface: '#ffedeb',
  inversePrimary: '#ffb3ab',

  scrim: '#000000',
  shadow: '#000000',
} as const;

export type M3Colors = typeof M3Dark;

/** M3 elevation overlay opacities for surface tints */
export const M3Elevation = {
  level0: 0,
  level1: 0.05,
  level2: 0.08,
  level3: 0.11,
  level4: 0.12,
  level5: 0.14,
} as const;

/** M3 Shape tokens */
export const M3Shape = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
} as const;

/** M3 Typography scale (font sizes) */
export const M3Type = {
  displayLarge: { fontSize: 57, lineHeight: 64, fontWeight: '400' as const },
  displayMedium: { fontSize: 45, lineHeight: 52, fontWeight: '400' as const },
  displaySmall: { fontSize: 36, lineHeight: 44, fontWeight: '400' as const },
  headlineLarge: { fontSize: 32, lineHeight: 40, fontWeight: '400' as const },
  headlineMedium: { fontSize: 28, lineHeight: 36, fontWeight: '400' as const },
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: '400' as const },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '500' as const },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: '500' as const },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: '700' as const },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: '700' as const },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
} as const;
