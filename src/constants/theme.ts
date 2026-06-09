/**
 * F1 Dashboard — Design System Tokens
 *
 * Implements Material 3 Expressive tokens alongside the existing
 * F1 telemetry color palette.
 *
 * M3 Token Reference:
 *   color.surface        — Primary page background (pitch-black asphalt)
 *   color.surfaceVariant — Card / container background
 *   color.primary        — F1 Brand Red (#E10600)
 *   color.outline        — Border / divider color
 *   shape.xl             — 28dp  (hero cards, modals)
 *   shape.md             — 12dp  (list items, buttons)
 *   shape.sm             — 8dp   (badges, chips)
 *   motion.emphasized    — cubic-bezier(0.2, 0, 0, 1) easing
 *   motion.durationLong  — 400ms
 */

import '@/global.css';

import { Platform } from 'react-native';

// ─── Color Tokens ─────────────────────────────────────────────────────────────

export const Colors = {
  light: {
    // Legacy semantic tokens (kept for backwards compatibility)
    text:                 '#0a0a0f',
    background:           '#f1f2f6',
    backgroundElement:    '#e4e6eb',
    backgroundSelected:   '#fce8e6',
    textSecondary:        '#4b5563',
    cosmicIndigo:         '#e10600', // Racing Red
    neonTeal:             '#00b0ff', // Sector Blue
    solarAmber:           '#ff9100', // Sector Yellow
    cardBackground:       '#ffffff',

    // M3 Expressive tokens (light)
    surface:              '#f1f2f6',
    surfaceVariant:       '#e4e6eb',
    primary:              '#E10600',
    onPrimary:            '#FFFFFF',
    outline:              '#c8cad1',
    timingPurple:         '#a855f7',
    timingGreen:          '#22c55e',
    timingYellow:         '#eab308',
    timingRed:            '#ef4444',
  },
  dark: {
    // Legacy semantic tokens
    text:                 '#f8fafc',
    background:           '#0F0F11', // M3 color.surface — Asphalt Carbon
    backgroundElement:    '#1C1C1E', // M3 color.surfaceVariant
    backgroundSelected:   '#2c1214', // Racing Red tinted highlight
    textSecondary:        '#94a3b8',
    cosmicIndigo:         '#E10600', // M3 color.primary — F1 Red
    neonTeal:             '#00e5ff', // Sector Blue
    solarAmber:           '#ffea00', // Sector Yellow
    cardBackground:       '#1C1C1E', // M3 surfaceVariant

    // M3 Expressive tokens (dark)
    surface:              '#0F0F11',
    surfaceVariant:       '#1C1C1E',
    primary:              '#E10600',
    onPrimary:            '#FFFFFF',
    outline:              '#2A2A2E',
    timingPurple:         '#a855f7',
    timingGreen:          '#22c55e',
    timingYellow:         '#eab308',
    timingRed:            '#ef4444',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// ─── M3 Shape Tokens ──────────────────────────────────────────────────────────

export const M3Shape = {
  /** Hero cards, modals, large containers */
  xl: 28,
  /** List cards, buttons, leaderboard rows */
  md: 12,
  /** Badges, chips, sector time cells */
  sm: 8,
  /** Tight inline indicators */
  xs: 4,
} as const;

// ─── M3 Motion Tokens ─────────────────────────────────────────────────────────

export const M3Motion = {
  /**
   * Emphasized easing — used for page transitions, container transforms.
   * Native equivalent: Easing.bezier(0.2, 0, 0, 1)
   */
  emphasizedEasing: 'cubic-bezier(0.2, 0, 0, 1)' as const,

  /** Long transition window (page transforms, predictive back) */
  durationLong: 400,

  /** Medium transition window (element reveals, tab switches) */
  durationMedium: 250,

  /** Short micro-interactions (button presses, badge flashes) */
  durationShort: 120,
} as const;

// ─── Typography / Font Stack ──────────────────────────────────────────────────

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  android: {
    sans:    'Google Sans',
    serif:   'serif',
    rounded: 'Google Sans',
    mono:    'monospace',
  },
  default: {
    sans:    'Google Sans',
    serif:   'serif',
    rounded: 'Google Sans',
    mono:    'monospace',
  },
  web: {
    sans:    'var(--font-display)',
    serif:   'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono:    'var(--font-mono)',
  },
});

// ─── Legacy Spacing Tokens ────────────────────────────────────────────────────

export const Spacing = {
  half:  2,
  one:   4,
  two:   8,
  three: 16,
  four:  24,
  five:  32,
  six:   64,
} as const;

// ─── Layout Constants ─────────────────────────────────────────────────────────

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 840;
